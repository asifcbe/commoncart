const mongoose = require('mongoose');
const zlib = require('zlib');

// Full-database backup, admin only. Deliberately implemented with the plain
// Mongoose/MongoDB driver instead of shelling out to `mongodump` — this app's
// production host isn't guaranteed to have that binary on PATH, whereas this
// has no dependency beyond what's already installed. Read-only against the
// database: every collection is iterated with a plain cursor, nothing is
// written, locked, or mutated.
//
// Format: a single gzip-compressed stream. The first line is a JSON manifest
// ({ createdAt, collections: [{ name, count }] }); each collection's
// documents then follow as NDJSON (one JSON object per line), each preceded
// by a `{"__collection__":"<name>"}` marker line so restore knows where one
// collection's documents end and the next begins. This mirrors mongodump's
// "one document at a time" shape closely enough that a restore script can
// walk it collection-by-collection without loading the whole file into memory.
exports.createBackup = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const names = collections.map((c) => c.name).sort();

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="commoncart-backup-${stamp}.ndjson.gz"`);

    const gzip = zlib.createGzip();
    gzip.pipe(res);

    gzip.on('error', () => { try { res.end(); } catch { /* response already ended */ } });
    req.on('close', () => { gzip.destroy(); }); // client disconnected mid-stream — stop reading collections

    const manifest = { createdAt: new Date().toISOString(), collections: names };
    gzip.write(JSON.stringify(manifest) + '\n');

    for (const name of names) {
      gzip.write(JSON.stringify({ __collection__: name }) + '\n');
      const cursor = db.collection(name).find({});
      // eslint-disable-next-line no-await-in-loop
      for await (const doc of cursor) {
        if (!gzip.write(JSON.stringify(doc) + '\n')) {
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
