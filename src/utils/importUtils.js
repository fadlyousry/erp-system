/**
 * CSV / Excel import utility functions.
 * Extracted from Products.jsx for cleanliness.
 */
import { nText, nKey, nNum, nInt } from './productUtils';

export const IMPORT_FIELD_OPTIONS = [
    { key: 'name', label: 'اسم المنتج', required: true, aliases: ['name', 'productname', 'اسم المنتج', 'اسم الصنف', 'الصنف'] },
    { key: 'category', label: 'الفئة', aliases: ['category', 'categoryname', 'الفئة', 'التصنيف'] },
    { key: 'brand', label: 'الماركة', aliases: ['brand', 'الماركة', 'العلامة التجارية'] },
    { key: 'sku', label: 'SKU / كود', aliases: ['sku', 'code', 'productcode', 'كود', 'كود الصنف'] },
    { key: 'barcode', label: 'باركود المنتج', aliases: ['barcode', 'productbarcode', 'باركود', 'باركود المنتج'] },
    { key: 'description', label: 'الوصف', aliases: ['description', 'الوصف', 'desc'] },
    { key: 'salePrice', label: 'سعر البيع', aliases: ['saleprice', 'price', 'sellingprice', 'سعر البيع', 'سعر'] },
    { key: 'costPrice', label: 'سعر التكلفة', aliases: ['costprice', 'purchaseprice', 'cost', 'التكلفة', 'سعر التكلفة'] },
    { key: 'image', label: 'صورة', aliases: ['image', 'photo', 'صورة', 'رابط الصورة'] },
    { key: 'warehouseQty', label: 'كمية المخزن', aliases: ['warehouseqty', 'warehouse', 'مخزن', 'كمية المخزن'] },
    { key: 'displayQty', label: 'كمية العرض', aliases: ['displayqty', 'display', 'عرض', 'كمية العرض'] },
    { key: 'totalQuantity', label: 'الكمية الإجمالية', aliases: ['totalqty', 'totquantity', 'totalquantity', 'inventoryqty', 'الكمية الإجمالية'] },
    { key: 'minStock', label: 'الحد الأدنى', aliases: ['minstock', 'minimumstock', 'الحد الأدنى', 'حد البيع'] },
    { key: 'notes', label: 'ملاحظات', aliases: ['notes', 'note', 'ملاحظات'] },
    { key: 'size', label: 'المقاس', aliases: ['size', 'productsize', 'المقاس'] },
    { key: 'color', label: 'اللون', aliases: ['color', 'colour', 'اللون'] },
    { key: 'variantBarcode', label: 'باركود المتغير', aliases: ['variantbarcode', 'barcodesizecolor', 'باركود المتغير'] },
    { key: 'variantPrice', label: 'سعر المتغير', aliases: ['variantprice', 'pricevariant', 'سعر المتغير'] },
    { key: 'variantCost', label: 'تكلفة المتغير', aliases: ['variantcost', 'costvariant', 'تكلفة المتغير'] },
    { key: 'variantQty', label: 'كمية المتغير', aliases: ['variantqty', 'variantquantity', 'quantity', 'qty', 'كمية المتغير', 'الكمية'] }
];

export const parseLine = (line, delim) => {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i += 1) {
        const c = line[i];
        const n = line[i + 1];
        if (c === '"') {
            if (q && n === '"') {
                cur += '"';
                i += 1;
            } else q = !q;
            continue;
        }
        if (c === delim && !q) {
            out.push(cur.trim());
            cur = '';
        } else cur += c;
    }
    out.push(cur.trim());
    return out;
};

export const delimiter = (header) => {
    const c = header.split(',').length;
    const s = header.split(';').length;
    const t = header.split('\t').length;
    if (t >= c && t >= s) return '\t';
    if (s > c) return ';';
    return ',';
};

export const toImportHeaders = (headers) => (
    headers.map((label, index) => {
        const cleanLabel = nText(label) || `عمود ${index + 1}`;
        return {
            id: String(index),
            index,
            label: cleanLabel,
            key: nKey(cleanLabel) || `column${index + 1}`
        };
    })
);

