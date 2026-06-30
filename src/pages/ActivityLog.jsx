import React, { useEffect, useMemo, useState } from 'react';
import { 
  Eye, 
  X, 
  RotateCcw, 
  FileDown, 
  Activity, 
  Search, 
  Calendar, 
  User as UserIcon, 
  Layers, 
  AlertCircle,
  Hash,
  Clock,
  Info,
  CheckCircle2,
  MoreHorizontal
} from 'lucide-react';
import { formatDateForInput } from '../utils/dateUtils';
import { getCompanyPrintSettings } from '../utils/appSettings';
import { safeAlert } from '../utils/safeAlert';
import InvoicePreview from './InvoicePreview';
import { safePrint } from '../../printing/safePrint';
import { generateInvoiceHTML } from '../../printing/generators/saleInvoiceGenerator';
import './ActivityLog.css';

const initialFilters = () => ({
  search: '',
  userId: '',
  module: '',
  action: '',
  fromDate: formatDateForInput(new Date(Date.now() - (7 * 24 * 60 * 60 * 1000))),
  toDate: formatDateForInput(new Date())
});

// Auto-generated internal ledger entries the user doesn't care about
const EXCLUDE_MODULES = [
  'TreasuryEntry', 'TreasuryTransaction', 'PaymentAllocation',
  'VariantWarehouseStock', 'WarehouseStock', 'Inventory'
];

const getUserInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
};

