import React, { useEffect, useState } from 'react';
import {
  Plus, Trash2, Edit2, UserCog, AlertTriangle, ShieldAlert, Eye, EyeOff, Star, Clock, Zap,
  Building2, FolderTree, PackageX, X, Printer, Palette, User, Hash, Receipt,
  ChevronRight, Menu, Wallet,
} from 'lucide-react';
import useAuthStore from '../store/useAuthStore';
import { useToast } from '../components/ui/Toast';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import PermissionEditor from '../components/PermissionEditor';
import { SECTIONS } from '../config/permissions';
import { LABEL_SIZES, DEFAULT_LABEL_PRINT } from '../utils/labels';
import api from '../utils/api';

const DEFAULT_STAFF_PERMS = { sections: ['dashboard', 'pos', 'products', 'sales'], viewCostPrice: false };

function AddUserForm({ onDone, onClose }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'STAFF' });
  const [permissions, setPermissions] = useState({ ...DEFAULT_STAFF_PERMS });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Permissions only sent for STAFF; admins implicitly have full access
      const payload = form.role === 'STAFF' ? { ...form, permissions } : form;
      await api.post('/auth/register', payload);
      toast({ message: `User ${form.name} created`, type: 'success' });
      onDone();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to create user', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium block mb-1">Full Name *</label>
        <Input value={form.name} onChange={set('name')} required />
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">Email *</label>
        <Input type="email" value={form.email} onChange={set('email')} required />
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">Password *</label>
        <Input type="password" value={form.password} onChange={set('password')} required minLength={6} />
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">Role</label>
        <Select value={form.role} onChange={set('role')}>
          <option value="STAFF">Staff</option>
          <option value="ADMIN">Admin</option>
        </Select>
      </div>

      {form.role === 'STAFF' ? (
        <div className="border-t pt-3">
          <PermissionEditor value={permissions} onChange={setPermissions} />
        </div>
      ) : (
        <p className="text-xs text-gray-500 border-t pt-3">Admins have full access to every section.</p>
      )}

      <div className="flex justify-end gap-3 pt-2 border-t">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Spinner size="sm" className="mr-2" /> : null}
          Create User
        </Button>
      </div>
    </form>
  );
}

