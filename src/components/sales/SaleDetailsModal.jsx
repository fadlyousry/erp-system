import React, { memo } from 'react';

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatMoney = (value) => Number(value || 0).toLocaleString('ar-EG', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});
const formatInteger = (value) => Number(value || 0).toLocaleString('ar-EG');
const getSaleDate = (sale) => sale?.invoiceDate || sale?.createdAt;

function SaleDetailsModal({ sale, onClose }) {
  if (!sale) return null;

  const isLoadingDetails = Boolean(sale?.isLoadingDetails);
  const items = Array.isArray(sale?.items) ? sale.items : [];

  return (
    <div className="sales-modal-overlay" onClick={onClose}>
      <div className="sales-modal" onClick={(event) => event.stopPropagation()}>
        <div className="sales-modal-header">
          <h2>تفاصيل الفاتورة #{formatInteger(sale.id)}</h2>
          <button className="sales-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="sales-modal-meta">
          <div><strong>التاريخ:</strong> {formatDateTime(getSaleDate(sale))}</div>
          <div><strong>العميل:</strong> {sale.customer?.name || 'عميل نقدي'}</div>
          <div><strong>طريقة الدفع:</strong> {sale.payment || sale.paymentMethod?.name || '-'}</div>
          <div><strong>نوع البيع:</strong> {sale.saleType || '-'}</div>
        </div>

        <div className="sales-modal-table-wrap">
          <table className="sales-modal-table">
            <thead>
              <tr>
                <th>الصنف</th>
                <th>المقاس</th>
                <th>اللون</th>
                <th>الكمية</th>
                <th>السعر</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingDetails ? (
                <tr>
                  <td colSpan={6} className="sales-empty-state">جاري تحميل التفاصيل...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="sales-empty-state">لا توجد أصناف في الفاتورة</td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={`${item.saleId || sale.id}-${item.id}-${item.variantId}`}>
                    <td>{item.variant?.product?.name || 'منتج'}</td>
                    <td>{item.variant?.productSize || '-'}</td>
                    <td>{item.variant?.color || '-'}</td>
                    <td>{formatInteger(item.quantity)}</td>
                    <td>{formatMoney(item.price)}</td>
                    <td>{formatMoney((item.price || 0) * (item.quantity || 0))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="sales-modal-total-breakdown" style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid #e2e8f0', paddingTop: '12px', marginTop: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#475569' }}>
            <span>إجمالي الأصناف:</span>
            <span>{formatMoney(items.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0))} ج.م</span>
          </div>
          
          {sale.discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#ef4444' }}>
              <span>خصم إضافي:</span>
              <span>- {formatMoney(sale.discount)} ج.م</span>
            </div>
          )}
          {sale.couponDiscount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#7c3aed', fontWeight: 'bold' }}>
              <span>خصم الكوبون ({sale.coupon?.code || 'نشط'}):</span>
              <span>- {formatMoney(sale.couponDiscount)} ج.م</span>
            </div>
          )}
          <div className="sales-modal-total" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 'bold', color: '#0f766e', borderTop: '2px solid #cbd5e1', paddingTop: '8px', marginTop: '4px', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>
            <span>صافي الفاتورة:</span>
            <strong>{formatMoney(sale.total)} ج.م</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', color: '#1e293b', fontWeight: 'bold' }}>
            <span>المدفوع:</span>
            <span style={{ color: '#059669' }}>{formatMoney(sale.paidAmount || 0)} ج.م</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', color: '#1e293b', fontWeight: 'bold' }}>
            <span>المتبقي:</span>
            <span style={{ color: '#dc2626' }}>{formatMoney(sale.remainingAmount || 0)} ج.م</span>
          </div>

          {sale.customer && (
            <div style={{ marginTop: '8px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b' }}>
                <span title="الرصيد السابق مقدر بناءً على الرصيد الحالي والمتبقي من الفاتورة">الرصيد السابق للعميل (تقديري):</span>
                <span>{formatMoney((sale.customer.balance || 0) - (sale.remainingAmount || 0))} ج.م</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#334155', fontWeight: 'bold' }}>
                <span>الرصيد الحالي للعميل:</span>
                <span>{formatMoney(sale.customer.balance || 0)} ج.م</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(SaleDetailsModal);
