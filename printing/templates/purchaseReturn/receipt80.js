import {
  escapeHtml, toNumber, commonReceipt80Styles,
  renderReceipt80Header, renderFooter
} from '../../shared/helpers';

export const generatePurchaseReturnReceipt80 = ({ purchaseReturn, supplier, company }) => {
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

  const rowsHtml = items.map((item) => {
    const quantity = Math.max(0, toNumber(item?.quantity, 0));
    const price = Math.max(0, toNumber(item?.price, 0));
    const rowTotal = quantity * price;
    return `
      <tr>
        <td>${escapeHtml(item?.variant?.product?.name || item?.productName || 'صنف')}</td>
        <td style="text-align:center">${quantity}</td>
        <td style="text-align:center">${price.toFixed(2)}</td>
        <td style="text-align:left">${rowTotal.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>مرتجع مشتريات #${returnId}</title>
  <style>
    ${commonReceipt80Styles()}
    .title { text-align: center; font-size: 16px; font-weight: 800; color: #b45309; margin-top: 6px; }
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
  <div class="title">مرتجع مشتريات</div>
  <div class="divider-solid"></div>

  <div class="meta-row"><span>مرتجع:</span><strong>#${returnId}</strong></div>
  <div class="meta-row"><span>فاتورة المشتريات:</span><span>${purchaseId !== '-' ? `#${purchaseId}` : '-'}</span></div>
  <div class="meta-row"><span>التاريخ:</span><span>${escapeHtml(dateLine)}</span></div>
  <div class="meta-row"><span>المورد:</span><span>${supplierName}</span></div>

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
    <tbody>${rowsHtml || '<tr><td colspan="4" style="text-align:center">لا توجد أصناف</td></tr>'}</tbody>
  </table>

  <div class="total-row final"><span>الإجمالي:</span><span>${total.toFixed(2)} ج.م</span></div>

  ${notes ? `<div class="notes-box"><strong>ملاحظات:</strong> ${notes}</div>` : ''}

  ${renderFooter(printedAt)}
</body>
</html>
  `.trim();
};