export const buildImportFieldAutoMapping = (headers = []) => {
    const mapping = Object.fromEntries(IMPORT_FIELD_OPTIONS.map((field) => [field.key, '']));
    const usedHeaders = new Set();

    IMPORT_FIELD_OPTIONS.forEach((field) => {
        const aliasKeys = (field.aliases || []).map((alias) => nKey(alias)).filter(Boolean);
        if (!aliasKeys.length) return;

        let match = headers.find((header) => (
            !usedHeaders.has(header.id)
            && aliasKeys.some((alias) => header.key === alias)
        ));

        if (!match) {
            match = headers.find((header) => (
                !usedHeaders.has(header.id)
                && aliasKeys.some((alias) => (
                    header.key.includes(alias)
                    || alias.includes(header.key)
                ))
            ));
        }

        if (match) {
            mapping[field.key] = match.id;
            usedHeaders.add(match.id);
        }
    });

    return mapping;
};

export const mapRowsWithImportMapping = (rows, mapping) => (
    rows.map((values) => {
        const mappedRow = {};

        IMPORT_FIELD_OPTIONS.forEach((field) => {
            const columnId = mapping?.[field.key];
            if (columnId === undefined || columnId === null || columnId === '') {
                mappedRow[field.key] = '';
                return;
            }

            const columnIndex = Number(columnId);
            mappedRow[field.key] = nText(values[columnIndex] ?? '');
        });

        return mappedRow;
    })
);

const SUMMARY_ROW_KEYS = new Set([
    'total',
    'totals',
    'grandtotal',
    'subtotal',
    'sum',
    'summary',
    'اجمالي',
    'الاجمالي',
    'إجمالي',
    'الإجمالي',
    'مجموع',
    'المجموع'
].map((value) => nKey(value)));

const hasImportSummaryLabel = (row) => (
    Object.entries(row || {}).some(([key, value]) => {
        if (key === 'sourceIndex') return false;
        const text = nText(value).replace(/[:：]+$/g, '');
        const normalized = nKey(text);
        return normalized && SUMMARY_ROW_KEYS.has(normalized);
    })
);

const isMappedImportHeaderRow = (row) => (
    IMPORT_FIELD_OPTIONS.some((field) => {
        const valueKey = nKey(row?.[field.key]);
        if (!valueKey) return false;
        return (field.aliases || []).some((alias) => valueKey === nKey(alias));
    })
);

const isNumericOnlyName = (value) => {
    const text = nText(value);
    if (!text) return false;

    const hasDigit = /[0-9\u0660-\u0669]/.test(text);
    const hasLetter = /[A-Za-z\u0600-\u06FF]/.test(text);
    if (!hasDigit || hasLetter) return false;

    return text.replace(/[0-9\u0660-\u0669\s#.,،٫٬+\-_/\\()]+/g, '') === '';
};

export const isIgnorableProductImportRow = (row) => (
    isMappedImportHeaderRow(row)
    || hasImportSummaryLabel(row)
    || isNumericOnlyName(row?.name)
);

export const importGroups = (rows) => {
    const groups = [];
    let currentGroup = null;

    for (const row of rows) {
        if (isIgnorableProductImportRow(row)) continue;

        const name = nText(row.name);
        const isMain = Boolean(name);

        if (isMain) {
            if (currentGroup) groups.push(currentGroup);
            currentGroup = {
                product: {
                    name,
                    category: nText(row.category),
                    brand: nText(row.brand),
                    sku: nText(row.sku),
                    barcode: nText(row.barcode),
                    description: nText(row.description),
                    basePrice: nNum(row.salePrice || row.variantPrice, 0),
                    cost: nNum(row.costPrice || row.variantCost, 0),
                    image: nText(row.image)
                },
                inventory: {
                    totalQuantity: nInt(row.totalQuantity, nInt(row.warehouseQty, 0) + nInt(row.displayQty, 0)),
                    warehouseQty: nInt(row.warehouseQty, 0),
                    displayQty: nInt(row.displayQty, 0),
                    minStock: nInt(row.minStock, 5),
                    maxStock: 100,
                    notes: nText(row.notes)
                },
                variants: []
            };
        }

        if (currentGroup) {
            const size = nText(row.size);
            const color = nText(row.color);
            const vBarcode = nText(row.variantBarcode);
            const price = nNum(row.variantPrice, nNum(row.salePrice, 0));
            const cost = nNum(row.variantCost, nNum(row.costPrice, 0));
            const qty = nInt(row.variantQty, 0);

            if (size || color || qty > 0 || vBarcode) {
                currentGroup.variants.push({ size, color, barcode: vBarcode, price, cost, quantity: qty });
            }
        }
    }
    if (currentGroup) groups.push(currentGroup);
    return groups;
};
