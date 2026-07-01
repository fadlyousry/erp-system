import {
  BARCODE_STUDIO_TAB_IDS,
  DEFAULT_BARCODE_STUDIO,
  sanitizeBarcodeStudioSettings
} from './barcodeDefaults';

export const APP_SETTINGS_STORAGE_KEY = 'erp.appSettings.v1';

const BARCODE_STUDIO_TAB_ID_SET = new Set(BARCODE_STUDIO_TAB_IDS);

const DEFAULT_APP_SETTINGS = {
  defaultSaleType: 'نقدي',
  defaultWarehouseId: null,
  defaultSearchMode: 'name',
  defaultProductDisplayMode: 'list',
  defaultPurchaseSaleType: 'نقدي',
  defaultPurchaseWarehouseId: null,
  defaultPurchaseSearchMode: 'name',
  defaultPurchaseProductDisplayMode: 'list',
  defaultSalesReturnSearchMode: 'name',
  defaultSalesReturnRightTab: 'search',
  defaultPurchaseReturnSearchMode: 'name',
  defaultPurchaseReturnRightTab: 'search',
  allowExcessPayments: false,
  defaultInvoicePrintLayout: 'receipt80',
  defaultPurchaseInvoicePrintLayout: 'receipt80',
  defaultPaymentReceiptPrintLayout: 'receipt80',
  defaultSaleReturnPrintLayout: 'receipt80',
  defaultPurchaseReturnPrintLayout: 'receipt80',
  defaultPrinterName: '',
  defaultBarcodePrinterName: '',
  defaultBarcodePrintMode: 'preview',
  defaultBarcodeStudioStartTab: 'templates',
  defaultBarcodeStudioSettings: { ...DEFAULT_BARCODE_STUDIO },
  defaultReceipt80Template: 'professional',
  defaultA4Template: 'classic',
  defaultA5Template: 'classic',
  defaultPaymentVoucher80Template: 'classic',
  defaultPaymentVoucherA4Template: 'classic',
  defaultPaymentVoucherA5Template: 'classic',
  companyName: '',
  companyContactNumbers: '',
  companyAddress: '',
  allowNegativeInventory: false
};

export const normalizeSaleType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    normalized === 'آجل' ||
    normalized === 'اجل' ||
    normalized === 'credit' ||
    normalized === 'deferred'
  ) {
    return 'آجل';
  }
  return 'نقدي';
};

export const normalizeWarehouseId = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const normalizeSearchMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'barcode' ? 'barcode' : 'name';
};

export const normalizeProductDisplayMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'grid' ? 'grid' : 'list';
};

export const normalizeReturnRightTab = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'invoices' ? 'invoices' : 'search';
};

export const normalizeInvoicePrintLayout = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'a4') return 'a4';
  if (normalized === 'a5') return 'a5';
  return 'receipt80';
};

export const normalizeDefaultPrinterName = (value) => String(value ?? '')
  .trim()
  .slice(0, 255);

export const normalizeReceipt80Template = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const validTemplates = ['professional', 'modern', 'classic'];
  return validTemplates.includes(normalized) ? normalized : 'professional';
};

export const normalizeA4Template = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const validTemplates = ['professional', 'modern', 'classic'];
  return validTemplates.includes(normalized) ? normalized : 'classic';
};

export const normalizeA5Template = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const validTemplates = ['professional', 'modern', 'classic'];
  return validTemplates.includes(normalized) ? normalized : 'classic';
};

export const normalizePaymentVoucher80Template = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const validTemplates = ['classic', 'modern', 'professional'];
  return validTemplates.includes(normalized) ? normalized : 'classic';
};

export const normalizePaymentVoucherA4Template = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const validTemplates = ['classic'];
  return validTemplates.includes(normalized) ? normalized : 'classic';
};

export const normalizePaymentVoucherA5Template = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const validTemplates = ['classic'];
  return validTemplates.includes(normalized) ? normalized : 'classic';
};

export const normalizeBarcodePrintMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'silent' ? 'silent' : 'preview';
};

export const normalizeBarcodeStudioStartTab = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return BARCODE_STUDIO_TAB_ID_SET.has(normalized) ? normalized : 'templates';
};

export const normalizeBarcodeStudioDefaults = (value) =>
  sanitizeBarcodeStudioSettings(value);

export const normalizeCompanyName = (value) => String(value ?? '')
  .trim()
  .slice(0, 120);

export const normalizeCompanyContactNumbers = (value) => String(value ?? '')
  .trim()
  .slice(0, 500);

