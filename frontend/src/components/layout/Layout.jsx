import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { Menu, Store } from 'lucide-react';
import Sidebar from './Sidebar';
import useAuthStore from '../../store/useAuthStore';
import usePosLockStore from '../../store/usePosLockStore';
import useDisplayConfigStore from '../../store/useDisplayConfigStore';

export default function Layout() {
  const refreshMe = useAuthStore((s) => s.refreshMe);
  const locked = usePosLockStore((s) => s.locked);
  const fetchDisplayConfig = useDisplayConfigStore((s) => s.fetchDisplayConfig);
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Refresh the current user on load so permission changes take effect
  useEffect(() => { refreshMe(); }, [refreshMe]);
  // Load the app-wide date format once so formatDate() has it everywhere
  useEffect(() => { fetchDisplayConfig(); }, [fetchDisplayConfig]);
  // Close the drawer on every route change instead of leaving it open behind
  // the new page.
  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

  // Kiosk lock — confine every route to /pos until unlocked. The sidebar is
  // hidden too so there's no way to click elsewhere while locked.
  if (locked && location.pathname !== '/pos') {
    return <Navigate to="/pos" replace />;
  }

  return (
    // h-screen + overflow-hidden pins the shell to exactly the viewport so the
    // sidebar (and its account / Sign out footer) never scroll out of view —
    // only <main> scrolls, internally.
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {!locked && <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!locked && (
          <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-gray-900 text-white shrink-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="p-1 text-gray-300 hover:text-white"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
            <Store size={18} className="text-blue-400" />
            <span className="font-bold text-sm">CommonCart</span>
          </header>
        )}
        <main className="flex-1 overflow-auto">
          <div className="max-w-screen-2xl mx-auto p-3 sm:p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