const getAvatarColor = (name) => {
  if (!name) return '#64748b';
  const colors = [
    '#1e3a8a', '#0d9488', '#0891b2', '#2563eb', 
    '#4f46e5', '#7c3aed', '#059669', '#b91c1c'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

const translateNote = (note) => {
  if (!note) return '—';
  let t = note.trim();
  
  // Reconcile inventory for warehouse #1 with 9 items
  if (/^Reconcile inventory for warehouse #(\d+) with (\d+) items$/i.test(t)) {
    return t.replace(/^Reconcile inventory for warehouse #(\d+) with (\d+) items$/i, 'تسوية الجرد والكميات للمخزن رقم $1 لعدد $2 من الأصناف');
  }
  if (/^Reconcile inventory for warehouse "(.+)" with (\d+) items$/i.test(t)) {
    return t.replace(/^Reconcile inventory for warehouse "(.+)" with (\d+) items$/i, 'تسوية الجرد والكميات للمخزن "$1" لعدد $2 من الأصناف');
  }
  
  // Update/Create/Delete user XXX
  if (/^Update user (.+)$/i.test(t)) {
    return t.replace(/^Update user (.+)$/i, 'تعديل بيانات المستخدم "$1"');
  }
  if (/^Create user (.+)$/i.test(t)) {
    return t.replace(/^Create user (.+)$/i, 'إنشاء مستخدم جديد باسم "$1"');
  }
  if (/^Delete user (.+)$/i.test(t)) {
    return t.replace(/^Delete user (.+)$/i, 'حذف المستخدم "$1"');
  }
  
  // Login / Logout
  if (/^Login success for user (.+)$/i.test(t)) {
    return t.replace(/^Login success for user (.+)$/i, 'تسجيل دخول ناجح للمتدرب/المستخدم "$1"');
  }
  if (/^Login failed for user (.+)$/i.test(t)) {
    return t.replace(/^Login failed for user (.+)$/i, 'فشل تسجيل الدخول للمستخدم "$1"');
  }
  if (/^Logout for user (.+)$/i.test(t)) {
    return t.replace(/^Logout for user (.+)$/i, 'تسجيل خروج للمستخدم "$1"');
  }
  
  // Products
  if (/^Product "(.+)" created$/i.test(t)) {
    return t.replace(/^Product "(.+)" created$/i, 'تم إضافة المنتج "$1"');
  }
  if (/^Product "(.+)" updated$/i.test(t)) {
    return t.replace(/^Product "(.+)" updated$/i, 'تم تعديل بيانات المنتج "$1"');
  }
  if (/^Product "(.+)" deleted$/i.test(t)) {
    return t.replace(/^Product "(.+)" deleted$/i, 'تم حذف المنتج "$1"');
  }
  
  // Sales / Purchases
  if (/^Sale "(.+)" created$/i.test(t)) {
    return t.replace(/^Sale "(.+)" created$/i, 'تم إنشاء فاتورة مبيعات رقم "$1"');
  }
  if (/^Sale "(.+)" updated$/i.test(t)) {
    return t.replace(/^Sale "(.+)" updated$/i, 'تم تعديل فاتورة مبيعات رقم "$1"');
  }
  if (/^Sale "(.+)" deleted$/i.test(t)) {
    return t.replace(/^Sale "(.+)" deleted$/i, 'تم حذف فاتورة مبيعات رقم "$1"');
  }
  
  if (/^Purchase "(.+)" created$/i.test(t)) {
    return t.replace(/^Purchase "(.+)" created$/i, 'تم إنشاء فاتورة مشتريات رقم "$1"');
  }
  if (/^Purchase "(.+)" updated$/i.test(t)) {
    return t.replace(/^Purchase "(.+)" updated$/i, 'تم تعديل فاتورة مشتريات رقم "$1"');
  }
  if (/^Purchase "(.+)" deleted$/i.test(t)) {
    return t.replace(/^Purchase "(.+)" deleted$/i, 'تم حذف فاتورة مشتريات رقم "$1"');
  }
  
  return t;
};

const ACTION_LABELS = {
  LOGIN_SUCCESS: 'تسجيل دخول ناجح', 
  LOGIN_FAILED: 'فشل تسجيل الدخول',
  LOGOUT: 'تسجيل خروج',
  PRODUCT_CREATE: 'إضافة منتج جديد', 
  PRODUCT_UPDATE: 'تعديل بيانات منتج', 
  PRODUCT_DELETE: 'حذف منتج',
  SALE_CREATE: 'إنشاء فاتورة مبيعات', 
  SALE_UPDATE: 'تعديل فاتورة مبيعات', 
  SALE_DELETE: 'حذف فاتورة مبيعات',
  PURCHASE_CREATE: 'إنشاء فاتورة مشتريات', 
  PURCHASE_UPDATE: 'تعديل فاتورة مشتريات', 
  PURCHASE_DELETE: 'حذف فاتورة مشتريات',
  CUSTOMER_CREATE: 'إضافة عميل جديد', 
  CUSTOMER_UPDATE: 'تعديل بيانات عميل', 
  CUSTOMER_DELETE: 'حذف عميل',
  SUPPLIER_CREATE: 'إضافة مورد جديد', 
  SUPPLIER_UPDATE: 'تعديل بيانات مورد', 
  SUPPLIER_DELETE: 'حذف مورد',
  CATEGORY_CREATE: 'إضافة تصنيف جديد', 
  CATEGORY_UPDATE: 'تعديل تصنيف', 
  CATEGORY_DELETE: 'حذف تصنيف',
  VARIANT_CREATE: 'إضافة موديل/متغير جديد', 
  VARIANT_UPDATE: 'تعديل موديل/متغير', 
  VARIANT_DELETE: 'حذف موديل/متغير',
  WAREHOUSE_CREATE: 'إضافة مخزن جديد', 
  WAREHOUSE_UPDATE: 'تعديل بيانات مخزن', 
  WAREHOUSE_DELETE: 'حذف مخزن',
  INVENTORY_UPDATE: 'تسوية رصيد المخزون', 
  WAREHOUSE_TRANSFER_CREATE: 'تحويل أصناف بين المخازن',
  CUSTOMER_PAYMENT_CREATE: 'تسجيل دفعة من عميل', 
  CUSTOMER_PAYMENT_UPDATE: 'تعديل دفعة عميل', 
  CUSTOMER_PAYMENT_DELETE: 'حذف دفعة عميل',
  SUPPLIER_PAYMENT_CREATE: 'تسجيل دفعة لمورد', 
  SUPPLIER_PAYMENT_UPDATE: 'تعديل دفعة مورد', 
  SUPPLIER_PAYMENT_DELETE: 'حذف دفعة مورد',
  EXPENSE_CREATE: 'تسجيل مصروف جديد', 
  EXPENSE_UPDATE: 'تعديل مصروف', 
  EXPENSE_DELETE: 'حذف مصروف',
  USER_CREATE: 'إضافة مستخدم جديد', 
  USER_UPDATE: 'تعديل بيانات مستخدم', 
  USER_DELETE: 'حذف مستخدم',
  TREASURY_CREATE: 'إضافة خزنة جديدة', 
  TREASURY_UPDATE: 'تعديل بيانات خزنة', 
  TREASURY_DELETE: 'حذف خزنة',
  SYSTEM_DATABASE_CONNECTION_RESET: 'إعادة ضبط اتصال قاعدة البيانات',
  SYSTEM_BUSINESS_PROFILE_UPDATE: 'تحديث الملف التعريفي للنشاط',
  SYSTEM_BACKUP_SETTINGS_UPDATE: 'تعديل إعدادات النسخ الاحتياطي تلقائياً',
  SYSTEM_DATABASE_CONNECTION_SAVE: 'حفظ إعدادات اتصال قاعدة البيانات',
  SYSTEM_FIRST_RUN_COMPLETE: 'إكمال الإعداد والتشغيل الأولي للنظام',
  SYSTEM_BACKUP_DIRECTORY_SELECT: 'تحديد مجلد حفظ النسخ الاحتياطية',
  SYSTEM_DATABASE_BACKUP: 'إنشاء نسخة احتياطية لقاعدة البيانات',
  SYSTEM_DATABASE_RESTORE: 'استعادة نسخة احتياطية لقاعدة البيانات',
  SYSTEM_APP_RESTART: 'إعادة تشغيل النظام/التطبيق',
  RETURN_CREATE: 'إنشاء فاتورة مرتجع مبيعات',
  RETURN_UPDATE: 'تعديل فاتورة مرتجع مبيعات',
  RETURN_DELETE: 'حذف فاتورة مرتجع مبيعات',
  PURCHASE_RETURN_CREATE: 'إنشاء فاتورة مرتجع مشتريات',
  PURCHASE_RETURN_UPDATE: 'تعديل فاتورة مرتجع مشتريات',
  PURCHASE_RETURN_DELETE: 'حذف فاتورة مرتجع مشتريات',
  EXPENSE_CATEGORY_CREATE: 'إضافة تصنيف مصروفات',
  EXPENSE_CATEGORY_UPDATE: 'تعديل تصنيف مصروفات',
  EXPENSE_CATEGORY_DELETE: 'حذف تصنيف مصروفات',
  INVENTORY_ADJUSTMENT_CONFIRM: 'تأكيد تسوية الجرد',
  INVENTORY_ADJUSTMENT_CREATE: 'بدء عملية جرد جديدة',
  INVENTORY_ADJUSTMENT_UPDATE: 'تعديل مسودة الجرد',
  INVENTORY_ADJUSTMENT_DELETE: 'إلغاء/حذف عملية الجرد',
  INVENTORY_RECONCILE: 'تسوية جرد كميات المخازن'
};

const MODULE_LABELS = {
  User: 'المستخدمون', Product: 'المنتجات', Category: 'التصنيفات', Warehouse: 'المخازن',
  Variant: 'الموديلات والمتغيرات', Purchase: 'المشتريات', Sale: 'المبيعات', Return: 'مرتجعات المبيعات',
  PurchaseReturn: 'مرتجعات المشتريات', Customer: 'العملاء', Supplier: 'الموردون',
  CustomerPayment: 'دفعات العملاء', SupplierPayment: 'دفعات الموردين', Expense: 'المصروفات',
  ExpenseCategory: 'تصنيفات المصروفات', Treasury: 'الخزن', TreasuryEntry: 'قيود الخزنة',
  TreasuryTransaction: 'حركات الخزنة', PaymentAllocation: 'توزيع الدفعات', Inventory: 'المخزون',
  WarehouseStock: 'أرصدة المخازن', VariantWarehouseStock: 'أرصدة المتغيرات بالمخازن',
  WarehouseTransfer: 'تحويلات المخازن', SystemConfig: 'إعدادات النظام', BackupSettings: 'إعدادات النسخ الاحتياطي',
  DatabaseConfig: 'إعدادات قاعدة البيانات', DatabaseMaintenance: 'صيانة قاعدة البيانات',
  SystemSetup: 'الإعداد الأولي', Application: 'التطبيق', System: 'النظام',
  InventoryAdjustment: 'جرد المخازن', InventoryAdjustmentItem: 'بنود جرد المخازن',
  WarehouseInventoryReconciliation: 'تسوية الجرد'
};

const REFERENCE_TYPE_LABELS = {
  SALE: 'فاتورة بيع', PURCHASE: 'فاتورة شراء', RETURN: 'مرتجع بيع',
  PURCHASE_RETURN: 'مرتجع شراء', PAYMENT: 'دفعة مالية', DEPOSIT: 'عربون',
  TREASURY_ENTRY: 'قيد خزنة', TREASURY_TRANSACTION: 'حركة خزنة',
  INVENTORY_ADJUSTMENT: 'تسوية جرد'
};

const TONE_CONFIG = {
  create: { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0', label: 'إضافة جديدة' },
  update: { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe', label: 'تعديل بيانات' },
  delete: { bg: '#fff1f2', text: '#9f1239', border: '#fecdd3', label: 'حذف سجل' },
  auth: { bg: '#f5f3ff', text: '#5b21b6', border: '#ddd6fe', label: 'جلسة عمل' },
  system: { bg: '#fffbeb', text: '#92400e', border: '#fde68a', label: 'نظام داخلي' },
  finance: { bg: '#f0fdfa', text: '#115e59', border: '#99f6e4', label: 'حركة مالية' },
  neutral: { bg: '#f8fafc', text: '#475569', border: '#e2e8f0', label: 'عام' }
};

const FIELD_LABELS = {
  id: 'الرقم التعريفى',
  name: 'الاسم',
  username: 'اسم المستخدم',
  role: 'الصلاحية / الدور',
  email: 'البريد الإلكتروني',
  password: 'كلمة المرور',
  total: 'الإجمالي',
  paid: 'المدفوع',
  discount: 'الخصم',
  notes: 'ملاحظات',
  note: 'ملاحظة / بيان العمل',
  amount: 'المبلغ',
  quantity: 'الكمية',
  price: 'السعر',
  cost: 'التكلفة',
  paymentDate: 'تاريخ الدفع',
  expenseDate: 'تاريخ المصروف',
  invoiceDate: 'تاريخ الفاتورة',
  createdAt: 'تاريخ الإنشاء',
  updatedAt: 'تاريخ التعديل',
  saleType: 'نوع البيع',
  phone: 'الهاتف',
  phone2: 'هاتف إضافي',
  address: 'العنوان',
  city: 'المدينة',
  district: 'المنطقة',
  balance: 'الرصيد',
  creditLimit: 'الحد الائتماني',
  customerType: 'نوع العميل',
  openingBalance: 'الرصيد الافتتاحي',
  currentBalance: 'الرصيد الحالي',
  isActive: 'الحالة (نشط)',
  isDefault: 'الحالة (افتراضي)',
  code: 'كود الصنف / الباركود',
  description: 'الوصف التفصيلي',
  barcode: 'الباركود',
  sku: 'الكود الداخلي (SKU)',
  basePrice: 'سعر البيع الأساسي',
  wholesalePrice: 'سعر الجملة',
  minSalePrice: 'أقل سعر بيع',
  productSize: 'المقاس',
  color: 'اللون',
  categoryId: 'التصنيف',
  paymentMethodId: 'طريقة الدفع',
  customerId: 'العميل',
  supplierId: 'المورد',
  treasuryId: 'الخزنة',
  variantId: 'الموديل / المتغير',
  productId: 'المنتج',
  fromWarehouseId: 'من مخزن',
  toWarehouseId: 'إلى مخزن',
  warehouseId: 'المخزن',
  entryType: 'نوع القيد',
  direction: 'الاتجاه',
  referenceType: 'نوع المرجع',
  referenceId: 'رقم المرجع',
  items: 'الأصناف والمنتجات',
  tax: 'الضريبة',
  shipping: 'تكلفة الشحن',
  finalTotal: 'الإجمالي النهائي',
  paymentStatus: 'حالة الدفع',
  paymentType: 'نوع الدفع',
  transactionId: 'رقم المعاملة',
  accountId: 'الحساب',
  fromAccountId: 'من حساب',
  toAccountId: 'إلى حساب',
  transferDate: 'تاريخ التحويل',
  purchasePrice: 'سعر الشراء',
  salePrice: 'سعر البيع',
  stock: 'المخزون الحالي',
  minStock: 'الحد الأدنى للمخزون',
  maxStock: 'الحد الأقصى للمخزون',
  unit: 'الوحدة',
  supplierName: 'اسم المورد',
  customerName: 'اسم العميل',
  treasuryName: 'اسم الخزنة',
  warehouseName: 'اسم المخزن',
  categoryName: 'اسم التصنيف',
  productName: 'اسم المنتج',
  roleName: 'اسم الصلاحية',
  permissions: 'الصلاحيات الممنوحة',
  details: 'التفاصيل',
  type: 'النوع',
  status: 'الحالة',
  value: 'القيمة',
  title: 'العنوان',
  date: 'التاريخ',
  time: 'الوقت',
  user: 'المستخدم',
  ipAddress: 'عنوان IP',
  device: 'الجهاز / المتصفح',
  action: 'العملية',
  module: 'القسم'
};

const getActionLabel = (action) => ACTION_LABELS[action] || action || '-';
const getModuleLabel = (moduleName) => MODULE_LABELS[moduleName] || moduleName || '-';
const getReferenceLabel = (referenceType) => REFERENCE_TYPE_LABELS[referenceType] || getModuleLabel(referenceType);
const getFieldLabel = (key) => FIELD_LABELS[key] || key;
const extractRows = (result) => (Array.isArray(result) ? result : Array.isArray(result?.data) ? result.data : []);
const isPrimitive = (value) => value === null || value === undefined || typeof value !== 'object';
const createReferenceMaps = () => ({ products: new Map(), variants: new Map(), customers: new Map(), suppliers: new Map(), warehouses: new Map(), treasuries: new Map(), paymentMethods: new Map(), categories: new Map() });
const formatDateTime = (value) => (!value ? '-' : new Date(value).toLocaleString('ar-EG'));
const formatMoney = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(value)) : '-';
const hasObjectData = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length);
const stringifyMeta = (value) => { try { return value ? JSON.stringify(value, null, 2) : 'لا توجد بيانات إضافية'; } catch { return String(value); } };

const getActionTone = (action = '') => {
  if (action === 'LOGIN_SUCCESS' || action === 'LOGOUT') return 'auth';
  if (/_CREATE$/.test(action)) return 'create';
  if (/_UPDATE$/.test(action) || /_SAVE$/.test(action) || /_SET$/.test(action)) return 'update';
  if (/_DELETE$/.test(action) || /_RESET$/.test(action)) return 'delete';
  if (action.startsWith('SYSTEM_')) return 'system';
  if (action.includes('PAYMENT') || action.includes('TREASURY') || action.includes('DEPOSIT')) return 'finance';
  return 'neutral';
};

const formatPrimitiveValue = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  if (typeof value === 'string' && /\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value))) return formatDateTime(value);
  return String(value);
};

