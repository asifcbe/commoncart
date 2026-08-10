import React from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, ImageOff } from 'lucide-react';
import { formatPrice } from '../../utils/theme';
import useCartStore from '../../store/useCartStore';

function StockBadge({ availableQty, threshold }) {
  if (availableQty <= 0) return <span className="badge-stock-out">Out of Stock</span>;
  if (availableQty <= threshold) return <span className="badge-stock-low">Low Stock</span>;
  return <span className="badge-stock-in">In Stock</span>;
}

export default function ProductCard({ product }) {
  const addItem = useCartStore((s) => s.addItem);
  const available = product.availableQty ?? product.quantity - (product.reservedQty || 0);

  return (
    <div className="card group flex flex-col overflow-hidden hover:shadow-md transition-shadow">
      {/* Image */}
      <Link to={`/products/${product._id}`} className="block aspect-square overflow-hidden bg-gray-50">
        {product.images?.[0] ? (
          <img
            src={product.images[0]}
            alt={product.name}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-gray-300">
            <ImageOff size={40} />
          </div>
        )}
      </Link>

      {/* Info */}
      <div className="p-4 flex flex-col flex-1">
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{product.category}</p>
        <Link to={`/products/${product._id}`} className="font-semibold text-gray-900 hover:underline line-clamp-2">
          {product.name}
        </Link>
        {(product.color || product.size) && (
          <p className="text-xs text-gray-500 mt-1">{[product.color, product.size].filter(Boolean).join(' · ')}</p>
        )}
        <div className="flex-1" />

        <div className="flex items-center justify-between mt-3">
          <span className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>
            {formatPrice(product.price)}
          </span>
          <StockBadge availableQty={available} threshold={product.lowStockThreshold ?? 10} />
        </div>

        <button
          onClick={() => addItem(product)}
          disabled={available <= 0}
          className="btn-primary w-full mt-3 py-2 text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ShoppingCart size={15} />
          {available <= 0 ? 'Out of Stock' : 'Add to Cart'}
        </button>
      </div>
    </div>
  );
}
