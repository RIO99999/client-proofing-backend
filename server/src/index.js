const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const http = require('http');
const { handle, ensureDb } = require('./app');

const PORT = process.env.PORT || 5000;
const server = http.createServer(handle);

async function start() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('replace-')) {
    console.warn('JWT_SECRET is not set to a real value. Set it in server/.env before going live.');
  }
  await ensureDb();
  server.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start server', err);
    process.exit(1);
  });
}

module.exports = { server, start };
