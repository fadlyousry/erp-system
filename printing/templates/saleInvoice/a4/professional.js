import {
  escapeHtml, toNumber, commonA4Styles,
  renderA4Header, renderFooter, getSaleDate, calculateSaleFinancials
} from '../../../shared/helpers';

export const renderA4Professional = ({ sale, customer, company, pageSize = 'A4' }) => {
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
  const primaryColor = '#0f172a'; // Slate 900
  const secondaryColor = '#64748b'; // Slate 500

  const rowsHtml = items.map((item, index) => {
    const name = escapeHtml(item?.variant?.product?.name || item?.productName || 'صنف');
    const quantity = toNumber(item?.quantity);
    const price = toNumber(item?.price);
    const discount = toNumber(item?.discount);
    const lineTotal = Math.max(0, (price - discount) * quantity);
    return `
      <tr class="item-row">
        <td>${index + 1}</td>
        <td>
          <div class="product-name">${name}</div>
        </td>
        <td class="text-center">${quantity}</td>
        <td class="text-center">${price.toFixed(2)}</td>
        <td class="text-center">${discount > 0 ? `-${discount.toFixed(2)}` : '0.00'}</td>
        <td class="text-left font-bold">${lineTotal.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>فاتورة رقم ${saleId}</title>
  <style>
    ${commonA4Styles(pageSize)}
    
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: ${primaryColor}; }
    .container { padding: 40px; }
    
    .invoice-header { display: flex; justify-content: space-between; margin-bottom: 60px; border-bottom: 4px solid ${primaryColor}; padding-bottom: 30px; }
    .company-info h1 { margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 1px; }
    .company-info p { margin: 5px 0; color: ${secondaryColor}; font-size: 13px; }
    
    .invoice-title { text-align: left; }
    .invoice-title h2 { margin: 0; font-size: 36px; font-weight: 300; color: ${secondaryColor}; }
    .invoice-title p { margin: 5px 0; font-weight: bold; font-size: 16px; }
    
    .billing-info { display: flex; margin-bottom: 40px; }
    .billing-info > div { flex: 1; }
    .info-label { font-size: 11px; text-transform: uppercase; color: ${secondaryColor}; margin-bottom: 8px; font-weight: bold; }
    .info-value { font-size: 14px; line-height: 1.5; }
    
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { text-align: right; background: ${primaryColor}; color: white; padding: 12px 15px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    th.text-center { text-align: center; }
    th.text-left { text-align: left; }
    
    .item-row td { padding: 15px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    .product-name { font-weight: 600; }
    
    .totals-section { display: flex; justify-content: flex-end; margin-top: 30px; }
    .totals-table { width: 300px; }
    .total-line { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
    .total-line.grand-total { border-bottom: none; font-size: 20px; font-weight: 800; color: ${primaryColor}; margin-top: 10px; }
    
    .payment-status { 
      display: inline-block; 
      padding: 5px 15px; 
      border-radius: 50px; 
      font-size: 12px; 
      font-weight: bold; 
      margin-top: 10px;
      ${remaining > 0 ? 'background: #fef2f2; color: #991b1b; border: 1px solid #fee2e2;' : 'background: #f0fdf4; color: #166534; border: 1px solid #dcfce7;'}
    }
    
    .footer { margin-top: 80px; font-size: 11px; color: ${secondaryColor}; border-top: 1px solid #e2e8f0; padding-top: 20px; }
    .text-center { text-align: center; }
    .text-left { text-align: left; }
    .font-bold { font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="invoice-header">
        <div class="company-info">
            <h1>${escapeHtml(company.name)}</h1>
            <p>${escapeHtml(company.address)}</p>
            <p>${escapeHtml(company.contactNumbers)}</p>
        </div>
        <div class="invoice-title">
            <h2>فاتورة ضريبية</h2>
            <p>#${saleId}</p>
            <div class="payment-status">${remaining > 0 ? 'غير مدفوعة بالكامل' : 'مدفوعة بالكامل ✓'}</div>
        </div>
    </div>

    <div class="billing-info">
        <div>
            <div class="info-label">محررة إلى</div>
            <div class="info-value">
                <strong>${customerName}</strong><br>
                ${customerPhone !== '-' ? `${customerPhone}<br>` : ''}
                ${customerAddress !== '-' ? customerAddress : ''}
            </div>
        </div>
        <div style="text-align: left;">
            <div class="info-label">تفاصيل الفاتورة</div>
            <div class="info-value">
                <strong>تاريخ الإصدار:</strong> ${escapeHtml(saleDate)}<br>
                <strong>طريقة السداد:</strong> ${saleType}
            </div>
        </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:40px;">#</th>
          <th>الوصف</th>
          <th class="text-center" style="width:80px;">الكمية</th>
          <th class="text-center" style="width:100px;">سعر الوحدة</th>
          <th class="text-center" style="width:100px;">الخصم</th>
          <th class="text-left" style="width:120px;">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="totals-section">
        <div class="totals-table">
            <div class="total-line">
                <span>الإجمالي الفرعي</span>
                <span>${subTotal.toFixed(2)} ج.م</span>
            </div>
            ${itemsDiscount > 0 ? `<div class="total-line"><span>خصم الأصناف</span><span>-${itemsDiscount.toFixed(2)} ج.م</span></div>` : ''}
            ${invoiceDiscount > 0 ? `<div class="total-line"><span>خصم الفاتورة</span><span>-${invoiceDiscount.toFixed(2)} ج.م</span></div>` : ''}
            <div class="total-line">
                <span>المبلغ المدفوع</span>
                <span>${paidAmount.toFixed(2)} ج.م</span>
            </div>
            <div class="total-line grand-total">
                <span>${remaining > 0 ? 'الرصيد المتبقي' : 'الإجمالي'}</span>
                <span>${remaining > 0 ? remaining.toFixed(2) : finalTotal.toFixed(2)} ج.م</span>
            </div>
        </div>
    </div>

    <div class="footer">
        <div style="display: flex; justify-content: space-between;">
            <div>صدرت بواسطة: ${escapeHtml(company.name)}</div>
            <div>تاريخ الطباعة: ${printedAt}</div>
        </div>
        <p style="text-align: center; margin-top: 20px; font-weight: bold;">شكراً لثقتكم بنا</p>
    </div>
  </div>
</body>
</html>
  `.trim();
};
