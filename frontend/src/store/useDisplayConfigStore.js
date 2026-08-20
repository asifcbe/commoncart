import { create } from 'zustand';
import api from '../utils/api';

// App-wide display settings (currently just date format). Fetched once from
// Layout.jsx on app load and read synchronously by formatDate() in
// utils/date.js everywhere else — no per-page fetching needed.
const useDisplayConfigStore = create((set) => ({
  dateFormat: 'DD/MM/YYYY',
  loaded: false,

  fetchDisplayConfig: async () => {
    try {
      const { data } = await api.get('/settings/display-config');
      set({ dateFormat: data.config?.dateFormat || 'DD/MM/YYYY', loaded: true });
    } catch {
      set({ loaded: true }); // keep the dd/mm/yyyy default if the fetch fails
    }
  },

  setDateFormat: (dateFormat) => set({ dateFormat }),
}));

export default useDisplayConfigStore;
