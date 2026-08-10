import { create } from 'zustand';

// Kiosk lock for the POS screen — confines navigation to /pos until the
// current user re-enters their password. Persisted to localStorage (not just
// component state) so refreshing or closing/reopening the tab doesn't lift
// the lock; only a verified unlock does.
const usePosLockStore = create((set) => ({
  locked: localStorage.getItem('cc_pos_locked') === 'true',

  lock: () => {
    localStorage.setItem('cc_pos_locked', 'true');
    set({ locked: true });
  },

  unlock: () => {
    localStorage.removeItem('cc_pos_locked');
    set({ locked: false });
  },
}));

export default usePosLockStore;
