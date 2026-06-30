import {
  escapeHtml, toNumber, commonA4Styles,
  renderA4Header, renderFooter, getSaleDate, calculateSaleFinancials
} from '../../../shared/helpers';

export const renderA5Modern = ({ sale, customer, company, pageSize = 'A5' }) => {
  const safeSale = sale || {};
  const safeCustomer = customer || safeSale?.customer || null;
  const { items, subTotal, itemsDiscount, invoiceDiscount, finalTotal, paidAmount, remaining } = calculateSaleFinancials(safeSale);

  const saleType = escapeHtml(safeSale?.saleType || (remaining > 0 ? 'آجل' : 'نقدي'));
  const saleId = escapeHtml(safeSale?.id || '-');
  const customerName = escapeHtml(safeCustomer?.name || 'عميل نقدي');
  const saleDate = new Date(getSaleDate(safeSale)).toLocaleString('ar-EG');
  const printedAt = new Date().toLocaleString('ar-EG');
  const accentColor = '#6366f1';

  const rowsHtml = items.map((item, index) => {
    const name = escapeHtml(item?.variant?.product?.name || item?.productName || 'صنف');
    const quantity = toNumber(item?.quantity);
    const price = toNumber(item?.price);
    const lineTotal = Math.max(0, (price - toNumber(item?.discount)) * quantity);
    return `
      <tr>
        <td style="color: #64748b;">${index + 1}</td>
        <td style="font-weight: 600;">${name}</td>
        <td class="text-center">${quantity}</td>
        <td class="text-center">${price.toFixed(2)}</td>
        <td class="text-left font-bold">${lineTotal.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>فاتورة بيع رقم ${saleId}</title>
  <style>
    ${commonA4Styles(pageSize)}
    .container { padding: 8mm; border-top: 5px solid ${accentColor}; border-radius: 0 0 8px 8px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; }
    .company-name { font-size: 18px; font-weight: 800; color: #1e293b; }
    .invoice-label { background: ${accentColor}; color: white; padding: 2px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; }
    
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; background: #f8fafc; padding: 10px; border-radius: 8px; margin-bottom: 15px; }
    .meta-item strong { color: ${accentColor}; }
    
    table { font-size: 11px; border: none; }
    th { background: #f1f5f9; color: #475569; padding: 8px; border: none; }
    th:first-child { border-radius: 6px 0 0 6px; }
    th:last-child { border-radius: 0 6px 6px 0; }
    td { padding: 8px; border-bottom: 1px solid #f1f5f9; }
    
    .footer-section { display: flex; justify-content: flex-end; margin-top: 15px; }
    .totals-box { width: 180px; background: #1e293b; color: white; padding: 10px; border-radius: 10px; font-size: 12px; }
    .total-row { display: flex; justify-content: space-between; padding: 3px 0; }
    .total-row.final { border-top: 1px solid rgba(255,255,255,0.1); margin-top: 5px; padding-top: 5px; color: ${accentColor}; font-weight: 800; font-size: 14px; }
    
    .text-center { text-align: center; }
    .text-left { text-align: left; }
    .font-bold { font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
        <div>
            <div class="company-name">${escapeHtml(company.name)}</div>
            <div style="font-size: 9px; color: #64748b;">${escapeHtml(company.address)}</div>
        </div>
        <div style="text-align: left;">
            <div class="invoice-label">#${saleId}</div>
            <div style="font-size: 10px; color: #64748b; margin-top: 4px;">${escapeHtml(saleDate)}</div>
        </div>
    </div>

    <div class="meta-grid">
        <div class="meta-item"><strong>العميل:</strong> ${customerName}</div>
        <div class="meta-item"><strong>طريقة الدفع:</strong> ${saleType}</div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:25px;">#</th>
          <th style="text-align: right;">الصنف</th>
          <th class="text-center">ق</th>
          <th class="text-center">سعر</th>
          <th class="text-left">إجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="footer-section">
        <div class="totals-box">
            <div class="total-row"><span>المجموع:</span><span>${subTotal.toFixed(2)}</span></div>
            ${invoiceDiscount > 0 ? `<div class="total-row"><span>خصم:</span><span>-${invoiceDiscount.toFixed(2)}</span></div>` : ''}
            <div class="total-row final"><span>المطلوب:</span><span>${remaining > 0 ? remaining.toFixed(2) : 'مدفوع'}</span></div>
        </div>
    </div>
    
    <div style="text-align: center; font-size: 8px; color: #94a3b8; margin-top: 15px;">شكراً لتعاملكم معنا</div>
  </div>
</body>
</html>
  `.trim();
};
