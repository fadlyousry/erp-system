import {
  escapeHtml, toNumber, commonA4Styles,
  renderA4Header, renderFooter, buildReturnLines
} from '../../shared/helpers';

export const generatePurchaseReturnA4 = ({ purchaseReturn, supplier, company, pageSize = 'A4' }) => {
  const safeReturn = purchaseReturn || {};
  const resolvedSupplier = supplier || safeReturn?.supplier || null;
  const items = Array.isArray(safeReturn?.items) ? safeReturn.items : [];
  const total = Math.max(0, toNumber(safeReturn?.total, 0));

  const returnId = escapeHtml(safeReturn?.id || '-');
  const purchaseId = escapeHtml(safeReturn?.purchaseId || '-');
  const supplierName = escapeHtml(resolvedSupplier?.name || 'مورد عابر');
  const notes = escapeHtml(safeReturn?.notes || '');
  const dateLine = new Date(safeReturn?.createdAt || new Date()).toLocaleString('ar-EG');
  const printedAt = new Date().toLocaleString('ar-EG');
  const titleColor = '#b45309';

  const rowsHtml = items.length ? items.map((item, index) => {
    const quantity = Math.max(0, toNumber(item?.quantity, 0));
    const price = Math.max(0, toNumber(item?.price, 0));
    const rowTotal = quantity * price;
    return `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item?.variant?.product?.name || item?.productName || `منتج #${index + 1}`)}</td>
        <td>${escapeHtml(item?.variant?.productSize || item?.size || '-')}</td>
        <td>${escapeHtml(item?.variant?.color || item?.color || '-')}</td>
        <td style="text-align:center">${quantity}</td>
        <td style="text-align:center">${price.toFixed(2)}</td>
        <td style="text-align:left">${rowTotal.toFixed(2)}</td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="7" style="text-align:center;color:#64748b">لا توجد أصناف في المرتجع</td></tr>';

  return `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>مرتجع مشتريات #${returnId}</title>
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
    <div class="title">فاتورة مرتجع مشتريات</div>

    <div class="meta">
      <div class="meta-box">
        <div><strong>رقم المرتجع:</strong> #${returnId}</div>
        <div><strong>فاتورة المشتريات:</strong> ${purchaseId !== '-' ? `#${purchaseId}` : '-'}</div>
        <div><strong>التاريخ:</strong> ${escapeHtml(dateLine)}</div>
      </div>
      <div class="meta-box">
        <div><strong>المورد:</strong> ${supplierName}</div>
        ${notes ? `<div><strong>ملاحظات:</strong> ${notes}</div>` : ''}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:40px;">#</th>
          <th>الصنف</th>
          <th>المقاس</th>
          <th>اللون</th>
          <th style="text-align:center">الكمية</th>
          <th style="text-align:center">السعر</th>
          <th style="text-align:left">الإجمالي</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div class="totals">
      <div class="total-row final"><span>إجمالي المرتجع</span><span>${total.toFixed(2)} ج.م</span></div>
    </div>

    ${renderFooter(printedAt)}
  </div>
</body>
</html>
  `.trim();
};
