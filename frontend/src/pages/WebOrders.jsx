import React, { useEffect, useState } from 'react';
import { Eye, ChevronLeft, ChevronRight, Globe, CheckCircle, XCircle } from 'lucide-react';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';
import { Card, CardContent } from '../components/ui/Card';
import { useToast } from '../components/ui/Toast';
import api from '../utils/api';
import useAutoRefresh from '../hooks/useAutoRefresh';
import { formatDateTime } from '../utils/date';

const FULFILLMENT_STATUSES = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
const PAYMENT_STATUSES = ['PENDING', 'PAID', 'REFUNDED'];

const FULFILLMENT_VARIANT = {
  PENDING: 'warning',
  PROCESSING: 'info',
  SHIPPED: 'secondary',
  DELIVERED: 'success',
  CANCELLED: 'destructive',
};

const PAYMENT_VARIANT = {
  PENDING: 'warning',
  PAID: 'success',
  REFUNDED: 'secondary',
};

function OrderDetailModal({ orderId, onClose, onUpdated }) {
  const toast = useToast();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingFulfillment, setUpdatingFulfillment] = useState(false);
  const [updatingPayment, setUpdatingPayment] = useState(false);

  const loadOrder = () => {
    setLoading(true);
    api.get(`/orders/admin/${orderId}`)
      .then(({ data }) => { setOrder(data.order); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadOrder(); }, [orderId]);

  const updateFulfillment = async (fulfillmentStatus) => {
    setUpdatingFulfillment(true);
    try {
      await api.put(`/orders/${orderId}/fulfillment`, { fulfillmentStatus });
      toast({ message: `Fulfillment updated to ${fulfillmentStatus}`, type: 'success' });
      loadOrder();
      onUpdated();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Update failed', type: 'error' });
    } finally {
      setUpdatingFulfillment(false);
    }
  };

  const updatePayment = async (paymentStatus) => {
    setUpdatingPayment(true);
    try {
      await api.put(`/orders/${orderId}/payment-status`, { paymentStatus });
      toast({ message: `Payment status updated to ${paymentStatus}`, type: 'success' });
      loadOrder();
      onUpdated();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Update failed', type: 'error' });
    } finally {
      setUpdatingPayment(false);
    }
  };

  const cancelOrder = async () => {
    if (!confirm('Cancel this order? Reserved stock will be released.')) return;
    try {
      await api.put(`/orders/${orderId}/admin-cancel`);
      toast({ message: 'Order cancelled', type: 'success' });
      loadOrder();
      onUpdated();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Cancel failed', type: 'error' });
    }
  };

  return (
    <Modal open onClose={onClose} title="Web Order Detail" size="lg">
      {loading ? <div className="flex justify-center py-8"><Spinner /></div> : !order ? (
        <div className="text-center text-gray-400">Order not found</div>
      ) : (
        <div className="space-y-5">
          {/* Header info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500">Order ID:</span> <span className="font-mono font-medium">{order.orderId}</span></div>
            <div><span className="text-gray-500">Date:</span> {formatDateTime(order.createdAt)}</div>
            <div>
              <span className="text-gray-500">Customer:</span>{' '}
              <span className="font-medium">{order.customerId?.name || '—'}</span>
              {order.customerId?.email && <span className="text-gray-400 ml-1 text-xs">({order.customerId.email})</span>}
            </div>
            <div><span className="text-gray-500">Payment Method:</span> {order.paymentMethod}</div>
          </div>

          {/* Status controls */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Fulfillment Status</p>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={FULFILLMENT_VARIANT[order.fulfillmentStatus]}>{order.fulfillmentStatus}</Badge>
              </div>
              <select
                value={order.fulfillmentStatus}
                onChange={(e) => updateFulfillment(e.target.value)}
                disabled={updatingFulfillment || order.fulfillmentStatus === 'CANCELLED'}
                className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {FULFILLMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Payment Status</p>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={PAYMENT_VARIANT[order.paymentStatus]}>{order.paymentStatus}</Badge>
              </div>
              <select
                value={order.paymentStatus}
                onChange={(e) => updatePayment(e.target.value)}
                disabled={updatingPayment || order.fulfillmentStatus === 'CANCELLED'}
                className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Shipping address */}
          {order.shippingAddress && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm">
              <p className="font-semibold text-blue-800 mb-1">Shipping Address</p>
              <p className="text-blue-700">
                {order.shippingAddress.fullName}<br />
                {order.shippingAddress.addressLine1}
                {order.shippingAddress.addressLine2 && <>, {order.shippingAddress.addressLine2}</>}<br />
                {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}, {order.shippingAddress.country}
              </p>
              {order.shippingAddress.phone && <p className="text-blue-600 mt-1">Phone: {order.shippingAddress.phone}</p>}
            </div>
          )}

          {/* Items table */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Product', 'Qty', 'Unit Price', 'Total'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {order.items.map((item, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {item.image && <img src={item.image} alt={item.name} className="h-8 w-8 rounded object-cover border" />}
                        <span>{item.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">{item.qty}</td>
                    <td className="px-3 py-2">${item.price.toFixed(2)}</td>
                    <td className="px-3 py-2 font-medium">${(item.price * item.qty).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="space-y-1 text-sm">
            {order.subtotal !== undefined && (
              <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>${order.subtotal.toFixed(2)}</span></div>
            )}
            {order.shippingCost > 0 && (
              <div className="flex justify-between text-gray-600"><span>Shipping</span><span>${order.shippingCost.toFixed(2)}</span></div>
            )}
            <div className="flex justify-between font-bold text-base border-t pt-2">
              <span>Total</span><span>${order.totalAmount.toFixed(2)}</span>
            </div>
          </div>

          {order.note && <div className="text-sm text-gray-500">Note: {order.note}</div>}

          {/* Actions */}
          <div className="flex justify-between items-center pt-2 border-t">
            {order.fulfillmentStatus !== 'CANCELLED' && order.fulfillmentStatus !== 'DELIVERED' && (
              <Button variant="outline" onClick={cancelOrder} className="text-red-600 border-red-300 hover:bg-red-50">
                <XCircle size={14} className="mr-2" /> Cancel Order
              </Button>
            )}
            <div className="ml-auto">
              <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function WebOrders() {
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fulfillmentStatus, setFulfillmentStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [detailId, setDetailId] = useState(null);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/orders/admin', {
        params: {
          fulfillmentStatus: fulfillmentStatus || undefined,
          paymentStatus: paymentStatus || undefined,
          page,
          limit: 20,
        },
      });
      setOrders(data.orders);
      setTotal(data.total);
      setPages(data.pages);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, [fulfillmentStatus, paymentStatus, page]);

  // Auto-refresh orders so new web orders appear without manual reload (skip when a detail is open)
  useAutoRefresh(() => { if (!detailId) fetchOrders(); }, 30000, [fulfillmentStatus, paymentStatus, page, detailId]);

  const clearFilters = () => {
    setFulfillmentStatus('');
    setPaymentStatus('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const hasFilters = fulfillmentStatus || paymentStatus || startDate || endDate;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Globe size={22} className="text-blue-500" /> Web Orders
          </h1>
          <p className="text-gray-500 text-sm mt-1">{total} orders total</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={fulfillmentStatus} onChange={(e) => { setFulfillmentStatus(e.target.value); setPage(1); }} className="w-44">
              <option value="">All Fulfillment</option>
              {FULFILLMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Select value={paymentStatus} onChange={(e) => { setPaymentStatus(e.target.value); setPage(1); }} className="w-40">
              <option value="">All Payments</option>
              {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : orders.length === 0 ? (
            <div className="text-center text-gray-400 py-16">
              <Globe size={40} className="mx-auto mb-3 opacity-30" />
              <p>No web orders found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Order ID', 'Date', 'Customer', 'Items', 'Total', 'Payment', 'Fulfillment', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {orders.map((o) => (
                  <tr key={o._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{o.orderId}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDateTime(o.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm">{o.customerId?.name || '—'}</div>
                      {o.customerId?.email && <div className="text-xs text-gray-400">{o.customerId.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{o.items.length} item(s)</td>
                    <td className="px-4 py-3 font-semibold">${o.totalAmount.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={PAYMENT_VARIANT[o.paymentStatus] || 'secondary'}>{o.paymentStatus}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={FULFILLMENT_VARIANT[o.fulfillmentStatus] || 'secondary'}>{o.fulfillmentStatus}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setDetailId(o._id)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600"
                        title="View & manage"
                      >
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-gray-500">Page {page} of {pages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={14} />
              </Button>
              <Button size="sm" variant="outline" disabled={page === pages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {detailId && (
        <OrderDetailModal
          orderId={detailId}
          onClose={() => setDetailId(null)}
          onUpdated={fetchOrders}
        />
      )}
    </div>
  );
}
