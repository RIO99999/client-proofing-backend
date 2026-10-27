const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { HttpError } = require('../http/respond');
const cloudinary = require('./cloudinary');

const UPLOAD_DIR = path.resolve(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads');

// Vercel (and other serverless hosts) have a read-only filesystem that does not persist between requests.
const SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
if (!SERVERLESS) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf'
]);

function maxMb() {
  return Number(process.env.MAX_UPLOAD_MB || 25);
}

// Checks the multipart "file" part (type and size) and exposes it as req.file. Runs before the route
// handler, so a bad file is rejected before any project lookup or write.
function receiveUpload(req, _res, next) {
  const part = (req.files || []).find((file) => file.fieldname === 'file');
  if (!part) {
    req.file = null;
    return next();
  }
  if (!ALLOWED.has(part.mimetype)) {
    return next(new HttpError(400, 'Only PNG, JPG, GIF, WEBP or PDF files can be uploaded.'));
  }
  if (part.buffer.length > maxMb() * 1024 * 1024) {
    return next(new HttpError(400, `That file is too large. The limit is ${maxMb()} MB.`));
  }
  req.file = {
    originalname: part.originalname,
    mimetype: part.mimetype,
    size: part.buffer.length,
    buffer: part.buffer
  };
  return next();
}

// With Cloudinary configured the buffer goes to Cloudinary. Otherwise it is written to UPLOAD_DIR.
async function storeUpload(file) {
  if (cloudinary.isConfigured()) {
    const result = await cloudinary.uploadBuffer(file.buffer);
    return { filename: result.public_id, storage: 'cloudinary', format: result.format || '' };
  }
  if (SERVERLESS) {
    throw new HttpError(503, 'Uploads need Cloudinary on this deployment. Set the CLOUDINARY_* variables in Vercel.');
  }
  const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, filename), file.buffer, { flag: 'wx' });
  return { filename, storage: 'local' };
}

// Deletes a stored file. Returns false when there was nothing to delete.
async function removeStoredFile(publicId) {
  if (cloudinary.isConfigured()) {
    const result = await cloudinary.destroyAsset(publicId);
    return result.result === 'ok';
  }
  if (SERVERLESS) return false;
  const name = path.basename(publicId);
  if (!name || name !== publicId) return false;
  try {
    await fs.promises.unlink(path.join(UPLOAD_DIR, name));
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

module.exports = { receiveUpload, storeUpload, removeStoredFile, UPLOAD_DIR, ALLOWED, SERVERLESS };
