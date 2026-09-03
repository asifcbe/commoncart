# CommonCart — Project Context for Claude

## Project Overview
Full-stack retail POS + inventory management system.
- **Backend:** Node.js + Express + MongoDB (Mongoose). Entry: `backend/server.js`.
- **Frontend:** React (Vite), Tailwind CSS, Zustand for POS state. Entry: `frontend/src/`.
- **Auth:** JWT middleware — `protect` (any logged-in user), `adminOnly` (admin role).

---

## Architecture

### Backend key files
| File | Purpose |
|------|---------|
| `backend/controllers/purchaseController.js` | Create/update/delete purchases, `findPurchaseByBarcode`. `deletePurchase` hard-deletes never-sold unit-products, deactivates sold ones |
| `backend/controllers/settingsController.js` | All settings CRUD + `reserveBarcodes` endpoint |
| `backend/controllers/salesController.js` | `processStoreSale` — POS checkout; accepts `carryForward` (see Return/Exchange) |
| `backend/controllers/returnSessionController.js` | Return/Exchange/Replace session — `processReturnSession` |
| `backend/controllers/authController.js` | Login/register/me + `verifyPassword` (re-check own password without re-login, used by POS unlock) |
| `backend/controllers/productController.js` | `listProducts` filters: `search`, `category`, `subCategory`, `color`, `size`, `isActive` |
| `backend/utils/generateBarcode.js` | `generateEAN13()` — sequential atomic barcode generator |
| `backend/models/AppSettings.js` | Key-value settings store (used for barcode counter) |
| `backend/models/SaleTransaction.js` | `carriedSettlement: { amount, sourceLabel }` — non-taxable carry-forward adjustment, separate from `totalAmount` (which stays GST-basis, goods-only) |
| `backend/models/Customer.js` | `storeCredit` (rupee-denominated refund balance) vs `creditPoints` (loyalty points) — separate unit systems |
| `backend/routes/purchases.js` | Purchase routes — `/find-by-barcode` MUST come before `/:id` |
| `backend/routes/settings.js` | Settings routes including `POST /reserve-barcodes` |
| `backend/routes/auth.js` | `POST /auth/verify-password` — protect-only, no adminOnly |

### Frontend key files
| File | Purpose |
|------|---------|
| `frontend/src/pages/Purchase.jsx` | Purchase create/edit UI (Step 1 + Step 2 layout) |
| `frontend/src/pages/Products.jsx` | Products list; barcode scan to open product; filters: search, category, subCategory, variant, size |
| `frontend/src/pages/POS.jsx` | Point-of-sale UI (Zustand: `usePOSStore`, `usePosLockStore`). No product grid — barcode scan is the only way to add items |
| `frontend/src/pages/SalesHistory.jsx` | Sales list + Transaction Detail modal (Return/Exchange/Replace sessions, barcode search/highlight) |
| `frontend/src/pages/Settings.jsx` | Grouped sidebar nav (Account / Store & Billing / Catalog / Automation / Danger Zone), not top tabs |
| `frontend/src/components/LabelPrintModal.jsx` | Barcode label print modal |
| `frontend/src/store/usePosLockStore.js` | POS kiosk-lock flag, persisted to `localStorage` (survives refresh/tab-close) |
| `frontend/src/utils/bill.js` | Bill/receipt HTML + `carriedSettlementOf()`; `printBillHTML`/`printDocumentHTML` print via a hidden same-page iframe, **not** `window.open`. Also: `computeItemizedGst()` (per-item GST math), `scaleItemsToGoodsAmount()`, `gstTotalsRows()` — see GST section below |
| `frontend/src/utils/focusNav.js` | Shared Enter-navigation: `focusNextInContainer`, `focusNextAfterGroup`, `focusFirstInContainer`, `makeEnterNav`, `makeEnterNavPastGroup` — see Keyboard-Only Flow section |
| `frontend/src/components/ui/Combobox.jsx` | Custom keyboard-first replacement for native `<select>` — native selects can't be opened via Enter/keyboard. Portals its dropdown to `document.body` (`position: fixed`) to escape `overflow` clipping ancestors |
| `backend/utils/gstSnapshot.js` | `getGstSnapshot()` (shop-wide default rate snapshot) + `computeItemizedGst()` (per-item GST math, mirrors the frontend version) |

