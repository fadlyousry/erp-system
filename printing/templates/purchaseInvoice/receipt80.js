import {
  escapeHtml, toNumber, commonReceipt80Styles,
  renderReceipt80Header, renderFooter, getPurchaseDate, calculatePurchaseFinancials
} from '../../shared/helpers';

export const generatePurchaseInvoiceReceipt80 = ({ purchase, company }) => {
  const safePurchase = purchase || {};
  const supplier = safePurchase?.supplier || safePurchase?.customer || null;
  const { items, subTotal, invoiceDiscount, finalTotal, paidAmount, remaining } = calculatePurchaseFinancials(safePurchase);

  const supplierName = escapeHtml(supplier?.name || 'مورد عام');
  const supplierPhone = escapeHtml(supplier?.phone || '');
  const paymentLabel = escapeHtml(
    safePurchase?.payment || safePurchase?.paymentMethod?.name || safePurchase?.purchaseType || '-'
  );
  const purchaseId = escapeHtml(safePurchase?.id || '-');
  const purchaseDate = new Date(getPurchaseDate(safePurchase)).toLocaleString('ar-EG');
  const printedAt = new Date().toLocaleString('ar-EG');

  const rowsHtml = items.map((item) => {
    const name = escapeHtml(item?.variant?.product?.name || item?.productName || 'صنف');
    const quantity = Math.max(0, toNumber(item?.quantity, 0));
    const unitCost = Math.max(0, toNumber(item?.price ?? item?.cost, 0));
    const lineTotal = unitCost * quantity;
    return `
      <tr>
        <td>${name}</td>
        <td style="text-align:center">${quantity}</td>
        <td style="text-align:center">${unitCost.toFixed(2)}</td>
        <td style="text-align:left">${lineTotal.toFixed(2)}</td>
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
    ${commonReceipt80Styles()}
    .title { text-align: center; font-size: 16px; font-weight: 800; color: #0f766e; margin-top: 6px; }
    .supplier-box {
      border: 1px solid #111827;
      border-radius: 4px;
      padding: 6px;
      margin: 7px 0;
    }
    .supplier-box .name { font-weight: 700; margin-bottom: 2px; }
  </style>
</head>
<body>
  ${renderReceipt80Header(company)}
  <div class="title">فاتورة مشتريات</div>
  <div class="divider"></div>

  <div class="meta-row"><span>فاتورة رقم:</span><span>#${purchaseId}</span></div>
  <div class="meta-row"><span>التاريخ:</span><span>${escapeHtml(purchaseDate)}</span></div>
  <div class="meta-row"><span>طريقة الدفع:</span><span>${paymentLabel}</span></div>

  <div class="supplier-box">
    <div class="name">${supplierName}</div>
    ${supplierPhone ? `<div>هاتف: ${supplierPhone}</div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th>الصنف</th>
        <th style="text-align:center">ك</th>
        <th style="text-align:center">سعر</th>
        <th style="text-align:left">جملة</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || '<tr><td colspan="4" style="text-align:center">لا توجد أصناف</td></tr>'}
    </tbody>
  </table>

  <div class="divider-solid"></div>

  <div class="total-row"><span>الإجمالي الفرعي:</span><span>${subTotal.toFixed(2)}</span></div>
  ${invoiceDiscount > 0 ? `<div class="total-row"><span>الخصم:</span><span>- ${invoiceDiscount.toFixed(2)}</span></div>` : ''}
  <div class="total-row"><span>المدفوع:</span><span>${paidAmount.toFixed(2)}</span></div>
  <div class="total-row final"><span>المتبقي:</span><span>${remaining.toFixed(2)} ج.م</span></div>

  ${renderFooter(printedAt)}
</body>
</html>
  `.trim();
};
