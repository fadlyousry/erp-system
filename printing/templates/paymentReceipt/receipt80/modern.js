import Handlebars from 'handlebars';
import { escapeHtml, toNumber } from '../../../shared/helpers';
import { CustomerLedgerService } from '../../../../src/services/customerLedgerService';

export const template = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>إيصال استلام نقدية {{voucher.id}}</title>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --ink: #101010;
      --muted: #000000ff;
      --line: #101010;
      --soft: #afafafff;
      --soft-2: #f7f7f7;
      --white: #ffffff;
      --black: #000000;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    @page {
      size: 80mm auto;
      margin: 0;
    }

    body {
      width: 78mm;
      margin: 0 auto;
      background: #ffffff;
      color: var(--ink);
      font-family: 'Tajawal', "Segoe UI", Tahoma, Arial, sans-serif;
      direction: rtl;
      font-size: 11px;
      line-height: 1.25;
    }

    @media print {
      body {
        margin-left: -19mm;
      }
    }

    .invoice {
      width: 100%;
      padding: 0 7.5mm 0 0;
      background: #ffffff;
    }

    .hero {
      border: 1px solid var(--line);
      border-radius: 2.5mm;
      overflow: hidden;
      background: var(--white);
      margin-top: 0;
    }

    .hero-top {
      min-height: 12mm;
      display: grid;
      grid-template-columns: 1fr 15mm;
      align-items: center;
      gap: 1.5mm;
      padding: 1.5mm 2mm;
      background: var(--soft-2);
    }

    .hero-title {
      font-size: 17px;
      font-weight: 900;
      line-height: 1.1;
      letter-spacing: -0.2px;
    }

    .hero-company {
      margin-top: 0.7mm;
      font-size: 10px;
      font-weight: 800;
      color: var(--ink);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .hero-mark {
      width: 13mm;
      height: 13mm;
      border: 1px solid var(--line);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      overflow: hidden;
      font-size: 15px;
      font-weight: 900;
      direction: ltr;
    }

    .hero-logo {
      width: 100%;
      height: 100%;
      object-fit: contain;
      filter: grayscale(1) contrast(1.5);
    }

    .hero-bottom {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-top: 1px solid var(--line);
      background: var(--black);
      color: #ffffff;
      font-size: 10px;
      font-weight: 900;
      text-align: center;
    }

    .hero-chip {
      padding: 1mm 0.7mm;
      border-left: 1px solid rgba(255, 255, 255, 0.4);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .hero-chip:last-child {
      border-left: 0;
    }

    .field-row {
      display: grid;
      grid-template-columns: 24mm 1fr;
      margin-top: 1mm;
      border: 1px solid var(--line);
      border-radius: 1.6mm;
      overflow: hidden;
      min-height: 7mm;
      background: #ffffff;
    }

    .field-label {
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--soft);
      border-left: 1px solid var(--line);
      font-size: 11px;
      font-weight: 900;
      white-space: nowrap;
    }

    .field-value {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      font-size: 12px;
      font-weight: 800;
      padding: 0 1.6mm;
      word-break: break-word;
      background: #ffffff;
    }

    .amount-hero {
      margin-top: 2mm;
      border: 2px solid var(--black);
      border-radius: 2.5mm;
      overflow: hidden;
      text-align: center;
      background: var(--white);
    }

    .amount-title {
      background: var(--black);
      color: #ffffff;
      padding: 1mm 0;
      font-size: 12px;
      font-weight: 900;
    }

    .amount-value {
      font-size: 24px;
      font-weight: 900;
      padding: 2mm 0;
      direction: ltr;
    }

    .amount-words {
      font-size: 10px;
      font-weight: 700;
      padding-bottom: 2mm;
      color: var(--muted);
    }

    .balance-area {
      margin-top: 2mm;
      border: 1px solid var(--line);
      border-radius: 2mm;
      overflow: hidden;
      background: #ffffff;
    }

    .balance-row {
      display: grid;
      grid-template-columns: 24mm 1fr;
      min-height: 7mm;
      border-bottom: 1px solid var(--line);
    }

    .balance-row:last-child {
      border-bottom: 0;
    }

    .balance-label {
      background: var(--soft);
      border-left: 1px solid var(--line);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 900;
      white-space: nowrap;
    }

    .balance-value {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 900;
      direction: ltr;
    }

    .notes-area {
      margin-top: 2mm;
      border: 1px solid var(--line);
      border-radius: 1.6mm;
      padding: 2mm;
      background: var(--soft-2);
      font-size: 11px;
    }

    .footer-date {
      margin-top: 3mm;
      display: flex;
      align-items: center;
      gap: 2mm;
      direction: ltr;
      justify-content: center;
      font-size: 10px;
      font-weight: 800;
      color: var(--ink);
    }

    .footer-date::before,
    .footer-date::after {
      content: "";
      height: 1px;
      flex: 1;
      background: var(--line);
    }

    .thank-you {
      margin-top: 1mm;
      margin-bottom: 15mm;
      text-align: center;
      font-size: 11px;
      font-weight: 900;
    }

    .brand-footer {
      margin-top: 3mm;
      border: 1px solid var(--line);
      border-radius: 2.5mm;
      height: 20mm;
      background: var(--soft);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .footer-brand-wrap {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 5mm;
      width: 100%;
      direction: ltr;
    }

    .footer-logo-placeholder {
      height: 17mm;
      width: 17mm;
      min-width: 17mm;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      border: 1px solid var(--line);
      border-radius: 50%;
      font-size: 15px;
      font-weight: 900;
      letter-spacing: -0.4px;
    }

    .footer-text-col {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 0;
    }

    .footer-en {
      font-size: 19px;
      font-weight: 900;
      color: #000000;
      letter-spacing: 0.4px;
      line-height: 1.05;
      white-space: nowrap;
    }

    .footer-ar {
      font-size: 16px;
      font-weight: 900;
      color: #000000;
      line-height: 1;
      margin-top: 1mm;
      white-space: nowrap;
    }

    .print-action {
      margin-top: 3mm;
      text-align: center;
    }

    .print-action button {
      background: #000000;
      color: #ffffff;
      border: 0;
      padding: 1.5mm 5mm;
      border-radius: 2mm;
      font-size: 11px;
      font-weight: 900;
      cursor: pointer;
      font-family: inherit;
    }

    @media print {
      body { margin: 0 auto; }
      .print-action { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="hero">
      <div class="hero-top">
        <div>
          <div class="hero-title">إيصال استلام نقدية</div>
        </div>
      </div>
      <div class="hero-bottom">
        <div class="hero-chip">رقم: {{voucher.id}}</div>
        <div class="hero-chip">التاريخ: {{voucher.date}}</div>
      </div>
    </div>

    <div class="field-row">
      <div class="field-label">استلمنا من</div>
      <div class="field-value">{{customer.name}}</div>
    </div>

    <div class="field-row">
      <div class="field-label">طريقة الدفع</div>
      <div class="field-value">{{voucher.method}}</div>
    </div>

    <div class="amount-hero">
      <div class="amount-title">مبلـغ وقدره</div>
      <div class="amount-value">{{voucher.amount}} ج.م</div>
      <div class="amount-words">({{voucher.amountInWords}} جنيهًا مصرياً لا غير)</div>
    </div>

    {{#if voucher.notes}}
    <div class="notes-area">
      <strong>ملاحظات:</strong> {{voucher.notes}}
    </div>
    {{/if}}

    <div class="balance-area">
      <div class="balance-row">
        <div class="balance-label">الرصيد المتبقي</div>
        <div class="balance-value">{{customer.balance}} ج.م</div>
      </div>
    </div>

    <div class="footer-date">{{voucher.printedAt}}</div>
    <div class="thank-you">شكراً لتعاملكم معنا</div>

    <div class="brand-footer">
      <div class="footer-brand-wrap">
        <div class="footer-logo-placeholder">ELY</div>
        <div class="footer-text-col">
          <div class="footer-en">ELYOUSR</div>
          <div class="footer-ar">للملابس الجاهزة</div>
        </div>
      </div>
    </div>

    <div class="print-action">
      <button onclick="window.api.silentPrint()">طباعة الإيصال</button>
    </div>
  </div>
</body>
</html>
`;

export const renderModern = ({ payment, customer, company }) => {
  const templateFn = Handlebars.compile(template);
  
  const formatNum = (num) => {
    const val = toNumber(num);
    return parseFloat(val.toFixed(2)).toLocaleString('ar-EG', { useGrouping: false });
  };

  const amount = toNumber(payment?.amount);
  let amountInWords = '';
  try {
    amountInWords = CustomerLedgerService.numberToArabicWords(amount);
  } catch { /* ignore */ }

  const data = {
    company: {
      name: company?.name || 'ELYOUSR',
      logoUrl: company?.logoUrl || ''
    },
    voucher: {
      id: payment?.id || '-',
      date: new Date(payment?.paymentDate || payment?.createdAt || new Date()).toLocaleString('ar-EG'),
      method: payment?.paymentMethod?.name || payment?.paymentMethod || 'نقدي',
      amount: formatNum(amount),
      amountInWords: amountInWords,
      notes: payment?.notes || '',
      printedAt: new Date().toLocaleString('ar-EG')
    },
    customer: {
      name: customer?.name || payment?.customer?.name || 'عميل',
      balance: formatNum(customer?.balance || payment?.customer?.balance || 0)
    }
  };

  return templateFn(data);
};

export const metadata = {
  id: 'modern-80mm',
  name: 'Modern 80mm Payment Receipt',
  paperSize: '80mm',
  width: 80,
  height: 'auto'
};
