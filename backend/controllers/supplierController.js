const Supplier = require('../models/Supplier');
const Purchase = require('../models/Purchase');

exports.createSupplier = async (req, res) => {
  try {
    const { name, contactPerson, phone, email, address, gstin, note } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Supplier name is required' });
    const existing = await Supplier.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }, isActive: true });
    if (existing) return res.status(409).json({ message: 'A supplier with this name already exists', supplier: existing });
    const supplier = await Supplier.create({ name: name.trim(), contactPerson, phone, email, address, gstin, note });
    res.status(201).json({ supplier });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.listSuppliers = async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const query = { isActive: true };
    if (search) query.$text = { $search: search };
    const skip = (Number(page) - 1) * Number(limit);
    const [suppliers, total] = await Promise.all([
      Supplier.find(query).sort('name').skip(skip).limit(Number(limit)),
      Supplier.countDocuments(query),
    ]);
    res.json({ suppliers, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id).populate('payments.recordedBy', 'name');
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    // Fetch purchase history for this supplier
    const purchases = await Purchase.find({ supplierId: req.params.id })
      .sort('-createdAt')
      .select('purchaseId totalCost createdAt items note');

    res.json({ supplier, purchases });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateSupplier = async (req, res) => {
  try {
    const { name, contactPerson, phone, email, address, gstin, note, isActive } = req.body;
    const supplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      { name, contactPerson, phone, email, address, gstin, note, isActive },
      { new: true, runValidators: true }
    );
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    res.json({ supplier });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.addPayment = async (req, res) => {
  try {
    const { amount, method, reference, note } = req.body;
    if (!amount || Number(amount) <= 0) return res.status(400).json({ message: 'Valid payment amount is required' });

    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    supplier.payments.push({ amount: Number(amount), method, reference, note, recordedBy: req.user._id });
    supplier.balance = Math.max(0, supplier.balance - Number(amount));
    await supplier.save();

    res.json({ supplier });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deletePayment = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    const payment = supplier.payments.id(req.params.paymentId);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    supplier.balance += payment.amount;
    payment.deleteOne();
    await supplier.save();

    res.json({ supplier });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete a supplier. If it has purchase history we soft-delete (deactivate) to
// preserve those records; otherwise we hard-delete it entirely.
exports.deleteSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    const purchaseCount = await Purchase.countDocuments({ supplierId: supplier._id });

    if (purchaseCount > 0) {
      supplier.isActive = false;
      await supplier.save();
      return res.json({
        message: `Supplier deactivated (has ${purchaseCount} purchase record(s) — kept for history).`,
        softDeleted: true,
      });
    }

    await Supplier.findByIdAndDelete(supplier._id);
    res.json({ message: 'Supplier deleted', softDeleted: false });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
