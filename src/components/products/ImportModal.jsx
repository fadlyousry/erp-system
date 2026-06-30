import React, { useMemo } from 'react';
import { X, FileSpreadsheet, MapIcon, Info, Play, Wand2 } from 'lucide-react';
import { nText } from '../../utils/productUtils';
import { IMPORT_FIELD_OPTIONS } from '../../utils/importUtils';

/**
 * ImportModal — Presentational component.
 * State (session, mapping) is managed by the parent.
 */
export default function ImportModal({
    session,
    importing,
    onClose,
    onUpdateFieldMapping,
    onApplyAutoMapping,
    onStartImport
}) {
    if (!session) return null;

    const importColumnSamples = useMemo(() => {
        const sampleMap = new Map();
        if (!session?.headers?.length || !session?.rows?.length) return sampleMap;

        const previewRows = session.rows.slice(0, 120);
        session.headers.forEach((header) => {
            for (const row of previewRows) {
                const value = nText(row[header.index]);
                if (value) {
                    sampleMap.set(header.id, value.slice(0, 120));
                    break;
                }
            }
        });

        return sampleMap;
    }, [session]);

    return (
        <div className="product-modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
            <div className="product-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '850px', height: 'auto', maxHeight: '92vh' }}>
                <div className="product-modal-header">
                    <div>
                        <h2><FileSpreadsheet size={20} style={{ marginLeft: '8px', verticalAlign: 'middle' }} /> مطابقة أعمدة الاستيراد</h2>
                        <p>{session.fileName} | {session.rows.length} صف | جاري تهيئة البيانات</p>
                    </div>
                    <button type="button" className="close-button" onClick={onClose} disabled={importing}>
                        <X size={20} />
                    </button>
                </div>

                <div className="product-modal-body" style={{ padding: '0', background: '#f8fafc' }}>
                    <div style={{ padding: '16px 20px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '20px', fontSize: '13px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: '#64748b' }}>عدد الأعمدة:</span>
                            <span style={{ fontWeight: 800, color: '#1e293b' }}>{session.headers.length}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: '#64748b' }}>إجمالي الصفوف:</span>
                            <span style={{ fontWeight: 800, color: '#1e293b' }}>{session.rows.length}</span>
                        </div>
                        <div className="modal-inline-alert" style={{ margin: '0', padding: '4px 12px', background: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0' }}>
                           <Info size={14} />
                           <span>قم بمطابقة عناوين الملف مع حقول النظام الموضحة أدناه.</span>
                        </div>
                    </div>

                    <div style={{ padding: '20px', maxHeight: '500px', overflowY: 'auto' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '12px' }}>
                            {IMPORT_FIELD_OPTIONS.map((field) => {
                                const selectedColumn = session.mapping?.[field.key] ?? '';
                                const sampleValue = selectedColumn ? importColumnSamples.get(selectedColumn) : '';

                                return (
                                    <div 
                                        key={field.key} 
                                        className="form-section" 
                                        style={{ 
                                            padding: '12px', 
                                            border: selectedColumn ? '1px solid #0f766e' : '1px solid #e2e8f0',
                                            background: selectedColumn ? '#f0fdfa' : '#fff'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <span style={{ fontWeight: 700, fontSize: '13px', color: field.required ? '#b91c1c' : '#334155' }}>
                                                {field.label} {field.required && '*'}
                                            </span>
                                            {selectedColumn && <MapIcon size={14} style={{ color: '#0f766e' }} />}
                                        </div>
                                        
                                        <select
                                            className="form-select"
                                            value={selectedColumn}
                                            onChange={(e) => onUpdateFieldMapping(field.key, e.target.value)}
                                            disabled={importing}
                                            style={{ marginBottom: '6px' }}
                                        >
                                            <option value="">{field.required ? '-- اختر عموداً --' : 'تجاهل هذا الحقل'}</option>
                                            {session.headers.map((header) => (
                                                <option key={`${field.key}-${header.id}`} value={header.id}>
                                                    {header.label}
                                                </option>
                                            ))}
                                        </select>
                                        
                                        <div style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {sampleValue ? (
                                                <span><span style={{ fontWeight: 700 }}>معاينة:</span> {sampleValue}</span>
                                            ) : (
                                                'لا توجد معاينة متاحة'
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="product-modal-footer">
                    <button 
                        type="button" 
                        className="btn-cancel" 
                        onClick={onApplyAutoMapping} 
                        disabled={importing}
                        style={{ background: '#f8fafc', border: '1px solid #d8e1ec' }}
                    >
                        <Wand2 size={16} /> مطابقة تلقائية للذكاء
                    </button>
                    <div style={{ flex: 1 }} />
                    <button type="button" className="btn-cancel" onClick={onClose} disabled={importing}>
                        إلغاء
                    </button>
                    <button 
                        type="button" 
                        className="btn-save" 
                        onClick={onStartImport} 
                        disabled={importing}
                        style={{ minWidth: '140px', justifyContent: 'center' }}
                    >
                        {importing ? 'جاري الاستيراد...' : <><Play size={16} /> بدء العملية الآن</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

