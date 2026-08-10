import React, { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { CheckCircle, Package, ArrowRight } from 'lucide-react';
import api from '../utils/api';
import { formatPrice } from '../utils/theme';
import shopConfig from '../config/shop.config';
import Spinner from '../components/ui/Spinner';
import { applyMeta } from '../utils/theme';

const STATUS_STEPS = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

export default function OrderConfirmation() {
  const { id } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState(location.state?.order || null);
  const [loading, setLoading] = useState(!order);

  useEffect(() => {
    applyMeta('Order Confirmed');
    if (!order) {
      api.get(`/orders/my/${id}`)
        .then(({ data }) => setOrder(data.order))
        .finally(() => setLoading(false));
    }
  }, [id]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (!order) return <div className="text-center py-20 text-gray-400">Order not found</div>;

  const stepIndex = STATUS_STEPS.indexOf(order.fulfillmentStatus);

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      {/* Success Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-green-100 mb-4">
          <CheckCircle size={40} className="text-green-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Order Placed Successfully!</h1>
        <p className="text-gray-500 mt-2">
          Thank you for your order. We'll notify you when it's on its way.
        </p>
      </div>

      {/* Order Info */}
      <div className="card p-6 space-y-5">
        <div className="flex justify-between text-sm">
          <div>
            <div className="text-gray-400 text-xs">Order ID</div>
            <div className="font-mono font-bold text-gray-800">{order.orderId}</div>
          </div>
          <div className="text-right">
            <div className="text-gray-400 text-xs">Date</div>
            <div className="text-sm font-medium">{new Date(order.createdAt).toLocaleDateString()}</div>
          </div>
          <div className="text-right">
            <div className="text-gray-400 text-xs">Payment</div>
            <div className="text-sm font-medium">
              {shopConfig.store.paymentMethods.find((m) => m.id === order.paymentMethod)?.label || order.paymentMethod}
            </div>
          </div>
        </div>

        {/* Tracking */}
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Order Status</div>
          <div className="flex items-center gap-1">
            {STATUS_STEPS.map((s, i) => (
              <React.Fragment key={s}>
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className={`h-7 w-7 rounded-full border-2 flex items-center justify-center text-xs font-bold ${i <= stepIndex ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white' : 'border-gray-200 text-gray-400'}`}>
                    {i < stepIndex ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs ${i <= stepIndex ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </span>
                </div>
                {i < STATUS_STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mb-4 ${i < stepIndex ? 'bg-[var(--color-primary)]' : 'bg-gray-200'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Items */}
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Items Ordered</div>
          <div className="space-y-2">
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-700">{item.name} <span className="text-gray-400">×{item.qty}</span></span>
                <span className="font-medium">{formatPrice(item.price * item.qty)}</span>
              </div>
            ))}
          </div>
          <div className="border-t mt-3 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span><span>{formatPrice(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Shipping</span>
              <span>{order.shippingCost === 0 ? <span className="text-green-600">FREE</span> : formatPrice(order.shippingCost)}</span>
            </div>
            <div className="flex justify-between font-bold pt-1">
              <span>Total</span><span>{formatPrice(order.totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* Shipping Address */}
        {order.shippingAddress && (
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Delivering to</div>
            <div className="text-sm text-gray-600">
              {order.shippingAddress.fullName}<br />
              {order.shippingAddress.line1}{order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}<br />
              {order.shippingAddress.city}{order.shippingAddress.state ? `, ${order.shippingAddress.state}` : ''} {order.shippingAddress.zip}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-4 mt-6">
        <Link to="/orders" className="btn-outline flex-1 justify-center rounded-xl">
          <Package size={16} /> View My Orders
        </Link>
        <Link to="/products" className="btn-primary flex-1 justify-center rounded-xl">
          Continue Shopping <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
