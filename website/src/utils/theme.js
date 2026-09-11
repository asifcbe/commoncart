import shopConfig from '../config/shop.config';

// Product images come back from the API as backend-relative paths like
// "/uploads/products/xxx.jpg". In dev the Vite proxy forwards /uploads to the
// backend, so the bare path works. In a built deploy the site is its own
// origin, so prefix with the configured backend base. Absolute URLs (http…,
// data:, blob:) are left alone.
export function imageUrl(src) {
  if (!src) return '';
  if (/^(https?:)?\/\//i.test(src) || /^(data|blob):/i.test(src)) return src;
  const base = (shopConfig.api?.baseUrl || '').replace(/\/$/, '');
  const prefix = import.meta.env.PROD && base ? base : '';
  return src.startsWith('/') ? `${prefix}${src}` : `${prefix}/${src}`;
}

/** Injects shop.config.js theme colors as CSS custom properties on <html>. */
export function applyTheme() {
  const root = document.documentElement;
  const t = shopConfig.theme;
  root.style.setProperty('--color-primary', t.primary);
  root.style.setProperty('--color-primary-dark', t.primaryDark);
  root.style.setProperty('--color-primary-light', t.primaryLight);
  root.style.setProperty('--color-secondary', t.secondary);
  root.style.setProperty('--color-secondary-dark', t.secondaryDark || t.secondary);
  root.style.setProperty('--color-secondary-light', t.secondaryLight || t.primaryLight);
  root.style.setProperty('--color-accent', t.accent);
  root.style.setProperty('--color-success', t.success);
  root.style.setProperty('--color-danger', t.danger);
  root.style.setProperty('--color-bg', t.background);
  root.style.setProperty('--color-ink', t.textPrimary);
  root.style.setProperty('--color-ink-soft', t.textSecondary);
  root.style.setProperty('--color-toffee', t.borderColor);
}

/** Apply SEO meta tags from config */
export function applyMeta(title) {
  const s = shopConfig.seo;
  const b = shopConfig.brand;
  document.title = title
    ? `${title} ${s.titleSuffix}`
    : `${b.name} — ${b.tagline}`;
}

export function formatPrice(amount) {
  const { currency, currencyCode, currencyLocale } = shopConfig.store;
  try {
    return new Intl.NumberFormat(currencyLocale, {
      style: 'currency',
      currency: currencyCode,
    }).format(amount);
  } catch {
    return `${currency}${Number(amount).toFixed(2)}`;
  }
}

// Normalises whatever price shape a product/cart-item comes in with into a
// single decision: what the customer pays (`sale`), the list price to strike
// through (`mrp`), and whether a real discount applies (`onSale`).
// Handles: the storefront API shape ({ mrp, salePrice, onSale }), a raw
// Product ({ price, discountPrice }), and cart items ({ price, mrp }).
export function priceInfo(p) {
  if (!p) return { sale: 0, mrp: 0, onSale: false };
  const mrp = Number(p.mrp ?? p.price ?? 0);
  let sale;
  if (p.salePrice != null) sale = Number(p.salePrice);
  else if (p.discountPrice != null && Number(p.discountPrice) > 0 && Number(p.discountPrice) < mrp) sale = Number(p.discountPrice);
  else sale = Number(p.price ?? mrp);
  const onSale = p.onSale != null ? !!p.onSale : sale > 0 && sale < mrp;
  return { sale, mrp, onSale };
}
