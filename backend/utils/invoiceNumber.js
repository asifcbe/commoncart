const Counter = require('../models/Counter');
const AppSettings = require('../models/AppSettings');

// Per-document-type numbering config, keyed by the same prefix passed to
// generateInvoiceNumber() (INV/PUR/CN/RN/ORD). Falls back to a legacy
// single-type INVOICE_CONFIG (pre-multi-type installs) for the INV type only,
// and to sane defaults otherwise.
async function getDocConfig(prefix) {
  try {
    const all = await AppSettings.get('DOC_NUMBERING_CONFIG', null);
    if (all && all[prefix]) {
      const c = all[prefix];
      return { format: c.format || 'YYMMNNNN', prefix: c.prefix || prefix, digits: c.digits || 4 };
    }
    if (prefix === 'INV') {
      const legacy = await AppSettings.get('INVOICE_CONFIG', {});
      return {
        format: legacy.format || 'YYMMNNNN',
        prefix: legacy.prefix || 'INV',
        digits: legacy.digits || 4,
      };
    }
    return { format: 'YYMMNNNN', prefix, digits: 4 };
  } catch {
    return { format: 'YYMMNNNN', prefix, digits: 4 };
  }
}

// Generate a sequential invoice/bill number based on the configured format.
// `prefix` keeps separate counters per document type (e.g. INV/PUR/CN/RN/ORD)
// and selects that type's own numbering config.
async function generateInvoiceNumber(prefix = 'INV', date = new Date()) {
  const d = new Date(date);
  const cfg = await getDocConfig(prefix);
  const { format, prefix: cfgPrefix, digits } = cfg;
  const pad = (n) => String(n).padStart(digits, '0');

  if (format === 'SEQUENTIAL') {
    const seq = await Counter.next(`${prefix}:SEQ`);
    return String(seq);
  }

  if (format === 'YYYYMMNNNN') {
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const seq = await Counter.next(`${prefix}:${yyyy}${mm}`);
    return `${yyyy}${mm}${pad(seq)}`;
  }

  if (format === 'PREFIX-DATE-NNN') {
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;
    const seq = await Counter.next(`${prefix}:${dateStr}`);
    // Each document type now has its own prefix config (defaults to its own
    // counter key, e.g. 'CN', 'RN'), so this is always the right display text.
    return `${cfgPrefix}-${dateStr}-${pad(seq)}`;
  }

  // Default: YYMMNNNN
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const seq = await Counter.next(`${prefix}:${yy}${mm}`);
  return `${yy}${mm}${pad(seq)}`;
}

// Generate a document number and hand it to `createFn`, retrying with a
// fresh number if the underlying Counter has drifted behind what's actually
// in the collection (e.g. from data created outside the counter, or a prior
// partial migration) and `createFn` hits a duplicate-key error (Mongo code
// 11000) on that number's unique field. Counter.next() is itself atomic, so
// this only ever fires on genuine drift, not concurrent requests racing —
// but when it does fire, this makes the caller self-heal instead of
// surfacing a 500 to the user.
async function withUniqueDocNumber(prefix, createFn, { date, maxAttempts = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const number = await generateInvoiceNumber(prefix, date);
    try {
      return await createFn(number);
    } catch (err) {
      if (err?.code !== 11000) throw err;
      lastErr = err;
      // Leave the counter as-is (it's already past this number) and just
      // draw the next one on retry.
    }
  }
  throw lastErr;
}

module.exports = { generateInvoiceNumber, withUniqueDocNumber };
