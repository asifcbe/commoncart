import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, RotateCcw, Sparkles } from 'lucide-react';
import api from '../utils/api';
import Img from './ui/Img';

/**
 * Landing-page guided flow: Category → Sub-category → Size.
 * Each step reveals the next; at the end it routes to the product listing
 * with all three filters applied. Each pick pushes its own URL (query params
 * on "/"), so browser/back-button navigation and the in-widget Back button
 * both move one step at a time through real history entries.
 */
const STEPS = ['category', 'subCategory', 'size'];

// Per-step identity — label, prompt, and a colour token used for the
// tiles and the prompt gradient so each step feels distinct.
const STEP_META = {
  category:    { prompt: () => 'What are we shopping for?',
                 color: 'var(--color-primary)',   dark: 'var(--color-primary-dark)',   light: 'var(--color-primary-light)' },
  subCategory: { prompt: (p) => `Which kind of ${p.category || 'outfit'}?`,
                 color: 'var(--color-accent)',    dark: '#E0A500',                     light: '#FFF3D6' },
  size:        { prompt: () => 'And the size?',
                 color: 'var(--color-secondary)', dark: 'var(--color-secondary-dark)', light: 'var(--color-secondary-light)' },
};

export default function GuidedFilter() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Picks and step both derive from the URL — the guided flow's state IS
  // the address bar, so each choice pushing a new URL is what makes browser
  // back (and the widget's own Back button, via navigate(-1)) land on the
  // previous step.
  const picked = useMemo(() => ({
    category: searchParams.get('category') || '',
    subCategory: searchParams.get('subCategory') || '',
    size: searchParams.get('size') || '',
  }), [searchParams]);
  const step = picked.category ? (picked.subCategory ? 2 : 1) : 0;

  const [opts, setOpts] = useState({ categories: [], subCategories: [], sizes: [] });
  // Image lookup by "<category>" and "<category>|<sub>" so category and
  // sub-category steps can show a photo tile instead of a plain pill.
  const [imgByKey, setImgByKey] = useState({});
  const [loading, setLoading] = useState(true);

  const loadOptions = async (filters) => {
    setLoading(true);
    try {
      const { data } = await api.get('/orders/products/public', { params: { ...filters, limit: 1 } });
      setOpts({
        categories: data.categories || [],
        subCategories: data.subCategories || [],
        sizes: data.sizes || [],
      });
    } catch {
      /* keep whatever we had */
    } finally {
      setLoading(false);
    }
  };

  // One-time: the managed category tree with images (category + sub-category).
  const loadCategoryImages = async () => {
    try {
      const { data } = await api.get('/orders/categories/public');
      const map = {};
      for (const c of data.categories || []) {
        if (c.image) map[c.name] = c.image;
        for (const s of c.subCategories || []) if (s.image) map[`${c.name}|${s.name}`] = s.image;
      }
      setImgByKey(map);
    } catch { /* fall back to text pills */ }
  };

  useEffect(() => { loadCategoryImages(); }, []);
  // Re-fetch options whenever the URL-derived picks change (covers forward
  // choices, Back, forward-again, and a bookmarked/shared URL alike).
  useEffect(() => {
    loadOptions({
      category: picked.category || undefined,
      subCategory: picked.subCategory || undefined,
    });
  }, [picked.category, picked.subCategory]);

  const choose = (key, value) => {
    const next = { ...picked, [key]: value };
    const idx = STEPS.indexOf(key);
    STEPS.slice(idx + 1).forEach((k) => { next[k] = ''; });

    if (step === STEPS.length - 1) { goToResults(next); return; }

    const q = new URLSearchParams();
    if (next.category) q.set('category', next.category);
    if (next.subCategory) q.set('subCategory', next.subCategory);
    navigate(`/?${q.toString()}`);
  };

  const goToResults = (p = picked) => {
    const q = new URLSearchParams();
    if (p.category) q.set('category', p.category);
    if (p.subCategory) q.set('subCategory', p.subCategory);
    if (p.size) q.set('size', p.size);
    navigate(`/products${q.toString() ? `?${q}` : ''}`);
  };

  const back = () => navigate(-1);

  const reset = () => navigate('/');

  const currentKey = STEPS[step];
  const meta = STEP_META[currentKey];
  const currentOptions = useMemo(() => {
    if (currentKey === 'category') return opts.categories;
    if (currentKey === 'subCategory') return opts.subCategories;
    return opts.sizes;
  }, [currentKey, opts]);

  const anyPicked = picked.category || picked.subCategory || picked.size;

  // Image for an option value at the current step (category / sub-category only).
  const imageFor = (value) => {
    if (currentKey === 'category') return imgByKey[value] || '';
    if (currentKey === 'subCategory') return imgByKey[`${picked.category}|${value}`] || '';
    return '';
  };
  const useTiles = (currentKey === 'category' || currentKey === 'subCategory')
    && currentOptions.some((o) => imageFor(o));

  return (
    <div
      className="card card-hover sheen relative overflow-hidden anim-rise p-6 sm:p-9"
      style={{ background: `linear-gradient(180deg, #fff 0%, ${meta.light} 100%)` }}
    >
      {/* soft corner blobs, tinted to the current step */}
      <span className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full anim-blob opacity-20"
        style={{ background: meta.color }} />
      <span className="pointer-events-none absolute -bottom-12 -left-12 h-44 w-44 rounded-full anim-blob opacity-15"
        style={{ background: meta.color, animationDelay: '1.5s' }} />

      {/* ── Prompt ────────────────────────────────────── */}
      <p key={currentKey} className="anim-pop text-center font-extrabold text-2xl sm:text-3xl mb-6 text-candy">
        {meta.prompt(picked)}
      </p>

      {/* ── Options ───────────────────────────────────── */}
      {loading ? (
        <div className="min-h-[64px] flex items-center justify-center gap-2 py-4">
          {[0, 1, 2].map((n) => (
            <span key={n} className="h-3 w-3 rounded-full anim-bob"
              style={{ background: meta.color, animationDelay: `${n * 150}ms` }} />
          ))}
        </div>
      ) : useTiles ? (
        // Photo tiles: category name on top, image below (matches the home cards).
        <div className="stagger grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {currentOptions.map((o, idx) => {
            const on = picked[currentKey] === o;
            const img = imageFor(o);
            return (
              <button
                key={o}
                onClick={() => choose(currentKey, o)}
                className="card card-hover sheen relative overflow-hidden anim-rise group text-left"
                style={{
                  ['--i']: idx,
                  borderColor: on ? meta.dark : 'var(--color-toffee)',
                  boxShadow: on ? `0 4px 0 0 ${meta.dark}` : 'none',
                }}
              >
                <div className="aspect-square w-full overflow-hidden" style={{ background: meta.light }}>
                  {img ? (
                    <Img
                      src={img}
                      alt={o}
                      className="h-full w-full"
                      imgClassName="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      iconSize={28}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center px-2 text-center font-extrabold" style={{ color: meta.dark }}>
                      {o}
                    </div>
                  )}
                </div>
                <div
                  className="px-2 pt-2.5 pb-2 text-center font-extrabold text-sm truncate"
                  style={on ? { background: `linear-gradient(180deg, ${meta.color} 0%, ${meta.dark} 100%)`, color: '#fff' } : { color: 'var(--color-ink)' }}
                >
                  {o}
                </div>
                {on && (
                  <span className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full flex items-center justify-center border-2 border-white"
                    style={{ background: meta.dark, color: '#fff' }}>
                    <Check size={14} strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="min-h-[64px] flex flex-wrap justify-center gap-3">
          {currentOptions.map((o, idx) => {
            const on = picked[currentKey] === o;
            return (
              <button
                key={o}
                onClick={() => choose(currentKey, o)}
                className="pick-pill text-base px-5 py-3 lift anim-pop"
                style={{
                  ['--i']: idx,
                  background: on ? `linear-gradient(180deg, ${meta.color} 0%, ${meta.dark} 100%)` : '#fff',
                  borderColor: on ? meta.dark : 'var(--color-toffee)',
                  color: on ? '#fff' : 'var(--color-ink)',
                  boxShadow: on ? `0 4px 0 0 ${meta.dark}` : 'none',
                }}
              >
                {o}
              </button>
            );
          })}
          {currentOptions.length === 0 && (
            <button className="pick-pill text-base px-5 py-3" onClick={() => choose(currentKey, '')}>
              Skip — nothing to narrow here
            </button>
          )}
        </div>
      )}

      {/* ── Footer ────────────────────────────────────── */}
      <div className="relative flex items-center justify-between mt-8 pt-5 border-t-[3px] border-dashed" style={{ borderColor: 'var(--color-toffee)' }}>
        <div className="flex items-center gap-4">
          <button
            onClick={back}
            disabled={step === 0}
            className="inline-flex items-center gap-1.5 text-sm font-extrabold disabled:opacity-40"
            style={{ color: 'var(--color-ink-soft)' }}
          >
            <ArrowLeft size={15} /> Back
          </button>
          <button
            onClick={reset}
            disabled={!anyPicked && step === 0}
            className="inline-flex items-center gap-1.5 text-sm font-extrabold disabled:opacity-40"
            style={{ color: 'var(--color-ink-soft)' }}
          >
            <RotateCcw size={15} /> Start over
          </button>
        </div>
        <button onClick={() => goToResults()} className="btn-candy-pink py-3 px-6 text-base">
          <Sparkles size={18} /> Show me outfits <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
