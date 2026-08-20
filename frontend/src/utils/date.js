import useDisplayConfigStore from '../store/useDisplayConfigStore';

const pad2 = (n) => String(n).padStart(2, '0');

// App-wide date formatter — reads the admin-configured DISPLAY_CONFIG.dateFormat
// (default 'DD/MM/YYYY') via the store, so every page and every printed/exported
// document renders dates the same way without threading the setting through props.
// `date` accepts anything `new Date()` accepts (ISO string, Date, timestamp).
// Returns '' for a missing/invalid date, same as the toLocale* calls it replaces.
export function formatDate(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';

  const format = useDisplayConfigStore.getState().dateFormat;
  if (format === 'SYSTEM') return d.toLocaleDateString();

  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Same date formatting, plus the local time — replaces toLocaleString() call
// sites that show a date+time together. Time formatting itself is left as the
// browser default (12h with AM/PM); only the date portion is reformatted.
export function formatDateTime(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';

  const format = useDisplayConfigStore.getState().dateFormat;
  if (format === 'SYSTEM') return d.toLocaleString();

  const time = d.toLocaleTimeString();
  return `${formatDate(d)}, ${time}`;
}
