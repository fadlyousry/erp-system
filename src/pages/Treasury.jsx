import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { 
  Building2, RefreshCw, TrendingUp, HandCoins, Printer, Plus, X, Pencil, 
  ArrowDown, ArrowUp, ArrowRightLeft, Smartphone, Landmark, HelpCircle, 
  Check, Banknote, Wallet, PieChart, Info, Scale, Trash2, Eye 
} from 'lucide-react';
import { safeAlert } from '../utils/safeAlert';
import { safePrint } from '../../printing/safePrint';
import { safeConfirm } from '../utils/safeConfirm';
import { getLocalDateString } from '../utils/dateUtils';
import './Treasury.css';


const ENTRY_TYPE_OPTIONS = [
  'OPENING_BALANCE',
  'SALE_INCOME',
  'CUSTOMER_PAYMENT',
  'MANUAL_IN',
  'EXPENSE_PAYMENT',
  'PURCHASE_PAYMENT',
  'SUPPLIER_PAYMENT',
  'RETURN_REFUND',
  'MANUAL_OUT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT'
];

const TAB_OPTIONS = [
  { id: 'treasuries', label: 'الخزن', icon: Building2 },
  { id: 'transactions', label: 'الحركات', icon: RefreshCw },
  { id: 'daily', label: 'الإيراد اليومي', icon: TrendingUp },
  { id: 'expenses', label: 'المصروفات', icon: HandCoins }
];

const EXPENSE_CATEGORY_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#64748b', '#0d9488'
];

const ENTRY_TYPE_LABELS = {
  OPENING_BALANCE: 'رصيد افتتاحي',
  SALE_INCOME: 'إيراد بيع',
  CUSTOMER_PAYMENT: 'دفع قسط',
  MANUAL_IN: 'إضافة يدوية',
  EXPENSE_PAYMENT: 'صرف مصروف',
  PURCHASE_PAYMENT: 'سداد مشتريات',
  SUPPLIER_PAYMENT: 'سداد مورد',
  RETURN_REFUND: 'رد قيمة مرتجع',
  MANUAL_OUT: 'صرف يدوي',
  TRANSFER_IN: 'تحويل وارد',
  TRANSFER_OUT: 'تحويل صادر',
  ADJUSTMENT_IN: 'تسوية زيادة',
  ADJUSTMENT_OUT: 'تسوية عجز'
};

const REFERENCE_TYPE_LABELS = {
  SALE: 'فاتورة بيع',
  PAYMENT: 'دفع قسط',
  RETURN: 'مرتجع',
  PURCHASE: 'فاتورة شراء',
  SUPPLIER_PAYMENT: 'دفعة مورد',
  EXPENSE: 'مصروف',
  TREASURY_TRANSFER: 'تحويل خزنة',
  TREASURY_TRANSACTION: 'حركة خزنة',
  MANUAL: 'مرجع يدوي'
};

const DIRECTION_LABELS = { IN: 'وارد', OUT: 'منصرف', TRANSFER: 'تحويل' };

const toArabicDigits = (str) => {
  if (str === null || str === undefined) return '';
  return String(str).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
};

const moneyFormatter = new Intl.NumberFormat('ar-EG-u-nu-arab', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const formatMoney = (value) => toArabicDigits(moneyFormatter.format(Number(value || 0)));

const formatDateForInput = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return '';
  return getLocalDateString(d);
};

const todayDate = () => formatDateForInput(new Date());

const toInt = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const toAmount = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';

  // Format using local timezone
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'م' : 'ص';
  const displayHours = hours % 12 || 12;

  return toArabicDigits(`${year}/${month}/${day} ${displayHours}:${minutes}:${seconds} ${ampm}`);
};

const resolveMethodName = (entryOrRow) => {
  const code = String(entryOrRow?.code || entryOrRow?.paymentMethod?.code || '').toUpperCase();
  if (code === 'CASH') return 'نقدي';
  if (code === 'VODAFONE_CASH') return 'فودافون كاش';
  if (code === 'INSTAPAY') return 'إنستا باي';
  return entryOrRow?.name || entryOrRow?.paymentMethod?.name || '-';
};

const resolveEntryTypeLabel = (entryType) => ENTRY_TYPE_LABELS[entryType] || entryType || '-';
const resolveDirectionLabel = (direction) => DIRECTION_LABELS[direction] || direction || '-';
const resolveReferenceLabel = (referenceType) => REFERENCE_TYPE_LABELS[referenceType] || referenceType || '-';
const formatReference = (row) => {
  const label = resolveReferenceLabel(row?.referenceType);
  return row?.referenceId ? `${label} #${toArabicDigits(row.referenceId)}` : label;
};

const emptyTreasuryForm = () => ({
  name: '',
  code: '',
  openingBalance: '0',
  description: '',
  isDefault: false
});