export const normalizeCompanyAddress = (value) => String(value ?? '')
  .trim()
  .slice(0, 250);

export const getAppSettings = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_APP_SETTINGS };
  }

  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_APP_SETTINGS };

    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_APP_SETTINGS,
      ...parsed,
      defaultSaleType: normalizeSaleType(parsed?.defaultSaleType),
      defaultWarehouseId: normalizeWarehouseId(parsed?.defaultWarehouseId),
      defaultSearchMode: normalizeSearchMode(parsed?.defaultSearchMode),
      defaultProductDisplayMode: normalizeProductDisplayMode(parsed?.defaultProductDisplayMode),
      defaultPurchaseSaleType: normalizeSaleType(parsed?.defaultPurchaseSaleType),
      defaultPurchaseWarehouseId: normalizeWarehouseId(parsed?.defaultPurchaseWarehouseId),
      defaultPurchaseSearchMode: normalizeSearchMode(parsed?.defaultPurchaseSearchMode),
      defaultPurchaseProductDisplayMode: normalizeProductDisplayMode(
        parsed?.defaultPurchaseProductDisplayMode
      ),
      defaultSalesReturnSearchMode: normalizeSearchMode(parsed?.defaultSalesReturnSearchMode),
      defaultSalesReturnRightTab: normalizeReturnRightTab(parsed?.defaultSalesReturnRightTab),
      defaultPurchaseReturnSearchMode: normalizeSearchMode(parsed?.defaultPurchaseReturnSearchMode),
      defaultPurchaseReturnRightTab: normalizeReturnRightTab(parsed?.defaultPurchaseReturnRightTab),
      defaultInvoicePrintLayout: normalizeInvoicePrintLayout(parsed?.defaultInvoicePrintLayout),
      defaultPurchaseInvoicePrintLayout: normalizeInvoicePrintLayout(
        parsed?.defaultPurchaseInvoicePrintLayout
      ),
      defaultPaymentReceiptPrintLayout: normalizeInvoicePrintLayout(
        parsed?.defaultPaymentReceiptPrintLayout
      ),
      defaultSaleReturnPrintLayout: normalizeInvoicePrintLayout(
        parsed?.defaultSaleReturnPrintLayout
      ),
      defaultPurchaseReturnPrintLayout: normalizeInvoicePrintLayout(
        parsed?.defaultPurchaseReturnPrintLayout
      ),
      defaultPrinterName: normalizeDefaultPrinterName(parsed?.defaultPrinterName),
      defaultBarcodePrinterName: normalizeDefaultPrinterName(parsed?.defaultBarcodePrinterName),
      defaultBarcodePrintMode: normalizeBarcodePrintMode(parsed?.defaultBarcodePrintMode),
      defaultBarcodeStudioStartTab: normalizeBarcodeStudioStartTab(parsed?.defaultBarcodeStudioStartTab),
      defaultBarcodeStudioSettings: normalizeBarcodeStudioDefaults(parsed?.defaultBarcodeStudioSettings),
      defaultReceipt80Template: normalizeReceipt80Template(parsed?.defaultReceipt80Template),
      defaultA4Template: normalizeA4Template(parsed?.defaultA4Template),
      defaultA5Template: normalizeA5Template(parsed?.defaultA5Template),
      defaultPaymentVoucher80Template: normalizePaymentVoucher80Template(parsed?.defaultPaymentVoucher80Template),
      defaultPaymentVoucherA4Template: normalizePaymentVoucherA4Template(parsed?.defaultPaymentVoucherA4Template),
      defaultPaymentVoucherA5Template: normalizePaymentVoucherA5Template(parsed?.defaultPaymentVoucherA5Template),
      companyName: normalizeCompanyName(parsed?.companyName),
      companyContactNumbers: normalizeCompanyContactNumbers(parsed?.companyContactNumbers),
      companyAddress: normalizeCompanyAddress(parsed?.companyAddress),
      allowNegativeInventory: parsed?.allowNegativeInventory === true
    };
  } catch (error) {
    return { ...DEFAULT_APP_SETTINGS };
  }
};

