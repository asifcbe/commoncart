const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');

const signToken = (id) =>
  jwt.sign({ id, type: 'customer' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

exports.register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'name, email and password are required' });

    const existing = await Customer.findOne({ email });
    if (existing) return res.status(409).json({ message: 'Email already registered' });

    const passwordHash = await Customer.hashPassword(password);
    const customer = await Customer.create({ name, email, passwordHash, phone: phone || '', source: 'WEB' });

    const token = signToken(customer._id);
    res.status(201).json({
      token,
      customer: { id: customer._id, name: customer.name, email: customer.email, phone: customer.phone, creditPoints: customer.creditPoints },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'email and password are required' });

    const customer = await Customer.findOne({ email, isActive: true });
    if (!customer) return res.status(401).json({ message: 'Invalid credentials' });

    const valid = await customer.comparePassword(password);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    const token = signToken(customer._id);
    res.json({
      token,
      customer: { id: customer._id, name: customer.name, email: customer.email, phone: customer.phone, creditPoints: customer.creditPoints },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMe = async (req, res) => {
  res.json({ customer: req.customer });
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;
    const customer = await Customer.findByIdAndUpdate(
      req.customer._id,
      { name, phone },
      { new: true }
    ).select('-passwordHash');
    res.json({ customer });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.addAddress = async (req, res) => {
  try {
    const customer = await Customer.findById(req.customer._id);
    if (req.body.isDefault) {
      customer.addresses.forEach((a) => (a.isDefault = false));
    }
    customer.addresses.push(req.body);
    await customer.save();
    res.json({ addresses: customer.addresses });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.removeAddress = async (req, res) => {
  try {
    const customer = await Customer.findById(req.customer._id);
    customer.addresses = customer.addresses.filter(
      (a) => a._id.toString() !== req.params.addressId
    );
    await customer.save();
    res.json({ addresses: customer.addresses });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Admin: list all customers
exports.adminListCustomers = async (req, res) => {
  try {
    const { search, source, page = 1, limit = 20 } = req.query;
    const query = {};
    if (source) query.source = source;
    if (search) query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
    const skip = (Number(page) - 1) * Number(limit);
    const [customers, total] = await Promise.all([
      Customer.find(query).select('-passwordHash').sort('-createdAt').skip(skip).limit(Number(limit)),
      Customer.countDocuments(query),
    ]);
    res.json({ customers, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Admin: look up customer by phone (for POS)
exports.lookupByPhone = async (req, res) => {
  try {
    const { phone } = req.params;
    if (!phone) return res.status(400).json({ message: 'Phone is required' });
    const customer = await Customer.findOne({ phone: phone.trim() }).select('-passwordHash');
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    res.json({ customer });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Admin: create POS customer (phone-only, no email/password required)
exports.createPOSCustomer = async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!phone) return res.status(400).json({ message: 'Phone is required' });

    const existing = await Customer.findOne({ phone: phone.trim() });
    if (existing) return res.json({ customer: existing });

    const customer = await Customer.create({ name: name || 'POS Customer', phone: phone.trim(), source: 'POS' });
    res.status(201).json({ customer });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Admin: create a customer with full details (name, phone, email optional)
exports.adminCreateCustomer = async (req, res) => {
  try {
    const { name, phone, email, creditPoints } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Name is required' });
    if (!phone?.trim()) return res.status(400).json({ message: 'Phone is required' });

    const trimmedPhone = phone.trim();
    const existingPhone = await Customer.findOne({ phone: trimmedPhone });
    if (existingPhone) return res.status(409).json({ message: 'A customer with this phone already exists' });

    const doc = { name: name.trim(), phone: trimmedPhone, source: 'POS', creditPoints: Number(creditPoints) || 0 };
    // Only set email when provided — avoids null collisions on the unique sparse index
    if (email && email.trim()) {
      const trimmedEmail = email.trim().toLowerCase();
      const existingEmail = await Customer.findOne({ email: trimmedEmail });
      if (existingEmail) return res.status(409).json({ message: 'A customer with this email already exists' });
      doc.email = trimmedEmail;
    }

    const customer = await Customer.create(doc);
    res.status(201).json({ customer: customer.toObject() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Admin: edit a customer's details
exports.adminUpdateCustomer = async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ message: 'Name cannot be empty' });
      customer.name = name.trim();
    }

    if (phone !== undefined) {
      const trimmedPhone = phone.trim();
      if (!trimmedPhone) return res.status(400).json({ message: 'Phone cannot be empty' });
      const clash = await Customer.findOne({ phone: trimmedPhone, _id: { $ne: customer._id } });
      if (clash) return res.status(409).json({ message: 'Another customer already uses this phone' });
      customer.phone = trimmedPhone;
    }

    if (email !== undefined) {
      const trimmedEmail = (email || '').trim().toLowerCase();
      if (trimmedEmail) {
        const clash = await Customer.findOne({ email: trimmedEmail, _id: { $ne: customer._id } });
        if (clash) return res.status(409).json({ message: 'Another customer already uses this email' });
        customer.email = trimmedEmail;
      } else {
        // Clearing the email — unset it so the sparse unique index ignores this doc
        customer.email = undefined;
        customer.set('email', undefined, { strict: false });
      }
    }

    await customer.save();
    // If email was cleared, ensure it's removed from the document in the DB (not stored as null)
    if (email !== undefined && !(email || '').trim()) {
      await Customer.collection.updateOne({ _id: customer._id }, { $unset: { email: '' } });
    }

    const fresh = await Customer.findById(customer._id).select('-passwordHash');
    res.json({ customer: fresh.toObject() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Admin: adjust credit points manually
exports.adminAdjustPoints = async (req, res) => {
  try {
    const { delta, reason } = req.body;
    if (delta === undefined) return res.status(400).json({ message: 'delta is required' });
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    customer.creditPoints = Math.max(0, customer.creditPoints + Number(delta));
    await customer.save();
    res.json({ customer: customer.toObject(), newPoints: customer.creditPoints });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
