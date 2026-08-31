import React, { useEffect, useMemo, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import {
  Plus, Trash2, Eye, ChevronLeft, ChevronRight, ShoppingBag,
  Printer, X, Edit2, Minus, AlertTriangle, RotateCcw, ScanLine,
} from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import CategoryFields from '../components/CategoryFields';
import ManagedSelect from '../components/ManagedSelect';
import { BulkBarcodeDialog } from '../components/BarcodeLabelPrintDialog';
import ExportMenu from '../components/ExportMenu';
import { printPurchaseHTML, exportPurchasePDF, exportPurchaseExcel, exportPurchaseImage } from '../utils/exporters';
import api from '../utils/api';
import useAutoRefresh from '../hooks/useAutoRefresh';
import useAuthStore from '../store/useAuthStore';
import { canManage } from '../config/permissions';
import { formatDateTime, toLocalDateTimeInput } from '../utils/date';

// Live SVG barcode previews are expensive (one JsBarcode render + DOM node each) —
// cap how many render at once so large purchases (100s of units) don't lock up the page.
const BARCODE_PREVIEW_LIMIT = 60;

// ─── Live barcode card ────────────────────────────────────────
function BarcodeCard({ item }) {
  const svgRef = useRef(null);
  const barcode = item._previewBarcode || item.barcode;
  useEffect(() => {
    if (!svgRef.current || !barcode) return;
    try { JsBarcode(svgRef.current, barcode, { format: 'CODE128', width: 2, height: 50, displayValue: true, fontSize: 11, margin: 6 }); }
    catch { try { JsBarcode(svgRef.current, barcode, { format: 'CODE128', width: 2, height: 50, displayValue: true, fontSize: 11, margin: 6 }); } catch {} }
  }, [barcode]);
  const price = item.price ?? item.costPrice;
  const hasDiscount = item.discountPrice != null && item.discountPrice !== '' && Number(item.discountPrice) > 0;
  return (
    <div className="border rounded-lg p-3 text-center bg-white shadow-sm w-48 shrink-0">
      <div className="text-xs font-semibold text-gray-800 truncate mb-0.5">{item.name || '—'}</div>
      {(item.color || item.size) && <div className="text-[10px] text-gray-500 mb-1">{[item.color, item.size].filter(Boolean).join(' / ')}</div>}
      {barcode ? <svg ref={svgRef} className="mx-auto" /> : <div className="h-14 flex items-center justify-center text-[10px] text-gray-300">No barcode</div>}
      <div className="mt-1 text-center">
        {hasDiscount ? (
          <>
            <div className="text-[10px] text-gray-400">MRP: <span className="line-through">₹{Number(price).toFixed(2)}</span></div>
            <div className="text-[10px] text-gray-500">Discounted Price:</div>
            <div className="text-sm font-bold text-red-600">₹{Number(item.discountPrice).toFixed(2)}</div>
          </>
        ) : (
          <>
            <div className="text-[10px] text-gray-500">MRP</div>
            <div className="text-sm font-bold">₹{price ? Number(price).toFixed(2) : '—'}</div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────
function DeleteConfirmModal({ purchase, onClose, onDeleted }) {
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { data } = await api.delete(`/purchases/${purchase._id}`);
      const deleted = data.summary?.productsDeleted?.length || 0;
      const deactivated = data.summary?.productsDeactivated?.length || 0;
      const parts = [];
      if (deleted) parts.push(`${deleted} product(s) deleted`);
      if (deactivated) parts.push(`${deactivated} already-sold product(s) deactivated`);
      toast({ message: `Purchase deleted. ${parts.join(', ') || 'No products affected.'}`, type: 'success' });
      onDeleted();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to delete purchase', type: 'error' });
      setDeleting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Delete Purchase" size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
          <AlertTriangle size={20} className="text-red-500 mt-0.5 shrink-0" />
          <div className="text-sm text-red-700">
            <p className="font-semibold mb-1">This action cannot be undone.</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li>Units never sold will be permanently deleted (Products, Barcode Management, POS)</li>
              <li>Units already sold or ordered will be deactivated instead, to keep past invoices intact</li>
              <li>Supplier balance will be adjusted</li>
              <li>Stock movement logs for this purchase will be deleted</li>
            </ul>
          </div>
        </div>
        <p className="text-sm text-gray-700">Delete purchase <span className="font-mono font-semibold">{purchase.purchaseId}</span>?</p>
        <div className="flex justify-end gap-3 pt-2 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700 text-white border-red-600"
          >
            {deleting ? <Spinner size="sm" className="mr-2" /> : <Trash2 size={14} className="mr-2" />}
            Delete Purchase
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Supplier selector with create-on-go ─────────────────────
function SupplierSelector({ value, onChange }) {
  const toast = useToast();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);

  const loadSuppliers = () => {
    api.get('/suppliers', { params: { limit: 200 } })
      .then(({ data }) => { setSuppliers(data.suppliers); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { loadSuppliers(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) { toast({ message: 'Supplier name is required', type: 'error' }); return; }
    setCreating(true);
    try {
      const { data } = await api.post('/suppliers', { name: newName.trim(), phone: newPhone.trim() });
      toast({ message: `Supplier "${data.supplier.name}" created`, type: 'success' });
      loadSuppliers();
      onChange(data.supplier._id, data.supplier.name);
      setShowCreate(false); setNewName(''); setNewPhone('');
    } catch (err) {
      if (err.response?.status === 409 && err.response.data.supplier) {
        const s = err.response.data.supplier;
        onChange(s._id, s.name);
        setShowCreate(false); setNewName('');
        toast({ message: `Using existing supplier "${s.name}"`, type: 'info' });
      } else {
        toast({ message: err.response?.data?.message || 'Failed to create supplier', type: 'error' });
      }
    } finally { setCreating(false); }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select value={value} onChange={(e) => { const s = suppliers.find((s) => s._id === e.target.value); onChange(e.target.value, s?.name || ''); }}
          className="flex-1 rounded border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" disabled={loading}>
          <option value="">— Select supplier —</option>
          {suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}{s.phone ? ` · ${s.phone}` : ''}</option>)}
        </select>
        <Button type="button" size="sm" variant="outline" onClick={() => setShowCreate((v) => !v)}>
          <Plus size={13} className="mr-1" /> New
        </Button>
      </div>
      {showCreate && (
        <div className="border rounded-lg p-3 bg-blue-50 space-y-2">
          <p className="text-xs font-medium text-blue-700">Quick-create supplier</p>
          <div className="grid grid-cols-2 gap-2">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Supplier name *" className="text-sm" />
            <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Phone (optional)" className="text-sm" />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" size="sm" variant="ghost" onClick={() => { setShowCreate(false); setNewName(''); setNewPhone(''); }}>Cancel</Button>
            <Button type="button" size="sm" onClick={handleCreate} disabled={creating}>{creating ? <Spinner size="sm" /> : 'Create & Select'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Purchase Form (New + Edit) ───────────────────────────────
// New flow: one product header → total qty → variant slot table
function PurchaseForm({ purchaseId, onClose, onSaved, onDeleted }) {
  const toast = useToast();
  const isEdit = !!purchaseId;
  const allowManage = canManage(useAuthStore.getState().user);

  const [loadingPurchase, setLoadingPurchase] = useState(isEdit);
  const [existingPurchase, setExistingPurchase] = useState(null);

  // Shared meta
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [note, setNote] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => toLocalDateTimeInput(new Date()));

  // ── NEW: product header
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState('');
  const [prodSubCategory, setProdSubCategory] = useState('');
  const [prodDescription, setProdDescription] = useState('');
  const [prodCostPrice, setProdCostPrice] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodDiscountPrice, setProdDiscountPrice] = useState('');
  const [totalQty, setTotalQty] = useState('');
  // variantRows: filled rows { color, size, qty, costPrice, price, discountPrice, barcodes: string[] }
  // slotDrafts: one draft per unassigned slot — these render as editable rows below filled rows
  const [variantRows, setVariantRows] = useState([]);
  const [slotDrafts, setSlotDrafts] = useState([]); // draft inputs for empty slots
  const [loadingRowIdx, setLoadingRowIdx] = useState(null); // which variantRow index is loading barcodes
  const [loadingDraftIdx, setLoadingDraftIdx] = useState(null); // which slotDraft index is loading

  // Managed category catalog + variant/size master lists for the pickers
  const [categoryCatalog, setCategoryCatalog] = useState([]);
  const [variantOptions, setVariantOptions] = useState([]);
  const [sizeOptions, setSizeOptions] = useState([]);
  useEffect(() => {
    api.get('/settings/category-config')
      .then(({ data }) => setCategoryCatalog(data.config?.categories || []))
      .catch(() => {});
    api.get('/settings/variant-config')
      .then(({ data }) => { setVariantOptions(data.config?.variants || []); setSizeOptions(data.config?.sizes || []); })
      .catch(() => {});
  }, []);

  // ── EDIT: per-item overrides
  const [itemOverrides, setItemOverrides] = useState({});
  const [saving, setSaving] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  // When set, the print modal opens pre-filtered to just this one barcode
  // (quick "print this label" action instead of zeroing out every other row).
  const [printOnlyBarcode, setPrintOnlyBarcode] = useState(null);
  const [showDelete, setShowDelete] = useState(false);
  const [businessName, setBusinessName] = useState('');
  useEffect(() => {
    api.get('/settings/business-config').then(({ data }) => setBusinessName(data.config?.businessName || '')).catch(() => {});
  }, []);

  // Load existing purchase
  useEffect(() => {
    if (!isEdit) return;
    api.get(`/purchases/${purchaseId}`)
      .then(({ data }) => {
        const p = data.purchase;
        setExistingPurchase(p);
        setSupplierId(p.supplierId?._id || p.supplierId || '');
        setSupplierName(p.supplier || '');
        setNote(p.note || '');
        const d = p.purchaseDate ? new Date(p.purchaseDate) : new Date(p.createdAt);
        setPurchaseDate(toLocalDateTimeInput(d));
        const overrides = {};
        p.items.forEach((item, i) => {
          overrides[i] = {
            name: item.name, category: item.category ?? '', subCategory: item.subCategory ?? '', description: item.description ?? '',
            color: item.color ?? '', size: item.size ?? '', qty: String(item.qty),
            costPrice: String(item.costPrice),
            price: item.price != null ? String(item.price) : String(item.costPrice),
            discountPrice: item.discountPrice != null ? String(item.discountPrice) : '',
          };
        });
        setItemOverrides(overrides);
        setLoadingPurchase(false);
      })
      .catch(() => { toast({ message: 'Failed to load purchase', type: 'error' }); setLoadingPurchase(false); });
  }, [purchaseId]);

  const emptyVariantRow = () => ({ color: '', size: '', qty: '', costPrice: '', price: '', discountPrice: '', barcodes: [] });

  // Clear rows when totalQty is cleared
  useEffect(() => {
    if (isEdit) return;
    const n = Number(totalQty) || 0;
    if (n === 0) { setVariantRows([]); setSlotDrafts([]); }
  }, [totalQty, isEdit]);

  const assignedQty = variantRows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const totalN = Number(totalQty) || 0;
  const emptySlots = Math.max(0, totalN - assignedQty);
  const overAssigned = assignedQty > totalN;

  // Keep slotDrafts in sync with emptySlots count (add/remove from the end)
  useEffect(() => {
    setSlotDrafts((prev) => {
      if (prev.length === emptySlots) return prev;
      if (prev.length < emptySlots) return [...prev, ...Array.from({ length: emptySlots - prev.length }, () => ({ color: '', size: '', costPrice: '', price: '', discountPrice: '' }))];
      return prev.slice(0, emptySlots);
    });
  }, [emptySlots]);

  // Hard ceiling on a single row's qty — beyond this the barcode reservation
  // call and the live SVG barcode previews make the page unresponsive.
  const MAX_ROW_QTY = 200;

  // Debounce ref so fast typing (e.g. "1000") doesn't fire one reserve-barcodes
  // call per keystroke — only the final value after a short pause is reserved.
  const qtyReserveTimers = useRef({});

  // When qty changes on a row, reserve that many barcodes from the backend.
  // Debounced (300ms) so typing doesn't fire a request per digit.
  const handleQtyChange = (idx, value) => {
    setVariantRows((prev) => prev.map((r, i) => i !== idx ? r : { ...r, qty: value, barcodes: [] }));
    const qty = Number(value) || 0;
    if (qtyReserveTimers.current[idx]) clearTimeout(qtyReserveTimers.current[idx]);
    if (qty <= 0) return;
    if (qty > MAX_ROW_QTY) {
      toast({ message: `Max ${MAX_ROW_QTY} units per row — split larger quantities into multiple rows.`, type: 'warning' });
      return;
    }
    qtyReserveTimers.current[idx] = setTimeout(async () => {
      setLoadingRowIdx(idx);
      try {
        const { data } = await api.post('/settings/reserve-barcodes', { count: qty });
        setVariantRows((prev) => prev.map((r, i) => i !== idx ? r : { ...r, barcodes: data.barcodes }));
      } catch {
        const fallback = Array.from({ length: qty }, () => String(Math.floor(100000 + Math.random() * 900000)));
        setVariantRows((prev) => prev.map((r, i) => i !== idx ? r : { ...r, barcodes: fallback }));
      } finally {
        setLoadingRowIdx((prev) => prev === idx ? null : prev);
      }
    }, 300);
  };

  const updateVariant = (idx, field, value) => {
    setVariantRows((prev) => prev.map((r, i) => i !== idx ? r : { ...r, [field]: value }));
  };

  const removeVariantRow = (idx) => setVariantRows((prev) => prev.filter((_, i) => i !== idx));

  // Clear all assigned rows — every unit goes back to being an unassigned slot
  const resetVariantAssignments = () => {
    if (variantRows.length === 0) return;
    if (!window.confirm('Clear all assigned variant rows? This removes their reserved barcodes too.')) return;
    setVariantRows([]);
  };

  const updateDraft = (draftIdx, field, value) => {
    setSlotDrafts((prev) => prev.map((d, i) => i !== draftIdx ? d : { ...d, [field]: value }));
  };

  // When a draft row gets a qty, promote it to a real variantRow and fetch barcodes
  const handleDraftQtyChange = async (draftIdx, value) => {
    const qty = Number(value) || 0;
    if (qty <= 0) return;
    if (qty > MAX_ROW_QTY) {
      toast({ message: `Max ${MAX_ROW_QTY} units per row — split larger quantities into multiple rows.`, type: 'warning' });
      return;
    }
    const draft = slotDrafts[draftIdx];
    // Capture the index before setState (React state is synchronous snapshot here)
    const newRowIdx = variantRows.length;
    const newRow = { color: draft.color || '', size: draft.size || '', qty: value, costPrice: draft.costPrice || '', price: draft.price || '', discountPrice: draft.discountPrice || '', barcodes: [] };
    setVariantRows((prev) => [...prev, newRow]);
    setSlotDrafts((prev) => prev.filter((_, i) => i !== draftIdx));
    setLoadingRowIdx(newRowIdx);
    try {
      const { data } = await api.post('/settings/reserve-barcodes', { count: qty });
      setVariantRows((prev) => prev.map((r, i) => i !== newRowIdx ? r : { ...r, barcodes: data.barcodes }));
    } catch {
      const fallback = Array.from({ length: qty }, () => String(Math.floor(100000 + Math.random() * 900000)));
      setVariantRows((prev) => prev.map((r, i) => i !== newRowIdx ? r : { ...r, barcodes: fallback }));
    } finally {
      setLoadingRowIdx((prev) => prev === newRowIdx ? null : prev);
    }
  };

  // Build one item per barcode per row for submission
  const buildItems = () => {
    const globalDiscount = prodDiscountPrice !== '' ? Number(prodDiscountPrice) : null;
    const items = [];
    variantRows.forEach((row) => {
      if (!Number(row.qty) || !row.barcodes.length) return;
      const costPrice = row.costPrice !== '' ? Number(row.costPrice) : (Number(prodCostPrice) || 0);
      const price = row.price !== '' ? Number(row.price) : (Number(prodPrice) || 0);
      const discountPrice = row.discountPrice !== '' ? Number(row.discountPrice) : globalDiscount;
      row.barcodes.forEach((barcode) => {
        items.push({ color: row.color.trim(), size: row.size.trim(), qty: 1, barcode, costPrice, price, discountPrice });
      });
    });
    return items;
  };

  const discountError = (price, dp) => {
    if (!dp && dp !== 0) return null;
    const d = Number(dp), p = Number(price);
    if (d <= 0) return null;
    if (p > 0 && d >= p) return 'Must be less than selling price';
    return null;
  };

  // Expand filled rows into individual barcode cards for preview/print.
  // Memoized — with hundreds of barcodes this is expensive to rebuild on every render.
  const printableVariants = useMemo(() => {
    const globalDiscount = prodDiscountPrice !== '' ? Number(prodDiscountPrice) : null;
    const result = [];
    variantRows.forEach((row) => {
      row.barcodes.forEach((bc) => {
        result.push({
          name: prodName, color: row.color.trim(), size: row.size.trim(),
          price: row.price !== '' ? Number(row.price) : (Number(prodPrice) || 0),
          discountPrice: row.discountPrice !== '' ? Number(row.discountPrice) : globalDiscount,
          qty: 1, _previewBarcode: bc,
        });
      });
    });
    return result;
  }, [variantRows, prodName, prodPrice, prodDiscountPrice]);

  const editPrintItems = existingPurchase
    ? existingPurchase.items.map((item, i) => ({
        ...item,
        price: itemOverrides[i]?.price ?? item.price ?? item.costPrice,
        discountPrice: itemOverrides[i]?.discountPrice ?? item.discountPrice,
        _previewBarcode: item.barcode || '', qty: item.qty,
      }))
    : [];

  const totalCost = variantRows.reduce((s, row) => {
    const cp = row.costPrice !== '' ? Number(row.costPrice) : (Number(prodCostPrice) || 0);
    return s + cp * (Number(row.qty) || 0);
  }, 0);

  const handleSubmit = async () => {
    if (isEdit) {
      setSaving(true);
      try {
        await api.put(`/purchases/${purchaseId}`, { supplierId: supplierId || undefined, supplier: supplierName, note, purchaseDate, itemOverrides });
        toast({ message: 'Purchase updated', type: 'success' });
        onSaved();
      } catch (err) {
        toast({ message: err.response?.data?.message || 'Failed to update purchase', type: 'error' });
      } finally { setSaving(false); }
      return;
    }

    if (!prodName.trim()) { toast({ message: 'Product name is required', type: 'error' }); return; }
    if (!totalQty || Number(totalQty) <= 0) { toast({ message: 'Total quantity must be > 0', type: 'error' }); return; }
    if (loadingRowIdx !== null) { toast({ message: 'Barcodes are still loading, please wait', type: 'error' }); return; }
    if (overAssigned) { toast({ message: `Assigned qty (${assignedQty}) exceeds total (${totalN})`, type: 'error' }); return; }
    if (emptySlots > 0) { toast({ message: `${emptySlots} unit(s) still unassigned`, type: 'error' }); return; }
    const rowsMissingBarcodes = variantRows.filter((r) => Number(r.qty) > 0 && r.barcodes.length !== Number(r.qty));
    if (rowsMissingBarcodes.length) { toast({ message: 'Some rows are still loading barcodes', type: 'error' }); return; }
    const dErr = discountError(prodPrice, prodDiscountPrice);
    if (dErr) { toast({ message: `Discount price: ${dErr}`, type: 'error' }); return; }
    const builtGroups = buildItems();
    if (!builtGroups.length) { toast({ message: 'No units to submit', type: 'error' }); return; }

    const items = builtGroups.map((v) => ({
      name: prodName.trim(), category: prodCategory.trim() || 'General', subCategory: prodSubCategory.trim(), description: prodDescription,
      costPrice: v.costPrice, price: v.price, discountPrice: v.discountPrice,
      color: v.color, size: v.size, qty: 1, barcode: v.barcode,
    }));

    setSaving(true);
    try {
      await api.post('/purchases', { supplierId: supplierId || undefined, supplier: supplierName, items, note, purchaseDate });
      toast({ message: 'Purchase recorded — products created / stock updated', type: 'success' });
      onSaved();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to save purchase', type: 'error' });
    } finally { setSaving(false); }
  };

  if (loadingPurchase) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;

  const dErrGlobal = discountError(prodPrice, prodDiscountPrice);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{isEdit ? `Edit Purchase — ${existingPurchase?.purchaseId}` : 'New Purchase Entry'}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {isEdit ? 'Update supplier, note, prices, or quantities.' : 'Enter product details and total quantity — then assign a variant/size to each unit.'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose}><X size={14} className="mr-1.5" /> Cancel</Button>
          {isEdit && editPrintItems.length > 0 && (
            <Button variant="outline" onClick={() => setShowPrintModal(true)}>
              <Printer size={14} className="mr-1.5" /> Print Labels
            </Button>
          )}
          {isEdit && allowManage && (
            <Button onClick={() => setShowDelete(true)} className="bg-red-50 text-red-700 border border-red-300 hover:bg-red-100">
              <Trash2 size={14} className="mr-1.5" /> Delete
            </Button>
          )}
          <Button onClick={handleSubmit} disabled={saving || (isEdit && !allowManage)}>
            {saving ? <Spinner size="sm" className="mr-2" /> : <ShoppingBag size={14} className="mr-2" />}
            {isEdit ? 'Update Purchase' : 'Save Purchase'}
          </Button>
        </div>
      </div>

      {/* Purchase meta */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Purchase Details</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Supplier</label>
              <SupplierSelector value={supplierId} onChange={(id, name) => { setSupplierId(id); setSupplierName(name); }} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Purchase Date</label>
              <Input type="datetime-local" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Note</label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* NEW MODE */}
      {!isEdit && (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Step 1 — Product Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><label className="text-xs font-medium text-gray-600 block mb-1">Product Name *</label>
                  <Input value={prodName} onChange={(e) => setProdName(e.target.value)} placeholder="e.g. Cotton T-Shirt" /></div>
                <CategoryFields
                  catalog={categoryCatalog}
                  category={prodCategory}
                  subCategory={prodSubCategory}
                  onCategoryChange={setProdCategory}
                  onSubCategoryChange={setProdSubCategory}
                  labelClass="text-xs font-medium text-gray-600 block mb-1"
                />
                <div><label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
                  <Input value={prodDescription} onChange={(e) => setProdDescription(e.target.value)} placeholder="Optional" /></div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div><label className="text-xs font-medium text-gray-600 block mb-1">Cost Price (₹)</label>
                  <Input type="number" min="0" step="0.01" value={prodCostPrice} onChange={(e) => setProdCostPrice(e.target.value)} placeholder="0.00" /></div>
                <div><label className="text-xs font-medium text-gray-600 block mb-1">MRP (₹) *</label>
                  <Input type="number" min="0" step="0.01" value={prodPrice} onChange={(e) => setProdPrice(e.target.value)} placeholder="0.00" /></div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Discount Price (₹) <span className="text-[10px] text-gray-400 font-normal">strikes original on label</span></label>
                  <Input type="number" min="0" step="0.01" value={prodDiscountPrice}
                    onChange={(e) => setProdDiscountPrice(e.target.value)} placeholder="Leave blank for none"
                    className={dErrGlobal ? 'border-red-400' : ''} />
                  {dErrGlobal && <p className="text-xs text-red-500 mt-0.5">{dErrGlobal}</p>}
                </div>
                <div><label className="text-xs font-medium text-gray-600 block mb-1">Total Quantity *</label>
                  <Input type="number" min="1" max="200" value={totalQty}
                    onChange={(e) => setTotalQty(e.target.value)} placeholder="e.g. 10" /></div>
              </div>
            </CardContent>
          </Card>

          {totalN > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Step 2 — Assign Variant &amp; Size</CardTitle>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {assignedQty} of {totalN} assigned
                      {overAssigned && <span className="ml-1 text-red-600 font-semibold">· {assignedQty - totalN} over</span>}
                      {!overAssigned && assignedQty === totalN && assignedQty > 0 && <span className="ml-1 text-green-600 font-semibold">· All assigned ✓</span>}
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={resetVariantAssignments} disabled={variantRows.length === 0}>
                    <RotateCcw size={13} className="mr-1.5" /> Reset
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left w-8">#</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left">Variant</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left">Size</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left w-20">Qty</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left w-28">
                          Cost (₹) <span className="block font-normal text-gray-400 text-[10px]">blank = default</span>
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left w-28">
                          Sell (₹) <span className="block font-normal text-gray-400 text-[10px]">blank = default</span>
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left w-28">
                          Discount (₹) <span className="block font-normal text-gray-400 text-[10px]">blank = default</span>
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left">Barcodes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {/* Filled rows */}
                      {variantRows.map((row, idx) => (
                        <tr key={idx} className="bg-white">
                          <td className="px-3 py-2 text-gray-400 text-xs">{idx + 1}</td>
                          <td className="px-3 py-2">
                            <ManagedSelect options={variantOptions} value={row.color}
                              onChange={(v) => updateVariant(idx, 'color', v)}
                              placeholder="Variant" newPlaceholder="New variant" inputClass="h-8 text-sm w-28" />
                          </td>
                          <td className="px-3 py-2">
                            <ManagedSelect options={sizeOptions} value={row.size}
                              onChange={(v) => updateVariant(idx, 'size', v)}
                              placeholder="Size" newPlaceholder="New size" inputClass="h-8 text-sm w-28" />
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" min="1" value={row.qty}
                              onChange={(e) => handleQtyChange(idx, e.target.value)}
                              placeholder="0"
                              className={`h-8 text-sm w-16 ${overAssigned ? 'border-red-400' : ''}`} />
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" min="0" step="0.01" value={row.costPrice}
                              onChange={(e) => updateVariant(idx, 'costPrice', e.target.value)}
                              placeholder={prodCostPrice || '0.00'} className="h-8 text-sm w-24" />
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" min="0" step="0.01" value={row.price}
                              onChange={(e) => updateVariant(idx, 'price', e.target.value)}
                              placeholder={prodPrice || '0.00'} className="h-8 text-sm w-24" />
                          </td>
                          <td className="px-3 py-2">
                            {(() => {
                              const dp = row.discountPrice;
                              const effectiveSell = row.price !== '' ? Number(row.price) : (Number(prodPrice) || 0);
                              const dpNum = dp !== '' ? Number(dp) : null;
                              const dpErr = dpNum != null && dpNum > 0 && effectiveSell > 0 && dpNum >= effectiveSell ? 'Must be < sell price' : null;
                              return (
                                <div>
                                  <Input type="number" min="0" step="0.01" value={row.discountPrice}
                                    onChange={(e) => updateVariant(idx, 'discountPrice', e.target.value)}
                                    placeholder={prodDiscountPrice || 'None'}
                                    className={`h-8 text-sm w-24 ${dpErr ? 'border-red-400' : ''}`} />
                                  {dpErr && <div className="text-[10px] text-red-500 mt-0.5">{dpErr}</div>}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2">
                            {loadingRowIdx === idx
                              ? <Spinner size="sm" />
                              : row.barcodes.length > 0
                                ? <div className="space-y-0.5 max-h-24 overflow-y-auto pr-1">{row.barcodes.map((bc, bi) => (
                                    <div key={bi} className="flex items-center gap-1.5 font-mono text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                      <span className="truncate">{bc}</span>
                                      <button type="button" title="Print just this label"
                                        onClick={() => { setPrintOnlyBarcode(bc); setShowPrintModal(true); }}
                                        className="ml-auto text-blue-400 hover:text-blue-700 shrink-0">
                                        <Printer size={12} />
                                      </button>
                                    </div>
                                  ))}</div>
                                : <span className="text-xs text-gray-300">enter qty</span>
                            }
                          </td>
                        </tr>
                      ))}
                      {/* Empty slot rows — real editable rows for unassigned units */}
                      {slotDrafts.map((draft, di) => (
                        <tr key={`draft-${di}`} className="bg-gray-50/40">
                          <td className="px-3 py-2 text-gray-400 text-xs">{variantRows.length + di + 1}</td>
                          <td className="px-3 py-2">
                            <ManagedSelect options={variantOptions} value={draft.color}
                              onChange={(v) => updateDraft(di, 'color', v)}
                              placeholder="Variant" newPlaceholder="New variant" inputClass="h-8 text-sm w-28" />
                          </td>
                          <td className="px-3 py-2">
                            <ManagedSelect options={sizeOptions} value={draft.size}
                              onChange={(v) => updateDraft(di, 'size', v)}
                              placeholder="Size" newPlaceholder="New size" inputClass="h-8 text-sm w-28" />
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" min="1" value={draft.qty || ''}
                              onChange={(e) => handleDraftQtyChange(di, e.target.value)}
                              placeholder="Qty"
                              className="h-8 text-sm w-16" />
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" min="0" step="0.01" value={draft.costPrice}
                              onChange={(e) => updateDraft(di, 'costPrice', e.target.value)}
                              placeholder={prodCostPrice || '0.00'} className="h-8 text-sm w-24" />
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" min="0" step="0.01" value={draft.price}
                              onChange={(e) => updateDraft(di, 'price', e.target.value)}
                              placeholder={prodPrice || '0.00'} className="h-8 text-sm w-24" />
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" min="0" step="0.01" value={draft.discountPrice}
                              onChange={(e) => updateDraft(di, 'discountPrice', e.target.value)}
                              placeholder={prodDiscountPrice || 'None'} className="h-8 text-sm w-24" />
                          </td>
                          <td className="px-3 py-2">
                            {loadingDraftIdx === di
                              ? <Spinner size="sm" />
                              : <span className="text-xs text-gray-300">enter qty</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t">
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-gray-600">
                          {assignedQty} of {totalN} units assigned
                        </td>
                        <td className="px-3 py-2 text-xs font-bold text-gray-800">{assignedQty}</td>
                        <td className="px-3 py-2 text-xs font-bold text-gray-800">₹{totalCost.toFixed(2)}</td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Each unit gets its own unique barcode. Leave Cost/Sell Price blank to use defaults from Step 1.
                </p>
              </CardContent>
            </Card>
          )}

          {printableVariants.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Barcode Previews — {printableVariants.length} barcode{printableVariants.length !== 1 ? 's' : ''}</CardTitle>
                  <Button size="sm" disabled title="Save the purchase first to print labels"><Printer size={13} className="mr-1.5" /> Print Labels</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  {printableVariants.slice(0, BARCODE_PREVIEW_LIMIT).map((v, i) => <BarcodeCard key={i} item={v} />)}
                </div>
                {printableVariants.length > BARCODE_PREVIEW_LIMIT && (
                  <p className="text-xs text-gray-400 mt-3">
                    Showing the first {BARCODE_PREVIEW_LIMIT} of {printableVariants.length} barcodes.
                  </p>
                )}
                <p className="text-xs text-amber-600 mt-3">Save the purchase to enable label printing.</p>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between bg-white border rounded-lg px-5 py-3">
            <span className="text-sm text-gray-600">Total Cost</span>
            <span className="text-lg font-bold text-blue-700">₹{totalCost.toFixed(2)}</span>
          </div>
        </>
      )}

      {/* EDIT MODE — same Step 1 + Step 2 table structure as create */}
      {isEdit && existingPurchase && (
        <>
          {(() => {
            // Group items by product name — each product gets Step 1 + Step 2
            const nameGroups = [];
            const nameMap = {};
            existingPurchase.items.forEach((item, i) => {
              const key = item.name;
              if (!nameMap[key]) { nameMap[key] = { name: item.name, indices: [] }; nameGroups.push(nameMap[key]); }
              nameMap[key].indices.push(i);
            });

            return nameGroups.map((grp) => {
              const firstIdx = grp.indices[0];
              const firstOv = itemOverrides[firstIdx] || {};
              const firstItem = existingPurchase.items[firstIdx];
              const name = firstOv.name ?? firstItem.name;
              const category = firstOv.category ?? firstItem.category ?? '';
              const subCategory = firstOv.subCategory ?? firstItem.subCategory ?? '';
              const description = firstOv.description ?? firstItem.description ?? '';
              const setAllField = (field, val) =>
                grp.indices.forEach((i) => setItemOverrides((prev) => ({ ...prev, [i]: { ...prev[i], [field]: val } })));
              const soldCount = grp.indices.filter((i) => existingPurchase.items[i].isSold).length;
              const unsoldCount = grp.indices.length - soldCount;

              return (
                <React.Fragment key={grp.name}>
                  {/* Step 1 */}
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Step 1 — Product Details</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div><label className="text-xs font-medium text-gray-600 block mb-1">Product Name *</label>
                          <Input value={name} onChange={(e) => setAllField('name', e.target.value)} /></div>
                        <CategoryFields
                          catalog={categoryCatalog} category={category} subCategory={subCategory}
                          onCategoryChange={(v) => setAllField('category', v)}
                          onSubCategoryChange={(v) => setAllField('subCategory', v)}
                          labelClass="text-xs font-medium text-gray-600 block mb-1"
                        />
                        <div><label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
                          <Input value={description} onChange={(e) => setAllField('description', e.target.value)} /></div>
                      </div>
                      <div className="flex gap-4 text-xs text-gray-500">
                        <span>Total units: <strong className="text-gray-700">{grp.indices.length}</strong></span>
                        {soldCount > 0 && <span className="text-red-500">Sold (locked): <strong>{soldCount}</strong></span>}
                        {unsoldCount > 0 && <span className="text-green-600">In stock (editable): <strong>{unsoldCount}</strong></span>}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Step 2 — one row per barcode/item */}
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Step 2 — Variants &amp; Barcodes</CardTitle></CardHeader>
                    <CardContent className="pt-0">
                      <div className="border rounded-lg overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left w-8">#</th>
                              <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left">Barcode</th>
                              <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left">Variant</th>
                              <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left">Size</th>
                              <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left w-28">Cost (₹)</th>
                              <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left w-28">Sell (₹)</th>
                              <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left w-28">Discount (₹)</th>
                              <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left w-20">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {grp.indices.map((i, rowNum) => {
                              const item = existingPurchase.items[i];
                              const ov = itemOverrides[i] || {};
                              const sold = item.isSold;
                              const color = ov.color ?? item.color ?? '';
                              const size = ov.size ?? item.size ?? '';
                              const costPrice = ov.costPrice ?? String(item.costPrice);
                              const price = ov.price ?? (item.price != null ? String(item.price) : String(item.costPrice));
                              const dp = ov.discountPrice ?? (item.discountPrice != null ? String(item.discountPrice) : '');
                              const dErr = !sold ? discountError(price, dp) : null;
                              const setOv = (f, v) => setItemOverrides((prev) => ({ ...prev, [i]: { ...prev[i], [f]: v } }));
                              return (
                                <tr key={i} className={sold ? 'bg-red-50/40' : 'bg-white'}>
                                  <td className="px-3 py-2 text-gray-400 text-xs">{rowNum + 1}</td>
                                  <td className="px-3 py-2">
                                    {item.barcode
                                      ? <span className="inline-flex items-center gap-1.5 font-mono text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                          {item.barcode}
                                          <button type="button" title="Print just this label"
                                            onClick={() => { setPrintOnlyBarcode(item.barcode); setShowPrintModal(true); }}
                                            className="text-blue-400 hover:text-blue-700">
                                            <Printer size={12} />
                                          </button>
                                        </span>
                                      : <span className="text-xs text-gray-300">—</span>}
                                  </td>
                                  <td className="px-3 py-2">
                                    {sold
                                      ? <span className="text-xs text-gray-500">{color || '—'}</span>
                                      : <ManagedSelect options={variantOptions} value={color}
                                          onChange={(v) => setOv('color', v)}
                                          placeholder="Variant" newPlaceholder="New variant" inputClass="h-8 text-sm w-28" />}
                                  </td>
                                  <td className="px-3 py-2">
                                    {sold
                                      ? <span className="text-xs text-gray-500">{size || '—'}</span>
                                      : <ManagedSelect options={sizeOptions} value={size}
                                          onChange={(v) => setOv('size', v)}
                                          placeholder="Size" newPlaceholder="New size" inputClass="h-8 text-sm w-28" />}
                                  </td>
                                  <td className="px-3 py-2">
                                    {sold
                                      ? <span className="text-xs text-gray-500">₹{Number(costPrice).toFixed(2)}</span>
                                      : <Input type="number" min="0" step="0.01" value={costPrice}
                                          onChange={(e) => setOv('costPrice', e.target.value)} className="h-8 text-sm w-24" />}
                                  </td>
                                  <td className="px-3 py-2">
                                    {sold
                                      ? <span className="text-xs text-gray-500">₹{Number(price).toFixed(2)}</span>
                                      : <Input type="number" min="0" step="0.01" value={price}
                                          onChange={(e) => setOv('price', e.target.value)} className="h-8 text-sm w-24" />}
                                  </td>
                                  <td className="px-3 py-2">
                                    {sold
                                      ? <span className="text-xs text-gray-500">{dp ? `₹${Number(dp).toFixed(2)}` : '—'}</span>
                                      : <div>
                                          <Input type="number" min="0" step="0.01" value={dp}
                                            onChange={(e) => setOv('discountPrice', e.target.value)}
                                            placeholder="None" className={`h-8 text-sm w-24 ${dErr ? 'border-red-400' : ''}`} />
                                          {dErr && <div className="text-[10px] text-red-500 mt-0.5">{dErr}</div>}
                                        </div>}
                                  </td>
                                  <td className="px-3 py-2">
                                    {sold
                                      ? <span className="text-xs font-medium text-red-500">Sold</span>
                                      : <span className="text-xs font-medium text-green-600">In stock</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="bg-gray-50 border-t">
                            <tr>
                              <td colSpan={8} className="px-3 py-2 text-xs text-gray-500">
                                {grp.indices.length} units · {soldCount} sold · {unsoldCount} in stock
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Barcode previews (capped — see BARCODE_PREVIEW_LIMIT) */}
                  {grp.indices.some((i) => existingPurchase.items[i].barcode) && (
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm">Barcode Previews</CardTitle>
                          <Button size="sm" variant="outline" onClick={() => setShowPrintModal(true)}><Printer size={13} className="mr-1.5" /> Print Labels</Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-4">
                          {grp.indices.slice(0, BARCODE_PREVIEW_LIMIT).map((i) => {
                            const ov = itemOverrides[i] || {};
                            const item = existingPurchase.items[i];
                            return item.barcode ? (
                              <BarcodeCard key={i} item={{
                                ...item,
                                name: ov.name ?? item.name,
                                color: ov.color ?? item.color ?? '',
                                size: ov.size ?? item.size ?? '',
                                price: ov.price ?? (item.price != null ? String(item.price) : String(item.costPrice)),
                                discountPrice: ov.discountPrice ?? (item.discountPrice != null ? String(item.discountPrice) : ''),
                                _previewBarcode: item.barcode,
                              }} />
                            ) : null;
                          })}
                        </div>
                        {grp.indices.length > BARCODE_PREVIEW_LIMIT && (
                          <p className="text-xs text-gray-400 mt-3">
                            Showing the first {BARCODE_PREVIEW_LIMIT} of {grp.indices.length} barcodes. Use "Print Labels" to print any or all of them.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </React.Fragment>
              );
            });
          })()}
        </>
      )}

      {showPrintModal && (
        <BulkBarcodeDialog
          items={(isEdit ? editPrintItems : printableVariants)
            .map((it, i) => {
              const code = it._previewBarcode || it.barcode || '';
              return {
                id: code || `item-${i}`,
                name: it.name, barcode: code,
                price: it.price ?? it.costPrice, discountPrice: it.discountPrice,
                color: it.color, size: it.size, SKU: it.SKU,
              };
            })
            .filter((it) => !printOnlyBarcode || it.barcode === printOnlyBarcode)}
          businessName={businessName}
          onClose={() => { setShowPrintModal(false); setPrintOnlyBarcode(null); }}
        />
      )}
      {showDelete && existingPurchase && (
        <DeleteConfirmModal purchase={existingPurchase} onClose={() => setShowDelete(false)}
          onDeleted={() => { setShowDelete(false); onDeleted?.(); }} />
      )}
    </div>
  );
}


// ─── Inline Purchase Return Form ─────────────────────────────
function InlinePurchaseReturnForm({ purchase, item, onDone, onCancel }) {
  const toast = useToast();
  const [returnQty, setReturnQty] = useState(1);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const refundAmount = item.costPrice * returnQty;

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await api.post('/purchase-returns', {
        purchaseId: purchase._id,
        items: [{ productId: item.productId, qty: returnQty, costPrice: item.costPrice }],
        reason, note,
      });
      toast({ message: `Return processed. Refund: ₹${refundAmount.toFixed(2)}`, type: 'success' });
      onDone();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to process return', type: 'error' });
    } finally { setSaving(false); }
  };

  return (
    <div className="mt-2 p-3 bg-orange-50 border border-orange-200 rounded-lg space-y-3">
      <p className="text-xs font-semibold text-orange-800">Return to Supplier — {item.name} {[item.color, item.size].filter(Boolean).join(' / ')}</p>
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <p className="text-xs text-gray-500 mb-1">Qty to return (max {item.qty})</p>
          <div className="flex items-center gap-1">
            <button onClick={() => setReturnQty((q) => Math.max(1, q - 1))}
              className="h-7 w-7 rounded border flex items-center justify-center hover:bg-white bg-white"><Minus size={12} /></button>
            <input type="number" min="1" max={item.qty} value={returnQty}
              onChange={(e) => setReturnQty(Math.min(item.qty, Math.max(1, Number(e.target.value) || 1)))}
              className="w-12 text-center border rounded px-1 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
            <button onClick={() => setReturnQty((q) => Math.min(item.qty, q + 1))}
              className="h-7 w-7 rounded border flex items-center justify-center hover:bg-white bg-white"><Plus size={12} /></button>
          </div>
        </div>
        <div className="flex-1 min-w-32">
          <p className="text-xs text-gray-500 mb-1">Reason</p>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Damaged, wrong item…" className="text-sm h-8" />
        </div>
        <div className="flex-1 min-w-32">
          <p className="text-xs text-gray-500 mb-1">Note</p>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className="text-sm h-8" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-orange-800">Refund from supplier: ₹{refundAmount.toFixed(2)}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={saving}>
            {saving ? <Spinner size="sm" className="mr-1" /> : <RotateCcw size={13} className="mr-1" />}
            Confirm Return
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Purchase Detail Modal ────────────────────────────────────
function PurchaseDetailModal({ purchaseId, onClose }) {
  const [purchase, setPurchase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeReturnIdx, setActiveReturnIdx] = useState(null);
  const [business, setBusiness] = useState(null);
  const [billConfig, setBillConfig] = useState(null);

  const load = () => {
    setLoading(true);
    api.get(`/purchases/${purchaseId}`)
      .then(({ data }) => { setPurchase(data.purchase); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, [purchaseId]);
  useEffect(() => {
    api.get('/settings/business-config').then(({ data }) => setBusiness(data.config)).catch(() => {});
    api.get('/settings/bill-print-config').then(({ data }) => setBillConfig(data.config)).catch(() => {});
  }, []);

  return (
    <Modal open onClose={onClose} title="Purchase Detail" size="xl">
      {loading ? <div className="flex justify-center py-8"><Spinner /></div> : !purchase ? (
        <div className="text-center text-gray-400">Not found</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500">Purchase ID:</span> <span className="font-mono font-medium">{purchase.purchaseId}</span></div>
            <div><span className="text-gray-500">Date:</span> {formatDateTime(purchase.purchaseDate || purchase.createdAt)}</div>
            <div><span className="text-gray-500">Supplier:</span> {purchase.supplierId?.name || purchase.supplier || '—'}</div>
            <div><span className="text-gray-500">Recorded by:</span> {purchase.purchasedBy?.name || '—'}</div>
            {purchase.note && <div className="col-span-2"><span className="text-gray-500">Note:</span> {purchase.note}</div>}
          </div>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Product</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Category</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Variant</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Size</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Qty</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Cost/Unit</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Sell Price</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Discount</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Subtotal</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {purchase.items.map((item, i) => (
                  <React.Fragment key={i}>
                    <tr className={`border-t ${activeReturnIdx === i ? 'bg-orange-50/30' : 'hover:bg-gray-50'}`}>
                      <td className="px-3 py-2.5 font-medium">{item.name}</td>
                      <td className="px-3 py-2.5 text-gray-500">
                        {item.category || '—'}
                        {item.subCategory ? <div className="text-xs text-gray-400">{item.subCategory}</div> : null}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500">{item.color || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-500">{item.size || '—'}</td>
                      <td className="px-3 py-2.5">{item.qty}</td>
                      <td className="px-3 py-2.5">₹{item.costPrice.toFixed(2)}</td>
                      <td className="px-3 py-2.5">{item.price != null ? `₹${item.price.toFixed(2)}` : '—'}</td>
                      <td className="px-3 py-2.5">{item.discountPrice != null ? <span className="text-red-600 font-semibold">₹{item.discountPrice.toFixed(2)}</span> : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2.5 font-medium">₹{(item.costPrice * item.qty).toFixed(2)}</td>
                      <td className="px-3 py-2.5">
                        {activeReturnIdx === i ? (
                          <button onClick={() => setActiveReturnIdx(null)}
                            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                            <X size={12} /> Cancel
                          </button>
                        ) : (
                          <button
                            onClick={() => setActiveReturnIdx(i)}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-orange-300 text-orange-700 hover:bg-orange-50 transition-colors"
                          >
                            <RotateCcw size={11} /> Return
                          </button>
                        )}
                      </td>
                    </tr>
                    {activeReturnIdx === i && (
                      <tr className="border-t bg-orange-50/20">
                        <td colSpan={10} className="px-3 pb-3">
                          <InlinePurchaseReturnForm
                            purchase={purchase}
                            item={item}
                            onDone={() => { setActiveReturnIdx(null); load(); }}
                            onCancel={() => setActiveReturnIdx(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center pt-2 border-t font-bold">
            <span>Total Cost</span><span>₹{purchase.totalCost.toFixed(2)}</span>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => printPurchaseHTML(purchase, business, billConfig)}>
              <Printer size={13} className="mr-1.5" /> Print Bill
            </Button>
            <ExportMenu
              label="Export Bill"
              size="default"
              onExport={(kind) => {
                if (kind === 'pdf') return exportPurchasePDF(purchase, business, billConfig);
                if (kind === 'excel') return exportPurchaseExcel(purchase, business);
                return exportPurchaseImage(purchase, business, billConfig);
              }}
            />
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Purchase Returns list ────────────────────────────────────
function PurchaseReturnsList() {
  const [returns, setReturns] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/purchase-returns', { params: { page, limit: 20 } })
      .then(({ data }) => { setReturns(data.returns); setTotal(data.total); setPages(data.pages); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{total} purchase return(s)</p>
        <p className="text-xs text-gray-400">Open a purchase from <strong>All Purchases</strong> → click <strong>Return</strong> on any item</p>
      </div>
      <Card>
        <div className="overflow-x-auto">
          {loading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          : returns.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <RotateCcw size={32} className="mx-auto mb-2 opacity-20" />
              <p>No purchase returns yet</p>
              <p className="text-xs mt-1">Open a purchase and click <strong>Return</strong> on an item to send it back to the supplier.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>{['Return ID','Date','Original Purchase','Supplier','Items','Refund','Staff'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y">
                {returns.map((r) => (
                  <tr key={r._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{r.returnId}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDateTime(r.createdAt)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-blue-600">{r.originalPurchaseRef}</td>
                    <td className="px-4 py-3 text-gray-600">{r.supplier || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.items.length} item(s)</td>
                    <td className="px-4 py-3 font-semibold text-green-700">₹{r.totalRefund.toFixed(2)}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{r.processedBy?.name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-gray-500">Page {page} of {pages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></Button>
              <Button size="sm" variant="outline" disabled={page === pages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Purchase list page ───────────────────────────────────────
export default function Purchase() {
  const allowManage = canManage(useAuthStore.getState().user);
  const [tab, setTab] = useState('purchases');
  const [purchases, setPurchases] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [formMode, setFormMode] = useState(null); // null | 'new' | purchaseId string
  const [detailId, setDetailId] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [exporting, setExporting] = useState(false);
  const [business, setBusiness] = useState(null);
  const [billConfig, setBillConfig] = useState(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeSearching, setBarcodeSearching] = useState(false);

  // Scan & Delete Units — a scan queue of individual purchase units (by barcode)
  // to remove, independent of opening a purchase for edit. Never-sold units are
  // hard-deleted; sold units are deactivated (same rule as whole-purchase delete).
  const [showScanDelete, setShowScanDelete] = useState(false);
  const [scanDeleteInput, setScanDeleteInput] = useState('');
  const [scanDeleteLooking, setScanDeleteLooking] = useState(false);
  const [scanDeleteQueue, setScanDeleteQueue] = useState([]); // { barcode, purchaseNumber, productName, isSold }
  const [scanDeleteSubmitting, setScanDeleteSubmitting] = useState(false);

  const exportToast = useToast();

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/purchases', {
        params: { startDate: startDate || undefined, endDate: endDate || undefined, supplier: supplierFilter || undefined, page, limit: 20 },
      });
      setPurchases(data.purchases); setTotal(data.total); setPages(data.pages);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchPurchases(); }, [startDate, endDate, supplierFilter, page]);

  useEffect(() => {
    api.get('/settings/business-config').then(({ data }) => setBusiness(data.config)).catch(() => {});
    api.get('/settings/bill-print-config').then(({ data }) => setBillConfig(data.config)).catch(() => {});
  }, []);

  useEffect(() => { setSelected(new Set()); }, [startDate, endDate, supplierFilter, page, tab]);

  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allOnPageSelected = purchases.length > 0 && purchases.every((p) => selected.has(p._id));
  const toggleAll = () => setSelected((prev) => (purchases.every((p) => prev.has(p._id)) ? new Set() : new Set(purchases.map((p) => p._id))));

  const handleBulkExport = async (kind) => {
    const ids = purchases.filter((p) => selected.has(p._id)).map((p) => p._id);
    if (!ids.length) return;
    setExporting(true);
    try {
      const full = await Promise.all(ids.map((id) => api.get(`/purchases/${id}`).then(({ data }) => data.purchase)));
      const { exportPurchasesBulk } = await import('../utils/exporters');
      await exportPurchasesBulk(full, business, billConfig, kind);
      exportToast({ message: `Exported ${full.length} purchase(s)`, type: 'success' });
    } catch (err) {
      exportToast({ message: err?.message || 'Bulk export failed', type: 'error' });
    } finally {
      setExporting(false);
    }
  };

  // Auto-refresh the purchase list (skip while creating/editing a purchase or viewing detail)
  const purBusy = !!(formMode || detailId) || tab !== 'purchases';
  useAutoRefresh(() => { if (!purBusy) fetchPurchases(); }, 30000, [startDate, endDate, supplierFilter, page, purBusy]);

  const handleSaved = () => { setFormMode(null); fetchPurchases(); };
  const handleDeleted = () => { setFormMode(null); fetchPurchases(); };

  const handleBarcodeSearch = async (code) => {
    const trimmed = (code || barcodeInput).trim();
    if (!trimmed) return;
    setBarcodeSearching(true);
    try {
      const { data } = await api.get('/purchases/find-by-barcode', { params: { barcode: trimmed } });
      setFormMode(data.purchase._id);
      setBarcodeInput('');
    } catch (err) {
      exportToast({ message: err.response?.data?.message || `No purchase found with barcode ${trimmed}`, type: 'error' });
    } finally { setBarcodeSearching(false); }
  };

  const handleScanDeleteAdd = async (code) => {
    const trimmed = (code || scanDeleteInput).trim();
    if (!trimmed) return;
    if (scanDeleteQueue.some((q) => q.barcode === trimmed)) {
      exportToast({ message: `${trimmed} is already in the queue`, type: 'warning' });
      setScanDeleteInput('');
      return;
    }
    setScanDeleteLooking(true);
    try {
      const { data } = await api.get('/purchases/unit-by-barcode', { params: { barcode: trimmed } });
      setScanDeleteQueue((q) => [...q, data]);
      setScanDeleteInput('');
    } catch (err) {
      exportToast({ message: err.response?.data?.message || `No purchase unit found with barcode ${trimmed}`, type: 'error' });
    } finally {
      setScanDeleteLooking(false);
    }
  };

  const handleScanDeleteRemove = (barcode) => setScanDeleteQueue((q) => q.filter((item) => item.barcode !== barcode));

  const handleScanDeleteSubmit = async () => {
    if (!scanDeleteQueue.length) return;
    if (!confirm(`Delete ${scanDeleteQueue.length} scanned unit(s)? Never-sold units are removed permanently; sold units are deactivated (kept for invoice records).`)) return;
    setScanDeleteSubmitting(true);
    try {
      const { data } = await api.post('/purchases/delete-units', { barcodes: scanDeleteQueue.map((q) => q.barcode) });
      const { deleted, deactivated, notFound } = data.summary;
      exportToast({
        message: `${deleted.length} deleted, ${deactivated.length} deactivated${notFound.length ? `, ${notFound.length} not found` : ''}`,
        type: 'success',
      });
      setScanDeleteQueue([]);
      fetchPurchases();
    } catch (err) {
      exportToast({ message: err.response?.data?.message || 'Failed to delete scanned units', type: 'error' });
    } finally {
      setScanDeleteSubmitting(false);
    }
  };

  const totalValue = purchases.reduce((sum, p) => sum + p.totalCost, 0);

  if (formMode) {
    return (
      <PurchaseForm
        purchaseId={formMode === 'new' ? null : formMode}
        onClose={() => setFormMode(null)}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchases</h1>
          <p className="text-gray-500 text-sm mt-1">{tab === 'purchases' ? `${total} purchase records` : 'Purchase returns'}</p>
        </div>
        {tab === 'purchases' && (
          <div className="flex items-center gap-2">
            {allowManage && (
              <Button variant="outline" onClick={() => setShowScanDelete((v) => !v)}>
                <ScanLine size={16} className="mr-2" /> Scan &amp; Delete Units
              </Button>
            )}
            <Button onClick={() => setFormMode('new')}><Plus size={16} className="mr-2" /> Record Purchase</Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {[{ id: 'purchases', label: 'All Purchases' }, { id: 'returns', label: 'Purchase Returns' }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'returns' && <PurchaseReturnsList />}

      {tab === 'purchases' && showScanDelete && (
        <Card className="border-red-200 bg-red-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-red-800">
              <ScanLine size={16} /> Scan &amp; Delete Units
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              Scan barcodes to queue individual purchase units for deletion. Never-sold units are removed permanently;
              already-sold units are deactivated (kept for invoice records) — same rule as deleting a whole purchase.
            </p>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="flex gap-2">
              <Input
                autoFocus
                placeholder="Scan / enter barcode…"
                value={scanDeleteInput}
                onChange={(e) => setScanDeleteInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleScanDeleteAdd(); }}
                className="font-mono text-sm flex-1"
              />
              <Button size="sm" variant="outline" onClick={() => handleScanDeleteAdd()} disabled={scanDeleteLooking || !scanDeleteInput.trim()}>
                {scanDeleteLooking ? <Spinner size="sm" /> : <Plus size={14} />}
              </Button>
            </div>

            {scanDeleteQueue.length > 0 && (
              <div className="border rounded-lg overflow-hidden bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Barcode</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Product</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Purchase</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Status</th>
                      <th className="px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {scanDeleteQueue.map((q) => (
                      <tr key={q.barcode}>
                        <td className="px-3 py-2 font-mono text-xs">{q.barcode}</td>
                        <td className="px-3 py-2">{q.productName}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{q.purchaseNumber}</td>
                        <td className="px-3 py-2">
                          {q.isSold
                            ? <span className="text-xs font-medium text-amber-600">Sold — will deactivate</span>
                            : <span className="text-xs font-medium text-red-600">Will delete</span>}
                        </td>
                        <td className="px-3 py-2">
                          <button onClick={() => handleScanDeleteRemove(q.barcode)} className="text-gray-400 hover:text-red-500">
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{scanDeleteQueue.length} unit{scanDeleteQueue.length !== 1 ? 's' : ''} queued</span>
              <div className="flex gap-2">
                {scanDeleteQueue.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setScanDeleteQueue([])}>Clear queue</Button>
                )}
                <Button
                  size="sm"
                  onClick={handleScanDeleteSubmit}
                  disabled={scanDeleteSubmitting || scanDeleteQueue.length === 0}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {scanDeleteSubmitting ? <Spinner size="sm" className="mr-1.5" /> : <Trash2 size={14} className="mr-1.5" />}
                  Delete {scanDeleteQueue.length || ''} Scanned Unit{scanDeleteQueue.length !== 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'purchases' && purchases.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardContent className="pt-5"><p className="text-sm text-gray-500">Purchases shown</p><p className="text-2xl font-bold mt-1">{total}</p></CardContent></Card>
          <Card><CardContent className="pt-5"><p className="text-sm text-gray-500">Total cost (this page)</p><p className="text-2xl font-bold mt-1">₹{totalValue.toFixed(2)}</p></CardContent></Card>
          <Card><CardContent className="pt-5"><p className="text-sm text-gray-500">Total items (this page)</p><p className="text-2xl font-bold mt-1">{purchases.reduce((s, p) => s + p.items.length, 0)}</p></CardContent></Card>
        </div>
      )}
      {tab === 'purchases' && (
        <>
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Input placeholder="Search supplier…" value={supplierFilter} onChange={(e) => { setSupplierFilter(e.target.value); setPage(1); }} className="w-48" />
            <div className="flex items-center gap-2">
              <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className="w-40" />
              <span className="text-gray-400 text-sm">to</span>
              <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className="w-40" />
            </div>
            {(supplierFilter || startDate || endDate) && (
              <Button variant="ghost" size="sm" onClick={() => { setSupplierFilter(''); setStartDate(''); setEndDate(''); setPage(1); }}>Clear filters</Button>
            )}
            <div className="flex gap-1 items-center ml-auto">
              <Input
                placeholder="Scan / enter barcode…"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleBarcodeSearch(); }}
                className="w-48 font-mono text-sm"
              />
              <Button size="sm" variant="outline" onClick={() => handleBarcodeSearch()} disabled={barcodeSearching || !barcodeInput.trim()}>
                {barcodeSearching ? <Spinner size="sm" /> : <ChevronRight size={14} />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selection / bulk-export toolbar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border border-blue-200 bg-blue-50">
          <span className="text-sm text-blue-800 font-medium">
            {selected.size} purchase{selected.size !== 1 ? 's' : ''} selected
            {exporting && <Spinner size="sm" className="ml-2 inline-block align-middle" />}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
            <ExportMenu label="Export Selected" onExport={handleBulkExport} />
          </div>
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : purchases.length === 0 ? (
            <div className="text-center text-gray-400 py-16">
              <ShoppingBag size={40} className="mx-auto mb-3 opacity-30" />
              <p>No purchase records found</p>
              <Button className="mt-4" onClick={() => setFormMode('new')}><Plus size={14} className="mr-2" /> Record your first purchase</Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 w-8">
                    <input type="checkbox" className="rounded" checked={allOnPageSelected} onChange={toggleAll} title="Select all on this page" />
                  </th>
                  {['Purchase ID','Date','Supplier','Items','Total Cost','Recorded By','Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {purchases.map((p) => (
                  <tr key={p._id} className={`hover:bg-gray-50 ${selected.has(p._id) ? 'bg-blue-50/50' : ''}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" className="rounded" checked={selected.has(p._id)} onChange={() => toggleOne(p._id)} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{p.purchaseId}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDateTime(p.purchaseDate || p.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-700">{p.supplierId?.name || p.supplier || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-gray-600">{p.items.length} item(s)</td>
                    <td className="px-4 py-3 font-semibold text-green-700">₹{p.totalCost.toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{p.purchasedBy?.name || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setDetailId(p._id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600" title="View"><Eye size={15} /></button>
                        {allowManage && (
                          <button onClick={() => setFormMode(p._id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600" title="Edit"><Edit2 size={15} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-gray-500">Page {page} of {pages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></Button>
              <Button size="sm" variant="outline" disabled={page === pages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></Button>
            </div>
          </div>
        )}
      </Card>
        </>
      )}

      {detailId && <PurchaseDetailModal purchaseId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