export const saveAppSettings = (partialSettings = {}) => {
  const current = getAppSettings();
  const merged = {
    ...current,
    ...partialSettings,
    defaultSaleType: normalizeSaleType(partialSettings?.defaultSaleType ?? current.defaultSaleType),
    defaultWarehouseId: normalizeWarehouseId(partialSettings?.defaultWarehouseId ?? current.defaultWarehouseId),
    defaultSearchMode: normalizeSearchMode(partialSettings?.defaultSearchMode ?? current.defaultSearchMode),
    defaultProductDisplayMode: normalizeProductDisplayMode(
      partialSettings?.defaultProductDisplayMode ?? current.defaultProductDisplayMode
    ),
    defaultPurchaseSaleType: normalizeSaleType(
      partialSettings?.defaultPurchaseSaleType ?? current.defaultPurchaseSaleType
    ),
    defaultPurchaseWarehouseId: normalizeWarehouseId(
      partialSettings?.defaultPurchaseWarehouseId ?? current.defaultPurchaseWarehouseId
    ),
    defaultPurchaseSearchMode: normalizeSearchMode(
      partialSettings?.defaultPurchaseSearchMode ?? current.defaultPurchaseSearchMode
    ),
    defaultPurchaseProductDisplayMode: normalizeProductDisplayMode(
      partialSettings?.defaultPurchaseProductDisplayMode ?? current.defaultPurchaseProductDisplayMode
    ),
    defaultSalesReturnSearchMode: normalizeSearchMode(
      partialSettings?.defaultSalesReturnSearchMode ?? current.defaultSalesReturnSearchMode
    ),
    defaultSalesReturnRightTab: normalizeReturnRightTab(
      partialSettings?.defaultSalesReturnRightTab ?? current.defaultSalesReturnRightTab
    ),
    defaultPurchaseReturnSearchMode: normalizeSearchMode(
      partialSettings?.defaultPurchaseReturnSearchMode ?? current.defaultPurchaseReturnSearchMode
    ),
    defaultPurchaseReturnRightTab: normalizeReturnRightTab(
      partialSettings?.defaultPurchaseReturnRightTab ?? current.defaultPurchaseReturnRightTab
    ),
    defaultInvoicePrintLayout: normalizeInvoicePrintLayout(
      partialSettings?.defaultInvoicePrintLayout ?? current.defaultInvoicePrintLayout
    ),
    defaultPurchaseInvoicePrintLayout: normalizeInvoicePrintLayout(
      partialSettings?.defaultPurchaseInvoicePrintLayout ?? current.defaultPurchaseInvoicePrintLayout
    ),
    defaultPaymentReceiptPrintLayout: normalizeInvoicePrintLayout(
      partialSettings?.defaultPaymentReceiptPrintLayout ?? current.defaultPaymentReceiptPrintLayout
    ),
    defaultSaleReturnPrintLayout: normalizeInvoicePrintLayout(
      partialSettings?.defaultSaleReturnPrintLayout ?? current.defaultSaleReturnPrintLayout
    ),
    defaultPurchaseReturnPrintLayout: normalizeInvoicePrintLayout(
      partialSettings?.defaultPurchaseReturnPrintLayout ?? current.defaultPurchaseReturnPrintLayout
    ),
    defaultPrinterName: normalizeDefaultPrinterName(
      partialSettings?.defaultPrinterName ?? current.defaultPrinterName
    ),
    defaultBarcodePrinterName: normalizeDefaultPrinterName(
      partialSettings?.defaultBarcodePrinterName ?? current.defaultBarcodePrinterName
    ),
    defaultBarcodePrintMode: normalizeBarcodePrintMode(
      partialSettings?.defaultBarcodePrintMode ?? current.defaultBarcodePrintMode
    ),
    defaultBarcodeStudioStartTab: normalizeBarcodeStudioStartTab(
      partialSettings?.defaultBarcodeStudioStartTab ?? current.defaultBarcodeStudioStartTab
    ),
    defaultBarcodeStudioSettings: normalizeBarcodeStudioDefaults(
      partialSettings?.defaultBarcodeStudioSettings ?? current.defaultBarcodeStudioSettings
    ),
    defaultReceipt80Template: normalizeReceipt80Template(
      partialSettings?.defaultReceipt80Template ?? current.defaultReceipt80Template
    ),
    defaultA4Template: normalizeA4Template(
      partialSettings?.defaultA4Template ?? current.defaultA4Template
    ),
    defaultA5Template: normalizeA5Template(
      partialSettings?.defaultA5Template ?? current.defaultA5Template
    ),
    defaultPaymentVoucher80Template: normalizePaymentVoucher80Template(
      partialSettings?.defaultPaymentVoucher80Template ?? current.defaultPaymentVoucher80Template
    ),
    defaultPaymentVoucherA4Template: normalizePaymentVoucherA4Template(
      partialSettings?.defaultPaymentVoucherA4Template ?? current.defaultPaymentVoucherA4Template
    ),
    defaultPaymentVoucherA5Template: normalizePaymentVoucherA5Template(
      partialSettings?.defaultPaymentVoucherA5Template ?? current.defaultPaymentVoucherA5Template
    ),
    companyName: normalizeCompanyName(partialSettings?.companyName ?? current.companyName),
    companyContactNumbers: normalizeCompanyContactNumbers(
      partialSettings?.companyContactNumbers ?? current.companyContactNumbers
    ),
    companyAddress: normalizeCompanyAddress(partialSettings?.companyAddress ?? current.companyAddress),
    allowNegativeInventory: partialSettings?.allowNegativeInventory ?? current.allowNegativeInventory
  };

  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(merged));
  }

  return merged;
};

