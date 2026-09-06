const express = require('express');
const router = express.Router();
const { createBackup, getBackupSummary } = require('../controllers/backupController');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/summary', protect, adminOnly, getBackupSummary);
router.get('/download', protect, adminOnly, createBackup);

module.exports = router;
