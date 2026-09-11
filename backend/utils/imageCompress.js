const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Compressed product photos are written here by default; callers may pass a
// different sub-folder of uploads/ (e.g. 'categories') to compressToFile.
const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
const OUT_DIR = path.join(UPLOADS_ROOT, 'products');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const TARGET_BYTES = 250 * 1024; // hard ceiling per stored photo
const MAX_DIMENSION = 1600;      // longest edge — plenty for a product page/zoom
const MIN_QUALITY = 40;          // don't go below this even to hit the size

// Re-encode one image buffer to a WebP file under TARGET_BYTES.
// Resizes the longest edge down to MAX_DIMENSION, then steps quality down
// (85 → 40) until the output fits. Returns { filename, size, subDir } where
// `filename` is bare and `subDir` is the uploads/ sub-folder it landed in.
// Pass `subDir` (default 'products') to write elsewhere under uploads/.
async function compressToFile(buffer, subDir = 'products') {
  const outDir = path.join(UPLOADS_ROOT, subDir);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const base = sharp(buffer, { failOn: 'none' })
    .rotate() // honour EXIF orientation, then strip metadata (default)
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true });

  let out = null;
  for (let q = 85; q >= MIN_QUALITY; q -= 10) {
    // eslint-disable-next-line no-await-in-loop
    const candidate = await base.clone().webp({ quality: q, effort: 4 }).toBuffer();
    out = candidate;
    if (candidate.length <= TARGET_BYTES) break;
  }
  // If still over budget at MIN_QUALITY, shrink dimensions once more and retry
  // at a low quality — covers huge source images.
  if (out.length > TARGET_BYTES) {
    out = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: 1100, height: 1100, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: MIN_QUALITY, effort: 4 })
      .toBuffer();
  }

  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
  await fs.promises.writeFile(path.join(outDir, filename), out);
  return { filename, size: out.length, subDir };
}

// Express middleware — run AFTER multer.memoryStorage() populates req.files.
// Compresses every uploaded image to disk and rewrites req.files[i] so the
// downstream controllers (which read f.filename) work unchanged.
async function compressUploadedImages(req, res, next) {
  try {
    if (!req.files || !req.files.length) return next();
    const processed = [];
    // Sequential, not Promise.all — keeps peak memory low on small instances.
    for (const f of req.files) {
      // eslint-disable-next-line no-await-in-loop
      const { filename, size } = await compressToFile(f.buffer);
      processed.push({
        ...f,
        buffer: undefined,      // let the raw upload be GC'd
        filename,
        path: path.join(OUT_DIR, filename),
        mimetype: 'image/webp',
        size,
      });
    }
    req.files = processed;
    next();
  } catch (err) {
    next(new Error(`Image processing failed: ${err.message}`));
  }
}

module.exports = { compressUploadedImages, compressToFile, TARGET_BYTES };