const parseStoredUser = () => {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildZReportHtml = ({ report, treasuryName, fromDate, toDate }) => {
  const summary = report?.summary || {};
  const sales = report?.sales || {};
  const revenue = report?.revenue?.summary || {};
  const methods = Array.isArray(report?.revenue?.byPaymentMethod) ? report.revenue.byPaymentMethod : [];
  const salesEntries = Array.isArray(report?.entries) ? report.entries.filter(e => e.entryType === 'SALE_INCOME') : [];
  const paymentEntries = Array.isArray(report?.entries) ? report.entries.filter(e => e.entryType === 'CUSTOMER_PAYMENT') : [];

  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>
  @page { size: A4; margin: 10mm; }
  body { font-family: "Cairo", "Tahoma", sans-serif; color: #0f172a; margin: 0; direction: rtl; }
  .page { padding: 12px; }
  h1 { margin: 0; font-size: 22px; }
  .meta { margin: 8px 0 14px; font-size: 12px; color: #475569; }
  .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 14px; }
  .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; background: #f8fbff; }
  .label { font-size: 11px; color: #64748b; }
  .value { font-size: 13px; font-weight: 700; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: right; }
  th { background: #f1f5f9; }
  .in { color: #047857; font-weight: 700; }
  .out { color: #b91c1c; font-weight: 700; }
  .no-print button { border: none; border-radius: 8px; padding: 8px 14px; background: #0f766e; color: #fff; cursor: pointer; }
  @media print { .no-print { display: none; } }
  </style></head><body><div class="page">
  <h1>تقرير  للخزنة</h1>
  <div class="meta">الفترة: ${escapeHtml(toArabicDigits(fromDate))} - ${escapeHtml(toArabicDigits(toDate))} | الخزنة: ${escapeHtml(treasuryName)} | وقت الطباعة: ${escapeHtml(formatDateTime(new Date()))}</div>
  <div class="grid">
    <div class="card"><div class="label">إجمالي المبيعات</div><div class="value">${escapeHtml(formatMoney(sales.totalSales || 0))}</div></div>
    <div class="card"><div class="label">إجمالي المرتجعات</div><div class="value">${escapeHtml(formatMoney(sales.totalReturns || 0))}</div></div>
    <div class="card"><div class="label">صافي المبيعات</div><div class="value">${escapeHtml(formatMoney(sales.netSales || 0))}</div></div>
    <div class="card"><div class="label">صافي التدفق النقدي</div><div class="value">${escapeHtml(formatMoney(summary.netCashIn || 0))}</div></div>
    <div class="card"><div class="label">إجمالي الإيراد</div><div class="value">${escapeHtml(formatMoney(revenue.totalRevenue || 0))}</div></div>
    <div class="card"><div class="label">تحصيلات العملاء</div><div class="value">${escapeHtml(formatMoney(revenue.customerPayments || 0))}</div></div>
  </div>
  <h3>حسب وسيلة الدفع</h3>
  <table><thead><tr><th>الوسيلة</th><th>الإيراد</th><th>المبيعات</th><th>تحصيل العملاء</th></tr></thead><tbody>
  ${methods.length === 0 ? '<tr><td colspan="4">لا توجد بيانات</td></tr>' : methods.map((row) => `<tr><td>${escapeHtml(resolveMethodName(row))}</td><td class="in">${escapeHtml(formatMoney(row.revenueAmount || row.amount || 0))}</td><td>${escapeHtml(formatMoney(row.saleIncomeAmount || 0))}</td><td>${escapeHtml(formatMoney(row.customerPaymentAmount || 0))}</td></tr>`).join('')}
  </tbody></table>
  
  <h3>فواتير المبيعات (تفصيلي)</h3>
  <table><thead><tr><th>العميل</th><th>المبلغ</th><th>الوسيلة</th><th>الخزنة</th><th>الوقت</th><th>ملاحظة</th></tr></thead><tbody>
  ${salesEntries.length === 0 ? '<tr><td colspan="6">لا توجد فواتير مبيعات اليوم</td></tr>' : salesEntries.map((row) => `<tr><td><strong>${escapeHtml(row.entityName || '-')}</strong></td><td class="in">${escapeHtml(formatMoney(row.amount || 0))}</td><td>${escapeHtml(resolveMethodName(row))}</td><td>${escapeHtml(row?.treasury?.name || '-')}</td><td>${escapeHtml(formatDateTime(row.entryDate || row.createdAt))}</td><td>${escapeHtml(row.note || row.notes || '-')}</td></tr>`).join('')}
  </tbody></table>

  <h3>التنزيل / دفع الأقساط (تفصيلي)</h3>
  <table><thead><tr><th>العميل</th><th>المبلغ</th><th>الوسيلة</th><th>الخزنة</th><th>الوقت</th><th>ملاحظة</th></tr></thead><tbody>
  ${paymentEntries.length === 0 ? '<tr><td colspan="6">لا توجد حركات دفع أقساط اليوم</td></tr>' : paymentEntries.map((row) => `<tr><td><strong>${escapeHtml(row.entityName || '-')}</strong></td><td class="in">${escapeHtml(formatMoney(row.amount || 0))}</td><td>${escapeHtml(resolveMethodName(row))}</td><td>${escapeHtml(row?.treasury?.name || '-')}</td><td>${escapeHtml(formatDateTime(row.entryDate || row.createdAt))}</td><td>${escapeHtml(row.note || row.notes || '-')}</td></tr>`).join('')}
  </tbody></table>
  <div class="no-print" style="margin-top:10px;"><button onclick="window.print()">طباعة</button></div>
  </div></body></html>`;
};

const ExpenseModal = React.memo(({ isOpen, onClose, onSave, expenseToEdit, categories, treasuries, paymentMethods, submitting }) => {
  const [form, setForm] = useState({
    title: '', amount: '', categoryId: '', notes: '',
    expenseDate: todayDate(), treasuryId: '', paymentMethodId: ''
  });

  useEffect(() => {
    if (isOpen) {
      if (expenseToEdit) {
        setForm({
          title: expenseToEdit.title,
          amount: String(expenseToEdit.amount),
          categoryId: expenseToEdit.categoryId ? String(expenseToEdit.categoryId) : '',
          notes: expenseToEdit.notes || '',
          expenseDate: expenseToEdit.expenseDate ? formatDateForInput(expenseToEdit.expenseDate) : todayDate(),
          treasuryId: '',
          paymentMethodId: ''
        });
      } else {
        setForm({
          title: '', amount: '', categoryId: '', notes: '',
          expenseDate: todayDate(), treasuryId: '', paymentMethodId: ''
        });
      }
    }
  }, [isOpen, expenseToEdit]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  if (!isOpen) return null;

  return (
    <div className="treasury-modal-overlay" onClick={onClose}>
      <div className="treasury-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="treasury-modal-head">
          <h3>{expenseToEdit ? 'تعديل مصروف' : 'إضافة مصروف جديد'}</h3>
          <button type="button" className="treasury-close-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <form className="treasury-form" onSubmit={handleSubmit}>
          <div className="treasury-form-grid">
            <label className="field"><span>عنوان المصروف</span><input className="treasury-input" value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} required autoFocus /></label>
            <label className="field"><span>المبلغ</span><input className="treasury-input" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm(p => ({ ...p, amount: e.target.value }))} required /></label>
            <label className="field"><span>التصنيف</span>
              <select className="treasury-input" value={form.categoryId} onChange={(e) => setForm(p => ({ ...p, categoryId: e.target.value }))}>
                <option value="">بدون تصنيف</option>
                {categories.map((cat) => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
              </select>
            </label>
            <label className="field"><span>التاريخ</span><input className="treasury-input" type="date" value={form.expenseDate} onChange={(e) => setForm(p => ({ ...p, expenseDate: e.target.value }))} /></label>
            {!expenseToEdit && (<>
              <label className="field"><span>الخزنة</span>
                <select className="treasury-input" value={form.treasuryId} onChange={(e) => setForm(p => ({ ...p, treasuryId: e.target.value }))}>
                  <option value="">الافتراضية</option>
                  {treasuries.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
                </select>
              </label>
              <label className="field"><span>وسيلة الدفع</span>
                <select className="treasury-input" value={form.paymentMethodId} onChange={(e) => setForm(p => ({ ...p, paymentMethodId: e.target.value }))}>
                  <option value="">الافتراضية</option>
                  {paymentMethods.map((m) => (<option key={m.id} value={m.id}>{resolveMethodName(m)}</option>))}
                </select>
              </label>
            </>)}
            <label className="field field-full"><span>ملاحظات</span><input className="treasury-input" value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} /></label>
          </div>
          <div className="treasury-card-actions">
            <button className="treasury-btn primary" type="submit" disabled={submitting}>حفظ</button>
            <button className="treasury-btn ghost" type="button" onClick={onClose}>إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
});

const ExpenseCategoryManager = React.memo(({ categories, onSave, onDelete, submitting }) => {
  const [form, setForm] = useState({ name: '', color: EXPENSE_CATEGORY_COLORS[0] });
  const [editingCategory, setEditingCategory] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await onSave(form, editingCategory);
    if (success) {
      setForm({ name: '', color: EXPENSE_CATEGORY_COLORS[0] });
      setEditingCategory(null);
    }
  };

  const handleEdit = (cat) => {
    setEditingCategory(cat);
    setForm({ name: cat.name, color: cat.color || EXPENSE_CATEGORY_COLORS[0] });
  };

  const handleCancel = () => {
    setEditingCategory(null);
    setForm({ name: '', color: EXPENSE_CATEGORY_COLORS[0] });
  };

  return (
    <div className="expense-category-manager" style={{ marginBottom: 12 }}>
      <div className="expense-category-chips">
        {categories.map((cat) => (
          <div key={cat.id} className="expense-category-chip" style={{ borderColor: cat.color || '#64748b' }}>
            <span className="chip-dot" style={{ background: cat.color || '#64748b' }} />
            <span>{cat.name}</span>
            <span className="chip-count">{cat._count?.expenses || 0}</span>
            <button type="button" className="chip-edit" onClick={() => handleEdit(cat)} title="تعديل"><Pencil size={14} /></button>
            <button type="button" className="chip-delete" onClick={() => onDelete(cat)} title="حذف"><X size={14} /></button>
          </div>
        ))}
      </div>
      <form className="expense-category-form" onSubmit={handleSubmit}>
        <input className="treasury-input" placeholder="اسم التصنيف" value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} required />
        <div className="color-picker-row">
          {EXPENSE_CATEGORY_COLORS.map((c) => (
            <button key={c} type="button" className={`color-dot ${form.color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setForm(p => ({ ...p, color: c }))} />
          ))}
        </div>
        <div className="expense-category-form-actions">
          <button className="treasury-btn small primary" type="submit" disabled={submitting}>{editingCategory ? 'تحديث' : 'إضافة'}</button>
          {editingCategory && <button className="treasury-btn small ghost" type="button" onClick={handleCancel}>إلغاء</button>}
        </div>
      </form>
    </div>
  );
});

export default function Treasury() {
  const currentUser = useMemo(() => parseStoredUser(), []);

  const [activeTab, setActiveTab] = useState('daily');
  const [bootstrapping, setBootstrapping] = useState(false);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [treasuries, setTreasuries] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [users, setUsers] = useState([]);
  const [entries, setEntries] = useState([]);
  const [entriesSummary, setEntriesSummary] = useState({ totalIn: 0, totalOut: 0, net: 0 });
  const [dailyReport, setDailyReport] = useState(null);

  const [filters, setFilters] = useState({ treasuryId: '', userId: '', fromDate: todayDate(), toDate: todayDate(), direction: 'ALL', entryType: 'ALL', search: '' });
  const [reportFilters, setReportFilters] = useState({ treasuryId: '', fromDate: todayDate(), toDate: todayDate() });

  const [treasuryForm, setTreasuryForm] = useState(emptyTreasuryForm);
  const [treasuryModalState, setTreasuryModalState] = useState({
    isOpen: false,
    mode: 'create',
    treasuryId: null
  });
  const [transactionForm, setTransactionForm] = useState({
    transactionType: 'IN', treasuryId: '', sourceTreasuryId: '', targetTreasuryId: '', amount: '',
    paymentMethodId: '', entryType: '', notes: '', entryDate: todayDate()
  });
  const [transactionFormOpen, setTransactionFormOpen] = useState(false);

  // ── Expense state ──
  const [expenses, setExpenses] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [expenseFilters, setExpenseFilters] = useState({ fromDate: todayDate(), toDate: todayDate(), categoryId: '', userId: '' });
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);

  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  // Removed categoryForm and editingCategory from global state

  const selectedReportTreasuryId = useMemo(
    () => toInt(reportFilters.treasuryId) || toInt(filters.treasuryId) || treasuries[0]?.id || null,
    [filters.treasuryId, reportFilters.treasuryId, treasuries]
  );

  const selectedTreasuryName = useMemo(() => {
    if (!selectedReportTreasuryId) return 'كل الخزن';
    const matched = treasuries.find((item) => item.id === selectedReportTreasuryId);
    return matched?.name || `الخزنة #${selectedReportTreasuryId}`;
  }, [selectedReportTreasuryId, treasuries]);

  const selectedDailyTreasuryName = useMemo(() => {
    const dailyTreasuryId = toInt(reportFilters.treasuryId);
    if (!dailyTreasuryId) return 'كل الخزن';
    const matched = treasuries.find((item) => item.id === dailyTreasuryId);
    return matched?.name || `الخزنة #${dailyTreasuryId}`;
  }, [reportFilters.treasuryId, treasuries]);

  const movementSummary = dailyReport?.summary || {};
  const salesSummary = dailyReport?.sales || {};
  const revenueSummary = dailyReport?.revenue?.summary || {};
  const revenueByMethod = Array.isArray(dailyReport?.revenue?.byPaymentMethod) ? dailyReport.revenue.byPaymentMethod : [];
  const revenueBySource = Array.isArray(dailyReport?.revenue?.bySource) ? dailyReport.revenue.bySource : [];
  const revenueBySourceVisible = useMemo(
    () => revenueBySource.filter((row) => !['DEPOSIT_IN', 'DEPOSIT_REFUND'].includes(String(row?.entryType || '').toUpperCase())),
    [revenueBySource]
  );
  const revenueByTreasury = Array.isArray(dailyReport?.revenue?.byTreasury) ? dailyReport.revenue.byTreasury : [];
  const revenueEntries = Array.isArray(dailyReport?.revenue?.entries) ? dailyReport.revenue.entries : [];
  const byEntryType = Array.isArray(dailyReport?.byEntryType) ? dailyReport.byEntryType : [];
  const allDailyEntries = Array.isArray(dailyReport?.entries) ? dailyReport.entries : [];

  // ── Drill-down modal state ──
  const [drillDown, setDrillDown] = useState({ isOpen: false, title: '', entries: [] });

  // Computed summary values for the summary table
  const dailyExpenseTotal = useMemo(() => {
    const row = byEntryType.find((r) => r.entryType === 'EXPENSE_PAYMENT');
    return Math.abs(row?.net || 0);
  }, [byEntryType]);
  const dailyManualOutTotal = useMemo(() => {
    const row = byEntryType.find((r) => r.entryType === 'MANUAL_OUT');
    return Math.abs(row?.net || 0);
  }, [byEntryType]);
  const totalPaidFromSales = Number(revenueSummary.saleIncome || 0);
  const totalRemaining = Math.max(0, Number(salesSummary.totalSales || 0) - totalPaidFromSales);

  // Net Revenue after deducting expenses and disbursements
  const finalNetRevenue = (revenueSummary.totalRevenue || 0) - dailyExpenseTotal - dailyManualOutTotal;

  const totalTreasuryBalance = useMemo(() => treasuries.reduce((sum, row) => sum + Number(row.currentBalance || 0), 0), [treasuries]);

  // Group transactions by Payment Method for the split view
  const groupedTransactions = useMemo(() => {
    const groups = {
      CASH: { code: 'CASH', title: 'الخزينة النقدية', icon: <Banknote size={18} />, entries: [], totalIn: 0, totalOut: 0 },
      VODAFONE_CASH: { code: 'VODAFONE_CASH', title: 'فودافون كاش', icon: <Smartphone size={18} />, entries: [], totalIn: 0, totalOut: 0 },
      INSTAPAY: { code: 'INSTAPAY', title: 'إنستا باي', icon: <Landmark size={18} />, entries: [], totalIn: 0, totalOut: 0 },
      OTHER: { code: 'OTHER', title: 'أخرى', icon: <HelpCircle size={18} />, entries: [], totalIn: 0, totalOut: 0 }
    };

    entries.forEach(entry => {
      // Resolve code: check paymentMethod code first, fall back to CASH if no method and no code? 
      // User transactions usually have paymentMethodId. If null, it's often CASH or internal.
      // I'll check entry.paymentMethod?.code
      const methodCode = entry.paymentMethod?.code;
      let targetGroup = 'CASH'; // Default

      if (methodCode) {
        const c = String(methodCode).toUpperCase();
        if (groups[c]) targetGroup = c;
        else targetGroup = 'OTHER';
      } else {
        // If no payment method, check if it implies cash?
        // Usually system defaults to Cash if null.
        targetGroup = 'CASH';
      }

      const group = groups[targetGroup];
      group.entries.push(entry);

      const amount = Number(entry.amount || 0);
      if (entry.direction === 'IN') group.totalIn += amount;
      else if (entry.direction === 'OUT') group.totalOut += amount;
    });

    return groups;
  }, [entries]);

  const loadTreasuryBaseData = useCallback(async () => {
    const [treasuryResponse, paymentMethodsResponse, usersResponse] = await Promise.all([
      window.api.getTreasuries(),
      window.api.getPaymentMethods(),
      window.api.getUsers()
    ]);

    if (treasuryResponse?.error) throw new Error(treasuryResponse.error);
    if (paymentMethodsResponse?.error) throw new Error(paymentMethodsResponse.error);
    if (usersResponse?.error) throw new Error(usersResponse.error);

    const treasuryRows = Array.isArray(treasuryResponse) ? treasuryResponse : (Array.isArray(treasuryResponse?.data) ? treasuryResponse.data : []);
    const methodRows = Array.isArray(paymentMethodsResponse) ? paymentMethodsResponse : [];
    const userRows = Array.isArray(usersResponse) ? usersResponse : (Array.isArray(usersResponse?.data) ? usersResponse.data : []);

    setTreasuries(treasuryRows);
    setPaymentMethods(methodRows);
    setUsers(userRows);

    const firstTreasuryId = treasuryRows[0]?.id ? String(treasuryRows[0].id) : '';
    setFilters((prev) => {
      if (!firstTreasuryId) return prev;
      const exists = treasuryRows.some((row) => String(row.id) === String(prev.treasuryId));
      return exists ? prev : { ...prev, treasuryId: firstTreasuryId };
    });
    setReportFilters((prev) => {
      if (!firstTreasuryId) return prev;
      const exists = treasuryRows.some((row) => String(row.id) === String(prev.treasuryId));
      return exists ? prev : { ...prev, treasuryId: firstTreasuryId };
    });
  }, []);

  const loadEntries = useCallback(async () => {
    setEntriesLoading(true);
    try {
      const result = await window.api.getTreasuryEntries({
        treasuryId: toInt(filters.treasuryId),
        userId: toInt(filters.userId),
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        direction: filters.direction,
        entryType: filters.entryType,
        search: filters.search
      });
      if (result?.error) throw new Error(result.error);
      setEntries(Array.isArray(result?.data) ? result.data : []);
      setEntriesSummary(result?.summary || { totalIn: 0, totalOut: 0, net: 0 });
    } catch (error) {
      await safeAlert(`تعذّر تحميل حركات الخزنة: ${error.message}`);
    } finally {
      setEntriesLoading(false);
    }
  }, [filters]);

  const loadDailyReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const result = await window.api.getDailyRevenueReport({
        treasuryId: toInt(reportFilters.treasuryId),
        fromDate: reportFilters.fromDate,
        toDate: reportFilters.toDate
      });
      if (result?.error) throw new Error(result.error);
      setDailyReport(result || null);
    } catch (error) {
      await safeAlert(`تعذّر تحميل تقرير الإيراد اليومي: ${error.message}`);
    } finally {
      setReportLoading(false);
    }
  }, [reportFilters]);

  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      setBootstrapping(true);
      try {
        await loadTreasuryBaseData();
      } catch (error) {
        await safeAlert(`تعذّر تهيئة شاشة الخزنة: ${error.message}`);
      } finally {
        if (mounted) setBootstrapping(false);
      }
    };
    void bootstrap();
    return () => { mounted = false; };
  }, [loadTreasuryBaseData]);

  useEffect(() => {
    if (bootstrapping) return;
    void loadEntries();
  }, [bootstrapping, loadEntries]);

  useEffect(() => {
    if (bootstrapping) return;
    void loadDailyReport();
  }, [bootstrapping, loadDailyReport]);

  const refreshAll = useCallback(async () => {
    setBootstrapping(true);
    try {
      await loadTreasuryBaseData();
      await Promise.all([loadEntries(), loadDailyReport()]);
    } catch (error) {
      await safeAlert(`تعذّر تحديث البيانات: ${error.message}`);
    } finally {
      setBootstrapping(false);
    }
  }, [loadDailyReport, loadEntries, loadTreasuryBaseData]);

  const openCreateTreasuryModal = () => {
    setTreasuryForm(emptyTreasuryForm());
    setTreasuryModalState({
      isOpen: true,
      mode: 'create',
      treasuryId: null
    });
  };

  const openEditTreasuryModal = (treasury) => {
    if (!treasury) return;
    setTreasuryForm({
      name: treasury.name || '',
      code: treasury.code || '',
      openingBalance: String(Number(treasury.openingBalance || 0)),
      description: treasury.description || '',
      isDefault: Boolean(treasury.isDefault)
    });
    setTreasuryModalState({
      isOpen: true,
      mode: 'edit',
      treasuryId: treasury.id
    });
  };

  const closeTreasuryModal = () => {
    setTreasuryModalState({
      isOpen: false,
      mode: 'create',
      treasuryId: null
    });
    setTreasuryForm(emptyTreasuryForm());
  };

  const handleSaveTreasury = async (event) => {
    event.preventDefault();
    const name = treasuryForm.name.trim();
    if (!name) {
      await safeAlert('اسم الخزنة مطلوب');
      return;
    }

    const payload = {
      name,
      code: treasuryForm.code.trim(),
      openingBalance: Math.max(0, toAmount(treasuryForm.openingBalance)),
      description: treasuryForm.description.trim() || null,
      isDefault: Boolean(treasuryForm.isDefault),
      openingDate: todayDate()
    };

    setSubmitting(true);
    try {
      if (treasuryModalState.mode === 'edit' && treasuryModalState.treasuryId) {
        const result = await window.api.updateTreasury(treasuryModalState.treasuryId, {
          ...payload,
          updatedByUserId: toInt(currentUser?.id)
        });
        if (result?.error) throw new Error(result.error);
      } else {
        const result = await window.api.createTreasury({
          ...payload,
          createdByUserId: toInt(currentUser?.id)
        });
        if (result?.error) throw new Error(result.error);
      }

      closeTreasuryModal();
      await refreshAll();
    } catch (error) {
      await safeAlert(`تعذّر حفظ بيانات الخزنة: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetDefaultTreasury = async (treasury) => {
    if (!treasury?.id || treasury?.isDefault) return;

    setSubmitting(true);
    try {
      const result = await window.api.setDefaultTreasury(treasury.id, {
        updatedByUserId: toInt(currentUser?.id),
        source: 'TreasuryPage'
      });
      if (result?.error) throw new Error(result.error);
      await refreshAll();
    } catch (error) {
      await safeAlert(`تعذّر تعيين الخزنة الافتراضية: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTreasury = async (treasury) => {
    if (!treasury?.id) return;

    const confirmed = await safeConfirm(
      `هل تريد حذف الخزنة \"${treasury.name}\"؟`,
      {
        title: 'تأكيد حذف خزنة',
        detail: treasury.hasLinkedOperations
          ? 'الخزنة مرتبطة بعمليات، سيتم حذفها بشكل آمن كأرشيف بدون فقد بيانات.'
          : 'سيتم حذف الخزنة نهائيًا.',
        buttons: ['حذف', 'إلغاء']
      }
    );
    if (!confirmed) return;

    setSubmitting(true);
    try {
      const result = await window.api.deleteTreasury(treasury.id, {
        deletedByUserId: toInt(currentUser?.id)
      });
      if (result?.error) throw new Error(result.error);
      await refreshAll();
    } catch (error) {
      await safeAlert(`تعذّر حذف الخزنة: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTransaction = async (event) => {
    event.preventDefault();
    const amount = Math.max(0, toAmount(transactionForm.amount));
    if (amount <= 0) {
      await safeAlert('قيمة المبلغ غير صحيحة');
      return;
    }

    const payload = {
      entryType: transactionForm.entryType,
      transactionType: transactionForm.transactionType,
      amount,
      notes: transactionForm.notes,
      entryDate: transactionForm.entryDate === todayDate() ? new Date() : transactionForm.entryDate,
      createdByUserId: toInt(currentUser?.id)
    };

    if (transactionForm.transactionType === 'TRANSFER') {
      payload.sourceTreasuryId = toInt(transactionForm.sourceTreasuryId);
      payload.targetTreasuryId = toInt(transactionForm.targetTreasuryId);
      if (!payload.sourceTreasuryId || !payload.targetTreasuryId || payload.sourceTreasuryId === payload.targetTreasuryId) {
        await safeAlert('خزنة المصدر والوجهة غير صحيحتين');
        return;
      }
    } else {
      payload.treasuryId = toInt(transactionForm.treasuryId);
      payload.paymentMethodId = toInt(transactionForm.paymentMethodId);
      payload.entryType = transactionForm.entryType || undefined;
      if (!payload.treasuryId) {
        await safeAlert('يجب اختيار خزنة');
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = await window.api.createTreasuryTransaction(payload);
      if (result?.error) throw new Error(result.error);
      setTransactionForm((prev) => ({ ...prev, amount: '', notes: '', paymentMethodId: '', entryType: '' }));
      await refreshAll();
    } catch (error) {
      await safeAlert(`تعذّر تسجيل الحركة: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const buildTransactionsReportHtml = ({ entries, summary, filters, treasuryName, groupedTransactions }) => {
    // Helper to generate a mini-table for a specific group (Cash, Vodafone, InstaPay)
    const generateGroupTable = (group) => {
      if (!group || group.entries.length === 0) return '';
      const net = group.totalIn - group.totalOut;
      return `
        <div class="group-section">
          <div class="group-header">
            <span>${group.title}</span>
            <span class="${net >= 0 ? 'in-text' : 'out-text'}">الصافي: ${formatMoney(net)}</span>
          </div>
          <table class="group-table">
            <thead>
              <tr>
                <th>وارد</th>
                <th>منصرف</th>
                <th>الصافي</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="in-text">${formatMoney(group.totalIn)}</td>
                <td class="out-text">${formatMoney(group.totalOut)}</td>
                <td style="font-weight:bold">${formatMoney(net)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    };

    return `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>تقرير الحركات</title>
        <style>
          body { font-family: 'Cairo', sans-serif; padding: 20px; direction: rtl; }
          h1, h2, h3 { text-align: center; margin: 10px 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
          th { background-color: #f3f4f6; color: #374151; }
          .in-row { color: #166534; }
          .out-row { color: #991b1b; }
          .in-text { color: #166534; }
          .out-text { color: #991b1b; }
          .summary-box { margin-top: 30px; border: 1px solid #e5e7eb; padding: 15px; border-radius: 8px; display: flex; justify-content: space-around; background: #f9fafb; }
          .summary-item { text-align: center; }
          .summary-item strong { display: block; font-size: 16px; margin-top: 5px; }
          
          /* Group Tables Styling */
          .groups-container { display: flex; gap: 15px; margin-top: 20px; justify-content: center; flex-wrap: wrap; }
          .group-section { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; width: 30%; min-width: 200px; background: #fff; }
          .group-header { display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 5px; border-bottom: 1px solid #f3f4f6; padding-bottom: 5px; }
          .group-table th, .group-table td { padding: 4px; font-size: 12px; }
          
          .print-meta { text-align: center; color: #6b7280; font-size: 12px; margin-top: 40px; }
        </style>
      </head>
      <body>
        <h1>تقرير حركة الخزنة</h1>
        <h3>${treasuryName}</h3>
        <p style="text-align: center;">من: ${filters.fromDate} - إلى: ${filters.toDate}</p>

        <!-- Payment Method Breakdown -->
        <div class="groups-container">
          ${generateGroupTable(groupedTransactions['CASH'])}
          ${generateGroupTable(groupedTransactions['VODAFONE_CASH'])}
          ${generateGroupTable(groupedTransactions['INSTAPAY'])}
        </div>
        
        <!-- Main Entries Table -->
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>التاريخ</th>
              <th>النوع</th>
              <th>المبلغ</th>
              <th>البيان</th>
              <th>بواسطة</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map((row, i) => `
              <tr class="${row.direction === 'IN' ? 'in-row' : 'out-row'}">
                <td>${i + 1}</td>
                <td>${formatDateTime(row.entryDate)}</td>
                <td>${resolveEntryTypeLabel(row.entryType)}</td>
                <td>${formatMoney(row.amount)}</td>
                <td>${row.notes || '-'}</td>
                <td>${row.createdByUser?.name || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="summary-box">
          <div class="summary-item">
            <span>إجمالي الوارد</span>
            <strong style="color: #16a34a;">${formatMoney(summary.totalIn)}</strong>
          </div>
          <div class="summary-item">
            <span>إجمالي المنصرف</span>
            <strong style="color: #dc2626;">${formatMoney(summary.totalOut)}</strong>
          </div>
          <div class="summary-item">
            <span>الصافي</span>
            <strong style="color: #0f3553;">${formatMoney(summary.net)}</strong>
          </div>
        </div>

        <div class="print-meta">
          تمت الطباعة بواسطة النظام يوم ${new Date().toLocaleString('ar-EG')}
        </div>
      </body>
      </html>
    `;
  };

  const handlePrintZReport = async () => {
    if (!dailyReport) {
      await safeAlert('لا يوجد تقرير متاح للطباعة');
      return;
    }

    const html = buildZReportHtml({ report: dailyReport, treasuryName: selectedTreasuryName, fromDate: reportFilters.fromDate, toDate: reportFilters.toDate });
    const result = await safePrint(html, { title: `تقرير  ${reportFilters.fromDate} - ${reportFilters.toDate}` });
    if (result?.error) await safeAlert(result.error);
  };

  const handlePrintTransactionsReport = async () => {
    if (!entries || entries.length === 0) {
      await safeAlert('لا توجد حركات للطباعة');
      return;
    }

    const html = buildTransactionsReportHtml({
      entries,
      summary: entriesSummary,
      filters,
      treasuryName: filters.treasuryId ? treasuries.find(t => t.id === Number(filters.treasuryId))?.name : 'كل الخزن',
      groupedTransactions
    });
    const result = await safePrint(html, { title: `تقرير الحركات ${filters.fromDate}` });
    if (result?.error) await safeAlert(result.error);
  };

  const handlePrintPaymentMethodReport = async (treasury, methodItem) => {
    // 1. Fetch data
    const res = await window.api.getPaymentMethodReport({
      treasuryId: treasury.id,
      paymentMethodId: paymentMethods.find(pm => pm.code === methodItem.code)?.id,
      fromDate: reportFilters.fromDate,
      toDate: reportFilters.toDate
    });

    if (res.error) {
      await safeAlert(res.error);
      return;
    }

    const { data, summary } = res;

    // 2. Build HTML
    const html = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>كشف حساب ${methodItem.name}</title>
        <style>
          body { font-family: 'Cairo', sans-serif; padding: 20px; direction: rtl; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
          h1 { margin: 0; font-size: 24px; color: #0f3553; }
          .meta { margin-top: 5px; font-size: 14px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: right; }
          th { background-color: #f3f4f6; font-weight: bold; color: #1f2937; }
          tr:nth-child(even) { background-color: #f9fafb; }
          .amount { font-weight: bold; direction: ltr; text-align: left; }
          .in-color { color: #16a34a; }
          .out-color { color: #dc2626; }
          .summary-box { display: flex; gap: 20px; margin-bottom: 20px; justify-content: center; background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; }
          .summary-item { text-align: center; }
          .summary-item strong { display: block; font-size: 16px; margin-top: 4px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>كشف حساب - ${methodItem.name}</h1>
          <div class="meta">
            الخزنة: ${treasury.name} | الفترة: ${reportFilters.fromDate || 'البداية'} إلي ${reportFilters.toDate || 'الآن'}
          </div>
        </div>

        <div class="summary-box">
          <div class="summary-item">
            <span>إجمالي الوارد</span>
            <strong style="color: #16a34a;">${formatMoney(summary.totalIn)}</strong>
          </div>
           <div class="summary-item">
            <span>إجمالي المنصرف</span>
            <strong style="color: #dc2626;">${formatMoney(summary.totalOut)}</strong>
          </div>
           <div class="summary-item">
            <span>الصافي</span>
            <strong style="color: #0f3553;">${formatMoney(summary.net)}</strong>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>النوع</th>
              <th>الاسم (العميل/المورد)</th>
              <th>المبلغ</th>
              <th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(row => `
              <tr>
                <td>${formatDateTime(row.entryDate)}</td>
                <td>${resolveEntryTypeLabel(row.entryType)}</td>
                <td>${row.entityName || '-'}</td>
                <td class="amount ${row.direction === 'IN' ? 'in-color' : 'out-color'}">
                  ${formatMoney(row.amount)}
                </td>
                <td>${row.notes || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div style="margin-top: 20px; font-size: 10px; color: #999; text-align: center;">
          تمت الطباعة: ${new Date().toLocaleString('ar-EG')}
        </div>
      </body>
      </html>
    `;

    // 3. Print
    await safePrint(html, { title: `كشف حساب ${methodItem.name}` });
  };

  // ── Expense handlers ──
  const loadExpenses = useCallback(async () => {
    setExpensesLoading(true);
    try {
      const [expRes, catRes] = await Promise.all([
        window.api.getExpenses({ fromDate: expenseFilters.fromDate, toDate: expenseFilters.toDate, categoryId: toInt(expenseFilters.categoryId) || undefined, userId: toInt(expenseFilters.userId) || undefined }),
        window.api.getExpenseCategories()
      ]);
      if (!expRes?.error) {
        // Sort expenses by ID descending (newest first)
        const sorted = (Array.isArray(expRes) ? expRes : []).sort((a, b) => b.id - a.id);
        setExpenses(sorted);
      }
      if (!catRes?.error) setExpenseCategories(Array.isArray(catRes) ? catRes : []);
    } catch (e) { /* silent */ }
    setExpensesLoading(false);
  }, [expenseFilters]);

  useEffect(() => { if (!bootstrapping) void loadExpenses(); }, [bootstrapping, loadExpenses]);

  const totalExpenses = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount || 0), 0), [expenses]);

  const openExpenseModal = useCallback((expense = null) => {
    setEditingExpense(expense);
    setExpenseModalOpen(true);
  }, []);

  const handleSaveExpense = useCallback(async (formData) => {
    const title = formData.title.trim();
    const amount = toAmount(formData.amount);
    if (!title) { await safeAlert('عنوان المصروف مطلوب'); return; }
    if (amount <= 0) { await safeAlert('المبلغ غير صحيح'); return; }

    setSubmitting(true);
    try {
      const payload = {
        title,
        amount,
        categoryId: toInt(formData.categoryId) || null,
        notes: formData.notes,
        expenseDate: formData.expenseDate,
        treasuryId: toInt(formData.treasuryId) || undefined,
        paymentMethodId: toInt(formData.paymentMethodId) || undefined
      };

      let res;
      if (editingExpense) {
        res = await window.api.updateExpense(editingExpense.id, payload);
      } else {
        res = await window.api.addExpense(payload);
      }
      if (res?.error) throw new Error(res.error);

      setExpenseModalOpen(false);
      setEditingExpense(null);
      await Promise.all([loadExpenses(), refreshAll()]);
    } catch (err) { await safeAlert(`تعذّر حفظ المصروف: ${err.message}`); }
    setSubmitting(false);
  }, [editingExpense, loadExpenses, refreshAll]);

  const handleDeleteExpense = async (expense) => {
    const confirmed = await safeConfirm(`هل تريد حذف المصروف "${expense.title}"؟`, { title: 'تأكيد حذف مصروف', buttons: ['حذف', 'إلغاء'] });
    if (!confirmed) return;
    setSubmitting(true);
    try {
      const res = await window.api.deleteExpense(expense.id);
      if (res?.error) throw new Error(res.error);
      await Promise.all([loadExpenses(), refreshAll()]);
    } catch (err) { await safeAlert(`تعذّر حذف المصروف: ${err.message}`); }
    setSubmitting(false);
  };

  const handleSaveCategory = async (formData, editingCat) => {
    const name = formData.name.trim();
    if (!name) { await safeAlert('اسم التصنيف مطلوب'); return false; }
    setSubmitting(true);
    try {
      let res;
      if (editingCat) {
        res = await window.api.updateExpenseCategory(editingCat.id, { name, color: formData.color });
      } else {
        res = await window.api.addExpenseCategory({ name, color: formData.color });
      }
      if (res?.error) throw new Error(res.error);

      // Removed setCategoryFormOpen(false) to allow multiple adds/edits
      await loadExpenses();
      setSubmitting(false);
      return true;
    } catch (err) {
      await safeAlert(`تعذّر حفظ التصنيف: ${err.message}`);
      setSubmitting(false);
      return false;
    }
  };

  const handleDeleteCategory = async (cat) => {
    const confirmed = await safeConfirm(`هل تريد حذف تصنيف "${cat.name}"؟`, { title: 'تأكيد حذف تصنيف', buttons: ['حذف', 'إلغاء'] });
    if (!confirmed) return;
    try {
      const res = await window.api.deleteExpenseCategory(cat.id);
      if (res?.error) throw new Error(res.error);
      await loadExpenses();
    } catch (err) { await safeAlert(`تعذّر حذف التصنيف: ${err.message}`); }
  };

  // ── Drill-down handlers ──
  const openDrillByEntryType = useCallback((entryType, label) => {
    const filtered = allDailyEntries.filter(e => e.entryType === entryType);
    setDrillDown({ isOpen: true, title: `تفاصيل: ${label}`, entries: filtered });
  }, [allDailyEntries]);

  const openDrillByPaymentMethod = useCallback((code, label) => {
    const normalizedCode = String(code).toUpperCase();
    const filtered = revenueEntries.filter(e => {
      const methodCode = String(e?.paymentMethod?.code || 'CASH').toUpperCase();
      return methodCode === normalizedCode;
    });
    setDrillDown({ isOpen: true, title: `تفاصيل: ${label}`, entries: filtered });
  }, [revenueEntries]);

  const openDrillByTreasury = useCallback((treasuryId, label) => {
    const filtered = revenueEntries.filter(e => {
      const tid = e?.treasury?.id || e?.treasuryId;
      return tid === treasuryId;
    });
    setDrillDown({ isOpen: true, title: `تفاصيل: ${label}`, entries: filtered });
  }, [revenueEntries]);

  const closeDrillDown = useCallback(() => {
    setDrillDown({ isOpen: false, title: '', entries: [] });
  }, []);

  return (
    <div className="treasury-page">

      {/* ── Tab Navigation ── */}
      <section className="treasury-panel">
        <div className="treasury-tabs">
          {TAB_OPTIONS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button 
                key={tab.id} 
                type="button" 
                className={`treasury-tab ${activeTab === tab.id ? 'active' : ''}`} 
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={18} style={{ marginInlineEnd: '8px' }} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {activeTab === 'treasuries' && (
        <section className="treasury-panel">
          <div className="panel-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Building2 size={22} className="panel-head-icon" />
              <h2>الخزن</h2>
            </div>
            <div className="panel-head-actions">
              <button className="treasury-btn secondary" type="button" onClick={openCreateTreasuryModal}>
                <Plus size={18} style={{ marginInlineEnd: '6px' }} />
                إضافة خزنة
              </button>
            </div>
          </div>
          <div className="treasury-balance-grid">
            {treasuries.map((treasury) => (
              <div className={`treasury-balance-card ${selectedReportTreasuryId === treasury.id ? 'selected' : ''}`} key={treasury.id}>
                <div className="card-top-row">
                  <strong>{treasury.name}</strong>
                  <div className="card-badges">
                    {treasury.isDefault && <span className="status-default">افتراضية</span>}
                    <span className={treasury.isActive ? 'status-active' : 'status-inactive'}>{treasury.isActive ? 'نشطة' : 'موقوفة'}</span>
                  </div>
                </div>
                <div className="card-amount-wrapper">
                  <div className="card-amount">{formatMoney(treasury.currentBalance)}</div>
                  <div className="card-meta"><span>الكود: {treasury.code || '-'}</span><span>القيود: {treasury?._count?.entries || 0}</span></div>
                </div>

                {/* Wallet Breakdown Section */}
                {treasury.breakdown && treasury.breakdown.length > 0 && (
                  <div className="treasury-breakdown">
                    {treasury.breakdown.map((item) => (
                      <div key={item.code} className="breakdown-item">
                        <div className="breakdown-info">
                          <span className="breakdown-name">{item.name}</span>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span className="breakdown-count">{item.count} عملية</span>
                            <button
                              type="button"
                              className="treasury-btn small ghost"
                              style={{ padding: '2px 6px', fontSize: '10px' }}
                              title="طباعة كشف حساب"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePrintPaymentMethodReport(treasury, item);
                              }}
                            >
                              🖨️
                            </button>
                          </div>
                        </div>
                        <span className="breakdown-balance" style={{ direction: 'ltr' }}>{formatMoney(item.balance)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="treasury-card-hint">
                  {treasury.hasLinkedOperations
                    ? <><Info size={14} style={{ marginInlineEnd: '6px' }} /> مرتبطة بعمليات (أرشفة آمنة)</>
                    : <><Check size={14} style={{ marginInlineEnd: '6px' }} /> يمكن الحذف النهائي</>}
                </div>
                <div className="treasury-card-actions">
                  <button
                    className="treasury-btn small ghost"
                    type="button"
                    disabled={submitting || treasury.isDefault}
                    onClick={() => void handleSetDefaultTreasury(treasury)}
                  >
                    {treasury.isDefault ? 'الخزنة الافتراضية' : 'تعيين كافتراضية'}
                  </button>
                  <button
                    className="treasury-btn small secondary"
                    type="button"
                    disabled={submitting || treasury.canEdit === false}
                    onClick={() => openEditTreasuryModal(treasury)}
                  >
                    تعديل
                  </button>
                  <button
                    className="treasury-btn small danger"
                    type="button"
                    disabled={submitting || treasury.canDelete === false}
                    onClick={() => void handleDeleteTreasury(treasury)}
                  >
                    حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'transactions' && (
        <section className="treasury-panel" style={{ height: 'calc(100vh - 180px)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div className="panel-head" style={{ flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <RefreshCw size={22} className="panel-head-icon" />
                <h2>حركات الخزنة</h2>
              </div>
              <div className="inline-filters" style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, marginRight: '16px' }}>
                {/* ... existing filters ... */}
                <select className="treasury-input small" value={filters.treasuryId} onChange={(e) => setFilters(p => ({ ...p, treasuryId: e.target.value }))} style={{ padding: '6px', fontSize: '0.9rem', width: 'auto' }}>
                  <option value="">كل الخزن</option>
                  {treasuries.map((row) => (<option key={row.id} value={row.id}>{row.name}</option>))}
                </select>
                <input className="treasury-input small" type="date" value={filters.fromDate} onChange={(e) => setFilters(p => ({ ...p, fromDate: e.target.value }))} style={{ padding: '6px', fontSize: '0.9rem', width: 'auto' }} />
                <input className="treasury-input small" type="date" value={filters.toDate} onChange={(e) => setFilters(p => ({ ...p, toDate: e.target.value }))} style={{ padding: '6px', fontSize: '0.9rem', width: 'auto' }} />
                <select className="treasury-input small" value={filters.direction} onChange={(e) => setFilters(p => ({ ...p, direction: e.target.value }))} style={{ padding: '6px', fontSize: '0.9rem', width: 'auto' }}>
                  <option value="ALL">كل الاتجاهات</option>
                  <option value="IN">وارد</option>
                  <option value="OUT">منصرف</option>
                </select>
                <select className="treasury-input small" value={filters.entryType} onChange={(e) => setFilters(p => ({ ...p, entryType: e.target.value }))} style={{ padding: '6px', fontSize: '0.9rem', width: 'auto' }}>
                  <option value="ALL">كل القيود</option>
                  {ENTRY_TYPE_OPTIONS.map((row) => (<option key={row} value={row}>{resolveEntryTypeLabel(row)}</option>))}
                </select>
                <select className="treasury-input small" value={filters.userId} onChange={(e) => setFilters(p => ({ ...p, userId: e.target.value }))} style={{ padding: '6px', fontSize: '0.9rem', width: 'auto' }}>
                  <option value="">كل المستخدمين</option>
                  {users.map((row) => (<option key={row.id} value={row.id}>{row.name}</option>))}
                </select>
              </div>
            </div>
            <div className="panel-head-actions">
              <button className="treasury-btn ghost" type="button" onClick={handlePrintTransactionsReport}>
                <Printer size={16} style={{ marginInlineEnd: '6px' }} />
                التقارير
              </button>
              <button className="treasury-btn secondary" type="button" onClick={() => setTransactionFormOpen(prev => !prev)}>
                {transactionFormOpen ? <><X size={16} style={{ marginInlineEnd: '6px' }} /> إغلاق النموذج</> : <><Plus size={16} style={{ marginInlineEnd: '6px' }} /> تسجيل حركة</>}
              </button>
            </div>
          </div>

          {/* ── Transaction Form (collapsible) ── */}
          {transactionFormOpen && (
            <div className="transaction-form-wrapper">
              <form className="treasury-form" onSubmit={handleCreateTransaction}>
                {/* Transaction Type Selector */}
                <div className="txn-type-selector">
                  {[
                    { value: 'IN', label: <><ArrowDown size={16} style={{ marginInlineEnd: '4px' }} /> وارد</>, cls: 'txn-type-in' }, 
                    { value: 'OUT', label: <><ArrowUp size={16} style={{ marginInlineEnd: '4px' }} /> منصرف</>, cls: 'txn-type-out' }, 
                    { value: 'TRANSFER', label: <><ArrowRightLeft size={16} style={{ marginInlineEnd: '4px' }} /> تحويل</>, cls: 'txn-type-transfer' }
                  ].map((opt) => (
                    <button key={opt.value} type="button" className={`txn-type-btn ${opt.cls} ${transactionForm.transactionType === opt.value ? 'active' : ''}`} onClick={() => setTransactionForm((prev) => ({ ...prev, transactionType: opt.value }))}>
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="treasury-form-grid">
                  {transactionForm.transactionType === 'TRANSFER' ? (
                    <>
                      <label className="field"><span>خزنة المصدر</span><select className="treasury-input" value={transactionForm.sourceTreasuryId} onChange={(e) => setTransactionForm((p) => ({ ...p, sourceTreasuryId: e.target.value }))}><option value="">اختر خزنة</option>{treasuries.map((row) => (<option key={`src-${row.id}`} value={row.id}>{row.name} ({formatMoney(row.currentBalance)})</option>))}</select></label>
                      <label className="field"><span>خزنة الوجهة</span><select className="treasury-input" value={transactionForm.targetTreasuryId} onChange={(e) => setTransactionForm((p) => ({ ...p, targetTreasuryId: e.target.value }))}><option value="">اختر خزنة</option>{treasuries.map((row) => (<option key={`dst-${row.id}`} value={row.id}>{row.name} ({formatMoney(row.currentBalance)})</option>))}</select></label>
                    </>
                  ) : (
                    <>
                      <label className="field"><span>الخزنة</span><select className="treasury-input" value={transactionForm.treasuryId} onChange={(e) => setTransactionForm((p) => ({ ...p, treasuryId: e.target.value }))}><option value="">اختر خزنة</option>{treasuries.map((row) => (<option key={row.id} value={row.id}>{row.name} ({formatMoney(row.currentBalance)})</option>))}</select></label>
                      <label className="field"><span>تصنيف القيد</span><select className="treasury-input" value={transactionForm.entryType} onChange={(e) => setTransactionForm((p) => ({ ...p, entryType: e.target.value }))}><option value="">اختياري</option>{ENTRY_TYPE_OPTIONS.map((row) => (<option key={row} value={row}>{resolveEntryTypeLabel(row)}</option>))}</select></label>
                    </>
                  )}
                  <label className="field"><span>المبلغ</span><input className="treasury-input" type="number" min="0" step="0.01" placeholder="0.00" value={transactionForm.amount} onChange={(e) => setTransactionForm((p) => ({ ...p, amount: e.target.value }))} required /></label>
                  <label className="field"><span>وسيلة الدفع</span><select className="treasury-input" value={transactionForm.paymentMethodId} onChange={(e) => setTransactionForm((p) => ({ ...p, paymentMethodId: e.target.value }))}><option value="">اختياري</option>{paymentMethods.map((row) => (<option key={row.id} value={row.id}>{resolveMethodName(row)}</option>))}</select></label>
                  <label className="field"><span>التاريخ</span><input className="treasury-input" type="date" value={transactionForm.entryDate} onChange={(e) => setTransactionForm((p) => ({ ...p, entryDate: e.target.value }))} /></label>
                  <label className="field"><span>ملاحظات</span><input className="treasury-input" placeholder="ملاحظات اختيارية..." value={transactionForm.notes} onChange={(e) => setTransactionForm((p) => ({ ...p, notes: e.target.value }))} /></label>
                </div>
                <button className="treasury-btn secondary" type="submit" disabled={submitting} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                  <Check size={18} style={{ marginInlineEnd: '6px' }} />
                  تسجيل الحركة
                </button>
              </form>
            </div>
          )}



          {/* ── KPI Summary ── */}
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 14 }}>
            <div className="kpi-card tone-net"><span><ArrowDown size={18} style={{ marginInlineEnd: '6px' }} /> إجمالي الوارد</span><strong className="in-text">{formatMoney(entriesSummary.totalIn)}</strong></div>
            <div className="kpi-card tone-returns"><span><ArrowUp size={18} style={{ marginInlineEnd: '6px' }} /> إجمالي المنصرف</span><strong className="out-text">{formatMoney(entriesSummary.totalOut)}</strong></div>
            <div className="kpi-card tone-cashflow"><span><PieChart size={18} style={{ marginInlineEnd: '6px' }} /> الصافي</span><strong>{formatMoney(entriesSummary.net)}</strong></div>
            <div className="kpi-card tone-balance">
              <span><Wallet size={18} style={{ marginInlineEnd: '6px' }} /> رصيد الخزنة الحالي</span>
              <strong>
                {filters.treasuryId
                  ? formatMoney(treasuries.find(t => t.id === Number(filters.treasuryId))?.currentBalance || 0)
                  : formatMoney(treasuries.reduce((sum, t) => sum + Number(t.currentBalance || 0), 0))}
              </strong>
            </div>
          </div>

          {/* ── Entries Count ── */}
          <div className="entries-count-bar">
            <span>عدد الحركات: <strong>{toArabicDigits(entries.length)}</strong></span>
          </div>

          {/* ── Grouped Tables ── */}
          {/* ── Main Table (All Transactions) ── */}
          <div className="table-wrap" style={{ marginBottom: '24px' }}>
            <table className="treasury-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>التاريخ</th>
                  <th>الخزنة</th>
                  <th>النوع</th>
                  <th>الاتجاه</th>
                  <th>المبلغ</th>
                  <th>الوسيلة</th>
                  <th>المستخدم</th>
                  <th>المرجع</th>
                  <th>الرصيد بعد</th>
                </tr>
              </thead>
              <tbody>
                {entriesLoading ? (
                  <tr><td colSpan="10" className="empty-cell">جاري التحميل...</td></tr>
                ) : entries.length === 0 ? (
                  <tr><td colSpan="10" className="empty-cell">لا توجد حركات في هذه الفترة</td></tr>
                ) : entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{toArabicDigits(entry.id)}</td>
                    <td>{formatDateTime(entry.entryDate || entry.createdAt)}</td>
                    <td>{entry?.treasury?.name || '-'}</td>
                    <td><span className="entry-type-badge">{resolveEntryTypeLabel(entry.entryType)}</span></td>
                    <td><span className={`direction-badge ${entry.direction === 'OUT' ? 'direction-out' : 'direction-in'}`}>{resolveDirectionLabel(entry.direction)}</span></td>
                    <td className={entry.direction === 'OUT' ? 'out-text' : 'in-text'}>{formatMoney(entry.amount)}</td>
                    <td>{resolveMethodName(entry)}</td>
                    <td style={{ fontSize: '0.85em', color: '#64748b' }}>{entry.createdByUser?.name || '-'}</td>
                    <td>{formatReference(entry)}</td>
                    <td><strong>{formatMoney(entry.balanceAfter)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Wallet Analysis Cards (Cash, Vodafone, InstaPay) ── */}
          <div className="report-grid">
            {['CASH', 'VODAFONE_CASH', 'INSTAPAY'].map(groupKey => {
              const group = groupedTransactions[groupKey];
              if (!group) return null;

              // Aggregate by entryType
              const analysis = {};
              group.entries.forEach(e => {
                const type = e.entryType;
                if (!analysis[type]) {
                  analysis[type] = {
                    type,
                    direction: e.direction,
                    amount: 0,
                    count: 0
                  };
                }
                analysis[type].amount += Number(e.amount || 0);
                analysis[type].count++;
              });

              const sortedAnalysis = Object.values(analysis).sort((a, b) => b.amount - a.amount);

              return (
                <div key={groupKey} className="treasury-report-card">
                  <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{group.icon} {group.title}</span>
                    <span className={group.totalIn - group.totalOut >= 0 ? 'in-text' : 'out-text'} style={{ fontSize: '0.9rem' }}>
                      الصافي: {formatMoney(group.totalIn - group.totalOut)}
                    </span>
                  </h3>
                  <table className="treasury-table compact">
                    <thead><tr><th>المصدر</th><th>الاتجاه</th><th>المبلغ</th><th>العدد</th></tr></thead>
                    <tbody>
                      {sortedAnalysis.length === 0 ? (
                        <tr><td colSpan="4" className="empty-cell">لا توجد حركات</td></tr>
                      ) : sortedAnalysis.map(row => (
                        <tr key={row.type}>
                          <td><span className="entry-type-badge">{resolveEntryTypeLabel(row.type)}</span></td>
                          <td><span className={`direction-badge ${row.direction === 'OUT' ? 'direction-out' : 'direction-in'}`}>{resolveDirectionLabel(row.direction)}</span></td>
                          <td className={row.direction === 'OUT' ? 'out-text' : 'in-text'}>{formatMoney(row.amount)}</td>
                          <td>{toArabicDigits(row.count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {activeTab === 'daily' && (
        <section className="treasury-panel">
          <div className="panel-head" style={{ flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <TrendingUp size={22} className="panel-head-icon" />
              <h2>لوحة الإيراد اليومي</h2>
            </div>
            <div className="panel-head-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div className="inline-filters" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <select 
                  className="treasury-input small" 
                  value={reportFilters.treasuryId} 
                  onChange={(e) => setReportFilters((p) => ({ ...p, treasuryId: e.target.value }))} 
                  style={{ padding: '8px 12px', fontSize: '0.9rem', width: 'auto', minWidth: '160px', borderRadius: '8px' }}
                >
                  <option value="">كل الخزن</option>
                  {treasuries.map((row) => (<option key={row.id} value={row.id}>{row.name}</option>))}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '4px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                   <span style={{fontSize: '0.85rem', color: '#64748b', fontWeight: '500'}}>من:</span>
                   <input 
                     className="treasury-input small" 
                     type="date" 
                     value={reportFilters.fromDate} 
                     onChange={(e) => setReportFilters((p) => ({ ...p, fromDate: e.target.value }))} 
                     style={{ padding: '4px', fontSize: '0.9rem', width: 'auto', border: 'none', background: 'transparent', outline: 'none' }} 
                   />
                   <div style={{ width: '1px', height: '16px', backgroundColor: '#cbd5e1', margin: '0 4px' }}></div>
                   <span style={{fontSize: '0.85rem', color: '#64748b', fontWeight: '500'}}>إلى:</span>
                   <input 
                     className="treasury-input small" 
                     type="date" 
                     value={reportFilters.toDate} 
                     onChange={(e) => setReportFilters((p) => ({ ...p, toDate: e.target.value }))} 
                     style={{ padding: '4px', fontSize: '0.9rem', width: 'auto', border: 'none', background: 'transparent', outline: 'none' }} 
                   />
                </div>
              </div>
              <div style={{ width: '1px', height: '24px', backgroundColor: '#e2e8f0', margin: '0 4px' }} className="hidden-mobile"></div>
              <button className="treasury-btn primary" type="button" onClick={handlePrintZReport} disabled={!dailyReport}>
                <Printer size={16} style={{ marginInlineEnd: '6px' }} />
                طباعة تقرير 
              </button>
            </div>
          </div>

          <div style={{ opacity: reportLoading ? 0.6 : 1, pointerEvents: reportLoading ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
              {/* ── Financial Summary Grid ── */}
              <div className="financial-summary-wrapper">
                <div className="financial-summary-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                  {/* Row 1: Sales, Paid, Remaining, Installments */}
                  <div className="fin-card revenue">
                    <div className="fin-icon"><Banknote size={24} /></div>
                    <div className="fin-content">
                      <div className="fin-label">إجمالي المبيعات</div>
                      <div className="fin-value">{formatMoney(salesSummary.totalSales || 0)}</div>
                    </div>
                  </div>
                  <div className="fin-card in">
                    <div className="fin-icon"><HandCoins size={24} /></div>
                    <div className="fin-content">
                      <div className="fin-label">المدفوع من المبيعات</div>
                      <div className="fin-value">{formatMoney(totalPaidFromSales)}</div>
                    </div>
                  </div>
                  <div className="fin-card out">
                    <div className="fin-icon"><Info size={24} /></div>
                    <div className="fin-content">
                      <div className="fin-label">المتبقي من المبيعات</div>
                      <div className="fin-value">{formatMoney(totalRemaining)}</div>
                    </div>
                  </div>
                  <div className="fin-card in">
                    <div className="fin-icon"><Scale size={24} /></div>
                    <div className="fin-content">
                      <div className="fin-label">أقساط العملاء</div>
                      <div className="fin-value">{formatMoney(revenueSummary.customerPayments || 0)}</div>
                    </div>
                  </div>

                  {/* Row 2: Returns (2 cols), Expenses (2 cols) */}
                  <div className="fin-card out" style={{ gridColumn: 'span 1' }}>
                    <div className="fin-icon"><RefreshCw size={24} /></div>
                    <div className="fin-content">
                      <div className="fin-label">المرتجعات</div>
                      <div className="fin-value">{formatMoney(salesSummary.totalReturns || 0)}</div>
                    </div>
                  </div>
                  <div className="fin-card out" style={{ gridColumn: 'span 1' }}>
                    <div className="fin-icon"><HandCoins size={24} /></div>
                    <div className="fin-content">
                      <div className="fin-label">المصروفات</div>
                      <div className="fin-value">{formatMoney(dailyExpenseTotal)}</div>
                    </div>
                  </div>

                  {/* Row 3: Disbursements (1 col), Net Revenue (3 cols) */}
                  <div className="fin-card out">
                    <div className="fin-icon"><ArrowUp size={24} /></div>
                    <div className="fin-content">
                      <div className="fin-label">أذون الصرف</div>
                      <div className="fin-value">{formatMoney(dailyManualOutTotal)}</div>
                    </div>
                  </div>
                  <div className="fin-card total" style={{ gridColumn: 'span 1' }}>
                    <div className="fin-icon"><TrendingUp size={24} /></div>
                    <div className="fin-content">
                      <div className="fin-label">صافي الإيراد (بعد خصم المصروفات)</div>
                      <div className="fin-value">{formatMoney(finalNetRevenue)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Aggregation Reports ── */}
              <div className="report-grid" style={{ marginTop: '12px' }}>
                <div className="treasury-report-card">
                  <h3><Scale size={18} style={{ marginInlineEnd: '8px' }} /> التجميع حسب المصدر</h3>
                  <table className="treasury-table compact">
                    <thead><tr><th>المصدر</th><th>الاتجاه</th><th>المبلغ</th><th>العدد</th><th>تفاصيل</th></tr></thead>
                    <tbody>
                      {byEntryType.filter(r => !['DEPOSIT_IN', 'DEPOSIT_REFUND'].includes(r.entryType)).length === 0 ? (
                        <tr><td colSpan="5" className="empty-cell">لا توجد بيانات</td></tr>
                      ) : byEntryType
                        .filter(r => !['DEPOSIT_IN', 'DEPOSIT_REFUND'].includes(r.entryType))
                        .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
                        .map((row) => (
                          <tr key={row.entryType}>
                            <td><span className="entry-type-badge">{resolveEntryTypeLabel(row.entryType)}</span></td>
                            <td><span className={`direction-badge ${row.net < 0 ? 'direction-out' : 'direction-in'}`}>{row.net < 0 ? 'منصرف' : 'وارد'}</span></td>
                            <td className={row.net < 0 ? 'out-text' : 'in-text'}>{formatMoney(Math.abs(row.net))}</td>
                            <td>{toArabicDigits(row.count)}</td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                className="drill-down-btn"
                                title="عرض التفاصيل"
                                onClick={() => openDrillByEntryType(row.entryType, resolveEntryTypeLabel(row.entryType))}
                              >
                                <Eye size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div className="treasury-report-card">
                  <h3><Banknote size={18} style={{ marginInlineEnd: '8px' }} /> التجميع حسب وسيلة الدفع</h3>
                  <table className="treasury-table compact">
                    <thead><tr><th>الوسيلة</th><th>الإيراد</th><th>العدد</th><th>النسبة</th><th>تفاصيل</th></tr></thead>
                    <tbody>
                      {revenueByMethod.length === 0 ? (
                        <tr><td colSpan="5" className="empty-cell">لا توجد بيانات</td></tr>
                      ) : revenueByMethod.map((row) => (
                        <tr key={`${row.code}-${row.paymentMethodId || 0}`}>
                          <td>{resolveMethodName(row)}</td>
                          <td className="in-text">{formatMoney(row.revenueAmount || row.amount || 0)}</td>
                          <td>{toArabicDigits(row.count || 0)}</td>
                          <td>{toArabicDigits(Number(row.percentOfRevenue || 0).toFixed(1))}%</td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="drill-down-btn"
                              title="عرض التفاصيل"
                              onClick={() => openDrillByPaymentMethod(row.code, resolveMethodName(row))}
                            >
                              <Eye size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="treasury-report-card">
                  <h3><Landmark size={18} style={{ marginInlineEnd: '8px' }} /> التجميع حسب الخزنة</h3>
                  <table className="treasury-table compact">
                    <thead><tr><th>الخزنة</th><th>صافي الإيراد</th><th>العدد</th><th>تفاصيل</th></tr></thead>
                    <tbody>
                      {revenueByTreasury.length === 0 ? (
                        <tr><td colSpan="4" className="empty-cell">لا توجد بيانات</td></tr>
                      ) : revenueByTreasury.map((row) => (
                        <tr key={`${row.treasuryId || row.treasuryName}`}>
                          <td>{row.treasuryName || '-'}</td>
                          <td className={Number(row.net || 0) >= 0 ? 'in-text' : 'out-text'}>{formatMoney(row.net || row.amount || 0)}</td>
                          <td>{toArabicDigits(row.count || 0)}</td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="drill-down-btn"
                              title="عرض التفاصيل"
                              onClick={() => openDrillByTreasury(row.treasuryId, row.treasuryName || 'الخزنة')}
                            >
                              <Eye size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Detailed Tables for Sales and Payments ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '12px', marginTop: '16px' }}>
                <div className="treasury-report-card" style={{ display: 'flex', flexDirection: 'column', maxHeight: '450px' }}>
                  <h3><TrendingUp size={18} style={{ marginInlineEnd: '8px', color: '#1d8b83' }} /> فواتير المبيعات (تفصيلي)</h3>
                  <div className="drilldown-table-wrap" style={{ flex: 1, minHeight: 0 }}>
                    <table className="treasury-table compact">
                      <thead>
                        <tr>
                          <th>العميل</th>
                          <th>المبلغ</th>
                          <th>الوسيلة</th>
                          <th>الخزنة</th>
                          <th>الوقت</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allDailyEntries.filter(e => e.entryType === 'SALE_INCOME').length === 0 ? (
                          <tr><td colSpan="5" className="empty-cell">لا توجد فواتير مبيعات اليوم</td></tr>
                        ) : allDailyEntries
                            .filter(e => e.entryType === 'SALE_INCOME')
                            .map((entry) => (
                              <tr key={entry.id}>
                                <td><strong>{entry.entityName || '-'}</strong></td>
                                <td className="in-text">{formatMoney(entry.amount)}</td>
                                <td>{resolveMethodName(entry)}</td>
                                <td>{entry?.treasury?.name || '-'}</td>
                                <td style={{ fontSize: '0.85em', color: '#64748b' }}>
                                  {new Date(entry.entryDate || entry.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                                </td>
                              </tr>
                            ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="treasury-report-card" style={{ display: 'flex', flexDirection: 'column', maxHeight: '450px' }}>
                  <h3><HandCoins size={18} style={{ marginInlineEnd: '8px', color: '#047857' }} /> التنزيل / دفع الأقساط (تفصيلي)</h3>
                  <div className="drilldown-table-wrap" style={{ flex: 1, minHeight: 0 }}>
                    <table className="treasury-table compact">
                      <thead>
                        <tr>
                          <th>العميل</th>
                          <th>المبلغ</th>
                          <th>الوسيلة</th>
                          <th>الخزنة</th>
                          <th>الوقت</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allDailyEntries.filter(e => e.entryType === 'CUSTOMER_PAYMENT').length === 0 ? (
                          <tr><td colSpan="5" className="empty-cell">لا توجد حركات دفع أقساط اليوم</td></tr>
                        ) : allDailyEntries
                            .filter(e => e.entryType === 'CUSTOMER_PAYMENT')
                            .map((entry) => (
                              <tr key={entry.id}>
                                <td><strong>{entry.entityName || '-'}</strong></td>
                                <td className="in-text">{formatMoney(entry.amount)}</td>
                                <td>{resolveMethodName(entry)}</td>
                                <td>{entry?.treasury?.name || '-'}</td>
                                <td style={{ fontSize: '0.85em', color: '#64748b' }}>
                                  {new Date(entry.entryDate || entry.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                                </td>
                              </tr>
                            ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

          </div>
        </section>
      )}

      {activeTab === 'expenses' && (
        <section className="treasury-panel" style={{ height: 'calc(100vh - 180px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="panel-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <HandCoins size={22} className="panel-head-icon" />
              <h2>المصروفات</h2>
            </div>
            <div className="panel-head-actions">
              <button className="treasury-btn secondary" type="button" onClick={() => openExpenseModal()}>
                <Plus size={18} style={{ marginInlineEnd: '6px' }} />
                إضافة مصروف
              </button>
              <button className="treasury-btn ghost neutral" type="button" onClick={() => setCategoryFormOpen(!categoryFormOpen)}>
                {categoryFormOpen ? <><X size={16} style={{ marginInlineEnd: '6px' }} /> إخفاء التصنيفات</> : <><Pencil size={16} style={{ marginInlineEnd: '6px' }} /> إدارة التصنيفات</>}
              </button>
            </div>
          </div>

          {/* Wrapper for fixed content (Manager + Filters + Summary) */}
          <div style={{ flexShrink: 0 }}>
            {/* Category manager */}
            {/* Category manager */}
            {categoryFormOpen && (
              <ExpenseCategoryManager
                categories={expenseCategories}
                onSave={handleSaveCategory}
                onDelete={handleDeleteCategory}
                submitting={submitting}
              />
            )}

            {/* Filters */}
            <div className="daily-filter-shell" style={{ marginBottom: 10 }}>
              <div className="daily-filter-grid">
                <label className="daily-filter-field"><span>من تاريخ</span><input className="treasury-input" type="date" value={expenseFilters.fromDate} onChange={(e) => setExpenseFilters(p => ({ ...p, fromDate: e.target.value }))} /></label>
                <label className="daily-filter-field"><span>إلى تاريخ</span><input className="treasury-input" type="date" value={expenseFilters.toDate} onChange={(e) => setExpenseFilters(p => ({ ...p, toDate: e.target.value }))} /></label>
                <label className="daily-filter-field"><span>التصنيف</span>
                  <select className="treasury-input" value={expenseFilters.categoryId} onChange={(e) => setExpenseFilters(p => ({ ...p, categoryId: e.target.value }))}>
                    <option value="">الكل</option>
                    {expenseCategories.map((cat) => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
                  </select>
                </label>
                <label className="daily-filter-field"><span>المستخدم</span>
                  <select className="treasury-input" value={expenseFilters.userId} onChange={(e) => setExpenseFilters(p => ({ ...p, userId: e.target.value }))}>
                    <option value="">الكل</option>
                    {users.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
                  </select>
                </label>
              </div>
            </div>

            {/* Summary */}
            <div className="kpi-grid" style={{ marginBottom: 10 }}>
              <div className="kpi-card tone-returns"><span>إجمالي المصروفات</span><strong>{formatMoney(totalExpenses)}</strong></div>
              <div className="kpi-card tone-cashflow"><span>عدد المصروفات</span><strong>{expenses.length}</strong></div>
            </div>
          </div>

          {/* Table */}
          <div className="table-wrap" style={{ flex: 1, overflowY: 'auto' }}>
            <table className="treasury-table">
              <thead><tr><th>#</th><th>العنوان</th><th>المبلغ</th><th>التصنيف</th><th>التاريخ</th><th>المستخدم</th><th>ملاحظات</th><th>إجراءات</th></tr></thead>
              <tbody>
                {expensesLoading ? (<tr><td colSpan="8" className="empty-cell">جاري التحميل...</td></tr>)
                  : expenses.length === 0 ? (<tr><td colSpan="8" className="empty-cell">لا توجد مصروفات</td></tr>)
                    : expenses.map((exp) => (
                      <tr key={exp.id}>
                        <td>{exp.id}</td>
                        <td><strong>{exp.title}</strong></td>
                        <td className="out-text">{formatMoney(exp.amount)}</td>
                        <td>{exp.category ? <span className="expense-category-badge" style={{ background: exp.category.color || '#64748b' }}>{exp.category.name}</span> : <span style={{ color: '#64748b' }}>—</span>}</td>
                        <td>{formatDateTime(exp.expenseDate || exp.createdAt)}</td>
                        <td style={{ fontSize: '0.85em', color: '#64748b' }}>{exp.createdByUser?.name || '-'}</td>
                        <td>{exp.notes || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                            <button className="treasury-btn small secondary" type="button" onClick={() => openExpenseModal(exp)} title="تعديل"><Pencil size={14} /></button>
                            <button className="treasury-btn small danger" type="button" disabled={submitting} onClick={() => void handleDeleteExpense(exp)} title="حذف"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Expense Modal */}
      {/* Expense Modal */}
      <ExpenseModal
        isOpen={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        onSave={handleSaveExpense}
        expenseToEdit={editingExpense}
        categories={expenseCategories}
        treasuries={treasuries}
        paymentMethods={paymentMethods}
        submitting={submitting}
      />

      {treasuryModalState.isOpen && (
        <div className="treasury-modal-overlay" onClick={closeTreasuryModal}>
          <div className="treasury-modal-box" onClick={(event) => event.stopPropagation()}>
            <div className="treasury-modal-head">
              <h3>{treasuryModalState.mode === 'edit' ? 'تعديل خزنة' : 'إضافة خزنة جديدة'}</h3>
              <button type="button" className="treasury-close-btn" onClick={closeTreasuryModal}><X size={20} /></button>
            </div>
            <form className="treasury-form" onSubmit={handleSaveTreasury}>
              <div className="treasury-form-grid">
                <label className="field">
                  <span>اسم الخزنة</span>
                  <input className="treasury-input" value={treasuryForm.name} onChange={(event) => setTreasuryForm((prev) => ({ ...prev, name: event.target.value }))} required />
                </label>
                <label className="field">
                  <span>الكود</span>
                  <input className="treasury-input" value={treasuryForm.code} onChange={(event) => setTreasuryForm((prev) => ({ ...prev, code: event.target.value }))} />
                </label>
                <label className="field">
                  <span>الرصيد الافتتاحي</span>
                  <input className="treasury-input" type="number" min="0" step="0.01" value={treasuryForm.openingBalance} onChange={(event) => setTreasuryForm((prev) => ({ ...prev, openingBalance: event.target.value }))} />
                </label>
                <label className="field">
                  <span>الوصف</span>
                  <input className="treasury-input" value={treasuryForm.description} onChange={(event) => setTreasuryForm((prev) => ({ ...prev, description: event.target.value }))} />
                </label>
                <label className="field field-full inline-check">
                  <input type="checkbox" checked={Boolean(treasuryForm.isDefault)} onChange={(event) => setTreasuryForm((prev) => ({ ...prev, isDefault: event.target.checked }))} />
                  جعلها الخزنة الافتراضية
                </label>
              </div>
              <div className="treasury-card-actions">
                <button className="treasury-btn primary" type="submit" disabled={submitting}>حفظ</button>
                <button className="treasury-btn ghost" type="button" onClick={closeTreasuryModal}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Drill-Down Detail Modal ── */}
      {drillDown.isOpen && (
        <div className="treasury-modal-overlay" onClick={closeDrillDown}>
          <div className="drilldown-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="treasury-modal-head">
              <h3><Eye size={20} style={{ marginInlineEnd: '8px' }} />{drillDown.title}</h3>
              <button type="button" className="treasury-close-btn" onClick={closeDrillDown}><X size={20} /></button>
            </div>

            {drillDown.entries.length === 0 ? (
              <div className="empty-cell" style={{ padding: '40px', textAlign: 'center' }}>لا توجد حركات تفصيلية</div>
            ) : (
              <>
                <div className="drilldown-summary-bar">
                  <span className="drilldown-summary-item">
                    <ArrowDown size={14} style={{ marginInlineEnd: '4px' }} />
                    وارد: <strong className="in-text">{formatMoney(drillDown.entries.filter(e => e.direction === 'IN').reduce((s, e) => s + Number(e.amount || 0), 0))}</strong>
                  </span>
                  <span className="drilldown-summary-item">
                    <ArrowUp size={14} style={{ marginInlineEnd: '4px' }} />
                    منصرف: <strong className="out-text">{formatMoney(drillDown.entries.filter(e => e.direction === 'OUT').reduce((s, e) => s + Number(e.amount || 0), 0))}</strong>
                  </span>
                  <span className="drilldown-summary-item">
                    عدد الحركات: <strong>{toArabicDigits(drillDown.entries.length)}</strong>
                  </span>
                </div>

                <div className="drilldown-table-wrap">
                  <table className="treasury-table compact">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>التاريخ</th>
                        <th>النوع</th>
                        <th>العميل/المورد</th>
                        <th>الاتجاه</th>
                        <th>المبلغ</th>
                        <th>الوسيلة</th>
                        <th>الخزنة</th>
                        <th>المستخدم</th>
                        <th>ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drillDown.entries.map((entry, idx) => (
                        <tr key={entry.id || idx}>
                          <td>{toArabicDigits(idx + 1)}</td>
                          <td>{formatDateTime(entry.entryDate || entry.createdAt)}</td>
                          <td><span className="entry-type-badge">{resolveEntryTypeLabel(entry.entryType)}</span></td>
                          <td>{entry.entityName || '-'}</td>
                          <td>
                            <span className={`direction-badge ${entry.direction === 'OUT' ? 'direction-out' : 'direction-in'}`}>
                              {resolveDirectionLabel(entry.direction)}
                            </span>
                          </td>
                          <td className={entry.direction === 'OUT' ? 'out-text' : 'in-text'}>{formatMoney(entry.amount)}</td>
                          <td>{resolveMethodName(entry)}</td>
                          <td>{entry?.treasury?.name || '-'}</td>
                          <td style={{ fontSize: '0.85em', color: '#64748b' }}>{entry.createdByUser?.name || '-'}</td>
                          <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={entry.notes || ''}>{entry.notes || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
