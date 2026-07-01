import Handlebars from 'handlebars';
import { escapeHtml, toNumber } from '../../../shared/helpers';

export const template = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>فاتورة مبيعات {{invoice.id}}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Tajawal:wght@400;500;700;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #0f172a;
      --secondary: #475569;
      --accent: #0ea5e9;
      --text: #1e293b;
      --text-muted: #64748b;
      --bg-subtle: #f8fafc;
      --border: #e2e8f0;
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
      width: 76mm;
      margin: 0 auto;
      background: var(--white);
      color: var(--text);
      font-family: 'Cairo', 'Tajawal', "Segoe UI", sans-serif;
      direction: rtl;
      font-size: 11px;
      line-height: 1.35;
      padding: 3mm 2mm;
    }

    .invoice-card {
      width: 100%;
      background: var(--white);
    }

    /* ── Header styling ── */
    .header-card {
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 4mm 3mm;
      text-align: center;
      margin-bottom: 3mm;
      position: relative;
      overflow: hidden;
    }

    .header-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, #0ea5e9, #2563eb);
    }

    .brand-title {
      font-size: 16px;
      font-weight: 800;
      color: var(--primary);
      margin-bottom: 1mm;
      letter-spacing: -0.3px;
    }

    .brand-tagline {
      font-size: 9.5px;
      color: var(--text-muted);
      margin-bottom: 2.5mm;
      font-weight: 600;
    }

    .badge-row {
      display: flex;
      justify-content: center;
      gap: 1.5mm;
    }

    .badge {
      background: var(--primary);
      color: var(--white);
      font-size: 9px;
      font-weight: 700;
      padding: 0.6mm 2mm;
      border-radius: 6px;
      text-transform: uppercase;
    }

    .badge.accent {
      background: var(--accent);
    }

    /* ── Info Rows ── */
    .info-group {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 2.5mm;
      background: var(--white);
      margin-bottom: 3mm;
      display: flex;
      flex-direction: column;
      gap: 1.5mm;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
    }

    .info-row .label {
      color: var(--text-muted);
      font-weight: 600;
    }

    .info-row .value {
      color: var(--primary);
      font-weight: 700;
    }

    /* ── Products Table ── */
    .table-container {
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 3.5mm;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }

    thead {
      background: var(--primary);
    }

    thead th {
      color: var(--white);
      font-weight: 700;
      padding: 2mm 1mm;
      text-align: center;
    }

    thead th:first-child {
      text-align: right;
      padding-right: 2.5mm;
    }

    tbody td {
      padding: 2mm 1.5mm;
      text-align: center;
      border-bottom: 1px solid var(--border);
      color: var(--text);
      font-weight: 600;
      vertical-align: middle;
    }

    tbody tr:last-child td {
      border-bottom: 0;
    }

    tbody tr:nth-child(even) {
      background: var(--bg-subtle);
    }

    .product-title {
      text-align: right;
      padding-right: 2.5mm;
      font-weight: 700;
      color: var(--primary);
      word-break: break-word;
    }

    /* ── Summary & Totals ── */
    .summary-section {
      display: grid;
      grid-template-columns: 1fr 16mm;
      gap: 2mm;
      margin-bottom: 3mm;
    }

    .totals-box {
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--white);
      overflow: hidden;
    }

    .total-item {
      display: flex;
      justify-content: space-between;
      padding: 2mm 2.5mm;
      border-bottom: 1px solid var(--border);
      font-size: 11px;
    }

    .total-item:last-child {
      border-bottom: 0;
    }

    .total-item .label {
      color: var(--text-muted);
      font-weight: 600;
    }

    .total-item .value {
      font-weight: 700;
      color: var(--primary);
    }

    .total-item.grand {
      background: var(--primary);
    }

    .total-item.grand .label,
    .total-item.grand .value {
      color: var(--white);
      font-size: 12.5px;
      font-weight: 800;
    }

    .qty-card {
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--bg-subtle);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2mm 0;
    }

    .qty-card .title {
      font-size: 9px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-bottom: 1mm;
      text-align: center;
      line-height: 1.2;
    }

    .qty-card .value {
      font-size: 16px;
      font-weight: 800;
      color: var(--primary);
    }

    /* ── Customer Statement ── */
    .statement-box {
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--bg-subtle);
      padding: 2.5mm;
      margin-bottom: 3.5mm;
      display: flex;
      flex-direction: column;
      gap: 1.5mm;
    }

    .statement-title {
      font-size: 10.5px;
      font-weight: 700;
      color: var(--primary);
      text-align: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1.5mm;
      margin-bottom: 0.5mm;
    }

    /* ── Footer ── */
    .thank-you {
      text-align: center;
      font-size: 11.5px;
      font-weight: 800;
      color: var(--primary);
      margin-top: 1mm;
      margin-bottom: 2.5mm;
    }

    .printed-date {
      text-align: center;
      font-size: 9px;
      color: var(--text-muted);
      margin-bottom: 4mm;
      font-weight: 500;
    }

    .footer-brand {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 3mm;
      background: var(--bg-subtle);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 3mm;
    }

    .footer-logo {
      width: 12mm;
      height: 12mm;
      border-radius: 50%;
      background: var(--white);
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      color: var(--primary);
      font-size: 14px;
      object-fit: contain;
    }

    .footer-meta {
      display: flex;
      flex-direction: column;
    }

    .footer-meta .name {
      font-size: 12.5px;
      font-weight: 800;
      color: var(--primary);
    }

    .footer-meta .tagline {
      font-size: 9px;
      color: var(--text-muted);
      font-weight: 600;
    }

    .print-button-container {
      margin-top: 4mm;
      text-align: center;
    }

    .print-button-container button {
      background: var(--primary);
      color: var(--white);
      border: none;
      padding: 2mm 5mm;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
    }

    @media print {
      body {
        padding: 0;
      }
      .print-button-container {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="invoice-card">
    
    <!-- Company Header -->
    <div class="header-card">
      <div class="brand-title">{{company.name}}</div>
      {{#if company.address}}
        <div class="brand-tagline">{{company.address}}</div>
      {{else}}
        <div class="brand-tagline">نظام إدارة المبيعات المتكامل</div>
      {{/if}}
      
      <div class="badge-row">
        <span class="badge">فاتورة رقم #{{invoice.id}}</span>
        <span class="badge accent">{{#if invoice.saleType}}{{invoice.saleType}}{{else}}مبيعات{{/if}}</span>
      </div>
    </div>

    <!-- Invoice Metadata -->
    <div class="info-group">
      <div class="info-row">
        <span class="label">تاريخ الإصدار:</span>
        <span class="value">{{invoice.date}}</span>
      </div>
      <div class="info-row">
        <span class="label">العميل:</span>
        <span class="value">{{customer.name}}</span>
      </div>
      {{#if customer.phone}}
      <div class="info-row">
        <span class="label">رقم الهاتف:</span>
        <span class="value">{{customer.phone}}</span>
      </div>
      {{/if}}
    </div>

    <!-- Table of Items -->
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th style="width: 45%;">الصنف</th>
            <th style="width: 15%;">الكمية</th>
            <th style="width: 20%;">السعر</th>
            <th style="width: 20%;">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {{#if items}}
            {{#each items}}
            <tr>
              <td class="product-title">{{{this.name}}}</td>
              <td>{{this.quantity}}</td>
              <td>{{this.price}}</td>
              <td>{{this.total}}</td>
            </tr>
            {{/each}}
          {{else}}
            <tr>
              <td colspan="4">لا توجد أصناف في الفاتورة</td>
            </tr>
          {{/if}}
        </tbody>
      </table>
    </div>

    <!-- Totals Summary & Qty Badge -->
    <div class="summary-section">
      <div class="totals-box">
        {{#if totals.showSubtotal}}
        <div class="total-item">
          <span class="label">المجموع الفرعي:</span>
          <span class="value">{{totals.subtotal}}</span>
        </div>
        <div class="total-item">
          <span class="label">الخصم الإجمالي:</span>
          <span class="value">-{{totals.totalDiscount}}</span>
        </div>
        {{/if}}
        
        <div class="total-item grand">
          <span class="label">الصافي النهائي:</span>
          <span class="value">{{totals.finalTotal}}</span>
        </div>
        
        <div class="total-item">
          <span class="label">المبلغ المدفوع:</span>
          <span class="value">{{totals.paid}}</span>
        </div>
        
        <div class="total-item">
          <span class="label">المبلغ المتبقي:</span>
          <span class="value">{{totals.remaining}}</span>
        </div>
      </div>

      <div class="qty-card">
        <span class="title">إجمالي<br/>القطع</span>
        <span class="value">{{totals.totalQuantity}}</span>
      </div>
    </div>

    <!-- Customer Statement -->
    {{#if customer.currentBalance}}
    <div class="statement-box">
      <div class="statement-title">كشف حساب العميل</div>
      <div class="info-row">
        <span class="label">الرصيد السابق:</span>
        <span class="value">{{customer.previousBalance}}</span>
      </div>
      <div class="info-row">
        <span class="label">الرصيد الحالي:</span>
        <span class="value" style="color: #ef4444;">{{customer.currentBalance}}</span>
      </div>
    </div>
    {{/if}}

    <!-- Footer info -->
    <div class="thank-you">شكراً لتعاملكم معنا!</div>
    <div class="printed-date">تاريخ الطباعة: {{invoice.printedAt}}</div>

    <!-- Branding Card -->
    <div class="footer-brand">
      {{#if company.logoUrl}}
        <img src="{{company.logoUrl}}" alt="Logo" class="footer-logo" />
      {{else}}
        <div class="footer-logo">ERP</div>
      {{/if}}
      <div class="footer-meta">
        <span class="name">{{company.name}}</span>
        {{#if company.companyContactNumbers}}
          <span class="tagline">تواصل معنا: {{company.companyContactNumbers}}</span>
        {{else}}
          <span class="tagline">فاتورة نظام معتمدة</span>
        {{/if}}
      </div>
    </div>

    <div class="print-button-container">
      <button onclick="window.print()">طباعة الفاتورة</button>
    </div>

  </div>
</body>
</html>
`;

export const renderClassic = ({
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
      name: company?.name || 'FYC Store Manager',
      address: company?.companyAddress || '',
      companyContactNumbers: company?.companyContactNumbers || '',
      logoUrl: company?.logoUrl || ''
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
  id: 'classic-80mm',
  name: 'Classic 80mm Receipt',
  paperSize: '80mm',
  width: 80,
  height: 'auto'
};
