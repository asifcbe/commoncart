const bwipjs = require('bwip-js');
const AppSettings = require('../models/AppSettings');

const BARCODE_KEY = 'BARCODE_CONFIG';
const BARCODE_COUNTER_KEY = 'BARCODE_COUNTER';

// Generates `count` sequential 6-digit barcodes starting from the configured start
// number, reserved in a single atomic increment (safe under concurrent calls).
// Falls back to random 6-digit numbers if settings are unavailable.
// Called with no args, resolves to a single barcode string (back-compat).
const generateEAN13 = async (count = 1) => {
  try {
    const config = await AppSettings.get(BARCODE_KEY, { startFrom: 100000 });
    const startFrom = Number(config?.startFrom ?? 100000);

    // Atomically get-then-increment.
    // $setOnInsert seeds the counter at startFrom on first creation.
    // $inc: 0 is a no-op on insert but ensures the update always has at least one operator.
    // We run two ops:
    //   1. Ensure doc exists with the correct seed (no-op if already there)
    //   2. Atomic fetch-and-increment by `count`
    await AppSettings.findOneAndUpdate(
      { key: BARCODE_COUNTER_KEY },
      { $setOnInsert: { value: startFrom } },
      { upsert: true }
    );

    // Pre-increment value = first barcode in the reserved range
    const doc = await AppSettings.findOneAndUpdate(
      { key: BARCODE_COUNTER_KEY },
      { $inc: { value: count } },
      { new: false }
    );

    const first = doc.value;
    const barcodes = Array.from({ length: count }, (_, i) => String(first + i));
    return count === 1 ? barcodes[0] : barcodes;
  } catch {
    const rand = () => String(Math.floor(100000 + Math.random() * 900000));
    return count === 1 ? rand() : Array.from({ length: count }, rand);
  }
};

const generateBarcodePNG = async (barcodeValue, options = {}) => {
  const png = await bwipjs.toBuffer({
    bcid: 'code128',
    text: barcodeValue,
    scale: 3,
    height: 15,
    includetext: true,
    textxalign: 'center',
    ...options,
  });
  return png;
};

const generateBarcodeSVG = (barcodeValue) => {
  return new Promise((resolve, reject) => {
    bwipjs.toSVG(
      {
        bcid: 'code128',
        text: barcodeValue,
        scale: 2,
        height: 10,
        includetext: true,
        textxalign: 'center',
      },
      (err, svg) => {
        if (err) return reject(err);
        resolve(svg);
      }
    );
  });
};

module.exports = { generateEAN13, generateBarcodePNG, generateBarcodeSVG };
