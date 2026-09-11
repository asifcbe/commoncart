import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import shopConfig from '../config/shop.config';
import { priceInfo } from '../utils/theme';

const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product, qty = 1) => {
        set((state) => {
          const existing = state.items.find((i) => i.productId === product._id);
          if (existing) {
            const newQty = Math.min(existing.qty + qty, product.availableQty ?? 999);
            return { items: state.items.map((i) => i.productId === product._id ? { ...i, qty: newQty } : i) };
          }
          const { sale, mrp, onSale } = priceInfo(product);
          return {
            items: [
              ...state.items,
              {
                productId: product._id,
                name: product.name,
                // `price` is what the customer pays (discount price when on
                // sale); `mrp` is kept for the struck-through line.
                price: sale,
                mrp,
                onSale,
                image: product.images?.[0] || null,
                availableQty: product.availableQty ?? product.quantity - (product.reservedQty || 0),
                qty,
              },
            ],
          };
        });
      },

      updateQty: (productId, qty) => {
        if (qty <= 0) { get().removeItem(productId); return; }
        set((state) => ({
          items: state.items.map((i) => i.productId === productId ? { ...i, qty } : i),
        }));
      },

      removeItem: (productId) =>
        set((state) => ({ items: state.items.filter((i) => i.productId !== productId) })),

      clear: () => set({ items: [] }),

      // Update available qty from real-time socket events. No-op when the
      // item isn't in the cart or the value is unchanged.
      updateAvailable: (productId, availableQty) =>
        set((state) => {
          const idx = state.items.findIndex((i) => i.productId === productId);
          if (idx === -1 || state.items[idx].availableQty === availableQty) return state;
          const items = state.items.slice();
          items[idx] = { ...items[idx], availableQty };
          return { items };
        }),

      get count() { return get().items.reduce((s, i) => s + i.qty, 0); },
      get subtotal() { return get().items.reduce((s, i) => s + i.price * i.qty, 0); },
      get shippingCost() {
        const sub = get().subtotal;
        const { freeShippingAbove, defaultShippingCost } = shopConfig.store;
        if (freeShippingAbove > 0 && sub >= freeShippingAbove) return 0;
        return defaultShippingCost;
      },
      get total() { return get().subtotal + get().shippingCost; },
    }),
    // v2: cart lines now store the discount price in `price` (+ `mrp`/`onSale`)
    // instead of always the MRP — drop any v1 cart so prices aren't stale.
    { name: 'cc_cart', version: 2 }
  )
);

export default useCartStore;
