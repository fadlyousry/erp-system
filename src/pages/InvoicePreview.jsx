import React from 'react';

export default function InvoicePreview({
  sale,
  onClose,
  onPrint,
  entityLabel = 'العميل',
  invoiceTitle = 'الفاتورة'
}) {
  if (!sale) return null;

  const calculateTotal = () => {
    return sale.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const calculateDiscount = () => {
    return sale.items.reduce((sum, item) => sum + ((item.discount || 0) * item.quantity), 0) + (sale.discount || 0);
  };

  const total = calculateTotal();
  const discount = calculateDiscount();
  const subtotal = total - discount;
  const remaining = subtotal - (sale.paid || 0);

  const invoiceDate = sale.invoiceDate || sale.createdAt;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }} onClick={onClose}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '30px',
        width: '100%',
        maxWidth: '700px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)'
      }} onClick={e => e.stopPropagation()}>

        {/* === Header === */}
        <div style={{ textAlign: 'center', marginBottom: '25px', borderBottom: '2px solid #2563eb', paddingBottom: '15px' }}>
          <h1 style={{ margin: 0, color: '#1e40af', fontSize: '28px' }}>{invoiceTitle}</h1>
          <p style={{ margin: '5px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
            رقم: <span style={{ fontWeight: 'bold', color: '#111827' }}>{sale.id}</span>
          </p>
          <p style={{ margin: '5px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
            التاريخ: <span style={{ fontWeight: 'bold', color: '#111827' }}>
              {new Date(invoiceDate).toLocaleDateString('ar-EG', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          </p>
        </div>

        {/* === Customer Info === */}
        {sale.customer && (
          <div style={{
            backgroundColor: '#eff6ff',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '20px',
            border: '1px solid #bfdbfe'
          }}>
            <h3 style={{ margin: '0 0 8px 0', color: '#1e40af', fontSize: '14px' }}>
              {`بيانات ${entityLabel}`}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
              <div>
                <span style={{ color: '#6b7280' }}>الاسم:</span>
                <span style={{ fontWeight: 'bold', color: '#111827', marginLeft: '8px' }}>{sale.customer.name}</span>
              </div>
              <div>
                <span style={{ color: '#6b7280' }}>الهاتف:</span>
                <span style={{ fontWeight: 'bold', color: '#111827', marginLeft: '8px' }}>{sale.customer.phone || '---'}</span>
              </div>
            </div>
          </div>
        )}

        {/* === Items Table === */}
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          marginBottom: '20px',
          border: '1px solid #e5e7eb'
        }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#4b5563', fontSize: '13px' }}>المنتج</th>
              <th style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', color: '#4b5563', fontSize: '13px' }}>السعر</th>
              <th style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', color: '#4b5563', fontSize: '13px' }}>الكمية</th>
              <th style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', color: '#4b5563', fontSize: '13px' }}>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '10px', textAlign: 'right', fontSize: '13px' }}>
                  <div style={{ fontWeight: 'bold' }}>{item.variant?.product?.name || 'منتج'}</div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>
                    {item.variant?.productSize || ''} / {item.variant?.color || ''}
                  </div>
                </td>
                <td style={{ padding: '10px', textAlign: 'center', fontSize: '13px' }}>
                  {item.price.toFixed(2)} ج.م
                </td>
                <td style={{ padding: '10px', textAlign: 'center', fontSize: '13px' }}>
                  {item.quantity}
                </td>
                <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', fontSize: '13px', color: '#059669' }}>
                  {(item.price * item.quantity).toFixed(2)} ج.م
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* === Summary === */}
        <div style={{
          backgroundColor: '#f9fafb',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #e5e7eb' }}>
            <span style={{ color: '#6b7280' }}>إجمالي المنتجات:</span>
            <span style={{ fontWeight: 'bold', color: '#111827' }}>{total.toFixed(2)} ج.م</span>
          </div>

          {discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #e5e7eb' }}>
              <span style={{ color: '#6b7280' }}>الخصم:</span>
              <span style={{ fontWeight: 'bold', color: '#ef4444' }}>-{discount.toFixed(2)} ج.م</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', paddingBottom: '10px', borderBottom: '2px solid #2563eb', fontSize: '16px' }}>
            <span style={{ fontWeight: 'bold', color: '#1e40af' }}>الإجمالي النهائي:</span>
            <span style={{ fontWeight: 'bold', color: '#1e40af' }}>{subtotal.toFixed(2)} ج.م</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #e5e7eb' }}>
            <span style={{ color: '#6b7280' }}>المدفوع:</span>
            <span style={{ fontWeight: 'bold', color: '#059669' }}>{(sale.paid || 0).toFixed(2)} ج.m</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px' }}>
            <span style={{ fontWeight: 'bold', color: remaining > 0 ? '#dc2626' : '#059669' }}>المتبقي:</span>
            <span style={{ fontWeight: 'bold', color: remaining > 0 ? '#dc2626' : '#059669' }}>
              {Math.max(0, remaining).toFixed(2)} ج.م
            </span>
          </div>
        </div>

        {/* === Payment Info === */}
        <div style={{
          backgroundColor: '#fef3c7',
          padding: '10px',
          borderRadius: '6px',
          marginBottom: '20px',
          border: '1px solid #fcd34d',
          fontSize: '13px',
          color: '#92400e'
        }}>
          <span style={{ fontWeight: 'bold' }}>طريقة الدفع:</span>
          <span style={{ marginLeft: '8px' }}>{sale.payment || 'غير محدد'}</span>
        </div>

        {/* === Action Buttons === */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '12px 20px',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px'
            }}
          >
            إغلاق
          </button>
          <button
            onClick={onPrint}
            style={{
              padding: '12px 20px',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px'
            }}
          >
            🖨️ طباعة
          </button>
        </div>
      </div>
    </div>
  );
}
