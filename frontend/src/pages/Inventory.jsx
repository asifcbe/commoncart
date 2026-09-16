import React, { useEffect, useState } from 'react';
import { AlertTriangle, Plus, Minus, History, Search, Package, IndianRupee, RefreshCw, Barcode } from 'lucide-react';
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
import { formatDateTime } from '../utils/date';

// Popup listing every barcode in one breakdown slice (a category, a
// sub-category, or a variant+size), fetched on demand from
// GET /inventory/barcodes — the Overview aggregation itself never carries
// barcodes, so this only costs a request when someone actually clicks in.
function BreakdownBarcodesModal({ label, filters, onClose }) {
  const toast = useToast();
  const [products, setProducts] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/inventory/barcodes', { params: filters })
      .then(({ data }) => setProducts(data.products))
      .catch(() => toast({ message: 'Failed to load barcodes', type: 'error' }))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Modal open onClose={onClose} title={`Barcodes — ${label}`} size="sm">
      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : !products || products.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No products in this breakdown.</p>
      ) : (
        <div className="divide-y max-h-[60vh] overflow-y-auto -mx-1">
          {products.map((p) => (
            <div key={p._id} className="flex items-center justify-between gap-3 px-1 py-2">
              <span className="text-sm text-gray-700 truncate" title={p.name}>{p.name}</span>
              <span className="font-mono text-sm font-semibold text-gray-900 shrink-0">{p.barcode || p.SKU || '—'}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// Small inline link used on each Overview breakdown row.
function ViewBarcodesLink({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap"
      title="View barcodes"
    >
      <Barcode size={12} /> View Barcodes
    </button>
  );
}

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
  const { user } = useAuthStore();
  const showCost = canViewCostPrice(user);
  const [movements, setMovements] = useState([]);
  const [movLoading, setMovLoading] = useState(false);
  const [tab, setTab] = useState(showCost ? 'overview' : 'out-of-stock');
  const [restockProduct, setRestockProduct] = useState(null);
  const [adjustProduct, setAdjustProduct] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Overview: server-aggregated totals + category/sub-category/variant
  // breakdown (see GET /inventory/overview) — the browser never downloads
  // the full product catalog just to sum/group it.
  const [ovLoading, setOvLoading] = useState(true);
  const [ovTotals, setOvTotals] = useState({ units: 0, cost: 0, skus: 0, outOfStock: 0 });
  const [ovGroups, setOvGroups] = useState([]);
  const [ovCategories, setOvCategories] = useState([]);
  const [ovSubCategories, setOvSubCategories] = useState([]);
  const [ovCategory, setOvCategory] = useState('');
  const [ovSubCategory, setOvSubCategory] = useState('');
  const [ovStockStatus, setOvStockStatus] = useState(''); // '', 'in', 'out'
  const [ovSplitVariant, setOvSplitVariant] = useState(false); // show Variant/Size columns
  // { label, filters } of the breakdown row whose "View Barcodes" was clicked
  const [barcodesTarget, setBarcodesTarget] = useState(null);

  // Out of Stock / All Products: paginated product lists (see GET /products)
  // instead of the old "fetch every active product, filter in the browser"
  // approach — that was the main cause of Inventory's slow, ever-refreshing load.
  const [oosProducts, setOosProducts] = useState([]);
  const [oosLoading, setOosLoading] = useState(true);
  const [oosTotal, setOosTotal] = useState(0);
  const [oosPage, setOosPage] = useState(1);
  const [allProducts, setAllProducts] = useState([]);
  const [allLoading, setAllLoading] = useState(true);
  const [allTotal, setAllTotal] = useState(0);
  const [allPage, setAllPage] = useState(1);
  const PAGE_SIZE = 20;

  const loadOverview = () => {
    setOvLoading(true);
    api.get('/inventory/overview', { params: { category: ovCategory || undefined, subCategory: ovSubCategory || undefined, stockStatus: ovStockStatus || undefined } })
      .then(({ data }) => { setOvTotals(data.totals); setOvGroups(data.groups); })
      .catch(() => toast({ message: 'Failed to load inventory overview', type: 'error' }))
      .finally(() => setOvLoading(false));
  };
  useEffect(() => { if (showCost) loadOverview(); }, [showCost, ovCategory, ovSubCategory, ovStockStatus]);

  useEffect(() => {
    api.get('/inventory/overview-filters', { params: { category: ovCategory || undefined } })
      .then(({ data }) => { setOvCategories(data.categories); setOvSubCategories(data.subCategories); })
      .catch(() => {});
  }, [ovCategory]);

  const loadOutOfStock = () => {
    setOosLoading(true);
    api.get('/products', { params: { isActive: true, stockStatus: 'out', page: oosPage, limit: PAGE_SIZE } })
      .then(({ data }) => { setOosProducts(data.products); setOosTotal(data.total); })
      .catch(() => toast({ message: 'Failed to load out-of-stock products', type: 'error' }))
      .finally(() => setOosLoading(false));
  };
  // Loaded on mount too (not just when the tab is active) so the "Out of
  // Stock (N)" tab label has a real count immediately, not "(0)" until clicked.
  useEffect(() => { loadOutOfStock(); }, []);
  useEffect(() => { if (tab === 'out-of-stock') loadOutOfStock(); }, [tab, oosPage]);

  const loadAllProducts = () => {
    setAllLoading(true);
    api.get('/products', { params: { isActive: true, search: search || undefined, page: allPage, limit: PAGE_SIZE } })
      .then(({ data }) => { setAllProducts(data.products); setAllTotal(data.total); })
      .catch(() => toast({ message: 'Failed to load products', type: 'error' }))
      .finally(() => setAllLoading(false));
  };
  useEffect(() => { if (tab === 'all') loadAllProducts(); }, [tab, allPage, search]);
  useEffect(() => { setAllPage(1); }, [search]);

  const loadMovements = () => {
    api.get('/inventory/movements', { params: { limit: 100, type: typeFilter || undefined } })
      .then(({ data }) => { setMovements(data.movements); })
      .catch(() => {});
  };

  useEffect(() => {
    if (tab === 'movements') { setMovLoading(true); loadMovements(); setMovLoading(false); }
  }, [tab, typeFilter]);

  // Manual refresh — reloads whichever tab is currently active. No more
  // auto-refresh: it was re-fetching the full catalog every 30s, which is
  // both the "page keeps refreshing" complaint and a chunk of the slowness.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (tab === 'overview') loadOverview();
      else if (tab === 'out-of-stock') loadOutOfStock();
      else if (tab === 'all') loadAllProducts();
      else if (tab === 'movements') loadMovements();
    } finally {
      setTimeout(() => setRefreshing(false), 300);
    }
  };

  const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleDone = () => {
    setRestockProduct(null);
    setAdjustProduct(null);
    loadProducts();
    if (tab === 'movements') {
      setMovLoading(true);
      api.get('/inventory/movements', { params: { limit: 100 } })
        .then(({ data }) => { setMovements(data.movements); setMovLoading(false); });
    }
  };

  const typeColors = { SALE: 'destructive', RESTOCK: 'success', ADJUSTMENT: 'warning', RETURN: 'info' };

  const tabs = [
    ...(showCost ? [{ id: 'overview', label: 'Overview' }] : []),
    { id: 'out-of-stock', label: `Out of Stock (${oosTotal})` },
    { id: 'all', label: 'All Products' },
    { id: 'movements', label: 'Stock Movements' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Control</h1>
          <p className="text-gray-500 text-sm mt-1">Manage stock levels, restocking, and adjustments</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw size={14} className={`mr-1.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${tab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
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
              <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:items-end">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Category</label>
                  <Select
                    value={ovCategory}
                    onChange={(e) => { setOvCategory(e.target.value); setOvSubCategory(''); }}
                    className="w-full sm:w-48 h-9 text-sm"
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
                    className="w-full sm:w-48 h-9 text-sm"
                  >
                    <option value="">All Sub-categories</option>
                    {ovSubCategories.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Stock Status</label>
                  <Select value={ovStockStatus} onChange={(e) => setOvStockStatus(e.target.value)} className="w-full sm:w-44 h-9 text-sm">
                    <option value="">All</option>
                    <option value="in">In Stock</option>
                    <option value="out">Out of Stock</option>
                  </Select>
                </div>
                {(ovCategory || ovSubCategory || ovStockStatus) && (
                  <Button variant="outline" size="sm" className="h-9"
                    onClick={() => { setOvCategory(''); setOvSubCategory(''); setOvStockStatus(''); }}>
                    Clear filters
                  </Button>
                )}
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 h-9 sm:ml-auto">
                  <input type="checkbox" checked={ovSplitVariant} onChange={(e) => setOvSplitVariant(e.target.checked)} className="rounded" />
                  Split by variant &amp; size
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                    {['Category', 'Sub-category', ...(ovSplitVariant ? ['Variant / Size'] : []), 'SKUs', 'Units in Stock', 'Stock Value (cost)', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ovLoading ? (
                    <tr><td colSpan={ovSplitVariant ? 7 : 6} className="py-8 text-center"><Spinner /></td></tr>
                  ) : ovGroups.length === 0 ? (
                    <tr><td colSpan={ovSplitVariant ? 7 : 6} className="py-8 text-center text-gray-400">No products match these filters</td></tr>
                  ) : ovGroups.map((g) => (
                    <React.Fragment key={g.category}>
                      <tr className="bg-gray-50/60 font-semibold">
                        <td className="px-4 py-2.5">{g.category}</td>
                        <td className="px-4 py-2.5 text-gray-400">All</td>
                        {ovSplitVariant && <td className="px-4 py-2.5" />}
                        <td className="px-4 py-2.5">{g.skus}</td>
                        <td className="px-4 py-2.5">{g.units.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-2.5 text-blue-700">{inr(g.cost)}</td>
                        <td className="px-4 py-2.5">
                          <ViewBarcodesLink onClick={() => setBarcodesTarget({
                            label: g.category,
                            filters: { category: g.category, stockStatus: ovStockStatus || undefined },
                          })} />
                        </td>
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
                            <td className="px-4 py-2">
                              <ViewBarcodesLink onClick={() => setBarcodesTarget({
                                label: `${g.category} · ${s.sub}`,
                                filters: { category: g.category, subCategory: s.sub, stockStatus: ovStockStatus || undefined },
                              })} />
                            </td>
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
                              <td className="px-4 py-1.5">
                                <ViewBarcodesLink onClick={() => setBarcodesTarget({
                                  label: `${g.category} · ${s.sub} · ${[v.variant !== '—' ? v.variant : null, v.size !== '—' ? v.size : null].filter(Boolean).join(' / ') || 'Unspecified'}`,
                                  filters: { category: g.category, subCategory: s.sub, color: v.variant, size: v.size, stockStatus: ovStockStatus || undefined },
                                })} />
                              </td>
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
                      <td className="px-4 py-3"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>

        </div>
      )}

      {tab === 'out-of-stock' && (
        <div className="space-y-4">
          {oosLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : oosProducts.length === 0 ? (
            <Card><CardContent className="text-center py-12 text-gray-400">Everything is in stock</CardContent></Card>
          ) : (
            <>
              {oosProducts.map((p) => (
                <Card key={p._id} className="border-red-200">
                  <CardContent className="pt-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center gap-3">
                        <AlertTriangle size={18} className="text-red-500" />
                        <div>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-gray-500">SKU: {p.SKU}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-wrap">
                        <Badge variant="destructive">Out of Stock</Badge>
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
              ))}
              {oosTotal > PAGE_SIZE && (
                <div className="flex items-center justify-between px-1 py-2">
                  <span className="text-sm text-gray-500">Page {oosPage} of {Math.ceil(oosTotal / PAGE_SIZE)}</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={oosPage === 1} onClick={() => setOosPage((p) => p - 1)}>Prev</Button>
                    <Button size="sm" variant="outline" disabled={oosPage >= Math.ceil(oosTotal / PAGE_SIZE)} onClick={() => setOosPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'all' && (
        <Card>
          <CardHeader className="pb-2">
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input className="pl-8 h-8 text-xs" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Product', 'SKU', 'Total Qty', 'Reserved', 'Available', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {allLoading ? (
                  <tr><td colSpan={6} className="py-8 text-center"><Spinner /></td></tr>
                ) : allProducts.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-gray-400">No products found</td></tr>
                ) : allProducts.map((p) => {
                  const avail = p.quantity - p.reservedQty;
                  return (
                    <tr key={p._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.SKU}</td>
                      <td className="px-4 py-3">{p.quantity}</td>
                      <td className="px-4 py-3 text-yellow-600">{p.reservedQty}</td>
                      <td className="px-4 py-3">
                        <span className={avail <= 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>
                          {avail}
                        </span>
                      </td>
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
          {allTotal > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-sm text-gray-500">Page {allPage} of {Math.ceil(allTotal / PAGE_SIZE)}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={allPage === 1} onClick={() => setAllPage((p) => p - 1)}>Prev</Button>
                <Button size="sm" variant="outline" disabled={allPage >= Math.ceil(allTotal / PAGE_SIZE)} onClick={() => setAllPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {tab === 'movements' && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <CardTitle className="text-base">Stock Movement Log</CardTitle>
              <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-full sm:w-40 h-8 text-xs">
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

      {barcodesTarget && (
        <BreakdownBarcodesModal
          label={barcodesTarget.label}
          filters={barcodesTarget.filters}
          onClose={() => setBarcodesTarget(null)}
        />
      )}
    </div>
  );
}
