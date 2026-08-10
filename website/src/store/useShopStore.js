import { create } from 'zustand';
import api from '../utils/api';

const useShopStore = create((set, get) => ({
  products: [],
  categories: [],
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

  // Patch a single product's stock from socket event
  patchStock: (productId, quantity, reservedQty) => {
    set((state) => ({
      products: state.products.map((p) =>
        p._id === productId
          ? { ...p, quantity, reservedQty, availableQty: Math.max(0, quantity - reservedQty) }
          : p
      ),
    }));
  },
}));

export default useShopStore;
