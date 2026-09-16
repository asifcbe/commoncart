import React from 'react';
import Input from './ui/Input';
import Combobox from './ui/Combobox';
import Button from './ui/Button';

// Category + sub-category pickers driven by the managed catalog only —
// Settings → Categories is the sole place a category/sub-category may be
// created (user requirement: staff must not be able to type a new one into a
// Product/Purchase form). Typing still filters the dropdown to matching
// existing categories, but there is no "+ New" affordance and no
// Combobox onCreateNew here.
//
//   <CategoryFields
//     catalog={catalog}
//     category={cat} subCategory={sub}
//     onCategoryChange={setCat} onSubCategoryChange={setSub}
//   />
// Changing the category clears the sub-category.
export default function CategoryFields({
  catalog = [],
  category = '',
  subCategory = '',
  onCategoryChange,
  onSubCategoryChange,
  required = false,
  labelClass = 'text-sm font-medium text-gray-700 block mb-1',
  inputClass = '',
  onKeyDown,
}) {
  const knownCat = catalog.some((c) => c.name === category);
  // A category value that's set but no longer in the catalog (e.g. renamed
  // or removed in Settings since this product/purchase was created) — shown
  // read-only with a "Pick from list" escape hatch, same pattern as
  // ManagedSelect's legacy-value handling.
  const customCat = category && !knownCat ? category : '';

  const selectedCat = catalog.find((c) => c.name === category);
  const subs = selectedCat?.subCategories || [];
  const knownSub = subs.includes(subCategory);
  const customSub = subCategory && !knownSub ? subCategory : '';

  const setCategory = (val) => { onCategoryChange?.(val); onSubCategoryChange?.(''); };

  return (
    <>
      <div>
        <label className={labelClass}>Category {required ? '*' : ''}</label>
        {customCat ? (
          <div className="flex gap-2">
            <Input value={customCat} readOnly className={`flex-1 ${inputClass}`} />
            <Button type="button" variant="outline" size="sm" onClick={() => setCategory('')}>
              Pick
            </Button>
          </div>
        ) : (
          <Combobox
            options={catalog.map((c) => ({ value: c.name, label: c.name }))}
            value={category} onChange={setCategory} onKeyDown={onKeyDown} required={required}
            placeholder="Select a category…" className={inputClass}
          />
        )}
      </div>
      <div>
        <label className={labelClass}>Sub-category</label>
        {customSub ? (
          <div className="flex gap-2">
            <Input value={customSub} readOnly className={`flex-1 ${inputClass}`} />
            <Button type="button" variant="outline" size="sm" onClick={() => onSubCategoryChange?.('')}>
              Pick
            </Button>
          </div>
        ) : (
          <Combobox
            options={subs.map((s) => ({ value: s, label: s }))}
            value={subCategory} onChange={(v) => onSubCategoryChange?.(v)} onKeyDown={onKeyDown} disabled={!category}
            placeholder={category ? 'None' : 'Select a category first'} className={inputClass}
          />
        )}
      </div>
    </>
  );
}
