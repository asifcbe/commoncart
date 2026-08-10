// LEGACY — read-only. All new returns/exchanges/replacements are processed
// via returnSessionController.js (Credit Notes / Replacement Notes /
// Settlements). These two exports only serve historical SaleReturn/Exchange
// documents created before that redesign; nothing writes to these collections
// anymore.
const SaleReturn = require('../models/SaleReturn');
const Exchange = require('../models/Exchange');

exports.listSaleReturns = async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 20 } = req.query;
    const query = {};
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) { const end = new Date(endDate); end.setHours(23, 59, 59, 999); query.createdAt.$lte = end; }
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [returns, total] = await Promise.all([
      SaleReturn.find(query).sort('-createdAt').skip(skip).limit(Number(limit)).populate('processedBy', 'name'),
      SaleReturn.countDocuments(query),
    ]);
    res.json({ returns, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.listExchanges = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const [exchanges, total] = await Promise.all([
      Exchange.find().sort('-createdAt').skip(skip).limit(Number(limit)).populate('processedBy', 'name'),
      Exchange.countDocuments(),
    ]);
    res.json({ exchanges, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
