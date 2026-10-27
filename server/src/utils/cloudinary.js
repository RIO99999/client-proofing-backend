const cloudinary = require('cloudinary').v2;

// Cloudinary is optional. When the three credentials are set in server/.env, proofs are
// uploaded to Cloudinary as authenticated (signed-delivery) assets. Otherwise uploads stay on local disk.
const cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
const apiKey = process.env.CLOUDINARY_API_KEY || '';
const apiSecret = process.env.CLOUDINARY_API_SECRET || '';

function isPlaceholder(value) {
  return !value || /^(your[-_ ]|replace|xxx)/i.test(value);
}

const enabled = !isPlaceholder(cloudName) && !isPlaceholder(apiKey) && !isPlaceholder(apiSecret);

if (enabled) {
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
}

function isConfigured() {
  return enabled;
}

function uploadBuffer(buffer) {
  const folder = process.env.CLOUDINARY_FOLDER || 'client-proofing';
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image', // PDFs are delivered through the image pipeline too
        type: 'authenticated', // not publicly reachable: delivery needs a signed URL
        unique_filename: true
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

// Signed, time-independent URL that Cloudinary only honours for authenticated assets.
function signedUrl(publicId, format) {
  return cloudinary.url(publicId, {
    resource_type: 'image',
    type: 'authenticated',
    sign_url: true,
    secure: true,
    format: format || undefined
  });
}

// Deletes an authenticated asset from Cloudinary. Resolves { result: 'ok' } or { result: 'not found' }.
function destroyAsset(publicId) {
  return cloudinary.uploader.destroy(publicId, {
    resource_type: 'image',
    type: 'authenticated',
    invalidate: true
  });
}

module.exports = { isConfigured, uploadBuffer, signedUrl, destroyAsset };
