import React, { useEffect, useMemo, useState, memo } from 'react';
import { FixedSizeList as List, areEqual } from 'react-window';

const ROW_HEIGHT = 56;
const MAX_LIST_HEIGHT = 560;

const useViewportHeight = () => {
    const getHeight = () => (
        typeof window === 'undefined' ? 900 : window.innerHeight || 900
    );
    const [height, setHeight] = useState(getHeight);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const handleResize = () => setHeight(getHeight());
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return height;
};

const COLUMN_SPECS = {
    id: { minWidth: 40 },
    name: { minWidth: 250 },
    type: { minWidth: 90 },
    phone: { minWidth: 110 },
    phone2: { minWidth: 110 },
    address: { minWidth: 150 },
    city: { minWidth: 100 },
    district: { minWidth: 100 },
    notes: { minWidth: 130 },
    creditLimit: { minWidth: 110 },
    balance: { minWidth: 100 },
    action_actions: { width: 170 }
};

const getVisibleColumnOrder = (visibleColumns) => {
    const order = [];
    if (visibleColumns.id) order.push('id');
    if (visibleColumns.name) order.push('name');
    if (visibleColumns.type) order.push('type');
    if (visibleColumns.phone) order.push('phone');
    if (visibleColumns.phone2) order.push('phone2');
    if (visibleColumns.address) order.push('address');
    if (visibleColumns.city) order.push('city');
    if (visibleColumns.district) order.push('district');
    if (visibleColumns.notes) order.push('notes');
    if (visibleColumns.creditLimit) order.push('creditLimit');
    if (visibleColumns.balance) order.push('balance');
    if (visibleColumns.actions) order.push('action_actions');
    return order;
};

const getCustomerTypeClass = (type) => {
    if (type === 'VIP') return 'customers-type-vip';
    if (type === 'تاجر جملة') return 'customers-type-wholesale';
    return 'customers-type-regular';
};

const getBalanceClass = (balance) => {
    if (balance > 0) return 'customers-balance-positive';
    if (balance < 0) return 'customers-balance-negative';
    return 'customers-balance-zero';
};

const SEARCH_HIGHLIGHT_STYLE = { backgroundColor: '#fbbf24', fontWeight: 'bold' };

const highlightMatch = (value, searchTerm) => {
    const text = String(value ?? '');
    const normalizedTerm = String(searchTerm ?? '').trim();

    if (!text || !normalizedTerm) return text;

    const lowerText = text.toLowerCase();
    const lowerTerm = normalizedTerm.toLowerCase();
    const termLength = normalizedTerm.length;

    if (!lowerText.includes(lowerTerm)) return text;

    const parts = [];
    let cursor = 0;
    let matchIndex = lowerText.indexOf(lowerTerm, cursor);

    while (matchIndex !== -1) {
        if (matchIndex > cursor) {
            parts.push(text.slice(cursor, matchIndex));
        }

        const end = matchIndex + termLength;
        parts.push(
            <span key={`h-${matchIndex}-${end}`} style={SEARCH_HIGHLIGHT_STYLE}>
                {text.slice(matchIndex, end)}
            </span>
        );

        cursor = end;
        matchIndex = lowerText.indexOf(lowerTerm, cursor);
    }

    if (cursor < text.length) {
        parts.push(text.slice(cursor));
    }

    return parts;
};

