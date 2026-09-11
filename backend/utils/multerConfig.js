const multer = require('multer');
const path = require('path');
const fs = require('fs');

// The compress step (utils/imageCompress.js) writes the final files here.
const uploadDir = path.join(__dirname, '..', 'uploads', 'products');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Keep uploads in memory — the compress middleware re-encodes each buffer to
// a ≤250KB WebP and writes THAT to disk. Nothing raw ever touches the volume.
const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp/;
  const valid = allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype);
  if (valid) cb(null, true);
  else cb(new Error('Only image files are allowed'));
};

// 12MB accepted from the client; it gets compressed down to ≤250KB on save.
const upload = multer({ storage, fileFilter, limits: { fileSize: 12 * 1024 * 1024 } });

module.exports = upload;