Removed: standalone Barcode Management page/route (`/barcode`) — deleted along with its nav entry, `SECTIONS` permission key, and `frontend/src/pages/BarcodeManagement.jsx`. Barcode *numbering* config still lives under Settings → Catalog.

---

## Completed Features (as of September 2026)

### Purchase UI
- **Step 1 / Step 2 layout** — Step 1 = product header (name, category, default prices). Step 2 = variant rows table.
- **Edit Purchase** mirrors Create Purchase layout exactly. Button says "Update Purchase".
- **Qty per row** — each row has a qty input. Entering qty reserves that many sequential barcodes from the backend (`POST /settings/reserve-barcodes`).
- **Multiple barcodes per row** — `row.barcodes: string[]`. If qty=5, row shows 5 barcodes stacked.
- **Empty slot rows** — `emptySlots = totalQty - assignedQty`. Shown as greyed-out "unassigned unit" rows below filled rows.
- **Submit blocked** until all slots assigned and barcodes loaded.
- **Barcode scan in Purchase list** — scan input at top of list; calls `GET /purchases/find-by-barcode?barcode=xxx`; opens matching purchase in edit mode.

### Barcode System
- **6-digit sequential barcodes** starting from configurable `startFrom` (default 100000).
- **Atomic counter** — `AppSettings` key `BARCODE_COUNTER` incremented via `$inc` in MongoDB. No duplicates under concurrent calls.
- **Frontend reserves barcodes before save** via `POST /settings/reserve-barcodes` — returns array of sequential barcode strings.
- **Backend honours frontend barcodes** — `resolveItems()` uses `item.barcode || await generateEAN13()`.
- **Settings page** — admin can set "start from" number for the sequential counter.
- **Shop name** shown on barcode labels.

