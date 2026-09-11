const mongoose = require('mongoose');
const zlib = require('zlib');
const { EJSON, ObjectId } = require('bson');

// Collections never touched by backup/restore — they're server-managed and
// restoring stale copies would do more harm than good.
const SKIP_COLLECTIONS = new Set(['sessions']);

// Full-database backup, admin only. Deliberately implemented with the plain
// Mongoose/MongoDB driver instead of shelling out to `mongodump` — this app's
// production host isn't guaranteed to have that binary on PATH, whereas this
// has no dependency beyond what's already installed. Read-only against the
// database: every collection is iterated with a plain cursor, nothing is
// written, locked, or mutated.
//
// Format: a single gzip-compressed stream of NDJSON. Line 1 is a plain-JSON
// manifest ({ createdAt, format, collections: [names] }). Then, per
// collection: a `{"__collection__":"<name>"}` marker line, followed by one
// line per document. Documents are serialised with **canonical Extended JSON**
// (EJSON, relaxed:false) so ObjectIds, Dates and every other BSON type
// round-trip losslessly on restore — a plain JSON.stringify would flatten
// _id to a bare string and break every cross-collection reference.
exports.createBackup = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const names = collections.map((c) => c.name).filter((n) => !SKIP_COLLECTIONS.has(n)).sort();

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="commoncart-backup-${stamp}.ndjson.gz"`);

    const gzip = zlib.createGzip();
    gzip.pipe(res);

    gzip.on('error', () => { try { res.end(); } catch { /* response already ended */ } });
    req.on('close', () => { gzip.destroy(); }); // client disconnected mid-stream — stop reading collections

    const manifest = { createdAt: new Date().toISOString(), format: 'ejson-ndjson-1', collections: names };
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
    const grouped = new Map(); // collName -> docs[]
    let current = null;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      let marker;
      try { marker = JSON.parse(line); } catch { marker = null; }
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

    res.json({
      message: 'Restore complete.',
      restoredFrom: manifest.createdAt || null,
      collections: report,
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
