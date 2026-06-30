import {
  escapeHtml, toNumber, commonA4Styles,
  renderA4Header, renderFooter, getSaleDate, calculateSaleFinancials
} from '../../../shared/helpers';

export const renderA5Classic = ({ sale, customer, company, pageSize = 'A5' }) => {
  const safeSale = sale || {};
  const safeCustomer = customer || safeSale?.customer || null;
  const { items, subTotal, itemsDiscount, invoiceDiscount, finalTotal, paidAmount, remaining } = calculateSaleFinancials(safeSale);

  const saleType = escapeHtml(safeSale?.saleType || (remaining > 0 ? 'آجل' : 'نقدي'));
  const saleId = escapeHtml(safeSale?.id || '-');
  const customerName = escapeHtml(safeCustomer?.name || 'عميل نقدي');
  const saleDate = new Date(getSaleDate(safeSale)).toLocaleString('ar-EG');
  const printedAt = new Date().toLocaleString('ar-EG');

  const rowsHtml = items.map((item, index) => {
    const name = escapeHtml(item?.variant?.product?.name || item?.productName || 'صنف');
    const quantity = toNumber(item?.quantity);
    const price = toNumber(item?.price);
    const lineTotal = Math.max(0, (price - toNumber(item?.discount)) * quantity);
    return `
      <tr>
        <td>${index + 1}</td>
        <td>${name}</td>
        <td>${quantity}</td>
        <td>${price.toFixed(2)}</td>
        <td>${lineTotal.toFixed(2)}</td>
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
    .container { padding: 10mm; }
    h2 { margin: 0; color: #1e40af; }
    .header-row { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1e40af; padding-bottom: 5px; margin-bottom: 10px; }
    .meta-compact { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px; margin-bottom: 15px; }
    table { font-size: 12px; }
    th { background: #f1f5f9; padding: 5px; }
    td { padding: 5px; border-bottom: 1px solid #e2e8f0; }
    .totals-compact { margin-top: 15px; border-top: 2px solid #e2e8f0; padding-top: 5px; font-size: 13px; }
    .total-row { display: flex; justify-content: space-between; padding: 2px 0; }
    .total-row.final { font-weight: bold; color: #1e40af; border-top: 1px solid #1e40af; margin-top: 5px; padding-top: 5px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-row">
        <div>
            <h2>${escapeHtml(company.name)}</h2>
            <div style="font-size: 10px;">${escapeHtml(company.address)}</div>
        </div>
        <div style="text-align: left;">
            <div style="font-weight: bold;">فاتورة بيع</div>
            <div style="font-size: 11px;">#${saleId}</div>
        </div>
    </div>

    <div class="meta-compact">
        <div><strong>التاريخ:</strong> ${escapeHtml(saleDate)}</div>
        <div><strong>نوع الدفع:</strong> ${saleType}</div>
        <div><strong>العميل:</strong> ${customerName}</div>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>الصنف</th>
          <th>ق</th>
          <th>سعر</th>
          <th>إجم</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="totals-compact">
        <div class="total-row"><span>الإجمالي:</span><span>${subTotal.toFixed(2)}</span></div>
        ${invoiceDiscount > 0 ? `<div class="total-row"><span>خصم:</span><span>-${invoiceDiscount.toFixed(2)}</span></div>` : ''}
        <div class="total-row final"><span>المطلوب لسداد:</span><span>${remaining > 0 ? remaining.toFixed(2) : '0.00'}</span></div>
    </div>
    <div style="font-size: 9px; margin-top: 10px; color: #94a3b8; text-align: center;">شكراً لزيارتكم</div>
  </div>
</body>
</html>
  `.trim();
};
