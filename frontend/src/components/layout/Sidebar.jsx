import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Package, ShoppingCart,
  Warehouse, Receipt, Settings, LogOut, Store,
  ShoppingBag, Globe, Users, Tag, Truck, Clock, UserCog, BookOpen, DownloadCloud,
} from 'lucide-react';
import useAuthStore from '../../store/useAuthStore';
import { canAccess } from '../../config/permissions';
import { cn } from '../../utils/cn';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Spinner from '../ui/Spinner';
import { useToast } from '../ui/Toast';
import api from '../../utils/api';

// `section` maps to a grantable permission key (admins see all regardless).
const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', section: 'dashboard' },
  { to: '/products', icon: Package, label: 'Products', section: 'products' },
  { to: '/pos', icon: ShoppingCart, label: 'POS', section: 'pos' },
  { to: '/purchases', icon: ShoppingBag, label: 'Purchases', section: 'purchases' },
  { to: '/suppliers', icon: Truck, label: 'Suppliers', section: 'suppliers' },
  { to: '/aged-products', icon: Clock, label: 'Aged Products', section: 'aged-products' },
  { to: '/inventory', icon: Warehouse, label: 'Inventory', section: 'inventory' },
  { to: '/sales', icon: Receipt, label: 'Sales', section: 'sales' },
  { to: '/reports', icon: BookOpen, label: 'Settlements', section: 'reports' },
  { to: '/web-orders', icon: Globe, label: 'Web Orders', section: 'web-orders' },
  { to: '/customers', icon: Users, label: 'Customers', section: 'customers' },
  { to: '/coupons', icon: Tag, label: 'Coupons', section: 'coupons' },
  { to: '/staff', icon: UserCog, label: 'Staff', adminOnly: true },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

// Backup download is admin-only (see routes/backup.js) — only admins get
// asked; staff sign out immediately.
function LogoutConfirmModal({ onClose, onLogout }) {
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);

  const downloadThenLogout = async () => {
    setDownloading(true);
    try {
      const { data } = await api.get('/backup/download', { responseType: 'blob' });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url; a.download = `commoncart-backup-${stamp}.ndjson.gz`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ message: 'Backup downloaded', type: 'success' });
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to create backup', type: 'error' });
      // Still log out — a failed backup shouldn't trap the user on this screen.
    } finally {
      setDownloading(false);
      onLogout();
    }
  };

  return (
    <Modal open onClose={onClose} title="Download a backup before signing out?" size="sm">
      <p className="text-sm text-gray-600 mb-5">
        You can download a full data backup now, or just sign out without one.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onLogout} disabled={downloading}>
          Sign out without backup
        </Button>
        <Button onClick={downloadThenLogout} disabled={downloading}>
          {downloading ? <Spinner size="sm" className="mr-2" /> : <DownloadCloud size={14} className="mr-2" />}
          {downloading ? 'Preparing…' : 'Backup & sign out'}
        </Button>
      </div>
    </Modal>
  );
}

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleSignOutClick = () => {
    // Only admins can download a backup at all — staff just sign out.
    if (user?.role === 'ADMIN') setShowLogoutConfirm(true);
    else logout();
  };

  return (
    <aside className="flex flex-col w-64 h-full shrink-0 bg-gray-900 text-white">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-700">
        <Store size={24} className="text-blue-400" />
        <div>
          <div className="font-bold text-sm">CommonCart</div>
          <div className="text-xs text-gray-400">Inventory System</div>
        </div>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        {navItems.filter((item) => {
          // Settings is visible to everyone (it contains "My Profile")
          if (item.to === '/settings') return true;
          if (item.adminOnly) return user?.role === 'ADMIN';
          // Section-gated items: admins see all, staff see only granted sections
          return item.section ? canAccess(user, item.section) : true;
        }).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-gray-700 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{user?.name}</div>
            <div className="text-xs text-gray-400">{user?.role}</div>
          </div>
        </div>
        <button
          onClick={handleSignOutClick}
          className="flex items-center gap-2 w-full text-sm text-gray-400 hover:text-red-400 transition-colors"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>

      {showLogoutConfirm && createPortal(
        // Portalled to <body> — rendering it here inside the sidebar's own
        // <aside className="... text-white"> would leak that white text
        // color into the modal via ordinary CSS inheritance (position:fixed
        // takes it out of layout, not out of the DOM tree).
        <LogoutConfirmModal onClose={() => setShowLogoutConfirm(false)} onLogout={logout} />,
        document.body
      )}
    </aside>
  );
}
