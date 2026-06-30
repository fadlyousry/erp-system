import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Barcode, Camera, Plus, Save, Shuffle, Trash2, X, Settings } from 'lucide-react';
import './ProductModal.css';
import UnitManagerModal from './UnitManagerModal';

const TABS = {
  BASIC: 'basic',
  PRICING: 'pricing',
  STOCK: 'stock'
};

const DEFAULT_UNIT_ROW = {
  unitName: '',
  salePrice: 0,
  wholesalePrice: 0,
  minSalePrice: 0,
  purchasePrice: 0,
  barcode: ''
};

const makeTempVariantId = () => `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DEFAULT_VARIANT_ROW = () => ({
  tempId: makeTempVariantId(),
  id: null,
  size: '',
  color: '',
  price: 0,
  cost: 0,
  quantity: 0,
  barcode: ''
});

const NUMERIC_UNIT_FIELDS = new Set([
  'salePrice',
  'wholesalePrice',
  'minSalePrice',
  'purchasePrice'
]);

const nText = (value) => String(value ?? '').trim();
const toNum = (value, fallback = 0) => {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const toInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? '').replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const money = (value) => Number(Math.max(0, toNum(value, 0)).toFixed(2));
const marginPercentOf = (purchasePrice, salePrice) => {
  const purchase = toNum(purchasePrice, 0);
  const sale = toNum(salePrice, 0);
  if (purchase <= 0) return 0;
  return Number((((sale - purchase) / purchase) * 100).toFixed(2));
};

const makeSku = (name = '') => {
  const prefix = nText(name)
    .replace(/[^\w\u0600-\u06FF\s-]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part.slice(0, 3).toUpperCase())
    .join('-');
  const stamp = Date.now().toString().slice(-6);
  return `${prefix || 'PRD'}-${stamp}`;
};

const calcEan13CheckDigit = (code12) => {
  const digits = String(code12).replace(/\D/g, '').padStart(12, '0').slice(0, 12).split('').map((x) => Number(x));
  const sum = digits.reduce((acc, digit, index) => acc + (index % 2 === 0 ? digit : digit * 3), 0);
  return (10 - (sum % 10)) % 10;
};

const makeEan13 = () => {
  const partA = Date.now().toString().slice(-5);
  const partB = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  const code12 = `20${partA}${partB}`;
  return `${code12}${calcEan13CheckDigit(code12)}`;
};

const DEFAULT_UNITS = ['قطعة', 'كرتونة', 'علبة', 'كيلو', 'لتر', 'متر', 'جرام', 'رزمة'];
const loadCustomUnits = () => {
  try {
    const stored = localStorage.getItem('erp_custom_units');
    return stored ? JSON.parse(stored) : DEFAULT_UNITS;
  } catch {
    return DEFAULT_UNITS;
  }
};

const normalizeUnit = (unit, index) => {
  const unitName = nText(unit?.unitName) || 'قطعة';
  const salePrice = money(unit?.salePrice);
  const purchasePrice = money(unit?.purchasePrice);
  const wholesalePrice = money(Math.max(0, toNum(unit?.wholesalePrice, salePrice)));
  const minSalePrice = money(Math.max(0, toNum(unit?.minSalePrice, wholesalePrice)));

  return {
    unitName,
    salePrice,
    wholesalePrice,
    minSalePrice,
    purchasePrice,
    barcode: nText(unit?.barcode)
  };
};

const buildInitialState = (initialData) => {
  if (!initialData) {
    return {
      name: '',
      categoryId: '',
      brand: '',
      description: '',
      sku: makeSku(),
      barcode: makeEan13(),
      image: '',
      type: 'store',
      isActive: true,
      minStock: 5,
      maxStock: 100,
      notes: '',
      unit: { ...DEFAULT_UNIT_ROW, unitName: 'قطعة' },
      hasVariants: false,
      variants: [],
      variantSizeDraft: 'S, M, L, XL',
      variantColorDraft: 'أسود, أبيض',
      primaryWarehouseId: '' // New field
    };
  }
  const primaryUnit = {
    ...DEFAULT_UNIT_ROW,
    unitName: nText(initialData.unitName) || 'قطعة',
    salePrice: money(initialData.basePrice),
    wholesalePrice: money(initialData.wholesalePrice ?? initialData.basePrice),
    minSalePrice: money(initialData.minSalePrice ?? initialData.wholesalePrice ?? initialData.basePrice),
    purchasePrice: money(initialData.cost),
    barcode: nText(initialData.barcode)
  };
  const unit = normalizeUnit(primaryUnit, 0);
  const sourceVariants = Array.isArray(initialData.variants) ? initialData.variants : [];
  const validVariants = sourceVariants.filter(
    (v) => nText(v.productSize) || nText(v.color)
  );

  const variants = validVariants.map((variant) => ({
    tempId: makeTempVariantId(),
    id: variant.id || null,
    size: nText(variant.productSize),
    color: nText(variant.color),
    price: money(variant.price),
    cost: money(variant.cost),
    quantity: Math.max(0, toInt(variant.quantity, 0)),
    barcode: nText(variant.barcode)
  }));
  return {
    name: nText(initialData.name),
    categoryId: initialData.categoryId ? String(initialData.categoryId) : '',
    brand: nText(initialData.brand),
    description: nText(initialData.description),
    sku: nText(initialData.sku),
    barcode: nText(initialData.barcode),
    image: nText(initialData.image),
    type: nText(initialData.type) || 'store',
    isActive: initialData.isActive ?? true,
    minStock: Math.max(0, toInt(initialData?.inventory?.minStock, 5)),
    maxStock: Math.max(0, toInt(initialData?.inventory?.maxStock, 100)),
    notes: nText(initialData?.inventory?.notes),
    unit,
    hasVariants: variants.length > 0,
    variants,
    variantSizeDraft: 'S, M, L, XL',
    variantColorDraft: 'أسود, أبيض',
    primaryWarehouseId: initialData?.warehouseStocks?.[0]?.warehouseId?.toString() || ''
  };
};

export default function ProductModal({
  isOpen,
  onClose,
  onSave,
  mode = 'create',
  isLoadingProduct = false,
  initialData = null,
  categories = [],
  isSaving = false
}) {
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseStocks, setWarehouseStocks] = useState([]);
  const [variantWarehouseMatrix, setVariantWarehouseMatrix] = useState({});
  const [activeTab, setActiveTab] = useState(TABS.BASIC);
  const [showAllWarehouses, setShowAllWarehouses] = useState(false);
  const [formData, setFormData] = useState(() => buildInitialState(initialData));
  const [validationMessage, setValidationMessage] = useState('');
  const fileInputRef = useRef(null);
  const [unitOptions, setUnitOptions] = useState(loadCustomUnits);
  const [isUnitManagerOpen, setIsUnitManagerOpen] = useState(false);

  const isEditMode = mode === 'edit';
  const isBusy = isSaving || (isEditMode && isLoadingProduct);

  useEffect(() => {
    if (!isOpen) return;
    if (isEditMode) {
      if (isLoadingProduct || !initialData) return;
    }

    const nextState = buildInitialState(initialData);
    setFormData(nextState);
    setValidationMessage('');
    setActiveTab(TABS.BASIC);

    // Load warehouses and stocks
    (async () => {
      const whRes = await window.api.getWarehouses();
      if (!whRes?.error) {
        const activeWhs = Array.isArray(whRes) ? whRes.filter(w => w.isActive) : [];
        setWarehouses(activeWhs);
        
        // Auto-select first warehouse as primary if none selected
        if (activeWhs.length > 0) {
          setFormData(prev => ({
            ...prev,
            primaryWarehouseId: prev.primaryWarehouseId || activeWhs[0].id.toString()
          }));
        }
      }

      if (initialData?.id) {
        const stocksRes = await window.api.getWarehouseStocks(initialData.id);
        if (!stocksRes?.error) {
          if (stocksRes && typeof stocksRes === 'object' && !Array.isArray(stocksRes)) {
            setWarehouseStocks(Array.isArray(stocksRes.totals) ? stocksRes.totals : []);
            const nextMatrix = {};
            (Array.isArray(stocksRes.variants) ? stocksRes.variants : []).forEach((variant) => {
              const matrixKey = variant?.id ? `id:${variant.id}` : null;
              if (!matrixKey) return;
              nextMatrix[matrixKey] = {};
              (Array.isArray(variant.warehouseStocks) ? variant.warehouseStocks : []).forEach((stock) => {
                const warehouseId = toInt(stock?.warehouseId, 0);
                const quantity = Math.max(0, toInt(stock?.quantity, 0));
                if (warehouseId > 0 && quantity > 0) {
                  nextMatrix[matrixKey][warehouseId] = quantity;
                }
              });
            });
            setVariantWarehouseMatrix(nextMatrix);
          } else {
            setWarehouseStocks(Array.isArray(stocksRes) ? stocksRes : []);
            setVariantWarehouseMatrix({});
          }
        }
      } else {
        setWarehouseStocks([]);
        setVariantWarehouseMatrix({});
      }
    })();
  }, [isOpen, initialData, isEditMode, isLoadingProduct]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onEscape = (event) => {
      if (event.key === 'Escape' && !isSaving) onClose();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [isOpen, isSaving, onClose]);

  const mainUnit = useMemo(() => normalizeUnit(formData.unit || DEFAULT_UNIT_ROW, 0), [formData.unit]);
  const stockTotalPreview = useMemo(
    () => (
      formData.hasVariants
        ? Math.max(0, (Array.isArray(formData.variants) ? formData.variants : []).reduce((sum, variant) => sum + toInt(variant?.quantity, 0), 0))
        : Math.max(0, warehouseStocks.reduce((sum, stock) => sum + toInt(stock?.quantity, 0), 0))
    ),
    [formData.hasVariants, formData.variants, warehouseStocks]
  );

  const visibleWarehouses = useMemo(() => {
    if (showAllWarehouses || warehouses.length <= 1) return warehouses;
    const priId = parseInt(formData.primaryWarehouseId);
    if (isNaN(priId)) return warehouses.slice(0, 1);
    return warehouses.filter(wh => wh.id === priId);
  }, [warehouses, formData.primaryWarehouseId, showAllWarehouses]);

  useEffect(() => {
    setVariantWarehouseMatrix((prev) => {
      const next = { ...prev };
      const keepKeys = new Set();
      let changed = false;

      (Array.isArray(formData.variants) ? formData.variants : []).forEach((variant) => {
        const key = variant?.id ? `id:${variant.id}` : `temp:${variant?.tempId}`;
        if (!key || key === 'temp:') return;
        keepKeys.add(key);
        if (!next[key]) {
          next[key] = {};
          changed = true;
        }
      });

      Object.keys(next).forEach((key) => {
        if (!keepKeys.has(key)) {
          delete next[key];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [formData.variants]);

  const variantMatrixKey = (variant) => (
    variant?.id ? `id:${variant.id}` : `temp:${variant?.tempId}`
  );

  const getVariantWarehouseQty = (variant, warehouseId) => {
    const key = variantMatrixKey(variant);
    return Math.max(0, toInt(variantWarehouseMatrix?.[key]?.[warehouseId], 0));
  };

  const getVariantWarehouseTotal = (variant) => (
    warehouses.reduce((sum, warehouse) => sum + getVariantWarehouseQty(variant, warehouse.id), 0)
  );

  const setVariantWarehouseQty = (variant, warehouseId, quantity) => {
    const key = variantMatrixKey(variant);
    if (!key || key === 'temp:') return;

    setVariantWarehouseMatrix((prev) => {
      const currentRow = { ...(prev[key] || {}) };
      const nextQty = Math.max(0, toInt(quantity, 0));
      currentRow[warehouseId] = nextQty;

      const next = { ...prev };
      next[key] = currentRow;
      return next;
    });
  };

  const setField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const setUnitField = (field, value) => {
    setFormData((prev) => {
      const current = normalizeUnit(prev.unit || DEFAULT_UNIT_ROW, 0);
      if (field === 'purchasePrice') {
        const newPurchase = money(value);
        const currentMargin = marginPercentOf(current.purchasePrice, current.salePrice);
        const recalculatedSale = money(newPurchase * (1 + (currentMargin / 100)));
        current.purchasePrice = newPurchase;
        current.salePrice = recalculatedSale;
      } else if (field === 'salePrice') {
        const newSale = money(value);
        current.salePrice = newSale;
      } else if (field === 'wholesalePrice') {
        current.wholesalePrice = money(value);
      } else if (field === 'minSalePrice') {
        current.minSalePrice = money(value);
      } else {
        current[field] = NUMERIC_UNIT_FIELDS.has(field) ? toNum(value, 0) : value;
      }
      return { ...prev, unit: current };
    });
  };

  const setUnitMarginPercent = (value) => {
    setFormData((prev) => {
      const current = normalizeUnit(prev.unit || DEFAULT_UNIT_ROW, 0);
      const marginPercent = Math.max(-100, toNum(value, 0));
      const salePrice = money(current.purchasePrice * (1 + (marginPercent / 100)));
      current.salePrice = salePrice;
      current.wholesalePrice = salePrice;
      current.minSalePrice = Math.min(current.minSalePrice, salePrice);
      return { ...prev, unit: current };
    });
  };

  const setVariantField = (index, field, value) => {
    setFormData((prev) => {
      const nextVariants = [...prev.variants];
      const current = { ...(nextVariants[index] || DEFAULT_VARIANT_ROW()) };
      if (field === 'price' || field === 'cost') current[field] = money(value);
      else if (field === 'quantity') current.quantity = Math.max(0, toInt(value, 0));
      else current[field] = value;
      nextVariants[index] = current;
      return { ...prev, variants: nextVariants };
    });
  };

  const addVariantRow = (seed = {}) => {
    setFormData((prev) => ({
      ...prev,
      hasVariants: true,
      variants: [
        ...prev.variants,
        {
          ...DEFAULT_VARIANT_ROW(),
          price: money(seed.price ?? mainUnit.salePrice),
          cost: money(seed.cost ?? mainUnit.purchasePrice),
          ...seed
        }
      ]
    }));
  };

  const removeVariantRow = (index) => {
    setFormData((prev) => ({
      ...prev,
      variants: prev.variants.filter((_, rowIndex) => rowIndex !== index)
    }));
  };

  const toggleVariants = (enabled) => {
    setFormData((prev) => {
      if (!enabled) {
        return { ...prev, hasVariants: false, variants: [] };
      }
      if (prev.variants.length > 0) return { ...prev, hasVariants: true };
      return {
        ...prev,
        hasVariants: true,
        variants: [{
          ...DEFAULT_VARIANT_ROW(),
          size: 'M',
          color: 'أسود',
          price: money(mainUnit.salePrice),
          cost: money(mainUnit.purchasePrice)
        }]
      };
    });
  };

  const generateVariantCombinations = () => {
    const sizes = nText(formData.variantSizeDraft)
      .split(',')
      .map((item) => nText(item))
      .filter(Boolean);
    const colors = nText(formData.variantColorDraft)
      .split(',')
      .map((item) => nText(item))
      .filter(Boolean);

    if (!sizes.length || !colors.length) return;

    setFormData((prev) => {
      const existingKeys = new Set(
        prev.variants.map((variant) => `${nText(variant.size).toLowerCase()}|${nText(variant.color).toLowerCase()}`)
      );
      const additions = [];
      sizes.forEach((size) => {
        colors.forEach((color) => {
          const key = `${size.toLowerCase()}|${color.toLowerCase()}`;
          if (existingKeys.has(key)) return;
          existingKeys.add(key);
          additions.push({
            ...DEFAULT_VARIANT_ROW(),
            size,
            color,
            price: money(mainUnit.salePrice),
            cost: money(mainUnit.purchasePrice)
          });
        });
      });
      return {
        ...prev,
        hasVariants: true,
        variants: [...prev.variants, ...additions]
      };
    });
  };

  const collectTakenBarcodes = ({ excludeProduct = false, excludeVariantIndex = null } = {}) => {
    const taken = new Set();
    if (!excludeProduct) {
      const productBarcode = nText(formData.barcode);
      if (productBarcode) taken.add(productBarcode.toLowerCase());
    }
    formData.variants.forEach((variant, index) => {
      if (excludeVariantIndex !== null && index === excludeVariantIndex) return;
      const variantBarcode = nText(variant?.barcode);
      if (variantBarcode) taken.add(variantBarcode.toLowerCase());
    });
    return taken;
  };

  const buildUniqueBarcode = (takenSet) => {
    for (let i = 0; i < 60; i += 1) {
      const candidate = makeEan13();
      if (!takenSet.has(candidate.toLowerCase())) return candidate;
    }
    return `${Date.now()}${Math.floor(Math.random() * 10)}`.slice(0, 13);
  };

  const generateProductBarcode = () => {
    const taken = collectTakenBarcodes({ excludeProduct: true });
    setField('barcode', buildUniqueBarcode(taken));
  };

  const generateVariantBarcode = (index) => {
    const taken = collectTakenBarcodes({ excludeVariantIndex: index });
    setVariantField(index, 'barcode', buildUniqueBarcode(taken));
  };

  const pickImage = () => {
    if (isBusy) return;
    fileInputRef.current?.click();
  };

  const clearImage = () => {
    setField('image', '');
  };

  const onImageFileSelected = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setValidationMessage('اختر ملف صورة صالح (PNG/JPG/WebP).');
      setActiveTab(TABS.BASIC);
      return;
    }

    const sizeLimit = 2 * 1024 * 1024;
    if (file.size > sizeLimit) {
      setValidationMessage('حجم الصورة كبير. الحد الأقصى 2MB.');
      setActiveTab(TABS.BASIC);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = nText(reader.result);
      setField('image', result);
      setValidationMessage('');
    };
    reader.onerror = () => {
      setValidationMessage('تعذر قراءة ملف الصورة.');
      setActiveTab(TABS.BASIC);
    };
    reader.readAsDataURL(file);
  };

  const selectAllInputValue = useCallback((event) => {
    const input = event.target;
    if (!input || input.tagName !== 'INPUT') return;

    const inputType = String(input.type || '').toLowerCase();
    if (inputType === 'checkbox' || inputType === 'radio' || input.readOnly || input.disabled) return;

    if (typeof input.select === 'function') {
      input.select();
    }
  }, []);

  const handleSave = () => {
    if (isEditMode && isLoadingProduct) return;
    setValidationMessage('');
    const name = nText(formData.name);
    if (!name) {
      setValidationMessage('اسم الصنف مطلوب.');
      setActiveTab(TABS.BASIC);
      return;
    }

    const firstUnit = normalizeUnit(formData.unit || DEFAULT_UNIT_ROW, 0);

    const normalizedVariants = (formData.hasVariants ? formData.variants : [])
      .map((variant) => ({
        tempId: variant.tempId || makeTempVariantId(),
        id: variant.id ? toInt(variant.id, 0) : null,
        size: nText(variant.size) || 'موحد',
        color: nText(variant.color) || 'افتراضي',
        price: money(variant.price || firstUnit.salePrice),
        cost: money(variant.cost || firstUnit.purchasePrice),
        quantity: Math.max(0, toInt(variant.quantity, 0)),
        barcode: nText(variant.barcode) || null
      }))
      .filter((variant) => variant.size || variant.color || variant.price || variant.cost || variant.quantity || variant.barcode);

    if (formData.hasVariants && normalizedVariants.length === 0) {
      setValidationMessage('أضف متغيرًا واحدًا على الأقل أو ألغِ خيار الألوان/المقاسات.');
      setActiveTab(TABS.PRICING);
      return;
    }

    const variantBarcodes = normalizedVariants.map((variant) => nText(variant.barcode).toLowerCase()).filter(Boolean);
    if (new Set(variantBarcodes).size !== variantBarcodes.length) {
      setValidationMessage('يوجد باركود مكرر بين المتغيرات.');
      setActiveTab(TABS.PRICING);
      return;
    }

    const productBarcode = nText(formData.barcode) || nText(firstUnit.barcode);
    const allBarcodes = [
      ...variantBarcodes,
      productBarcode.toLowerCase()
    ].filter(Boolean);
    if (new Set(allBarcodes).size !== allBarcodes.length) {
      setValidationMessage('يوجد تعارض باركود بين المنتج والمتغيرات.');
      setActiveTab(TABS.PRICING);
      return;
    }

    const categoryId = nText(formData.categoryId) || null;
    const minStock = Math.max(0, toInt(formData.minStock, 5));
    const maxStock = Math.max(minStock, toInt(formData.maxStock, 100));
    const variantWarehouseStocks = [];
    if (formData.hasVariants && warehouses.length > 0) {
      for (let index = 0; index < normalizedVariants.length; index += 1) {
        const normalizedVariant = normalizedVariants[index];
        const sourceVariant = formData.variants[index] || normalizedVariant;
        const rowTotal = getVariantWarehouseTotal(sourceVariant);
        normalizedVariant.quantity = rowTotal;

        for (const warehouse of warehouses) {
          const qty = getVariantWarehouseQty(sourceVariant, warehouse.id);
          const key = variantMatrixKey(sourceVariant);
          const isExplicitlySet = variantWarehouseMatrix[key] && Object.prototype.hasOwnProperty.call(variantWarehouseMatrix[key], warehouse.id);
          
          if (qty <= 0 && !isExplicitlySet && warehouse.id !== parseInt(formData.primaryWarehouseId)) continue;
          variantWarehouseStocks.push({
            variantId: normalizedVariant.id || null,
            tempId: normalizedVariant.tempId || sourceVariant.tempId || null,
            warehouseId: warehouse.id,
            quantity: qty
          });
        }
      }
    }

    // Prepare warehouse stocks
    let stocks = warehouses.map(wh => {
      const existing = warehouseStocks.find(s => s.warehouseId === wh.id);
      return {
        warehouseId: wh.id,
        quantity: existing ? toInt(existing.quantity, 0) : 0
      };
    });

    // Ensure the primary warehouse is always linked, even with 0 quantity
    if (formData.primaryWarehouseId) {
      const priId = parseInt(formData.primaryWarehouseId);
      const priStock = stocks.find(s => s.warehouseId === priId);
      if (!priStock) {
        stocks.push({ warehouseId: priId, quantity: 0 });
      }
    }

    // Filter out 0 quantities ONLY if it's NOT the primary warehouse and NOT in edit mode
    // Actually, let's keep all warehouses that were explicitly set to 0 if the user touched them.
    stocks = stocks.filter(s => 
      s.quantity > 0 || 
      s.warehouseId === parseInt(formData.primaryWarehouseId) || 
      mode === 'edit' ||
      warehouseStocks.some(ws => ws.warehouseId === s.warehouseId)
    );

    onSave({
      name,
      categoryId,
      brand: nText(formData.brand) || null,
      description: nText(formData.description) || null,
      sku: nText(formData.sku) || null,
      barcode: productBarcode || null,
      image: nText(formData.image) || null,
      type: nText(formData.type) || 'store',
      isActive: Boolean(formData.isActive),
      totalQuantity: stockTotalPreview,
      minStock,
      maxStock,
      notes: nText(formData.notes) || null,
      unitName: nText(firstUnit.unitName) || 'قطعة',
      hasVariants: Boolean(formData.hasVariants),
      variants: normalizedVariants,
      basePrice: money(firstUnit.salePrice),
      cost: money(firstUnit.purchasePrice),
      wholesalePrice: money(firstUnit.wholesalePrice),
      minSalePrice: money(firstUnit.minSalePrice),
      warehouseStocks: stocks,
      variantWarehouseStocks
    });
  };

  if (!isOpen) return null;

  return (
    <div className="product-modal-overlay" onClick={() => !isSaving && onClose()}>
      <div className="product-modal" onClick={(event) => event.stopPropagation()}>
        <div className="product-modal-header">
          <div>
            <h2>{isEditMode ? 'تعديل منتج' : 'إضافة منتج جديد'}</h2>
            <p>{isEditMode ? 'حدّث بيانات المنتج والتسعير والمخزون' : 'أدخل البيانات الأساسية والتسعير والمخزون'}</p>
          </div>
          <button type="button" className="close-button" onClick={onClose} disabled={isSaving}>
            <X size={20} />
          </button>
        </div>

        <div className="product-modal-tabs">
          <button type="button" className={`tab-button ${activeTab === TABS.BASIC ? 'active' : ''}`} onClick={() => setActiveTab(TABS.BASIC)} disabled={isBusy}>
            بيانات أساسية
          </button>
          <button type="button" className={`tab-button ${activeTab === TABS.PRICING ? 'active' : ''}`} onClick={() => setActiveTab(TABS.PRICING)} disabled={isBusy}>
            التسعير والمخزون
          </button>
        </div>

        <div className="product-modal-body">
          {isEditMode && isLoadingProduct ? (
            <div className="product-modal-loading">
                <span className="product-modal-loading-spinner">⟳</span>
              <span>جاري تحميل بيانات المنتج...</span>
            </div>
          ) : (
            <>
              {validationMessage ? (
                <div className="modal-inline-alert">
                  <AlertCircle size={16} />
                  <span>{validationMessage}</span>
                </div>
              ) : null}

              {activeTab === TABS.BASIC ? (
                <div className="form-section">
                  <div className="basic-layout">
                    <div className="image-panel">
                      <input ref={fileInputRef} type="file" accept="image/*" className="image-file-input" onChange={onImageFileSelected} />
                      <div className="image-upload-wrap">
                        <button type="button" className="image-upload-box" onClick={pickImage}>
                          {formData.image ? <img src={formData.image} alt={formData.name || 'Product'} /> : <Camera size={34} />}
                        </button>
                        {formData.image ? (
                          <button
                            type="button"
                            className="image-clear-fab"
                            onClick={(event) => {
                              event.stopPropagation();
                              clearImage();
                            }}
                            aria-label="حذف الصورة"
                            title="حذف الصورة"
                            disabled={isBusy}
                          >
                            <X size={14} />
                          </button>
                        ) : null}
                      </div>

                      <div className="image-status-row">
                        <label className="pm-toggle-switch">
                          <input type="checkbox" checked={formData.isActive} onChange={(event) => setField('isActive', event.target.checked)} />
                          <span className="pm-toggle-slider" />
                          <span>{formData.isActive ? 'المنتج نشط' : 'المنتج غير نشط'}</span>
                        </label>
                      </div>

                      <div className="image-type-row">
                        <label className="form-group">
                          <span>نوع المنتج</span>
                          <select className="form-select" value={formData.type} onChange={(event) => setField('type', event.target.value)}>
                            <option value="store">منتج مخزني</option>
                            <option value="service">خدمة</option>
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="main-form-grid">
                      <div className="form-row">
                        <label className="form-group">
                          <span>اسم الصنف</span>
                          <input
                            type="text"
                            className="form-input"
                            value={formData.name}
                            onChange={(event) => setField('name', event.target.value)}
                            placeholder="مثال: تيشيرت قطن"
                          />
                        </label>
                        <label className="form-group">
                          <span>الفئة</span>
                          <select className="form-select" value={formData.categoryId} onChange={(event) => setField('categoryId', event.target.value)}>
                            <option value="">بدون فئة</option>
                            {categories.map((category) => (
                              <option key={category.id} value={category.id}>{category.name}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="form-row">
                        <label className="form-group">
                          <span>SKU / كود الصنف</span>
                          <div className="field-with-button">
                            <input type="text" className="form-input" value={formData.sku} onChange={(event) => setField('sku', event.target.value)} />
                            <button type="button" className="btn-icon" onClick={() => setField('sku', makeSku(formData.name))} title="توليد كود">
                              <Shuffle size={14} />
                            </button>
                          </div>
                        </label>
                        <label className="form-group">
                          <span>باركود المنتج</span>
                          <div className="field-with-button">
                            <input type="text" className="form-input" value={formData.barcode} onChange={(event) => setField('barcode', event.target.value)} />
                            <button type="button" className="btn-icon" onClick={generateProductBarcode} title="توليد باركود">
                              <Barcode size={14} />
                            </button>
                          </div>
                        </label>
                      </div>

                      <div className="form-row">
                        <label className="form-group">
                          <span>الماركة</span>
                          <input type="text" className="form-input" value={formData.brand} onChange={(event) => setField('brand', event.target.value)} />
                        </label>
                        <label className="form-group">
                          <span>المخزن الرئيسي</span>
                          <select className="form-select" value={formData.primaryWarehouseId} onChange={(event) => setField('primaryWarehouseId', event.target.value)}>
                            {warehouses.map((wh) => (
                              <option key={wh.id} value={wh.id}>{wh.icon || '🏭'} {wh.name}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="form-row">
                        <label className="form-group form-grow">
                          <span>الوصف</span>
                          <textarea
                            className="form-input"
                            rows={3}
                            value={formData.description}
                            onChange={(event) => setField('description', event.target.value)}
                            placeholder="وصف مختصر للصنف"
                          />
                        </label>
                      </div>

                    </div>
                  </div>
                </div>
              ) : null}

              {activeTab === TABS.PRICING ? (
                <div
                  className="form-section"
                  onFocusCapture={selectAllInputValue}
                  onClickCapture={selectAllInputValue}
                >
                  <div className="form-row">
                    <label className="form-group">
                      <span>الوحدة الافتراضية</span>
                      <div className="field-with-button">
                        <select
                          className="form-select"
                          value={mainUnit.unitName}
                          onChange={(event) => setUnitField('unitName', event.target.value)}
                        >
                          {!unitOptions.includes(mainUnit.unitName) && mainUnit.unitName ? (
                            <option value={mainUnit.unitName}>{mainUnit.unitName}</option>
                          ) : null}
                          {unitOptions.map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                        <button type="button" className="btn-icon" onClick={() => setIsUnitManagerOpen(true)} title="إدارة الوحدات">
                          <Settings size={14} />
                        </button>
                      </div>
                    </label>
                    <label className="form-group">
                      <span>سعر الجملة</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="form-input"
                        value={mainUnit.wholesalePrice}
                        onChange={(event) => setUnitField('wholesalePrice', event.target.value)}
                      />
                    </label>
                  </div>

                  <div className="form-row">
                    <label className="form-group">
                      <span>أقل سعر بيع</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="form-input"
                        value={mainUnit.minSalePrice}
                        onChange={(event) => setUnitField('minSalePrice', event.target.value)}
                      />
                    </label>
                    <label className="form-group">
                      <span>حد إعادة الطلب للمخزون</span>
                      <input type="number" min="0" className="form-input" value={formData.minStock} onChange={(event) => setField('minStock', toInt(event.target.value, 5))} />
                    </label>
                  </div>

                  <section className="unified-pricing-section" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
                    <div className="variants-header" style={{ marginBottom: '16px' }}>
                      <label className="pm-toggle-switch">
                        <input
                          type="checkbox"
                          checked={formData.hasVariants}
                          onChange={(event) => toggleVariants(event.target.checked)}
                        />
                        <span className="pm-toggle-slider" />
                        <span>المنتج له ألوان/مقاسات</span>
                      </label>

                      {formData.hasVariants ? (
                        <div className="variants-actions">
                          <button type="button" className="btn-inline" onClick={() => addVariantRow()}>
                            <Plus size={14} />
                            إضافة متغير
                          </button>
                        </div>
                      ) : null}

                      {warehouses.length > 1 && (
                        <button 
                          type="button" 
                          className={`btn-inline ${showAllWarehouses ? 'active' : ''}`}
                          onClick={() => setShowAllWarehouses(!showAllWarehouses)}
                          style={{ marginRight: 'auto', fontSize: '0.8rem', color: '#6366f1' }}
                        >
                          {showAllWarehouses ? 'عرض المخزن الرئيسي فقط' : 'عرض كافة المخازن'}
                        </button>
                      )}
                    </div>

                    <div className="variants-table-wrap">
                      <table className="variants-table">
                        <thead>
                          <tr>
                            {formData.hasVariants && <th>المقاس</th>}
                            {formData.hasVariants && <th>اللون</th>}
                            <th>سعر الشراء</th>
                            <th>النسبة %</th>
                            <th>سعر البيع</th>
                            <th>سعر الجملة</th>
                            {warehouses.length === 0 && <th>الكمية</th>}
                            {visibleWarehouses.map(wh => (<th key={wh.id}>{wh.icon || '🏭'} {wh.name}</th>))}
                            {warehouses.length > 0 && <th>الإجمالي</th>}
                            <th>الباركود</th>
                            {formData.hasVariants && <th></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {formData.hasVariants ? formData.variants.map((variant, index) => {
                            const rowTotal = getVariantWarehouseTotal(variant);
                            const margin = marginPercentOf(variant.cost, variant.price);
                            return (
                              <tr key={variant.tempId || variant.id || index}>
                                <td>
                                  <input type="text" value={variant.size} onChange={(event) => setVariantField(index, 'size', event.target.value)} placeholder="M" />
                                </td>
                                <td>
                                  <input type="text" value={variant.color} onChange={(event) => setVariantField(index, 'color', event.target.value)} placeholder="أسود" />
                                </td>
                                <td>
                                  <input type="number" min="0" step="0.01" value={variant.cost} onChange={(event) => setVariantField(index, 'cost', event.target.value)} />
                                </td>
                                <td>
                                  <input type="number" step="0.01" value={margin} onChange={(e) => {
                                    const m = toNum(e.target.value, 0);
                                    setVariantField(index, 'price', money(variant.cost * (1 + m / 100)));
                                  }} />
                                </td>
                                <td>
                                  <input type="number" min="0" step="0.01" value={variant.price} onChange={(event) => setVariantField(index, 'price', event.target.value)} />
                                </td>
                                <td>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="form-input"
                                    value={mainUnit.wholesalePrice}
                                    disabled={true}
                                    title="السعر محدد للوحدة الافتراضية"
                                  />
                                </td>
                                {warehouses.length === 0 && (
                                  <td>
                                    <input type="number" min="0" value={variant.quantity} onChange={(event) => setVariantField(index, 'quantity', event.target.value)} />
                                  </td>
                                )}
                                {visibleWarehouses.map(wh => (
                                  <td key={wh.id}>
                                    <input type="number" min="0" value={getVariantWarehouseQty(variant, wh.id)} onChange={(e) => setVariantWarehouseQty(variant, wh.id, e.target.value)} />
                                  </td>
                                ))}
                                {warehouses.length > 0 && <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{rowTotal}</td>}
                                <td>
                                  <div className="unit-barcode-field" style={{ display: 'flex' }}>
                                    <input type="text" value={variant.barcode || ''} onChange={(event) => setVariantField(index, 'barcode', event.target.value)} />
                                    <button type="button" className="btn-icon" onClick={() => generateVariantBarcode(index)} title="توليد باركود المتغير">
                                      <Barcode size={14} />
                                    </button>
                                  </div>
                                </td>
                                <td>
                                  {formData.variants.length > 1 && (
                                    <button type="button" className="delete-btn" onClick={() => removeVariantRow(index)} aria-label="حذف المتغير">
                                      <Trash2 size={16} />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          }) : (
                            <tr>
                              <td>
                                <input type="number" min="0" step="0.01" value={mainUnit.purchasePrice} onChange={(event) => setUnitField('purchasePrice', event.target.value)} />
                              </td>
                              <td>
                                <input type="number" step="0.01" value={marginPercentOf(mainUnit.purchasePrice, mainUnit.salePrice)} onChange={(e) => setUnitMarginPercent(e.target.value)} />
                              </td>
                              <td>
                                <input type="number" min="0" step="0.01" value={mainUnit.salePrice} onChange={(event) => setUnitField('salePrice', event.target.value)} />
                              </td>
                              <td>
                                <input type="number" min="0" step="0.01" value={mainUnit.wholesalePrice} onChange={(event) => setUnitField('wholesalePrice', event.target.value)} />
                              </td>
                              {warehouses.length === 0 && (
                                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{stockTotalPreview}</td>
                              )}
                              {visibleWarehouses.map(wh => {
                                const stock = warehouseStocks.find(s => s.warehouseId === wh.id);
                                const qty = stock ? toInt(stock.quantity, 0) : 0;
                                return (
                                  <td key={wh.id}>
                                    <input type="number" min="0" value={qty} onChange={(e) => {
                                      const newQty = toInt(e.target.value, 0);
                                      setWarehouseStocks((prev) => {
                                        const filtered = prev.filter(s => s.warehouseId !== wh.id);
                                        return [...filtered, { warehouseId: wh.id, quantity: newQty, warehouse: wh }];
                                      });
                                    }} />
                                  </td>
                                );
                              })}
                              {warehouses.length > 0 && <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{stockTotalPreview}</td>}
                              <td>
                                <div className="unit-barcode-field" style={{ display: 'flex' }}>
                                  <input type="text" value={mainUnit.barcode || formData.barcode || ''} onChange={(event) => setUnitField('barcode', event.target.value)} />
                                  <button type="button" className="btn-icon" onClick={generateProductBarcode} title="توليد باركود">
                                    <Barcode size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {warehouses.length === 0 && (
                    <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#fef3c7', borderRadius: '8px', border: '1px solid #fbbf24', textAlign: 'center' }}>
                      <span style={{ color: '#92400e' }}>⚠️ لا توجد مخازن نشطة. يرجى إضافة مخازن من صفحة إدارة المخازن.</span>
                    </div>
                  )}


                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="product-modal-footer">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={isSaving}>إلغاء</button>
          <button type="button" className="btn-save" onClick={handleSave} disabled={isBusy}>
            {isSaving ? 'جاري الحفظ...' : isEditMode && isLoadingProduct ? 'جاري تحميل البيانات...' : <><Save size={16} /> حفظ المنتج</>}
          </button>
        </div>
      </div>

      <UnitManagerModal
        isOpen={isUnitManagerOpen}
        onClose={() => setIsUnitManagerOpen(false)}
        units={unitOptions}
        onUpdateUnits={(newUnits) => {
          setUnitOptions(newUnits);
          try {
            localStorage.setItem('erp_custom_units', JSON.stringify(newUnits));
          } catch (e) { }
        }}
      />
    </div>
  );
}
