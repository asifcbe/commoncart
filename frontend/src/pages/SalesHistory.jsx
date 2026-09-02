import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Eye, Printer,
  RefreshCw, Minus, Plus, Search,
  Edit2, CheckCircle, MessageCircle, ScanLine, FileText, Wrench, Archive, Camera,
} from 'lucide-react';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { useToast } from '../components/ui/Toast';
import ExportMenu from '../components/ExportMenu';
import api from '../utils/api';
import { connectSocket } from '../utils/socket';
import {
  computeGst, printBillHTML, shareBillWhatsApp, carriedSettlementOf,
  printCreditNoteHTML, printReplacementNoteHTML,
} from '../utils/bill';
import {
  exportSalePDF, exportSaleExcel, exportSaleImage,
  exportCreditNotePDF, exportCreditNoteExcel, exportCreditNoteImage,
  exportReplacementNotePDF, exportReplacementNoteExcel, exportReplacementNoteImage,
} from '../utils/exporters';
import useAutoRefresh from '../hooks/useAutoRefresh';
import useAuthStore from '../store/useAuthStore';
import { canManage } from '../config/permissions';
import { formatDateTime } from '../utils/date';

const FULFILLMENT_VARIANT = { PENDING: 'warning', PROCESSING: 'info', SHIPPED: 'secondary', DELIVERED: 'success', CANCELLED: 'danger' };
const ACTIONS = ['KEEP', 'RETURN', 'EXCHANGE'];
const CameraScanner = lazy(() => import('../components/CameraScanner'));

// Phone for sharing a bill (registered customer phone, then captured phone)
function customerPhoneOf(sale) {
  return sale.customer?.phone || sale.customerPhone || '';
}

