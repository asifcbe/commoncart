import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Edit, Tag, ToggleLeft, ToggleRight } from 'lucide-react';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';
import { Card, CardContent } from '../components/ui/Card';
import { useToast } from '../components/ui/Toast';
import api from '../utils/api';
import useAutoRefresh from '../hooks/useAutoRefresh';

const EMPTY_FORM = {
  code: '', description: '', type: 'PERCENTAGE', value: '',
  minOrderAmount: '', maxDiscountAmount: '', maxUses: '', expiresAt: '',
};

function CouponForm({ coupon, onSave, onClose }) {
  const toast = useToast();
  const [form, setForm] = useState(coupon ? {
    code: coupon.code,
    description: coupon.description || '',
    type: coupon.type,
    value: coupon.value,
    minOrderAmount: coupon.minOrderAmount || '',
    maxDiscountAmount: coupon.maxDiscountAmount || '',
    maxUses: coupon.maxUses || '',
    expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt).toISOString().slice(0, 10) : '',
  } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        value: Number(form.value),
        minOrderAmount: Number(form.minOrderAmount) || 0,
        maxDiscountAmount: Number(form.maxDiscountAmount) || 0,
        maxUses: Number(form.maxUses) || 0,
        expiresAt: form.expiresAt || null,
      };
      if (coupon) {
        await api.put(`/coupons/${coupon._id}`, payload);
      } else {
        await api.post('/coupons', payload);
      }
      toast({ message: `Coupon ${coupon ? 'updated' : 'created'}`, type: 'success' });
      onSave();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to save coupon', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium block mb-1">Coupon Code *</label>
          <Input value={form.code} onChange={set('code')} placeholder="e.g. SAVE20" required className="uppercase" style={{ textTransform: 'uppercase' }} />
          <p className="text-xs text-gray-400 mt-0.5">Code is case-insensitive</p>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Type *</label>
          <Select value={form.type} onChange={set('type')}>
            <option value="PERCENTAGE">Percentage (%)</option>
            <option value="FIXED_AMOUNT">Fixed Amount</option>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">
            {form.type === 'PERCENTAGE' ? 'Discount %' : 'Discount Amount'} *
          </label>
          <Input
            type="number" min="0" step="0.01"
            value={form.value} onChange={set('value')}
            placeholder={form.type === 'PERCENTAGE' ? '0–100' : '0.00'}
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Min Order Amount</label>
          <Input type="number" min="0" step="0.01" value={form.minOrderAmount} onChange={set('minOrderAmount')} placeholder="0 = no minimum" />
        </div>
        {form.type === 'PERCENTAGE' && (
          <div>
            <label className="text-sm font-medium block mb-1">Max Discount Cap</label>
            <Input type="number" min="0" step="0.01" value={form.maxDiscountAmount} onChange={set('maxDiscountAmount')} placeholder="0 = no cap" />
          </div>
        )}
        <div>
          <label className="text-sm font-medium block mb-1">Max Uses</label>
          <Input type="number" min="0" value={form.maxUses} onChange={set('maxUses')} placeholder="0 = unlimited" />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Expiry Date</label>
          <Input type="date" value={form.expiresAt} onChange={set('expiresAt')} />
        </div>
        <div className="col-span-2">
          <label className="text-sm font-medium block mb-1">Description</label>
          <Input value={form.description} onChange={set('description')} placeholder="Internal note about this coupon" />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Spinner size="sm" className="mr-2" /> : null}
          {coupon ? 'Update Coupon' : 'Create Coupon'}
        </Button>
      </div>
    </form>
  );
}

