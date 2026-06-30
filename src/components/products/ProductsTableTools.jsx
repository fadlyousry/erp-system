import React, { useRef, useState, useEffect } from 'react';
import { Settings, ChevronDown, Check, Columns, Search, CheckSquare, Square, TrendingUp } from 'lucide-react';
import { GRID_COLUMNS } from '../../utils/productUtils';

const ProductsTableTools = React.memo(({
    allVisibleSelected,
    onToggleVisible,
    displayedCount,
    selectedCount,
    visibleColumnKeys,
    onToggleColumnVisibility,
    showSearchRow,
    onToggleSearchRow,
    onOpenPriceUpdate
}) => {
    const [showColumnMenu, setShowColumnMenu] = useState(false);
    const columnsMenuRef = useRef(null);

    useEffect(() => {
        const onClickOutside = (event) => {
            if (!columnsMenuRef.current) return;
            if (!columnsMenuRef.current.contains(event.target)) {
                setShowColumnMenu(false);
            }
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, []);

    return (
        <div className="products-table-tools">
            <button 
                type="button" 
                className={`tool-btn ${allVisibleSelected ? 'selected' : ''}`} 
                onClick={onToggleVisible}
                title={allVisibleSelected ? "إلغاء تحديد الكل" : "تحديد كل المنتجات الظاهرة"}
            >
                {allVisibleSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                <span>{allVisibleSelected ? "إلغاء الكل" : "تحديد الكل"}</span>
            </button>

            <div className="divider" />

            <div className="stats-group">
                <span className="stat-pill">الظاهر: <strong>{displayedCount}</strong></span>
                <span className={`stat-pill ${selectedCount > 0 ? 'active' : ''}`}>المحدد: <strong>{selectedCount}</strong></span>
            </div>

            <div className="divider" />

            <button 
                type="button" 
                className="tool-btn price-update-trigger-btn" 
                onClick={onOpenPriceUpdate}
                title="تحديث أسعار الأصناف جماعياً"
            >
                <TrendingUp size={16} />
                <span>تحديث الأسعار</span>
            </button>

            <div className="columns-control" ref={columnsMenuRef}>
                <button
                    type="button"
                    className={`products-btn products-btn-light columns-trigger ${showColumnMenu ? 'active' : ''}`}
                    onClick={() => setShowColumnMenu((prev) => !prev)}
                >
                    <Columns size={16} />
                    <span>تخصيص الأعمدة</span>
                    <ChevronDown size={14} className={`chevron ${showColumnMenu ? 'up' : ''}`} />
                </button>

                {showColumnMenu ? (
                    <div className="columns-menu fade-in">
                        <div className="menu-header">إعدادات العرض</div>
                        
                        <label className="column-option highlight">
                            <input
                                type="checkbox"
                                checked={showSearchRow}
                                onChange={() => {
                                    onToggleSearchRow();
                                    setShowColumnMenu(false);
                                }}
                            />
                            <Search size={14} />
                            <span style={{ flex: 1 }}>البحث المتقدم (الفلاتر)</span>
                            {showSearchRow && <Check size={14} className="check-icon" />}
                        </label>
                        
                        <div className="columns-menu-divider" />
                        
                        <div className="menu-section-title">الأعمدة الظاهرة</div>
                        
                        <div className="column-options-list">
                            {GRID_COLUMNS.filter((column) => !column.required).map((column) => {
                                const isVisible = visibleColumnKeys.includes(column.key);
                                return (
                                    <label key={column.key} className={`column-option ${isVisible ? 'active' : ''}`}>
                                        <input
                                            type="checkbox"
                                            checked={isVisible}
                                            onChange={() => onToggleColumnVisibility(column.key)}
                                        />
                                        <span style={{ flex: 1 }}>{column.label}</span>
                                        {isVisible && <Check size={14} className="check-icon" />}
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
});

ProductsTableTools.displayName = 'ProductsTableTools';
export default ProductsTableTools;

