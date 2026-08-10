const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');

const protectCustomer = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
      return res.status(401).json({ message: 'Not authorized' });

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== 'customer')
      return res.status(401).json({ message: 'Not a customer token' });

    req.customer = await Customer.findById(decoded.id).select('-passwordHash');
    if (!req.customer) return res.status(401).json({ message: 'Customer not found' });

    next();
  } catch {
    return res.status(401).json({ message: 'Token invalid or expired' });
  }
};

module.exports = { protectCustomer };
