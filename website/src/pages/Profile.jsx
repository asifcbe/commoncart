import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, MapPin, Package, LogOut, Plus, Trash2 } from 'lucide-react';
import useCustomerStore from '../store/useCustomerStore';
import { useToast } from '../components/ui/Toast';
import api from '../utils/api';
import Spinner from '../components/ui/Spinner';
import { applyMeta } from '../utils/theme';

export default function Profile() {
  const navigate = useNavigate();
  const toast = useToast();
  const { customer, logout, refreshMe } = useCustomerStore();
  const [tab, setTab] = useState('profile');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: customer?.name || '', phone: customer?.phone || '' });
  const [showAddAddr, setShowAddAddr] = useState(false);
  const [newAddr, setNewAddr] = useState({ label: 'Home', fullName: '', phone: '', line1: '', city: '', state: '', zip: '', country: 'US', isDefault: false });

  React.useEffect(() => { applyMeta('My Profile'); }, []);

  if (!customer) {
    navigate('/login');
    return null;
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/customers/me', form);
      await refreshMe();
      toast({ message: 'Profile updated', type: 'success' });
    } catch {
      toast({ message: 'Failed to update profile', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddAddress = async (e) => {
    e.preventDefault();
    try {
      await api.post('/customers/me/addresses', newAddr);
      await refreshMe();
      setShowAddAddr(false);
      setNewAddr({ label: 'Home', fullName: '', phone: '', line1: '', city: '', state: '', zip: '', country: 'US', isDefault: false });
      toast({ message: 'Address added', type: 'success' });
    } catch {
      toast({ message: 'Failed to add address', type: 'error' });
    }
  };

  const handleRemoveAddress = async (addrId) => {
    try {
      await api.delete(`/customers/me/addresses/${addrId}`);
      await refreshMe();
      toast({ message: 'Address removed', type: 'success' });
    } catch {
      toast({ message: 'Failed', type: 'error' });
    }
  };

  const setA = (k) => (e) => setNewAddr((a) => ({ ...a, [k]: e.target.value }));

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'addresses', label: 'Addresses', icon: MapPin },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Account</h1>
        <button
          onClick={() => { logout(); navigate('/'); }}
          className="flex items-center gap-2 text-sm text-red-500 hover:underline"
        >
          <LogOut size={15} /> Sign Out
        </button>
      </div>

      {/* Tab Nav */}
      <div className="flex gap-1 border-b mb-6">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === id ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
        <Link
          to="/orders"
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 ml-auto"
        >
          <Package size={15} /> My Orders
        </Link>
      </div>

      {tab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="card p-6 space-y-4">
          <div className="flex items-center gap-4 mb-2">
            <div
              className="h-14 w-14 rounded-full text-white text-xl font-bold flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--color-secondary)' }}
            >
              {customer.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-semibold text-gray-900">{customer.name}</div>
              <div className="text-sm text-gray-400">{customer.email}</div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
            <input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="text-xs text-gray-400">Email cannot be changed. Contact support if needed.</div>
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="btn-primary px-6 rounded-xl">
              {saving ? <Spinner size="sm" /> : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      {tab === 'addresses' && (
        <div className="space-y-4">
          {customer.addresses?.map((addr) => (
            <div key={addr._id} className="card p-4 flex items-start justify-between">
              <div className="text-sm">
                <div className="font-medium flex items-center gap-2">
                  {addr.label}
                  {addr.isDefault && <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)]">Default</span>}
                </div>
                <div className="text-gray-500 mt-1">
                  {addr.fullName}, {addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}, {addr.city}{addr.state ? `, ${addr.state}` : ''} {addr.zip}
                </div>
                {addr.phone && <div className="text-gray-400 text-xs">{addr.phone}</div>}
              </div>
              <button onClick={() => handleRemoveAddress(addr._id)} className="text-gray-300 hover:text-red-500 ml-4">
                <Trash2 size={16} />
              </button>
            </div>
          ))}

          {!showAddAddr ? (
            <button onClick={() => setShowAddAddr(true)} className="btn-outline w-full rounded-xl justify-center">
              <Plus size={16} /> Add New Address
            </button>
          ) : (
            <form onSubmit={handleAddAddress} className="card p-5 space-y-3">
              <h3 className="font-semibold text-gray-800">New Address</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
                  <input className="input" value={newAddr.label} onChange={setA('label')} placeholder="Home / Work" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
                  <input className="input" value={newAddr.fullName} onChange={setA('fullName')} required />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Address *</label>
                  <input className="input" value={newAddr.line1} onChange={setA('line1')} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">City *</label>
                  <input className="input" value={newAddr.city} onChange={setA('city')} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ZIP</label>
                  <input className="input" value={newAddr.zip} onChange={setA('zip')} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={newAddr.isDefault} onChange={(e) => setNewAddr((a) => ({ ...a, isDefault: e.target.checked }))} className="rounded" />
                Set as default address
              </label>
              <div className="flex gap-3 justify-end pt-1">
                <button type="button" onClick={() => setShowAddAddr(false)} className="btn-outline px-4 rounded-lg text-sm">Cancel</button>
                <button type="submit" className="btn-primary px-6 rounded-lg text-sm">Save Address</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
