import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { safeAlert } from '../utils/safeAlert';
import { safeConfirm } from '../utils/safeConfirm';
import {
  CUSTOMER_IMPORT_FIELD_OPTIONS,
  delimiter as detectImportDelimiter,
  parseLine as parseImportLine,
  toImportHeaders as toCustomerImportHeaders,
  buildCustomerImportAutoMapping,
  mapRowsWithCustomerImportMapping,
  sanitizeImportedCustomer
} from '../utils/customerImportUtils';
import {
  IMPORT_FIELD_OPTIONS,
  delimiter as detectProductImportDelimiter,
  parseLine as parseProductImportLine,
  toImportHeaders as toProductImportHeaders,
  buildImportFieldAutoMapping,
  mapRowsWithImportMapping,
  importGroups,
  isIgnorableProductImportRow
} from '../utils/importUtils';
import { nText, nKey, nNum, nInt } from '../utils/productUtils';
import {
  getAppSettings,
  saveAppSettings,
  normalizeSaleType,
  normalizeWarehouseId,
  normalizeSearchMode,
  normalizeProductDisplayMode,
  normalizeReturnRightTab,
  normalizeInvoicePrintLayout,
  normalizeDefaultPrinterName,
  normalizeReceipt80Template,
  normalizeA4Template,
  normalizeA5Template,
  normalizePaymentVoucher80Template,
  normalizePaymentVoucherA4Template,
  normalizePaymentVoucherA5Template,
  normalizeCompanyName,
  normalizeCompanyContactNumbers,
  normalizeCompanyAddress
} from '../utils/appSettings';
import { emitOpenLicenseManagerRequest } from '../utils/posEditorBridge';
import './Settings.css';

import {
  Settings as SettingsIcon,
  Database,
  Users,
  Upload,
  Store,
  UserCheck,
  ShieldCheck,
  Package,
  Printer,
  ShoppingCart,
  Undo2,
  RotateCcw,
  Share2,
  Headphones
} from 'lucide-react';

const DEFAULT_BACKUP_SETTINGS = {
  directoryPath: '',
  autoBackupOnOpen: false,
  autoBackupOnClose: false,
  intervalEnabled: false,
  intervalValue: 6,
  intervalUnit: 'hours',
  retentionEnabled: false,
  retentionDays: 30,
  lastBackupAt: null,
  lastBackupPath: '',
  lastBackupReason: '',
  lastBackupError: '',
  lastCleanupAt: null,
  lastCleanupDeletedCount: 0
};

const DEFAULT_DATABASE_FORM = {
  databaseMode: 'local_server',
  dbHost: '',
  dbPort: '5433',
  dbName: '',
  dbUsername: '',
  dbPassword: ''
};

const scoreImportHeaderRow = (row, toHeaders, buildMapping, fieldOptions) => {
  const headers = toHeaders(Array.isArray(row) ? row : []);
  if (!headers.length) return { score: 0, headers, mapping: {} };

  const mapping = buildMapping(headers);
  const mappedKeys = fieldOptions.filter((field) => nText(mapping[field.key])).map((field) => field.key);
  const requiredHits = fieldOptions
    .filter((field) => field.required)
    .filter((field) => nText(mapping[field.key]))
    .length;
  const score = mappedKeys.length + (requiredHits * 4);

  return { score, headers, mapping };
};

const findImportHeaderRow = (rows, toHeaders, buildMapping, fieldOptions) => {
  const nonEmptyRows = (Array.isArray(rows) ? rows : [])
    .map((row, index) => ({ row: Array.isArray(row) ? row : [], index }))
    .filter(({ row }) => row.some((cell) => nText(cell)));

  if (!nonEmptyRows.length) return null;

  const candidates = nonEmptyRows
    .slice(0, 30)
    .map((item) => ({
      ...item,
      ...scoreImportHeaderRow(item.row, toHeaders, buildMapping, fieldOptions)
    }))
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (best?.score >= 5 && nText(best.mapping?.name)) return best;

  const fallback = nonEmptyRows[0];
  const headers = toHeaders(fallback.row);
  return {
    row: fallback.row,
    index: fallback.index,
    headers,
    mapping: buildMapping(headers),
    score: 0
  };
};

const isMappedImportHeaderRow = (row, fieldOptions) => (
  fieldOptions.some((field) => {
    const valueKey = nKey(row?.[field.key]);
    if (!valueKey) return false;
    return (field.aliases || []).some((alias) => valueKey === nKey(alias));
  })
);

const detectDelimitedImportHeaderLine = (lines, fallbackDelimiter) => {
  const candidates = (Array.isArray(lines) ? lines : []).slice(0, 30);
  const bestLine = candidates
    .map((line) => ({
      line,
      separators: Math.max(
        String(line).split('\t').length,
        String(line).split(';').length,
        String(line).split(',').length
      )
    }))
    .sort((a, b) => b.separators - a.separators)[0]?.line;

  return fallbackDelimiter(bestLine || lines[0] || '');
};

const buildDatabaseFormState = (database = {}) => ({
  ...DEFAULT_DATABASE_FORM,
  databaseMode: String(database?.mode ?? '').trim().toLowerCase() === 'remote_client'
    ? 'remote_client'
    : 'local_server',
  dbHost: String(database?.host ?? '').trim(),
  dbPort: String(database?.port ?? DEFAULT_DATABASE_FORM.dbPort).trim() || DEFAULT_DATABASE_FORM.dbPort,
  dbName: String(database?.databaseName ?? '').trim(),
  dbUsername: String(database?.appUser ?? '').trim(),
  dbPassword: String(database?.appPassword ?? '')
});

const getDatabaseModeLabel = (mode) => (
  String(mode ?? '').trim().toLowerCase() === 'remote_client'
    ? 'اتصال بقاعدة موجودة'
    : 'قاعدة محلية على هذا الجهاز'
);

const SETTINGS_TABS = [
  { id: 'basic', label: 'الإعدادات العامة', icon: <SettingsIcon /> },
  { id: 'database', label: 'قاعدة البيانات', icon: <Database /> },
  { id: 'print', label: 'الطباعة', icon: <Printer /> },
  { id: 'backup', label: 'النسخ الاحتياطي', icon: <ShieldCheck /> },
  { id: 'salesInvoice', label: 'فاتورة البيع', icon: <Store /> },
  { id: 'purchaseInvoice', label: 'فاتورة الشراء', icon: <ShoppingCart /> },
  { id: 'salesReturn', label: 'مرتجع المبيعات', icon: <Undo2 /> },
  { id: 'purchaseReturn', label: 'مرتجع المشتريات', icon: <RotateCcw /> },
  { id: 'customers', label: 'العملاء المتأخرون', icon: <Users /> },
  { id: 'import', label: 'استيراد العملاء', icon: <Upload /> },
  { id: 'productsImport', label: 'استيراد المنتجات', icon: <Package /> },
  { id: 'aiMarketing', label: 'التسويق الذكي (AI)', icon: <Share2 /> },
  { id: 'support', label: 'الدعم الفني', icon: <Headphones /> },
];

const BACKUP_INTERVAL_UNITS = [
  { value: 'minutes', label: 'دقيقة' },
  { value: 'hours', label: 'ساعة' },
  { value: 'days', label: 'يوم' }
];

const normalizeBackupIntervalUnit = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return BACKUP_INTERVAL_UNITS.some((unit) => unit.value === normalized) ? normalized : 'hours';
};

const normalizePositiveInt = (value, fallback = 1) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeBackupSettings = (value = {}) => ({
  ...DEFAULT_BACKUP_SETTINGS,
  ...value,
  directoryPath: String(value?.directoryPath ?? '').trim(),
  autoBackupOnOpen: value?.autoBackupOnOpen === true,
  autoBackupOnClose: value?.autoBackupOnClose === true,
  intervalEnabled: value?.intervalEnabled === true,
  intervalValue: normalizePositiveInt(value?.intervalValue, DEFAULT_BACKUP_SETTINGS.intervalValue),
  intervalUnit: normalizeBackupIntervalUnit(value?.intervalUnit),
  retentionEnabled: value?.retentionEnabled === true,
  retentionDays: normalizePositiveInt(value?.retentionDays, DEFAULT_BACKUP_SETTINGS.retentionDays),
  lastBackupAt: value?.lastBackupAt || null,
  lastBackupPath: String(value?.lastBackupPath ?? '').trim(),
  lastBackupReason: String(value?.lastBackupReason ?? '').trim(),
  lastBackupError: String(value?.lastBackupError ?? '').trim(),
  lastCleanupAt: value?.lastCleanupAt || null,
  lastCleanupDeletedCount: Number.isFinite(Number(value?.lastCleanupDeletedCount))
    ? Math.max(0, Number(value.lastCleanupDeletedCount))
    : 0
});

const formatBackupDateTime = (value) => {
  if (!value) return 'لا يوجد';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'لا يوجد';
  return parsed.toLocaleString('ar-EG');
};

const getBackupReasonLabel = (reason) => {
  if (!reason) return 'لا يوجد';
  if (reason === 'startup') return 'عند الفتح';
  if (reason === 'interval') return 'نسخ دوري';
  if (reason === 'shutdown') return 'عند الإغلاق';
  if (reason === 'manual') return 'يدوي';
  return 'غير معروف';
};


const normalizeCustomerNameKey = (value) => String(value ?? '').trim().toLowerCase();
const normalizeCustomerPhoneKey = (value) => String(value ?? '')
  .replace(/[^\d+]/g, '')
  .trim();

const getRowStartIndex = (index, session) => {
  const startAt = Number(session?.dataStartRowIndex || 2);
  return startAt + index;
};

