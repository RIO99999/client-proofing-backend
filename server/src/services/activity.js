const Activity = require('../models/Activity');

// Writes one line to a project's activity feed. Never throws into the request flow.
async function logActivity({ project, proof = null, actor, type, message }) {
  try {
    await Activity.create({ project, proof, actor, type, message });
  } catch (err) {
    console.error('Could not write activity', err.message);
  }
}

module.exports = { logActivity };
