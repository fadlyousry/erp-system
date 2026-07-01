import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import JsBarcode from 'jsbarcode';
import { FixedSizeList as List } from 'react-window';
import { safeAlert } from '../utils/safeAlert';
import { safeConfirm } from '../utils/safeConfirm';
import { safePrint } from '../../printing/safePrint';
import './Products.css';

// Extracted components
// import ProductsMetrics from '../components/products/ProductsMetrics'; // Removed as requested
import ProductsFilters from '../components/products/ProductsFilters';
import ProductsTableTools from '../components/products/ProductsTableTools';
import ProductRowActions from '../components/products/ProductRowActions';
import CategoryModal from '../components/products/CategoryModal';
import ImportModal from '../components/products/ImportModal';
import WarehouseTransferModal from '../components/products/WarehouseTransferModal';
import PriceUpdateModal from '../components/products/PriceUpdateModal';

import {
  getAppSettings,
  saveAppSettings,
  normalizeBarcodePrintMode,
  normalizeBarcodeStudioStartTab,
  normalizeDefaultPrinterName
} from '../utils/appSettings';
import {
  getGridHeight, nText, nKey, nInt, nNum, money, csv, inRange,
  stock, salePriceOf, costPriceOf, wholesale,
  DEFAULT_UNIT, DEFAULT_CATEGORY, GRID_COLUMNS, SORT_PRESETS,
  DEFAULT_VISIBLE_COLUMN_KEYS
} from '../utils/productUtils';
import { APP_NAVIGATE_EVENT } from '../utils/posEditorBridge';
import {
  BARCODE_FORMAT_OPTIONS, BARCODE_CODE_SOURCE_OPTIONS, BARCODE_LABEL_PRESETS,
  BARCODE_STUDIO_TABS, DEFAULT_BARCODE_STUDIO,
  sanitizeBarcodeStudioSettings, barcodeValueFromSource, normalizeBarcodeByFormat,
  buildBarcodeLabels, barcodeStudioHtml, calculateBarcodePageSize, barcodeRows,
  isMatrixBarcodeFormat,
  BARCODE_TEMPLATE_STORAGE_KEY,
  sanitizeBarcodeTemplate,
  parseBarcodeTemplates,
  normalizeTemplateValue
} from '../utils/barcodeUtils';
import {
  IMPORT_FIELD_OPTIONS, parseLine, delimiter, toImportHeaders,
  buildImportFieldAutoMapping, mapRowsWithImportMapping, importGroups,
  isIgnorableProductImportRow
} from '../utils/importUtils';

const loadProductModal = () => import('../components/products/ProductModal');
const ProductModal = lazy(loadProductModal);
const loadBulkProductModal = () => import('../components/products/BulkProductModal');
const BulkProductModal = lazy(loadBulkProductModal);
const loadBarcodeStudioModal = () => import('../components/products/BarcodeStudioModal');
const BarcodeStudioModal = lazy(loadBarcodeStudioModal);

const PRODUCTS_PAGE_SIZE = 50;
const COLUMN_STORAGE_KEY = 'products.visibleColumns.v1';
const PRODUCT_SEARCH_DEBOUNCE_MS = 250;












const ProductGridRow = React.memo(({ index, style, data }) => {
  const {
    visibleProducts,
    activeColumns,
    selectedIds,
    categoryMap,
    warehouseMap,
    productMetaMap,
    toggleId,
    openEdit,
    printBarcodes,
    deleteProduct,
    showVariantsSummary,
    openTransfer,
    gridTemplateColumns
  } = data;

  const product = visibleProducts[index];

  if (!product) return null;

  const status = productMetaMap.get(product.id)?.status || stock(product);
  const category = categoryMap.get(product.categoryId);
  const productCode = nText(product.sku) || nText(product.barcode) || `#${product.id}`;

  const renderCell = (columnKey) => {
    switch (columnKey) {
      case 'select':
        return (
          <input
            type="checkbox"
            checked={selectedIds.has(product.id)}
            onChange={() => toggleId(product.id)}
            aria-label={`تحديد ${product.name}`}
          />
        );
      case 'code':
        return <span className="grid-code">{productCode}</span>;
      case 'name':
        return (
          <div className="grid-name-cell no-image" title={product.name}>
            <strong>{product.name}</strong>
          </div>
        );
      case 'warehouses': {
        const stocks = product.warehouseStocks || [];
        if (stocks.length === 0) return <span style={{ color: '#94a3b8' }}>-</span>;
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', fontSize: '0.85rem' }}>
            {stocks.map((stock) => {
              const wh = warehouseMap.get(stock.warehouseId);
              if (!wh || !wh.isActive) return null;
              return (
                <span
                  key={stock.warehouseId}
                  style={{
                    backgroundColor: `${wh.color || '#64748b'}1f`,
                    color: wh.color || '#334155',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    border: `1px solid ${wh.color || '#64748b'}33`,
                    fontSize: '0.8rem'
                  }}
                  title={`${wh.name}: ${stock.quantity}`}
                >
                  {wh.icon || '⌂'} {stock.quantity}
                </span>
              );
            })}
          </div>
        );
      }
      case 'unit':
        return <span>{nText(product?.unitName) || DEFAULT_UNIT}</span>;
      case 'quantity':
        return <strong>{status.total}</strong>;
      case 'salePrice':
        return <span className="price-sale">{money(salePriceOf(product))}</span>;
      case 'costPrice':
        return <span>{money(costPriceOf(product))}</span>;
      case 'wholesalePrice':
        return <span>{money(wholesale(product))}</span>;
      case 'saleLimit':
        return <span>{status.min}</span>;
      case 'notes': {
        const notesText = nText(product?.inventory?.notes) || '-';
        return <span className="grid-notes" title={notesText}>{notesText}</span>;
      }
      case 'category':
        return (
          <span
            className="category-chip"
            style={{
              backgroundColor: `${category?.color || '#64748b'}1f`,
              color: category?.color || '#334155',
              borderColor: `${category?.color || '#64748b'}66`
            }}
          >
            {category?.name || 'غير مصنف'}
          </span>
        );
      case 'variants':
        return (
          <button type="button" className="link-btn" onClick={() => showVariantsSummary(product)}>
            {(product.variants || []).length} متغير
          </button>
        );
      case 'stockState':
        return (
          <div className="stock-cell">
            <span className={`stock-chip ${status.tone}`}>{status.label}</span>
            <small>مخزن {nInt(product?.inventory?.warehouseQty, 0)} | عرض {nInt(product?.inventory?.displayQty, 0)}</small>
          </div>
        );
      case 'updatedAt':
        return <span>{new Date(product.updatedAt || product.createdAt || Date.now()).toLocaleDateString('ar-EG')}</span>;
      case 'actions':
        return (
          <ProductRowActions
            product={product}
            onEdit={openEdit}
            onPrint={printBarcodes}
            onDelete={deleteProduct}
            onTransfer={openTransfer}
          />
        );
      default:
        return '-';
    }
  };

  return (
    <div
      className={`products-grid-row ${index % 2 === 0 ? 'even' : 'odd'}`}
      style={{ ...style, display: 'grid', gridTemplateColumns }}
    >
      {activeColumns.map((column) => (
        <div key={`${product.id}-${column.key}`} className={`products-grid-cell cell-${column.key}`}>
          {renderCell(column.key)}
        </div>
      ))}
    </div>
  );
}, (prevProps, nextProps) => {
  if (prevProps.index !== nextProps.index) return false;
  const prevStyle = prevProps.style || {};
  const nextStyle = nextProps.style || {};
  if (
    prevStyle.top !== nextStyle.top
    || prevStyle.left !== nextStyle.left
    || prevStyle.height !== nextStyle.height
    || prevStyle.width !== nextStyle.width
  ) {
    return false;
  }
  if (prevProps.data.gridTemplateColumns !== nextProps.data.gridTemplateColumns) return false;

  const prevProductId = prevProps.data.visibleProducts[prevProps.index]?.id;
  const nextProductId = nextProps.data.visibleProducts[nextProps.index]?.id;
  if (prevProductId !== nextProductId) return false;

  const prevProduct = prevProps.data.visibleProducts[prevProps.index];
  const nextProduct = nextProps.data.visibleProducts[nextProps.index];
  if (prevProduct !== nextProduct) return false;
  if (prevProps.data.activeColumns !== nextProps.data.activeColumns) return false;
  if (prevProps.data.categoryMap !== nextProps.data.categoryMap) return false;
  if (prevProps.data.warehouseMap !== nextProps.data.warehouseMap) return false;
  if (prevProps.data.productMetaMap !== nextProps.data.productMetaMap) return false;

  const prevSelected = prevProductId != null && prevProps.data.selectedIds?.has(prevProductId);
  const nextSelected = nextProductId != null && nextProps.data.selectedIds?.has(nextProductId);

  return prevSelected === nextSelected;
});

