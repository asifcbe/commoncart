import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tag, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../utils/api';
import useCartStore from '../store/useCartStore';
import Img from '../components/ui/Img';

const PAGE_SIZE = 24;

function DiscountBadge({ percent }) {
  return (
    <span className="absolute top-3 left-3 text-white text-xs font-semibold px-2.5 py-1 rounded-full"
      style={{ background: 'var(--color-primary)' }}>
      −{percent}%
    </span>
  );
}

function ProductCard({ product }) {
  const addItem = useCartStore((s) => s.addItem);
  const cartItems = useCartStore((s) => s.items);

  const inCart = cartItems.some((i) => i.productId === product._id);
  const image = product.images?.[0];
  const available = product.availableQty ?? Math.max(0, product.quantity - (product.reservedQty ?? 0));
  const displayPrice = product.discountPrice ?? product.price;
  const originalPrice = product.discountPrice ? product.price : null;
  const percent = product.effectiveDiscountPercent;

  return (
    <div className="card card-hover overflow-hidden group relative">
      <DiscountBadge percent={percent} />
      <Link to={`/products/${product._id}`} className="block aspect-square overflow-hidden" style={{ background: 'var(--color-primary-light)' }}>
        <Img src={image} alt={product.name} iconSize={44} className="w-full h-full"
          imgClassName="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      </Link>
      <div className="p-4">
        <p className="text-[0.65rem] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-ink-soft)' }}>
          {product.category}
        </p>
        <Link to={`/products/${product._id}`} className="font-medium text-sm hover:underline line-clamp-2 leading-snug" style={{ color: 'var(--color-ink)' }}>
          {product.name}
        </Link>
        {(product.color || product.size) && (
          <p className="text-xs mt-1" style={{ color: 'var(--color-ink-soft)' }}>{[product.color, product.size].filter(Boolean).join(' · ')}</p>
        )}
        <div className="flex items-baseline gap-2 mt-3">
          <span className="text-lg font-semibold" style={{ color: 'var(--color-primary)' }}>₹{displayPrice.toFixed(2)}</span>
          {originalPrice && (
            <span className="text-sm line-through" style={{ color: 'var(--color-ink-soft)' }}>₹{originalPrice.toFixed(2)}</span>
          )}
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs font-medium" style={{ color: available > 0 ? 'var(--color-secondary-dark)' : 'var(--color-danger)' }}>
            {available > 0 ? `${available} in stock` : 'Out of stock'}
          </span>
          <button
            disabled={available === 0 || inCart}
            onClick={() => addItem({ productId: product._id, name: product.name, price: displayPrice, image: image || '', availableQty: available })}
            className={`text-xs px-3.5 py-1.5 rounded-lg font-medium transition-colors ${
              inCart ? '' : available === 0 ? 'cursor-not-allowed' : ''
            }`}
            style={
              inCart ? { background: 'var(--color-secondary-light)', color: 'var(--color-secondary-dark)' } :
              available === 0 ? { background: 'var(--color-toffee)', color: 'var(--color-ink-soft)' } :
              { background: 'var(--color-primary)', color: '#fff' }
            }
          >
            {inCart ? 'In Cart' : 'Add to Cart'}
          </button>
        </div>
      </div>
    </div>
  );
}

