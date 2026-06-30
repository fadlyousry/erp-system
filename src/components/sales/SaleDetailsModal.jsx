import React, { memo } from 'react';
import { FileText, Calendar, User, CreditCard, Tag, X, CheckCircle, Receipt, ArrowDownToLine, Scale } from 'lucide-react';
import './SaleDetailsModal.css';

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
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
  
  const totalItemsValue = items.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0);
  const isPaid = (sale.remainingAmount || 0) <= 0;
  const isPartial = (sale.paidAmount || 0) > 0 && (sale.remainingAmount || 0) > 0;

  return (
    <div className="premium-sale-modal-overlay" onClick={onClose}>
      <div className="premium-sale-modal" onClick={(event) => event.stopPropagation()}>
        <div className="premium-sale-modal-header">
          <div className="premium-sale-modal-title">
            <h2>تفاصيل الفاتورة #{formatInteger(sale.id)}</h2>
            <div className={`premium-status-badge ${isPaid ? 'status-paid' : isPartial ? 'status-partial' : 'status-unpaid'}`}>
              {isPaid ? <CheckCircle size={16} /> : <Receipt size={16} />}
              {isPaid ? 'خالصة' : isPartial ? 'مدفوعة جزئياً' : 'آجلة'}
            </div>
          </div>
          <button className="premium-sale-modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="premium-sale-modal-body">
          <div className="premium-info-grid">
            <div className="premium-info-card">
              <div className="premium-info-icon"><Calendar size={20} /></div>
              <div className="premium-info-content">
                <span className="premium-info-label">تاريخ الفاتورة</span>
                <span className="premium-info-value" dir="ltr">{formatDateTime(getSaleDate(sale))}</span>
              </div>
            </div>
            <div className="premium-info-card">
              <div className="premium-info-icon"><User size={20} /></div>
              <div className="premium-info-content">
                <span className="premium-info-label">العميل</span>
                <span className="premium-info-value">{sale.customer?.name || 'عميل نقدي'}</span>
              </div>
            </div>
            <div className="premium-info-card">
              <div className="premium-info-icon"><CreditCard size={20} /></div>
              <div className="premium-info-content">
                <span className="premium-info-label">طريقة الدفع</span>
                <span className="premium-info-value">{sale.payment || sale.paymentMethod?.name || '-'}</span>
              </div>
            </div>
            <div className="premium-info-card">
              <div className="premium-info-icon"><Tag size={20} /></div>
              <div className="premium-info-content">
                <span className="premium-info-label">نوع البيع</span>
                <span className="premium-info-value">{sale.saleType || '-'}</span>
              </div>
            </div>
          </div>

          <div className="premium-table-container">
            <table className="premium-table">
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
                    <td colSpan={6} style={{ textAlign: 'center', color: '#64748b' }}>جاري تحميل التفاصيل...</td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: '#64748b' }}>لا توجد أصناف في الفاتورة</td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={`${item.saleId || sale.id}-${item.id}-${item.variantId}`}>
                      <td>{item.variant?.product?.name || 'منتج'}</td>
                      <td>{item.variant?.productSize || '-'}</td>
                      <td>{item.variant?.color || '-'}</td>
                      <td>{formatInteger(item.quantity)}</td>
                      <td>{formatMoney(item.price)} ج.م</td>
                      <td style={{ fontWeight: 'bold', color: '#0f172a' }}>{formatMoney((item.price || 0) * (item.quantity || 0))} ج.م</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="premium-summary-section">
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {sale.notes && (
                <div className="premium-notes-container">
                  <div className="premium-notes-title"><FileText size={18} /> ملاحظات الفاتورة</div>
                  <div className="premium-notes-text">{sale.notes}</div>
                </div>
              )}
              {sale.customer && (
                <div className="premium-customer-balance">
                  <div className="premium-balance-row">
                    <span title="الرصيد السابق مقدر بناءً على الرصيد الحالي والمتبقي من الفاتورة">الرصيد السابق (تقديري):</span>
                    <span>{formatMoney((sale.customer.balance || 0) - (sale.remainingAmount || 0))} ج.م</span>
                  </div>
                  <div className="premium-balance-row current">
                    <span>الرصيد الحالي للعميل:</span>
                    <span>{formatMoney(sale.customer.balance || 0)} ج.م</span>
                  </div>
                </div>
              )}
              {sale.createdByUser && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '13px' }}>
                  <User size={16} /> <span>بواسطة: {sale.createdByUser.name}</span>
                </div>
              )}
            </div>

            <div className="premium-totals-card">
              <div className="premium-total-row">
                <span>إجمالي الأصناف:</span>
                <span>{formatMoney(totalItemsValue)} ج.م</span>
              </div>
              
              {sale.discount > 0 && (
                <div className="premium-total-row discount">
                  <span>خصم إضافي:</span>
                  <span>- {formatMoney(sale.discount)} ج.م</span>
                </div>
              )}
              {sale.couponDiscount > 0 && (
                <div className="premium-total-row coupon">
                  <span>خصم الكوبون ({sale.coupon?.code || 'نشط'}):</span>
                  <span>- {formatMoney(sale.couponDiscount)} ج.م</span>
                </div>
              )}

              <div className="premium-total-divider"></div>

              <div className="premium-total-final">
                <span>الصافي:</span>
                <span>{formatMoney(sale.total)} ج.م</span>
              </div>

              <div className="premium-payment-status">
                <div className="premium-payment-row paid">
                  <span><ArrowDownToLine size={16} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '4px' }}/>المدفوع:</span>
                  <span>{formatMoney(sale.paidAmount || 0)} ج.م</span>
                </div>
                <div className="premium-payment-row remaining">
                  <span><Scale size={16} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '4px' }}/>المتبقي:</span>
                  <span>{formatMoney(sale.remainingAmount || 0)} ج.م</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(SaleDetailsModal);
