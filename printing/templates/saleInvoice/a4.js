import {
  escapeHtml, toNumber, formatMoney, commonA4Styles,
  renderA4Header, renderFooter, getSaleDate, calculateSaleFinancials
} from '../../shared/helpers';

export const generateSaleInvoiceA4 = ({ sale, customer, company, pageSize = 'A4' }) => {
  const safeSale = sale || {};
  const safeCustomer = customer || safeSale?.customer || null;
  const { items, subTotal, itemsDiscount, invoiceDiscount, finalTotal, paidAmount, remaining } = calculateSaleFinancials(safeSale);

  const saleType = escapeHtml(safeSale?.saleType || (remaining > 0 ? 'آجل' : 'نقدي'));
  const saleId = escapeHtml(safeSale?.id || '-');
  const customerName = escapeHtml(safeCustomer?.name || 'عميل نقدي');
  const customerPhone = escapeHtml(safeCustomer?.phone || '-');
  const customerAddress = escapeHtml(safeCustomer?.address || '-');
  const saleDate = new Date(getSaleDate(safeSale)).toLocaleString('ar-EG');
  const printedAt = new Date().toLocaleString('ar-EG');
  const titleColor = '#1e40af';

  const rowsHtml = items.map((item, index) => {
    const name = escapeHtml(item?.variant?.product?.name || item?.productName || 'صنف');
    const size = escapeHtml(item?.variant?.productSize || item?.size || '');
    const color = escapeHtml(item?.variant?.color || item?.color || '');
    const specs = [size, color].filter(Boolean).join(' - ');
    const quantity = toNumber(item?.quantity);
    const price = toNumber(item?.price);
    const discount = toNumber(item?.discount);
    const lineTotal = Math.max(0, (price - discount) * quantity);
    return `
      <tr>
        <td>${index + 1}</td>
        <td>
          <div>${name}</div>
          ${specs ? `<div class="item-meta">${escapeHtml(specs)}</div>` : ''}
        </td>
        <td>${quantity}</td>
        <td>${price.toFixed(2)}</td>
        <td>${discount.toFixed(2)}</td>
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
    .title { color: ${titleColor}; }
    .total-row.final { color: ${titleColor}; }
  </style>
</head>
<body>
  <div class="container">
    ${renderA4Header(company)}
    <div class="title">فاتورة بيع</div>

    <div class="meta">
      <div class="meta-box">
        <div><strong>رقم الفاتورة:</strong> #${saleId}</div>
        <div><strong>التاريخ:</strong> ${escapeHtml(saleDate)}</div>
        <div><strong>نوع البيع:</strong> ${saleType}</div>
      </div>
      <div class="meta-box">
        <div><strong>العميل:</strong> ${customerName}</div>
        <div><strong>الهاتف:</strong> ${customerPhone}</div>
        <div><strong>العنوان:</strong> ${customerAddress}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:40px;">#</th>
          <th>الصنف</th>
          <th style="width:70px;">الكمية</th>
          <th style="width:90px;">السعر</th>
          <th style="width:90px;">الخصم</th>
          <th style="width:100px;">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="6" style="text-align:center">لا توجد أصناف</td></tr>'}
      </tbody>
    </table>

    <div class="totals">
      <div class="total-row"><span>الإجمالي الفرعي</span><span>${subTotal.toFixed(2)} ج.م</span></div>
      ${itemsDiscount > 0 ? `<div class="total-row"><span>خصم الأصناف</span><span>- ${itemsDiscount.toFixed(2)} ج.م</span></div>` : ''}
      ${invoiceDiscount > 0 ? `<div class="total-row"><span>خصم الفاتورة</span><span>- ${invoiceDiscount.toFixed(2)} ج.م</span></div>` : ''}
      <div class="total-row"><span>المدفوع</span><span>${paidAmount.toFixed(2)} ج.م</span></div>
      <div class="total-row final"><span>${remaining > 0 ? 'المتبقي' : 'الحالة'}</span><span>${remaining > 0 ? `${remaining.toFixed(2)} ج.م` : 'مدفوع بالكامل ✓'}</span></div>
    </div>

    ${renderFooter(printedAt)}
  </div>
</body>
</html>
  `.trim();
};
