const mongoose = require('mongoose');
const { Schema } = mongoose;

const purchaseSchema = new Schema(
  {
    purchaseId: { type: String, required: true, unique: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', default: null },
    supplier: { type: String, default: '' },
    purchaseDate: { type: Date, default: Date.now },
    items: [
      {
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        name: { type: String, required: true },
        category: { type: String, default: '' },
        subCategory: { type: String, default: '' },
        hsnCode: { type: String, default: '' },
        // Per-product GST rate override — see Product.gstPercent. null = use
        // the shop's default GST %.
        gstPercent: { type: Number, default: null, min: 0, max: 100 },
        description: { type: String, default: '' },
        qty: { type: Number, required: true, min: 1 },
        costPrice: { type: Number, required: true, min: 0 },
        price: { type: Number, default: 0 },
        color: { type: String, default: '' },
        size: { type: String, default: '' },
        discountPrice: { type: Number, default: null },
        barcode: { type: String, default: '' },
      },
    ],
    totalCost: { type: Number, required: true, min: 0 },
    note: { type: String, default: '' },
    purchasedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Purchase', purchaseSchema);
