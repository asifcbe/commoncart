import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, User, Search, Menu, X, LogOut, Package, Heart } from 'lucide-react';
import shopConfig from '../../config/shop.config';
import useCartStore from '../../store/useCartStore';
import useCustomerStore from '../../store/useCustomerStore';
import BrandLogo from '../ui/BrandLogo';

export default function Header() {
  const { brand } = shopConfig;
  const navigate = useNavigate();
  const cartItems = useCartStore((s) => s.items);
  const cartCount = cartItems.reduce((n, i) => n + i.qty, 0);
  const { customer, logout } = useCustomerStore();
  const [search, setSearch] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleSearch = (e) => {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/products?search=${encodeURIComponent(search.trim())}`);
      setSearch('');
      setMobileOpen(false);
    }
  };

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
    navigate('/');
  };

  return (
    <header className="bg-white sticky top-0 z-40 shadow-sm" style={{ borderBottom: '1px solid var(--color-toffee)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-20 gap-6">
          {/* Logo — one consistent mark at every screen size, sized to
              actually anchor the header instead of disappearing next to
              the search bar. */}
          <Link to="/" className="flex-shrink-0" aria-label={brand.name}>
            {brand.logoUrl
              ? <img src={brand.logoUrl} alt={brand.logoAltText} className="h-12 sm:h-14 w-auto" />
              : <BrandLogo size={48} animated={false} showText />}
          </Link>

          {/* Search — desktop */}
          <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-xl">
            <div className="relative w-full">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search little outfits…"
                className="input h-10 pl-9"
              />
            </div>
          </form>

          {/* Right icons */}
          <div className="flex items-center gap-2">
            {/* Cart */}
            <Link
              to="/cart"
              className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-900"
            >
              <ShoppingCart size={22} />
              {cartCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 h-5 w-5 rounded-full text-white text-xs flex items-center justify-center font-bold"
                  style={{ background: 'var(--color-primary)' }}
                >
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </Link>

            {/* User menu */}
            {customer ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100"
                >
                  <div
                    className="h-7 w-7 rounded-full text-white text-xs flex items-center justify-center font-bold"
                    style={{ background: 'var(--color-secondary)' }}
                  >
                    {customer.name?.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-gray-700 hidden sm:block">
                    {customer.name.split(' ')[0]}
                  </span>
                </button>
                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl border shadow-lg py-1 z-20">
                      <Link
                        to="/profile"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <User size={16} /> My Profile
                      </Link>
                      <Link
                        to="/orders"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Package size={16} /> My Orders
                      </Link>
                      <hr className="my-1" />
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 w-full"
                      >
                        <LogOut size={16} /> Sign Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Link
                to="/login"
                className="hidden sm:flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg text-white"
                style={{ background: 'var(--color-primary)' }}
              >
                <User size={16} /> Sign In
              </Link>
            )}

            {/* Mobile menu toggle */}
            <button
              className="md:hidden p-2 rounded-lg hover:bg-gray-100"
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile search */}
        {mobileOpen && (
          <div className="md:hidden pb-3">
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search little outfits…"
                className="input flex-1"
              />
              <button type="submit" className="btn-primary px-4 py-1.5 text-sm rounded-lg">
                Search
              </button>
            </form>
            {!customer && (
              <Link to="/login" onClick={() => setMobileOpen(false)} className="block mt-2 text-center btn-primary py-2 rounded-lg text-sm">
                Sign In / Register
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Category nav */}
      <nav style={{ background: 'var(--color-primary-light)', borderTop: '2px solid var(--color-toffee)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-5 overflow-x-auto py-2 scrollbar-hide items-center">
          <Link to="/products" className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--color-ink)' }}>
            All Outfits
          </Link>
          <Link to="/" className="text-sm font-medium whitespace-nowrap" style={{ color: 'var(--color-ink-soft)' }}>
            Home
          </Link>
          <Link to="/clearance" className="text-sm font-semibold whitespace-nowrap flex items-center gap-1"
            style={{ color: 'var(--color-secondary-dark)' }}>
            <Heart size={14} /> Sale
          </Link>
          {shopConfig.contact.phone && (
            <a href={`tel:${shopConfig.contact.phone}`}
              className="text-sm font-medium whitespace-nowrap ml-auto" style={{ color: 'var(--color-ink-soft)' }}>
              {shopConfig.contact.phone}
            </a>
          )}
        </div>
      </nav>
    </header>
  );
}