export default function Products() {
  const [products, setProducts] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [sortCol, setSortCol] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');

  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showSearchRow, setShowSearchRow] = useState(false);
  const [columnSearches, setColumnSearches] = useState({});
  const [debouncedColumnSearches, setDebouncedColumnSearches] = useState({});
  const [gridHeight, setGridHeight] = useState(getGridHeight);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_VISIBLE_COLUMN_KEYS;
    try {
      const raw = window.localStorage.getItem(COLUMN_STORAGE_KEY);
      if (!raw) return DEFAULT_VISIBLE_COLUMN_KEYS;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return DEFAULT_VISIBLE_COLUMN_KEYS;
      const valid = parsed.filter((key) => GRID_COLUMNS.some((col) => col.key === key && !col.required));
      return valid.length ? valid : DEFAULT_VISIBLE_COLUMN_KEYS;
    } catch (err) {
      return DEFAULT_VISIBLE_COLUMN_KEYS;
    }
  });

  const [showProductModal, setShowProductModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingProductLoading, setEditingProductLoading] = useState(false);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showBulkProductModal, setShowBulkProductModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showPriceUpdateModal, setShowPriceUpdateModal] = useState(false);
  const [transferProduct, setTransferProduct] = useState(null);

  const [importSession, setImportSession] = useState(null);
  const [showBarcodeStudio, setShowBarcodeStudio] = useState(false);
  const [barcodeStudioProducts, setBarcodeStudioProducts] = useState([]);
  const [barcodePrinting, setBarcodePrinting] = useState(false);
  const [barcodeStudioSettings, setBarcodeStudioSettings] = useState(() => {
    const appSettings = getAppSettings();
    return sanitizeBarcodeStudioSettings(appSettings.defaultBarcodeStudioSettings || DEFAULT_BARCODE_STUDIO);
  });
  const [barcodeTemplates, setBarcodeTemplates] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      return parseBarcodeTemplates(window.localStorage.getItem(BARCODE_TEMPLATE_STORAGE_KEY));
    } catch (err) {
      return [];
    }
  });
  const [activeBarcodeTemplateId, setActiveBarcodeTemplateId] = useState('');
  const [barcodeTemplateName, setBarcodeTemplateName] = useState('');
  const [barcodeTemplatePrinter, setBarcodeTemplatePrinter] = useState(() => {
    const appSettings = getAppSettings();
    return normalizeDefaultPrinterName(
      appSettings.defaultBarcodePrinterName || appSettings.defaultPrinterName
    );
  });
  const [barcodeStudioTab, setBarcodeStudioTab] = useState(() => {
    const appSettings = getAppSettings();
    return normalizeBarcodeStudioStartTab(appSettings.defaultBarcodeStudioStartTab);
  });
  const [matrixBarcodeLibrary, setMatrixBarcodeLibrary] = useState(null);
  const [matrixBarcodeEngineLoading, setMatrixBarcodeEngineLoading] = useState(false);
  const [matrixBarcodeEngineError, setMatrixBarcodeEngineError] = useState('');
  const [printers, setPrinters] = useState([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);

  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const importRef = useRef(null);
  const gridViewportRef = useRef(null);
  const gridHeaderRef = useRef(null);
  const productsListRef = useRef(null);
  const hasLoadedProductsRef = useRef(false);
  const latestProductsRequestRef = useRef(0);
  const editProductRequestRef = useRef(0);
  const matrixBarcodeLoaderRef = useRef(null);

  const sortPreset = useMemo(() => {
    const p = SORT_PRESETS.find((s) => s.sortCol === sortCol && s.sortDir === sortDir);
    return p ? p.id : 'custom';
  }, [sortCol, sortDir]);

  const handleColumnSort = useCallback((key) => {
    const SORT_MAPPING = {
      name: 'name',
      salePrice: 'basePrice',
      costPrice: 'cost',
      updatedAt: 'updatedAt',
      code: 'sku'
    };
    const mappedKey = SORT_MAPPING[key];
    if (!mappedKey) return;
    setSortDir((prev) => (sortCol === mappedKey && prev === 'asc' ? 'desc' : 'asc'));
    setSortCol(mappedKey);
    setCurrentPage(1);
  }, [sortCol]);
  const normalizedColumnSearches = useMemo(() => {
    const entries = Object.entries(debouncedColumnSearches || {})
      .map(([key, value]) => [nText(key), nText(value)])
      .filter(([key, value]) => key && value);
    return Object.fromEntries(entries);
  }, [debouncedColumnSearches]);
  const importColumnSamples = useMemo(() => {
    if (!importSession) return new Map();

    const samples = new Map();
    const previewRows = importSession.rows.slice(0, 120);
    for (const header of importSession.headers) {
      for (const row of previewRows) {
        const value = nText(row[header.index]);
        if (value) {
          samples.set(header.id, value);
          break;
        }
      }
    }

    return samples;
  }, [importSession]);
  const barcodeStudioRows = useMemo(() => barcodeRows(barcodeStudioProducts), [barcodeStudioProducts]);
  const barcodeStudioSafeSettings = useMemo(
    () => sanitizeBarcodeStudioSettings(barcodeStudioSettings),
    [barcodeStudioSettings]
  );
  const activeBarcodeTemplate = useMemo(
    () => barcodeTemplates.find((template) => template.id === activeBarcodeTemplateId) || null,
    [barcodeTemplates, activeBarcodeTemplateId]
  );
  const activeBarcodeStudioTab = useMemo(
    () => BARCODE_STUDIO_TABS.find((tab) => tab.id === barcodeStudioTab) || BARCODE_STUDIO_TABS[0],
    [barcodeStudioTab]
  );
  const barcodePreviewIsMatrix = isMatrixBarcodeFormat(barcodeStudioSafeSettings.format);
  const barcodePreview = useMemo(() => {
    if (barcodePreviewIsMatrix && !matrixBarcodeLibrary) {
      return { labels: [], invalidRows: [] };
    }
    return buildBarcodeLabels(barcodeStudioRows, barcodeStudioSafeSettings, 10, matrixBarcodeLibrary);
  }, [barcodeStudioRows, barcodeStudioSafeSettings, barcodePreviewIsMatrix, matrixBarcodeLibrary]);
  const barcodePrintPreferences = useMemo(() => {
    const appSettings = getAppSettings();
    return {
      printerName: normalizeDefaultPrinterName(
        activeBarcodeTemplate?.printer
        || barcodeTemplatePrinter
        || appSettings.defaultBarcodePrinterName
        || appSettings.defaultPrinterName
      ),
      printMode: normalizeBarcodePrintMode(appSettings.defaultBarcodePrintMode),
      startTab: normalizeBarcodeStudioStartTab(appSettings.defaultBarcodeStudioStartTab),
      studioDefaults: sanitizeBarcodeStudioSettings(
        appSettings.defaultBarcodeStudioSettings || DEFAULT_BARCODE_STUDIO
      )
    };
  }, [activeBarcodeTemplate, barcodeTemplatePrinter]);

  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const ensureMatrixBarcodeLibrary = useCallback(async () => {
    if (matrixBarcodeLibrary && typeof matrixBarcodeLibrary.toSVG === 'function') {
      return matrixBarcodeLibrary;
    }
    if (matrixBarcodeLoaderRef.current) {
      return matrixBarcodeLoaderRef.current;
    }

    setMatrixBarcodeEngineLoading(true);
    setMatrixBarcodeEngineError('');

    matrixBarcodeLoaderRef.current = import('bwip-js')
      .then((module) => {
        const loaded = module?.default && typeof module.default.toSVG === 'function'
          ? module.default
          : module;

        if (!loaded || typeof loaded.toSVG !== 'function') {
          throw new Error('تعذر تحميل محرك QR/DataMatrix');
        }

        setMatrixBarcodeLibrary(loaded);
        return loaded;
      })
      .catch((err) => {
        const message = err?.message || 'تعذر تحميل محرك QR/DataMatrix';
        setMatrixBarcodeEngineError(message);
        throw err;
      })
      .finally(() => {
        setMatrixBarcodeEngineLoading(false);
        matrixBarcodeLoaderRef.current = null;
      });

    return matrixBarcodeLoaderRef.current;
  }, [matrixBarcodeLibrary]);

  const recalculateGridHeight = useCallback(() => {
    const viewportHeight = gridViewportRef.current?.clientHeight || 0;
    const headerHeight = gridHeaderRef.current?.offsetHeight || 0;
    const nextHeight = viewportHeight > 0
      ? Math.max(220, viewportHeight - headerHeight)
      : getGridHeight();

    setGridHeight((prev) => (Math.abs(prev - nextHeight) > 1 ? nextHeight : prev));
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);



  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visibleColumnKeys));
  }, [visibleColumnKeys]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(BARCODE_TEMPLATE_STORAGE_KEY, JSON.stringify(barcodeTemplates));
  }, [barcodeTemplates]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearchTerm((prev) => {
        const next = nText(searchTerm);
        return prev === next ? prev : next;
      });
    }, PRODUCT_SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [searchTerm]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedColumnSearches((prev) => {
        const prevObj = prev || {};
        const nextObj = columnSearches || {};
        const keys1 = Object.keys(prevObj);
        const keys2 = Object.keys(nextObj);
        let isSame = keys1.length === keys2.length;
        if (isSame) {
          for (const k of keys1) {
            if (prevObj[k] !== nextObj[k]) {
              isSame = false;
              break;
            }
          }
        }
        return isSame ? prev : nextObj;
      });
    }, PRODUCT_SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [columnSearches]);

  useEffect(() => {
    if (!showBarcodeStudio || !barcodePreviewIsMatrix) return;
    ensureMatrixBarcodeLibrary().catch(() => { });
  }, [showBarcodeStudio, barcodePreviewIsMatrix, ensureMatrixBarcodeLibrary]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => window.requestAnimationFrame(recalculateGridHeight);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [recalculateGridHeight]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      recalculateGridHeight();
      return undefined;
    }

    const observer = new ResizeObserver(() => recalculateGridHeight());
    if (gridViewportRef.current) observer.observe(gridViewportRef.current);
    if (gridHeaderRef.current) observer.observe(gridHeaderRef.current);
    recalculateGridHeight();

    return () => observer.disconnect();
  }, [recalculateGridHeight]);

  const loadCategories = useCallback(async () => {
    const res = await window.api.getCategories();
    if (!res?.error) setCategories(Array.isArray(res) ? res : []);
  }, []);

  const loadWarehouses = useCallback(async () => {
    const res = await window.api.getWarehouses();
    if (!res?.error) setWarehouses(Array.isArray(res) ? res : []);
  }, []);

  const loadPrinters = useCallback(async () => {
    if (typeof window === 'undefined') return;
    setLoadingPrinters(true);
    try {
      const res = await window.api.listPrinters();
      setPrinters(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('Failed to load printers:', err);
      setPrinters([]);
    } finally {
      setLoadingPrinters(false);
    }
  }, []);

  const saveBarcodeSystemSettings = useCallback(async (updatedSettings) => {
    try {
      const res = saveAppSettings(updatedSettings);
      if (res?.error) throw new Error(res.error);
      notify('تم حفظ إعدادات الباركود الافتراضية بنجاح.');
    } catch (err) {
      await safeAlert(err.message || 'فشل حفظ الإعدادات', null, { type: 'error', title: 'إعدادات الباركود' });
    }
  }, [notify]);

  const loadProducts = useCallback(async (options = false) => {
    const silent = typeof options === 'boolean' ? options : Boolean(options?.silent);
    const requestId = latestProductsRequestRef.current + 1;
    latestProductsRequestRef.current = requestId;
    const term = nText(debouncedSearchTerm);
    const hasColumnSearch = Object.keys(normalizedColumnSearches).length > 0;

    const shouldBlockUi = !hasLoadedProductsRef.current && !silent;
    if (shouldBlockUi) setLoading(true);
    else setRefreshing(true);
    if ((term || hasColumnSearch) && !silent) setSearchLoading(true);

    try {
      const res = await window.api.getProducts({
        page: currentPage,
        pageSize: PRODUCTS_PAGE_SIZE,
        searchTerm: term,
        columnSearches: normalizedColumnSearches,
        categoryId: categoryFilter || null,
        warehouseId: warehouseFilter || null,
        stockFilter: stockFilter || 'all',
        sortCol: sortCol,
        sortDir: sortDir,
        includeImage: false
      });

      if (res?.error) throw new Error(res.error);
      if (requestId !== latestProductsRequestRef.current) return;

      const rows = Array.isArray(res?.data) ? res.data : [];
      const total = Math.max(0, nInt(res?.total, rows.length));
      const nextTotalPages = Math.max(1, nInt(res?.totalPages, Math.ceil(total / PRODUCTS_PAGE_SIZE)));

      setProducts(rows);
      setTotalItems(total);
      setTotalPages(nextTotalPages);
    } catch (err) {
      if (requestId !== latestProductsRequestRef.current) return;
      await safeAlert(err.message || 'فشل تحميل البيانات', null, { type: 'error', title: 'المنتجات' });
      setProducts([]);
      setTotalItems(0);
      setTotalPages(1);
    } finally {
      if (requestId !== latestProductsRequestRef.current) return;
      hasLoadedProductsRef.current = true;
      setLoading(false);
      setRefreshing(false);
      setSearchLoading(false);
    }
  }, [sortCol, sortDir, categoryFilter, warehouseFilter, currentPage, debouncedSearchTerm, normalizedColumnSearches, stockFilter]);

  useEffect(() => {
    loadCategories();
    loadWarehouses();
    loadPrinters();
  }, [loadCategories, loadWarehouses, loadPrinters]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    productsListRef.current?.scrollTo(0);
  }, [currentPage]);

  const refreshVisibleProducts = useCallback(async () => {
    await loadProducts(true);
  }, [loadProducts]);

  const handleRefresh = useCallback(() => {
    loadProducts(true);
  }, [loadProducts]);

  const categoryMap = useMemo(() => {
    const map = new Map();
    categories.forEach((category) => map.set(category.id, category));
    return map;
  }, [categories]);

  const warehouseMap = useMemo(() => {
    const map = new Map();
    warehouses.forEach((warehouse) => map.set(warehouse.id, warehouse));
    return map;
  }, [warehouses]);

  const activeProducts = products;

  const preparedProducts = useMemo(() => (
    activeProducts.map((product) => ({
      product,
      status: stock(product)
    }))
  ), [activeProducts]);

  const productMetaMap = useMemo(() => {
    const map = new Map();
    preparedProducts.forEach((entry) => {
      map.set(entry.product.id, entry);
    });
    return map;
  }, [preparedProducts]);

  const visibleProducts = activeProducts;
  const tableLoading = loading || refreshing || searchLoading;

  const columnFilteredProducts = visibleProducts;

  const handleSearchChange = useCallback((value) => {
    setSearchLoading(Boolean(nText(value)));
    setCurrentPage(1);
    setSearchTerm(value);
  }, []);

  const handleCategoryFilterChange = useCallback((value) => {
    setCurrentPage(1);
    setCategoryFilter(value);
  }, []);

  const handleWarehouseFilterChange = useCallback((value) => {
    setCurrentPage(1);
    setWarehouseFilter(value);
  }, []);

  const handleStockFilterChange = useCallback((value) => {
    setCurrentPage(1);
    setStockFilter(value);
  }, []);

  const handleSortPresetChange = useCallback((value) => {
    const preset = SORT_PRESETS.find((s) => s.id === value);
    if (preset) {
      setSortCol(preset.sortCol);
      setSortDir(preset.sortDir);
      setCurrentPage(1);
    }
  }, []);

  const handleColumnSearchChange = useCallback((columnKey, value) => {
    setSearchLoading(true);
    setCurrentPage(1);
    setColumnSearches((prev) => ({
      ...prev,
      [columnKey]: value
    }));
  }, []);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const displayedProducts = columnFilteredProducts;

  const pageStart = totalItems === 0 ? 0 : ((currentPage - 1) * PRODUCTS_PAGE_SIZE) + 1;
  const pageEnd = totalItems === 0 ? 0 : Math.min(totalItems, pageStart + products.length - 1);

  // Metrics calculation removed as the UI component was removed
  const metrics = null;

  const allVisibleSelected = useMemo(() => (
    displayedProducts.length > 0 && displayedProducts.every((p) => selectedIds.has(p.id))
  ), [selectedIds, displayedProducts]);

  const activeColumns = useMemo(() => {
    const optionalSet = new Set(visibleColumnKeys);
    return GRID_COLUMNS.filter((column) => column.required || optionalSet.has(column.key));
  }, [visibleColumnKeys]);

  const gridTemplateColumns = useMemo(
    () => {
      // تجميع widths بحيث تتقلص الأعمدة تلقائياً عند إضافة أعمدة جديدة
      return activeColumns.map((column) => column.width).join(' ');
    },
    [activeColumns]
  );

  const gridContentWidth = useMemo(
    () => '100%',
    []
  );

  const fetchProductDetails = useCallback(async (productId) => {
    const res = await window.api.getProduct(productId);
    if (res?.error) throw new Error(res.error);
    if (!res?.id) throw new Error('تعذر تحميل بيانات المنتج');
    return res;
  }, []);

  const openCreate = useCallback(() => {
    editProductRequestRef.current += 1;
    void loadProductModal();
    setModalMode('create');
    setEditingProduct(null);
    setEditingProductLoading(false);
    setShowProductModal(true);
  }, []);

  const openEdit = useCallback((product) => {
    const requestId = editProductRequestRef.current + 1;
    editProductRequestRef.current = requestId;

    void loadProductModal();
    setModalMode('edit');
    setEditingProduct(null);
    setEditingProductLoading(true);
    setShowProductModal(true);

    (async () => {
      try {
        const detailedProduct = await fetchProductDetails(product.id);
        if (editProductRequestRef.current !== requestId) return;
        setEditingProduct(detailedProduct);
      } catch (err) {
        if (editProductRequestRef.current !== requestId) return;
        setShowProductModal(false);
        setEditingProduct(null);
        await safeAlert(err.message || 'تعذر تحميل بيانات المنتج', null, { type: 'error', title: 'تعديل منتج' });
      } finally {
        if (editProductRequestRef.current !== requestId) return;
        setEditingProductLoading(false);
      }
    })();
  }, [fetchProductDetails]);

  const closeProductModal = useCallback(() => {
    editProductRequestRef.current += 1;
    setShowProductModal(false);
    setEditingProduct(null);
    setEditingProductLoading(false);
  }, []);

  const handleSaveProduct = async (productData) => {
    setSaving(true);
    try {
      const editingId = modalMode === 'edit' ? editingProduct?.id : null;
      const basePrice = Math.max(0, nNum(productData.basePrice, 0));
      const cost = Math.max(0, nNum(productData.cost, 0));
      const wholesalePrice = Math.min(basePrice, Math.max(0, nNum(productData.wholesalePrice, basePrice)));
      const minSalePrice = Math.min(wholesalePrice, Math.max(0, nNum(productData.minSalePrice, wholesalePrice)));
      const unitName = nText(productData.unitName) || DEFAULT_UNIT;

      const normalizedVariants = (productData.hasVariants ? (Array.isArray(productData.variants) ? productData.variants : []) : [])
        .map((variant) => ({
          id: variant?.id ? nInt(variant.id, null) : null,
          tempId: nText(variant?.tempId) || null,
          size: nText(variant?.size) || 'موحد',
          color: nText(variant?.color) || 'افتراضي',
          price: Math.max(0, nNum(variant?.price, basePrice)),
          cost: Math.max(0, nNum(variant?.cost, cost)),
          quantity: Math.max(0, nInt(variant?.quantity, 0)),
          barcode: nText(variant?.barcode) || null
        }))
        .filter((variant) => variant.size || variant.color || variant.price || variant.cost || variant.quantity || variant.barcode);

      if (productData.hasVariants && normalizedVariants.length === 0) {
        throw new Error('يجب إضافة متغير واحد على الأقل عند تفعيل الألوان/المقاسات.');
      }

      const variantBarcodeValues = normalizedVariants.map((variant) => nText(variant.barcode).toLowerCase()).filter(Boolean);
      if (new Set(variantBarcodeValues).size !== variantBarcodeValues.length) {
        throw new Error('يوجد باركود مكرر بين المتغيرات.');
      }

      const barcode = nText(productData.barcode);
      const allInternalBarcodes = [
        ...variantBarcodeValues,
        barcode.toLowerCase()
      ].filter(Boolean);
      if (new Set(allInternalBarcodes).size !== allInternalBarcodes.length) {
        throw new Error('يوجد تعارض باركود داخل نفس المنتج.');
      }

      const sku = nText(productData.sku || productData.code);
      const variantsTotal = normalizedVariants.reduce((sum, variant) => sum + nInt(variant.quantity, 0), 0);
      const requestedTotalQuantity = Math.max(0, nInt(productData.totalQuantity, 0));
      const normalizedTotalQuantity = productData.hasVariants ? variantsTotal : requestedTotalQuantity;

      if (sku && products.some((product) => product.id !== editingId && nText(product.sku).toLowerCase() === sku.toLowerCase())) {
        throw new Error('كود الصنف (SKU) مستخدم بالفعل.');
      }
      if (barcode && products.some((product) => product.id !== editingId && nText(product.barcode).toLowerCase() === barcode.toLowerCase())) {
        throw new Error('باركود المنتج مستخدم بالفعل.');
      }
      if (variantBarcodeValues.some((variantBarcode) => (
        products.some((product) => (
          product.id !== editingId
          && Array.isArray(product.variants)
          && product.variants.some((variant) => nText(variant.barcode).toLowerCase() === variantBarcode)
        ))
      ))) {
        throw new Error('يوجد باركود متغير مستخدم في منتج آخر.');
      }

      const payload = {
        name: nText(productData.name),
        categoryId: productData.categoryId ? nInt(productData.categoryId, null) : null,
        brand: nText(productData.brand) || null,
        description: nText(productData.description) || null,
        sku: sku || null,
        barcode: barcode || null,
        image: nText(productData.image) || null,
        isActive: productData.isActive !== false,
        type: nText(productData.type) || 'store',
        unitName,
        basePrice,
        cost,
        wholesalePrice,
        minSalePrice,
        totalQuantity: normalizedTotalQuantity,
        minStock: Math.max(0, nInt(productData.minStock, 5)),
        maxStock: Math.max(0, nInt(productData.maxStock, 100)),
        notes: nText(productData.notes) || null,
        hasVariants: Boolean(productData.hasVariants),
        variants: normalizedVariants
      };

      if (!payload.name) throw new Error('اسم الصنف مطلوب.');
      payload.maxStock = Math.max(payload.maxStock, payload.minStock);

      const res = modalMode === 'create'
        ? await window.api.addProduct(payload)
        : await window.api.updateProduct(editingProduct.id, payload);

      if (res?.error) throw new Error(res.error);

      const productId = modalMode === 'create' ? res?.id : editingProduct?.id;
      if (productId) {
        let finalVariants = [];
        const variantIdByToken = new Map();
        const registerVariantToken = (variantInput, variantOutput) => {
          const savedId = nInt(variantOutput?.id, null);
          if (!savedId) return;
          const inputId = nInt(variantInput?.id, null);
          const inputTempId = nText(variantInput?.tempId);
          if (inputId) variantIdByToken.set(`id:${inputId}`, savedId);
          if (inputTempId) variantIdByToken.set(`temp:${inputTempId}`, savedId);
        };

        if (payload.hasVariants) {
          if (modalMode === 'create') {
            for (const variant of payload.variants) {
              const addVariantRes = await window.api.addVariant({
                productId,
                size: variant.size,
                color: variant.color,
                price: variant.price,
                cost: variant.cost,
                quantity: variant.quantity,
                barcode: variant.barcode
              });
              if (addVariantRes?.error) throw new Error(addVariantRes.error);
              finalVariants.push(addVariantRes);
              registerVariantToken(variant, addVariantRes);
            }
          } else {
            const existingVariants = Array.isArray(editingProduct?.variants) ? editingProduct.variants : [];
            const existingById = new Map(existingVariants.map((variant) => [variant.id, variant]));
            const keepIds = new Set();

            for (const variant of payload.variants) {
              if (variant.id && existingById.has(variant.id)) {
                const updateVariantRes = await window.api.updateVariant(variant.id, {
                  size: variant.size,
                  color: variant.color,
                  price: variant.price,
                  cost: variant.cost,
                  quantity: variant.quantity,
                  barcode: variant.barcode
                });
                if (updateVariantRes?.error) throw new Error(updateVariantRes.error);
                keepIds.add(variant.id);
                finalVariants.push(updateVariantRes);
                registerVariantToken(variant, updateVariantRes);
              } else {
                const addVariantRes = await window.api.addVariant({
                  productId,
                  size: variant.size,
                  color: variant.color,
                  price: variant.price,
                  cost: variant.cost,
                  quantity: variant.quantity,
                  barcode: variant.barcode
                });
                if (addVariantRes?.error) throw new Error(addVariantRes.error);
                if (addVariantRes?.id) keepIds.add(addVariantRes.id);
                finalVariants.push(addVariantRes);
                registerVariantToken(variant, addVariantRes);
              }
            }

            const toDelete = existingVariants.filter((variant) => !keepIds.has(variant.id));
            for (const variant of toDelete) {
              const deleteVariantRes = await window.api.deleteVariant(variant.id);
              if (deleteVariantRes?.error) throw new Error(deleteVariantRes.error);
            }
          }
        } else if (modalMode === 'edit') {
          const existingVariants = Array.isArray(editingProduct?.variants) ? editingProduct.variants : [];
          for (const variant of existingVariants) {
            const deleteVariantRes = await window.api.deleteVariant(variant.id);
            if (deleteVariantRes?.error) throw new Error(deleteVariantRes.error);
          }
        }

        if (payload.hasVariants) {
          const rawRows = Array.isArray(productData.variantWarehouseStocks) ? productData.variantWarehouseStocks : [];
          const resolvedRows = rawRows
            .map((row) => {
              const explicitVariantId = nInt(row?.variantId, null);
              const tempId = nText(row?.tempId);
              const resolvedVariantId = explicitVariantId
                || variantIdByToken.get(explicitVariantId ? `id:${explicitVariantId}` : '')
                || variantIdByToken.get(tempId ? `temp:${tempId}` : '');
              return {
                variantId: resolvedVariantId || null,
                warehouseId: nInt(row?.warehouseId, null),
                quantity: Math.max(0, nInt(row?.quantity, 0))
              };
            })
            .filter((row) => row.variantId && row.warehouseId);

          const stocksRes = await window.api.updateVariantWarehouseStocks(productId, resolvedRows);
          if (stocksRes?.error) throw new Error(stocksRes.error);
        } else if (Array.isArray(productData.warehouseStocks) && productData.warehouseStocks.length > 0) {
          const stocksRes = await window.api.updateMultipleWarehouseStocks(productId, productData.warehouseStocks);
          if (stocksRes?.error) throw new Error(stocksRes.error);
        }

        const previousInventory = modalMode === 'edit' ? (editingProduct?.inventory || {}) : {};
        const finalVariantsTotal = payload.hasVariants
          ? finalVariants.reduce((sum, variant) => sum + nInt(variant.quantity, 0), 0)
          : 0;
        const finalTotalQuantity = payload.hasVariants
          ? finalVariantsTotal
          : Math.max(0, nInt(payload.totalQuantity, nInt(previousInventory?.totalQuantity, 0)));

        const inventoryPayload = {
          minStock: Math.max(0, nInt(payload.minStock, nInt(previousInventory?.minStock, 5))),
          maxStock: Math.max(0, nInt(payload.maxStock, nInt(previousInventory?.maxStock, 100))),
          warehouseQty: finalTotalQuantity,
          displayQty: 0,
          totalQuantity: finalTotalQuantity,
          notes: payload.notes || null,
          lastRestock: finalTotalQuantity > 0 ? new Date().toISOString() : null
        };
        inventoryPayload.maxStock = Math.max(inventoryPayload.maxStock, inventoryPayload.minStock);

        const inventoryRes = await window.api.updateInventory(productId, inventoryPayload);
        if (inventoryRes?.error) throw new Error(inventoryRes.error);
      }

      closeProductModal();
      await Promise.all([refreshVisibleProducts(), loadCategories()]);
      notify(modalMode === 'create' ? 'تم إنشاء المنتج بنجاح' : 'تم تحديث المنتج بنجاح', 'success');
    } catch (err) {
      await safeAlert(err.message || 'فشل حفظ المنتج', null, { type: 'error', title: 'المنتجات' });
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = useCallback(async (product) => {
    const ok = await safeConfirm(`سيتم حذف المنتج "${product.name}". هل تريد المتابعة؟`, { title: 'حذف منتج' });
    if (!ok) return;

    const res = await window.api.deleteProduct(product.id);
    if (res?.error) {
      await safeAlert(res.error, null, { type: 'error', title: 'تعذر الحذف' });
      return;
    }

    await refreshVisibleProducts();
    notify('تم حذف المنتج', 'success');
  }, [notify, refreshVisibleProducts]);

  const toggleId = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) displayedProducts.forEach((p) => next.delete(p.id));
      else displayedProducts.forEach((p) => next.add(p.id));
      return next;
    });
  };

  const toggleColumnVisibility = (columnKey) => {
    const column = GRID_COLUMNS.find((item) => item.key === columnKey);
    if (!column || column.required) return;

    setVisibleColumnKeys((prev) => {
      if (prev.includes(columnKey)) {
        return prev.filter((item) => item !== columnKey);
      }
      return [...prev, columnKey];
    });
  };

  const showVariantsSummary = useCallback(async (product) => {
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    if (!variants.length) {
      await safeAlert('لا توجد متغيرات مسجلة لهذا الصنف', null, { title: 'المتغيرات', type: 'info' });
      return;
    }

    const lines = variants.slice(0, 40).map((variant, idx) => (
      `${idx + 1}) ${variant.productSize || '-'} / ${variant.color || '-'} | كمية ${nInt(variant.quantity, 0)} | بيع ${money(variant.price)}`
    ));
    const overflowText = variants.length > 40 ? `\n... +${variants.length - 40} متغير إضافي` : '';
    await safeAlert(`${lines.join('\n')}${overflowText}`, null, { title: `متغيرات: ${product.name}` });
  }, []);

  const openTransfer = useCallback((product) => {
    setTransferProduct(product);
    setShowTransferModal(true);
  }, []);

  const setBarcodeSetting = useCallback((key, value) => {
    setBarcodeStudioSettings((prev) => {
      const next = { ...prev, [key]: value };

      if (key === 'format' && isMatrixBarcodeFormat(value)) {
        next.barcodeHeightMm = Math.max(inRange(prev.barcodeHeightMm, DEFAULT_BARCODE_STUDIO.barcodeHeightMm, 6, 80), 16);
        next.barcodeWidthPx = Math.max(inRange(prev.barcodeWidthPx, DEFAULT_BARCODE_STUDIO.barcodeWidthPx, 1, 6), 2);
      }

      return next;
    });
  }, []);

  const setBarcodeNumberSetting = useCallback((key, rawValue, min, max) => {
    const num = Number(rawValue);
    if (!Number.isFinite(num)) return;
    setBarcodeStudioSettings((prev) => ({ ...prev, [key]: Math.min(max, Math.max(min, num)) }));
  }, []);

  const applyBarcodePreset = useCallback((presetId) => {
    const preset = BARCODE_LABEL_PRESETS.find((item) => item.id === presetId) || BARCODE_LABEL_PRESETS[0];
    setBarcodeStudioSettings((prev) => {
      if (preset.id === 'custom') {
        return { ...prev, presetId: 'custom' };
      }
      return {
        ...prev,
        presetId: preset.id,
        labelWidthMm: preset.widthMm,
        labelHeightMm: preset.heightMm
      };
    });
  }, []);

  const applyBarcodeTemplate = useCallback((templateId) => {
    setActiveBarcodeTemplateId(templateId);
    if (!templateId) return;

    const template = barcodeTemplates.find((item) => item.id === templateId);
    if (!template) return;

    setBarcodeStudioSettings(sanitizeBarcodeStudioSettings(template.settings));
    setBarcodeTemplateName(template.name);
    setBarcodeTemplatePrinter(template.printer || '');
  }, [barcodeTemplates]);

  const saveNewBarcodeTemplate = useCallback(async () => {
    const name = normalizeTemplateValue(barcodeTemplateName, 80);
    if (!name) {
      await safeAlert('اكتب اسم القالب قبل الحفظ', null, { type: 'warning', title: 'قوالب الطباعة' });
      return;
    }

    const now = Date.now();
    const template = {
      id: `barcode-template-${now}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      printer: normalizeTemplateValue(barcodeTemplatePrinter, 80),
      settings: sanitizeBarcodeStudioSettings(barcodeStudioSettings),
      createdAt: now,
      updatedAt: now
    };

    setBarcodeTemplates((prev) => [template, ...prev].sort((a, b) => b.updatedAt - a.updatedAt));
    setActiveBarcodeTemplateId(template.id);
    notify(`تم حفظ القالب "${name}"`, 'success');
  }, [barcodeTemplateName, barcodeTemplatePrinter, barcodeStudioSettings, notify]);

  const updateBarcodeTemplate = useCallback(async () => {
    if (!activeBarcodeTemplate) {
      await safeAlert('اختر قالبًا محفوظًا أولاً', null, { type: 'warning', title: 'قوالب الطباعة' });
      return;
    }

    const nextName = normalizeTemplateValue(barcodeTemplateName || activeBarcodeTemplate.name, 80);
    if (!nextName) {
      await safeAlert('اسم القالب لا يمكن أن يكون فارغًا', null, { type: 'warning', title: 'قوالب الطباعة' });
      return;
    }

    const nextPrinter = normalizeTemplateValue(barcodeTemplatePrinter, 80);
    const now = Date.now();

    setBarcodeTemplates((prev) => (
      prev
        .map((item) => {
          if (item.id !== activeBarcodeTemplate.id) return item;
          return {
            ...item,
            name: nextName,
            printer: nextPrinter,
            settings: sanitizeBarcodeStudioSettings(barcodeStudioSettings),
            updatedAt: now
          };
        })
        .sort((a, b) => b.updatedAt - a.updatedAt)
    ));

    setBarcodeTemplateName(nextName);
    setBarcodeTemplatePrinter(nextPrinter);
    notify(`تم تحديث القالب "${nextName}"`, 'success');
  }, [activeBarcodeTemplate, barcodeTemplateName, barcodeTemplatePrinter, barcodeStudioSettings, notify]);

  const deleteBarcodeTemplate = useCallback(async () => {
    if (!activeBarcodeTemplate) {
      await safeAlert('اختر قالبًا لحذفه', null, { type: 'warning', title: 'قوالب الطباعة' });
      return;
    }

    const confirmed = await safeConfirm(`حذف القالب "${activeBarcodeTemplate.name}"؟`, { title: 'قوالب الطباعة' });
    if (!confirmed) return;

    setBarcodeTemplates((prev) => prev.filter((item) => item.id !== activeBarcodeTemplate.id));
    setActiveBarcodeTemplateId('');
    setBarcodeTemplateName('');
    setBarcodeTemplatePrinter('');
    notify('تم حذف القالب', 'warning');
  }, [activeBarcodeTemplate, notify]);

  const buildStudioLabels = useCallback(async (safeSettings) => {
    let matrixLibrary = matrixBarcodeLibrary;
    if (isMatrixBarcodeFormat(safeSettings.format)) {
      matrixLibrary = await ensureMatrixBarcodeLibrary();
    }
    return buildBarcodeLabels(barcodeStudioRows, safeSettings, Number.POSITIVE_INFINITY, matrixLibrary);
  }, [barcodeStudioRows, matrixBarcodeLibrary, ensureMatrixBarcodeLibrary]);

  const applyBarcodeSystemDefaults = useCallback(() => {
    const appSettings = getAppSettings();
    const nextPrinterName = normalizeDefaultPrinterName(
      appSettings.defaultBarcodePrinterName || appSettings.defaultPrinterName
    );

    setActiveBarcodeTemplateId('');
    setBarcodeTemplateName('');
    setBarcodeTemplatePrinter(nextPrinterName);
    setBarcodeStudioSettings(
      sanitizeBarcodeStudioSettings(appSettings.defaultBarcodeStudioSettings || DEFAULT_BARCODE_STUDIO)
    );
    setBarcodeStudioTab(normalizeBarcodeStudioStartTab(appSettings.defaultBarcodeStudioStartTab));
  }, []);

  const resetBarcodeStudioSettings = useCallback(() => {
    applyBarcodeSystemDefaults();
  }, [applyBarcodeSystemDefaults]);

  const closeBarcodeStudio = useCallback(() => {
    if (barcodePrinting) return;
    setShowBarcodeStudio(false);
    setBarcodeStudioProducts([]);
  }, [barcodePrinting]);

  const openBarcodeStudio = useCallback(async (targetProducts) => {
    applyBarcodeSystemDefaults();
    setBarcodeStudioProducts(Array.isArray(targetProducts) ? targetProducts : []);
    setShowBarcodeStudio(true);
  }, [applyBarcodeSystemDefaults]);

  const executeBarcodeStudioPrint = async () => {
    if (barcodePrinting || !barcodeStudioRows.length) return;

    const safeSettings = sanitizeBarcodeStudioSettings(barcodeStudioSettings);
    let labelsResult = { labels: [], invalidRows: [] };

    try {
      labelsResult = await buildStudioLabels(safeSettings);
    } catch (err) {
      await safeAlert(err.message || 'تعذر تحميل محرك الباركود الثنائي الأبعاد', null, { type: 'error', title: 'طباعة باركود' });
      return;
    }

    const { labels, invalidRows } = labelsResult;

    if (!labels.length) {
      const details = invalidRows.slice(0, 6).map((item, idx) => `${idx + 1}) ${nText(item?.row?.name) || 'بدون اسم'} | ${nText(item?.row?.code) || '-'}`);
      const helpText = details.length ? `\n\nأمثلة:\n${details.join('\n')}` : '';
      await safeAlert(`لا توجد أكواد صالحة للطباعة بصيغة ${safeSettings.format}.${helpText}`, null, { type: 'error', title: 'طباعة باركود' });
      return;
    }

    setBarcodePrinting(true);
    try {
      const html = barcodeStudioHtml(labels, safeSettings);
      const pageSize = calculateBarcodePageSize(labels.length, safeSettings);

      const result = await safePrint(html, {
        title: `ملصقات باركود المنتجات (${labels.length})`,
        printerName: barcodePrintPreferences.printerName,
        silent: barcodePrintPreferences.printMode === 'silent',
        preview: barcodePrintPreferences.printMode === 'preview',
        rawPreview: true,
        printOptions: {
          printBackground: true,
          pageSize
        }
      });
      if (result?.error) throw new Error(result.error);

      notify(
        `${barcodePrintPreferences.printMode === 'silent' ? 'تم إرسال' : 'تم فتح معاينة'} ${labels.length} ملصق${invalidRows.length ? `، وتم تجاهل ${invalidRows.length} كود غير صالح` : ''}`,
        invalidRows.length ? 'warning' : 'success'
      );
    } catch (err) {
      await safeAlert(err.message || 'فشل طباعة الباركود', null, { type: 'error', title: 'طباعة باركود' });
    } finally {
      setBarcodePrinting(false);
    }
  };

  const executeBarcodeStudioPdfExport = async () => {
    if (barcodePrinting || !barcodeStudioRows.length) return;

    if (typeof window === 'undefined' || !window.api?.exportPDF) {
      await safeAlert('تصدير PDF متاح داخل تطبيق سطح المكتب فقط', null, { type: 'warning', title: 'تصدير PDF' });
      return;
    }

    const safeSettings = sanitizeBarcodeStudioSettings(barcodeStudioSettings);
    let labelsResult = { labels: [], invalidRows: [] };

    try {
      labelsResult = await buildStudioLabels(safeSettings);
    } catch (err) {
      await safeAlert(err.message || 'تعذر تحميل محرك الباركود الثنائي الأبعاد', null, { type: 'error', title: 'تصدير PDF' });
      return;
    }

    const { labels, invalidRows } = labelsResult;
    if (!labels.length) {
      const details = invalidRows.slice(0, 6).map((item, idx) => `${idx + 1}) ${nText(item?.row?.name) || 'بدون اسم'} | ${nText(item?.row?.code) || '-'}`);
      const helpText = details.length ? `\n\nأمثلة:\n${details.join('\n')}` : '';
      await safeAlert(`لا توجد أكواد صالحة للتصدير بصيغة ${safeSettings.format}.${helpText}`, null, { type: 'error', title: 'تصدير PDF' });
      return;
    }

    setBarcodePrinting(true);
    try {
      const html = barcodeStudioHtml(labels, safeSettings);
      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const result = await window.api.exportPDF({
        html,
        title: `ملصقات باركود المنتجات (${labels.length})`,
        suggestedName: `barcode-labels-${stamp}.pdf`
      });

      if (result?.error) throw new Error(result.error);
      if (result?.canceled) {
        notify('تم إلغاء تصدير PDF', 'warning');
        return;
      }

      notify(
        `تم حفظ ملف PDF${invalidRows.length ? `، وتم تجاهل ${invalidRows.length} كود غير صالح` : ''}`,
        invalidRows.length ? 'warning' : 'success'
      );
    } catch (err) {
      await safeAlert(err.message || 'فشل تصدير ملف PDF', null, { type: 'error', title: 'تصدير PDF' });
    } finally {
      setBarcodePrinting(false);
    }
  };

  const printBarcodes = useCallback(async (targetProducts) => {
    await openBarcodeStudio(targetProducts);
  }, [openBarcodeStudio]);

  const printSelected = async () => {
    const selected = displayedProducts.filter((p) => selectedIds.has(p.id));
    await printBarcodes(selected);
  };

  const exportCsv = () => {
    if (!displayedProducts.length) {
      notify('لا توجد بيانات للتصدير', 'warning');
      return;
    }

    const headers = [
      'اسم المنتج', 'الفئة', 'الماركة', 'SKU', 'باركود المنتج', 'الوصف',
      'المقاس', 'اللون', 'سعر البيع', 'التكلفة', 'الكمية', 'باركود المتغير',
      'الحد الأدنى'
    ];

    const rows = [];
    displayedProducts.forEach((p) => {
      const cat = categories.find((c) => c.id === p.categoryId)?.name || '';
      const variants = p.variants || [];
      if (!variants.length) {
        rows.push([
          p.name || '', cat, p.brand || '', p.sku || '', p.barcode || '', p.description || '',
          '', '', salePriceOf(p).toFixed(2), costPriceOf(p).toFixed(2), nInt(p.inventory?.totalQuantity, 0), '',
          nInt(p.inventory?.minStock, 5)
        ]);
      } else {
        variants.forEach((v, i) => {
          rows.push([
            p.name || '', cat, p.brand || '', p.sku || '', p.barcode || '', i === 0 ? p.description || '' : '',
            v.productSize || '', v.color || '', Number(v.price || p.basePrice || 0).toFixed(2), Number(v.cost || p.cost || 0).toFixed(2),
            nInt(v.quantity, 0), v.barcode || '',
            i === 0 ? nInt(p.inventory?.minStock, 5) : ''
          ]);
        });
      }
    });

    const text = [headers, ...rows].map((r) => r.map(csv).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    link.href = url;
    link.download = `products-export-${stamp}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    notify('تم تصدير CSV متوافق مع Excel', 'success');
  };

  const ensureCategory = useCallback(async (name, map) => {
    const key = nText(name).toLowerCase();
    if (!key) return null;
    if (map.has(key)) return map.get(key).id;

    const add = await window.api.addCategory({ name: nText(name), description: null, color: '#008ae6', icon: '❒' });
    if (add?.error) throw new Error(add.error);
    map.set(key, add);
    return add.id;
  }, []);

  const closeImportSession = useCallback(() => {
    if (importing) return;
    setImportSession(null);
  }, [importing]);

  const updateImportFieldMapping = useCallback((fieldKey, columnId) => {
    setImportSession((prev) => {
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

  const applyAutoImportMapping = useCallback(() => {
    setImportSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        mapping: buildImportFieldAutoMapping(prev.headers)
      };
    });
  }, []);

  const importGroupsIntoDatabase = useCallback(async (groups) => {
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
    all.forEach((p) => {
      const key = nText(p.sku).toLowerCase();
      if (key) bySku.set(key, p);
    });

    const catMap = new Map();
    categories.forEach((c) => catMap.set(nText(c.name).toLowerCase(), c));

    let created = 0;
    let updated = 0;
    let addV = 0;
    let updV = 0;
    let failed = 0;

    for (const g of groups) {
      try {
        const categoryId = await ensureCategory(g.product.category, catMap);
        const payload = {
          name: g.product.name,
          description: g.product.description || null,
          categoryId,
          brand: g.product.brand || null,
          sku: g.product.sku || null,
          barcode: g.product.barcode || null,
          image: g.product.image || null,
          basePrice: nNum(g.product.basePrice, 0),
          cost: nNum(g.product.cost, 0),
          hasVariants: Array.isArray(g.variants) && g.variants.length > 0
        };

        const skuKey = nText(payload.sku).toLowerCase();
        const current = skuKey ? bySku.get(skuKey) : null;
        let productId = current?.id || 0;
        const known = current?.variants || [];

        if (current) {
          const up = await window.api.updateProduct(current.id, payload);
          if (up?.error) throw new Error(up.error);
          updated += 1;
        } else {
          const add = await window.api.addProduct(payload);
          if (add?.error) throw new Error(add.error);
          productId = add.id;
          created += 1;
          if (skuKey) bySku.set(skuKey, { ...add, variants: [] });
        }

        for (const v of g.variants) {
          const b = nText(v.barcode).toLowerCase();
          const found = known.find((item) => {
            if (b && nText(item.barcode).toLowerCase() === b) return true;
            return nText(item.productSize).toLowerCase() === nText(v.size).toLowerCase()
              && nText(item.color).toLowerCase() === nText(v.color).toLowerCase();
          });

          const data = {
            productId,
            size: v.size,
            color: v.color,
            price: nNum(v.price, payload.basePrice),
            cost: nNum(v.cost, payload.cost),
            quantity: nInt(v.quantity, 0),
            barcode: nText(v.barcode) || null
          };

          if (found) {
            const up = await window.api.updateVariant(found.id, data);
            if (up?.error) throw new Error(up.error);
            updV += 1;
          } else {
            const add = await window.api.addVariant(data);
            if (add?.error) throw new Error(add.error);
            addV += 1;
          }
        }

        const vTotal = g.variants.reduce((s, v) => s + nInt(v.quantity, 0), 0);
        const importedTotal = Math.max(
          0,
          nInt(g.inventory.totalQuantity, nInt(g.inventory.warehouseQty, 0) + nInt(g.inventory.displayQty, 0))
        );
        const totalQuantity = Math.max(vTotal, importedTotal);
        const inv = await window.api.updateInventory(productId, {
          minStock: nInt(g.inventory.minStock, 5),
          maxStock: nInt(g.inventory.maxStock, 100),
          warehouseQty: totalQuantity,
          displayQty: 0,
          totalQuantity,
          notes: g.inventory.notes || null,
          lastRestock: new Date().toISOString()
        });
        if (inv?.error) throw new Error(inv.error);
      } catch (err) {
        failed += 1;
        console.error('import failed', err);
      }
    }

    await Promise.all([loadCategories(), refreshVisibleProducts()]);
    notify(`تم الاستيراد: ${created} جديد، ${updated} تحديث، ${addV} متغير مضاف، ${updV} متغير محدث${failed ? `، ${failed} فشل` : ''}`, failed ? 'warning' : 'success');
  }, [categories, ensureCategory, loadCategories, notify, refreshVisibleProducts]);

  const startMappedImport = async () => {
    if (!importSession || importing) return;

    if (!nText(importSession.mapping?.name)) {
      await safeAlert('اختَر عمود "اسم المنتج" قبل بدء الاستيراد', null, { type: 'warning', title: 'مطابقة الأعمدة' });
      return;
    }

    setImporting(true);
    try {
      const mappedRows = mapRowsWithImportMapping(importSession.rows, importSession.mapping)
        .filter((row) => (
          Object.values(row).some((value) => nText(value) !== '')
          && !isIgnorableProductImportRow(row)
        ));

      const groups = importGroups(mappedRows);
      if (!groups.length) throw new Error('لم يتم العثور على صفوف صالحة بعد تطبيق المطابقة');

      await importGroupsIntoDatabase(groups);
      setImportSession(null);
    } catch (err) {
      await safeAlert(err.message || 'فشل الاستيراد', null, { type: 'error', title: 'استيراد Excel' });
    } finally {
      setImporting(false);
    }
  };

  const importFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const fileName = nText(file.name).toLowerCase();
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
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
        const sheetRows = Array.isArray(matrix) ? matrix : [];
        const hasAnyValue = (row) => (
          Array.isArray(row) && row.some((cell) => nText(cell) !== '')
        );
        const firstNonEmptyIndex = sheetRows.findIndex(hasAnyValue);
        if (firstNonEmptyIndex === -1) throw new Error('ورقة Excel فارغة');

        const headerRow = sheetRows[firstNonEmptyIndex] || [];
        const rows = sheetRows
          .slice(firstNonEmptyIndex + 1)
          .map((row) => (Array.isArray(row) ? row : []))
          .filter(hasAnyValue);
        const headers = toImportHeaders(headerRow);

        if (!headers.length) throw new Error('تعذر قراءة أعمدة ملف Excel');
        if (!rows.length) throw new Error('ورقة Excel لا تحتوي على بيانات');

        setImportSession({
          fileName: file.name,
          headers,
          rows,
          sheetName: firstSheetName,
          dataStartRowIndex: firstNonEmptyIndex + 2,
          mapping: buildImportFieldAutoMapping(headers)
        });
        return;
      }

      const content = await file.text();
      const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (lines.length < 2) throw new Error('الملف لا يحتوي على بيانات كافية');

      const d = delimiter(lines[0]);
      const headers = toImportHeaders(parseLine(lines[0], d));
      const rows = lines
        .slice(1)
        .map((line) => parseLine(line, d))
        .filter((row) => row.some((cell) => nText(cell) !== ''));

      if (!headers.length) throw new Error('تعذر قراءة الأعمدة من الملف');
      if (!rows.length) throw new Error('الملف لا يحتوي على صفوف بيانات');

      setImportSession({
        fileName: file.name,
        headers,
        rows,
        mapping: buildImportFieldAutoMapping(headers)
      });
    } catch (err) {
      await safeAlert(err.message || 'فشل قراءة الملف', null, { type: 'error', title: 'استيراد Excel' });
    }
  };

  const saveCategory = async (categoryData) => {
    const name = nText(categoryData.name);
    if (!name) {
      await safeAlert('اسم الفئة مطلوب', null, { type: 'warning', title: 'بيانات ناقصة' });
      return;
    }

    const payload = {
      name,
      description: nText(categoryData.description) || null,
      color: nText(categoryData.color) || '#008ae6',
      icon: ''
    };

    const res = categoryData.id
      ? await window.api.updateCategory(categoryData.id, payload)
      : await window.api.addCategory(payload);

    if (res?.error) {
      await safeAlert(res.error, null, { type: 'error', title: 'الفئات' });
      return;
    }

    await loadCategories();
    notify(categoryData.id ? 'تم تعديل الفئة بنجاح' : 'تم إضافة الفئة بنجاح', 'success');
  };

  const deleteCategory = async (id, name) => {
    const ok = await safeConfirm(`سيتم حذف الفئة "${name}". هل تريد المتابعة؟`, { title: 'حذف فئة' });
    if (!ok) return;

    const res = await window.api.deleteCategory(id);
    if (res?.error) {
      await safeAlert(res.error, null, { type: 'error', title: 'الفئات' });
      return;
    }

    await Promise.all([loadCategories(), refreshVisibleProducts()]);
    notify('تم حذف الفئة', 'success');
  };


  const itemData = useMemo(() => ({
    visibleProducts: displayedProducts,
    activeColumns,
    selectedIds,
    categoryMap,
    warehouseMap,
    productMetaMap,
    toggleId,
    openEdit,
    printBarcodes,
    deleteProduct,
    showVariantsSummary,
    gridTemplateColumns,
    openTransfer
  }), [
    displayedProducts,
    activeColumns,
    selectedIds,
    categoryMap,
    warehouseMap,
    productMetaMap,
    toggleId,
    openEdit,
    printBarcodes,
    deleteProduct,
    showVariantsSummary,
    gridTemplateColumns,
    openTransfer
  ]);

  return (
    <div className="products-page">
      <header className="products-header">
        <h1>
          <div className="products-header-icon">❒</div>
          إدارة المنتجات والأصناف
        </h1>

        <div className="products-header-actions">
          <button type="button" className="products-btn products-btn-secondary" onClick={() => setShowCategoryModal(true)}>
            ☰ إدارة الفئات
          </button>
          <button type="button" className="products-btn products-btn-secondary" onClick={exportCsv}>
            ⤓ تصدير Excel
          </button>
          <button type="button" className="products-btn products-btn-secondary" onClick={() => importRef.current?.click()} disabled={importing}>
            ⤒ {importing ? 'جاري الاستيراد...' : 'استيراد Excel'}
          </button>
          <button type="button" className="products-btn products-btn-secondary" onClick={printSelected}>
            ⫼⫼⫼ استوديو الباركود
          </button>
          <button type="button" className="products-btn products-btn-secondary" onClick={() => { void loadBulkProductModal(); setShowBulkProductModal(true); }}>
            ▤ إضافة عدة أصناف
          </button>
          <button type="button" className="products-btn products-btn-primary" onClick={openCreate}>
            + منتج جديد
          </button>
        </div>
      </header>

      <input ref={importRef} type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" style={{ display: 'none' }} onChange={importFile} />

      {/* Metrics section removed as requested */}

      <ProductsFilters
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={handleCategoryFilterChange}
        warehouseFilter={warehouseFilter}
        onWarehouseFilterChange={handleWarehouseFilterChange}
        categories={categories}
        warehouses={warehouses}
        stockFilter={stockFilter}
        onStockFilterChange={handleStockFilterChange}
        sortPreset={sortPreset}
        onSortPresetChange={handleSortPresetChange}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        searchLoading={searchLoading}
      />

      {/* <div className="products-search-meta">
        {isSearchTyping || isSearchBusy ? <span className="pill searching">جاري البحث...</span> : null}
        <span className="pill count">نتائج البحث: {filteredTotal}</span>
        {isSearchLimited ? <span className="pill limited">تم عرض أول {PRODUCT_SEARCH_LIMIT} نتيجة لتسريع العرض</span> : null}
      </div> */}

      <section className="products-table-card">
        <ProductsTableTools
          allVisibleSelected={allVisibleSelected}
          onToggleVisible={toggleVisible}
          displayedCount={displayedProducts.length}
          selectedCount={selectedIds.size}
          visibleColumnKeys={visibleColumnKeys}
          onToggleColumnVisibility={toggleColumnVisibility}
          showSearchRow={showSearchRow}
          onToggleSearchRow={() => setShowSearchRow((prev) => !prev)}
          onOpenPriceUpdate={() => setShowPriceUpdateModal(true)}
        />




        <div className="products-grid-viewport" ref={gridViewportRef}>
          <div className="products-grid-scroll">
            <div
              ref={gridHeaderRef}
              className="products-grid-header"
              style={{ display: 'grid', gridTemplateColumns }}
            >
              {activeColumns.map((column) => {
                const SORT_MAPPING = {
                  name: 'name',
                  salePrice: 'basePrice',
                  costPrice: 'cost',
                  updatedAt: 'updatedAt',
                  code: 'sku'
                };
                const mappedKey = SORT_MAPPING[column.key];
                const isSortable = !!mappedKey;
                return (
                  <div 
                    key={column.key} 
                    className={`products-grid-head-cell head-${column.key}`}
                    onClick={isSortable ? () => handleColumnSort(column.key) : undefined}
                    style={isSortable ? { cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', transition: 'background 0.2s' } : undefined}
                  >
                    {column.label}
                    {isSortable && sortCol === mappedKey && (
                      <span style={{ fontSize: '10px', color: 'var(--primary-color, #0f766e)', marginTop: '2px' }}>
                        {sortDir === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {showSearchRow && (
              <div
                className="products-grid-search-row"
                style={{ display: 'grid', gridTemplateColumns }}
              >
                {activeColumns.map((column) => (
                  <div key={`search-${column.key}`} className="products-grid-search-cell">
                    {column.key !== 'select' && column.key !== 'actions' ? (
                      <input
                        type="text"
                        placeholder={`بحث في ${column.label}...`}
                        className="column-search-input"
                        value={columnSearches[column.key] || ''}
                        onChange={(e) => handleColumnSearchChange(column.key, e.target.value)}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {loading && displayedProducts.length === 0 ? (
              <div className="products-loading">
                <span className="spin">⟳</span>
                <span>جاري تحميل المنتجات...</span>
              </div>
            ) : displayedProducts.length === 0 && !tableLoading ? (
              <div className="products-empty grid-empty">لا توجد منتجات مطابقة</div>
            ) : (
              <div style={{ position: 'relative' }}>
                {tableLoading && displayedProducts.length > 0 ? (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(255,255,255,0.5)', zIndex: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'none'
                  }}>
                    <span className="spin" style={{ fontSize: '1.5rem' }}>🔄</span>
                  </div>
                ) : null}
                <List
                  ref={productsListRef}
                  className="products-grid-list"
                  width="100%"
                  height={gridHeight}
                  itemCount={displayedProducts.length}
                  itemSize={52}
                  itemData={itemData}
                  overscanCount={2}
                  direction="rtl"
                  itemKey={(index) => displayedProducts[index]?.id || index}
                >
                  {ProductGridRow}
                </List>
              </div>
            )}
          </div>
        </div>

        <div className="products-pagination">
          <button
            type="button"
            className="products-btn products-btn-secondary"
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage <= 1 || tableLoading}
          >
            السابق
          </button>

          <span style={{ fontWeight: 600, color: '#475569' }}>
            {pageStart.toLocaleString('ar-EG')} - {pageEnd.toLocaleString('ar-EG')} من {totalItems.toLocaleString('ar-EG')}
          </span>

          <button
            type="button"
            className="products-btn products-btn-secondary"
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={currentPage >= totalPages || tableLoading}
          >
            التالي
          </button>
        </div>
      </section >

      {
        showProductModal ? (
          <Suspense fallback={null} >
            <ProductModal
              isOpen={showProductModal}
              onClose={closeProductModal}
              onSave={handleSaveProduct}
              mode={modalMode}
              isLoadingProduct={editingProductLoading}
              initialData={editingProduct}
              categories={categories}
              isSaving={saving}
            />
          </Suspense>
        ) : null
      }

      {
        showBulkProductModal ? (
          <Suspense fallback={null}>
            <BulkProductModal
              isOpen={showBulkProductModal}
              onClose={() => setShowBulkProductModal(false)}
              onComplete={async (result) => {
                await Promise.all([refreshVisibleProducts(), loadCategories()]);
                notify(`تم حفظ ${result.saved} صنف بنجاح${result.errors > 0 ? ` (${result.errors} أخطاء)` : ''}`, result.errors > 0 ? 'warning' : 'success');
              }}
              categories={categories}
              warehouses={warehouses}
            />
          </Suspense>
        ) : null
      }

      {showBarcodeStudio ? (
        <Suspense fallback={null}>
          <BarcodeStudioModal
            barcodeStudioProducts={barcodeStudioProducts}
            setBarcodeStudioProducts={setBarcodeStudioProducts}
            allAvailableProducts={displayedProducts}
            barcodeStudioRows={barcodeStudioRows}
            barcodeStudioSafeSettings={barcodeStudioSafeSettings}
            barcodeStudioTab={barcodeStudioTab}
            setBarcodeStudioTab={setBarcodeStudioTab}
            barcodePrinting={barcodePrinting}
            barcodePreview={barcodePreview}
            barcodePreviewIsMatrix={barcodePreviewIsMatrix}
            matrixBarcodeEngineLoading={matrixBarcodeEngineLoading}
            matrixBarcodeEngineError={matrixBarcodeEngineError}
            barcodeTemplates={barcodeTemplates}
            activeBarcodeTemplateId={activeBarcodeTemplateId}
            activeBarcodeTemplate={activeBarcodeTemplate}
            barcodeTemplateName={barcodeTemplateName}
            setBarcodeTemplateName={setBarcodeTemplateName}
            barcodeTemplatePrinter={barcodeTemplatePrinter}
            setBarcodeTemplatePrinter={setBarcodeTemplatePrinter}
            barcodePrintPreferences={barcodePrintPreferences}
            setBarcodeSetting={setBarcodeSetting}
            setBarcodeNumberSetting={setBarcodeNumberSetting}
            applyBarcodePreset={applyBarcodePreset}
            applyBarcodeTemplate={applyBarcodeTemplate}
            saveNewBarcodeTemplate={saveNewBarcodeTemplate}
            updateBarcodeTemplate={updateBarcodeTemplate}
            deleteBarcodeTemplate={deleteBarcodeTemplate}
            resetBarcodeStudioSettings={resetBarcodeStudioSettings}
            applyBarcodeSystemDefaults={applyBarcodeSystemDefaults}
            closeBarcodeStudio={closeBarcodeStudio}
            executeBarcodeStudioPrint={executeBarcodeStudioPrint}
            executeBarcodeStudioPdfExport={executeBarcodeStudioPdfExport}
            printers={printers}
            loadingPrinters={loadingPrinters}
            refreshPrinters={loadPrinters}
            saveBarcodeSystemSettings={saveBarcodeSystemSettings}
          />
        </Suspense>
      ) : null}

      <ImportModal
        session={importSession}
        importing={importing}
        onClose={closeImportSession}
        onUpdateFieldMapping={updateImportFieldMapping}
        onApplyAutoMapping={applyAutoImportMapping}
        onStartImport={startMappedImport}
      />

      <CategoryModal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        categories={categories}
        onSave={saveCategory}
        onDelete={deleteCategory}
      />



      <WarehouseTransferModal
        isOpen={showTransferModal}
        onClose={() => {
          setShowTransferModal(false);
          setTransferProduct(null);
        }}
        product={transferProduct}
        warehouses={warehouses}
        onTransferComplete={async () => {
          await refreshVisibleProducts();
        }}
      />

      <PriceUpdateModal
        isOpen={showPriceUpdateModal}
        onClose={() => setShowPriceUpdateModal(false)}
        categories={categories}
        warehouses={warehouses}
        notify={notify}
        onSuccess={async () => {
          await refreshVisibleProducts();
        }}
      />

      {toast ? <div className={`products-toast ${toast.type || 'success'}`}>{toast.message}</div> : null}
    </div>
  );
}

