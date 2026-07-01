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
      width: 74mm;
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
        margin: 0;
      }
    }

    .invoice {
      width: 78mm; /* Increased width slightly more */
      margin: 0 auto;
      padding: 0 4.5mm 0 1mm;
      background: #fff;
    }
    
    @media print {
      .invoice {
        margin: 0;
      }
    }

    .top-mini {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1mm 0;
      border-bottom: 1px solid #000;
      font-size: 10px;
      font-weight: 700;
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

    .brand-footer {
      margin-top: 3mm;
      border: 1px solid #686767ff;
      height: 20mm;
      background: #949393ff;
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
      direction: ltr; /* Force logo left, text right as in image */
    }

    .footer-logo {
      height: 18mm;
      width: 18mm;
      object-fit: contain;
      filter: grayscale(1) contrast(2); /* Enhanced B&W contrast */
    }

    .footer-logo-placeholder {
      font-size: 36px;
      width: 18mm;
      text-align: center;
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
      font-size: 12px;
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

    .table-wrap {
      margin-top: 1.5mm;
      border: 1px solid #000;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    thead th {
      background: #333;
      color: #fff;
      font-size: 11px;
      font-weight: 900;
      padding: 1.5mm 0.5mm;
      border-left: 1px solid #555;
    }

    thead th:last-child {
      border-left: 0;
    }

    tbody td {
      padding: 1.5mm 0.5mm;
      text-align: center;
      border-top: 1px solid #000;
      border-left: 1px solid #000;
      font-size: 11px;
      font-weight: 700;
    }

    tbody td:last-child {
      border-left: 0;
    }

    .product-name {
      text-align: right;
      padding-right: 1mm;
      word-break: break-word;
    }

    .summary-area {
      display: grid;
      grid-template-columns: 1fr 15mm;
      gap: 1.5mm;
      margin-top: 2mm;
    }

    .pieces-box {
      border: 1px solid #000;
      display: flex;
      flex-direction: column;
      text-align: center;
    }

    .pieces-title {
      background: #e0e0e0;
      padding: 1mm 0;
      font-size: 11px;
      font-weight: 900;
      border-bottom: 1px solid #000;
    }

    .pieces-value {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 900;
    }

    .pieces-title {
      background: var(--soft);
      line-height: 1.7;
    }

    .pieces-line {
      border-top: 2px dotted var(--main);
    }

    .totals-table {
      border: 1px solid #000;
    }

    .total-row {
      display: grid;
      grid-template-columns: 22mm 1fr;
      min-height: 7mm;
      border-bottom: 1px solid #000;
    }

    .total-row:last-child {
      border-bottom: 0;
    }

    .total-label {
      background: #e0e0e0;
      border-left: 1px solid #000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 900;
    }

    .total-value {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 900;
    }

    .balance-area {
      margin-top: 1.5mm;
      border: 1px solid #000;
      background: #fff;
    }

    .balance-row {
      display: grid;
      grid-template-columns: 22mm 1fr;
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
      font-size: 12px;
      font-weight: 900;
    }

    .balance-value {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 800;
    }

    .scan-text {
      margin-top: 3mm;
      text-align: center;
      font-weight: 700;
      font-size: 11px;
    }

    .footer-date {
      margin-top: 2mm;
      display: flex;
      align-items: center;
      gap: 2mm;
      direction: ltr;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
      color: var(--dark);
    }

    .footer-date::before,
    .footer-date::after {
      content: "";
      height: 1px;
      flex: 1;
      background: var(--main);
    }

    .thank-you {
      margin-top: 1mm;
      text-align: center;
            margin-bottom: 5mm;

      font-size: 11px;
      font-weight: 800;
    }

    .print-action {
      margin-top: 3mm;
      text-align: center;
    }

    .print-action button {
      background: #000;
      color: #fff;
      padding: 1.5mm 5mm;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 800;
      cursor: pointer;
    }

    @media print {
      .print-action { display: none !important; }
      .invoice { border: 1px solid #000; }
    }
  </style>
</head>

<body>
  <div class="invoice">


    <div class="brand-row">
      <div class="title-box">فاتورة مبيعات</div>
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
              <td class="product-name">{{this.name}}</td>
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

        <div class="total-row">
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
        <div class="pieces-title"> عدد القطع </div>
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
          <div class="footer-logo-placeholder">👕</div>
        {{/if}}
        <div class="footer-text-col">
          <div class="footer-en">ELYOUSR</div>
          <div class="footer-ar">للملابس الجاهزة</div>
        </div>
      </div>
    </div>

    <div class="print-action">
      <button onclick="window.print()">طباعة الفاتورة</button>
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


export const renderProfessional = ({
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

  // Helper to format numbers to Arabic digits and remove trailing zeros
  const formatNum = (num) => {
    const val = toNumber(num);
    const simplified = parseFloat(val.toFixed(2));
    return simplified.toLocaleString('ar-EG', { useGrouping: false });
  };

  const data = {
    company: {
      name: company?.name || 'ERP SYSTEM',
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
      name: customerName,
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
  id: 'professional-80mm',
  name: 'Professional 80mm Receipt',
  paperSize: '80mm',
  width: 80,
  height: 'auto'
};