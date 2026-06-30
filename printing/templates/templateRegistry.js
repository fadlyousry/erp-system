/**
 * Template Registry - سجل القوالب المتاحة
 * Registry of available templates
 */

// Sale Invoice Templates
const saleInvoiceTemplates = {
  // A4 Templates
  'classic-a4': {
    id: 'classic-a4',
    name: 'Classic A4',
    nameAr: 'كلاسيكي A4',
    paperSize: 'a4',
    width: 210,
    height: 297,
    type: 'saleInvoice',
    path: './saleInvoice/a4/classic.js'
  },
  'modern-a4': {
    id: 'modern-a4',
    name: 'Modern A4',
    nameAr: 'عصري A4',
    paperSize: 'a4',
    width: 210,
    height: 297,
    type: 'saleInvoice',
    path: './saleInvoice/a4/modern.js'
  },
  'professional-a4': {
    id: 'professional-a4',
    name: 'Professional A4',
    nameAr: 'احترافي A4',
    paperSize: 'a4',
    width: 210,
    height: 297,
    type: 'saleInvoice',
    path: './saleInvoice/a4/professional.js'
  },

  // 80mm Thermal Templates
  'classic-80mm': {
    id: 'classic-80mm',
    name: 'Classic 80mm',
    nameAr: 'كلاسيكي 80mm',
    paperSize: 'thermal80mm',
    width: 80,
    height: 'auto',
    type: 'saleInvoice',
    path: './saleInvoice/receipt80/classic.js'
  },
  'modern-80mm': {
    id: 'modern-80mm',
    name: 'Modern 80mm',
    nameAr: 'عصري 80mm',
    paperSize: 'thermal80mm',
    width: 80,
    height: 'auto',
    type: 'saleInvoice',
    path: './saleInvoice/receipt80/modern.js'
  },
  'professional-80mm': {
    id: 'professional-80mm',
    name: 'Professional 80mm',
    nameAr: 'احترافي 80mm',
    paperSize: 'thermal80mm',
    width: 80,
    height: 'auto',
    type: 'saleInvoice',
    path: './saleInvoice/receipt80/professional.js'
  }
};

// Purchase Invoice Templates
const purchaseInvoiceTemplates = {
  'classic-a4': {
    id: 'classic-a4',
    name: 'Classic A4',
    nameAr: 'كلاسيكي A4',
    paperSize: 'a4',
    width: 210,
    height: 297,
    type: 'purchaseInvoice',
    path: './purchaseInvoice/a4/classic.js'
  }
};

// Sale Return Templates
const saleReturnTemplates = {
  'classic-80mm': {
    id: 'classic-80mm',
    name: 'Classic 80mm',
    nameAr: 'كلاسيكي 80mm',
    paperSize: 'thermal80mm',
    width: 80,
    height: 'auto',
    type: 'saleReturn',
    path: './saleReturn/receipt80/classic.js'
  }
};

// Purchase Return Templates
const purchaseReturnTemplates = {
  'classic-80mm': {
    id: 'classic-80mm',
    name: 'Classic 80mm',
    nameAr: 'كلاسيكي 80mm',
    paperSize: 'thermal80mm',
    width: 80,
    height: 'auto',
    type: 'purchaseReturn',
    path: './purchaseReturn/receipt80/classic.js'
  }
};

// Payment Receipt Templates
const paymentReceiptTemplates = {
  'classic-80mm': {
    id: 'classic-80mm',
    name: 'Classic 80mm',
    nameAr: 'كلاسيكي 80mm',
    paperSize: 'thermal80mm',
    width: 80,
    height: 'auto',
    type: 'paymentReceipt',
    path: './paymentReceipt/receipt80/classic.js'
  },
  'modern-80mm': {
    id: 'modern-80mm',
    name: 'Modern 80mm',
    nameAr: 'عصري 80mm',
    paperSize: 'thermal80mm',
    width: 80,
    height: 'auto',
    type: 'paymentReceipt',
    path: './paymentReceipt/receipt80/modern.js'
  },
  'professional-80mm': {
    id: 'professional-80mm',
    name: 'Professional 80mm',
    nameAr: 'احترافي 80mm',
    paperSize: 'thermal80mm',
    width: 80,
    height: 'auto',
    type: 'paymentReceipt',
    path: './paymentReceipt/receipt80/professional.js'
  }
};

/**
 * Get all templates
 * @returns {Object} - All templates grouped by type
 */
function getAllTemplates() {
  return {
    saleInvoice: saleInvoiceTemplates,
    purchaseInvoice: purchaseInvoiceTemplates,
    saleReturn: saleReturnTemplates,
    purchaseReturn: purchaseReturnTemplates,
    paymentReceipt: paymentReceiptTemplates
  };
}

/**
 * Get templates by type
 * @param {string} type - Template type
 * @returns {Object} - Templates of specified type
 */
function getTemplatesByType(type) {
  const allTemplates = getAllTemplates();
  return allTemplates[type] || {};
}

/**
 * Get template by ID and type
 * @param {string} type - Template type
 * @param {string} id - Template ID
 * @returns {Object|null} - Template metadata or null
 */
function getTemplate(type, id) {
  const templates = getTemplatesByType(type);
  return templates[id] || null;
}

/**
 * Get templates by paper size
 * @param {string} type - Template type
 * @param {string} paperSize - Paper size ('a4' or 'thermal80mm')
 * @returns {Array} - Array of templates
 */
function getTemplatesByPaperSize(type, paperSize) {
  const templates = getTemplatesByType(type);
  return Object.values(templates).filter(t => t.paperSize === paperSize);
}

module.exports = {
  getAllTemplates,
  getTemplatesByType,
  getTemplate,
  getTemplatesByPaperSize,
  saleInvoiceTemplates,
  purchaseInvoiceTemplates,
  saleReturnTemplates,
  purchaseReturnTemplates,
  paymentReceiptTemplates
};
