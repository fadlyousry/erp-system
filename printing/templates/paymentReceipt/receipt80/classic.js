import { CustomerLedgerService } from '../../../../src/services/customerLedgerService';
import {
  escapeHtml, toNumber, commonReceipt80Styles,
  renderReceipt80Header, renderFooter, getPaymentDate
} from '../../../shared/helpers';

export const renderClassic = ({ payment, customer, company }) => {
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

  return `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>إيصال دفع رقم ${receiptId}</title>
  <style>

    ${commonReceipt80Styles()}
    .title { text-align: center; font-size: 16px; font-weight: 800; color: #0f766e; margin-top: 6px; }
    .amount-box {
      border: 2px solid #16a34a;
      border-radius: 6px;
      margin: 8px 0;
      padding: 8px;
      text-align: center;
      background: #f0fdf4;
    }
    .amount-box .amount { font-size: 20px; font-weight: 800; color: #166534; }
    .amount-box .label { font-size: 11px; color: #166534; }
    .notes-box {
      border: 1px solid #d1d5db;
      border-radius: 5px;
      padding: 6px;
      margin: 7px 0;
      background: #f9fafb;
      font-size: 11px;
    }
    @media print {
      body { width: 100%; margin: 0; padding: 0; }
    }
    .receipt-wrap {
      width: 78mm;
      margin: 0 auto;
      padding: 0 4.5mm 0 1mm;
    }
    @media print {
      .receipt-wrap {
        margin: 0;
      }
    }
  </style>
</head>
<body>
  <div class="receipt-wrap">
    ${renderReceipt80Header(company)}
    <div class="title">إيصال دفع</div>
    <div class="divider"></div>

    <div class="meta-row"><span>رقم الإيصال:</span><span>${receiptId}</span></div>
    <div class="meta-row"><span>التاريخ:</span><span>${escapeHtml(paymentDate)}</span></div>
    <div class="meta-row"><span>العميل:</span><span>${customerName}</span></div>
    <div class="meta-row"><span>الهاتف:</span><span>${customerPhone}</span></div>
    <div class="meta-row"><span>طريقة الدفع:</span><span>${paymentMethod}</span></div>

    <div class="amount-box">
      <div class="amount">${amount.toFixed(2)} ج.م</div>
      <div class="label">المبلغ المستلم</div>
      ${amountInWords ? `<div class="label">(${amountInWords} جنيهًا)</div>` : ''}
    </div>

    <div class="meta-row">
      <span>الرصيد المتبقي:</span>
      <span style="font-weight:700;color:${remainingBalance > 0 ? '#dc2626' : '#16a34a'};">
        ${remainingBalance.toFixed(2)} ج.م
      </span>
    </div>

    ${notes ? `<div class="notes-box"><strong>ملاحظات:</strong> ${notes}</div>` : ''}

    ${renderFooter(printedAt)}
    <div style="text-align:center;margin-top:20px;" class="no-print">
      <button onclick="window.api.silentPrint()" style="padding:10px 20px;background:#000;color:#fff;border:none;border-radius:5px;cursor:pointer;">طباعة صامتة</button>
    </div>
  </div>
</body>
</html>
  `.trim();
};

export const metadata = {
  id: 'classic-80mm',
  name: 'Classic 80mm Receipt',
  paperSize: '80mm',
  width: 80,
  height: 'auto'
};
