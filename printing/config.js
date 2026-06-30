/**
 * Printing System Configuration
 * إعدادات نظام الطباعة
 */

const PAPER_SIZES = {
  A4: {
    id: 'a4',
    name: 'A4',
    width: 210,
    height: 297,
    unit: 'mm'
  },
  THERMAL_80MM: {
    id: 'thermal80mm',
    name: 'Thermal 80mm',
    width: 80,
    height: 'auto',
    unit: 'mm'
  },
  A5: {
    id: 'a5',
    name: 'A5',
    width: 148,
    height: 210,
    unit: 'mm'
  }
};

const INVOICE_TYPES = {
  SALE_INVOICE: 'saleInvoice',
  PURCHASE_INVOICE: 'purchaseInvoice',
  SALE_RETURN: 'saleReturn',
  PURCHASE_RETURN: 'purchaseReturn',
  PAYMENT_RECEIPT: 'paymentReceipt'
};

const PRINT_ERRORS = {
  PRINTER_NOT_FOUND: 'الطابعة غير موجودة / Printer not found',
  TEMPLATE_NOT_FOUND: 'القالب غير موجود / Template not found',
  INVALID_DATA: 'بيانات غير صالحة / Invalid data',
  PRINT_FAILED: 'فشلت عملية الطباعة / Print failed',
  PERMISSION_DENIED: 'لا توجد صلاحيات للطباعة / Permission denied',
  NO_HTML_CONTENT: 'لا يوجد محتوى HTML / No HTML content'
};

const DEFAULT_PRINT_OPTIONS = {
  silent: true,
  preview: false,
  copies: 1,
  timeOutPerLine: 400
};

const IPC_CHANNELS = {
  PRINT_INVOICE: 'print-invoice',
  GET_PRINTERS: 'get-printers',
  PREVIEW_INVOICE: 'preview-invoice',
  PRINT_RESULT: 'print-result',
  PRINTERS_LIST: 'printers-list',
  PREVIEW_READY: 'preview-ready'
};

module.exports = {
  PAPER_SIZES,
  INVOICE_TYPES,
  PRINT_ERRORS,
  DEFAULT_PRINT_OPTIONS,
  IPC_CHANNELS
};
