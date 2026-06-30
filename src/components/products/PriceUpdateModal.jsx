import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
    X, 
    TrendingUp, 
    Filter, 
    DollarSign, 
    Percent, 
    Check, 
    AlertTriangle, 
    RefreshCw, 
    Grid, 
    Eye 
} from 'lucide-react';
import './PriceUpdateModal.css';

const PriceUpdateModal = ({ 
    isOpen, 
    onClose, 
    categories = [], 
    warehouses = [], 
    onSuccess,
    notify = () => {} 
}) => {
    // Search / Filter States
    const [categoryId, setCategoryId] = useState('');
    const [warehouseId, setWarehouseId] = useState('');
    const [brand, setBrand] = useState('');

    // Formula & Target States
    const [targetFields, setTargetFields] = useState(['basePrice']);
    const [formulaType, setFormulaType] = useState('percentage');
    const [formulaVal, setFormulaVal] = useState('0');
    const [roundingRule, setRoundingRule] = useState('');

    // UI States
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [saving, setSaving] = useState(false);
    const [previewData, setPreviewData] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [excludedIds, setExcludedIds] = useState(new Set());
    const [errorMsg, setErrorMsg] = useState('');

    // Debounce reference for preview updates
    const debounceTimerRef = useRef(null);

    // Toggle target field selection
    const handleToggleTargetField = (field) => {
        setTargetFields(prev => {
            if (prev.includes(field)) {
                // Keep at least one target selected
                if (prev.length === 1) return prev;
                return prev.filter(f => f !== field);
            } else {
                return [...prev, field];
            }
        });
    };

    // Load Preview Data from Electron IPC
    const fetchPreview = useCallback(async () => {
        if (!isOpen) return;
        setLoadingPreview(true);
        setErrorMsg('');
        try {
            const params = {
                categoryId: categoryId ? parseInt(categoryId, 10) : undefined,
                warehouseId: warehouseId ? parseInt(warehouseId, 10) : undefined,
                brand: brand.trim() || undefined,
                formulaType,
                formulaVal: parseFloat(formulaVal) || 0,
                roundingRule: roundingRule || undefined,
                targetFields
            };

            const response = await window.api.previewPriceUpdate(params);
            if (response && response.error) {
                setErrorMsg(response.error);
                setPreviewData([]);
                setTotalCount(0);
            } else if (response && Array.isArray(response.previewItems)) {
                setPreviewData(response.previewItems);
                setTotalCount(response.totalCount);
                // Reset exclusion list since we loaded new preview items
                setExcludedIds(new Set());
            } else if (Array.isArray(response)) {
                // توافقية تراجعية في حال عدم إعادة تشغيل تطبيق الـ Electron بعد
                setPreviewData(response);
                setTotalCount(response.length);
                setExcludedIds(new Set());
            } else {
                setPreviewData([]);
                setTotalCount(0);
            }
        } catch (err) {
            setErrorMsg('حدث خطأ أثناء تحميل المعاينة: ' + err.message);
            setPreviewData([]);
            setTotalCount(0);
        } finally {
            setLoadingPreview(false);
        }
    }, [isOpen, categoryId, warehouseId, brand, formulaType, formulaVal, roundingRule, targetFields]);

    // Setup debounced fetch of preview
    useEffect(() => {
        if (!isOpen) return;

        // لتجنب تعليق أو تأخر (Lag) فتح الموديل: لا نقوم بتحميل الأصناف تلقائياً عند الفتح إذا لم يتم اختيار أي فلتر
        // وبذلك يفتح الموديل فوراً بـ 0 مللي ثانية، ويتم التحميل التلقائي فقط عند البدء في التصفية
        const hasActiveFilter = !!(categoryId || warehouseId || brand.trim());
        if (!hasActiveFilter) {
            setPreviewData([]);
            setTotalCount(0);
            return;
        }

        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
            fetchPreview();
        }, 350);

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [fetchPreview, categoryId, warehouseId, brand, formulaType, formulaVal, roundingRule, targetFields, isOpen]);

    // Handle single item exclusion toggle
    const handleToggleExclude = (id) => {
        setExcludedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Toggle all items in preview
    const handleToggleAll = () => {
        if (excludedIds.size === previewData.length) {
            // Include all
            setExcludedIds(new Set());
        } else {
            // Exclude all
            const allIds = previewData.map(p => p.id);
            setExcludedIds(new Set(allIds));
        }
    };

    // Apply / Save changes to database
    const handleSaveChanges = async () => {
        const totalItemsToUpdate = totalCount - excludedIds.size;
        if (totalItemsToUpdate <= 0) {
            notify('برجاء تحديد صنف واحد على الأقل للتحديث.', 'warning');
            return;
        }

        const confirmAction = await window.api.showConfirmDialog?.({
            title: 'تأكيد تحديث الأسعار',
            message: `هل أنت متأكد من رغبتك في تحديث أسعار ${totalItemsToUpdate} صنف (أصناف)؟ لا يمكن التراجع عن هذه العملية.`,
            type: 'warning'
        });

        if (confirmAction === false) return;

        setSaving(true);
        setErrorMsg('');
        try {
            const params = {
                categoryId: categoryId ? parseInt(categoryId, 10) : undefined,
                warehouseId: warehouseId ? parseInt(warehouseId, 10) : undefined,
                brand: brand.trim() || undefined,
                formulaType,
                formulaVal: parseFloat(formulaVal) || 0,
                roundingRule: roundingRule || undefined,
                targetFields,
                excludedIds: Array.from(excludedIds)
            };

            const response = await window.api.applyPriceUpdate(params);
            if (response && response.error) {
                setErrorMsg(response.error);
                notify('تعذر تحديث الأسعار: ' + response.error, 'error');
            } else if (response && response.success) {
                notify(`تم تحديث أسعار ${response.count} صنف بنجاح!`, 'success');
                if (onSuccess) onSuccess();
                onClose();
            }
        } catch (err) {
            setErrorMsg('حدث خطأ أثناء حفظ التعديلات: ' + err.message);
            notify('حدث خطأ أثناء حفظ التعديلات: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="price-update-backdrop">
            <div className="price-update-modal">
                
                {/* Header */}
                <div className="price-update-header">
                    <div className="price-update-title-group">
                        <div className="price-update-icon-wrapper">
                            <TrendingUp size={22} />
                        </div>
                        <div>
                            <h2>نظام تحديث الأسعار الجماعي</h2>
                            <p>تعديل أسعار الأصناف بناءً على فئة أو مستودع أو علامة تجارية معينة وبمعادلات ربح متقدمة.</p>
                        </div>
                    </div>
                    <button type="button" className="price-update-close-btn" onClick={onClose} aria-label="إغلاق">
                        <X size={18} />
                    </button>
                </div>

                {/* Main Body */}
                <div className="price-update-content">
                    
                    {/* Sidebar Configuration */}
                    <div className="price-update-sidebar">
                        
                        {/* 1. Filtering & Targeting */}
                        <div className="price-update-section">
                            <span className="price-update-section-title">
                                <Filter size={14} /> فلاتر تصفية الأصناف
                            </span>
                            <div className="price-update-field-group">
                                <div className="price-update-label-input">
                                    <label>الفئة</label>
                                    <select 
                                        className="price-update-select" 
                                        value={categoryId} 
                                        onChange={(e) => setCategoryId(e.target.value)}
                                    >
                                        <option value="">كل الفئات</option>
                                        {categories.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="price-update-label-input">
                                    <label>المستودع (الكمية &gt; 0)</label>
                                    <select 
                                        className="price-update-select" 
                                        value={warehouseId} 
                                        onChange={(e) => setWarehouseId(e.target.value)}
                                    >
                                        <option value="">كل المستودعات</option>
                                        {warehouses.map(w => (
                                            <option key={w.id} value={w.id}>{w.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="price-update-label-input">
                                    <label>العلامة التجارية</label>
                                    <input 
                                        type="text" 
                                        className="price-update-input" 
                                        placeholder="بحث عن علامة تجارية..." 
                                        value={brand}
                                        onChange={(e) => setBrand(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 2. Target Pricing Fields */}
                        <div className="price-update-section">
                            <span className="price-update-section-title">
                                <DollarSign size={14} /> الأسعار المستهدفة للتحديث
                            </span>
                            <div className="price-update-targets-grid">
                                <div 
                                    className={`price-update-target-checkbox ${targetFields.includes('basePrice') ? 'active' : ''}`}
                                    onClick={() => handleToggleTargetField('basePrice')}
                                >
                                    <input 
                                        type="checkbox" 
                                        checked={targetFields.includes('basePrice')}
                                        readOnly
                                    />
                                    <span>سعر البيع الأساسي</span>
                                </div>
                                <div 
                                    className={`price-update-target-checkbox ${targetFields.includes('wholesalePrice') ? 'active' : ''}`}
                                    onClick={() => handleToggleTargetField('wholesalePrice')}
                                >
                                    <input 
                                        type="checkbox" 
                                        checked={targetFields.includes('wholesalePrice')}
                                        readOnly
                                    />
                                    <span>سعر الجملة</span>
                                </div>
                                <div 
                                    className={`price-update-target-checkbox ${targetFields.includes('minSalePrice') ? 'active' : ''}`}
                                    onClick={() => handleToggleTargetField('minSalePrice')}
                                >
                                    <input 
                                        type="checkbox" 
                                        checked={targetFields.includes('minSalePrice')}
                                        readOnly
                                    />
                                    <span>أقل سعر بيع</span>
                                </div>
                                <div 
                                    className={`price-update-target-checkbox ${targetFields.includes('cost') ? 'active' : ''}`}
                                    onClick={() => handleToggleTargetField('cost')}
                                >
                                    <input 
                                        type="checkbox" 
                                        checked={targetFields.includes('cost')}
                                        readOnly
                                    />
                                    <span>سعر التكلفة</span>
                                </div>
                            </div>
                        </div>

                        {/* 3. Adjustment Formula */}
                        <div className="price-update-section">
                            <span className="price-update-section-title">
                                <Percent size={14} /> طريقة التعديل والمعادلة
                            </span>
                            <div className="price-update-field-group">
                                <div className="price-update-label-input">
                                    <label>طريقة التعديل</label>
                                    <select 
                                        className="price-update-select" 
                                        value={formulaType} 
                                        onChange={(e) => setFormulaType(e.target.value)}
                                    >
                                        <option value="percentage">نسبة مئوية (%) - زيادة/نقصان على الحالي</option>
                                        <option value="fixed">قيمة ثابتة - زيادة/نقصان على الحالي</option>
                                        <option value="costMarginPercentage">نسبة ربح فوق التكلفة (Cost + %)</option>
                                        <option value="costMarginFixed">مبلغ إضافي فوق التكلفة (Cost + Fixed)</option>
                                    </select>
                                </div>

                                <div className="price-update-label-input">
                                    <label>القيمة (+ للزيادة، - للنقصان)</label>
                                    <input 
                                        type="number" 
                                        step="any"
                                        className="price-update-input" 
                                        value={formulaVal}
                                        onChange={(e) => setFormulaVal(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 4. Rounding Rules */}
                        <div className="price-update-section">
                            <span className="price-update-section-title">
                                <Grid size={14} /> سياسة وقواعد تقريب الأسعار
                            </span>
                            <div className="price-update-field-group">
                                <div className="price-update-label-input">
                                    <select 
                                        className="price-update-select" 
                                        value={roundingRule} 
                                        onChange={(e) => setRoundingRule(e.target.value)}
                                    >
                                        <option value="">بدون تقريب (كسور عادية)</option>
                                        <option value="nearestInteger">أقرب رقم صحيح (التقريب الاعتيادي)</option>
                                        <option value="nearestHalf">أقرب نصف وحدة (مثال: 5.50 أو 6.00)</option>
                                        <option value="nearestFive">أقرب 5 وحدات (مثال: 5 أو 10 أو 15 أو 20)</option>
                                        <option value="psychological99">تقريب نفسي ينتهي بـ 0.99</option>
                                        <option value="psychological95">تقريب نفسي ينتهي بـ 0.95</option>
                                        <option value="ceiling">تقريب لأعلى رقم صحيح (Ceiling)</option>
                                        <option value="floor">تقريب لأسفل رقم صحيح (Floor)</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Preview Pane */}
                    <div className="price-update-preview-pane">
                        
                        <div className="price-update-preview-toolbar">
                            <span className="price-update-preview-title">
                                <Eye size={16} /> معاينة تغيرات الأسعار الحية
                                {totalCount > 0 && (
                                    <span className="price-update-preview-badge">
                                        {totalCount} صنف تم العثور عليه
                                    </span>
                                )}
                            </span>
                            
                            {previewData.length > 0 && (
                                <div className="price-update-preview-actions">
                                    <button 
                                        type="button" 
                                        className="price-update-sub-btn"
                                        onClick={handleToggleAll}
                                    >
                                        {excludedIds.size === previewData.length ? 'تحديد الكل' : 'إلغاء تحديد الكل'}
                                    </button>
                                    <button 
                                        type="button" 
                                        className="price-update-sub-btn"
                                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                                        onClick={fetchPreview}
                                    >
                                        <RefreshCw size={12} className={loadingPreview ? 'spin' : ''} />
                                        تحديث المعاينة
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Error Message */}
                        {errorMsg && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: '#fef2f2',
                                color: '#991b1b',
                                border: '1px solid #fee2e2',
                                padding: '12px 16px',
                                borderRadius: '10px',
                                fontSize: '13px',
                                fontWeight: 600,
                                marginBottom: '12px'
                            }}>
                                <AlertTriangle size={16} />
                                <span>{errorMsg}</span>
                            </div>
                        )}

                        {/* Table */}
                        <div className="price-update-table-container">
                            {loadingPreview ? (
                                <div className="price-update-loading-state">
                                    <div className="price-update-loading-spinner"></div>
                                    <span>جاري حساب الأسعار وتجميع البيانات الحية...</span>
                                </div>
                            ) : previewData.length === 0 ? (
                                <div className="price-update-empty-state">
                                    <TrendingUp size={36} style={{ color: '#cbd5e1' }} />
                                    {!(categoryId || warehouseId || brand.trim()) ? (
                                        <>
                                            <span style={{ fontWeight: 600, color: '#475569' }}>يرجى تحديد فلاتر التصفية لبدء المعاينة الحية</span>
                                            <small style={{ color: '#94a3b8', marginTop: '4px', textAlign: 'center', lineHeight: '1.6' }}>
                                                اختر فئة أو مستودع أو علامة تجارية من الجانب الأيمن. <br />
                                                أو انقر فوق <strong>"تحديث المعاينة"</strong> في الأعلى لعرض كافة الأصناف دفعة واحدة.
                                            </small>
                                        </>
                                    ) : (
                                        <>
                                            <span>لا توجد أصناف تطابق الفلاتر المحددة.</span>
                                            <small style={{ color: '#94a3b8' }}>برجاء تعديل خيارات التصفية بالجانب الأيمن.</small>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <table className="price-update-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: '40px', textAlign: 'center' }}>تحديث</th>
                                            <th>الصنف</th>
                                            <th>الفئة</th>
                                            {targetFields.includes('basePrice') && <th>سعر البيع الحالي &larr; الجديد</th>}
                                            {targetFields.includes('wholesalePrice') && <th>سعر الجملة الحالي &larr; الجديد</th>}
                                            {targetFields.includes('minSalePrice') && <th>الحد الأدنى للبيع &larr; الجديد</th>}
                                            {targetFields.includes('cost') && <th>سعر التكلفة الحالي &larr; الجديد</th>}
                                            <th>فرق السعر</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewData.map(product => {
                                            const isExcluded = excludedIds.has(product.id);
                                            
                                            // Compute total price difference based on primary selected target
                                            const primaryField = targetFields[0] || 'basePrice';
                                            const oldVal = Number(product.oldPrices?.[primaryField] || 0);
                                            const newVal = Number(product.newPrices?.[primaryField] || 0);
                                            const diffVal = newVal - oldVal;
                                            
                                            let diffPercent = 0;
                                            if (oldVal > 0) {
                                                diffPercent = (diffVal / oldVal) * 100;
                                            }

                                            return (
                                                <tr key={product.id} className={isExcluded ? 'excluded' : ''}>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={!isExcluded}
                                                            onChange={() => handleToggleExclude(product.id)}
                                                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                                        />
                                                    </td>
                                                    <td>
                                                        <div className="price-update-cell-flex">
                                                            <strong>{product.name}</strong>
                                                            <small style={{ direction: 'ltr', textAlign: 'right' }}>
                                                                {product.barcode || product.sku || `#${product.id}`}
                                                                {product.variants && product.variants.length > 0 && (
                                                                    <span className="variant-indicator-tag">
                                                                        +{product.variants.length} متغيرات
                                                                    </span>
                                                                )}
                                                            </small>
                                                        </div>
                                                    </td>
                                                    <td>{product.categoryName}</td>

                                                    {targetFields.includes('basePrice') && (
                                                        <td>
                                                            <strong>{oldVal.toFixed(2)}</strong> &larr; <strong style={{ color: '#0f766e' }}>{newVal.toFixed(2)}</strong>
                                                        </td>
                                                    )}

                                                    {targetFields.includes('wholesalePrice') && (
                                                        <td>
                                                            {Number(product.oldPrices?.wholesalePrice || 0).toFixed(2)} &larr; <span style={{ color: '#0f766e', fontWeight: 600 }}>{Number(product.newPrices?.wholesalePrice || 0).toFixed(2)}</span>
                                                        </td>
                                                    )}

                                                    {targetFields.includes('minSalePrice') && (
                                                        <td>
                                                            {Number(product.oldPrices?.minSalePrice || 0).toFixed(2)} &larr; <span style={{ color: '#0f766e', fontWeight: 600 }}>{Number(product.newPrices?.minSalePrice || 0).toFixed(2)}</span>
                                                        </td>
                                                    )}

                                                    {targetFields.includes('cost') && (
                                                        <td>
                                                            {Number(product.oldPrices?.cost || 0).toFixed(2)} &larr; <span style={{ color: '#0f766e', fontWeight: 600 }}>{Number(product.newPrices?.cost || 0).toFixed(2)}</span>
                                                        </td>
                                                    )}

                                                    <td>
                                                        {diffVal > 0 ? (
                                                            <span className="price-difference-pill plus">
                                                                +{diffVal.toFixed(2)} (+{diffPercent.toFixed(1)}%)
                                                            </span>
                                                        ) : diffVal < 0 ? (
                                                            <span className="price-difference-pill minus">
                                                                {diffVal.toFixed(2)} ({diffPercent.toFixed(1)}%)
                                                            </span>
                                                        ) : (
                                                            <span className="price-difference-pill neutral">
                                                                0.00 (0.0%)
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                    </div>

                </div>

                {/* Footer */}
                <div className="price-update-footer">
                    <div className="price-update-summary-info">
                        <span>أصناف التصفية: <strong>{totalCount}</strong></span>
                        <span>محددة للتحديث: <strong>{totalCount - excludedIds.size}</strong></span>
                        {excludedIds.size > 0 && (
                            <span style={{ color: '#d97706' }}>أصناف مستبعدة: <strong>{excludedIds.size}</strong></span>
                        )}
                    </div>
                    <div className="price-update-btn-actions">
                        <button 
                            type="button" 
                            className="price-update-btn price-update-btn-cancel" 
                            onClick={onClose}
                            disabled={saving}
                        >
                            إلغاء الأمر
                        </button>
                        <button 
                            type="button" 
                            className="price-update-btn price-update-btn-submit"
                            onClick={handleSaveChanges}
                            disabled={saving || loadingPreview || totalCount === 0 || (totalCount - excludedIds.size) === 0}
                        >
                            {saving ? (
                                <>
                                    <RefreshCw size={14} className="spin" />
                                    جاري حفظ التعديلات...
                                </>
                            ) : (
                                <>
                                    <Check size={14} />
                                    تحديث وحفظ الأسعار
                                </>
                            )}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default PriceUpdateModal;
