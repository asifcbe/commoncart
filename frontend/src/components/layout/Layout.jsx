import React, { useEffect } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import useAuthStore from '../../store/useAuthStore';
import usePosLockStore from '../../store/usePosLockStore';
import useDisplayConfigStore from '../../store/useDisplayConfigStore';

export default function Layout() {
  const refreshMe = useAuthStore((s) => s.refreshMe);
  const locked = usePosLockStore((s) => s.locked);
  const fetchDisplayConfig = useDisplayConfigStore((s) => s.fetchDisplayConfig);
  const location = useLocation();

  // Refresh the current user on load so permission changes take effect
  useEffect(() => { refreshMe(); }, [refreshMe]);
  // Load the app-wide date format once so formatDate() has it everywhere
  useEffect(() => { fetchDisplayConfig(); }, [fetchDisplayConfig]);

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
      {!locked && <Sidebar />}
      <main className="flex-1 overflow-auto">
        <div className="max-w-screen-2xl mx-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