// One filter section — a heading + a list of pickable values, "All" first.
// Mirrors ProductListing.jsx's sidebar styling so Clearance feels like the
// same shop, not a bolted-on page.
function FilterSection({ title, options, value, onChange, pills = false }) {
  if (!options.length) return null;
  const itemBtnClass = (active) => pills
    ? `px-3 py-1.5 rounded-full text-sm border transition-colors`
    : `w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors`;
  const itemBtnStyle = (active) => active
    ? { background: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
    : pills
      ? { color: 'var(--color-ink-soft)', borderColor: 'var(--color-toffee)' }
      : { color: 'var(--color-ink-soft)' };

  return (
    <div className="mt-6 first:mt-0">
      <h3 className="font-semibold text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--color-ink-soft)' }}>{title}</h3>
      <div className={pills ? 'flex flex-wrap gap-2' : 'space-y-0.5'}>
        <button onClick={() => onChange('')} className={itemBtnClass(!value)} style={itemBtnStyle(!value)}>All</button>
        {options.map(({ key, label }) => (
          <button key={key} onClick={() => onChange(key)} className={itemBtnClass(value === key)} style={itemBtnStyle(value === key)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Clearance() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [page, setPage] = useState(1);

  const [discount, setDiscount] = useState('');    // effectiveDiscountPercent, as a string
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');

  useEffect(() => {
    api.get('/settings/clearance')
      .then(({ data }) => {
        setEnabled(data.enabled);
        if (data.products) setProducts(data.products);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Facet options are built from whatever's actually on clearance right now,
  // so a filter section simply doesn't render when it'd have nothing to
  // narrow. Category clears sub-category when changed, same as ProductListing.
  const discountOptions = useMemo(() => {
    const seen = new Set();
    products.forEach((p) => { if (p.effectiveDiscountPercent != null) seen.add(p.effectiveDiscountPercent); });
    return [...seen].sort((a, b) => b - a).map((p) => ({ key: String(p), label: `${p}% Off` }));
  }, [products]);

  const categoryOptions = useMemo(() => {
    const seen = new Set();
    products.forEach((p) => { if (p.category) seen.add(p.category); });
    return [...seen].sort().map((c) => ({ key: c, label: c }));
  }, [products]);

  const subCategoryOptions = useMemo(() => {
    const seen = new Set();
    products.forEach((p) => { if ((!category || p.category === category) && p.subCategory) seen.add(p.subCategory); });
    return [...seen].sort().map((s) => ({ key: s, label: s }));
  }, [products, category]);

  const colorOptions = useMemo(() => {
    const seen = new Set();
    products.forEach((p) => { if (p.color) seen.add(p.color); });
    return [...seen].sort().map((c) => ({ key: c, label: c }));
  }, [products]);

  const sizeOptions = useMemo(() => {
    const seen = new Set();
    products.forEach((p) => { if (p.size) seen.add(p.size); });
    return [...seen].sort().map((s) => ({ key: s, label: s }));
  }, [products]);

  const handleCategory = (c) => { setCategory(c); setSubCategory(''); setPage(1); };

  const filtered = products.filter((p) =>
    (!discount || String(p.effectiveDiscountPercent) === discount) &&
    (!category || p.category === category) &&
    (!subCategory || p.subCategory === subCategory) &&
    (!color || p.color === color) &&
    (!size || p.size === size)
  );

  // A clearance sale can legitimately span thousands of aged-out units —
  // paginate the (already-filtered) list instead of rendering it all in one
  // giant grid, which is what made this page unusable at real-shop scale.
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageClamped = Math.min(page, pages);
  const paged = filtered.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);

  const hasActiveFilters = discount || category || subCategory || color || size;
  const clearFilters = () => { setDiscount(''); setCategory(''); setSubCategory(''); setColor(''); setSize(''); setPage(1); };
  const setFilterAndResetPage = (setter) => (v) => { setter(v); setPage(1); };

  if (!enabled && !loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <Sparkles size={36} className="mx-auto mb-4" style={{ color: 'var(--color-toffee)' }} />
        <h1 className="text-2xl" style={{ fontFamily: "'Fraunces', Georgia, serif", color: 'var(--color-ink)' }}>No Clearance Sale Right Now</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-ink-soft)' }}>Check back soon for special offers.</p>
        <Link to="/products" className="mt-6 inline-block text-sm font-medium" style={{ color: 'var(--color-primary-dark)' }}>Browse all products →</Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="mb-10 pb-8 text-center border-b" style={{ borderColor: 'var(--color-toffee)' }}>
        <p className="text-xs font-semibold tracking-[0.35em] uppercase mb-3" style={{ color: 'var(--color-primary-dark)' }}>Limited Time</p>
        <h1 className="text-3xl sm:text-4xl" style={{ fontFamily: "'Fraunces', Georgia, serif", color: 'var(--color-ink)' }}>Clearance Sale</h1>
        <p className="mt-3 text-sm max-w-md mx-auto" style={{ color: 'var(--color-ink-soft)' }}>
          Thoughtfully reduced prices on select pieces — while stocks last.
        </p>
        {products.length > 0 && (
          <p className="mt-3 text-xs font-medium" style={{ color: 'var(--color-ink-soft)' }}>
            {products.length} piece{products.length !== 1 ? 's' : ''} on clearance right now
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-16">
          <Tag size={32} className="mx-auto mb-4" style={{ color: 'var(--color-toffee)' }} />
          <p style={{ color: 'var(--color-ink-soft)' }}>No clearance products available right now.</p>
          <Link to="/products" className="mt-4 inline-block text-sm font-medium" style={{ color: 'var(--color-primary-dark)' }}>Browse all products →</Link>
        </div>
      ) : (
        <div className="flex gap-8">
          {/* Sidebar filters */}
          <aside className="hidden md:block w-52 flex-shrink-0">
            <div className="sticky top-28">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold text-sm" style={{ color: 'var(--color-ink)' }}>Filters</h2>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="text-xs underline" style={{ color: 'var(--color-ink-soft)' }}>Clear</button>
                )}
              </div>
              <FilterSection title="Discount" options={discountOptions} value={discount} onChange={setFilterAndResetPage(setDiscount)} />
              <FilterSection title="Category" options={categoryOptions} value={category} onChange={handleCategory} />
              <FilterSection title="Sub-category" options={subCategoryOptions} value={subCategory} onChange={setFilterAndResetPage(setSubCategory)} />
              <FilterSection title="Variant" options={colorOptions} value={color} onChange={setFilterAndResetPage(setColor)} />
              <FilterSection title="Size" options={sizeOptions} value={size} onChange={setFilterAndResetPage(setSize)} pills />
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            {/* Mobile filter row — same facets as the sidebar, as compact
                selects (sidebar is desktop-only, hidden below md). */}
            <div className="md:hidden flex gap-2 flex-wrap mb-6">
              <select value={discount} onChange={(e) => setFilterAndResetPage(setDiscount)(e.target.value)} className="input h-9 text-sm flex-1 min-w-[7rem]">
                <option value="">All discounts</option>
                {discountOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              {categoryOptions.length > 0 && (
                <select value={category} onChange={(e) => handleCategory(e.target.value)} className="input h-9 text-sm flex-1 min-w-[7rem]">
                  <option value="">All categories</option>
                  {categoryOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              )}
              {subCategoryOptions.length > 0 && (
                <select value={subCategory} onChange={(e) => setFilterAndResetPage(setSubCategory)(e.target.value)} className="input h-9 text-sm flex-1 min-w-[7rem]">
                  <option value="">All sub-categories</option>
                  {subCategoryOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              )}
              {colorOptions.length > 0 && (
                <select value={color} onChange={(e) => setFilterAndResetPage(setColor)(e.target.value)} className="input h-9 text-sm flex-1 min-w-[7rem]">
                  <option value="">All variants</option>
                  {colorOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              )}
              {sizeOptions.length > 0 && (
                <select value={size} onChange={(e) => setFilterAndResetPage(setSize)(e.target.value)} className="input h-9 text-sm flex-1 min-w-[7rem]">
                  <option value="">All sizes</option>
                  {sizeOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              )}
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-xs underline shrink-0 self-center" style={{ color: 'var(--color-ink-soft)' }}>Clear</button>
              )}
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-16" style={{ color: 'var(--color-ink-soft)' }}>
                <p className="text-lg font-medium">No products match these filters</p>
                <button onClick={clearFilters} className="mt-2 text-sm font-medium" style={{ color: 'var(--color-primary-dark)' }}>Clear filters</button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                  {paged.map((p) => <ProductCard key={p._id} product={p} />)}
                </div>

                {pages > 1 && (
                  <div className="flex items-center justify-center gap-3 mt-10">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={pageClamped === 1}
                      className="flex items-center gap-1 px-4 py-2 rounded-lg border text-sm font-medium disabled:opacity-40"
                      style={{ borderColor: 'var(--color-toffee)', color: 'var(--color-ink)' }}
                    >
                      <ChevronLeft size={16} /> Prev
                    </button>
                    <span className="text-sm" style={{ color: 'var(--color-ink-soft)' }}>Page {pageClamped} of {pages}</span>
                    <button
                      onClick={() => setPage((p) => Math.min(pages, p + 1))}
                      disabled={pageClamped === pages}
                      className="flex items-center gap-1 px-4 py-2 rounded-lg border text-sm font-medium disabled:opacity-40"
                      style={{ borderColor: 'var(--color-toffee)', color: 'var(--color-ink)' }}
                    >
                      Next <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
