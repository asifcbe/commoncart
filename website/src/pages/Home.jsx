import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Truck, Shield, RefreshCw, Headphones, ArrowRight } from 'lucide-react';
import shopConfig from '../config/shop.config';
import useShopStore from '../store/useShopStore';
import ProductCard from '../components/ui/ProductCard';
import Spinner from '../components/ui/Spinner';
import { applyMeta } from '../utils/theme';

const featureIcons = { truck: Truck, shield: Shield, refresh: RefreshCw, headphones: Headphones };

export default function Home() {
  const { products, categories, loading, fetchProducts } = useShopStore();
  const { homepage, brand, store } = shopConfig;

  useEffect(() => {
    applyMeta(null);
    fetchProducts({ featured: 'true', limit: 8 });
  }, []);

  return (
    <div>
      {/* Hero */}
      <section
        className="relative flex items-center justify-center min-h-[420px] md:min-h-[500px] overflow-hidden"
        style={{
          background: homepage.hero.backgroundImage
            ? `url(${homepage.hero.backgroundImage}) center/cover no-repeat`
            : 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)',
        }}
      >
        {homepage.hero.backgroundImage && (
          <div
            className="absolute inset-0 bg-black"
            style={{ opacity: homepage.hero.overlayOpacity }}
          />
        )}
        <div className="relative z-10 text-center px-4 max-w-2xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight mb-4">
            {homepage.hero.title}
          </h1>
          <p className="text-lg text-white/80 mb-8">{homepage.hero.subtitle}</p>
          <Link
            to="/products"
            className="inline-flex items-center gap-2 bg-white font-bold px-8 py-3 rounded-full hover:bg-gray-100 transition-colors text-base"
            style={{ color: 'var(--color-primary)' }}
          >
            {homepage.hero.ctaText} <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="py-10 border-b bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {homepage.features.map((f) => {
              const Icon = featureIcons[f.icon] || Truck;
              return (
                <div key={f.title} className="flex items-start gap-3">
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--color-primary-light)' }}
                  >
                    <Icon size={20} style={{ color: 'var(--color-primary)' }} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-gray-900">{f.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{f.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="py-12 max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">{homepage.categorySectionTitle}</h2>
          <div className="flex flex-wrap gap-3">
            {categories.map((cat) => (
              <Link
                key={cat}
                to={`/products?category=${encodeURIComponent(cat)}`}
                className="px-5 py-2.5 rounded-full border-2 font-medium text-sm hover:text-white transition-all"
                style={{
                  borderColor: 'var(--color-primary)',
                  color: 'var(--color-primary)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--color-primary)';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '';
                  e.currentTarget.style.color = 'var(--color-primary)';
                }}
              >
                {cat}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured Products */}
      <section className="pb-16 max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{homepage.featuredSectionTitle}</h2>
          <Link
            to="/products"
            className="flex items-center gap-1 text-sm font-medium hover:underline"
            style={{ color: 'var(--color-primary)' }}
          >
            View all <ArrowRight size={14} />
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No products available yet.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
            {products.map((p) => <ProductCard key={p._id} product={p} />)}
          </div>
        )}
      </section>
    </div>
  );
}
