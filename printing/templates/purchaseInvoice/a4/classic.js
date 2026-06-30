import {
  escapeHtml, toNumber, commonA4Styles,
  renderA4Header, renderFooter, getPurchaseDate, calculatePurchaseFinancials
} from '../../../shared/helpers';

export const renderA4Classic = ({ purchase, company, pageSize = 'A4' }) => {
  const safePurchase = purchase || {};
  const supplier = safePurchase?.supplier || safePurchase?.customer || null;
  const { items, subTotal, invoiceDiscount, finalTotal, paidAmount, remaining } = calculatePurchaseFinancials(safePurchase);

  const supplierName = escapeHtml(supplier?.name || 'مورد عام');
  const supplierPhone = escapeHtml(supplier?.phone || '');
  const purchaseId = escapeHtml(safePurchase?.id || '-');
  const paymentLabel = escapeHtml(
    safePurchase?.payment || safePurchase?.paymentMethod?.name || safePurchase?.purchaseType || '-'
  );
  const purchaseDate = new Date(getPurchaseDate(safePurchase)).toLocaleString('ar-EG');
  const printedAt = new Date().toLocaleString('ar-EG');
  const titleColor = '#0f766e';

  const rowsHtml = items.map((item, index) => {
    const name = escapeHtml(item?.variant?.product?.name || item?.productName || 'صنف');
    const size = escapeHtml(item?.variant?.productSize || item?.size || '');
    const color = escapeHtml(item?.variant?.color || item?.color || '');
    const specs = [size, color].filter(Boolean).join(' - ');
    const quantity = Math.max(0, toNumber(item?.quantity, 0));
    const unitCost = Math.max(0, toNumber(item?.price ?? item?.cost, 0));
    const lineTotal = unitCost * quantity;

    return `
      <tr>
        <td>${index + 1}</td>
        <td>
          <div>${name}</div>
          ${specs ? `<div class="item-meta">${escapeHtml(specs)}</div>` : ''}
        </td>
        <td>${quantity}</td>
        <td>${unitCost.toFixed(2)}</td>
        <td>${lineTotal.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>فاتورة مشتريات رقم ${purchaseId}</title>
  <style>
    ${commonA4Styles(pageSize)}
    .title { color: ${titleColor}; }
    .total-row.final { color: ${titleColor}; }
  </style>
</head>
<body>
  <div class="container">
    ${renderA4Header(company)}
    <div class="title">فاتورة مشتريات - نمط كلاسيكي</div>

    <div class="meta">
      <div class="meta-box">
        <div><strong>رقم الفاتورة:</strong> #${purchaseId}</div>
        <div><strong>التاريخ:</strong> ${escapeHtml(purchaseDate)}</div>
        <div><strong>طريقة الدفع:</strong> ${paymentLabel}</div>
      </div>
      <div class="meta-box">
        <div><strong>المورد:</strong> ${supplierName}</div>
        <div><strong>الهاتف:</strong> ${supplierPhone || '-'}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:48px;">#</th>
          <th>الصنف</th>
          <th style="width:90px;">الكمية</th>
          <th style="width:110px;">سعر الشراء</th>
          <th style="width:120px;">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="5" style="text-align:center">لا توجد أصناف</td></tr>'}
      </tbody>
    </table>

    <div class="totals">
      <div class="total-row"><span>الإجمالي الفرعي</span><span>${subTotal.toFixed(2)} ج.م</span></div>
      ${invoiceDiscount > 0 ? `<div class="total-row"><span>الخصم</span><span>- ${invoiceDiscount.toFixed(2)} ج.م</span></div>` : ''}
      <div class="total-row"><span>المدفوع</span><span>${paidAmount.toFixed(2)} ج.م</span></div>
      <div class="total-row final"><span>المتبقي</span><span>${remaining.toFixed(2)} ج.م</span></div>
    </div>

    ${renderFooter(printedAt)}
  </div>
</body>
</html>
  `.trim();
};
