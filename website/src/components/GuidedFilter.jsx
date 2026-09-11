import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, RotateCcw, Sparkles, Shirt, Layers, Ruler } from 'lucide-react';
import api from '../utils/api';
import Img from './ui/Img';

/**
 * Landing-page guided flow: Category → Sub-category → Size.
 * Each step reveals the next; at the end it routes to the product listing
 * with all three filters applied. Any step can be revisited or skipped
 * ("Any …" advances without narrowing that facet).
 */
const STEPS = ['category', 'subCategory', 'size'];

// Per-step identity — label, icon, prompt, and a colour token used for the
// rail node, tiles, and the prompt gradient so each step feels distinct.
const STEP_META = {
  category:    { label: 'Style', Icon: Shirt,  prompt: () => 'What are we shopping for?',
                 color: 'var(--color-primary)',   dark: 'var(--color-primary-dark)',   light: 'var(--color-primary-light)' },
  subCategory: { label: 'Type',  Icon: Layers, prompt: (p) => `Which kind of ${p.category || 'outfit'}?`,
                 color: 'var(--color-accent)',    dark: '#E0A500',                     light: '#FFF3D6' },
  size:        { label: 'Size',  Icon: Ruler,  prompt: () => 'And the size?',
                 color: 'var(--color-secondary)', dark: 'var(--color-secondary-dark)', light: 'var(--color-secondary-light)' },
};

export default function GuidedFilter() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState({ category: '', subCategory: '', size: '' });
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

  useEffect(() => { loadOptions({}); loadCategoryImages(); }, []);

  const choose = async (key, value) => {
    const next = { ...picked, [key]: value };
    const idx = STEPS.indexOf(key);
    STEPS.slice(idx + 1).forEach((k) => { next[k] = ''; });
    setPicked(next);

    if (step === STEPS.length - 1) { goToResults(next); return; }
    setStep(step + 1);
    await loadOptions({
      category: next.category || undefined,
      subCategory: next.subCategory || undefined,
    });
  };

  const goToResults = (p = picked) => {
    const q = new URLSearchParams();
    if (p.category) q.set('category', p.category);
    if (p.subCategory) q.set('subCategory', p.subCategory);
    if (p.size) q.set('size', p.size);
    navigate(`/products${q.toString() ? `?${q}` : ''}`);
  };

  const reset = () => {
    setPicked({ category: '', subCategory: '', size: '' });
    setStep(0);
    loadOptions({});
  };

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

      {/* ── Step rail ─────────────────────────────────── */}
      <div className="relative flex items-center justify-center gap-3 sm:gap-6 mb-7">
        {STEPS.map((k, i) => {
          const m = STEP_META[k];
          const done = i < step || (picked[k] && i !== step);
          const active = i === step;
          return (
            <React.Fragment key={k}>
              <button
                onClick={() => i <= step && setStep(i)}
                disabled={i > step}
                className="group flex flex-col items-center gap-1.5 disabled:cursor-default"
              >
                <span
                  className={`relative h-12 w-12 sm:h-14 sm:w-14 rounded-2xl flex items-center justify-center border-[3px]
                              transition-all duration-200 ${active ? 'anim-bob' : ''} ${i <= step ? 'group-hover:-translate-y-0.5' : ''}`}
                  style={{
                    background: active ? m.color : done ? 'var(--color-success)' : '#fff',
                    borderColor: active ? m.dark : done ? 'var(--color-success)' : 'var(--color-toffee)',
                    color: active || done ? '#fff' : 'var(--color-ink-soft)',
                    boxShadow: active ? `0 6px 0 0 ${m.dark}` : 'none',
                  }}
                >
                  {done ? <Check size={22} strokeWidth={3} /> : <m.Icon size={22} />}
                  <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full text-[10px] font-extrabold flex items-center justify-center border-2 border-white"
                    style={{ background: active ? m.dark : 'var(--color-toffee)', color: active ? '#fff' : 'var(--color-ink-soft)' }}>
                    {i + 1}
                  </span>
                </span>
                <span
                  className="text-xs sm:text-sm font-extrabold text-center leading-tight"
                  style={{ color: active ? m.dark : 'var(--color-ink-soft)' }}
                >
                  {m.label}
                  {picked[k] && (
                    <span className="block text-[11px] font-bold truncate max-w-[80px]" style={{ color: m.color }}>
                      {picked[k]}
                    </span>
                  )}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <span
                  className="h-1.5 w-8 sm:w-14 rounded-full self-start mt-6 transition-colors"
                  style={{ background: i < step ? 'var(--color-success)' : 'var(--color-toffee)' }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

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
                <div
                  className="px-2 pt-2.5 pb-2 text-center font-extrabold text-sm truncate"
                  style={on ? { background: `linear-gradient(180deg, ${meta.color} 0%, ${meta.dark} 100%)`, color: '#fff' } : { color: 'var(--color-ink)' }}
                >
                  {o}
                </div>
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
                {on && (
                  <span className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full flex items-center justify-center border-2 border-white"
                    style={{ background: meta.dark, color: '#fff' }}>
                    <Check size={14} strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
          <button
            onClick={() => choose(currentKey, '')}
            className="card card-hover anim-rise flex items-center justify-center aspect-square font-extrabold text-base"
            style={{ borderColor: 'var(--color-toffee)', color: 'var(--color-ink-soft)' }}
          >
            Any {meta.label}
          </button>
        </div>
      ) : (
        <div className="min-h-[64px] flex flex-wrap justify-center gap-3">
          <button
            className="pick-pill text-base px-5 py-3 lift"
            onClick={() => choose(currentKey, '')}
          >
            Any {meta.label}
          </button>
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
        <button
          onClick={reset}
          disabled={!anyPicked && step === 0}
          className="inline-flex items-center gap-1.5 text-sm font-extrabold disabled:opacity-40"
          style={{ color: 'var(--color-ink-soft)' }}
        >
          <RotateCcw size={15} /> Start over
        </button>
        <button onClick={() => goToResults()} className="btn-candy-pink py-3 px-6 text-base">
          <Sparkles size={18} /> Show me outfits <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
