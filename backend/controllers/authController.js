const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;
const SCRYPT_KEY_LENGTH = 64;

const sanitizeUsername = username => String(username || '').trim().toLowerCase();

const generateToken = id => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });

const hashPassword = password => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
};

const verifyPassword = (password, storedPassword) => {
  if (!storedPassword || !storedPassword.includes(':')) return false;

  const [salt, storedHash] = storedPassword.split(':');
  const hashBuffer = Buffer.from(storedHash, 'hex');
  const enteredHash = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH);

  return hashBuffer.length === enteredHash.length && crypto.timingSafeEqual(hashBuffer, enteredHash);
};

const formatUser = user => ({
  _id: user._id,
  name: user.name,
  username: user.username,
  email: user.email,
  joinDate: user.joinDate || user.createdAt,
});

const login = async (req, res) => {
  try {
    const username = sanitizeUsername(req.body.username);
    const password = String(req.body.password || '');

    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ message: 'Username must be 3-30 letters, numbers, or underscores' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    let user = await User.findOne({ username }).select('+password');

    if (!user) {
      user = await User.create({
        name: username,
        username,
        password: hashPassword(password),
        joinDate: new Date(),
      });
    } else if (!verifyPassword(password, user.password)) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    res.json({
      token: generateToken(user._id),
      user: formatUser(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    res.status(500).json({ message: error.message });
  }
};

const getProfile = async (req, res) => {
  res.json(formatUser(req.user));
};

module.exports = {
  login,
  getProfile,
};
