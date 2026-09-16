import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, ArrowLeft, ArrowRight, Minus, Plus, Package } from 'lucide-react';
import api from '../utils/api';
import useCartStore from '../store/useCartStore';
import { useToast } from '../components/ui/Toast';
import Spinner from '../components/ui/Spinner';
import { formatPrice, applyMeta, priceInfo } from '../utils/theme';
import { burstConfetti } from '../utils/confetti';
import Img from '../components/ui/Img';
import CandySky from '../components/ui/CandySky';
import RulerOverlay from '../components/ui/RulerOverlay';
import { connectSocket } from '../utils/socket';

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const addItem = useCartStore((s) => s.addItem);
  const inCart = useCartStore((s) => s.items.some((i) => i.productId === id));
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  // 'none' while trying, 'missing' only after a real 404, 'error' after a
  // transient failure exhausted its retries.
  const [status, setStatus] = useState('none');
  const [qty, setQty] = useState(1);
  const [activeImg, setActiveImg] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setStatus('none');
    setProduct(null);

    const load = async (attempt = 1) => {
      try {
        const { data } = await api.get(`/orders/products/public/${id}`, { signal: ctrl.signal });
        if (cancelled) return;
        setProduct(data.product);
        setStatus('none');
        applyMeta(data.product?.name);
      } catch (err) {
        if (cancelled || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        // A genuine 404 = the product really isn't public/doesn't exist.
        if (err.response?.status === 404) { setStatus('missing'); return; }
        // Anything else (network blip, CORS, timeout — far more likely on a
        // flaky mobile connection) → retry a couple of times before giving up.
        if (attempt < 3) { setTimeout(() => !cancelled && load(attempt + 1), 400 * attempt); return; }
        setStatus('error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    // Real-time stock updates for this product
    const socket = connectSocket();
    socket.emit('join:product', id);
    const onStock = ({ productId, quantity, reservedQty }) => {
      if (productId === id) {
        setProduct((p) => (p ? { ...p, quantity, reservedQty, availableQty: Math.max(0, quantity - (reservedQty ?? 0)) } : p));
      }
    };
    socket.on('stock:updated', onStock);

    return () => {
      cancelled = true;
      ctrl.abort();
      socket.emit('leave:product', id);
      socket.off('stock:updated', onStock);
    };
  }, [id]);

  if (loading) return <div className="flex justify-center items-center min-h-[60vh]"><Spinner size="lg" /></div>;

  if (!product) return (
    <div className="max-w-7xl mx-auto px-4 py-20 text-center">
      <Package size={48} className="mx-auto text-gray-300 mb-4" />
      <h2 className="text-xl font-semibold text-gray-700">
        {status === 'missing' ? 'Product not found' : 'Couldn’t load this product'}
      </h2>
      {status !== 'missing' && (
        <p className="text-sm text-gray-500 mt-1">Check your connection and try again.</p>
      )}
      <div className="mt-6 flex gap-3 justify-center">
        {status !== 'missing' && (
          <button onClick={() => window.location.reload()} className="btn-outline">Retry</button>
        )}
        <Link to="/products" className="btn-primary inline-flex">Browse Products</Link>
      </div>
    </div>
  );

  const available = product.availableQty ?? product.quantity - (product.reservedQty ?? 0);
  const { sale, mrp, onSale } = priceInfo(product);

  const handleAddToCart = (e) => {
    if (inCart) { navigate('/cart'); return; }
    addItem(product, qty);
    toast({ message: `${product.name} added to cart`, type: 'success' });
    if (e?.currentTarget) {
      const r = e.currentTarget.getBoundingClientRect();
      burstConfetti(r.left + r.width / 2, r.top + r.height / 2, 22);
    }
  };

  return (
    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8 overflow-x-hidden">
      <CandySky className="opacity-60" />
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/" className="hover:underline">Home</Link>
        <span>/</span>
        <Link to="/products" className="hover:underline">Products</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium truncate">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        {/* Images — when the product has both dimensions set, an extra
            gallery slot shows the SAME first photo again with a ruler
            overlay drawn on top client-side; no second image is stored. */}
        <div className="space-y-3">
          {(() => {
            const baseImages = product.images || [];
            const hasDims = product.widthInches > 0 && product.heightInches > 0;
            // Sets (e.g. shirt + trouser) show the ruler IN PLACE on the
            // 2nd/3rd photos instead of appending a duplicate: photo 1 as
            // uploaded, photo 2 gets the 1st item's ruler drawn on it, photo 3
            // gets the 2nd item's ruler. A photo with no matching dimensions
            // just renders plain — no overlay, no duplicate.
            const galleryItems = product.isSet
              ? baseImages.map((src, i) => {
                  if (i === 1 && hasDims) return { src, ruler: true, w: product.widthInches, h: product.heightInches };
                  if (i === 2 && product.set2WidthInches > 0 && product.set2HeightInches > 0) {
                    return { src, ruler: true, w: product.set2WidthInches, h: product.set2HeightInches };
                  }
                  return { src, ruler: false };
                })
              : [
                  ...baseImages.map((src) => ({ src, ruler: false })),
                  ...(hasDims && baseImages[0] ? [{ src: baseImages[0], ruler: true, w: product.widthInches, h: product.heightInches }] : []),
                ];
            const active = galleryItems[activeImg] || galleryItems[0];

            return (
              <>
                <div className="sheen aspect-square rounded-3xl overflow-hidden card p-0 relative">
                  <Img
                    src={active?.src}
                    alt={product.name}
                    iconSize={60}
                    className="h-full w-full"
                    imgClassName="h-full w-full object-contain"
                  />
                  {active?.ruler && (
                    <RulerOverlay widthInches={active.w} heightInches={active.h} />
                  )}
                </div>
                {galleryItems.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto">
                    {galleryItems.map((item, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveImg(i)}
                        className={`relative h-16 w-16 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-colors ${activeImg === i ? 'border-[var(--color-primary)]' : 'border-transparent'}`}
                        title={item.ruler ? `${item.w} in × ${item.h} in` : undefined}
                      >
                        <Img src={item.src} alt="" iconSize={18} className="h-full w-full" imgClassName="h-full w-full object-cover" />
                        {item.ruler && <RulerOverlay widthInches={item.w} heightInches={item.h} />}
                      </button>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Info */}
        <div className="space-y-5">
          <div>
            <span className="text-xs uppercase tracking-widest font-medium" style={{ color: 'var(--color-secondary)' }}>
              {product.category}
            </span>
            <h1 className="text-3xl font-extrabold mt-1 leading-tight" style={{ color: 'var(--color-ink)' }}>{product.name}</h1>
            <p className="text-xs mt-1" style={{ color: 'var(--color-ink-soft)' }}>SKU: {product.SKU}</p>
          </div>

          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-extrabold" style={{ color: 'var(--color-primary)' }}>
              {formatPrice(sale)}
            </span>
            {onSale && (
              <>
                <span className="text-lg text-gray-400 line-through">{formatPrice(mrp)}</span>
                <span className="text-sm font-semibold text-green-600">
                  {Math.round((1 - sale / mrp) * 100)}% off
                </span>
              </>
            )}
          </div>

          {/* Variant / Size attributes */}
          {(product.color || product.size) && (
            <div className="flex flex-wrap gap-6">
              {product.color && (
                <div>
                  <span className="text-xs text-gray-400 uppercase tracking-wider block mb-1">Variant</span>
                  <span className="inline-block px-3 py-1 rounded-lg border border-gray-200 text-sm font-medium text-gray-800">{product.color}</span>
                </div>
              )}
              {product.size && (
                <div>
                  <span className="text-xs text-gray-400 uppercase tracking-wider block mb-1">Size</span>
                  <span className="inline-block px-3 py-1 rounded-lg border border-gray-200 text-sm font-medium text-gray-800">{product.size}</span>
                </div>
              )}
            </div>
          )}

          {/* Stock */}
          <div>
            {available > 0 ? (
              <div className="flex items-center gap-2">
                <span className="badge-stock-in">In Stock</span>
                {available <= (product.lowStockThreshold ?? 10) && (
                  <span className="text-xs text-yellow-600 font-medium">Only {available} left!</span>
                )}
              </div>
            ) : (
              <span className="badge-stock-out">Out of Stock</span>
            )}
          </div>

          {/* Description */}
          {product.description && (
            <p className="text-gray-600 text-sm leading-relaxed">{product.description}</p>
          )}

          {/* Qty + Add to Cart */}
          {(available > 0 || inCart) && (
            <div className="space-y-3">
              {available > 0 && !inCart && (
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-700">Quantity:</label>
                  <div className="flex items-center border rounded-lg overflow-hidden">
                    <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="p-2 hover:bg-gray-50 text-gray-600">
                      <Minus size={16} />
                    </button>
                    <span className="px-4 py-2 text-sm font-medium min-w-[3rem] text-center">{qty}</span>
                    <button onClick={() => setQty((q) => Math.min(available, q + 1))} className="p-2 hover:bg-gray-50 text-gray-600">
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              )}
              <button
                onClick={handleAddToCart}
                className={`w-full py-3.5 text-base ${inCart ? 'btn-candy-pink' : 'btn-primary'}`}
              >
                {inCart ? (
                  <>Go to Cart <ArrowRight size={20} /></>
                ) : (
                  <><ShoppingCart size={20} /> Add to Cart</>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
