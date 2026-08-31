import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Plus, Minus, History, Search, Package, Layers, IndianRupee } from 'lucide-react';
import useProductStore from '../store/useProductStore';
import useAuthStore from '../store/useAuthStore';
import { canViewCostPrice } from '../config/permissions';
import { useToast } from '../components/ui/Toast';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import api from '../utils/api';
import useAutoRefresh from '../hooks/useAutoRefresh';
import { formatDateTime } from '../utils/date';

function RestockForm({ product, onDone, onClose }) {
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!qty || Number(qty) <= 0) { toast({ message: 'Enter a valid quantity', type: 'warning' }); return; }
    setSaving(true);
    try {
      await api.post('/inventory/restock', { productId: product._id, quantity: Number(qty), note });
      toast({ message: `Restocked ${qty} units of ${product.name}`, type: 'success' });
      onDone();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-3 bg-blue-50 rounded-lg text-sm">
        <strong>{product.name}</strong>
        <div className="text-gray-500">Current stock: {product.quantity} | Available: {product.quantity - product.reservedQty}</div>
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">Quantity to Add *</label>
        <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 50" required />
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">Supplier Note</label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. New delivery from Supplier X" />
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="success" disabled={saving}>
          {saving ? <Spinner size="sm" className="mr-2" /> : <Plus size={14} className="mr-2" />}
          Restock
        </Button>
      </div>
    </form>
  );
}

function AdjustForm({ product, onDone, onClose }) {
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('damage');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const delta = reason === 'add' ? Math.abs(Number(qty)) : -Math.abs(Number(qty));
    setSaving(true);
    try {
      await api.post('/inventory/adjust', { productId: product._id, quantity: delta, note: note || reason });
      toast({ message: `Adjustment applied to ${product.name}`, type: 'success' });
      onDone();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-3 bg-yellow-50 rounded-lg text-sm">
        <strong>{product.name}</strong>
        <div className="text-gray-500">Current stock: {product.quantity}</div>
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">Reason</label>
        <Select value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="damage">Damage / Loss</option>
          <option value="audit">Audit Correction (reduce)</option>
          <option value="return">Return to Inventory</option>
          <option value="add">Manual Add</option>
        </Select>
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">Quantity *</label>
        <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 5" required />
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">Note</label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Additional details…" />
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="warning" disabled={saving}>
          {saving ? <Spinner size="sm" className="mr-2" /> : null}
          Apply Adjustment
        </Button>
      </div>
    </form>
  );
}

