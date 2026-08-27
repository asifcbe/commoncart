import React, { useEffect, useState, useRef, Suspense, lazy } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Plus, Minus, ShoppingCart, AlertTriangle, Printer, ScanLine, Camera, X,
  Phone, Star, Tag, CheckCircle, UserPlus, UserCircle, MessageCircle, ArrowRightCircle,
  Zap, Keyboard, RotateCcw, Lock, Unlock, Maximize, Eye, EyeOff, SplitSquareHorizontal,
  Check, ChevronRight as ChevronRightIcon,
} from 'lucide-react';
import usePOSStore from '../store/usePOSStore';
import useAuthStore from '../store/useAuthStore';
import usePosLockStore from '../store/usePosLockStore';
import { useToast } from '../components/ui/Toast';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';
import { Card } from '../components/ui/Card';
import api from '../utils/api';
const CameraScanner = lazy(() => import('../components/CameraScanner'));
import { computeGst, printBillHTML, shareBillWhatsApp, carriedSettlementOf } from '../utils/bill';
import { formatDateTime } from '../utils/date';

const DEFAULT_PAYMENT_MODES = [
  { key: 'CASH', label: 'Cash' },
  { key: 'CARD', label: 'Card' },
  { key: 'MOBILE', label: 'Mobile' },
  { key: 'OTHER', label: 'Other' },
];

const STEPS = [
  { id: 'customer', label: 'Customer' },
  { id: 'scan', label: 'Scan Items' },
  { id: 'discount', label: 'Discount & Points' },
  { id: 'checkout', label: 'Checkout' },
];

