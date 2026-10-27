const mongoose = require('mongoose');
const { connectDB } = require('./config/db');
const { HttpError } = require('./http/respond');
const { Router } = require('./http/router');
const { createRequestHandler } = require('./http/server');
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const uploadRoutes = require('./routes/uploads');
const proofRoutes = require('./routes/proofs');

const health = new Router('/api');
health.get('/health', (_req, res) => res.json({ ok: true, service: 'client-proofing-system' }));

// Connects once per warm function instance. Serverless functions can't keep a connection
// started at boot, so the first request that needs the database opens it.
let connecting = null;
async function ensureDb() {
  if (mongoose.connection.readyState === 1) return;
  if (!connecting) {
    connecting = connectDB(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/client-proofing').catch((err) => {
      connecting = null;
      console.error('MongoDB connection failed', err.message);
      throw new HttpError(503, 'The database is not reachable right now. Try again in a moment.');
    });
  }
  await connecting;
}

async function dbReady(_req, _res, next) {
  await ensureDb();
  return next();
}

// Health needs no database. Every other route waits for the connection first.
function withDb(routes) {
  for (const route of routes) route.handlers = [dbReady, ...route.handlers];
  return routes;
}

// Same mount order the Express app used.
const routes = [
  ...health.routes,
  ...withDb([...authRoutes.routes, ...projectRoutes.routes, ...uploadRoutes.routes, ...proofRoutes.routes])
];

const handle = createRequestHandler(routes);

module.exports = { handle, routes, ensureDb };
