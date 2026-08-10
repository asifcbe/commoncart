import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MapPin, CreditCard, Package, Tag, Star, CheckCircle, X } from 'lucide-react';
import useCartStore from '../store/useCartStore';
import useCustomerStore from '../store/useCustomerStore';
import { useToast } from '../components/ui/Toast';
import { formatPrice } from '../utils/theme';
import shopConfig from '../config/shop.config';
import api from '../utils/api';
import Spinner from '../components/ui/Spinner';

const STEPS = ['Address', 'Payment', 'Review'];

export default function Checkout() {
  const navigate = useNavigate();
  const toast = useToast();
  const { items, clear } = useCartStore();
  const { customer } = useCustomerStore();
  const [step, setStep] = useState(0);
  const [placing, setPlacing] = useState(false);

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const { freeShippingAbove, defaultShippingCost } = shopConfig.store;
  const shippingCost = freeShippingAbove > 0 && subtotal >= freeShippingAbove ? 0 : defaultShippingCost;

  const [address, setAddress] = useState(
    customer?.addresses?.find((a) => a.isDefault) || {
      fullName: customer?.name || '',
      phone: customer?.phone || '',
      line1: '', line2: '', city: '', state: '', zip: '', country: 'IN',
    }
  );
  const [paymentMethod, setPaymentMethod] = useState(shopConfig.store.paymentMethods[0]?.id || 'COD');
  const [note, setNote] = useState('');

  // Coupon state
  const [couponInput, setCouponInput] = useState('');
  const [couponValidating, setCouponValidating] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState(null); // { code, discount, coupon }

  // Credit points state
  const [creditPoints, setCreditPoints] = useState(customer?.creditPoints || 0);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [pointValue] = useState(1); // 1 pt = ₹1, could be fetched from config

  useEffect(() => {
    // Refresh customer credit points
    if (customer) {
      api.get('/customers/me').then(({ data }) => {
        setCreditPoints(data.customer?.creditPoints || 0);
      }).catch(() => {});
    }
  }, [customer]);

  const couponDiscount = appliedCoupon?.discount || 0;
  const pointsDiscount = redeemPoints * pointValue;
  const totalDiscount = couponDiscount + pointsDiscount;
  const finalTotal = Math.max(0, subtotal - totalDiscount) + shippingCost;
  const maxRedeemable = Math.min(creditPoints, subtotal);

  const handleValidateCoupon = async () => {
    if (!couponInput.trim()) return;
    setCouponValidating(true);
    try {
      const { data } = await api.get('/coupons/validate', {
        params: { code: couponInput.trim(), subtotal },
      });
      if (data.valid) {
        setAppliedCoupon(data);
        toast({ message: `Coupon applied! You save ${formatPrice(data.discount)}`, type: 'success' });
      }
    } catch (err) {
      setAppliedCoupon(null);
      toast({ message: err.response?.data?.message || 'Invalid coupon code', type: 'error' });
    } finally {
      setCouponValidating(false);
    }
  };

  if (!customer) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <h2 className="text-xl font-bold text-gray-800 mb-3">Sign in to Checkout</h2>
        <p className="text-gray-500 mb-6">You need to be signed in to place an order.</p>
        <Link to="/login?redirect=/checkout" className="btn-primary inline-flex">Sign In</Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <h2 className="text-xl font-bold text-gray-800 mb-3">Your cart is empty</h2>
        <Link to="/products" className="btn-primary inline-flex mt-4">Shop Now</Link>
      </div>
    );
  }

  const setAddr = (k) => (e) => setAddress((a) => ({ ...a, [k]: e.target.value }));

  const handlePlaceOrder = async () => {
    setPlacing(true);
    try {
      const { data } = await api.post('/orders', {
        items: items.map((i) => ({ productId: i.productId, qty: i.qty })),
        shippingAddress: address,
        paymentMethod,
        shippingCost,
        note,
        couponCode: appliedCoupon?.coupon?.code || '',
        redeemPoints,
      });
      clear();
      navigate(`/order-confirmation/${data.order._id}`, { state: { order: data.order } });
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to place order';
      toast({ message: msg, type: 'error' });
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Checkout</h1>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-2 text-sm font-medium ${i <= step ? 'text-[var(--color-primary)]' : 'text-gray-400'}`}>
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${i <= step ? 'bg-[var(--color-primary)] text-white' : 'bg-gray-200 text-gray-400'}`}>
                {i + 1}
              </div>
              {s}
            </div>
            {i < STEPS.length - 1 && <div className="flex-1 h-px bg-gray-200" />}
          </React.Fragment>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: step content */}
        <div className="lg:col-span-2 space-y-4">

          {/* Step 0: Address */}
          {step === 0 && (
            <div className="card p-6 space-y-4">
              <div className="flex items-center gap-2 mb-2 font-semibold text-gray-800">
                <MapPin size={18} /> Shipping Address
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
                  <input className="input" value={address.fullName} onChange={setAddr('fullName')} required />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                  <input className="input" value={address.phone} onChange={setAddr('phone')} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Address Line 1 *</label>
                  <input className="input" value={address.line1} onChange={setAddr('line1')} required placeholder="Street address" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Address Line 2</label>
                  <input className="input" value={address.line2} onChange={setAddr('line2')} placeholder="Apartment, suite, etc." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">City *</label>
                  <input className="input" value={address.city} onChange={setAddr('city')} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
                  <input className="input" value={address.state} onChange={setAddr('state')} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ZIP / Postal Code</label>
                  <input className="input" value={address.zip} onChange={setAddr('zip')} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Country</label>
                  <input className="input" value={address.country} onChange={setAddr('country')} />
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => {
                    if (!address.fullName || !address.line1 || !address.city) {
                      toast({ message: 'Please fill all required fields', type: 'warning' });
                      return;
                    }
                    setStep(1);
                  }}
                  className="btn-primary px-8 rounded-xl"
                >
                  Continue to Payment
                </button>
              </div>
            </div>
          )}

          {/* Step 1: Payment */}
          {step === 1 && (
            <div className="card p-6 space-y-5">
              <div className="flex items-center gap-2 mb-2 font-semibold text-gray-800">
                <CreditCard size={18} /> Payment Method
              </div>
              <div className="space-y-3">
                {shopConfig.store.paymentMethods.map((m) => (
                  <label
                    key={m.id}
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${paymentMethod === m.id ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <input
                      type="radio" value={m.id} checked={paymentMethod === m.id}
                      onChange={() => setPaymentMethod(m.id)} className="accent-[var(--color-primary)]"
                    />
                    <div className="font-medium text-sm text-gray-900">{m.label}</div>
                  </label>
                ))}
              </div>

              {/* Coupon Code */}
              <div className="border rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 font-medium text-gray-700 text-sm">
                  <Tag size={15} className="text-purple-500" /> Discount Coupon
                </div>
                {appliedCoupon ? (
                  <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <div>
                      <div className="font-medium text-green-800 flex items-center gap-1 text-sm">
                        <CheckCircle size={14} /> {appliedCoupon.coupon.code}
                      </div>
                      <div className="text-xs text-green-600">You save {formatPrice(appliedCoupon.discount)}</div>
                    </div>
                    <button onClick={() => { setAppliedCoupon(null); setCouponInput(''); }} className="text-gray-400 hover:text-red-500">
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      className="input flex-1 uppercase"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && handleValidateCoupon()}
                      placeholder="Enter coupon code"
                    />
                    <button
                      onClick={handleValidateCoupon}
                      disabled={couponValidating || !couponInput.trim()}
                      className="btn-outline px-4 rounded-xl disabled:opacity-50"
                    >
                      {couponValidating ? <Spinner size="sm" /> : 'Apply'}
                    </button>
                  </div>
                )}
              </div>

              {/* Credit Points Redemption */}
              {creditPoints > 0 && (
                <div className="border rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-medium text-gray-700 text-sm">
                      <Star size={15} className="text-yellow-500 fill-yellow-400" /> Redeem Credit Points
                    </div>
                    <span className="text-xs text-yellow-700 font-semibold bg-yellow-50 px-2 py-0.5 rounded-full">
                      {creditPoints} pts available
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="range" min="0" max={maxRedeemable} step="1"
                        value={redeemPoints}
                        onChange={(e) => setRedeemPoints(Number(e.target.value))}
                        className="flex-1 accent-yellow-500"
                      />
                      <span className="text-sm font-bold text-yellow-700 w-20 text-right">
                        {redeemPoints} pts
                      </span>
                    </div>
                    {redeemPoints > 0 ? (
                      <p className="text-xs text-green-600">
                        Redeeming {redeemPoints} points → {formatPrice(pointsDiscount)} discount
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400">
                        Slide to redeem points. 1 point = {formatPrice(pointValue)} off.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Order Note (optional)</label>
                <textarea
                  value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Any special instructions…" className="input h-20 resize-none"
                />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button onClick={() => setStep(0)} className="btn-outline px-6 rounded-xl">Back</button>
                <button onClick={() => setStep(2)} className="btn-primary px-8 rounded-xl">Review Order</button>
              </div>
            </div>
          )}

          {/* Step 2: Review */}
          {step === 2 && (
            <div className="card p-6 space-y-5">
              <div className="flex items-center gap-2 font-semibold text-gray-800 mb-2">
                <Package size={18} /> Review Your Order
              </div>
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.productId} className="flex justify-between text-sm">
                    <span className="text-gray-700">{item.name} <span className="text-gray-400">x{item.qty}</span></span>
                    <span className="font-medium">{formatPrice(item.price * item.qty)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div>
                {couponDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Coupon ({appliedCoupon.coupon.code})</span>
                    <span>-{formatPrice(couponDiscount)}</span>
                  </div>
                )}
                {pointsDiscount > 0 && (
                  <div className="flex justify-between text-yellow-600">
                    <span>Points ({redeemPoints} pts)</span>
                    <span>-{formatPrice(pointsDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-500">
                  <span>Shipping</span>
                  <span>{shippingCost === 0 ? <span className="text-green-600">FREE</span> : formatPrice(shippingCost)}</span>
                </div>
                <div className="flex justify-between font-bold text-base pt-1 border-t">
                  <span>Total</span>
                  <span>{formatPrice(finalTotal)}</span>
                </div>
              </div>
              <div className="text-xs text-gray-400 space-y-1">
                <div><strong>Ship to:</strong> {address.fullName}, {address.line1}, {address.city}</div>
                <div><strong>Payment:</strong> {shopConfig.store.paymentMethods.find((m) => m.id === paymentMethod)?.label}</div>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button onClick={() => setStep(1)} className="btn-outline px-6 rounded-xl">Back</button>
                <button onClick={handlePlaceOrder} disabled={placing} className="btn-primary px-8 rounded-xl">
                  {placing ? <><Spinner size="sm" /> Placing Order…</> : 'Place Order'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: order summary */}
        <div className="card p-5 h-fit space-y-3">
          <h3 className="font-semibold text-gray-800">Order ({items.length} items)</h3>
          <div className="divide-y max-h-48 overflow-y-auto">
            {items.map((i) => (
              <div key={i.productId} className="flex justify-between py-2 text-sm">
                <span className="text-gray-600 truncate mr-2">{i.name} x{i.qty}</span>
                <span className="font-medium flex-shrink-0">{formatPrice(i.price * i.qty)}</span>
              </div>
            ))}
          </div>
          <div className="border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-green-600"><span>Discounts</span><span>-{formatPrice(totalDiscount)}</span></div>
            )}
            <div className="flex justify-between text-gray-500">
              <span>Shipping</span>
              <span>{shippingCost === 0 ? <span className="text-green-600">FREE</span> : formatPrice(shippingCost)}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t pt-2">
              <span>Total</span><span>{formatPrice(finalTotal)}</span>
            </div>
          </div>
          {creditPoints > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-yellow-700 bg-yellow-50 rounded-lg px-3 py-2">
              <Star size={12} className="fill-yellow-400 text-yellow-400" />
              {creditPoints} credit points available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
