const { Router } = require('../http/router');
const Proof = require('../models/Proof');
const { requireAuth, requireRole } = require('../middleware/auth');
const { receiveUpload, storeUpload, removeStoredFile } = require('../utils/upload');

const router = new Router('/api/uploads');

// POST /api/uploads  (designer, multipart field "file")  -> stores a file without attaching it to a proof
router.post('/', requireAuth, requireRole('designer'), receiveUpload, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Choose an image or PDF to upload.' });
    }
    const stored = await storeUpload(req.file);
    return res.status(201).json({
      upload: {
        publicId: stored.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        storage: stored.storage,
        format: stored.format || ''
      }
    });
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/uploads/:publicId  (designer)  refuses files a proof still points at
router.delete('/:publicId', requireAuth, requireRole('designer'), async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    const inUse = await Proof.exists({ 'file.filename': publicId });
    if (inUse) {
      return res.status(409).json({ message: 'This file is attached to a proof, so it cannot be deleted.' });
    }
    const removed = await removeStoredFile(publicId);
    if (!removed) {
      return res.status(404).json({ message: 'That file was not found.' });
    }
    return res.json({ deleted: true, publicId });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
