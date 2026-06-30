/**
 * Shared Helpers for all print templates
 */

export const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const toNumber = (value, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const formatMoney = (value) => `${toNumber(value, 0).toFixed(2)} ج.م`;

export const formatDate = (value, withTime = false) => {
  if (!value) return '-';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return withTime ? parsed.toLocaleString('ar-EG') : parsed.toLocaleDateString('ar-EG');
};

export const getSaleDate = (sale) => sale?.invoiceDate || sale?.createdAt || new Date().toISOString();

export const getPurchaseDate = (purchase) => purchase?.invoiceDate || purchase?.createdAt || new Date().toISOString();

export const getReturnDate = (ret) => ret?.returnDate || ret?.createdAt || new Date().toISOString();

export const getPaymentDate = (payment) => payment?.paymentDate || payment?.createdAt || new Date().toISOString();

/**
 * Calculate sale financials from a sale object + items
 */
export const calculateSaleFinancials = (sale) => {
  const safeSale = sale || {};
  const items = Array.isArray(safeSale?.items) ? safeSale.items : [];

  const subTotal = items.reduce((sum, item) => (
    sum + (toNumber(item?.price) * toNumber(item?.quantity))
  ), 0);
  const itemsDiscount = items.reduce((sum, item) => (
    sum + (toNumber(item?.discount) * toNumber(item?.quantity))
  ), 0);
  const invoiceDiscount = toNumber(safeSale?.discount);
  const calculatedTotal = Math.max(0, subTotal - itemsDiscount - invoiceDiscount);
  const finalTotal = Math.max(0, toNumber(safeSale?.total, calculatedTotal));
  const paidAmount = Math.max(0, toNumber(safeSale?.paid ?? safeSale?.paidAmount, 0));
  const remaining = Math.max(0, finalTotal - paidAmount);

  return { items, subTotal, itemsDiscount, invoiceDiscount, finalTotal, paidAmount, remaining };
};

/**
 * Calculate purchase financials from a purchase object + items
 */
export const calculatePurchaseFinancials = (purchase) => {
  const safePurchase = purchase || {};
  const items = Array.isArray(safePurchase?.items) ? safePurchase.items : [];

  const subTotal = items.reduce((sum, item) => (
    sum + (toNumber(item?.price ?? item?.cost) * toNumber(item?.quantity))
  ), 0);
  const invoiceDiscount = Math.max(0, toNumber(safePurchase?.discount, 0));
  const calculatedTotal = Math.max(0, subTotal - invoiceDiscount);
  const finalTotal = Math.max(0, toNumber(safePurchase?.total, calculatedTotal));
  const paidAmount = Math.max(0, toNumber(safePurchase?.paidAmount ?? safePurchase?.paid, 0));
  const remaining = Math.max(0, finalTotal - paidAmount);

  return { items, subTotal, invoiceDiscount, finalTotal, paidAmount, remaining };
};

/**
 * Build return line items from a return invoice
 */
export const buildReturnLines = (returnInvoice) => {
  const items = Array.isArray(returnInvoice?.items) ? returnInvoice.items : [];
  return items.map((item) => {
    const quantity = Math.max(0, toNumber(item?.quantity));
    const price = Math.max(0, toNumber(item?.price));
    return {
      name: escapeHtml(item?.variant?.product?.name || item?.productName || 'صنف'),
      size: escapeHtml(item?.variant?.productSize || item?.size || ''),
      color: escapeHtml(item?.variant?.color || item?.color || ''),
      quantity,
      price,
      total: quantity * price
    };
  });
};

/**
 * Common page wrapper for A4/A5 invoice styles
 */
export const commonA4Styles = (pageSize = 'A4') => `
  @page { size: ${pageSize}; margin: 10mm; }
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
    max-width: ${pageSize === 'A5' ? '148mm' : '210mm'};
    margin: 0 auto;
    border: 1px solid #d1d5db;
    border-radius: 10px;
    padding: ${pageSize === 'A5' ? '14px' : '18px'};
  }
  .header {
    text-align: center;
    border-bottom: 2px solid #111827;
    margin-bottom: 12px;
    padding-bottom: 10px;
  }
  .header .name { font-size: ${pageSize === 'A5' ? '20px' : '25px'}; font-weight: 800; }
  .header .line { font-size: ${pageSize === 'A5' ? '11px' : '13px'}; margin-top: 3px; color: #374151; }
  .title {
    text-align: center;
    font-size: ${pageSize === 'A5' ? '16px' : '20px'};
    font-weight: 800;
    margin-bottom: 10px;
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
    padding: ${pageSize === 'A5' ? '8px' : '10px'};
    background: #f9fafb;
    font-size: ${pageSize === 'A5' ? '11px' : '13px'};
    line-height: 1.6;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 12px;
  }
  th, td {
    border: 1px solid #d1d5db;
    padding: ${pageSize === 'A5' ? '5px' : '8px'};
    font-size: ${pageSize === 'A5' ? '11px' : '13px'};
    text-align: right;
    vertical-align: top;
  }
  th {
    background: #f3f4f6;
    font-weight: 700;
  }
  .item-meta {
    font-size: ${pageSize === 'A5' ? '9px' : '11px'};
    color: #6b7280;
    margin-top: 2px;
  }
  .totals {
    margin-right: auto;
    max-width: ${pageSize === 'A5' ? '260px' : '360px'};
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 10px;
    background: #f9fafb;
  }
  .total-row {
    display: flex;
    justify-content: space-between;
    margin: 6px 0;
    font-size: ${pageSize === 'A5' ? '12px' : '14px'};
  }
  .total-row.final {
    border-top: 1px solid #d1d5db;
    padding-top: 8px;
    font-size: ${pageSize === 'A5' ? '14px' : '17px'};
    font-weight: 800;
  }
  .footer {
    margin-top: 16px;
    text-align: center;
    font-size: ${pageSize === 'A5' ? '10px' : '12px'};
    color: #6b7280;
  }
  @media print {
    body { padding: 0; }
    .container { border: none; border-radius: 0; }
    .no-print { display: none !important; }
  }
`;

/**
 * Common receipt 80mm styles
 */
export const commonReceipt80Styles = () => `
  * { box-sizing: border-box; }
  body {
    width: 80mm;
    margin: 0 auto;
    padding: 4mm;
    font-family: "Segoe UI", Tahoma, sans-serif;
    font-size: 12px;
    color: #111827;
    line-height: 1.45;
    direction: rtl;
    background: #ffffff;
  }
  .header { text-align: center; }
  .header .name { font-size: 17px; font-weight: 800; margin-bottom: 3px; }
  .header .line { font-size: 11px; margin: 1px 0; }
  .divider { border-top: 1px dashed #111827; margin: 7px 0; }
  .divider-solid { border-top: 2px solid #111827; margin: 7px 0; }
  .meta-row, .total-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .meta-row { margin: 3px 0; }
  .total-row { margin: 3px 0; }
  .total-row.final {
    font-size: 15px;
    font-weight: 800;
    border-top: 2px solid #111827;
    border-bottom: 2px solid #111827;
    padding: 5px 0;
    margin: 7px 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 6px 0;
  }
  th, td {
    border: 1px solid #9ca3af;
    padding: 3px 4px;
    font-size: 11px;
    text-align: right;
  }
  th {
    background: #f3f4f6;
    font-weight: 700;
    font-size: 10px;
  }
  .footer { text-align: center; margin-top: 10px; font-size: 10px; color: #6b7280; }
  @media print {
    @page { size: 80mm auto; margin: 0; }
    body { width: 80mm; padding: 3mm; }
    .no-print { display: none !important; }
  }
`;

/**
 * Render company header for receipt 80mm
 */
export const renderReceipt80Header = (company) => {
  const companyName = escapeHtml(company?.name || 'ERP SYSTEM');
  const contactNumbers = escapeHtml(company?.contactNumbers || '');
  const address = escapeHtml(company?.address || '');
  return `
    <div class="header">
      <div class="name">${companyName}</div>
      ${contactNumbers ? `<div class="line">هاتف: ${contactNumbers}</div>` : ''}
      ${address ? `<div class="line">العنوان: ${address}</div>` : ''}
    </div>
  `;
};

/**
 * Render company header for A4/A5
 */
export const renderA4Header = (company) => {
  const companyName = escapeHtml(company?.name || 'ERP SYSTEM');
  const contactNumbers = escapeHtml(company?.contactNumbers || '');
  const address = escapeHtml(company?.address || '');
  return `
    <div class="header">
      <div class="name">${companyName}</div>
      ${contactNumbers ? `<div class="line">هاتف: ${contactNumbers}</div>` : ''}
      ${address ? `<div class="line">العنوان: ${address}</div>` : ''}
    </div>
  `;
};

/**
 * Render footer with print timestamp
 */
export const renderFooter = (printedAt) => `
  <div class="footer">
    <div>شكراً لتعاملكم معنا</div>
    <div>تم الطباعة: ${escapeHtml(printedAt)}</div>
  </div>
`;