export default function Coupons() {
  const toast = useToast();
  const [coupons, setCoupons] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editCoupon, setEditCoupon] = useState(null);

  const fetchCoupons = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/coupons');
      setCoupons(data.coupons);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCoupons(); }, []);

  // Auto-refresh (skip while the coupon form is open)
  useAutoRefresh(() => { if (!showForm) fetchCoupons(); }, 30000, [showForm]);

  const handleToggleActive = async (c) => {
    try {
      await api.put(`/coupons/${c._id}`, { isActive: !c.isActive });
      setCoupons((prev) => prev.map((x) => x._id === c._id ? { ...x, isActive: !c.isActive } : x));
      toast({ message: `Coupon ${!c.isActive ? 'activated' : 'deactivated'}`, type: 'success' });
    } catch {
      toast({ message: 'Failed to update coupon', type: 'error' });
    }
  };

  const handleDelete = async (c) => {
    if (!confirm(`Delete coupon "${c.code}"?`)) return;
    try {
      await api.delete(`/coupons/${c._id}`);
      setCoupons((prev) => prev.filter((x) => x._id !== c._id));
      toast({ message: 'Coupon deleted', type: 'success' });
    } catch {
      toast({ message: 'Failed to delete coupon', type: 'error' });
    }
  };

  const handleSave = () => {
    setShowForm(false);
    setEditCoupon(null);
    fetchCoupons();
  };

  const isExpired = (c) => c.expiresAt && new Date() > new Date(c.expiresAt);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Tag size={22} className="text-purple-500" /> Discount Coupons
          </h1>
          <p className="text-gray-500 text-sm mt-1">{total} coupons total</p>
        </div>
        <Button onClick={() => { setEditCoupon(null); setShowForm(true); }}>
          <Plus size={16} className="mr-2" /> Create Coupon
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : coupons.length === 0 ? (
            <div className="text-center text-gray-400 py-16">
              <Tag size={40} className="mx-auto mb-3 opacity-30" />
              <p>No coupons yet</p>
              <Button className="mt-4" onClick={() => setShowForm(true)}>
                <Plus size={14} className="mr-2" /> Create your first coupon
              </Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Code', 'Type', 'Discount', 'Min Order', 'Used / Max', 'Expires', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {coupons.map((c) => (
                  <tr key={c._id} className={`hover:bg-gray-50 ${!c.isActive ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">{c.code}</span>
                      {c.description && <div className="text-xs text-gray-400 mt-0.5">{c.description}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={c.type === 'PERCENTAGE' ? 'info' : 'secondary'}>
                        {c.type === 'PERCENTAGE' ? '%' : 'Fixed'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-medium text-green-700">
                      {c.type === 'PERCENTAGE' ? `${c.value}%` : `₹${c.value}`}
                      {c.type === 'PERCENTAGE' && c.maxDiscountAmount > 0 && (
                        <span className="text-xs text-gray-400 ml-1">(max ₹{c.maxDiscountAmount})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.minOrderAmount > 0 ? `₹${c.minOrderAmount}` : <span className="text-gray-400">None</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.usedCount} / {c.maxUses > 0 ? c.maxUses : '∞'}
                      {c.maxUses > 0 && c.usedCount >= c.maxUses && (
                        <Badge variant="destructive" className="ml-2 text-xs">Exhausted</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {c.expiresAt ? (
                        <span className={isExpired(c) ? 'text-red-600 font-medium' : 'text-gray-600'}>
                          {new Date(c.expiresAt).toLocaleDateString()}
                          {isExpired(c) && ' (expired)'}
                        </span>
                      ) : <span className="text-gray-400">Never</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleActive(c)}
                        title={c.isActive ? 'Deactivate' : 'Activate'}
                        className="text-gray-400 hover:text-blue-600"
                      >
                        {c.isActive ? <ToggleRight size={22} className="text-green-500" /> : <ToggleLeft size={22} />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setEditCoupon(c); setShowForm(true); }}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(c)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setEditCoupon(null); }}
        title={editCoupon ? 'Edit Coupon' : 'Create Coupon'}
        size="lg"
      >
        <CouponForm coupon={editCoupon} onSave={handleSave} onClose={() => { setShowForm(false); setEditCoupon(null); }} />
      </Modal>
    </div>
  );
}
