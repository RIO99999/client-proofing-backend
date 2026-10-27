const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('../middleware/rateLimit');
const { Router } = require('../http/router');
const User = require('../models/User');
const Project = require('../models/Project');
const { requireAuth } = require('../middleware/auth');

const router = new Router('/api/auth');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Wait a few minutes and try again.' }
});

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// POST /api/auth/register  { name, email, password, role, studioName?, inviteToken? }
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { name, email, password, role, studioName, inviteToken } = req.body || {};
    if (!name || !isEmail(email) || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ message: 'Add your name, a valid email and a password of 8+ characters.' });
    }
    if (!['designer', 'client'].includes(role)) {
      return res.status(400).json({ message: 'Choose whether you are a designer or a client.' });
    }
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(409).json({ message: 'An account with that email already exists. Sign in instead.' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      passwordHash,
      role,
      studioName: role === 'designer' ? studioName || '' : ''
    });

    // A client who signed up from an invite link is attached to that project straight away.
    if (role === 'client' && inviteToken) {
      await Project.updateOne(
        { inviteToken, client: null },
        { $set: { client: user._id } }
      );
    }

    return res.status(201).json({ token: signToken(user), user: user.toSafeJSON() });
  } catch (err) {
    return next(err);
  }
});

// POST /api/auth/login  { email, password }
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!isEmail(email) || typeof password !== 'string') {
      return res.status(400).json({ message: 'Enter your email and password.' });
    }
    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) {
      return res.status(401).json({ message: 'That email and password do not match.' });
    }
    return res.json({ token: signToken(user), user: user.toSafeJSON() });
  } catch (err) {
    return next(err);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});

module.exports = router;
