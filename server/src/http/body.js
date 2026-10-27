const { HttpError } = require('./respond');

const JSON_LIMIT = 100 * 1024; // same 100kb cap the Express JSON parser used
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readBody(req, limit, tooLargeMessage) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        reject(new HttpError(413, tooLargeMessage));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', (err) => {
      if (done) return;
      done = true;
      reject(err);
    });
  });
}

// Parses multipart/form-data into text fields and file parts. Only what the app needs:
// each part has a name, optional filename, optional content-type, and a body.
function parseMultipart(buffer, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const fields = {};
  const files = [];

  let pos = buffer.indexOf(delimiter);
  if (pos === -1) throw new HttpError(400, 'The upload could not be read.');
  pos += delimiter.length;

  while (pos < buffer.length) {
    // "--" right after a delimiter closes the body.
    if (buffer[pos] === 0x2d && buffer[pos + 1] === 0x2d) break;
    if (buffer[pos] === 0x0d && buffer[pos + 1] === 0x0a) {
      pos += 2;
    } else {
      break;
    }

    const next = buffer.indexOf(delimiter, pos);
    if (next === -1) break;
    const part = buffer.subarray(pos, Math.max(pos, next - 2)); // strip the CRLF before the delimiter
    pos = next + delimiter.length;

    const split = part.indexOf('\r\n\r\n');
    if (split === -1) continue;
    const headers = part.subarray(0, split).toString('utf8').split('\r\n');
    const content = part.subarray(split + 4);

    const disposition = headers.find((line) => /^content-disposition:/i.test(line)) || '';
    const nameMatch = /;\s*name="([^"]*)"/i.exec(disposition);
    if (!nameMatch) continue;
    const fileMatch = /;\s*filename="([^"]*)"/i.exec(disposition);

    if (fileMatch) {
      // A browser sends an empty file part when no file was picked. Treat it as no file.
      if (fileMatch[1] === '' && content.length === 0) continue;
      const typeLine = headers.find((line) => /^content-type:/i.test(line));
      const mimetype = typeLine ? typeLine.slice(typeLine.indexOf(':') + 1).trim().toLowerCase() : 'application/octet-stream';
      files.push({ fieldname: nameMatch[1], originalname: fileMatch[1], mimetype, buffer: content });
    } else {
      fields[nameMatch[1]] = content.toString('utf8');
    }
  }
  return { fields, files };
}

// Fills req.body (object) and req.files (array) for JSON and multipart requests. Other bodies stay {}.
async function parseRequestBody(req) {
  // Some hosts (Vercel) may read a JSON body before our code runs and leave it on req.body.
  const preParsed = req.body;
  req.body = {};
  req.files = [];
  if (!BODY_METHODS.has(req.method)) return;

  const contentType = String(req.headers['content-type'] || '');
  const type = contentType.split(';')[0].trim().toLowerCase();

  if (type === 'application/json') {
    if (preParsed !== undefined && preParsed !== null) {
      if (typeof preParsed === 'object' && !Buffer.isBuffer(preParsed)) {
        req.body = preParsed;
        return;
      }
      const text = Buffer.isBuffer(preParsed) ? preParsed.toString('utf8') : String(preParsed);
      req.body = text.trim() ? parseJson(text) : {};
      return;
    }
    const buffer = await readBody(req, JSON_LIMIT, 'That request is too large.');
    if (buffer.length === 0) return;
    req.body = parseJson(buffer.toString('utf8'));
    return;
  }

  if (type === 'multipart/form-data') {
    const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
    if (!match) throw new HttpError(400, 'The upload could not be read.');
    const maxMb = Number(process.env.MAX_UPLOAD_MB || 25);
    // Allow room for the form fields on top of the file itself.
    const limit = maxMb * 1024 * 1024 + 1024 * 1024;
    const buffer = Buffer.isBuffer(preParsed)
      ? preParsed
      : await readBody(req, limit, `That file is too large. The limit is ${maxMb} MB.`);
    const parsed = parseMultipart(buffer, match[1] || match[2]);
    req.body = parsed.fields;
    req.files = parsed.files;
  }
}

function parseJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (_err) {
    throw new HttpError(400, 'The request body is not valid JSON.');
  }
  if (data === null || typeof data !== 'object') {
    throw new HttpError(400, 'The request body is not valid JSON.');
  }
  return data;
}

module.exports = { parseRequestBody, parseMultipart, readBody };
