import { create } from 'zustand';
import api from '../utils/api';

const useShopStore = create((set, get) => ({
  products: [],
  categories: [],
  categoryCards: [], // [{ name, image }] — managed catalog order + images, for the home cards
  subCategories: [],
  variants: [],
  sizes: [],
  total: 0,
  pages: 1,
  page: 1,
  loading: false,
  filters: { search: '', category: '', subCategory: '', color: '', size: '', sort: '-createdAt' },

  fetchProducts: async (params = {}) => {
    set({ loading: true });
    try {
      const merged = { ...get().filters, page: get().page, limit: 12, ...params };
      const { data } = await api.get('/orders/products/public', { params: merged });
      set({
        products: data.products,
        categories: data.categories || [],
        categoryCards: data.categoryCards || (data.categories || []).map((name) => ({ name, image: '' })),
        subCategories: data.subCategories || [],
        variants: data.variants || [],
        sizes: data.sizes || [],
        total: data.total,
        pages: data.pages,
        page: data.page,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  setPage: (page) => set({ page }),

  // Patch a single product's stock from a socket event. No-op (same array
  // reference) when the product isn't in the list or its stock is unchanged —
  // avoids re-rendering the whole grid (and its <img>s) on every stock ping.
  patchStock: (productId, quantity, reservedQty) => {
    set((state) => {
      const i = state.products.findIndex((p) => p._id === productId);
      if (i === -1) return state;
      const cur = state.products[i];
      if (cur.quantity === quantity && cur.reservedQty === reservedQty) return state;
      const next = state.products.slice();
      next[i] = { ...cur, quantity, reservedQty, availableQty: Math.max(0, quantity - reservedQty) };
      return { products: next };
    });
  },
}));

export default useShopStore;