const createMapFromRows = (rows, labelBuilder) => {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => { if (row?.id !== null && row?.id !== undefined) map.set(String(row.id), labelBuilder(row)); });
  return map;
};

const buildReferenceMaps = (payload) => ({
  products: createMapFromRows(extractRows(payload.products), (row) => row.name || `منتج #${row.id}`),
  variants: createMapFromRows(extractRows(payload.variants), (row) => [row?.product?.name || `منتج #${row?.productId || row.id}`, row?.productSize ? `مقاس ${row.productSize}` : '', row?.color ? `لون ${row.color}` : ''].filter(Boolean).join(' - ')),
  customers: createMapFromRows(extractRows(payload.customers), (row) => row.name || `عميل #${row.id}`),
  suppliers: createMapFromRows(extractRows(payload.suppliers), (row) => row.name || `مورد #${row.id}`),
  warehouses: createMapFromRows(extractRows(payload.warehouses), (row) => row.name || `مخزن #${row.id}`),
  treasuries: createMapFromRows(extractRows(payload.treasuries), (row) => row.name || `خزنة #${row.id}`),
  paymentMethods: createMapFromRows(extractRows(payload.paymentMethods), (row) => row.name || `طريقة دفع #${row.id}`),
  categories: createMapFromRows(extractRows(payload.categories), (row) => row.name || `تصنيف #${row.id}`)
});

const resolveLookupValue = (fieldKey, value, referenceMaps) => {
  if (value === null || value === undefined || value === '') return '—';
  if (fieldKey === 'isActive') return (value === true || value === 'true' || value === 1 || value === '1') ? 'نشط' : 'غير نشط';
  if (fieldKey === 'isDefault') return (value === true || value === 'true' || value === 1 || value === '1') ? 'افتراضي' : 'عادي';
  const lookupMap = {
    categoryId: referenceMaps.categories,
    customerId: referenceMaps.customers,
    supplierId: referenceMaps.suppliers,
    treasuryId: referenceMaps.treasuries,
    paymentMethodId: referenceMaps.paymentMethods,
    variantId: referenceMaps.variants,
    productId: referenceMaps.products,
    warehouseId: referenceMaps.warehouses,
    fromWarehouseId: referenceMaps.warehouses,
    toWarehouseId: referenceMaps.warehouses
  }[fieldKey];
  const stringValue = String(value);
  if (lookupMap?.has(stringValue)) return lookupMap.get(stringValue);
  if (fieldKey === 'referenceType') return getReferenceLabel(stringValue);
  return formatPrimitiveValue(value);
};