export const getDefaultSaleType = () => getAppSettings().defaultSaleType;
export const getDefaultWarehouseId = () => getAppSettings().defaultWarehouseId;
export const getDefaultSearchMode = () => getAppSettings().defaultSearchMode;
export const getDefaultProductDisplayMode = () => getAppSettings().defaultProductDisplayMode;
export const getDefaultPurchaseSaleType = () => getAppSettings().defaultPurchaseSaleType;
export const getDefaultPurchaseWarehouseId = () => getAppSettings().defaultPurchaseWarehouseId;
export const getDefaultPurchaseSearchMode = () => getAppSettings().defaultPurchaseSearchMode;
export const getDefaultPurchaseProductDisplayMode = () =>
  getAppSettings().defaultPurchaseProductDisplayMode;
export const getDefaultSalesReturnSearchMode = () =>
  getAppSettings().defaultSalesReturnSearchMode;
export const getDefaultSalesReturnRightTab = () =>
  getAppSettings().defaultSalesReturnRightTab;
export const getDefaultPurchaseReturnSearchMode = () =>
  getAppSettings().defaultPurchaseReturnSearchMode;
export const getDefaultPurchaseReturnRightTab = () =>
  getAppSettings().defaultPurchaseReturnRightTab;
export const getDefaultInvoicePrintLayout = () => getAppSettings().defaultInvoicePrintLayout;
export const getDefaultPurchaseInvoicePrintLayout = () =>
  getAppSettings().defaultPurchaseInvoicePrintLayout;
export const getDefaultPaymentReceiptPrintLayout = () =>
  getAppSettings().defaultPaymentReceiptPrintLayout;
export const getDefaultPrinterName = () => getAppSettings().defaultPrinterName;
export const getDefaultBarcodePrinterName = () => getAppSettings().defaultBarcodePrinterName;
export const getDefaultBarcodePrintMode = () => getAppSettings().defaultBarcodePrintMode;
export const getDefaultBarcodeStudioStartTab = () => getAppSettings().defaultBarcodeStudioStartTab;
export const getDefaultBarcodeStudioSettings = () =>
  normalizeBarcodeStudioDefaults(getAppSettings().defaultBarcodeStudioSettings);
export const getAllowExcessPayments = () => {
  const settings = getAppSettings();
  return settings.allowExcessPayments === true;
};

export const setAllowExcessPayments = (value) => {
  saveAppSettings({ allowExcessPayments: value === true });
};
export const getBarcodePrintSettings = () => {
  const settings = getAppSettings();
  return {
    printerName: normalizeDefaultPrinterName(settings.defaultBarcodePrinterName),
    printMode: normalizeBarcodePrintMode(settings.defaultBarcodePrintMode),
    startTab: normalizeBarcodeStudioStartTab(settings.defaultBarcodeStudioStartTab),
    studioSettings: normalizeBarcodeStudioDefaults(settings.defaultBarcodeStudioSettings)
  };
};
export const getCompanyName = () => getAppSettings().companyName;
export const getCompanyContactNumbers = () => getAppSettings().companyContactNumbers;
export const getCompanyAddress = () => getAppSettings().companyAddress;
export const getAllowNegativeInventory = () => {
  return getAppSettings().allowNegativeInventory === true;
};

export const setAllowNegativeInventory = (value) => {
  saveAppSettings({ allowNegativeInventory: value === true });
};
export const getCompanyPrintSettings = () => {
  const settings = getAppSettings();
  return {
    name: normalizeCompanyName(settings.companyName) || 'FYC Store Manager',
    contactNumbers: normalizeCompanyContactNumbers(settings.companyContactNumbers),
    address: normalizeCompanyAddress(settings.companyAddress)
  };
};
