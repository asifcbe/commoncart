const express = require('express');
const multer = require('multer');
const router = express.Router();
const { createBackup, getBackupSummary, restoreBackup } = require('../controllers/backupController');
const { protect, adminOnly } = require('../middleware/auth');

// A documents-only backup is small (well under a few MB even for a mature
// shop) — but a "with images" backup embeds every uploaded photo as base64
// (~33% larger than the raw bytes) inside the same gzip, so the cap needs
// real headroom for a shop with thousands of product photos. Still in
// memory: even a large multi-GB gzip is fine to hold briefly during restore.
const uploadBackup = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
});

router.get('/summary', protect, adminOnly, getBackupSummary);
router.get('/download', protect, adminOnly, createBackup);
router.post('/restore', protect, adminOnly, uploadBackup.single('file'), restoreBackup);

module.exports = router;