const resolveInvoiceItemName = (item, referenceMaps, fallbackIndex = 0) => {
  const variantLabel = referenceMaps.variants.get(String(item?.variantId || ''));
  const productLabel = item?.variant?.product?.name || item?.productName || referenceMaps.products.get(String(item?.productId || item?.variant?.productId || ''));
  return productLabel || variantLabel || `الصنف ${fallbackIndex + 1}`;
};

const formatItemSummary = (item, referenceMaps = createReferenceMaps(), fallbackIndex = 0) => {
  if (!item) return '—';
  const itemName = resolveInvoiceItemName(item, referenceMaps, fallbackIndex);
  const variantLabel = referenceMaps.variants.get(String(item?.variantId || ''));
  return [
    itemName,
    variantLabel && variantLabel !== itemName ? `(${variantLabel})` : '',
    item?.quantity !== undefined ? `الكمية: ${item.quantity}` : '',
    item?.price !== undefined ? `السعر: ${formatMoney(item.price)}` : '',
    item?.cost !== undefined ? `التكلفة: ${formatMoney(item.cost)}` : '',
    item?.discount !== undefined ? `خصم: ${formatMoney(item.discount)}` : ''
  ].filter(Boolean).join(' | ');
};

function renderReadableValue(value, referenceMaps = createReferenceMaps()) {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.map((item, index) => `${index + 1}. ${formatItemSummary(item, referenceMaps, index)}`).join('\n');
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([key]) => !['before', 'after'].includes(key))
      .map(([key, entry]) => Array.isArray(entry)
        ? `${getFieldLabel(key)}: ${entry.length} عنصر`
        : `${getFieldLabel(key)}: ${resolveLookupValue(key, entry, referenceMaps)}`)
      .join('\n');
  }
  return formatPrimitiveValue(value);
}

const areValuesEqual = (left, right) => {
  if (isPrimitive(left) && isPrimitive(right)) return String(left ?? '') === String(right ?? '');
  try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; }
};

const buildItemChanges = (beforeItems, afterItems, referenceMaps = createReferenceMaps()) => {
  const toKey = (item, index) => `${item?.id || ''}-${item?.variantId || ''}-${item?.productId || ''}-${index}`;
  const beforeMap = new Map((Array.isArray(beforeItems) ? beforeItems : []).map((item, index) => [toKey(item, index), item]));
  const afterMap = new Map((Array.isArray(afterItems) ? afterItems : []).map((item, index) => [toKey(item, index), item]));
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const changes = [];
  let idx = 0;
  keys.forEach((key) => {
    const before = beforeMap.get(key);
    const after = afterMap.get(key);
    const label = resolveInvoiceItemName(after || before, referenceMaps, idx);
    if (!before && after) changes.push({ label, before: 'غير موجود', after: formatItemSummary(after, referenceMaps, idx) });
    else if (before && !after) changes.push({ label, before: formatItemSummary(before, referenceMaps, idx), after: 'تم الحذف' });
    else if (!areValuesEqual(before, after)) changes.push({ label, before: formatItemSummary(before, referenceMaps, idx), after: formatItemSummary(after, referenceMaps, idx) });
    idx += 1;
  });
  return changes;
};

const buildReadableChanges = (before, after, parentKey = '', referenceMaps = createReferenceMaps()) => {
  if (!before && !after) return [];
  if (Array.isArray(before) || Array.isArray(after)) {
    const left = Array.isArray(before) ? before : [];
    const right = Array.isArray(after) ? after : [];
    if (parentKey === 'items') return buildItemChanges(left, right, referenceMaps);
    return areValuesEqual(left, right) ? [] : [{ label: getFieldLabel(parentKey || 'items'), before: `${left.length} عنصر`, after: `${right.length} عنصر` }];
  }
  if (isPrimitive(before) || isPrimitive(after)) {
    return areValuesEqual(before, after) ? [] : [{ label: getFieldLabel(parentKey), before: resolveLookupValue(parentKey, before, referenceMaps), after: resolveLookupValue(parentKey, after, referenceMaps) }];
  }
  return Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]))
    .filter((key) => !['before', 'after'].includes(key))
    .flatMap((key) => buildReadableChanges(before?.[key], after?.[key], key, referenceMaps));
};

const extractMetaDiff = (log, referenceMaps = createReferenceMaps()) => ({
  before: log?.meta?.before,
  after: log?.meta?.after,
  changes: buildReadableChanges(log?.meta?.before, log?.meta?.after, '', referenceMaps)
});

const isInvoiceLog = (log) => {
  const referenceType = String(log?.referenceType || '').toUpperCase();
  return referenceType === 'SALE' || referenceType === 'PURCHASE' || log?.entityType === 'Sale' || log?.entityType === 'Purchase';
};

const getInvoiceKind = (log) => {
  const referenceType = String(log?.referenceType || '').toUpperCase();
  if (referenceType === 'SALE' || log?.entityType === 'Sale') return 'sale';
  if (referenceType === 'PURCHASE' || log?.entityType === 'Purchase') return 'purchase';
  return null;
};

const getLogReferenceId = (log) => log?.referenceId || log?.entityId || log?.meta?.after?.id || log?.meta?.before?.id || null;
const getResolvedReferenceValue = (log) => {
  const referenceId = getLogReferenceId(log);
  const label = log?.referenceType ? getReferenceLabel(log.referenceType) : getModuleLabel(log?.entityType);
  if (!label || label === '-') return '-';
  return referenceId ? `${label} #${referenceId}` : label;
};
const getCounterpartyName = (doc, referenceMaps = createReferenceMaps()) => {
  if (!doc) return '-';
  return (
    doc?.customer?.name ||
    doc?.supplier?.name ||
    doc?.customerName ||
    doc?.supplierName ||
    referenceMaps.customers.get(String(doc?.customerId || '')) ||
    referenceMaps.suppliers.get(String(doc?.supplierId || '')) ||
    '-'
  );
};
const getCounterpartyPhone = (doc) => doc?.customer?.phone || doc?.supplier?.phone || doc?.phone || '';
const getPaymentMethodLabel = (doc, referenceMaps = createReferenceMaps()) => {
  if (!doc) return 'نقداً';
  const nestedName = typeof doc?.paymentMethod === 'object' ? doc.paymentMethod?.name : '';
  const directName = typeof doc?.paymentMethod === 'string' ? doc.paymentMethod : '';
  const mappedName = referenceMaps.paymentMethods.get(String(doc?.paymentMethodId || ''));
  return nestedName || mappedName || doc?.payment || directName || 'نقداً';
};
const getRenderableMetaPayload = (log, diff) =>
  diff?.after ?? diff?.before ?? log?.meta?.after ?? log?.meta?.before ?? log?.meta ?? null;

const normalizeInvoiceSnapshot = (doc) => {
  if (!hasObjectData(doc)) return null;
  return {
    ...doc,
    total: doc?.total ?? doc?.grandTotal ?? doc?.netTotal ?? 0,
    paid: doc?.paid ?? doc?.paidAmount ?? doc?.totalPaid ?? 0,
    remaining: doc?.remaining ?? doc?.remainingAmount ?? null,
    discount: doc?.discount ?? doc?.totalDiscount ?? 0,
    items: Array.isArray(doc?.items) ? doc.items : []
  };
};

