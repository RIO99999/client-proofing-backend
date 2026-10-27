// Vercel serverless entry. Every /api/* request lands here; the shared app routes it.
// Vercel passes the original req.url (for example /api/auth/login), which the router reads.
const { handle } = require('../server/src/app');

module.exports = (req, res) => handle(req, res);
