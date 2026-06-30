import {
  escapeHtml, toNumber, formatMoney, commonA4Styles,
  renderA4Header, renderFooter, getPurchaseDate, calculatePurchaseFinancials
} from '../../../shared/helpers';

export const renderA4Modern = ({ purchase, company, pageSize = 'A4' }) => {
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
  const accentColor = '#0d9488'; // Modern Teal

  const rowsHtml = items.map((item, index) => {
    const name = escapeHtml(item?.variant?.product?.name || item?.productName || 'صنف');
    const size = escapeHtml(item?.variant?.productSize || item?.size || '');
    const color = escapeHtml(item?.variant?.color || item?.color || '');
    const specs = [size, color].filter(Boolean).join(' - ');
    const quantity = toNumber(item?.quantity);
    const unitPrice = toNumber(item?.price ?? item?.cost);
    const lineTotal = unitPrice * quantity;
    return `
      <tr>
        <td style="text-align: center; color: #64748b;">${index + 1}</td>
        <td>
          <div style="font-weight: 700; color: #1e293b;">${name}</div>
          ${specs ? `<div style="font-size: 10px; color: #64748b; margin-top: 2px;">${escapeHtml(specs)}</div>` : ''}
        </td>
        <td style="text-align: center;">${quantity}</td>
        <td style="text-align: center;">${unitPrice.toFixed(2)}</td>
        <td style="text-align: left; font-weight: 700;">${lineTotal.toFixed(2)}</td>
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
    
    .container { border-top: 8px solid ${accentColor}; border-radius: 0 0 12px 12px; }
    .title { 
      text-align: right; 
      font-size: 28px; 
      font-weight: 900; 
      color: ${accentColor}; 
      margin-bottom: 30px;
    }
    
    .meta { background: #f0fdfa; border-radius: 12px; padding: 20px; border: 1px solid #ccfbf1; }
    .meta-box strong { color: ${accentColor}; }
    
    table { border-collapse: separate; border-spacing: 0; margin-top: 30px; border: none; }
    th { 
      background: #f1f5f9; 
      color: #134e4a; 
      text-transform: uppercase; 
      font-size: 11px; 
      padding: 12px 15px;
      border: none;
    }
    th:first-child { border-radius: 8px 0 0 8px; }
    th:last-child { border-radius: 0 8px 8px 0; }
    
    td { padding: 15px; border-bottom: 1px solid #f1f5f9; }
    
    .totals { background: #134e4a; color: white; border-radius: 16px; padding: 25px; margin-top: 40px; border: none; }
    .total-row { border-bottom: 1px solid rgba(255,255,255,0.1); padding: 10px 0; }
    .total-row span:last-child { font-weight: 800; font-size: 16px; }
    .total-row.final { border: none; padding-top: 20px; }
    .total-row.final span:last-child { font-size: 24px; color: #5eead4; }
    
    .footer { margin-top: 50px; border-top: 1px solid #f1f5f9; padding-top: 20px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px;">
        <div class="title">تقرير مشتريات<br><span style="font-size: 14px; color: #64748b; font-weight: 400;">نمط عصري - توريد بضاعة</span></div>
        <div style="text-align: left;">
            <div style="font-weight: 900; font-size: 20px; color: #1e293b;">${escapeHtml(company.name)}</div>
            <div style="color: #64748b; font-size: 12px;">مستند وارد للمخازن</div>
        </div>
    </div>

    <div class="meta">
      <div class="meta-box">
        <div><strong>رقم السند:</strong> #${purchaseId}</div>
        <div><strong>تاريخ التوريد:</strong> ${escapeHtml(purchaseDate)}</div>
        <div><strong>حساب السداد:</strong> ${paymentLabel}</div>
      </div>
      <div class="meta-box" style="border-right: 2px solid #99f6e4; padding-right: 20px;">
        <div style="font-size: 11px; text-transform: uppercase; color: #0d9488; margin-bottom: 4px;">بيانات المورد</div>
        <div style="font-weight: 800; font-size: 16px; color: #1e293b;">${supplierName}</div>
        <div style="color: #64748b; font-size: 13px;">${supplierPhone}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:40px;">#</th>
          <th style="text-align: right;">الصنف المُورد</th>
          <th style="width:70px;">الكمية</th>
          <th style="width:90px;">سعر التكلفة</th>
          <th style="width:110px; text-align: left;">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div style="display: flex; justify-content: flex-end;">
        <div class="totals" style="width: 350px;">
          <div class="total-row"><span>إجمالي البضاعة</span><span>${subTotal.toFixed(2)} ج.م</span></div>
          ${invoiceDiscount > 0 ? `<div class="total-row"><span>خصومات المورد</span><span style="color: #99f6e4;">- ${invoiceDiscount.toFixed(2)} ج.م</span></div>` : ''}
          <div class="total-row"><span>المبلغ المسدد</span><span>${paidAmount.toFixed(2)} ج.م</span></div>
          <div class="total-row final">
            <span>المتبقي ذمة</span>
            <span>${remaining.toFixed(2)} ج.م</span>
          </div>
        </div>
    </div>

    <div class="footer">
        <div style="display: flex; justify-content: space-between; font-size: 11px;">
            <div>رقم الطباعة: ${printedAt}</div>
            <div>نظام إدارة الموارد المتكامل</div>
        </div>
    </div>
  </div>
</body>
</html>
  `.trim();
};
