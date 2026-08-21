import React, { useEffect, useState, useRef, Suspense, lazy } from 'react';
import { Plus, Search, Edit, Trash2, Eye, Image, ChevronLeft, ChevronRight, Globe, GlobeLock, AlertTriangle, Camera, Barcode, Printer } from 'lucide-react';
import useProductStore from '../store/useProductStore';
import useAuthStore from '../store/useAuthStore';
import { canViewCostPrice, canManage } from '../config/permissions';
import { useToast } from '../components/ui/Toast';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import { Card, CardContent } from '../components/ui/Card';
import CategoryFields from '../components/CategoryFields';
import ManagedSelect from '../components/ManagedSelect';
import { BarcodeDialog, BulkBarcodeDialog } from '../components/BarcodeLabelPrintDialog';
import api from '../utils/api';
const CameraScanner = lazy(() => import('../components/CameraScanner'));
import useAutoRefresh from '../hooks/useAutoRefresh';
import { formatDateTime } from '../utils/date';

function DeleteConfirmModal({ product, onConfirm, onClose }) {
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    setConfirming(true);
    await onConfirm();
    setConfirming(false);
  };

  return (
    <Modal open onClose={onClose} title="Delete Product" size="sm">
      <div className="space-y-4">
        <div className="flex gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-red-800 mb-2">This action is permanent and cannot be undone.</p>
            <p className="text-red-700 mb-1">Deleting <span className="font-bold">"{product.name}"</span> will also remove:</p>
            <ul className="list-disc list-inside text-red-600 space-y-0.5 ml-1">
              <li>All stock movement history for this product</li>
              <li>Product from Barcode Management</li>
              <li>Product from Inventory section</li>
              <li>Product from POS product list</li>
              <li>Product from the web store</li>
            </ul>
            <p className="text-red-500 mt-2 text-xs">Note: Past sales records referencing this product are preserved.</p>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={confirming}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {confirming ? <Spinner size="sm" className="mr-2" /> : <Trash2 size={14} className="mr-2" />}
            Yes, Delete Permanently
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ProductForm({ product, categoryCatalog, variants, sizes, onSave, onClose }) {
  const toast = useToast();
  const showCost = canViewCostPrice(useAuthStore.getState().user);
  const [form, setForm] = useState({
    name: product?.name || '',
    description: product?.description || '',
    category: product?.category || '',
    subCategory: product?.subCategory || '',
    color: product?.color || '',
    size: product?.size || '',
    price: product?.price || '',
    costPrice: product?.costPrice || '',
    quantity: product?.quantity || 0,
    supplier: product?.supplier || '',
    location: product?.location || '',
    lowStockThreshold: product?.lowStockThreshold || 10,
    // New products are hidden from the web store by default; editing keeps the saved value
    isWebVisible: product ? product.isWebVisible === true : false,
    // Optional existing barcode (create only) — blank auto-generates one
    barcode: '',
  });
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const { createProduct, updateProduct } = useProductStore();

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        // Don't send an empty barcode — let the backend auto-generate one
        if (k === 'barcode' && !String(v).trim()) return;
        fd.append(k, v);
      });
      files.forEach((f) => fd.append('images', f));
      if (product) {
        await updateProduct(product._id, fd);
      } else {
        await createProduct(fd);
      }
      onSave();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to save product', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="text-sm font-medium text-gray-700 block mb-1">Product Name *</label>
          <Input value={form.name} onChange={set('name')} required />
        </div>
        <CategoryFields
          catalog={categoryCatalog}
          category={form.category}
          subCategory={form.subCategory}
          onCategoryChange={(v) => setForm((f) => ({ ...f, category: v }))}
          onSubCategoryChange={(v) => setForm((f) => ({ ...f, subCategory: v }))}
          required
        />
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Price *</label>
          <Input type="number" step="0.01" value={form.price} onChange={set('price')} required />
        </div>
        {showCost && (
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Cost Price</label>
            <Input type="number" step="0.01" value={form.costPrice} onChange={set('costPrice')} />
          </div>
        )}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Initial Quantity</label>
          <Input type="number" value={form.quantity} onChange={set('quantity')} min="0" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Low Stock Threshold</label>
          <Input type="number" value={form.lowStockThreshold} onChange={set('lowStockThreshold')} min="0" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Supplier</label>
          <Input value={form.supplier} onChange={set('supplier')} />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Shelf / Location</label>
          <Input value={form.location} onChange={set('location')} placeholder="e.g. A3-B2" />
        </div>
        <ManagedSelect
          label="Variant"
          options={variants}
          value={form.color}
          onChange={(v) => setForm((f) => ({ ...f, color: v }))}
          placeholder="Select a variant"
          newPlaceholder="New variant"
        />
        <ManagedSelect
          label="Size"
          options={sizes}
          value={form.size}
          onChange={(v) => setForm((f) => ({ ...f, size: v }))}
          placeholder="Select a size"
          newPlaceholder="New size"
        />
        {!product && (
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Barcode</label>
            <div className="flex gap-2">
              <Input value={form.barcode} onChange={set('barcode')} placeholder="Scan/enter existing — blank to auto-generate" />
              <Button type="button" variant="outline" onClick={() => setShowScanner(true)} title="Scan with device camera">
                <Camera size={16} />
              </Button>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Leave blank to auto-generate. Enter an existing barcode to match a pre-labelled product.</p>
          </div>
        )}
        <div className="col-span-2">
          <label className="text-sm font-medium text-gray-700 block mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full rounded-md border border-input px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="col-span-2">
          <label className="text-sm font-medium text-gray-700 block mb-1">Images (up to 5)</label>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => setFiles(Array.from(e.target.files).slice(0, 5))}
            className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 file:text-sm file:font-medium hover:file:bg-blue-100"
          />
        </div>
        <div className="col-span-2">
          <label className="flex items-center gap-3 cursor-pointer select-none group">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={form.isWebVisible}
                onChange={(e) => setForm((f) => ({ ...f, isWebVisible: e.target.checked }))}
              />
              <div className={`w-10 h-5 rounded-full transition-colors ${form.isWebVisible ? 'bg-blue-600' : 'bg-gray-300'}`} />
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isWebVisible ? 'translate-x-5' : ''}`} />
            </div>
            <div>
              <span className="text-sm font-medium text-gray-700">Visible on Web Store</span>
              <p className="text-xs text-gray-400">
                {form.isWebVisible ? 'Customers can see and buy this product online' : 'Product is hidden from the web store'}
              </p>
            </div>
            {form.isWebVisible ? <Globe size={16} className="text-blue-500" /> : <GlobeLock size={16} className="text-gray-400" />}
          </label>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Spinner size="sm" className="mr-2" /> : null}
          {product ? 'Update Product' : 'Create Product'}
        </Button>
      </div>
      {showScanner && (
        <Suspense fallback={null}>
          <CameraScanner
            open
            title="Scan Barcode"
            onScan={(code) => { setForm((f) => ({ ...f, barcode: code.trim() })); toast({ message: `Barcode scanned: ${code.trim()}`, type: 'success' }); }}
            onClose={() => setShowScanner(false)}
          />
        </Suspense>
      )}
    </form>
  );
}

function StockHistory({ productId, onClose }) {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/inventory/movements', { params: { productId } })
      .then(({ data }) => { setMovements(data.movements); setLoading(false); })
      .catch(() => setLoading(false));
  }, [productId]);

  const typeColors = { SALE: 'destructive', RESTOCK: 'success', ADJUSTMENT: 'warning', RETURN: 'info' };

  return (
    <div>
      {loading ? <div className="flex justify-center py-8"><Spinner /></div> : (
        <div className="divide-y max-h-96 overflow-y-auto">
          {movements.length === 0 && <div className="text-center text-gray-400 py-8 text-sm">No movements recorded</div>}
          {movements.map((m) => (
            <div key={m._id} className="flex items-center justify-between py-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant={typeColors[m.type]}>{m.type}</Badge>
                  <span className="text-xs text-gray-500">{m.channel}</span>
                </div>
                {m.note && <div className="text-xs text-gray-500 mt-1">{m.note}</div>}
                <div className="text-xs text-gray-400">{formatDateTime(m.createdAt)}</div>
              </div>
              <div className="text-right">
                <div className={`text-sm font-bold ${m.quantityChanged > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {m.quantityChanged > 0 ? '+' : ''}{m.quantityChanged}
                </div>
                <div className="text-xs text-gray-500">{m.previousQty} → {m.newQty}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end pt-4 border-t">
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

export default function Products() {
  const { products, total, pages, loading, fetchProducts, fetchCategories, categories, categoryCatalog, fetchCategoryCatalog, variants, sizes, fetchVariantConfig, deleteProduct } = useProductStore();
  const toast = useToast();
  const allowManage = canManage(useAuthStore.getState().user);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [variant, setVariant] = useState('');
  const [size, setSize] = useState('');
  // Products deactivated (not deleted) because they were sold before their
  // purchase was deleted — hidden by default so removed purchases don't leave
  // visible clutter; toggle on to audit them.
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [historyProduct, setHistoryProduct] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeSearching, setBarcodeSearching] = useState(false);
  const searchTimeout = useRef(null);

  // Barcode label printing — single-item dialog + bulk "select items, print
  // labels for all of them" mode (mirrors DigitZebra's Items.jsx UI).
  const [barcodeItem, setBarcodeItem] = useState(null);
  const [barcodePrintMode, setBarcodePrintMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [bulkBarcodeOpen, setBulkBarcodeOpen] = useState(false);
  const [businessName, setBusinessName] = useState('');

  useEffect(() => { fetchCategories(); fetchCategoryCatalog(); fetchVariantConfig(); }, []);
  useEffect(() => {
    api.get('/settings/business-config').then(({ data }) => setBusinessName(data.config?.businessName || '')).catch(() => {});
  }, []);

  const filters = { search, category, subCategory, color: variant, size, page, isActive: showInactive ? undefined : true };

  useEffect(() => {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchProducts(filters);
    }, 300);
  }, [search, category, subCategory, variant, size, showInactive, page]);

  // Auto-refresh the list — but never while a form/modal is open or the user is searching
  const isBusy = showForm || editProduct || historyProduct || deleteTarget || barcodeItem || bulkBarcodeOpen;
  useAutoRefresh(() => { if (!isBusy) fetchProducts(filters); }, 30000, [search, category, subCategory, variant, size, showInactive, page, isBusy]);

  // Sub-categories available for the selected category (from the managed catalog)
  const subCategoryOptions = category
    ? (categoryCatalog.find((c) => c.name === category)?.subCategories || [])
    : [];

  const handleDelete = async () => {
    try {
      await deleteProduct(deleteTarget._id);
      setDeleteTarget(null);
      fetchProducts(filters);
      toast({ message: `"${deleteTarget.name}" permanently deleted`, type: 'success' });
    } catch {
      toast({ message: 'Failed to delete product', type: 'error' });
    }
  };

  const handleSave = () => {
    setShowForm(false);
    setEditProduct(null);
    fetchProducts(filters);
    toast({ message: 'Product saved successfully', type: 'success' });
  };

  const handleBarcodeSearch = async (code) => {
    const trimmed = (code || barcodeInput).trim();
    if (!trimmed) return;
    setBarcodeSearching(true);
    try {
      const { data } = await api.get(`/products/barcode/${encodeURIComponent(trimmed)}`);
      if (data.product) {
        setEditProduct(data.product);
        setShowForm(true);
        setBarcodeInput('');
      } else {
        toast({ message: `No product found with barcode ${trimmed}`, type: 'error' });
      }
    } catch (err) {
      toast({ message: err.response?.data?.message || `No product found with barcode ${trimmed}`, type: 'error' });
    } finally { setBarcodeSearching(false); }
  };

  const stockBadge = (p) => {
    // Deactivated products are leftovers from a deleted purchase whose unit
    // was already sold — kept only for invoice history, not real stock.
    if (p.isActive === false) return <Badge variant="secondary">Deactivated</Badge>;
    const avail = p.quantity - p.reservedQty;
    if (avail <= 0) return <Badge variant="destructive">Out of Stock</Badge>;
    if (avail <= p.lowStockThreshold) return <Badge variant="warning">Low Stock</Badge>;
    return <Badge variant="success">In Stock</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-500 text-sm mt-1">{total} products total</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={barcodePrintMode ? 'default' : 'outline'}
            onClick={() => { setBarcodePrintMode((v) => !v); setCheckedIds(new Set()); }}
          >
            <Printer size={16} className="mr-2" /> {barcodePrintMode ? 'Cancel' : 'Print Labels'}
          </Button>
          <Button onClick={() => { setEditProduct(null); setShowForm(true); }}>
            <Plus size={16} className="mr-2" /> Add Product
          </Button>
        </div>
      </div>

      {/* Barcode print selection bar */}
      {barcodePrintMode && (
        <div className="flex items-center gap-3 p-3 rounded-lg border-2" style={{ background: 'rgba(13,148,136,0.07)', borderColor: 'rgba(13,148,136,0.3)' }}>
          <Printer size={16} style={{ color: '#0d9488' }} />
          <p className="flex-1 text-sm font-bold" style={{ color: '#0d9488' }}>
            {checkedIds.size === 0 ? 'Click items to select for printing' : `${checkedIds.size} item${checkedIds.size > 1 ? 's' : ''} selected`}
          </p>
          {checkedIds.size > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setCheckedIds(new Set())}>Clear</Button>
          )}
          <Button size="sm" variant="ghost" style={{ color: '#0d9488' }}
            onClick={() => setCheckedIds(new Set(products.map((p) => p._id)))}>
            Select All ({products.length})
          </Button>
          {checkedIds.size > 0 && (
            <Button size="sm" onClick={() => setBulkBarcodeOpen(true)}
              style={{ background: '#0d9488' }}>
              <Printer size={14} className="mr-1.5" /> Print Labels ({checkedIds.size})
            </Button>
          )}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input className="pl-9" placeholder="Search products…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <div className="flex gap-1 items-center">
              <Input
                placeholder="Scan / enter barcode…"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleBarcodeSearch(); }}
                className="w-48 font-mono text-sm"
              />
              <Button size="sm" variant="outline" onClick={() => handleBarcodeSearch()} disabled={barcodeSearching || !barcodeInput.trim()}>
                {barcodeSearching ? <Spinner size="sm" /> : <Search size={14} />}
              </Button>
            </div>
          </div>
          <div className="flex gap-3 flex-wrap items-center">
            <Select value={category} onChange={(e) => { setCategory(e.target.value); setSubCategory(''); setPage(1); }} className="w-44">
              <option value="">All Categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Select
              value={subCategory}
              onChange={(e) => { setSubCategory(e.target.value); setPage(1); }}
              className="w-44"
              disabled={!category || subCategoryOptions.length === 0}
            >
              <option value="">{category ? 'All Sub-categories' : 'Select category first'}</option>
              {subCategoryOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Select value={variant} onChange={(e) => { setVariant(e.target.value); setPage(1); }} className="w-40">
              <option value="">All Variants</option>
              {variants.map((v) => <option key={v} value={v}>{v}</option>)}
            </Select>
            <Select value={size} onChange={(e) => { setSize(e.target.value); setPage(1); }} className="w-36">
              <option value="">All Sizes</option>
              {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => { setShowInactive(e.target.checked); setPage(1); }}
                className="rounded"
              />
              Show deactivated
            </label>
            {(category || subCategory || variant || size || showInactive) && (
              <button
                onClick={() => { setCategory(''); setSubCategory(''); setVariant(''); setSize(''); setShowInactive(false); setPage(1); }}
                className="text-xs text-gray-400 hover:text-red-500 underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : products.length === 0 ? (
            <div className="text-center text-gray-400 py-16">No products found</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {barcodePrintMode && <th className="px-4 py-3 w-8" />}
                  {['Product', 'SKU', 'Category', 'Price', 'Stock', 'Web', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {products.map((p) => {
                  const isChecked = checkedIds.has(p._id);
                  const toggleChecked = () => setCheckedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(p._id)) next.delete(p._id); else next.add(p._id);
                    return next;
                  });
                  return (
                  <tr key={p._id} className="hover:bg-gray-50" onClick={barcodePrintMode ? toggleChecked : undefined} style={barcodePrintMode ? { cursor: 'pointer' } : undefined}>
                    {barcodePrintMode && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isChecked} onChange={toggleChecked} className="rounded" />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.images?.[0] ? (
                          <img src={p.images[0]} alt={p.name} className="h-9 w-9 rounded-md object-cover border" />
                        ) : (
                          <div className="h-9 w-9 rounded-md bg-gray-100 flex items-center justify-center">
                            <Image size={14} className="text-gray-400" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-gray-900">{p.name}</div>
                          <div className="text-xs text-gray-400">{p.barcode}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{p.SKU}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {p.category}
                      {p.subCategory ? <div className="text-xs text-gray-400">{p.subCategory}</div> : null}
                    </td>
                    <td className="px-4 py-3 font-medium">${p.price.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.quantity - p.reservedQty}</div>
                      <div className="text-xs text-gray-400">of {p.quantity} total</div>
                    </td>
                    <td className="px-4 py-3">
                      {p.isWebVisible !== false ? (
                        <span title="Visible on web" className="flex items-center gap-1 text-blue-600 text-xs font-medium">
                          <Globe size={13} /> Yes
                        </span>
                      ) : (
                        <span title="Hidden from web" className="flex items-center gap-1 text-gray-400 text-xs">
                          <GlobeLock size={13} /> No
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{stockBadge(p)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        {p.barcode && (
                          <button onClick={() => setBarcodeItem(p)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-teal-600" title="Print barcode label">
                            <Barcode size={15} />
                          </button>
                        )}
                        <button onClick={() => setHistoryProduct(p)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600" title="Stock history">
                          <Eye size={15} />
                        </button>
                        {allowManage && (
                          <>
                            <button onClick={() => { setEditProduct(p); setShowForm(true); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600" title="Edit">
                              <Edit size={15} />
                            </button>
                            <button onClick={() => setDeleteTarget(p)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-red-600" title="Delete">
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-gray-500">Page {page} of {pages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={14} />
              </Button>
              <Button size="sm" variant="outline" disabled={page === pages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Add/Edit Modal */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setEditProduct(null); }}
        title={editProduct ? 'Edit Product' : 'Add New Product'}
        size="lg"
      >
        <ProductForm
          product={editProduct}
          categoryCatalog={categoryCatalog}
          variants={variants}
          sizes={sizes}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditProduct(null); }}
        />
      </Modal>

      {/* Stock History Modal */}
      <Modal
        open={!!historyProduct}
        onClose={() => setHistoryProduct(null)}
        title={`Stock History — ${historyProduct?.name}`}
        size="lg"
      >
        {historyProduct && (
          <StockHistory productId={historyProduct._id} onClose={() => setHistoryProduct(null)} />
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          product={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {/* Barcode label printing */}
      {barcodeItem && (
        <BarcodeDialog item={barcodeItem} businessName={businessName} onClose={() => setBarcodeItem(null)} />
      )}
      {bulkBarcodeOpen && (
        <BulkBarcodeDialog
          items={products.filter((p) => checkedIds.has(p._id))}
          businessName={businessName}
          onClose={() => { setBulkBarcodeOpen(false); setBarcodePrintMode(false); setCheckedIds(new Set()); }}
        />
      )}
    </div>
  );
}
