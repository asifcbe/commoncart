import React, { useEffect, useState } from 'react';
import { Search, ChevronLeft, ChevronRight, Star, Plus, Minus, Users, Edit2, UserPlus, CheckCircle } from 'lucide-react';
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

function AdjustPointsModal({ customer, onClose, onDone }) {
  const toast = useToast();
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const isAdd = Number(delta) >= 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!delta || isNaN(Number(delta))) return;
    setSaving(true);
    try {
      await api.put(`/customers/admin/${customer._id}/points`, { delta: Number(delta), reason });
      toast({ message: `Points ${isAdd ? 'added' : 'deducted'} successfully`, type: 'success' });
      onDone();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to adjust points', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Adjust Points — ${customer.name}`} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
          <span className="text-sm text-blue-700">Current balance</span>
          <span className="font-bold text-blue-800 flex items-center gap-1">
            <Star size={14} className="fill-yellow-400 text-yellow-400" /> {customer.creditPoints} pts
          </span>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">
            Delta (positive to add, negative to deduct) *
          </label>
          <Input
            type="number"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            placeholder="e.g. 50 or -20"
            required
            autoFocus
          />
          {delta && !isNaN(Number(delta)) && (
            <p className={`text-xs mt-1 ${isAdd ? 'text-green-600' : 'text-red-600'}`}>
              New balance: {Math.max(0, customer.creditPoints + Number(delta))} pts
            </p>
          )}
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Reason (optional)</label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Goodwill adjustment" />
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || !delta}>
            {saving ? <Spinner size="sm" className="mr-2" /> : null} Apply
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CustomerFormModal({ customer, onClose, onDone }) {
  const toast = useToast();
  const isEdit = !!customer;
  const [form, setForm] = useState({
    name: customer?.name || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    creditPoints: customer?.creditPoints ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast({ message: 'Name is required', type: 'error' }); return; }
    if (!form.phone.trim()) { toast({ message: 'Phone is required', type: 'error' }); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/customers/admin/${customer._id}`, {
          name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(),
        });
        toast({ message: 'Customer updated', type: 'success' });
      } else {
        await api.post('/customers/admin', {
          name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(),
          creditPoints: Number(form.creditPoints) || 0,
        });
        toast({ message: 'Customer created', type: 'success' });
      }
      onDone();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to save customer', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit — ${customer.name}` : 'New Customer'} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium block mb-1">Name *</label>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Customer name" required autoFocus />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Phone *</label>
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="Phone number" required />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Email <span className="text-gray-400 font-normal">(optional)</span></label>
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="email@example.com" />
        </div>
        {!isEdit && (
          <div>
            <label className="text-sm font-medium block mb-1">Opening Credit Points <span className="text-gray-400 font-normal">(optional)</span></label>
            <Input type="number" min="0" value={form.creditPoints} onChange={(e) => set('creditPoints', e.target.value)} placeholder="0" />
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2 border-t">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Spinner size="sm" className="mr-2" /> : <CheckCircle size={14} className="mr-2" />}
            {isEdit ? 'Save Changes' : 'Create Customer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/customers/admin', {
        params: { search: search || undefined, source: source || undefined, page, limit: 20 },
      });
      setCustomers(data.customers);
      setTotal(data.total);
      setPages(data.pages);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCustomers(); }, [search, source, page]);

  // Auto-refresh (skip while creating/editing/adjusting a customer)
  const custBusy = !!(showCreate || editTarget || adjustTarget);
  useAutoRefresh(() => { if (!custBusy) fetchCustomers(); }, 30000, [search, source, page, custBusy]);

  const handleAdjustDone = () => {
    setAdjustTarget(null);
    fetchCustomers();
  };

  const totalPoints = customers.reduce((s, c) => s + (c.creditPoints || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={22} className="text-blue-500" /> Customers
          </h1>
          <p className="text-gray-500 text-sm mt-1">{total} customers total</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <UserPlus size={16} className="mr-2" /> New Customer
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                className="pl-9"
                placeholder="Search by name, phone, or email…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <Select value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }} className="w-36">
              <option value="">All Sources</option>
              <option value="WEB">Web</option>
              <option value="POS">POS</option>
            </Select>
            {(search || source) && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setSource(''); setPage(1); }}>
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : customers.length === 0 ? (
            <div className="text-center text-gray-400 py-16">
              <Users size={40} className="mx-auto mb-3 opacity-30" />
              <p>No customers found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Customer', 'Phone', 'Email', 'Source', 'Credit Points', 'Joined', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {customers.map((c) => (
                  <tr key={c._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-700">{c.phone || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{c.email || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3">
                      <Badge variant={c.source === 'WEB' ? 'info' : 'secondary'}>{c.source}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Star size={14} className={c.creditPoints > 0 ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'} />
                        <span className={`font-semibold ${c.creditPoints > 0 ? 'text-yellow-700' : 'text-gray-400'}`}>
                          {c.creditPoints || 0}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditTarget(c)}
                          className="text-xs"
                        >
                          <Edit2 size={12} className="mr-1" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAdjustTarget(c)}
                          className="text-xs"
                        >
                          <Star size={12} className="mr-1" /> Adjust Points
                        </Button>
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

      {adjustTarget && (
        <AdjustPointsModal
          customer={adjustTarget}
          onClose={() => setAdjustTarget(null)}
          onDone={handleAdjustDone}
        />
      )}

      {showCreate && (
        <CustomerFormModal
          onClose={() => setShowCreate(false)}
          onDone={() => { setShowCreate(false); fetchCustomers(); }}
        />
      )}

      {editTarget && (
        <CustomerFormModal
          customer={editTarget}
          onClose={() => setEditTarget(null)}
          onDone={() => { setEditTarget(null); fetchCustomers(); }}
        />
      )}
    </div>
  );
}
