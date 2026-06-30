import React, { useMemo, useState, useEffect, useRef } from 'react';
import { 
    X, Search, Plus, Trash2, Printer, FileText, Settings, 
    Layout, Type, Database, Save as SaveIcon, RefreshCw,
    AlertCircle, Info, ChevronDown
} from 'lucide-react';
import { nText } from '../../utils/productUtils';
import {
    BARCODE_FORMAT_OPTIONS,
    BARCODE_CODE_SOURCE_OPTIONS,
    BARCODE_LABEL_PRESETS,
    BARCODE_STUDIO_TABS,
    BARCODE_FONT_OPTIONS,
    isMatrixBarcodeFormat
} from '../../utils/barcodeUtils';
import './BarcodeStudioModal.css';

export default function BarcodeStudioModal({
    barcodeStudioProducts,
    setBarcodeStudioProducts,
    allAvailableProducts = [],
    barcodeStudioRows,
    barcodeStudioSafeSettings,
    barcodeStudioTab,
    setBarcodeStudioTab,
    barcodePrinting,
    barcodePreview,
    barcodePreviewIsMatrix,
    matrixBarcodeEngineLoading,
    matrixBarcodeEngineError,
    // Template props
    barcodeTemplates,
    activeBarcodeTemplateId,
    activeBarcodeTemplate,
    barcodeTemplateName,
    setBarcodeTemplateName,
    barcodeTemplatePrinter,
    setBarcodeTemplatePrinter,
    barcodePrintPreferences,
    // Handlers
    setBarcodeSetting,
    setBarcodeNumberSetting,
    applyBarcodePreset,
    applyBarcodeTemplate,
    saveNewBarcodeTemplate,
    updateBarcodeTemplate,
    deleteBarcodeTemplate,
    resetBarcodeStudioSettings,
    applyBarcodeSystemDefaults,
    closeBarcodeStudio,
    executeBarcodeStudioPrint,
    executeBarcodeStudioPdfExport,
    // System Settings props
    printers = [],
    loadingPrinters = false,
    refreshPrinters,
    saveBarcodeSystemSettings
}) {
    const [searchQuery, setSearchQuery] = useState('');
    const [showResults, setShowResults] = useState(false);
    const searchRef = useRef(null);

    // System Settings Local State
    const [systemPrinter, setSystemPrinter] = useState(barcodePrintPreferences.printerName);
    const [systemPrintMode, setSystemPrintMode] = useState(barcodePrintPreferences.printMode);
    const [systemStartTab, setSystemStartTab] = useState(barcodePrintPreferences.startTab);

    // Update local state when preferences change (e.g. on mount)
    useEffect(() => {
        setSystemPrinter(barcodePrintPreferences.printerName);
        setSystemPrintMode(barcodePrintPreferences.printMode);
        setSystemStartTab(barcodePrintPreferences.startTab);
    }, [barcodePrintPreferences.printerName, barcodePrintPreferences.printMode, barcodePrintPreferences.startTab]);

    const activeBarcodeStudioTab = useMemo(
        () => BARCODE_STUDIO_TABS.find((tab) => tab.id === barcodeStudioTab) || BARCODE_STUDIO_TABS[0],
        [barcodeStudioTab]
    );

    // Search results
    const filteredResults = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const q = searchQuery.toLowerCase();
        return allAvailableProducts.filter(p => 
            p.name.toLowerCase().includes(q) || 
            (p.barcode && p.barcode.toLowerCase().includes(q)) ||
            (p.sku && p.sku.toLowerCase().includes(q))
        ).slice(0, 10);
    }, [searchQuery, allAvailableProducts]);

    // Close results on click outside
    useEffect(() => {
        const handleClick = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setShowResults(false);
            }
        };
        window.addEventListener('mousedown', handleClick);
        return () => window.removeEventListener('mousedown', handleClick);
    }, []);

    const addProduct = (p) => {
        if (barcodeStudioProducts.find(item => item.id === p.id)) {
            // Already added? Maybe increment copies per item or just ignore
            setShowResults(false);
            setSearchQuery('');
            return;
        }
        setBarcodeStudioProducts(prev => [...prev, p]);
        setShowResults(false);
        setSearchQuery('');
    };

    const removeProduct = (id) => {
        setBarcodeStudioProducts(prev => prev.filter(p => p.id !== id));
    };

    return (
        <div className="barcode-studio-overlay">
            <style>
                {BARCODE_FONT_OPTIONS.map(f => `@import url('${f.url}');`).join('\n')}
            </style>
            <div className="barcode-studio-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <header className="barcode-studio-header">
                    <div className="barcode-studio-title">
                        <h2>🖨️ استوديو الباركود المحترف</h2>
                        <p>{barcodeStudioProducts.length} منتج | {barcodeStudioRows.length} ملصق فريد</p>
                    </div>

                    <div className="barcode-product-manager" style={{ background: 'transparent', border: 'none', padding: 0 }}>
                        <div className="barcode-search-wrap" ref={searchRef}>
                            <Search className="barcode-search-icon" size={18} />
                            <input
                                type="text"
                                className="barcode-search-input"
                                placeholder="ابحث عن منتج لإضافته..."
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setShowResults(true);
                                }}
                                onFocus={() => setShowResults(true)}
                                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff' }}
                            />
                            {showResults && filteredResults.length > 0 && (
                                <div className="barcode-results-popover" style={{ color: '#000' }}>
                                    {filteredResults.map(p => (
                                        <div key={p.id} className="barcode-result-item" onClick={() => addProduct(p)}>
                                            <Plus size={14} style={{ color: '#0ea5e9' }} />
                                            <div>
                                                <div style={{ fontWeight: 700 }}>{p.name}</div>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>{p.barcode || p.sku || '-'}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <button type="button" className="barcode-studio-close" onClick={closeBarcodeStudio} disabled={barcodePrinting}>
                        <X size={20} />
                    </button>
                </header>

                <section className="barcode-studio-body">
                    {/* Config Sidebar */}
                    <div className="barcode-studio-config">
                        <nav className="barcode-tabs-nav">
                            {BARCODE_STUDIO_TABS.map((tab) => {
                                const Icon = tab.id === 'templates' ? FileText :
                                             tab.id === 'source' ? Database :
                                             tab.id === 'layout' ? Layout :
                                             tab.id === 'design' ? Settings : 
                                             tab.id === 'output' ? Printer : ChevronDown;
                                return (
                                    <button
                                        key={tab.id}
                                        className={`barcode-tab-trigger ${barcodeStudioTab === tab.id ? 'active' : ''}`}
                                        onClick={() => setBarcodeStudioTab(tab.id)}
                                        disabled={barcodePrinting}
                                    >
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                            <Icon size={16} />
                                            {tab.label}
                                        </div>
                                    </button>
                                );
                            })}
                        </nav>

                        <div className="barcode-config-content">
                            {/* Templates tab */}
                            {barcodeStudioTab === 'templates' && (
                                <div className="barcode-config-section">
                                    <h3><FileText size={16} /> القوالب المحفوظة</h3>
                                    <div className="barcode-form-grid">
                                        <div className="barcode-field" style={{ gridColumn: '1 / -1' }}>
                                            <label>اختر قالب</label>
                                            <select
                                                value={activeBarcodeTemplateId}
                                                onChange={(e) => applyBarcodeTemplate(e.target.value)}
                                                disabled={barcodePrinting}
                                            >
                                                <option value="">إعدادات مخصصة</option>
                                                {barcodeTemplates.map((template) => (
                                                    <option key={template.id} value={template.id}>{template.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="barcode-field">
                                            <label>اسم الطابعة</label>
                                            <input
                                                type="text"
                                                value={barcodeTemplatePrinter}
                                                onChange={(e) => setBarcodeTemplatePrinter(e.target.value)}
                                                placeholder="مثال: Zebra ZD220"
                                            />
                                        </div>
                                        <div className="barcode-field">
                                            <label>اسم القالب</label>
                                            <input
                                                type="text"
                                                value={barcodeTemplateName}
                                                onChange={(e) => setBarcodeTemplateName(e.target.value)}
                                                placeholder="اسم لحفظ القالب"
                                            />
                                        </div>
                                    </div>
                                    <div className="barcode-template-actions">
                                        <button className="barcode-btn-light" style={{ flex: 1 }} onClick={saveNewBarcodeTemplate}>حفظ جديد</button>
                                        <button className="barcode-btn-light" style={{ flex: 1 }} onClick={updateBarcodeTemplate} disabled={!activeBarcodeTemplateId}>تحديث</button>
                                        <button className="barcode-btn-light" style={{ color: '#ef4444' }} onClick={deleteBarcodeTemplate} disabled={!activeBarcodeTemplateId}><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            )}

                            {/* Source Tab */}
                            {barcodeStudioTab === 'source' && (
                                <div className="barcode-config-section">
                                    <h3><Database size={16} /> مصدر البيانات</h3>
                                    <div className="barcode-form-grid">
                                        <div className="barcode-field" style={{ gridColumn: '1 / -1' }}>
                                            <label>نوع ونظام الباركود</label>
                                            <select value={barcodeStudioSafeSettings.format} onChange={(e) => setBarcodeSetting('format', e.target.value)}>
                                                <optgroup label="برمجية (Linear - الأكثر استخداماً)">
                                                    {BARCODE_FORMAT_OPTIONS.filter(opt => !['QRCODE', 'DATAMATRIX', 'EAN13', 'EAN8', 'UPC', 'UPCE'].some(v => opt.value.startsWith(v))).map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </optgroup>
                                                <optgroup label="ثنائية الأبعاد (2D)">
                                                    {BARCODE_FORMAT_OPTIONS.filter(opt => ['QRCODE', 'DATAMATRIX'].includes(opt.value)).map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </optgroup>
                                                <optgroup label="التجزئة العالمية (Retail / EAN)">
                                                    {BARCODE_FORMAT_OPTIONS.filter(opt => ['EAN13', 'EAN8', 'EAN5', 'EAN2', 'UPC', 'UPCE'].includes(opt.value)).map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </optgroup>
                                            </select>
                                            <p className="barcode-field-hint">اختر <strong>CODE128</strong> للملصقات العادية، أو <strong>QR Code</strong> للروابط والبيانات الكبيرة.</p>
                                        </div>

                                        <div className="barcode-field" style={{ gridColumn: '1 / -1' }}>
                                            <label>مصدر البيانات (من أين يتم جلب الكود؟)</label>
                                            <div className="barcode-source-cards">
                                                {BARCODE_CODE_SOURCE_OPTIONS.map(opt => (
                                                    <div 
                                                        key={opt.value} 
                                                        className={`barcode-source-card ${barcodeStudioSafeSettings.codeSource === opt.value ? 'selected' : ''}`}
                                                        onClick={() => setBarcodeSetting('codeSource', opt.value)}
                                                    >
                                                        <div className="source-card-title">{opt.label}</div>
                                                        <div className="source-card-desc">
                                                            {opt.value === 'auto' && 'يبحث في باركود المتغير أولاً، ثم المنتج، ثم SKU.'}
                                                            {opt.value === 'variant' && 'يستخدم أكواد الألوان والمقاسات فقط.'}
                                                            {opt.value === 'product' && 'يستخدم باركود المنتج الرئيسي فقط.'}
                                                            {opt.value === 'sku' && 'يستخدم كود SKU كباركود مطبوع.'}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Layout Tab */}
                            {barcodeStudioTab === 'layout' && (
                                <div className="barcode-config-section">
                                    <h3><Layout size={16} /> المقاس والتخطيط</h3>
                                    <div className="barcode-form-grid">
                                        <div className="barcode-field" style={{ gridColumn: '1 / -1' }}>
                                            <label>قوالب جاهزة</label>
                                            <select value={barcodeStudioSafeSettings.presetId} onChange={(e) => applyBarcodePreset(e.target.value)}>
                                                {BARCODE_LABEL_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="barcode-field">
                                            <label>العرض (مم)</label>
                                            <input type="number" value={barcodeStudioSafeSettings.labelWidthMm} onChange={(e) => setBarcodeNumberSetting('labelWidthMm', e.target.value, 20, 120)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>الارتفاع (مم)</label>
                                            <input type="number" value={barcodeStudioSafeSettings.labelHeightMm} onChange={(e) => setBarcodeNumberSetting('labelHeightMm', e.target.value, 15, 90)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>الأعمدة</label>
                                            <input type="number" value={barcodeStudioSafeSettings.columns} onChange={(e) => setBarcodeNumberSetting('columns', e.target.value, 1, 8)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>نسخ لكل صنف</label>
                                            <input type="number" value={barcodeStudioSafeSettings.copiesPerItem} onChange={(e) => setBarcodeNumberSetting('copiesPerItem', e.target.value, 1, 100)} />
                                        </div>
                                        
                                        <div className="barcode-field">
                                            <label>هامش الصفحة (مم)</label>
                                            <input type="number" step="0.5" value={barcodeStudioSafeSettings.pageMarginMm} onChange={(e) => setBarcodeNumberSetting('pageMarginMm', e.target.value, 0, 20)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>حاشية داخلية (مم)</label>
                                            <input type="number" step="0.5" value={barcodeStudioSafeSettings.paddingMm} onChange={(e) => setBarcodeNumberSetting('paddingMm', e.target.value, 0, 10)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>مسافة أفقية (مم)</label>
                                            <input type="number" step="0.1" value={barcodeStudioSafeSettings.gapXMm} onChange={(e) => setBarcodeNumberSetting('gapXMm', e.target.value, 0, 20)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>مسافة رأسية (مم)</label>
                                            <input type="number" step="0.1" value={barcodeStudioSafeSettings.gapYMm} onChange={(e) => setBarcodeNumberSetting('gapYMm', e.target.value, 0, 20)} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Design Tab */}
                            {barcodeStudioTab === 'design' && (
                                <div className="barcode-config-section">
                                    <h3><Settings size={16} /> إعدادات التصميم</h3>
                                    <div className="barcode-form-grid">
                                        <div className="barcode-field">
                                            <label>ارتفاع الكود</label>
                                            <input type="number" value={barcodeStudioSafeSettings.barcodeHeightMm} onChange={(e) => setBarcodeNumberSetting('barcodeHeightMm', e.target.value, 6, 40)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>عرض الخط (px)</label>
                                            <input type="number" step="0.1" value={barcodeStudioSafeSettings.barcodeWidthPx} onChange={(e) => setBarcodeNumberSetting('barcodeWidthPx', e.target.value, 1, 6)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>هامش فوق الباركود (مم)</label>
                                            <input type="number" step="0.1" value={barcodeStudioSafeSettings.barcodeMarginTopMm} onChange={(e) => setBarcodeNumberSetting('barcodeMarginTopMm', e.target.value, 0, 20)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>هامش تحت الباركود (مم)</label>
                                            <input type="number" step="0.1" value={barcodeStudioSafeSettings.barcodeMarginBottomMm} onChange={(e) => setBarcodeNumberSetting('barcodeMarginBottomMm', e.target.value, 0, 20)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>تحريك الباركود أفقي (مم)</label>
                                            <input type="number" step="0.1" value={barcodeStudioSafeSettings.barcodeOffsetXMm} onChange={(e) => setBarcodeNumberSetting('barcodeOffsetXMm', e.target.value, -20, 20)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>تحريك الباركود رأسي (مم)</label>
                                            <input type="number" step="0.1" value={barcodeStudioSafeSettings.barcodeOffsetYMm} onChange={(e) => setBarcodeNumberSetting('barcodeOffsetYMm', e.target.value, -20, 20)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>خط الاسم</label>
                                            <input type="number" value={barcodeStudioSafeSettings.nameFontPx} onChange={(e) => setBarcodeNumberSetting('nameFontPx', e.target.value, 8, 22)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>خط السعر</label>
                                            <input type="number" value={barcodeStudioSafeSettings.priceFontPx} onChange={(e) => setBarcodeNumberSetting('priceFontPx', e.target.value, 8, 22)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>خط التفاصيل</label>
                                            <input type="number" value={barcodeStudioSafeSettings.metaFontPx} onChange={(e) => setBarcodeNumberSetting('metaFontPx', e.target.value, 7, 18)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>مسافة بين العناصر (مم)</label>
                                            <input type="number" step="0.1" value={barcodeStudioSafeSettings.elementGapMm} onChange={(e) => setBarcodeNumberSetting('elementGapMm', e.target.value, 0, 12)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>ارتفاع سطر الاسم</label>
                                            <input type="number" step="0.05" value={barcodeStudioSafeSettings.nameLineHeight} onChange={(e) => setBarcodeNumberSetting('nameLineHeight', e.target.value, 0.8, 2)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>ارتفاع سطر التفاصيل</label>
                                            <input type="number" step="0.05" value={barcodeStudioSafeSettings.metaLineHeight} onChange={(e) => setBarcodeNumberSetting('metaLineHeight', e.target.value, 0.8, 2)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>ارتفاع سطر السعر</label>
                                            <input type="number" step="0.05" value={barcodeStudioSafeSettings.priceLineHeight} onChange={(e) => setBarcodeNumberSetting('priceLineHeight', e.target.value, 0.8, 2)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>تحريك النص أفقي (مم)</label>
                                            <input type="number" step="0.1" value={barcodeStudioSafeSettings.textOffsetXMm} onChange={(e) => setBarcodeNumberSetting('textOffsetXMm', e.target.value, -20, 20)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>تحريك النص رأسي (مم)</label>
                                            <input type="number" step="0.1" value={barcodeStudioSafeSettings.textOffsetYMm} onChange={(e) => setBarcodeNumberSetting('textOffsetYMm', e.target.value, -20, 20)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>المحاذاة</label>
                                            <select value={barcodeStudioSafeSettings.textAlign} onChange={(e) => setBarcodeSetting('textAlign', e.target.value)}>
                                                <option value="center">وسط</option>
                                                <option value="right">يمين</option>
                                                <option value="left">يسار</option>
                                            </select>
                                        </div>
                                        <div className="barcode-field">
                                            <label>مكان المحتوى داخل الملصق</label>
                                            <select value={barcodeStudioSafeSettings.contentVerticalAlign} onChange={(e) => setBarcodeSetting('contentVerticalAlign', e.target.value)}>
                                                <option value="top">أعلى</option>
                                                <option value="center">وسط</option>
                                                <option value="bottom">أسفل</option>
                                                <option value="space-between">توزيع على الارتفاع</option>
                                            </select>
                                        </div>
                                        <div className="barcode-field">
                                            <label>نوع الخط</label>
                                            <select value={barcodeStudioSafeSettings.fontFamily} onChange={(e) => setBarcodeSetting('fontFamily', e.target.value)}>
                                                {BARCODE_FONT_OPTIONS.map(opt => (
                                                    <option key={opt.value} value={opt.value} style={{ fontFamily: opt.value }}>
                                                        {opt.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="barcode-field">
                                            <label>لون الكود</label>
                                            <input type="color" value={barcodeStudioSafeSettings.lineColor} onChange={(e) => setBarcodeSetting('lineColor', e.target.value)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>خلفية الملصق</label>
                                            <input type="color" value={barcodeStudioSafeSettings.cardBackground} onChange={(e) => setBarcodeSetting('cardBackground', e.target.value)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>لون الإطار</label>
                                            <input type="color" value={barcodeStudioSafeSettings.borderColor} onChange={(e) => setBarcodeSetting('borderColor', e.target.value)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>سمك الإطار (px)</label>
                                            <input type="number" step="0.5" value={barcodeStudioSafeSettings.borderWidthPx} onChange={(e) => setBarcodeNumberSetting('borderWidthPx', e.target.value, 0, 8)} />
                                        </div>
                                        <div className="barcode-field">
                                            <label>انحناء الإطار (مم)</label>
                                            <input type="number" step="0.5" value={barcodeStudioSafeSettings.borderRadiusMm} onChange={(e) => setBarcodeNumberSetting('borderRadiusMm', e.target.value, 0, 12)} />
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '8px', color: '#64748b' }}>إظهار وإخفاء العناصر</div>
                                        <div className="barcode-toggles" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                                            <label className="barcode-toggle-item">
                                                <input type="checkbox" checked={barcodeStudioSafeSettings.showName} onChange={(e) => setBarcodeSetting('showName', e.target.checked)} />
                                                الاسم
                                            </label>
                                            <label className="barcode-toggle-item">
                                                <input type="checkbox" checked={barcodeStudioSafeSettings.showPrice} onChange={(e) => setBarcodeSetting('showPrice', e.target.checked)} />
                                                السعر
                                            </label>
                                            <label className="barcode-toggle-item">
                                                <input type="checkbox" checked={barcodeStudioSafeSettings.showCode} onChange={(e) => setBarcodeSetting('showCode', e.target.checked)} />
                                                الكود
                                            </label>
                                            <label className="barcode-toggle-item">
                                                <input type="checkbox" checked={barcodeStudioSafeSettings.showSku} onChange={(e) => setBarcodeSetting('showSku', e.target.checked)} />
                                                SKU
                                            </label>
                                            <label className="barcode-toggle-item">
                                                <input type="checkbox" checked={barcodeStudioSafeSettings.showVariant} onChange={(e) => setBarcodeSetting('showVariant', e.target.checked)} />
                                                المتغير
                                            </label>
                                            <label className="barcode-toggle-item">
                                                <input type="checkbox" checked={barcodeStudioSafeSettings.showBorder} onChange={(e) => setBarcodeSetting('showBorder', e.target.checked)} />
                                                الإطار
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Output settings */}
                            {barcodeStudioTab === 'output' && (
                                <div className="barcode-config-section">
                                    <h3><Printer size={16} /> خيارات الطباعة والنظام</h3>
                                    
                                    <div className="barcode-form-grid">
                                        <div className="barcode-field" style={{ gridColumn: '1 / -1' }}>
                                            <label>الطابعة الافتراضية للباركود</label>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <select 
                                                    style={{ flex: 1 }}
                                                    value={systemPrinter} 
                                                    onChange={(e) => setSystemPrinter(e.target.value)}
                                                >
                                                    <option value="">استخدام الطابعة العامة</option>
                                                    {printers.map(p => (
                                                        <option key={p.name} value={p.name}>{p.displayName || p.name}</option>
                                                    ))}
                                                </select>
                                                <button 
                                                    className="barcode-btn-light" 
                                                    style={{ padding: '8px' }} 
                                                    onClick={refreshPrinters}
                                                    title="تحديث قائمة الطابعات"
                                                >
                                                    <RefreshCw size={14} className={loadingPrinters ? 'spin' : ''} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="barcode-field" style={{ gridColumn: '1 / -1' }}>
                                            <label>وضع تنفيذ الطباعة</label>
                                            <div className="barcode-toggles">
                                                <label className="barcode-toggle-item">
                                                    <input 
                                                        type="radio" 
                                                        name="sysPrintMode" 
                                                        checked={systemPrintMode === 'preview'} 
                                                        onChange={() => setSystemPrintMode('preview')} 
                                                    />
                                                    معاينة
                                                </label>
                                                <label className="barcode-toggle-item">
                                                    <input 
                                                        type="radio" 
                                                        name="sysPrintMode" 
                                                        checked={systemPrintMode === 'silent'} 
                                                        onChange={() => setSystemPrintMode('silent')} 
                                                    />
                                                    طباعة صامتة
                                                </label>
                                            </div>
                                        </div>

                                        <div className="barcode-field" style={{ gridColumn: '1 / -1' }}>
                                            <label>التبويب الافتراضي عند الفتح</label>
                                            <select 
                                                value={systemStartTab} 
                                                onChange={(e) => setSystemStartTab(e.target.value)}
                                            >
                                                {BARCODE_STUDIO_TABS.map(tab => (
                                                    <option key={tab.id} value={tab.id}>{tab.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <button 
                                            className="barcode-btn-primary" 
                                            style={{ background: '#0f172a' }}
                                            onClick={() => saveBarcodeSystemSettings({
                                                defaultBarcodePrinterName: systemPrinter,
                                                defaultBarcodePrintMode: systemPrintMode,
                                                defaultBarcodeStudioStartTab: systemStartTab,
                                                defaultBarcodeStudioSettings: barcodeStudioSafeSettings
                                            })}
                                        >
                                            <SaveIcon size={16} /> حفظ كإعدادات افتراضية للنظام
                                        </button>
                                        
                                        <button className="barcode-btn-light" onClick={applyBarcodeSystemDefaults}>
                                            استعادة افتراضيات النظام الحالية
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Preview View */}
                    <main className="barcode-studio-view">
                        <div className="barcode-view-toolbar">
                            <div className="barcode-view-info">
                                <Info size={14} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '4px' }} />
                                أول {barcodePreview.labels.length} ملصق للعرض فقط
                            </div>
                            <div className="barcode-view-actions">
                                <button className="barcode-btn-light" onClick={resetBarcodeStudioSettings} style={{ padding: '8px 14px' }}>
                                    <RefreshCw size={14} /> استعادة
                                </button>
                            </div>
                        </div>

                        <div className="barcode-preview-scroll">
                            {barcodePreview.labels.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '100px', color: '#64748b' }}>
                                    <AlertCircle size={48} style={{ opacity: 0.3, marginBottom: '20px' }} />
                                    <h3>لا توجد ملصقات صالحة</h3>
                                    <p>أضف منتجاً له باركود أو SKU للبدء</p>
                                </div>
                            ) : (
                                <div 
                                    className="barcode-preview-container"
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: `repeat(${barcodeStudioSafeSettings.columns}, auto)`,
                                        gap: `${barcodeStudioSafeSettings.gapYMm}mm ${barcodeStudioSafeSettings.gapXMm}mm`,
                                        padding: `${barcodeStudioSafeSettings.pageMarginMm}mm`
                                    }}
                                >
                                    {barcodePreview.labels.map((label, idx) => (
                                        <article
                                            key={`${label.code}-${idx}`}
                                            className="barcode-preview-card"
                                            style={{
                                                width: `${barcodeStudioSafeSettings.labelWidthMm}mm`,
                                                height: `${barcodeStudioSafeSettings.labelHeightMm}mm`,
                                                background: barcodeStudioSafeSettings.cardBackground,
                                                border: barcodeStudioSafeSettings.showBorder && barcodeStudioSafeSettings.borderWidthPx > 0 ? `${barcodeStudioSafeSettings.borderWidthPx}px solid ${barcodeStudioSafeSettings.borderColor}` : 'none',
                                                borderRadius: `${barcodeStudioSafeSettings.borderRadiusMm}mm`,
                                                textAlign: barcodeStudioSafeSettings.textAlign,
                                                fontFamily: barcodeStudioSafeSettings.fontFamily,
                                                padding: `${barcodeStudioSafeSettings.paddingMm}mm`,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                justifyContent: {
                                                    top: 'flex-start',
                                                    center: 'center',
                                                    bottom: 'flex-end',
                                                    'space-between': 'space-between'
                                                }[barcodeStudioSafeSettings.contentVerticalAlign] || 'center',
                                                gap: `${barcodeStudioSafeSettings.elementGapMm}mm`,
                                                boxSizing: 'border-box',
                                                position: 'relative',
                                                overflow: 'hidden'
                                            }}
                                        >
                                            {/* Quick remove (only in preview) */}
                                            {idx < barcodeStudioProducts.length && (
                                                <button 
                                                    className="barcode-card-remove" 
                                                    onClick={(e) => { e.stopPropagation(); removeProduct(barcodeStudioProducts[idx].id); }}
                                                    style={{ position: 'absolute', top: '2px', left: '2px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                                >
                                                    <X size={10} />
                                                </button>
                                            )}

                                            {barcodeStudioSafeSettings.showName && (
                                                <div style={{ fontSize: `${barcodeStudioSafeSettings.nameFontPx}px`, fontWeight: 800, lineHeight: barcodeStudioSafeSettings.nameLineHeight, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transform: `translate(${barcodeStudioSafeSettings.textOffsetXMm}mm, ${barcodeStudioSafeSettings.textOffsetYMm}mm)` }}>
                                                    {label.name}
                                                </div>
                                            )}
                                            <div 
                                                className="barcode-svg-wrap" 
                                                style={{ width: '100%', height: `${barcodeStudioSafeSettings.barcodeHeightMm}mm`, marginTop: `${barcodeStudioSafeSettings.barcodeMarginTopMm}mm`, marginBottom: `${barcodeStudioSafeSettings.barcodeMarginBottomMm}mm`, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `translate(${barcodeStudioSafeSettings.barcodeOffsetXMm}mm, ${barcodeStudioSafeSettings.barcodeOffsetYMm}mm)` }}
                                                dangerouslySetInnerHTML={{ __html: label.barcodeSvg }} 
                                            />
                                            {barcodeStudioSafeSettings.showCode && (
                                                <div style={{ fontSize: `${barcodeStudioSafeSettings.metaFontPx}px`, lineHeight: barcodeStudioSafeSettings.metaLineHeight, transform: `translate(${barcodeStudioSafeSettings.textOffsetXMm}mm, ${barcodeStudioSafeSettings.textOffsetYMm}mm)` }}>{label.code}</div>
                                            )}
                                            {barcodeStudioSafeSettings.showPrice && (
                                                <div style={{ fontSize: `${barcodeStudioSafeSettings.priceFontPx}px`, fontWeight: 800, lineHeight: barcodeStudioSafeSettings.priceLineHeight, color: '#059669', transform: `translate(${barcodeStudioSafeSettings.textOffsetXMm}mm, ${barcodeStudioSafeSettings.textOffsetYMm}mm)` }}>
                                                    {Number(label.price || 0).toFixed(2)} ج.م
                                                </div>
                                            )}
                                        </article>
                                    ))}
                                </div>
                            )}
                        </div>
                    </main>
                </section>

                {/* Footer */}
                <footer className="barcode-studio-footer">
                    <div className="barcode-stats">
                        <span style={{ fontSize: '13px', fontWeight: 800, color: '#334155', background: '#f1f5f9', padding: '6px 12px', borderRadius: '8px' }}>
                            إجمالي الملصقات: {barcodeStudioRows.length * barcodeStudioSafeSettings.copiesPerItem}
                        </span>
                    </div>
                    <div className="barcode-footer-buttons">
                        <button className="barcode-btn-light" onClick={closeBarcodeStudio} disabled={barcodePrinting}>إلغاء</button>
                        <button className="barcode-btn-light" onClick={executeBarcodeStudioPdfExport} disabled={barcodePrinting}>
                            <FileText size={16} /> تصدير PDF
                        </button>
                        <button className="barcode-btn-primary" onClick={executeBarcodeStudioPrint} disabled={barcodePrinting || barcodePreview.labels.length === 0}>
                            {barcodePrinting ? <RefreshCw size={16} className="spin" /> : <Printer size={18} />}
                            {barcodePrinting ? 'جاري المعالجة...' : 'بدء الطباعة الآن'}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
}

