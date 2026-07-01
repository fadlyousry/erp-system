import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { safeAlert } from '../utils/safeAlert';
import { getLocalDateString } from '../utils/dateUtils';
import { safeConfirm } from '../utils/safeConfirm';
import { safePrint } from '../../printing/safePrint';
import { generatePurchaseInvoiceHTML } from '../../printing/generators/purchaseInvoiceGenerator';
import { emitPurchaseEditorRequest } from '../utils/posEditorBridge';
import { getAppSettings, normalizeDefaultPrinterName } from '../utils/appSettings';
import { 
    barcodeRowsFromPurchaseItems, 
    buildBarcodeLabels, 
    barcodeStudioHtml,
    calculateBarcodePageSize,
    BARCODE_STUDIO_STORAGE_KEY,
    DEFAULT_BARCODE_STUDIO,
    sanitizeBarcodeStudioSettings
} from '../utils/barcodeUtils';
import SaleActions from '../components/sales/SaleActions';
import './Sales.css';

const PAGE_SIZE = 50;
const PURCHASES_CACHE_TTL_MS = 60 * 1000;
const purchasesPageCache = new Map();

const normalizeSearchToken = (value) => String(value ?? '').trim().toLowerCase();
const normalizeDateToken = (value) => String(value ?? '').trim();
const getTodayInputDate = () => getLocalDateString();
const formatDateForInput = (localDate = new Date()) => {
  return getLocalDateString(localDate);
};

const getPurchasesCacheKey = (page, pageSize = PAGE_SIZE, filters = {}) => {
  const normalizedSearch = normalizeSearchToken(filters?.searchTerm);
  const normalizedFromDate = normalizeDateToken(filters?.fromDate);
  const normalizedToDate = normalizeDateToken(filters?.toDate);

  return (
    `purchases:p${page}:s${pageSize}`
    + `:q${encodeURIComponent(normalizedSearch)}`
    + `:f${encodeURIComponent(normalizedFromDate)}`
    + `:t${encodeURIComponent(normalizedToDate)}`
  );
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatMoney = (value) => Number(value || 0).toLocaleString('ar-EG', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});
const formatInteger = (value) => Number(value || 0).toLocaleString('ar-EG');
const formatSummaryAmount = (value) => Number(value || 0).toLocaleString('ar-EG', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});
const getPurchaseDate = (purchase) => purchase?.invoiceDate || purchase?.createdAt;

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePurchaseRow = (purchase) => {
  const total = Math.max(0, toFiniteNumber(purchase?.total, 0));
  const paidRaw = toFiniteNumber(purchase?.paidAmount ?? purchase?.paid, 0);
  const paidAmount = Math.max(0, Math.min(total, paidRaw));
  const remainingAmount = Math.max(0, total - paidAmount);
  const itemsCount = Number.isFinite(Number(purchase?.itemsCount))
    ? Number(purchase.itemsCount)
    : Array.isArray(purchase?.items)
      ? purchase.items.length
      : 0;

  return {
    ...purchase,
    total,
    paidAmount,
    remainingAmount,
    itemsCount
  };
};

const normalizePurchasesResponse = (result, fallbackPage) => {
  if (Array.isArray(result)) {
    return {
      data: result,
      total: result.length,
      page: fallbackPage,
      totalPages: Math.max(1, Math.ceil(result.length / PAGE_SIZE))
    };
  }

  return {
    data: Array.isArray(result?.data) ? result.data : [],
    total: Number(result?.total || 0),
    page: Number(result?.page || fallbackPage),
    totalPages: Number(result?.totalPages || 1)
  };
};

const getFreshPurchasesCache = (cacheKey) => {
  const cached = purchasesPageCache.get(cacheKey);
  if (!cached) return null;
  if ((Date.now() - cached.timestamp) > PURCHASES_CACHE_TTL_MS) return null;
  return cached;
};

const writePurchasesCache = (cacheKey, payload) => {
  purchasesPageCache.set(cacheKey, {
    ...payload,
    timestamp: Date.now()
  });
};

export const clearPurchaseHistoryCache = () => {
  purchasesPageCache.clear();
};

