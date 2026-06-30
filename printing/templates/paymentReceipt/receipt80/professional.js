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
      --bg: #f3f4f6;
      --bg-2: #ffffff;
      --main: #000000;
      --dark: #000000;
      --line: #000000;
      --head: #333333;
      --soft: #e0e0e0;
      --white: #ffffff;
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
      background: #fff;
      color: #000;
      font-family: 'Tajawal', "Segoe UI", Tahoma, Arial, sans-serif;
      direction: rtl;
      font-size: 11px;
      line-height: 1.2;
    }

    @media print {
      body {
        margin-left: -19mm;
      }
    }

    .invoice {
      width: 100%;
      padding: 0 7.5mm 0 0;
      background: #fff;
    }

    .brand-row {
      display: flex;
      border: 1px solid #000;
      margin-top: 0;
      background: #fff;
      align-items: center;
      justify-content: center;
    }

    .title-box {
      font-size: 15px;
      font-weight: 900;
      text-align: center;
      width: 100%;
      padding: 2mm 0;
      background: #e0e0e0;
    }

    .field-row {
      display: grid;
      grid-template-columns: 20mm 1fr;
      margin-top: 1mm;
      border: 1px solid #000;
      min-height: 7mm;
    }

    .field-label {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #e0e0e0;
      border-left: 1px solid #000;
      font-size: 11px;
      font-weight: 900;
    }

    .field-value {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      font-size: 12px;
      font-weight: 700;
      padding: 0 1.5mm;
      word-break: break-word;
    }

    .amount-hero {
      margin-top: 2mm;
      border: 1px solid #000;
      overflow: hidden;
      text-align: center;
      background: #fff;
    }

    .amount-title {
      background: #333;
      color: #fff;
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
      color: #333;
    }

    .balance-area {
      margin-top: 2mm;
      border: 1px solid #000;
      background: #fff;
    }

    .balance-row {
      display: grid;
      grid-template-columns: 24mm 1fr;
      min-height: 7mm;
      border-bottom: 1px solid #000;
    }

    .balance-row:last-child {
      border-bottom: 0;
    }

    .balance-label {
      background: #e0e0e0;
      border-left: 1px solid #000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 900;
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
      border: 1px solid #000;
      padding: 2mm;
      background: #f9f9f9;
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
      font-weight: 700;
      color: #000;
    }

    .footer-date::before,
    .footer-date::after {
      content: "";
      height: 1px;
      flex: 1;
      background: #000;
    }

    .thank-you {
      margin-top: 1mm;
      margin-bottom: 5mm;
      text-align: center;
      font-size: 11px;
      font-weight: 900;
    }

    .brand-footer {
      margin-top: 3mm;
      border: 1px solid #686767;
      height: 20mm;
      background: #949393;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 4mm;
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
      font-size: 36px;
      width: 18mm;
      text-align: center;
    }

    .footer-logo {
      height: 18mm;
      width: 18mm;
      object-fit: contain;
      filter: grayscale(1) contrast(2);
    }

    .footer-text-col {
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .footer-en {
      font-size: 19px;
      font-weight: 900;
      color: #000;
      letter-spacing: 0.5px;
      line-height: 1.1;
    }

    .footer-ar {
      font-size: 16px;
      font-weight: 800;
      color: #000;
      line-height: 1;
      margin-top: 1mm;
    }

    .print-action {
      margin-top: 3mm;
      text-align: center;
    }

    .print-action button {
      background: #000;
      color: #fff;
      border: 0;
      padding: 1.5mm 5mm;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 900;
      cursor: pointer;
    }

    @media print {
      .print-action { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="brand-row">
      <div class="title-box">إيصال استلام نقدية</div>
    </div>

    <div class="field-row">
      <div class="field-label">رقم الإيصال</div>
      <div class="field-value">{{voucher.id}}<br/>{{voucher.method}}</div>

    </div>

    <div class="field-row">
      <div class="field-label">التاريخ</div>
      <div class="field-value">{{voucher.date}}</div>
    </div>

    <div class="field-row">
      <div class="field-label">استلمنا من</div>
      <div class="field-value">{{customer.name}}</div>
    </div>



    <div class="balance-area">
      <div class="balance-row">
        <div class="balance-label">الرصيد السابق</div>
        <div class="balance-value">{{customer.previousBalance}}</div>
      </div>
      <div class="balance-row">
        <div class="balance-label">المبلغ المدفوع</div>
        <div class="balance-value">{{voucher.amount}}</div>
      </div>
    </div>

    {{#if voucher.notes}}
    <div class="notes-area">
      <strong>ملاحظات:</strong> {{voucher.notes}}
    </div>
    {{/if}}

    <div class="balance-area">
      <div class="balance-row">
        <div class="balance-label">الرصيد المتبقي</div>
        <div class="balance-value">{{customer.balance}}</div>
      </div>
    </div>

    <div class="footer-date">{{voucher.printedAt}}</div>
    <div class="thank-you">شكراً لتعاملكم معنا</div>

    <div class="brand-footer">
      <div class="footer-brand-wrap">
        {{#if company.logoUrl}}
          <img src="{{company.logoUrl}}" alt="Logo" class="footer-logo" />
        {{else}}
          <div class="footer-logo-placeholder">👕</div>
        {{/if}}
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

export const renderProfessional = ({ payment, customer, company }) => {
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
      previousBalance: formatNum(toNumber(customer?.balance || payment?.customer?.balance || 0) + amount),
      balance: formatNum(customer?.balance || payment?.customer?.balance || 0)
    }
  };

  return templateFn(data);
};

export const metadata = {
  id: 'professional-80mm',
  name: 'Professional 80mm Payment Receipt',
  paperSize: '80mm',
  width: 80,
  height: 'auto'
};
