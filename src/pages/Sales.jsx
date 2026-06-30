import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { safeAlert } from '../utils/safeAlert';
import { getLocalDateString } from '../utils/dateUtils';
import { safeConfirm } from '../utils/safeConfirm';
import { APP_NAVIGATE_EVENT, emitPosEditorRequest } from '../utils/posEditorBridge';
import { safePrint } from '../../printing/safePrint';
import { generateInvoiceHTML } from '../../printing/generators/saleInvoiceGenerator';
import SaleActions from '../components/sales/SaleActions';
import SaleDetailsModal from '../components/sales/SaleDetailsModal';
import './Sales.css';

const PAGE_SIZE = 50;
const SALES_CACHE_TTL_MS = 60 * 1000;
const salesPageCache = new Map();
const normalizeSearchToken = (value) => String(value ?? '').trim().toLowerCase();
const normalizeDateToken = (value) => String(value ?? '').trim();
const getTodayInputDate = () => getLocalDateString();

const getSalesCacheKey = (page, pageSize = PAGE_SIZE, filters = {}) => {
  const normalizedSearch = normalizeSearchToken(filters?.searchTerm);
  const normalizedFromDate = normalizeDateToken(filters?.fromDate);
  const normalizedToDate = normalizeDateToken(filters?.toDate);

  return (
    `sales:p${page}:s${pageSize}`
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
const getSaleDate = (sale) => sale?.invoiceDate || sale?.createdAt;
const buildSaleSearchIndex = (sale) => ([
  sale?.id,
  sale?.invoiceDate,
  sale?.createdAt,
  sale?.customer?.name,
  sale?.saleType,
  sale?.payment,
  sale?.paymentMethod?.name,
  sale?.notes,
  sale?.total,
  sale?.paidAmount,
  sale?.remainingAmount,
  sale?.itemsCount
]
  .map((value) => String(value ?? '').toLowerCase())
  .join(' '));

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const hasValue = (value) => value !== null && value !== undefined && value !== '';

const isCreditSaleType = (saleType) => {
  const normalized = String(saleType || '').trim().toLowerCase();
  return (
    normalized === 'آجل'
    || normalized === 'اجل'
    || normalized === 'ø¢ø¬ù„'
    || normalized === 'credit'
    || normalized === 'deferred'
  );
};

const normalizeSaleRow = (sale) => {
  const total = Math.max(0, toFiniteNumber(sale?.total, 0));
  const paidFromApi = hasValue(sale?.paidAmount) ? toFiniteNumber(sale.paidAmount, 0) : null;
  const remainingFromApi = hasValue(sale?.remainingAmount) ? toFiniteNumber(sale.remainingAmount, 0) : null;
  const paidLegacy = hasValue(sale?.paid) ? toFiniteNumber(sale.paid, 0) : null;
  const remainingLegacy = hasValue(sale?.remaining) ? toFiniteNumber(sale.remaining, 0) : null;

  const paidKnown = paidFromApi ?? paidLegacy;
  const remainingKnown = remainingFromApi ?? remainingLegacy;

  let remainingAmount;
  if (remainingKnown !== null) {
    remainingAmount = Math.max(0, remainingKnown);
  } else if (paidKnown !== null) {
    remainingAmount = Math.max(0, total - paidKnown);
  } else {
    remainingAmount = isCreditSaleType(sale?.saleType) ? total : 0;
  }

  let paidAmount;
  if (paidKnown !== null) {
    paidAmount = Math.max(0, paidKnown);
  } else {
    paidAmount = Math.max(0, total - remainingAmount);
  }

  const itemsCount = Number.isFinite(Number(sale?.itemsCount))
    ? Number(sale.itemsCount)
    : Array.isArray(sale?.items)
      ? sale.items.length
      : 0;

  return {
    ...sale,
    total,
    paidAmount,
    remainingAmount,
    itemsCount
  };
};

const normalizeSalesResponse = (result, fallbackPage) => {
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

const getFreshSalesCache = (cacheKey) => {
  const cached = salesPageCache.get(cacheKey);
  if (!cached) return null;
  if ((Date.now() - cached.timestamp) > SALES_CACHE_TTL_MS) return null;
  return cached;
};

const writeSalesCache = (cacheKey, payload) => {
  salesPageCache.set(cacheKey, {
    ...payload,
    timestamp: Date.now()
  });
};

export const clearSalesCache = () => {
  salesPageCache.clear();
};

export const prefetchSalesPage = async ({ page = 1, pageSize = PAGE_SIZE } = {}) => {
  if (typeof window === 'undefined' || typeof window?.api?.getSales !== 'function') {
    return null;
  }

  const cacheKey = getSalesCacheKey(page, pageSize, {});
  const cached = getFreshSalesCache(cacheKey);
  if (cached) return cached;

  try {
    const response = await window.api.getSales({
      paginated: true,
      page,
      pageSize,
      sortCol: 'invoiceDate',
      sortDir: 'desc',
      lightweight: true
    });

    if (response?.error) return null;

    const normalized = normalizeSalesResponse(response, page);
    const rows = (normalized.data || []).map(normalizeSaleRow);
    const payload = {
      data: rows,
      totalItems: normalized.total,
      totalPages: Math.max(1, normalized.totalPages)
    };

    writeSalesCache(cacheKey, payload);
    return payload;
  } catch (error) {
    console.error('Sales prefetch failed:', error);
    return null;
  }
};

export default function Sales() {
  const [sales, setSales] = useState([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [defaultDateFilter] = useState(() => getTodayInputDate());
  const [fromDateFilter, setFromDateFilter] = useState(() => defaultDateFilter);
  const [toDateFilter, setToDateFilter] = useState(() => defaultDateFilter);
  const [showAllPeriods, setShowAllPeriods] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const detailsRequestRef = useRef(0);
  const latestSalesRequestRef = useRef(0);

  const loadSales = useCallback(async () => {
    const requestId = latestSalesRequestRef.current + 1;
    latestSalesRequestRef.current = requestId;

    const normalizedSearchTerm = String(searchTerm || '').trim();
    let normalizedFromDate = showAllPeriods ? '' : String(fromDateFilter || '').trim();
    let normalizedToDate = showAllPeriods ? '' : String(toDateFilter || '').trim();

    if (normalizedFromDate && normalizedToDate && normalizedFromDate > normalizedToDate) {
      [normalizedFromDate, normalizedToDate] = [normalizedToDate, normalizedFromDate];
    }

    const cacheKey = getSalesCacheKey(currentPage, PAGE_SIZE, {
      searchTerm: normalizedSearchTerm,
      fromDate: normalizedFromDate,
      toDate: normalizedToDate
    });
    const cached = getFreshSalesCache(cacheKey);
    const hasCache = Boolean(cached);

    if (hasCache) {
      setSales(cached.data || []);
      setTotalItems(cached.totalItems || 0);
      setTotalPages(cached.totalPages || 1);
    }

    try {
      const requestOptions = {
        paginated: true,
        page: currentPage,
        pageSize: PAGE_SIZE,
        searchTerm: normalizedSearchTerm,
        sortCol: 'invoiceDate',
        sortDir: 'desc',
        lightweight: true
      };

      if (normalizedFromDate) requestOptions.fromDate = normalizedFromDate;
      if (normalizedToDate) requestOptions.toDate = normalizedToDate;

      const response = await window.api.getSales(requestOptions);

      if (requestId !== latestSalesRequestRef.current) return;

      if (response?.error) {
        if (!hasCache) {
          await safeAlert('خطأ في تحميل المبيعات: ' + response.error);
          setSales([]);
          setTotalItems(0);
          setTotalPages(1);
        } else {
          console.error('Sales refresh failed:', response.error);
        }
        return;
      }

      const normalized = normalizeSalesResponse(response, currentPage);
      const rows = (normalized.data || []).map(normalizeSaleRow);
      const nextTotalPages = Math.max(1, normalized.totalPages);

      setSales(rows);
      setTotalItems(normalized.total);
      setTotalPages(nextTotalPages);

      writeSalesCache(cacheKey, {
        data: rows,
        totalItems: normalized.total,
        totalPages: nextTotalPages
      });
    } catch (error) {
      if (requestId !== latestSalesRequestRef.current) return;
      console.error('Failed to load sales:', error);
      if (!hasCache) {
        await safeAlert('تعذر تحميل المبيعات');
        setSales([]);
        setTotalItems(0);
        setTotalPages(1);
      }
    } finally {
      if (requestId !== latestSalesRequestRef.current) return;
      setHasLoadedOnce(true);
    }
  }, [currentPage, searchTerm, fromDateFilter, toDateFilter, showAllPeriods]);

  const fetchSaleDetails = useCallback(async (saleId) => {
    const result = await window.api.getSaleById(saleId);
    if (result?.error) {
      await safeAlert('تعذر تحميل بيانات الفاتورة: ' + result.error);
      return null;
    }
    return result;
  }, []);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  const handleCloseDetailsModal = useCallback(() => {
    detailsRequestRef.current += 1;
    setSelectedSale(null);
  }, []);

  const handleOpenSaleDetails = useCallback(async (sale) => {
    const requestId = detailsRequestRef.current + 1;
    detailsRequestRef.current = requestId;

    setSelectedSale({
      ...sale,
      items: Array.isArray(sale?.items) ? sale.items : [],
      isLoadingDetails: true
    });

    const fullSale = await fetchSaleDetails(sale.id);
    if (detailsRequestRef.current !== requestId) return;

    if (!fullSale) {
      setSelectedSale((prev) => (
        prev && prev.id === sale.id
          ? { ...prev, isLoadingDetails: false }
          : prev
      ));
      return;
    }

    setSelectedSale(fullSale);
  }, [fetchSaleDetails]);

  const handlePrintSale = useCallback(async (sale) => {
    const fullSale = await fetchSaleDetails(sale.id);
    if (!fullSale) return;

    const html = generateInvoiceHTML(
      fullSale,
      fullSale.customer || sale.customer || null
    );
    const result = await safePrint(html, {
      title: `فاتورة رقم ${fullSale.id || sale.id}`
    });

    if (result?.error) {
      await safeAlert('خطأ في الطباعة: ' + result.error);
    }
  }, [fetchSaleDetails]);

  const handleEditSale = useCallback(async (sale) => {
    window.dispatchEvent(
      new CustomEvent(APP_NAVIGATE_EVENT, {
        detail: { page: 'pos', reason: 'open-editor' }
      })
    );

    const fullSale = await fetchSaleDetails(sale.id);
    if (!fullSale) return;

    emitPosEditorRequest({
      type: 'sale',
      sale: fullSale,
      customer: fullSale.customer || sale.customer || null
    });
  }, [fetchSaleDetails]);

  const handleDeleteSale = useCallback(async (sale) => {
    const confirmed = await safeConfirm(
      `هل أنت متأكد من حذف الفاتورة رقم ${sale.id}؟`,
      { title: 'تأكيد الحذف', detail: 'لا يمكن التراجع عن هذه العملية.' }
    );

    if (!confirmed) return;

    try {
      const result = await window.api.deleteSale(sale.id);
      if (result?.error) {
        await safeAlert('فشل الحذف: ' + result.error);
        return;
      }

      clearSalesCache();

      if (sales.length === 1 && currentPage > 1) {
        setCurrentPage((prev) => Math.max(1, prev - 1));
      } else {
        await loadSales();
      }
    } catch (error) {
      console.error('Failed to delete sale:', error);
      await safeAlert('تعذر حذف الفاتورة');
    }
  }, [sales.length, currentPage, loadSales]);

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

  const visibleSales = useMemo(() => {
    const normalized = normalizeSearchToken(searchTerm);
    if (!normalized) return sales;
    return sales.filter((sale) => buildSaleSearchIndex(sale).includes(normalized));
  }, [sales, searchTerm]);

  const salesSummary = useMemo(() => (
    visibleSales.reduce((accumulator, sale) => {
      const total = Number(sale.total || 0);
      const paid = Number(sale.paidAmount || 0);
      const remaining = Number(sale.remainingAmount || 0);

      return {
        invoices: accumulator.invoices + 1,
        totalAmount: accumulator.totalAmount + total,
        paidAmount: accumulator.paidAmount + paid,
        remainingAmount: accumulator.remainingAmount + remaining,
        creditCount: accumulator.creditCount + (remaining > 0 ? 1 : 0)
      };
    }, {
      invoices: 0,
      totalAmount: 0,
      paidAmount: 0,
      remainingAmount: 0,
      creditCount: 0
    })
  ), [visibleSales]);

  const tableRows = useMemo(() => (
    visibleSales.map((sale) => {
      const remainingAmount = Number(sale.remainingAmount || 0);
      const paidAmount = Number(sale.paidAmount || 0);

      return (
        <tr key={sale.id}>
          <td>#{formatInteger(sale.id)}</td>
          <td>{formatDateTime(getSaleDate(sale))}</td>
          <td>{sale.customer?.name || 'عميل نقدي'}</td>
          <td>
            <span className={`sales-sale-type ${remainingAmount > 0 ? 'is-credit' : 'is-cash'}`}>
              {sale.saleType || (remainingAmount > 0 ? 'آجل' : 'نقدي')}
            </span>
          </td>
          <td>{sale.payment || sale.paymentMethod?.name || '-'}</td>
          <td className="sales-money sales-total">{formatMoney(sale.total)}</td>
          <td className="sales-money sales-paid">{formatMoney(paidAmount)}</td>
          <td className={`sales-money ${remainingAmount > 0 ? 'sales-remaining' : 'sales-cleared'}`}>
            {formatMoney(remainingAmount)}
          </td>
          <td>{formatInteger(sale.itemsCount || 0)}</td>
          <td className="sales-notes-cell" title={sale.notes || '-'}>
            {sale.notes || '-'}
          </td>
          <td className="sales-actions-column">
            <SaleActions
              sale={sale}
              onView={handleOpenSaleDetails}
              onPrint={handlePrintSale}
              onEdit={handleEditSale}
              onDelete={handleDeleteSale}
            />
          </td>
        </tr>
      );
    })
  ), [visibleSales, handleOpenSaleDetails, handlePrintSale, handleEditSale, handleDeleteSale]);

  const pageStart = totalItems === 0 ? 0 : ((currentPage - 1) * PAGE_SIZE) + 1;
  const pageEnd = totalItems === 0 ? 0 : Math.min(totalItems, pageStart + visibleSales.length - 1);
  const isInitialLoading = !hasLoadedOnce && sales.length === 0;

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
              placeholder="رقم الفاتورة / اسم العميل / ملاحظة"
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
                <th>العميل</th>
                <th>نوع البيع</th>
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
              {visibleSales.length === 0 && hasLoadedOnce ? (
                <tr>
                  <td colSpan={11} className="sales-empty-state">
                    لا توجد مبيعات
                  </td>
                </tr>
              ) : tableRows}
            </tbody>

            {visibleSales.length > 0 && (
              <tfoot className="sales-table-footer">
                <tr className="sales-table-summary-row">
                  <td colSpan={5}></td>
                  <td className="sales-money sales-total">{formatMoney(salesSummary.totalAmount)}</td>
                  <td className="sales-money sales-paid">{formatMoney(salesSummary.paidAmount)}</td>
                  <td className="sales-money sales-remaining">{formatMoney(salesSummary.remainingAmount)}</td>
                  <td style={{ fontWeight: 'bold' }}>{formatInteger(salesSummary.itemsCount)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="sales-pagination">

          <div className="customers-pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '8px 16px', gap: '20px', borderTop: '1px solid #e5e7eb', background: '#fff' }}>
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage <= 1 || isInitialLoading}
              style={{
                padding: '5px 10px',
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
                padding: '5px 10px',
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

      <SaleDetailsModal
        sale={selectedSale}
        onClose={handleCloseDetailsModal}
      />
    </div>
  );
}
