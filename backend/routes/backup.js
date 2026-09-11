const express = require('express');
const multer = require('multer');
const router = express.Router();
const { createBackup, getBackupSummary, restoreBackup } = require('../controllers/backupController');
const { protect, adminOnly } = require('../middleware/auth');

// Backup archives are small (whole DB gzipped is well under a few MB even for
// a mature shop) — keep the upload in memory, cap it generously at 100MB.
const uploadBackup = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

router.get('/summary', protect, adminOnly, getBackupSummary);
router.get('/download', protect, adminOnly, createBackup);
router.post('/restore', protect, adminOnly, uploadBackup.single('file'), restoreBackup);

module.exports = router;
