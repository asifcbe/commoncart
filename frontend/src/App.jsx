import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/ui/Toast';
import useAuthStore from './store/useAuthStore';
import { canAccess, SECTIONS } from './config/permissions';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import POS from './pages/POS';
import Inventory from './pages/Inventory';
import SalesHistory from './pages/SalesHistory';
import Reports from './pages/Reports';
import Purchase from './pages/Purchase';
import Suppliers from './pages/Suppliers';
import AgedProducts from './pages/AgedProducts';
import WebOrders from './pages/WebOrders';
import Customers from './pages/Customers';
import Coupons from './pages/Coupons';
import Staff from './pages/Staff';
import Settings from './pages/Settings';

function ProtectedRoute({ children }) {
  const { token } = useAuthStore();
  return token ? children : <Navigate to="/login" replace />;
}

// The landing path for a user — first granted section, or settings as a safe fallback.
function landingPath(user) {
  if (!user) return '/login';
  if (user.role === 'ADMIN') return '/';
  if (canAccess(user, 'dashboard')) return '/';
  const first = SECTIONS.find((s) => canAccess(user, s.key));
  return first ? `/${first.key}` : '/settings';
}

// Guards a routed section by permission. Admins pass; staff need the section grant.
function SectionRoute({ section, children }) {
  const { user } = useAuthStore();
  if (canAccess(user, section)) return children;
  return <Navigate to={landingPath(user)} replace />;
}

// Admin-only routes (Staff management)
function AdminRoute({ children }) {
  const { user } = useAuthStore();
  if (user?.role === 'ADMIN') return children;
  return <Navigate to={landingPath(user)} replace />;
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<SectionRoute section="dashboard"><Dashboard /></SectionRoute>} />
            <Route path="products" element={<SectionRoute section="products"><Products /></SectionRoute>} />
            <Route path="pos" element={<SectionRoute section="pos"><POS /></SectionRoute>} />
            <Route path="inventory" element={<SectionRoute section="inventory"><Inventory /></SectionRoute>} />
            <Route path="sales" element={<SectionRoute section="sales"><SalesHistory /></SectionRoute>} />
            <Route path="reports" element={<SectionRoute section="reports"><Reports /></SectionRoute>} />
            <Route path="purchases" element={<SectionRoute section="purchases"><Purchase /></SectionRoute>} />
            <Route path="suppliers" element={<SectionRoute section="suppliers"><Suppliers /></SectionRoute>} />
            <Route path="aged-products" element={<SectionRoute section="aged-products"><AgedProducts /></SectionRoute>} />
            <Route path="web-orders" element={<SectionRoute section="web-orders"><WebOrders /></SectionRoute>} />
            <Route path="customers" element={<SectionRoute section="customers"><Customers /></SectionRoute>} />
            <Route path="coupons" element={<SectionRoute section="coupons"><Coupons /></SectionRoute>} />
            <Route path="staff" element={<AdminRoute><Staff /></AdminRoute>} />
            {/* Settings is open to all (contains My Profile); admin-only tabs are guarded inside */}
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
