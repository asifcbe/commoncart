const Product = require('../models/Product');

const generateSKU = async (category, name) => {
  const prefix = (category.slice(0, 3) + name.slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const count = await Product.countDocuments();
  const sequence = String(count + 1).padStart(5, '0');
  return `${prefix}-${sequence}`;
};

module.exports = generateSKU;