export const prefetchPurchaseHistoryPage = async ({ page = 1, pageSize = PAGE_SIZE } = {}) => {
  if (typeof window === 'undefined' || typeof window?.api?.getPurchases !== 'function') {
    return null;
  }

  const cacheKey = getPurchasesCacheKey(page, pageSize, {});
  const cached = getFreshPurchasesCache(cacheKey);
  if (cached) return cached;

  try {
    const response = await window.api.getPurchases({
      paginated: true,
      page,
      pageSize,
      sortCol: 'createdAt',
      sortDir: 'desc',
      lightweight: true
    });

    if (response?.error) return null;

    const normalized = normalizePurchasesResponse(response, page);
    const rows = (normalized.data || []).map(normalizePurchaseRow);
    const payload = {
      data: rows,
      totalItems: normalized.total,
      totalPages: Math.max(1, normalized.totalPages)
    };

    writePurchasesCache(cacheKey, payload);
    return payload;
  } catch (error) {
    console.error('Purchase history prefetch failed:', error);
    return null;
  }
};

const buildPurchaseSearchIndex = (purchase) => ([
  purchase?.id,
  purchase?.invoiceDate,
  purchase?.createdAt,
  purchase?.supplier?.name,
  purchase?.purchaseType,
  purchase?.payment,
  purchase?.paymentMethod?.name,
  purchase?.notes,
  purchase?.total,
  purchase?.paidAmount,
  purchase?.remainingAmount,
  purchase?.itemsCount
]
  .map((value) => String(value ?? '').toLowerCase())
  .join(' '));

