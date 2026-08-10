const express = require('express');
const router = express.Router();
const {
  listStaff, staffOptions, updateStaffHR, getSectionCatalog,
  markAttendance, listAttendance, attendanceSummary, clearAttendance,
  addSalaryPayment, listSalaryPayments, deleteSalaryPayment,
  salesByStaff,
} = require('../controllers/staffController');
const { protect, adminOnly } = require('../middleware/auth');

// Available to any logged-in user (used by the POS staff dropdown)
router.get('/options', protect, staffOptions);

// Admin-only management
router.get('/', protect, adminOnly, listStaff);
router.get('/section-catalog', protect, adminOnly, getSectionCatalog);
router.put('/:id/hr', protect, adminOnly, updateStaffHR);

router.get('/attendance', protect, adminOnly, listAttendance);
router.get('/attendance/summary', protect, adminOnly, attendanceSummary);
router.post('/attendance', protect, adminOnly, markAttendance);
router.delete('/attendance', protect, adminOnly, clearAttendance);

router.get('/salary', protect, adminOnly, listSalaryPayments);
router.post('/salary', protect, adminOnly, addSalaryPayment);
router.delete('/salary/:id', protect, adminOnly, deleteSalaryPayment);

router.get('/sales-by-staff', protect, adminOnly, salesByStaff);

module.exports = router;
