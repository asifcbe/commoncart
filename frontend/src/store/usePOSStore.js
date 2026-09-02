import { create } from 'zustand';
import api from '../utils/api';

// Blank state for one POS "bill" tab — everything about an in-progress sale
// lives here so multiple bills can be worked on in parallel (see `bills`/
// `activeBillId` below) without leaking state between tabs.
function blankBill(id) {
  return {
    id,
    label: 'Bill',
    step: 'customer', // 'customer' | 'scan' | 'discount' | 'checkout' — guided, not locked
    cart: [],
    customerName: '',
    loyaltyCustomer: null,
    redeemPoints: '',
    redeemEarnedNow: false,
    discountMode: '%',
    discountInput: '',
    roundOff: 0, // typed rupee adjustment to the total (can be negative)
    paymentMethod: 'CASH',
    amountReceived: '', // cash tendered, single-payment mode only — drives the change-due display
    splitMode: false,
    splitRows: [{ method: 'CASH', amount: '' }, { method: 'CARD', amount: '' }],
    soldBy: '',
    carryForward: null,
  };
}

let nextBillSeq = 1;

const usePOSStore = create((set, get) => ({
  bills: [blankBill(1)],
  activeBillId: 1,
  processing: false,
  lastReceipt: null,

  activeBill: () => get().bills.find((b) => b.id === get().activeBillId) || get().bills[0],

  // Shallow-patches the active bill (or a specified bill) with the given fields.
  patchBill: (patch, billId) => set((state) => ({
    bills: state.bills.map((b) => (b.id === (billId ?? state.activeBillId) ? { ...b, ...patch } : b)),
  })),

  addBillTab: () => {
    nextBillSeq += 1;
    const id = nextBillSeq;
    set((state) => ({
      bills: [...state.bills, { ...blankBill(id), label: `Bill ${state.bills.length + 1}`, soldBy: state.activeBill().soldBy }],
      activeBillId: id,
    }));
    return id;
  },

  switchBillTab: (id) => set({ activeBillId: id }),

  // Closes a tab. Always leaves at least one tab open — closing the last one
  // resets it to blank instead of removing it.
  closeBillTab: (id) => set((state) => {
    if (state.bills.length <= 1) {
      return { bills: [blankBill(state.bills[0].id)], activeBillId: state.bills[0].id };
    }
    const remaining = state.bills.filter((b) => b.id !== id);
    const activeBillId = state.activeBillId === id ? remaining[0].id : state.activeBillId;
    return { bills: remaining, activeBillId };
  }),

  resetBillTab: (id) => set((state) => ({
    bills: state.bills.map((b) => (b.id === (id ?? state.activeBillId) ? { ...blankBill(b.id), label: b.label, soldBy: b.soldBy } : b)),
  })),

  // Returns false (and leaves the cart untouched) when adding `qty` would exceed
  // the product's available stock, accounting for what's already in the cart.
  addToCart: (product, qty = 1) => {
    const maxQty = product.availableQty ?? product.quantity - product.reservedQty;
    let added = true;
    set((state) => ({
      bills: state.bills.map((b) => {
        if (b.id !== state.activeBillId) return b;
        const existing = b.cart.find((i) => i.productId === product._id);
        const currentQty = existing ? existing.qty : 0;
        if (currentQty + qty > maxQty) { added = false; return b; }
        const cart = existing
          ? b.cart.map((i) => (i.productId === product._id ? { ...i, qty: i.qty + qty } : i))
          : [...b.cart, {
              productId: product._id,
              name: product.name,
              price: product.discountPrice != null ? product.discountPrice : product.price,
              originalPrice: product.price,
              // isDiscounted flags aged/clearance items only → drives the "(Discounted)"
              // label and the non-exchangeable footer note. Manual discounts stay unflagged.
              isDiscounted: !!product.isAged,
              barcode: product.barcode,
              maxQty,
              qty,
            }];
        return { ...b, cart };
      }),
    }));
    return added;
  },

  updateQty: (productId, qty) => {
    if (qty <= 0) { get().removeFromCart(productId); return; }
    set((state) => ({
      bills: state.bills.map((b) => (b.id !== state.activeBillId ? b : {
        ...b, cart: b.cart.map((i) => (i.productId === productId ? { ...i, qty } : i)),
      })),
    }));
  },

  removeFromCart: (productId) => {
    set((state) => ({
      bills: state.bills.map((b) => (b.id !== state.activeBillId ? b : { ...b, cart: b.cart.filter((i) => i.productId !== productId) })),
    }));
  },

  clearCart: () => set((state) => ({
    bills: state.bills.map((b) => (b.id !== state.activeBillId ? b : { ...b, cart: [] })),
  })),

  checkout: async (paymentMethod, { customerName, customerPhone, redeemPoints, redeemEarnedNow, soldBy, manualDiscount, roundOff, carryForward, splitPayments } = {}) => {
    set({ processing: true });
    try {
      const bill = get().activeBill();
      const items = bill.cart.map((i) => ({ productId: i.productId, qty: i.qty }));
      const { data } = await api.post('/sales/store', {
        items,
        paymentMethod,
        splitPayments: splitPayments?.length ? splitPayments : undefined,
        customerName: customerName || '',
        customerPhone: customerPhone || '',
        redeemPoints: redeemPoints || 0,
        redeemEarnedNow: !!redeemEarnedNow,
        soldBy: soldBy || undefined,
        manualDiscount: manualDiscount || 0,
        roundOff: roundOff || 0,
        carryForward: carryForward || undefined,
      });
      // Completed sale: reset just this tab back to blank (keep other tabs/bills untouched).
      const billId = bill.id;
      set((state) => ({
        bills: state.bills.map((b) => (b.id === billId ? { ...blankBill(b.id), label: b.label, soldBy: b.soldBy } : b)),
        lastReceipt: data.transaction,
        processing: false,
      }));
      return data;
    } catch (err) {
      set({ processing: false });
      throw err;
    }
  },
}));

export default usePOSStore;
