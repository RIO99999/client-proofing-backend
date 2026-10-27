const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verifies the Bearer token and attaches req.user (a fresh User document).
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ message: 'Sign in to continue.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: 'Your session is no longer valid.' });
    }
    req.user = user;
    return next();
  } catch (_err) {
    return res.status(401).json({ message: 'Your session expired. Sign in again.' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ message: 'You do not have access to this area.' });
    }
    return next();
  };
}

// Helper used by routes: is this user allowed to see the project?
function canAccessProject(user, project) {
  if (user.role === 'designer') {
    return project.designer.toString() === user._id.toString();
  }
  return Boolean(project.client) && project.client.toString() === user._id.toString();
}

module.exports = { requireAuth, requireRole, canAccessProject };
