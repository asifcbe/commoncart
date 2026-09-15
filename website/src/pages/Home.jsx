import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Truck, Shield, RefreshCw, Headphones, ArrowRight, ArrowUpRight } from 'lucide-react';
import shopConfig from '../config/shop.config';
import useShopStore from '../store/useShopStore';
import ProductCard from '../components/ui/ProductCard';
import HeroCarousel from '../components/HeroCarousel';
import GuidedFilter from '../components/GuidedFilter';
import Spinner from '../components/ui/Spinner';
import Img from '../components/ui/Img';
import { applyMeta } from '../utils/theme';

const featureIcons = { truck: Truck, shield: Shield, refresh: RefreshCw, headphones: Headphones };

export default function Home() {
  const { products, categories, categoryCards, loading, fetchProducts } = useShopStore();
  const cards = (categoryCards && categoryCards.length)
    ? categoryCards
    : categories.map((name) => ({ name, image: '' }));
  const anyCardImage = cards.some((c) => c.image);
  const { homepage } = shopConfig;

  useEffect(() => {
    applyMeta(null);
    fetchProducts({ featured: 'true', limit: 8 });
  }, []);

  return (
    <div className="overflow-x-hidden">
      {/* ── Hero carousel (admin-managed, Settings → Homepage Carousel) ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-2 md:pt-8">
        <HeroCarousel />
      </section>

      {/* ── Guided flow: Category → Sub → Size ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-2">
        <GuidedFilter />
      </section>

      {/* ── Features strip ───────────────────────────────────── */}
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="stagger grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            {homepage.features.map((f, i) => {
              const Icon = featureIcons[f.icon] || Truck;
              return (
                <div key={f.title} className="anim-rise text-center sm:text-left" style={{ ['--i']: i }}>
                  <div className="h-11 w-11 rounded-full flex items-center justify-center mb-3 mx-auto sm:mx-0"
                    style={{ background: 'var(--color-primary-light)' }}>
                    <Icon size={18} style={{ color: 'var(--color-primary-dark)' }} />
                  </div>
                  <div className="font-semibold text-sm" style={{ color: 'var(--color-ink)' }}>{f.title}</div>
                  <div className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-ink-soft)' }}>
                    {f.description}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Shop by category ─────────────────────────────────── */}
      {cards.length > 0 && (
        <section className="pt-4 pb-16 max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-baseline justify-between mb-7">
            <div>
              <h2 className="text-2xl" style={{ fontFamily: "'Fraunces', Georgia, serif", color: 'var(--color-ink)' }}>
                Shop by category
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--color-ink-soft)' }}>Find their perfect fit, by age and style.</p>
            </div>
          </div>

          {anyCardImage ? (
            <div className="stagger grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 sm:gap-5">
              {cards.map((cat, i) => (
                <Link
                  key={cat.name}
                  to={`/products?category=${encodeURIComponent(cat.name)}`}
                  className="card card-hover relative overflow-hidden anim-rise group"
                  style={{ ['--i']: i }}
                >
                  <div className="aspect-square w-full overflow-hidden relative" style={{ background: 'var(--color-primary-light)' }}>
                    {cat.image ? (
                      <Img
                        src={cat.image}
                        alt={cat.name}
                        className="h-full w-full"
                        imgClassName="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        iconSize={30}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center px-2 text-center font-medium" style={{ color: 'var(--color-ink-soft)' }}>
                        {cat.name}
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-end justify-end p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'linear-gradient(180deg, transparent 60%, rgba(0,0,0,.15) 100%)' }}>
                      <span className="h-7 w-7 rounded-full bg-white flex items-center justify-center shadow">
                        <ArrowUpRight size={14} style={{ color: 'var(--color-primary-dark)' }} />
                      </span>
                    </div>
                  </div>
                  <div className="px-3 py-3 text-center font-medium text-sm truncate" style={{ color: 'var(--color-ink)' }}>{cat.name}</div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2.5 justify-center">
              {cards.map((cat, i) => (
                <Link
                  key={cat.name}
                  to={`/products?category=${encodeURIComponent(cat.name)}`}
                  className="pick-pill anim-rise"
                  style={{ ['--i']: i }}
                >
                  {cat.name}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Promo strip ───────────────────────────────────────── */}
      <section className="py-8" style={{ background: 'var(--color-ink)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-center">
          <p className="text-sm font-medium" style={{ color: '#EAD9C4' }}>
            Free shipping on orders over {shopConfig.store.currency}{shopConfig.store.freeShippingAbove}
          </p>
          <span className="hidden sm:block h-1 w-1 rounded-full" style={{ background: '#5A4B37' }} />
          <p className="text-sm font-medium" style={{ color: '#EAD9C4' }}>Easy exchanges, no fuss</p>
          <span className="hidden sm:block h-1 w-1 rounded-full" style={{ background: '#5A4B37' }} />
          <p className="text-sm font-medium" style={{ color: '#EAD9C4' }}>Cash on delivery available</p>
        </div>
      </section>

      {/* ── Featured products ────────────────────────────────── */}
      <section className="relative py-14 max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-baseline justify-between mb-7">
          <div>
            <h2 className="text-2xl" style={{ fontFamily: "'Fraunces', Georgia, serif", color: 'var(--color-ink)' }}>
              {homepage.featuredSectionTitle}
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--color-ink-soft)' }}>Handpicked, in stock, ready to ship.</p>
          </div>
          <Link to="/products" className="group inline-flex items-center gap-1 text-sm font-medium whitespace-nowrap"
            style={{ color: 'var(--color-primary-dark)' }}>
            View all <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : products.length === 0 ? (
          <div className="text-center py-16" style={{ color: 'var(--color-ink-soft)' }}>No products yet — check back soon!</div>
        ) : (
          <div className="stagger grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
            {products.map((p, i) => (
              <div key={p._id} className="anim-rise" style={{ ['--i']: i }}>
                <ProductCard product={p} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