export default function Settings() {
  const customerImportInputRef = useRef(null);
  const productImportInputRef = useRef(null);
  const initialAppSettings = getAppSettings();

  const [activeTab, setActiveTab] = useState('basic');
  const [savingBasicSettings, setSavingBasicSettings] = useState(false);
  const [savingPrintSettings, setSavingPrintSettings] = useState(false);
  const [defaultSaleType, setDefaultSaleType] = useState(() => normalizeSaleType(initialAppSettings.defaultSaleType));
  const [defaultWarehouseId, setDefaultWarehouseId] = useState(() =>
    normalizeWarehouseId(initialAppSettings.defaultWarehouseId)
  );
  const [defaultSearchMode, setDefaultSearchMode] = useState(() =>
    normalizeSearchMode(initialAppSettings.defaultSearchMode)
  );
  const [defaultProductDisplayMode, setDefaultProductDisplayMode] = useState(() =>
    normalizeProductDisplayMode(initialAppSettings.defaultProductDisplayMode)
  );
  const [defaultPurchaseSaleType, setDefaultPurchaseSaleType] = useState(() =>
    normalizeSaleType(initialAppSettings.defaultPurchaseSaleType)
  );
  const [defaultPurchaseWarehouseId, setDefaultPurchaseWarehouseId] = useState(() =>
    normalizeWarehouseId(initialAppSettings.defaultPurchaseWarehouseId)
  );
  const [defaultPurchaseSearchMode, setDefaultPurchaseSearchMode] = useState(() =>
    normalizeSearchMode(initialAppSettings.defaultPurchaseSearchMode)
  );
  const [defaultPurchaseProductDisplayMode, setDefaultPurchaseProductDisplayMode] = useState(() =>
    normalizeProductDisplayMode(initialAppSettings.defaultPurchaseProductDisplayMode)
  );
  const [defaultSalesReturnSearchMode, setDefaultSalesReturnSearchMode] = useState(() =>
    normalizeSearchMode(initialAppSettings.defaultSalesReturnSearchMode)
  );
  const [defaultSalesReturnRightTab, setDefaultSalesReturnRightTab] = useState(() =>
    normalizeReturnRightTab(initialAppSettings.defaultSalesReturnRightTab)
  );
  const [defaultPurchaseReturnSearchMode, setDefaultPurchaseReturnSearchMode] = useState(() =>
    normalizeSearchMode(initialAppSettings.defaultPurchaseReturnSearchMode)
  );
  const [defaultPurchaseReturnRightTab, setDefaultPurchaseReturnRightTab] = useState(() =>
    normalizeReturnRightTab(initialAppSettings.defaultPurchaseReturnRightTab)
  );
  const [defaultInvoicePrintLayout, setDefaultInvoicePrintLayout] = useState(() =>
    normalizeInvoicePrintLayout(initialAppSettings.defaultInvoicePrintLayout)
  );
  const [defaultPurchaseInvoicePrintLayout, setDefaultPurchaseInvoicePrintLayout] = useState(() =>
    normalizeInvoicePrintLayout(initialAppSettings.defaultPurchaseInvoicePrintLayout)
  );
  const [defaultPaymentReceiptPrintLayout, setDefaultPaymentReceiptPrintLayout] = useState(() =>
    normalizeInvoicePrintLayout(initialAppSettings.defaultPaymentReceiptPrintLayout)
  );
  const [defaultSaleReturnPrintLayout, setDefaultSaleReturnPrintLayout] = useState(() =>
    normalizeInvoicePrintLayout(initialAppSettings.defaultSaleReturnPrintLayout)
  );
  const [defaultPurchaseReturnPrintLayout, setDefaultPurchaseReturnPrintLayout] = useState(() =>
    normalizeInvoicePrintLayout(initialAppSettings.defaultPurchaseReturnPrintLayout)
  );
  const [defaultPrinterName, setDefaultPrinterName] = useState(() =>
    normalizeDefaultPrinterName(initialAppSettings.defaultPrinterName)
  );
  const [defaultBarcodePrinterName, setDefaultBarcodePrinterName] = useState(() =>
    normalizeDefaultPrinterName(initialAppSettings.defaultBarcodePrinterName)
  );
  const [defaultReceipt80Template, setDefaultReceipt80Template] = useState(() =>
    normalizeReceipt80Template(initialAppSettings.defaultReceipt80Template)
  );
  const [defaultA4Template, setDefaultA4Template] = useState(() =>
    normalizeA4Template(initialAppSettings.defaultA4Template)
  );
  const [defaultA5Template, setDefaultA5Template] = useState(() =>
    normalizeA5Template(initialAppSettings.defaultA5Template)
  );
  const [defaultPaymentVoucher80Template, setDefaultPaymentVoucher80Template] = useState(() =>
    normalizePaymentVoucher80Template(initialAppSettings.defaultPaymentVoucher80Template)
  );
  const [defaultPaymentVoucherA4Template, setDefaultPaymentVoucherA4Template] = useState(() =>
    normalizePaymentVoucherA4Template(initialAppSettings.defaultPaymentVoucherA4Template)
  );
  const [defaultPaymentVoucherA5Template, setDefaultPaymentVoucherA5Template] = useState(() =>
    normalizePaymentVoucherA5Template(initialAppSettings.defaultPaymentVoucherA5Template)
  );
  const [companyName, setCompanyName] = useState(() =>
    normalizeCompanyName(initialAppSettings.companyName)
  );
  const [companyContactNumbers, setCompanyContactNumbers] = useState(() =>
    normalizeCompanyContactNumbers(initialAppSettings.companyContactNumbers)
  );
  const [companyAddress, setCompanyAddress] = useState(() =>
    normalizeCompanyAddress(initialAppSettings.companyAddress)
  );
  const [allowNegativeInventory, setAllowNegativeInventory] = useState(() => initialAppSettings.allowNegativeInventory === true);
  const [allowExcessPayments, setAllowExcessPayments] = useState(() => initialAppSettings.allowExcessPayments === true);
  const [warehouses, setWarehouses] = useState([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const [printers, setPrinters] = useState([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);

  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [allCustomers, setAllCustomers] = useState([]);

  const [overdueThreshold, setOverdueThreshold] = useState(() => {
    const saved = parseInt(localStorage.getItem('overdueThreshold') || '', 10);
    return Number.isFinite(saved) && saved > 0 ? saved : 30;
  });
  const [tempThreshold, setTempThreshold] = useState(overdueThreshold);

  const [customerImportSession, setCustomerImportSession] = useState(null);
  const [importingCustomers, setImportingCustomers] = useState(false);
  const [updateExistingOnImport, setUpdateExistingOnImport] = useState(true);
  const [productImportSession, setProductImportSession] = useState(null);
  const [importingProducts, setImportingProducts] = useState(false);
  const [loadingBusinessProfile, setLoadingBusinessProfile] = useState(false);
  const [loadingBackupSettings, setLoadingBackupSettings] = useState(true);
  const [savingBackupSettings, setSavingBackupSettings] = useState(false);
  const [backupSettings, setBackupSettings] = useState(() => ({ ...DEFAULT_BACKUP_SETTINGS }));
  const [secondaryBackupSettings, setSecondaryBackupSettings] = useState(() => ({ ...DEFAULT_BACKUP_SETTINGS, enabled: false }));
  const [backupSubTab, setBackupSubTab] = useState('primary');
  const [defaultBackupDirectoryPath, setDefaultBackupDirectoryPath] = useState('');
  const [resolvedBackupDirectoryPath, setResolvedBackupDirectoryPath] = useState('');
  const [backingUpDatabase, setBackingUpDatabase] = useState(false);
  const [restoringDatabase, setRestoringDatabase] = useState(false);
  const [setupSnapshot, setSetupSnapshot] = useState(null);
  const [databaseForm, setDatabaseForm] = useState(() => ({ ...DEFAULT_DATABASE_FORM }));
  const [testingDatabaseConnection, setTestingDatabaseConnection] = useState(false);
  const [savingDatabaseConnection, setSavingDatabaseConnection] = useState(false);
  const [resettingDatabaseConnection, setResettingDatabaseConnection] = useState(false);
  const [databaseTestResult, setDatabaseTestResult] = useState(null);
  const [groqApiKey, setGroqApiKey] = useState('');
  const [marketingProvider, setMarketingProvider] = useState('gemini');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [showQuickMarketingInProducts, setShowQuickMarketingInProducts] = useState(true);
  const [savingMarketingSettings, setSavingMarketingSettings] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const openLicenseManager = () => {
    emitOpenLicenseManagerRequest();
  };

  const checkingForUpdateRef = useRef(false);

  useEffect(() => {
    if (!window.api?.onUpdateStatus) return;

    // Listen to update status globally but only act if we initiated the check
    window.api.onUpdateStatus((statusData) => {
      if (!checkingForUpdateRef.current) return;

      if (statusData.status === 'up-to-date' || statusData.status === 'available' || statusData.status === 'error') {
        // Let UpdateNotification handle the UI for all these states
        checkingForUpdateRef.current = false;
        setCheckingUpdate(false);
      }
    });
    // We intentionally do not call offUpdateStatus here because it would remove UpdateNotification's listener too
  }, []);

  const handleCheckForUpdate = useCallback(async () => {
    if (!window.api?.checkForUpdate) {
      safeAlert('ميزة البحث عن التحديثات غير مدعومة في هذه النسخة', null, { title: 'البحث عن تحديثات' });
      return;
    }

    setCheckingUpdate(true);
    checkingForUpdateRef.current = true;

    try {
      await window.api.checkForUpdate();
    } catch (err) {
      checkingForUpdateRef.current = false;
      setCheckingUpdate(false);
    }
  }, []);

  const applyBackupSettingsResult = useCallback((result) => {
    const nextBackupSettings = normalizeBackupSettings(result?.backupSettings);
    const nextDefaultDirectoryPath = String(result?.defaultDirectoryPath ?? '').trim();
    const nextResolvedDirectoryPath = String(result?.resolvedDirectoryPath ?? '').trim();

    setBackupSettings(nextBackupSettings);
    if (result?.secondaryBackupSettings) {
      setSecondaryBackupSettings({
        ...normalizeBackupSettings(result.secondaryBackupSettings),
        enabled: result.secondaryBackupSettings.enabled === true
      });
    }
    setDefaultBackupDirectoryPath(nextDefaultDirectoryPath);
    setResolvedBackupDirectoryPath(
      nextResolvedDirectoryPath || nextBackupSettings.directoryPath || nextDefaultDirectoryPath
    );

    return nextBackupSettings;
  }, []);

  const loadBusinessProfile = useCallback(async () => {
    if (!window.api?.getSetupStatus) return;

    try {
      setLoadingBusinessProfile(true);
      const result = await window.api.getSetupStatus();
      setSetupSnapshot(result || null);
      const config = result?.config;
      const resolvedDatabase = result?.database || config?.database || null;
      if (!config) return;

      setCompanyName(normalizeCompanyName(config.companyName));
      setCompanyContactNumbers(normalizeCompanyContactNumbers(config.companyContactNumbers));
      setCompanyAddress(normalizeCompanyAddress(config.companyAddress));
      setDatabaseForm(buildDatabaseFormState(resolvedDatabase));
      setDatabaseTestResult(null);
    } catch (error) {
      console.error('Failed to load business profile:', error);
    } finally {
      setLoadingBusinessProfile(false);
    }
  }, []);

  const loadPrinters = useCallback(async () => {
    const printersLoader = window.api?.listPrinters || window.api?.getPrinters;
    if (!printersLoader) {
      setPrinters([]);
      return;
    }

    try {
      setLoadingPrinters(true);
      const result = await printersLoader();
      if (result?.error) {
        throw new Error(result.error);
      }

      const parsedPrinters = Array.isArray(result) ? result : [];
      setPrinters(parsedPrinters);
    } catch (error) {
      setPrinters([]);
      await safeAlert(error?.message || 'تعذر تحميل قائمة الطابعات', null, {
        type: 'error',
        title: 'الإعدادات العامة'
      });
    } finally {
      setLoadingPrinters(false);
    }
  }, []);

  const loadWarehouses = useCallback(async () => {
    if (!window.api?.getWarehouses) {
      setWarehouses([]);
      return;
    }

    try {
      setLoadingWarehouses(true);
      const result = await window.api.getWarehouses();
      if (result?.error) {
        throw new Error(result.error);
      }
      setWarehouses(Array.isArray(result) ? result : []);
    } catch (error) {
      setWarehouses([]);
      await safeAlert(error?.message || 'تعذر تحميل بيانات المخازن', null, {
        type: 'error',
        title: 'الإعدادات الأساسية'
      });
    } finally {
      setLoadingWarehouses(false);
    }
  }, []);

  const loadAllCustomers = useCallback(async () => {
    try {
      setLoadingCustomers(true);
      const result = await window.api.getCustomers({
        page: 1,
        pageSize: 10000,
        searchTerm: '',
        customerType: 'all',
        city: '',
        sortCol: 'createdAt',
        sortDir: 'desc',
        overdueThreshold
      });

      if (result?.error) {
        setAllCustomers([]);
        await safeAlert(result.error, null, { type: 'error', title: 'الإعدادات' });
        return;
      }

      const data = Array.isArray(result?.data) ? result.data : [];
      setAllCustomers(data);
    } catch (error) {
      setAllCustomers([]);
      await safeAlert(error?.message || 'تعذر تحميل بيانات العملاء', null, {
        type: 'error',
        title: 'الإعدادات'
      });
    } finally {
      setLoadingCustomers(false);
    }
  }, [overdueThreshold]);

  const loadBackupSettings = useCallback(async () => {
    if (!window.api?.getBackupSettings) {
      setLoadingBackupSettings(false);
      return;
    }

    try {
      setLoadingBackupSettings(true);
      const result = await window.api.getBackupSettings();
      if (result?.error) {
        throw new Error(result.error);
      }

      applyBackupSettingsResult(result);
    } catch (error) {
      await safeAlert(error?.message || 'تعذر تحميل إعدادات النسخ الاحتياطي.', null, {
        type: 'error',
        title: 'النسخ الاحتياطي'
      });
    } finally {
      setLoadingBackupSettings(false);
    }
  }, [applyBackupSettingsResult]);

  useEffect(() => {
    loadWarehouses();
  }, [loadWarehouses]);

  useEffect(() => {
    loadBusinessProfile();
  }, [loadBusinessProfile]);

  useEffect(() => {
    loadPrinters();
  }, [loadPrinters]);

  useEffect(() => {
    loadAllCustomers();
  }, [loadAllCustomers]);

  useEffect(() => {
    loadBackupSettings();
  }, [loadBackupSettings]);

  const loadMarketingSettings = useCallback(async () => {
    try {
      const res = await window.api.aiMarketingGetSettings();
      if (res.success && res.settings) {
        setMarketingProvider(res.settings.provider || 'gemini');
        setGeminiApiKey(res.settings.geminiApiKey || '');
        setGroqApiKey(res.settings.groqApiKey || '');
        setShowQuickMarketingInProducts(res.settings.showQuickMarketingInProducts !== false);
      }
    } catch (err) {
      console.error('Failed to load marketing settings:', err);
    }
  }, []);

  useEffect(() => {
    loadMarketingSettings();
  }, [loadMarketingSettings]);

  const saveMarketingSettings = async () => {
    try {
      setSavingMarketingSettings(true);
      const res = await window.api.aiMarketingSaveSettings({
        provider: marketingProvider,
        geminiApiKey,
        groqApiKey,
        showQuickMarketingInProducts
      });
      if (res.success) {
        await safeAlert('تم حفظ إعدادات التسويق بنجاح.', null, {
          type: 'success',
          title: 'التسويق بالذكاء الاصطناعي'
        });
      } else {
        throw new Error(res.error);
      }
    } catch (error) {
      await safeAlert(error?.message || 'تعذر حفظ إعدادات التسويق.', null, {
        type: 'error',
        title: 'التسويق بالذكاء الاصطناعي'
      });
    } finally {
      setSavingMarketingSettings(false);
    }
  };

  const customerStats = useMemo(() => {
    let debtedCount = 0;
    let compliantCount = 0;
    let overdueCount = 0;
    let totalDebt = 0;

    for (const customer of allCustomers) {
      const balance = Number(customer?.balance || 0);
      if (balance > 0) {
        debtedCount += 1;
        totalDebt += balance;
      } else {
        compliantCount += 1;
      }

      const lastPaymentDays = Number(customer?.lastPaymentDays || 0);
      if (lastPaymentDays > overdueThreshold) overdueCount += 1;
    }

    return {
      totalItems: allCustomers.length,
      debtedCount,
      compliantCount,
      overdueCount,
      totalDebt
    };
  }, [allCustomers, overdueThreshold]);

  const overduePreviewCount = useMemo(
    () => allCustomers.filter((customer) => (customer?.lastPaymentDays || 0) > tempThreshold).length,
    [allCustomers, tempThreshold]
  );
  const activeWarehouses = useMemo(
    () => warehouses.filter((warehouse) => warehouse?.isActive !== false),
    [warehouses]
  );
  const effectiveBackupDirectoryPath = useMemo(() => {
    const settings = backupSubTab === 'secondary' ? secondaryBackupSettings : backupSettings;
    const customDirectoryPath = String(settings.directoryPath ?? '').trim();
    if (customDirectoryPath) {
      return customDirectoryPath;
    }

    const resolvedDirectory = String(resolvedBackupDirectoryPath ?? '').trim();
    if (resolvedDirectory) {
      return resolvedDirectory;
    }

    return String(defaultBackupDirectoryPath ?? '').trim();
  }, [backupSettings.directoryPath, secondaryBackupSettings.directoryPath, backupSubTab, defaultBackupDirectoryPath, resolvedBackupDirectoryPath]);
  const hasCustomBackupDirectory = useMemo(() => {
    const settings = backupSubTab === 'secondary' ? secondaryBackupSettings : backupSettings;
    return String(settings.directoryPath ?? '').trim().length > 0;
  }, [backupSettings.directoryPath, secondaryBackupSettings.directoryPath, backupSubTab]);
  const currentBackup = useMemo(() => {
    return backupSubTab === 'secondary' ? secondaryBackupSettings : backupSettings;
  }, [backupSettings, secondaryBackupSettings, backupSubTab]);
  const currentDatabase = setupSnapshot?.database || setupSnapshot?.config?.database || null;
  const currentDatabaseMode = String(
    setupSnapshot?.database?.mode || setupSnapshot?.config?.database?.mode || ''
  ).trim();
  const currentDatabaseModeLabel = getDatabaseModeLabel(currentDatabaseMode);
  const isRemoteDatabaseClient = currentDatabaseMode === 'remote_client';
  const remoteDatabaseSummary = [
    setupSnapshot?.database?.host,
    setupSnapshot?.database?.port
  ].filter(Boolean).join(':');
  const currentDatabaseEndpoint = [
    currentDatabase?.host,
    currentDatabase?.port
  ].filter(Boolean).join(':') || 'غير محدد';
  const databaseFormIsRemote = databaseForm.databaseMode === 'remote_client';
  const databaseSettingsBusy =
    loadingBusinessProfile || testingDatabaseConnection || savingDatabaseConnection || resettingDatabaseConnection;
  const backupSettingsBusy =
    loadingBackupSettings || savingBackupSettings || backingUpDatabase || restoringDatabase || isRemoteDatabaseClient;
  const selectedBackupIntervalUnitLabel =
    BACKUP_INTERVAL_UNITS.find((unit) => unit.value === backupSettings.intervalUnit)?.label || 'ساعة';
  const activeTabMeta = useMemo(
    () => SETTINGS_TABS.find((tab) => tab.id === activeTab) || SETTINGS_TABS[0],
    [activeTab]
  );
  const headerStats = useMemo(() => ([
    { label: 'الأقسام', value: new Intl.NumberFormat('ar-EG').format(SETTINGS_TABS.length) },
    {
      label: 'الطابعات',
      value: loadingPrinters ? '...' : new Intl.NumberFormat('ar-EG').format(printers.length)
    },
    {
      label: 'المخازن النشطة',
      value: loadingWarehouses ? '...' : new Intl.NumberFormat('ar-EG').format(activeWarehouses.length)
    },
    {
      label: 'النسخ الاحتياطي',
      value: loadingBackupSettings
        ? '...'
        : (backupSettings.autoBackupOnOpen || backupSettings.autoBackupOnClose || backupSettings.intervalEnabled
            ? 'مفعّل'
            : 'يدوي')
    }
  ]), [
    activeWarehouses.length,
    backupSettings.autoBackupOnClose,
    backupSettings.autoBackupOnOpen,
    backupSettings.intervalEnabled,
    loadingBackupSettings,
    loadingPrinters,
    loadingWarehouses,
    printers.length
  ]);
  const settingsBrandName = companyName || 'SALES MANAGER';
  const customerImportColumnSamples = useMemo(() => {
    const sampleMap = new Map();
    if (!customerImportSession?.headers?.length || !customerImportSession?.rows?.length) return sampleMap;

    const previewRows = customerImportSession.rows.slice(0, 120);
    customerImportSession.headers.forEach((header) => {
      for (const row of previewRows) {
        const value = String(row?.[header.index] ?? '').trim();
        if (value) {
          sampleMap.set(header.id, value.slice(0, 120));
          break;
        }
      }
    });

    return sampleMap;
  }, [customerImportSession]);
  const productImportColumnSamples = useMemo(() => {
    const sampleMap = new Map();
    if (!productImportSession?.headers?.length || !productImportSession?.rows?.length) return sampleMap;

    const previewRows = productImportSession.rows.slice(0, 120);
    productImportSession.headers.forEach((header) => {
      for (const row of previewRows) {
        const value = String(row?.[header.index] ?? '').trim();
        if (value) {
          sampleMap.set(header.id, value.slice(0, 120));
          break;
        }
      }
    });

    return sampleMap;
  }, [productImportSession]);

  const saveBasicSettings = async () => {
    try {
      setSavingBasicSettings(true);
      if (window.api?.saveBusinessProfile) {
        const profileResult = await window.api.saveBusinessProfile({
          companyName: normalizeCompanyName(companyName),
          companyContactNumbers: normalizeCompanyContactNumbers(companyContactNumbers),
          companyAddress: normalizeCompanyAddress(companyAddress)
        });
        if (profileResult?.error) {
          throw new Error(profileResult.error);
        }
      }
      saveAppSettings({
        companyName: normalizeCompanyName(companyName),
        companyContactNumbers: normalizeCompanyContactNumbers(companyContactNumbers),
        companyAddress: normalizeCompanyAddress(companyAddress)
      });
      await safeAlert('تم حفظ الإعدادات العامة بنجاح', null, {
        type: 'success',
        title: 'الإعدادات العامة'
      });
    } catch (error) {
      await safeAlert(error?.message || 'تعذر حفظ الإعدادات العامة', null, {
        type: 'error',
        title: 'الإعدادات العامة'
      });
    } finally {
      setSavingBasicSettings(false);
    }
  };

  const saveInvoiceSettings = async () => {
    try {
      setSavingBasicSettings(true);
      saveAppSettings({
        defaultSaleType: normalizeSaleType(defaultSaleType),
        defaultWarehouseId: normalizeWarehouseId(defaultWarehouseId),
        defaultSearchMode: normalizeSearchMode(defaultSearchMode),
        defaultProductDisplayMode: normalizeProductDisplayMode(defaultProductDisplayMode),
        defaultPurchaseSaleType: normalizeSaleType(defaultPurchaseSaleType),
        defaultPurchaseWarehouseId: normalizeWarehouseId(defaultPurchaseWarehouseId),
        defaultPurchaseSearchMode: normalizeSearchMode(defaultPurchaseSearchMode),
        defaultPurchaseProductDisplayMode: normalizeProductDisplayMode(
          defaultPurchaseProductDisplayMode
        ),
        defaultSalesReturnSearchMode: normalizeSearchMode(defaultSalesReturnSearchMode),
        defaultSalesReturnRightTab: normalizeReturnRightTab(defaultSalesReturnRightTab),
        defaultPurchaseReturnSearchMode: normalizeSearchMode(defaultPurchaseReturnSearchMode),
        defaultPurchaseReturnRightTab: normalizeReturnRightTab(defaultPurchaseReturnRightTab),
        allowExcessPayments: allowExcessPayments === true,
        allowNegativeInventory: allowNegativeInventory === true
      });
      await safeAlert('تم حفظ إعدادات الفواتير بنجاح', null, {
        type: 'success',
        title: 'إعدادات الفواتير'
      });
    } catch (error) {
      await safeAlert(error?.message || 'تعذر حفظ إعدادات الفواتير', null, {
        type: 'error',
        title: 'إعدادات الفواتير'
      });
    } finally {
      setSavingBasicSettings(false);
    }
  };

  const savePrintSettings = useCallback(async () => {
    try {
      setSavingPrintSettings(true);
      saveAppSettings({
        defaultInvoicePrintLayout: normalizeInvoicePrintLayout(defaultInvoicePrintLayout),
        defaultPurchaseInvoicePrintLayout: normalizeInvoicePrintLayout(defaultPurchaseInvoicePrintLayout),
        defaultPaymentReceiptPrintLayout: normalizeInvoicePrintLayout(defaultPaymentReceiptPrintLayout),
        defaultSaleReturnPrintLayout: normalizeInvoicePrintLayout(defaultSaleReturnPrintLayout),
        defaultPurchaseReturnPrintLayout: normalizeInvoicePrintLayout(defaultPurchaseReturnPrintLayout),
        defaultPrinterName: normalizeDefaultPrinterName(defaultPrinterName),
        defaultBarcodePrinterName: normalizeDefaultPrinterName(defaultBarcodePrinterName),
        defaultReceipt80Template: normalizeReceipt80Template(defaultReceipt80Template),
        defaultA4Template: normalizeA4Template(defaultA4Template),
        defaultA5Template: normalizeA5Template(defaultA5Template),
        defaultPaymentVoucher80Template: normalizePaymentVoucher80Template(defaultPaymentVoucher80Template),
        defaultPaymentVoucherA4Template: normalizePaymentVoucherA4Template(defaultPaymentVoucherA4Template),
        defaultPaymentVoucherA5Template: normalizePaymentVoucherA5Template(defaultPaymentVoucherA5Template)
      });

      await safeAlert('تم حفظ إعدادات الطباعة بنجاح.', null, {
        type: 'success',
        title: 'إعدادات الطباعة'
      });
    } catch (error) {
      await safeAlert(error?.message || 'تعذر حفظ إعدادات الطباعة.', null, {
        type: 'error',
        title: 'إعدادات الطباعة'
      });
    } finally {
      setSavingPrintSettings(false);
    }
  }, [
    defaultInvoicePrintLayout,
    defaultPaymentReceiptPrintLayout,
    defaultBarcodePrinterName,
    defaultPrinterName,
    defaultPurchaseInvoicePrintLayout,
    defaultReceipt80Template,
    defaultA4Template,
    defaultA5Template,
    defaultPaymentVoucher80Template,
    defaultPaymentVoucherA4Template,
    defaultPaymentVoucherA5Template,
    defaultSaleReturnPrintLayout,
    defaultPurchaseReturnPrintLayout
  ]);

  const clearStoredSessionForReconnect = useCallback(() => {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    } catch (error) {
      console.warn('Failed to clear stored session before reconnect:', error);
    }
  }, []);

  const updateDatabaseFormField = useCallback((field, value) => {
    setDatabaseForm((prev) => ({
      ...prev,
      [field]: value
    }));
    setDatabaseTestResult(null);
  }, []);

  const testDatabaseConnectionForm = useCallback(async () => {
    if (!window.api?.testDatabaseConnection) {
      await safeAlert('اختبار اتصال قاعدة البيانات غير متاح في هذه النسخة.', null, {
        type: 'error',
        title: 'قاعدة البيانات'
      });
      return;
    }

    try {
      setTestingDatabaseConnection(true);
      const result = await window.api.testDatabaseConnection(databaseForm);
      if (result?.error) {
        throw new Error(result.error);
      }

      setDatabaseTestResult(result || null);

      await safeAlert(result?.message || 'اكتمل اختبار الاتصال.', null, {
        type: result?.success ? (result?.canConnect ? 'success' : 'warning') : 'error',
        title: 'اختبار الاتصال',
        detail: String(result?.details ?? '').trim() || undefined
      });
    } catch (error) {
      setDatabaseTestResult(null);
      await safeAlert(error?.message || 'تعذر اختبار الاتصال بقاعدة البيانات.', null, {
        type: 'error',
        title: 'قاعدة البيانات'
      });
    } finally {
      setTestingDatabaseConnection(false);
    }
  }, [databaseForm]);

  const saveDatabaseConnectionForm = useCallback(async () => {
    if (!window.api?.saveDatabaseConnection) {
      await safeAlert('تغيير اتصال قاعدة البيانات غير متاح في هذه النسخة.', null, {
        type: 'error',
        title: 'قاعدة البيانات'
      });
      return;
    }

    const confirmed = await safeConfirm(
      databaseForm.databaseMode === 'remote_client'
        ? 'سيتم تحويل البرنامج للاتصال بقاعدة بيانات أخرى.'
        : 'سيتم توصيل البرنامج بقاعدة البيانات المحلية على هذا الجهاز.',
      {
        title: 'تغيير قاعدة البيانات',
        detail: 'إذا نجح الاتصال، يُفضّل إعادة تشغيل البرنامج حتى تُعاد تهيئة البيانات والشاشات على القاعدة الجديدة.',
        buttons: ['متابعة', 'إلغاء'],
        defaultId: 0,
        cancelId: 1
      }
    );

    if (!confirmed) return;

    try {
      setSavingDatabaseConnection(true);
      const result = await window.api.saveDatabaseConnection(databaseForm);
      if (result?.error) {
        throw new Error(result.error);
      }

      setDatabaseTestResult({
        success: true,
        canConnect: true,
        message: 'تم تطبيق الاتصال الجديد بنجاح.',
        details: '',
        database: result?.database || null
      });

      await loadBusinessProfile();
      await loadBackupSettings();

      await safeAlert('تم تطبيق اتصال قاعدة البيانات بنجاح.', null, {
        type: 'success',
        title: 'قاعدة البيانات',
        detail: [
          `الوضع الحالي: ${getDatabaseModeLabel(result?.database?.mode)}`,
          `الخادم: ${[result?.database?.host, result?.database?.port].filter(Boolean).join(':') || 'غير محدد'}`,
          `اسم القاعدة: ${result?.database?.databaseName || 'غير محدد'}`
        ].join('\n')
      });

      const restartConfirmed = await safeConfirm('يُنصح بإعادة تشغيل البرنامج الآن للانتقال إلى قاعدة البيانات الجديدة بشكل كامل.', {
        title: 'إعادة تشغيل البرنامج',
        detail: 'يمكنك المتابعة بدون إعادة تشغيل، لكن بعض الشاشات قد تظل محملة ببيانات من الاتصال السابق حتى يعاد فتح البرنامج.',
        buttons: ['إعادة التشغيل الآن', 'لاحقًا'],
        defaultId: 0,
        cancelId: 1
      });

      if (restartConfirmed && window.api?.restartApp) {
        clearStoredSessionForReconnect();
        await window.api.restartApp();
      }
    } catch (error) {
      await safeAlert(error?.message || 'تعذر تغيير اتصال قاعدة البيانات.', null, {
        type: 'error',
        title: 'قاعدة البيانات'
      });
    } finally {
      setSavingDatabaseConnection(false);
    }
  }, [clearStoredSessionForReconnect, databaseForm, loadBackupSettings, loadBusinessProfile]);

  const resetDatabaseConnectionForm = useCallback(async () => {
    if (!window.api?.resetDatabaseConnection) {
      await safeAlert('إعادة ضبط اتصال قاعدة البيانات غير متاحة في هذه النسخة.', null, {
        type: 'error',
        title: 'قاعدة البيانات'
      });
      return;
    }

    const confirmed = await safeConfirm('سيتم حذف إعدادات الاتصال الحالية والعودة إلى شاشة الإعداد الأولي عند تشغيل البرنامج من جديد.', {
      title: 'إعادة ضبط الاتصال',
      detail: 'لن يتم حذف قاعدة البيانات نفسها، لكن سيتم نسيان عنوانها وبيانات الدخول الحالية على هذا الجهاز.',
      buttons: ['متابعة', 'إلغاء'],
      defaultId: 0,
      cancelId: 1
    });

    if (!confirmed) return;

    try {
      setResettingDatabaseConnection(true);
      const result = await window.api.resetDatabaseConnection();
      if (result?.error) {
        throw new Error(result.error);
      }

      clearStoredSessionForReconnect();

      await safeAlert('تمت إعادة ضبط اتصال قاعدة البيانات. سيُعاد تشغيل البرنامج الآن لتظهر شاشة الاختيار من البداية.', null, {
        type: 'success',
        title: 'قاعدة البيانات'
      });

      if (window.api?.restartApp) {
        await window.api.restartApp();
      }
    } catch (error) {
      await safeAlert(error?.message || 'تعذر إعادة ضبط اتصال قاعدة البيانات.', null, {
        type: 'error',
        title: 'قاعدة البيانات'
      });
    } finally {
      setResettingDatabaseConnection(false);
    }
  }, [clearStoredSessionForReconnect]);

  const updateBackupSettingsField = useCallback((field, value) => {
    if (backupSubTab === 'secondary') {
      setSecondaryBackupSettings((prev) => ({
        ...prev,
        [field]: value
      }));
    } else {
      setBackupSettings((prev) => normalizeBackupSettings({
        ...prev,
        [field]: value
      }));
    }
  }, [backupSubTab]);

  const pickBackupDirectory = useCallback(async () => {
    if (!window.api?.chooseBackupDirectory) {
      await safeAlert('اختيار مجلد النسخ الاحتياطي غير متاح في هذه النسخة.', null, {
        type: 'error',
        title: 'النسخ الاحتياطي'
      });
      return;
    }

    try {
      const result = await window.api.chooseBackupDirectory(effectiveBackupDirectoryPath);
      if (result?.canceled) return;
      if (result?.error) {
        throw new Error(result.error);
      }

      const directoryPath = String(result?.directoryPath ?? '').trim();
      updateBackupSettingsField('directoryPath', directoryPath);
      setResolvedBackupDirectoryPath(directoryPath || defaultBackupDirectoryPath);
    } catch (error) {
      await safeAlert(error?.message || 'تعذر اختيار مجلد النسخ الاحتياطي.', null, {
        type: 'error',
        title: 'النسخ الاحتياطي'
      });
    }
  }, [defaultBackupDirectoryPath, effectiveBackupDirectoryPath, updateBackupSettingsField]);

  const resetBackupDirectoryToDefault = useCallback(() => {
    updateBackupSettingsField('directoryPath', '');
    setResolvedBackupDirectoryPath(defaultBackupDirectoryPath);
  }, [defaultBackupDirectoryPath, updateBackupSettingsField]);

  const saveBackupSettingsForm = useCallback(async () => {
    if (isRemoteDatabaseClient) {
      await safeAlert('إعدادات النسخ الاحتياطي متاحة فقط على الجهاز الذي يستضيف قاعدة البيانات.', null, {
        type: 'warning',
        title: 'النسخ الاحتياطي'
      });
      return;
    }

    if (!window.api?.saveBackupSettings) {
      await safeAlert('حفظ إعدادات النسخ الاحتياطي غير متاح في هذه النسخة.', null, {
        type: 'error',
        title: 'النسخ الاحتياطي'
      });
      return;
    }

    try {
      setSavingBackupSettings(true);
      const isSecondary = backupSubTab === 'secondary';
      const payload = isSecondary ? { ...secondaryBackupSettings, isSecondary: true } : backupSettings;
      const result = await window.api.saveBackupSettings(payload);
      if (result?.error) {
        throw new Error(result.error);
      }

      applyBackupSettingsResult(result);

      const cleanupError = String(result?.cleanupResult?.error ?? '').trim();
      const cleanupDeletedCount = Number(result?.cleanupResult?.lastCleanupDeletedCount || 0);
      const detailParts = [
        `مجلد الحفظ الحالي:\n${String(result?.resolvedDirectoryPath || effectiveBackupDirectoryPath || '-').trim()}`
      ];

      if (cleanupDeletedCount > 0) {
        detailParts.push(`تم حذف ${cleanupDeletedCount} نسخة قديمة حسب سياسة الاحتفاظ.`);
      }
      if (cleanupError) {
        detailParts.push(`ملاحظة: تعذر تنظيف بعض النسخ القديمة تلقائيًا.\n${cleanupError}`);
      }

      await safeAlert('تم حفظ إعدادات النسخ الاحتياطي بنجاح.', null, {
        type: 'success',
        title: 'النسخ الاحتياطي',
        detail: detailParts.join('\n\n')
      });
    } catch (error) {
      await safeAlert(error?.message || 'تعذر حفظ إعدادات النسخ الاحتياطي.', null, {
        type: 'error',
        title: 'النسخ الاحتياطي'
      });
    } finally {
      setSavingBackupSettings(false);
    }
  }, [applyBackupSettingsResult, backupSettings, secondaryBackupSettings, backupSubTab, effectiveBackupDirectoryPath, isRemoteDatabaseClient]);

  const runManualBackup = useCallback(async () => {
    if (isRemoteDatabaseClient) {
      await safeAlert('إنشاء نسخة احتياطية يتم من جهاز السيرفر فقط، لأن قاعدة البيانات ليست محلية على هذا الجهاز.', null, {
        type: 'warning',
        title: 'النسخ الاحتياطي'
      });
      return;
    }

    if (!window.api?.backupDatabase) {
      await safeAlert('ميزة النسخ الاحتياطي غير متاحة في هذه النسخة.', null, {
        type: 'error',
        title: 'النسخ الاحتياطي'
      });
      return;
    }

    try {
      setBackingUpDatabase(true);
      const isSecondary = backupSubTab === 'secondary';
      const result = await window.api.backupDatabase({
        reason: 'manual',
        useDialog: false,
        isSecondary,
        directoryPath: effectiveBackupDirectoryPath || defaultBackupDirectoryPath
      });
      if (result?.canceled) return;
      if (result?.error) {
        throw new Error(result.error);
      }

      await loadBackupSettings();

      const cleanupDeletedCount = Number(result?.cleanupResult?.lastCleanupDeletedCount || 0);
      const detailParts = [`ملف قاعدة البيانات:\n${result?.filePath || '-'}`];

      if (result?.settingsPath) {
        detailParts.push(`ملف إعدادات النسخة:\n${result.settingsPath}`);
      }
      if (cleanupDeletedCount > 0) {
        detailParts.push(`تم حذف ${cleanupDeletedCount} نسخة قديمة بعد إنشاء النسخة.`);
      }

      await safeAlert('تم حفظ النسخة الاحتياطية بنجاح.', null, {
        type: 'success',
        title: 'النسخ الاحتياطي',
        detail: detailParts.join('\n\n')
      });
    } catch (error) {
      await safeAlert(error?.message || 'تعذر إنشاء النسخة الاحتياطية.', null, {
        type: 'error',
        title: 'النسخ الاحتياطي'
      });
    } finally {
      setBackingUpDatabase(false);
    }
  }, [defaultBackupDirectoryPath, effectiveBackupDirectoryPath, isRemoteDatabaseClient, loadBackupSettings, backupSubTab]);

  const restoreBackupIntoDatabase = useCallback(async () => {
    if (isRemoteDatabaseClient) {
      await safeAlert('استرجاع النسخ الاحتياطية يتم من جهاز السيرفر فقط.', null, {
        type: 'warning',
        title: 'استرجاع النسخة'
      });
      return;
    }

    if (!window.api?.restoreDatabase) {
      await safeAlert('ميزة استرجاع النسخ الاحتياطية غير متاحة في هذه النسخة.', null, {
        type: 'error',
        title: 'استرجاع النسخة'
      });
      return;
    }

    const confirmed = await safeConfirm('سيتم استبدال قاعدة البيانات الحالية بالكامل.', {
      title: 'استرجاع نسخة احتياطية',
      detail: 'استخدم هذا الإجراء فقط عند التأكد من الملف. سيتم إعادة تشغيل البرنامج بعد اكتمال الاسترجاع.',
      buttons: ['متابعة الاسترجاع', 'إلغاء'],
      defaultId: 0,
      cancelId: 1
    });
    if (!confirmed) return;

    try {
      setRestoringDatabase(true);
      const result = await window.api.restoreDatabase();
      if (result?.canceled) return;
      if (result?.error) {
        throw new Error(result.error);
      }

      await safeAlert('تم استرجاع النسخة الاحتياطية بنجاح.', null, {
        type: 'success',
        title: 'استرجاع النسخة',
        detail: `${result?.filePath ? `الملف:\n${result.filePath}\n\n` : ''}${result?.restoredSettings ? 'تم أيضًا استرجاع بيانات النشاط التجارية.' : 'تم استرجاع قاعدة البيانات فقط.'}`
      });

      if (result?.requiresRestart && window.api?.restartApp) {
        await window.api.restartApp();
      }
    } catch (error) {
      await safeAlert(error?.message || 'تعذر استرجاع النسخة الاحتياطية.', null, {
        type: 'error',
        title: 'استرجاع النسخة'
      });
    } finally {
      setRestoringDatabase(false);
    }
  }, [isRemoteDatabaseClient]);

  const saveOverdueThreshold = async () => {
    localStorage.setItem('overdueThreshold', String(tempThreshold));
    setOverdueThreshold(tempThreshold);
    await safeAlert('تم حفظ إعدادات العملاء بنجاح', null, {
      type: 'success',
      title: 'إعدادات العملاء'
    });
  };

  const closeCustomerImportSession = useCallback(() => {
    if (importingCustomers) return;
    setCustomerImportSession(null);
  }, [importingCustomers]);

  const updateCustomerImportFieldMapping = useCallback((fieldKey, columnId) => {
    setCustomerImportSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        mapping: {
          ...prev.mapping,
          [fieldKey]: columnId
        }
      };
    });
  }, []);

  const applyCustomerImportAutoMapping = useCallback(() => {
    setCustomerImportSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        mapping: buildCustomerImportAutoMapping(prev.headers)
      };
    });
  }, []);

  const parseDelimitedCustomerRows = useCallback((rawText) => {
    const lines = String(rawText || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) throw new Error('الملف لا يحتوي على بيانات كافية');

    const delim = detectDelimitedImportHeaderLine(lines, detectImportDelimiter);
    const parsedLines = lines.map((line) => parseImportLine(line, delim));
    const headerInfo = findImportHeaderRow(
      parsedLines,
      toCustomerImportHeaders,
      buildCustomerImportAutoMapping,
      CUSTOMER_IMPORT_FIELD_OPTIONS
    );
    if (!headerInfo) throw new Error('تعذر قراءة الأعمدة من الملف');

    const headers = headerInfo.headers;
    const rows = parsedLines
      .slice(headerInfo.index + 1)
      .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));

    if (!headers.length) throw new Error('تعذر قراءة الأعمدة من الملف');
    if (!rows.length) throw new Error('الملف لا يحتوي على صفوف بيانات');

    return { headers, rows, dataStartRowIndex: headerInfo.index + 2 };
  }, []);

  const parseWorkbookCustomerRows = useCallback(async (file) => {
    const xlsxModule = await import('xlsx');
    const XLSX = xlsxModule?.default || xlsxModule;

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, {
      type: 'array',
      cellDates: false
    });

    const firstSheetName = workbook?.SheetNames?.[0];
    if (!firstSheetName) throw new Error('ملف Excel لا يحتوي على أي ورقة بيانات');

    const sheet = workbook.Sheets[firstSheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: false
    });

    const rows = Array.isArray(matrix) ? matrix : [];
    const hasAnyValue = (row) => (
      Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== '')
    );
    const firstNonEmptyIndex = rows.findIndex(hasAnyValue);

    if (firstNonEmptyIndex === -1) throw new Error('ورقة Excel فارغة');

    const headerInfo = findImportHeaderRow(
      rows,
      toCustomerImportHeaders,
      buildCustomerImportAutoMapping,
      CUSTOMER_IMPORT_FIELD_OPTIONS
    );
    if (!headerInfo) throw new Error('تعذر قراءة أعمدة ملف Excel');

    const dataRows = rows
      .slice(headerInfo.index + 1)
      .map((row) => (Array.isArray(row) ? row : []))
      .filter(hasAnyValue);

    const headers = headerInfo.headers;
    if (!headers.length) throw new Error('تعذر قراءة أعمدة ملف Excel');
    if (!dataRows.length) throw new Error('ورقة Excel لا تحتوي على بيانات');

    return {
      headers,
      rows: dataRows,
      sheetName: firstSheetName,
      dataStartRowIndex: headerInfo.index + 2
    };
  }, []);

  const importCustomersFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const fileName = String(file.name || '').toLowerCase();
      let parsed = null;

      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        parsed = await parseWorkbookCustomerRows(file);
      } else if (fileName.endsWith('.csv') || fileName.endsWith('.tsv') || fileName.endsWith('.txt')) {
        parsed = parseDelimitedCustomerRows(await file.text());
      } else {
        throw new Error('صيغة الملف غير مدعومة. استخدم Excel أو CSV أو TSV');
      }

      setCustomerImportSession({
        fileName: file.name,
        headers: parsed.headers,
        rows: parsed.rows,
        sheetName: parsed.sheetName || null,
        dataStartRowIndex: parsed.dataStartRowIndex || 2,
        mapping: buildCustomerImportAutoMapping(parsed.headers)
      });
    } catch (err) {
      await safeAlert(err?.message || 'تعذر قراءة الملف', null, {
        type: 'error',
        title: 'استيراد العملاء'
      });
    }
  };

  const downloadCustomerImportTemplate = () => {
    const headers = [
      'name',
      'phone',
      'phone2',
      'address',
      'city',
      'district',
      'notes',
      'creditLimit',
      'balance',
      'customerType'
    ];

    const rows = [
      headers.join(','),
      [
        'عميل تجريبي',
        '01000000000',
        '',
        'القاهرة - شارع النصر',
        'القاهرة',
        'مدينة نصر',
        'ملاحظة اختيارية',
        '5000',
        '1250',
        'VIP'
      ].join(',')
    ];

    const blob = new Blob([`\uFEFF${rows.join('\r\n')}`], {
      type: 'text/csv;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'customers-import-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const startCustomerImport = useCallback(async () => {
    if (!customerImportSession || importingCustomers) return;

    if (!customerImportSession.mapping?.name) {
      await safeAlert('اختَر عمود "اسم العميل" قبل بدء الاستيراد', null, {
        type: 'warning',
        title: 'مطابقة الأعمدة'
      });
      return;
    }

    setImportingCustomers(true);
    try {
      const mappedRows = mapRowsWithCustomerImportMapping(
        customerImportSession.rows,
        customerImportSession.mapping
      ).map((mapped, index) => ({
        sourceIndex: getRowStartIndex(index, customerImportSession),
        mapped,
        customer: sanitizeImportedCustomer(mapped)
      }));

      const validRows = mappedRows.filter((item) => (
        item.customer.name && !isMappedImportHeaderRow(item.mapped, CUSTOMER_IMPORT_FIELD_OPTIONS)
      ));
      const skipped = Math.max(0, mappedRows.length - validRows.length);

      if (!validRows.length) {
        throw new Error('لم يتم العثور على صفوف صالحة تحتوي على اسم عميل');
      }

      const existingByName = new Map();
      const existingByPhone = new Map();
      if (updateExistingOnImport) {
        for (const customer of allCustomers) {
          const nameKey = normalizeCustomerNameKey(customer?.name);
          const phoneKey = normalizeCustomerPhoneKey(customer?.phone);
          if (nameKey && !existingByName.has(nameKey)) existingByName.set(nameKey, customer);
          if (phoneKey && !existingByPhone.has(phoneKey)) existingByPhone.set(phoneKey, customer);
        }
      }

      let created = 0;
      let updated = 0;
      let failed = 0;
      const rowErrors = [];

      for (const item of validRows) {
        const row = item.customer;
        const nameKey = normalizeCustomerNameKey(row.name);
        const phoneKey = normalizeCustomerPhoneKey(row.phone);

        try {
          let existingCustomer = null;
          if (updateExistingOnImport) {
            if (phoneKey) existingCustomer = existingByPhone.get(phoneKey) || null;
            if (!existingCustomer && nameKey) existingCustomer = existingByName.get(nameKey) || null;
          }

          if (existingCustomer) {
            const updatePayload = {
              name: row.name || existingCustomer.name || '',
              phone: row.phone || existingCustomer.phone || '',
              phone2: row.phone2 || existingCustomer.phone2 || '',
              address: row.address || existingCustomer.address || '',
              city: row.city || existingCustomer.city || '',
              district: row.district || existingCustomer.district || '',
              notes: row.notes || existingCustomer.notes || '',
              creditLimit: row.creditLimit ?? existingCustomer.creditLimit ?? 0,
              customerType: row.customerType || existingCustomer.customerType || 'عادي',
              ...(Number.isFinite(row.balance)
                ? { balance: row.balance }
                : {})
            };
            const updateResult = await window.api.updateCustomer(existingCustomer.id, updatePayload);
            if (updateResult?.error) throw new Error(updateResult.error);

            updated += 1;
            const mergedCustomer = { ...existingCustomer, ...updatePayload };
            const mergedNameKey = normalizeCustomerNameKey(mergedCustomer.name);
            const mergedPhoneKey = normalizeCustomerPhoneKey(mergedCustomer.phone);
            if (mergedNameKey) existingByName.set(mergedNameKey, mergedCustomer);
            if (mergedPhoneKey) existingByPhone.set(mergedPhoneKey, mergedCustomer);
          } else {
            const addResult = await window.api.addCustomer({
              ...row,
              customerType: row.customerType || 'عادي'
            });
            if (addResult?.error) throw new Error(addResult.error);

            created += 1;
            const inserted = { ...row, ...(addResult || {}) };
            const insertedNameKey = normalizeCustomerNameKey(inserted.name);
            const insertedPhoneKey = normalizeCustomerPhoneKey(inserted.phone);
            if (insertedNameKey) existingByName.set(insertedNameKey, inserted);
            if (insertedPhoneKey) existingByPhone.set(insertedPhoneKey, inserted);
          }
        } catch (rowError) {
          failed += 1;
          if (rowErrors.length < 10) {
            rowErrors.push(`صف ${item.sourceIndex}: ${rowError?.message || 'خطأ غير متوقع'}`);
          }
        }
      }

      await loadAllCustomers();
      setCustomerImportSession(null);

      await safeAlert(
        `نتيجة الاستيراد:\nجديد: ${created}\nتم تحديثه: ${updated}\nتم تجاهله (بدون اسم): ${skipped}\nفشل: ${failed}`,
        null,
        {
          type: failed > 0 ? 'warning' : 'success',
          title: 'استيراد العملاء',
          detail: rowErrors.length ? rowErrors.join('\n') : undefined
        }
      );
    } catch (error) {
      await safeAlert(error?.message || 'تعذر استيراد العملاء', null, {
        type: 'error',
        title: 'استيراد العملاء'
      });
    } finally {
      setImportingCustomers(false);
    }
  }, [customerImportSession, importingCustomers, updateExistingOnImport, allCustomers, loadAllCustomers]);

  const closeProductImportSession = useCallback(() => {
    if (importingProducts) return;
    setProductImportSession(null);
  }, [importingProducts]);

  const updateProductImportFieldMapping = useCallback((fieldKey, columnId) => {
    setProductImportSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        mapping: {
          ...prev.mapping,
          [fieldKey]: columnId
        }
      };
    });
  }, []);

  const applyProductImportAutoMapping = useCallback(() => {
    setProductImportSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        mapping: buildImportFieldAutoMapping(prev.headers)
      };
    });
  }, []);

  const parseDelimitedProductRows = useCallback((rawText) => {
    const lines = String(rawText || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) throw new Error('الملف لا يحتوي على بيانات كافية');

    const delim = detectDelimitedImportHeaderLine(lines, detectProductImportDelimiter);
    const parsedLines = lines.map((line) => parseProductImportLine(line, delim));
    const headerInfo = findImportHeaderRow(
      parsedLines,
      toProductImportHeaders,
      buildImportFieldAutoMapping,
      IMPORT_FIELD_OPTIONS
    );
    if (!headerInfo) throw new Error('تعذر قراءة الأعمدة من الملف');

    const headers = headerInfo.headers;
    const rows = parsedLines
      .slice(headerInfo.index + 1)
      .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));

    if (!headers.length) throw new Error('تعذر قراءة الأعمدة من الملف');
    if (!rows.length) throw new Error('الملف لا يحتوي على صفوف بيانات');

    return { headers, rows, dataStartRowIndex: headerInfo.index + 2 };
  }, []);

  const parseWorkbookProductRows = useCallback(async (file) => {
    const xlsxModule = await import('xlsx');
    const XLSX = xlsxModule?.default || xlsxModule;

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, {
      type: 'array',
      cellDates: false
    });

    const firstSheetName = workbook?.SheetNames?.[0];
    if (!firstSheetName) throw new Error('ملف Excel لا يحتوي على أي ورقة بيانات');

    const sheet = workbook.Sheets[firstSheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: false
    });

    const rows = Array.isArray(matrix) ? matrix : [];
    const hasAnyValue = (row) => (
      Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== '')
    );
    const firstNonEmptyIndex = rows.findIndex(hasAnyValue);

    if (firstNonEmptyIndex === -1) throw new Error('ورقة Excel فارغة');

    const headerInfo = findImportHeaderRow(
      rows,
      toProductImportHeaders,
      buildImportFieldAutoMapping,
      IMPORT_FIELD_OPTIONS
    );
    if (!headerInfo) throw new Error('تعذر قراءة أعمدة ملف Excel');

    const dataRows = rows
      .slice(headerInfo.index + 1)
      .map((row) => (Array.isArray(row) ? row : []))
      .filter(hasAnyValue);

    const headers = headerInfo.headers;
    if (!headers.length) throw new Error('تعذر قراءة أعمدة ملف Excel');
    if (!dataRows.length) throw new Error('ورقة Excel لا تحتوي على بيانات');

    return {
      headers,
      rows: dataRows,
      sheetName: firstSheetName,
      dataStartRowIndex: headerInfo.index + 2
    };
  }, []);

  const importProductsFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const fileName = String(file.name || '').toLowerCase();
      let parsed = null;

      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        parsed = await parseWorkbookProductRows(file);
      } else if (fileName.endsWith('.csv') || fileName.endsWith('.tsv') || fileName.endsWith('.txt')) {
        parsed = parseDelimitedProductRows(await file.text());
      } else {
        throw new Error('صيغة الملف غير مدعومة. استخدم Excel أو CSV أو TSV');
      }

      setProductImportSession({
        fileName: file.name,
        headers: parsed.headers,
        rows: parsed.rows,
        sheetName: parsed.sheetName || null,
        dataStartRowIndex: parsed.dataStartRowIndex || 2,
        mapping: buildImportFieldAutoMapping(parsed.headers)
      });
    } catch (err) {
      await safeAlert(err?.message || 'تعذر قراءة ملف المنتجات', null, {
        type: 'error',
        title: 'استيراد المنتجات'
      });
    }
  };

  const downloadProductImportTemplate = () => {
    const headers = [
      'name',
      'category',
      'brand',
      'sku',
      'barcode',
      'description',
      'salePrice',
      'costPrice',
      'totalQuantity',
      'minStock',
      'size',
      'color',
      'variantBarcode',
      'variantPrice',
      'variantCost',
      'variantQty'
    ];

    const rows = [
      headers.join(','),
      [
        'منتج تجريبي',
        'تصنيف عام',
        'علامة 1',
        'SKU-001',
        '1234567890123',
        'وصف اختياري',
        '150',
        '100',
        '25',
        '5',
        '',
        '',
        '',
        '',
        '',
        ''
      ].join(','),
      [
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'XL',
        'أسود',
        '1234567890456',
        '155',
        '102',
        '8'
      ].join(',')
    ];

    const blob = new Blob([`\uFEFF${rows.join('\r\n')}`], {
      type: 'text/csv;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'products-import-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const ensureImportedCategory = useCallback(async (name, categoryMap) => {
    const key = nText(name).toLowerCase();
    if (!key) return null;
    if (categoryMap.has(key)) return categoryMap.get(key).id;

    const add = await window.api.addCategory({
      name: nText(name),
      description: null,
      color: '#0f766e',
      icon: '🧵'
    });
    if (add?.error) throw new Error(add.error);
    categoryMap.set(key, add);
    return add.id;
  }, []);

  const importProductGroupsIntoDatabase = useCallback(async (groups) => {
    const allRes = await window.api.getProducts({
      page: 1,
      pageSize: 5000,
      includeTotal: false,
      includeDescription: false,
      includeImage: false,
      includeCategory: false,
      includeInventory: false,
      includeVariants: true
    });
    if (allRes?.error) throw new Error(allRes.error);
    const all = Array.isArray(allRes?.data) ? allRes.data : [];
    const bySku = new Map();
    all.forEach((product) => {
      const key = nText(product?.sku).toLowerCase();
      if (key && !bySku.has(key)) bySku.set(key, product);
    });

    const categoriesRes = await window.api.getCategories();
    if (categoriesRes?.error) throw new Error(categoriesRes.error);
    const categories = Array.isArray(categoriesRes) ? categoriesRes : [];
    const categoryMap = new Map();
    categories.forEach((category) => {
      const key = nText(category?.name).toLowerCase();
      if (key && !categoryMap.has(key)) categoryMap.set(key, category);
    });

    let created = 0;
    let updated = 0;
    let addVariants = 0;
    let updateVariants = 0;
    let failed = 0;
    const rowErrors = [];

    for (const group of groups) {
      try {
        const categoryId = await ensureImportedCategory(group.product.category, categoryMap);
        const payload = {
          name: group.product.name,
          description: group.product.description || null,
          categoryId,
          brand: group.product.brand || null,
          sku: group.product.sku || null,
          barcode: group.product.barcode || null,
          image: group.product.image || null,
          basePrice: nNum(group.product.basePrice, 0),
          cost: nNum(group.product.cost, 0),
          hasVariants: Array.isArray(group.variants) && group.variants.length > 0
        };

        const skuKey = nText(payload.sku).toLowerCase();
        const current = skuKey ? bySku.get(skuKey) : null;
        let productId = current?.id || 0;
        const knownVariants = Array.isArray(current?.variants) ? [...current.variants] : [];

        if (current) {
          const updateProductResult = await window.api.updateProduct(current.id, payload);
          if (updateProductResult?.error) throw new Error(updateProductResult.error);
          updated += 1;
        } else {
          const addProductResult = await window.api.addProduct(payload);
          if (addProductResult?.error) throw new Error(addProductResult.error);
          productId = addProductResult.id;
          created += 1;
        }

        for (const variant of group.variants) {
          const barcodeKey = nText(variant.barcode).toLowerCase();
          const foundVariant = knownVariants.find((item) => {
            if (barcodeKey && nText(item?.barcode).toLowerCase() === barcodeKey) return true;
            return (
              nText(item?.productSize).toLowerCase() === nText(variant.size).toLowerCase()
              && nText(item?.color).toLowerCase() === nText(variant.color).toLowerCase()
            );
          });

          const variantPayload = {
            productId,
            size: variant.size,
            color: variant.color,
            price: nNum(variant.price, payload.basePrice),
            cost: nNum(variant.cost, payload.cost),
            quantity: nInt(variant.quantity, 0),
            barcode: nText(variant.barcode) || null
          };

          if (foundVariant) {
            const updateVariantResult = await window.api.updateVariant(foundVariant.id, variantPayload);
            if (updateVariantResult?.error) throw new Error(updateVariantResult.error);
            foundVariant.productSize = variantPayload.size;
            foundVariant.color = variantPayload.color;
            foundVariant.price = variantPayload.price;
            foundVariant.cost = variantPayload.cost;
            foundVariant.quantity = variantPayload.quantity;
            foundVariant.barcode = variantPayload.barcode;
            updateVariants += 1;
          } else {
            const addVariantResult = await window.api.addVariant(variantPayload);
            if (addVariantResult?.error) throw new Error(addVariantResult.error);
            knownVariants.push({
              id: addVariantResult.id,
              productSize: variantPayload.size,
              color: variantPayload.color,
              price: variantPayload.price,
              cost: variantPayload.cost,
              quantity: variantPayload.quantity,
              barcode: variantPayload.barcode
            });
            addVariants += 1;
          }
        }

        const variantsTotal = group.variants.reduce((sum, variant) => sum + nInt(variant.quantity, 0), 0);
        const importedTotal = Math.max(
          0,
          nInt(group.inventory.totalQuantity, nInt(group.inventory.warehouseQty, 0) + nInt(group.inventory.displayQty, 0))
        );
        const totalQuantity = Math.max(variantsTotal, importedTotal);
        const inventoryResult = await window.api.updateInventory(productId, {
          minStock: nInt(group.inventory.minStock, 5),
          maxStock: nInt(group.inventory.maxStock, 100),
          warehouseQty: totalQuantity,
          displayQty: 0,
          totalQuantity,
          notes: group.inventory.notes || null,
          lastRestock: new Date().toISOString()
        });
        if (inventoryResult?.error) throw new Error(inventoryResult.error);

        if (skuKey) {
          bySku.set(skuKey, {
            ...(current || {}),
            ...payload,
            id: productId,
            variants: knownVariants
          });
        }
      } catch (error) {
        failed += 1;
        if (rowErrors.length < 10) {
          rowErrors.push(`${nText(group?.product?.name) || 'منتج بدون اسم'}: ${error?.message || 'خطأ غير متوقع'}`);
        }
      }
    }

    return {
      created,
      updated,
      addVariants,
      updateVariants,
      failed,
      rowErrors
    };
  }, [ensureImportedCategory]);

  const startProductImport = useCallback(async () => {
    if (!productImportSession || importingProducts) return;

    if (!productImportSession.mapping?.name) {
      await safeAlert('اختَر عمود "اسم المنتج" قبل بدء الاستيراد', null, {
        type: 'warning',
        title: 'مطابقة الأعمدة'
      });
      return;
    }

    setImportingProducts(true);
    try {
      const mappedRows = mapRowsWithImportMapping(
        productImportSession.rows,
        productImportSession.mapping
      ).map((mapped, index) => ({
        ...mapped,
        sourceIndex: getRowStartIndex(index, productImportSession)
      }));

      const validRows = mappedRows.filter((row) => (
        Object.entries(row).some(([key, value]) => key !== 'sourceIndex' && nText(value) !== '')
        && !isMappedImportHeaderRow(row, IMPORT_FIELD_OPTIONS)
        && !isIgnorableProductImportRow(row)
      ));
      if (!validRows.length) {
        throw new Error('لم يتم العثور على صفوف صالحة للاستيراد');
      }

      const groups = importGroups(validRows);
      if (!groups.length) {
        throw new Error('لم يتم العثور على صفوف صالحة بعد تطبيق المطابقة');
      }

      const result = await importProductGroupsIntoDatabase(groups);
      setProductImportSession(null);

      await safeAlert(
        `نتيجة الاستيراد:\nجديد: ${result.created}\nتم تحديثه: ${result.updated}\nمتغيرات مضافة: ${result.addVariants}\nمتغيرات محدثة: ${result.updateVariants}\nفشل: ${result.failed}`,
        null,
        {
          type: result.failed > 0 ? 'warning' : 'success',
          title: 'استيراد المنتجات',
          detail: result.rowErrors.length ? result.rowErrors.join('\n') : undefined
        }
      );
    } catch (error) {
      await safeAlert(error?.message || 'تعذر استيراد المنتجات', null, {
        type: 'error',
        title: 'استيراد المنتجات'
      });
    } finally {
      setImportingProducts(false);
    }
  }, [productImportSession, importingProducts, importProductGroupsIntoDatabase]);

  return (
    <div className="settings-page">

      <div className="settings-layout">
        {/* Sidebar Navigation */}
        <aside className="settings-sidebar">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`settings-nav-item ${activeTab === tab.id ? 'is-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              <span className="settings-nav-label">{tab.label}</span>
            </button>
          ))}
        </aside>

        {/* Content Area */}
        <main className="settings-content">
          {activeTab === 'basic' && (
            <section className="settings-card settings-basic-card">
              <h2><SettingsIcon className="w-5 h-5" /> الإعدادات العامة</h2>

              <div className="settings-form-group">
                <label htmlFor="companyName" className="settings-form-label">
                  اسم الشركة
                </label>
                <input
                  id="companyName"
                  type="text"
                  className="settings-input"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="مثال: شركة النور للتجارة"
                  maxLength={120}
                  disabled={savingBasicSettings}
                />
              </div>

              <div className="settings-form-group">
                <label htmlFor="companyContactNumbers" className="settings-form-label">
                  أرقام التواصل
                </label>
                <textarea
                  id="companyContactNumbers"
                  className="settings-textarea"
                  value={companyContactNumbers}
                  onChange={(event) => setCompanyContactNumbers(event.target.value)}
                  placeholder="مثال: 01000000000, 0222222222"
                  rows={3}
                  maxLength={500}
                  disabled={savingBasicSettings}
                />
                <small className="settings-form-help">
                  يمكنك كتابة أكثر من رقم، وافصل بينها بفاصلة أو سطر جديد.
                </small>
              </div>

              <div className="settings-form-group">
                <label htmlFor="companyAddress" className="settings-form-label">
                  عنوان الشركة
                </label>
                <textarea
                  id="companyAddress"
                  className="settings-textarea"
                  value={companyAddress}
                  onChange={(event) => setCompanyAddress(event.target.value)}
                  placeholder="مثال: القاهرة - مدينة نصر - شارع ..."
                  rows={2}
                  maxLength={250}
                  disabled={savingBasicSettings}
                />
              </div>

              {loadingBusinessProfile ? (
                <small className="settings-form-help">جاري تحميل بيانات النشاط المحفوظة على هذا الجهاز...</small>
              ) : null}

              <div className="settings-actions">
                <button
                  type="button"
                  onClick={saveBasicSettings}
                  className="settings-btn settings-btn-primary"
                  disabled={savingBasicSettings}
                >
                  {savingBasicSettings ? 'جاري الحفظ...' : 'حفظ الإعدادات العامة'}
                </button>
                <button
                  type="button"
                  onClick={openLicenseManager}
                  className="settings-btn settings-btn-secondary"
                  disabled={savingBasicSettings}
                >
                  <ShieldCheck size={18} />
                  {' '}
                  إدارة الترخيص
                </button>
                <button
                  type="button"
                  onClick={handleCheckForUpdate}
                  className="settings-btn settings-btn-secondary"
                  disabled={savingBasicSettings || checkingUpdate}
                >
                  <Upload size={18} />
                  {' '}
                  {checkingUpdate ? 'جاري البحث...' : 'البحث عن تحديثات'}
                </button>
              </div>
            </section>
          )}

          {activeTab === 'database' && (
            <section className="settings-card settings-database-card">
              <h2><Database className="w-5 h-5" /> قاعدة البيانات</h2>
              <p className="settings-hint">
                اعرض الاتصال الحالي، ثم بدّل بين قاعدة البيانات المحلية على هذا الجهاز أو اتصال مخصص بقاعدة أخرى.
              </p>

              {loadingBusinessProfile ? (
                <div className="settings-empty">جاري تحميل حالة قاعدة البيانات الحالية...</div>
              ) : (
                <>
                  <p className="settings-section-title">الحالة الحالية</p>

                  <div className="settings-status-grid">
                    <div className="settings-status-card">
                      <span className="settings-status-label">وضع الاتصال</span>
                      <strong className="settings-status-value">{currentDatabaseModeLabel}</strong>
                    </div>
                    <div className="settings-status-card">
                      <span className="settings-status-label">الخادم / المنفذ</span>
                      <strong className="settings-status-value" dir="ltr">{currentDatabaseEndpoint}</strong>
                    </div>
                    <div className="settings-status-card">
                      <span className="settings-status-label">اسم القاعدة</span>
                      <strong className="settings-status-value" dir="ltr">
                        {currentDatabase?.databaseName || 'غير محدد'}
                      </strong>
                    </div>
                    <div className="settings-status-card">
                      <span className="settings-status-label">المستخدم</span>
                      <strong className="settings-status-value" dir="ltr">
                        {currentDatabase?.appUser || 'غير محدد'}
                      </strong>
                    </div>
                  </div>

                  {currentDatabase?.error ? (
                    <div className="settings-warning-box">
                      <strong>آخر خطأ في الاتصال:</strong>
                      {' '}
                      {currentDatabase.error}
                    </div>
                  ) : null}

                  {databaseTestResult ? (
                    <div className={`settings-info-box ${databaseTestResult.success ? 'is-success' : 'is-error'}`}>
                      <strong>{databaseTestResult.success ? 'نتيجة آخر اختبار:' : 'فشل آخر اختبار:'}</strong>
                      {' '}
                      {databaseTestResult.message || (databaseTestResult.success ? 'تم بنجاح.' : 'تعذر الاتصال.')}
                      {databaseTestResult.details ? (
                        <>
                          <br />
                          <span dir="ltr">{databaseTestResult.details}</span>
                        </>
                      ) : null}
                    </div>
                  ) : null}

                  <hr className="settings-section-divider" />
                  <p className="settings-section-title">تغيير الاتصال</p>

                  <div className="settings-mode-grid">
                    <button
                      type="button"
                      className={`settings-mode-card ${!databaseFormIsRemote ? 'is-active' : ''}`}
                      onClick={() => updateDatabaseFormField('databaseMode', 'local_server')}
                      disabled={databaseSettingsBusy}
                    >
                      <strong>القاعدة المحلية</strong>
                      <span>استخدم PostgreSQL الموجود على هذا الجهاز، ودع البرنامج يجهزه تلقائيًا عند الحاجة.</span>
                    </button>
                    <button
                      type="button"
                      className={`settings-mode-card ${databaseFormIsRemote ? 'is-active' : ''}`}
                      onClick={() => updateDatabaseFormField('databaseMode', 'remote_client')}
                      disabled={databaseSettingsBusy}
                    >
                      <strong>اتصال مخصص</strong>
                      <span>اتصل بقاعدة بيانات أخرى عن طريق عنوان الخادم واسم القاعدة وبيانات الدخول.</span>
                    </button>
                  </div>

                  {databaseFormIsRemote ? (
                    <>
                      <div className="settings-config-grid">
                        <label className="settings-config-field">
                          <span>عنوان الخادم أو IP</span>
                          <input
                            type="text"
                            value={databaseForm.dbHost}
                            onChange={(event) => updateDatabaseFormField('dbHost', event.target.value)}
                            placeholder="192.168.1.10 أو localhost"
                            disabled={databaseSettingsBusy}
                            dir="ltr"
                          />
                        </label>
                        <label className="settings-config-field">
                          <span>المنفذ</span>
                          <input
                            type="number"
                            min="1"
                            max="65535"
                            value={databaseForm.dbPort}
                            onChange={(event) => updateDatabaseFormField('dbPort', event.target.value)}
                            placeholder="5433"
                            disabled={databaseSettingsBusy}
                            dir="ltr"
                          />
                        </label>
                        <label className="settings-config-field">
                          <span>اسم قاعدة البيانات</span>
                          <input
                            type="text"
                            value={databaseForm.dbName}
                            onChange={(event) => updateDatabaseFormField('dbName', event.target.value)}
                            placeholder="sales_manager_db"
                            disabled={databaseSettingsBusy}
                            dir="ltr"
                          />
                        </label>
                        <label className="settings-config-field">
                          <span>اسم المستخدم</span>
                          <input
                            type="text"
                            value={databaseForm.dbUsername}
                            onChange={(event) => updateDatabaseFormField('dbUsername', event.target.value)}
                            placeholder="postgres أو sales_user"
                            disabled={databaseSettingsBusy}
                            dir="ltr"
                          />
                        </label>
                        <label className="settings-config-field">
                          <span>كلمة المرور</span>
                          <input
                            type="password"
                            value={databaseForm.dbPassword}
                            onChange={(event) => updateDatabaseFormField('dbPassword', event.target.value)}
                            placeholder="كلمة مرور قاعدة البيانات"
                            disabled={databaseSettingsBusy}
                            dir="ltr"
                          />
                        </label>
                      </div>

                      <small className="settings-form-help">
                        يمكنك إدخال <span dir="ltr">localhost</span> إذا كانت القاعدة الأخرى على نفس الجهاز لكن ببيانات اتصال مختلفة.
                      </small>
                    </>
                  ) : (
                    <div className="settings-path-box">
                      <span className="settings-path-label">استخدام القاعدة المحلية</span>
                      <strong className="settings-path-value">
                        سيعيد البرنامج الاتصال بقاعدة PostgreSQL المحلية الخاصة بهذا الجهاز، وسيكمل التهيئة تلقائيًا إن كانت غير جاهزة.
                      </strong>
                    </div>
                  )}

                  <div className="settings-actions">
                    <button
                      type="button"
                      onClick={testDatabaseConnectionForm}
                      className="settings-btn settings-btn-secondary"
                      disabled={databaseSettingsBusy}
                    >
                      {testingDatabaseConnection ? 'جاري الاختبار...' : 'اختبار الاتصال'}
                    </button>
                    <button
                      type="button"
                      onClick={saveDatabaseConnectionForm}
                      className="settings-btn settings-btn-primary"
                      disabled={databaseSettingsBusy}
                    >
                      {savingDatabaseConnection ? 'جاري تطبيق الاتصال...' : 'تطبيق الاتصال'}
                    </button>
                    <button
                      type="button"
                      onClick={resetDatabaseConnectionForm}
                      className="settings-btn settings-btn-danger"
                      disabled={databaseSettingsBusy}
                    >
                      {resettingDatabaseConnection ? 'جاري إعادة الضبط...' : 'إعادة ضبط الاتصال'}
                    </button>
                    {!isRemoteDatabaseClient && (
                      <button
                        type="button"
                        onClick={async () => {
                          const confirmed = await safeConfirm(
                            '⚠️ تحذير شديد الخطورة: سيتم حذف قاعدة البيانات المحلية بالكامل وكل البيانات المسجلة فيها والبدء من جديد. هل أنت متأكد تماماً من هذه العملية؟',
                            'مسح شامل لقاعدة البيانات'
                          );
                          if (confirmed) {
                            setResettingDatabaseConnection(true);
                            try {
                              const res = await window.api.forceResetLocalDatabase();
                              if (res.success) {
                                await safeAlert('تم مسح وإعادة إنشاء قاعدة البيانات بنجاح. سيتم الآن إعادة تحميل النظام لتطبيق التغييرات.', null, { type: 'success', title: 'نجاح العملية' });
                                window.location.reload();
                              } else {
                                await safeAlert(res.error || 'حدث خطأ أثناء محاولة مسح قاعدة البيانات.', null, { type: 'error', title: 'فشل العملية' });
                              }
                            } catch (err) {
                              await safeAlert(err.message, null, { type: 'error', title: 'خطأ تقني' });
                            } finally {
                              setResettingDatabaseConnection(false);
                            }
                          }
                        }}
                        className="settings-btn settings-btn-danger"
                        disabled={databaseSettingsBusy}
                        style={{ background: '#b91c1c', borderColor: '#991b1b', marginTop: '10px' }}
                      >
                        {resettingDatabaseConnection ? 'جاري المسح...' : '🗑️ مسح شامل وإعادة إنشاء القاعدة'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </section>
          )}

          {activeTab === 'print' && (
            <section className="settings-card settings-print-card">
              <h2><Printer className="w-5 h-5" /> إعدادات الطباعة</h2>
              <p className="settings-hint">
                اضبط مقاسات الطباعة العامة والطابعة الافتراضية، وحدد الإعدادات الافتراضية التي يبدأ بها استوديو
                الباركود عند فتحه.
              </p>

              <div className="settings-print-summary" style={{ marginBottom: '24px' }}>
                <div className="settings-print-summary-item">
                  <span>فاتورة البيع</span>
                  <strong>{defaultInvoicePrintLayout === 'receipt80' ? 'ريسيت 80mm' : defaultInvoicePrintLayout.toUpperCase()}</strong>
                </div>
                <div className="settings-print-summary-item">
                  <span>قالب الريسيت</span>
                  <strong>
                    {defaultReceipt80Template === 'professional'
                      ? 'احترافي'
                      : defaultReceipt80Template === 'modern'
                        ? 'عصري'
                        : defaultReceipt80Template === 'classic'
                          ? 'كلاسيكي'
                          : 'احترافي'}
                  </strong>
                </div>
                <div className="settings-print-summary-item">
                  <span>طابعة الفواتير</span>
                  <strong>{defaultPrinterName || 'طابعة النظام'}</strong>
                </div>
                <div className="settings-print-summary-item">
                  <span>طابعة الباركود</span>
                  <strong>{defaultBarcodePrinterName || defaultPrinterName || 'طابعة النظام'}</strong>
                </div>
              </div>

              {/* === Group 1: Printers === */}
              <div className="settings-sub-card">
                <p className="settings-sub-card-title">1. الطابعات الافتراضية</p>
                <div className="settings-config-grid">
                  <label className="settings-config-field">
                    <span>طابعة الفواتير والإيصالات</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select
                        className="settings-select"
                        value={defaultPrinterName}
                        onChange={(event) => setDefaultPrinterName(event.target.value)}
                        disabled={savingPrintSettings || loadingPrinters}
                        style={{ flex: 1 }}
                      >
                        <option value="">استخدام طابعة النظام الافتراضية</option>
                        {printers.map((printer) => {
                          const printerName = String(printer?.name || '').trim();
                          if (!printerName) return null;
                          const printerLabel = printer?.displayName || printerName;
                          return (
                            <option key={`invoice-${printerName}`} value={printerName}>
                              {printerLabel}
                              {printer?.isDefault ? ' (افتراضي النظام)' : ''}
                            </option>
                          );
                        })}
                      </select>
                      <button
                        type="button"
                        onClick={loadPrinters}
                        className="settings-btn settings-btn-secondary"
                        disabled={loadingPrinters || savingPrintSettings}
                        style={{ padding: '0 16px', height: '42px', flexShrink: 0 }}
                        title="تحديث قائمة الطابعات"
                      >
                        🔄
                      </button>
                    </div>
                  </label>

                  <label className="settings-config-field">
                    <span>طابعة ملصقات الباركود</span>
                    <select
                      className="settings-select"
                      value={defaultBarcodePrinterName}
                      onChange={(event) => setDefaultBarcodePrinterName(event.target.value)}
                      disabled={savingPrintSettings || loadingPrinters}
                    >
                      <option value="">استخدام طابعة الفواتير الافتراضية</option>
                      {printers.map((printer) => {
                        const printerName = String(printer?.name || '').trim();
                        if (!printerName) return null;
                        const printerLabel = printer?.displayName || printerName;
                        return (
                          <option key={`barcode-${printerName}`} value={printerName}>
                            {printerLabel}
                            {printer?.isDefault ? ' (افتراضي النظام)' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                </div>
              </div>

              {/* === Group 2: Default Paper Sizes === */}
              <div className="settings-sub-card">
                <p className="settings-sub-card-title">2. المقاسات الافتراضية للطباعة</p>
                <div className="settings-config-grid">
                  <label className="settings-config-field">
                    <span>فاتورة البيع</span>
                    <select
                      className="settings-select"
                      value={defaultInvoicePrintLayout}
                      onChange={(event) => setDefaultInvoicePrintLayout(event.target.value)}
                    >
                      <option value="receipt80">ريسيت 80mm</option>
                      <option value="a4">A4</option>
                      <option value="a5">A5</option>
                    </select>
                  </label>

                  <label className="settings-config-field">
                    <span>فاتورة الشراء</span>
                    <select
                      className="settings-select"
                      value={defaultPurchaseInvoicePrintLayout}
                      onChange={(event) => setDefaultPurchaseInvoicePrintLayout(event.target.value)}
                    >
                      <option value="receipt80">ريسيت 80mm</option>
                      <option value="a4">A4</option>
                      <option value="a5">A5</option>
                    </select>
                  </label>

                  <label className="settings-config-field">
                    <span>إيصالات الدفع (سند القبض)</span>
                    <select
                      className="settings-select"
                      value={defaultPaymentReceiptPrintLayout}
                      onChange={(event) => setDefaultPaymentReceiptPrintLayout(event.target.value)}
                    >
                      <option value="receipt80">ريسيت 80mm</option>
                      <option value="a4">A4</option>
                      <option value="a5">A5</option>
                    </select>
                  </label>

                  <label className="settings-config-field">
                    <span>مرتجعات المبيعات</span>
                    <select
                      className="settings-select"
                      value={defaultSaleReturnPrintLayout}
                      onChange={(event) => setDefaultSaleReturnPrintLayout(event.target.value)}
                    >
                      <option value="receipt80">ريسيت 80mm</option>
                      <option value="a4">A4</option>
                      <option value="a5">A5</option>
                    </select>
                  </label>

                  <label className="settings-config-field">
                    <span>مرتجعات المشتريات</span>
                    <select
                      className="settings-select"
                      value={defaultPurchaseReturnPrintLayout}
                      onChange={(event) => setDefaultPurchaseReturnPrintLayout(event.target.value)}
                    >
                      <option value="receipt80">ريسيت 80mm</option>
                      <option value="a4">A4</option>
                      <option value="a5">A5</option>
                    </select>
                  </label>
                </div>
              </div>

              {/* === Group 3: Template Designs === */}
              <div className="settings-sub-card">
                <p className="settings-sub-card-title">3. المظهر والتصميم الفني للقوالب</p>
                <div className="settings-config-grid" style={{ alignItems: 'flex-start' }}>
                  
                  {/* Invoices Column */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ margin: '0 0 -5px', fontSize: '1rem', color: 'var(--settings-brand-strong)' }}>قوالب الفواتير</h4>
                    <label className="settings-config-field">
                      <span>تصميم الريسيت 80mm</span>
                      <select
                        className="settings-select"
                        value={defaultReceipt80Template}
                        onChange={(event) => setDefaultReceipt80Template(event.target.value)}
                      >
                        <option value="professional">احترافي (Professional)</option>
                        <option value="modern">عصري (Modern)</option>
                        <option value="classic">كلاسيكي (Classic)</option>
                      </select>
                    </label>

                    <label className="settings-config-field">
                      <span>تصميم مقاس A4</span>
                      <select
                        className="settings-select"
                        value={defaultA4Template}
                        onChange={(event) => setDefaultA4Template(event.target.value)}
                      >
                        <option value="professional">احترافي (Professional)</option>
                        <option value="modern">عصري (Modern)</option>
                        <option value="classic">كلاسيكي (Classic)</option>
                      </select>
                    </label>

                    <label className="settings-config-field">
                      <span>تصميم مقاس A5</span>
                      <select
                        className="settings-select"
                        value={defaultA5Template}
                        onChange={(event) => setDefaultA5Template(event.target.value)}
                      >
                        <option value="professional">احترافي (Professional)</option>
                        <option value="modern">عصري (Modern)</option>
                        <option value="classic">كلاسيكي (Classic)</option>
                      </select>
                    </label>
                  </div>

                  {/* Vouchers Column */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ margin: '0 0 -5px', fontSize: '1rem', color: 'var(--settings-brand-strong)' }}>قوالب أذونات الدفع</h4>
                    <label className="settings-config-field">
                      <span>تصميم إذن الدفع 80mm</span>
                      <select
                        className="settings-select"
                        value={defaultPaymentVoucher80Template}
                        onChange={(event) => setDefaultPaymentVoucher80Template(event.target.value)}
                      >
                        <option value="professional">احترافي (Professional)</option>
                        <option value="modern">عصري (Modern)</option>
                        <option value="classic">كلاسيكي (Classic)</option>
                      </select>
                    </label>

                    <label className="settings-config-field">
                      <span>تصميم إذن الدفع A4</span>
                      <select
                        className="settings-select"
                        value={defaultPaymentVoucherA4Template}
                        onChange={(event) => setDefaultPaymentVoucherA4Template(event.target.value)}
                      >
                        <option value="classic">كلاسيكي (Classic)</option>
                      </select>
                    </label>

                    <label className="settings-config-field">
                      <span>تصميم إذن الدفع A5</span>
                      <select
                        className="settings-select"
                        value={defaultPaymentVoucherA5Template}
                        onChange={(event) => setDefaultPaymentVoucherA5Template(event.target.value)}
                      >
                        <option value="classic">كلاسيكي (Classic)</option>
                      </select>
                    </label>
                  </div>

                </div>
              </div>

              <div className="settings-actions">
                <button
                  type="button"
                  onClick={savePrintSettings}
                  className="settings-btn settings-btn-primary"
                  disabled={savingPrintSettings}
                >
                  {savingPrintSettings ? 'جاري حفظ الإعدادات...' : 'حفظ إعدادات الطباعة'}
                </button>
              </div>
            </section>
          )}

          {activeTab === 'backup' && (
            <section className="settings-card settings-backup-card">
              <h2><ShieldCheck className="w-5 h-5" /> النسخ الاحتياطي والاسترجاع</h2>
              <p className="settings-hint">
                اضبط مكان حفظ النسخ، وجدولة النسخ التلقائي، وسياسة حذف النسخ القديمة. النسخ اليدوي يحفظ قاعدة
                البيانات وملف إعدادات النشاط معًا داخل نفس المجلد.
              </p>

              {isRemoteDatabaseClient ? (
                <div className="settings-warning-box">
                  <strong>النسخ الاحتياطي غير متاح من هذا الجهاز.</strong>
                  {' '}
                  هذا الجهاز يعمل كعميل متصل بقاعدة بيانات مشتركة{remoteDatabaseSummary ? ` على ${remoteDatabaseSummary}` : ''}. نفّذ النسخ والاسترجاع من جهاز السيرفر فقط.
                </div>
              ) : null}

              {loadingBackupSettings ? (
                <div className="settings-empty">جاري تحميل إعدادات النسخ الاحتياطي...</div>
              ) : (
                <>
                  <div className="settings-sub-tabs">
                    <button
                      type="button"
                      className={`settings-sub-tab-btn ${backupSubTab === 'primary' ? 'is-active' : ''}`}
                      onClick={() => setBackupSubTab('primary')}
                    >
                      الموقع الأساسي
                    </button>
                    <button
                      type="button"
                      className={`settings-sub-tab-btn ${backupSubTab === 'secondary' ? 'is-active' : ''}`}
                      onClick={() => setBackupSubTab('secondary')}
                    >
                      الموقع الإضافي
                    </button>
                  </div>

                  {backupSubTab === 'secondary' && (
                    <div className="settings-form-group" style={{ marginBottom: '30px' }}>
                      <label className="settings-check" style={{ width: '100%', padding: '16px', background: 'var(--settings-brand-soft)', borderColor: 'var(--settings-brand-border)' }}>
                        <input
                          type="checkbox"
                          checked={secondaryBackupSettings.enabled}
                          onChange={(event) => updateBackupSettingsField('enabled', event.target.checked)}
                          disabled={backupSettingsBusy}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <strong style={{ fontSize: '0.94rem', color: 'var(--settings-brand-text)' }}>تفعيل النسخ الاحتياطي في موقع ثانٍ</strong>
                          <small style={{ opacity: 0.7 }}>سيتم إنشاء نسخة إضافية في المسار المحدد أدناه بجدول زمني مستقل.</small>
                        </div>
                      </label>
                    </div>
                  )}

                  <div className="settings-form-group">
                    <span className="settings-form-label">مجلد حفظ النسخ {backupSubTab === 'secondary' ? '(الموقع الإضافي)' : ''}</span>
                    <div className="settings-path-box">
                      <span className="settings-path-label">
                        {hasCustomBackupDirectory ? 'مجلد مخصص' : 'المجلد الافتراضي'}
                      </span>
                      <strong className="settings-path-value" dir="ltr">
                        {effectiveBackupDirectoryPath || 'غير محدد'}
                      </strong>
                    </div>
                    <small className="settings-form-help">
                      {backupSubTab === 'secondary' 
                        ? 'اختر مجلدًا مختلفًا (مثلاً فلاشة أو هارد خارجي) لزيادة أمان البيانات.'
                        : 'سيتم استخدام هذا المسار للنسخ اليدوية والتلقائية بعد حفظ الإعدادات.'}
                      {backupSubTab === 'primary' && hasCustomBackupDirectory && defaultBackupDirectoryPath
                        ? ` المجلد الافتراضي للنظام: ${defaultBackupDirectoryPath}`
                        : ''}
                    </small>
                  </div>

                  <div className="settings-inline-controls">
                    <button
                      type="button"
                      onClick={pickBackupDirectory}
                      className="settings-btn settings-btn-secondary"
                      disabled={backupSettingsBusy || (backupSubTab === 'secondary' && !secondaryBackupSettings.enabled)}
                    >
                      اختيار مجلد
                    </button>
                    {backupSubTab === 'primary' && (
                      <button
                        type="button"
                        onClick={resetBackupDirectoryToDefault}
                        className="settings-btn settings-btn-secondary"
                        disabled={backupSettingsBusy || !hasCustomBackupDirectory}
                      >
                        العودة للافتراضي
                      </button>
                    )}
                  </div>

                  <hr className="settings-section-divider" />
                  <p className="settings-section-title">
                    النسخ التلقائي {backupSubTab === 'secondary' ? '(للموقع الإضافي)' : ''}
                  </p>

                  <div className="settings-check-grid">
                    {backupSubTab === 'primary' && (
                      <>
                        <label className="settings-check">
                          <input
                            type="checkbox"
                            checked={backupSettings.autoBackupOnOpen}
                            onChange={(event) => updateBackupSettingsField('autoBackupOnOpen', event.target.checked)}
                            disabled={backupSettingsBusy}
                          />
                          نسخ احتياطي عند فتح البرنامج
                        </label>
                        <label className="settings-check">
                          <input
                            type="checkbox"
                            checked={backupSettings.autoBackupOnClose}
                            onChange={(event) => updateBackupSettingsField('autoBackupOnClose', event.target.checked)}
                            disabled={backupSettingsBusy}
                          />
                          نسخ احتياطي عند غلق البرنامج
                        </label>
                      </>
                    )}
                    {backupSubTab === 'secondary' && (
                      <>
                        <label className="settings-check">
                          <input
                            type="checkbox"
                            checked={secondaryBackupSettings.autoBackupOnOpen}
                            onChange={(event) => updateBackupSettingsField('autoBackupOnOpen', event.target.checked)}
                            disabled={backupSettingsBusy || !secondaryBackupSettings.enabled}
                          />
                          نسخ احتياطي عند فتح البرنامج
                        </label>
                        <label className="settings-check">
                          <input
                            type="checkbox"
                            checked={secondaryBackupSettings.autoBackupOnClose}
                            onChange={(event) => updateBackupSettingsField('autoBackupOnClose', event.target.checked)}
                            disabled={backupSettingsBusy || !secondaryBackupSettings.enabled}
                          />
                          نسخ احتياطي عند غلق البرنامج
                        </label>
                      </>
                    )}
                    <label className="settings-check">
                      <input
                        type="checkbox"
                        checked={backupSubTab === 'secondary' ? secondaryBackupSettings.intervalEnabled : backupSettings.intervalEnabled}
                        onChange={(event) => updateBackupSettingsField('intervalEnabled', event.target.checked)}
                        disabled={backupSettingsBusy || (backupSubTab === 'secondary' && !secondaryBackupSettings.enabled)}
                      />
                      تشغيل نسخ دوري
                    </label>
                    <label className="settings-check">
                      <input
                        type="checkbox"
                        checked={backupSubTab === 'secondary' ? secondaryBackupSettings.retentionEnabled : backupSettings.retentionEnabled}
                        onChange={(event) => updateBackupSettingsField('retentionEnabled', event.target.checked)}
                        disabled={backupSettingsBusy || (backupSubTab === 'secondary' && !secondaryBackupSettings.enabled)}
                      />
                      حذف النسخ القديمة تلقائيًا
                    </label>
                  </div>

                  {(backupSubTab === 'secondary' ? secondaryBackupSettings.intervalEnabled : backupSettings.intervalEnabled) && (
                    <div className="settings-form-group">
                      <label htmlFor="backupIntervalValue" className="settings-form-label">
                        الفاصل الزمني للنسخ الدوري
                      </label>
                      <div className="settings-inline-controls">
                        <input
                          id="backupIntervalValue"
                          type="number"
                          min="1"
                          className="settings-input settings-inline-number"
                          value={backupSubTab === 'secondary' ? secondaryBackupSettings.intervalValue : backupSettings.intervalValue}
                          onChange={(event) => updateBackupSettingsField('intervalValue', event.target.value)}
                          disabled={backupSettingsBusy || (backupSubTab === 'secondary' && !secondaryBackupSettings.enabled)}
                        />
                        <select
                          className="settings-select"
                          value={backupSubTab === 'secondary' ? secondaryBackupSettings.intervalUnit : backupSettings.intervalUnit}
                          onChange={(event) => updateBackupSettingsField('intervalUnit', event.target.value)}
                          disabled={backupSettingsBusy || (backupSubTab === 'secondary' && !secondaryBackupSettings.enabled)}
                        >
                          {BACKUP_INTERVAL_UNITS.map((unit) => (
                            <option key={unit.value} value={unit.value}>
                              {unit.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <small className="settings-form-help">
                        سيُنشئ البرنامج نسخة تلقائية كل {backupSubTab === 'secondary' ? secondaryBackupSettings.intervalValue : backupSettings.intervalValue} {selectedBackupIntervalUnitLabel}.
                      </small>
                    </div>
                  )}

                  {(backupSubTab === 'secondary' ? secondaryBackupSettings.retentionEnabled : backupSettings.retentionEnabled) && (
                    <div className="settings-form-group">
                      <label htmlFor="backupRetentionDays" className="settings-form-label">
                        مدة الاحتفاظ بالنسخ
                      </label>
                      <div className="settings-inline-controls">
                        <input
                          id="backupRetentionDays"
                          type="number"
                          min="1"
                          className="settings-input settings-inline-number"
                          value={backupSubTab === 'secondary' ? secondaryBackupSettings.retentionDays : backupSettings.retentionDays}
                          onChange={(event) => updateBackupSettingsField('retentionDays', event.target.value)}
                          disabled={backupSettingsBusy || (backupSubTab === 'secondary' && !secondaryBackupSettings.enabled)}
                        />
                        <span className="settings-inline-suffix">يوم</span>
                      </div>
                      <small className="settings-form-help">
                        سيتم حذف النسخ المُدارة بواسطة النظام داخل هذا المجلد بعد تجاوز المدة المحددة.
                      </small>
                    </div>
                  )}

                  <hr className="settings-section-divider" />
                  <p className="settings-section-title">حالة آخر العمليات</p>

                  <div className="settings-status-grid">
                    <div className="settings-status-card">
                      <span className="settings-status-label">آخر نسخة</span>
                      <strong className="settings-status-value">{formatBackupDateTime(currentBackup.lastBackupAt)}</strong>
                    </div>
                    <div className="settings-status-card">
                      <span className="settings-status-label">سبب آخر نسخة</span>
                      <strong className="settings-status-value">{getBackupReasonLabel(currentBackup.lastBackupReason)}</strong>
                    </div>
                    <div className="settings-status-card">
                      <span className="settings-status-label">آخر تنظيف</span>
                      <strong className="settings-status-value">{formatBackupDateTime(currentBackup.lastCleanupAt)}</strong>
                    </div>
                    <div className="settings-status-card">
                      <span className="settings-status-label">عدد النسخ المحذوفة</span>
                      <strong className="settings-status-value">{currentBackup.lastCleanupDeletedCount}</strong>
                    </div>
                  </div>

                  <div className="settings-form-group">
                    <span className="settings-form-label">آخر ملف نسخة تم إنشاؤه</span>
                    <div className="settings-path-box">
                      <strong className="settings-path-value" dir="ltr">
                        {currentBackup.lastBackupPath || 'لا يوجد بعد'}
                      </strong>
                    </div>
                  </div>

                  {currentBackup.lastBackupError ? (
                    <div className="settings-warning-box">
                      <strong>آخر خطأ:</strong>
                      {' '}
                      {currentBackup.lastBackupError}
                    </div>
                  ) : null}

                  <div className="settings-actions">
                    <button
                      type="button"
                      onClick={saveBackupSettingsForm}
                      className="settings-btn settings-btn-primary"
                      disabled={backupSettingsBusy}
                    >
                      {savingBackupSettings ? 'جاري حفظ الإعدادات...' : 'حفظ إعدادات النسخ'}
                    </button>
                    <button
                      type="button"
                      onClick={runManualBackup}
                      className="settings-btn settings-btn-secondary"
                      disabled={backupSettingsBusy}
                    >
                      {backingUpDatabase ? 'جاري إنشاء النسخة...' : 'إنشاء نسخة الآن'}
                    </button>
                    <button
                      type="button"
                      onClick={restoreBackupIntoDatabase}
                      className="settings-btn settings-btn-secondary"
                      disabled={backupSettingsBusy}
                    >
                      {restoringDatabase ? 'جاري الاسترجاع...' : 'استرجاع نسخة'}
                    </button>
                  </div>

                  <small className="settings-form-help">
                    النسخ التلقائي يعتمد على الإعدادات المحفوظة فقط. إذا عدلت أي خيار هنا اضغط "حفظ إعدادات النسخ"
                    قبل إغلاق الشاشة.
                  </small>
                </>
              )}
            </section>
          )}

          {['salesInvoice', 'purchaseInvoice', 'salesReturn', 'purchaseReturn'].includes(activeTab) && (
            <section className="settings-card settings-invoice-card">
              <h2>
                {activeTab === 'salesInvoice' && <Store className="w-5 h-5" />}
                {activeTab === 'purchaseInvoice' && <ShoppingCart className="w-5 h-5" />}
                {activeTab === 'salesReturn' && <Undo2 className="w-5 h-5" />}
                {activeTab === 'purchaseReturn' && <RotateCcw className="w-5 h-5" />}
                {' '}
                {activeTab === 'salesInvoice' && 'فاتورة البيع'}
                {activeTab === 'purchaseInvoice' && 'فاتورة الشراء'}
                {activeTab === 'salesReturn' && 'مرتجع المبيعات'}
                {activeTab === 'purchaseReturn' && 'مرتجع المشتريات'}
              </h2>
              <p className="settings-hint">
                {activeTab === 'salesInvoice' && 'تُطبّق هذه القيم تلقائيًا عند فتح فاتورة بيع جديدة.'}
                {activeTab === 'purchaseInvoice' && 'تُطبّق هذه القيم تلقائيًا عند فتح فاتورة شراء جديدة.'}
                {activeTab === 'salesReturn' && 'هذه الإعدادات تحدد وضع البداية عند فتح شاشة مرتجع المبيعات.'}
                {activeTab === 'purchaseReturn' && 'هذه الإعدادات تحدد وضع البداية عند فتح شاشة مرتجع المشتريات.'}
              </p>

              {activeTab === 'salesInvoice' && (
                <>
                  <div className="settings-form-group">
                    <span className="settings-form-label">نوع البيع الافتراضي</span>
                    <div className="settings-segmented-control">
                      <label className="settings-segment">
                        <input
                          type="radio"
                          name="defaultSaleType"
                          value="نقدي"
                          checked={defaultSaleType === 'نقدي'}
                          onChange={(event) => setDefaultSaleType(event.target.value)}
                        />
                        <span>نقدي</span>
                      </label>
                      <label className="settings-segment">
                        <input
                          type="radio"
                          name="defaultSaleType"
                          value="آجل"
                          checked={defaultSaleType === 'آجل'}
                          onChange={(event) => setDefaultSaleType(event.target.value)}
                        />
                        <span>آجل</span>
                      </label>
                    </div>
                  </div>

                  <div className="settings-form-group">
                    <span className="settings-form-label">طريقة العرض الافتراضية للمنتجات</span>
                    <div className="settings-segmented-control">
                      <label className="settings-segment">
                        <input
                          type="radio"
                          name="defaultProductDisplayMode"
                          value="list"
                          checked={defaultProductDisplayMode === 'list'}
                          onChange={(event) => setDefaultProductDisplayMode(event.target.value)}
                        />
                        <span>≡ قائمة</span>
                      </label>
                      <label className="settings-segment">
                        <input
                          type="radio"
                          name="defaultProductDisplayMode"
                          value="grid"
                          checked={defaultProductDisplayMode === 'grid'}
                          onChange={(event) => setDefaultProductDisplayMode(event.target.value)}
                        />
                        <span>▦ شبكة</span>
                      </label>
                    </div>
                  </div>

                  <div className="settings-form-group">
                    <span className="settings-form-label">طريقة البحث الافتراضية</span>
                    <div className="settings-segmented-control">
                      <label className="settings-segment">
                        <input
                          type="radio"
                          name="defaultSearchMode"
                          value="name"
                          checked={defaultSearchMode === 'name'}
                          onChange={(event) => setDefaultSearchMode(event.target.value)}
                        />
                        <span>📝 بالاسم</span>
                      </label>
                      <label className="settings-segment">
                        <input
                          type="radio"
                          name="defaultSearchMode"
                          value="barcode"
                          checked={defaultSearchMode === 'barcode'}
                          onChange={(event) => setDefaultSearchMode(event.target.value)}
                        />
                        <span>📦 بالباركود</span>
                      </label>
                    </div>
                  </div>

                  <div className="settings-form-group">
                    <label htmlFor="defaultWarehouseId" className="settings-form-label">
                      المخزن الافتراضي في فاتورة البيع
                    </label>
                    <div className="settings-inline-controls">
                      <select
                        id="defaultWarehouseId"
                        className="settings-select"
                        value={defaultWarehouseId ? String(defaultWarehouseId) : ''}
                        onChange={(event) => setDefaultWarehouseId(normalizeWarehouseId(event.target.value))}
                        disabled={loadingWarehouses}
                      >
                        <option value="">كل المخازن (بدون تحديد)</option>
                        {activeWarehouses.map((warehouse) => (
                          <option key={warehouse.id} value={warehouse.id}>
                            {(warehouse.icon || '🏭')} {warehouse.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={loadWarehouses}
                        className="settings-btn settings-btn-secondary"
                        disabled={loadingWarehouses || savingBasicSettings}
                      >
                        {loadingWarehouses ? 'جاري تحميل المخازن...' : 'تحديث المخازن'}
                      </button>
                    </div>
                    <small className="settings-form-help">
                      يُستخدم هذا المخزن تلقائيًا في فواتير البيع الجديدة.
                    </small>
                  </div>

                  <div className="settings-form-group">
                    <label className="settings-checkbox-card">
                      <input
                        type="checkbox"
                        checked={allowExcessPayments}
                        onChange={(e) => setAllowExcessPayments(e.target.checked)}
                      />
                      <div className="settings-checkbox-content">
                        <span className="settings-checkbox-title">السماح بمدفوعات أكبر من الإجمالي</span>
                        <p className="settings-checkbox-desc">إضافة الفرق كرصيد للعميل أو المورد تلقائيًا.</p>
                      </div>
                    </label>
                  </div>

                  <div className="settings-form-group">
                    <label className="settings-checkbox-card">
                      <input
                        type="checkbox"
                        checked={allowNegativeInventory}
                        onChange={(e) => setAllowNegativeInventory(e.target.checked)}
                      />
                      <div className="settings-checkbox-content">
                        <span className="settings-checkbox-title">السماح بالبيع بالسالب (تجاوز المخزون)</span>
                        <p className="settings-checkbox-desc">تجاوز التحقق من توفر الكمية عند إضافة منتج للفاتورة.</p>
                      </div>
                    </label>
                  </div>
                </>
              )}

              {activeTab === 'purchaseInvoice' && (
                <>
                  <div className="settings-form-group">
                    <span className="settings-form-label">نوع الشراء الافتراضي</span>
                    <div className="settings-segmented-control">
                      <label className="settings-segment">
                        <input
                          type="radio"
                          name="defaultPurchaseSaleType"
                          value="نقدي"
                          checked={defaultPurchaseSaleType === 'نقدي'}
                          onChange={(event) => setDefaultPurchaseSaleType(event.target.value)}
                        />
                        <span>نقدي</span>
                      </label>
                      <label className="settings-segment">
                        <input
                          type="radio"
                          name="defaultPurchaseSaleType"
                          value="آجل"
                          checked={defaultPurchaseSaleType === 'آجل'}
                          onChange={(event) => setDefaultPurchaseSaleType(event.target.value)}
                        />
                        <span>آجل</span>
                      </label>
                    </div>
                  </div>

                  <div className="settings-form-group">
                    <span className="settings-form-label">طريقة العرض الافتراضية للمنتجات</span>
                    <div className="settings-segmented-control">
                      <label className="settings-segment">
                        <input
                          type="radio"
                          name="defaultPurchaseProductDisplayMode"
                          value="list"
                          checked={defaultPurchaseProductDisplayMode === 'list'}
                          onChange={(event) => setDefaultPurchaseProductDisplayMode(event.target.value)}
                        />
                        <span>≡ قائمة</span>
                      </label>
                      <label className="settings-segment">
                        <input
                          type="radio"
                          name="defaultPurchaseProductDisplayMode"
                          value="grid"
                          checked={defaultPurchaseProductDisplayMode === 'grid'}
                          onChange={(event) => setDefaultPurchaseProductDisplayMode(event.target.value)}
                        />
                        <span>▦ شبكة</span>
                      </label>
                    </div>
                  </div>

                  <div className="settings-form-group">
                    <span className="settings-form-label">طريقة البحث الافتراضية</span>
                    <div className="settings-segmented-control">
                      <label className="settings-segment">
                        <input
                          type="radio"
                          name="defaultPurchaseSearchMode"
                          value="name"
                          checked={defaultPurchaseSearchMode === 'name'}
                          onChange={(event) => setDefaultPurchaseSearchMode(event.target.value)}
                        />
                        <span>📝 بالاسم</span>
                      </label>
                      <label className="settings-segment">
                        <input
                          type="radio"
                          name="defaultPurchaseSearchMode"
                          value="barcode"
                          checked={defaultPurchaseSearchMode === 'barcode'}
                          onChange={(event) => setDefaultPurchaseSearchMode(event.target.value)}
                        />
                        <span>📦 بالباركود</span>
                      </label>
                    </div>
                  </div>

                  <div className="settings-form-group">
                    <label htmlFor="defaultPurchaseWarehouseId" className="settings-form-label">
                      المخزن الافتراضي في فاتورة الشراء
                    </label>
                    <div className="settings-inline-controls">
                      <select
                        id="defaultPurchaseWarehouseId"
                        className="settings-select"
                        value={defaultPurchaseWarehouseId ? String(defaultPurchaseWarehouseId) : ''}
                        onChange={(event) => setDefaultPurchaseWarehouseId(normalizeWarehouseId(event.target.value))}
                        disabled={loadingWarehouses}
                      >
                        <option value="">كل المخازن (بدون تحديد)</option>
                        {activeWarehouses.map((warehouse) => (
                          <option key={`purchase-${warehouse.id}`} value={warehouse.id}>
                            {(warehouse.icon || '🏭')} {warehouse.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={loadWarehouses}
                        className="settings-btn settings-btn-secondary"
                        disabled={loadingWarehouses || savingBasicSettings}
                      >
                        {loadingWarehouses ? 'جاري تحميل المخازن...' : 'تحديث المخازن'}
                      </button>
                    </div>
                    <small className="settings-form-help">
                      يتم اختيار هذا المخزن تلقائيًا عند إنشاء فاتورة شراء جديدة.
                    </small>
                  </div>

                  <div className="settings-form-group">
                    <label className="settings-checkbox-card">
                      <input
                        type="checkbox"
                        checked={allowExcessPayments}
                        onChange={(e) => setAllowExcessPayments(e.target.checked)}
                      />
                      <div className="settings-checkbox-content">
                        <span className="settings-checkbox-title">السماح بمدفوعات أكبر من الإجمالي</span>
                        <p className="settings-checkbox-desc">إضافة الفرق كرصيد للعميل أو المورد تلقائيًا.</p>
                      </div>
                    </label>
                  </div>
                </>
              )}

              {activeTab === 'salesReturn' && (
                <>
                  <div className="settings-form-group">
                    <span className="settings-form-label">التبويب الافتراضي</span>
                    <div className="settings-segmented-control">
                      <label className="settings-segment">
                        <input
                          type="radio"
                          name="defaultSalesReturnRightTab"
                          value="search"
                          checked={defaultSalesReturnRightTab === 'search'}
                          onChange={(event) => setDefaultSalesReturnRightTab(event.target.value)}
                        />
                        <span>بحث المنتجات</span>
                      </label>
                      <label className="settings-segment">
                        <input
                          type="radio"
                          name="defaultSalesReturnRightTab"
                          value="invoices"
                          checked={defaultSalesReturnRightTab === 'invoices'}
                          onChange={(event) => setDefaultSalesReturnRightTab(event.target.value)}
                        />
                        <span>فواتير العميل</span>
                      </label>
                    </div>
                  </div>

                  <div className="settings-form-group">
                    <span className="settings-form-label">طريقة البحث الافتراضية</span>
                    <div className="settings-segmented-control">
                      <label className="settings-segment">
                        <input
                          type="radio"
                          name="defaultSalesReturnSearchMode"
                          value="name"
                          checked={defaultSalesReturnSearchMode === 'name'}
                          onChange={(event) => setDefaultSalesReturnSearchMode(event.target.value)}
                        />
                        <span>📝 بالاسم</span>
                      </label>
                      <label className="settings-segment">
                        <input
                          type="radio"
                          name="defaultSalesReturnSearchMode"
                          value="barcode"
                          checked={defaultSalesReturnSearchMode === 'barcode'}
                          onChange={(event) => setDefaultSalesReturnSearchMode(event.target.value)}
                        />
                        <span>📦 بالباركود</span>
                      </label>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'purchaseReturn' && (
                <>
                  <div className="settings-form-group">
                    <span className="settings-form-label">التبويب الافتراضي</span>
                    <div className="settings-segmented-control">
                      <label className="settings-segment">
                        <input
                          type="radio"
                          name="defaultPurchaseReturnRightTab"
                          value="search"
                          checked={defaultPurchaseReturnRightTab === 'search'}
                          onChange={(event) => setDefaultPurchaseReturnRightTab(event.target.value)}
                        />
                        <span>بحث المنتجات</span>
                      </label>
                      <label className="settings-segment">
                        <input
                          type="radio"
                          name="defaultPurchaseReturnRightTab"
                          value="invoices"
                          checked={defaultPurchaseReturnRightTab === 'invoices'}
                          onChange={(event) => setDefaultPurchaseReturnRightTab(event.target.value)}
                        />
                        <span>فواتير المورد</span>
                      </label>
                    </div>
                  </div>

                  <div className="settings-form-group">
                    <span className="settings-form-label">طريقة البحث الافتراضية</span>
                    <div className="settings-segmented-control">
                      <label className="settings-segment">
                        <input
                          type="radio"
                          name="defaultPurchaseReturnSearchMode"
                          value="name"
                          checked={defaultPurchaseReturnSearchMode === 'name'}
                          onChange={(event) => setDefaultPurchaseReturnSearchMode(event.target.value)}
                        />
                        <span>📝 بالاسم</span>
                      </label>
                      <label className="settings-segment">
                        <input
                          type="radio"
                          name="defaultPurchaseReturnSearchMode"
                          value="barcode"
                          checked={defaultPurchaseReturnSearchMode === 'barcode'}
                          onChange={(event) => setDefaultPurchaseReturnSearchMode(event.target.value)}
                        />
                        <span>📦 بالباركود</span>
                      </label>
                    </div>
                  </div>
                </>
              )}

              <div className="settings-actions">
                <button
                  type="button"
                  onClick={saveInvoiceSettings}
                  className="settings-btn settings-btn-primary"
                  disabled={savingBasicSettings}
                >
                  {savingBasicSettings
                    ? 'جاري الحفظ...'
                    : activeTab === 'salesInvoice'
                      ? 'حفظ إعدادات فاتورة البيع'
                      : activeTab === 'purchaseInvoice'
                        ? 'حفظ إعدادات فاتورة الشراء'
                        : activeTab === 'salesReturn'
                          ? 'حفظ إعدادات مرتجع المبيعات'
                          : 'حفظ إعدادات مرتجع المشتريات'}
                </button>
              </div>
            </section>
          )}

          {activeTab === 'customers' && (
            <section className="settings-card settings-customers-card">
              <h2><UserCheck className="w-5 h-5" /> إعدادات العملاء المتأخرون</h2>
              <p className="settings-hint">التحكم في عدد الأيام قبل اعتبار العميل متأخرًا في الدفع.</p>

              <div className="settings-range-wrap">
                <input
                  type="range"
                  min="1"
                  max="90"
                  step="1"
                  value={tempThreshold}
                  onChange={(event) => setTempThreshold(parseInt(event.target.value, 10))}
                  className="settings-range"
                />
                <div className="settings-range-value">{tempThreshold} يوم</div>
              </div>

              <div className="settings-stats-grid">
                <div className="settings-stat-box">
                  <span>إجمالي العملاء</span>
                  <strong>{customerStats.totalItems}</strong>
                </div>
                <div className="settings-stat-box">
                  <span>عملاء مدينين</span>
                  <strong>{customerStats.debtedCount}</strong>
                </div>
                <div className="settings-stat-box">
                  <span>متأخرون حاليًا</span>
                  <strong>{customerStats.overdueCount}</strong>
                </div>
                <div className="settings-stat-box">
                  <span>متأخرون بعد التعديل</span>
                  <strong>{overduePreviewCount}</strong>
                </div>
              </div>

              <div className="settings-actions">
                <button type="button" onClick={saveOverdueThreshold} className="settings-btn settings-btn-primary">
                  حفظ إعدادات العملاء
                </button>
                <button
                  type="button"
                  onClick={loadAllCustomers}
                  className="settings-btn settings-btn-secondary"
                  disabled={loadingCustomers}
                >
                  {loadingCustomers ? 'جاري التحديث...' : 'تحديث البيانات'}
                </button>
              </div>
            </section>
          )}

          {activeTab === 'import' && (
            <section className="settings-card settings-import-card">
              <h2><Upload className="w-5 h-5" /> استيراد العملاء</h2>
              <p className="settings-hint">الصيغ المدعومة: XLSX / XLS / CSV / TSV.</p>

              <div className="settings-actions">
                <button type="button" onClick={downloadCustomerImportTemplate} className="settings-btn settings-btn-secondary">
                  تنزيل قالب CSV
                </button>
                <button
                  type="button"
                  onClick={() => customerImportInputRef.current?.click()}
                  className="settings-btn settings-btn-primary"
                  disabled={importingCustomers}
                >
                  {importingCustomers ? 'جاري الاستيراد...' : 'اختيار ملف'}
                </button>
              </div>

              <input
                ref={customerImportInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.tsv,.txt"
                style={{ display: 'none' }}
                onChange={importCustomersFile}
              />

              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={updateExistingOnImport}
                  onChange={(event) => setUpdateExistingOnImport(event.target.checked)}
                  disabled={importingCustomers}
                />
                تحديث العميل الموجود عند تطابق الاسم أو الهاتف
              </label>

              {!customerImportSession && <div className="settings-empty">لم يتم اختيار ملف استيراد بعد.</div>}

              {customerImportSession && (
                <>
                  <div className="settings-import-meta">
                    <div><strong>الملف:</strong> {customerImportSession.fileName}</div>
                    <div>
                      <strong>الأعمدة:</strong> {customerImportSession.headers.length}
                      {' | '}
                      <strong>الصفوف:</strong> {customerImportSession.rows.length}
                      {customerImportSession.sheetName ? ` | الورقة: ${customerImportSession.sheetName}` : ''}
                    </div>
                  </div>

                  <div className="settings-mapping-grid">
                    {CUSTOMER_IMPORT_FIELD_OPTIONS.map((field) => {
                      const selectedColumn = customerImportSession.mapping?.[field.key] ?? '';
                      const sampleValue = selectedColumn ? customerImportColumnSamples.get(selectedColumn) : '';

                      return (
                        <label key={field.key} className="settings-mapping-row">
                          <span>
                            {field.label}
                            {field.required ? ' *' : ''}
                          </span>
                          <select
                            value={selectedColumn}
                            onChange={(event) => updateCustomerImportFieldMapping(field.key, event.target.value)}
                            disabled={importingCustomers}
                          >
                            <option value="">{field.required ? 'اختَر عمودًا...' : 'تجاهل هذا الحقل'}</option>
                            {customerImportSession.headers.map((header) => (
                              <option key={`${field.key}-${header.id}`} value={header.id}>
                                {header.label}
                              </option>
                            ))}
                          </select>
                          <small>{sampleValue ? `مثال: ${sampleValue}` : 'بدون معاينة'}</small>
                        </label>
                      );
                    })}
                  </div>

                  <div className="settings-actions">
                    <button
                      type="button"
                      onClick={applyCustomerImportAutoMapping}
                      className="settings-btn settings-btn-secondary"
                      disabled={importingCustomers}
                    >
                      مطابقة تلقائية
                    </button>
                    <button
                      type="button"
                      onClick={closeCustomerImportSession}
                      className="settings-btn settings-btn-secondary"
                      disabled={importingCustomers}
                    >
                      إلغاء الملف
                    </button>
                    <button
                      type="button"
                      onClick={startCustomerImport}
                      className="settings-btn settings-btn-primary"
                      disabled={importingCustomers}
                    >
                      {importingCustomers ? 'جاري استيراد العملاء...' : 'بدء استيراد العملاء'}
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
          {activeTab === 'productsImport' && (
            <section className="settings-card settings-import-card settings-products-import-card">
              <h2><Package className="w-5 h-5" /> استيراد المنتجات</h2>
              <p className="settings-hint">الصيغ المدعومة: XLSX / XLS / CSV / TSV.</p>

              <div className="settings-actions">
                <button type="button" onClick={downloadProductImportTemplate} className="settings-btn settings-btn-secondary">
                  تنزيل قالب CSV
                </button>
                <button
                  type="button"
                  onClick={() => productImportInputRef.current?.click()}
                  className="settings-btn settings-btn-primary"
                  disabled={importingProducts}
                >
                  {importingProducts ? 'جاري الاستيراد...' : 'اختيار ملف'}
                </button>
              </div>

              <input
                ref={productImportInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.tsv,.txt"
                style={{ display: 'none' }}
                onChange={importProductsFile}
              />

              {!productImportSession && <div className="settings-empty">لم يتم اختيار ملف استيراد بعد.</div>}

              {productImportSession && (
                <>
                  <div className="settings-import-meta">
                    <div><strong>الملف:</strong> {productImportSession.fileName}</div>
                    <div>
                      <strong>الأعمدة:</strong> {productImportSession.headers.length}
                      {' | '}
                      <strong>الصفوف:</strong> {productImportSession.rows.length}
                      {productImportSession.sheetName ? ` | الورقة: ${productImportSession.sheetName}` : ''}
                    </div>
                  </div>

                  <div className="settings-mapping-grid">
                    {IMPORT_FIELD_OPTIONS.map((field) => {
                      const selectedColumn = productImportSession.mapping?.[field.key] ?? '';
                      const sampleValue = selectedColumn ? productImportColumnSamples.get(selectedColumn) : '';

                      return (
                        <label key={field.key} className="settings-mapping-row">
                          <span>
                            {field.label}
                            {field.required ? ' *' : ''}
                          </span>
                          <select
                            value={selectedColumn}
                            onChange={(event) => updateProductImportFieldMapping(field.key, event.target.value)}
                            disabled={importingProducts}
                          >
                            <option value="">{field.required ? 'اختَر عمودًا...' : 'تجاهل هذا الحقل'}</option>
                            {productImportSession.headers.map((header) => (
                              <option key={`${field.key}-${header.id}`} value={header.id}>
                                {header.label}
                              </option>
                            ))}
                          </select>
                          <small>{sampleValue ? `مثال: ${sampleValue}` : 'بدون معاينة'}</small>
                        </label>
                      );
                    })}
                  </div>

                  <div className="settings-actions">
                    <button
                      type="button"
                      onClick={applyProductImportAutoMapping}
                      className="settings-btn settings-btn-secondary"
                      disabled={importingProducts}
                    >
                      مطابقة تلقائية
                    </button>
                    <button
                      type="button"
                      onClick={closeProductImportSession}
                      className="settings-btn settings-btn-secondary"
                      disabled={importingProducts}
                    >
                      إلغاء الملف
                    </button>
                    <button
                      type="button"
                      onClick={startProductImport}
                      className="settings-btn settings-btn-primary"
                      disabled={importingProducts}
                    >
                      {importingProducts ? 'جاري استيراد المنتجات...' : 'بدء استيراد المنتجات'}
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          {activeTab === 'aiMarketing' && (
            <section className="settings-card settings-marketing-card">
              <h2><Share2 className="w-5 h-5" /> التسويق الذكي (AI)</h2>
              <p className="settings-hint">
                قم بإعداد مزود الذكاء الاصطناعي الخاص بك لتوليد رسائل تسويقية إبداعية وجذابة بالعامية المصرية الراقية.
              </p>

              <div className="settings-form-group" style={{ marginBottom: '20px' }}>
                <label htmlFor="marketingProvider" className="settings-form-label" style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>
                  مزود خدمة الذكاء الاصطناعي (AI Provider)
                </label>
                <select
                  id="marketingProvider"
                  value={marketingProvider}
                  onChange={(event) => setMarketingProvider(event.target.value)}
                  style={{ width: '100%', padding: '10px', fontSize: '1rem', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}
                >
                  <option value="gemini">Google Gemini AI (موصى به — صياغة إبداعية ممتازة باللهجة المصرية) 🌟</option>
                  <option value="groq">Groq Cloud (Llama — سرعة فائقة)</option>
                </select>
              </div>

              {marketingProvider === 'gemini' ? (
                <div className="settings-form-group" style={{ marginBottom: '20px' }}>
                  <label htmlFor="geminiApiKey" className="settings-form-label" style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>
                    Google Gemini API Key
                  </label>
                  <input
                    id="geminiApiKey"
                    type="password"
                    className="settings-input"
                    value={geminiApiKey}
                    onChange={(event) => setGeminiApiKey(event.target.value)}
                    placeholder="AIzaSy..."
                    style={{ width: '100%', padding: '10px', fontSize: '1rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                  />
                  <small className="settings-form-help" style={{ display: 'block', marginTop: '8px', color: '#64748b' }}>
                    يمكنك الحصول على مفتاح API مجاني تماماً خلال ثوانٍ من <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{color: '#0ea5e9', textDecoration: 'underline', fontWeight: 'bold'}}>Google AI Studio</a>.
                  </small>
                </div>
              ) : (
                <div className="settings-form-group" style={{ marginBottom: '20px' }}>
                  <label htmlFor="groqApiKey" className="settings-form-label" style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>
                    Groq API Key
                  </label>
                  <input
                    id="groqApiKey"
                    type="password"
                    className="settings-input"
                    value={groqApiKey}
                    onChange={(event) => setGroqApiKey(event.target.value)}
                    placeholder="gsk_..."
                    style={{ width: '100%', padding: '10px', fontSize: '1rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                  />
                  <small className="settings-form-help" style={{ display: 'block', marginTop: '8px', color: '#64748b' }}>
                    يمكنك الحصول على مفتاح API مجاني من خلال موقع <a href="https://console.groq.com/" target="_blank" rel="noreferrer" style={{color: '#0ea5e9', textDecoration: 'underline', fontWeight: 'bold'}}>Groq Console</a>.
                  </small>
                </div>
              )}

              <div className="settings-form-group" style={{ marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  id="showQuickMarketingInProducts"
                  type="checkbox"
                  checked={showQuickMarketingInProducts}
                  onChange={(event) => setShowQuickMarketingInProducts(event.target.checked)}
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
                <label htmlFor="showQuickMarketingInProducts" style={{ fontSize: '1rem', fontWeight: 'bold', color: '#1e293b', cursor: 'pointer' }}>
                  تفعيل أيقونة التسويق السريع بالذكاء الاصطناعي (AI) في شاشة المنتجات
                </label>
              </div>

              <div className="settings-actions">
                <button 
                  type="button" 
                  onClick={saveMarketingSettings} 
                  className="settings-btn settings-btn-primary"
                  disabled={savingMarketingSettings}
                >
                  {savingMarketingSettings ? 'جاري الحفظ...' : 'حفظ إعدادات التسويق'}
                </button>
              </div>
            </section>
          )}

          {activeTab === 'support' && (
            <section className="settings-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', background: 'transparent', boxShadow: 'none' }}>
              <div style={{
                background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                borderRadius: '24px',
                padding: '40px',
                width: '100%',
                maxWidth: '600px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                textAlign: 'center',
                color: 'white',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{
                  position: 'absolute', top: '-50px', right: '-50px', width: '150px', height: '150px', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '50%'
                }} />
                <div style={{
                  position: 'absolute', bottom: '-50px', left: '-50px', width: '200px', height: '200px', background: 'rgba(56, 189, 248, 0.05)', borderRadius: '50%'
                }} />
                
                <img src="fyc_logo.png" alt="FYC Solutions Logo" style={{ width: '200px', marginBottom: '20px', zIndex: 1, position: 'relative' }} />
                
                <h2 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '10px', zIndex: 1, position: 'relative' }}>FYC Solutions</h2>
                <p style={{ fontSize: '16px', color: '#94a3b8', marginBottom: '30px', zIndex: 1, position: 'relative' }}>
                  شريكك التقني لتطوير وإدارة أعمالك باحترافية
                </p>
                
                <div style={{ background: 'rgba(255, 255, 255, 0.05)', borderRadius: '16px', padding: '20px', marginBottom: '20px', zIndex: 1, position: 'relative', textAlign: 'right' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#38bdf8' }}>تواصل مع الدعم الفني</h3>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                    <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '10px', borderRadius: '50%', color: '#38bdf8' }}>
                      <Headphones size={20} />
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: '14px', color: '#cbd5e1' }}>رقم الهاتف / واتساب</p>
                      <p style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', direction: 'ltr', textAlign: 'left' }}>01210677917</p>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                    <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '10px', borderRadius: '50%', color: '#38bdf8' }}>
                      <Share2 size={20} />
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: '14px', color: '#cbd5e1' }}>الموقع الإلكتروني</p>
                      <p style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', direction: 'ltr', textAlign: 'left' }}>www.fyc-solutions.com</p>
                    </div>
                  </div>
                </div>
                
                <p style={{ fontSize: '14px', color: '#64748b', margin: 0, zIndex: 1, position: 'relative' }}>
                  FYC Store Manager v1.0.0
                </p>
              </div>
            </section>
          )}
        </main>
      </div>
    </div >
  );
}
