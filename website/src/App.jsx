import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/ui/Toast';
import Layout from './components/layout/Layout';
import Home from './pages/Home';
import ProductListing from './pages/ProductListing';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import OrderConfirmation from './pages/OrderConfirmation';
import Auth from './pages/Auth';
import OrderHistory from './pages/OrderHistory';
import Profile from './pages/Profile';
import Clearance from './pages/Clearance';
import useCustomerStore from './store/useCustomerStore';

function RequireAuth({ children }) {
  const { token } = useCustomerStore();
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="products" element={<ProductListing />} />
            <Route path="clearance" element={<Clearance />} />
            <Route path="products/:id" element={<ProductDetail />} />
            <Route path="cart" element={<Cart />} />
            <Route path="login" element={<Auth />} />
            <Route path="checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
            <Route path="order-confirmation/:id" element={<RequireAuth><OrderConfirmation /></RequireAuth>} />
            <Route path="orders" element={<RequireAuth><OrderHistory /></RequireAuth>} />
            <Route path="profile" element={<RequireAuth><Profile /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
