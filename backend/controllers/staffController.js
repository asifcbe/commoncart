const User = require('../models/User');
const Attendance = require('../models/Attendance');
const SalaryPayment = require('../models/SalaryPayment');
const SaleTransaction = require('../models/SaleTransaction');

// ─── Staff list (all users) with quick stats ─────────────────
exports.listStaff = async (_req, res) => {
  try {
    const staff = await User.find().select('-passwordHash').sort('name');
    res.json({ staff });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Lightweight list for dropdowns (POS staff selector)
exports.staffOptions = async (_req, res) => {
  try {
    const staff = await User.find({ isActive: { $ne: false } }).select('name role').sort('name');
    res.json({ staff });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Update staff (HR fields, role, name, and access permissions) ──
exports.updateStaffHR = async (req, res) => {
  try {
    const { name, phone, monthlySalary, joinDate, isActive, role, permissions } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Staff not found' });

    if (name !== undefined && name.trim()) user.name = name.trim();
    if (phone !== undefined) user.phone = phone;
    if (monthlySalary !== undefined) user.monthlySalary = Number(monthlySalary) || 0;
    if (joinDate !== undefined) user.joinDate = joinDate ? new Date(joinDate) : null;
    if (isActive !== undefined) user.isActive = isActive;
    if (role !== undefined && ['ADMIN', 'STAFF'].includes(role)) user.role = role;

    // Permissions only apply to STAFF; sanitise to known section keys
    if (permissions && user.role === 'STAFF') {
      user.permissions = {
        sections: Array.isArray(permissions.sections)
          ? permissions.sections.filter((s) => User.STAFF_SECTIONS.includes(s))
          : (user.permissions?.sections || []),
        viewCostPrice: !!permissions.viewCostPrice,
        canManage: !!permissions.canManage,
      };
    }

    await user.save();
    const out = user.toObject();
    delete out.passwordHash;
    res.json({ user: out });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Expose the catalog of grantable sections to the frontend
exports.getSectionCatalog = (_req, res) => {
  res.json({ sections: User.STAFF_SECTIONS, defaults: User.DEFAULT_STAFF_PERMISSIONS });
};

// ─── Attendance ───────────────────────────────────────────────

// Mark / update attendance for a staff member on a date (upsert)
exports.markAttendance = async (req, res) => {
  try {
    const { userId, date, status, checkIn, checkOut, note } = req.body;
    if (!userId || !date) return res.status(400).json({ message: 'userId and date are required' });

    const record = await Attendance.findOneAndUpdate(
      { userId, date },
      { userId, date, status: status || 'PRESENT', checkIn: checkIn || '', checkOut: checkOut || '', note: note || '', markedBy: req.user._id },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ attendance: record });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// List attendance with optional staff + date-range filters
exports.listAttendance = async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.query;
    const query = {};
    if (userId) query.userId = userId;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }
    const records = await Attendance.find(query).sort('-date').populate('userId', 'name role');
    res.json({ attendance: records });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Attendance summary per staff for a date range (counts by status)
exports.attendanceSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const match = {};
    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = startDate;
      if (endDate) match.date.$lte = endDate;
    }
    const rows = await Attendance.aggregate([
      { $match: match },
      { $group: { _id: { userId: '$userId', status: '$status' }, count: { $sum: 1 } } },
    ]);
    // Reshape into { userId: { PRESENT, ABSENT, HALF_DAY, LEAVE } }
    const summary = {};
    for (const r of rows) {
      const uid = r._id.userId.toString();
      summary[uid] = summary[uid] || { PRESENT: 0, ABSENT: 0, HALF_DAY: 0, LEAVE: 0 };
      summary[uid][r._id.status] = r.count;
    }
    res.json({ summary });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Clear a staff member's attendance for a date (used when cycling back to "unmarked")
exports.clearAttendance = async (req, res) => {
  try {
    const { userId, date } = req.query;
    if (!userId || !date) return res.status(400).json({ message: 'userId and date are required' });
    await Attendance.findOneAndDelete({ userId, date });
    res.json({ message: 'Attendance cleared' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Salary payments ──────────────────────────────────────────
exports.addSalaryPayment = async (req, res) => {
  try {
    const { userId, amount, periodLabel, method, type, note } = req.body;
    if (!userId || !amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'userId and a positive amount are required' });
    }
    const payment = await SalaryPayment.create({
      userId,
      amount: Number(amount),
      periodLabel: periodLabel || '',
      method: method || 'CASH',
      type: type || 'SALARY',
      note: note || '',
      paidBy: req.user._id,
    });
    res.status(201).json({ payment });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.listSalaryPayments = async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.query;
    const query = {};
    if (userId) query.userId = userId;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) { const e = new Date(endDate); e.setHours(23, 59, 59, 999); query.createdAt.$lte = e; }
    }
    const payments = await SalaryPayment.find(query).sort('-createdAt').populate('userId', 'name').populate('paidBy', 'name');
    res.json({ payments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteSalaryPayment = async (req, res) => {
  try {
    const deleted = await SalaryPayment.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Payment not found' });
    res.json({ message: 'Payment deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Sales by staff ───────────────────────────────────────────
// Aggregates completed STORE sales grouped by soldBy, with optional date range.
exports.salesByStaff = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const match = { channel: 'STORE', status: 'COMPLETED' };
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) { const e = new Date(endDate); e.setHours(23, 59, 59, 999); match.createdAt.$lte = e; }
    }

    const rows = await SaleTransaction.aggregate([
      { $match: match },
      { $group: { _id: '$soldBy', totalSales: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
    ]);

    // Attach staff names; include staff with zero sales for completeness
    const staff = await User.find().select('name role').lean();
    const byId = {};
    rows.forEach((r) => { if (r._id) byId[r._id.toString()] = r; });

    const result = staff.map((s) => {
      const r = byId[s._id.toString()];
      return {
        userId: s._id,
        name: s.name,
        role: s.role,
        totalSales: r ? r.totalSales : 0,
        count: r ? r.count : 0,
      };
    }).sort((a, b) => b.totalSales - a.totalSales);

    const grandTotal = result.reduce((sum, r) => sum + r.totalSales, 0);
    const grandCount = result.reduce((sum, r) => sum + r.count, 0);

    res.json({ rows: result, grandTotal, grandCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
