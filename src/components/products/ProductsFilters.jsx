import React from 'react';
import { Search, RotateCw, X } from 'lucide-react';
import { SORT_PRESETS } from '../../utils/productUtils';

const ProductsFilters = React.memo(({
    searchTerm,
    onSearchChange,
    categoryFilter,
    onCategoryFilterChange,
    warehouseFilter,
    onWarehouseFilterChange,
    stockFilter,
    onStockFilterChange,
    sortPreset,
    onSortPresetChange,
    categories,
    warehouses = [],
    refreshing,
    searchLoading,
    onRefresh
}) => (
    <section className="products-search-bar">
        <div className="products-search-wrapper">
            <span className="products-search-emoji">⌕</span>
            <input
                type="text"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="ابحث بالاسم، SKU، أو الباركود..."
            />
        </div>

        <div className="products-filter-group">
            <select value={categoryFilter} onChange={(e) => onCategoryFilterChange(e.target.value)}>
                <option value="">كل الفئات</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <select value={warehouseFilter} onChange={(e) => onWarehouseFilterChange(e.target.value)}>
                <option value="">كل المخازن</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.icon || '🏭'} {w.name}</option>)}
            </select>

            <select value={stockFilter} onChange={(e) => onStockFilterChange(e.target.value)}>
                <option value="all">كل حالات المخزون</option>
                <option value="available">متاح حالياً</option>
                <option value="low">منخفض (تحت الحد)</option>
                <option value="out">نافد من المخزن</option>
            </select>

            <select value={sortPreset} onChange={(e) => onSortPresetChange(e.target.value)}>
                {SORT_PRESETS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>

            <button 
                type="button" 
                className="products-filter-btn" 
                onClick={onRefresh} 
                title="تحديث البيانات"
                disabled={refreshing || searchLoading}
            >
                <RotateCw size={18} className={refreshing || searchLoading ? 'spin' : ''} />
            </button>
        </div>
    </section>
));

ProductsFilters.displayName = 'ProductsFilters';
export default ProductsFilters;

