import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import useShopStore from '../store/useShopStore';
import ProductCard from '../components/ui/ProductCard';
import Spinner from '../components/ui/Spinner';
import shopConfig from '../config/shop.config';
import { applyMeta } from '../utils/theme';

const sortOptions = [
  { value: '-createdAt', label: 'Newest' },
  { value: 'price', label: 'Price: Low to High' },
  { value: '-price', label: 'Price: High to Low' },
  { value: 'name', label: 'Name A–Z' },
];

export default function ProductListing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { products, categories, subCategories, variants, sizes, total, pages, page, loading, fetchProducts, setFilter, setPage, filters } = useShopStore();

  const urlSearch = searchParams.get('search') || '';
  const urlCategory = searchParams.get('category') || '';
  const urlSubCategory = searchParams.get('subCategory') || '';
  const urlColor = searchParams.get('color') || '';
  const urlSize = searchParams.get('size') || '';

  useEffect(() => {
    applyMeta('Shop');
    if (urlSearch) setFilter('search', urlSearch);
    if (urlCategory) setFilter('category', urlCategory);
    setFilter('subCategory', urlSubCategory); // also clears it when removed from URL
    setFilter('color', urlColor);
    setFilter('size', urlSize);
  }, [urlSearch, urlCategory, urlSubCategory, urlColor, urlSize]);

  useEffect(() => {
    fetchProducts({ search: filters.search, category: filters.category, subCategory: filters.subCategory, color: filters.color, size: filters.size, sort: filters.sort, page });
  }, [filters, page]);

  // Update one filter + its URL param, resetting to page 1.
  const updateParam = (key, value, alsoClear = []) => {
    setFilter(key, value);
    alsoClear.forEach((k) => setFilter(k, ''));
    setPage(1);
    const p = new URLSearchParams(searchParams);
    if (value) p.set(key, value); else p.delete(key);
    alsoClear.forEach((k) => p.delete(k));
    setSearchParams(p);
  };

  const handleCategory = (cat) => updateParam('category', cat, ['subCategory']); // sub-category only applies within a category
  const handleSubCategory = (sub) => updateParam('subCategory', sub);
  const handleColor = (c) => updateParam('color', c);
  const handleSize = (s) => updateParam('size', s);

  const handleSort = (sort) => {
    setFilter('sort', sort);
    setPage(1);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {filters.search
              ? `Search: "${filters.search}"`
              : filters.subCategory
                ? `${filters.category} · ${filters.subCategory}`
                : filters.category || 'All Products'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">{total} product{total !== 1 ? 's' : ''}</p>
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-gray-400" />
          <select
            value={filters.sort}
            onChange={(e) => handleSort(e.target.value)}
            className="input h-9 text-sm w-44"
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Sidebar filters */}
        <aside className="hidden md:block w-52 flex-shrink-0">
          <div className="card p-4 sticky top-28">
            <h3 className="font-semibold text-sm text-gray-700 mb-3">Categories</h3>
            <ul className="space-y-1">
              <li>
                <button
                  onClick={() => handleCategory('')}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${!filters.category ? 'font-semibold text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                  style={!filters.category ? { background: 'var(--color-primary)' } : {}}
                >
                  All
                </button>
              </li>
              {categories.map((c) => (
                <li key={c}>
                  <button
                    onClick={() => handleCategory(c)}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${filters.category === c ? 'font-semibold text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                    style={filters.category === c ? { background: 'var(--color-primary)' } : {}}
                  >
                    {c}
                  </button>
                </li>
              ))}
            </ul>

            {/* Sub-categories — scoped to the selected category (or all when none) */}
            {subCategories.length > 0 && (
              <>
                <h3 className="font-semibold text-sm text-gray-700 mb-3 mt-6">Sub-categories</h3>
                <ul className="space-y-1">
                  <li>
                    <button
                      onClick={() => handleSubCategory('')}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${!filters.subCategory ? 'font-semibold text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                      style={!filters.subCategory ? { background: 'var(--color-primary)' } : {}}
                    >
                      All
                    </button>
                  </li>
                  {subCategories.map((s) => (
                    <li key={s}>
                      <button
                        onClick={() => handleSubCategory(s)}
                        className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${filters.subCategory === s ? 'font-semibold text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                        style={filters.subCategory === s ? { background: 'var(--color-primary)' } : {}}
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Variant filter */}
            {variants.length > 0 && (
              <>
                <h3 className="font-semibold text-sm text-gray-700 mb-3 mt-6">Variant</h3>
                <ul className="space-y-1">
                  <li>
                    <button
                      onClick={() => handleColor('')}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${!filters.color ? 'font-semibold text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                      style={!filters.color ? { background: 'var(--color-primary)' } : {}}
                    >
                      All
                    </button>
                  </li>
                  {variants.map((v) => (
                    <li key={v}>
                      <button
                        onClick={() => handleColor(v)}
                        className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${filters.color === v ? 'font-semibold text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                        style={filters.color === v ? { background: 'var(--color-primary)' } : {}}
                      >
                        {v}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Size filter */}
            {sizes.length > 0 && (
              <>
                <h3 className="font-semibold text-sm text-gray-700 mb-3 mt-6">Size</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleSize('')}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${!filters.size ? 'text-white border-transparent' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    style={!filters.size ? { background: 'var(--color-primary)' } : {}}
                  >
                    All
                  </button>
                  {sizes.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSize(s)}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${filters.size === s ? 'text-white border-transparent' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                      style={filters.size === s ? { background: 'var(--color-primary)' } : {}}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </aside>

        {/* Product grid */}
        <div className="flex-1">
          {loading ? (
            <div className="flex justify-center py-20"><Spinner size="lg" /></div>
          ) : products.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <p className="text-lg font-medium">No products found</p>
              <p className="text-sm mt-1">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
              {products.map((p) => <ProductCard key={p._id} product={p} />)}
            </div>
          )}

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-10">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="flex items-center gap-1 px-4 py-2 rounded-lg border text-sm font-medium disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <span className="text-sm text-gray-600">Page {page} of {pages}</span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page === pages}
                className="flex items-center gap-1 px-4 py-2 rounded-lg border text-sm font-medium disabled:opacity-40 hover:bg-gray-50"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
