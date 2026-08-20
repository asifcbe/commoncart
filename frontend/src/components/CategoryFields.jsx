import React, { useState } from 'react';
import Input from './ui/Input';
import Select from './ui/Select';
import Button from './ui/Button';
import { Plus, X } from 'lucide-react';

// Category + sub-category pickers driven by the managed catalog, with a
// dedicated "+ New" button next to the dropdown (same pattern as the
// Supplier quick-create field) that opens an inline text panel instead of
// burying "add new" inside the dropdown's option list.
//
// A typed category/sub-category isn't saved to the catalog immediately (that
// needs adminOnly access) — it's just held as plain text here and gets
// registered into the managed catalog automatically when the parent form
// (Purchase/Product) is submitted, same as before.
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
}) {
  const knownCat = catalog.some((c) => c.name === category);
  // A category value that's set but not (yet) in the catalog — a pending new
  // one, entered via the panel below and awaiting submit-time registration.
  const customCat = category && !knownCat ? category : '';
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatDraft, setNewCatDraft] = useState('');

  const selectedCat = catalog.find((c) => c.name === category);
  const subs = selectedCat?.subCategories || [];
  const knownSub = subs.includes(subCategory);
  const customSub = subCategory && !knownSub ? subCategory : '';
  const [showNewSub, setShowNewSub] = useState(false);
  const [newSubDraft, setNewSubDraft] = useState('');

  const setCategory = (val) => { onCategoryChange?.(val); onSubCategoryChange?.(''); };

  const onCatSelect = (e) => setCategory(e.target.value);

  const openNewCat = () => { setShowNewCat(true); setNewCatDraft(''); };
  const confirmNewCat = () => {
    const v = newCatDraft.trim();
    if (!v) return;
    setCategory(v);
    setShowNewCat(false);
  };

  const onSubSelect = (e) => onSubCategoryChange?.(e.target.value);

  const openNewSub = () => { setShowNewSub(true); setNewSubDraft(''); };
  const confirmNewSub = () => {
    const v = newSubDraft.trim();
    if (!v) return;
    onSubCategoryChange?.(v);
    setShowNewSub(false);
  };

  return (
    <>
      <div>
        <label className={labelClass}>Category {required ? '*' : ''}</label>
        {customCat ? (
          <div className="flex items-center gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
            <span className="flex-1 truncate">{customCat} <span className="text-blue-500 text-xs">(new)</span></span>
            <button type="button" onClick={() => setCategory('')} className="text-gray-400 hover:text-red-500" title="Clear">
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Select value={category} onChange={onCatSelect} required={required} className={`flex-1 ${inputClass}`}>
              <option value="" disabled={required}>Select a category…</option>
              {catalog.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </Select>
            <Button type="button" size="sm" variant="outline" onClick={openNewCat}>
              <Plus size={13} className="mr-1" /> New
            </Button>
          </div>
        )}
        {showNewCat && (
          <div className="border rounded-lg p-3 bg-blue-50 space-y-2 mt-2">
            <p className="text-xs font-medium text-blue-700">New category</p>
            <div className="flex gap-2">
              <Input
                value={newCatDraft}
                onChange={(e) => setNewCatDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmNewCat(); } }}
                autoFocus
                placeholder="New category name"
                className="text-sm flex-1"
              />
              <Button type="button" size="sm" variant="ghost" onClick={() => { setShowNewCat(false); setNewCatDraft(''); }}>Cancel</Button>
              <Button type="button" size="sm" onClick={confirmNewCat} disabled={!newCatDraft.trim()}>Use</Button>
            </div>
          </div>
        )}
      </div>
      <div>
        <label className={labelClass}>Sub-category</label>
        {customSub ? (
          <div className="flex items-center gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
            <span className="flex-1 truncate">{customSub} <span className="text-blue-500 text-xs">(new)</span></span>
            <button type="button" onClick={() => onSubCategoryChange?.('')} className="text-gray-400 hover:text-red-500" title="Clear">
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Select value={subCategory} onChange={onSubSelect} disabled={!category} className={`flex-1 ${inputClass}`}>
              <option value="">{category ? 'None' : 'Select a category first'}</option>
              {subs.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Button type="button" size="sm" variant="outline" onClick={openNewSub} disabled={!category}>
              <Plus size={13} className="mr-1" /> New
            </Button>
          </div>
        )}
        {showNewSub && (
          <div className="border rounded-lg p-3 bg-blue-50 space-y-2 mt-2">
            <p className="text-xs font-medium text-blue-700">New sub-category</p>
            <div className="flex gap-2">
              <Input
                value={newSubDraft}
                onChange={(e) => setNewSubDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmNewSub(); } }}
                autoFocus
                placeholder="New sub-category name"
                className="text-sm flex-1"
              />
              <Button type="button" size="sm" variant="ghost" onClick={() => { setShowNewSub(false); setNewSubDraft(''); }}>Cancel</Button>
              <Button type="button" size="sm" onClick={confirmNewSub} disabled={!newSubDraft.trim()}>Use</Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
