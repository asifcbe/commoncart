import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Truck, Shield, RefreshCw, Headphones, ArrowRight, Heart, Star, Sparkles, ShoppingBag } from 'lucide-react';
import shopConfig from '../config/shop.config';
import useShopStore from '../store/useShopStore';
import ProductCard from '../components/ui/ProductCard';
import BrandLogo from '../components/ui/BrandLogo';
import CandySky from '../components/ui/CandySky';
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
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative">
        <div
          className="absolute inset-0 -z-20"
          style={{
            background:
              'radial-gradient(1200px 520px at 15% 0%, var(--color-primary-light) 0%, transparent 60%),' +
              'radial-gradient(1000px 520px at 100% 20%, var(--color-secondary-light) 0%, transparent 55%),' +
              'var(--color-bg)',
          }}
        />
        <CandySky />
        <Heart className="pointer-events-none absolute left-[20%] bottom-16 anim-heartbeat" size={24} style={{ color: 'var(--color-danger)' }} />
        <Star className="pointer-events-none absolute right-[14%] top-24 anim-twinkle" size={20} style={{ color: 'var(--color-accent)' }} />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-12 pb-10 md:pt-16">
          <div className="grid lg:grid-cols-[1.05fr_1fr] gap-10 items-center">
            {/* Left: copy */}
            <div className="anim-rise text-center lg:text-left">
              <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-extrabold mb-4"
                style={{ background: 'var(--color-accent)', color: 'var(--color-ink)' }}>
                <Star size={13} /> New arrivals every week
              </div>
              <h1 className="text-4xl md:text-5xl xl:text-6xl leading-[1.05] text-candy">
                {homepage.hero.title}
              </h1>
              {homepage.hero.subtitle && (
                <p className="mt-4 text-base md:text-lg font-semibold max-w-lg mx-auto lg:mx-0"
                  style={{ color: 'var(--color-ink-soft)' }}>
                  {homepage.hero.subtitle}
                </p>
              )}
              <div className="mt-8 flex justify-center lg:justify-start">
                <Link
                  to="/products"
                  className="btn-primary group text-xl sm:text-2xl px-9 sm:px-12 py-4 sm:py-5 rounded-[1.75rem]"
                >
                  <ShoppingBag size={24} className="anim-bob" />
                  {homepage.hero.ctaText}
                  <ArrowRight size={24} className="transition-transform group-hover:translate-x-1.5" />
                </Link>
              </div>
            </div>

            {/* Right: animated logo card */}
            <div className="anim-pop">
              <div className="card card-hover sheen p-8 sm:p-10 flex flex-col items-center gap-4 relative"
                style={{ background: 'linear-gradient(180deg,#fff 0%, var(--color-primary-light) 100%)' }}>
                {/* orbiting accents */}
                <span className="pointer-events-none absolute -top-3 -right-3 h-8 w-8 rounded-full anim-spin-slow"
                  style={{ background: 'conic-gradient(var(--color-accent), var(--color-secondary), var(--color-primary), var(--color-accent))' }} />
                <Heart className="pointer-events-none absolute -bottom-3 -left-3 anim-heartbeat" size={22} style={{ color: 'var(--color-danger)' }} />
                <div className="anim-wiggle">
                  <BrandLogo size={92} animated />
                </div>
                <p className="text-center font-extrabold text-xl">
                  Tom <span style={{ color: 'var(--color-secondary)' }}>&amp;</span> Jerry
                </p>
                <p className="text-xs font-bold tracking-[0.25em] uppercase" style={{ color: 'var(--color-ink-soft)' }}>
                  Kids Wear
                </p>
              </div>
            </div>
          </div>

          {/* ── Guided flow: Category → Sub → Size ── */}
          <div className="mt-12 max-w-4xl mx-auto">
            <GuidedFilter />
          </div>
        </div>
      </section>

      {/* ── Features strip ───────────────────────────────────── */}
      <section className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="stagger grid grid-cols-2 md:grid-cols-4 gap-4">
            {homepage.features.map((f, i) => {
              const Icon = featureIcons[f.icon] || Truck;
              return (
                <div key={f.title} className="card card-hover p-4 flex items-start gap-3 anim-rise" style={{ ['--i']: i }}>
                  <div className="h-11 w-11 rounded-2xl flex items-center justify-center flex-shrink-0 anim-bob"
                    style={{ background: 'var(--color-primary-light)', animationDelay: `${i * 200}ms` }}>
                    <Icon size={20} style={{ color: 'var(--color-primary)' }} />
                  </div>
                  <div>
                    <div className="font-extrabold text-sm">{f.title}</div>
                    <div className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--color-ink-soft)' }}>
                      {f.description}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Shop by category ─────────────────────────────────── */}
      {cards.length > 0 && (
        <section className="pt-6 pb-2 max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl flex items-center gap-2 mb-5">
            <Heart size={20} style={{ color: 'var(--color-secondary)' }} className="anim-twinkle" />
            Shop by category
          </h2>

          {anyCardImage ? (
            <div className="stagger grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {cards.map((cat, i) => (
                <Link
                  key={cat.name}
                  to={`/products?category=${encodeURIComponent(cat.name)}`}
                  className="card card-hover sheen relative overflow-hidden anim-rise group"
                  style={{ ['--i']: i }}
                >
                  {/* text first … */}
                  <div className="px-3 pt-3 pb-2 text-center font-extrabold text-sm truncate">{cat.name}</div>
                  {/* … then the photo below it */}
                  <div className="aspect-square w-full overflow-hidden" style={{ background: 'var(--color-primary-light)' }}>
                    {cat.image ? (
                      <Img
                        src={cat.image}
                        alt={cat.name}
                        className="h-full w-full"
                        imgClassName="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        iconSize={30}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center px-2 text-center font-extrabold text-candy">
                        {cat.name}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2.5 justify-center">
              {cards.map((cat, i) => (
                <Link
                  key={cat.name}
                  to={`/products?category=${encodeURIComponent(cat.name)}`}
                  className="pick-pill anim-pop"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  {cat.name}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Featured products ────────────────────────────────── */}
      <section className="relative py-12 max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl flex items-center gap-2">
            <Sparkles size={20} style={{ color: 'var(--color-accent)' }} className="anim-twinkle" />
            {homepage.featuredSectionTitle}
          </h2>
          <Link to="/products" className="group inline-flex items-center gap-1 text-sm font-extrabold"
            style={{ color: 'var(--color-primary)' }}>
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
