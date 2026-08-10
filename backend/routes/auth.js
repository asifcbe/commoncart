const express = require('express');
const router = express.Router();
const { login, register, getMe, resetAll, verifyPassword } = require('../controllers/authController');
const { protect, adminOnly } = require('../middleware/auth');

// Only an existing admin can create new accounts (staff or admin).
router.post('/register', protect, adminOnly, register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.post('/verify-password', protect, verifyPassword);
router.post('/reset-all', protect, adminOnly, resetAll);

module.exports = router;
