import {
  getAppSettings,
  getCompanyPrintSettings,
  normalizeInvoicePrintLayout,
  normalizeReceipt80Template,
  normalizeA4Template,
  normalizeA5Template
} from '../../src/utils/appSettings';
import { generateSaleReturnA4 as renderA4Classic } from '../templates/saleReturn/a4';
import { generateSaleReturnA5 as renderA5Classic } from '../templates/saleReturn/a5';
import { generateSaleReturnReceipt80 as render80Classic } from '../templates/saleReturn/receipt80';

export const SALE_RETURN_PRINT_LAYOUTS = Object.freeze({
  RECEIPT_80: 'receipt80',
  A4: 'a4',
  A5: 'a5'
});

export const resolveSaleReturnPrintLayout = (layout) => {
  const settings = getAppSettings();
  return normalizeInvoicePrintLayout(layout || settings.defaultSaleReturnPrintLayout || settings.defaultInvoicePrintLayout);
};

export const generateReturnInvoiceHTML = (returnInvoice, customer, options = {}) => {
  const company = options.company || getCompanyPrintSettings();
  const layout = resolveSaleReturnPrintLayout(options.layout);

  if (layout === 'a4') {
    const templateId = normalizeA4Template(options.template || getAppSettings().defaultA4Template);
    return renderA4Classic({ returnInvoice, customer, company });
  }

  if (layout === 'a5') {
    const templateId = normalizeA5Template(options.template || getAppSettings().defaultA5Template);
    return renderA5Classic({ returnInvoice, customer, company });
  }

  const templateId = normalizeReceipt80Template(options.template || getAppSettings().defaultReceipt80Template);
  return render80Classic({ returnInvoice, customer, company });
};
