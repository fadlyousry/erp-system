import React, { useState } from 'react';
import { X, Plus, Trash2, Tag, FileText, Palette, LayoutList, Pencil } from 'lucide-react';
import { DEFAULT_CATEGORY } from '../../utils/productUtils';

export default function CategoryModal({ isOpen, onClose, categories, onSave, onDelete }) {
    const [categoryForm, setCategoryForm] = useState(() => ({
        ...DEFAULT_CATEGORY,
        icon: ''
    }));

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!categoryForm.name.trim()) return;
        await onSave({ ...categoryForm, icon: '' });
        setCategoryForm({ ...DEFAULT_CATEGORY, icon: '' });
    };

    const handleEditStart = (category) => {
        setCategoryForm({
            id: category.id,
            name: category.name || '',
            color: category.color || '#0f766e',
            description: category.description || '',
            icon: ''
        });
    };

    const handleCancelEdit = () => {
        setCategoryForm({ ...DEFAULT_CATEGORY, icon: '' });
    };

    return (
        <div style={{
            position: 'absolute',
            inset: 0,
            background: 'transparent',
            backdropFilter: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100
        }}>
            <div style={{
                width: 'min(500px, 95%)',
                height: 'auto',
                maxHeight: '80vh',
                background: '#ffffff',
                border: '2px solid #475569',
                borderRadius: '24px',
                boxShadow: '0 30px 70px -10px rgba(15, 23, 42, 0.45), 0 15px 35px -15px rgba(15, 23, 42, 0.3)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                fontFamily: '"Cairo", "Tajawal", "Segoe UI", sans-serif',
                direction: 'rtl'
            }} onClick={(e) => e.stopPropagation()}>
                
                {/* Modal Header */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 20px',
                    borderBottom: '1px solid #334155',
                    background: '#1e293b',
                    flexShrink: 0
                }}>
                    <div>
                        <h2 style={{
                            margin: 0,
                            fontSize: '18px',
                            fontWeight: 800,
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            إدارة فئات المنتجات
                        </h2>
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                            تصنيف المنتجات لتسهيل عملية البحث والجرد
                        </p>
                    </div>
                    <button 
                        type="button" 
                        onClick={onClose}
                        style={{
                            background: '#334155',
                            border: 'none',
                            borderRadius: '8px',
                            width: '32px',
                            height: '32px',
                            display: 'grid',
                            placeItems: 'center',
                            color: '#cbd5e1',
                            cursor: 'pointer'
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Modal Body */}
                <div style={{
                    overflowY: 'auto',
                    flex: 1,
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px'
                }}>
                    
                    {/* Form Section */}
                    <div style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '16px',
                        padding: '14px'
                    }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontWeight: 700, fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Tag size={13} style={{ color: '#0f766e' }} /> اسم الفئة
                                </span>
                                <input 
                                    type="text" 
                                    className="form-input"
                                    value={categoryForm.name} 
                                    onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))} 
                                    placeholder="مثال: أحذية، إلكترونيات..."
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '8px',
                                        fontSize: '13px',
                                        fontFamily: 'inherit',
                                        background: '#ffffff'
                                    }}
                                />
                            </label>

                            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontWeight: 700, fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Palette size={13} style={{ color: '#0f766e' }} /> اللون المميز
                                </span>
                                <div style={{ display: 'flex', gap: '10px', height: '36px', alignItems: 'center' }}>
                                    {['#0f766e', '#2563eb', '#16a34a', '#d97706', '#dc2626'].map(color => (
                                        <button
                                            key={color}
                                            type="button"
                                            onClick={() => setCategoryForm(p => ({ ...p, color }))}
                                            style={{
                                                width: '28px',
                                                height: '28px',
                                                borderRadius: '50%',
                                                backgroundColor: color,
                                                border: categoryForm.color?.toLowerCase() === color ? '2px solid #ffffff' : '2px solid transparent',
                                                boxShadow: categoryForm.color?.toLowerCase() === color ? `0 0 0 2px ${color}` : '0 1px 3px rgba(0,0,0,0.15)',
                                                cursor: 'pointer',
                                                padding: 0,
                                                transition: 'all 0.2s'
                                            }}
                                        />
                                    ))}
                                </div>
                            </label>

                            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: 'span 2' }}>
                                <span style={{ fontWeight: 700, fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <FileText size={13} style={{ color: '#0f766e' }} /> الوصف (اختياري)
                                </span>
                                <input 
                                    type="text" 
                                    className="form-input"
                                    value={categoryForm.description || ''} 
                                    onChange={(e) => setCategoryForm((p) => ({ ...p, description: e.target.value }))} 
                                    placeholder="وصف مختصر للقسم..."
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '8px',
                                        fontSize: '13px',
                                        fontFamily: 'inherit',
                                        background: '#ffffff'
                                    }}
                                />
                            </label>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                            <button 
                                type="button" 
                                onClick={handleSave}
                                disabled={!categoryForm.name.trim()}
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    background: '#1e293b',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    cursor: categoryForm.name.trim() ? 'pointer' : 'not-allowed',
                                    opacity: categoryForm.name.trim() ? 1 : 0.6
                                }}
                            >
                                <Plus size={16} /> {categoryForm.id ? 'حفظ التعديلات' : 'إضافة فئة جديدة'}
                            </button>
                            {categoryForm.id && (
                                <button 
                                    type="button" 
                                    onClick={handleCancelEdit}
                                    style={{
                                        padding: '10px 14px',
                                        background: '#f1f5f9',
                                        color: '#475569',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '8px',
                                        fontSize: '13px',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    إلغاء التعديل
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Categories List Section */}
                    <div style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <div style={{
                            padding: '10px 14px',
                            background: '#f8fafc',
                            borderBottom: '1px solid #e2e8f0',
                            fontWeight: 800,
                            fontSize: '12px',
                            color: '#475569',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            flexShrink: 0
                        }}>
                            <LayoutList size={13} style={{ color: '#0f766e' }} /> الفئات الحالية ({categories.length})
                        </div>
                        
                        {/* Scrollable category items */}
                        <div style={{
                            maxHeight: '160px',
                            overflowY: 'auto',
                            background: '#ffffff'
                        }}>
                            {categories.length === 0 ? (
                                <div style={{ padding: '30px 14px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                                    لا توجد فئات مضافة بعد في هذا المتجر
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gap: '1px', background: '#f1f5f9' }}>
                                    {categories.map((c) => (
                                        <div 
                                            key={c.id} 
                                            style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'space-between', 
                                                padding: '8px 14px', 
                                                background: '#ffffff'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                {/* Category color bullet */}
                                                <div style={{ 
                                                    width: '10px', 
                                                    height: '10px', 
                                                    borderRadius: '50%', 
                                                    backgroundColor: c.color || '#64748b',
                                                    border: '1px solid rgba(0, 0, 0, 0.15)',
                                                    flexShrink: 0
                                                }} />
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                                    <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '13px' }}>{c.name}</span>
                                                    {c.description && (
                                                        <span style={{ fontSize: '11px', color: '#64748b' }}>{c.description}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <button 
                                                    type="button" 
                                                    onClick={() => handleEditStart(c)}
                                                    title="تعديل الفئة"
                                                    style={{
                                                        width: '28px',
                                                        height: '28px',
                                                        display: 'grid',
                                                        placeItems: 'center',
                                                        padding: 0,
                                                        borderRadius: '6px',
                                                        background: '#f8fafc',
                                                        color: '#475569',
                                                        border: '1px solid #e2e8f0',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <Pencil size={13} />
                                                </button>
                                                <button 
                                                    type="button" 
                                                    onClick={() => onDelete(c.id, c.name)}
                                                    title="حذف الفئة"
                                                    style={{
                                                        width: '28px',
                                                        height: '28px',
                                                        display: 'grid',
                                                        placeItems: 'center',
                                                        padding: 0,
                                                        borderRadius: '6px',
                                                        background: '#fef2f2',
                                                        color: '#ef4444',
                                                        border: '1px solid #fee2e2',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                </div>



            </div>
        </div>
    );
}
