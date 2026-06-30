import {
  getAppSettings,
  getCompanyPrintSettings,
  normalizeInvoicePrintLayout,
  normalizeReceipt80Template,
  normalizeA4Template,
  normalizeA5Template
} from '../../src/utils/appSettings';
import { renderA4Classic } from '../templates/purchaseInvoice/a4/classic';
import { renderA4Modern } from '../templates/purchaseInvoice/a4/modern';
import { generatePurchaseInvoiceA5 as renderA5Classic } from '../templates/purchaseInvoice/a5';
import { generatePurchaseInvoiceReceipt80 as render80Classic } from '../templates/purchaseInvoice/receipt80';

export const PURCHASE_INVOICE_PRINT_LAYOUTS = Object.freeze({
  RECEIPT_80: 'receipt80',
  A4: 'a4',
  A5: 'a5'
});

export const resolvePurchaseInvoicePrintLayout = (layout) => {
  const settings = getAppSettings();
  return normalizeInvoicePrintLayout(layout || settings.defaultPurchaseInvoicePrintLayout);
};

export const generatePurchaseInvoiceHTML = (purchase, options = {}) => {
  const company = options.company || getCompanyPrintSettings();
  const layout = resolvePurchaseInvoicePrintLayout(options.layout);

  if (layout === 'a4') {
    const templateId = normalizeA4Template(options.a4Template || getAppSettings().defaultA4Template);
    switch (templateId) {
      case 'modern':
        return renderA4Modern({ purchase, company });
      case 'professional':
        // Fallback to modern until purchase professional is ready
        return renderA4Modern({ purchase, company });
      case 'classic':
      default:
        return renderA4Classic({ purchase, company });
    }
  }

  if (layout === 'a5') {
    const templateId = normalizeA5Template(options.template || getAppSettings().defaultA5Template);
    return renderA5Classic({ purchase, company });
  }

  const templateId = normalizeReceipt80Template(options.template || getAppSettings().defaultReceipt80Template);
  // Default to classic for purchase for now
  return render80Classic({ purchase, company });
};
