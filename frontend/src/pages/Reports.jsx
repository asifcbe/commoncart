import { useEffect, useState } from 'react';
import { Wallet, RefreshCw, Receipt } from 'lucide-react';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import api from '../utils/api';
import { formatDateTime } from '../utils/date';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function Reports() {
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [dayBook, setDayBook] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDayBook = () => {
    setLoading(true);
    api.get('/reports/day-book', { params: { startDate, endDate } })
      .then(({ data }) => setDayBook(data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDayBook(); }, [startDate, endDate]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-500 text-sm mt-1">Day Book — what happened in the selected date range, by payment mode</p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
              <span className="text-gray-400 text-sm">to</span>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
            </div>
            <Button variant="outline" size="sm" className="ml-auto" onClick={fetchDayBook} disabled={loading}>
              <RefreshCw size={13} className={`mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && !dayBook ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : dayBook && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-gray-500">Transactions</div>
                <div className="text-2xl font-bold mt-1">{dayBook.transactionCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-gray-500">Net Cash Collected</div>
                <div className="text-2xl font-bold mt-1">₹{dayBook.grandTotal.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-gray-500">Total Discounts Given</div>
                <div className="text-2xl font-bold mt-1">₹{dayBook.discountTotal.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-gray-500">Refunds Paid Out {dayBook.refundCount > 0 && `(${dayBook.refundCount})`}</div>
                <div className="text-2xl font-bold mt-1 text-red-600">₹{dayBook.refundTotal.toFixed(2)}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet size={16} className="text-blue-500" /> By Payment Mode
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dayBook.modes.length === 0 ? (
                <p className="text-sm text-gray-400">No transactions in this range.</p>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Mode</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Sales</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Sold</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Refunded</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {dayBook.modes.map((m) => (
                        <tr key={m.mode}>
                          <td className="px-3 py-2 font-medium">{m.mode}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{m.count}</td>
                          <td className="px-3 py-2 text-right text-gray-600">₹{m.salesTotal.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">
                            {m.refundTotal > 0 ? <span className="text-red-600">-₹{m.refundTotal.toFixed(2)}</span> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">₹{m.netTotal.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t">
                      <tr>
                        <td className="px-3 py-2 font-semibold">Total</td>
                        <td className="px-3 py-2 text-right text-gray-500">{dayBook.transactionCount}</td>
                        <td className="px-3 py-2 text-right text-gray-600">₹{(dayBook.grandTotal + dayBook.refundTotal).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right text-red-600">{dayBook.refundTotal > 0 ? `-₹${dayBook.refundTotal.toFixed(2)}` : '—'}</td>
                        <td className="px-3 py-2 text-right font-bold">₹{dayBook.grandTotal.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt size={16} className="text-gray-500" /> Transactions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dayBook.transactions.length === 0 ? (
                <p className="text-sm text-gray-400">No transactions in this range.</p>
              ) : (
                <div className="border rounded-lg overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Bill No</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Date</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Type</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Customer</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Payment</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {dayBook.transactions.map((t) => (
                        <tr key={t._id} className={t.kind === 'REFUND' ? 'bg-red-50/40' : ''}>
                          <td className="px-3 py-2 font-mono text-xs">{t.transactionId}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{formatDateTime(t.createdAt)}</td>
                          <td className="px-3 py-2 text-xs">
                            {t.kind === 'REFUND'
                              ? <span className="text-red-600 font-medium">Refund</span>
                              : <span className="text-gray-500">Sale</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600">{t.customerName || 'Walk-in'}</td>
                          <td className="px-3 py-2 text-gray-600">{t.paymentMethod}</td>
                          <td className={`px-3 py-2 text-right font-medium ${t.amount < 0 ? 'text-red-600' : ''}`}>
                            {t.amount < 0 ? '-' : ''}₹{Math.abs(t.amount).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