export default function Inventory() {
  const toast = useToast();
  const { products, fetchProducts, loading } = useProductStore();
  const { user } = useAuthStore();
  const showCost = canViewCostPrice(user);
  const [movements, setMovements] = useState([]);
  const [movLoading, setMovLoading] = useState(false);
  const [tab, setTab] = useState(showCost ? 'overview' : 'low-stock');
  const [restockProduct, setRestockProduct] = useState(null);
  const [adjustProduct, setAdjustProduct] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Overview filters
  const [ovCategory, setOvCategory] = useState('');
  const [ovSubCategory, setOvSubCategory] = useState('');
  const [ovStockStatus, setOvStockStatus] = useState(''); // '', 'in', 'low', 'out'
  const [ovSplitVariant, setOvSplitVariant] = useState(false); // show Variant/Size columns

  useEffect(() => { fetchProducts({ limit: 200 }); }, []);

  const loadMovements = () => {
    api.get('/inventory/movements', { params: { limit: 100, type: typeFilter || undefined } })
      .then(({ data }) => { setMovements(data.movements); })
      .catch(() => {});
  };

  useEffect(() => {
    if (tab === 'movements') { setMovLoading(true); loadMovements(); setMovLoading(false); }
  }, [tab, typeFilter]);

  // Auto-refresh inventory data (skip while a restock/adjust modal is open)
  const invBusy = !!(restockProduct || adjustProduct);
  useAutoRefresh(() => {
    if (invBusy) return;
    fetchProducts({ limit: 200 });
    if (tab === 'movements') loadMovements();
  }, 30000, [tab, typeFilter, invBusy]);

  const lowStockProducts = products.filter((p) => {
    const avail = p.quantity - p.reservedQty;
    return avail <= p.lowStockThreshold;
  });

  const allProducts = products.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.SKU?.includes(search)
  );

  // ─── Overview: cost valuation of pending (on-hand) stock ───
  const stockStatusOf = (p) => {
    const avail = p.quantity - p.reservedQty;
    if (avail <= 0) return 'out';
    if (avail <= p.lowStockThreshold) return 'low';
    return 'in';
  };

  // Category list (only active products) and the sub-categories of the picked category
  const ovCategories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(),
    [products]
  );
  const ovSubCategories = useMemo(() => {
    const pool = ovCategory ? products.filter((p) => p.category === ovCategory) : products;
    return [...new Set(pool.map((p) => p.subCategory).filter(Boolean))].sort();
  }, [products, ovCategory]);

  const ovFiltered = useMemo(() => products.filter((p) => {
    if (ovCategory && p.category !== ovCategory) return false;
    if (ovSubCategory && (p.subCategory || '') !== ovSubCategory) return false;
    if (ovStockStatus && stockStatusOf(p) !== ovStockStatus) return false;
    return true;
  }), [products, ovCategory, ovSubCategory, ovStockStatus]);

  // Totals over the filtered set. Stock value is valued at cost (qty × costPrice).
  const ovTotals = useMemo(() => ovFiltered.reduce((acc, p) => {
    const cost = (p.costPrice || 0) * p.quantity;
    acc.units += p.quantity;
    acc.cost += cost;
    acc.skus += 1;
    if (stockStatusOf(p) === 'out') acc.outOfStock += 1;
    return acc;
  }, { units: 0, cost: 0, skus: 0, outOfStock: 0 }), [ovFiltered]);

  // Group by category → sub-category for the breakdown table. When the
  // variant/size split is on, each sub-category further breaks down by
  // variant + size combinations.
  const ovGroups = useMemo(() => {
    const map = new Map();
    for (const p of ovFiltered) {
      const cat = p.category || 'Uncategorized';
      const sub = p.subCategory || '—';
      const cost = (p.costPrice || 0) * p.quantity;
      if (!map.has(cat)) map.set(cat, { category: cat, units: 0, cost: 0, skus: 0, subs: new Map() });
      const g = map.get(cat);
      g.units += p.quantity; g.cost += cost; g.skus += 1;
      if (!g.subs.has(sub)) g.subs.set(sub, { sub, units: 0, cost: 0, skus: 0, vs: new Map() });
      const s = g.subs.get(sub);
      s.units += p.quantity; s.cost += cost; s.skus += 1;
      if (ovSplitVariant) {
        const vsKey = `${p.color || '—'}|${p.size || '—'}`;
        if (!s.vs.has(vsKey)) s.vs.set(vsKey, { variant: p.color || '—', size: p.size || '—', units: 0, cost: 0, skus: 0 });
        const v = s.vs.get(vsKey);
        v.units += p.quantity; v.cost += cost; v.skus += 1;
      }
    }
    return [...map.values()]
      .map((g) => ({
        ...g,
        subs: [...g.subs.values()]
          .map((s) => ({ ...s, vs: [...s.vs.values()].sort((a, b) => b.cost - a.cost) }))
          .sort((a, b) => b.cost - a.cost),
      }))
      .sort((a, b) => b.cost - a.cost);
  }, [ovFiltered, ovSplitVariant]);

  const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleDone = () => {
    setRestockProduct(null);
    setAdjustProduct(null);
    fetchProducts({ limit: 200 });
    if (tab === 'movements') {
      setMovLoading(true);
      api.get('/inventory/movements', { params: { limit: 100 } })
        .then(({ data }) => { setMovements(data.movements); setMovLoading(false); });
    }
  };

  const typeColors = { SALE: 'destructive', RESTOCK: 'success', ADJUSTMENT: 'warning', RETURN: 'info' };

  const tabs = [
    ...(showCost ? [{ id: 'overview', label: 'Overview' }] : []),
    { id: 'low-stock', label: `Low Stock (${lowStockProducts.length})` },
    { id: 'all', label: 'All Products' },
    { id: 'movements', label: 'Stock Movements' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Inventory Control</h1>
        <p className="text-gray-500 text-sm mt-1">Manage stock levels, restocking, and adjustments</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && showCost && (
        <div className="space-y-5">
          {/* Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Category</label>
                  <Select
                    value={ovCategory}
                    onChange={(e) => { setOvCategory(e.target.value); setOvSubCategory(''); }}
                    className="w-48 h-9 text-sm"
                  >
                    <option value="">All Categories</option>
                    {ovCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Sub-category</label>
                  <Select
                    value={ovSubCategory}
                    onChange={(e) => setOvSubCategory(e.target.value)}
                    className="w-48 h-9 text-sm"
                  >
                    <option value="">All Sub-categories</option>
                    {ovSubCategories.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Stock Status</label>
                  <Select value={ovStockStatus} onChange={(e) => setOvStockStatus(e.target.value)} className="w-44 h-9 text-sm">
                    <option value="">All</option>
                    <option value="in">In Stock</option>
                    <option value="low">Low Stock</option>
                    <option value="out">Out of Stock</option>
                  </Select>
                </div>
                {(ovCategory || ovSubCategory || ovStockStatus) && (
                  <Button variant="outline" size="sm" className="h-9"
                    onClick={() => { setOvCategory(''); setOvSubCategory(''); setOvStockStatus(''); }}>
                    Clear filters
                  </Button>
                )}
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 h-9 ml-auto">
                  <input type="checkbox" checked={ovSplitVariant} onChange={(e) => setOvSplitVariant(e.target.checked)} className="rounded" />
                  Split by variant &amp; size
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center"><IndianRupee size={18} className="text-blue-600" /></div>
                <div>
                  <div className="text-xs text-gray-500">Total Stock Value (at cost)</div>
                  <div className="text-xl font-bold text-gray-900">{inr(ovTotals.cost)}</div>
                </div>
              </div>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center"><Package size={18} className="text-green-600" /></div>
                <div>
                  <div className="text-xs text-gray-500">Units Pending in Stock</div>
                  <div className="text-xl font-bold text-gray-900">{ovTotals.units.toLocaleString('en-IN')}</div>
                </div>
              </div>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center"><Layers size={18} className="text-indigo-600" /></div>
                <div>
                  <div className="text-xs text-gray-500">Distinct Products (SKUs)</div>
                  <div className="text-xl font-bold text-gray-900">{ovTotals.skus.toLocaleString('en-IN')}</div>
                </div>
              </div>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center"><AlertTriangle size={18} className="text-red-600" /></div>
                <div>
                  <div className="text-xs text-gray-500">Out of Stock</div>
                  <div className="text-xl font-bold text-gray-900">{ovTotals.outOfStock.toLocaleString('en-IN')}</div>
                </div>
              </div>
            </CardContent></Card>
          </div>

          {/* Breakdown by category / sub-category */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Cost Breakdown by Category</CardTitle></CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Category', 'Sub-category', ...(ovSplitVariant ? ['Variant / Size'] : []), 'SKUs', 'Units in Stock', 'Stock Value (cost)'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading ? (
                    <tr><td colSpan={ovSplitVariant ? 6 : 5} className="py-8 text-center"><Spinner /></td></tr>
                  ) : ovGroups.length === 0 ? (
                    <tr><td colSpan={ovSplitVariant ? 6 : 5} className="py-8 text-center text-gray-400">No products match these filters</td></tr>
                  ) : ovGroups.map((g) => (
                    <React.Fragment key={g.category}>
                      <tr className="bg-gray-50/60 font-semibold">
                        <td className="px-4 py-2.5">{g.category}</td>
                        <td className="px-4 py-2.5 text-gray-400">All</td>
                        {ovSplitVariant && <td className="px-4 py-2.5" />}
                        <td className="px-4 py-2.5">{g.skus}</td>
                        <td className="px-4 py-2.5">{g.units.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-2.5 text-blue-700">{inr(g.cost)}</td>
                      </tr>
                      {g.subs.map((s) => (
                        <React.Fragment key={g.category + '|' + s.sub}>
                          <tr className="hover:bg-gray-50">
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2 text-gray-600 pl-8">{s.sub}</td>
                            {ovSplitVariant && <td className="px-4 py-2 text-gray-400">All</td>}
                            <td className="px-4 py-2 text-gray-600">{s.skus}</td>
                            <td className="px-4 py-2 text-gray-600">{s.units.toLocaleString('en-IN')}</td>
                            <td className="px-4 py-2 text-gray-700">{inr(s.cost)}</td>
                          </tr>
                          {ovSplitVariant && s.vs.map((v) => (
                            <tr key={g.category + '|' + s.sub + '|' + v.variant + '|' + v.size} className="hover:bg-gray-50">
                              <td className="px-4 py-1.5"></td>
                              <td className="px-4 py-1.5"></td>
                              <td className="px-4 py-1.5 text-gray-500 pl-8 text-xs">
                                {[v.variant !== '—' ? v.variant : null, v.size !== '—' ? `Size: ${v.size}` : null].filter(Boolean).join(' · ') || '—'}
                              </td>
                              <td className="px-4 py-1.5 text-gray-500 text-xs">{v.skus}</td>
                              <td className="px-4 py-1.5 text-gray-500 text-xs">{v.units.toLocaleString('en-IN')}</td>
                              <td className="px-4 py-1.5 text-gray-600 text-xs">{inr(v.cost)}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
                {ovGroups.length > 0 && (
                  <tfoot className="bg-gray-50 border-t-2">
                    <tr className="font-bold">
                      <td className="px-4 py-3" colSpan={ovSplitVariant ? 3 : 2}>Total</td>
                      <td className="px-4 py-3">{ovTotals.skus}</td>
                      <td className="px-4 py-3">{ovTotals.units.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3 text-blue-700">{inr(ovTotals.cost)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>

        </div>
      )}

      {tab === 'low-stock' && (
        <div className="space-y-4">
          {lowStockProducts.length === 0 ? (
            <Card><CardContent className="text-center py-12 text-gray-400">All products have healthy stock levels</CardContent></Card>
          ) : (
            lowStockProducts.map((p) => {
              const avail = p.quantity - p.reservedQty;
              return (
                <Card key={p._id} className="border-yellow-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center gap-3">
                        <AlertTriangle size={18} className={avail <= 0 ? 'text-red-500' : 'text-yellow-500'} />
                        <div>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-gray-500">SKU: {p.SKU} | Threshold: {p.lowStockThreshold}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <div className={`text-xl font-bold ${avail <= 0 ? 'text-red-600' : 'text-yellow-600'}`}>{avail}</div>
                          <div className="text-xs text-gray-400">available</div>
                        </div>
                        <Badge variant={avail <= 0 ? 'destructive' : 'warning'}>
                          {avail <= 0 ? 'Out of Stock' : 'Low Stock'}
                        </Badge>
                        <Button size="sm" variant="success" onClick={() => setRestockProduct(p)}>
                          <Plus size={14} className="mr-1" /> Restock
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setAdjustProduct(p)}>
                          Adjust
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {tab === 'all' && (
        <Card>
          <CardHeader className="pb-2">
            <div className="relative w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input className="pl-8 h-8 text-xs" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Product', 'SKU', 'Total Qty', 'Reserved', 'Available', 'Threshold', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={7} className="py-8 text-center"><Spinner /></td></tr>
                ) : allProducts.map((p) => {
                  const avail = p.quantity - p.reservedQty;
                  return (
                    <tr key={p._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.SKU}</td>
                      <td className="px-4 py-3">{p.quantity}</td>
                      <td className="px-4 py-3 text-yellow-600">{p.reservedQty}</td>
                      <td className="px-4 py-3">
                        <span className={avail <= 0 ? 'text-red-600 font-bold' : avail <= p.lowStockThreshold ? 'text-yellow-600 font-bold' : 'text-green-600 font-bold'}>
                          {avail}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{p.lowStockThreshold}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button size="sm" variant="success" onClick={() => setRestockProduct(p)}>
                            <Plus size={12} className="mr-1" /> Restock
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setAdjustProduct(p)}>
                            Adjust
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'movements' && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Stock Movement Log</CardTitle>
              <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-40 h-8 text-xs">
                <option value="">All Types</option>
                <option value="SALE">Sale</option>
                <option value="RESTOCK">Restock</option>
                <option value="ADJUSTMENT">Adjustment</option>
                <option value="RETURN">Return</option>
              </Select>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            {movLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Date', 'Product', 'Type', 'Channel', 'Change', 'Before → After', 'Note'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {movements.map((m) => (
                    <tr key={m._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDateTime(m.createdAt)}</td>
                      <td className="px-4 py-3 font-medium">{m.productId?.name || '—'}</td>
                      <td className="px-4 py-3"><Badge variant={typeColors[m.type]}>{m.type}</Badge></td>
                      <td className="px-4 py-3 text-xs text-gray-500">{m.channel}</td>
                      <td className="px-4 py-3">
                        <span className={m.quantityChanged > 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                          {m.quantityChanged > 0 ? '+' : ''}{m.quantityChanged}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{m.previousQty} → {m.newQty}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">{m.note || '—'}</td>
                    </tr>
                  ))}
                  {movements.length === 0 && (
                    <tr><td colSpan={7} className="py-8 text-center text-gray-400">No movements found</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      )}

      <Modal open={!!restockProduct} onClose={() => setRestockProduct(null)} title="Restock Product">
        {restockProduct && <RestockForm product={restockProduct} onDone={handleDone} onClose={() => setRestockProduct(null)} />}
      </Modal>

      <Modal open={!!adjustProduct} onClose={() => setAdjustProduct(null)} title="Manual Adjustment">
        {adjustProduct && <AdjustForm product={adjustProduct} onDone={handleDone} onClose={() => setAdjustProduct(null)} />}
      </Modal>
    </div>
  );
}
