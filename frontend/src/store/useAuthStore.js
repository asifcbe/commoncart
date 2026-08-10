import { create } from 'zustand';
import api from '../utils/api';

const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('cc_user') || 'null'),
  token: localStorage.getItem('cc_token') || null,
  loading: false,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('cc_token', data.token);
      localStorage.setItem('cc_user', JSON.stringify(data.user));
      set({ user: data.user, token: data.token, loading: false });
      return data;
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        (err.code === 'ERR_NETWORK' ? 'Cannot reach server. Is the backend running?' : 'Login failed');
      set({ error: msg, loading: false });
      throw new Error(msg);
    }
  },

  // Re-fetch the current user (picks up permission changes made by an admin)
  refreshMe: async () => {
    try {
      const { data } = await api.get('/auth/me');
      localStorage.setItem('cc_user', JSON.stringify(data.user));
      set({ user: data.user });
      return data.user;
    } catch {
      return null;
    }
  },

  logout: () => {
    localStorage.removeItem('cc_token');
    localStorage.removeItem('cc_user');
    set({ user: null, token: null });
  },
}));

export default useAuthStore;
