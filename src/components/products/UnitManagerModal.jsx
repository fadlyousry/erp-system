import React, { useState } from 'react';
import { X, Plus, Edit2, Trash2, Save, Ruler } from 'lucide-react';

export default function UnitManagerModal({ isOpen, onClose, units, onUpdateUnits }) {
    const [editingIndex, setEditingIndex] = useState(null);
    const [editValue, setEditValue] = useState('');
    const [newValue, setNewValue] = useState('');

    if (!isOpen) return null;

    const handleAdd = () => {
        const val = String(newValue || '').trim();
        if (!val) return;
        if (units.some(u => u.toLowerCase() === val.toLowerCase())) return;

        const nextUnits = [...units, val];
        onUpdateUnits(nextUnits);
        setNewValue('');
    };

    const handleSaveEdit = (index) => {
        const val = String(editValue || '').trim();
        if (!val) return;

        if (units.some((u, i) => i !== index && u.toLowerCase() === val.toLowerCase())) return;

        const nextUnits = [...units];
        nextUnits[index] = val;
        onUpdateUnits(nextUnits);
        setEditingIndex(null);
    };

    const handleDelete = (index) => {
        const nextUnits = units.filter((_, i) => i !== index);
        onUpdateUnits(nextUnits);
    };

    return (
        <div className="product-modal-overlay" style={{ zIndex: 11000 }}>
            <div className="product-modal" onClick={e => e.stopPropagation()} style={{ width: '420px', height: 'auto', maxHeight: '90vh' }}>
                <div className="product-modal-header">
                    <div>
                        <h2><Ruler size={20} style={{ marginLeft: '8px', verticalAlign: 'middle' }} /> لإدارة الوحدات</h2>
                        <p>إضافة، تعديل، وحذف وحدات القياس</p>
                    </div>
                    <button type="button" className="close-button" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="product-modal-body" style={{ gap: '16px' }}>
                    <div className="field-with-button">
                        <input
                            type="text"
                            className="form-input"
                            placeholder="مثال: دزينة، متر مكعب..."
                            value={newValue}
                            onChange={e => setNewValue(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        />
                        <button type="button" className="btn-save" onClick={handleAdd} style={{ width: 'auto', minWidth: '90px', justifyContent: 'center' }}>
                            <Plus size={16} /> إضافة
                        </button>
                    </div>

                    <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
                        {units.map((u, index) => (
                            <div 
                                key={index} 
                                style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'space-between', 
                                    padding: '10px 14px', 
                                    borderRadius: '12px',
                                    background: '#fff',
                                    border: '1px solid #e2e8f0',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                }}
                            >
                                {editingIndex === index ? (
                                    <div className="field-with-button" style={{ flex: 1 }}>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={editValue}
                                            onChange={e => setEditValue(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleSaveEdit(index)}
                                            autoFocus
                                            style={{ padding: '6px 10px' }}
                                        />
                                        <button type="button" className="btn-icon" onClick={() => handleSaveEdit(index)} style={{ color: '#0f766e', border: 'none', background: '#ecfeff' }}>
                                            <Save size={16} />
                                        </button>
                                        <button type="button" className="btn-icon" onClick={() => setEditingIndex(null)} style={{ border: 'none' }}>
                                            <X size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0ea5e9' }}></div>
                                            <span style={{ fontWeight: '700', color: '#1e293b', fontSize: '14px' }}>{u}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button 
                                                type="button" 
                                                className="btn-icon" 
                                                onClick={() => { setEditingIndex(index); setEditValue(u); }}
                                                style={{ border: 'none', background: '#f8fafc' }}
                                            >
                                                <Edit2 size={15} />
                                            </button>
                                            <button 
                                                type="button" 
                                                className="delete-btn" 
                                                onClick={() => handleDelete(index)}
                                                style={{ width: '32px', height: '32px' }}
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                        
                        {units.length === 0 && (
                            <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '13px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                                <Ruler size={24} style={{ display: 'block', margin: '0 auto 10px', opacity: '0.4' }} />
                                لا توجد وحدات مخصصة حالياً
                            </div>
                        )}
                    </div>
                </div>

                <div className="product-modal-footer">
                    <button type="button" className="btn-cancel" onClick={onClose} style={{ width: '100%', justifyContent: 'center' }}>إغلاق</button>
                </div>
            </div>
        </div>
    );
}
