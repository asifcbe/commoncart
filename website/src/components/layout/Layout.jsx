import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import ScrollToTop from '../ScrollToTop';
import { connectSocket, disconnectSocket, getSocket } from '../../utils/socket';
import useShopStore from '../../store/useShopStore';
import useCartStore from '../../store/useCartStore';
import useBusinessStore from '../../store/useBusinessStore';

export default function Layout() {
  const patchStock = useShopStore((s) => s.patchStock);
  const updateAvailable = useCartStore((s) => s.updateAvailable);
  const fetchBusiness = useBusinessStore((s) => s.fetchBusiness);

  useEffect(() => { fetchBusiness(); }, [fetchBusiness]);

  useEffect(() => {
    const socket = connectSocket();

    socket.on('stock:updated', ({ productId, quantity, reservedQty }) => {
      const avail = Math.max(0, (quantity ?? 0) - (reservedQty ?? 0));
      patchStock(productId, quantity, reservedQty ?? 0);
      updateAvailable(productId, avail);
    });

    return () => {
      socket.off('stock:updated');
      disconnectSocket();
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <ScrollToTop />
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
