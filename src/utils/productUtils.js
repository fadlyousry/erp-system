/**
 * Product utility functions — pure helpers used across the Products page.
 * Extracted from Products.jsx for cleanliness and reuse.
 */

export const DEFAULT_UNIT = 'قطعة';

export const GRID_COLUMNS = [
    { key: 'select', label: '', width: '52px', required: true, minWidth: '52px' },
    { key: 'code', label: 'الكود', width: 'minmax(100px, 1fr)', minWidth: '100px' },
    { key: 'name', label: 'اسم الصنف', width: 'minmax(200px, 2fr)', minWidth: '200px' },
    { key: 'warehouses', label: 'المخازن', width: 'minmax(200px, 2fr)', minWidth: '200px' },
    { key: 'unit', label: 'الوحدة', width: 'minmax(70px, 1fr)', minWidth: '70px' },
    { key: 'quantity', label: 'الكمية الإجمالية', width: 'minmax(100px, 1fr)', minWidth: '100px' },
    { key: 'salePrice', label: 'سعر البيع', width: 'minmax(100px, 1fr)', minWidth: '100px' },
    { key: 'costPrice', label: 'سعر التكلفة', width: 'minmax(100px, 1fr)', minWidth: '100px' },
    { key: 'wholesalePrice', label: 'سعر الجملة', width: 'minmax(100px, 1fr)', minWidth: '100px' },
    { key: 'saleLimit', label: 'حد البيع', width: 'minmax(80px, 1fr)', minWidth: '80px' },
    { key: 'notes', label: 'الملاحظات', width: 'minmax(150px, 1.5fr)', minWidth: '150px' },
    { key: 'category', label: 'الفئة', width: 'minmax(150px, 1.5fr)', minWidth: '150px' },
    { key: 'variants', label: 'المتغيرات', width: 'minmax(80px, 1fr)', minWidth: '80px' },
    { key: 'stockState', label: 'حالة المخزون', width: 'minmax(130px, 1fr)', minWidth: '130px' },
    { key: 'updatedAt', label: 'آخر تحديث', width: 'minmax(100px, 1fr)', minWidth: '100px' },
    { key: 'actions', label: 'إجراءات', width: '180px', required: true, minWidth: '180px' }
];

export const DEFAULT_VISIBLE_COLUMN_KEYS = GRID_COLUMNS
    .filter((col) => !col.required)
    .map((col) => col.key);

export const SORT_PRESETS = [
    { id: 'latest', label: 'الأحدث', sortCol: 'createdAt', sortDir: 'desc' },
    { id: 'oldest', label: 'الأقدم', sortCol: 'createdAt', sortDir: 'asc' },
    { id: 'name_asc', label: 'الاسم (أ - ي)', sortCol: 'name', sortDir: 'asc' },
    { id: 'name_desc', label: 'الاسم (ي - أ)', sortCol: 'name', sortDir: 'desc' },
    { id: 'price_desc', label: 'السعر الأعلى', sortCol: 'basePrice', sortDir: 'desc' },
    { id: 'price_asc', label: 'السعر الأقل', sortCol: 'basePrice', sortDir: 'asc' }
];

export const DEFAULT_CATEGORY = { name: '', description: '', color: '#0f766e', icon: '🧵' };

// ─── Primitive helpers ────────────────────────────────────────
export const nText = (v) => String(v ?? '').trim();
export const nKey = (v) => nText(v).toLowerCase().replace(/[\s_-]+/g, '');
export const nInt = (v, f = 0) => {
    const x = parseInt(String(v ?? '').replace(/[^0-9-]/g, ''), 10);
    return Number.isFinite(x) ? x : f;
};
export const nNum = (v, f = 0) => {
    const x = parseFloat(String(v ?? '').replace(/[^0-9.,-]/g, '').replace(/,/g, '.'));
    return Number.isFinite(x) ? x : f;
};
export const money = (v) => {
    const num = Number(v || 0);
    if (Number.isInteger(num)) {
        return num.toLocaleString('en-US');
    }
    return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};
export const csv = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
};

export const inRange = (value, fallback, min, max) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
};

// ─── Product-specific helpers ─────────────────────────────────
export const stock = (p) => {
    const variantsTotal = (p.variants || []).reduce((s, v) => s + nInt(v.quantity), 0);
    const total = nInt(p.inventory?.totalQuantity, variantsTotal);
    const min = nInt(p.inventory?.minStock, 5);
    if (total <= 0) return { key: 'out', label: 'نافد', tone: 'danger', total, min };
    if (total <= min) return { key: 'low', label: 'منخفض', tone: 'warning', total, min };
    return { key: 'ok', label: 'متاح', tone: 'success', total, min };
};

export const unitsOf = (product) =>
    [mainUnitOf(product)].filter(Boolean);

export const mainUnitOf = (product) => {
    if (!product) return null;
    const salePrice = nNum(product?.basePrice, 0);
    const wholesalePrice = nNum(product?.wholesalePrice, salePrice);
    const minSalePrice = nNum(product?.minSalePrice, wholesalePrice);
    const purchasePrice = nNum(product?.cost, 0);
    return {
        unitName: nText(product?.unitName) || DEFAULT_UNIT,
        salePrice,
        wholesalePrice: Math.min(salePrice, Math.max(0, wholesalePrice)),
        minSalePrice: Math.min(Math.min(salePrice, Math.max(0, minSalePrice)), Math.min(salePrice, Math.max(0, wholesalePrice))),
        purchasePrice,
        barcode: nText(product?.barcode)
    };
};

export const salePriceOf = (product) =>
    nNum(product?.basePrice, nNum(mainUnitOf(product)?.salePrice, 0));

export const costPriceOf = (product) =>
    nNum(product?.cost, nNum(mainUnitOf(product)?.purchasePrice, 0));

export const wholesale = (product) => {
    const salePrice = salePriceOf(product);
    const productWholesale = nNum(product?.wholesalePrice, salePrice);
    if (productWholesale > 0) {
        return Math.min(salePrice, productWholesale);
    }
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    if (variants.length > 0) {
        const prices = variants.map((variant) => nNum(variant.price, salePrice));
        return Math.min(...prices);
    }
    return salePrice;
};

export const getGridHeight = () => {
    if (typeof window === 'undefined') return 460;
    const reserved = window.innerWidth < 900 ? 380 : 280;
    return Math.max(260, window.innerHeight - reserved);
};
