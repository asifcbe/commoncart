import React from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Plus, Minus, ShoppingCart, ArrowRight, Package } from 'lucide-react';
import useCartStore from '../store/useCartStore';
import { formatPrice } from '../utils/theme';
import shopConfig from '../config/shop.config';

export default function Cart() {
  const { items, updateQty, removeItem, clear } = useCartStore();
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const { freeShippingAbove, defaultShippingCost } = shopConfig.store;
  const shippingCost = freeShippingAbove > 0 && subtotal >= freeShippingAbove ? 0 : defaultShippingCost;
  const total = subtotal + shippingCost;

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <ShoppingCart size={56} className="mx-auto text-gray-200 mb-5" />
        <h2 className="text-2xl font-bold text-gray-700 mb-2">Your cart is empty</h2>
        <p className="text-gray-400 mb-8">Browse products and add something you love.</p>
        <Link to="/products" className="btn-primary inline-flex">Continue Shopping</Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Shopping Cart <span className="text-base font-normal text-gray-400">({items.length} item{items.length !== 1 ? 's' : ''})</span>
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Items */}
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => (
            <div key={item.productId} className="card p-4 flex gap-4">
              {/* Image */}
              <div className="h-20 w-20 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                {item.image ? (
                  <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <Package size={24} className="text-gray-300" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <Link to={`/products/${item.productId}`} className="font-semibold text-gray-900 hover:underline line-clamp-2 text-sm">
                  {item.name}
                </Link>
                <div className="text-sm font-bold mt-1" style={{ color: 'var(--color-primary)' }}>
                  {formatPrice(item.price)}
                </div>
              </div>

              {/* Qty + Remove */}
              <div className="flex flex-col items-end gap-3">
                <button onClick={() => removeItem(item.productId)} className="text-gray-300 hover:text-red-500 transition-colors">
                  <Trash2 size={16} />
                </button>
                <div className="flex items-center border rounded-lg overflow-hidden">
                  <button
                    onClick={() => updateQty(item.productId, item.qty - 1)}
                    className="p-1.5 hover:bg-gray-50"
                  >
                    <Minus size={13} />
                  </button>
                  <span className="px-3 text-sm font-medium">{item.qty}</span>
                  <button
                    onClick={() => updateQty(item.productId, item.qty + 1)}
                    disabled={item.qty >= item.availableQty}
                    className="p-1.5 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <div className="text-sm font-bold text-gray-800">{formatPrice(item.price * item.qty)}</div>
              </div>
            </div>
          ))}

          <button onClick={clear} className="text-sm text-red-500 hover:underline mt-2">
            Clear cart
          </button>
        </div>

        {/* Summary */}
        <div className="card p-6 h-fit space-y-4 sticky top-28">
          <h2 className="font-bold text-lg text-gray-900">Order Summary</h2>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>{shopConfig.store.shippingLabel}</span>
              <span>
                {shippingCost === 0
                  ? <span className="text-green-600 font-medium">FREE</span>
                  : formatPrice(shippingCost)}
              </span>
            </div>
            {freeShippingAbove > 0 && subtotal < freeShippingAbove && (
              <p className="text-xs text-gray-400">
                Add {formatPrice(freeShippingAbove - subtotal)} more for free shipping
              </p>
            )}
          </div>

          <div className="border-t pt-4 flex justify-between font-bold text-base">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>

          <Link to="/checkout" className="btn-primary w-full justify-center py-3 rounded-xl text-base">
            Proceed to Checkout <ArrowRight size={18} />
          </Link>
          <Link to="/products" className="block text-center text-sm text-gray-400 hover:text-gray-600">
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
