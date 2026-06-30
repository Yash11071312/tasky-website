const express = require('express');
const { sendOTP, verifyOTP, getProfile } = require('../controllers/authController');
const protect = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/send-otp', sendOTP);
router.post('/verify-otp', verifyOTP);
router.get('/profile', protect, getProfile);

module.exports = router;
