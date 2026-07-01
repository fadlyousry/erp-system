import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue } from 'react';
import { safeAlert } from '../utils/safeAlert';
import { safeConfirm } from '../utils/safeConfirm';
import { Plus, Search, Settings } from 'lucide-react';
import CustomerLedger from './CustomerLedger';
import NewCustomerModal from '../components/NewCustomerModal';
import PaymentModal from '../components/PaymentModal';
import { filterPosPaymentMethods } from '../utils/paymentMethodFilters';
import CustomersTable from '../components/customers/CustomersTable';
import CustomersQuickStats from '../components/customers/CustomersQuickStats';
import CustomerImportHandler from '../components/customers/CustomerImportHandler';
import { getLocalDateString } from '../utils/dateUtils';
import { CUSTOMER_COMMAND_EVENT } from '../utils/customerBridge';
import { safePrint } from '../../printing/safePrint';
import { generateOverdueReportHTML } from '../../printing/generators/customerReportGenerator';
import './Customers.css';

const useDebouncedValue = (value, delayMs) => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
};

const formatCurrency = (value) => {
  try {
    const num = typeof value === 'string' ? parseFloat(value || 0) : (value || 0);
    return new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: 'EGP',
      maximumFractionDigits: 2
    }).format(num);
  } catch (e) {
    return value;
  }
};

const useWorkspaceState = (key, initialValue, tabId) => {
  const [state, setState] = useState(() => {
    try {
      const saved = sessionStorage.getItem(`customer_ws_${tabId}_${key}`);
      if (saved !== null) return JSON.parse(saved);
    } catch (e) { }
    return initialValue;
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(`customer_ws_${tabId}_${key}`, JSON.stringify(state));
    } catch (e) { }
  }, [key, state, tabId]);

  return [state, setState];
};

