import React, { useState, useEffect, useMemo, useRef } from 'react';
import './Reports.css';
import { getAppSettings } from '../utils/appSettings';

const Reports = ({ activeReport }) => {
    const [loading, setLoading] = useState(false);
    const [reportData, setReportData] = useState(null);
    const [categories, setCategories] = useState([]);
    const [allPeriods, setAllPeriods] = useState(false);
    
    // Item Movement specific state
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [productSearch, setProductSearch] = useState('');
    const [productResults, setProductResults] = useState([]);
    const [showResults, setShowResults] = useState(false);
    const searchRef = useRef(null);

    // Filters
    const [filters, setFilters] = useState({
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        categoryId: 'all'
    });

    useEffect(() => {
        loadCategories();
        
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (activeReport === 'sold-items') {
            fetchReport();
        } else if (activeReport === 'item-movement') {
            if (selectedProduct) {
                fetchReport();
            } else {
                setReportData(null);
            }
        }
    }, [activeReport, allPeriods, selectedProduct]);

    const loadCategories = async () => {
        try {
            const data = await window.api.getCategories();
            if (Array.isArray(data)) setCategories(data);
        } catch (err) {
            console.error('Failed to load categories:', err);
        }
    };

    const fetchReport = async () => {
        setLoading(true);
        try {
            let data = null;
            const reportParams = {
                ...filters,
                startDate: allPeriods ? null : filters.startDate,
                endDate: allPeriods ? null : filters.endDate,
                productId: selectedProduct?.id
            };

            if (activeReport === 'sold-items') {
                data = await window.api.getSoldItemsReport(reportParams);
                setReportData(data || []);
            } else if (activeReport === 'item-movement' && selectedProduct) {
                data = await window.api.getItemMovementReport(reportParams);
                if (data.error) {
                    console.error('Report Error:', data.error);
                    setReportData(null);
                } else {
                    setReportData(data);
                }
            }
        } catch (err) {
            console.error('Failed to fetch report:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleProductSearch = async (e) => {
        const query = e.target.value;
        setProductSearch(query);
        if (query.length > 1) {
            try {
                const results = await window.api.searchProducts(query);
                setProductResults(results || []);
                setShowResults(true);
            } catch (err) {
                console.error('Search failed:', err);
            }
        } else {
            setProductResults([]);
            setShowResults(false);
        }
    };

    const selectProduct = (product) => {
        setSelectedProduct(product);
        setProductSearch(product.name);
        setShowResults(false);
    };

    const setToday = () => {
        const today = new Date().toISOString().split('T')[0];
        setFilters(prev => ({ ...prev, startDate: today, endDate: today }));
        setAllPeriods(false);
    };

    useEffect(() => {
        if (!allPeriods) {
            fetchReport();
        }
    }, [filters.startDate, filters.endDate]);

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(val);
    };

    const handlePrint = async () => {
        if (!reportData) return;

        const settings = getAppSettings();
        let reportHtml = '';

        if (activeReport === 'item-movement' && reportData.product) {
            reportHtml = generateItemMovementHTML(reportData, settings, { allPeriods, filters, sales, salesReturns, purchases, purchaseReturns, salesQty, salesReturnsQty, purchasesQty, purchaseReturnsQty, formatCurrency });
        } else if (activeReport === 'sold-items') {
            reportHtml = generateSoldItemsHTML(reportData, settings, { allPeriods, filters, formatCurrency });
        }

        if (reportHtml) {
            await window.api.printPreviewHTML({ 
                html: reportHtml, 
                title: activeReport === 'item-movement' ? 'تقرير بيان حركة صنف' : 'تقرير الأصناف المباعة' 
            });
        }
    };

    const generateItemMovementHTML = (data, settings, context) => {
        const { allPeriods, filters, sales, salesReturns, purchases, purchaseReturns, salesQty, salesReturnsQty, purchasesQty, purchaseReturnsQty, formatCurrency } = context;
        
        const renderTableRows = (items, type) => {
            if (!items || items.length === 0) return `<tr><td colspan="${type === 'sale' ? 5 : 4}" style="text-align:center; padding: 20px; color: #94a3b8;">لا توجد بيانات</td></tr>`;
            return items.map(m => `
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${new Date(m.date).toLocaleDateString('ar-EG')}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b;">${m.reference}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${m.party}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: ${m.qtyOut ? '#dc2626' : '#16a34a'};">${m.qtyOut || m.qtyIn}</td>
                    ${m.total !== undefined ? `<td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">${formatCurrency(m.total)}</td>` : ''}
                </tr>
            `).join('');
        };

        return `
            <div dir="rtl" style="font-family: Arial, sans-serif; color: #1e293b; padding: 10px;">
                <!-- Company Header -->
                <div style="display: flex; justify-content: space-between; align-items: start; border-bottom: 3px solid #0f172a; padding-bottom: 15px; margin-bottom: 25px;">
                    <div style="flex: 1;">
                        <h1 style="margin: 0; font-size: 26px; color: #0f172a;">${settings.companyName || 'ERP SYSTEM'}</h1>
                        <p style="margin: 5px 0 0; font-size: 14px; color: #475569;">${settings.companyAddress || ''}</p>
                        <p style="margin: 2px 0 0; font-size: 14px; color: #475569;">${settings.companyContactNumbers || ''}</p>
                    </div>
                    <div style="text-align: left; flex: 1;">
                        <h2 style="margin: 0; font-size: 20px; color: #1e293b;">تقرير بيان حركة صنف تفصيلي</h2>
                        <p style="margin: 10px 0 0; font-size: 13px; color: #64748b;">تاريخ الطباعة: <strong>${new Date().toLocaleString('ar-EG')}</strong></p>
                        <p style="margin: 5px 0 0; font-size: 13px; color: #64748b;">الفترة: <strong>${allPeriods ? 'كل الفترات' : `من ${filters.startDate} إلى ${filters.endDate}`}</strong></p>
                    </div>
                </div>

                <!-- Product Meta -->
                <div style="background: #f1f5f9; padding: 15px; border-radius: 10px; margin-bottom: 30px; display: grid; grid-template-columns: 1fr 1fr 1fr; border: 1px solid #e2e8f0;">
                    <div><span style="font-size: 11px; color: #64748b; display: block; margin-bottom: 4px;">اسم الصنف</span><strong style="font-size: 17px;">${data.product.name}</strong></div>
                    <div><span style="font-size: 11px; color: #64748b; display: block; margin-bottom: 4px;">الكود (SKU)</span><strong>${data.product.sku || '---'}</strong></div>
                    <div><span style="font-size: 11px; color: #64748b; display: block; margin-bottom: 4px;">المورد الرئيسي</span><strong>${data.product.mainSupplier}</strong></div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
                    <!-- Sales Column -->
                    <div>
                        <div style="margin-bottom: 30px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #3b82f6; padding-bottom: 5px; margin-bottom: 10px;">
                                <h3 style="margin: 0; font-size: 16px;">🛒 مبيعات</h3>
                                <span style="font-size: 12px; background: #eff6ff; padding: 3px 10px; border-radius: 15px; color: #3b82f6; font-weight: bold;">إجمالي: ${salesQty}</span>
                            </div>
                            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: right;">
                                <thead style="background: #f8fafc;">
                                    <tr>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">التاريخ</th>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">رقم الفاتورة</th>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">العميل</th>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">الكمية</th>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">الإجمالي</th>
                                    </tr>
                                </thead>
                                <tbody>${renderTableRows(sales, 'sale')}</tbody>
                            </table>
                        </div>

                        <div>
                            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ef4444; padding-bottom: 5px; margin-bottom: 10px;">
                                <h3 style="margin: 0; font-size: 16px;">↩️ مرتجع مبيعات</h3>
                                <span style="font-size: 12px; background: #fef2f2; padding: 3px 10px; border-radius: 15px; color: #ef4444; font-weight: bold;">إجمالي: ${salesReturnsQty}</span>
                            </div>
                            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: right;">
                                <thead style="background: #f8fafc;">
                                    <tr>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">التاريخ</th>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">رقم الحركة</th>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">العميل</th>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">الكمية</th>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">الإجمالي</th>
                                    </tr>
                                </thead>
                                <tbody>${renderTableRows(salesReturns, 'sale')}</tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Purchases Column -->
                    <div>
                        <div style="margin-bottom: 30px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #16a34a; padding-bottom: 5px; margin-bottom: 10px;">
                                <h3 style="margin: 0; font-size: 16px;">📦 مشتريات</h3>
                                <span style="font-size: 12px; background: #f0fdf4; padding: 3px 10px; border-radius: 15px; color: #16a34a; font-weight: bold;">إجمالي: ${purchasesQty}</span>
                            </div>
                            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: right;">
                                <thead style="background: #f8fafc;">
                                    <tr>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">التاريخ</th>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">رقم الفاتورة</th>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">المورد</th>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">الكمية</th>
                                    </tr>
                                </thead>
                                <tbody>${renderTableRows(purchases, 'purchase')}</tbody>
                            </table>
                        </div>

                        <div>
                            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #dc2626; padding-bottom: 5px; margin-bottom: 10px;">
                                <h3 style="margin: 0; font-size: 16px;">❌ مرتجع مشتريات</h3>
                                <span style="font-size: 12px; background: #fef2f2; padding: 3px 10px; border-radius: 15px; color: #dc2626; font-weight: bold;">إجمالي: ${purchaseReturnsQty}</span>
                            </div>
                            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: right;">
                                <thead style="background: #f8fafc;">
                                    <tr>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">التاريخ</th>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">رقم الحركة</th>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">المورد</th>
                                        <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">الكمية</th>
                                    </tr>
                                </thead>
                                <tbody>${renderTableRows(purchaseReturns, 'purchase')}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    const generateSoldItemsHTML = (data, settings, context) => {
        const { allPeriods, filters, formatCurrency } = context;
        return `
            <div dir="rtl" style="font-family: Arial, sans-serif; color: #1e293b; padding: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: start; border-bottom: 3px solid #0f172a; padding-bottom: 15px; margin-bottom: 25px;">
                    <div>
                        <h1 style="margin: 0; font-size: 26px; color: #0f172a;">${settings.companyName || 'ERP SYSTEM'}</h1>
                        <p style="margin: 5px 0 0; font-size: 14px; color: #475569;">${settings.companyAddress || ''}</p>
                    </div>
                    <div style="text-align: left;">
                        <h2 style="margin: 0; font-size: 20px; color: #1e293b;">تقرير الأصناف المباعة</h2>
                        <p style="margin: 10px 0 0; font-size: 13px; color: #64748b;">تاريخ الطباعة: <strong>${new Date().toLocaleString('ar-EG')}</strong></p>
                        <p style="margin: 5px 0 0; font-size: 13px; color: #64748b;">الفترة: <strong>${allPeriods ? 'كل الفترات' : `من ${filters.startDate} إلى ${filters.endDate}`}</strong></p>
                    </div>
                </div>

                <table style="width: 100%; border-collapse: collapse; font-size: 14px; text-align: right;">
                    <thead style="background: #f1f5f9;">
                        <tr>
                            <th style="padding: 12px; border: 1px solid #e2e8f0;">المنتج</th>
                            <th style="padding: 12px; border: 1px solid #e2e8f0;">الكود</th>
                            <th style="padding: 12px; border: 1px solid #e2e8f0;">القسم</th>
                            <th style="padding: 12px; border: 1px solid #e2e8f0;">الكمية</th>
                            <th style="padding: 12px; border: 1px solid #e2e8f0;">متوسط السعر</th>
                            <th style="padding: 12px; border: 1px solid #e2e8f0;">إجمالي البيع</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(item => `
                            <tr>
                                <td style="padding: 12px; border: 1px solid #e2e8f0; font-weight: bold;">${item.productName}</td>
                                <td style="padding: 12px; border: 1px solid #e2e8f0;">${item.productCode}</td>
                                <td style="padding: 12px; border: 1px solid #e2e8f0;">${item.category}</td>
                                <td style="padding: 12px; border: 1px solid #e2e8f0;">${item.quantity} ${item.unit}</td>
                                <td style="padding: 12px; border: 1px solid #e2e8f0;">${formatCurrency(item.avgPrice)}</td>
                                <td style="padding: 12px; border: 1px solid #e2e8f0; font-weight: bold;">${formatCurrency(item.totalSales)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    };

    const handleExport = () => {
        // Export logic
    };

    // Separate movement categories
    const sales = useMemo(() => (reportData?.movements || []).filter(m => m.type === 'SALE'), [reportData]);
    const salesReturns = useMemo(() => (reportData?.movements || []).filter(m => m.type === 'SALE_RETURN'), [reportData]);
    const purchases = useMemo(() => (reportData?.movements || []).filter(m => m.type === 'PURCHASE'), [reportData]);
    const purchaseReturns = useMemo(() => (reportData?.movements || []).filter(m => m.type === 'PURCHASE_RETURN'), [reportData]);

    const salesQty = useMemo(() => sales.reduce((acc, m) => acc + (m.qtyOut || 0), 0), [sales]);
    const salesReturnsQty = useMemo(() => salesReturns.reduce((acc, m) => acc + (m.qtyIn || 0), 0), [salesReturns]);
    const purchasesQty = useMemo(() => purchases.reduce((acc, m) => acc + (m.qtyIn || 0), 0), [purchases]);
    const purchaseReturnsQty = useMemo(() => purchaseReturns.reduce((acc, m) => acc + (m.qtyOut || 0), 0), [purchaseReturns]);

    return (
        <div className="reports-container full-width">
            <main className="reports-main">
                <header className="report-header">
                    <div className="report-title-section">
                        <h1 className="report-title">
                            {activeReport === 'sold-items' ? 'تقرير الأصناف المباعة' : 'بيان حركة صنف تفصيلي'}
                        </h1>
                        <div className="report-actions">
                            <button className="btn-report btn-print" onClick={handlePrint}>
                                <span>🖨️</span> طباعة
                            </button>
                        </div>
                    </div>

                    <div className="report-filters">
                        {activeReport === 'item-movement' && (
                            <div className="filter-group search-container" ref={searchRef}>
                                <label className="filter-label">ابحث عن الصنف</label>
                                <input 
                                    type="text" 
                                    className="filter-input search-input" 
                                    placeholder="اسم الصنف أو الكود..."
                                    value={productSearch}
                                    onChange={handleProductSearch}
                                />
                                {showResults && (
                                    <ul className="search-results">
                                        {productResults.map(p => (
                                            <li key={p.id} onClick={() => selectProduct(p)}>
                                                <span className="res-name">{p.name}</span>
                                                <span className="res-sku">{p.sku || p.barcode}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}

                        <div className="filter-group">
                            <label className="filter-label">من تاريخ</label>
                            <input 
                                type="date" name="startDate" className="filter-input" 
                                value={filters.startDate} onChange={handleFilterChange} disabled={allPeriods}
                            />
                        </div>
                        <div className="filter-group">
                            <label className="filter-label">إلى تاريخ</label>
                            <input 
                                type="date" name="endDate" className="filter-input" 
                                value={filters.endDate} onChange={handleFilterChange} disabled={allPeriods}
                            />
                        </div>
                        
                        <div className="filter-group-horizontal">
                            <label className="checkbox-container">
                                <input type="checkbox" checked={allPeriods} onChange={(e) => setAllPeriods(e.target.checked)} />
                                <span className="checkmark"></span>
                                <span className="checkbox-label">كل الفترات</span>
                            </label>
                        </div>
                    </div>
                </header>

                <div className="report-content">
                    {loading ? (
                        <div className="no-data-msg">جاري تحميل البيانات...</div>
                    ) : (
                        <>
                            {activeReport === 'sold-items' && Array.isArray(reportData) && (
                                <div className="report-table-container">
                                    <table className="report-table">
                                        <thead>
                                            <tr>
                                                <th>المنتج</th><th>الكود</th><th>القسم</th><th>الكمية</th><th>متوسط السعر</th><th>إجمالي البيع</th><th>الربح</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {reportData.length > 0 ? reportData.map((item, index) => (
                                                <tr key={index}>
                                                    <td style={{ fontWeight: '700' }}>{item.productName}</td>
                                                    <td>{item.productCode}</td><td>{item.category}</td>
                                                    <td>{item.quantity} {item.unit}</td>
                                                    <td>{formatCurrency(item.avgPrice)}</td>
                                                    <td style={{ fontWeight: '700' }}>{formatCurrency(item.totalSales)}</td>
                                                    <td className={item.profit >= 0 ? 'profit-positive' : 'profit-negative'}>{formatCurrency(item.profit)}</td>
                                                </tr>
                                            )) : (<tr><td colSpan="7" className="no-data-msg">لا توجد بيانات</td></tr>)}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {activeReport === 'item-movement' && (
                                <>
                                    {reportData?.product ? (
                                        <div className="movement-report-final-view">
                                            <div className="final-split-grid">
                                                {/* جهة المبيعات */}
                                                <div className="grid-column sales-side">
                                                    <section className="movement-section">
                                                        <div className="section-header">
                                                            <h3 className="section-title">🛒 فواتير البيع</h3>
                                                            <span className="section-summary-qty">إجمالي: {salesQty} قطعة</span>
                                                        </div>
                                                        <div className="report-table-container min-table">
                                                            <table className="report-table">
                                                                <thead><tr><th>التاريخ</th><th>رقم الفاتورة</th><th>العميل</th><th>الكمية</th><th>الإجمالي</th></tr></thead>
                                                                <tbody>
                                                                    {sales.length > 0 ? sales.map((m, i) => (
                                                                        <tr key={i}>
                                                                            <td>{new Date(m.date).toLocaleDateString('ar-EG')}</td>
                                                                            <td style={{ fontWeight: '700', color: '#64748b' }}>{m.reference}</td>
                                                                            <td style={{ fontWeight: '600' }}>{m.party}</td>
                                                                            <td className="qty-val out">{m.qtyOut}</td>
                                                                            <td style={{ fontWeight: '700' }}>{formatCurrency(m.total)}</td>
                                                                        </tr>
                                                                    )) : (<tr><td colSpan="5" className="no-data-min">لا توجد مبيعات</td></tr>)}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </section>

                                                    <section className="movement-section">
                                                        <div className="section-header">
                                                            <h3 className="section-title">↩️ مرتجعات المبيعات</h3>
                                                            <span className="section-summary-qty">إجمالي: {salesReturnsQty} قطعة</span>
                                                        </div>
                                                        <div className="report-table-container min-table">
                                                            <table className="report-table">
                                                                <thead><tr><th>التاريخ</th><th>رقم الحركة</th><th>العميل</th><th>الكمية</th><th>الإجمالي</th></tr></thead>
                                                                <tbody>
                                                                    {salesReturns.length > 0 ? salesReturns.map((m, i) => (
                                                                        <tr key={i}>
                                                                            <td>{new Date(m.date).toLocaleDateString('ar-EG')}</td>
                                                                            <td style={{ fontWeight: '700', color: '#64748b' }}>{m.reference}</td>
                                                                            <td style={{ fontWeight: '600' }}>{m.party}</td>
                                                                            <td className="qty-val in">{m.qtyIn}</td>
                                                                            <td style={{ fontWeight: '700' }}>{formatCurrency(m.total)}</td>
                                                                        </tr>
                                                                    )) : (<tr><td colSpan="5" className="no-data-min">لا توجد مرتجعات</td></tr>)}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </section>
                                                </div>

                                                {/* جهة المشتريات */}
                                                <div className="grid-column purchase-side">
                                                    <section className="movement-section">
                                                        <div className="section-header">
                                                            <h3 className="section-title">📦 فواتير الشراء</h3>
                                                            <span className="section-summary-qty">إجمالي: {purchasesQty} قطعة</span>
                                                        </div>
                                                        <div className="report-table-container min-table">
                                                            <table className="report-table">
                                                                <thead><tr><th>التاريخ</th><th>رقم الفاتورة</th><th>المورد</th><th>الكمية</th></tr></thead>
                                                                <tbody>
                                                                    {purchases.length > 0 ? purchases.map((m, i) => (
                                                                        <tr key={i}>
                                                                            <td>{new Date(m.date).toLocaleDateString('ar-EG')}</td>
                                                                            <td style={{ fontWeight: '700', color: '#64748b' }}>{m.reference}</td>
                                                                            <td style={{ fontWeight: '600' }}>{m.party}</td>
                                                                            <td className="qty-val in">{m.qtyIn}</td>
                                                                        </tr>
                                                                    )) : (<tr><td colSpan="4" className="no-data-min">لا توجد مشتريات</td></tr>)}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </section>

                                                    <section className="movement-section">
                                                        <div className="section-header">
                                                            <h3 className="section-title">❌ مرتجعات المشتريات</h3>
                                                            <span className="section-summary-qty">إجمالي: {purchaseReturnsQty} قطعة</span>
                                                        </div>
                                                        <div className="report-table-container min-table">
                                                            <table className="report-table">
                                                                <thead><tr><th>التاريخ</th><th>رقم الحركة</th><th>المورد</th><th>الكمية</th></tr></thead>
                                                                <tbody>
                                                                    {purchaseReturns.length > 0 ? purchaseReturns.map((m, i) => (
                                                                        <tr key={i}>
                                                                            <td>{new Date(m.date).toLocaleDateString('ar-EG')}</td>
                                                                            <td style={{ fontWeight: '700', color: '#64748b' }}>{m.reference}</td>
                                                                            <td style={{ fontWeight: '600' }}>{m.party}</td>
                                                                            <td className="qty-val out">{m.qtyOut}</td>
                                                                        </tr>
                                                                    )) : (<tr><td colSpan="4" className="no-data-min">لا توجد مرتجعات</td></tr>)}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </section>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="no-data-msg">يرجى اختيار صنف لعرض بيان حركته</div>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>
            </main>
        </div>
    );
};

export default Reports;
