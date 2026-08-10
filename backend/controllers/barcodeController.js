const bwipjs = require('bwip-js');
const PDFDocument = require('pdfkit');
const Product = require('../models/Product');

exports.generateBarcodeImage = async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const png = await bwipjs.toBuffer({
      bcid: 'ean13',
      text: product.barcode,
      scale: 3,
      height: 15,
      includetext: true,
      textxalign: 'center',
    });

    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.printBatch = async (req, res) => {
  try {
    const { productIds } = req.body;
    if (!productIds || !productIds.length)
      return res.status(400).json({ message: 'productIds array is required' });

    const products = await Product.find({ _id: { $in: productIds } });
    if (!products.length) return res.status(404).json({ message: 'No products found' });

    const doc = new PDFDocument({ size: 'A4', margin: 20 });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=barcodes.pdf',
    });
    doc.pipe(res);

    const labelsPerRow = 3;
    const labelWidth = 170;
    const labelHeight = 110;
    const paddingX = 10;
    const paddingY = 10;

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const col = i % labelsPerRow;
      const row = Math.floor(i / labelsPerRow);

      if (i > 0 && i % (labelsPerRow * 7) === 0) doc.addPage();

      const x = 20 + col * (labelWidth + paddingX);
      const y = 20 + row * (labelHeight + paddingY);

      try {
        const png = await bwipjs.toBuffer({
          bcid: 'ean13',
          text: product.barcode,
          scale: 2,
          height: 12,
          includetext: true,
          textxalign: 'center',
        });

        doc.image(png, x, y + 25, { width: labelWidth - 10, height: 50 });
      } catch {
        // skip barcode image if generation fails
      }

      doc.fontSize(8).text(product.name, x, y, { width: labelWidth, ellipsis: true });
      doc.fontSize(7).text(`SKU: ${product.SKU}`, x, y + 80, { width: labelWidth });
      doc.fontSize(9).text(`$${product.price.toFixed(2)}`, x, y + 90, { width: labelWidth });
    }

    doc.end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
