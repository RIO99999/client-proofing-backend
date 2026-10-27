const { Router } = require('../http/router');
const Project = require('../models/Project');
const Proof = require('../models/Proof');
const Activity = require('../models/Activity');
const { requireAuth, requireRole, canAccessProject } = require('../middleware/auth');
const { logActivity } = require('../services/activity');

const router = new Router('/api/projects');

function clientBaseUrl() {
  return (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function projectView(project, proofCounts = null) {
  const view = {
    id: project._id.toString(),
    name: project.name,
    description: project.description,
    clientName: project.clientName,
    clientEmail: project.clientEmail,
    clientJoined: Boolean(project.client),
    inviteLink: `${clientBaseUrl()}/invite/${project.inviteToken}`,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
  if (proofCounts) view.counts = proofCounts;
  return view;
}

async function countsFor(projectIds) {
  const rows = await Proof.aggregate([
    { $match: { project: { $in: projectIds } } },
    { $group: { _id: { project: '$project', status: '$status' }, n: { $sum: 1 } } }
  ]);
  const map = {};
  for (const row of rows) {
    const key = row._id.project.toString();
    map[key] = map[key] || { total: 0, pending: 0, approved: 0, revision: 0 };
    map[key][row._id.status] += row.n;
    map[key].total += row.n;
  }
  return map;
}

// GET /api/projects  (designer: own projects, client: assigned projects)
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const filter = req.user.role === 'designer' ? { designer: req.user._id } : { client: req.user._id };
    const projects = await Project.find(filter).sort({ updatedAt: -1 });
    const counts = await countsFor(projects.map((p) => p._id));
    res.json({
      projects: projects.map((p) => projectView(p, counts[p._id.toString()] || { total: 0, pending: 0, approved: 0, revision: 0 }))
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/projects  (designer)  { name, description?, clientName?, clientEmail? }
router.post('/', requireAuth, requireRole('designer'), async (req, res, next) => {
  try {
    const { name, description, clientName, clientEmail } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Give the project a name.' });
    }
    const project = await Project.create({
      name: String(name).trim(),
      description: description || '',
      designer: req.user._id,
      clientName: clientName || '',
      clientEmail: clientEmail || ''
    });
    await logActivity({
      project: project._id,
      actor: req.user.name,
      type: 'project_created',
      message: `${req.user.name} created the project "${project.name}".`
    });
    res.status(201).json({ project: projectView(project) });
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/invite/:token  (public preview for the invite page)
router.get('/invite/:token', async (req, res, next) => {
  try {
    const project = await Project.findOne({ inviteToken: req.params.token }).populate('designer', 'name studioName');
    if (!project) return res.status(404).json({ message: 'This invite link is not valid anymore.' });
    res.json({
      project: {
        name: project.name,
        description: project.description,
        clientName: project.clientName,
        clientJoined: Boolean(project.client),
        studioName: project.designer ? project.designer.studioName || project.designer.name : ''
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/projects/join  (client, signed in)  { token }
router.post('/join', requireAuth, requireRole('client'), async (req, res, next) => {
  try {
    const project = await Project.findOne({ inviteToken: req.body && req.body.token });
    if (!project) return res.status(404).json({ message: 'This invite link is not valid anymore.' });
    if (project.client && project.client.toString() !== req.user._id.toString()) {
      return res.status(409).json({ message: 'This project already has a client connected.' });
    }
    if (!project.client) {
      project.client = req.user._id;
      await project.save();
      await logActivity({
        project: project._id,
        actor: req.user.name,
        type: 'client_joined',
        message: `${req.user.name} joined the project as the client.`
      });
    }
    res.json({ project: projectView(project) });
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project || !canAccessProject(req.user, project)) {
      return res.status(404).json({ message: 'Project not found.' });
    }
    const counts = await countsFor([project._id]);
    res.json({
      project: projectView(project, counts[project._id.toString()] || { total: 0, pending: 0, approved: 0, revision: 0 })
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/projects/:id/invite  (designer)  { clientName, clientEmail }
router.patch('/:id/invite', requireAuth, requireRole('designer'), async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project || !canAccessProject(req.user, project)) {
      return res.status(404).json({ message: 'Project not found.' });
    }
    const { clientName, clientEmail } = req.body || {};
    project.clientName = String(clientName || project.clientName || '').trim();
    project.clientEmail = String(clientEmail || project.clientEmail || '').trim().toLowerCase();
    await project.save();
    res.json({ project: projectView(project) });
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:id/activity
router.get('/:id/activity', requireAuth, async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project || !canAccessProject(req.user, project)) {
      return res.status(404).json({ message: 'Project not found.' });
    }
    const items = await Activity.find({ project: project._id }).sort({ createdAt: -1 }).limit(100);
    res.json({
      activity: items.map((a) => ({
        id: a._id.toString(),
        type: a.type,
        actor: a.actor,
        message: a.message,
        proof: a.proof ? a.proof.toString() : null,
        createdAt: a.createdAt
      }))
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
