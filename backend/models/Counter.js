const mongoose = require('mongoose');

// Atomic sequence counters (e.g. per-financial-year invoice serials).
// Each doc: { _id: 'invoice:2627', seq: <number> }
const counterSchema = new mongoose.Schema({
  _id: { type: String },
  seq: { type: Number, default: 0 },
});

// Atomically increment and return the next value for a key.
counterSchema.statics.next = async function (key) {
  const doc = await this.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
