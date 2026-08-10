import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tag, Flame, Package } from 'lucide-react';
import api from '../utils/api';
import useCartStore from '../store/useCartStore';

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
        {image ? (
          <img src={image} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-200">
            <Package size={48} />
          </div>
        )}
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
          <Tag size={9} /> {product.agingStep?.label} · {product.ageDays} days old
        </div>
      </div>
    </div>
  );
}

export default function Clearance() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [activeStep, setActiveStep] = useState('all');
  const [steps, setSteps] = useState([]);

  useEffect(() => {
    api.get('/settings/clearance')
      .then(({ data }) => {
        setEnabled(data.enabled);
        if (data.products) {
          setProducts(data.products);
          // Extract unique step labels
          const seen = new Set();
          const uniqueSteps = [];
          data.products.forEach((p) => {
            const key = p.agingStep?.label;
            if (key && !seen.has(key)) { seen.add(key); uniqueSteps.push(p.agingStep); }
          });
          setSteps(uniqueSteps.sort((a, b) => b.percent - a.percent));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = activeStep === 'all' ? products : products.filter((p) => p.agingStep?.label === activeStep);

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
            Big discounts on select items — while stocks last. Prices automatically reduced by age.
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
        <>
          {/* Step filter tabs */}
          {steps.length > 1 && (
            <div className="flex gap-2 flex-wrap mb-6">
              <button
                onClick={() => setActiveStep('all')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${activeStep === 'all' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                All ({products.length})
              </button>
              {steps.map((s) => {
                const count = products.filter((p) => p.agingStep?.label === s.label).length;
                return (
                  <button
                    key={s.label}
                    onClick={() => setActiveStep(s.label)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${activeStep === s.label ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {s.label} · -{s.percent}% ({count})
                  </button>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filtered.map((p) => <ProductCard key={p._id} product={p} />)}
          </div>
        </>
      )}
    </div>
  );
}
