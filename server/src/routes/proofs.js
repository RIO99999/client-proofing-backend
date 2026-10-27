const fs = require('fs');
const path = require('path');
const Project = require('../models/Project');
const Proof = require('../models/Proof');
const Comment = require('../models/Comment');
const { requireAuth, requireRole, canAccessProject } = require('../middleware/auth');
const { receiveUpload, storeUpload, UPLOAD_DIR } = require('../utils/upload');
const { logActivity } = require('../services/activity');
const cloudinary = require('../utils/cloudinary');
const { Router } = require('../http/router');

const router = new Router('/api');

function proofView(proof) {
  return {
    id: proof._id.toString(),
    project: proof.project.toString(),
    title: proof.title,
    version: proof.version,
    status: proof.status,
    decidedAt: proof.decidedAt,
    file: {
      originalName: proof.file.originalName,
      mimetype: proof.file.mimetype,
      size: proof.file.size,
      isPdf: proof.file.mimetype === 'application/pdf'
    },
    fileUrl: `/api/proofs/${proof._id}/file`,
    createdAt: proof.createdAt,
    updatedAt: proof.updatedAt
  };
}

function commentView(c) {
  return {
    id: c._id.toString(),
    proof: c.proof.toString(),
    authorName: c.authorName,
    authorRole: c.authorRole,
    kind: c.kind,
    body: c.body,
    createdAt: c.createdAt
  };
}

// Loads a proof and its project, checking the user may see it.
async function loadProofForUser(req, proofId) {
  const proof = await Proof.findById(proofId);
  if (!proof) return null;
  const project = await Project.findById(proof.project);
  if (!project || !canAccessProject(req.user, project)) return null;
  return { proof, project };
}

// GET /api/projects/:id/proofs  (list proofs of a project)
router.get('/projects/:id/proofs', requireAuth, async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project || !canAccessProject(req.user, project)) {
      return res.status(404).json({ message: 'Project not found.' });
    }
    const proofs = await Proof.find({ project: project._id }).sort({ createdAt: -1 });
    res.json({ proofs: proofs.map(proofView) });
  } catch (err) {
    next(err);
  }
});

// POST /api/projects/:id/proofs  (designer, multipart: file, title)
router.post(
  '/projects/:id/proofs',
  requireAuth,
  requireRole('designer'),
  receiveUpload,
  async (req, res, next) => {
    try {
      const project = await Project.findById(req.params.id);
      if (!project || !canAccessProject(req.user, project)) {
        return res.status(404).json({ message: 'Project not found.' });
      }
      if (!req.file) {
        return res.status(400).json({ message: 'Choose an image or PDF to upload.' });
      }
      const title = String(req.body.title || req.file.originalname).trim().slice(0, 120);
      const stored = await storeUpload(req.file);
      const fileInfo = {
        filename: stored.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        storage: stored.storage,
        ...(stored.format !== undefined ? { format: stored.format } : {})
      };
      const proof = await Proof.create({ project: project._id, title, file: fileInfo });
      await logActivity({
        project: project._id,
        proof: proof._id,
        actor: req.user.name,
        type: 'proof_uploaded',
        message: `${req.user.name} uploaded "${proof.title}" for review.`
      });
      res.status(201).json({ proof: proofView(proof) });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/proofs/:id
router.get('/proofs/:id', requireAuth, async (req, res, next) => {
  try {
    const found = await loadProofForUser(req, req.params.id);
    if (!found) return res.status(404).json({ message: 'Proof not found.' });
    res.json({ proof: proofView(found.proof), project: { id: found.project._id.toString(), name: found.project.name } });
  } catch (err) {
    next(err);
  }
});

// GET /api/proofs/:id/file  (served inline; the token may also come in ?token= for <img> tags)
router.get(
  '/proofs/:id/file',
  (req, _res, next) => {
    if (!req.headers.authorization && req.query.token) {
      req.headers.authorization = `Bearer ${req.query.token}`;
    }
    next();
  },
  requireAuth,
  async (req, res, next) => {
    try {
      const found = await loadProofForUser(req, req.params.id);
      if (!found) return res.status(404).json({ message: 'Proof not found.' });
      if (found.proof.file.storage === 'cloudinary') {
        return res.redirect(302, cloudinary.signedUrl(found.proof.file.filename, found.proof.file.format));
      }
      const filePath = path.join(UPLOAD_DIR, path.basename(found.proof.file.filename));
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: 'The file for this proof is missing from storage.' });
      }
      res.setHeader('Content-Type', found.proof.file.mimetype);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(found.proof.file.originalName)}"`);
      res.setHeader('Cache-Control', 'private, max-age=300');
      return res.sendFile(filePath);
    } catch (err) {
      return next(err);
    }
  }
);

