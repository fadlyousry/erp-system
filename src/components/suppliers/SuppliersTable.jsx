import React, { useMemo } from 'react';
import { Search } from 'lucide-react';

const toNumber = (value, fallback = 0) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const formatMoney = (value) =>
    toNumber(value).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (value) => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return "-";
    return parsed.toLocaleDateString("ar-EG");
};

export default function SuppliersTable({
    suppliers,
    visibleColumns,
    showSearchRow,
    columnSearch,
    onColumnSearchChange,
    onShowLedger,
    onPayment,
    onEdit,
    onDelete,
    listRef
}) {
    // Filter suppliers based on column search if needed (usually handled in parent or here)
    const filteredSuppliers = useMemo(() => {
        if (!columnSearch || Object.keys(columnSearch).length === 0) return suppliers;
        
        return suppliers.filter(supplier => {
            return Object.entries(columnSearch).every(([key, value]) => {
                if (!value) return true;
                const supplierValue = String(supplier[key] || '').toLowerCase();
                return supplierValue.includes(String(value).toLowerCase());
            });
        });
    }, [suppliers, columnSearch]);

    const renderHeader = (id, label) => {
        if (!visibleColumns[id]) return null;
        return <th>{label}</th>;
    };

    const renderCell = (id, content, className = '') => {
        if (!visibleColumns[id]) return null;
        return <td className={className}>{content}</td>;
    };

    return (
        <div className="suppliers-table-scroll" ref={listRef}>
            <table>
                <thead>
                    <tr>
                        {renderHeader('id', '#')}
                        {renderHeader('name', 'اسم المورد')}
                        {renderHeader('phone', 'الهاتف')}
                        {renderHeader('address', 'العنوان')}
                        {renderHeader('city', 'المدينة')}
                        {renderHeader('notes', 'ملاحظات')}
                        {renderHeader('balance', 'الرصيد')}
                        {renderHeader('createdAt', 'تاريخ التسجيل')}
                        {renderHeader('actions', 'العمليات')}
                    </tr>
                    {showSearchRow && (
                        <tr className="column-search-row">
                            {visibleColumns.id && (
                                <td>
                                    <input 
                                        type="text" 
                                        placeholder="بحث..." 
                                        value={columnSearch.id || ''} 
                                        onChange={(e) => onColumnSearchChange('id', e.target.value)}
                                    />
                                </td>
                            )}
                            {visibleColumns.name && (
                                <td>
                                    <input 
                                        type="text" 
                                        placeholder="بحث..." 
                                        value={columnSearch.name || ''} 
                                        onChange={(e) => onColumnSearchChange('name', e.target.value)}
                                    />
                                </td>
                            )}
                            {visibleColumns.phone && (
                                <td>
                                    <input 
                                        type="text" 
                                        placeholder="بحث..." 
                                        value={columnSearch.phone || ''} 
                                        onChange={(e) => onColumnSearchChange('phone', e.target.value)}
                                    />
                                </td>
                            )}
                            {visibleColumns.address && (
                                <td>
                                    <input 
                                        type="text" 
                                        placeholder="بحث..." 
                                        value={columnSearch.address || ''} 
                                        onChange={(e) => onColumnSearchChange('address', e.target.value)}
                                    />
                                </td>
                            )}
                            {visibleColumns.city && (
                                <td>
                                    <input 
                                        type="text" 
                                        placeholder="بحث..." 
                                        value={columnSearch.city || ''} 
                                        onChange={(e) => onColumnSearchChange('city', e.target.value)}
                                    />
                                </td>
                            )}
                            {visibleColumns.notes && (
                                <td>
                                    <input 
                                        type="text" 
                                        placeholder="بحث..." 
                                        value={columnSearch.notes || ''} 
                                        onChange={(e) => onColumnSearchChange('notes', e.target.value)}
                                    />
                                </td>
                            )}
                            {visibleColumns.balance && <td></td>}
                            {visibleColumns.createdAt && <td></td>}
                            {visibleColumns.actions && <td></td>}
                        </tr>
                    )}
                </thead>
                <tbody>
                    {filteredSuppliers.length === 0 ? (
                        <tr>
                            <td colSpan={Object.values(visibleColumns).filter(Boolean).length}>
                                <div className="suppliers-empty">
                                    <span className="suppliers-empty-icon">📭</span>
                                    <span className="suppliers-empty-text">لا توجد بيانات</span>
                                </div>
                            </td>
                        </tr>
                    ) : (
                        filteredSuppliers.map((supplier) => {
                            const balance = toNumber(supplier.balance);
                            const balanceClass = balance < 0 ? "is-negative" : balance > 0 ? "is-positive" : "is-zero";
                            return (
                                <tr key={supplier.id}>
                                    {renderCell('id', supplier.id)}
                                    {renderCell('name', supplier.name, 'suppliers-name-cell')}
                                    {renderCell('phone', supplier.phone || "-", 'suppliers-muted-cell')}
                                    {renderCell('address', supplier.address || "-", 'suppliers-muted-cell')}
                                    {renderCell('city', supplier.city || "-", 'suppliers-muted-cell')}
                                    {renderCell('notes', supplier.notes || "-", 'suppliers-muted-cell')}
                                    {renderCell('balance', formatMoney(balance), `suppliers-balance-cell ${balanceClass}`)}
                                    {renderCell('createdAt', formatDate(supplier.createdAt), 'suppliers-muted-cell')}
                                    {renderCell('actions', (
                                        <div className="suppliers-actions-group">
                                            <button
                                                className="suppliers-action-btn is-ledger"
                                                onClick={() => onShowLedger(supplier.id)}
                                                title="كشف الحساب"
                                            >{'\u{1F441}\uFE0F'}</button>
                                            <button
                                                className="suppliers-action-btn is-payment"
                                                onClick={() => onPayment(supplier)}
                                                title="تسجيل سداد"
                                            >{'\u{1F4B5}'}</button>
                                            <button
                                                className="suppliers-action-btn is-edit"
                                                onClick={() => onEdit(supplier)}
                                                title="تعديل"
                                            >{'\u270F\uFE0F'}</button>
                                            <button
                                                className="suppliers-action-btn is-delete"
                                                onClick={() => onDelete(supplier.id)}
                                                title="حذف"
                                            >{'\u{1F5D1}\uFE0F'}</button>
                                        </div>
                                    ), 'suppliers-actions-cell')}
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
    );
}
