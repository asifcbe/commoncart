import axios from 'axios';
import shopConfig from '../config/shop.config';

// Dev: keep `/api` so Vite's proxy forwards it to the backend (same-origin,
// no CORS). Prod build: prefix with the configured backend base since the
// site is served from its own origin.
const base = (shopConfig.api?.baseUrl || '').replace(/\/$/, '');
const baseURL = import.meta.env.PROD && base ? `${base}/api` : '/api';
const api = axios.create({ baseURL, timeout: 20000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cc_customer_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const url = error.config?.url || '';
    const isAuthRoute = url.includes('/customers/login') || url.includes('/customers/register');
    // Only bounce to login for a 401 on an account-scoped call. A 401 on a
    // public browsing endpoint (products, categories, clearance) must NOT wipe
    // the session or redirect — it just means the token is stale; drop it and
    // let the page render as a guest.
    const isAccountRoute =
      url.includes('/customers/me') || url.includes('/orders/my') ||
      (url.startsWith('/orders') && !url.includes('/orders/products'));

    if (error.response?.status === 401 && !isAuthRoute) {
      localStorage.removeItem('cc_customer_token');
      localStorage.removeItem('cc_customer');
      if (isAccountRoute) window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
