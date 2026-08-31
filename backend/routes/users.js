const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/', protect, adminOnly, async (_req, res) => {
  try {
    const users = await User.find().select('-passwordHash').sort('-createdAt');
    res.json({ users });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const { name, role, permissions } = req.body;
    if (role !== undefined && req.params.id === String(req.user._id) && role !== 'ADMIN') {
      return res.status(400).json({ message: "You can't change your own role" });
    }
    const update = {};
    if (name !== undefined) update.name = name;
    if (role !== undefined) update.role = role;
    // Permissions only meaningfully apply to STAFF (admins bypass all checks),
    // but store whatever's sent — role-switching back to STAFF later then
    // picks up the last-saved grants instead of resetting to defaults.
    if (permissions !== undefined) {
      update.permissions = {
        sections: Array.isArray(permissions.sections)
          ? permissions.sections.filter((s) => User.STAFF_SECTIONS.includes(s))
          : [],
        viewCostPrice: !!permissions.viewCostPrice,
        canManage: !!permissions.canManage,
      };
    }
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    if (req.params.id === String(req.user._id)) {
      return res.status(400).json({ message: "You can't delete your own account" });
    }
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: 'User not found' });

    // An admin may delete another admin — but never the last remaining admin,
    // which would lock everyone out of admin-only management.
    if (target.role === 'ADMIN') {
      const adminCount = await User.countDocuments({ role: 'ADMIN' });
      if (adminCount <= 1) {
        return res.status(400).json({ message: 'Cannot delete the last admin account' });
      }
    }

    await target.deleteOne();
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
