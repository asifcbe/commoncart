const fs = require('fs');
const path = require('path');

// Delete product image files from disk given their stored web paths
// (e.g. "/uploads/products/123.png"). Resolves safely under the uploads dir.
function deleteProductImageFiles(images = []) {
  const baseDir = path.join(__dirname, '..', 'uploads', 'products');
  for (const imgPath of images) {
    if (!imgPath || typeof imgPath !== 'string') continue;
    const filename = path.basename(imgPath); // strip any leading path
    if (!filename || filename === '.gitkeep') continue;
    const full = path.join(baseDir, filename);
    // Guard against path traversal — only delete files inside the uploads dir
    if (!full.startsWith(baseDir)) continue;
    try { if (fs.existsSync(full)) fs.unlinkSync(full); } catch { /* ignore individual failures */ }
  }
}

module.exports = { deleteProductImageFiles };
