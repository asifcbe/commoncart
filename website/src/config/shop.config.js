/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║           WHITE-LABEL SHOP CONFIGURATION                 ║
 * ║  Edit this file to fully rebrand for any shop/business.  ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * To white-label for a new client:
 *   1. Change `brand.*` — name, tagline, logo
 *   2. Change `theme.*` — primary/secondary/accent colors (hex)
 *   3. Change `contact.*` — phone, email, address
 *   4. Change `social.*` — social media URLs
 *   5. Change `homepage.*` — hero text and feature highlights
 *   6. Change `store.*` — currency, shipping rules, features
 *   7. Change `api.baseUrl` — if backend runs on a different URL
 */

const shopConfig = {
  // ─── Brand Identity ───────────────────────────────────────────
  brand: {
    name: 'Tom & Jerry',
    shortName: 'T&J',
    tagline: 'Everything you need, all in one place.',
    description: 'Your trusted local store — now online.',
    logoUrl: null,           // e.g. '/logo.png' — place in /public/
    logoAltText: 'Tom & Jerry Logo',
    faviconUrl: '/favicon.ico',
    footerText: '© 2024 CommonCart. All rights reserved.',
  },

  // ─── Theme / Colors ───────────────────────────────────────────
  // These are injected as CSS custom properties at runtime.
  // Just change the hex values to rebrand the entire site instantly.
  theme: {
    primary: '#1e40af',        // Tom's deep blue (buttons, links)
    primaryDark: '#172554',    // Darker blue for hover
    primaryLight: '#dbeafe',   // Light blue backgrounds
    secondary: '#b45309',      // Jerry's warm brown/tan
    accent: '#f59e0b',         // Cheese yellow (sale badges, CTAs)
    success: '#16a34a',        // Green – cheese is safe!
    danger: '#dc2626',         // Red – Tom's angry blush
    background: '#fefce8',     // Very light cream, like old paper
    surface: '#ffffff',        // White cards
    textPrimary: '#2d2a24',    // Warm dark brown/black
    textSecondary: '#78716c',  // Muted warm grey
    borderColor: '#fde68a',    // Soft cheese-yellow borders
  },

  // ─── Contact & Location ───────────────────────────────────────
  contact: {
    phone: '+1 (555) 123-4567',
    whatsapp: '+15551234567',   // digits only for wa.me link
    email: 'hello@tjgs.com',
    address: '123 Commerce Street, New York, NY 10001, USA',
    mapUrl: '',                 // Google Maps embed URL (optional)
    businessHours: 'Mon–Sat: 9am – 7pm',
  },

  // ─── Social Media ─────────────────────────────────────────────
  social: {
    facebook: '',
    instagram: '',
    twitter: '',
    youtube: '',
    tiktok: '',
  },

  // ─── Homepage Content ─────────────────────────────────────────
  homepage: {
    hero: {
      title: 'Shop Smart, Live Better',
      subtitle: 'Discover thousands of products with same-day in-store pickup or fast delivery.',
      ctaText: 'Shop Now',
      backgroundImage: null,    // e.g. '/hero.jpg' — place in /public/
      overlayOpacity: 0.4,
    },
    featuredSectionTitle: 'Featured Products',
    categorySectionTitle: 'Shop by Category',
    features: [
      { icon: 'truck', title: 'Fast Delivery', description: 'Get your order delivered within 24–48 hours.' },
      { icon: 'shield', title: 'Secure Payments', description: 'Your payment information is always safe.' },
      { icon: 'refresh', title: 'Easy Returns', description: '30-day hassle-free return policy.' },
      { icon: 'headphones', title: '24/7 Support', description: 'We\'re here to help anytime you need us.' },
    ],
  },

  // ─── Store / Commerce Settings ────────────────────────────────
  store: {
    currency: '$',
    currencyCode: 'USD',
    currencyLocale: 'en-US',

    // Shipping
    freeShippingAbove: 50,      // Set to 0 to disable free shipping threshold
    defaultShippingCost: 5.99,
    shippingLabel: 'Standard Shipping',

    // Payment methods shown at checkout
    paymentMethods: [
      { id: 'COD', label: 'Cash on Delivery', icon: 'banknotes' },
      { id: 'BANK_TRANSFER', label: 'Bank Transfer', icon: 'building-library' },
    ],

    // Feature flags — set false to hide features
    features: {
      guestCheckout: false,      // Require login to checkout
      wishlist: false,           // Not yet implemented — future feature
      productReviews: false,     // Not yet implemented — future feature
      productSearch: true,
      categoryFilter: true,
      priceFilter: false,        // Future feature
      stockBadge: true,          // Show "In Stock / Out of Stock" badge
      relatedProducts: true,
    },

    // Product listing
    productsPerPage: 12,
    defaultSort: '-createdAt',
  },

  // ─── SEO Defaults ─────────────────────────────────────────────
  seo: {
    titleSuffix: '| CommonCart',   // Appended to every page title
    defaultDescription: 'Shop online at CommonCart — your trusted local store.',
    defaultKeywords: 'online shop, ecommerce, buy online, local store',
    ogImage: null,
  },

  // ─── API ──────────────────────────────────────────────────────
  api: {
    baseUrl: 'http://localhost:5001',   // Change this when deploying
    socketUrl: 'http://localhost:5001',
  },
};

export default shopConfig;
