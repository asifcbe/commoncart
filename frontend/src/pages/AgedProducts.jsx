import React, { useEffect, useState } from 'react';
import { Clock, Zap, Package, TrendingDown, Tag, ChevronDown, ChevronRight } from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import api from '../utils/api';
import useAutoRefresh from '../hooks/useAutoRefresh';

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

function StepGroup({ step, items, onApplied }) {
  const [open, setOpen] = useState(true);
  const [applying, setApplying] = useState(false);
  const toast = useToast();

  const applyToGroup = async () => {
    if (!confirm(`Apply ${step.percent}% discount to all ${items.length} product(s) in "${step.label}"?`)) return;
    setApplying(true);
    try {
      // Patch each product's discountPrice and mark as aged (clearance) → not exchangeable
      await Promise.all(items.map((p) => {
        const discounted = Math.max(p.costPrice || 0, p.price * (1 - step.percent / 100));
        return api.put(`/products/${p._id}`, { discountPrice: Math.round(discounted * 100) / 100, isAged: true });
      }));
      toast({ message: `Applied ${step.percent}% to ${items.length} product(s)`, type: 'success' });
      onApplied();
    } catch {
      toast({ message: 'Failed to apply discounts', type: 'error' });
    } finally { setApplying(false); }
  };

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
            {step.percent > 0 && items.length > 0 && (
              <Button size="sm" variant="outline" onClick={applyToGroup} disabled={applying}>
                {applying ? <Spinner size="sm" className="mr-1" /> : <Zap size={12} className="mr-1" />}
                Apply {step.percent}% to all
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {open && items.length > 0 && (
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-t border-b">
                <tr>
                  {['Product', 'Category', 'Color / Size', 'Age', 'Stock', 'Price', 'Discount Price', 'New Price after apply'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((p) => {
                  const newPrice = step.percent > 0 ? Math.max(p.costPrice || 0, p.price * (1 - step.percent / 100)) : null;
                  return (
                    <tr key={p._id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-900">{p.name}</td>
                      <td className="px-3 py-2 text-gray-500">{p.category}</td>
                      <td className="px-3 py-2 text-gray-500">{[p.color, p.size].filter(Boolean).join(' / ') || '—'}</td>
                      <td className="px-3 py-2"><AgeBadge days={p.ageDays} /></td>
                      <td className="px-3 py-2">{p.availableQty}</td>
                      <td className="px-3 py-2">₹{p.price?.toFixed(2) ?? '—'}</td>
                      <td className="px-3 py-2">
                        {p.discountPrice != null
                          ? <span className="text-red-600 font-semibold">₹{p.discountPrice.toFixed(2)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {newPrice != null
                          ? <span className="text-orange-700 font-semibold">₹{newPrice.toFixed(2)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
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
          <p className="text-gray-500 text-sm mt-1">Products grouped by age — review and apply clearance pricing</p>
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
          <StepGroup key={i} step={g.step} items={g.items} onApplied={load} />
        ))}
      </div>
    </div>
  );
}
