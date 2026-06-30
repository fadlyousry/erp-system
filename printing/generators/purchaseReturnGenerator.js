import {
  getAppSettings,
  getCompanyPrintSettings,
  normalizeInvoicePrintLayout,
  normalizeReceipt80Template,
  normalizeA4Template,
  normalizeA5Template
} from '../../src/utils/appSettings';
import { generatePurchaseReturnA4 as renderA4Classic } from '../templates/purchaseReturn/a4';
import { generatePurchaseReturnA5 as renderA5Classic } from '../templates/purchaseReturn/a5';
import { generatePurchaseReturnReceipt80 as render80Classic } from '../templates/purchaseReturn/receipt80';

export const PURCHASE_RETURN_PRINT_LAYOUTS = Object.freeze({
  RECEIPT_80: 'receipt80',
  A4: 'a4',
  A5: 'a5'
});

export const resolvePurchaseReturnPrintLayout = (layout) => {
  const settings = getAppSettings();
  return normalizeInvoicePrintLayout(layout || settings.defaultPurchaseReturnPrintLayout || settings.defaultInvoicePrintLayout);
};

export const generatePurchaseReturnInvoiceHTML = (purchaseReturn, supplier, options = {}) => {
  const company = options.company || getCompanyPrintSettings();
  const layout = resolvePurchaseReturnPrintLayout(options.layout);

  if (layout === 'a4') {
    const templateId = normalizeA4Template(options.template || getAppSettings().defaultA4Template);
    return renderA4Classic({ purchaseReturn, supplier, company });
  }

  if (layout === 'a5') {
    const templateId = normalizeA5Template(options.template || getAppSettings().defaultA5Template);
    return renderA5Classic({ purchaseReturn, supplier, company });
  }

  const templateId = normalizeReceipt80Template(options.template || getAppSettings().defaultReceipt80Template);
  return render80Classic({ purchaseReturn, supplier, company });
};
