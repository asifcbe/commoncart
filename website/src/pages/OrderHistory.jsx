import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, ChevronRight, ChevronLeft } from 'lucide-react';
import api from '../utils/api';
import { formatPrice } from '../utils/theme';
import Spinner from '../components/ui/Spinner';
import { applyMeta } from '../utils/theme';

const STATUS_COLOR = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  PROCESSING: 'bg-blue-100 text-blue-800',
  SHIPPED: 'bg-purple-100 text-purple-800',
  DELIVERED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

export default function OrderHistory() {
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    applyMeta('My Orders');
    setLoading(true);
    api.get('/orders/my', { params: { page, limit: 10 } })
      .then(({ data }) => { setOrders(data.orders); setTotal(data.total); })
      .finally(() => setLoading(false));
  }, [page]);

  const pages = Math.ceil(total / 10);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Orders</h1>
        <span className="text-sm text-gray-400">{total} total</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : orders.length === 0 ? (
        <div className="card text-center py-16">
          <Package size={48} className="mx-auto text-gray-200 mb-4" />
          <p className="text-gray-500 font-medium">No orders yet</p>
          <Link to="/products" className="btn-primary inline-flex mt-6 rounded-xl">Start Shopping</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Link
              key={order._id}
              to={`/order-confirmation/${order._id}`}
              className="card p-5 flex items-center justify-between hover:shadow-md transition-shadow block"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1 flex-wrap">
                  <span className="font-mono text-sm font-bold text-gray-800">{order.orderId}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[order.fulfillmentStatus] || 'bg-gray-100 text-gray-600'}`}>
                    {order.fulfillmentStatus}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${order.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {order.paymentStatus}
                  </span>
                </div>
                <div className="text-xs text-gray-400">
                  {new Date(order.createdAt).toLocaleDateString()} · {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                <span className="font-bold text-gray-900">{formatPrice(order.totalAmount)}</span>
                <ChevronRight size={18} className="text-gray-400" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex justify-center gap-3 mt-8">
          <button onClick={() => setPage((p) => p - 1)} disabled={page === 1} className="btn-outline py-2 px-4 rounded-lg text-sm disabled:opacity-40">
            <ChevronLeft size={16} />
          </button>
          <span className="self-center text-sm text-gray-500">Page {page} of {pages}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page === pages} className="btn-outline py-2 px-4 rounded-lg text-sm disabled:opacity-40">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
