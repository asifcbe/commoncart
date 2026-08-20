import React, { useEffect, useState } from 'react';
import {
  Plus, Edit2, Eye, ChevronLeft, ChevronRight,
  Truck, CreditCard, ArrowLeft, Phone, Mail, MapPin,
  FileText, CheckCircle, Trash2, AlertTriangle, TrendingUp,
  TrendingDown, DollarSign, Package,
} from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import api from '../utils/api';
import useAutoRefresh from '../hooks/useAutoRefresh';
import { formatDate } from '../utils/date';

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'OTHER'];
const METHOD_LABELS = { CASH: 'Cash', BANK_TRANSFER: 'Bank Transfer', CHEQUE: 'Cheque', UPI: 'UPI', OTHER: 'Other' };

// ─── Stat card ────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'text-gray-900', icon: Icon, iconColor = 'text-gray-400', bg = 'bg-white' }) {
  return (
    <Card className={bg}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          {Icon && <div className={`p-2 rounded-lg bg-gray-50`}><Icon size={18} className={iconColor} /></div>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Supplier Form Modal ──────────────────────────────────────
function SupplierFormModal({ supplier, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: supplier?.name || '',
    contactPerson: supplier?.contactPerson || '',
    phone: supplier?.phone || '',
    email: supplier?.email || '',
    address: supplier?.address || '',
    gstin: supplier?.gstin || '',
    note: supplier?.note || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast({ message: 'Supplier name is required', type: 'error' }); return; }
    setSaving(true);
    try {
      if (supplier) {
        await api.put(`/suppliers/${supplier._id}`, form);
        toast({ message: 'Supplier updated', type: 'success' });
      } else {
        await api.post('/suppliers', form);
        toast({ message: 'Supplier created', type: 'success' });
      }
      onSaved();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to save supplier', type: 'error' });
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={supplier ? 'Edit Supplier' : 'New Supplier'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Supplier Name *</label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. ABC Textiles" required />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Contact Person</label>
            <Input value={form.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} placeholder="Name" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Phone</label>
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 98765 43210" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="supplier@example.com" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">GSTIN</label>
            <Input value={form.gstin} onChange={(e) => set('gstin', e.target.value)} placeholder="22AAAAA0000A1Z5" />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Address</label>
            <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Full address" />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Note</label>
            <Input value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Optional internal note" />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Spinner size="sm" className="mr-2" /> : <CheckCircle size={14} className="mr-2" />}
            {supplier ? 'Save Changes' : 'Create Supplier'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Add Payment Modal ────────────────────────────────────────
function AddPaymentModal({ supplier, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ amount: '', method: 'CASH', reference: '', note: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) { toast({ message: 'Enter a valid amount', type: 'error' }); return; }
    setSaving(true);
    try {
      await api.post(`/suppliers/${supplier._id}/payments`, form);
      toast({ message: `Payment of ₹${Number(form.amount).toFixed(2)} recorded`, type: 'success' });
      onSaved();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to record payment', type: 'error' });
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="Record Payment" size="default">
      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
        <p className="text-sm font-medium text-gray-700">{supplier.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Outstanding balance: <span className={`font-semibold ${supplier.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>₹{supplier.balance.toFixed(2)}</span>
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Amount (₹) *</label>
          <Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0.00" required autoFocus />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Payment Method</label>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button key={m} type="button" onClick={() => set('method', m)}
                className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${form.method === m ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}>
                {METHOD_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Reference / Cheque No.</label>
          <Input value={form.reference} onChange={(e) => set('reference', e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Note</label>
          <Input value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Optional" />
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Spinner size="sm" className="mr-2" /> : <CreditCard size={14} className="mr-2" />}
            Record Payment
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Delete Payment Confirm ───────────────────────────────────
function DeletePaymentModal({ supplierId, payment, onClose, onSaved }) {
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/suppliers/${supplierId}/payments/${payment._id}`);
      toast({ message: 'Payment deleted', type: 'success' });
      onSaved();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to delete payment', type: 'error' });
      setDeleting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Delete Payment" size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
          <AlertTriangle size={18} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">
            Delete payment of <span className="font-semibold">₹{payment.amount.toFixed(2)}</span> ({METHOD_LABELS[payment.method]})
            on {formatDate(payment.createdAt)}? The supplier balance will be restored.
          </p>
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white border-red-600">
            {deleting ? <Spinner size="sm" className="mr-2" /> : <Trash2 size={14} className="mr-2" />}
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Supplier Account (full detail view) ─────────────────────
function SupplierAccount({ supplierId, onBack }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [deletePayment, setDeletePayment] = useState(null);

  const load = () => {
    setLoading(true);
    api.get(`/suppliers/${supplierId}`)
      .then(({ data }) => { setData(data); setLoading(false); })
      .catch(() => { toast({ message: 'Failed to load supplier', type: 'error' }); setLoading(false); });
  };

  useEffect(() => { load(); }, [supplierId]);

  if (loading) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  if (!data) return <div className="text-center text-gray-400 py-16">Supplier not found</div>;

  const { supplier, purchases } = data;
  const totalBilled = purchases.reduce((s, p) => s + p.totalCost, 0);
  const totalPaid = supplier.payments.reduce((s, p) => s + p.amount, 0);
  const outstanding = supplier.balance;

  // Build ledger: purchases as DEBIT, payments as CREDIT, sorted by date
  const ledgerEntries = [
    ...purchases.map((p) => ({ type: 'debit', date: p.createdAt, label: `Purchase ${p.purchaseId}`, sub: `${p.items.length} item(s)${p.note ? ' · ' + p.note : ''}`, amount: p.totalCost, id: p._id })),
    ...supplier.payments.map((p) => ({ type: 'credit', date: p.createdAt, label: `Payment — ${METHOD_LABELS[p.method]}`, sub: [p.reference && `Ref: ${p.reference}`, p.note].filter(Boolean).join(' · '), amount: p.amount, id: p._id, _payment: p })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Running balance per entry (oldest first, then reverse for display)
  let runBal = 0;
  const withBalance = [...ledgerEntries].reverse().map((e) => {
    if (e.type === 'debit') runBal += e.amount;
    else runBal -= e.amount;
    return { ...e, runningBalance: runBal };
  }).reverse();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 shrink-0">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-gray-900 truncate">{supplier.name}</h2>
          <p className="text-sm text-gray-500">Supplier Account Ledger</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
            <Edit2 size={13} className="mr-1.5" /> Edit Details
          </Button>
          <Button size="sm" onClick={() => setShowPayment(true)}>
            <CreditCard size={13} className="mr-1.5" /> Record Payment
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Billed" value={`₹${totalBilled.toFixed(2)}`} icon={TrendingUp} iconColor="text-orange-500" sub={`${purchases.length} purchase(s)`} />
        <StatCard label="Total Paid" value={`₹${totalPaid.toFixed(2)}`} icon={TrendingDown} iconColor="text-green-500" sub={`${supplier.payments.length} payment(s)`} />
        <StatCard
          label="Outstanding Balance"
          value={`₹${outstanding.toFixed(2)}`}
          icon={DollarSign}
          iconColor={outstanding > 0 ? 'text-red-500' : 'text-green-500'}
          color={outstanding > 0 ? 'text-red-600' : 'text-green-600'}
          sub={outstanding > 0 ? 'Amount owed to supplier' : 'Fully paid'}
        />
        <StatCard label="Products Supplied" value={purchases.reduce((s, p) => s + p.items.length, 0)} icon={Package} iconColor="text-blue-500" />
      </div>

      {/* Contact info */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Contact Information</CardTitle>
            <button onClick={() => setShowEdit(true)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              <Edit2 size={11} /> Edit
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-6 text-sm">
            {supplier.contactPerson && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Contact Person</p>
                <p className="text-gray-700 font-medium">{supplier.contactPerson}</p>
              </div>
            )}
            {supplier.phone && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5 flex items-center gap-1"><Phone size={10} /> Phone</p>
                <p className="text-gray-700 font-medium">{supplier.phone}</p>
              </div>
            )}
            {supplier.email && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5 flex items-center gap-1"><Mail size={10} /> Email</p>
                <p className="text-gray-700 font-medium">{supplier.email}</p>
              </div>
            )}
            {supplier.gstin && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5 flex items-center gap-1"><FileText size={10} /> GSTIN</p>
                <p className="text-gray-700 font-mono text-xs">{supplier.gstin}</p>
              </div>
            )}
            {supplier.address && (
              <div className="col-span-2">
                <p className="text-xs text-gray-400 mb-0.5 flex items-center gap-1"><MapPin size={10} /> Address</p>
                <p className="text-gray-700">{supplier.address}</p>
              </div>
            )}
            {supplier.note && (
              <div className="col-span-3">
                <p className="text-xs text-gray-400 mb-0.5">Note</p>
                <p className="text-gray-500 text-xs">{supplier.note}</p>
              </div>
            )}
            {!supplier.contactPerson && !supplier.phone && !supplier.email && !supplier.address && !supplier.gstin && (
              <p className="text-sm text-gray-400 col-span-3">No contact info added yet. <button onClick={() => setShowEdit(true)} className="text-blue-600 hover:underline">Edit supplier</button> to add details.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Ledger */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">Account Ledger</CardTitle>
              <p className="text-xs text-gray-400 mt-0.5">Purchases (debit) and payments (credit) in chronological order</p>
            </div>
            <Button size="sm" onClick={() => setShowPayment(true)}>
              <Plus size={12} className="mr-1.5" /> Add Payment
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {withBalance.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">No transactions yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Date</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Description</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-orange-600">Debit (Billed)</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-green-600">Credit (Paid)</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Balance</th>
                    <th className="px-4 py-2.5 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {withBalance.map((entry) => (
                    <tr key={`${entry.type}-${entry.id}`} className={`hover:bg-gray-50 ${entry.type === 'credit' ? 'bg-green-50/30' : ''}`}>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(entry.date)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{entry.label}</div>
                        {entry.sub && <div className="text-xs text-gray-400 mt-0.5">{entry.sub}</div>}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-orange-700 whitespace-nowrap">
                        {entry.type === 'debit' ? `₹${entry.amount.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-green-700 whitespace-nowrap">
                        {entry.type === 'credit' ? `₹${entry.amount.toFixed(2)}` : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${entry.runningBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        ₹{Math.abs(entry.runningBalance).toFixed(2)}
                        <span className="text-[10px] font-normal ml-0.5">{entry.runningBalance > 0 ? 'owed' : entry.runningBalance < 0 ? 'advance' : ''}</span>
                      </td>
                      <td className="px-4 py-3">
                        {entry.type === 'credit' && (
                          <button
                            onClick={() => setDeletePayment(entry._payment)}
                            className="p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-500"
                            title="Delete payment"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-gray-50">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 text-sm font-semibold text-gray-700">Totals</td>
                    <td className="px-4 py-3 text-right font-bold text-orange-700">₹{totalBilled.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-bold text-green-700">₹{totalPaid.toFixed(2)}</td>
                    <td className={`px-4 py-3 text-right font-bold ${outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      ₹{outstanding.toFixed(2)}
                      <span className="text-xs font-normal ml-1">{outstanding > 0 ? 'outstanding' : 'settled'}</span>
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showPayment && (
        <AddPaymentModal
          supplier={supplier}
          onClose={() => setShowPayment(false)}
          onSaved={() => { setShowPayment(false); load(); }}
        />
      )}
      {showEdit && (
        <SupplierFormModal
          supplier={supplier}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); load(); }}
        />
      )}
      {deletePayment && (
        <DeletePaymentModal
          supplierId={supplier._id}
          payment={deletePayment}
          onClose={() => setDeletePayment(null)}
          onSaved={() => { setDeletePayment(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── Delete Supplier confirm ─────────────────────────────────
function DeleteSupplierModal({ supplier, onClose, onDeleted }) {
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { data } = await api.delete(`/suppliers/${supplier._id}`);
      toast({ message: data.message || 'Supplier deleted', type: 'success' });
      onDeleted();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to delete supplier', type: 'error' });
      setDeleting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Delete Supplier" size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
          <AlertTriangle size={18} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">
            Delete supplier <span className="font-semibold">{supplier.name}</span>? If this supplier has
            purchase history it will be deactivated (hidden) to keep records intact; otherwise it's removed entirely.
          </p>
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleDelete} disabled={deleting} className="bg-red-600 text-white hover:bg-red-700 border-red-600">
            {deleting ? <Spinner size="sm" className="mr-2" /> : <Trash2 size={14} className="mr-2" />}
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Suppliers Page ──────────────────────────────────────
export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [editSupplier, setEditSupplier] = useState(null);
  const [deleteSupplier, setDeleteSupplier] = useState(null);
  const [accountId, setAccountId] = useState(null);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/suppliers', { params: { search: search || undefined, page, limit: 20 } });
      setSuppliers(data.suppliers); setTotal(data.total); setPages(data.pages);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchSuppliers(); }, [search, page]);

  // Auto-refresh the supplier list (skip while a modal is open or viewing an account)
  const supBusy = !!(showNew || editSupplier || deleteSupplier || accountId);
  useAutoRefresh(() => { if (!supBusy) fetchSuppliers(); }, 30000, [search, page, supBusy]);

  const handleSaved = () => { setShowNew(false); setEditSupplier(null); fetchSuppliers(); };

  if (accountId) {
    return <SupplierAccount supplierId={accountId} onBack={() => { setAccountId(null); fetchSuppliers(); }} />;
  }

  // Summary stats
  const totalBalance = suppliers.reduce((s, sup) => s + sup.balance, 0);
  const totalOwed = suppliers.filter((s) => s.balance > 0).reduce((s, sup) => s + sup.balance, 0);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Suppliers</h1>
          <p className="text-gray-500 text-sm mt-1">{total} supplier{total !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus size={16} className="mr-2" /> New Supplier
        </Button>
      </div>

      {/* Summary cards */}
      {suppliers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard label="Total Suppliers" value={total} icon={Truck} iconColor="text-blue-500" />
          <StatCard label="Total Outstanding" value={`₹${totalOwed.toFixed(2)}`} color="text-red-600" icon={DollarSign} iconColor="text-red-400" sub="Across all suppliers" />
          <StatCard label="Suppliers with Balance" value={suppliers.filter((s) => s.balance > 0).length} icon={TrendingUp} iconColor="text-orange-400" />
        </div>
      )}

      {/* Search */}
      <Card>
        <CardContent className="pt-4">
          <Input
            placeholder="Search suppliers by name…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="max-w-sm"
          />
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : suppliers.length === 0 ? (
            <div className="text-center text-gray-400 py-16">
              <Truck size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">No suppliers yet</p>
              <p className="text-sm mt-1">Add your first supplier to start tracking purchases and payments</p>
              <Button className="mt-4" onClick={() => setShowNew(true)}>
                <Plus size={14} className="mr-2" /> Add Supplier
              </Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Supplier', 'Contact Person', 'Phone', 'GSTIN', 'Outstanding Balance', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {suppliers.map((s) => (
                  <tr key={s._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setAccountId(s._id)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{s.name}</div>
                      {s.email && <div className="text-xs text-gray-400">{s.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.contactPerson || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-gray-600">{s.phone || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{s.gstin || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3">
                      {s.balance > 0 ? (
                        <div>
                          <span className="font-semibold text-red-600">₹{s.balance.toFixed(2)}</span>
                          <span className="ml-1.5 text-[10px] text-red-400 bg-red-50 px-1.5 py-0.5 rounded">Owed</span>
                        </div>
                      ) : (
                        <span className="text-green-600 font-medium">Settled</span>
                      )}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setAccountId(s._id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600" title="View account">
                          <Eye size={15} />
                        </button>
                        <button onClick={() => setEditSupplier(s)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600" title="Edit">
                          <Edit2 size={15} />
                        </button>
                        <button onClick={() => setDeleteSupplier(s)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-red-600" title="Delete">
                          <Trash2 size={15} />
                        </button>
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

      {showNew && <SupplierFormModal onClose={() => setShowNew(false)} onSaved={handleSaved} />}
      {editSupplier && <SupplierFormModal supplier={editSupplier} onClose={() => setEditSupplier(null)} onSaved={handleSaved} />}
      {deleteSupplier && <DeleteSupplierModal supplier={deleteSupplier} onClose={() => setDeleteSupplier(null)} onDeleted={() => { setDeleteSupplier(null); fetchSuppliers(); }} />}
    </div>
  );
}
