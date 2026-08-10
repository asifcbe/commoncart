const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Not authorized, no token' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-passwordHash');

    if (!req.user) {
      return res.status(401).json({ message: 'User not found' });
    }

    next();
  } catch {
    return res.status(401).json({ message: 'Not authorized, token invalid' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'ADMIN') return next();
  return res.status(403).json({ message: 'Admin access required' });
};

// Allows ADMIN, or STAFF explicitly granted the "canManage" permission
// (edit/delete on products, purchases, sales — see PermissionEditor).
const manageOnly = (req, res, next) => {
  if (req.user && (req.user.role === 'ADMIN' || req.user.permissions?.canManage)) return next();
  return res.status(403).json({ message: 'You do not have permission to edit or delete this' });
};

module.exports = { protect, adminOnly, manageOnly };