const mergeInvoiceSnapshot = (snapshot, liveDoc) => {
  const normalizedSnapshot = normalizeInvoiceSnapshot(snapshot);
  const normalizedLiveDoc = normalizeInvoiceSnapshot(liveDoc);

  if (!normalizedSnapshot) return normalizedLiveDoc;
  if (!normalizedLiveDoc) return normalizedSnapshot;

  return {
    ...normalizedLiveDoc,
    ...normalizedSnapshot,
    customer: normalizedSnapshot.customer || normalizedLiveDoc.customer,
    supplier: normalizedSnapshot.supplier || normalizedLiveDoc.supplier,
    paymentMethod: normalizedSnapshot.paymentMethod || normalizedLiveDoc.paymentMethod,
    items: normalizedSnapshot.items?.length ? normalizedSnapshot.items : normalizedLiveDoc.items,
    returns: normalizedSnapshot.returns?.length ? normalizedSnapshot.returns : normalizedLiveDoc.returns,
    customerId: normalizedSnapshot.customerId ?? normalizedLiveDoc.customerId,
    supplierId: normalizedSnapshot.supplierId ?? normalizedLiveDoc.supplierId,
    paymentMethodId: normalizedSnapshot.paymentMethodId ?? normalizedLiveDoc.paymentMethodId,
    invoiceDate: normalizedSnapshot.invoiceDate || normalizedLiveDoc.invoiceDate,
    createdAt: normalizedSnapshot.createdAt || normalizedLiveDoc.createdAt,
    total: normalizedSnapshot.total ?? normalizedLiveDoc.total ?? 0,
    paid: normalizedSnapshot.paid ?? normalizedLiveDoc.paid ?? 0,
    remaining: normalizedSnapshot.remaining ?? normalizedLiveDoc.remaining ?? null,
    discount: normalizedSnapshot.discount ?? normalizedLiveDoc.discount ?? 0
  };
};

const normalizeExportRows = (logs) => logs.map((log) => ({
  التاريخ: formatDateTime(log.createdAt), 
  المستخدم: log.performedBy?.name || 'غير محدد',
  القسم: getModuleLabel(log.entityType), 
  العملية: getActionLabel(log.action),
  'نوع العملية': TONE_CONFIG[getActionTone(log.action)]?.label || 'عام', 
  الوصف: translateNote(log.note),
  المرجع: log.referenceType ? `${getReferenceLabel(log.referenceType)} #${log.referenceId || '-'}` : '-',
  المعرف: log.id, 
  'البيانات الإضافية': stringifyMeta(log.meta)
}));

const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const buildPdfHtml = (logs, filters) => `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8" /><title>سجل العمليات</title><style>body{font-family:Tahoma,Arial,sans-serif;margin:24px;color:#0f172a;direction:rtl}h1{margin:0 0 8px}.meta{color:#475569;margin-bottom:16px;font-size:13px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:10px;text-align:right;vertical-align:top;font-size:12px}th{background:#f8fafc}</style></head><body><h1>سجل العمليات</h1><div class="meta">الفترة: ${escapeHtml(filters.fromDate || '-')} إلى ${escapeHtml(filters.toDate || '-')} | عدد السجلات: ${logs.length}</div><table><thead><tr><th>التاريخ</th><th>المستخدم</th><th>القسم</th><th>العملية</th><th>الوصف</th></tr></thead><tbody>${logs.map((log) => { const tone = TONE_CONFIG[getActionTone(log.action)] || TONE_CONFIG.neutral; return `<tr><td>${escapeHtml(formatDateTime(log.createdAt))}</td><td>${escapeHtml(log.performedBy?.name || 'غير محدد')}</td><td>${escapeHtml(getModuleLabel(log.entityType))}</td><td><span style="display:inline-block;padding:4px 8px;border-radius:999px;background:${tone.bg};color:${tone.text};border:1px solid ${tone.border};font-weight:700;">${escapeHtml(getActionLabel(log.action))}</span></td><td>${escapeHtml(translateNote(log.note))}</td></tr>`; }).join('') || '<tr><td colspan="5">لا توجد سجلات</td></tr>'}</tbody></table></body></html>`;

