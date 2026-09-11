import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, ArrowRight } from 'lucide-react';
import { formatPrice, priceInfo } from '../../utils/theme';
import { burstConfetti } from '../../utils/confetti';
import Img from './Img';
import useCartStore from '../../store/useCartStore';

function StockBadge({ availableQty, threshold }) {
  if (availableQty <= 0) return <span className="badge-stock-out">Sold Out</span>;
  if (availableQty <= threshold) return <span className="badge-stock-low">Few left</span>;
  return <span className="badge-stock-in">In Stock</span>;
}

export default function ProductCard({ product }) {
  const navigate = useNavigate();
  const addItem = useCartStore((s) => s.addItem);
  const inCart = useCartStore((s) => s.items.some((i) => i.productId === product._id));
  const available = product.availableQty ?? product.quantity - (product.reservedQty || 0);
  const { sale, mrp, onSale } = priceInfo(product);

  const off = onSale && mrp > 0 ? Math.round((1 - sale / mrp) * 100) : 0;

  const handleAdd = (e) => {
    if (inCart) { navigate('/cart'); return; }
    addItem(product);
    const r = e.currentTarget.getBoundingClientRect();
    burstConfetti(r.left + r.width / 2, r.top + r.height / 2);
  };

  return (
    <div className="card card-hover group flex flex-col overflow-hidden">
      {/* Image */}
      <Link to={`/products/${product._id}`} className="sheen relative block aspect-square overflow-hidden"
        style={{ background: 'var(--color-primary-light)' }}>
        <Img
          src={product.images?.[0]}
          alt={product.name}
          iconSize={44}
          className="h-full w-full"
          imgClassName="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
        {off > 0 && (
          <span className="absolute top-2 left-2 rounded-full px-2.5 py-1 text-xs font-extrabold text-white anim-bob shadow"
            style={{ background: 'var(--color-secondary)' }}>
            −{off}%
          </span>
        )}
      </Link>

      {/* Info */}
      <div className="p-4 flex flex-col flex-1">
        <p className="text-[0.65rem] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--color-ink-soft)' }}>
          {product.category}
        </p>
        <Link to={`/products/${product._id}`} className="font-extrabold hover:underline line-clamp-2 leading-snug"
          style={{ color: 'var(--color-ink)' }}>
          {product.name}
        </Link>
        {(product.color || product.size) && (
          <p className="text-xs mt-1 font-semibold" style={{ color: 'var(--color-ink-soft)' }}>
            {[product.color, product.size].filter(Boolean).join(' · ')}
          </p>
        )}
        <div className="flex-1" />

        <div className="flex items-center justify-between mt-3">
          <span className="flex items-baseline gap-1.5">
            <span className="text-lg font-extrabold" style={{ color: 'var(--color-primary)' }}>
              {formatPrice(sale)}
            </span>
            {onSale && (
              <span className="text-sm line-through" style={{ color: 'var(--color-ink-soft)' }}>{formatPrice(mrp)}</span>
            )}
          </span>
          <StockBadge availableQty={available} threshold={product.lowStockThreshold ?? 10} />
        </div>

        <button
          onClick={handleAdd}
          disabled={available <= 0 && !inCart}
          className={`w-full mt-3 py-2.5 text-sm ${inCart ? 'btn-candy-pink' : 'btn-primary'}`}
        >
          {inCart ? (
            <>Go to Cart <ArrowRight size={15} /></>
          ) : (
            <><ShoppingCart size={15} /> {available <= 0 ? 'Sold Out' : 'Add to Cart'}</>
          )}
        </button>
      </div>
    </div>
  );
}
