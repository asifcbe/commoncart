import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tag, Flame } from 'lucide-react';
import api from '../utils/api';
import useCartStore from '../store/useCartStore';
import Img from '../components/ui/Img';

function DiscountBadge({ percent }) {
  return (
    <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
      -{percent}%
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
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow group relative">
      <DiscountBadge percent={percent} />
      <Link to={`/products/${product._id}`} className="block aspect-square bg-gray-50 overflow-hidden">
        <Img src={image} alt={product.name} iconSize={48} className="w-full h-full"
          imgClassName="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
      </Link>
      <div className="p-3">
        <p className="text-xs text-gray-400 mb-0.5">{product.category}</p>
        <Link to={`/products/${product._id}`} className="font-medium text-gray-900 text-sm hover:text-red-600 line-clamp-2">{product.name}</Link>
        {(product.color || product.size) && (
          <p className="text-xs text-gray-400 mt-0.5">{[product.color, product.size].filter(Boolean).join(' / ')}</p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-lg font-bold text-red-600">₹{displayPrice.toFixed(2)}</span>
          {originalPrice && (
            <span className="text-sm line-through text-gray-400">₹{originalPrice.toFixed(2)}</span>
          )}
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className={`text-xs ${available > 0 ? 'text-green-600' : 'text-red-500'}`}>
            {available > 0 ? `${available} in stock` : 'Out of stock'}
          </span>
          <button
            disabled={available === 0 || inCart}
            onClick={() => addItem({ productId: product._id, name: product.name, price: displayPrice, image: image || '', availableQty: available })}
            className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${
              inCart ? 'bg-green-100 text-green-700' :
              available === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' :
              'bg-red-500 hover:bg-red-600 text-white'
            }`}
          >
            {inCart ? 'In Cart' : 'Add to Cart'}
          </button>
        </div>
        <div className="mt-1.5 text-[10px] text-gray-400 flex items-center gap-1">
          <Tag size={9} /> {percent}% Off
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
  const Wrap = pills ? 'div' : 'ul';
  const wrapClass = pills ? 'flex flex-wrap gap-2' : 'space-y-1';
  const Item = pills ? 'button' : 'li';
  const itemBtnClass = (active) => pills
    ? `px-3 py-1.5 rounded-lg text-sm border transition-colors ${active ? 'text-white border-transparent' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`
    : `w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${active ? 'font-semibold text-white' : 'text-gray-600 hover:bg-gray-50'}`;
  const itemBtnStyle = (active) => (active ? { background: 'var(--color-primary)' } : {});

  return (
    <>
      <h3 className="font-semibold text-sm text-gray-700 mb-3 mt-6 first:mt-0">{title}</h3>
      <Wrap className={wrapClass}>
        {!pills && (
          <li>
            <button onClick={() => onChange('')} className={itemBtnClass(!value)} style={itemBtnStyle(!value)}>All</button>
          </li>
        )}
        {pills && (
          <button onClick={() => onChange('')} className={itemBtnClass(!value)} style={itemBtnStyle(!value)}>All</button>
        )}
        {options.map(({ key, label }) => (
          pills ? (
            <button key={key} onClick={() => onChange(key)} className={itemBtnClass(value === key)} style={itemBtnStyle(value === key)}>
              {label}
            </button>
          ) : (
            <Item key={key}>
              <button onClick={() => onChange(key)} className={itemBtnClass(value === key)} style={itemBtnStyle(value === key)}>
                {label}
              </button>
            </Item>
          )
        ))}
      </Wrap>
    </>
  );
}

export default function Clearance() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);

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

  const handleCategory = (c) => { setCategory(c); setSubCategory(''); };

  const filtered = products.filter((p) =>
    (!discount || String(p.effectiveDiscountPercent) === discount) &&
    (!category || p.category === category) &&
    (!subCategory || p.subCategory === subCategory) &&
    (!color || p.color === color) &&
    (!size || p.size === size)
  );

  const hasActiveFilters = discount || category || subCategory || color || size;
  const clearFilters = () => { setDiscount(''); setCategory(''); setSubCategory(''); setColor(''); setSize(''); };

  if (!enabled && !loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <Flame size={48} className="mx-auto mb-4 text-gray-200" />
        <h1 className="text-2xl font-bold text-gray-400">No Clearance Sale Right Now</h1>
        <p className="text-gray-400 mt-2 text-sm">Check back soon for special offers.</p>
        <Link to="/products" className="mt-6 inline-block text-sm text-blue-600 hover:underline">Browse all products →</Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Hero banner */}
      <div className="rounded-2xl bg-gradient-to-r from-red-500 to-orange-500 text-white p-8 mb-8 flex items-center gap-6">
        <Flame size={56} className="opacity-80 shrink-0" />
        <div>
          <h1 className="text-3xl font-extrabold">Clearance Sale</h1>
          <p className="mt-1 text-red-100 text-sm">
            Big discounts on select items — while stocks last.
          </p>
          {products.length > 0 && (
            <p className="mt-2 text-white/80 text-xs">{products.length} product{products.length !== 1 ? 's' : ''} on clearance right now</p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500" />
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-16">
          <Tag size={40} className="mx-auto mb-4 text-gray-200" />
          <p className="text-gray-400">No clearance products available right now.</p>
          <Link to="/products" className="mt-4 inline-block text-sm text-blue-600 hover:underline">Browse all products →</Link>
        </div>
      ) : (
        <div className="flex gap-6">
          {/* Sidebar filters */}
          <aside className="hidden md:block w-52 flex-shrink-0">
            <div className="card p-4 sticky top-28">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-bold text-sm text-gray-900">Filters</h2>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-red-500 underline">Clear</button>
                )}
              </div>
              <FilterSection title="Discount" options={discountOptions} value={discount} onChange={setDiscount} />
              <FilterSection title="Category" options={categoryOptions} value={category} onChange={handleCategory} />
              <FilterSection title="Sub-category" options={subCategoryOptions} value={subCategory} onChange={setSubCategory} />
              <FilterSection title="Variant" options={colorOptions} value={color} onChange={setColor} />
              <FilterSection title="Size" options={sizeOptions} value={size} onChange={setSize} pills />
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            {/* Mobile filter row — same facets as the sidebar, as compact
                selects (sidebar is desktop-only, hidden below md). */}
            <div className="md:hidden flex gap-2 flex-wrap mb-4">
              <select value={discount} onChange={(e) => setDiscount(e.target.value)} className="input h-9 text-sm flex-1 min-w-[7rem]">
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
                <select value={subCategory} onChange={(e) => setSubCategory(e.target.value)} className="input h-9 text-sm flex-1 min-w-[7rem]">
                  <option value="">All sub-categories</option>
                  {subCategoryOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              )}
              {colorOptions.length > 0 && (
                <select value={color} onChange={(e) => setColor(e.target.value)} className="input h-9 text-sm flex-1 min-w-[7rem]">
                  <option value="">All variants</option>
                  {colorOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              )}
              {sizeOptions.length > 0 && (
                <select value={size} onChange={(e) => setSize(e.target.value)} className="input h-9 text-sm flex-1 min-w-[7rem]">
                  <option value="">All sizes</option>
                  {sizeOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              )}
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-red-500 underline shrink-0 self-center">Clear</button>
              )}
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-lg font-medium">No products match these filters</p>
                <button onClick={clearFilters} className="mt-2 text-sm text-blue-600 hover:underline">Clear filters</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filtered.map((p) => <ProductCard key={p._id} product={p} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
