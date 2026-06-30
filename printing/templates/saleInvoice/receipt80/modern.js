import Handlebars from 'handlebars';
import { escapeHtml, toNumber } from '../../../shared/helpers';

export const template = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>فاتورة مبيعات {{invoice.id}}</title>

  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet">

  <style>
    :root {
      --ink: #101010;
      --muted: #5f5f5f;
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
      grid-template-columns: 20mm 1fr;
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
      font-size: 12px;
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

    .table-wrap {
      margin-top: 1.5mm;
      border: 1px solid var(--line);
      border-radius: 2mm;
      overflow: hidden;
      background: #ffffff;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    thead th {
      background: var(--black);
      color: #ffffff;
      font-size: 11px;
      font-weight: 900;
      padding: 1.6mm 0.5mm;
      border-left: 1px solid #555555;
      text-align: center;
      white-space: nowrap;
    }

    thead th:last-child {
      border-left: 0;
    }

    tbody td {
      padding: 1.5mm 0.5mm;
      text-align: center;
      border-top: 1px solid var(--line);
      border-left: 1px solid var(--line);
      font-size: 11px;
      font-weight: 800;
      vertical-align: middle;
      background: #ffffff;
    }

    tbody tr:nth-child(even) td {
      background: var(--soft-2);
    }

    tbody td:last-child {
      border-left: 0;
    }

    .product-name {
      text-align: right;
      padding-right: 1mm;
      word-break: break-word;
      line-height: 1.25;
    }

    .summary-area {
      display: grid;
      grid-template-columns: 1fr 15mm;
      gap: 1.5mm;
      margin-top: 2mm;
      align-items: stretch;
    }

    .totals-table {
      border: 1px solid var(--line);
      border-radius: 2mm;
      overflow: hidden;
      background: #ffffff;
    }

    .total-row {
      display: grid;
      grid-template-columns: 22mm 1fr;
      min-height: 7mm;
      border-bottom: 1px solid var(--line);
    }

    .total-row:last-child {
      border-bottom: 0;
    }

    .total-label {
      background: var(--soft);
      border-left: 1px solid var(--line);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 900;
      white-space: nowrap;
    }

    .total-value {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 900;
      direction: ltr;
      background: #ffffff;
    }

    .total-row.grand .total-label,
    .total-row.grand .total-value {
      background: var(--black);
      color: #ffffff;
      border-color: var(--black);
      font-size: 13px;
    }

    .pieces-box {
      border: 1px solid var(--line);
      border-radius: 2mm;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      text-align: center;
      background: #ffffff;
    }

    .pieces-title {
      background: var(--black);
      color: #ffffff;
      padding: 1.3mm 0.4mm;
      font-size: 10.5px;
      font-weight: 900;
      line-height: 1.35;
      border-bottom: 1px solid var(--line);
    }

    .pieces-value {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 900;
      direction: ltr;
    }

    .balance-area {
      margin-top: 1.5mm;
      border: 1px solid var(--line);
      border-radius: 2mm;
      overflow: hidden;
      background: #ffffff;
    }

    .balance-row {
      display: grid;
      grid-template-columns: 22mm 1fr;
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
      font-size: 12px;
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

    .footer-date {
      margin-top: 2mm;
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
      padding: 0 4mm;
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

    .footer-logo {
      height: 17mm;
      width: 17mm;
      object-fit: contain;
      filter: grayscale(1) contrast(1.7);
      background: #ffffff;
      border: 1px solid var(--line);
      border-radius: 50%;
      padding: 1mm;
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
      body {
        margin: 0 auto;
      }

      .print-action {
        display: none !important;
      }
    }
  </style>
</head>

<body>
  <div class="invoice">

    <div class="hero">
      <div class="hero-top">
        <div>
          <div class="hero-title">فاتورة مبيعات</div>
        </div>
      </div>

      <div class="hero-bottom">
        <div class="hero-chip">
          {{#if invoice.id}}رقم: {{invoice.id}}{{else}}فاتورة بيع{{/if}}
        </div>
        <div class="hero-chip">
          {{#if invoice.saleType}}{{invoice.saleType}}{{else}}بيع مباشر{{/if}}
        </div>
      </div>
    </div>

    <div class="field-row">
      <div class="field-label">التاريخ</div>
      <div class="field-value">{{invoice.date}}</div>
    </div>

    <div class="field-row">
      <div class="field-label">اسم العميل</div>
      <div class="field-value">{{customer.name}}</div>
    </div>

    {{#if customer.phone}}
    <div class="field-row">
      <div class="field-label">الهاتف</div>
      <div class="field-value">{{customer.phone}}</div>
    </div>
    {{/if}}

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width: 40%;">الصنف</th>
            <th style="width: 15%;">كمية</th>
            <th style="width: 20%;">سعر</th>
            <th style="width: 25%;">إجمالي</th>
          </tr>
        </thead>
        <tbody>
          {{#if items}}
            {{#each items}}
            <tr>
              <td class="product-name">{{{this.name}}}</td>
              <td>{{this.quantity}}</td>
              <td>{{this.price}}</td>
              <td>{{this.total}}</td>
            </tr>
            {{/each}}
          {{else}}
            <tr>
              <td colspan="4">لا توجد أصناف</td>
            </tr>
          {{/if}}
        </tbody>
      </table>
    </div>

    <div class="summary-area">
      <div class="totals-table">
        {{#if totals.showSubtotal}}
        <div class="total-row">
          <div class="total-label">قبل الخصم</div>
          <div class="total-value">{{totals.subtotal}}</div>
        </div>

        <div class="total-row">
          <div class="total-label">الخصم</div>
          <div class="total-value">{{totals.totalDiscount}}</div>
        </div>
        {{/if}}

        <div class="total-row ">
          <div class="total-label">إجمالي</div>
          <div class="total-value">{{totals.finalTotal}}</div>
        </div>

        <div class="total-row">
          <div class="total-label">المدفوع</div>
          <div class="total-value">{{totals.paid}}</div>
        </div>

        <div class="total-row">
          <div class="total-label">المتبقي</div>
          <div class="total-value">{{totals.remaining}}</div>
        </div>
      </div>

      <div class="pieces-box">
        <div class="pieces-title">عدد<br />القطع</div>
        <div class="pieces-value">{{totals.totalQuantity}}</div>
      </div>
    </div>

    <div class="balance-area">
      <div class="balance-row">
        <div class="balance-label">الرصيد السابق</div>
        <div class="balance-value">{{customer.previousBalance}}</div>
      </div>

      <div class="balance-row">
        <div class="balance-label">الرصيد الحالي</div>
        <div class="balance-value">{{customer.currentBalance}}</div>
      </div>
    </div>

    <div class="footer-date">{{invoice.printedAt}}</div>

    <div class="thank-you">شكراً لتعاملكم معنا</div>

    <div class="brand-footer">
      <div class="footer-brand-wrap">
        {{#if company.logoUrl}}
          <img src="{{company.logoUrl}}" alt="Logo" class="footer-logo" />
        {{else}}
          <div class="footer-logo-placeholder">ELY</div>
        {{/if}}

        <div class="footer-text-col">
          <div class="footer-en">ELYOUSR</div>
          <div class="footer-ar">للملابس الجاهزة</div>
        </div>
      </div>
    </div>

    <div class="print-action">
      <button onclick="window.api.silentPrint()">طباعة الفاتورة</button>
    </div>
  </div>

  <script>
    document.addEventListener('keydown', function(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        window.print();
      }
    });
  </script>
</body>
</html>
`;

export const renderModern = ({
  saleId,
  dateLine,
  saleType,
  customerName,
  customerPhone,
  company,
  items,
  subTotal,
  itemsDiscount,
  invoiceDiscount,
  finalTotal,
  paidAmount,
  remaining,
  previousBalance,
  currentBalance,
  printedAt
}) => {
  const templateFn = Handlebars.compile(template);

  const formatNum = (num) => {
    const val = toNumber(num);
    const simplified = parseFloat(val.toFixed(2));
    return simplified.toLocaleString('ar-EG', { useGrouping: false });
  };

  const data = {
    company: {
      name: company?.name || 'ELYOUSR',
      qrUrl: company?.qrUrl || '',
      logoUrl: company?.logoUrl || '',
      facebookQrUrl: company?.facebookQrUrl || '',
      instagramQrUrl: company?.instagramQrUrl || ''
    },
    invoice: {
      id: saleId,
      date: dateLine,
      saleType: saleType,
      printedAt: printedAt
    },
    customer: {
      name: customerName || 'عميل نقدي',
      phone: customerPhone,
      previousBalance: formatNum(previousBalance),
      currentBalance: formatNum(currentBalance)
    },
    items: (items || []).map((item) => {
      const price = toNumber(item?.price);
      const qty = toNumber(item?.quantity);
      const disc = toNumber(item?.discount);
      const total = (price - disc) * qty;

      return {
        name: escapeHtml(item?.variant?.product?.name || item?.productName || 'صنف'),
        price: formatNum(price),
        quantity: formatNum(qty),
        total: formatNum(total)
      };
    }),
    totals: {
      totalQuantity: formatNum((items || []).reduce((sum, item) => sum + toNumber(item?.quantity), 0)),
      finalTotal: formatNum(finalTotal),
      paid: formatNum(paidAmount),
      remaining: formatNum(remaining),
      totalDiscount: formatNum(toNumber(itemsDiscount) + toNumber(invoiceDiscount)),
      showSubtotal: (toNumber(itemsDiscount) + toNumber(invoiceDiscount)) > 0,
      subtotal: formatNum(subTotal)
    }
  };

  return templateFn(data);
};

export const metadata = {
  id: 'modern-80mm',
  name: 'Modern Professional 80mm Receipt',
  paperSize: '80mm',
  width: 80,
  height: 'auto'
};