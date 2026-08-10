import React, { useState } from 'react';
import Input from './ui/Input';
import Select from './ui/Select';
import Button from './ui/Button';

// A single dropdown driven by a managed list of strings, with an inline
// "+ Add new…" option that reveals a free-text input (so users aren't blocked
// when a value isn't in the list yet). Mirrors CategoryFields' UX.
//
//   <ManagedSelect label="Variant" options={variants} value={color}
//                  onChange={setColor} placeholder="Select a variant…" />
const ADD_NEW = '__add_new__';

export default function ManagedSelect({
  label,
  options = [],
  value = '',
  onChange,
  placeholder = 'Select…',
  newPlaceholder = 'New value',
  required = false,
  labelClass = 'text-sm font-medium text-gray-700 block mb-1',
  inputClass = '',
}) {
  const known = options.includes(value);
  const [mode, setMode] = useState(() => value && !known ? 'custom' : 'list');

  // Derive display mode from current value + options each render:
  // - value is in the list → always show the select (list mode)
  // - value is non-empty and NOT in the list → always show the text input (custom mode)
  // - value is empty → respect internal mode state (so "Add new…" still works)
  const effectiveMode = known ? 'list' : (value ? 'custom' : mode);

  const onSelect = (e) => {
    const v = e.target.value;
    if (v === ADD_NEW) { setMode('custom'); onChange?.(''); return; }
    setMode('list');
    onChange?.(v);
  };

  return (
    <div>
      {label && <label className={labelClass}>{label}{required ? ' *' : ''}</label>}
      {effectiveMode === 'list' ? (
        <Select value={value} onChange={onSelect} required={required} className={inputClass}>
          <option value="">{required ? placeholder : `${placeholder} (none)`}</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
          <option value={ADD_NEW}>+ Add new…</option>
        </Select>
      ) : (
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            required={required}
            autoFocus
            placeholder={newPlaceholder}
            className={inputClass}
          />
          {options.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={() => { setMode('list'); onChange?.(''); }}>
              Pick
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