export function CustomerWorkspace({ tabId, tabTitle, isActive }) {
  const [initialLoading, setInitialLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showLedger, setShowLedger] = useWorkspaceState('showLedger', null, tabId);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [searchTerm, setSearchTerm] = useWorkspaceState('searchTerm', '', tabId);
  const [filterType, setFilterType] = useWorkspaceState('filterType', 'all', tabId);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(-1);
  const listRef = useRef(null);
  const searchInputRef = useRef(null);
  const customerImportInputRef = useRef(null);
  const hasLoadedOnceRef = useRef(false);

  const [visibleColumns, setVisibleColumns] = useWorkspaceState('visibleColumns', {
    id: true,
    name: true,
    type: true,
    phone: true,
    phone2: false,
    address: false,
    city: true,
    district: false,
    notes: false,
    creditLimit: false,
    balance: true,
    actions: true,
  }, tabId);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    phone2: '',
    address: '',
    city: '',
    district: '',
    notes: '',
    creditLimit: 0,
    customerType: 'عادي'
  });
  const [paymentData, setPaymentData] = useState({ amount: '', notes: '', paymentDate: getLocalDateString() });
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  // تحديث النقطة الحمراء للعملاء من الإعدادات العامة (السايد بار)
  const [overdueThreshold] = useState(() => parseInt(localStorage.getItem('overdueThreshold') || '30'));

  // Client-side pagination & sorting state
  const [currentPage, setCurrentPage] = useWorkspaceState('currentPage', 1, tabId);
  const PAGE_SIZE = 50;
  const [sortCol, setSortCol] = useWorkspaceState('sortCol', 'createdAt', tabId);
  const [sortDir, setSortDir] = useWorkspaceState('sortDir', 'desc', tabId);
  const [columnSearch, setColumnSearch] = useWorkspaceState('columnSearch', {}, tabId);
  const [showSearchRow, setShowSearchRow] = useWorkspaceState('showSearchRow', false, tabId);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [customerLookup, setCustomerLookup] = useState([]);
  const [loadingCustomerLookup, setLoadingCustomerLookup] = useState(false);

  // تحسين سلاسة الإدخال: نؤخر حساب نتائج البحث الثقيلة عن الكتابة الفورية
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 120);
  const deferredSearchTerm = useDeferredValue(debouncedSearchTerm);
  const filteredSearchTerm = useMemo(() => deferredSearchTerm.trim().toLowerCase(), [deferredSearchTerm]);
  const debouncedColumnSearch = useDebouncedValue(columnSearch, 80);
  const normalizedColumnSearch = useMemo(() => (
    Object.fromEntries(
      Object.entries(debouncedColumnSearch || {})
        .map(([key, value]) => [key, String(value ?? '').trim()])
        .filter(([, value]) => value !== '')
    )
  ), [debouncedColumnSearch]);

  // Reset الصفحة عند تغيير البحث أو الفلتر
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredSearchTerm, filterType, debouncedColumnSearch, sortCol, sortDir]);

  // Auto-focus search input when tab becomes active
  useEffect(() => {
    if (isActive && !initialLoading && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isActive, initialLoading]);

  const loadPaymentMethods = useCallback(async () => {
    try {
      const methods = await window.api.getPaymentMethods();
      if (Array.isArray(methods)) {
        setPaymentMethods(filterPosPaymentMethods(methods));
      }
    } catch (error) {
      console.error('Failed to load payment methods:', error);
    }
  }, []);

  useEffect(() => {
    const handleExport = (e) => {
      if (e.detail?.tabId === tabId) {
        downloadCustomerTemplate();
      }
    };
    const handleAdd = (e) => {
      if (e.detail?.tabId === tabId) {
        openNewCustomerModal();
      }
    };
    window.addEventListener('customers-export', handleExport);
    window.addEventListener('customers-add', handleAdd);

    const handleCustomerCommand = (e) => {
      if (!isActive) return;
      const { action, data } = e.detail;

      if (action === 'CREATE') {
        setEditingCustomer(null);
        setFormData({
          name: data.name || '',
          phone: data.phone || '',
          phone2: '',
          address: '',
          city: '',
          district: '',
          notes: 'مضاف بواسطة المساعد الذكي',
          creditLimit: 0,
          customerType: 'عادي'
        });
        setShowModal(true);
      } else if (action === 'UPDATE') {
        const nameToSearch = data.name || '';
        if (nameToSearch) {
          // Search in customerLookup for the best match
          const matched = customerLookup.find(c =>
            c.name.toLowerCase().includes(nameToSearch.toLowerCase())
          );

          if (matched) {
            // Open edit modal for the matched customer
            handleEditCallback(matched).then(() => {
              // Override formData with AI-provided info (e.g., new phone)
              if (data.phone) {
                setFormData(prev => ({
                  ...prev,
                  phone: data.phone
                }));
              }
            });
            showToast(`✨ تم العثور على العميل: ${matched.name} وتجهيز التعديل`, "info");
          } else {
            setSearchTerm(nameToSearch);
            showToast(`لم أجد عميلاً باسم "${nameToSearch}"، جرب البحث يدوياً`, "warning");
          }
        }
      } else if (action === 'VIEW_LEDGER') {
        if (data && data.id) {
          setShowLedger(data.id);
          if (data.name) {
            setSearchTerm(data.name);
          }
        }
      }
    };
    window.addEventListener(CUSTOMER_COMMAND_EVENT, handleCustomerCommand);

    return () => {
      window.removeEventListener('customers-export', handleExport);
      window.removeEventListener('customers-add', handleAdd);
      window.removeEventListener(CUSTOMER_COMMAND_EVENT, handleCustomerCommand);
    };
  }, [tabId, isActive]);

  // Server-side state
  const [paginatedCustomers, setPaginatedCustomers] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [customerStats, setCustomerStats] = useState({
    vipCount: 0,
    debtedCount: 0,
    compliantCount: 0,
    totalDebt: 0,
    overdueCount: 0
  });

  const fetchCustomersAndStats = useCallback(async () => {
    const isFirstLoad = !hasLoadedOnceRef.current;
    try {
      if (isFirstLoad) {
        setInitialLoading(true);
      } else {
        setIsRefreshing(true);
      }

      const params = {
        page: currentPage,
        pageSize: PAGE_SIZE,
        searchTerm: filteredSearchTerm,
        customerType: filterType === 'all' ? null : (filterType === 'overdue' ? null : filterType),
        overdueOnly: filterType === 'overdue' ? true : false,
        columnFilters: normalizedColumnSearch,
        sortCol,
        sortDir,
        overdueThreshold
      };

      const [customersRes, statsRes] = await Promise.all([
        window.api.getCustomers(params),
        window.api.getCustomerStats({
          overdueThreshold,
          searchTerm: filteredSearchTerm,
          customerType: filterType === 'all' ? null : (filterType === 'overdue' ? null : filterType),
          overdueOnly: filterType === 'overdue' ? true : false,
          columnFilters: normalizedColumnSearch
        })
      ]);

      if (customersRes && !customersRes.error) {
        setPaginatedCustomers(customersRes.data || []);
        setTotalItems(customersRes.total || 0);
        setTotalPages(customersRes.totalPages || 1);
      }

      if (statsRes && !statsRes.error) {
        setCustomerStats(statsRes);
      }

      hasLoadedOnceRef.current = true;
    } catch (err) {
      console.error('💥 [FRONTEND] استثناء في تحميل العملاء:', err);
      safeAlert('خطأ في تحميل بيانات العملاء: ' + err.message);
    } finally {
      if (isFirstLoad) {
        setInitialLoading(false);
      } else {
        setIsRefreshing(false);
      }
    }
  }, [currentPage, filteredSearchTerm, filterType, sortCol, sortDir, overdueThreshold, normalizedColumnSearch]);

  const loadCustomerLookup = useCallback(async ({ force = false } = {}) => {
    if (loadingCustomerLookup) return customerLookup;
    if (!force && customerLookup.length > 0) return customerLookup;

    setLoadingCustomerLookup(true);
    try {
      const lookupRes = await window.api.getCustomerLookup();
      if (lookupRes?.error) {
        throw new Error(lookupRes.error);
      }

      const rows = Array.isArray(lookupRes)
        ? lookupRes
        : (Array.isArray(lookupRes?.data) ? lookupRes.data : []);
      setCustomerLookup(rows);
      return rows;
    } catch (err) {
      console.error('Failed to load customer lookup:', err);
      safeAlert('خطأ في تحميل قائمة مطابقة العملاء: ' + (err?.message || 'خطأ غير متوقع'));
      return [];
    } finally {
      setLoadingCustomerLookup(false);
    }
  }, [customerLookup, loadingCustomerLookup]);

  const ensureCustomerLookup = useCallback(async () => {
    const rows = await loadCustomerLookup();
    return Array.isArray(rows);
  }, [loadCustomerLookup]);

  const refreshCustomers = useCallback(async ({ reloadLookup = false } = {}) => {
    await fetchCustomersAndStats();
    if (reloadLookup) {
      await loadCustomerLookup({ force: true });
    }
  }, [fetchCustomersAndStats, loadCustomerLookup]);

  const refreshCustomersWithLookup = useCallback(async () => {
    await refreshCustomers({ reloadLookup: true });
  }, [refreshCustomers]);

  useEffect(() => {
    fetchCustomersAndStats();
  }, [fetchCustomersAndStats]);

  useEffect(() => {
    loadPaymentMethods();
  }, [loadPaymentMethods]);

  const resetCustomerForm = () => {
    setFormData({
      name: '',
      phone: '',
      phone2: '',
      address: '',
      city: '',
      district: '',
      notes: '',
      creditLimit: 0,
      customerType: 'عادي'
    });
  };

  const saveCustomer = async () => {
    try {
      if (editingCustomer) {
        const result = await window.api.updateCustomer(editingCustomer.id, formData);

        if (result.error) {
          console.error('Error updating customer:', result.error);
          safeAlert(result.error);
          return;
        }
      } else {
        const result = await window.api.addCustomer(formData);

        if (result.error) {
          console.error('Error adding customer:', result.error);
          safeAlert(result.error);
          return;
        }
      }

      setShowModal(false);
      resetCustomerForm();
      setEditingCustomer(null);
      await refreshCustomers({ reloadLookup: true });
    } catch (err) {
      console.error('Exception saving customer:', err);
      safeAlert('خطأ في حفظ البيانات: ' + err.message);
    }
  };

  const closeCustomerModal = () => {
    setShowModal(false);
    setEditingCustomer(null);
    resetCustomerForm();
  };

  const openNewCustomerModal = async () => {
    await ensureCustomerLookup();
    setEditingCustomer(null);
    resetCustomerForm();
    setShowModal(true);
  };

  const downloadCustomerTemplate = () => {
    const templateButton = document.getElementById('hidden-download-template-btn');
    templateButton?.click();
  };

  const submitPayment = async (paymentFormData) => {
    const paymentAmount = parseFloat(paymentFormData.amount);

    if (isNaN(paymentAmount) || paymentAmount === 0) {
      safeAlert('الرجاء إدخال مبلغ صالح (غير صفر)');
      return;
    }

    const previewNewBalance = (selectedCustomer.balance - paymentAmount).toFixed(2);
    const paymentDate = new Date(paymentFormData.paymentDate);
    const confirmText = `سوف تُسجّل دفعة بقيمة ${formatCurrency(paymentAmount)} بتاريخ ${paymentDate.toLocaleDateString('ar-EG')}\nالرصيد بعد التسجيل: ${previewNewBalance}\n\nهل تريد المتابعة؟`;
    const confirmed = await safeConfirm(confirmText, {
      title: 'تأكيد تسجيل الدفعة',
      buttons: ['تأكيد', 'إلغاء']
    });
    if (!confirmed) return;

    setPaymentSubmitting(true);
    try {
      const payload = {
        customerId: selectedCustomer.id,
        amount: paymentAmount,
        notes: paymentFormData.notes || '',
        paymentDate: paymentFormData.paymentDate,
        paymentMethodId: parseInt(paymentFormData.paymentMethodId, 10)
          || parseInt(paymentMethods[0]?.id, 10)
          || 1
      };

      const result = await window.api.addCustomerPayment(payload);

      if (!result.error) {
        await refreshCustomers();
        setPaymentData({ amount: '', notes: '', paymentDate: getLocalDateString() });
      } else {
        console.error('Error submitting payment:', result.error);
      }

      return result;
    } catch (err) {
      console.error('Exception submitting payment:', err);
      safeAlert('خطأ في التسجيل: ' + err.message);
    } finally {
      setPaymentSubmitting(false);
    }
  };

  // Callbacks للأزرار - تمنع إعادة إنشاء الدوال في كل render
  const handleShowLedger = useCallback((customerId) => {
    setShowLedger(customerId);
  }, []);

  const handlePaymentCallback = useCallback((customer) => {
    setSelectedCustomer(customer);
    setPaymentData({ amount: '', notes: '', paymentDate: getLocalDateString() });
    setShowPaymentModal(true);
  }, []);

  const handleEditCallback = useCallback(async (customer) => {
    await ensureCustomerLookup();
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone || '',
      phone2: customer.phone2 || '',
      address: customer.address || '',
      city: customer.city || '',
      district: customer.district || '',
      notes: customer.notes || '',
      creditLimit: customer.creditLimit || 0,
      customerType: customer.customerType || 'عادي'
    });
    setShowModal(true);
  }, [ensureCustomerLookup]);

  const handleDeleteCallback = useCallback(async (id) => {
    const customer = paginatedCustomers.find((row) => row.id === id);
    const customerName = customer?.name || `#${id}`;
    const confirmed = await safeConfirm(
      `سيتم حذف العميل "${customerName}". هل تريد المتابعة؟`,
      { title: 'حذف عميل' }
    );
    if (!confirmed) return;

    try {
      const result = await window.api.deleteCustomer(id);

      if (result?.error) {
        await safeAlert(result.error, null, { type: 'error', title: 'تعذر الحذف' });
        return;
      }

      await refreshCustomers({ reloadLookup: true });
      await safeAlert('تم حذف العميل بنجاح', null, { type: 'success', title: 'العملاء' });
    } catch (err) {
      await safeAlert(err?.message || 'تعذر حذف العميل', null, { type: 'error', title: 'تعذر الحذف' });
    }
  }, [paginatedCustomers, refreshCustomers]);

  // البحث والفلترة
  const handleColumnSearchChange = useCallback((field, value) => {
    setColumnSearch(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const toggleColumn = useCallback((column) => {
    setVisibleColumns(prev => ({
      ...prev,
      [column]: !prev[column]
    }));
  }, []);

  // معالج الأسهم والـ Enter للتنقل في البحث
  const handleSearchKeyDown = useCallback((e) => {
    if (paginatedCustomers.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSearchIndex(prev => {
        if (prev < paginatedCustomers.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSearchIndex(prev => {
        if (prev > 0) {
          return prev - 1;
        }
        return 0;
      });
    } else if (e.key === 'Enter' && selectedSearchIndex >= 0) {
      e.preventDefault();
      handlePaymentCallback(paginatedCustomers[selectedSearchIndex]);
    }
  }, [paginatedCustomers, selectedSearchIndex, handlePaymentCallback]);

  // Reset الاختيار عند تغيير البحث
  useEffect(() => {
    setSelectedSearchIndex(-1);
  }, [filteredSearchTerm, filterType, normalizedColumnSearch, currentPage]);

  useEffect(() => {
    if (selectedSearchIndex >= 0 && listRef.current) {
      listRef.current.scrollToItem(selectedSearchIndex, 'smart');
    }
  }, [selectedSearchIndex]);

  const handlePrintOverdue = useCallback(async () => {
    try {
      // جلب جميع العملاء المتأخرين (بحد أقصى 500 عميل للتقرير)
      const params = {
        page: 1,
        pageSize: 500,
        overdueOnly: true,
        overdueThreshold
      };

      const res = await window.api.getCustomers(params);
      if (res?.data && res.data.length > 0) {
        const html = generateOverdueReportHTML(res.data, overdueThreshold);
        await safePrint(html, { title: 'تقرير العملاء المتأخرين', silent: false });
      } else {
        safeAlert('لا يوجد عملاء متأخرين حالياً لطباعة التقرير');
      }
    } catch (err) {
      console.error('Failed to print overdue report:', err);
      safeAlert('فشل في إنشاء التقرير: ' + err.message);
    }
  }, [overdueThreshold]);



  return (
    <div className="customers-workspace">
      {/* البحث والفلترة والأعمدة */}
      <div className="customers-toolbar" style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto auto',
        gap: '15px',
        marginBottom: '20px',
        alignItems: 'center',
        padding: '10px',
        backgroundColor: '#fff',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
      }}>
        {/* البحث */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', position: 'relative' }}>
          <Search size={20} color="#94a3b8" style={{ position: 'absolute', right: '12px', zIndex: 1, pointerEvents: 'none' }} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="إبحث عن عميل (الاسم، الهاتف، المدينة)... "
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            style={{
              flex: 1,
              padding: '12px 42px 12px 15px',
              border: '1.5px solid #e2e8f0',
              borderRadius: '10px',
              fontSize: '15px',
              outline: 'none',
              transition: 'all 0.2s',
              backgroundColor: '#f8fafc',
              textAlign: 'right',
              width: '100%'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#007accff';
              e.target.style.backgroundColor = '#fff';
              e.target.style.boxShadow = '0 0 0 4px rgba(0, 138, 230, 0.1)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#e2e8f0';
              e.target.style.backgroundColor = '#f8fafc';
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>

        {/* نوع العميل */}
        <div style={{ display: 'flex', gap: '8px', padding: '4px', backgroundColor: '#f1f5f9', borderRadius: '10px' }}>
          {[
            { id: 'all', label: 'الكل' },

            { id: 'overdue', label: 'متأخر' }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setFilterType(item.id)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: filterType === item.id ? '#fff' : 'transparent',
                color: filterType === item.id ? '#008ae6' : '#64748b',
                fontSize: '14px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: filterType === item.id ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* عرض/إخفاء صف البحث */}
        <button
          onClick={() => setShowSearchRow(!showSearchRow)}
          style={{
            padding: '10px',
            borderRadius: '10px',
            border: '1.5px solid #e2e8f0',
            backgroundColor: showSearchRow ? '#eff6ff' : 'white',
            color: showSearchRow ? '#2563eb' : '#64748b',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="بحث في الأعمدة"
        >
          <Search size={20} />
        </button>

        {/* إدارة الأعمدة */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowColumnMenu(!showColumnMenu)}
            style={{
              padding: '10px',
              borderRadius: '10px',
              border: '1.5px solid #e2e8f0',
              backgroundColor: showColumnMenu ? '#eff6ff' : 'white',
              color: showColumnMenu ? '#2563eb' : '#64748b',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="تخصيص الأعمدة"
          >
            <Settings size={20} />
          </button>

          {showColumnMenu && (
            <>
              <div
                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
                onClick={() => setShowColumnMenu(false)}
              />
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                zIndex: 1000,
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                padding: '16px',
                minWidth: '220px',
                marginTop: '10px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#1e293b' }}>تخصيص الأعمدة</span>
                </div>
                <div style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
                  {Object.keys(visibleColumns).map((col) => (
                    <label
                      key={col}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '8px 4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: '#475569',
                        transition: 'background 0.2s',
                        borderRadius: '6px'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns[col]}
                        onChange={() => toggleColumn(col)}
                        style={{ cursor: 'pointer' }}
                      />
                      {col === 'id' ? 'الكود' : col === 'name' ? 'الاسم' : col === 'type' ? 'النوع' : col === 'phone' ? 'الهاتف' : col === 'phone2' ? 'هاتف 2' : col === 'address' ? 'العنوان' : col === 'city' ? 'المدينة' : col === 'district' ? 'المنطقة' : col === 'notes' ? 'ملاحظات' : col === 'creditLimit' ? 'حد الائتمان' : col === 'balance' ? 'الرصيد' : col === 'actions' ? 'الإجراءات' : col}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* إحصائيات سريعة */}
      <CustomersQuickStats
        totalCount={totalItems}
        totalDebt={customerStats.totalDebt}
        overdueCount={customerStats.overdueCount}
        overdueThreshold={overdueThreshold}
        filteredCount={totalItems}
        onPrintOverdue={handlePrintOverdue}
      />

      <div className="card customers-table-card">
        <CustomersTable
          customers={paginatedCustomers}
          visibleColumns={visibleColumns}
          showSearchRow={showSearchRow}
          columnSearch={columnSearch}
          onColumnSearchChange={handleColumnSearchChange}
          selectedIndex={selectedSearchIndex}
          sortCol={sortCol}
          sortDir={sortDir}
          onSortChange={(col) => {
            if (sortCol === col) {
              setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
            } else {
              setSortCol(col);
              setSortDir('asc');
            }
          }}
          overdueThreshold={overdueThreshold}
          highlightTerm={filteredSearchTerm}
          onShowLedger={handleShowLedger}
          onPayment={handlePaymentCallback}
          onEdit={handleEditCallback}
          onDelete={handleDeleteCallback}
          listRef={listRef}
        />
      </div>

      {/* Pagination Controls */}
      <div className="customers-pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '7px 20px', gap: '20px', borderTop: '1px solid #e5e7eb' }}>
        <button
          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
          disabled={currentPage === 1}
          style={{
            padding: '10px 22px',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            background: currentPage === 1 ? '#f1f5f9' : 'linear-gradient(to bottom, #ffffff, #f8fafc)',
            color: currentPage === 1 ? '#94a3b8' : '#334155',
            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
            fontWeight: '600',
            boxShadow: currentPage === 1 ? 'none' : '0 1px 3px rgba(0,0,0,0.05)',
            transition: 'all 0.2s'
          }}
        >
          → السابق
        </button>
        <span style={{ fontWeight: 'bold' }}>صفحة {currentPage} من {totalPages} (إجمالي {totalItems})</span>
        {isRefreshing && (
          <span style={{ fontSize: '12px', color: '#6b7280' }}>Refreshing...</span>
        )}
        <button
          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
          disabled={currentPage === totalPages}
          style={{
            padding: '10px 22px',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            background: currentPage === totalPages ? '#f1f5f9' : 'linear-gradient(to bottom, #ffffff, #f8fafc)',
            color: currentPage === totalPages ? '#94a3b8' : '#334155',
            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
            fontWeight: '600',
            boxShadow: currentPage === totalPages ? 'none' : '0 1px 3px rgba(0,0,0,0.05)',
            transition: 'all 0.2s'
          }}
        >
          التالي ←
        </button>
      </div>

      <CustomerImportHandler
        allCustomers={customerLookup}
        refreshCustomers={refreshCustomersWithLookup}
        inputRef={customerImportInputRef}
      />

      <NewCustomerModal
        isOpen={showModal}
        customer={formData}
        onChange={setFormData}
        onSave={saveCustomer}
        existingCustomers={customerLookup}
        editingCustomerId={editingCustomer?.id}
        isEditMode={!!editingCustomer}
        onClose={closeCustomerModal}
        title={editingCustomer ? 'تعديل بيانات عميل' : 'إضافة عميل جديد'}
        zIndex={1200}
      />

      <PaymentModal
        isOpen={showPaymentModal}
        selectedCustomer={selectedCustomer}
        paymentData={paymentData}
        onSubmit={submitPayment}
        onClose={() => setShowPaymentModal(false)}
        isSubmitting={paymentSubmitting}
        paymentMethods={paymentMethods}
      />

      {/* Customer Ledger */}
      {
        showLedger && (
          <CustomerLedger
            customerId={showLedger}
            onClose={() => {
              setShowLedger(null);
            }}
            onDataChanged={() => {
              refreshCustomers();
            }}
            onEditCustomer={handleEditCallback}
          />
        )
      }
    </div >
  );
}

const CustomerTab = ({ tab, isActive, onSelect, onClose, canClose }) => {
  return (
    <div
      onClick={onSelect}
      style={{
        padding: "10px 18px",
        background: isActive ? "linear-gradient(135deg, #03273fff 0%, #002a5aff 100%)" : "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
        color: isActive ? "white" : "#475569",
        borderRadius: "12px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        minWidth: "140px",
        height: "42px",
        justifyContent: "space-between",
        boxShadow: isActive ? "0 4px 12px rgba(0, 138, 230, 0.3)" : "inset 0 0 0 1px #e2e8f0",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        fontWeight: isActive ? "700" : "600",
        fontSize: "14px",
        transform: isActive ? "translateY(-2px)" : "translateY(0)",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)";
          e.currentTarget.style.transform = "translateY(-1px)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)";
          e.currentTarget.style.transform = "translateY(0)";
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: isActive ? '#7dd3fc' : '#cbd5e1'
        }} />
        <span>{tab.title}</span>
      </div>
      {canClose && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            backgroundColor: isActive ? "rgba(255,255,255,0.2)" : "transparent",
            color: isActive ? "white" : "#94a3b8",
            fontSize: "14px",
            transition: "all 0.2s",
            marginLeft: "8px"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = isActive ? "rgba(255,255,255,0.3)" : "#e2e8f0";
            e.currentTarget.style.color = isActive ? "white" : "#ef4444";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = isActive ? "rgba(255,255,255,0.2)" : "transparent";
            e.currentTarget.style.color = isActive ? "white" : "#94a3b8";
          }}
        >
          ×
        </div>
      )}
    </div>
  );
};

export default function Customers() {
  const [tabs, setTabs] = useState(() => {
    try {
      const saved = sessionStorage.getItem("customers_tabs");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      // ignore
    }
    return [{ id: Date.now().toString(), title: "العملاء" }];
  });

  const [activeTabId, setActiveTabId] = useState(() => {
    return sessionStorage.getItem("customers_activeTabId") || tabs[0]?.id;
  });

  useEffect(() => {
    sessionStorage.setItem("customers_tabs", JSON.stringify(tabs));
    sessionStorage.setItem("customers_activeTabId", activeTabId);
  }, [tabs, activeTabId]);

  const addTab = () => {
    const newTab = { id: Date.now().toString(), title: `بحث عملاء جديد` };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const closeTab = (tabId) => {
    setTabs((prev) => {
      const newTabs = prev.filter((t) => t.id !== tabId);
      if (newTabs.length === 0) {
        const singleTab = { id: Date.now().toString(), title: "العملاء" };
        setActiveTabId(singleTab.id);
        return [singleTab];
      }
      if (activeTabId === tabId) {
        const index = prev.findIndex((t) => t.id === tabId);
        const nextActive = newTabs[Math.max(0, index - 1)];
        setActiveTabId(nextActive.id);
      }
      return newTabs;
    });
  };

  return (
    <div className="customers-page" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* شريط التبويبات والأزرار */}
      <div
        className="customers-tabs-bar"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "15px",
          paddingBottom: "10px",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        {/* التبويبات والأزرار (قابلة للتمرير) */}
        <div className="customers-tabs-list" style={{ display: "flex", gap: "10px", overflowX: "auto", flex: 1, paddingBottom: "5px" }}>
          {tabs.map((tab) => (
            <CustomerTab
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              onSelect={() => setActiveTabId(tab.id)}
              onClose={() => closeTab(tab.id)}
              canClose={tabs.length > 1}
            />
          ))}

          <button
            onClick={addTab}
            style={{
              padding: "6px 12px",
              background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
              color: '#475569',
              borderRadius: '10px',
              cursor: "pointer",
              border: "1px solid #e2e8f0",
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.2s ease-in-out",
              boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
              height: "42px"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
            title="فتح تبويب بحث جديد"
          >
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              backgroundColor: "white",
              fontSize: "16px",
              fontWeight: "900",
              color: "#073385ff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
            }}>+</div>
          </button>
        </div>

        {/* أزرار العمليات (ثابتة) */}
        <div className="customers-tabs-actions" style={{ display: "flex", gap: "10px", marginRight: "10px", paddingRight: "10px", flexShrink: 0 }}>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('customers-export', { detail: { tabId: activeTabId } }))}
            style={{
              background: 'linear-gradient(135deg, #475569 0%, #334155 100%)',
              color: 'white',
              padding: '10px 18px',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: '700',
              height: '42px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(51, 65, 85, 0.3)',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(51, 65, 85, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(51, 65, 85, 0.3)';
            }}
            title="تحميل قالب استيراد البيانات"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)' }}>
              ↓
            </div>
            تحميل القالب
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('customers-add', { detail: { tabId: activeTabId } }))}
            style={{
              background: 'linear-gradient(135deg, #0087e0ff 0%, hsla(209, 100%, 43%, 1.00) 100%)',
              color: 'white',
              padding: '10px 20px',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              height: '42px',
              boxShadow: '0 4px 12px rgba(0, 138, 230, 0.3)',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 138, 230, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 138, 230, 0.3)';
            }}
          >
            <Plus size={20} />
            إضافة عميل جديد
          </button>
        </div>
      </div>

      {/* مساحات العمل */}
      <div className="customers-workspaces" style={{ flex: 1, position: "relative" }}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="customers-workspace-pane"
            style={{ display: tab.id === activeTabId ? "block" : "none", height: "100%" }}
          >
            <CustomerWorkspace tabId={tab.id} tabTitle={tab.title} isActive={tab.id === activeTabId} />
          </div>
        ))}
      </div>
    </div>
  );
}