function PurchaseDetailsModal({ purchase, onClose }) {
  const [selectedItemIds, setSelectedItemIds] = useState([]);

  useEffect(() => {
    if (purchase?.items && Array.isArray(purchase.items)) {
      setSelectedItemIds(purchase.items.map((item, idx) => item.id || `item-${idx}`));
    }
  }, [purchase]);

  const handlePrintBarcodes = useCallback(async () => {
    if (!purchase?.items || purchase.items.length === 0) return;

    const itemsToPrint = purchase.items.filter((item, idx) => 
      selectedItemIds.includes(item.id || `item-${idx}`)
    );

    if (itemsToPrint.length === 0) {
      await safeAlert('يرجى اختيار صنف واحد على الأقل للطباعة');
      return;
    }

    try {
      const preparedRows = barcodeRowsFromPurchaseItems(itemsToPrint);
      
      let settings = DEFAULT_BARCODE_STUDIO;
      const saved = localStorage.getItem(BARCODE_STUDIO_STORAGE_KEY);
      if (saved) {
        try { 
          settings = sanitizeBarcodeStudioSettings(JSON.parse(saved));
        } catch(e) { console.error("Failed to parse barcode settings", e); }
      }

      const { labels } = buildBarcodeLabels(preparedRows, settings);
      
      if (labels.length === 0) {
        await safeAlert('لا توجد أصناف صالحة للطباعة');
        return;
      }

      const html = barcodeStudioHtml(labels, settings);
      const pageSize = calculateBarcodePageSize(labels.length, settings);
      const appSettings = getAppSettings();
      const printerName = normalizeDefaultPrinterName(
        appSettings.defaultBarcodePrinterName || appSettings.defaultPrinterName
      );
      await safePrint(html, {
        title: "طباعة باركود المشتريات",
        printerName,
        rawPreview: true,
        printOptions: { 
            printBackground: true,
            pageSize
        }
      });
    } catch (error) {
      console.error("Barcode printing failed:", error);
      await safeAlert('تعذر بدء الطباعة');
    }
  }, [purchase, selectedItemIds]);

  if (!purchase) return null;

  const isLoadingDetails = Boolean(purchase?.isLoadingDetails);
  const items = Array.isArray(purchase?.items) ? purchase.items : [];

  return (
    <div className="sales-modal-overlay" onClick={onClose}>
      <div className="sales-modal" onClick={(event) => event.stopPropagation()}>
        <div className="sales-modal-header">
          <h2>تفاصيل فاتورة المشتريات #{formatInteger(purchase.id)}</h2>
          <button className="sales-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="sales-modal-meta">
          <div><strong>التاريخ:</strong> {formatDateTime(getPurchaseDate(purchase))}</div>
          <div><strong>المورد:</strong> {purchase.supplier?.name || 'مورد عام'}</div>
          <div><strong>طريقة الدفع:</strong> {purchase.payment || purchase.paymentMethod?.name || '-'}</div>
          <div><strong>إجمالي الفاتورة:</strong> {formatMoney(purchase.total)}</div>
        </div>

        <div className="sales-modal-table-wrap">
          <table className="sales-modal-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selectedItemIds.length === items.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedItemIds(items.map((item, idx) => item.id || `item-${idx}`));
                      } else {
                        setSelectedItemIds([]);
                      }
                    }}
                    title="تحديد الكل للطباعة"
                  />
                </th>
                <th>الصنف</th>
                <th>المقاس</th>
                <th>اللون</th>
                <th>الكمية</th>
                <th>السعر</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingDetails ? (
                <tr>
                  <td colSpan={6} className="sales-empty-state">جاري تحميل التفاصيل...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="sales-empty-state">لا توجد أصناف في الفاتورة</td>
                </tr>
              ) : (
                items.map((item, index) => {
                  const quantity = Math.max(0, toFiniteNumber(item?.quantity, 0));
                  const price = Math.max(0, toFiniteNumber(item?.price ?? item?.cost, 0));
                  const itemId = item.id || item.variantId || `item-${index}`;
                  const isSelected = selectedItemIds.includes(itemId);

                  return (
                    <tr key={`${purchase.id}-${itemId}`} style={{ opacity: isSelected ? 1 : 0.5 }}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedItemIds((prev) => [...prev, itemId]);
                            } else {
                              setSelectedItemIds((prev) => prev.filter((id) => id !== itemId));
                            }
                          }}
                        />
                      </td>
                      <td>{item.variant?.product?.name || item.productName || 'منتج'}</td>
                      <td>{item.variant?.productSize || item.size || '-'}</td>
                      <td>{item.variant?.color || item.color || '-'}</td>
                      <td>{formatInteger(quantity)}</td>
                      <td>{formatMoney(price)}</td>
                      <td>{formatMoney(price * quantity)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {(() => {
          const itemsArr = Array.isArray(purchase.items) ? purchase.items : [];
          const subtotal = itemsArr.length > 0 
            ? itemsArr.reduce((sum, item) => sum + (toFiniteNumber(item.cost || item.price) * toFiniteNumber(item.quantity)), 0) 
            : purchase.total;
          
          const total = toFiniteNumber(purchase.total);
          const discount = Math.max(0, subtotal - total);
          const paid = toFiniteNumber(purchase.paidAmount ?? purchase.paid);
          const remaining = toFiniteNumber(purchase.remainingAmount ?? (total - paid));
          
          const currentBalance = toFiniteNumber(purchase.supplier?.balance);
          const previousBalance = currentBalance - remaining;

          return (
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 25px' }}>
              <div className="purchase-financial-card" style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '20px',
                marginTop: '15px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                minWidth: '280px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontSize: '14px' }}>الإجمالي:</span>
                  <strong style={{ fontSize: '16px', color: '#1e293b' }}>{formatMoney(subtotal)}</strong>
                </div>
                {discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748b', fontSize: '14px' }}>الخصم:</span>
                    <strong style={{ fontSize: '16px', color: '#ef4444' }}>{formatMoney(discount)}</strong>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontSize: '14px' }}>الصافي:</span>
                  <strong style={{ fontSize: '16px', color: '#0f766e' }}>{formatMoney(total)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontSize: '14px' }}>المدفوع:</span>
                  <strong style={{ fontSize: '16px', color: '#10b981' }}>{formatMoney(paid)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontSize: '14px' }}>المتبقي:</span>
                  <strong style={{ fontSize: '16px', color: remaining > 0 ? '#f59e0b' : '#64748b' }}>{formatMoney(remaining)}</strong>
                </div>
                {purchase.supplier && (
                  <>
                    <div style={{ height: '1px', background: '#cbd5e1', margin: '4px 0' }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#64748b', fontSize: '14px' }}>الرصيد السابق:</span>
                      <strong style={{ fontSize: '16px', color: '#475569' }}>{formatMoney(previousBalance)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#64748b', fontSize: '14px' }}>الرصيد الحالي:</span>
                      <strong style={{ fontSize: '16px', color: '#3b82f6' }}>{formatMoney(currentBalance)}</strong>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}

        <div className="modal-actions" style={{ marginTop: '25px', display: 'flex', gap: '10px', padding: '0 25px 25px' }}>
          <button
            className="sales-btn sales-btn-primary"
            onClick={() => {
              const html = generatePurchaseInvoiceHTML(purchase, purchase.supplier);
              safePrint(html, { title: `فاتورة مشتريات #${purchase.id}` });
            }}
          >
            طباعة الفاتورة
          </button>
          <button
            className="sales-btn"
            style={{ backgroundColor: '#6366f1', color: 'white' }}
            onClick={handlePrintBarcodes}
          >
            طباعة الباركود
          </button>
          <button className="sales-btn sales-btn-light" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PurchaseHistory() {
  const [purchases, setPurchases] = useState([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [defaultDateFilter] = useState(() => getTodayInputDate());
  const [fromDateFilter, setFromDateFilter] = useState(() => defaultDateFilter);
  const [toDateFilter, setToDateFilter] = useState(() => defaultDateFilter);
  const [showAllPeriods, setShowAllPeriods] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const detailsRequestRef = useRef(0);
  const latestPurchasesRequestRef = useRef(0);

  const loadPurchases = useCallback(async () => {
    const requestId = latestPurchasesRequestRef.current + 1;
    latestPurchasesRequestRef.current = requestId;

    const normalizedSearchTerm = String(searchTerm || '').trim();
    let normalizedFromDate = showAllPeriods ? '' : String(fromDateFilter || '').trim();
    let normalizedToDate = showAllPeriods ? '' : String(toDateFilter || '').trim();

    if (normalizedFromDate && normalizedToDate && normalizedFromDate > normalizedToDate) {
      [normalizedFromDate, normalizedToDate] = [normalizedToDate, normalizedFromDate];
    }

    const cacheKey = getPurchasesCacheKey(currentPage, PAGE_SIZE, {
      searchTerm: normalizedSearchTerm,
      fromDate: normalizedFromDate,
      toDate: normalizedToDate
    });
    const cached = getFreshPurchasesCache(cacheKey);
    const hasCache = Boolean(cached);

    if (hasCache) {
      setPurchases(cached.data || []);
      setTotalItems(cached.totalItems || 0);
      setTotalPages(cached.totalPages || 1);
    }

    try {
      const requestOptions = {
        paginated: true,
        page: currentPage,
        pageSize: PAGE_SIZE,
        searchTerm: normalizedSearchTerm,
        sortCol: 'createdAt',
        sortDir: 'desc',
        lightweight: true
      };

      if (normalizedFromDate) requestOptions.fromDate = normalizedFromDate;
      if (normalizedToDate) requestOptions.toDate = normalizedToDate;

      const response = await window.api.getPurchases(requestOptions);
      if (requestId !== latestPurchasesRequestRef.current) return;

      if (response?.error) {
        if (!hasCache) {
          await safeAlert('تعذر تحميل فواتير المشتريات: ' + response.error);
          setPurchases([]);
          setTotalItems(0);
          setTotalPages(1);
        } else {
          console.error('Purchase history refresh failed:', response.error);
        }
        return;
      }

      const normalized = normalizePurchasesResponse(response, currentPage);
      const rows = (normalized.data || []).map(normalizePurchaseRow);
      const nextTotalPages = Math.max(1, normalized.totalPages);

      setPurchases(rows);
      setTotalItems(normalized.total);
      setTotalPages(nextTotalPages);

      writePurchasesCache(cacheKey, {
        data: rows,
        totalItems: normalized.total,
        totalPages: nextTotalPages
      });
    } catch (error) {
      if (requestId !== latestPurchasesRequestRef.current) return;
      console.error('Failed to load purchases:', error);
      if (!hasCache) {
        await safeAlert('تعذر تحميل فواتير المشتريات');
        setPurchases([]);
        setTotalItems(0);
        setTotalPages(1);
      }
    } finally {
      if (requestId !== latestPurchasesRequestRef.current) return;
      setHasLoadedOnce(true);
    }
  }, [currentPage, searchTerm, fromDateFilter, toDateFilter, showAllPeriods]);

  const fetchPurchaseDetails = useCallback(async (purchaseId) => {
    const result = await window.api.getPurchaseById(purchaseId);
    if (result?.error) {
      await safeAlert('تعذر تحميل تفاصيل الفاتورة: ' + result.error);
      return null;
    }
    return normalizePurchaseRow(result);
  }, []);

  useEffect(() => {
    loadPurchases();
  }, [loadPurchases]);

  const visiblePurchases = useMemo(() => {
    const normalizedSearch = normalizeSearchToken(searchTerm);
    if (!normalizedSearch) return purchases;
    return purchases.filter((purchase) => buildPurchaseSearchIndex(purchase).includes(normalizedSearch));
  }, [purchases, searchTerm]);

  const purchasesSummary = useMemo(() => (
    visiblePurchases.reduce((accumulator, purchase) => {
      const total = Number(purchase.total || 0);
      const paid = Number(purchase.paidAmount || 0);
      const remaining = Number(purchase.remainingAmount || 0);

      return {
        invoices: accumulator.invoices + 1,
        totalAmount: accumulator.totalAmount + total,
        paidAmount: accumulator.paidAmount + paid,
        remainingAmount: accumulator.remainingAmount + remaining
      };
    }, {
      invoices: 0,
      totalAmount: 0,
      paidAmount: 0,
      remainingAmount: 0
    })
  ), [visiblePurchases]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(Math.max(1, prev), totalPages));
  }, [totalPages]);

  const isInitialLoading = !hasLoadedOnce && purchases.length === 0;

  const handleCloseDetailsModal = useCallback(() => {
    detailsRequestRef.current += 1;
    setSelectedPurchase(null);
  }, []);

  const handleOpenPurchaseDetails = useCallback(async (purchase) => {
    const requestId = detailsRequestRef.current + 1;
    detailsRequestRef.current = requestId;

    setSelectedPurchase({
      ...purchase,
      items: Array.isArray(purchase?.items) ? purchase.items : [],
      isLoadingDetails: true
    });

    const fullPurchase = await fetchPurchaseDetails(purchase.id);
    if (detailsRequestRef.current !== requestId) return;

    if (!fullPurchase) {
      setSelectedPurchase((prev) => (
        prev && prev.id === purchase.id
          ? { ...prev, isLoadingDetails: false }
          : prev
      ));
      return;
    }

    setSelectedPurchase(fullPurchase);
  }, [fetchPurchaseDetails]);

  const handleEditPurchase = useCallback(async (purchase) => {
    try {
      const linkedReturnsCount = Array.isArray(purchase?.returns)
        ? purchase.returns.length
        : Number(purchase?.returnsCount || 0);
      if (linkedReturnsCount > 0) {
        await safeAlert('لا يمكن تعديل فاتورة مشتريات مرتبطة بمرتجع مشتريات.');
        return;
      }

      const fullPurchase = await fetchPurchaseDetails(purchase.id);
      if (!fullPurchase) return;

      const paidAmount = Math.max(0, toFiniteNumber(fullPurchase?.paidAmount ?? fullPurchase?.paid, 0));
      const totalAmount = Math.max(0, toFiniteNumber(fullPurchase?.total, 0));
      const remainingAmount = Math.max(0, totalAmount - paidAmount);
      const supplier = fullPurchase?.supplier || null;

      emitPurchaseEditorRequest({
        type: 'purchase',
        sale: {
          ...fullPurchase,
          customerId: fullPurchase?.supplierId || supplier?.id || null,
          customer: supplier,
          saleType: fullPurchase?.purchaseType || (remainingAmount > 0 ? 'آجل' : 'نقدي'),
          paidAmount,
          remainingAmount
        },
        customer: supplier
      });
    } catch (error) {
      console.error('Open purchase editor failed:', error);
      await safeAlert('تعذر فتح الفاتورة للتعديل');
    }
  }, [fetchPurchaseDetails]);

  const handleDeletePurchase = useCallback(async (purchase) => {
    const linkedReturnsCount = Array.isArray(purchase?.returns)
      ? purchase.returns.length
      : Number(purchase?.returnsCount || 0);
    if (linkedReturnsCount > 0) {
      await safeAlert('لا يمكن حذف فاتورة مشتريات مرتبطة بمرتجع مشتريات.');
      return;
    }

    const confirmed = await safeConfirm(
      `هل أنت متأكد من حذف فاتورة المشتريات رقم ${purchase.id}؟`,
      { title: 'تأكيد الحذف', detail: 'لا يمكن التراجع عن هذه العملية.' }
    );
    if (!confirmed) return;

    try {
      const result = await window.api.deletePurchase(purchase.id);
      if (result?.error) {
        await safeAlert('فشل الحذف: ' + result.error);
        return;
      }

      clearPurchaseHistoryCache();
      setSelectedPurchase((prev) => (prev?.id === purchase.id ? null : prev));
      if (purchases.length === 1 && currentPage > 1) {
        setCurrentPage((prev) => Math.max(1, prev - 1));
      } else {
        await loadPurchases();
      }
    } catch (error) {
      console.error('Delete purchase failed:', error);
      await safeAlert('تعذر حذف فاتورة المشتريات');
    }
  }, [purchases.length, currentPage, loadPurchases]);

  const handlePrintPurchase = useCallback(async (purchase) => {
    try {
      const fullPurchase = await fetchPurchaseDetails(purchase.id);
      if (!fullPurchase) return;

      const html = generatePurchaseInvoiceHTML(fullPurchase);
      const result = await safePrint(html, {
        title: `فاتورة مشتريات رقم ${fullPurchase.id}`
      });

      if (result?.error) {
        await safeAlert('خطأ في الطباعة: ' + result.error);
      }
    } catch (error) {
      console.error('Print purchase failed:', error);
      await safeAlert('تعذر تنفيذ الطباعة');
    }
  }, [fetchPurchaseDetails]);

  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value);
    setCurrentPage(1);
  }, []);

  const handleFromDateFilterChange = useCallback((event) => {
    setFromDateFilter(event.target.value);
    setCurrentPage(1);
  }, []);

  const handleToDateFilterChange = useCallback((event) => {
    setToDateFilter(event.target.value);
    setCurrentPage(1);
  }, []);

  const handleShowAllPeriodsChange = useCallback((event) => {
    setShowAllPeriods(event.target.checked);
    setCurrentPage(1);
  }, []);

  const pageStart = totalItems === 0 ? 0 : ((currentPage - 1) * PAGE_SIZE) + 1;
  const pageEnd = totalItems === 0 ? 0 : Math.min(totalItems, pageStart + visiblePurchases.length - 1);

  return (
    <div className="sales-page">


      <div className="sales-table-card card">
        <div className="sales-search-bar">
          <div className="sales-filter-group sales-filter-group-search">
            <label>بحث سريع</label>
            <input
              type="text"
              className="sales-search-input"
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder="رقم الفاتورة / اسم المورد / ملاحظة"
            />
          </div>

          <div className="sales-filter-group sales-filter-group-date">
            <label>من تاريخ</label>
            <input
              type="date"
              value={fromDateFilter}
              onChange={handleFromDateFilterChange}
              disabled={showAllPeriods}
            />
          </div>

          <div className="sales-filter-group sales-filter-group-date">
            <label>إلى تاريخ</label>
            <input
              type="date"
              value={toDateFilter}
              onChange={handleToDateFilterChange}
              disabled={showAllPeriods}
            />
          </div>

          <div className="sales-filter-actions">
            <label className="sales-period-toggle">
              <input
                type="checkbox"
                checked={showAllPeriods}
                onChange={handleShowAllPeriodsChange}
              />
              كل الفترات
            </label>
          </div>
        </div>

        <div className="sales-table-scroll">
          <table className="sales-table">
            <thead>
              <tr>
                <th># الفاتورة</th>
                <th>التاريخ</th>
                <th>المورد</th>
                <th>طريقة الدفع</th>
                <th>الإجمالي</th>
                <th>المدفوع</th>
                <th>المتبقي</th>
                <th>عدد الأصناف</th>
                <th>ملاحظات</th>
                <th className="sales-actions-header">إجراءات</th>
              </tr>
            </thead>

            <tbody>
              {visiblePurchases.length === 0 && hasLoadedOnce ? (
                <tr>
                  <td colSpan={10} className="sales-empty-state">
                    لا توجد مشتريات
                  </td>
                </tr>
              ) : (
                visiblePurchases.map((purchase) => {
                  const remainingAmount = Number(purchase.remainingAmount || 0);
                  const paidAmount = Number(purchase.paidAmount || 0);

                  return (
                    <tr key={purchase.id}>
                      <td>#{formatInteger(purchase.id)}</td>
                      <td>{formatDateTime(getPurchaseDate(purchase))}</td>
                      <td>{purchase.supplier?.name || 'مورد عام'}</td>
                      <td>{purchase.payment || purchase.paymentMethod?.name || '-'}</td>
                      <td className="sales-money sales-total">{formatMoney(purchase.total)}</td>
                      <td className="sales-money sales-paid">{formatMoney(paidAmount)}</td>
                      <td className={`sales-money ${remainingAmount > 0 ? 'sales-remaining' : 'sales-cleared'}`}>
                        {formatMoney(remainingAmount)}
                      </td>
                      <td>{formatInteger(purchase.itemsCount || 0)}</td>
                      <td className="sales-notes-cell" title={purchase.notes || '-'}>
                        {purchase.notes || '-'}
                      </td>
                      <td className="sales-actions-column">
                        <SaleActions
                          sale={purchase}
                          onView={handleOpenPurchaseDetails}
                          onEdit={handleEditPurchase}
                          onPrint={handlePrintPurchase}
                          onDelete={handleDeletePurchase}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {visiblePurchases.length > 0 && (
              <tfoot className="sales-table-footer">
                <tr className="sales-table-summary-row">
                  <td colSpan={4}></td>
                  <td className="sales-money sales-total">{formatMoney(purchasesSummary.totalAmount)}</td>
                  <td className="sales-money sales-paid">{formatMoney(purchasesSummary.paidAmount)}</td>
                  <td className="sales-money sales-remaining">{formatMoney(purchasesSummary.remainingAmount)}</td>
                  <td style={{ fontWeight: 'bold' }}>{formatInteger(purchasesSummary.itemsCount)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="sales-pagination">

          <div className="customers-pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px 20px', gap: '20px', borderTop: '1px solid #e5e7eb', background: '#fff' }}>
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage <= 1 || isInitialLoading}
              style={{
                padding: '8px 20px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                background: currentPage === 1 ? '#f1f5f9' : 'linear-gradient(to bottom, #ffffff, #f8fafc)',
                color: currentPage === 1 ? '#94a3b8' : '#334155',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                fontWeight: '700',
                fontSize: '14px',
                transition: 'all 0.2s'
              }}
            >
              → السابق
            </button>
            <span style={{ fontWeight: '800', fontSize: '14px', color: '#1e293b' }}>
              صفحة {currentPage.toLocaleString('ar-EG')} من {totalPages.toLocaleString('ar-EG')}
              <span style={{ marginInlineStart: '8px', color: '#64748b', fontWeight: 'normal' }}>
                (إجمالي {totalItems.toLocaleString('ar-EG')})
              </span>
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage >= totalPages || isInitialLoading}
              style={{
                padding: '8px 20px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                background: currentPage === totalPages ? '#f1f5f9' : 'linear-gradient(to bottom, #ffffff, #f8fafc)',
                color: currentPage === totalPages ? '#94a3b8' : '#334155',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                fontWeight: '700',
                fontSize: '14px',
                transition: 'all 0.2s'
              }}
            >
              التالي ←
            </button>
          </div>
        </div>
      </div>

      <PurchaseDetailsModal
        purchase={selectedPurchase}
        onClose={handleCloseDetailsModal}
      />
    </div>
  );
}