function ReceiptModal({ transaction, saleData, business, billConfig, onClose }) {
  if (!transaction) return null;
  const hasDiscountedItems = transaction.items.some((i) => i.isDiscounted);
  const customerPhone = saleData?.customer?.phone;
  const customerName = saleData?.customer?.name;
  const gst = computeGst(transaction.totalAmount, business);
  const grandTotal = gst ? gst.grandTotal : transaction.totalAmount;
  const carried = carriedSettlementOf(transaction);
  const netPayable = grandTotal + (carried?.amount || 0);
  const pointsEarned = saleData?.pointsEarned || 0;
  const pointsRedeemed = saleData?.pointsRedeemed || 0;
  const pointsRedeemedValue = saleData?.pointsRedeemedValue ?? pointsRedeemed;
  const pointsEarnedRedeemedNow = saleData?.pointsEarnedRedeemedNow || 0;
  const balancePoints = saleData?.customer?.creditPoints ?? null;
  const splitPayments = transaction.splitPayments || [];

  const billExtra = { pointsEarned, pointsRedeemed, pointsRedeemedValue, pointsEarnedRedeemedNow, balancePoints, customer: saleData?.customer };

  return (
    <Modal open onClose={onClose} title="Receipt" size="sm">
      <div className="font-mono text-sm space-y-2">
        <div className="text-center border-b pb-3">
          <div className="font-bold text-base">{business?.businessName || 'CommonCart Store'}</div>
          {business?.addressLine && <div className="text-[11px] text-gray-500">{business.addressLine}</div>}
          {business?.phone && <div className="text-[11px] text-gray-500">Ph: {business.phone}</div>}
          {business?.gstin && <div className="text-[11px] text-gray-600">GSTIN: {business.gstin}</div>}
          <div className="text-xs text-gray-500 mt-1">{formatDateTime(transaction.createdAt)}</div>
          <div className="text-sm font-bold mt-1">Bill No: {transaction.transactionId}</div>
          {customerName && <div className="text-xs text-gray-600 mt-0.5">Customer: {customerName}</div>}
        </div>
        <div className="space-y-1 py-2">
          {transaction.items.map((item, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span>
                {i + 1}. {item.name}{item.isDiscounted && <span className="text-red-500 ml-1">(Discounted)</span>} x{item.qty}
              </span>
              <span>₹{(item.price * item.qty).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="border-t pt-2 space-y-1">
          {saleData?.discountAmount > 0 && (
            <div className="flex justify-between text-xs font-bold">
              <span>Bill Value</span><span>₹{(transaction.totalAmount + saleData.discountAmount).toFixed(2)}</span>
            </div>
          )}
          {saleData?.discountAmount > 0 && (
            <div className="flex justify-between text-xs text-green-600">
              <span>Discount</span><span>-₹{saleData.discountAmount.toFixed(2)}</span>
            </div>
          )}
          {pointsRedeemed > 0 && (
            <div className="flex justify-between text-xs text-amber-600">
              <span>Points Redeemed ({pointsRedeemed} pts)</span>
              <span>-₹{Number(pointsRedeemed).toFixed(2)}</span>
            </div>
          )}
          {gst && (
            <>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Taxable Value</span><span>₹{gst.net.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>CGST @ {gst.halfRate}%{gst.inclusive ? ' (incl.)' : ''}</span><span>₹{gst.cgst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>SGST @ {gst.halfRate}%{gst.inclusive ? ' (incl.)' : ''}</span><span>₹{gst.sgst.toFixed(2)}</span>
              </div>
            </>
          )}
          {carried && (
            <div className={`flex justify-between text-xs ${carried.amount > 0 ? 'text-red-500' : 'text-green-600'}`}>
              <span>{carried.sourceLabel}</span>
              <span>{carried.amount > 0 ? '+' : '-'}₹{Math.abs(carried.amount).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold">
            <span>{carried ? (netPayable < 0 ? 'Refund Due' : 'Net Payable') : 'TOTAL'}</span>
            <span>₹{Math.abs(netPayable).toFixed(2)}</span>
          </div>
          {splitPayments.length > 0 ? (
            <div className="space-y-0.5">
              {splitPayments.map((p, i) => (
                <div key={i} className="flex justify-between text-xs text-gray-500">
                  <span>Payment ({p.method})</span><span>₹{p.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex justify-between text-xs text-gray-500">
              <span>Payment</span><span>{transaction.paymentMethod}</span>
            </div>
          )}
          {(pointsEarned > 0 || balancePoints !== null) && (
            <div className="border-t pt-1 space-y-0.5">
              {pointsEarnedRedeemedNow > 0 ? (
                <div className="flex justify-between text-xs text-amber-600">
                  <span>Points Earned &amp; Redeemed This Bill</span><span>+{pointsEarnedRedeemedNow} pts (-₹{pointsEarnedRedeemedNow.toFixed(2)})</span>
                </div>
              ) : pointsEarned > 0 && (
                <div className="flex justify-between text-xs text-blue-600">
                  <span>Points Earned</span><span>+{pointsEarned} pts</span>
                </div>
              )}
              {balancePoints !== null && (
                <div className="flex justify-between text-xs text-blue-600">
                  <span>Balance Points</span><span>{balancePoints} pts</span>
                </div>
              )}
            </div>
          )}
        </div>
        {hasDiscountedItems && (
          <div className="text-xs text-red-600 border border-red-200 bg-red-50 rounded px-2 py-1.5 mt-1">
            * Discounted items cannot be replaced or exchanged.
          </div>
        )}
        <div className="text-center text-xs text-gray-400 pt-2 border-t">{business?.footerNote || 'Thank you for shopping!'}</div>
      </div>
      <div className="flex gap-3 mt-4 justify-end flex-wrap">
        {customerPhone && (
          <Button variant="outline"
            onClick={() => shareBillWhatsApp(transaction, customerPhone, business, { pointsEarned, pointsRedeemed, balancePoints })}
            className="text-green-700 border-green-300 hover:bg-green-50">
            <MessageCircle size={14} className="mr-2" /> Share on WhatsApp
          </Button>
        )}
        <Button variant="outline" onClick={() => printBillHTML(transaction, business, billConfig, billExtra)}>
          <Printer size={14} className="mr-2" /> Print Bill
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}

// Re-verifies the current user's own password (via POST /auth/verify-password)
// before lifting the kiosk lock — not a destructive action, so no separate
// confirm step is needed beyond getting the password right.
function UnlockModal({ onUnlock, onClose }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setVerifying(true);
    try {
      await api.post('/auth/verify-password', { password });
      onUnlock();
    } catch (err) {
      setError(err.response?.data?.message || 'Incorrect password');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="POS Locked" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <Lock size={20} className="text-blue-600 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800">
            This terminal is locked to the Point of Sale screen. Enter your account password to unlock and exit fullscreen.
          </p>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Password</label>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="Enter your password"
              required
              autoFocus
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
        </div>
        <Button type="submit" disabled={verifying || !password} className="w-full">
          {verifying ? <Spinner size="sm" className="mr-2" /> : <Unlock size={14} className="mr-2" />}
          Unlock
        </Button>
      </form>
    </Modal>
  );
}

function ConflictModal({ conflict, onClose }) {
  return (
    <Modal open onClose={onClose} title="⚠️ Stock Conflict" size="sm">
      <div className="space-y-4">
        <div className="p-4 bg-red-50 rounded-lg border border-red-200">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium text-red-800">Cannot Complete Sale</div>
              <div className="text-sm text-red-700 mt-1">{conflict.message}</div>
              {conflict.product && (
                <div className="text-xs text-red-600 mt-2">
                  Product: <strong>{conflict.product.name}</strong> | Available: <strong>{conflict.product.available}</strong>
                </div>
              )}
            </div>
          </div>
        </div>
        <Button onClick={onClose} className="w-full">Acknowledge</Button>
      </div>
    </Modal>
  );
}

// Search-as-you-type customer picker keyed on phone number (also matches name/
// email). Shows a dropdown of matches while typing; falls back to an inline
// "create customer" prompt once a search comes back empty. Selecting or
// creating a customer attaches it via onSelect — clearing goes back to search.
// `onEnterAdvance`: called when Enter is pressed with no dropdown selection
// active, so the step flow can advance past this field.
function CustomerPicker({ selected, onSelect, onClear, onEnterAdvance }) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false); // a search has completed at least once
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); setSearched(false); setShowDropdown(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/customers/admin', { params: { search: query.trim(), limit: 6 } });
        setResults(data.customers || []);
        setShowDropdown(true);
        setHighlightIdx(-1);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
        setSearched(true);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const pick = (customer) => {
    onSelect(customer);
    setQuery('');
    setResults([]);
    setShowDropdown(false);
    setShowCreate(false);
  };

  const handleCreate = async () => {
    if (!/^\d{7,}$/.test(query.trim())) { toast({ message: 'Enter a valid phone number first', type: 'warning' }); return; }
    setCreating(true);
    try {
      const { data } = await api.post('/customers/admin/pos', { name: newName.trim() || 'POS Customer', phone: query.trim() });
      toast({ message: `Customer "${data.customer.name}" added`, type: 'success' });
      pick(data.customer);
      setNewName('');
    } catch (err) {
      toast({ message: err.response?.data?.message || 'Failed to create customer', type: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e) => {
    if (showDropdown && results.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx((i) => Math.min(results.length - 1, i + 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx((i) => Math.max(0, i - 1)); return; }
      if (e.key === 'Escape') { setShowDropdown(false); return; }
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    // Nothing typed — continue with no customer.
    if (!query.trim()) { onEnterAdvance?.(); return; }
    // A match exists — take the highlighted row, otherwise the first match.
    if (results.length > 0) { pick(results[highlightIdx >= 0 ? highlightIdx : 0]); return; }
    // Something typed but no match — fall through to customer creation.
    if (searched && !searching) setShowCreate(true);
  };

  if (selected) {
    return (
      <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
        <div>
          <div className="text-sm font-medium text-blue-800">{selected.name}</div>
          <div className="flex items-center gap-2 text-xs text-blue-600">
            <Phone size={10} /> {selected.phone}
            {selected.creditPoints > 0 && (
              <span className="flex items-center gap-0.5 text-yellow-700">
                <Star size={10} className="fill-yellow-400 text-yellow-400" /> {selected.creditPoints} pts
              </span>
            )}
          </div>
        </div>
        <button onClick={onClear} className="text-gray-400 hover:text-red-500"><X size={14} /></button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShowCreate(false); }}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          placeholder="Search customer by phone… (Enter to skip)"
          className="pl-8 text-sm"
          autoFocus
        />
        {searching && <Spinner size="sm" className="absolute right-3 top-1/2 -translate-y-1/2" />}
      </div>

      {showDropdown && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg overflow-hidden max-h-56 overflow-y-auto">
          {results.map((c, i) => (
            <button
              key={c._id}
              onClick={() => pick(c)}
              onMouseEnter={() => setHighlightIdx(i)}
              className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${highlightIdx === i ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
            >
              <div>
                <div className="font-medium text-gray-800">{c.name}</div>
                <div className="text-xs text-gray-500">{c.phone}</div>
              </div>
              {c.creditPoints > 0 && (
                <span className="flex items-center gap-0.5 text-xs text-yellow-700">
                  <Star size={10} className="fill-yellow-400 text-yellow-400" /> {c.creditPoints}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {searched && !searching && results.length === 0 && query.trim() && (
        showCreate ? (
          <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-blue-700 flex items-center gap-1"><UserPlus size={12} /> New customer</p>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Customer name (optional)"
              className="text-sm"
              autoFocus
            />
            <div className="text-xs text-gray-500">Phone: {query.trim()}</div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={creating}>
                {creating ? <Spinner size="sm" className="mr-1" /> : <UserPlus size={12} className="mr-1" />}
                Add Customer
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <span className="text-xs text-amber-700">No customer found.</span>
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800">
              <UserPlus size={12} /> Create customer
            </button>
          </div>
        )
      )}
    </div>
  );
}

// Bill tabs bar — one tab per parallel in-progress sale. Each tab keeps its
// own cart/customer/discount/payment state (see usePOSStore's `bills`).
// Tab name: the selected customer (loyalty pick or typed walk-in name) once
// one is set, otherwise the bill's default "Bill N" label.
function billTabName(b) {
  return b.loyaltyCustomer?.name || b.customerName?.trim() || b.label;
}

function BillTabs({ bills, activeBillId, onSwitch, onAdd, onClose }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {bills.map((b) => (
        <button
          key={b.id}
          onClick={() => onSwitch(b.id)}
          className={`group flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-t-lg border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
            b.id === activeBillId ? 'border-blue-500 bg-white text-blue-700' : 'border-transparent text-gray-500 hover:bg-gray-100'
          }`}
        >
          {billTabName(b)}
          {b.cart.length > 0 && (
            <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${b.id === activeBillId ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
              {b.cart.length}
            </span>
          )}
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); onClose(b.id); }}
            className="ml-0.5 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 rounded"
          >
            <X size={12} />
          </span>
        </button>
      ))}
      <button onClick={onAdd} title="New bill tab" className="flex items-center justify-center h-8 w-8 rounded-t-lg text-gray-400 hover:bg-gray-100 hover:text-blue-600">
        <Plus size={16} />
      </button>
    </div>
  );
}

// Step indicator — Customer → Scan → Discount/Points → Checkout. All steps are
// always clickable (guided, not locked); Enter within a step calls onAdvance.
function StepBar({ step, onJump, cartCount }) {
  const currentIdx = STEPS.findIndex((s) => s.id === step);
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => {
        const done = i < currentIdx || (s.id === 'scan' && cartCount > 0 && i <= currentIdx);
        const active = s.id === step;
        return (
          <React.Fragment key={s.id}>
            {i > 0 && <div className={`h-px w-4 sm:w-8 ${i <= currentIdx ? 'bg-blue-300' : 'bg-gray-200'}`} />}
            <button
              type="button"
              onClick={() => onJump(s.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                active ? 'bg-blue-600 text-white' : done ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              <span className={`flex items-center justify-center h-4 w-4 rounded-full text-[10px] ${active ? 'bg-white/20' : done ? 'bg-blue-200' : 'bg-gray-300'}`}>
                {done && !active ? <Check size={10} /> : i + 1}
              </span>
              {s.label}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function POS() {
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    bills, activeBillId, patchBill, addBillTab, switchBillTab, closeBillTab, resetBillTab,
    addToCart, updateQty, removeFromCart, clearCart, checkout, processing,
  } = usePOSStore();
  const { user } = useAuthStore();

  const bill = bills.find((b) => b.id === activeBillId) || bills[0];
  const {
    step, cart, customerName, loyaltyCustomer, redeemPoints, redeemEarnedNow,
    couponCode, couponData, discountMode, discountInput, roundOff,
    paymentMethod, splitMode, splitRows, soldBy, carryForward,
  } = bill;

  const [paymentModes, setPaymentModes] = useState(DEFAULT_PAYMENT_MODES);
  const [staffList, setStaffList] = useState([]);
  // The one way to add items: scan (keyboard-wedge or camera) a barcode here.
  // A "3*"/"3x" prefix before the code adds that many units in one shot.
  const [scanInput, setScanInput] = useState('');
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [saleData, setSaleData] = useState(null);
  const [business, setBusiness] = useState(null);
  const [billConfig, setBillConfig] = useState(null);
  const [couponValidating, setCouponValidating] = useState(false);
  const [creditConfig, setCreditConfig] = useState({ rupeesPerPoint: 1000, pointValue: 1 });
  const scanRef = useRef(null);
  // Round-off stepper: repeated clicks in the same direction widen the
  // denomination (₹1 → ₹10 → ₹100 → …); switching direction or editing the
  // cart resets it back to ₹1.
  const roundStepRef = useRef({ dir: null, scale: 1 });

  // Fullscreen + kiosk lock — confines the browser to this page (see Layout.jsx
  // for the route guard) until the current user re-enters their password.
  const { locked, lock, unlock } = usePosLockStore();
  const [showUnlock, setShowUnlock] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  const setStep = (s) => patchBill({ step: s });
  const goNextStep = () => {
    const idx = STEPS.findIndex((s) => s.id === step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1].id);
  };

  const focusScan = () => scanRef.current?.focus();

  // Focus whatever the active step's primary input is.
  useEffect(() => {
    if (step === 'scan') focusScan();
  }, [step, activeBillId]);

  // Track fullscreen state from any source (our button, browser Esc, F11) so
  // the UI stays honest about whether we're actually fullscreen.
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const enterFullscreenAndLock = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen can be denied/unsupported (e.g. iOS Safari) — the nav-lock
      // itself doesn't depend on it, so lock regardless.
    }
    lock();
    toast({ message: 'POS locked — enter your password to unlock', type: 'info' });
    focusScan();
  };

  const handleUnlock = async () => {
    unlock();
    setShowUnlock(false);
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* ignore */ }
    }
    toast({ message: 'POS unlocked', type: 'success' });
  };

  // Load business / GST / payment-mode / credit config once for the page
  useEffect(() => {
    api.get('/settings/business-config').then(({ data }) => setBusiness(data.config)).catch(() => {});
    api.get('/settings/bill-print-config').then(({ data }) => setBillConfig(data.config)).catch(() => {});
    api.get('/settings/payment-modes-config').then(({ data }) => {
      if (data.config?.modes?.length) setPaymentModes(data.config.modes);
    }).catch(() => {});
    api.get('/settings/credit-config').then(({ data }) => setCreditConfig(data.config)).catch(() => {});
  }, []);

  // Load staff list for the "sale attended by" dropdown; default every bill to the logged-in user
  useEffect(() => {
    api.get('/staff/options')
      .then(({ data }) => {
        setStaffList(data.staff || []);
        const me = user?.id || user?._id;
        const defaultId = (me && data.staff?.some((s) => s._id === me)) ? me : data.staff?.[0]?._id;
        if (defaultId && !soldBy) patchBill({ soldBy: defaultId });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScan = async (rawCode) => {
    // "3*1234567890123" or "3x1234567890123" → add 3 units of that barcode.
    const match = rawCode.match(/^(\d+)[*x](.+)$/i);
    const qty = match ? Math.max(1, parseInt(match[1], 10)) : 1;
    const code = (match ? match[2] : rawCode).trim();
    if (!code) return;
    try {
      const { data } = await api.get(`/products/barcode/${code}`);
      const product = data.product;
      const available = product.quantity - product.reservedQty;
      if (available <= 0) {
        setConflict({ message: `${product.name} is out of stock.`, product: { name: product.name, available: 0 } });
        return;
      }
      const added = addToCart(product, qty);
      if (!added) {
        toast({ message: `Only ${available} of ${product.name} in stock — already at max in cart.`, type: 'warning' });
        return;
      }
      toast({ message: `Added: ${qty > 1 ? `${qty}x ` : ''}${product.name}`, type: 'success' });
    } catch {
      toast({ message: 'Product not found for scanned barcode', type: 'error' });
    } finally {
      focusScan();
    }
  };

  const handleScanKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (scanInput.trim()) {
        handleScan(scanInput.trim());
        setScanInput('');
      } else if (cart.length > 0) {
        goNextStep();
      }
    } else if (e.key === 'Escape') {
      setScanInput('');
    }
  };

  // Consume a settlement carried forward from Sales History's "Continue to
  // New Sale" — prefill the customer and drop the router state so a refresh
  // or back-navigation doesn't silently reapply it. Applies to whichever bill
  // tab is active on mount (a fresh POS visit starts with exactly one tab).
  useEffect(() => {
    const carried = location.state?.carryForward;
    if (!carried) return;
    patchBill({ carryForward: carried });
    if (location.state?.customerName) patchBill({ customerName: location.state.customerName });
    if (location.state?.customerPhone) {
      api.get(`/customers/admin/lookup/${location.state.customerPhone}`)
        .then(({ data }) => patchBill({ loyaltyCustomer: data.customer }))
        .catch(() => {});
    }
    navigate('.', { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wipes this tab's in-progress sale — cart, customer, discounts/coupon,
  // payment method — back to a blank bill. For starting over mid-sale
  // (wrong customer, wrong items) without reloading the page.
  const handleResetSale = () => {
    if (cart.length === 0 && !loyaltyCustomer && !customerName && !couponData && !discountInput && !roundOff && !carryForward) {
      focusScan();
      return;
    }
    if (!confirm('Reset this bill? The cart and all entered details will be cleared.')) return;
    resetBillTab(activeBillId);
    setScanInput('');
    toast({ message: 'Bill reset', type: 'info' });
  };

  const handleValidateCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponValidating(true);
    try {
      const { data } = await api.get('/coupons/validate', { params: { code: couponCode.trim(), subtotal: cartTotal } });
      if (data.valid) {
        patchBill({ couponData: data });
        toast({ message: `Coupon applied: -₹${data.discount.toFixed(2)}`, type: 'success' });
      }
    } catch (err) {
      patchBill({ couponData: null });
      toast({ message: err.response?.data?.message || 'Invalid coupon', type: 'error' });
    } finally {
      setCouponValidating(false);
    }
  };

  const handleCheckout = async (printAfter = false) => {
    if (cart.length === 0) { toast({ message: 'Cart is empty', type: 'warning' }); return; }
    if (splitMode && Math.abs(splitRemaining) > 0.01) {
      toast({ message: `Split payment must add up to ₹${finalTotal.toFixed(2)} (₹${Math.abs(splitRemaining).toFixed(2)} ${splitRemaining > 0 ? 'remaining' : 'over'})`, type: 'warning' });
      return;
    }
    try {
      const result = await checkout(paymentMethod, {
        customerName: customerName.trim(),
        customerPhone: loyaltyCustomer?.phone || '',
        couponCode: couponCode.trim(),
        redeemPoints: Number(redeemPoints) || 0,
        redeemEarnedNow: earnedNowDiscount > 0,
        soldBy,
        manualDiscount,
        roundOff: roundOffAmount,
        carryForward: carryForward || undefined,
        splitPayments: splitMode ? splitRows.filter((r) => Number(r.amount) > 0).map((r) => ({ method: r.method, amount: Number(r.amount) })) : undefined,
      });
      setSaleData(result);
      setReceipt(result.transaction);
      setShowReceipt(true);
      if (printAfter) {
        const billExtra = {
          pointsEarned: result.pointsEarned || 0,
          pointsRedeemed: result.pointsRedeemed || 0,
          pointsRedeemedValue: result.pointsRedeemedValue ?? result.pointsRedeemed ?? 0,
          pointsEarnedRedeemedNow: result.pointsEarnedRedeemedNow || 0,
          balancePoints: result.customer?.creditPoints ?? null,
          customer: result.customer,
        };
        printBillHTML(result.transaction, business, billConfig, billExtra);
      }
      toast({ message: 'Sale completed!', type: 'success' });
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.conflict) {
        setConflict(errData);
      } else {
        toast({ message: errData?.message || 'Checkout failed', type: 'error' });
      }
    }
  };

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const pointsDiscount = loyaltyCustomer ? (Number(redeemPoints) || 0) : 0; // 1 point = ₹1
  const couponDiscount = couponData?.discount || 0;
  const manualDiscount = discountMode === '%'
    ? Math.min(cartTotal, (Number(discountInput) || 0) / 100 * cartTotal)
    : Math.min(cartTotal, Number(discountInput) || 0);
  // Points this bill qualifies for — based on what the customer actually pays
  // (cart total minus points-from-balance/coupon/manual discounts), mirroring
  // the backend calc. Excludes the redeem-now discount itself (circular).
  const preEarnDiscount = pointsDiscount + couponDiscount + manualDiscount;
  const pointsEarnedThisBill = Math.floor(Math.max(0, cartTotal - preEarnDiscount) / (creditConfig.rupeesPerPoint || 1000));
  const earnedNowDiscount = (loyaltyCustomer && redeemEarnedNow) ? pointsEarnedThisBill * (creditConfig.pointValue || 1) : 0;
  const totalDiscount = pointsDiscount + couponDiscount + manualDiscount + earnedNowDiscount;
  const preRound = Math.max(0, cartTotal - totalDiscount);
  const roundOffAmount = Number(roundOff) || 0;
  const carryForwardAmount = carryForward?.amount || 0;
  const finalTotal = preRound + roundOffAmount + carryForwardAmount;

  // Step the round-off adjustment down/up through widening denominations.
  // First click snaps to the nearest whole rupee; each further click in the
  // *same* direction widens the scale ×10 (rupee → ten → hundred → …), so
  // repeated clicks walk e.g. 1234.4 → 1234 → 1230 → 1200. Switching
  // direction restarts at the ₹1 scale.
  const stepRoundOff = (dir) => {
    const current = Math.round((preRound + roundOffAmount) * 100) / 100;
    const streak = roundStepRef.current;
    const scale = streak.dir === dir ? streak.scale * 10 : 1;
    roundStepRef.current = { dir, scale };
    const snapped = dir === 'down' ? Math.floor(current / scale) * scale : Math.ceil(current / scale) * scale;
    const target = snapped !== current ? snapped : (dir === 'down' ? current - scale : current + scale);
    patchBill({ roundOff: Math.round((target - preRound) * 100) / 100 });
  };

  // Any change to what's owed invalidates the click streak — otherwise the
  // next +/- press would jump by a stale denomination against a new total.
  useEffect(() => { roundStepRef.current = { dir: null, scale: 1 }; }, [preRound]);

  // "Redeem now" only has an effect (and is only shown) while this bill
  // actually earns points — if editing the balance-redeem field, cart, or
  // discounts drops that to 0, uncheck it instead of leaving stale state
  // behind that has no visible checkbox to turn off.
  useEffect(() => {
    if (redeemEarnedNow && pointsEarnedThisBill === 0) patchBill({ redeemEarnedNow: false });
  }, [pointsEarnedThisBill, redeemEarnedNow]);

  const maxRedeemable = loyaltyCustomer ? Math.floor(Math.min(loyaltyCustomer.creditPoints, cartTotal)) : 0;

  const splitTotal = splitRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const splitRemaining = finalTotal - splitTotal;

  // Global shortcuts — active anywhere on the page except while typing in a
  // text field (so "1"-"4" don't hijack the customer-name/discount inputs).
  // F2 / Ctrl+Enter = checkout, 1-4 = payment method, Esc = refocus scanner.
  useEffect(() => {
    const handler = (e) => {
      const tag = e.target.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === 'F2' || (e.ctrlKey && e.key === 'Enter')) {
        e.preventDefault();
        handleCheckout(true);
        return;
      }
      if (!isTyping && !splitMode) {
        const idx = Number(e.key) - 1;
        if (idx >= 0 && idx < 4 && paymentModes[idx]) { patchBill({ paymentMethod: paymentModes[idx].key }); return; }
        if (e.key === 'Escape') { focusScan(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, paymentMethod, paymentModes, splitMode, customerName, loyaltyCustomer, couponCode, redeemPoints, redeemEarnedNow, soldBy, discountMode, discountInput, roundOff, carryForward, splitRows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Point of Sale</h1>
          <p className="text-gray-500 text-sm mt-1">In-store sales terminal</p>
        </div>
        <div className="flex items-center gap-3">
          {!locked && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Keyboard size={13} />
              <span><kbd className="px-1.5 py-0.5 bg-gray-100 rounded border text-gray-600">Enter</kbd> Next step</span>
              <span className="text-gray-300">·</span>
              <span><kbd className="px-1.5 py-0.5 bg-gray-100 rounded border text-gray-600">F2</kbd> Checkout</span>
              <span className="text-gray-300">·</span>
              <span><kbd className="px-1.5 py-0.5 bg-gray-100 rounded border text-gray-600">1-4</kbd> Payment</span>
            </div>
          )}
          <Button type="button" variant="outline" size="sm" onClick={handleResetSale} title="Clear this bill's cart and all entered details">
            <RotateCcw size={13} className="mr-1.5" /> Reset Bill
          </Button>
          {locked ? (
            <>
              {!isFullscreen && (
                <Button type="button" variant="outline" size="sm" onClick={() => document.documentElement.requestFullscreen().catch(() => {})}>
                  <Maximize size={13} className="mr-1.5" /> Re-enter Fullscreen
                </Button>
              )}
              <Button type="button" size="sm" onClick={() => setShowUnlock(true)} className="bg-gray-800 hover:bg-gray-900 text-white">
                <Lock size={13} className="mr-1.5" /> Locked — Unlock
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={enterFullscreenAndLock} title="Fullscreen this screen and confine navigation to POS until unlocked">
              <Maximize size={13} className="mr-1.5" /> Fullscreen &amp; Lock
            </Button>
          )}
        </div>
      </div>

      {/* Bill tabs — multiple parallel in-progress sales */}
      <BillTabs
        bills={bills}
        activeBillId={activeBillId}
        onSwitch={switchBillTab}
        onAdd={addBillTab}
        onClose={(id) => {
          const target = bills.find((b) => b.id === id);
          if (target && (target.cart.length > 0 || target.loyaltyCustomer || target.customerName)) {
            if (!confirm(`Close "${billTabName(target)}"? Its cart and entered details will be discarded.`)) return;
          }
          closeBillTab(id);
        }}
      />

      {/* Step indicator — guided flow, all steps stay clickable */}
      <div className="bg-white rounded-lg border p-3 overflow-x-auto">
        <StepBar step={step} onJump={setStep} cartCount={cart.length} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: step content */}
        <div className="xl:col-span-2 space-y-4">
          {/* Step 1: Customer */}
          {step === 'customer' && (
            <Card className="p-4 border-2 border-blue-100 bg-blue-50/40 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-blue-900">
                <Phone size={16} /> Step 1 — Customer
              </div>
              <CustomerPicker
                selected={loyaltyCustomer}
                onSelect={(c) => { patchBill({ loyaltyCustomer: c, redeemPoints: '', redeemEarnedNow: false }); goNextStep(); }}
                onClear={() => patchBill({ loyaltyCustomer: null, redeemPoints: '', redeemEarnedNow: false })}
                onEnterAdvance={goNextStep}
              />
              {!loyaltyCustomer && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <UserCircle size={11} /> Name for bill (optional)
                  </label>
                  <Input
                    value={customerName}
                    onChange={(e) => patchBill({ customerName: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') goNextStep(); }}
                    placeholder="Walk-in customer"
                    className="text-sm"
                  />
                </div>
              )}
              <div className="flex justify-end">
                <Button size="sm" onClick={goNextStep}>
                  Next: Scan Items <ChevronRightIcon size={14} className="ml-1" />
                </Button>
              </div>
            </Card>
          )}

          {/* Step 2: Scan */}
          {step === 'scan' && (
            <Card className="p-4 border-2 border-blue-100 bg-blue-50/40">
              <div className="flex items-center gap-2 font-semibold text-blue-900 mb-3">
                <ScanLine size={16} /> Step 2 — Scan Items
              </div>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <ScanLine size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-400" />
                  <Input
                    ref={scanRef}
                    autoFocus
                    className="pl-11 h-14 text-lg font-mono border-blue-200 focus-visible:ring-blue-400"
                    placeholder="Scan barcode… (type 3* before a code to add 3 at once, Enter with empty field to continue)"
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    onKeyDown={handleScanKeyDown}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCameraScanner(true)}
                  title="Scan with device camera"
                  className="h-14 px-5"
                >
                  <Camera size={20} />
                </Button>
              </div>
              <div className="flex justify-between items-center mt-3">
                <Button size="sm" variant="ghost" onClick={() => setStep('customer')}>Back</Button>
                <Button size="sm" onClick={goNextStep} disabled={cart.length === 0}>
                  Next: Discount &amp; Points <ChevronRightIcon size={14} className="ml-1" />
                </Button>
              </div>
            </Card>
          )}

          {/* Cart — always visible once it has items, regardless of step */}
          <Card className="flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2 font-semibold">
                <ShoppingCart size={18} /> Cart ({cart.length})
              </div>
              {cart.length > 0 && (
                <button onClick={() => { clearCart(); focusScan(); }} className="text-xs text-red-500 hover:underline">Clear</button>
              )}
            </div>

            <div className="min-h-[200px] max-h-[calc(100vh-480px)] overflow-y-auto">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-52 text-gray-400 text-sm">
                  <ScanLine size={32} className="mb-2 opacity-30" />
                  {step === 'customer' ? 'Pick a customer, then scan items' : 'Scan a barcode to add the first item'}
                </div>
              ) : (
                <div className="divide-y">
                  {cart.map((item, i) => (
                    <div key={item.productId} className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {i + 1}. {item.name}
                          {item.isDiscounted && <span className="ml-1 text-xs text-red-500">(Discounted)</span>}
                        </div>
                        <div className="text-xs text-gray-500 font-mono">{item.barcode} · ₹{item.price.toFixed(2)} each</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => updateQty(item.productId, item.qty - 1)} className="h-7 w-7 rounded border flex items-center justify-center hover:bg-gray-100">
                          <Minus size={12} />
                        </button>
                        <span className="text-sm font-medium w-6 text-center">{item.qty}</span>
                        <button onClick={() => updateQty(item.productId, item.qty + 1)} disabled={item.qty >= item.maxQty} className="h-7 w-7 rounded border flex items-center justify-center hover:bg-gray-100 disabled:opacity-40">
                          <Plus size={12} />
                        </button>
                      </div>
                      <span className="text-sm font-bold w-20 text-right shrink-0">₹{(item.price * item.qty).toFixed(2)}</span>
                      <button onClick={() => removeFromCart(item.productId)} className="text-gray-400 hover:text-red-500 shrink-0">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right: Discount/Points + Checkout panels, shown per step (but Total summary always visible) */}
        <Card className="flex flex-col">
          {step === 'discount' && (
            <div className="p-3 space-y-3 bg-gray-50 border-b">
              <div className="flex items-center gap-2 font-semibold text-gray-800">
                <Tag size={16} /> Step 3 — Discount &amp; Points
              </div>

              {/* Redeem points */}
              {loyaltyCustomer && loyaltyCustomer.creditPoints > 0 && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <Star size={11} /> Redeem Points (1 pt = ₹1, max {maxRedeemable})
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      max={maxRedeemable}
                      value={redeemPoints}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') { patchBill({ redeemPoints: '' }); return; }
                        patchBill({ redeemPoints: Math.min(maxRedeemable, Math.max(0, Math.floor(Number(raw) || 0))) });
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') goNextStep(); }}
                      className="text-sm w-28"
                      placeholder="Enter points"
                      autoFocus
                    />
                    <span className="text-xs text-gray-400">pts</span>
                    {pointsDiscount > 0 && (
                      <span className="text-xs text-green-600 ml-1">= -₹{pointsDiscount.toFixed(2)}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Points earned by this bill — redeem now instead of carrying forward */}
              {loyaltyCustomer && pointsEarnedThisBill > 0 && (
                <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <div className="text-xs text-amber-800">
                    Earns <strong>{pointsEarnedThisBill} pts</strong> on this bill
                    {redeemEarnedNow && <span className="text-green-600"> · redeeming now = -₹{earnedNowDiscount.toFixed(2)}</span>}
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-amber-800 cursor-pointer whitespace-nowrap">
                    <input type="checkbox" checked={redeemEarnedNow} onChange={(e) => patchBill({ redeemEarnedNow: e.target.checked })} className="rounded" />
                    Redeem now
                  </label>
                </div>
              )}

              {/* Coupon */}
              <div>
                <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                  <Tag size={11} /> Coupon Code
                </label>
                {couponData ? (
                  <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <div>
                      <div className="text-sm font-medium text-green-800 flex items-center gap-1">
                        <CheckCircle size={13} /> {couponData.coupon.code}
                      </div>
                      <div className="text-xs text-green-600">-₹{couponData.discount.toFixed(2)} off</div>
                    </div>
                    <button onClick={() => { patchBill({ couponCode: '', couponData: null }); }} className="text-gray-400 hover:text-red-500"><X size={14} /></button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      value={couponCode}
                      onChange={(e) => patchBill({ couponCode: e.target.value.toUpperCase() })}
                      onKeyDown={(e) => e.key === 'Enter' && handleValidateCoupon()}
                      placeholder="Enter coupon code"
                      className="text-sm uppercase"
                    />
                    <Button size="sm" variant="outline" onClick={handleValidateCoupon} disabled={couponValidating || !couponCode.trim()}>
                      {couponValidating ? <Spinner size="sm" /> : 'Apply'}
                    </Button>
                  </div>
                )}
              </div>

              {/* Manual discount */}
              <div>
                <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                  <Tag size={11} /> Additional Discount
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex rounded border overflow-hidden">
                    <button
                      type="button"
                      onClick={() => patchBill({ discountMode: '%' })}
                      className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${discountMode === '%' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    >%</button>
                    <button
                      type="button"
                      onClick={() => patchBill({ discountMode: '₹' })}
                      className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${discountMode === '₹' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    >₹</button>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max={discountMode === '%' ? 100 : cartTotal}
                    step="0.01"
                    value={discountInput}
                    onChange={(e) => patchBill({ discountInput: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') goNextStep(); }}
                    placeholder={discountMode === '%' ? 'e.g. 10' : 'e.g. 50'}
                    className="text-sm flex-1"
                  />
                  {manualDiscount > 0 && (
                    <span className="text-xs text-green-600 whitespace-nowrap">-₹{manualDiscount.toFixed(2)}</span>
                  )}
                </div>
              </div>

              {/* Round off — step down/up through ₹1 → ₹10 → ₹100 denominations */}
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-500">Round Off Total</label>
                <div className="flex items-center gap-2">
                  {roundOffAmount !== 0 && (
                    <>
                      <span className={`text-xs font-medium ${roundOffAmount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {roundOffAmount > 0 ? '+' : ''}₹{roundOffAmount.toFixed(2)}
                      </span>
                      <button type="button" onClick={() => { roundStepRef.current = { dir: null, scale: 1 }; patchBill({ roundOff: 0 }); }}
                        className="text-gray-400 hover:text-red-500" title="Clear round off">
                        <X size={12} />
                      </button>
                    </>
                  )}
                  <button type="button" onClick={() => stepRoundOff('down')}
                    className="h-6 w-6 rounded border flex items-center justify-center hover:bg-gray-50 bg-white" title="Round down">
                    <Minus size={12} />
                  </button>
                  <button type="button" onClick={() => stepRoundOff('up')}
                    className="h-6 w-6 rounded border flex items-center justify-center hover:bg-gray-50 bg-white" title="Round up">
                    <Plus size={12} />
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center pt-1">
                <Button size="sm" variant="ghost" onClick={() => setStep('scan')}>Back</Button>
                <Button size="sm" onClick={goNextStep}>
                  Next: Checkout <ChevronRightIcon size={14} className="ml-1" />
                </Button>
              </div>
            </div>
          )}

          {step !== 'discount' && (carryForward && carryForwardAmount !== 0) && (
            <div className="p-3 bg-gray-50 border-b">
              <div className={`flex justify-between text-xs ${carryForwardAmount > 0 ? 'text-red-500' : 'text-green-600'}`}>
                <span className="flex items-center gap-1">
                  <ArrowRightCircle size={11} /> {carryForward.sourceLabel || 'Carried forward'}
                  <button type="button" onClick={() => patchBill({ carryForward: null })} className="text-gray-400 hover:text-red-500 ml-1"><X size={11} /></button>
                </span>
                <span>{carryForwardAmount > 0 ? '+' : ''}₹{carryForwardAmount.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Order summary — always visible so the running total is never hidden */}
          <div className="p-4 space-y-3">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span><span>₹{cartTotal.toFixed(2)}</span>
              </div>
              {pointsDiscount > 0 && (
                <div className="flex justify-between text-amber-600 text-xs">
                  <span>Points ({Number(redeemPoints)} pts)</span><span>-₹{pointsDiscount.toFixed(2)}</span>
                </div>
              )}
              {earnedNowDiscount > 0 && (
                <div className="flex justify-between text-amber-600 text-xs">
                  <span>Points Earned & Redeemed Now ({pointsEarnedThisBill} pts)</span><span>-₹{earnedNowDiscount.toFixed(2)}</span>
                </div>
              )}
              {couponDiscount > 0 && (
                <div className="flex justify-between text-green-600 text-xs">
                  <span>Coupon</span><span>-₹{couponDiscount.toFixed(2)}</span>
                </div>
              )}
              {manualDiscount > 0 && (
                <div className="flex justify-between text-green-600 text-xs">
                  <span>Discount ({discountMode === '%' ? `${discountInput}%` : `₹${discountInput}`})</span>
                  <span>-₹{manualDiscount.toFixed(2)}</span>
                </div>
              )}
              {roundOffAmount !== 0 && (
                <div className={`flex justify-between text-xs ${roundOffAmount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                  <span>Round Off</span>
                  <span>{roundOffAmount > 0 ? '+' : ''}₹{roundOffAmount.toFixed(2)}</span>
                </div>
              )}
              {step === 'discount' && carryForward && carryForwardAmount !== 0 && (
                <div className={`flex justify-between text-xs ${carryForwardAmount > 0 ? 'text-red-500' : 'text-green-600'}`}>
                  <span>{carryForward.sourceLabel || 'Carried forward'}</span>
                  <span>{carryForwardAmount > 0 ? '+' : ''}₹{carryForwardAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-base font-bold pt-1 border-t">
                <span>{finalTotal < 0 ? 'Refund Due' : 'Total'}</span>
                <span className={finalTotal < 0 ? 'text-green-600' : ''}>₹{Math.abs(finalTotal).toFixed(2)}</span>
              </div>
            </div>

            {step === 'checkout' && (
              <>
                <div>
                  <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <UserCircle size={11} /> Sale Attended By
                  </label>
                  <Select value={soldBy} onChange={(e) => patchBill({ soldBy: e.target.value })}>
                    {staffList.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name}{s.role === 'ADMIN' ? ' (Admin)' : ''}{(s._id === (user?.id || user?._id)) ? ' — You' : ''}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-gray-500 flex items-center gap-1">
                      <Zap size={11} /> Payment Method {!splitMode && <span className="text-gray-300">(press 1-4)</span>}
                    </label>
                    <button
                      type="button"
                      onClick={() => patchBill({
                        splitMode: !splitMode,
                        splitRows: !splitMode ? splitRows.map((r, i) => ({ ...r, amount: i === 0 ? finalTotal.toFixed(2) : '' })) : splitRows,
                      })}
                      className={`flex items-center gap-1 text-[11px] font-medium ${splitMode ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      <SplitSquareHorizontal size={12} /> Split payment
                    </button>
                  </div>
                  {splitMode ? (
                    <div className="space-y-1.5">
                      {splitRows.map((row, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <Select
                            value={row.method}
                            onChange={(e) => patchBill({ splitRows: splitRows.map((r, idx) => idx === i ? { ...r, method: e.target.value } : r) })}
                            className="text-sm flex-1"
                          >
                            {paymentModes.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                          </Select>
                          <Input
                            type="number" min="0" step="0.01"
                            value={row.amount}
                            onChange={(e) => patchBill({ splitRows: splitRows.map((r, idx) => idx === i ? { ...r, amount: e.target.value } : r) })}
                            placeholder="0.00"
                            className="text-sm w-24"
                          />
                          {splitRows.length > 2 && (
                            <button type="button" onClick={() => patchBill({ splitRows: splitRows.filter((_, idx) => idx !== i) })} className="text-gray-400 hover:text-red-500">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => patchBill({ splitRows: [...splitRows, { method: paymentModes[0]?.key || 'CASH', amount: '' }] })}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          + Add split
                        </button>
                        <span className={`text-xs font-medium ${Math.abs(splitRemaining) < 0.01 ? 'text-green-600' : 'text-red-500'}`}>
                          {Math.abs(splitRemaining) < 0.01 ? 'Balanced' : `₹${Math.abs(splitRemaining).toFixed(2)} ${splitRemaining > 0 ? 'remaining' : 'over'}`}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-1.5">
                      {paymentModes.map((m, i) => (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => patchBill({ paymentMethod: m.key })}
                          className={`relative px-2 py-2 rounded-lg border-2 text-xs font-semibold transition-colors ${
                            paymentMethod === m.key ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          {i < 4 && <span className="absolute top-0.5 right-1 text-[9px] text-gray-300">{i + 1}</span>}
                          {m.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1 h-12 text-base"
                    onClick={() => handleCheckout(true)}
                    disabled={processing || cart.length === 0 || (splitMode && Math.abs(splitRemaining) > 0.01)}
                    title="Complete the sale and print the bill immediately"
                  >
                    {processing ? <Spinner size="sm" className="mr-2" /> : null}
                    {processing
                      ? 'Processing…'
                      : finalTotal < 0
                        ? `Checkout & Print — Refund ₹${Math.abs(finalTotal).toFixed(2)}`
                        : `Checkout & Print ₹${finalTotal.toFixed(2)}  (F2)`}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 px-4 shrink-0"
                    onClick={() => handleCheckout(false)}
                    disabled={processing || cart.length === 0 || (splitMode && Math.abs(splitRemaining) > 0.01)}
                    title="Complete the sale without printing"
                  >
                    Checkout
                  </Button>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setStep('discount')} className="w-full">Back</Button>
              </>
            )}

            {step !== 'checkout' && cart.length > 0 && (
              <Button className="w-full" onClick={() => setStep('checkout')}>
                Skip to Checkout <ChevronRightIcon size={14} className="ml-1" />
              </Button>
            )}
          </div>
        </Card>
      </div>

      {showUnlock && <UnlockModal onUnlock={handleUnlock} onClose={() => { setShowUnlock(false); focusScan(); }} />}
      {conflict && <ConflictModal conflict={conflict} onClose={() => { setConflict(null); focusScan(); }} />}
      {showReceipt && <ReceiptModal transaction={receipt} saleData={saleData} business={business} billConfig={billConfig} onClose={() => { setShowReceipt(false); setReceipt(null); setSaleData(null); setStep('customer'); focusScan(); }} />}
      {showCameraScanner && (
        <Suspense fallback={null}>
          <CameraScanner
            open
            continuous
            title="Scan Product Barcode"
            onScan={(code) => handleScan(code.trim())}
            onClose={() => { setShowCameraScanner(false); focusScan(); }}
          />
        </Suspense>
      )}
    </div>
  );
}