// ─── Per-item action row (Keep / Return / Exchange) ───
// Renders the 3-way selector plus whatever inline controls the selected
// action needs. All state lives in the parent's `itemActions` map — this
// component is a pure view over one line's slice of that map.
function ItemActionRow({ item, remaining, state, onChange, disabled }) {
  const action = state?.action || 'KEEP';
  const qty = state?.qty ?? 1;
  const set = (patch) => onChange({ ...state, action, qty, ...patch });

  if (disabled) {
    return <span className="text-xs text-gray-400 italic">No return/exchange</span>;
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {ACTIONS.map((a) => (
          <button key={a} type="button"
            onClick={() => onChange(a === 'KEEP' ? { action: 'KEEP' } : { action: a, qty: Math.min(1, remaining), reason: '' })}
            disabled={a !== 'KEEP' && remaining <= 0}
            className={`text-xs px-2 py-1 rounded border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              action === a
                ? a === 'RETURN' ? 'border-green-400 bg-green-100 text-green-800'
                  : a === 'EXCHANGE' ? 'border-blue-400 bg-blue-100 text-blue-800'
                  : 'border-gray-300 bg-gray-100 text-gray-700'
                : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}>
            {a === 'KEEP' ? 'Keep' : a[0] + a.slice(1).toLowerCase()}
          </button>
        ))}
        {remaining <= 0 && action === 'KEEP' && <span className="text-[10px] text-gray-400 self-center ml-1">fully processed</span>}
      </div>

      {action !== 'KEEP' && (
        <div className={`p-2.5 rounded-lg border space-y-2 ${
          action === 'RETURN' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'
        }`}>
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <p className="text-[11px] text-gray-500 mb-1">Qty (max {remaining})</p>
              <div className="flex items-center gap-1">
                <button onClick={() => set({ qty: Math.max(1, qty - 1) })} className="h-6 w-6 rounded border flex items-center justify-center hover:bg-white bg-white"><Minus size={11} /></button>
                <input type="number" min="1" max={remaining} value={qty}
                  onChange={(e) => set({ qty: Math.min(remaining, Math.max(1, Number(e.target.value) || 1)) })}
                  className="w-10 text-center border rounded px-1 py-0.5 text-xs" />
                <button onClick={() => set({ qty: Math.min(remaining, qty + 1) })} className="h-6 w-6 rounded border flex items-center justify-center hover:bg-white bg-white"><Plus size={11} /></button>
              </div>
            </div>
            <div className="flex-1 min-w-32">
              <p className="text-[11px] text-gray-500 mb-1">Reason</p>
              <Input value={state?.reason || ''} onChange={(e) => set({ reason: e.target.value })}
                placeholder="Defective, wrong size…" className="text-xs h-7" />
            </div>
          </div>
          {action === 'EXCHANGE' && (
            <p className="text-[11px] text-blue-700">The customer will pick their new item(s) in the next step, on the Point of Sale screen.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sale detail modal ────────────────────────────────────────
function SaleDetailModal({ saleId, onClose, onDeleted, onSaved }) {
  const toast = useToast();
  const navigate = useNavigate();
  const allowManage = canManage(useAuthStore.getState().user);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Edit mode — metadata only (payment method, note, customer). Item/price
  // edits are never allowed here — use Return / Exchange instead.
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ paymentMethod: 'CASH', note: '', customerPhone: '', customerName: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [business, setBusiness] = useState(null);
  const [billConfig, setBillConfig] = useState(null);
  const [paymentModes, setPaymentModes] = useState([{ key: 'CASH', label: 'Cash' }, { key: 'CARD', label: 'Card' }, { key: 'MOBILE', label: 'Mobile' }, { key: 'OTHER', label: 'Other' }]);

  // Per-line action state for the Return/Exchange session:
  // { [productId]: { action: 'KEEP'|'RETURN'|'EXCHANGE', qty, reason, newItem } }
  const [itemActions, setItemActions] = useState({});
  const [settlementMethod, setSettlementMethod] = useState('CASH');
  const [sessionNote, setSessionNote] = useState('');
  const [submittingSession, setSubmittingSession] = useState(false);
  // Result of the last submitted session — drives the "Documents created" bar
  const [sessionResult, setSessionResult] = useState(null);

  // Barcode search/scan — highlights matching item rows in red. Accumulates
  // across multiple Enter presses / scans so more than one item can be lit up.
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [highlightedBarcodes, setHighlightedBarcodes] = useState(new Set());
  const [showScanner, setShowScanner] = useState(false);

  const applyBarcodeSearch = (code) => {
    const trimmed = (code ?? barcodeQuery).trim();
    if (!trimmed) return;
    const matched = (sale?.items || []).some((it) => it.barcode === trimmed);
    if (!matched) {
      toast({ message: `No item with barcode ${trimmed} in this transaction`, type: 'error' });
      return;
    }
    setHighlightedBarcodes((prev) => new Set(prev).add(trimmed));
    setBarcodeQuery('');
  };

  const load = () => {
    setLoading(true);
    api.get(`/sales/${saleId}`)
      .then(({ data: res }) => { setData(res); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); setHighlightedBarcodes(new Set()); setBarcodeQuery(''); }, [saleId]);
  useEffect(() => {
    api.get('/settings/business-config').then(({ data }) => setBusiness(data.config)).catch(() => {});
    api.get('/settings/bill-print-config').then(({ data }) => setBillConfig(data.config)).catch(() => {});
    api.get('/settings/payment-modes-config').then(({ data }) => { if (data.config?.modes?.length) setPaymentModes(data.config.modes); }).catch(() => {});
  }, []);

  const sale = data?.sale;
  const isOrder = data?._type === 'order';
  const consumedQtyByProduct = sale?.consumedQtyByProduct || {};

  // Total qty per product on the original invoice (a product could appear on
  // more than one line in principle — sum defensively).
  const originalQtyByProduct = useMemo(() => {
    const map = {};
    (sale?.items || []).forEach((it) => {
      const pid = typeof it.productId === 'object' ? it.productId._id : it.productId;
      map[pid] = (map[pid] || 0) + it.qty;
    });
    return map;
  }, [sale]);

  const remainingFor = (productId) => Math.max(0, (originalQtyByProduct[productId] || 0) - (consumedQtyByProduct[productId] || 0));

  const startEdit = () => {
    setEditForm({
      paymentMethod: sale.paymentMethod || 'CASH',
      note: sale.note || '',
      customerPhone: sale.customerPhone || sale.customer?.phone || '',
      customerName: sale.customerName || sale.customer?.name || '',
    });
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    try {
      await api.put(`/sales/${saleId}`, editForm);
      toast({ message: 'Sale updated', type: 'success' });
      setEditing(false);
      load();
      onSaved?.();
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to update sale', type: 'error' });
    } finally { setSavingEdit(false); }
  };

  // ── Return/Exchange session ──
  const setItemAction = (productId, patch) => {
    setItemActions((prev) => ({ ...prev, [productId]: { ...prev[productId], ...patch } }));
    setSessionResult(null);
  };

  const activeActions = useMemo(
    () => Object.entries(itemActions).filter(([, v]) => v?.action && v.action !== 'KEEP'),
    [itemActions]
  );

  // Client-side preview only — the server recomputes and is authoritative.
  // RETURN and EXCHANGE both fund a Credit Note; EXCHANGE carries that balance
  // forward into a new POS sale instead of building a new invoice here.
  // Mirrors the server's proportional refund: each returned line gets its
  // fair share of the bill's own discount + round-off, not full list price.
  const grossBillTotal = sale?.items.reduce((s, it) => s + it.price * it.qty, 0) || 0;
  const netPayable = sale ? Math.max(0, grossBillTotal - (sale.discountAmount || 0)) + (sale.roundOffAmount || 0) : 0;
  const netPayableRatio = grossBillTotal > 0 ? netPayable / grossBillTotal : 1;
  const creditNotePreviewTotal = activeActions
    .filter(([, v]) => v.action === 'RETURN' || v.action === 'EXCHANGE')
    .reduce((s, [pid, v]) => {
      const item = sale?.items.find((it) => (typeof it.productId === 'object' ? it.productId._id : it.productId) === pid);
      return s + (item ? item.price * v.qty * netPayableRatio : 0);
    }, 0);
  const hasFinancialLines = activeActions.some(([, v]) => v.action === 'RETURN' || v.action === 'EXCHANGE');
  // Points preview — same proportional share the server will apply.
  const previewValueRatio = netPayable > 0 ? creditNotePreviewTotal / netPayable : 0;
  const previewPointsClawedBack = Math.min(sale?.creditPointsEarned || 0, Math.floor((sale?.creditPointsEarned || 0) * previewValueRatio));
  const previewPointsRestored = Math.min(sale?.creditPointsRedeemed || 0, Math.round((sale?.creditPointsRedeemed || 0) * previewValueRatio));

  const handleConfirmSession = async () => {
    const actions = activeActions.map(([productId, v]) => ({
      productId, action: v.action, qty: v.qty, reason: v.reason || '',
    }));
    if (!actions.length) { toast({ message: 'Select at least one item to Return, Exchange, or Replace', type: 'warning' }); return; }
    setSubmittingSession(true);
    try {
      const { data: result } = await api.post('/sale-returns/sessions', {
        saleId, actions, settlement: { method: settlementMethod }, note: sessionNote,
      });
      const parts = [];
      if (result.creditNote) parts.push(`Credit Note ${result.creditNote.creditNoteNumber}`);
      if (result.replacementNote) parts.push(`Replacement ${result.replacementNote.replacementNumber}`);
      toast({ message: `Session complete — ${parts.join(', ')}`, type: 'success' });
      setItemActions({});
      setSessionNote('');
      onSaved?.();

      // A nonzero settlement (from a RETURN or EXCHANGE line) means the shop
      // owes the customer or vice versa — send the cashier straight to POS
      // to pick the customer's next item(s), carrying that balance forward.
      const s = result.settlement;
      if (s && s.direction !== 'NONE' && s.netAmount !== 0) {
        const owedToCustomer = s.direction === 'REFUND_TO_CUSTOMER';
        navigate('/pos', {
          state: {
            carryForward: {
              amount: owedToCustomer ? -Math.abs(s.netAmount) : Math.abs(s.netAmount),
              sourceLabel: `Credit Note ${result.creditNote?.creditNoteNumber || ''}`.trim(),
              settlementId: s._id,
            },
            customerPhone: sale.customer?.phone || sale.customerPhone || '',
            customerName: sale.customer?.name || sale.customerName || '',
          },
        });
        onClose?.();
      } else {
        setSessionResult(result);
        load();
      }
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to process session', type: 'error' });
    } finally { setSubmittingSession(false); }
  };

  return (
    <Modal open onClose={onClose} title={isOrder ? 'Web Order Detail' : 'Transaction Detail'} size="xl">
      {loading ? <div className="flex justify-center py-8"><Spinner /></div> : !sale ? (
        <div className="text-center text-gray-400">Not found</div>
      ) : (
        <div className="space-y-4">
          {/* Sale meta */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500">ID:</span> <span className="font-mono font-medium">{sale.transactionId}</span></div>
            <div><span className="text-gray-500">Date:</span> {formatDateTime(sale.createdAt)}</div>
            <div><span className="text-gray-500">Channel:</span> <Badge variant={sale.channel === 'STORE' ? 'info' : 'secondary'}>{sale.channel}</Badge></div>
            <div><span className="text-gray-500">Payment:</span> {sale.paymentMethod}</div>
            {isOrder ? (
              <>
                <div><span className="text-gray-500">Customer:</span> {sale.customer?.name || '—'}</div>
                <div><span className="text-gray-500">Fulfillment:</span> <Badge variant={FULFILLMENT_VARIANT[sale.fulfillmentStatus] || 'secondary'}>{sale.fulfillmentStatus}</Badge></div>
              </>
            ) : (
              <>
                <div><span className="text-gray-500">Staff:</span> {sale.soldBy?.name || '—'}</div>
                <div><span className="text-gray-500">Status:</span> <Badge variant={sale.status === 'COMPLETED' ? 'success' : 'warning'}>{sale.status}</Badge></div>
                <div>
                  <span className="text-gray-500">Customer:</span>{' '}
                  {sale.customer?.name
                    ? <>{sale.customer.name}{sale.customer.phone && <span className="text-gray-400 ml-1">({sale.customer.phone})</span>}</>
                    : sale.customerPhone
                      ? <>Walk-in <span className="text-gray-400 ml-1">({sale.customerPhone})</span></>
                      : 'Walk-in'}
                </div>
                {sale.customer?.creditPoints != null && (
                  <div><span className="text-gray-500">Loyalty points:</span> {sale.customer.creditPoints}</div>
                )}
              </>
            )}
          </div>

          {/* Edit panel (STORE sales only) — metadata only, no item/price edits */}
          {editing && !isOrder && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
              <p className="text-sm font-semibold text-blue-800">Edit Sale Details</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Payment Method</label>
                  <Select value={editForm.paymentMethod} onChange={(e) => setEditForm((f) => ({ ...f, paymentMethod: e.target.value }))}>
                    {paymentModes.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Customer Name</label>
                  <Input value={editForm.customerName} onChange={(e) => setEditForm((f) => ({ ...f, customerName: e.target.value }))} placeholder="Optional" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Customer Phone</label>
                  <Input value={editForm.customerPhone} onChange={(e) => setEditForm((f) => ({ ...f, customerPhone: e.target.value }))} placeholder="Link loyalty customer (optional)" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Note</label>
                  <Input value={editForm.note} onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))} placeholder="Optional" />
                </div>
              </div>
              <p className="text-xs text-gray-500">Item, quantity, and price changes must go through Return / Exchange below — the original invoice's items are never edited directly.</p>
              <div className="flex justify-end gap-2 pt-1 border-t border-blue-200">
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" onClick={handleSaveEdit} disabled={savingEdit}>
                  {savingEdit ? <Spinner size="sm" className="mr-1" /> : <CheckCircle size={13} className="mr-1.5" />}
                  Save Changes
                </Button>
              </div>
            </div>
          )}

          {/* Items — per-item Keep/Return/Exchange (hidden while editing) */}
          {!editing && (
          <>
          <div className="flex gap-1 items-center">
            <div className="relative flex-1 min-w-48 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                className="pl-8 font-mono text-sm"
                placeholder="Search / scan item barcode…"
                value={barcodeQuery}
                onChange={(e) => setBarcodeQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyBarcodeSearch(); }}
              />
            </div>
            <Button size="sm" variant="outline" onClick={() => applyBarcodeSearch()} disabled={!barcodeQuery.trim()} title="Find item">
              <Search size={14} />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowScanner(true)} title="Scan with device camera">
              <Camera size={14} />
            </Button>
            {highlightedBarcodes.size > 0 && (
              <Button size="sm" variant="outline" onClick={() => setHighlightedBarcodes(new Set())}>
                Clear highlights
              </Button>
            )}
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Product</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Barcode</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Qty</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Unit Price</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Total</th>
                  {!isOrder && <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-[420px]">Action</th>}
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item, i) => {
                  const pid = typeof item.productId === 'object' ? item.productId._id : item.productId;
                  const isDiscounted = item.isDiscounted;
                  const remaining = remainingFor(pid);
                  const isHighlighted = item.barcode && highlightedBarcodes.has(item.barcode);
                  const cellBase = 'px-3 py-2.5';
                  const cellHighlight = isHighlighted ? ' border-y-2 border-red-500 first:border-l-2 last:border-r-2' : '';
                  return (
                    <tr key={i} className="border-t hover:bg-gray-50 align-top">
                      <td className={`${cellBase}${cellHighlight}`}>
                        {item.name}
                        {isDiscounted && <span className="ml-1 text-xs text-red-500 font-medium">(Discounted)</span>}
                        {remaining < item.qty && !isDiscounted && (
                          <div className="text-[10px] text-gray-400 mt-0.5">{item.qty - remaining} of {item.qty} already processed</div>
                        )}
                      </td>
                      <td className={`${cellBase}${cellHighlight} text-xs text-gray-500 font-mono`}>{item.barcode || '—'}</td>
                      <td className={`${cellBase}${cellHighlight}`}>{item.qty}</td>
                      <td className={`${cellBase}${cellHighlight}`}>₹{item.price.toFixed(2)}</td>
                      <td className={`${cellBase}${cellHighlight} font-medium`}>₹{(item.price * item.qty).toFixed(2)}</td>
                      {!isOrder && (
                        <td className={`${cellBase}${cellHighlight}`}>
                          <ItemActionRow
                            item={item}
                            remaining={remaining}
                            state={itemActions[pid]}
                            onChange={(next) => setItemAction(pid, next)}
                            disabled={isDiscounted}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {showScanner && (
            <Suspense fallback={null}>
              <CameraScanner
                open={showScanner}
                title="Scan Item Barcode"
                continuous
                onScan={(code) => applyBarcodeSearch(code.trim())}
                onClose={() => setShowScanner(false)}
              />
            </Suspense>
          )}
          </>
          )}

          {!editing && sale.items.some((i) => i.isDiscounted) && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              * Discounted items in this bill cannot be returned, exchanged, or replaced.
            </p>
          )}

          {/* Return/Exchange session summary */}
          {!editing && !isOrder && activeActions.length > 0 && (
            <div className="p-3 bg-gray-50 border rounded-lg space-y-2">
              <p className="text-sm font-semibold text-gray-700">Session Summary</p>
              {hasFinancialLines && (
                <>
                  <div className="flex justify-between font-bold border-t pt-1 text-sm">
                    <span>Shop refunds</span>
                    <span className="text-green-600">₹{creditNotePreviewTotal.toFixed(2)}</span>
                  </div>
                  {(previewPointsClawedBack > 0 || previewPointsRestored > 0) && (
                    <div className="text-xs text-gray-500 space-y-0.5">
                      {previewPointsClawedBack > 0 && <div>Loyalty points removed: <span className="text-red-500 font-medium">-{previewPointsClawedBack}</span></div>}
                      {previewPointsRestored > 0 && <div>Redeemed points restored: <span className="text-green-600 font-medium">+{previewPointsRestored}</span></div>}
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <label className="text-xs text-gray-500">Settlement method</label>
                    <select value={settlementMethod} onChange={(e) => setSettlementMethod(e.target.value)}
                      className="border rounded px-2 py-1 text-xs bg-white">
                      {['CASH', 'CARD', 'MOBILE', 'STORE_CREDIT', 'OTHER'].map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                  {activeActions.some(([, v]) => v.action === 'EXCHANGE') && (
                    <p className="text-xs text-blue-700">Confirming will take you to POS to pick the exchanged item(s), carrying this balance forward.</p>
                  )}
                </>
              )}
              <Input value={sessionNote} onChange={(e) => setSessionNote(e.target.value)} placeholder="Session note (optional)" className="text-sm h-8" />
              <div className="flex justify-end">
                <Button size="sm" onClick={handleConfirmSession} disabled={submittingSession}>
                  {submittingSession ? <Spinner size="sm" className="mr-1.5" /> : <CheckCircle size={13} className="mr-1.5" />}
                  Confirm Session
                </Button>
              </div>
            </div>
          )}

          {/* Documents created by the most recent session — only reached when the
              session had no financial balance to carry forward (e.g. pure Replace),
              since a nonzero settlement now navigates straight to POS instead. */}
          {sessionResult && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg space-y-2">
              <p className="text-sm font-semibold text-indigo-800">Documents Created</p>
              <div className="flex flex-wrap gap-2">
                {sessionResult.creditNote && (
                  <Button size="sm" variant="outline" onClick={() => printCreditNoteHTML(sessionResult.creditNote, business)}>
                    <FileText size={13} className="mr-1.5" /> Print Credit Note {sessionResult.creditNote.creditNoteNumber}
                  </Button>
                )}
                {sessionResult.replacementNote && (
                  <Button size="sm" variant="outline" onClick={() => printReplacementNoteHTML(sessionResult.replacementNote, business)}>
                    <Wrench size={13} className="mr-1.5" /> Print Replacement Note {sessionResult.replacementNote.replacementNumber}
                  </Button>
                )}
              </div>
              {(sessionResult.creditNote?.pointsClawedBack > 0 || sessionResult.creditNote?.pointsRestored > 0) && (
                <p className="text-xs text-indigo-700">
                  {sessionResult.creditNote.pointsClawedBack > 0 && <>Removed {sessionResult.creditNote.pointsClawedBack} loyalty point(s). </>}
                  {sessionResult.creditNote.pointsRestored > 0 && <>Restored {sessionResult.creditNote.pointsRestored} redeemed point(s).</>}
                </p>
              )}
            </div>
          )}

          {!editing && (() => {
            // sale.totalAmount has round-off baked into it at checkout — back
            // it back out so GST is computed on the goods-only amount,
            // matching utils/bill.js.
            const roundOffAmount = sale.roundOffAmount || 0;
            const goodsAmount = sale.totalAmount - roundOffAmount;
            const gst = computeGst(goodsAmount, business, sale.gst);
            const grand = gst ? gst.grandTotal : goodsAmount;
            const carried = carriedSettlementOf(sale);
            const netPayable = grand + roundOffAmount + (carried?.amount || 0);
            return (
              <div className="border-t pt-3 text-sm space-y-1">
                {gst && (
                  <>
                    <div className="flex justify-between text-gray-500"><span>Taxable Value</span><span>₹{gst.net.toFixed(2)}</span></div>
                    <div className="flex justify-between text-gray-500"><span>CGST @ {gst.halfRate}%{gst.inclusive ? ' (incl.)' : ''}</span><span>₹{gst.cgst.toFixed(2)}</span></div>
                    <div className="flex justify-between text-gray-500"><span>SGST @ {gst.halfRate}%{gst.inclusive ? ' (incl.)' : ''}</span><span>₹{gst.sgst.toFixed(2)}</span></div>
                  </>
                )}
                {roundOffAmount !== 0 && (
                  <div className={`flex justify-between ${roundOffAmount > 0 ? 'text-red-500' : 'text-green-600'}`}>
                    <span>Round Off</span><span>{roundOffAmount > 0 ? '+' : '-'}₹{Math.abs(roundOffAmount).toFixed(2)}</span>
                  </div>
                )}
                {carried && (
                  <div className={`flex justify-between ${carried.amount > 0 ? 'text-red-500' : 'text-green-600'}`}>
                    <span>{carried.sourceLabel}</span><span>{carried.amount > 0 ? '+' : '-'}₹{Math.abs(carried.amount).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center font-bold">
                  <span>{carried ? (netPayable < 0 ? 'Refund Due' : 'Net Payable') : 'Total'}</span><span>₹{Math.abs(netPayable).toFixed(2)}</span>
                </div>
                {business?.gstin && <div className="text-xs text-gray-400">GSTIN: {business.gstin}</div>}
              </div>
            );
          })()}
          {!editing && sale.note && <div className="text-sm text-gray-500">Note: {sale.note}</div>}

          <div className="flex justify-between items-center pt-2 border-t">
            <div className="flex gap-2">
              {!isOrder && !editing && allowManage && (
                <Button variant="outline" size="sm" onClick={startEdit} className="text-blue-600 border-blue-300 hover:bg-blue-50">
                  <Edit2 size={13} className="mr-1.5" /> Edit Details
                </Button>
              )}
              {!editing && (() => {
                const billExtra = {
                  pointsEarned: sale.creditPointsEarned || 0,
                  pointsRedeemed: sale.creditPointsRedeemed || 0,
                  balancePoints: sale.customer?.creditPoints ?? null,
                  customer: sale.customer,
                };
                return (
                  <>
                    <Button variant="outline" size="sm" onClick={() => printBillHTML(sale, business, billConfig, billExtra)}>
                      <Printer size={13} className="mr-1.5" /> Reprint Bill
                    </Button>
                    <ExportMenu
                      label="Export Bill"
                      onExport={(kind) => {
                        if (kind === 'pdf') return exportSalePDF(sale, business, billConfig, billExtra);
                        if (kind === 'excel') return exportSaleExcel(sale, business);
                        return exportSaleImage(sale, business, billConfig, billExtra);
                      }}
                    />
                    {customerPhoneOf(sale) && (
                      <Button variant="outline" size="sm" onClick={() => shareBillWhatsApp(sale, customerPhoneOf(sale), business, billExtra)} className="text-green-700 border-green-300 hover:bg-green-50">
                        <MessageCircle size={13} className="mr-1.5" /> Share on WhatsApp
                      </Button>
                    )}
                  </>
                );
              })()}
            </div>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Credit Notes list (Return + Exchange-out, new system) ───
function CreditNotesList({ onViewSale, business }) {
  const [creditNotes, setCreditNotes] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/sale-returns/credit-notes', { params: { page, limit: 20 } })
      .then(({ data }) => { setCreditNotes(data.creditNotes); setTotal(data.total); setPages(data.pages); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{total} credit note(s)</p>
        <p className="text-xs text-gray-400">Open a sale from the <strong>All Sales</strong> tab → choose Return/Exchange per item</p>
      </div>
      <Card>
        <div className="overflow-x-auto">
          {loading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          : creditNotes.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <FileText size={32} className="mx-auto mb-2 opacity-20" />
              <p>No credit notes yet</p>
              <p className="text-xs mt-1">Open a sale and process a Return or Exchange to create one.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>{['Credit Note #','Date','Original Invoice','Items','Total','New Invoice','Staff',''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y">
                {creditNotes.map((cn) => (
                  <tr key={cn._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{cn.creditNoteNumber}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDateTime(cn.createdAt)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-blue-600 cursor-pointer hover:underline"
                      onClick={() => onViewSale && onViewSale(cn.originalTransactionId)}>
                      {cn.originalTransactionId}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {cn.items.length} item(s)
                      {cn.items.some((it) => it.lineType === 'EXCHANGE_OUT') && <Badge variant="info" className="ml-1.5 text-[10px]">Exchange</Badge>}
                    </td>
                    <td className="px-4 py-3 font-semibold text-green-700">₹{cn.creditNoteTotal.toFixed(2)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-blue-600 cursor-pointer hover:underline"
                      onClick={() => cn.linkedNewTransactionId && onViewSale && onViewSale(cn.linkedNewTransactionId)}>
                      {cn.linkedNewTransactionId || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{cn.processedBy?.name || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => printCreditNoteHTML(cn, business)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600" title="Print">
                          <Printer size={14} />
                        </button>
                        <ExportMenu onExport={(kind) => {
                          if (kind === 'pdf') return exportCreditNotePDF(cn, business);
                          if (kind === 'excel') return exportCreditNoteExcel(cn, business);
                          return exportCreditNoteImage(cn, business);
                        }} />
                      </div>
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
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></Button>
              <Button size="sm" variant="outline" disabled={page === pages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Replacement Notes list ───────────────────────────────────
function ReplacementNotesList({ onViewSale, business }) {
  const [notes, setNotes] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/sale-returns/replacement-notes', { params: { page, limit: 20 } })
      .then(({ data }) => { setNotes(data.replacementNotes); setTotal(data.total); setPages(data.pages); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{total} replacement note(s)</p>
        <p className="text-xs text-gray-400">Open a sale from the <strong>All Sales</strong> tab → choose Replace per item</p>
      </div>
      <Card>
        <div className="overflow-x-auto">
          {loading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          : notes.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <Wrench size={32} className="mx-auto mb-2 opacity-20" />
              <p>No replacement notes yet</p>
              <p className="text-xs mt-1">Open a sale and choose Replace on a defective item to create one.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>{['Replacement #','Date','Original Invoice','Items','Reason','Staff',''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y">
                {notes.map((n) => (
                  <tr key={n._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{n.replacementNumber}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDateTime(n.createdAt)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-blue-600 cursor-pointer hover:underline"
                      onClick={() => onViewSale && onViewSale(n.originalTransactionId)}>
                      {n.originalTransactionId}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{n.items.length} item(s)</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{n.reason || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{n.processedBy?.name || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => printReplacementNoteHTML(n, business)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600" title="Print">
                          <Printer size={14} />
                        </button>
                        <ExportMenu onExport={(kind) => {
                          if (kind === 'pdf') return exportReplacementNotePDF(n, business);
                          if (kind === 'excel') return exportReplacementNoteExcel(n, business);
                          return exportReplacementNoteImage(n, business);
                        }} />
                      </div>
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
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></Button>
              <Button size="sm" variant="outline" disabled={page === pages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Legacy records (read-only, pre-redesign returns/exchanges) ─
function LegacyReturnsList({ onViewSale }) {
  const [returns, setReturns] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/sale-returns/legacy/returns', { params: { page, limit: 20 } })
      .then(({ data }) => { setReturns(data.returns); setTotal(data.total); setPages(data.pages); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{total} legacy return(s)</p>
        <p className="text-xs text-gray-400">Historical returns processed before the Credit Note system — read only</p>
      </div>
      <Card>
        <div className="overflow-x-auto">
          {loading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          : returns.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <Archive size={32} className="mx-auto mb-2 opacity-20" />
              <p>No legacy returns</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>{['Return ID','Date','Original Sale','Items','Refund','Method','Staff'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y">
                {returns.map((r) => (
                  <tr key={r._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{r.returnId}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDateTime(r.createdAt)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-blue-600 cursor-pointer hover:underline"
                      onClick={() => onViewSale && onViewSale(r.originalTransactionId)}>
                      {r.originalTransactionId}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.items.length} item(s)</td>
                    <td className="px-4 py-3 font-semibold text-green-700">₹{r.refundAmount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-500">{r.refundMethod}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{r.processedBy?.name || '—'}</td>
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
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></Button>
              <Button size="sm" variant="outline" disabled={page === pages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function LegacyExchangesList({ onViewSale }) {
  const [exchanges, setExchanges] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/sale-returns/legacy/exchanges', { params: { page, limit: 20 } })
      .then(({ data }) => { setExchanges(data.exchanges); setTotal(data.total); setPages(data.pages); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{total} legacy exchange(s)</p>
        <p className="text-xs text-gray-400">Historical exchanges processed before the Credit Note system — read only</p>
      </div>
      <Card>
        <div className="overflow-x-auto">
          {loading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          : exchanges.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <Archive size={32} className="mx-auto mb-2 opacity-20" />
              <p>No legacy exchanges</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>{['Exchange ID','Date','Original Sale','Returned','New Item','Returned ₹','New ₹','Balance'].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y">
                {exchanges.map((ex) => (
                  <tr key={ex._id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{ex.exchangeId}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{formatDateTime(ex.createdAt)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-blue-600 cursor-pointer hover:underline"
                      onClick={() => onViewSale && onViewSale(ex.originalTransactionId)}>
                      {ex.originalTransactionId}
                    </td>
                    <td className="px-3 py-2 text-sm">{ex.returnedItem?.name} × {ex.returnedItem?.qty}</td>
                    <td className="px-3 py-2 text-sm">{ex.newItem?.name} × {ex.newItem?.qty}</td>
                    <td className="px-3 py-2 text-green-700 font-medium">₹{ex.returnedValue?.toFixed(2)}</td>
                    <td className="px-3 py-2 text-orange-700 font-medium">₹{ex.newValue?.toFixed(2)}</td>
                    <td className="px-3 py-2 font-bold">
                      <span className={ex.balanceDue > 0 ? 'text-red-600' : ex.balanceDue < 0 ? 'text-green-600' : 'text-gray-400'}>
                        {ex.balanceDue > 0 ? `+₹${ex.balanceDue.toFixed(2)} paid` : ex.balanceDue < 0 ? `-₹${Math.abs(ex.balanceDue).toFixed(2)} refunded` : '—'}
                      </span>
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
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></Button>
              <Button size="sm" variant="outline" disabled={page === pages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Main Sales History Page ──────────────────────────────────
export default function SalesHistory() {
  const toast = useToast();
  const [tab, setTab] = useState('sales');
  const [sales, setSales] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [detailSaleId, setDetailSaleId] = useState(null);
  const [scanInput, setScanInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState(new Set()); // sale _ids selected for export
  const [exporting, setExporting] = useState(false);
  const [business, setBusiness] = useState(null);
  const [billConfig, setBillConfig] = useState(null);

  const fetchSales = (silent = false) => {
    if (!silent) setLoading(true);
    api.get('/sales', { params: { channel: channel || undefined, startDate: startDate || undefined, endDate: endDate || undefined, search: search || undefined, page, limit: 20 } })
      .then(({ data }) => { setSales(data.sales); setTotal(data.total); setPages(data.pages); })
      .finally(() => { if (!silent) setLoading(false); });
  };

  useEffect(() => { if (tab === 'sales') fetchSales(); }, [channel, startDate, endDate, search, page, tab]);

  // Debounce the phone/name search box, then reset to page 1
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    api.get('/settings/business-config').then(({ data }) => setBusiness(data.config)).catch(() => {});
    api.get('/settings/bill-print-config').then(({ data }) => setBillConfig(data.config)).catch(() => {});
  }, []);

  // Clear selection whenever the visible list changes (filters/page/tab).
  useEffect(() => { setSelected(new Set()); }, [channel, startDate, endDate, search, page, tab]);

  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allOnPageSelected = sales.length > 0 && sales.every((s) => selected.has(s._id));
  const toggleAll = () => setSelected((prev) => {
    if (sales.every((s) => prev.has(s._id))) return new Set(); // unselect all
    return new Set(sales.map((s) => s._id));
  });

  // Fetch each selected sale's full detail, then bundle-export in the chosen format.
  const handleBulkExport = async (kind) => {
    const ids = sales.filter((s) => selected.has(s._id)).map((s) => s._id);
    if (!ids.length) return;
    setExporting(true);
    try {
      const full = await Promise.all(ids.map((id) => api.get(`/sales/${id}`).then(({ data }) => data.sale || data)));
      const { exportSalesBulk } = await import('../utils/exporters');
      await exportSalesBulk(full, business, billConfig, kind);
      toast({ message: `Exported ${full.length} bill(s)`, type: 'success' });
    } catch (err) {
      toast({ message: err?.message || 'Bulk export failed', type: 'error' });
    } finally {
      setExporting(false);
    }
  };

  // Auto-refresh the sales list (silent — no spinner flash). Skip while a bill is open.
  useAutoRefresh(() => {
    if (tab === 'sales' && !detailSaleId) fetchSales(true);
  }, 30000, [tab, page, channel, startDate, endDate, search, detailSaleId]);

  // Live-refresh when a new POS sale is recorded elsewhere (e.g. on the POS screen)
  useEffect(() => {
    const socket = connectSocket();
    const onSaleCreated = () => { if (tab === 'sales' && page === 1) fetchSales(); };
    socket.on('sale:created', onSaleCreated);
    return () => socket.off('sale:created', onSaleCreated);
  }, [tab, page, channel, startDate, endDate, search]);

  // Open a bill's preview by its bill number (used by Returns/Exchanges links and the scanner)
  const openByBillNumber = async (billNumber) => {
    const num = (billNumber || '').trim();
    if (!num) return false;
    try {
      const { data } = await api.get(`/sales/by-number/${encodeURIComponent(num)}`);
      setTab('sales');
      setDetailSaleId(data._id);
      return true;
    } catch {
      return false;
    }
  };
  const handleViewByTxnId = (txnId) => { openByBillNumber(txnId); };

  // Open a bill's preview by an item's product barcode (fallback when the
  // scanned code isn't a bill number — e.g. scanning a product label instead).
  const openByItemBarcode = async (barcode) => {
    const code = (barcode || '').trim();
    if (!code) return false;
    try {
      const { data } = await api.get(`/sales/by-item-barcode/${encodeURIComponent(code)}`);
      setTab('sales');
      setDetailSaleId(data._id);
      return true;
    } catch {
      return false;
    }
  };

  // Barcode scan: try the bill number first, then fall back to a product
  // barcode so scanning either a printed bill or an item label both work.
  const handleScan = async (raw) => {
    const code = (raw || '').trim();
    if (!code) return;
    setScanning(true);
    const ok = (await openByBillNumber(code)) || (await openByItemBarcode(code));
    setScanning(false);
    if (ok) setScanInput('');
    else toast({ message: `No bill found for "${code}"`, type: 'error' });
  };

  const tabs = [
    { id: 'sales', label: 'All Sales' },
    { id: 'creditNotes', label: 'Credit Notes' },
    { id: 'replacementNotes', label: 'Replacement Notes' },
    { id: 'legacy', label: 'Legacy Records' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Sales History</h1>
        <p className="text-gray-500 text-sm mt-1">{tab === 'sales' ? `${total} total transactions` : ''}</p>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sales' && (
        <>
          {/* Scan a bill or item barcode to open the bill (for quick return / exchange) */}
          <Card className="border-blue-200 bg-blue-50/40">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-blue-700 text-sm font-medium shrink-0">
                  <ScanLine size={18} /> Scan Barcode
                </div>
                <div className="relative flex-1 min-w-56">
                  <ScanLine size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    autoFocus
                    className="pl-9"
                    placeholder="Scan or type a bill number or product barcode, then Enter…"
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleScan(scanInput); }}
                  />
                </div>
                <Button size="sm" onClick={() => handleScan(scanInput)} disabled={scanning || !scanInput.trim()}>
                  {scanning ? <Spinner size="sm" className="mr-1.5" /> : <Eye size={14} className="mr-1.5" />}
                  Open Bill
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-2">Scanning a printed bill's barcode — or any item sold on it — opens the bill instantly, ready to return or exchange items.</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-3">
                <div className="relative w-56">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    className="pl-8"
                    placeholder="Search customer phone or name…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                </div>
                <Select value={channel} onChange={(e) => { setChannel(e.target.value); setPage(1); }} className="w-40">
                  <option value="">All Channels</option>
                  <option value="STORE">Store (POS)</option>
                  <option value="WEB">Web Orders</option>
                </Select>
                <div className="flex items-center gap-2">
                  <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className="w-40" />
                  <span className="text-gray-400 text-sm">to</span>
                  <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className="w-40" />
                </div>
                {(channel || startDate || endDate || searchInput) && (
                  <Button variant="ghost" size="sm" onClick={() => { setChannel(''); setStartDate(''); setEndDate(''); setSearchInput(''); setPage(1); }}>Clear filters</Button>
                )}
                <Button variant="outline" size="sm" className="ml-auto" onClick={fetchSales} disabled={loading}>
                  <RefreshCw size={13} className={`mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Selection / bulk-export toolbar */}
          {selected.size > 0 && (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border border-blue-200 bg-blue-50">
              <span className="text-sm text-blue-800 font-medium">
                {selected.size} bill{selected.size !== 1 ? 's' : ''} selected
                {exporting && <Spinner size="sm" className="ml-2 inline-block align-middle" />}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
                <ExportMenu label="Export Selected" onExport={handleBulkExport} />
              </div>
            </div>
          )}

          <Card>
            <div className="overflow-x-auto">
              {loading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div>
              : sales.length === 0 ? <div className="text-center text-gray-400 py-16">No transactions found</div>
              : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 w-8">
                        <input type="checkbox" className="rounded" checked={allOnPageSelected} onChange={toggleAll} title="Select all on this page" />
                      </th>
                      {['Transaction ID','Date','Channel','Items','Payment','Total','Customer / Staff','Status','Actions'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sales.map((s) => (
                      <tr key={s._id} className={`hover:bg-gray-50 ${selected.has(s._id) ? 'bg-blue-50/50' : ''}`}>
                        <td className="px-4 py-3">
                          <input type="checkbox" className="rounded" checked={selected.has(s._id)} onChange={() => toggleOne(s._id)} />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">{s.transactionId}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{formatDateTime(s.createdAt)}</td>
                        <td className="px-4 py-3"><Badge variant={s.channel === 'STORE' ? 'info' : 'secondary'}>{s.channel}</Badge></td>
                        <td className="px-4 py-3 text-gray-600">{s.items.length} item(s)</td>
                        <td className="px-4 py-3 text-gray-600">{s.paymentMethod}</td>
                        <td className="px-4 py-3 font-semibold">₹{s.totalAmount.toFixed(2)}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {s.channel === 'WEB' ? (s.customer?.name || 'Web Customer') : (s.soldBy?.name || '—')}
                        </td>
                        <td className="px-4 py-3">
                          {s._type === 'order' ? (
                            <div className="flex flex-col gap-1">
                              <Badge variant={FULFILLMENT_VARIANT[s.fulfillmentStatus] || 'secondary'} className="text-xs">{s.fulfillmentStatus}</Badge>
                              <Badge variant={s.paymentStatus === 'PAID' ? 'success' : 'warning'} className="text-xs">{s.paymentStatus}</Badge>
                            </div>
                          ) : (
                            <Badge variant={s.status === 'COMPLETED' ? 'success' : 'warning'}>{s.status}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => setDetailSaleId(s._id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600" title="View / Return / Exchange">
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
                  <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></Button>
                  <Button size="sm" variant="outline" disabled={page === pages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {tab === 'creditNotes' && <CreditNotesList onViewSale={handleViewByTxnId} business={business} />}
      {tab === 'replacementNotes' && <ReplacementNotesList onViewSale={handleViewByTxnId} business={business} />}
      {tab === 'legacy' && (
        <div className="space-y-8">
          <LegacyReturnsList onViewSale={handleViewByTxnId} />
          <LegacyExchangesList onViewSale={handleViewByTxnId} />
        </div>
      )}

      {detailSaleId && (
        <SaleDetailModal
          saleId={detailSaleId}
          onClose={() => setDetailSaleId(null)}
          onDeleted={fetchSales}
          onSaved={fetchSales}
        />
      )}
    </div>
  );
}
