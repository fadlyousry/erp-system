import {
  escapeHtml, toNumber, formatMoney, commonA4Styles,
  renderA4Header, renderFooter, getSaleDate, calculateSaleFinancials
} from '../../../shared/helpers';

export const renderA4Modern = ({ sale, customer, company, pageSize = 'A4' }) => {
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
  const accentColor = '#6366f1'; // Modern Indigo

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
        <td style="text-align: center; color: #64748b;">${index + 1}</td>
        <td>
          <div style="font-weight: 700; color: #1e293b;">${name}</div>
          ${specs ? `<div style="font-size: 10px; color: #64748b; margin-top: 2px;">${escapeHtml(specs)}</div>` : ''}
        </td>
        <td style="text-align: center;">${quantity}</td>
        <td style="text-align: center;">${price.toFixed(2)}</td>
        <td style="text-align: center; color: #ef4444;">${discount > 0 ? `-${discount.toFixed(2)}` : '0.00'}</td>
        <td style="text-align: left; font-weight: 700;">${lineTotal.toFixed(2)}</td>
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
    
    .container { border-top: 8px solid ${accentColor}; border-radius: 0 0 12px 12px; }
    .title { 
      text-align: right; 
      font-size: 28px; 
      font-weight: 900; 
      color: ${accentColor}; 
      margin-bottom: 30px;
      letter-spacing: -1px;
    }
    
    .meta { background: #f8fafc; border-radius: 12px; padding: 20px; border: 1px solid #f1f5f9; }
    .meta-box strong { color: ${accentColor}; }
    
    table { border-collapse: separate; border-spacing: 0; margin-top: 30px; border: none; }
    th { 
      background: #f1f5f9; 
      color: #475569; 
      text-transform: uppercase; 
      font-size: 11px; 
      letter-spacing: 0.5px;
      padding: 12px 15px;
      border: none;
    }
    th:first-child { border-radius: 8px 0 0 8px; }
    th:last-child { border-radius: 0 8px 8px 0; }
    
    td { padding: 15px; border-bottom: 1px solid #f1f5f9; }
    
    .totals { background: #1e293b; color: white; border-radius: 16px; padding: 25px; margin-top: 40px; border: none; }
    .total-row { border-bottom: 1px solid rgba(255,255,255,0.1); padding: 10px 0; }
    .total-row span:last-child { font-weight: 800; font-size: 16px; }
    .total-row.final { border: none; padding-top: 20px; }
    .total-row.final span:last-child { font-size: 24px; color: ${accentColor}; }
    
    .footer { margin-top: 50px; border-top: 1px solid #f1f5f9; padding-top: 20px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px;">
        <div class="title">فاتورة مبيعات<br><span style="font-size: 14px; color: #64748b; font-weight: 400;">نمط عصري متطور</span></div>
        <div style="text-align: left;">
            <div style="font-weight: 900; font-size: 20px; color: #1e293b;">${escapeHtml(company.name)}</div>
            <div style="color: #64748b; font-size: 12px; margin-top: 4px;">${escapeHtml(company.address)}</div>
            <div style="color: #64748b; font-size: 12px;">${escapeHtml(company.contactNumbers)}</div>
        </div>
    </div>

    <div class="meta">
      <div class="meta-box">
        <div><strong>رقم القسيمة:</strong> #${saleId}</div>
        <div><strong>تاريخ الإصدار:</strong> ${escapeHtml(saleDate)}</div>
        <div><strong>طريقة الدفع:</strong> <span style="background: ${accentColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">${saleType}</span></div>
      </div>
      <div class="meta-box" style="border-right: 2px solid #e2e8f0; padding-right: 20px;">
        <div style="font-size: 11px; text-transform: uppercase; color: #94a3b8; margin-bottom: 4px;">بيانات العميل</div>
        <div style="font-weight: 800; font-size: 16px; color: #1e293b;">${customerName}</div>
        <div style="color: #64748b; font-size: 13px;">${customerPhone}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:40px;">#</th>
          <th style="text-align: right;">الوصف</th>
          <th style="width:70px;">الكمية</th>
          <th style="width:90px;">السعر</th>
          <th style="width:90px;">الخصم</th>
          <th style="width:110px; text-align: left;">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="6" style="text-align:center; padding: 40px; color: #94a3b8;">لا توجد أصناف في هذه القائمة</td></tr>'}
      </tbody>
    </table>

    <div style="display: flex; justify-content: flex-end;">
        <div class="totals" style="width: 350px;">
          <div class="total-row"><span>الإجمالي الفرعي</span><span>${subTotal.toFixed(2)} ج.م</span></div>
          ${itemsDiscount > 0 ? `<div class="total-row"><span>خصومات الأصناف</span><span style="color: #fca5a5;">- ${itemsDiscount.toFixed(2)} ج.م</span></div>` : ''}
          ${invoiceDiscount > 0 ? `<div class="total-row"><span>تخفيض الفاتورة</span><span style="color: #fca5a5;">- ${invoiceDiscount.toFixed(2)} ج.m</span></div>` : ''}
          <div class="total-row"><span>المبلغ المدفوع</span><span>${paidAmount.toFixed(2)} ج.م</span></div>
          <div class="total-row final">
            <span>${remaining > 0 ? 'الرصيد المتبقي' : 'حالة السداد'}</span>
            <span>${remaining > 0 ? `${remaining.toFixed(2)} ج.م` : 'مكتمل ✓'}</span>
          </div>
        </div>
    </div>

    <div class="footer">
        <div style="display: flex; justify-content: space-between; font-size: 11px;">
            <div>تم إصدارها في: ${printedAt}</div>
            <div>شكراً لتعاملكم معنا</div>
        </div>
    </div>
  </div>
</body>
</html>
  `.trim();
};
