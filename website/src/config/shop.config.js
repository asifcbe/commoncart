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
    tagline: 'Adorable kids wear, stitched with love.',
    description: 'Tom & Jerry Kids Wear — playful, comfy outfits for little ones.',
    logoUrl: null,           // null → in-app CSS/SVG candy wordmark (see BrandLogo)
    logoAltText: 'Tom & Jerry Kids Wear',
    faviconUrl: '/favicon.ico',
    footerText: '© 2024 Tom & Jerry Kids Wear. All rights reserved.',
    domain: 'tomandjerry.in',
  },

  // ─── Theme / Colors ───────────────────────────────────────────
  // Candy / kids-wear palette taken from the logo artwork:
  // Tom-blue tee, Jerry-pink J, cheese-yellow buttons, heart red, cream.
  theme: {
    primary: '#1CB0F6',        // Tom-blue (buttons, links)
    primaryDark: '#0E8FCB',    // Deeper blue for hover
    primaryLight: '#E4F6FF',   // Pale blue backgrounds
    secondary: '#FF5DA2',      // Jerry-pink (accents, secondary CTAs)
    secondaryDark: '#E23E85',
    secondaryLight: '#FFE6F1',
    accent: '#FFC93C',         // Cheese-button yellow (sale badges, CTAs)
    success: '#43C639',        // Candy green
    danger: '#FF4D6D',         // Heart red
    background: '#FFF9F0',     // Warm cream, like the logo glow
    surface: '#ffffff',        // White cards
    textPrimary: '#3A2C1A',    // Warm cocoa-brown ink (the stitched outline)
    textSecondary: '#8A7B6A',  // Muted warm grey
    borderColor: '#FFE6C7',    // Soft toffee borders
  },

  // ─── Contact & Location ───────────────────────────────────────
  contact: {
    phone: '+91 90000 00000',
    whatsapp: '919000000000',   // digits only for wa.me link
    email: 'hello@tomandjerry.in',
    address: 'Tom & Jerry Kids Wear, India',
    mapUrl: '',
    businessHours: 'Mon–Sat: 10am – 8pm',
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
      title: 'Dressing up little smiles',
      subtitle: '',
      ctaText: 'Start Shopping',
      backgroundImage: null,
      overlayOpacity: 0.4,
    },
    featuredSectionTitle: 'Fresh Picks',
    categorySectionTitle: 'Find their perfect outfit',
    features: [
      { icon: 'truck', title: 'Quick Delivery', description: 'Doorstep in 24–48 hours across India.' },
      { icon: 'shield', title: 'Safe Payments', description: 'Cash on delivery & secure bank transfer.' },
      { icon: 'refresh', title: 'Easy Exchange', description: 'Wrong size? Swap it, no fuss.' },
      { icon: 'headphones', title: 'Here to Help', description: 'Message us any time — we love to chat.' },
    ],
  },

  // ─── Store / Commerce Settings ────────────────────────────────
  store: {
    currency: '₹',
    currencyCode: 'INR',
    currencyLocale: 'en-IN',

    // Shipping
    freeShippingAbove: 999,     // Set to 0 to disable free shipping threshold
    defaultShippingCost: 49,
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
    titleSuffix: '| Tom & Jerry Kids Wear',
    defaultDescription: 'Tom & Jerry Kids Wear — playful, comfy outfits for babies and kids. Shop by age, style and size.',
    defaultKeywords: 'kids wear, baby clothes, children clothing, tom and jerry, online kids fashion india',
    ogImage: null,
  },

  // ─── API ──────────────────────────────────────────────────────
  api: {
    // Dev: localhost backend. Prod: same origin as the site itself, since
    // Nginx proxies /api and /socket.io/ to the backend on that host — see
    // DEPLOYMENT.md Part 6.
    baseUrl: import.meta.env.PROD ? window.location.origin : 'http://localhost:5001',
    socketUrl: import.meta.env.PROD ? window.location.origin : 'http://localhost:5001',
  },
};

export default shopConfig;