export default function ActivityLog() {
  const [filters, setFilters] = useState(initialFilters);
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  const [logs, setLogs] = useState([]);
  const [metaFilters, setMetaFilters] = useState({ actions: [], modules: [], users: [] });
  const [selectedLog, setSelectedLog] = useState(null);
  const [referenceMaps, setReferenceMaps] = useState(createReferenceMaps());
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [loadingReferences, setLoadingReferences] = useState(false);
  const [invoiceDocument, setInvoiceDocument] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  // Debounce search input by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 300);
    return () => clearTimeout(handler);
  }, [filters.search]);

  const loadLogs = async (requestedPage = 1, currentFilters = filters, searchVal = debouncedSearch) => {
    setLoading(true);
    try {
      const result = await window.api.getAuditLogs({
        ...currentFilters,
        search: searchVal,
        page: requestedPage,
        pageSize: 25,
        excludeModules: EXCLUDE_MODULES
      });
      if (!result?.error) {
        setLogs(Array.isArray(result.data) ? result.data : []);
        setMetaFilters(result.filters || { actions: [], modules: [], users: [] });
        setPage(result.page || 1);
        setTotalPages(result.totalPages || 1);
        setTotalItems(result.total || 0);
      }
    } catch (error) {
      console.error('فشل تحميل سجل العمليات:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-run filters on change
  useEffect(() => {
    loadLogs(1, filters, debouncedSearch);
  }, [filters.userId, filters.module, filters.action, filters.fromDate, filters.toDate, debouncedSearch]);

  useEffect(() => {
    let cancelled = false;
    const loadReferenceData = async () => {
      setLoadingReferences(true);
      try {
        const [products, variants, customers, suppliers, warehouses, treasuries, paymentMethods, categories] = await Promise.all([
          window.api.getProducts({ page: 1, pageSize: 10000, includeDescription: false, includeImage: false }),
          window.api.getVariants(),
          window.api.getCustomers({ page: 1, pageSize: 2000 }),
          window.api.getSuppliers(),
          window.api.getWarehouses(),
          window.api.getTreasuries(),
          window.api.getPaymentMethods(),
          window.api.getCategories()
        ]);
        if (!cancelled) setReferenceMaps(buildReferenceMaps({ products, variants, customers, suppliers, warehouses, treasuries, paymentMethods, categories }));
      } catch (error) {
        console.error('فشل تحميل بيانات الربط لسجل العمليات:', error);
      } finally {
        if (!cancelled) setLoadingReferences(false);
      }
    };
    loadReferenceData();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadInvoiceDocument = async () => {
      setInvoiceDocument(null);
      if (!selectedLog || !isInvoiceLog(selectedLog)) return;
      const documentId = getLogReferenceId(selectedLog);
      const invoiceKind = getInvoiceKind(selectedLog);
      if (!documentId || !invoiceKind) return;
      setLoadingInvoice(true);
      try {
        const result = invoiceKind === 'sale' ? await window.api.getSaleById(documentId) : await window.api.getPurchaseById(documentId);
        if (!cancelled && !result?.error) setInvoiceDocument(result);
      } catch (error) {
        console.error('فشل تحميل الفاتورة المرتبطة بالسجل:', error);
      } finally {
        if (!cancelled) setLoadingInvoice(false);
      }
    };
    loadInvoiceDocument();
    return () => { cancelled = true; };
  }, [selectedLog]);


  const selectedDiff = useMemo(() => {
    if (!selectedLog) return null;
    const baseDiff = extractMetaDiff(selectedLog, referenceMaps);

    if (!isInvoiceLog(selectedLog)) {
      return baseDiff;
    }

    const before = normalizeInvoiceSnapshot(baseDiff.before);
    const after = mergeInvoiceSnapshot(baseDiff.after, invoiceDocument);

    return {
      before,
      after,
      changes: buildReadableChanges(before, after, '', referenceMaps)
    };
  }, [invoiceDocument, referenceMaps, selectedLog]);

  const exportExcel = async () => {
    if (!logs.length) return safeAlert('لا توجد سجلات لتصديرها', null, { type: 'warning' });
    setExporting(true);
    try {
      const xlsxModule = await import('xlsx');
      const XLSX = xlsxModule?.default || xlsxModule;
      const worksheet = XLSX.utils.json_to_sheet(normalizeExportRows(logs));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'ActivityLog');
      XLSX.writeFile(workbook, `activity-log-${filters.fromDate || 'all'}-${filters.toDate || 'all'}.xlsx`);
    } catch (error) {
      await safeAlert(error.message || 'فشل تصدير Excel', null, { type: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const exportPdf = async () => {
    if (!logs.length) return safeAlert('لا توجد سجلات لتصديرها', null, { type: 'warning' });
    if (!window.api?.exportPDF) return safeAlert('تصدير PDF متاح داخل التطبيق فقط', null, { type: 'warning' });
    setExporting(true);
    try {
      const result = await window.api.exportPDF({ 
        html: buildPdfHtml(logs, filters), 
        title: 'سجل العمليات', 
        suggestedName: `activity-log-${filters.fromDate || 'all'}-${filters.toDate || 'all'}.pdf` 
      });
      if (result?.error) throw new Error(result.error);
    } catch (error) {
      await safeAlert(error.message || 'فشل تصدير PDF', null, { type: 'error' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="al-root">
      {/* ── Header ── */}
      <div className="al-header">
        <div className="al-header-text">
          <h1>سجل العمليات</h1>
          <p>متابعة وتدقيق حركات النظام والمستخدمين</p>
        </div>
        <div className="al-header-actions">
          <button type="button" onClick={exportExcel} disabled={exporting} className="al-btn al-btn-secondary">
            <FileDown size={16} /> Excel
          </button>
          <button type="button" onClick={exportPdf} disabled={exporting} className="al-btn al-btn-secondary">
            <FileDown size={16} /> PDF
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="al-filters">
        <div className="al-filters-grid">
          <FilterItem label="بحث بالوصف" icon={<Search size={14} />}>
            <input className="al-input" value={filters.search} onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))} placeholder="أدخل كلمة للبحث..." />
          </FilterItem>
          <FilterItem label="المستخدم المسؤول" icon={<UserIcon size={14} />}>
            <select className="al-input" value={filters.userId} onChange={(e) => setFilters((p) => ({ ...p, userId: e.target.value }))}>
              <option value="">كل المستخدمين</option>
              {metaFilters.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </FilterItem>
          <FilterItem label="القسم / الموديول" icon={<Layers size={14} />}>
            <select className="al-input" value={filters.module} onChange={(e) => setFilters((p) => ({ ...p, module: e.target.value }))}>
              <option value="">كل الأقسام</option>
              {metaFilters.modules.map((m) => <option key={m} value={m}>{getModuleLabel(m)}</option>)}
            </select>
          </FilterItem>
          <FilterItem label="نوع العملية" icon={<RotateCcw size={14} />}>
            <select className="al-input" value={filters.action} onChange={(e) => setFilters((p) => ({ ...p, action: e.target.value }))}>
              <option value="">كل العمليات</option>
              {metaFilters.actions.map((a) => <option key={a} value={a}>{getActionLabel(a)}</option>)}
            </select>
          </FilterItem>
          <FilterItem label="تاريخ البداية" icon={<Calendar size={14} />}>
            <input type="date" className="al-input" value={filters.fromDate} onChange={(e) => setFilters((p) => ({ ...p, fromDate: e.target.value }))} />
          </FilterItem>
          <FilterItem label="تاريخ النهاية" icon={<Calendar size={14} />}>
            <input type="date" className="al-input" value={filters.toDate} onChange={(e) => setFilters((p) => ({ ...p, toDate: e.target.value }))} />
          </FilterItem>
        </div>
        <div className="al-filters-actions">
          <button type="button" onClick={() => loadLogs(page, filters, debouncedSearch)} className="al-btn al-btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <RotateCcw size={14} /> تحديث البيانات
          </button>
          <button type="button" onClick={() => setFilters(initialFilters())} className="al-btn al-btn-danger-ghost">
            إعادة تعيين الفلاتر
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="al-table-panel">
        <div className="al-table-scroll">
          <table className="al-table">
            <thead>
              <tr>
                <th>التاريخ والوقت</th>
                <th>المستخدم</th>
                <th>القسم</th>
                <th>العملية</th>
                <th>التصنيف</th>
                <th>الوصف والبيان</th>
                <th style={{ textAlign: 'center' }}>التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="al-center">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '24px 0', color: '#475569' }}>
                      <RotateCcw className="spinning" size={16} /> ⏳ جاري تحميل وتحديث السجلات...
                    </div>
                  </td>
                </tr>
              ) : logs.length ? (
                logs.map((log) => {
                  const tone = TONE_CONFIG[getActionTone(log.action)] || TONE_CONFIG.neutral;
                  const userName = log.performedBy?.name || 'غير محدد';
                  return (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: 'nowrap', color: '#64748b', fontSize: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Clock size={12} /> {formatDateTime(log.createdAt)}
                        </div>
                      </td>
                      <td>
                        <div className="al-user-cell">
                          <div className="al-user-cell-info">
                            <span className="al-user-name">{userName}</span>
                            <span className="al-user-role">
                              {log.performedBy?.role ? (log.performedBy.role === 'ADMIN' ? 'مدير النظام' : 'مستخدم') : 'مستعرض'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td><span className="al-badge al-badge-module">{getModuleLabel(log.entityType)}</span></td>
                      <td>
                        <span className="al-badge" style={{ background: tone.bg, color: tone.text, borderColor: tone.border }}>
                          {getActionLabel(log.action)}
                        </span>
                      </td>
                      <td>
                        <span className="al-badge" style={{ background: '#fff', color: tone.text, borderColor: tone.border, opacity: 0.8 }}>
                          {tone.label}
                        </span>
                      </td>
                      <td style={{ color: '#475569', fontSize: '12.5px' }}>{translateNote(log.note)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button type="button" className="al-btn-ghost" onClick={() => setSelectedLog(log)}>
                          <Eye size={12} /> عرض
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr><td colSpan="7" className="al-center" style={{ padding: 32, color: '#64748b' }}>لا توجد سجلات مطابقة للفلاتر المحددة</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="al-pagination">
          <span className="al-pagination-info">صفحة {page} من {totalPages} · إجمالي {totalItems} سجل</span>
          <div className="al-pagination-btns">
            <button type="button" disabled={page <= 1} onClick={() => loadLogs(page - 1, filters, debouncedSearch)} className="al-btn al-btn-secondary">السابق</button>
            <button type="button" disabled={page >= totalPages} onClick={() => loadLogs(page + 1, filters, debouncedSearch)} className="al-btn al-btn-secondary">التالي</button>
          </div>
        </div>
      )}

      {/* ══ Detail Modal or Invoice Preview ══ */}
      {selectedLog && getInvoiceKind(selectedLog) === 'sale' ? (
        loadingInvoice ? (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(4px)',
            zIndex: 3000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div style={{
              padding: '24px 40px',
              background: 'white',
              borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              direction: 'rtl',
              border: '1px solid #e2e8f0'
            }}>
              <RotateCcw className="spinning" size={24} style={{ color: '#0f766e' }} />
              <span style={{ fontWeight: '800', color: '#1e293b', fontSize: '15px' }}>جاري تحميل تفاصيل الفاتورة...</span>
            </div>
          </div>
        ) : (
          invoiceDocument ? (
            <InvoicePreview
              sale={invoiceDocument}
              onClose={() => setSelectedLog(null)}
              onPrint={async () => {
                try {
                  const html = generateInvoiceHTML(invoiceDocument, invoiceDocument.customer || null);
                  await safePrint(html, {
                    title: `فاتورة رقم ${invoiceDocument.id || "-"}`,
                    preview: true,
                  });
                } catch (err) {
                  console.error(err);
                  await safeAlert("فشلت الطباعة: " + err.message, null, { type: 'error' });
                }
              }}
            />
          ) : (
            <DetailModal 
              log={selectedLog} 
              diff={selectedDiff} 
              onClose={() => setSelectedLog(null)} 
              referenceMaps={referenceMaps}
              loadingInvoice={loadingInvoice}
            />
          )
        )
      ) : (
        selectedLog && (
          <DetailModal 
            log={selectedLog} 
            diff={selectedDiff} 
            onClose={() => setSelectedLog(null)} 
            referenceMaps={referenceMaps}
            loadingInvoice={loadingInvoice}
          />
        )
      )}
    </div>
  );
}

function FilterItem({ label, icon, children }) {
  return (
    <div className="al-filter-item">
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
        <span style={{ color: '#94a3b8' }}>{icon}</span>
        <span className="al-filter-label">{label}</span>
      </div>
      {children}
    </div>
  );
}

function DetailModal({ log, diff, onClose, referenceMaps, loadingInvoice }) {
  const tone = TONE_CONFIG[getActionTone(log.action)] || TONE_CONFIG.neutral;
  const isInvoice = isInvoiceLog(log);
  
  const userName = log.performedBy?.name || 'غير محدد';
  const userRole = log.performedBy?.role ? (log.performedBy.role === 'ADMIN' ? 'مدير النظام' : 'مستخدم') : 'مستعرض';

  const rawPayload = getRenderableMetaPayload(log, diff);

  const isTechnicalField = (key) => {
    const technicalKeys = [
      'id', 'createdAt', 'updatedAt', 'password', 'passwordHash', 'salt', 
      'token', 'rememberToken', 'emailVerifiedAt', 'v', '__v', 'deletedAt',
      'updatedBy', 'createdBy', 'userId', 'roleId', 'permissions'
    ];
    return technicalKeys.includes(key);
  };

  return (
    <div className="al-overlay" onClick={onClose}>
      <div className="al-modal" onClick={(e) => e.stopPropagation()}>
        <div className="al-modal-header">
          <div className="al-modal-header-user">
            <span className="al-modal-header-name">{userName}</span>
            <span className="al-modal-header-role">{userRole}</span>
          </div>
          <div className="al-modal-header-actions">
            <span className="al-modal-badge" style={{ background: tone.bg, color: tone.text, borderColor: tone.border }}>
              {getActionLabel(log.action)} · {getModuleLabel(log.entityType)}
            </span>
            <button type="button" className="al-modal-close" onClick={onClose} aria-label="إغلاق">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="al-modal-content">
          {/* Beautiful Header Banner */}
          <div className={`al-modal-banner is-${getActionTone(log.action)}`}>
            <div className="al-modal-banner-icon">
              {getActionTone(log.action) === 'create' && <CheckCircle2 size={22} />}
              {getActionTone(log.action) === 'update' && <RotateCcw size={22} />}
              {getActionTone(log.action) === 'delete' && <AlertCircle size={22} />}
              {['auth', 'system', 'finance', 'neutral'].includes(getActionTone(log.action)) && <Info size={22} />}
            </div>
            <div className="al-modal-banner-content">
              <span className="al-modal-banner-label">بيان وتفاصيل الحركة</span>
              <h2 className="al-modal-banner-title">{translateNote(log.note)}</h2>
            </div>
          </div>

          {/* Clean Metadata Bar */}
          <div className="al-modal-meta-bar">
            <div className="al-modal-meta-pill">
              <span className="al-modal-meta-pill-label">تاريخ ووقت الحركة</span>
              <span className="al-modal-meta-pill-val"><Clock size={12} /> {formatDateTime(log.createdAt)}</span>
            </div>
            <div className="al-modal-meta-pill">
              <span className="al-modal-meta-pill-label">المسؤول عن الحركة</span>
              <span className="al-modal-meta-pill-val"><UserIcon size={12} /> {userName}</span>
            </div>
            {getLogReferenceId(log) && (
              <div className="al-modal-meta-pill">
                <span className="al-modal-meta-pill-label">رقم المستند / المرجع</span>
                <span className="al-modal-meta-pill-val"><Hash size={12} /> {getResolvedReferenceValue(log)}</span>
              </div>
            )}
          </div>

          {/* Action Contents */}
          {isInvoice ? (
            <div className="al-comparison-container">
              {loadingInvoice && !diff?.before && !diff?.after && (
                <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                  <RotateCcw className="spinning" size={24} style={{ marginBottom: 8 }} />
                  <div>جاري تحميل بيانات الفاتورة...</div>
                </div>
              )}

              {/* Invoice Comparison or View */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {!diff?.before && diff?.after && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#065f46' }}>
                      <CheckCircle2 size={18} />
                      <span style={{ fontWeight: 800 }}>بيانات الفاتورة المُضافة</span>
                    </div>
                    <InvoiceReceipt doc={diff.after} referenceMaps={referenceMaps} type={log.referenceType} />
                  </div>
                )}

                {diff?.before && !diff?.after && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#9f1239' }}>
                      <AlertCircle size={18} />
                      <span style={{ fontWeight: 800 }}>بيانات الفاتورة المحذوفة</span>
                    </div>
                    <InvoiceReceipt doc={diff.before} referenceMaps={referenceMaps} type={log.referenceType} />
                  </div>
                )}

                {diff?.before && diff?.after && (
                  <div className="al-diff-content">
                    <div className="al-diff-box is-before">
                      <div className="al-diff-tag">النسخة السابقة (قبل التعديل)</div>
                      <InvoiceReceipt doc={diff.before} referenceMaps={referenceMaps} type={log.referenceType} />
                    </div>
                    <div className="al-diff-box is-after">
                      <div className="al-diff-tag">النسخة المعدلة (بعد التعديل)</div>
                      <InvoiceReceipt doc={diff.after} referenceMaps={referenceMaps} type={log.referenceType} />
                    </div>
                  </div>
                )}
              </div>

              {/* Comparison Table for Invoice Changes */}
              {diff?.changes?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, color: '#1e3a8a' }}>
                    <MoreHorizontal size={18} /> جدول مقارنة التعديلات بالتفصيل
                  </div>
                  <div className="al-diff-table-wrapper">
                    <table className="al-diff-table">
                      <thead>
                        <tr>
                          <th>اسم الحقل</th>
                          <th>القيمة السابقة</th>
                          <th style={{ width: 40, textAlign: 'center' }}></th>
                          <th>القيمة الجديدة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diff.changes.map((change, i) => (
                          <tr key={i}>
                            <td className="al-diff-table-label">{change.label}</td>
                            <td className="al-diff-table-val-before">{change.before}</td>
                            <td className="al-diff-table-arrow">←</td>
                            <td className="al-diff-table-val-after">{change.after}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Non-Invoice View */
            <div className="al-comparison-container">
              {diff?.changes?.length > 0 ? (
                <>
                  <div style={{ fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, color: '#1e3a8a' }}>
                    <Activity size={18} /> جدول الحقول المعدلة
                  </div>
                  <div className="al-diff-table-wrapper">
                    <table className="al-diff-table">
                      <thead>
                        <tr>
                          <th>اسم الحقل</th>
                          <th>القيمة السابقة</th>
                          <th style={{ width: 40, textAlign: 'center' }}></th>
                          <th>القيمة الجديدة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diff.changes.map((change, i) => (
                          <tr key={i}>
                            <td className="al-diff-table-label">{change.label}</td>
                            <td className="al-diff-table-val-before">{change.before}</td>
                            <td className="al-diff-table-arrow">←</td>
                            <td className="al-diff-table-val-after">{change.after}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                /* Detail Fields Grid for Addition/Deletion */
                hasObjectData(rawPayload) ? (
                  <div>
                    <div style={{ fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, color: '#0f766e' }}>
                      <CheckCircle2 size={18} /> تفاصيل وحقول السجل
                    </div>
                    <div className="al-meta-grid">
                      {Object.entries(rawPayload)
                        .filter(([key]) => !['before', 'after', 'items'].includes(key) && !isTechnicalField(key))
                        .map(([key, val]) => (
                          <div key={key} className="al-meta-item">
                            <span className="al-meta-item-label">{getFieldLabel(key)}</span>
                            <span className="al-meta-item-value">{resolveLookupValue(key, val, referenceMaps)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                ) : (
                  <div className="al-diff-box is-after" style={{ padding: 20 }}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>بيانات السجل:</div>
                    <div className="al-diff-value">{renderReadableValue(rawPayload, referenceMaps)}</div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
        
        <div className="al-modal-footer">
          <button type="button" className="al-btn al-btn-primary" onClick={onClose} style={{ minWidth: 120 }}>
            إغلاق التفاصيل
          </button>
        </div>
      </div>
    </div>
  );
}

function InvoiceReceipt({ doc, referenceMaps, type }) {
  if (!doc) return null;
  const normalizedDoc = normalizeInvoiceSnapshot(doc) || doc;
  const company = getCompanyPrintSettings();
  const normalizedType = String(type || '').toUpperCase();
  const isSale = normalizedType === 'SALE' || normalizedType.includes('SALE');
  const docTypeLabel = isSale ? 'فاتورة بيع' : (normalizedType.includes('PURCHASE') ? 'فاتورة شراء' : 'فاتورة');

  const counterpartyName = getCounterpartyName(normalizedDoc, referenceMaps);
  const counterpartyPhone = getCounterpartyPhone(normalizedDoc);
  const paymentMethodLabel = getPaymentMethodLabel(normalizedDoc, referenceMaps);

  const total = Number(normalizedDoc?.total || 0);
  const paid = Number(normalizedDoc?.paid ?? total);
  const remainingValue = normalizedDoc?.remaining ?? normalizedDoc?.remainingAmount;
  const remaining = Number.isFinite(Number(remainingValue)) ? Number(remainingValue) : Math.max(0, total - paid);
  const discount = Number(normalizedDoc?.discount || 0);
  const isCredit = remaining > 0;

  return (
    <div className="al-receipt" dir="rtl">
      <div className="al-receipt-header">
        <div style={{ color: '#0f766e', fontWeight: 900, fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>{company.name || 'الشركة'}</div>
        <h3 style={{ margin: 0, fontSize: 18, color: '#1e293b' }}>{docTypeLabel}</h3>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11, marginBottom: 15, borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>
        <div>رقم: <span style={{ fontWeight: 800 }}>#{normalizedDoc.id || normalizedDoc.invoiceId || '-'}</span></div>
        <div style={{ textAlign: 'left' }}>التاريخ: <span style={{ fontWeight: 800 }}>{formatDateTime(normalizedDoc.invoiceDate || normalizedDoc.createdAt).split(',')[0]}</span></div>
        <div>الدفع: <span style={{ fontWeight: 800 }}>{isCredit ? 'آجل' : paymentMethodLabel}</span></div>
      </div>

      {counterpartyName !== '-' && (
        <div style={{ background: '#f8fafc', padding: 8, borderRadius: 8, marginBottom: 15, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{isSale ? 'العميل' : 'المورد'}</div>
          <div style={{ fontWeight: 800, fontSize: 13 }}>{counterpartyName}</div>
          {counterpartyPhone && <div style={{ fontSize: 11, color: '#475569' }}>{counterpartyPhone}</div>}
        </div>
      )}

      <table className="al-receipt-items">
        <thead>
          <tr>
            <th style={{ textAlign: 'right' }}>الصنف</th>
            <th style={{ textAlign: 'center' }}>إجمالي</th>
          </tr>
        </thead>
        <tbody>
          {(normalizedDoc?.items || []).map((item, idx) => {
            const name = resolveInvoiceItemName(item, referenceMaps, idx);
            const qty = Number(item?.quantity || 1);
            const price = Number(item?.price ?? item?.cost ?? 0);
            const itemTotal = (qty * price) - Number(item?.discount || 0);
            return (
              <tr key={idx}>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700 }}>{name}</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>{qty} × {formatMoney(price)}</div>
                </td>
                <td style={{ textAlign: 'center', fontWeight: 700 }}>{formatMoney(itemTotal)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginTop: 15, borderTop: '2px solid #1e293b', paddingTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span>الإجمالي:</span>
          <span style={{ fontWeight: 800 }}>{formatMoney(total)}</span>
        </div>
        {discount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#9f1239' }}>
            <span>الخصم:</span>
            <span style={{ fontWeight: 800 }}>{formatMoney(discount)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 900, marginTop: 8, paddingTop: 8, borderTop: '1px solid #1e293b' }}>
          <span>الصافي:</span>
          <span>{formatMoney(total)}</span>
        </div>
        {isCredit && (
          <div style={{ marginTop: 8, padding: 8, background: '#fff1f2', borderRadius: 6, fontSize: 11, color: '#9f1239', fontWeight: 700, textAlign: 'center' }}>
            متبقي: {formatMoney(remaining)}
          </div>
        )}
      </div>
    </div>
  );
}
