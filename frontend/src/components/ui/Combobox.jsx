import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

// Keyboard-first replacement for a native <select> — native dropdowns can't be
// opened via JS (no browser API for it), so a keyboard-only user could only
// ever cycle options blind with arrow keys, never actually see the list. This
// shows the option list on focus/click, filters as you type, and drives
// entirely off Enter/Arrow/Escape — mouse optional throughout.
//
//   <Combobox options={[{value,label}]} value={value} onChange={setValue}
//              onKeyDown={enterNav} placeholder="Select…" />
//
// `onKeyDown` is called for a plain Enter with no dropdown open (or once a
// choice is committed) so callers can chain into the shared Enter-nav flow —
// same contract as the native <select onKeyDown> it replaces.
//
// `onCreateNew(query)` (optional): when Enter is pressed and the typed text
// matches nothing in `options`, this is called with the typed text instead of
// leaving the field stuck — lets a caller type a brand-new value (e.g. a
// supplier name) and have it created inline, no separate "+ New" click needed.
const Combobox = React.forwardRef(({
  options, // [{ value, label }]
  value = '',
  onChange,
  onKeyDown,
  onCreateNew,
  placeholder = 'Select…',
  disabled = false,
  className = '',
  required = false,
  autoFocus = false,
}, forwardedRef) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(-1);
  // Tracks whether the user has explicitly moved the highlight (arrow keys)
  // since the list opened — until then, Enter means "use what I typed"
  // (exact match, sole filtered match, or create-new), not "take whatever
  // happens to be highlighted", since the highlight while just typing is
  // incidental, not a deliberate choice.
  const navigatedRef = useRef(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  // The option list is portaled to <body> and positioned with `fixed`
  // coordinates instead of being an absolutely-positioned child here — many
  // call sites (Step 3's variant/size table, any scrollable card) wrap this
  // in an `overflow-x-auto`/`overflow-y-auto` container, which clips an
  // absolutely-positioned dropdown no matter how high its z-index is set.
  // Escaping to <body> sidesteps every such ancestor at once.
  const [menuRect, setMenuRect] = useState(null);
  const menuRef = useRef(null);
  // Callers that need to focus this control imperatively (e.g. once it stops
  // being disabled, when native autoFocus can't retroactively apply) go
  // through a forwarded ref onto the same button inputRef already tracks.
  const setButtonRef = (el) => {
    inputRef.current = el;
    if (typeof forwardedRef === 'function') forwardedRef(el);
    else if (forwardedRef) forwardedRef.current = el;
  };

  const selected = options.find((o) => o.value === value) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Close + reset the typed filter whenever focus leaves the whole control.
  // The option list is portaled to <body> (see menuRect below), so "outside"
  // has to check both the trigger's own subtree AND the portaled menu —
  // otherwise clicking an option would register as an outside click and
  // close the list a tick before that option's own onClick ever runs.
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false); setQuery('');
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  // Compute the portaled menu's screen position from the trigger button's
  // own box whenever the list opens, and keep it glued to the trigger while
  // scrolling/resizing (capture:true so it catches scroll on any ancestor
  // scroll container, not just window).
  useLayoutEffect(() => {
    if (!open) { setMenuRect(null); return; }
    const update = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMenuRect({ top: r.bottom, left: r.left, width: r.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  // `initialQuery`: when opening because the user just typed a printable
  // character (not via click/Enter/arrow), that character needs to survive
  // into the freshly-opened list instead of being wiped by the reset below —
  // both setState calls land in the same batch, so this must be the one
  // source of truth for the query on open, not two competing setQuery calls.
  const openList = (initialQuery = '') => {
    if (disabled) return;
    setOpen(true);
    setQuery(initialQuery);
    navigatedRef.current = false;
    setHighlightIdx(initialQuery ? 0 : Math.max(0, options.findIndex((o) => o.value === value)));
  };

  const pick = (opt) => {
    onChange?.(opt.value);
    setOpen(false);
    setQuery('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (!open) {
      // Any typing, Enter, Space, or an arrow key opens the list instead of
      // silently doing nothing — that's the whole fix: previously Enter was
      // captured by the page's Enter-nav chain before the list ever opened.
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openList();
        return;
      }
      if (e.key.length === 1 && e.key !== ' ') {
        e.preventDefault();
        openList(e.key);
        return;
      }
      return; // Tab, Escape, etc. with the list closed — let it bubble/pass through
    }

    if (e.key === 'ArrowDown') { e.preventDefault(); navigatedRef.current = true; setHighlightIdx((i) => Math.min(filtered.length - 1, i + 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); navigatedRef.current = true; setHighlightIdx((i) => Math.max(0, i - 1)); return; }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setQuery(''); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const typed = query.trim();
      const exact = typed && options.find((o) => o.label.toLowerCase() === typed.toLowerCase());
      // Not deliberately arrowed to a choice, and what's typed doesn't
      // exactly match an existing option — offer to create it instead of
      // silently picking whatever happened to be first/highlighted.
      if (typed && !exact && !navigatedRef.current && onCreateNew) {
        setOpen(false); setQuery('');
        onCreateNew(typed);
        // Creation is async (an API call), but the field this jumps to is
        // already in the DOM either way — advance now so a keyboard-only
        // flow (type name → Enter → next field) doesn't stall on the network.
        onKeyDown?.(e);
        return;
      }
      if (filtered.length === 0) { setOpen(false); setQuery(''); onKeyDown?.(e); return; }
      pick(exact || filtered[highlightIdx >= 0 ? highlightIdx : 0]);
      // Let the same keypress continue the page's Enter-nav chain once the
      // choice is committed — matches how a native <select> Enter used to.
      onKeyDown?.(e);
      return;
    }
    if (e.key === 'Backspace') { setQuery((q) => q.slice(0, -1)); return; }
    if (e.key.length === 1 && e.key !== ' ') { setQuery((q) => q + e.key); return; }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        ref={setButtonRef}
        disabled={disabled}
        data-enter-target
        autoFocus={autoFocus}
        onClick={() => (open ? (setOpen(false), setQuery('')) : openList())}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
      >
        <span className={cn('truncate text-left', !selected && 'text-muted-foreground')}>
          {open && query ? query : (selected ? selected.label : (required ? placeholder : `${placeholder} (none)`))}
        </span>
        <ChevronDown size={14} className="shrink-0 ml-2 text-gray-400" />
      </button>

      {open && menuRect && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 bg-white border rounded-lg shadow-lg overflow-hidden max-h-56 overflow-y-auto"
          style={{ top: menuRect.top + 4, left: menuRect.left, width: Math.max(menuRect.width, 160) }}
        >
          {!required && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick({ value: '', label: '' })}
              className={cn('w-full text-left px-3 py-2 text-sm text-gray-400', highlightIdx === -1 && 'bg-blue-50')}
            >
              {placeholder}
            </button>
          )}
          {filtered.length === 0 && !onCreateNew && (
            <div className="px-3 py-2 text-sm text-gray-400">No matches</div>
          )}
          {query.trim() && onCreateNew && !options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase()) && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { const v = query.trim(); setOpen(false); setQuery(''); onCreateNew(v); }}
              className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 font-medium"
            >
              + Create "{query.trim()}"
            </button>
          )}
          {filtered.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(opt)}
              onMouseEnter={() => setHighlightIdx(i)}
              className={cn(
                'w-full text-left px-3 py-2 text-sm',
                highlightIdx === i ? 'bg-blue-50 text-blue-800' : 'hover:bg-gray-50',
                opt.value === value && 'font-medium'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
});
Combobox.displayName = 'Combobox';

export default Combobox;
