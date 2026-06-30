import {
  getAppSettings,
  getCompanyPrintSettings,
  normalizeInvoicePrintLayout,
  normalizeReceipt80Template,
  normalizeA4Template,
  normalizeA5Template
} from '../../src/utils/appSettings';
import { renderA4Classic } from '../templates/saleInvoice/a4/classic';
import { renderA4Modern } from '../templates/saleInvoice/a4/modern';
import { renderA4Professional } from '../templates/saleInvoice/a4/professional';
import { renderA5Classic } from '../templates/saleInvoice/a5/classic';
import { renderA5Modern } from '../templates/saleInvoice/a5/modern';
import { renderProfessional as render80Professional } from '../templates/saleInvoice/receipt80/professional';
import { renderModern as render80Modern } from '../templates/saleInvoice/receipt80/modern';
import { renderClassic as render80Classic } from '../templates/saleInvoice/receipt80/classic';
import { toNumber, getSaleDate, calculateSaleFinancials } from '../shared/helpers';

export const SALE_INVOICE_PRINT_LAYOUTS = Object.freeze({
  RECEIPT_80: 'receipt80',
  A4: 'a4',
  A5: 'a5'
});

export const resolveSaleInvoicePrintLayout = (layout) => {
  const settings = getAppSettings();
  return normalizeInvoicePrintLayout(layout || settings.defaultInvoicePrintLayout);
};

export const generateInvoiceHTML = (sale, customer, options = {}) => {
  const company = options.company || getCompanyPrintSettings();
  const layout = resolveSaleInvoicePrintLayout(options.layout);

  if (layout === 'a4') {
    const templateId = normalizeA4Template(options.a4Template || getAppSettings().defaultA4Template);
    switch (templateId) {
      case 'modern':
        return renderA4Modern({ sale, customer, company });
      case 'professional':
        return renderA4Professional({ sale, customer, company });
      case 'classic':
      default:
        return renderA4Classic({ sale, customer, company });
    }
  }

  if (layout === 'a5') {
    const templateId = normalizeA5Template(options.a5Template || getAppSettings().defaultA5Template);
    switch (templateId) {
      case 'modern':
        return renderA5Modern({ sale, customer, company });
      case 'professional':
        // Fallback to modern until professional is ready
        return renderA5Modern({ sale, customer, company });
      case 'classic':
      default:
        return renderA5Classic({ sale, customer, company });
    }
  }

  // Receipt 80mm — use template selector
  const safeSale = sale || {};
  const safeCustomer = customer || safeSale?.customer || null;
  const { items, subTotal, itemsDiscount, invoiceDiscount, finalTotal, paidAmount, remaining } = calculateSaleFinancials(safeSale);

  const currentBalance = toNumber(safeCustomer?.balance, 0);
  const balanceDelta = remaining;
  const previousBalance = currentBalance - balanceDelta;

  const saleType = safeSale?.saleType || (remaining > 0 ? 'آجل' : 'نقدي');
  const saleId = safeSale?.id || '-';
  const customerName = safeCustomer?.name || 'عميل نقدي';
  const customerPhone = safeCustomer?.phone || '';
  const saleDate = new Date(getSaleDate(safeSale));
  const dateLine = saleDate.toLocaleString('ar-EG');
  const printedAt = new Date().toLocaleString('ar-EG');

  const templateId = normalizeReceipt80Template(
    options.receipt80Template || getAppSettings().defaultReceipt80Template
  );

  const props = {
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
  };

  switch (templateId) {
    case 'modern':
      return render80Modern(props);
    case 'classic':
      return render80Classic(props);
    case 'professional':
    default:
      return render80Professional(props);
  }
};

// Re-export for backward compatibility
export { renderA4Classic as generateInvoiceA4HTML };
