import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { safeAlert } from '../utils/safeAlert';
import { safeConfirm } from '../utils/safeConfirm';
import { safePrint } from '../../printing/safePrint';
import { generateReturnInvoiceHTML } from '../../printing/generators/saleReturnGenerator';
import { emitReturnEditorRequest } from '../utils/posEditorBridge';
import SaleActions from '../components/sales/SaleActions';
import { getLocalDateString } from '../utils/dateUtils';
import './Sales.css';

const PAGE_SIZE = 50;
const RETURNS_CACHE_TTL_MS = 60 * 1000;
const returnsPageCache = new Map();

const normalizeSearchToken = (value) => String(value ?? '').trim().toLowerCase();
const normalizeDateToken = (value) => String(value ?? '').trim();
const getTodayInputDate = () => {
  const now = new Date();
  return getLocalDateString(now);
};

const getReturnsCacheKey = (page, pageSize = PAGE_SIZE, filters = {}) => {
  const normalizedSearch = normalizeSearchToken(filters?.searchTerm);
  const normalizedFromDate = normalizeDateToken(filters?.fromDate);
  const normalizedToDate = normalizeDateToken(filters?.toDate);

  return (
    `sales-returns:p${page}:s${pageSize}`
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

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeReturnRow = (returnInvoice) => {
  const total = Math.max(0, toFiniteNumber(returnInvoice?.total, 0));
  const itemsCount = Number.isFinite(Number(returnInvoice?.itemsCount))
    ? Number(returnInvoice.itemsCount)
    : Array.isArray(returnInvoice?.items)
      ? returnInvoice.items.length
      : 0;

  return {
    ...returnInvoice,
    total,
    itemsCount
  };
};

const normalizeReturnsResponse = (result, fallbackPage) => {
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

const getFreshReturnsCache = (cacheKey) => {
  const cached = returnsPageCache.get(cacheKey);
  if (!cached) return null;
  if ((Date.now() - cached.timestamp) > RETURNS_CACHE_TTL_MS) return null;
  return cached;
};

const writeReturnsCache = (cacheKey, payload) => {
  returnsPageCache.set(cacheKey, {
    ...payload,
    timestamp: Date.now()
  });
};

export const clearSalesReturnsHistoryCache = () => {
  returnsPageCache.clear();
};

const buildReturnSearchIndex = (returnInvoice) => ([
  returnInvoice?.id,
  returnInvoice?.createdAt,
  returnInvoice?.customer?.name,
  returnInvoice?.saleId,
  returnInvoice?.sale?.id,
  returnInvoice?.notes,
  returnInvoice?.total,
  returnInvoice?.itemsCount
]
  .map((value) => String(value ?? '').toLowerCase())
  .join(' '));

function ReturnDetailsModal({ returnInvoice, onClose }) {
  if (!returnInvoice) return null;

  const isLoadingDetails = Boolean(returnInvoice?.isLoadingDetails);
  const items = Array.isArray(returnInvoice?.items) ? returnInvoice.items : [];

  return (
    <div className="sales-modal-overlay" onClick={onClose}>
      <div className="sales-modal" onClick={(event) => event.stopPropagation()}>
        <div className="sales-modal-header">
          <h2>تفاصيل مرتجع المبيعات #{formatInteger(returnInvoice.id)}</h2>
          <button className="sales-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="sales-modal-meta">
          <div><strong>التاريخ:</strong> {formatDateTime(returnInvoice.createdAt)}</div>
          <div><strong>العميل:</strong> {returnInvoice.customer?.name || 'عميل عابر'}</div>
          <div><strong>فاتورة البيع:</strong> {returnInvoice.saleId ? `#${formatInteger(returnInvoice.saleId)}` : '-'}</div>
          <div><strong>إجمالي المرتجع:</strong> {formatMoney(returnInvoice.total)}</div>
        </div>

        <div className="sales-modal-table-wrap">
          <table className="sales-modal-table">
            <thead>
              <tr>
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
                  <td colSpan={6} className="sales-empty-state">لا توجد أصناف في المرتجع</td>
                </tr>
              ) : (
                items.map((item, index) => {
                  const quantity = Math.max(0, toFiniteNumber(item?.quantity, 0));
                  const price = Math.max(0, toFiniteNumber(item?.price, 0));

                  return (
                    <tr key={`${returnInvoice.id}-${item.id || item.variantId || index}`}>
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
      </div>
    </div>
  );
}

export default function SalesReturnsHistory() {
  const [returns, setReturns] = useState([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [defaultDateFilter] = useState(() => getTodayInputDate());
  const [fromDateFilter, setFromDateFilter] = useState(() => defaultDateFilter);
  const [toDateFilter, setToDateFilter] = useState(() => defaultDateFilter);
  const [showAllPeriods, setShowAllPeriods] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const detailsRequestRef = useRef(0);
  const latestReturnsRequestRef = useRef(0);

  const loadReturns = useCallback(async () => {
    const requestId = latestReturnsRequestRef.current + 1;
    latestReturnsRequestRef.current = requestId;

    const normalizedSearchTerm = String(searchTerm || '').trim();
    let normalizedFromDate = showAllPeriods ? '' : String(fromDateFilter || '').trim();
    let normalizedToDate = showAllPeriods ? '' : String(toDateFilter || '').trim();

    if (normalizedFromDate && normalizedToDate && normalizedFromDate > normalizedToDate) {
      [normalizedFromDate, normalizedToDate] = [normalizedToDate, normalizedFromDate];
    }

    const cacheKey = getReturnsCacheKey(currentPage, PAGE_SIZE, {
      searchTerm: normalizedSearchTerm,
      fromDate: normalizedFromDate,
      toDate: normalizedToDate
    });
    const cached = getFreshReturnsCache(cacheKey);
    const hasCache = Boolean(cached);

    if (hasCache) {
      setReturns(cached.data || []);
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

      const response = await window.api.getReturns(requestOptions);
      if (requestId !== latestReturnsRequestRef.current) return;

      if (response?.error) {
        if (!hasCache) {
          await safeAlert('تعذر تحميل مرتجعات المبيعات: ' + response.error);
          setReturns([]);
          setTotalItems(0);
          setTotalPages(1);
        } else {
          console.error('Sales returns refresh failed:', response.error);
        }
        return;
      }

      const normalized = normalizeReturnsResponse(response, currentPage);
      const rows = (normalized.data || []).map(normalizeReturnRow);
      const nextTotalPages = Math.max(1, normalized.totalPages);

      setReturns(rows);
      setTotalItems(normalized.total);
      setTotalPages(nextTotalPages);

      writeReturnsCache(cacheKey, {
        data: rows,
        totalItems: normalized.total,
        totalPages: nextTotalPages
      });
    } catch (error) {
      if (requestId !== latestReturnsRequestRef.current) return;
      console.error('Failed to load sales returns:', error);
      if (!hasCache) {
        await safeAlert('تعذر تحميل مرتجعات المبيعات');
        setReturns([]);
        setTotalItems(0);
        setTotalPages(1);
      }
    } finally {
      if (requestId !== latestReturnsRequestRef.current) return;
      setHasLoadedOnce(true);
    }
  }, [currentPage, searchTerm, fromDateFilter, toDateFilter, showAllPeriods]);

  const fetchReturnDetails = useCallback(async (returnId) => {
    const result = await window.api.getReturnById(returnId);
    if (result?.error) {
      await safeAlert('تعذر تحميل تفاصيل المرتجع: ' + result.error);
      return null;
    }
    return normalizeReturnRow(result);
  }, []);

  useEffect(() => {
    loadReturns();
  }, [loadReturns]);

  const visibleReturns = useMemo(() => {
    const normalizedSearch = normalizeSearchToken(searchTerm);
    if (!normalizedSearch) return returns;
    return returns.filter((returnInvoice) => buildReturnSearchIndex(returnInvoice).includes(normalizedSearch));
  }, [returns, searchTerm]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(Math.max(1, prev), totalPages));
  }, [totalPages]);

  const isInitialLoading = !hasLoadedOnce && returns.length === 0;

  const handleCloseDetailsModal = useCallback(() => {
    detailsRequestRef.current += 1;
    setSelectedReturn(null);
  }, []);

  const handleOpenDetails = useCallback(async (returnInvoice) => {
    const requestId = detailsRequestRef.current + 1;
    detailsRequestRef.current = requestId;

    setSelectedReturn({
      ...returnInvoice,
      items: Array.isArray(returnInvoice?.items) ? returnInvoice.items : [],
      isLoadingDetails: true
    });

    const fullReturn = await fetchReturnDetails(returnInvoice.id);
    if (detailsRequestRef.current !== requestId) return;

    if (!fullReturn) {
      setSelectedReturn((prev) => (
        prev && prev.id === returnInvoice.id
          ? { ...prev, isLoadingDetails: false }
          : prev
      ));
      return;
    }

    setSelectedReturn(fullReturn);
  }, [fetchReturnDetails]);

  const handleEdit = useCallback(async (returnInvoice) => {
    const fullReturn = await fetchReturnDetails(returnInvoice.id);
    if (!fullReturn) return;

    emitReturnEditorRequest({
      type: 'return',
      return: fullReturn,
      customer: fullReturn.customer || returnInvoice.customer || null
    });
  }, [fetchReturnDetails]);

  const handleDelete = useCallback(async (returnInvoice) => {
    const confirmed = await safeConfirm(
      `هل أنت متأكد من حذف مرتجع المبيعات رقم ${returnInvoice.id}؟`,
      { title: 'تأكيد الحذف', detail: 'لا يمكن التراجع عن هذه العملية.' }
    );
    if (!confirmed) return;

    try {
      const result = await window.api.deleteReturn(returnInvoice.id);
      if (result?.error) {
        await safeAlert('فشل الحذف: ' + result.error);
        return;
      }

      clearSalesReturnsHistoryCache();
      setSelectedReturn((prev) => (prev?.id === returnInvoice.id ? null : prev));
      if (returns.length === 1 && currentPage > 1) {
        setCurrentPage((prev) => Math.max(1, prev - 1));
      } else {
        await loadReturns();
      }
    } catch (error) {
      console.error('Delete sales return failed:', error);
      await safeAlert('تعذر حذف المرتجع');
    }
  }, [returns.length, currentPage, loadReturns]);

  const handlePrint = useCallback(async (returnInvoice) => {
    try {
      const fullReturn = await fetchReturnDetails(returnInvoice.id);
      if (!fullReturn) return;

      const html = generateReturnInvoiceHTML(
        fullReturn,
        fullReturn.customer || returnInvoice.customer || null
      );
      const result = await safePrint(html, {
        title: `مرتجع مبيعات رقم ${fullReturn.id}`
      });

      if (result?.error) {
        await safeAlert('خطأ في الطباعة: ' + result.error);
      }
    } catch (error) {
      console.error('Print sales return failed:', error);
      await safeAlert('تعذر تنفيذ الطباعة');
    }
  }, [fetchReturnDetails]);

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

  const returnsSummary = useMemo(() => (
    visibleReturns.reduce((accumulator, returnInvoice) => ({
      invoices: accumulator.invoices + 1,
      totalAmount: accumulator.totalAmount + Number(returnInvoice.total || 0),
      itemsCount: accumulator.itemsCount + Number(returnInvoice.itemsCount || 0),
      linkedInvoices: accumulator.linkedInvoices + (returnInvoice.saleId ? 1 : 0)
    }), {
      invoices: 0,
      totalAmount: 0,
      itemsCount: 0,
      linkedInvoices: 0
    })
  ), [visibleReturns]);

  const pageStart = totalItems === 0 ? 0 : ((currentPage - 1) * PAGE_SIZE) + 1;
  const pageEnd = totalItems === 0 ? 0 : Math.min(totalItems, pageStart + visibleReturns.length - 1);

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
              placeholder="رقم المرتجع / اسم العميل / ملاحظات"
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
                <th># المرتجع</th>
                <th>التاريخ</th>
                <th>العميل</th>
                <th>فاتورة البيع</th>
                <th>الإجمالي</th>
                <th>عدد الأصناف</th>
                <th>ملاحظات</th>
                <th className="sales-actions-header">إجراءات</th>
              </tr>
            </thead>

            <tbody>
              {visibleReturns.length === 0 && hasLoadedOnce ? (
                <tr>
                  <td colSpan={8} className="sales-empty-state">
                    لا توجد مرتجعات مبيعات
                  </td>
                </tr>
              ) : (
                visibleReturns.map((returnInvoice) => (
                  <tr key={returnInvoice.id}>
                    <td>#{formatInteger(returnInvoice.id)}</td>
                    <td>{formatDateTime(returnInvoice.createdAt)}</td>
                    <td>{returnInvoice.customer?.name || 'عميل عابر'}</td>
                    <td>{returnInvoice.saleId ? `#${formatInteger(returnInvoice.saleId)}` : '-'}</td>
                    <td className="sales-money sales-total">{formatMoney(returnInvoice.total)}</td>
                    <td>{formatInteger(returnInvoice.itemsCount || 0)}</td>
                    <td className="sales-notes-cell" title={returnInvoice.notes || '-'}>
                      {returnInvoice.notes || '-'}
                    </td>
                    <td className="sales-actions-column">
                      <SaleActions
                        sale={returnInvoice}
                        onView={handleOpenDetails}
                        onEdit={handleEdit}
                        onPrint={handlePrint}
                        onDelete={handleDelete}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {visibleReturns.length > 0 && (
              <tfoot className="sales-table-footer">
                <tr className="sales-table-summary-row">
                  <td colSpan={4}></td>
                  <td className="sales-money sales-total">{formatMoney(returnsSummary.totalAmount)}</td>
                  <td style={{ fontWeight: 'bold' }}>{formatInteger(returnsSummary.itemsCount)}</td>
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

      <ReturnDetailsModal
        returnInvoice={selectedReturn}
        onClose={handleCloseDetailsModal}
      />
    </div>
  );
}
