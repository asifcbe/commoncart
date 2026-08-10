const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // 'YYYY-MM-DD' (one record per staff per day)
    status: { type: String, enum: ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'], default: 'PRESENT' },
    checkIn: { type: String, default: '' },  // 'HH:MM'
    checkOut: { type: String, default: '' },
    note: { type: String, default: '' },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// One attendance record per staff member per day
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
