import React, { useState } from 'react';
import Input from './ui/Input';
import Select from './ui/Select';
import Button from './ui/Button';

// Category + sub-category pickers driven by the managed catalog.
// Selecting "+ Add new…" reveals a free-text input so admins aren't blocked,
// but the managed list is the primary source of choices.
//
// Controlled via value/onChange props so it works with any parent state shape:
//   <CategoryFields
//     catalog={catalog}
//     category={cat} subCategory={sub}
//     onCategoryChange={setCat} onSubCategoryChange={setSub}
//   />
// Changing the category clears the sub-category.
const ADD_NEW = '__add_new__';

export default function CategoryFields({
  catalog = [],
  category = '',
  subCategory = '',
  onCategoryChange,
  onSubCategoryChange,
  required = false,
  labelClass = 'text-sm font-medium text-gray-700 block mb-1',
  inputClass = '',
}) {
  // A free-typed category (not in the catalog) → show the text input directly.
  const knownCat = catalog.some((c) => c.name === category);
  const [catMode, setCatMode] = useState(category && !knownCat ? 'custom' : 'list');

  const selectedCat = catalog.find((c) => c.name === category);
  const subs = selectedCat?.subCategories || [];
  const knownSub = subs.includes(subCategory);
  const [subMode, setSubMode] = useState(subCategory && !knownSub ? 'custom' : 'list');

  const setCategory = (val) => { onCategoryChange?.(val); onSubCategoryChange?.(''); };

  const onCatSelect = (e) => {
    const v = e.target.value;
    if (v === ADD_NEW) { setCatMode('custom'); setCategory(''); return; }
    setCatMode('list');
    setSubMode('list');
    setCategory(v); // clears sub via setCategory
  };

  const onSubSelect = (e) => {
    const v = e.target.value;
    if (v === ADD_NEW) { setSubMode('custom'); onSubCategoryChange?.(''); return; }
    setSubMode('list');
    onSubCategoryChange?.(v);
  };

  return (
    <>
      <div>
        <label className={labelClass}>Category {required ? '*' : ''}</label>
        {catMode === 'list' ? (
          <Select value={category} onChange={onCatSelect} required={required} className={inputClass}>
            <option value="" disabled={required}>Select a category…</option>
            {catalog.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            <option value={ADD_NEW}>+ Add new category…</option>
          </Select>
        ) : (
          <div className="flex gap-2">
            <Input
              value={category}
              onChange={(e) => onCategoryChange?.(e.target.value)}
              required={required}
              autoFocus
              placeholder="New category name"
              className={inputClass}
            />
            {catalog.length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => { setCatMode('list'); setCategory(''); }}>
                Pick
              </Button>
            )}
          </div>
        )}
      </div>
      <div>
        <label className={labelClass}>Sub-category</label>
        {subMode === 'list' && (subs.length > 0 || !category) ? (
          <Select value={subCategory} onChange={onSubSelect} disabled={!category && catMode === 'list'} className={inputClass}>
            <option value="">{category ? 'None' : 'Select a category first'}</option>
            {subs.map((s) => <option key={s} value={s}>{s}</option>)}
            {category && <option value={ADD_NEW}>+ Add new sub-category…</option>}
          </Select>
        ) : (
          <div className="flex gap-2">
            <Input
              value={subCategory}
              onChange={(e) => onSubCategoryChange?.(e.target.value)}
              placeholder="Sub-category name"
              className={inputClass}
            />
            {subs.length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => { setSubMode('list'); onSubCategoryChange?.(''); }}>
                Pick
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
