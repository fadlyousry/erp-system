/**
 * Classic A4 Invoice Template
 * Handlebars template for A4 paper (210mm × 297mm)
 */

import Handlebars from 'handlebars';
import {
  toNumber, getSaleDate, calculateSaleFinancials, escapeHtml
} from '../../../shared/helpers';

export const template = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>فاتورة بيع رقم {{invoice.id}}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 18px;
      font-family: "Segoe UI", Tahoma, sans-serif;
      color: #111827;
      background: #ffffff;
      direction: rtl;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .container {
      max-width: 210mm;
      margin: 0 auto;
      border: 1px solid #d1d5db;
      border-radius: 10px;
      padding: 18px;
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #111827;
      margin-bottom: 12px;
      padding-bottom: 10px;
    }
    .header .name { font-size: 25px; font-weight: 800; }
    .header .line { font-size: 13px; margin-top: 3px; color: #374151; }
    .title {
      text-align: center;
      font-size: 20px;
      font-weight: 800;
      margin-bottom: 10px;
      color: #1e40af;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 12px;
    }
    .meta-box {
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 10px;
      background: #f9fafb;
      font-size: 13px;
      line-height: 1.6;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 8px;
      font-size: 13px;
      text-align: right;
      vertical-align: top;
    }
    th {
      background: #f3f4f6;
      font-weight: 700;
    }
    .item-meta {
      font-size: 11px;
      color: #6b7280;
      margin-top: 2px;
    }
    .totals {
      margin-right: auto;
      max-width: 360px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 10px;
      background: #f9fafb;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      margin: 6px 0;
      font-size: 14px;
    }
    .total-row.final {
      border-top: 1px solid #d1d5db;
      padding-top: 8px;
      font-size: 17px;
      font-weight: 800;
      color: #1e40af;
    }
    .footer {
      margin-top: 16px;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
    }
    @media print {
      body { padding: 0; }
      .container { border: none; border-radius: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="name">{{company.name}}</div>
      {{#if company.contactNumbers}}
      <div class="line">هاتف: {{company.contactNumbers}}</div>
      {{/if}}
      {{#if company.address}}
      <div class="line">العنوان: {{company.address}}</div>
      {{/if}}
    </div>

    <!-- Title -->
    <div class="title">فاتورة بيع - نمط كلاسيكي</div>

    <!-- Meta Information -->
    <div class="meta">
      <div class="meta-box">
        <div><strong>رقم الفاتورة:</strong> #{{invoice.id}}</div>
        <div><strong>التاريخ:</strong> {{invoice.date}}</div>
        <div><strong>نوع البيع:</strong> {{invoice.saleType}}</div>
      </div>
      <div class="meta-box">
        <div><strong>العميل:</strong> {{customer.name}}</div>
        <div><strong>الهاتف:</strong> {{customer.phone}}</div>
        {{#if customer.address}}
        <div><strong>العنوان:</strong> {{customer.address}}</div>
        {{/if}}
      </div>
    </div>

    <!-- Items Table -->
    <table>
      <thead>
        <tr>
          <th style="width:40px;">#</th>
          <th>الصنف</th>
          <th style="width:70px;">الكمية</th>
          <th style="width:90px;">السعر</th>
          <th style="width:90px;">الخصم</th>
          <th style="width:100px;">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        {{#if items}}
          {{#each items}}
          <tr>
            <td>{{@index}}</td>
            <td>
              <div>{{this.name}}</div>
              {{#if this.specs}}
              <div class="item-meta">{{this.specs}}</div>
              {{/if}}
            </td>
            <td>{{this.quantity}}</td>
            <td>{{this.price}}</td>
            <td>{{this.discount}}</td>
            <td>{{this.total}}</td>
          </tr>
          {{/each}}
        {{else}}
          <tr>
            <td colspan="6" style="text-align:center">لا توجد أصناف</td>
          </tr>
        {{/if}}
      </tbody>
    </table>

    <!-- Totals -->
    <div class="totals">
      <div class="total-row"><span>الإجمالي الفرعي</span><span>{{totals.subtotal}} ج.م</span></div>
      {{#if totals.itemsDiscount}}
      <div class="total-row"><span>خصم الأصناف</span><span>- {{totals.itemsDiscount}} ج.م</span></div>
      {{/if}}
      {{#if totals.invoiceDiscount}}
      <div class="total-row"><span>خصم الفاتورة</span><span>- {{totals.invoiceDiscount}} ج.م</span></div>
      {{/if}}
      <div class="total-row"><span>المدفوع</span><span>{{totals.paid}} ج.م</span></div>
      <div class="total-row final">
        <span>{{#if totals.hasRemaining}}المتبقي{{else}}الحالة{{/if}}</span>
        <span>{{#if totals.hasRemaining}}{{totals.remaining}} ج.م{{else}}مدفوع بالكامل ✓{{/if}}</span>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <div>شكراً لتعاملكم معنا</div>
      <div>تم الطباعة: {{invoice.printedAt}}</div>
    </div>
  </div>
</body>
</html>
`;

export const metadata = {
  id: 'classic-a4',
  name: 'Classic A4 Invoice',
  nameAr: 'فاتورة كلاسيكية A4',
  paperSize: 'a4',
  width: 210,
  height: 297,
  type: 'saleInvoice'
};

/**
 * Compile the Handlebars template
 */
const compiledTemplate = Handlebars.compile(template);

/**
 * Transform sale data to template-compatible format
 * @param {Object} sale - Sale object
 * @param {Object} customer - Customer object
 * @param {Object} company - Company settings
 * @returns {Object} - Template data
 */
const transformData = (sale, customer, company) => {
  const safeSale = sale || {};
  const safeCustomer = customer || safeSale?.customer || null;
  const { items, subTotal, itemsDiscount, invoiceDiscount, finalTotal, paidAmount, remaining } = calculateSaleFinancials(safeSale);

  const saleType = safeSale?.saleType || (remaining > 0 ? 'آجل' : 'نقدي');
  const saleDate = new Date(getSaleDate(safeSale)).toLocaleString('ar-EG');
  const printedAt = new Date().toLocaleString('ar-EG');

  return {
    invoice: {
      id: escapeHtml(safeSale?.id || '-'),
      date: escapeHtml(saleDate),
      saleType: escapeHtml(saleType),
      printedAt: escapeHtml(printedAt)
    },
    customer: {
      name: escapeHtml(safeCustomer?.name || 'عميل نقدي'),
      phone: escapeHtml(safeCustomer?.phone || '-'),
      address: escapeHtml(safeCustomer?.address || '')
    },
    company: {
      name: escapeHtml(company?.name || 'ERP SYSTEM'),
      contactNumbers: escapeHtml(company?.contactNumbers || ''),
      address: escapeHtml(company?.address || '')
    },
    items: items.map((item, index) => {
      const name = escapeHtml(item?.variant?.product?.name || item?.productName || 'صنف');
      const size = escapeHtml(item?.variant?.productSize || item?.size || '');
      const color = escapeHtml(item?.variant?.color || item?.color || '');
      const specs = [size, color].filter(Boolean).join(' - ');
      const quantity = toNumber(item?.quantity);
      const price = toNumber(item?.price);
      const discount = toNumber(item?.discount);
      const lineTotal = Math.max(0, (price - discount) * quantity);

      return {
        index: index + 1,
        name,
        specs: specs || null,
        quantity: quantity.toFixed(0),
        price: price.toFixed(2),
        discount: discount.toFixed(2),
        total: lineTotal.toFixed(2)
      };
    }),
    totals: {
      subtotal: subTotal.toFixed(2),
      itemsDiscount: itemsDiscount > 0 ? itemsDiscount.toFixed(2) : null,
      invoiceDiscount: invoiceDiscount > 0 ? invoiceDiscount.toFixed(2) : null,
      paid: paidAmount.toFixed(2),
      remaining: remaining.toFixed(2),
      hasRemaining: remaining > 0
    }
  };
};

/**
 * Render function for backward compatibility
 * @param {Object} params - Render parameters
 * @returns {string} - Rendered HTML
 */
export const renderA4Classic = ({ sale, customer, company, pageSize = 'A4' }) => {
  const data = transformData(sale, customer, company);
  return compiledTemplate(data);
};
