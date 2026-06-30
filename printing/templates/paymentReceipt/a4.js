import { CustomerLedgerService } from '../../../src/services/customerLedgerService';
import {
  escapeHtml, toNumber, commonA4Styles,
  renderA4Header, renderFooter, getPaymentDate
} from '../../shared/helpers';

export const generatePaymentReceiptA4 = ({ payment, customer, company, pageSize = 'A4' }) => {
  const safePayment = payment || {};
  const safeCustomer = customer || safePayment?.customer || null;
  const amount = Math.max(0, toNumber(safePayment?.amount, 0));
  const remainingBalance = toNumber(safeCustomer?.balance, 0);
  const paymentDate = new Date(getPaymentDate(safePayment)).toLocaleString('ar-EG');
  const printedAt = new Date().toLocaleString('ar-EG');

  const receiptId = escapeHtml(safePayment?.id || '-');
  const customerName = escapeHtml(safeCustomer?.name || '-');
  const customerPhone = escapeHtml(safeCustomer?.phone || '-');
  const paymentMethod = escapeHtml(
    safePayment?.paymentMethod?.name || safePayment?.paymentMethod || safePayment?.method || '-'
  );
  const notes = escapeHtml(safePayment?.notes || '');

  let amountInWords = '';
  try {
    amountInWords = escapeHtml(CustomerLedgerService.numberToArabicWords(amount));
  } catch { /* ignore */ }

  const titleColor = '#0f766e';

  return `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>إيصال دفع رقم ${receiptId}</title>
  <style>
    ${commonA4Styles(pageSize)}
    .title { color: ${titleColor}; }
    .amount-box {
      border: 2px solid #16a34a;
      border-radius: 8px;
      padding: 12px;
      text-align: center;
      margin-bottom: 12px;
      background: #f0fdf4;
      color: #166534;
    }
    .amount-box .amount {
      font-size: ${pageSize === 'A5' ? '22px' : '28px'};
      font-weight: 800;
      margin-bottom: 4px;
    }
    .notes-box {
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 10px;
      background: #f9fafb;
      margin-bottom: 12px;
      font-size: ${pageSize === 'A5' ? '12px' : '14px'};
    }
  </style>
</head>
<body>
  <div class="container">
    ${renderA4Header(company)}
    <div class="title">إيصال دفع / سند قبض</div>

    <div class="meta-box" style="margin-bottom: 12px; font-size: ${pageSize === 'A5' ? '12px' : '14px'}; line-height: 1.7;">
      <div style="display: flex; justify-content: space-between; margin: 5px 0;"><strong>رقم الإيصال:</strong><span>${receiptId}</span></div>
      <div style="display: flex; justify-content: space-between; margin: 5px 0;"><strong>التاريخ:</strong><span>${escapeHtml(paymentDate)}</span></div>
      <div style="display: flex; justify-content: space-between; margin: 5px 0;"><strong>العميل:</strong><span>${customerName}</span></div>
      <div style="display: flex; justify-content: space-between; margin: 5px 0;"><strong>الهاتف:</strong><span>${customerPhone}</span></div>
      <div style="display: flex; justify-content: space-between; margin: 5px 0;"><strong>طريقة الدفع:</strong><span>${paymentMethod}</span></div>
      <div style="display: flex; justify-content: space-between; margin: 5px 0;">
        <strong>الرصيد المتبقي:</strong>
        <span style="font-weight:700;color:${remainingBalance > 0 ? '#dc2626' : '#16a34a'};">
          ${remainingBalance.toFixed(2)} ج.م
        </span>
      </div>
    </div>

    <div class="amount-box">
      <div class="amount">${amount.toFixed(2)} ج.م</div>
      <div>المبلغ المستلم</div>
      ${amountInWords ? `<div style="font-size:12px;margin-top:6px;">(${amountInWords} جنيهًا مصريًا)</div>` : ''}
    </div>

    ${notes ? `<div class="notes-box"><strong>ملاحظات:</strong> ${notes}</div>` : ''}

    ${renderFooter(printedAt)}
  </div>
</body>
</html>
  `.trim();
};
