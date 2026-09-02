import React, { useEffect, useMemo, useState } from 'react';
import {
  Users, CalendarCheck, Wallet, TrendingUp, Edit2, CheckCircle,
  Plus, Trash2, X, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';
import Badge from '../components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import PermissionEditor from '../components/PermissionEditor';
import api from '../utils/api';
import { formatDate } from '../utils/date';

const DEFAULT_STAFF_PERMS = { sections: ['dashboard', 'pos', 'products', 'sales'], viewCostPrice: false, canManage: false };

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthAgoStr = () => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); };

// ─── HR Edit Modal ────────────────────────────────────────────
function HRModal({ staff, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: staff.name || '',
    phone: staff.phone || '',
    monthlySalary: staff.monthlySalary || '',
    joinDate: staff.joinDate ? new Date(staff.joinDate).toISOString().slice(0, 10) : '',
    isActive: staff.isActive !== false,
    role: staff.role || 'STAFF',
  });
  const [permissions, setPermissions] = useState(
    staff.permissions?.sections
      ? { sections: staff.permissions.sections, viewCostPrice: !!staff.permissions.viewCostPrice, canManage: !!staff.permissions.canManage }
      : { ...DEFAULT_STAFF_PERMS }
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      if (form.role === 'STAFF') payload.permissions = permissions;
      await api.put(`/staff/${staff._id}/hr`, payload);
      toast({ message: 'Staff details updated', type: 'success' });
      onSaved();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to update', type: 'error' });
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Edit — ${staff.name}`} size="lg">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Name</label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Phone</label>
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone number" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Monthly Salary (₹)</label>
            <Input type="number" min="0" value={form.monthlySalary} onChange={(e) => setForm((f) => ({ ...f, monthlySalary: e.target.value }))} placeholder="0" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Join Date</label>
            <Input type="date" value={form.joinDate} onChange={(e) => setForm((f) => ({ ...f, joinDate: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Role</label>
            <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="STAFF">Staff</option>
              <option value="ADMIN">Admin</option>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer self-end pb-2">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="rounded" />
            Active employee
          </label>
        </div>

        {form.role === 'STAFF' ? (
          <div className="border-t pt-3">
            <PermissionEditor value={permissions} onChange={setPermissions} />
          </div>
        ) : (
          <p className="text-xs text-gray-500 border-t pt-3">Admins have full access to every section.</p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Spinner size="sm" className="mr-1" /> : <CheckCircle size={13} className="mr-1.5" />} Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Staff Directory tab ──────────────────────────────────────
function StaffDirectory() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/staff').then(({ data }) => setStaff(data.staff)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>{['Name', 'Role', 'Phone', 'Monthly Salary', 'Join Date', 'Status', 'Actions'].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y">
            {staff.map((s) => (
              <tr key={s._id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{s.name}<div className="text-xs text-gray-400">{s.email}</div></td>
                <td className="px-4 py-3"><Badge variant={s.role === 'ADMIN' ? 'default' : 'secondary'}>{s.role}</Badge></td>
                <td className="px-4 py-3 text-gray-600">{s.phone || <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-3 text-gray-700">{s.monthlySalary ? `₹${s.monthlySalary.toLocaleString()}` : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{s.joinDate ? formatDate(s.joinDate) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-3">{s.isActive === false ? <Badge variant="danger">Inactive</Badge> : <Badge variant="success">Active</Badge>}</td>
                <td className="px-4 py-3">
                  <button onClick={() => setEditing(s)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600" title="Edit HR details">
                    <Edit2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <HRModal staff={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </Card>
  );
}

// ─── Attendance tab ───────────────────────────────────────────
// Month calendar grid: rows = staff, columns = days. Click a cell to cycle
// Full → Half-day → Leave → unmarked (like the sample app).
const ATT_STATUS = {
  PRESENT:  { label: 'F', text: '#15803d', bg: '#dcfce7', title: 'Full' },
  HALF_DAY: { label: 'H', text: '#b45309', bg: '#fef3c7', title: 'Half Day' },
  LEAVE:    { label: 'L', text: '#6d28d9', bg: '#ede9fe', title: 'Leave' },
};
const STATUS_CYCLE = ['PRESENT', 'HALF_DAY', 'LEAVE', null];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const dateStr = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function AttendanceTab() {
  const toast = useToast();
  const now = new Date();
  const [staff, setStaff] = useState([]);
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [records, setRecords] = useState({}); // `${userId}_${date}` -> status
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const dim = daysInMonth(year, month);
  const today = { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };

  useEffect(() => { api.get('/staff/options').then(({ data }) => setStaff(data.staff)); }, []);

  const loadMonth = () => {
    setLoading(true);
    const start = dateStr(year, month, 1);
    const end = dateStr(year, month, dim);
    api.get('/staff/attendance', { params: { startDate: start, endDate: end } })
      .then(({ data }) => {
        const map = {};
        data.attendance.forEach((r) => { map[`${r.userId._id || r.userId}_${r.date}`] = r.status; });
        setRecords(map);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadMonth(); }, [month, year]);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1); };

  const cycle = async (userId, day) => {
    const date = dateStr(year, month, day);
    const key = `${userId}_${date}`;
    const current = records[key] || null;
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];
    // Optimistic update
    setRecords((m) => { const c = { ...m }; if (next) c[key] = next; else delete c[key]; return c; });
    setSaving(true);
    try {
      if (next) await api.post('/staff/attendance', { userId, date, status: next });
      else await api.delete('/staff/attendance', { params: { userId, date } });
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to update', type: 'error' });
      loadMonth(); // revert to server truth on failure
    } finally { setSaving(false); }
  };

  const summary = (userId) => {
    const s = { PRESENT: 0, HALF_DAY: 0, LEAVE: 0 };
    // st can still be 'ABSENT' from a record set before that status was
    // removed — guard so an old record doesn't throw/produce NaN here.
    for (let d = 1; d <= dim; d++) { const st = records[`${userId}_${dateStr(year, month, d)}`]; if (st && s[st] !== undefined) s[st]++; }
    return s;
  };

  const days = useMemo(() => Array.from({ length: dim }, (_, i) => i + 1), [dim]);

  return (
    <div className="space-y-4">
      {/* Month navigator */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={prevMonth}><ChevronLeft size={16} /></Button>
        <span className="font-semibold text-gray-800 min-w-40 text-center">{MONTHS[month]} {year}</span>
        <Button variant="outline" size="sm" onClick={nextMonth}><ChevronRight size={16} /></Button>
        <span className="text-xs text-gray-400">Click a cell to cycle status. {saving && <Spinner size="sm" className="inline-block align-middle" />}</span>
      </div>

      <Card>
        <div className="overflow-x-auto">
          {loading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          : staff.length === 0 ? <div className="text-center text-gray-400 py-12 text-sm">No staff members yet.</div>
          : (
            <div className="min-w-[640px]">
              {/* Header: day numbers */}
              <div className="grid border-b bg-gray-50" style={{ gridTemplateColumns: `160px repeat(${dim}, minmax(22px, 1fr))` }}>
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Staff</div>
                {days.map((d) => {
                  const dow = new Date(year, month, d).getDay();
                  const isToday = year === today.y && month === today.m && d === today.d;
                  return (
                    <div key={d} className="py-1 text-center border-l">
                      <div className={`text-[10px] leading-none ${dow === 0 ? 'text-red-500' : 'text-gray-500'} ${isToday ? 'font-extrabold' : ''}`}>{d}</div>
                      <div className="text-[9px] text-gray-300 leading-none mt-0.5">{DOW[dow]}</div>
                    </div>
                  );
                })}
              </div>

              {/* Staff rows */}
              {staff.map((s) => {
                const sum = summary(s._id);
                return (
                  <div key={s._id} className="grid border-b last:border-b-0 hover:bg-gray-50/50" style={{ gridTemplateColumns: `160px repeat(${dim}, minmax(22px, 1fr))` }}>
                    <div className="px-3 py-2 flex flex-col justify-center">
                      <span className="text-sm font-medium truncate">{s.name}</span>
                      <span className="text-[10px] text-gray-400">
                        F{sum.PRESENT} · H{sum.HALF_DAY} · L{sum.LEAVE}
                      </span>
                    </div>
                    {days.map((d) => {
                      const st = records[`${s._id}_${dateStr(year, month, d)}`];
                      const meta = st ? ATT_STATUS[st] : null;
                      const isToday = year === today.y && month === today.m && d === today.d;
                      return (
                        <button
                          key={d}
                          onClick={() => cycle(s._id, d)}
                          title={meta ? meta.title : 'Not marked'}
                          className="border-l h-9 flex items-center justify-center transition-colors hover:opacity-80"
                          style={{ background: meta ? meta.bg : (isToday ? '#eff6ff' : 'transparent') }}
                        >
                          {meta && <span className="text-[11px] font-extrabold" style={{ color: meta.text }}>{meta.label}</span>}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Legend */}
      <div className="flex gap-4 flex-wrap">
        {Object.entries(ATT_STATUS).map(([k, m]) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded flex items-center justify-center text-[11px] font-extrabold" style={{ background: m.bg, color: m.text }}>{m.label}</span>
            <span className="text-xs text-gray-500">{m.title}</span>
          </div>
        ))}
        <span className="text-xs text-gray-400">Tap repeatedly to cycle; one more tap clears the mark.</span>
      </div>
    </div>
  );
}

// ─── Salary tab ───────────────────────────────────────────────
function SalaryTab() {
  const toast = useToast();
  const [staff, setStaff] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStaff, setFilterStaff] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ userId: '', amount: '', periodLabel: '', method: 'CASH', type: 'SALARY', note: '' });
  const [saving, setSaving] = useState(false);

  const loadStaff = () => api.get('/staff/options').then(({ data }) => setStaff(data.staff));
  const loadPayments = () => {
    setLoading(true);
    api.get('/staff/salary', { params: { userId: filterStaff || undefined } })
      .then(({ data }) => setPayments(data.payments)).finally(() => setLoading(false));
  };
  useEffect(() => { loadStaff(); }, []);
  useEffect(() => { loadPayments(); }, [filterStaff]);

  const submit = async () => {
    if (!form.userId || !form.amount) { toast({ message: 'Select staff and enter amount', type: 'error' }); return; }
    setSaving(true);
    try {
      await api.post('/staff/salary', form);
      toast({ message: 'Payment recorded', type: 'success' });
      setShowAdd(false);
      setForm({ userId: '', amount: '', periodLabel: '', method: 'CASH', type: 'SALARY', note: '' });
      loadPayments();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to record', type: 'error' });
    } finally { setSaving(false); }
  };

  const del = async (id) => {
    if (!confirm('Delete this payment record?')) return;
    try { await api.delete(`/staff/salary/${id}`); loadPayments(); toast({ message: 'Deleted', type: 'success' }); }
    catch { toast({ message: 'Failed to delete', type: 'error' }); }
  };

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Staff:</label>
          <Select value={filterStaff} onChange={(e) => setFilterStaff(e.target.value)} className="w-48">
            <option value="">All staff</option>
            {staff.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </Select>
          <span className="text-sm text-gray-500">Total: <strong className="text-gray-800">₹{totalPaid.toLocaleString()}</strong></span>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}><Plus size={13} className="mr-1.5" /> Record Payment</Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          {loading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          : payments.length === 0 ? <div className="text-center text-gray-400 py-12">No salary payments recorded</div>
          : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>{['Date', 'Staff', 'Type', 'Period', 'Amount', 'Method', 'Note', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y">
                {payments.map((p) => (
                  <tr key={p._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(p.createdAt)}</td>
                    <td className="px-4 py-3 font-medium">{p.userId?.name || '—'}</td>
                    <td className="px-4 py-3"><Badge variant={p.type === 'DEDUCTION' ? 'danger' : p.type === 'ADVANCE' ? 'warning' : p.type === 'BONUS' ? 'info' : 'secondary'}>{p.type}</Badge></td>
                    <td className="px-4 py-3 text-gray-600">{p.periodLabel || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-green-700">₹{p.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-500">{p.method}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{p.note || '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => del(p._id)} className="p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {showAdd && (
        <Modal open onClose={() => setShowAdd(false)} title="Record Salary Payment">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Staff *</label>
              <Select value={form.userId} onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}>
                <option value="">Select staff…</option>
                {staff.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Amount (₹) *</label>
                <Input type="number" min="1" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Type</label>
                <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                  {['SALARY', 'ADVANCE', 'BONUS', 'DEDUCTION'].map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Period</label>
                <Input value={form.periodLabel} onChange={(e) => setForm((f) => ({ ...f, periodLabel: e.target.value }))} placeholder="e.g. June 2026" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Method</label>
                <Select value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}>
                  {['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'OTHER'].map((m) => <option key={m} value={m}>{m}</option>)}
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Note</label>
              <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Optional" />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button onClick={submit} disabled={saving}>{saving ? <Spinner size="sm" className="mr-1" /> : null} Record</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Sales by Staff tab ───────────────────────────────────────
function SalesByStaffTab() {
  const [rows, setRows] = useState([]);
  const [grand, setGrand] = useState({ total: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(monthAgoStr());
  const [endDate, setEndDate] = useState(todayStr());

  const load = () => {
    setLoading(true);
    api.get('/staff/sales-by-staff', { params: { startDate: startDate || undefined, endDate: endDate || undefined } })
      .then(({ data }) => { setRows(data.rows); setGrand({ total: data.grandTotal, count: data.grandCount }); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [startDate, endDate]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 flex items-center gap-3 flex-wrap">
          <label className="text-sm text-gray-600">From:</label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
          <label className="text-sm text-gray-600">To:</label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
          {(startDate || endDate) && <Button variant="ghost" size="sm" onClick={() => { setStartDate(''); setEndDate(''); }}>Clear</Button>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-gray-500">Total Sales (period)</p><p className="text-2xl font-bold text-green-700 mt-1">₹{grand.total.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-gray-500">Transactions</p><p className="text-2xl font-bold mt-1">{grand.count}</p></CardContent></Card>
      </div>

      <Card>
        <div className="overflow-x-auto">
          {loading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div> : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>{['Staff', 'Role', 'Transactions', 'Total Sales', 'Avg / Sale', 'Share'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.userId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3"><Badge variant={r.role === 'ADMIN' ? 'default' : 'secondary'}>{r.role}</Badge></td>
                    <td className="px-4 py-3 text-gray-600">{r.count}</td>
                    <td className="px-4 py-3 font-semibold text-green-700">₹{r.totalSales.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-600">{r.count ? `₹${Math.round(r.totalSales / r.count).toLocaleString()}` : '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{grand.total ? `${((r.totalSales / grand.total) * 100).toFixed(1)}%` : '—'}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-10">No data</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── Main Staff page ──────────────────────────────────────────
export default function Staff() {
  const [tab, setTab] = useState('directory');
  const tabs = [
    { id: 'directory', label: 'Staff', icon: Users },
    { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
    { id: 'salary', label: 'Salary', icon: Wallet },
    { id: 'sales', label: 'Sales by Staff', icon: TrendingUp },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Staff Management</h1>
        <p className="text-gray-500 text-sm mt-1">Manage staff, attendance, salary, and sales performance</p>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${tab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'directory' && <StaffDirectory />}
      {tab === 'attendance' && <AttendanceTab />}
      {tab === 'salary' && <SalaryTab />}
      {tab === 'sales' && <SalesByStaffTab />}
    </div>
  );
}
