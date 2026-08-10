import { create } from 'zustand';
import api from '../utils/api';

const useCustomerStore = create((set) => ({
  customer: JSON.parse(localStorage.getItem('cc_customer') || 'null'),
  token: localStorage.getItem('cc_customer_token') || null,
  loading: false,

  register: async (name, email, password, phone) => {
    set({ loading: true });
    try {
      const { data } = await api.post('/customers/register', { name, email, password, phone });
      localStorage.setItem('cc_customer_token', data.token);
      localStorage.setItem('cc_customer', JSON.stringify(data.customer));
      set({ customer: data.customer, token: data.token, loading: false });
      return data;
    } catch (err) {
      set({ loading: false });
      throw new Error(err.response?.data?.message || 'Registration failed');
    }
  },

  login: async (email, password) => {
    set({ loading: true });
    try {
      const { data } = await api.post('/customers/login', { email, password });
      localStorage.setItem('cc_customer_token', data.token);
      localStorage.setItem('cc_customer', JSON.stringify(data.customer));
      set({ customer: data.customer, token: data.token, loading: false });
      return data;
    } catch (err) {
      set({ loading: false });
      const msg = err.response?.data?.message ||
        (err.code === 'ERR_NETWORK' ? 'Cannot reach server' : 'Login failed');
      throw new Error(msg);
    }
  },

  logout: () => {
    localStorage.removeItem('cc_customer_token');
    localStorage.removeItem('cc_customer');
    set({ customer: null, token: null });
  },

  refreshMe: async () => {
    try {
      const { data } = await api.get('/customers/me');
      localStorage.setItem('cc_customer', JSON.stringify(data.customer));
      set({ customer: data.customer });
    } catch { /* token expired */ }
  },
}));

export default useCustomerStore;