const VirtualizedCustomerRow = memo(function VirtualizedCustomerRow({ index, style, data }) {
    const {
        customers,
        visibleColumns,
        selectedIndex,
        overdueThreshold,
        highlightTerm,
        onShowLedger,
        onPayment,
        onEdit,
        onDelete
    } = data;
    const customer = customers[index];

    if (!customer) return null;

    const isSelected = selectedIndex === index;
    const lastPaymentDays = customer.lastPaymentDays || 0;
    const isOverdue = customer.isOverdue !== undefined
        ? customer.isOverdue
        : lastPaymentDays > overdueThreshold;
    const balance = customer.balance || 0;

    const rowClassName = [
        'customers-row',
        index % 2 === 0 ? 'is-even' : 'is-odd',
        isSelected ? 'is-selected' : ''
    ].filter(Boolean).join(' ');

    return (
        <div className={rowClassName} style={style} role="row">
            {visibleColumns.id && <div className="customers-cell" role="cell">{customer.id}</div>}
            {visibleColumns.name && (
                <div className="customers-cell customers-name-cell" role="cell">
                    <div className="customers-name-content">
                        {isOverdue && (
                            <span
                                className="customers-overdue-dot"
                                data-tooltip={`⚠ لم يدفع منذ ${lastPaymentDays} يوم`}
                            />
                        )}
                        <span>{highlightMatch(customer.name, highlightTerm)}</span>
                    </div>
                </div>
            )}
            {visibleColumns.type && (
                <div className="customers-cell" role="cell">
                    <span className={`customers-type-badge ${getCustomerTypeClass(customer.customerType)}`}>
                        {customer.customerType}
                    </span>
                </div>
            )}
            {visibleColumns.phone && <div className="customers-cell customers-muted" role="cell">{customer.phone || '-'}</div>}
            {visibleColumns.phone2 && <div className="customers-cell customers-muted" role="cell">{customer.phone2 || '-'}</div>}
            {visibleColumns.address && <div className="customers-cell customers-muted customers-ellipsis" role="cell">{customer.address || '-'}</div>}
            {visibleColumns.city && <div className="customers-cell customers-muted" role="cell">{customer.city || '-'}</div>}
            {visibleColumns.district && <div className="customers-cell customers-muted" role="cell">{customer.district || '-'}</div>}
            {visibleColumns.notes && <div className="customers-cell customers-muted customers-ellipsis" role="cell">{customer.notes || '-'}</div>}
            {visibleColumns.creditLimit && (
                <div className="customers-cell customers-muted customers-bold" role="cell">
                    {(customer.creditLimit || 0).toFixed(2)}
                </div>
            )}
            {visibleColumns.balance && (
                <div className="customers-cell" role="cell">
                    <span className={`customers-balance ${getBalanceClass(balance)}`}>
                        {balance.toFixed(2)}
                    </span>
                </div>
            )}
            {visibleColumns.actions && (
                <div className="customers-cell customers-action-cell" role="cell">
                    <div className="customers-actions-group">
                        <button
                            type="button"
                            onClick={() => onShowLedger(customer.id)}
                            title={'\u0639\u0631\u0636 \u0643\u0634\u0641 \u0627\u0644\u062D\u0633\u0627\u0628'}
                            className="customers-action-button customers-action-view"
                        >
                            ▤
                        </button>
                        <button
                            type="button"
                            onClick={() => onPayment(customer)}
                            title={'\u062A\u0633\u062C\u064A\u0644 \u062F\u0641\u0639\u0629'}
                            className="customers-action-button customers-action-payment"
                        >
                            ↓
                        </button>
                        <button
                            type="button"
                            onClick={() => onEdit(customer)}
                            title={'\u062A\u0639\u062F\u064A\u0644'}
                            className="customers-action-button customers-action-edit"
                        >
                            {'\u270E'}
                        </button>
                        <button
                            type="button"
                            onClick={() => onDelete(customer.id)}
                            title={'\u062D\u0630\u0641'}
                            className="customers-action-button customers-action-delete"
                        >
                            {'\u2716'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}, areEqual);

const CustomersTable = memo(function CustomersTable({
    customers,
    visibleColumns,
    showSearchRow,
    columnSearch,
    onColumnSearchChange,
    selectedIndex,
    overdueThreshold,
    highlightTerm,
    onShowLedger,
    onPayment,
    onEdit,
    onDelete,
    listRef,
    sortCol,
    sortDir,
    onSortChange
}) {
    const viewportHeight = useViewportHeight();
    const columnOrder = useMemo(() => getVisibleColumnOrder(visibleColumns), [visibleColumns]);

    const gridTemplateColumns = useMemo(() => {
        if (columnOrder.length === 0) return '1fr';
        return columnOrder.map((key) => {
            const spec = COLUMN_SPECS[key] || {};
            if (spec.width) return `${spec.width}px`;
            const minWidth = spec.minWidth || 120;
            return `minmax(${minWidth}px, 1fr)`;
        }).join(' ');
    }, [columnOrder]);

    const tableMinWidth = useMemo(() => {
        if (columnOrder.length === 0) return 300;
        return columnOrder.reduce((sum, key) => {
            const spec = COLUMN_SPECS[key] || {};
            return sum + (spec.width || spec.minWidth || 120);
        }, 0);
    }, [columnOrder]);

    const listHeight = useMemo(() => {
        if (customers.length === 0) return ROW_HEIGHT * 2;
        const compactMaxHeight = Math.max(300, Math.min(MAX_LIST_HEIGHT, viewportHeight - 360));
        return Math.min(compactMaxHeight, Math.max(ROW_HEIGHT, customers.length * ROW_HEIGHT));
    }, [customers.length, viewportHeight]);

    const itemData = useMemo(() => ({
        customers,
        visibleColumns,
        selectedIndex,
        overdueThreshold,
        highlightTerm,
        onShowLedger,
        onPayment,
        onEdit,
        onDelete
    }), [customers, visibleColumns, selectedIndex, overdueThreshold, highlightTerm, onShowLedger, onPayment, onEdit, onDelete]);

    return (
        <div className="customers-table-scroll">
            <div className="customers-table" style={{ '--customers-grid': gridTemplateColumns, minWidth: tableMinWidth }}>
                <div className="customers-table-header" role="row">
                    {visibleColumns.id && <div className="customers-header-cell" role="columnheader" onClick={() => onSortChange && onSortChange('id')} style={{ cursor: 'pointer' }}># {sortCol === 'id' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</div>}
                    {visibleColumns.name && <div className="customers-header-cell" role="columnheader" onClick={() => onSortChange && onSortChange('name')} style={{ cursor: 'pointer' }}>الاسم {sortCol === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</div>}
                    {visibleColumns.type && <div className="customers-header-cell" role="columnheader">النوع</div>}
                    {visibleColumns.phone && <div className="customers-header-cell" role="columnheader">الهاتف</div>}
                    {visibleColumns.phone2 && <div className="customers-header-cell" role="columnheader">الهاتف 2</div>}
                    {visibleColumns.address && <div className="customers-header-cell" role="columnheader">العنوان</div>}
                    {visibleColumns.city && <div className="customers-header-cell" role="columnheader">المدينة</div>}
                    {visibleColumns.district && <div className="customers-header-cell" role="columnheader">المنطقة</div>}
                    {visibleColumns.notes && <div className="customers-header-cell" role="columnheader">الملاحظات</div>}
                    {visibleColumns.creditLimit && <div className="customers-header-cell" role="columnheader">الحد الائتماني</div>}
                    {visibleColumns.balance && <div className="customers-header-cell" role="columnheader" onClick={() => onSortChange && onSortChange('balance')} style={{ cursor: 'pointer' }}>الرصيد {sortCol === 'balance' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</div>}
                    {visibleColumns.actions && <div className="customers-header-cell customers-action-cell" role="columnheader">{'\u0627\u0644\u0625\u062C\u0631\u0627\u0621\u0627\u062A'}</div>}
                </div>

                {showSearchRow && (
                    <div className="customers-table-search" role="row">
                        {['id', 'name', 'type', 'phone', 'phone2', 'address', 'city', 'district', 'notes', 'creditLimit', 'balance'].map((col) => (
                            visibleColumns[col] && (
                                <div key={col} className="customers-search-cell">
                                    <input
                                        className="customers-search-input"
                                        placeholder="بحث..."
                                        value={columnSearch[col] || ''}
                                        onChange={(e) => onColumnSearchChange(col, e.target.value)}
                                    />
                                </div>
                            )
                        ))}
                        {visibleColumns.actions && <div className="customers-search-cell" />}
                    </div>
                )}

                {customers.length === 0 ? (
                    <div className="customers-empty">لا توجد عملاء مطابقة للبحث</div>
                ) : (
                    <List
                        ref={listRef}
                        height={listHeight}
                        itemCount={customers.length}
                        itemSize={ROW_HEIGHT}
                        width="100%"
                        itemData={itemData}
                        style={{ direction: 'rtl' }}
                        overscanCount={5}
                        className="customers-virtual-list"
                    >
                        {VirtualizedCustomerRow}
                    </List>
                )}
            </div>
        </div>
    );
});

export default CustomersTable;
