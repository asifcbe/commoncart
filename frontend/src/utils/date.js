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

// Local wall-clock time as 12-hour with AM/PM (e.g. "2:05 PM") — always 12h
// regardless of the browser/OS locale, which is what users here expect.
export function formatTime(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Same date formatting, plus the local time — replaces toLocaleString() call
// sites that show a date+time together. Time is always rendered 12-hour with
// AM/PM (see formatTime); only the date portion follows DISPLAY_CONFIG.
export function formatDateTime(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';

  const format = useDisplayConfigStore.getState().dateFormat;
  if (format === 'SYSTEM') return `${d.toLocaleDateString()}, ${formatTime(d)}`;

  return `${formatDate(d)}, ${formatTime(d)}`;
}

// Local date as `YYYY-MM-DD` — the value an `<input type="date">` expects.
// Built from local getters (not toISOString) so it never shifts by TZ offset.
export function toDateInput(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Formats a Date as the local (system-clock) `YYYY-MM-DDTHH:mm` string a
// `<input type="datetime-local">` expects/returns. Using `.toISOString()` for
// this converts to UTC first, silently shifting the shown/saved time by the
// browser's timezone offset — this reads the Date's local getters instead, so
// the field always reflects the actual system time, not a UTC-shifted one.
export function toLocalDateTimeInput(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// Converts a `<input type="datetime-local">` value (a bare local wall-clock
// string like "2026-09-06T14:30", NO timezone) into a full ISO instant
// (`...Z`) representing that exact local moment in the USER's timezone.
//
// Why this matters: sending the bare string and letting the backend do
// `new Date(str)` parses it in the SERVER's timezone (usually UTC in
// production), so a user in IST picking 2:30 PM gets it stored as 2:30 PM UTC
// (= 8:00 PM IST). Building the Date from the parsed parts here uses the
// browser's own timezone, so `.toISOString()` yields the right absolute time
// no matter where the server runs. Returns undefined for empty/invalid input
// (so callers can omit the field and let the backend default to "now").
export function localDateTimeInputToISO(value) {
  if (!value) return undefined;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  const [, y, mo, da, h, mi, s] = m;
  const d = new Date(Number(y), Number(mo) - 1, Number(da), Number(h), Number(mi), Number(s || 0));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
