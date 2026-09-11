import React, { useEffect, useState } from 'react';
import { Clock, Zap, Package, TrendingDown, Tag, ChevronDown, ChevronRight, Image as ImageIcon, ChevronLeft } from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import Modal from '../components/ui/Modal';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import api from '../utils/api';
import useAutoRefresh from '../hooks/useAutoRefresh';

// Small lightbox for a product's photos, opened from a row thumbnail so the
// user can eyeball which item a row is.
function PhotoLightbox({ product, onClose }) {
  const imgs = product?.images || [];
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [product?._id]);
  if (!product) return null;
  return (
    <Modal open onClose={onClose} title={product.name} size="lg">
      {imgs.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <ImageIcon size={40} className="mx-auto mb-3 opacity-40" />
          This product has no photos yet.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center" style={{ minHeight: 340 }}>
            <img src={imgs[idx]} alt={`${product.name} — ${idx + 1}`} className="max-h-[70vh] max-w-full object-contain" />
            {imgs.length > 1 && (
              <>
                <button onClick={() => setIdx((i) => (i - 1 + imgs.length) % imgs.length)} className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/90 shadow flex items-center justify-center hover:bg-white"><ChevronLeft size={18} /></button>
                <button onClick={() => setIdx((i) => (i + 1) % imgs.length)} className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/90 shadow flex items-center justify-center hover:bg-white"><ChevronRight size={18} /></button>
                <span className="absolute bottom-2 right-2 text-xs bg-black/60 text-white px-2 py-0.5 rounded-full">{idx + 1} / {imgs.length}</span>
              </>
            )}
          </div>
          {imgs.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {imgs.map((src, i) => (
                <button key={i} onClick={() => setIdx(i)} className={`h-16 w-16 rounded-md overflow-hidden border-2 flex-shrink-0 ${i === idx ? 'border-blue-500' : 'border-transparent'}`}>
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function AgeBadge({ days }) {
  let color = 'bg-green-100 text-green-700';
  if (days >= 365) color = 'bg-red-100 text-red-700';
  else if (days >= 180) color = 'bg-orange-100 text-orange-700';
  else if (days >= 90)  color = 'bg-yellow-100 text-yellow-700';
  else if (days >= 60)  color = 'bg-amber-100 text-amber-700';
  return (
    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${color}`}>
      {days}d old
    </span>
  );
}

function StepGroup({ step, items, onPreview }) {
  const [open, setOpen] = useState(true);

  const totalValue = items.reduce((s, p) => s + p.price * Math.max(0, p.availableQty), 0);

  return (
    <Card className={`border-l-4 ${step.percent > 0 ? 'border-l-orange-400' : 'border-l-gray-200'}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 flex-1 text-left">
            {open ? <ChevronDown size={16} className="text-gray-400 shrink-0" /> : <ChevronRight size={16} className="text-gray-400 shrink-0" />}
            <span className="font-semibold text-gray-800">{step.label}</span>
            <span className="text-xs text-gray-400">≥ {step.days} days</span>
            {step.percent > 0 && (
              <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">
                -{step.percent}% off
              </span>
            )}
          </button>
          <div className="flex items-center gap-4 text-sm text-gray-500 shrink-0">
            <span><strong className="text-gray-800">{items.length}</strong> product{items.length !== 1 ? 's' : ''}</span>
            <span>Stock value: <strong className="text-gray-800">₹{totalValue.toFixed(0)}</strong></span>
          </div>
        </div>
      </CardHeader>

      {open && items.length > 0 && (
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-t border-b">
                <tr>
                  {['', 'Product', 'Category', 'Sub-category', 'Color / Size', 'Age', 'Stock', 'Current Discount Price', `Aging price (−${step.percent}%)`, 'MRP'].map((h, i) => (
                    <th key={i} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((p) => {
                  // What this step's discount would set (mirrors applyAgingNow):
                  // age DOWN FROM the manual discount if there is one, else MRP.
                  // The step % is applied exactly — no cost-price floor.
                  const manual = p.manualDiscountPrice != null && p.manualDiscountPrice > 0 ? p.manualDiscountPrice : null;
                  const base = manual != null ? manual : (p.price || 0);
                  const agingPrice = step.percent > 0
                    ? Math.max(0, Math.round(base * (1 - step.percent / 100) * 100) / 100)
                    : base;
                  const belowCost = p.costPrice > 0 && agingPrice < p.costPrice - 0.005;
                  return (
                  <tr key={p._id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <button
                        onClick={() => onPreview(p)}
                        className="relative h-10 w-10 rounded-md overflow-hidden border bg-gray-50 flex items-center justify-center group/thumb"
                        title="View photos"
                      >
                        {p.images?.[0]
                          ? <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" />
                          : <ImageIcon size={15} className="text-gray-300" />}
                        {p.images?.length > 1 && (
                          <span className="absolute bottom-0 right-0 text-[9px] leading-none bg-black/60 text-white px-1 py-0.5 rounded-tl">{p.images.length}</span>
                        )}
                        <span className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/20 transition-colors" />
                      </button>
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-900">
                      <button onClick={() => onPreview(p)} className="text-left hover:text-blue-600 hover:underline">{p.name}</button>
                      <div className="text-xs text-gray-400 font-normal">{p.barcode || p.SKU}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{p.category}</td>
                    <td className="px-3 py-2 text-gray-500">{p.subCategory || '—'}</td>
                    <td className="px-3 py-2 text-gray-500">{[p.color, p.size].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="px-3 py-2"><AgeBadge days={p.ageDays} /></td>
                    <td className="px-3 py-2">{p.availableQty}</td>
                    <td className="px-3 py-2">
                      {p.discountPrice != null
                        ? <span className="text-red-600 font-semibold">₹{p.discountPrice.toFixed(2)}{p.isAged ? '' : ' (manual)'}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {step.percent > 0 ? (
                        <span className="font-semibold text-orange-700">
                          ₹{agingPrice.toFixed(2)}
                          {belowCost && (
                            <span className="ml-1 text-[10px] font-medium text-red-500" title={`Below the cost price (₹${(p.costPrice || 0).toFixed(2)}) — this step sells at a loss.`}>
                              (below cost)
                            </span>
                          )}
                          {manual != null && <span className="ml-1 text-[10px] text-gray-400">from ₹{manual.toFixed(2)}</span>}
                        </span>
                      ) : (
                        <span className="text-gray-300">no discount</span>
                      )}
                    </td>
                    <td className="px-3 py-2">₹{p.price?.toFixed(2) ?? '—'}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}

      {open && items.length === 0 && (
        <CardContent>
          <p className="text-sm text-gray-400 py-2">No products in this age range.</p>
        </CardContent>
      )}
    </Card>
  );
}

export default function AgedProducts() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [previewProduct, setPreviewProduct] = useState(null);

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    api.get('/settings/aged-products')
      .then(({ data }) => { setData(data); if (!silent) setLoading(false); })
      .catch(() => { if (!silent) { toast({ message: 'Failed to load aged products', type: 'error' }); setLoading(false); } });
  };

  useEffect(() => { load(); }, []);

  // Auto-refresh silently (skip while a bulk apply is running)
  useAutoRefresh(() => { if (!applying) load(true); }, 60000, [applying]);

  const handleApplyAll = async () => {
    if (!confirm('Apply all aging discounts globally to every eligible product now?')) return;
    setApplying(true);
    try {
      const { data: res } = await api.post('/settings/aging-apply');
      toast({ message: res.message, type: 'success' });
      load();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed', type: 'error' });
    } finally { setApplying(false); }
  };

  if (loading) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  if (!data) return <div className="text-center text-gray-400 py-16">No data</div>;

  const { groups, freshCount, config } = data;
  const totalAged = groups.reduce((s, g) => s + g.items.length, 0);
  const eligibleForDiscount = groups.filter((g) => g.step.percent > 0).reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Aged Products</h1>
          <p className="text-gray-500 text-sm mt-1">
            Only products with <strong>Enable aging</strong> turned on (set at purchase entry) appear here.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}>Refresh</Button>
          {config?.enabled && (
            <Button onClick={handleApplyAll} disabled={applying}>
              {applying ? <Spinner size="sm" className="mr-2" /> : <Zap size={14} className="mr-2" />}
              Apply All Aging Discounts
            </Button>
          )}
          {!config?.enabled && (
            <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg flex items-center gap-1.5">
              <Clock size={13} /> Price aging is disabled — enable it in Settings → Price Aging
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 pb-4">
          <p className="text-xs text-gray-500">Fresh Products</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{freshCount}</p>
          <p className="text-xs text-gray-400">below first threshold</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4">
          <p className="text-xs text-gray-500">Aged Products</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{totalAged}</p>
          <p className="text-xs text-gray-400">across all steps</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4">
          <p className="text-xs text-gray-500">Eligible for Discount</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{eligibleForDiscount}</p>
          <p className="text-xs text-gray-400">with percent &gt; 0</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4">
          <p className="text-xs text-gray-500">Aging Rules Active</p>
          <p className={`text-2xl font-bold mt-1 ${config?.enabled ? 'text-blue-600' : 'text-gray-400'}`}>{config?.enabled ? 'Yes' : 'No'}</p>
          <p className="text-xs text-gray-400">{config?.steps?.length || 0} steps configured</p>
        </CardContent></Card>
      </div>

      {/* Grouped steps */}
      <div className="space-y-4">
        {groups.map((g, i) => (
          <StepGroup key={i} step={g.step} items={g.items} onPreview={setPreviewProduct} />
        ))}
      </div>

      {previewProduct && (
        <PhotoLightbox product={previewProduct} onClose={() => setPreviewProduct(null)} />
      )}
    </div>
  );
}
