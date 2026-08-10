import React from 'react';
import { SECTIONS } from '../config/permissions';

// Editable grid of section checkboxes + the "view cost price" toggle.
// `value` = { sections: string[], viewCostPrice: bool }; `onChange` gets the next value.
export default function PermissionEditor({ value, onChange }) {
  const sections = value?.sections || [];
  const viewCostPrice = !!value?.viewCostPrice;
  const canManage = !!value?.canManage;

  const toggleSection = (key) => {
    const next = sections.includes(key)
      ? sections.filter((s) => s !== key)
      : [...sections, key];
    onChange({ sections: next, viewCostPrice, canManage });
  };

  const setAll = (on) => onChange({ sections: on ? SECTIONS.map((s) => s.key) : [], viewCostPrice, canManage });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Sections this staff can access</label>
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={() => setAll(true)} className="text-blue-600 hover:underline">Select all</button>
          <span className="text-gray-300">·</span>
          <button type="button" onClick={() => setAll(false)} className="text-blue-600 hover:underline">Clear</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {SECTIONS.map((s) => (
          <label key={s.key} className="flex items-center gap-2 text-sm cursor-pointer border rounded-lg px-3 py-2 hover:bg-gray-50">
            <input
              type="checkbox"
              checked={sections.includes(s.key)}
              onChange={() => toggleSection(s.key)}
              className="rounded"
            />
            {s.label}
          </label>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer border rounded-lg px-3 py-2 bg-amber-50 border-amber-200">
        <input
          type="checkbox"
          checked={viewCostPrice}
          onChange={(e) => onChange({ sections, viewCostPrice: e.target.checked, canManage })}
          className="rounded"
        />
        <span>Allow viewing <strong>cost price</strong> &amp; profit figures</span>
      </label>
      <label className="flex items-center gap-2 text-sm cursor-pointer border rounded-lg px-3 py-2 bg-amber-50 border-amber-200">
        <input
          type="checkbox"
          checked={canManage}
          onChange={(e) => onChange({ sections, viewCostPrice, canManage: e.target.checked })}
          className="rounded"
        />
        <span>Allow <strong>editing &amp; deleting</strong> records (products, purchases, sales)</span>
      </label>
    </div>
  );
}
