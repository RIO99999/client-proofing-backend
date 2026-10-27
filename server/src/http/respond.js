const fs = require('fs');

// An error with a status code the client may see. Anything else becomes a generic 500.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.expose = true;
  }
}

function finish(req, res, payload) {
  if (!res.getHeader('Content-Length')) {
    res.setHeader('Content-Length', Buffer.byteLength(payload));
  }
  res.end(req.method === 'HEAD' ? undefined : payload);
  return res;
}

// Streams a file with ETag, Last-Modified, 304 and single-range support (needed for PDF viewers).
async function sendFile(req, res, filePath) {
  const stat = await fs.promises.stat(filePath).catch(() => null);
  if (!stat || !stat.isFile()) throw new HttpError(404, 'File not found.');

  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  res.setHeader('Last-Modified', stat.mtime.toUTCString());
  res.setHeader('ETag', etag);
  res.setHeader('Accept-Ranges', 'bytes');
  if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'public, max-age=0');

  if (req.headers['if-none-match'] === etag) {
    res.statusCode = 304;
    res.end();
    return res;
  }

  let start = 0;
  let end = stat.size - 1;
  res.statusCode = 200;
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim());
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1]);
      end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    } else {
      start = Math.max(0, stat.size - Number(range[2]));
    }
    if (start > end || start >= stat.size) {
      res.statusCode = 416;
      res.setHeader('Content-Range', `bytes */${stat.size}`);
      res.end();
      return res;
    }
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
  }

  const length = stat.size === 0 ? 0 : end - start + 1;
  res.setHeader('Content-Length', String(length));
  if (req.method === 'HEAD' || length === 0) {
    res.end();
    return res;
  }

  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', reject);
    res.on('finish', resolve);
    stream.pipe(res);
  });
  return res;
}

// Adds the Express-style helpers the route files use (res.status, res.json, res.redirect, res.sendFile).
function decorateResponse(req, res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    return finish(req, res, JSON.stringify(body));
  };
  res.redirect = (status, location) => {
    const code = typeof status === 'number' ? status : 302;
    const url = typeof status === 'string' ? status : location;
    res.statusCode = code;
    res.setHeader('Location', url);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return finish(req, res, `Redirecting to ${url}`);
  };
  res.sendFile = (filePath) => sendFile(req, res, filePath);
  return res;
}

module.exports = { HttpError, decorateResponse };
