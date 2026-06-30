import React from 'react';
import { X } from 'lucide-react';

export default function ConfirmModal({ isOpen, title = 'تأكيد', message = '', onConfirm, onCancel }) {
  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
      <div style={{ background: '#fff', width: '100%', maxWidth: 520, borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.2)', overflow: 'hidden' }} onClick={(e)=>e.stopPropagation()}>
        <div style={{ padding: 14, borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa' }}>
          <div style={{ fontWeight: 700 }}>{title}</div>
          <button onClick={onCancel} style={{ background: 'none', border: 0 }}>
            <X size={18} color="#666" />
          </button>
        </div>
        <div style={{ padding: 18 }}>
          {message.split('\n').map((line, idx) => (
            <div key={idx} style={{ marginBottom: idx < message.split('\n').length - 1 ? 8 : 0, color: '#111' }}>{line}</div>
          ))}
        </div>
        <div style={{ padding: 12, display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid #eee' }}>
          <button onClick={onCancel} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff' }}>إلغاء</button>
          <button onClick={onConfirm} style={{ padding: '8px 12px', borderRadius: 6, border: 'none', background: '#10b981', color: '#fff' }}>موافق</button>
        </div>
      </div>
    </div>
  );
}