### POS (Point of Sale)
- **No product grid** — the only way to add an item is the barcode scan field (keyboard-wedge scanner or camera). Typing `3*` or `3x` before a barcode adds 3 units in one shot (`handleScan`'s qty-prefix regex).
- **CustomerPicker** — search-as-you-type by phone/name/email (`GET /customers/admin?search=`), dropdown with arrow-key nav, inline "Create customer" when no match.
- **Keyboard shortcuts** — `F2`/`Ctrl+Enter` = Checkout & Print, `1`–`4` = payment method (Cash/Card/Mobile/Other), `Esc` = refocus scan field. Barcode field auto-focuses on load and after every modal closes.
- **Reset Sale button** — clears cart + customer + discounts/coupon/payment method back to blank; confirms only if there's something to lose.
- **Split checkout buttons** — big button = "Checkout & Print" (completes sale + prints bill immediately via `printBillHTML`); small button = "Checkout" (completes sale only, receipt modal shown, no auto-print).
- **Fullscreen & Lock (kiosk mode)** — `usePosLockStore` sets a `localStorage`-persisted `locked` flag; `Layout.jsx` redirects every route to `/pos` and hides the sidebar while locked. Unlock requires the current user's own password via `POST /auth/verify-password` (not a full re-login). Lock does NOT freeze the POS page itself — scanning/checkout still work; it only confines navigation.
- **Points earned** and **balance points** shown on POS bill.
- **Points redeem** — typed input field (not slider).
- **Discount field** — typed input with % or ₹ toggle.
- **Round-off toggle** — rounds bill total to nearest rupee.

### Return / Exchange / Replace → Carry Forward to POS
- In Sales History's Transaction Detail modal, marking a line RETURN or EXCHANGE funds a Credit Note (refund to customer); EXCHANGE no longer has its own inline "pick new item" — it's financially identical to RETURN now. REPLACE still creates a Replacement Note (no money).
- On Confirm Session, if the resulting settlement is nonzero, the UI **auto-navigates to POS** (`navigate('/pos', { state: { carryForward, customerPhone, customerName } })`) with the customer prefilled and the balance carried forward — no manual "continue" click.
- POS reads `location.state.carryForward` once on mount, shows it as an adjustment line in the checkout summary (can flip the total to "Refund Due" if negative), and sends it back as `carryForward` in the checkout payload.
- Backend keeps `SaleTransaction.totalAmount` **goods-only** (GST is computed from it) and stores the carried amount separately in `carriedSettlement` — never fold a carry-forward into the GST base.
- `carriedSettlementOf(sale)` in `bill.js` is the shared read helper; every render path (POS receipt, SalesHistory detail, thermal/A4/A5 print, WhatsApp share, PDF/Excel export) must use it for the "Net Payable"/"Refund Due" line rather than reading `totalAmount` alone.

### Products
- **Barcode scan in Products list** — scan input in filter bar; calls `GET /products/barcode/:code`; opens matching product in edit mode.
- **Filters** — search, category, sub-category (dependent dropdown, resets when category changes), variant, size. Consolidated into one `filters` object passed to `fetchProducts`.

### Settings
- Redesigned as a left sidebar (grouped: Account / Store & Billing / Catalog / Automation / Danger Zone) instead of a horizontal top-tab bar — the old tab bar doesn't scale as more settings get added. Mobile: sidebar collapses behind a "Menu" toggle. All existing tab ids/content unchanged, only the nav chrome changed.

### Purchase Delete
- `deletePurchase` checks each unit-product against `SaleTransaction`/`Order` line items. Never-sold units are **hard-deleted** (gone from Products, Barcode config, POS). Already-sold units are deactivated only (kept for invoice integrity). The old "restocked elsewhere" check was dead logic — every purchase item is its own unit-product (`qty: 1`), never shared across purchases.

### Keyboard-Only Flow (POS + Purchase)
- POS and New/Edit Purchase are fully operable via Enter — no mouse required. Enter in any field jumps to the next focusable field in DOM order inside a step's container (`focusNav.js`); an empty field is skipped, not blocked. Reaching the last field in a container clicks its `data-enter-submit` button.
- Native `<select>` elements can't be opened or navigated via Enter — replaced everywhere in POS/Purchase with the custom `Combobox` component (search-as-you-type, arrow-key nav, Enter selects highlighted or creates new).
- Button *groups* that represent one choice (payment method buttons, e.g.) use `makeEnterNavPastGroup` so Enter jumps past the whole group instead of cycling its own buttons — all buttons in the group are unconditionally `data-enter-target` (not just the currently-selected one, which is fragile if the default state never matches a fetched key).
- Each POS step (`scan`, `discount`, `checkout`) has a `useEffect` keyed on `step` that calls `focusFirstInContainer(stepPanelRef.current)` on arrival — relying on DOM order rather than a single hardcoded `autoFocus`, so a conditionally-rendered field (e.g. Redeem Points, which only shows when the customer has points) is picked up automatically when present and skipped over when not.
- Any `onKeyDown` handler that triggers an async action (customer creation, etc.) on Enter **must call `e.preventDefault()`** — otherwise the browser's default Enter behavior can race the async re-render and steal focus after it resolves (this bit the "Create customer" flow, the barcode-scan flow, and the toast dismiss button — same root cause each time, see `Toast.jsx`'s `tabIndex={-1}` on its X button).
- Focus/DOM-timing races (a state update not yet painted when a synchronous Enter handler runs) are handled by deferring one `requestAnimationFrame` — used in `makeEnterNav`, `focusScan()`, and the checkout-step effect.