// PATCH /api/proofs/:id/decision  (client)  { decision: 'approved' | 'revision', comment? }
router.patch('/proofs/:id/decision', requireAuth, requireRole('client'), async (req, res, next) => {
  try {
    const found = await loadProofForUser(req, req.params.id);
    if (!found) return res.status(404).json({ message: 'Proof not found.' });
    const { decision, comment } = req.body || {};
    if (!['approved', 'revision'].includes(decision)) {
      return res.status(400).json({ message: 'Choose approve or request changes.' });
    }
    const note = String(comment || '').trim();
    if (decision === 'revision' && !note) {
      return res.status(400).json({ message: 'Tell the designer what to change before requesting revisions.' });
    }
    const { proof, project } = found;
    proof.status = decision === 'approved' ? 'approved' : 'revision';
    proof.decidedAt = new Date();
    await proof.save();

    await Comment.create({
      proof: proof._id,
      project: project._id,
      author: req.user._id,
      authorName: req.user.name,
      authorRole: 'client',
      kind: decision === 'approved' ? 'approved' : 'revision',
      body: note
    });
    await logActivity({
      project: project._id,
      proof: proof._id,
      actor: req.user.name,
      type: decision === 'approved' ? 'proof_approved' : 'proof_revision',
      message:
        decision === 'approved'
          ? `${req.user.name} approved "${proof.title}".`
          : `${req.user.name} requested changes on "${proof.title}".`
    });
    res.json({ proof: proofView(proof) });
  } catch (err) {
    next(err);
  }
});

// GET /api/proofs/:id/comments
router.get('/proofs/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const found = await loadProofForUser(req, req.params.id);
    if (!found) return res.status(404).json({ message: 'Proof not found.' });
    const comments = await Comment.find({ proof: found.proof._id }).sort({ createdAt: 1 });
    res.json({ comments: comments.map(commentView) });
  } catch (err) {
    next(err);
  }
});

// POST /api/proofs/:id/comments  { body }  (either role, threaded reply)
router.post('/proofs/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const found = await loadProofForUser(req, req.params.id);
    if (!found) return res.status(404).json({ message: 'Proof not found.' });
    const body = String((req.body && req.body.body) || '').trim();
    if (!body) return res.status(400).json({ message: 'Write a comment before sending.' });
    if (body.length > 2000) return res.status(400).json({ message: 'Keep comments under 2000 characters.' });
    const { proof, project } = found;
    const comment = await Comment.create({
      proof: proof._id,
      project: project._id,
      author: req.user._id,
      authorName: req.user.name,
      authorRole: req.user.role,
      kind: 'comment',
      body
    });
    await logActivity({
      project: project._id,
      proof: proof._id,
      actor: req.user.name,
      type: 'comment_added',
      message: `${req.user.name} commented on "${proof.title}".`
    });
    res.status(201).json({ comment: commentView(comment) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/proofs/:id/reset  (designer): sends a revised proof back to pending
router.patch('/proofs/:id/reset', requireAuth, requireRole('designer'), async (req, res, next) => {
  try {
    const found = await loadProofForUser(req, req.params.id);
    if (!found) return res.status(404).json({ message: 'Proof not found.' });
    found.proof.status = 'pending';
    found.proof.decidedAt = null;
    await found.proof.save();
    res.json({ proof: proofView(found.proof) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