function EditUserModal({ user, isSelf, onSaved, onClose }) {
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [permissions, setPermissions] = useState({
    sections: user.permissions?.sections || [...DEFAULT_STAFF_PERMS.sections],
    viewCostPrice: !!user.permissions?.viewCostPrice,
    canManage: !!user.permissions?.canManage,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name, role };
      if (role === 'STAFF') payload.permissions = permissions;
      const { data } = await api.put(`/users/${user._id}`, payload);
      toast({ message: `User ${data.user.name} updated`, type: 'success' });
      onSaved(data.user);
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to update user', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Edit ${user.name}`} size="default">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium block mb-1">Full Name *</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Email</label>
          <Input value={user.email} disabled className="bg-gray-50 text-gray-500" />
          <p className="text-xs text-gray-400 mt-1">Email can't be changed here.</p>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Role</label>
          <Select value={role} onChange={(e) => setRole(e.target.value)} disabled={isSelf}>
            <option value="STAFF">Staff</option>
            <option value="ADMIN">Admin</option>
          </Select>
          {isSelf && <p className="text-xs text-gray-400 mt-1">You can't change your own role.</p>}
        </div>

        {role === 'STAFF' ? (
          <div className="border-t pt-3">
            <PermissionEditor value={permissions} onChange={setPermissions} />
          </div>
        ) : (
          <p className="text-xs text-gray-500 border-t pt-3">Admins have full access to every section.</p>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? <Spinner size="sm" className="mr-2" /> : null}
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetAllModal({ onClose }) {
  const toast = useToast();
  const { logout } = useAuthStore();
  const [step, setStep] = useState(1); // 1 = warning, 2 = password entry
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    setResetting(true);
    try {
      await api.post('/auth/reset-all', { password });
      toast({ message: 'All data deleted. Logging you out…', type: 'success' });
      setTimeout(() => logout(), 1500);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Reset failed. Check your password.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Reset All Data" size="sm">
      {step === 1 ? (
        <div className="space-y-4">
          <div className="flex gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <ShieldAlert size={22} className="text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-bold text-red-800 mb-2 text-base">This will permanently erase all data.</p>
              <p className="text-red-700 mb-2">The following will be deleted from the database:</p>
              <ul className="list-disc list-inside text-red-600 space-y-1 ml-1">
                <li>All products and their images</li>
                <li>All stock movements and purchase records</li>
                <li>All suppliers and payment history</li>
                <li>All POS sale transactions &amp; web orders</li>
                <li>All customer accounts</li>
                <li>All staff &amp; admin users</li>
                <li>All settings, coupons, attendance &amp; salary records</li>
              </ul>
              <p className="mt-3 text-red-500 font-medium">
                A fresh admin login will be restored: <strong>admin@commoncart.com</strong> / <strong>Admin@123</strong>.
              </p>
              <p className="mt-1 text-red-400 text-xs">This action cannot be undone.</p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => setStep(2)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              I understand, continue
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleReset} className="space-y-4">
          <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            Enter your admin password to confirm this irreversible action.
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Your Password *</label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="Enter your password"
                required
                autoFocus
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => { setStep(1); setPassword(''); setError(''); }}>
              Back
            </Button>
            <Button
              type="submit"
              disabled={resetting || !password}
              className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
            >
              {resetting ? <Spinner size="sm" className="mr-2" /> : <Trash2 size={14} className="mr-2" />}
              Delete All Data
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default function Settings() {
  const toast = useToast();
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [tab, setTab] = useState('users');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [creditConfig, setCreditConfig] = useState({ rupeesPerPoint: 1000, pointValue: 1 });
  const [savingCredit, setSavingCredit] = useState(false);

  const DEFAULT_STEPS = [
    { days: 30,  label: 'Fresh (30 days)',           percent: 0  },
    { days: 60,  label: 'Slow-moving (60 days)',      percent: 5  },
    { days: 90,  label: 'Clearance (90 days)',        percent: 10 },
    { days: 120, label: 'Heavy Discount (120 days)',  percent: 15 },
    { days: 180, label: 'Half-Year Sale (180 days)',  percent: 20 },
    { days: 365, label: 'Annual Clearance (1 Year)',  percent: 30 },
    { days: 730, label: 'Deep Clearance (2+ Years)',  percent: 50 },
  ];
  const [agingConfig, setAgingConfig] = useState({ enabled: false, steps: DEFAULT_STEPS });
  const [savingAging, setSavingAging] = useState(false);
  const [applyingAging, setApplyingAging] = useState(false);

  const [business, setBusiness] = useState({
    businessName: '', addressLine: '', phone: '', email: '',
    gstin: '', gstEnabled: false, gstPercent: 18, gstInclusive: true,
    stateName: '', footerNote: 'Thank you for shopping!',
  });
  const [savingBusiness, setSavingBusiness] = useState(false);

  // Category catalog: [{ name, subCategories: [] }]
  const [categories, setCategories] = useState([]);
  const [savingCategories, setSavingCategories] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [newSub, setNewSub] = useState({}); // { [catIndex]: 'sub name' }

  const [autoDelete, setAutoDelete] = useState({ enabled: false, days: 3 });
  const [savingAutoDelete, setSavingAutoDelete] = useState(false);
  const [runningAutoDelete, setRunningAutoDelete] = useState(false);

  const [labelPrint, setLabelPrint] = useState(DEFAULT_LABEL_PRINT);
  const [savingLabelPrint, setSavingLabelPrint] = useState(false);

  const [billPrint, setBillPrint] = useState({ paperSize: '80mm', customWidthMm: 80 });
  const [savingBillPrint, setSavingBillPrint] = useState(false);

  const [barcodeConfig, setBarcodeConfig] = useState({ startFrom: 1000000 });
  const [barcodeNextVal, setBarcodeNextVal] = useState(null);
  const [savingBarcodeConfig, setSavingBarcodeConfig] = useState(false);

  const DOC_TYPE_LABELS = { INV: 'Invoice (Sale)', PUR: 'Purchase', CN: 'Credit Note', RN: 'Replacement Note', ORD: 'Order (Web)' };
  const DOC_TYPES = ['INV', 'PUR', 'CN', 'RN', 'ORD'];
  const defaultDocConfig = (prefix) => ({ format: 'YYMMNNNN', prefix, digits: 4 });
  const [docNumbering, setDocNumbering] = useState(
    DOC_TYPES.reduce((acc, t) => { acc[t] = defaultDocConfig(t); return acc; }, {})
  );
  const [activeDocType, setActiveDocType] = useState('INV');
  const [savingDocNumbering, setSavingDocNumbering] = useState(false);

  // Variants & sizes master lists
  const [variants, setVariants] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [newVariant, setNewVariant] = useState('');
  const [newSize, setNewSize] = useState('');
  const [savingVariants, setSavingVariants] = useState(false);

  // Payment modes offered at POS checkout / split payment
  const [paymentModes, setPaymentModes] = useState([]);
  const [newModeKey, setNewModeKey] = useState('');
  const [newModeLabel, setNewModeLabel] = useState('');
  const [savingPaymentModes, setSavingPaymentModes] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/users');
      setUsers(data.users);
    } catch {
      // non-admin won't have access
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    api.get('/settings/credit-config').then(({ data }) => setCreditConfig(data.config)).catch(() => {});
    api.get('/settings/aging-config').then(({ data }) => setAgingConfig(data.config)).catch(() => {});
    api.get('/settings/business-config').then(({ data }) => setBusiness(data.config)).catch(() => {});
    api.get('/settings/category-config').then(({ data }) => setCategories(data.config?.categories || [])).catch(() => {});
    api.get('/settings/auto-delete-config').then(({ data }) => setAutoDelete(data.config)).catch(() => {});
    api.get('/settings/label-print-config').then(({ data }) => setLabelPrint({ ...DEFAULT_LABEL_PRINT, ...data.config, content: { ...DEFAULT_LABEL_PRINT.content, ...(data.config?.content || {}) } })).catch(() => {});
    api.get('/settings/bill-print-config').then(({ data }) => setBillPrint(data.config)).catch(() => {});
    api.get('/settings/variant-config').then(({ data }) => { setVariants(data.config?.variants || []); setSizes(data.config?.sizes || []); }).catch(() => {});
    api.get('/settings/payment-modes-config').then(({ data }) => setPaymentModes(data.config?.modes || [])).catch(() => {});
    api.get('/settings/barcode-config').then(({ data }) => { setBarcodeConfig(data.config); setBarcodeNextVal(data.nextBarcode); }).catch(() => {});
    api.get('/settings/doc-numbering-config').then(({ data }) => setDocNumbering((c) => ({ ...c, ...data.config }))).catch(() => {});
  }, []);

  // ─── Variants & sizes handlers ───
  const addToList = (list, setList, value, setValue) => {
    const v = value.trim();
    if (!v) return;
    if (list.some((x) => x.toLowerCase() === v.toLowerCase())) { toast({ message: 'Already exists', type: 'warning' }); return; }
    setList([...list, v]);
    setValue('');
  };
  const removeFromList = (list, setList, value) => setList(list.filter((x) => x !== value));

  const handleSaveVariants = async () => {
    setSavingVariants(true);
    try {
      const { data } = await api.put('/settings/variant-config', { variants, sizes });
      setVariants(data.config?.variants || []);
      setSizes(data.config?.sizes || []);
      toast({ message: 'Variants & sizes saved', type: 'success' });
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to save', type: 'error' });
    } finally { setSavingVariants(false); }
  };

  // ─── Payment modes handlers ───
  const addPaymentMode = () => {
    const label = newModeLabel.trim();
    if (!label) return;
    const key = (newModeKey.trim() || label).toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (paymentModes.some((m) => m.key === key)) { toast({ message: 'A mode with this key already exists', type: 'warning' }); return; }
    setPaymentModes([...paymentModes, { key, label }]);
    setNewModeKey(''); setNewModeLabel('');
  };
  const removePaymentMode = (key) => setPaymentModes(paymentModes.filter((m) => m.key !== key));

  const handleSavePaymentModes = async () => {
    setSavingPaymentModes(true);
    try {
      const { data } = await api.put('/settings/payment-modes-config', { modes: paymentModes });
      setPaymentModes(data.config?.modes || []);
      toast({ message: 'Payment modes saved', type: 'success' });
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to save', type: 'error' });
    } finally { setSavingPaymentModes(false); }
  };

  const handleSaveLabelPrint = async () => {
    setSavingLabelPrint(true);
    try {
      const { data } = await api.put('/settings/label-print-config', labelPrint);
      setLabelPrint({ ...DEFAULT_LABEL_PRINT, ...data.config, content: { ...DEFAULT_LABEL_PRINT.content, ...(data.config?.content || {}) } });
      toast({ message: 'Label printing defaults saved', type: 'success' });
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to save', type: 'error' });
    } finally { setSavingLabelPrint(false); }
  };

  const handleSaveBillPrint = async () => {
    setSavingBillPrint(true);
    try {
      const { data } = await api.put('/settings/bill-print-config', billPrint);
      setBillPrint(data.config);
      toast({ message: 'Bill print settings saved', type: 'success' });
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to save', type: 'error' });
    } finally { setSavingBillPrint(false); }
  };

  const handleSaveBarcodeConfig = async () => {
    setSavingBarcodeConfig(true);
    try {
      const { data } = await api.put('/settings/barcode-config', barcodeConfig);
      setBarcodeConfig(data.config);
      setBarcodeNextVal(data.nextBarcode);
      toast({ message: `Barcode counter reset to ${data.nextBarcode}`, type: 'success' });
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to save', type: 'error' });
    } finally { setSavingBarcodeConfig(false); }
  };

  const handleSaveDocNumbering = async () => {
    setSavingDocNumbering(true);
    try {
      const { data } = await api.put('/settings/doc-numbering-config', {
        docType: activeDocType,
        ...docNumbering[activeDocType],
      });
      setDocNumbering((c) => ({ ...c, ...data.config }));
      toast({ message: `${DOC_TYPE_LABELS[activeDocType]} number format saved`, type: 'success' });
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to save', type: 'error' });
    } finally { setSavingDocNumbering(false); }
  };

  // ─── Category catalog handlers ───
  const addCategory = () => {
    const name = newCat.trim();
    if (!name) return;
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      toast({ message: 'Category already exists', type: 'warning' });
      return;
    }
    setCategories((prev) => [...prev, { name, subCategories: [] }]);
    setNewCat('');
  };

  const removeCategory = (idx) => setCategories((prev) => prev.filter((_, i) => i !== idx));

  const addSubCategory = (idx) => {
    const sub = (newSub[idx] || '').trim();
    if (!sub) return;
    setCategories((prev) => prev.map((c, i) => {
      if (i !== idx) return c;
      if (c.subCategories.some((s) => s.toLowerCase() === sub.toLowerCase())) return c;
      return { ...c, subCategories: [...c.subCategories, sub] };
    }));
    setNewSub((s) => ({ ...s, [idx]: '' }));
  };

  const removeSubCategory = (idx, sub) =>
    setCategories((prev) => prev.map((c, i) => i === idx ? { ...c, subCategories: c.subCategories.filter((s) => s !== sub) } : c));

  const handleSaveCategories = async () => {
    setSavingCategories(true);
    try {
      const { data } = await api.put('/settings/category-config', { categories });
      setCategories(data.config?.categories || []);
      toast({ message: 'Categories saved', type: 'success' });
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to save', type: 'error' });
    } finally { setSavingCategories(false); }
  };

  // ─── Auto-delete handlers ───
  const handleSaveAutoDelete = async () => {
    setSavingAutoDelete(true);
    try {
      const { data } = await api.put('/settings/auto-delete-config', autoDelete);
      setAutoDelete(data.config);
      toast({ message: 'Auto-delete settings saved', type: 'success' });
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to save', type: 'error' });
    } finally { setSavingAutoDelete(false); }
  };

  const handleRunAutoDelete = async () => {
    if (!confirm('Permanently delete all products that have been out of stock past the threshold now?')) return;
    setRunningAutoDelete(true);
    try {
      // The "enabled" toggle shown on screen isn't persisted until Save is
      // clicked — save it first so "Run Now" always acts on what's actually
      // displayed, instead of erroring against the last-saved (possibly
      // still-disabled) config in the database.
      const { data: savedConfig } = await api.put('/settings/auto-delete-config', autoDelete);
      setAutoDelete(savedConfig.config);
      const { data } = await api.post('/settings/auto-delete-run');
      toast({ message: data.message, type: 'success' });
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to run', type: 'error' });
    } finally { setRunningAutoDelete(false); }
  };

  const handleSaveBusiness = async (e) => {
    e.preventDefault();
    setSavingBusiness(true);
    try {
      const { data } = await api.put('/settings/business-config', business);
      setBusiness(data.config);
      toast({ message: 'Business settings saved', type: 'success' });
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to save', type: 'error' });
    } finally {
      setSavingBusiness(false);
    }
  };

  const handleDelete = async (u) => {
    if (u._id === currentUser?.id) { toast({ message: "You can't delete yourself", type: 'warning' }); return; }
    if (!confirm(`Delete user "${u.name}"?`)) return;
    try {
      await api.delete(`/users/${u._id}`);
      setUsers((prev) => prev.filter((x) => x._id !== u._id));
      toast({ message: 'User deleted', type: 'success' });
    } catch {
      toast({ message: 'Failed to delete user', type: 'error' });
    }
  };

  const handleRoleChange = async (u, role) => {
    try {
      await api.put(`/users/${u._id}`, { role });
      setUsers((prev) => prev.map((x) => x._id === u._id ? { ...x, role } : x));
      toast({ message: 'Role updated', type: 'success' });
    } catch {
      toast({ message: 'Failed to update role', type: 'error' });
    }
  };

  const handleSaveCreditConfig = async (e) => {
    e.preventDefault();
    setSavingCredit(true);
    try {
      await api.put('/settings/credit-config', creditConfig);
      toast({ message: 'Credit config saved', type: 'success' });
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to save', type: 'error' });
    } finally {
      setSavingCredit(false);
    }
  };

  const handleSaveAgingConfig = async (e) => {
    e.preventDefault();
    setSavingAging(true);
    try {
      const { data } = await api.put('/settings/aging-config', agingConfig);
      setAgingConfig(data.config);
      toast({ message: 'Price aging config saved', type: 'success' });
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to save', type: 'error' });
    } finally { setSavingAging(false); }
  };

  const handleApplyAgingNow = async () => {
    if (!confirm('Apply aging discounts to all eligible products right now?')) return;
    setApplyingAging(true);
    try {
      const { data } = await api.post('/settings/aging-apply');
      toast({ message: data.message, type: 'success' });
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to apply', type: 'error' });
    } finally { setApplyingAging(false); }
  };

  const setStep = (idx, field, value) => {
    setAgingConfig((prev) => {
      const steps = [...prev.steps];
      steps[idx] = { ...steps[idx], [field]: field === 'label' ? value : Number(value) };
      return { ...prev, steps };
    });
  };

  const isAdmin = currentUser?.role === 'ADMIN';

  // Grouped nav — each group renders as a labelled section in the sidebar.
  // Keeping groups small and task-oriented (rather than one long flat list)
  // is what actually scales as more settings tabs get added over time.
  const navGroups = [
    {
      label: 'Account',
      items: [
        { id: 'users', label: 'User Management', icon: UserCog },
        { id: 'profile', label: 'My Profile', icon: User },
      ],
    },
    ...(isAdmin ? [{
      label: 'Store & Billing',
      items: [
        { id: 'business', label: 'Business & GST', icon: Building2 },
        { id: 'billprint', label: 'Bill Printing', icon: Receipt },
        { id: 'invoice', label: 'Document Numbers', icon: Hash },
        { id: 'credit', label: 'Credit & Loyalty', icon: Star },
        { id: 'paymentmodes', label: 'Payment Modes', icon: Wallet },
      ],
    }] : []),
    ...(isAdmin ? [{
      label: 'Catalog',
      items: [
        { id: 'categories', label: 'Categories', icon: FolderTree },
        { id: 'variants', label: 'Variants & Sizes', icon: Palette },
        { id: 'barcodes', label: 'Barcode Numbering', icon: Hash },
        { id: 'labels', label: 'Label Printing', icon: Printer },
      ],
    }] : []),
    ...(isAdmin ? [{
      label: 'Automation',
      items: [
        { id: 'aging', label: 'Price Aging', icon: Clock },
        { id: 'autodelete', label: 'Auto-Delete', icon: PackageX },
      ],
    }] : []),
    ...(isAdmin ? [{
      label: 'Danger Zone',
      danger: true,
      items: [
        { id: 'danger', label: 'Delete All Data', icon: ShieldAlert },
      ],
    }] : []),
  ];

  const activeItem = navGroups.flatMap((g) => g.items).find((i) => i.id === tab);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500 text-sm mt-1">Manage users and system preferences</p>
        </div>
        <button
          onClick={() => setMobileNavOpen((v) => !v)}
          className="lg:hidden inline-flex items-center gap-2 text-sm font-medium text-gray-600 border rounded-lg px-3 py-2 hover:bg-gray-50"
        >
          <Menu size={16} /> {activeItem?.label || 'Menu'}
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Sidebar nav */}
        <nav className={`w-full lg:w-64 shrink-0 lg:sticky lg:top-6 ${mobileNavOpen ? 'block' : 'hidden'} lg:block`}>
          <div className="space-y-5 bg-white border rounded-xl p-3 shadow-sm">
            {navGroups.map((group) => (
              <div key={group.label}>
                <p className={`px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider ${group.danger ? 'text-red-400' : 'text-gray-400'}`}>
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = tab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => { setTab(item.id); setMobileNavOpen(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors group ${
                          active
                            ? group.danger ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
                            : group.danger ? 'text-red-500 hover:bg-red-50/60' : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Icon size={16} className={active ? '' : 'opacity-70 group-hover:opacity-100'} />
                        <span className="flex-1 text-left">{item.label}</span>
                        {active && <ChevronRight size={14} className="opacity-60" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Active panel */}
        <div className="flex-1 min-w-0 w-full">

      {tab === 'users' && (
        <div className="space-y-4">
          {currentUser?.role === 'ADMIN' && (
            <div className="flex justify-end">
              <Button onClick={() => setShowAddUser(true)}>
                <Plus size={16} className="mr-2" /> Add User
              </Button>
            </div>
          )}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <UserCog size={18} /> Staff Members
              </CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {['Name', 'Email', 'Role', 'Joined', 'Actions'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {users.map((u) => (
                      <tr key={u._id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium">{u.name}</span>
                            {u._id === currentUser?.id && <Badge variant="info" className="text-xs">You</Badge>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{u.email}</td>
                        <td className="px-4 py-3">
                          {currentUser?.role === 'ADMIN' && u._id !== currentUser?.id ? (
                            <Select
                              value={u.role}
                              onChange={(e) => handleRoleChange(u, e.target.value)}
                              className="h-7 text-xs w-24"
                            >
                              <option value="STAFF">Staff</option>
                              <option value="ADMIN">Admin</option>
                            </Select>
                          ) : (
                            <Badge variant={u.role === 'ADMIN' ? 'default' : 'secondary'}>{u.role}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          {currentUser?.role === 'ADMIN' && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setEditingUser(u)}
                                className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"
                                title="Edit user"
                              >
                                <Edit2 size={14} />
                              </button>
                              {u._id !== currentUser?.id && (
                                <button
                                  onClick={() => handleDelete(u)}
                                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"
                                  title="Delete user"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr><td colSpan={5} className="py-8 text-center text-gray-400">No users found</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      )}

      {tab === 'profile' && (
        <Card>
          <CardHeader><CardTitle className="text-base">My Profile</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4 max-w-sm">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-blue-500 flex items-center justify-center text-2xl font-bold text-white">
                  {currentUser?.name?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-lg">{currentUser?.name}</div>
                  <div className="text-gray-500 text-sm">{currentUser?.email}</div>
                  <Badge variant={currentUser?.role === 'ADMIN' ? 'default' : 'secondary'} className="mt-1">{currentUser?.role}</Badge>
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-500">
                To change your password or profile details, contact your system administrator.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'business' && (
        <div className="max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 size={16} className="text-blue-500" /> Business &amp; GST Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">
                These details appear on every printed and shared bill. Configure your shop's GST here.
              </p>
              <form onSubmit={handleSaveBusiness} className="space-y-5">
                {/* Business identity */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium block mb-1">Business / Shop Name</label>
                    <Input value={business.businessName} onChange={(e) => setBusiness((b) => ({ ...b, businessName: e.target.value }))} placeholder="e.g. CommonCart Store" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium block mb-1">Address</label>
                    <Input value={business.addressLine} onChange={(e) => setBusiness((b) => ({ ...b, addressLine: e.target.value }))} placeholder="Street, City, PIN" />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Phone</label>
                    <Input value={business.phone} onChange={(e) => setBusiness((b) => ({ ...b, phone: e.target.value }))} placeholder="Contact number" />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Email</label>
                    <Input value={business.email} onChange={(e) => setBusiness((b) => ({ ...b, email: e.target.value }))} placeholder="shop@example.com" />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">State</label>
                    <Input value={business.stateName} onChange={(e) => setBusiness((b) => ({ ...b, stateName: e.target.value }))} placeholder="e.g. Maharashtra" />
                  </div>
                </div>

                {/* GST section */}
                <div className="border-t pt-4 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-800">GST Configuration</h3>
                  <div>
                    <label className="text-sm font-medium block mb-1">GSTIN (GST Number)</label>
                    <Input
                      value={business.gstin}
                      onChange={(e) => setBusiness((b) => ({ ...b, gstin: e.target.value.toUpperCase() }))}
                      placeholder="22AAAAA0000A1Z5"
                      className="font-mono uppercase"
                    />
                    <p className="text-xs text-gray-400 mt-1">15-character GST identification number printed on every bill.</p>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={business.gstEnabled}
                      onChange={(e) => setBusiness((b) => ({ ...b, gstEnabled: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm font-medium">Show GST breakup on bills</span>
                  </label>

                  {business.gstEnabled && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6">
                      <div>
                        <label className="text-sm font-medium block mb-1">GST Rate (%)</label>
                        <Input
                          type="number" min="0" max="100" step="0.01"
                          value={business.gstPercent}
                          onChange={(e) => setBusiness((b) => ({ ...b, gstPercent: Number(e.target.value) }))}
                        />
                        <p className="text-xs text-gray-400 mt-1">Split equally as CGST {(business.gstPercent / 2) || 0}% + SGST {(business.gstPercent / 2) || 0}% on bills.</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium block mb-1">Price Basis</label>
                        <Select value={business.gstInclusive ? 'inclusive' : 'exclusive'} onChange={(e) => setBusiness((b) => ({ ...b, gstInclusive: e.target.value === 'inclusive' }))}>
                          <option value="inclusive">Prices include GST</option>
                          <option value="exclusive">Add GST on top of prices</option>
                        </Select>
                      </div>
                      <div className="md:col-span-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                        {business.gstInclusive
                          ? `Bill shows the GST already contained in the total (e.g. on ₹100 at ${business.gstPercent}%, the GST portion ≈ ₹${(100 - 100 / (1 + business.gstPercent / 100)).toFixed(2)}).`
                          : `Bill adds ${business.gstPercent}% on top of the subtotal (e.g. ₹100 + ₹${(100 * business.gstPercent / 100).toFixed(2)} GST = ₹${(100 * (1 + business.gstPercent / 100)).toFixed(2)}).`}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer note */}
                <div className="border-t pt-4">
                  <label className="text-sm font-medium block mb-1">Bill Footer Note</label>
                  <Input value={business.footerNote} onChange={(e) => setBusiness((b) => ({ ...b, footerNote: e.target.value }))} placeholder="Thank you for shopping!" />
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={savingBusiness}>
                    {savingBusiness ? <Spinner size="sm" className="mr-2" /> : null}
                    Save Business Settings
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'categories' && (
        <div className="max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FolderTree size={16} className="text-indigo-500" /> Categories &amp; Sub-categories
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">
                Define the categories and sub-categories available when creating a product.
                Only these will appear in the product form's dropdowns.
              </p>

              {/* Add a new category */}
              <div className="flex gap-2 mb-4">
                <Input
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
                  placeholder="New category name (e.g. Electronics)"
                />
                <Button type="button" onClick={addCategory}><Plus size={16} className="mr-1" /> Add</Button>
              </div>

              {categories.length === 0 ? (
                <div className="text-center text-gray-400 py-8 text-sm border rounded-lg">
                  No categories yet. Add one above to get started.
                </div>
              ) : (
                <div className="space-y-3">
                  {categories.map((cat, idx) => (
                    <div key={idx} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-800">{cat.name}</span>
                        <button
                          onClick={() => removeCategory(idx)}
                          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"
                          title="Remove category"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Sub-categories */}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {cat.subCategories.map((sub) => (
                          <span key={sub} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs rounded-full pl-2.5 pr-1 py-1">
                            {sub}
                            <button
                              onClick={() => removeSubCategory(idx, sub)}
                              className="rounded-full hover:bg-gray-300 p-0.5"
                              title="Remove sub-category"
                            >
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                        {cat.subCategories.length === 0 && (
                          <span className="text-xs text-gray-400">No sub-categories</span>
                        )}
                      </div>

                      <div className="flex gap-2 mt-2">
                        <Input
                          value={newSub[idx] || ''}
                          onChange={(e) => setNewSub((s) => ({ ...s, [idx]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSubCategory(idx); } }}
                          placeholder="Add sub-category"
                          className="h-8 text-sm"
                        />
                        <Button type="button" variant="outline" size="sm" onClick={() => addSubCategory(idx)}>
                          <Plus size={14} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end mt-4 pt-3 border-t">
                <Button onClick={handleSaveCategories} disabled={savingCategories}>
                  {savingCategories ? <Spinner size="sm" className="mr-2" /> : null}
                  Save Categories
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'variants' && (
        <div className="max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Palette size={16} className="text-pink-500" /> Variants &amp; Sizes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">
                Define the variants (e.g. colors/designs) and sizes available when creating products and recording purchases.
                These appear as dropdowns on those forms.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Variants */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Variants</h3>
                  <div className="flex gap-2 mb-3">
                    <Input
                      value={newVariant}
                      onChange={(e) => setNewVariant(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addToList(variants, setVariants, newVariant, setNewVariant); } }}
                      placeholder="e.g. Red, Floral"
                    />
                    <Button type="button" onClick={() => addToList(variants, setVariants, newVariant, setNewVariant)}><Plus size={16} /></Button>
                  </div>
                  <div className="flex flex-wrap gap-2 min-h-[2rem]">
                    {variants.length === 0 && <span className="text-xs text-gray-400">No variants yet</span>}
                    {variants.map((v) => (
                      <span key={v} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs rounded-full pl-2.5 pr-1 py-1">
                        {v}
                        <button onClick={() => removeFromList(variants, setVariants, v)} className="rounded-full hover:bg-gray-300 p-0.5"><X size={11} /></button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Sizes */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Sizes</h3>
                  <div className="flex gap-2 mb-3">
                    <Input
                      value={newSize}
                      onChange={(e) => setNewSize(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addToList(sizes, setSizes, newSize, setNewSize); } }}
                      placeholder="e.g. S, M, L, 42"
                    />
                    <Button type="button" onClick={() => addToList(sizes, setSizes, newSize, setNewSize)}><Plus size={16} /></Button>
                  </div>
                  <div className="flex flex-wrap gap-2 min-h-[2rem]">
                    {sizes.length === 0 && <span className="text-xs text-gray-400">No sizes yet</span>}
                    {sizes.map((s) => (
                      <span key={s} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs rounded-full pl-2.5 pr-1 py-1">
                        {s}
                        <button onClick={() => removeFromList(sizes, setSizes, s)} className="rounded-full hover:bg-gray-300 p-0.5"><X size={11} /></button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end mt-5 pt-3 border-t">
                <Button onClick={handleSaveVariants} disabled={savingVariants}>
                  {savingVariants ? <Spinner size="sm" className="mr-2" /> : null}
                  Save Variants &amp; Sizes
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'autodelete' && (
        <div className="max-w-lg">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <PackageX size={16} className="text-red-500" /> Auto-Delete Out-of-Stock Products
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">
                Automatically and permanently remove products that have been continuously
                out of stock for a set number of days. The timer resets if a product is restocked.
              </p>

              <div className="space-y-5">
                {/* Enable toggle */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium text-gray-800">Enable auto-delete when out of stock</p>
                    <p className="text-xs text-gray-500 mt-0.5">Runs automatically in the background and via "Run Now"</p>
                  </div>
                  <div
                    onClick={() => setAutoDelete((c) => ({ ...c, enabled: !c.enabled }))}
                    className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${autoDelete.enabled ? 'bg-blue-500' : 'bg-gray-300'}`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoDelete.enabled ? 'translate-x-5' : ''}`} />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium block mb-1">Days after going out of stock</label>
                  <Input
                    type="number"
                    min="1"
                    value={autoDelete.days}
                    onChange={(e) => setAutoDelete((c) => ({ ...c, days: Number(e.target.value) }))}
                    className="w-32"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    A product out of stock for {autoDelete.days || 0} day{Number(autoDelete.days) === 1 ? '' : 's'} will be permanently deleted (default 3).
                  </p>
                </div>

                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  Deletion is permanent — it removes the product, its images, and stock movement history, just like manual deletion.
                </div>

                <div className="flex items-center gap-3 pt-2 border-t">
                  <Button onClick={handleSaveAutoDelete} disabled={savingAutoDelete}>
                    {savingAutoDelete ? <Spinner size="sm" className="mr-2" /> : null}
                    Save Settings
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRunAutoDelete}
                    disabled={runningAutoDelete || !autoDelete.enabled}
                    title={!autoDelete.enabled ? 'Enable auto-delete first' : 'Delete eligible products now'}
                  >
                    {runningAutoDelete ? <Spinner size="sm" className="mr-2" /> : <Zap size={14} className="mr-2" />}
                    Run Now
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'labels' && (
        <div className="max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Printer size={16} className="text-blue-500" /> Barcode Label Printing Defaults
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">
                These defaults are applied whenever a barcode-label print dialog opens (Barcode Management, Purchase entry).
                They can still be changed per print job. Works with roll/label printers (Zebra, DYMO, TSC, Brother) and standard A4 sheet printers.
              </p>

              <div className="space-y-5">
                {/* Default size */}
                <div>
                  <label className="text-sm font-medium block mb-2">Default Label Size</label>
                  <Select value={labelPrint.sizeId} onChange={(e) => setLabelPrint((c) => ({ ...c, sizeId: e.target.value }))} className="w-full">
                    {LABEL_SIZES.map((s) => <option key={s.id} value={s.id}>{s.label} — {s.desc}</option>)}
                    <option value="custom">Custom size…</option>
                  </Select>
                  {labelPrint.sizeId === 'custom' && (
                    <div className="flex items-center gap-2 mt-2">
                      <Input type="number" min="10" max="300" value={labelPrint.customWidthMm}
                        onChange={(e) => setLabelPrint((c) => ({ ...c, customWidthMm: Number(e.target.value) }))} className="w-28" />
                      <span className="text-gray-400 text-sm">×</span>
                      <Input type="number" min="10" max="300" value={labelPrint.customHeightMm}
                        onChange={(e) => setLabelPrint((c) => ({ ...c, customHeightMm: Number(e.target.value) }))} className="w-28" />
                      <span className="text-gray-400 text-sm">mm</span>
                    </div>
                  )}
                </div>

                {/* Layout + symbology */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium block mb-2">Default Layout</label>
                    <Select value={labelPrint.layout} onChange={(e) => setLabelPrint((c) => ({ ...c, layout: e.target.value }))}>
                      <option value="1up">1 label per row</option>
                      <option value="2up">2 labels per row (2-up)</option>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-2">Default Barcode Type</label>
                    <Select value={labelPrint.symbology} onChange={(e) => setLabelPrint((c) => ({ ...c, symbology: e.target.value }))}>
                      <option value="CODE128">CODE128</option>
                      <option value="EAN13">EAN-13</option>
                    </Select>
                  </div>
                </div>

                {/* Default content */}
                <div>
                  <label className="text-sm font-medium block mb-2">Default Label Content</label>
                  <div className="flex gap-4 flex-wrap">
                    {[['company', 'Company Name'], ['name', 'Product Name'], ['price', 'Price'], ['variant', 'Variant'], ['size', 'Size'], ['sku', 'SKU']].map(([k, lbl]) => (
                      <label key={k} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input type="checkbox" checked={!!labelPrint.content[k]}
                          onChange={(e) => setLabelPrint((c) => ({ ...c, content: { ...c.content, [k]: e.target.checked } }))}
                          className="rounded" />
                        {lbl}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Default price labels */}
                <div>
                  <label className="text-sm font-medium block mb-2">Default Price Labels</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Price label (before regular price)</label>
                      <Input value={labelPrint.pricePrefix ?? ''} onChange={(e) => setLabelPrint((c) => ({ ...c, pricePrefix: e.target.value }))} placeholder="e.g. MRP" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Discount label (before discount price)</label>
                      <Input value={labelPrint.discountPrefix ?? ''} onChange={(e) => setLabelPrint((c) => ({ ...c, discountPrefix: e.target.value }))} placeholder="e.g. Offer Price" />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Printed before each price on the label (e.g. "MRP: ₹100", "Offer Price: ₹80"). Leave blank for none. Editable at print time.</p>
                </div>

                {/* Default copies */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Default Copies per Label</label>
                  <Input type="number" min="1" max="50" value={labelPrint.defaultCopies ?? 1}
                    onChange={(e) => setLabelPrint((c) => ({ ...c, defaultCopies: Math.max(1, Math.min(50, Number(e.target.value) || 1)) }))}
                    className="w-28" />
                  <p className="text-xs text-gray-400 mt-1">How many copies of each label print by default. Editable at print time.</p>
                </div>

                <div className="flex justify-end pt-2 border-t">
                  <Button onClick={handleSaveLabelPrint} disabled={savingLabelPrint}>
                    {savingLabelPrint ? <Spinner size="sm" className="mr-2" /> : null}
                    Save Defaults
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'barcodes' && (
        <div className="max-w-lg">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Printer size={16} className="text-blue-500" /> Barcode Numbering
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">
                Barcodes are assigned sequentially starting from the number you set here.
                Changing this resets the counter — all future purchases will start from the new number.
              </p>
              <div className="space-y-5">
                <div>
                  <label className="text-sm font-medium block mb-1">Start numbering barcodes from</label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min="100000"
                      max="999999"
                      value={barcodeConfig.startFrom}
                      onChange={(e) => setBarcodeConfig((c) => ({ ...c, startFrom: Number(e.target.value) }))}
                      className="w-40"
                    />
                    <span className="text-sm text-gray-500">(6-digit number, e.g. 100000)</span>
                  </div>
                  {barcodeNextVal !== null && (
                    <p className="text-xs text-gray-400 mt-2">
                      Next barcode that will be assigned: <span className="font-mono font-semibold text-blue-700">{barcodeNextVal}</span>
                    </p>
                  )}
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                  Saving resets the counter to this start number. Existing products keep their barcodes — only new purchases are affected.
                </div>
                <div className="flex justify-end pt-2 border-t">
                  <Button onClick={handleSaveBarcodeConfig} disabled={savingBarcodeConfig}>
                    {savingBarcodeConfig ? <Spinner size="sm" className="mr-2" /> : null}
                    Save &amp; Reset Counter
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'invoice' && (
        <div className="max-w-lg">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Hash size={16} className="text-indigo-500" /> Document Number Formats
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">
                Choose how each document type is numbered. Each type has its own counter and format. Changes apply to new documents only — existing numbers are unchanged.
              </p>
              <div className="space-y-5">
                <div>
                  <label className="text-sm font-medium block mb-2">Document type</label>
                  <div className="flex flex-wrap gap-2">
                    {DOC_TYPES.map((t) => (
                      <button key={t} type="button"
                        onClick={() => setActiveDocType(t)}
                        className={`px-3 py-1.5 rounded-lg border-2 text-xs font-medium transition-colors ${activeDocType === t ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-gray-200 hover:border-gray-300'}`}>
                        {DOC_TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium block mb-2">Format</label>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      ['YYMMNNNN', 'YYMMNNNN', 'Year + Month + serial (e.g. 26060001) — resets each month'],
                      ['YYYYMMNNNN', 'YYYYMMNNNN', 'Full year + Month + serial (e.g. 202606001) — resets each month'],
                      ['SEQUENTIAL', 'Sequential', 'Pure sequential global counter (e.g. 1, 2, 3…) — never resets'],
                      ['PREFIX-DATE-NNN', 'Prefix + Date + Serial', 'Custom prefix + full date + serial (e.g. INV-20260601-001) — resets each day'],
                    ].map(([id, lbl, desc]) => (
                      <button key={id} type="button"
                        onClick={() => setDocNumbering((c) => ({ ...c, [activeDocType]: { ...c[activeDocType], format: id } }))}
                        className={`text-left px-3 py-2 rounded-lg border-2 transition-colors text-xs ${docNumbering[activeDocType].format === id ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-gray-200 hover:border-gray-300'}`}>
                        <div className="font-semibold font-mono">{lbl}</div>
                        <div className="text-gray-400 mt-0.5">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium block mb-1">Prefix</label>
                  <Input
                    value={docNumbering[activeDocType].prefix}
                    onChange={(e) => setDocNumbering((c) => ({ ...c, [activeDocType]: { ...c[activeDocType], prefix: e.target.value.toUpperCase() } }))}
                    placeholder={activeDocType}
                    className="w-32 font-mono uppercase"
                    maxLength={6}
                  />
                  <p className="text-xs text-gray-400 mt-1">Letters and digits only, max 6 characters. Used for the "Prefix + Date + Serial" format.</p>
                </div>

                {docNumbering[activeDocType].format !== 'SEQUENTIAL' && (
                  <div>
                    <label className="text-sm font-medium block mb-2">Serial digits</label>
                    <div className="flex gap-3">
                      {[4, 6].map((d) => (
                        <button key={d} type="button"
                          onClick={() => setDocNumbering((c) => ({ ...c, [activeDocType]: { ...c[activeDocType], digits: d } }))}
                          className={`px-4 py-1.5 rounded border-2 text-sm font-mono transition-colors ${docNumbering[activeDocType].digits === d ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-gray-200 hover:border-gray-300'}`}>
                          {d} digits
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Number of digits in the serial part (zero-padded).</p>
                  </div>
                )}

                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-700 font-mono">
                  Preview: {
                    docNumbering[activeDocType].format === 'YYMMNNNN' ? `26060001`.padStart(docNumbering[activeDocType].digits > 4 ? 10 : 8, '') : ''
                  }{
                    docNumbering[activeDocType].format === 'YYYYMMNNNN' ? `2026060001`.padStart(docNumbering[activeDocType].digits > 4 ? 12 : 10, '') : ''
                  }{
                    docNumbering[activeDocType].format === 'SEQUENTIAL' ? '1' : ''
                  }{
                    docNumbering[activeDocType].format === 'PREFIX-DATE-NNN' ? `${docNumbering[activeDocType].prefix || activeDocType}-20260601-${'1'.padStart(docNumbering[activeDocType].digits, '0')}` : ''
                  }
                </div>

                <div className="flex justify-end pt-2 border-t">
                  <Button onClick={handleSaveDocNumbering} disabled={savingDocNumbering}>
                    {savingDocNumbering ? <Spinner size="sm" className="mr-2" /> : null}
                    Save {DOC_TYPE_LABELS[activeDocType]} Format
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'billprint' && (
        <div className="max-w-lg">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Printer size={16} className="text-blue-500" /> Bill / Receipt Printing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">
                Choose the paper size/format for printed POS &amp; purchase bills. Thermal sizes suit receipt-roll printers; A4/A5 suit office printers.
              </p>
              <div className="space-y-5">
                <div>
                  <label className="text-sm font-medium block mb-2">Paper Size / Format</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['58mm', 'Thermal 58 mm', 'Narrow receipt roll'],
                      ['80mm', 'Thermal 80 mm', 'Standard receipt roll'],
                      ['A4', 'A4 Sheet', 'Full-page invoice'],
                      ['A5', 'A5 Sheet', 'Half-page invoice'],
                      ['custom', 'Custom width', 'Set roll width (mm)'],
                    ].map(([id, lbl, desc]) => (
                      <button key={id} type="button" onClick={() => setBillPrint((c) => ({ ...c, paperSize: id }))}
                        className={`text-left px-3 py-2 rounded-lg border-2 transition-colors text-xs ${billPrint.paperSize === id ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 hover:border-gray-300'}`}>
                        <div className="font-semibold">{lbl}</div>
                        <div className="text-gray-400 mt-0.5">{desc}</div>
                      </button>
                    ))}
                  </div>
                  {billPrint.paperSize === 'custom' && (
                    <div className="flex items-center gap-2 mt-2">
                      <Input type="number" min="40" max="210" value={billPrint.customWidthMm}
                        onChange={(e) => setBillPrint((c) => ({ ...c, customWidthMm: Number(e.target.value) }))} className="w-28 h-9 text-sm" />
                      <span className="text-gray-400 text-sm">mm wide (auto height)</span>
                    </div>
                  )}
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                  This sets the page geometry; also pick the matching paper size in your printer driver. Exported PDFs/images use the same size.
                </div>
                <div className="flex justify-end pt-2 border-t">
                  <Button onClick={handleSaveBillPrint} disabled={savingBillPrint}>
                    {savingBillPrint ? <Spinner size="sm" className="mr-2" /> : null}
                    Save Bill Settings
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'credit' && (
        <div className="max-w-lg space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Star size={16} className="text-yellow-500" /> Credit Points Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveCreditConfig} className="space-y-5">
                <div>
                  <label className="text-sm font-medium block mb-1">Rupees Per Point</label>
                  <Input
                    type="number"
                    min="1"
                    value={creditConfig.rupeesPerPoint}
                    onChange={(e) => setCreditConfig((c) => ({ ...c, rupeesPerPoint: Number(e.target.value) }))}
                    required
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Customer earns 1 point for every ₹{creditConfig.rupeesPerPoint} spent.
                    E.g. ₹{(creditConfig.rupeesPerPoint * 5).toLocaleString()} purchase = 5 points.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Point Redemption Value (₹ per point)</label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={creditConfig.pointValue}
                    onChange={(e) => setCreditConfig((c) => ({ ...c, pointValue: Number(e.target.value) }))}
                    required
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    1 point = ₹{creditConfig.pointValue} discount when redeemed.
                    E.g. 10 points = ₹{(10 * creditConfig.pointValue).toFixed(2)} off.
                  </p>
                </div>
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                  <strong>Example:</strong> Customer spends ₹{(creditConfig.rupeesPerPoint * 3).toLocaleString()} →
                  earns 3 points → worth ₹{(3 * creditConfig.pointValue).toFixed(2)} in discounts.
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={savingCredit}>
                    {savingCredit ? <Spinner size="sm" className="mr-2" /> : null}
                    Save Configuration
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'paymentmodes' && (
        <div className="max-w-lg space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet size={16} className="text-blue-500" /> Payment Modes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-500">
                Modes offered at POS checkout and for split payments (e.g. GPay, PhonePe, Card). The first four
                also get the 1-4 keyboard shortcuts on the POS screen.
              </p>
              <div className="space-y-2">
                {paymentModes.map((m) => (
                  <div key={m.key} className="flex items-center justify-between bg-gray-50 border rounded-lg px-3 py-2">
                    <div>
                      <span className="text-sm font-medium">{m.label}</span>
                      <span className="text-xs text-gray-400 ml-2 font-mono">{m.key}</span>
                    </div>
                    <button type="button" onClick={() => removePaymentMode(m.key)} className="text-gray-400 hover:text-red-500">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {paymentModes.length === 0 && <p className="text-xs text-gray-400">No payment modes configured.</p>}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newModeLabel}
                  onChange={(e) => setNewModeLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPaymentMode(); } }}
                  placeholder="e.g. GPay"
                  className="flex-1"
                />
                <Button type="button" onClick={addPaymentMode}><Plus size={16} /></Button>
              </div>
              <div className="flex justify-end pt-2 border-t">
                <Button onClick={handleSavePaymentModes} disabled={savingPaymentModes}>
                  {savingPaymentModes ? <Spinner size="sm" className="mr-2" /> : null}
                  Save Payment Modes
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'aging' && (
        <div className="space-y-6 max-w-3xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock size={16} className="text-orange-500" /> Price Aging — Automatic Discount by Product Age
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">
                Define thresholds by age (days since product was created). When a product reaches a threshold,
                its <strong>discount price</strong> is automatically set to the specified percentage off the original price.
                The discount price is always floored at cost price so you never sell at a loss.
              </p>
              <form onSubmit={handleSaveAgingConfig} className="space-y-6">
                {/* Enable toggle */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium text-gray-800">Enable automatic price aging</p>
                    <p className="text-xs text-gray-500 mt-0.5">When enabled, the "Apply Now" button and future automation use these rules</p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div
                      onClick={() => setAgingConfig((c) => ({ ...c, enabled: !c.enabled }))}
                      className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${agingConfig.enabled ? 'bg-blue-500' : 'bg-gray-300'}`}
                    >
                      <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${agingConfig.enabled ? 'translate-x-5' : ''}`} />
                    </div>
                    <span className="text-sm font-medium text-gray-700">{agingConfig.enabled ? 'On' : 'Off'}</span>
                  </label>
                </div>

                {/* Steps table */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Aging Steps</p>
                  <p className="text-xs text-gray-400 mb-3">
                    Products aged ≥ a step's days but &lt; the next step get that step's discount applied.
                    Set percent to 0 to skip a step (no discount applied at that age).
                  </p>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Step Name</th>
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Age Threshold (days)</th>
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Discount %</th>
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Example (₹1000 item)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {agingConfig.steps.map((step, idx) => (
                          <tr key={idx} className={step.percent > 0 ? 'bg-orange-50/40' : ''}>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={step.label}
                                onChange={(e) => setStep(idx, 'label', e.target.value)}
                                className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number" min="1"
                                value={step.days}
                                onChange={(e) => setStep(idx, 'days', e.target.value)}
                                className="w-24 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number" min="0" max="100"
                                  value={step.percent}
                                  onChange={(e) => setStep(idx, 'percent', e.target.value)}
                                  className="w-20 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                                />
                                <span className="text-gray-500 text-xs">%</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-500">
                              {step.percent > 0
                                ? <><span className="line-through text-gray-400">₹1000</span> → <span className="font-semibold text-orange-700">₹{(1000 * (1 - step.percent / 100)).toFixed(0)}</span></>
                                : <span className="text-gray-300">No discount</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2 border-t">
                  <Button type="submit" disabled={savingAging}>
                    {savingAging ? <Spinner size="sm" className="mr-2" /> : null}
                    Save Configuration
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleApplyAgingNow}
                    disabled={applyingAging || !agingConfig.enabled}
                    title={!agingConfig.enabled ? 'Enable aging first' : 'Apply discounts to all eligible products now'}
                  >
                    {applyingAging ? <Spinner size="sm" className="mr-2" /> : <Zap size={14} className="mr-2" />}
                    Apply Now
                  </Button>
                  <span className="text-xs text-gray-400">Apply Now immediately sets discount prices on all products that match any aging step.</span>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'danger' && (
        <div className="space-y-4 max-w-2xl">
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">
              Actions in this section are <strong>permanent and irreversible</strong>. Proceed only if you fully understand the consequences.
            </p>
          </div>

          <Card className="border-red-200">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <ShieldAlert size={18} className="text-red-500" />
                    Delete All Data
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Permanently erase all products, sales, orders, inventory, purchases, and customers.
                    Your admin account will be the only thing that remains.
                  </p>
                  <ul className="mt-2 text-xs text-gray-400 list-disc list-inside space-y-0.5">
                    <li>Products, stock movements, barcodes</li>
                    <li>POS sales &amp; web orders</li>
                    <li>Purchase records</li>
                    <li>Customer accounts</li>
                    <li>All staff/admin users except you</li>
                  </ul>
                </div>
                <Button
                  onClick={() => setShowResetModal(true)}
                  className="shrink-0 bg-red-600 hover:bg-red-700 text-white"
                >
                  <Trash2 size={14} className="mr-2" />
                  Delete All Data
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

        </div>
      </div>

      <Modal open={showAddUser} onClose={() => setShowAddUser(false)} title="Add New User" size="lg">
        <AddUserForm onDone={() => { setShowAddUser(false); fetchUsers(); }} onClose={() => setShowAddUser(false)} />
      </Modal>

      {editingUser && (
        <EditUserModal
          user={editingUser}
          isSelf={editingUser._id === currentUser?.id}
          onSaved={(updated) => {
            setUsers((prev) => prev.map((x) => (x._id === updated._id ? updated : x)));
            setEditingUser(null);
          }}
          onClose={() => setEditingUser(null)}
        />
      )}

      {showResetModal && <ResetAllModal onClose={() => setShowResetModal(false)} />}
    </div>
  );
}
