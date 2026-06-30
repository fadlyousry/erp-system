import {
  getAppSettings,
  getCompanyPrintSettings,
  normalizeInvoicePrintLayout,
  normalizePaymentVoucher80Template,
  normalizePaymentVoucherA4Template,
  normalizePaymentVoucherA5Template
} from '../../src/utils/appSettings';
import { generatePaymentReceiptA4 as renderA4Classic } from '../templates/paymentReceipt/a4';
import { generatePaymentReceiptA5 as renderA5Classic } from '../templates/paymentReceipt/a5';
import { renderClassic as render80Classic } from '../templates/paymentReceipt/receipt80/classic';
import { renderModern as render80Modern } from '../templates/paymentReceipt/receipt80/modern';
import { renderProfessional as render80Professional } from '../templates/paymentReceipt/receipt80/professional';

export const PAYMENT_RECEIPT_PRINT_LAYOUTS = Object.freeze({
  RECEIPT_80: 'receipt80',
  A4: 'a4',
  A5: 'a5'
});

export const resolvePaymentReceiptPrintLayout = (layout) => {
  const settings = getAppSettings();
  return normalizeInvoicePrintLayout(layout || settings.defaultPaymentReceiptPrintLayout);
};

export const generateReceiptHTML = (payment, customer, options = {}) => {
  const company = options.company || getCompanyPrintSettings();
  const layout = resolvePaymentReceiptPrintLayout(options.layout);

  if (layout === 'a4') {
    const templateId = normalizePaymentVoucherA4Template(options.template || getAppSettings().defaultPaymentVoucherA4Template);
    return renderA4Classic({ payment, customer, company });
  }

  if (layout === 'a5') {
    const templateId = normalizePaymentVoucherA5Template(options.template || getAppSettings().defaultPaymentVoucherA5Template);
    return renderA5Classic({ payment, customer, company });
  }

  const templateId = normalizePaymentVoucher80Template(options.template || getAppSettings().defaultPaymentVoucher80Template);
  
  if (templateId === 'modern') {
    return render80Modern({ payment, customer, company });
  }

  if (templateId === 'professional') {
    return render80Professional({ payment, customer, company });
  }

  // Default to classic for now
  return render80Classic({ payment, customer, company });
};
