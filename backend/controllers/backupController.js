const mongoose = require('mongoose');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const { EJSON, ObjectId } = require('bson');

// Collections never touched by backup/restore — they're server-managed and
// restoring stale copies would do more harm than good.
const SKIP_COLLECTIONS = new Set(['sessions']);

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
const IMAGE_EXTENSIONS = new Set(['.webp', '.jpg', '.jpeg', '.png', '.gif']);

// Walks backend/uploads/ and yields every image file's web path
// ("/uploads/...") alongside its absolute path on disk. Recursive so it picks
// up every sub-folder (products/categories/carousel/...) without hardcoding
// names — a new upload sub-folder added later needs no change here. Filtered
// to known image extensions so stray non-photo files (.DS_Store, .gitkeep)
// never end up embedded in the backup.
function* walkUploadFiles(dir, webPrefix = '/uploads') {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // uploads/ missing entirely — nothing to walk
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const web = `${webPrefix}/${entry.name}`;
    if (entry.isDirectory()) {
      yield* walkUploadFiles(abs, web);
    } else if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      yield { abs, web };
    }
  }
}

// Full-database backup, admin only. Deliberately implemented with the plain
// Mongoose/MongoDB driver instead of shelling out to `mongodump` — this app's
// production host isn't guaranteed to have that binary on PATH, whereas this
// has no dependency beyond what's already installed. Read-only against the
// database: every collection is iterated with a plain cursor, nothing is
// written, locked, or mutated.
//
// Format: a single gzip-compressed stream of NDJSON. Line 1 is a plain-JSON
// manifest ({ createdAt, format, collections: [names], includesImages }).
// Then, per collection: a `{"__collection__":"<name>"}` marker line, followed
// by one line per document. Documents are serialised with **canonical
// Extended JSON** (EJSON, relaxed:false) so ObjectIds, Dates and every other
// BSON type round-trip losslessly on restore — a plain JSON.stringify would
// flatten _id to a bare string and break every cross-collection reference.
//
// `?images=1` additionally appends every file under backend/uploads/ after
// the documents: a `{"__images__":true}` marker line, then one line per file
// as `{"path":"/uploads/...","data":"<base64>"}` — `path` matches exactly
// what's stored in Product.images etc, so a future restore could write these
// straight back to disk. Adds real weight to the download (base64 is ~33%
// larger than the raw bytes, on top of files already being ≤250KB WebP each
// per imageCompress.js) — opt-in, not the default.
exports.createBackup = async (req, res) => {
  try {
    const includeImages = req.query.images === '1' || req.query.images === 'true';

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const names = collections.map((c) => c.name).filter((n) => !SKIP_COLLECTIONS.has(n)).sort();

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = includeImages ? '-with-images' : '';
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="commoncart-backup${suffix}-${stamp}.ndjson.gz"`);

    const gzip = zlib.createGzip();
    gzip.pipe(res);

    gzip.on('error', () => { try { res.end(); } catch { /* response already ended */ } });
    req.on('close', () => { gzip.destroy(); }); // client disconnected mid-stream — stop reading collections

    const manifest = { createdAt: new Date().toISOString(), format: 'ejson-ndjson-1', collections: names, includesImages: includeImages };
    gzip.write(JSON.stringify(manifest) + '\n');

    for (const name of names) {
      gzip.write(JSON.stringify({ __collection__: name }) + '\n');
      const cursor = db.collection(name).find({});
      // eslint-disable-next-line no-await-in-loop
      for await (const doc of cursor) {
        if (!gzip.write(EJSON.stringify(doc, { relaxed: false }) + '\n')) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => gzip.once('drain', resolve));
        }
      }
    }

    if (includeImages) {
      gzip.write(JSON.stringify({ __images__: true }) + '\n');
      for (const { abs, web } of walkUploadFiles(UPLOADS_ROOT)) {
        // eslint-disable-next-line no-await-in-loop
        const bytes = await fs.promises.readFile(abs);
        const line = JSON.stringify({ path: web, data: bytes.toString('base64') }) + '\n';
        if (!gzip.write(line)) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => gzip.once('drain', resolve));
        }
      }
    }

    gzip.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ message: err.message });
    } else {
      res.destroy();
    }
  }
};

// Parse one NDJSON document line. Tries canonical EJSON first (current format);
// falls back to plain JSON for backups taken before the EJSON change, coercing
// a 24-hex `_id` string back to an ObjectId so references still line up (Dates
// in those old backups stay as ISO strings — a known, minor degradation).
function parseDocLine(line) {
  let doc;
  try {
    doc = EJSON.parse(line, { relaxed: false });
  } catch {
    doc = JSON.parse(line);
  }
  if (doc && typeof doc._id === 'string' && /^[0-9a-fA-F]{24}$/.test(doc._id)) {
    doc._id = new ObjectId(doc._id);
  }
  return doc;
}

// Restore the database from an uploaded backup file. ADMIN ONLY, and
// DESTRUCTIVE: every collection present in the backup is DROPPED and rebuilt
// from the file. Collections not in the backup are left untouched. Guards:
//   - refuses to run if MONGODB_URI === MONGODB_URIprod
//   - requires body/field `confirm` to equal the exact phrase "RESTORE"
//   - the file must be a gzipped NDJSON backup produced by createBackup
exports.restoreBackup = async (req, res) => {
  try {
    if (process.env.MONGODB_URIprod && process.env.MONGODB_URI === process.env.MONGODB_URIprod) {
      return res.status(403).json({ message: 'Restore is disabled: the server is connected to the production database.' });
    }
    if ((req.body?.confirm || '').trim() !== 'RESTORE') {
      return res.status(400).json({ message: 'Type RESTORE to confirm this destructive operation.' });
    }
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ message: 'No backup file uploaded.' });
    }

    let text;
    try {
      text = zlib.gunzipSync(req.file.buffer).toString('utf8');
    } catch {
      return res.status(400).json({ message: 'File is not a valid .gz archive.' });
    }

    const lines = text.split('\n').filter((l) => l.trim().length);
    if (!lines.length) return res.status(400).json({ message: 'Backup file is empty.' });

    let manifest;
    try {
      manifest = JSON.parse(lines[0]);
    } catch {
      return res.status(400).json({ message: 'Backup file has no readable manifest on its first line.' });
    }
    if (!Array.isArray(manifest.collections)) {
      return res.status(400).json({ message: 'Backup manifest is missing its collection list.' });
    }

    // Walk the NDJSON body, grouping docs under their preceding marker line.
    // Once the `__images__` marker is hit, remaining lines are image entries
    // ({ path, data }) instead of documents — collected separately and
    // written to disk after the DB restore succeeds below.
    const grouped = new Map(); // collName -> docs[]
    const images = []; // { path, data(base64) }
    let current = null;
    let inImages = false;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (inImages) {
        try {
          const entry = JSON.parse(line);
          if (entry && typeof entry.path === 'string' && typeof entry.data === 'string') images.push(entry);
        } catch (e) {
          return res.status(400).json({ message: `Corrupt image entry: ${e.message}` });
        }
        continue;
      }
      let marker;
      try { marker = JSON.parse(line); } catch { marker = null; }
      if (marker && marker.__images__ === true) {
        inImages = true;
        continue;
      }
      if (marker && typeof marker.__collection__ === 'string') {
        current = marker.__collection__;
        if (!grouped.has(current)) grouped.set(current, []);
        continue;
      }
      if (!current) continue; // stray line before any marker
      try {
        grouped.get(current).push(parseDocLine(line));
      } catch (e) {
        return res.status(400).json({ message: `Corrupt document in collection "${current}": ${e.message}` });
      }
    }

    const db = mongoose.connection.db;
    const report = [];
    for (const name of manifest.collections) {
      if (SKIP_COLLECTIONS.has(name)) { report.push({ collection: name, skipped: true }); continue; }
      const docs = grouped.get(name) || [];

      // Drop then rebuild — a true snapshot restore, not a merge.
      await db.collection(name).deleteMany({});
      let inserted = 0;
      if (docs.length) {
        // ordered:false so one bad doc doesn't abort the rest; chunked to keep
        // the BSON command size well under the 16MB limit on large collections.
        const CHUNK = 1000;
        for (let i = 0; i < docs.length; i += CHUNK) {
          const slice = docs.slice(i, i + CHUNK);
          // eslint-disable-next-line no-await-in-loop
          const r = await db.collection(name).insertMany(slice, { ordered: false });
          inserted += r.insertedCount;
        }
      }
      report.push({ collection: name, restored: inserted, inBackup: docs.length });
    }

    // Write any bundled images back to disk. `path` is untrusted (came from
    // an uploaded file) — resolve it under UPLOADS_ROOT and reject anything
    // that escapes it (e.g. "../../etc/passwd") before writing.
    let imagesWritten = 0;
    for (const { path: webPath, data } of images) {
      if (typeof webPath !== 'string' || !webPath.startsWith('/uploads/')) continue;
      const rel = webPath.slice('/uploads/'.length);
      const abs = path.join(UPLOADS_ROOT, rel);
      if (!abs.startsWith(UPLOADS_ROOT + path.sep)) continue; // path traversal guard
      try {
        // eslint-disable-next-line no-await-in-loop
        await fs.promises.mkdir(path.dirname(abs), { recursive: true });
        // eslint-disable-next-line no-await-in-loop
        await fs.promises.writeFile(abs, Buffer.from(data, 'base64'));
        imagesWritten++;
      } catch { /* one bad image entry shouldn't abort the rest */ }
    }

    res.json({
      message: 'Restore complete.',
      restoredFrom: manifest.createdAt || null,
      collections: report,
      images: images.length ? { inBackup: images.length, written: imagesWritten } : null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Lists collection names + approximate document counts, so the Settings page
// can show "what a backup would include" without actually generating one —
// a quick, read-only sanity check before an admin downloads a (potentially
// large) archive.
exports.getBackupSummary = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const summary = await Promise.all(
      collections.map(async (c) => ({
        name: c.name,
        count: await db.collection(c.name).estimatedDocumentCount(),
      }))
    );
    summary.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ collections: summary, dbName: db.databaseName });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
