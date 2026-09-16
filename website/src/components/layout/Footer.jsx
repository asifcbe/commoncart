import React from 'react';
import { Link } from 'react-router-dom';
import { Phone, Mail, MapPin, Facebook, Instagram, Twitter, Youtube, Heart } from 'lucide-react';
import shopConfig from '../../config/shop.config';
import { useBusiness } from '../../store/useBusinessStore';
import BrandLogo from '../ui/BrandLogo';

export default function Footer() {
  const business = useBusiness();
  const year = new Date().getFullYear();

  const socialLinks = [
    { key: 'facebook', Icon: Facebook, label: 'Facebook' },
    { key: 'instagram', Icon: Instagram, label: 'Instagram' },
    { key: 'twitter', Icon: Twitter, label: 'Twitter' },
    { key: 'youtube', Icon: Youtube, label: 'YouTube' },
  ].filter((s) => business[s.key]);

  return (
    <footer className="mt-24" style={{ background: 'var(--color-ink)', color: '#EAD9C4', borderTop: '1px solid rgba(255,255,255,.08)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <div className="mb-4">
              {business.logoUrl
                ? <img src={business.logoUrl} alt={shopConfig.brand.logoAltText} className="h-14" />
                : <BrandLogo size={52} animated={false} />}
            </div>
            <p className="text-xl leading-none" style={{ fontFamily: "'Fraunces', Georgia, serif", color: '#fff' }}>
              Tom <span style={{ color: 'var(--color-primary)' }}>&amp;</span> Jerry
              <span className="block text-[0.62rem] font-medium tracking-[0.3em] uppercase mt-1.5" style={{ color: '#C9B49B' }}>Kids Wear</span>
            </p>
            <p className="text-sm mt-3 leading-relaxed" style={{ color: '#C9B49B' }}>{business.description}</p>
            {socialLinks.length > 0 && (
              <div className="flex gap-3 mt-4">
                {socialLinks.map(({ key, Icon, label }) => (
                  <a
                    key={key}
                    href={business[key]}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="h-8 w-8 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                  >
                    <Icon size={16} />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-white mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              {[
                { to: '/', label: 'Home' },
                { to: '/products', label: 'All Products' },
                { to: '/cart', label: 'Cart' },
                { to: '/orders', label: 'My Orders' },
                { to: '/profile', label: 'My Account' },
              ].map(({ to, label }) => (
                <li key={to}>
                  <Link to={to} className="hover:text-white transition-colors">{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-white mb-4">Contact Us</h3>
            <ul className="space-y-3 text-sm">
              {business.phone && (
                <li className="flex items-start gap-2">
                  <Phone size={15} className="mt-0.5 flex-shrink-0 text-gray-500" />
                  <a href={`tel:${business.phone}`} className="hover:text-white">{business.phone}</a>
                </li>
              )}
              {business.email && (
                <li className="flex items-start gap-2">
                  <Mail size={15} className="mt-0.5 flex-shrink-0 text-gray-500" />
                  <a href={`mailto:${business.email}`} className="hover:text-white break-all">{business.email}</a>
                </li>
              )}
              {business.addressLine && (
                <li className="flex items-start gap-2">
                  <MapPin size={15} className="mt-0.5 flex-shrink-0 text-gray-500" />
                  {business.mapUrl ? (
                    <a href={business.mapUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white">{business.addressLine}</a>
                  ) : (
                    <span>{business.addressLine}</span>
                  )}
                </li>
              )}
              {business.businessHours && (
                <li className="text-gray-500 text-xs mt-2">{business.businessHours}</li>
              )}
            </ul>
          </div>

          {/* Policies */}
          <div>
            <h3 className="font-semibold text-white mb-4">Store Info</h3>
            <ul className="space-y-2 text-sm">
              <li className="text-gray-400">
                Free shipping on orders over{' '}
                <span className="text-white font-medium">
                  {shopConfig.store.currency}{shopConfig.store.freeShippingAbove}
                </span>
              </li>
              <li className="text-gray-400 mt-2">
                Accepted payments:
                <div className="flex flex-wrap gap-1 mt-1">
                  {shopConfig.store.paymentMethods.map((m) => (
                    <span key={m.id} className="text-xs bg-gray-800 px-2 py-0.5 rounded text-gray-300">
                      {m.label}
                    </span>
                  ))}
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="py-4" style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center text-xs flex items-center justify-center gap-1.5" style={{ color: '#9C8973' }}>
          {shopConfig.brand.footerText.replace('2024', year.toString())}
          <span className="mx-1">·</span> made with <Heart size={11} style={{ color: 'var(--color-danger)' }} /> for little ones
        </div>
      </div>
    </footer>
  );
}
