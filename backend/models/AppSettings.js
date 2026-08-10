const mongoose = require('mongoose');

// Generic key-value settings store (singleton per key)
const appSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

appSettingsSchema.statics.get = async function (key, defaultValue) {
  const doc = await this.findOne({ key });
  return doc ? doc.value : defaultValue;
};

appSettingsSchema.statics.set = async function (key, value) {
  return this.findOneAndUpdate({ key }, { value }, { upsert: true, new: true });
};

module.exports = mongoose.model('AppSettings', appSettingsSchema);
