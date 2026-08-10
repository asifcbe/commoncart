const express = require('express');
const router = express.Router();
const { getDayBook } = require('../controllers/reportsController');
const { protect } = require('../middleware/auth');

router.get('/day-book', protect, getDayBook);

module.exports = router;
