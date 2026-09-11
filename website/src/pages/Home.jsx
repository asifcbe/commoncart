import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Truck, Shield, RefreshCw, Headphones, ArrowRight, ShoppingBag, Star, ArrowUpRight } from 'lucide-react';
import shopConfig from '../config/shop.config';
import useShopStore from '../store/useShopStore';
import ProductCard from '../components/ui/ProductCard';
import BrandLogo from '../components/ui/BrandLogo';
import GuidedFilter from '../components/GuidedFilter';
import Spinner from '../components/ui/Spinner';
import Img from '../components/ui/Img';
import { applyMeta } from '../utils/theme';

const featureIcons = { truck: Truck, shield: Shield, refresh: RefreshCw, headphones: Headphones };

// Soft, static blurred color fields behind the hero — decorative depth
// without the old bouncing/spinning "candy" motion.
function HeroGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      <span className="absolute rounded-full blur-3xl opacity-40"
        style={{ width: 420, height: 420, left: '-8%', top: '-15%', background: 'var(--color-primary-light)' }} />
      <span className="absolute rounded-full blur-3xl opacity-40"
        style={{ width: 360, height: 360, right: '-6%', top: '5%', background: 'var(--color-secondary-light)' }} />
      <span className="absolute rounded-full blur-3xl opacity-30"
        style={{ width: 280, height: 280, left: '38%', bottom: '-12%', background: '#FFF3D6' }} />
    </div>
  );
}

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
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative border-b" style={{ borderColor: 'var(--color-toffee)' }}>
        <div
          className="absolute inset-0 -z-20"
          style={{ background: 'linear-gradient(180deg, var(--color-primary-light) 0%, var(--color-bg) 100%)' }}
        />
        <HeroGlow />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-16 pb-14 md:pt-20 md:pb-16">
          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-14 items-center">
            {/* Left: copy */}
            <div className="anim-rise text-center lg:text-left">
              <p className="text-xs font-semibold tracking-[0.35em] uppercase mb-5" style={{ color: 'var(--color-primary-dark)' }}>
                New arrivals every week
              </p>
              <h1 className="text-4xl md:text-5xl xl:text-6xl leading-[1.1]" style={{ fontFamily: "'Fraunces', Georgia, serif", color: 'var(--color-ink)' }}>
                {homepage.hero.title}
              </h1>
              {homepage.hero.subtitle && (
                <p className="mt-5 text-base md:text-lg max-w-lg mx-auto lg:mx-0" style={{ color: 'var(--color-ink-soft)' }}>
                  {homepage.hero.subtitle}
                </p>
              )}
              <div className="mt-9 flex flex-col sm:flex-row items-center gap-5 justify-center lg:justify-start">
                <Link to="/products" className="btn-primary group text-base px-8 py-3.5">
                  <ShoppingBag size={18} />
                  {homepage.hero.ctaText}
                  <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                </Link>
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-ink-soft)' }}>
                  <span className="flex" style={{ color: 'var(--color-accent)' }}>
                    {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={14} fill="currentColor" strokeWidth={0} />)}
                  </span>
                  <span className="font-medium" style={{ color: 'var(--color-ink)' }}>4.8/5</span>
                  loved by parents
                </div>
              </div>
            </div>

            {/* Right: brand mark card */}
            <div className="anim-rise flex justify-center lg:justify-end">
              <div className="card p-10 sm:p-14 flex flex-col items-center gap-5"
                style={{ background: '#fff', maxWidth: 340 }}>
                <BrandLogo size={84} animated={false} />
                <div className="text-center">
                  <p className="text-2xl" style={{ fontFamily: "'Fraunces', Georgia, serif", color: 'var(--color-ink)' }}>
                    Tom <span style={{ color: 'var(--color-primary)' }}>&amp;</span> Jerry
                  </p>
                  <p className="text-xs font-medium tracking-[0.3em] uppercase mt-1.5" style={{ color: 'var(--color-ink-soft)' }}>
                    Kids Wear
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Guided flow: Category → Sub → Size ── */}
          <div className="mt-14 max-w-4xl mx-auto">
            <GuidedFilter />
          </div>
        </div>
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
