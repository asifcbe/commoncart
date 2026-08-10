import { create } from 'zustand';
import api from '../utils/api';

const useProductStore = create((set, get) => ({
  products: [],
  total: 0,
  pages: 1,
  page: 1,
  loading: false,
  error: null,
  categories: [],
  // Managed category catalog: [{ name, subCategories: [] }]
  categoryCatalog: [],
  // Managed master lists of variants (colors) and sizes
  variants: [],
  sizes: [],

  fetchProducts: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get('/products', { params: { limit: 20, ...params } });
      set({ products: data.products, total: data.total, pages: data.pages, page: data.page, loading: false });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to fetch products', loading: false });
    }
  },

  fetchCategories: async () => {
    try {
      const { data } = await api.get('/products/categories');
      set({ categories: data.categories });
    } catch {
      // non-critical
    }
  },

  fetchCategoryCatalog: async () => {
    try {
      const { data } = await api.get('/settings/category-config');
      set({ categoryCatalog: data.config?.categories || [] });
    } catch {
      // non-critical
    }
  },

  fetchVariantConfig: async () => {
    try {
      const { data } = await api.get('/settings/variant-config');
      set({ variants: data.config?.variants || [], sizes: data.config?.sizes || [] });
    } catch {
      // non-critical
    }
  },

  createProduct: async (formData) => {
    const { data } = await api.post('/products', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.product;
  },

  updateProduct: async (id, formData) => {
    const { data } = await api.put(`/products/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.product;
  },

  deleteProduct: async (id) => {
    await api.delete(`/products/${id}`);
    set((state) => ({
      products: state.products.filter((p) => p._id !== id),
    }));
  },

  getByBarcode: async (code) => {
    const { data } = await api.get(`/products/barcode/${code}`);
    return data.product;
  },

  updateProductInList: (productId, updates) => {
    set((state) => ({
      products: state.products.map((p) =>
        p._id === productId ? { ...p, ...updates } : p
      ),
    }));
  },
}));

export default useProductStore;
