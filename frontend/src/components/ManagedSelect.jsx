import React from 'react';
import Input from './ui/Input';
import Combobox from './ui/Combobox';
import Button from './ui/Button';

// A single dropdown driven by a managed list of strings. Typing a value that
// isn't in the list and pressing Enter adds and selects it immediately
// (Combobox's onCreateNew) — no separate "Add new" step, so a fully keyboard
// entry never needs the mouse. If the current `value` is already set to
// something outside `options` (e.g. an older purchase's now-unlisted color),
// that's shown as read-only text with a "Pick from list" escape hatch —
// mousable only because there's nothing meaningful to type there.
//
//   <ManagedSelect label="Variant" options={variants} value={color}
//                  onChange={setColor} placeholder="Select a variant…" />
export default function ManagedSelect({
  label,
  options = [],
  value = '',
  onChange,
  placeholder = 'Select…',
  required = false,
  labelClass = 'text-sm font-medium text-gray-700 block mb-1',
  inputClass = '',
  onKeyDown,
}) {
  const known = options.includes(value);
  const isLegacyValue = value && !known;

  const comboOptions = options.map((o) => ({ value: o, label: o }));

  return (
    <div>
      {label && <label className={labelClass}>{label}{required ? ' *' : ''}</label>}
      {isLegacyValue ? (
        <div className="flex gap-2">
          <Input value={value} readOnly className={inputClass} />
          <Button type="button" variant="outline" size="sm" onClick={() => onChange?.('')}>
            Pick
          </Button>
        </div>
      ) : (
        <Combobox
          options={comboOptions}
          value={value}
          onChange={(v) => onChange?.(v)}
          onCreateNew={(v) => onChange?.(v)}
          onKeyDown={onKeyDown}
          required={required}
          placeholder={placeholder}
          className={inputClass}
        />
      )}
    </div>
  );
}
