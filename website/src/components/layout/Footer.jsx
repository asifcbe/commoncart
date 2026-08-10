import React from 'react';
import { Link } from 'react-router-dom';
import { Phone, Mail, MapPin, Facebook, Instagram, Twitter, Youtube } from 'lucide-react';
import shopConfig from '../../config/shop.config';

export default function Footer() {
  const { brand, contact, social } = shopConfig;
  const year = new Date().getFullYear();

  const socialLinks = [
    { key: 'facebook', Icon: Facebook, label: 'Facebook' },
    { key: 'instagram', Icon: Instagram, label: 'Instagram' },
    { key: 'twitter', Icon: Twitter, label: 'Twitter' },
    { key: 'youtube', Icon: Youtube, label: 'YouTube' },
  ].filter((s) => social[s.key]);

  return (
    <footer className="bg-gray-900 text-gray-300 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              {brand.logoUrl ? (
                <img src={brand.logoUrl} alt={brand.logoAltText} className="h-8 brightness-0 invert" />
              ) : (
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                  style={{ background: 'var(--color-primary)' }}
                >
                  {brand.shortName}
                </div>
              )}
              <span className="font-bold text-white text-lg">{brand.name}</span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">{brand.description}</p>
            {socialLinks.length > 0 && (
              <div className="flex gap-3 mt-4">
                {socialLinks.map(({ key, Icon, label }) => (
                  <a
                    key={key}
                    href={social[key]}
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
              {contact.phone && (
                <li className="flex items-start gap-2">
                  <Phone size={15} className="mt-0.5 flex-shrink-0 text-gray-500" />
                  <a href={`tel:${contact.phone}`} className="hover:text-white">{contact.phone}</a>
                </li>
              )}
              {contact.email && (
                <li className="flex items-start gap-2">
                  <Mail size={15} className="mt-0.5 flex-shrink-0 text-gray-500" />
                  <a href={`mailto:${contact.email}`} className="hover:text-white break-all">{contact.email}</a>
                </li>
              )}
              {contact.address && (
                <li className="flex items-start gap-2">
                  <MapPin size={15} className="mt-0.5 flex-shrink-0 text-gray-500" />
                  <span>{contact.address}</span>
                </li>
              )}
              {contact.businessHours && (
                <li className="text-gray-500 text-xs mt-2">{contact.businessHours}</li>
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

      <div className="border-t border-gray-800 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center text-xs text-gray-600">
          {brand.footerText.replace('2024', year.toString())}
        </div>
      </div>
    </footer>
  );
}
