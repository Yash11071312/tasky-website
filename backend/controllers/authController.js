const jwt = require('jsonwebtoken');
const OTP = require('../models/OTP');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sanitizeEmail = email => String(email || '').trim().toLowerCase();

const generateToken = id => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });

const generateOTP = () => String(Math.floor(100000 + Math.random() * 900000));

const sendOTP = async (req, res) => {
  try {
    const email = sanitizeEmail(req.body.email);

    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'A valid email is required' });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(500).json({ message: 'Email service is not configured' });
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Keep only one active OTP per email.
    await OTP.deleteMany({ email });
    await OTP.create({ email, otp, expiresAt });

    await sendEmail({
      to: email,
      subject: 'Your Tasky login code',
      text: `Your Tasky OTP is ${otp}. It expires in 5 minutes.`,
      html: `<p>Your Tasky OTP is <strong>${otp}</strong>.</p><p>It expires in 5 minutes.</p>`,
    });

    res.json({ message: 'OTP sent successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const verifyOTP = async (req, res) => {
  try {
    const email = sanitizeEmail(req.body.email);
    const otp = String(req.body.otp || '').trim();

    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'A valid email is required' });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: 'A valid 6-digit OTP is required' });
    }

    const otpRecord = await OTP.findOne({ email, otp });
    if (!otpRecord || otpRecord.expiresAt < new Date()) {
      await OTP.deleteMany({ email });
      return res.status(401).json({ message: 'Invalid or expired OTP' });
    }

    let user = await User.findOne({ email });
    if (!user) {
      const name = email.split('@')[0];
      user = await User.create({ name, email, joinDate: new Date() });
    }

    await OTP.deleteMany({ email });

    res.json({
      token: generateToken(user._id),
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        joinDate: user.joinDate || user.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getProfile = async (req, res) => {
  res.json({
    _id: req.user._id,
    name: req.user.name,
    email: req.user.email,
    joinDate: req.user.joinDate || req.user.createdAt,
  });
};

module.exports = {
  sendOTP,
  verifyOTP,
  getProfile,
};
