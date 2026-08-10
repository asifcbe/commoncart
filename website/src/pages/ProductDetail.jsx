import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ShoppingCart, ArrowLeft, Minus, Plus, Package } from 'lucide-react';
import api from '../utils/api';
import useCartStore from '../store/useCartStore';
import { useToast } from '../components/ui/Toast';
import Spinner from '../components/ui/Spinner';
import { formatPrice, applyMeta } from '../utils/theme';
import { connectSocket, getSocket } from '../utils/socket';

export default function ProductDetail() {
  const { id } = useParams();
  const toast = useToast();
  const addItem = useCartStore((s) => s.addItem);
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [activeImg, setActiveImg] = useState(0);

  const fetchProduct = async () => {
    try {
      const { data } = await api.get(`/orders/products/public/${id}`);
      setProduct(data.product);
      applyMeta(data.product.name);
    } catch {
      setProduct(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProduct();

    // Subscribe to real-time stock updates for this product
    const socket = connectSocket();
    socket.emit('join:product', id);
    socket.on('stock:updated', ({ productId, quantity, reservedQty }) => {
      if (productId === id) {
        setProduct((p) => p ? { ...p, quantity, reservedQty, availableQty: Math.max(0, quantity - (reservedQty ?? 0)) } : p);
      }
    });
    return () => {
      socket.emit('leave:product', id);
      socket.off('stock:updated');
    };
  }, [id]);

  if (loading) return <div className="flex justify-center items-center min-h-[60vh]"><Spinner size="lg" /></div>;
  if (!product) return (
    <div className="max-w-7xl mx-auto px-4 py-20 text-center">
      <Package size={48} className="mx-auto text-gray-300 mb-4" />
      <h2 className="text-xl font-semibold text-gray-700">Product not found</h2>
      <Link to="/products" className="btn-primary mt-6 inline-flex">Browse Products</Link>
    </div>
  );

  const available = product.availableQty ?? product.quantity - (product.reservedQty ?? 0);

  const handleAddToCart = () => {
    addItem(product, qty);
    toast({ message: `${product.name} added to cart`, type: 'success' });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/" className="hover:underline">Home</Link>
        <span>/</span>
        <Link to="/products" className="hover:underline">Products</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium truncate">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        {/* Images */}
        <div className="space-y-3">
          <div className="aspect-square rounded-2xl overflow-hidden bg-gray-100">
            {product.images?.length > 0 ? (
              <img
                src={product.images[activeImg]}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-gray-300">
                <Package size={60} />
              </div>
            )}
          </div>
          {product.images?.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {product.images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImg(i)}
                  className={`h-16 w-16 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-colors ${activeImg === i ? 'border-[var(--color-primary)]' : 'border-transparent'}`}
                >
                  <img src={img} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-5">
          <div>
            <span className="text-xs uppercase tracking-widest font-medium" style={{ color: 'var(--color-secondary)' }}>
              {product.category}
            </span>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">{product.name}</h1>
            <p className="text-xs text-gray-400 mt-1">SKU: {product.SKU}</p>
          </div>

          <div className="text-3xl font-extrabold" style={{ color: 'var(--color-primary)' }}>
            {formatPrice(product.price)}
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
          {available > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">Quantity:</label>
                <div className="flex items-center border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="p-2 hover:bg-gray-50 text-gray-600"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="px-4 py-2 text-sm font-medium min-w-[3rem] text-center">{qty}</span>
                  <button
                    onClick={() => setQty((q) => Math.min(available, q + 1))}
                    className="p-2 hover:bg-gray-50 text-gray-600"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
              <button onClick={handleAddToCart} className="btn-primary w-full py-3 text-base rounded-xl">
                <ShoppingCart size={20} /> Add to Cart
              </button>
            </div>
          )}

          {/* Meta */}
          <div className="pt-4 border-t space-y-1 text-xs text-gray-400">
            {product.supplier && <div>Supplier: {product.supplier}</div>}
            {product.location && <div>Location: {product.location}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
