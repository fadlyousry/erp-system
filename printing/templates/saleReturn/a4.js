import {
  escapeHtml, toNumber, commonA4Styles,
  renderA4Header, renderFooter, getReturnDate, buildReturnLines
} from '../../shared/helpers';

export const generateSaleReturnA4 = ({ returnInvoice, customer, company, pageSize = 'A4' }) => {
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
  const titleColor = '#b91c1c';

  const rowsHtml = lines.map((line, index) => {
    const specs = [line.size, line.color].filter(Boolean).join(' - ');
    return `
      <tr>
        <td>${index + 1}</td>
        <td>
          <div>${line.name}</div>
          ${specs ? `<div class="item-meta">${escapeHtml(specs)}</div>` : ''}
        </td>
        <td>${line.quantity}</td>
        <td>${line.price.toFixed(2)}</td>
        <td>${line.total.toFixed(2)}</td>
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
    ${commonA4Styles(pageSize)}
    .title { color: ${titleColor}; }
    .total-row.final { color: ${titleColor}; }
    .notes-box {
      margin-top: 12px;
      border-top: 1px dashed #9ca3af;
      padding-top: 10px;
      color: #374151;
      font-size: ${pageSize === 'A5' ? '11px' : '13px'};
    }
  </style>
</head>
<body>
  <div class="container">
    ${renderA4Header(company)}
    <div class="title">فاتورة مرتجع مبيعات</div>

    <div class="meta">
      <div class="meta-box">
        <div><strong>رقم المرتجع:</strong> #${returnId}</div>
        <div><strong>فاتورة البيع:</strong> #${saleId}</div>
        <div><strong>التاريخ:</strong> ${escapeHtml(dateLine)}</div>
      </div>
      <div class="meta-box">
        <div><strong>العميل:</strong> ${customerName}</div>
        ${customerPhone ? `<div><strong>الهاتف:</strong> ${customerPhone}</div>` : ''}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:40px;">#</th>
          <th>الصنف</th>
          <th style="width:70px;">الكمية</th>
          <th style="width:90px;">السعر</th>
          <th style="width:100px;">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="5" style="text-align:center">لا توجد أصناف</td></tr>'}
      </tbody>
    </table>

    <div class="totals">
      <div class="total-row final"><span>إجمالي المرتجع</span><span>${total.toFixed(2)} ج.م</span></div>
    </div>

    ${notes ? `<div class="notes-box"><strong>ملاحظات:</strong> ${notes}</div>` : ''}

    ${renderFooter(printedAt)}
  </div>
</body>
</html>
  `.trim();
};
