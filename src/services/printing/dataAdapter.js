/**
 * Data Adapter - تحويل بيانات الفاتورة إلى صيغة القالب
 * Transform invoice data to template format
 */

/**
 * Format money value
 * @param {number} value - Money value
 * @returns {string} - Formatted money
 */
function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

/**
 * Format date in Arabic
 * @param {Date|string} date - Date to format
 * @param {string} format - Format string
 * @returns {string} - Formatted date
 */
function formatDate(date, format = 'YYYY-MM-DD') {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes);
}

/**
 * Build item label with variant info
 * @param {Object} item - Sale item
 * @returns {string} - Item label
 */
function buildItemLabel(item) {
  let label = item.product?.name || item.name || '';
  
  if (item.variant) {
    const variantParts = [];
    if (item.variant.color) variantParts.push(item.variant.color);
    if (item.variant.size) variantParts.push(item.variant.size);
    if (variantParts.length > 0) {
      label += ` (${variantParts.join(' - ')})`;
    }
  }
  
  return label;
}

/**
 * Calculate subtotal
 * @param {Object} sale - Sale object
 * @returns {number} - Subtotal
 */
function calculateSubtotal(sale) {
  if (!sale.items || !Array.isArray(sale.items)) return 0;
  return sale.items.reduce((sum, item) => {
    return sum + (item.price * item.quantity);
  }, 0);
}

/**
 * Calculate items discount
 * @param {Object} sale - Sale object
 * @returns {number} - Items discount
 */
function calculateItemsDiscount(sale) {
  if (!sale.items || !Array.isArray(sale.items)) return 0;
  return sale.items.reduce((sum, item) => {
    return sum + ((item.discount || 0) * item.quantity);
  }, 0);
}

/**
 * Calculate final total
 * @param {Object} sale - Sale object
 * @returns {number} - Final total
 */
function calculateFinalTotal(sale) {
  const subtotal = calculateSubtotal(sale);
  const itemsDiscount = calculateItemsDiscount(sale);
  const invoiceDiscount = sale.discount || 0;
  return subtotal - itemsDiscount - invoiceDiscount;
}

/**
 * Calculate paid amount
 * @param {Object} sale - Sale object
 * @returns {number} - Paid amount
 */
function calculatePaid(sale) {
  return sale.paid || 0;
}

/**
 * Calculate remaining amount
 * @param {Object} sale - Sale object
 * @returns {number} - Remaining amount
 */
function calculateRemaining(sale) {
  const finalTotal = calculateFinalTotal(sale);
  const paid = calculatePaid(sale);
  return finalTotal - paid;
}

/**
 * Get sale type label
 * @param {Object} sale - Sale object
 * @returns {string} - Sale type label
 */
function getSaleType(sale) {
  if (sale.saleType === 'cash') return 'نقدي / Cash';
  if (sale.saleType === 'credit') return 'آجل / Credit';
  return sale.saleType || 'نقدي / Cash';
}

/**
 * Calculate previous balance
 * @param {Object} sale - Sale object
 * @returns {number} - Previous balance
 */
function calculatePreviousBalance(sale) {
  if (!sale.customer) return 0;
  const currentBalance = sale.customer.balance || 0;
  const saleAmount = calculateFinalTotal(sale);
  const paid = calculatePaid(sale);
  return currentBalance - (saleAmount - paid);
}

/**
 * Transform sale data to template-compatible format
 * @param {Object} sale - Sale object from database
 * @param {Object} company - Company settings
 * @returns {Object} - Template data
 */
export function transformSaleToTemplateData(sale, company = {}) {
  return {
    invoice: {
      id: sale.id || '',
      date: formatDate(sale.date || new Date()),
      saleType: getSaleType(sale),
      printedAt: formatDate(new Date(), 'YYYY-MM-DD HH:mm')
    },
    customer: {
      name: sale.customer?.name || 'عميل نقدي / Cash Customer',
      phone: sale.customer?.phone || '',
      previousBalance: formatMoney(calculatePreviousBalance(sale)),
      currentBalance: formatMoney(sale.customer?.balance || 0)
    },
    company: {
      name: company.name || 'اسم الشركة / Company Name',
      logoUrl: company.logoUrl || '',
      qrUrl: company.qrUrl || '',
      facebookQrUrl: company.facebookQrUrl || '',
      instagramQrUrl: company.instagramQrUrl || ''
    },
    items: (sale.items || []).map(item => ({
      name: buildItemLabel(item),
      quantity: item.quantity || 0,
      price: formatMoney(item.price || 0),
      discount: formatMoney(item.discount || 0),
      total: formatMoney((item.price - (item.discount || 0)) * item.quantity)
    })),
    totals: {
      subtotal: formatMoney(calculateSubtotal(sale)),
      itemsDiscount: formatMoney(calculateItemsDiscount(sale)),
      invoiceDiscount: formatMoney(sale.discount || 0),
      finalTotal: formatMoney(calculateFinalTotal(sale)),
      paid: formatMoney(calculatePaid(sale)),
      remaining: formatMoney(calculateRemaining(sale))
    }
  };
}

/**
 * Transform purchase data to template-compatible format
 * @param {Object} purchase - Purchase object from database
 * @param {Object} company - Company settings
 * @returns {Object} - Template data
 */
export function transformPurchaseToTemplateData(purchase, company = {}) {
  // Similar structure to sale, adapted for purchase
  return {
    invoice: {
      id: purchase.id || '',
      date: formatDate(purchase.date || new Date()),
      printedAt: formatDate(new Date(), 'YYYY-MM-DD HH:mm')
    },
    supplier: {
      name: purchase.supplier?.name || 'مورد / Supplier',
      phone: purchase.supplier?.phone || ''
    },
    company: {
      name: company.name || 'اسم الشركة / Company Name',
      logoUrl: company.logoUrl || ''
    },
    items: (purchase.items || []).map(item => ({
      name: buildItemLabel(item),
      quantity: item.quantity || 0,
      price: formatMoney(item.price || 0),
      total: formatMoney(item.price * item.quantity)
    })),
    totals: {
      subtotal: formatMoney(calculateSubtotal(purchase)),
      finalTotal: formatMoney(calculateFinalTotal(purchase))
    }
  };
}
