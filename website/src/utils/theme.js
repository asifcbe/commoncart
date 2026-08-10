import shopConfig from '../config/shop.config';

/** Injects shop.config.js theme colors as CSS custom properties on <html>. */
export function applyTheme() {
  const root = document.documentElement;
  const t = shopConfig.theme;
  root.style.setProperty('--color-primary', t.primary);
  root.style.setProperty('--color-primary-dark', t.primaryDark);
  root.style.setProperty('--color-primary-light', t.primaryLight);
  root.style.setProperty('--color-secondary', t.secondary);
  root.style.setProperty('--color-accent', t.accent);
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
