import React from 'react';
import Input from './ui/Input';
import Combobox from './ui/Combobox';
import Button from './ui/Button';

// A single dropdown driven by a managed list of strings (Settings → Sizes is
// the only place new values may be added — see CLAUDE.md/user requirement).
// Typing still filters/narrows the list (Combobox with no onCreateNew), but
// pressing Enter on a value that isn't in `options` selects nothing — there
// is no way to add a new size/variant from a Product or Purchase form. If the
// current `value` is already set to something outside `options` (e.g. an
// older purchase's now-unlisted color, from before this lockdown), that's
// shown as read-only text with a "Pick from list" escape hatch — mousable
// only because there's nothing meaningful to type there.
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
          onKeyDown={onKeyDown}
          required={required}
          placeholder={placeholder}
          className={inputClass}
        />
      )}
    </div>
  );
}
