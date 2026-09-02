// Enter-to-advance keyboard navigation — used by POS and Purchase forms so a
// full sale/purchase can be entered without touching the mouse. Enter in any
// field jumps to the next focusable field in DOM order inside a container;
// leaving a field blank just skips it (nothing to submit there), it doesn't
// block the jump. Reaching the end clicks the container's submit button.
const FOCUSABLE = 'input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), button[data-enter-target]:not([disabled])';

export function focusNextInContainer(containerEl, currentEl) {
  if (!containerEl) return;
  const nodes = Array.from(containerEl.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
  const idx = nodes.indexOf(currentEl);
  if (idx === -1) return;
  const next = nodes[idx + 1];
  if (next) {
    next.focus();
    if (next.tagName === 'INPUT' || next.tagName === 'TEXTAREA') next.select?.();
  } else {
    containerEl.querySelector('[data-enter-submit]')?.click();
  }
}

// Like focusNextInContainer, but treats every FOCUSABLE node inside `groupEl`
// as one unit — jumps to the first field that comes *after* the whole group
// closes in the DOM, regardless of which node inside the group is currently
// focused. For a button *group* that represents a single choice (payment
// method, toggle buttons, …), where Enter must move past the group entirely
// instead of cycling to the group's next button.
export function focusNextAfterGroup(containerEl, groupEl) {
  if (!containerEl || !groupEl) return;
  const nodes = Array.from(containerEl.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
  const next = nodes.find((el) => !groupEl.contains(el) &&
    (el.compareDocumentPosition(groupEl) & Node.DOCUMENT_POSITION_PRECEDING));
  if (next) {
    next.focus();
    if (next.tagName === 'INPUT' || next.tagName === 'TEXTAREA') next.select?.();
  } else {
    containerEl.querySelector('[data-enter-submit]')?.click();
  }
}

// Focuses the first focusable field in a container — for a step/section that
// just became visible, so the keyboard-only flow can carry straight on
// without a click to "wake up" the new step (mirrors POS's focusScan()).
export function focusFirstInContainer(containerEl) {
  if (!containerEl) return;
  const first = Array.from(containerEl.querySelectorAll(FOCUSABLE)).find((el) => el.offsetParent !== null);
  if (first) {
    first.focus();
    if (first.tagName === 'INPUT' || first.tagName === 'TEXTAREA') first.select?.();
  }
}

// Keydown handler factory: pass the container ref (a DOM node or a ref object)
// and get back an onKeyDown handler to attach to every field in that container.
export function makeEnterNav(containerRef) {
  return (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.tagName === 'TEXTAREA' && !e.ctrlKey && !e.metaKey) return; // allow newlines
    e.preventDefault();
    const container = containerRef?.current || containerRef;
    const currentEl = e.target;
    // Selecting a value here (e.g. Category) can itself change what the
    // *next* field looks like in the same keystroke — a Sub-category field
    // going from disabled to enabled, a draft row being promoted to a real
    // row elsewhere in the table. That DOM update from the onChange this
    // keydown triggered may not be committed yet when this handler returns,
    // so scanning for the next field synchronously here can still see the
    // stale, disabled/absent version and skip over it. requestAnimationFrame
    // runs after the browser has painted the post-update DOM — reliable
    // regardless of exactly when React flushes the state update.
    requestAnimationFrame(() => focusNextInContainer(container, currentEl));
  };
}

// Like makeEnterNav, but for a button *group* (see focusNextAfterGroup) — pass
// both the outer container ref and the group's own ref; Enter on any button
// in the group jumps past the group entirely rather than to its next button.
export function makeEnterNavPastGroup(containerRef, groupRef) {
  return (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const container = containerRef?.current || containerRef;
    const group = groupRef?.current || groupRef;
    requestAnimationFrame(() => focusNextAfterGroup(container, group));
  };
}
