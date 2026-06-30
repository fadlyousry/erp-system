import {
  escapeHtml, toNumber, commonReceipt80Styles,
  renderReceipt80Header, renderFooter, getReturnDate, buildReturnLines
} from '../../shared/helpers';

export const generateSaleReturnReceipt80 = ({ returnInvoice, customer, company }) => {
  const safeReturn = returnInvoice || {};
  const safeCustomer = customer || safeReturn?.customer || null;
  const lines = buildReturnLines(safeReturn);
  const computedTotal = lines.reduce((sum, line) => sum + line.total, 0);
  const total = Math.max(0, toNumber(safeReturn?.total, computedTotal));

  const returnId = escapeHtml(safeReturn?.id || '-');
  const saleId = escapeHtml(safeReturn?.saleId || '-');
  const customerName = escapeHtml(safeCustomer?.name || 'عميل نقدي');
  const customerPhone = escapeHtml(safeCustomer?.phone || '');
  const notes = escapeHtml(safeReturn?.notes || '');
  const dateLine = new Date(getReturnDate(safeReturn)).toLocaleString('ar-EG');
  const printedAt = new Date().toLocaleString('ar-EG');

  const rowsHtml = lines.map((line) => {
    return `
      <tr>
        <td>${line.name}</td>
        <td style="text-align:center">${line.quantity}</td>
        <td style="text-align:center">${line.price.toFixed(2)}</td>
        <td style="text-align:left">${line.total.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>مرتجع رقم ${returnId}</title>
  <style>
    ${commonReceipt80Styles()}
    .title { text-align: center; font-size: 16px; font-weight: 800; color: #b91c1c; margin-top: 6px; }
    .notes-box {
      border: 1px solid #d1d5db;
      border-radius: 5px;
      padding: 6px;
      margin: 7px 0;
      background: #f9fafb;
      font-size: 11px;
    }
  </style>
</head>
<body>
  ${renderReceipt80Header(company)}
  <div class="title">مرتجع مبيعات</div>
  <div class="divider-solid"></div>

  <div class="meta-row"><span>مرتجع:</span><strong>#${returnId}</strong></div>
  <div class="meta-row"><span>فاتورة البيع:</span><span>#${saleId}</span></div>
  <div class="meta-row"><span>التاريخ:</span><span>${escapeHtml(dateLine)}</span></div>
  <div class="meta-row"><span>العميل:</span><span>${customerName}</span></div>
  ${customerPhone ? `<div class="meta-row"><span>الهاتف:</span><span>${customerPhone}</span></div>` : ''}

  <div class="divider-solid"></div>

  <table>
    <thead>
      <tr>
        <th>الصنف</th>
        <th style="text-align:center">ك</th>
        <th style="text-align:center">سعر</th>
        <th style="text-align:left">جملة</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="total-row final"><span>الإجمالي:</span><span>${total.toFixed(2)} ج.م</span></div>

  ${notes ? `<div class="notes-box"><strong>ملاحظات:</strong> ${notes}</div>` : ''}

  ${renderFooter(printedAt)}
</body>
</html>
  `.trim();
};