### HSN Code + Per-Item GST Rate (GST compliance)
- Optional `hsnCode` (string) and `gstPercent` (number, `null` = "use shop default") live on `Product`, snapshotted per line onto `Purchase` items, `SaleTransaction` items, `Order` items, and `CreditNote` items at the time each document is created — so a document's tax basis never drifts if the product changes later.
- Settings → Store & Billing → GST Configuration: "Default HSN Code" and "Default GST %" (the old single "GST Rate (%)" field, relabeled — same field, same key `BUSINESS_CONFIG.gstPercent`, now means "fallback rate for items with no rate of their own" instead of "the one rate for everything"). Both pre-fill the HSN/GST inputs on new Products and new Purchases only (not edits).
- Product form and Purchase form (create + edit) both have HSN Code + GST % inputs next to each other, following the exact same optional/override pattern.
- **Per-item GST math** — `computeItemizedGst(items, business, docGstSnapshot)` (mirrored in `bill.js` and `gstSnapshot.js`) taxes each line at its own rate (falling back to the shop default), inclusive/exclusive still governed by one shop-wide toggle (`gstInclusive`). Returns `{ net, gst, cgst, sgst, grandTotal, rows, distinctRates }` — `rows` is grouped by `(hsnCode + rate)`, `distinctRates` tells every render surface whether to show one Taxable/CGST/SGST triple (`<=1`, the common case, byte-identical to the old single-rate output) or one triple per rate (`>=2`, a bill mixing e.g. 5% and 12% items). `gstTotalsRows(gst)` turns that result into ready-to-render `[label, value]` rows implementing this branch — reused by every bill surface so the rule only lives in one place.
- `scaleItemsToGoodsAmount(items, goodsAmount)` proportionally scales each item's price so the sum matches the bill's actual (post-discount, pre-round-off) goods total — same allocation math the old HSN breakup used, now applied per-line before grouping instead of per-group after.
- **HSN Summary table** always renders when GST is on and there are items (even a single HSN/rate) — a GST invoice must carry the HSN code on its face regardless of how many codes a bill mixes. Grouped by `(hsnCode + rate)`, includes a Rate column.
- Every bill-rendering surface (A4/A5 invoice, thermal receipt, POS on-screen receipt, Sales History detail modal, WhatsApp share, Excel export) uses the same `computeItemizedGst`/`gstTotalsRows`/HSN-Summary pattern — do not reintroduce a single blended `computeGst` call on any new bill surface.
- **Return/Exchange settlement** (`returnSessionController.js`) also taxes each returned line at *its own* stored rate (copied from the original sale item's snapshot), not one blended shop rate — `CreditNote.items` carry `hsnCode`/`gstPercent`, and `CreditNote.gstBreakup[]` holds the per-(hsnCode+rate) group breakdown alongside the existing flat `taxableValue`/`cgstAmount`/`sgstAmount` (which stay as the bill-wide sum for backward compat).
- Old documents with no per-item rate simply fall back to the shop default on every line, so `distinctRates` resolves to 1 and they render exactly as before — no backfill migration needed.
- `computeGst`/`computeHsnBreakup` (the old single-rate functions) were fully replaced and removed — don't recreate them.

### Bill Layout — Totals Ordering
- Every bill surface groups totals into labeled sections read top-to-bottom: **Bill Value → Discount → Round Off → Points Redeemed** (pre-tax adjustments, in that order — Round Off sits directly below Discount) **→ Taxable Value/CGST/SGST** (per rate) **→ Carried Forward → TOTAL/Net Payable** (heavier divider) **→ HSN Summary → Points Earned/Balance Points** (loyalty, after the total). `invoiceLayout`'s totals rows carry an optional 4th `group` tag (`'adjust' | 'tax' | 'settle' | 'final' | 'loyalty'`) that drives a thin section-divider rule — keep new total lines tagged consistently with this ordering rather than appended ad hoc.
- Round-off is **excluded from the GST base** everywhere (`goodsAmount = sale.totalAmount - roundOffAmount`) — this was a real bug fix (GST was being computed on a round-off-inclusive total) and must never regress.

### Credit Points Configuration
- `AppSettings` key `CREDIT_CONFIG`: `{ pointsPerAmount, perRupees, rupeesPerPoint, pointValue }`. Admin enters the rate directly as "Earn `[pointsPerAmount]` points for every ₹`[perRupees]` spent" (Settings → Credit & Loyalty) instead of the old indirect single "Rupees Per Point" field — `rupeesPerPoint = perRupees / pointsPerAmount` is derived server-side and is still what `processStoreSale`'s earning formula (`Math.floor(qualifyingAmount / rupeesPerPoint)`) actually reads, so that formula didn't need to change, only the input framing. `getCreditConfig` backfills `pointsPerAmount`/`perRupees` for configs saved before this change existed.

---

## Key Data Shapes

### `variantRows` (Purchase create state)
```js
{
  color: string,
  size: string,
  qty: string,          // string so input is controlled; Number(row.qty) for math
  costPrice: string,
  price: string,
  discountPrice: string,
  barcodes: string[],   // length === Number(qty) once reserved
}
```

### Items sent to backend (one per barcode)
```js
{
  name, category, subCategory, description,
  costPrice, price, discountPrice,
  color, size,
  qty: 1,               // always 1 — each unit is its own item
  barcode,              // pre-reserved 6-digit string
}
```

### `resolveItems()` in purchaseController
Each item has `qty: 1` and a pre-provided `barcode`. The loop `for (let unitIdx = 0; unitIdx < qty; unitIdx++)` runs once per item. `item.barcode || await generateEAN13()` uses the frontend barcode when present.

### AppSettings keys
| Key | Value shape | Purpose |
|-----|-------------|---------|
| `BARCODE_CONFIG` | `{ startFrom: number }` | Admin-configured start number |
| `BARCODE_COUNTER` | `{ value: number }` | Current sequential counter |

---

## Critical Route Order (purchases.js)
```js
router.get('/find-by-barcode', protect, findPurchaseByBarcode);  // MUST be before /:id
router.get('/:id', protect, getPurchase);
```

---

## `reserveBarcodes` endpoint
`POST /settings/reserve-barcodes` — body: `{ count: number }`

1. Reads `BARCODE_CONFIG.startFrom`.
2. `$setOnInsert` seeds `BARCODE_COUNTER` at `startFrom` if it doesn't exist yet.
3. `$inc: { value: n }` atomically advances counter by n, returns pre-increment value.
4. Returns `{ barcodes: string[] }` — array of `n` sequential 6-digit strings.

---

## Purchase Step 2 Table — How It Works
```
totalN = Number(totalQty)
assignedQty = sum of Number(row.qty) across all variantRows
emptySlots = max(0, totalN - assignedQty)
overAssigned = assignedQty > totalN
```

Table renders:
1. `variantRows.map(...)` — filled rows with inputs + stacked barcode chips
2. `Array.from({ length: emptySlots }).map(...)` — greyed placeholder rows labelled "unassigned unit"
3. `<tfoot>` — shows `assignedQty of totalN units assigned` + total cost

`handleQtyChange(idx, value)` — called on qty input change:
- Clears `row.barcodes` immediately
- Calls `POST /settings/reserve-barcodes` with `{ count: qty }`
- Sets `row.barcodes` from response
- Shows `<Spinner>` while loading (`loadingRowIdx === idx`)

`buildItems()` — called on submit:
- Flattens each row's `barcodes[]` into individual items with `qty: 1`

`printableVariants` — flattened list of all barcodes across all rows for the preview cards

---

## User Preferences / Patterns
- No extra comments in code
- Keep changes minimal and targeted
- Backend stays REST; frontend calls API via `api` (axios wrapper in `frontend/src/utils/api.js`)
- Toast for user feedback: `useToast()` hook
- UI components: Button, Input, Modal, Spinner, Card from `frontend/src/components/ui/`
- Icons: lucide-react
- **Printing must stay in the current tab** — never `window.open()` for print flows; use the hidden-iframe pattern in `bill.js` (`printInCurrentTab`). This was an explicit correction after `window.open` shipped for bill printing.
- **GST base vs. carry-forward** — anything that isn't a taxable sale of goods (return/exchange carry-forward balances, store credit, etc.) must never be added into the amount that GST is computed from. Keep it as a separate post-tax line and a separate stored field.
- **Currency symbol is always ₹, never `$`** — a few pages (Dashboard, WebOrders) had leftover literal `$` from earlier scaffolding; fixed. Check for this in any new page that displays money.
- **Keyboard-only flow, no mouse** — explicit, repeated user requirement across POS and Purchase. Any new field added to either must be reachable via Enter (wire it into the existing `focusNav.js`/`Combobox` pattern, don't rely on click-only interaction or native `<select>`).
- Staff → Attendance: statuses are **Full** (was "Present", letter `F`, still stored as enum value `PRESENT` — don't rename the backend enum), Half Day, Leave. **Absent was removed** as a status entirely (old `ABSENT` records may still exist in the DB; the UI guards against them rendering as blank/unmarked rather than crashing, but the status can no longer be set).
