require('dotenv').config(); // Load .env file
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const { PERMISSIONS } = require('../prisma/permissions');

const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';
const DEBUG_CUSTOMERS_QUERIES = process.env.DEBUG_CUSTOMERS_QUERIES === '1';
const ENABLE_PERF_LOGS = process.env.ENABLE_PERF_LOGS === '1';
const PERF_SLOW_QUERY_MS = Math.max(0, parseInt(process.env.PERF_SLOW_QUERY_MS || '250', 10) || 250);
let currentSessionUser = null;

const customerQueryLog = (...args) => {
    if (DEBUG_CUSTOMERS_QUERIES) {
        console.log(...args);
    }
};

const perfNow = () => (
    typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()
);

const startPerfTimer = (endpoint, params = {}) => {
    const startedAt = perfNow();
    return ({ rows = null, error = null } = {}) => {
        if (!ENABLE_PERF_LOGS) return;
        const durationMs = Number((perfNow() - startedAt).toFixed(2));
        if (!error && durationMs < PERF_SLOW_QUERY_MS) return;

        const payload = {
            endpoint,
            durationMs,
            rows,
            params
        };

        if (error) {
            console.warn('[PERF][ERROR]', payload, error?.message || error);
        } else {
            console.log('[PERF]', payload);
        }
    };
};

const parsePositiveInt = (value) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const toNumber = (value, fallback = 0) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const toInteger = (value, fallback = 0) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeString = (value) => {
    const text = String(value ?? '').trim();
    return text || null;
};

const toMoney = (value, fallback = 0) => (
    Math.max(0, Number(toNumber(value, fallback).toFixed(2)))
);

const normalizeSingleProductUnit = (payload, {
    baseSalePrice = 0,
    baseCostPrice = 0,
    fallbackBarcode = null
} = {}) => {
    const salePrice = toMoney(
        payload?.basePrice,
        baseSalePrice
    );
    const purchasePrice = toMoney(
        payload?.cost,
        baseCostPrice
    );
    const wholesalePrice = toMoney(
        Math.min(
            salePrice,
            toNumber(
                payload?.wholesalePrice,
                salePrice
            )
        ),
        salePrice
    );
    const minSalePrice = toMoney(
        Math.min(
            wholesalePrice,
            toNumber(
                payload?.minSalePrice,
                wholesalePrice
            )
        ),
        wholesalePrice
    );
    const unitName = normalizeString(payload?.unitName)
        || '\u0642\u0637\u0639\u0629';
    const barcode = normalizeString(payload?.barcode)
        || normalizeString(fallbackBarcode)
        || null;

    return {
        unitName,
        salePrice,
        wholesalePrice,
        minSalePrice,
        purchasePrice,
        barcode
    };
};

const PRODUCT_CATEGORY_SELECT = {
    id: true,
    name: true,
    icon: true,
    color: true,
    description: true
};

const PRODUCT_INVENTORY_SELECT = {
    id: true,
    totalQuantity: true,
    minStock: true,
    maxStock: true,
    warehouseQty: true,
    displayQty: true,
    lastRestock: true,
    notes: true,
    updatedAt: true
};

const PRODUCT_VARIANT_SELECT = {
    id: true,
    productSize: true,
    color: true,
    price: true,
    cost: true,
    quantity: true,
    barcode: true,
    updatedAt: true
};

const WAREHOUSE_STOCK_SELECT = {
    id: true,
    warehouseId: true,
    quantity: true
};

const buildProductSelect = ({
    includeDescription = true,
    includeImage = true,
    includeCategory = true,
    includeInventory = true,
    includeVariants = true,
    includeWarehouseStocks = true
} = {}) => ({
    id: true,
    name: true,
    ...(includeDescription ? { description: true } : {}),
    categoryId: true,
    brand: true,
    unitName: true,
    barcode: true,
    ...(includeImage ? { image: true } : {}),
    sku: true,
    basePrice: true,
    wholesalePrice: true,
    minSalePrice: true,
    cost: true,
    isActive: true,
    type: true,
    createdAt: true,
    updatedAt: true,
    ...(includeCategory ? { category: { select: PRODUCT_CATEGORY_SELECT } } : {}),
    ...(includeInventory ? { inventory: { select: PRODUCT_INVENTORY_SELECT } } : {}),
    ...(includeVariants ? { variants: { select: PRODUCT_VARIANT_SELECT } } : {}),
    ...(includeWarehouseStocks ? { warehouseStocks: { select: WAREHOUSE_STOCK_SELECT } } : {})
});

const normalizeErrorText = (value) => String(value || '').toLowerCase();

const isMissingTableError = (error, tableName) => {
    const target = normalizeErrorText(tableName);
    const code = String(error?.code || '').trim();
    const message = normalizeErrorText(error?.message);
    const metaTable = normalizeErrorText(error?.meta?.table);

    if (code === 'P2021') {
        if (!target) return true;
        return metaTable.includes(target) || message.includes(target);
    }

    if (!target) {
        return message.includes('does not exist in the current database');
    }

    return message.includes('does not exist') && message.includes(target);
};

const isWarehouseStockTableMissingError = (error) => (
    isMissingTableError(error, 'WarehouseStock')
);

const isVariantWarehouseStockTableMissingError = (error) => (
    isMissingTableError(error, 'VariantWarehouseStock')
);

const isWarehouseSchemaMissingError = (error) => (
    isMissingTableError(error, 'Warehouse')
    || isMissingTableError(error, 'WarehouseStock')
    || isMissingTableError(error, 'VariantWarehouseStock')
    || isMissingTableError(error, 'WarehouseTransfer')
);

const WAREHOUSE_SCHEMA_MISSING_MESSAGE = 'Warehouse features are unavailable. Please run database migrations.';

let warehouseStockFallbackLogged = false;
const logWarehouseStockFallback = (context, error) => {
    if (warehouseStockFallbackLogged) return;
    warehouseStockFallbackLogged = true;
    console.warn(
        `[db-service] ${context}: WarehouseStock table is missing. Falling back without warehouse stock relation data.`
    );
    if (error?.message) {
        console.warn('[db-service] Original Prisma error:', error.message);
    }
};

let warehouseSchemaFallbackLogged = false;
const logWarehouseSchemaFallback = (context, error) => {
    if (warehouseSchemaFallbackLogged) return;
    warehouseSchemaFallbackLogged = true;
    console.warn(
        `[db-service] ${context}: Warehouse tables are missing. Falling back to compatibility mode.`
    );
    if (error?.message) {
        console.warn('[db-service] Original Prisma error:', error.message);
    }
};

const withWarehouseStockRelationFallback = async (context, primaryQuery, fallbackQuery) => {
    try {
        return await primaryQuery();
    } catch (error) {
        if (!isWarehouseStockTableMissingError(error)) {
            throw error;
        }

        logWarehouseStockFallback(context, error);
        return await fallbackQuery();
    }
};

const withVariantWarehouseStockRelationFallback = async (context, primaryQuery, fallbackQuery) => {
    try {
        return await primaryQuery();
    } catch (error) {
        if (!isVariantWarehouseStockTableMissingError(error)) {
            throw error;
        }

        logWarehouseSchemaFallback(context, error);
        return await fallbackQuery();
    }
};

const mapProductDeleteConstraintError = (error) => {
    const text = normalizeErrorText(
        `${error?.message || ''} ${error?.meta?.field_name || ''} ${error?.meta?.target || ''}`
    );

    if (text.includes('saleitem_variantid_fkey') || text.includes('"saleitem"') || text.includes('table "saleitem"')) {
        return 'لا يمكن حذف المنتج لارتباطه بفواتير بيع.';
    }
    if (text.includes('returnitem_variantid_fkey') || text.includes('"returnitem"') || text.includes('table "returnitem"')) {
        return 'لا يمكن حذف المنتج لارتباطه بمرتجعات بيع.';
    }
    if (text.includes('purchaseitem_variantid_fkey') || text.includes('"purchaseitem"') || text.includes('table "purchaseitem"')) {
        return 'لا يمكن حذف المنتج لارتباطه بفواتير شراء.';
    }
    if (text.includes('purchasereturnitem_variantid_fkey') || text.includes('"purchasereturnitem"') || text.includes('table "purchasereturnitem"')) {
        return 'لا يمكن حذف المنتج لارتباطه بمرتجعات شراء.';
    }
    if (String(error?.code || '').trim() === 'P2003') {
        return 'لا يمكن حذف المنتج لوجود حركات مرتبطة به.';
    }
    return null;
};

const mapCustomerDeleteConstraintError = (error) => {
    const text = normalizeErrorText(
        `${error?.message || ''} ${error?.meta?.field_name || ''} ${error?.meta?.target || ''}`
    );

    if (text.includes('sale_customerid_fkey') || text.includes('"sale"') || text.includes('table "sale"')) {
        return 'لا يمكن حذف العميل لارتباطه بفواتير بيع.';
    }
    if (text.includes('customerpayment_customerid_fkey') || text.includes('"customerpayment"') || text.includes('table "customerpayment"')) {
        return 'لا يمكن حذف العميل لارتباطه بدفعات مسجلة.';
    }
    if (text.includes('return_customerid_fkey') || text.includes('"return"') || text.includes('table "return"')) {
        return 'لا يمكن حذف العميل لارتباطه بمرتجعات بيع.';
    }
    if (text.includes('paymentallocation_customerid_fkey') || text.includes('"paymentallocation"') || text.includes('table "paymentallocation"')) {
        return 'لا يمكن حذف العميل لارتباطه بتسويات مدفوعات.';
    }
    if (text.includes('customertransaction_customerid_fkey') || text.includes('"customertransaction"') || text.includes('table "customertransaction"')) {
        return 'لا يمكن حذف العميل لوجود حركات مالية مرتبطة به.';
    }
    if (String(error?.code || '').trim() === 'P2003') {
        return 'لا يمكن حذف العميل لوجود حركات مالية مرتبطة به.';
    }
    if (String(error?.code || '').trim() === 'P2025') {
        return 'العميل غير موجود.';
    }
    return null;
};

const mapSupplierDeleteConstraintError = (error) => {
    const text = normalizeErrorText(
        `${error?.message || ''} ${error?.meta?.field_name || ''} ${error?.meta?.target || ''}`
    );

    if (text.includes('purchase_supplierid_fkey') || text.includes('"purchase"') || text.includes('table "purchase"')) {
        return 'لا يمكن حذف المورد لارتباطه بفواتير شراء.';
    }
    if (text.includes('supplierpayment_supplierid_fkey') || text.includes('"supplierpayment"') || text.includes('table "supplierpayment"')) {
        return 'لا يمكن حذف المورد لارتباطه بدفعات سداد.';
    }
    if (text.includes('purchasereturn_supplierid_fkey') || text.includes('"purchasereturn"') || text.includes('table "purchasereturn"')) {
        return 'لا يمكن حذف المورد لارتباطه بمرتجعات شراء.';
    }
    if (String(error?.code || '').trim() === 'P2003') {
        return 'لا يمكن حذف المورد لوجود حركات مرتبطة به.';
    }
    if (String(error?.code || '').trim() === 'P2025') {
        return 'المورد غير موجود.';
    }
    return null;
};

const syncWarehouseStockTotalWithQuantity = async (dbClient, productId, targetTotalQuantity) => {
    const resolvedProductId = parsePositiveInt(productId);
    if (!resolvedProductId) return 0;

    const target = toInteger(targetTotalQuantity, 0);
    const existingStocks = await dbClient.warehouseStock.findMany({
        where: { productId: resolvedProductId },
        select: { id: true, warehouseId: true, quantity: true },
        orderBy: [{ quantity: 'desc' }, { id: 'asc' }]
    });

    if (existingStocks.length === 0) {

        const firstWarehouse = (
            await dbClient.warehouse.findFirst({
                where: { isActive: true },
                select: { id: true },
                orderBy: { id: 'asc' }
            })
        ) || (
                await dbClient.warehouse.findFirst({
                    select: { id: true },
                    orderBy: { id: 'asc' }
                })
            );

        if (!firstWarehouse?.id) return 0;

        await dbClient.warehouseStock.create({
            data: {
                productId: resolvedProductId,
                warehouseId: firstWarehouse.id,
                quantity: target
            }
        });

        return target;
    }

    const currentTotal = existingStocks.reduce((sum, stock) => sum + toInteger(stock.quantity, 0), 0);
    if (currentTotal === target) return currentTotal;

    if (currentTotal < target) {
        const primaryStock = existingStocks[0];
        const delta = target - currentTotal;
        await dbClient.warehouseStock.update({
            where: { id: primaryStock.id },
            data: { quantity: toInteger(primaryStock.quantity, 0) + delta }
        });
        return target;
    }

    let remainingReduction = currentTotal - target;
    for (const stock of existingStocks) {
        if (remainingReduction <= 0) break;
        const currentQty = toInteger(stock.quantity, 0);
        const reduction = Math.min(currentQty, remainingReduction);
        if (reduction <= 0) continue;

        await dbClient.warehouseStock.update({
            where: { id: stock.id },
            data: { quantity: currentQty - reduction }
        });
        remainingReduction -= reduction;
    }

    return target;
};

const syncVariantWarehouseStockTotalsWithVariantQuantities = async (dbClient, productId) => {
    const resolvedProductId = parsePositiveInt(productId);
    if (!resolvedProductId) return [];

    const variants = await dbClient.variant.findMany({
        where: { productId: resolvedProductId },
        select: { id: true, quantity: true },
        orderBy: { id: 'asc' }
    });
    if (variants.length === 0) return [];

    const firstWarehouse = (
        await dbClient.warehouse.findFirst({
            where: { isActive: true },
            select: { id: true },
            orderBy: { id: 'asc' }
        })
    ) || (
            await dbClient.warehouse.findFirst({
                select: { id: true },
                orderBy: { id: 'asc' }
            })
        );

    for (const variant of variants) {
        const targetQuantity = toInteger(variant.quantity, 0);
        const existingStocks = await dbClient.variantWarehouseStock.findMany({
            where: { variantId: variant.id },
            select: { id: true, warehouseId: true, quantity: true },
            orderBy: [{ quantity: 'desc' }, { id: 'asc' }]
        });

        if (existingStocks.length === 0) {
            // Smart fallback: check if product already has warehouse records
            const productStocks = await dbClient.warehouseStock.findMany({
                where: { productId },
                select: { warehouseId: true }
            });
            
            const fallbackWarehouseId = productStocks.length > 0 
                ? productStocks[0].warehouseId 
                : firstWarehouse?.id;

            if (!fallbackWarehouseId) continue;
            
            await dbClient.variantWarehouseStock.create({
                data: {
                    variantId: variant.id,
                    warehouseId: fallbackWarehouseId,
                    quantity: targetQuantity
                }
            });
            continue;
        }

        const currentTotal = existingStocks.reduce((sum, stock) => sum + toInteger(stock.quantity, 0), 0);
        if (currentTotal === targetQuantity) continue;

        if (currentTotal < targetQuantity) {
            const primaryStock = existingStocks[0];
            await dbClient.variantWarehouseStock.update({
                where: { id: primaryStock.id },
                data: { quantity: toInteger(primaryStock.quantity, 0) + (targetQuantity - currentTotal) }
            });
            continue;
        }

        let remainingReduction = currentTotal - targetQuantity;
        for (const stock of existingStocks) {
            if (remainingReduction <= 0) break;
            const currentQty = toInteger(stock.quantity, 0);
            const reduction = Math.min(currentQty, remainingReduction);
            if (reduction <= 0) continue;
            const nextQty = currentQty - reduction;

            if (nextQty !== currentQty) {
                await dbClient.variantWarehouseStock.update({
                    where: { id: stock.id },
                    data: { quantity: nextQty }
                });
            }
            remainingReduction -= reduction;
        }
    }

    return variants;
};

const syncLegacyProductWarehouseTotalsFromVariantStocks = async (dbClient, productId) => {
    const resolvedProductId = parsePositiveInt(productId);
    if (!resolvedProductId) return [];

    const variants = await dbClient.variant.findMany({
        where: { productId: resolvedProductId },
        select: { id: true }
    });
    const variantIds = variants.map((variant) => variant.id);

    if (variantIds.length === 0) {
        await dbClient.warehouseStock.deleteMany({
            where: { productId: resolvedProductId }
        });
        return [];
    }

    const grouped = await dbClient.variantWarehouseStock.groupBy({
        by: ['warehouseId'],
        where: { variantId: { in: variantIds } },
        _sum: { quantity: true }
    });
    const totals = grouped.map((row) => ({
        warehouseId: row.warehouseId,
        quantity: toInteger(row?._sum?.quantity, 0)
    }));

    const existingRows = await dbClient.warehouseStock.findMany({
        where: { productId: resolvedProductId },
        select: { id: true, warehouseId: true }
    });
    const existingByWarehouseId = new Map(existingRows.map((row) => [row.warehouseId, row]));
    const incomingWarehouseIds = new Set(totals.map((row) => row.warehouseId));

    for (const row of totals) {
        const existing = existingByWarehouseId.get(row.warehouseId);
        if (existing?.id) {
            await dbClient.warehouseStock.update({
                where: { id: existing.id },
                data: { quantity: row.quantity }
            });
        } else {
            await dbClient.warehouseStock.create({
                data: {
                    productId: resolvedProductId,
                    warehouseId: row.warehouseId,
                    quantity: row.quantity
                }
            });
        }
    }

    const staleIds = existingRows
        .filter((row) => !incomingWarehouseIds.has(row.warehouseId))
        .map((row) => row.id)
        .filter(Boolean);
    if (staleIds.length > 0) {
        await dbClient.warehouseStock.deleteMany({
            where: { id: { in: staleIds } }
        });
    }

    return totals;
};

const syncSingleProductInventoryWithVariants = async (dbClient, productId) => {
    const resolvedProductId = parsePositiveInt(productId);
    if (!resolvedProductId) return 0;

    const variantsAggregate = await dbClient.variant.aggregate({
        where: { productId: resolvedProductId },
        _sum: { quantity: true },
        _count: { id: true }
    });
    const variantsCount = Math.max(0, toInteger(variantsAggregate?._count?.id, 0));
    if (variantsCount <= 0) {
        const existingInventory = await dbClient.inventory.findUnique({
            where: { productId: resolvedProductId },
            select: { totalQuantity: true }
        });
        return toInteger(existingInventory?.totalQuantity, 0);
    }

    const totalQuantity = toInteger(variantsAggregate?._sum?.quantity, 0);
    const quantityData = {
        totalQuantity,
        warehouseQty: totalQuantity,
        displayQty: 0
    };

    const existingInventory = await dbClient.inventory.findUnique({
        where: { productId: resolvedProductId },
        select: { productId: true }
    });

    if (existingInventory) {
        await dbClient.inventory.update({
            where: { productId: resolvedProductId },
            data: quantityData
        });
    } else {
        await dbClient.inventory.create({
            data: {
                productId: resolvedProductId,
                minStock: 5,
                maxStock: 100,
                ...quantityData,
                lastRestock: totalQuantity > 0 ? new Date() : null
            }
        });
    }

    try {
        await syncVariantWarehouseStockTotalsWithVariantQuantities(dbClient, resolvedProductId);
        await syncLegacyProductWarehouseTotalsFromVariantStocks(dbClient, resolvedProductId);
    } catch (error) {
        if (isVariantWarehouseStockTableMissingError(error)) {
            await syncWarehouseStockTotalWithQuantity(dbClient, resolvedProductId, totalQuantity);
        } else if (isWarehouseSchemaMissingError(error)) {
            logWarehouseSchemaFallback('syncSingleProductInventoryWithVariants', error);
        } else {
            throw error;
        }
    }

    return totalQuantity;
};

const syncProductInventoriesWithVariants = async (dbClient, productIds = []) => {
    const uniqueProductIds = Array.from(new Set(
        (Array.isArray(productIds) ? productIds : [])
            .map((id) => parsePositiveInt(id))
            .filter(Boolean)
    ));

    for (const productId of uniqueProductIds) {
        await syncSingleProductInventoryWithVariants(dbClient, productId);
    }
};

const isPrismaDecimalLike = (value) => (
    value
    && typeof value === 'object'
    && typeof value.toNumber === 'function'
    && typeof value.toString === 'function'
    && Array.isArray(value.d)
    && typeof value.e === 'number'
    && typeof value.s === 'number'
);

const normalizeDecimalValues = (value, seen = new WeakMap()) => {
    if (value == null) return value;

    if (isPrismaDecimalLike(value)) {
        const asNumber = Number(value.toString());
        return Number.isFinite(asNumber) ? asNumber : value.toString();
    }

    if (Array.isArray(value)) {
        return value.map((item) => normalizeDecimalValues(item, seen));
    }

    if (value instanceof Date || Buffer.isBuffer(value)) {
        return value;
    }

    if (typeof value === 'object') {
        if (seen.has(value)) return seen.get(value);

        const output = {};
        seen.set(value, output);
        Object.entries(value).forEach(([key, entry]) => {
            output[key] = normalizeDecimalValues(entry, seen);
        });
        return output;
    }

    return value;
};

const toValidDate = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
};

const pickEarlierDate = (a, b) => {
    const da = toValidDate(a);
    const db = toValidDate(b);
    if (da && db) return da < db ? da : db;
    return da || db || null;
};

const pickLaterDate = (a, b) => {
    const da = toValidDate(a);
    const db = toValidDate(b);
    if (da && db) return da > db ? da : db;
    return da || db || null;
};

const computeCustomerPaymentStatus = (firstActivityDate, lastPaymentDate, overdueThreshold) => {
    const start = toValidDate(firstActivityDate);
    const lastPayment = toValidDate(lastPaymentDate);
    const referenceDate = lastPayment || start;
    if (!referenceDate) {
        return { lastPaymentDays: 0, isOverdue: false };
    }
    const diffTime = Math.max(0, Date.now() - referenceDate.getTime());
    const lastPaymentDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return {
        lastPaymentDays,
        isOverdue: lastPaymentDays > overdueThreshold
    };
};

const CUSTOMER_SORTABLE_COLUMNS = new Set(['balance', 'lastPaymentDate', 'createdAt', 'name', 'id']);

const normalizeCustomerFilterText = (value) => String(value ?? '').trim();

const buildCustomerSearchCondition = (searchTerm) => {
    const normalizedSearch = String(searchTerm || '').trim();
    if (!normalizedSearch) return null;

    return {
        OR: [
            { name: { startsWith: normalizedSearch, mode: 'insensitive' } },
            { phone: { startsWith: normalizedSearch } },
            { phone2: { startsWith: normalizedSearch } },
            { city: { startsWith: normalizedSearch, mode: 'insensitive' } }
        ]
    };
};

const buildCustomerColumnFilterConditions = (columnFilters = {}) => {
    const filters = (columnFilters && typeof columnFilters === 'object') ? columnFilters : {};
    const conditions = [];

    Object.entries(filters).forEach(([key, rawValue]) => {
        const value = normalizeCustomerFilterText(rawValue);
        if (!value) return;

        switch (key) {
            case 'id': {
                const parsedId = parsePositiveInt(value);
                conditions.push(parsedId ? { id: parsedId } : { id: -1 });
                return;
            }
            case 'type':
                conditions.push({ customerType: { contains: value, mode: 'insensitive' } });
                return;
            case 'name':
            case 'phone':
            case 'phone2':
            case 'address':
            case 'city':
            case 'district':
            case 'notes':
                conditions.push({ [key]: { contains: value, mode: 'insensitive' } });
                return;
            case 'creditLimit':
            case 'balance': {
                const parsed = Number.parseFloat(value.replace(',', '.'));
                if (!Number.isFinite(parsed)) {
                    conditions.push({ id: -1 });
                    return;
                }
                conditions.push({ [key]: { equals: parsed } });
                return;
            }
            default:
                return;
        }
    });

    return conditions;
};

const buildCustomersWhereClause = ({
    searchTerm = '',
    customerType = null,
    city = '',
    columnFilters = {},
    overdueOnly = false,
    overdueThreshold = 30
} = {}) => {
    const andConditions = [];

    const searchCondition = buildCustomerSearchCondition(searchTerm);
    if (searchCondition) {
        andConditions.push(searchCondition);
    }

    if (customerType && customerType !== 'all') {
        andConditions.push({ customerType });
    }

    const normalizedCity = String(city || '').trim();
    if (normalizedCity.length > 0) {
        andConditions.push({ city: { startsWith: normalizedCity, mode: 'insensitive' } });
    }

    const columnFilterConditions = buildCustomerColumnFilterConditions(columnFilters);
    if (columnFilterConditions.length > 0) {
        andConditions.push(...columnFilterConditions);
    }

    if (overdueOnly) {
        const cutoffDate = new Date(Date.now() - overdueThreshold * 24 * 60 * 60 * 1000);
        andConditions.push({
            OR: [
                { lastPaymentDate: { not: null, lt: cutoffDate } },
                { lastPaymentDate: null, firstActivityDate: { not: null, lt: cutoffDate } }
            ]
        });
    }

    if (andConditions.length === 0) return {};
    if (andConditions.length === 1) return andConditions[0];
    return { AND: andConditions };
};

const isCreditSaleType = (saleType) => {
    const normalized = String(saleType || '').trim().toLowerCase();
    return (
        normalized === '\u0622\u062c\u0644' || // آجل
        normalized === '\u0627\u062c\u0644' || // اجل
        normalized === 'ø¢ø¬ù„' || // legacy mojibake value seen in some environments
        normalized === 'credit' ||
        normalized === 'deferred'
    );
};

const computeSaleOutstandingAmount = ({ total, paid = 0 }) => {
    const netTotal = toNumber(total);
    const paidAmount = toNumber(paid);
    return netTotal - paidAmount;
};

const parsePaymentDateInput = (value) => {
    if (!value) return new Date();

    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const parsed = new Date(`${value}T00:00:00Z`);
        return Number.isFinite(parsed.getTime()) ? parsed : new Date();
    }

    const parsed = toValidDate(value);
    return parsed || new Date();
};

const PAYMENT_METHOD_CODE_ALIASES = {
    cash: 'CASH',
    نقدي: 'CASH',
    credit: 'CREDIT',
    deferred: 'CREDIT',
    اجل: 'CREDIT',
    آجل: 'CREDIT',
    visa: 'VISA',
    mastercard: 'MASTERCARD',
    banktransfer: 'BANK_TRANSFER',
    bank_transfer: 'BANK_TRANSFER',
    vodafonecash: 'VODAFONE_CASH',
    vodafone_cash: 'VODAFONE_CASH',
    فودافون: 'VODAFONE_CASH',
    فودافونكاش: 'VODAFONE_CASH',
    instapay: 'INSTAPAY',
    انستاباي: 'INSTAPAY',
    insta: 'INSTAPAY'
};

const normalizePaymentMethodLookup = (rawValue) => {
    const numeric = parsePositiveInt(rawValue);
    if (numeric) {
        return { id: numeric, rawName: null, code: null };
    }

    const rawName = String(rawValue || '').trim();
    if (!rawName) {
        return { id: null, rawName: null, code: null };
    }

    const normalizedKey = rawName
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[-_]/g, '');

    const aliasCode = PAYMENT_METHOD_CODE_ALIASES[normalizedKey];
    const fallbackCode = rawName
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_');

    return {
        id: null,
        rawName,
        code: aliasCode || fallbackCode
    };
};

const resolvePaymentMethodId = async (txOrClient, rawValue, fallbackId = 1) => {
    const { id, rawName, code } = normalizePaymentMethodLookup(rawValue);

    if (id) {
        const byId = await txOrClient.paymentMethod.findFirst({
            where: { id, isActive: true },
            select: { id: true }
        });
        if (byId?.id) return byId.id;
    }

    if (rawName || code) {
        const filters = [];
        if (code) {
            filters.push({ code: { equals: code, mode: 'insensitive' } });
        }
        if (rawName) {
            filters.push({ name: { equals: rawName, mode: 'insensitive' } });
        }

        if (filters.length > 0) {
            const byCodeOrName = await txOrClient.paymentMethod.findFirst({
                where: {
                    isActive: true,
                    OR: filters
                },
                select: { id: true }
            });
            if (byCodeOrName?.id) return byCodeOrName.id;
        }
    }

    const fallbackNumeric = parsePositiveInt(fallbackId);
    if (fallbackNumeric) {
        const fallbackMethod = await txOrClient.paymentMethod.findFirst({
            where: { id: fallbackNumeric, isActive: true },
            select: { id: true }
        });
        if (fallbackMethod?.id) return fallbackMethod.id;
    }

    const firstActive = await txOrClient.paymentMethod.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true }
    });

    return firstActive?.id || null;
};

const applyCustomerFinancialDelta = async (tx, {
    customerId,
    balanceDelta = 0,
    activityDate = null,
    paymentDate = null
} = {}) => {
    const parsedCustomerId = parsePositiveInt(customerId);
    if (!parsedCustomerId) return;

    const safeBalanceDelta = toNumber(balanceDelta, 0);
    const safeActivityDate = toValidDate(activityDate);
    const safePaymentDate = toValidDate(paymentDate);

    await tx.$executeRaw`
        UPDATE "Customer"
        SET
            "balance" = COALESCE("balance", 0) + ${safeBalanceDelta},
            "firstActivityDate" = CASE
                WHEN CAST(${safeActivityDate} AS TIMESTAMP) IS NULL THEN "firstActivityDate"
                WHEN "firstActivityDate" IS NULL OR "firstActivityDate" > CAST(${safeActivityDate} AS TIMESTAMP) THEN CAST(${safeActivityDate} AS TIMESTAMP)
                ELSE "firstActivityDate"
            END,
            "lastPaymentDate" = CASE
                WHEN CAST(${safePaymentDate} AS TIMESTAMP) IS NULL THEN "lastPaymentDate"
                WHEN "lastPaymentDate" IS NULL OR "lastPaymentDate" < CAST(${safePaymentDate} AS TIMESTAMP) THEN CAST(${safePaymentDate} AS TIMESTAMP)
                ELSE "lastPaymentDate"
            END,
            "financialsUpdatedAt" = NOW()
        WHERE "id" = ${parsedCustomerId}
    `;
};

const recalculateCustomerActivityDates = async (tx, customerId) => {
    const parsedCustomerId = parsePositiveInt(customerId);
    if (!parsedCustomerId) return null;

    const [saleAgg, paymentMaxAgg] = await Promise.all([
        tx.sale.aggregate({
            where: { customerId: parsedCustomerId },
            _min: { invoiceDate: true }
        }),
        // Max transaction date where type is PAYMENT (covers both payment orders and paid sales)
        tx.customerTransaction.aggregate({
            where: { customerId: parsedCustomerId, type: 'PAYMENT' },
            _max: { date: true }
        })
    ]);

    const firstActivityDate = saleAgg?._min?.invoiceDate || null;
    const lastPaymentDate = paymentMaxAgg?._max?.date || null;

    await tx.customer.update({
        where: { id: parsedCustomerId },
        data: {
            firstActivityDate,
            lastPaymentDate,
            financialsUpdatedAt: new Date()
        }
    });

    return { firstActivityDate, lastPaymentDate };
};

const calculateCustomerFinancialSummaries = async (txOrClient, customerIds = []) => {

    const ids = [...new Set(
        customerIds
            .map((id) => parseInt(id, 10))
            .filter((id) => Number.isFinite(id) && id > 0),
    )];

    if (ids.length === 0) return new Map();

    const [balances, saleStats, paymentStats] = await Promise.all([
        txOrClient.customerTransaction.groupBy({
            by: ['customerId'],
            _sum: {
                debit: true,
                credit: true
            },
            where: {
                customerId: { in: ids }
            }
        }),
        txOrClient.sale.groupBy({
            by: ['customerId'],
            _min: { invoiceDate: true },
            where: { customerId: { in: ids } }
        }),
        // Max transaction date where type is PAYMENT
        txOrClient.customerTransaction.groupBy({
            by: ['customerId'],
            _max: { date: true },
            where: { customerId: { in: ids }, type: 'PAYMENT' }
        })
    ]);

    const balanceMap = new Map();
    balances.forEach((entry) => {
        balanceMap.set(
            entry.customerId,
            (entry._sum.debit || 0) - (entry._sum.credit || 0),
        );
    });

    const saleMap = new Map();
    saleStats.forEach((entry) => {
        saleMap.set(entry.customerId, entry._min.invoiceDate || null);
    });

    const paymentMap = new Map();
    paymentStats.forEach((entry) => {
        paymentMap.set(entry.customerId, entry._max.date || null);
    });

    const financialsUpdatedAt = new Date();
    const updates = ids.map((customerId) => {
        const firstActivityDate = saleMap.get(customerId) || null;
        const lastPaymentDate = paymentMap.get(customerId) || null;

        return {
            customerId,
            balance: balanceMap.get(customerId) || 0,
            firstActivityDate,
            lastPaymentDate,
            financialsUpdatedAt
        };
    });

    const summaryMap = new Map();
    updates.forEach((summary) => {
        summaryMap.set(summary.customerId, summary);
    });
    return summaryMap;
};

const persistCustomerFinancialSummaries = async (txOrClient, summaryMap) => {
    const updates = [...summaryMap.values()];
    if (updates.length === 0) return 0;

    const updateBatchSize = 50;
    for (let i = 0; i < updates.length; i += updateBatchSize) {
        const batch = updates.slice(i, i + updateBatchSize);
        await Promise.all(
            batch.map((summary) => txOrClient.customer.update({
                where: { id: summary.customerId },
                data: {
                    balance: summary.balance,
                    firstActivityDate: summary.firstActivityDate,
                    lastPaymentDate: summary.lastPaymentDate,
                    financialsUpdatedAt: summary.financialsUpdatedAt
                }
            })),
        );
    }

    return updates.length;
};

const rebuildCustomerFinancialSummary = async (txOrClient, customerId) => {
    const summaryMap = await calculateCustomerFinancialSummaries(txOrClient, [customerId]);
    await persistCustomerFinancialSummaries(txOrClient, summaryMap);
    return summaryMap.get(parseInt(customerId, 10)) || null;
};

const TREASURY_DEFAULT_CODE = 'MAIN';
const TREASURY_DIRECTION = Object.freeze({
    IN: 'IN',
    OUT: 'OUT'
});
const TREASURY_ENTRY_TYPE = Object.freeze({
    OPENING_BALANCE: 'OPENING_BALANCE',
    SALE_INCOME: 'SALE_INCOME',
    CUSTOMER_PAYMENT: 'CUSTOMER_PAYMENT',
    DEPOSIT_IN: 'DEPOSIT_IN',
    DEPOSIT_REFUND: 'DEPOSIT_REFUND',
    MANUAL_IN: 'MANUAL_IN',
    EXPENSE_PAYMENT: 'EXPENSE_PAYMENT',
    PURCHASE_PAYMENT: 'PURCHASE_PAYMENT',
    SUPPLIER_PAYMENT: 'SUPPLIER_PAYMENT',
    RETURN_REFUND: 'RETURN_REFUND',
    MANUAL_OUT: 'MANUAL_OUT',
    TRANSFER_IN: 'TRANSFER_IN',
    TRANSFER_OUT: 'TRANSFER_OUT',
    ADJUSTMENT_IN: 'ADJUSTMENT_IN',
    ADJUSTMENT_OUT: 'ADJUSTMENT_OUT'
});
const TREASURY_ENTRY_TYPE_SET = new Set(Object.values(TREASURY_ENTRY_TYPE));
const TREASURY_REVENUE_ENTRY_TYPES = new Set([
    TREASURY_ENTRY_TYPE.SALE_INCOME,
    TREASURY_ENTRY_TYPE.CUSTOMER_PAYMENT,
    TREASURY_ENTRY_TYPE.DEPOSIT_IN,
    TREASURY_ENTRY_TYPE.DEPOSIT_REFUND
]);
const TREASURY_CASH_ENTRY_TYPES = new Set(Object.values(TREASURY_ENTRY_TYPE));
const PAYMENT_ALLOCATION_SOURCE_TYPE = Object.freeze({
    CUSTOMER_PAYMENT: 'CUSTOMER_PAYMENT',
    DEPOSIT: 'DEPOSIT'
});
const REFUND_MODE = Object.freeze({
    SAME_METHOD: 'SAME_METHOD',
    CASH_ONLY: 'CASH_ONLY'
});
const AUDIT_ACTION = Object.freeze({
    LOGIN_SUCCESS: 'LOGIN_SUCCESS',
    LOGOUT: 'LOGOUT',
    PRODUCT_CREATE: 'PRODUCT_CREATE',
    PRODUCT_UPDATE: 'PRODUCT_UPDATE',
    PRODUCT_DELETE: 'PRODUCT_DELETE',
    SALE_CREATE: 'SALE_CREATE',
    SALE_UPDATE: 'SALE_UPDATE',
    SALE_DELETE: 'SALE_DELETE',
    CUSTOMER_CREATE: 'CUSTOMER_CREATE',
    CUSTOMER_UPDATE: 'CUSTOMER_UPDATE',
    CUSTOMER_DELETE: 'CUSTOMER_DELETE',
    CATEGORY_CREATE: 'CATEGORY_CREATE',
    CATEGORY_UPDATE: 'CATEGORY_UPDATE',
    CATEGORY_DELETE: 'CATEGORY_DELETE',
    WAREHOUSE_CREATE: 'WAREHOUSE_CREATE',
    WAREHOUSE_UPDATE: 'WAREHOUSE_UPDATE',
    WAREHOUSE_DELETE: 'WAREHOUSE_DELETE',
    VARIANT_CREATE: 'VARIANT_CREATE',
    VARIANT_UPDATE: 'VARIANT_UPDATE',
    VARIANT_DELETE: 'VARIANT_DELETE',
    PURCHASE_CREATE: 'PURCHASE_CREATE',
    PURCHASE_UPDATE: 'PURCHASE_UPDATE',
    PURCHASE_DELETE: 'PURCHASE_DELETE',
    SALES_RETURN_CREATE: 'SALES_RETURN_CREATE',
    SALES_RETURN_UPDATE: 'SALES_RETURN_UPDATE',
    SALES_RETURN_DELETE: 'SALES_RETURN_DELETE',
    PURCHASE_RETURN_CREATE: 'PURCHASE_RETURN_CREATE',
    PURCHASE_RETURN_UPDATE: 'PURCHASE_RETURN_UPDATE',
    PURCHASE_RETURN_DELETE: 'PURCHASE_RETURN_DELETE',
    CUSTOMER_PAYMENT_CREATE: 'CUSTOMER_PAYMENT_CREATE',
    CUSTOMER_PAYMENT_UPDATE: 'CUSTOMER_PAYMENT_UPDATE',
    CUSTOMER_PAYMENT_DELETE: 'CUSTOMER_PAYMENT_DELETE',
    SUPPLIER_CREATE: 'SUPPLIER_CREATE',
    SUPPLIER_UPDATE: 'SUPPLIER_UPDATE',
    SUPPLIER_DELETE: 'SUPPLIER_DELETE',
    SUPPLIER_PAYMENT_CREATE: 'SUPPLIER_PAYMENT_CREATE',
    EXPENSE_CREATE: 'EXPENSE_CREATE',
    EXPENSE_UPDATE: 'EXPENSE_UPDATE',
    EXPENSE_DELETE: 'EXPENSE_DELETE',
    EXPENSE_CATEGORY_CREATE: 'EXPENSE_CATEGORY_CREATE',
    EXPENSE_CATEGORY_UPDATE: 'EXPENSE_CATEGORY_UPDATE',
    EXPENSE_CATEGORY_DELETE: 'EXPENSE_CATEGORY_DELETE',
    INVENTORY_UPDATE: 'INVENTORY_UPDATE',
    WAREHOUSE_STOCK_UPDATE: 'WAREHOUSE_STOCK_UPDATE',
    WAREHOUSE_STOCK_BULK_UPDATE: 'WAREHOUSE_STOCK_BULK_UPDATE',
    VARIANT_WAREHOUSE_STOCK_UPDATE: 'VARIANT_WAREHOUSE_STOCK_UPDATE',
    INVENTORY_RECONCILE: 'INVENTORY_RECONCILE',
    WAREHOUSE_TRANSFER_CREATE: 'WAREHOUSE_TRANSFER_CREATE',
    USER_CREATE: 'USER_CREATE',
    USER_UPDATE: 'USER_UPDATE',
    USER_DELETE: 'USER_DELETE',
    TREASURY_CREATE: 'TREASURY_CREATE',
    TREASURY_UPDATE: 'TREASURY_UPDATE',
    TREASURY_DELETE: 'TREASURY_DELETE',
    TREASURY_DEFAULT_SET: 'TREASURY_DEFAULT_SET',
    TREASURY_TRANSACTION_CREATE: 'TREASURY_TRANSACTION_CREATE',
    TREASURY_ENTRY_CREATE: 'TREASURY_ENTRY_CREATE',
    TREASURY_ENTRY_ROLLBACK: 'TREASURY_ENTRY_ROLLBACK',
    DEPOSIT_RECEIPT_CREATE: 'DEPOSIT_RECEIPT_CREATE',
    DEPOSIT_APPLY_TO_SALE: 'DEPOSIT_APPLY_TO_SALE',
    DEPOSIT_REFUND: 'DEPOSIT_REFUND',
    PAYMENT_ALLOCATION_CREATE: 'PAYMENT_ALLOCATION_CREATE'
});

const getCurrentSessionUserId = () => parsePositiveInt(currentSessionUser?.id);

const getActorUserId = (...values) => {
    for (const value of values) {
        const parsed = parsePositiveInt(value);
        if (parsed) return parsed;
    }
    return getCurrentSessionUserId();
};

const sanitizeAuditMeta = (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (Array.isArray(value)) {
        return value.map((item) => sanitizeAuditMeta(item));
    }
    if (typeof value === 'object') {
        const next = {};
        Object.entries(value).forEach(([key, entryValue]) => {
            if (/password|token|secret/i.test(key)) return;
            next[key] = sanitizeAuditMeta(entryValue);
        });
        return next;
    }
    return value;
};

const normalizeReportPaymentCode = (value) => String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

const resolveReportPaymentMethodCode = (paymentMethod = null) => {
    const lookup = normalizePaymentMethodLookup(
        paymentMethod?.code || paymentMethod?.name || null
    );
    const directCode = normalizeReportPaymentCode(paymentMethod?.code || paymentMethod?.name || '');
    const resolvedCode = normalizeReportPaymentCode(lookup?.code || directCode || 'UNSPECIFIED');
    return resolvedCode || 'UNSPECIFIED';
};

const resolveRevenueChannelFromCode = (code) => {
    const normalizedCode = normalizeReportPaymentCode(code);
    if (normalizedCode === 'CASH') return 'cash';
    if (normalizedCode === 'VODAFONE_CASH') return 'vodafoneCash';
    if (normalizedCode === 'INSTAPAY') return 'instaPay';
    return 'other';
};

const normalizeTreasuryCode = (value) => {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return null;

    const normalized = raw
        .replace(/[\s-]+/g, '_')
        .replace(/[^\p{L}\p{N}_]/gu, '')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');

    return normalized || null;
};

const generateTreasuryCode = () => {
    const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`;
    return `TRS_${suffix.toUpperCase()}`;
};

const parseDateOrDefault = (value, fallback = new Date()) => {
    if (!value) return fallback;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const parsedDate = new Date(`${value}T00:00:00`);
        return Number.isFinite(parsedDate.getTime()) ? parsedDate : fallback;
    }
    const parsedDate = toValidDate(value);
    return parsedDate || fallback;
};

const isDateOnlyString = (value) => (
    typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
);

const isSameCalendarDate = (a, b) => {
    const dateA = toValidDate(a);
    const dateB = toValidDate(b);
    if (!dateA || !dateB) return false;
    return dateA.getFullYear() === dateB.getFullYear()
        && dateA.getMonth() === dateB.getMonth()
        && dateA.getDate() === dateB.getDate();
};

const mergeDateWithTime = (dateValue, timeSourceValue) => {
    const datePart = toValidDate(dateValue);
    const timePart = toValidDate(timeSourceValue);
    if (!datePart) return timePart || null;
    if (!timePart) return datePart;

    const merged = new Date(datePart);
    merged.setHours(
        timePart.getHours(),
        timePart.getMinutes(),
        timePart.getSeconds(),
        timePart.getMilliseconds()
    );
    return merged;
};

const resolveEditedDateKeepingPosition = (incomingValue, existingValue, fallback = new Date()) => {
    const existingDate = toValidDate(existingValue) || toValidDate(fallback) || new Date();

    if (incomingValue === undefined || incomingValue === null || incomingValue === '') {
        return new Date(existingDate);
    }

    if (isDateOnlyString(incomingValue)) {
        const parsedDateOnly = parseDateOrDefault(incomingValue, existingDate);
        if (!parsedDateOnly) return new Date(existingDate);
        if (isSameCalendarDate(parsedDateOnly, existingDate)) {
            return new Date(existingDate);
        }
        return mergeDateWithTime(parsedDateOnly, existingDate) || parsedDateOnly;
    }

    const parsedDateTime = toValidDate(incomingValue);
    if (!parsedDateTime) {
        return new Date(existingDate);
    }

    if (isSameCalendarDate(parsedDateTime, existingDate)) {
        return new Date(existingDate);
    }

    return parsedDateTime;
};

const startOfDay = (value) => {
    const date = parseDateOrDefault(value);
    date.setHours(0, 0, 0, 0);
    return date;
};

const endOfDay = (value) => {
    const date = parseDateOrDefault(value);
    date.setHours(23, 59, 59, 999);
    return date;
};

const setDefaultTreasuryInternal = async (txOrClient, treasuryId, { forceActivate = true } = {}) => {
    const parsedTreasuryId = parsePositiveInt(treasuryId);
    if (!parsedTreasuryId) {
        return { error: 'Invalid treasuryId' };
    }

    const existing = await txOrClient.treasury.findUnique({
        where: { id: parsedTreasuryId },
        select: {
            id: true,
            isActive: true,
            isDeleted: true
        }
    });
    if (!existing) {
        return { error: 'Treasury not found' };
    }
    if (existing.isDeleted) {
        return { error: 'Cannot set deleted treasury as default' };
    }

    await txOrClient.treasury.updateMany({
        where: {
            isDefault: true,
            isDeleted: false,
            id: { not: parsedTreasuryId }
        },
        data: { isDefault: false },
    });

    const updateData = { isDefault: true };
    if (forceActivate) updateData.isActive = true;

    const treasury = await txOrClient.treasury.update({
        where: { id: parsedTreasuryId },
        data: updateData
    });

    return { success: true, treasury };
};

const pickDefaultTreasuryCandidate = async (txOrClient, { allowInactive = false } = {}) => {
    const explicitDefault = await txOrClient.treasury.findFirst({
        where: { isDefault: true, isDeleted: false },
        orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, isActive: true }
    });
    if (explicitDefault?.id) return explicitDefault;

    const mainCodeDefault = await txOrClient.treasury.findFirst({
        where: { code: TREASURY_DEFAULT_CODE, isDeleted: false },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, isActive: true }
    });
    if (mainCodeDefault?.id) return mainCodeDefault;

    const activeTreasury = await txOrClient.treasury.findFirst({
        where: { isActive: true, isDeleted: false },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, isActive: true }
    });
    if (activeTreasury?.id) return activeTreasury;

    if (allowInactive) {
        const anyTreasury = await txOrClient.treasury.findFirst({
            where: { isDeleted: false },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { id: true, isActive: true }
        });
        return anyTreasury || null;
    }

    const inactiveTreasury = await txOrClient.treasury.findFirst({
        where: { isDeleted: false },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, isActive: true }
    });
    return inactiveTreasury || null;
};

const getOrCreateDefaultTreasury = async (txOrClient, { allowInactive = false } = {}) => {
    let candidate = await pickDefaultTreasuryCandidate(txOrClient, { allowInactive });
    if (!candidate) {
        candidate = await txOrClient.treasury.create({
            data: {
                name: 'Main Treasury',
                code: TREASURY_DEFAULT_CODE,
                description: 'Auto-created default treasury',
                openingBalance: 0,
                currentBalance: 0,
                isActive: true,
                isDefault: false,
                isDeleted: false
            },
            select: { id: true, isActive: true }
        });
    }

    const defaultResult = await setDefaultTreasuryInternal(txOrClient, candidate.id, {
        forceActivate: !allowInactive
    });
    if (defaultResult?.error) {
        throw new Error(defaultResult.error);
    }
    return defaultResult.treasury;
};

const resolveTreasuryId = async (txOrClient, rawTreasuryId = null, { allowInactive = false } = {}) => {
    const parsedTreasuryId = parsePositiveInt(rawTreasuryId);
    if (parsedTreasuryId) {
        const treasury = await txOrClient.treasury.findFirst({
            where: {
                id: parsedTreasuryId,
                isDeleted: false,
                ...(allowInactive ? {} : { isActive: true })
            },
            select: { id: true }
        });
        if (treasury?.id) return treasury.id;
    }

    const fallbackTreasury = await getOrCreateDefaultTreasury(txOrClient, { allowInactive: false });
    return fallbackTreasury.id;
};

const getTreasuryOperationLinkStats = async (txOrClient, treasuryId) => {
    const parsedTreasuryId = parsePositiveInt(treasuryId);
    if (!parsedTreasuryId) {
        return {
            nonOpeningEntryCount: 0,
            hasLinkedOperations: false
        };
    }

    const nonOpeningEntryCount = await txOrClient.treasuryEntry.count({
        where: {
            treasuryId: parsedTreasuryId,
            entryType: { not: TREASURY_ENTRY_TYPE.OPENING_BALANCE }
        }
    });

    return {
        nonOpeningEntryCount,
        hasLinkedOperations: nonOpeningEntryCount > 0
    };
};

const normalizeIdempotencyKey = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    return raw.slice(0, 191);
};

const hashToSignedInt = (value) => {
    const digest = crypto
        .createHash('sha256')
        .update(String(value || ''))
        .digest('hex')
        .slice(0, 8);
    let parsed = Number.parseInt(digest, 16);
    if (!Number.isFinite(parsed)) parsed = 0;
    if (parsed > 0x7fffffff) parsed -= 0x100000000;
    return parsed;
};

const generateIdempotencyKey = (prefix, parts = []) => {
    const normalizedPrefix = String(prefix || 'GEN').trim().toUpperCase();
    const serializedParts = Array.isArray(parts) ? parts : [parts];
    const payload = serializedParts
        .map((part) => (part === null || part === undefined ? '' : String(part).trim()))
        .join('|');
    const hash = crypto.createHash('sha256').update(`${normalizedPrefix}|${payload}`).digest('hex');
    return normalizeIdempotencyKey(`${normalizedPrefix}:${hash}`);
};

const acquireIdempotencyLock = async (tx, idempotencyKey) => {
    const normalized = normalizeIdempotencyKey(idempotencyKey);
    if (!normalized) return null;
    const advisoryKey = hashToSignedInt(normalized);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${advisoryKey})`;
    return normalized;
};

const toDayLockDate = (value) => startOfDay(value);

const writeAuditLog = async (txOrClient, payload = {}) => {
    try {
        await txOrClient.auditLog.create({
            data: {
                action: String(payload?.action || 'UNKNOWN'),
                entityType: String(payload?.entityType || 'UNKNOWN'),
                entityId: payload?.entityId !== undefined && payload?.entityId !== null
                    ? String(payload.entityId)
                    : null,
                treasury: payload?.treasuryId ? {
                    connect: { id: parsePositiveInt(payload.treasuryId) }
                } : undefined,
                treasuryEntry: payload?.treasuryEntryId ? {
                    connect: { id: parsePositiveInt(payload.treasuryEntryId) }
                } : undefined,
                performedBy: getActorUserId(payload?.performedByUserId) ? {
                    connect: { id: getActorUserId(payload.performedByUserId) }
                } : undefined,
                referenceType: payload?.referenceType ? String(payload.referenceType) : null,
                referenceId: parsePositiveInt(payload?.referenceId),
                note: payload?.note ? String(payload.note) : null,
                meta: sanitizeAuditMeta(payload?.meta) ?? null
            }
        });
    } catch (error) {
        // Keep business flow non-blocking if audit insert fails.
        console.warn('Audit log write failed:', error?.message || error);
    }
};

const writeEntityAuditLog = async (txOrClient, {
    action,
    entityType,
    entityId,
    note,
    referenceType = null,
    referenceId = null,
    performedByUserId = undefined,
    before = undefined,
    after = undefined,
    meta = undefined
} = {}) => writeAuditLog(txOrClient, {
    action,
    entityType,
    entityId,
    referenceType,
    referenceId,
    performedByUserId,
    note,
    meta: {
        ...(before !== undefined ? { before: sanitizeAuditMeta(before) } : {}),
        ...(after !== undefined ? { after: sanitizeAuditMeta(after) } : {}),
        ...(meta !== undefined ? sanitizeAuditMeta(meta) : {})
    }
});

const resolveCashPaymentMethodId = async (txOrClient, fallbackId = 1) => {
    const cashMethod = await txOrClient.paymentMethod.findFirst({
        where: {
            isActive: true,
            OR: [
                { code: { equals: 'CASH', mode: 'insensitive' } },
                { name: { equals: 'cash', mode: 'insensitive' } },
                { name: { equals: 'نقدي', mode: 'insensitive' } }
            ]
        },
        select: { id: true }
    });
    if (cashMethod?.id) return cashMethod.id;
    return resolvePaymentMethodId(txOrClient, 'CASH', fallbackId);
};

const lockTreasuryForUpdate = async (tx, treasuryId) => {
    const parsedTreasuryId = parsePositiveInt(treasuryId);
    if (!parsedTreasuryId) return null;
    const rows = await tx.$queryRaw`
        SELECT "id", "currentBalance", "isActive"
        FROM "Treasury"
        WHERE "id" = ${parsedTreasuryId}
        FOR UPDATE
    `;
    return rows?.[0] || null;
};

const normalizeAmountForKey = (value) => Number(Math.max(0, toNumber(value, 0)).toFixed(2)).toFixed(2);

const normalizeSplitPaymentsInput = (rows = []) => (
    Array.isArray(rows)
        ? rows
            .map((row, index) => ({
                index,
                rawPaymentMethodId: row?.paymentMethodId ?? row?.methodId ?? row?.paymentMethod,
                amount: Math.max(0, toNumber(row?.amount)),
                note: row?.note ? String(row.note) : null
            }))
            .filter((row) => row.amount > 0)
        : []
);

const resolvePaymentSplits = async (
    tx,
    {
        splitPayments = [],
        fallbackPaymentMethodId = 1,
        totalAmount = 0
    } = {},
) => {
    const safeTotalAmount = Math.max(0, toNumber(totalAmount));
    if (safeTotalAmount <= 0) return [];

    const normalizedSplits = normalizeSplitPaymentsInput(splitPayments);
    if (normalizedSplits.length === 0) {
        const resolvedMethod = await resolvePaymentMethodId(tx, fallbackPaymentMethodId, 1);
        return [{
            index: 0,
            paymentMethodId: resolvedMethod,
            amount: safeTotalAmount,
            note: null
        }];
    }

    const resolvedSplits = [];
    for (const split of normalizedSplits) {
        const paymentMethodId = await resolvePaymentMethodId(tx, split.rawPaymentMethodId, fallbackPaymentMethodId || 1);
        if (!paymentMethodId) {
            return { error: 'Invalid payment method in split payments' };
        }
        resolvedSplits.push({
            index: split.index,
            paymentMethodId,
            amount: split.amount,
            note: split.note
        });
    }

    const splitTotal = resolvedSplits.reduce((sum, row) => sum + row.amount, 0);
    const roundedSplitTotal = Number(splitTotal.toFixed(2));
    const roundedTargetTotal = Number(safeTotalAmount.toFixed(2));
    if (Math.abs(roundedSplitTotal - roundedTargetTotal) > 0.01) {
        return { error: 'Split payment total does not match paid amount' };
    }

    return resolvedSplits;
};

const buildPurchasePaymentPresentationMap = async (txOrClient, purchaseIds = []) => {
    const uniquePurchaseIds = [...new Set(
        (Array.isArray(purchaseIds) ? purchaseIds : [])
            .map((id) => parsePositiveInt(id))
            .filter(Boolean)
    )];

    if (uniquePurchaseIds.length === 0) return new Map();

    const treasuryEntries = await txOrClient.treasuryEntry.findMany({
        where: {
            referenceType: 'PURCHASE',
            referenceId: { in: uniquePurchaseIds },
            entryType: TREASURY_ENTRY_TYPE.PURCHASE_PAYMENT
        },
        select: {
            referenceId: true,
            paymentMethod: {
                select: {
                    id: true,
                    name: true,
                    code: true
                }
            }
        },
        orderBy: [
            { referenceId: 'asc' },
            { id: 'asc' }
        ]
    });

    const groupedByPurchaseId = new Map();
    for (const entry of treasuryEntries) {
        const purchaseId = parsePositiveInt(entry?.referenceId);
        if (!purchaseId) continue;
        if (!groupedByPurchaseId.has(purchaseId)) {
            groupedByPurchaseId.set(purchaseId, []);
        }
        groupedByPurchaseId.get(purchaseId).push(entry);
    }

    const presentationMap = new Map();
    for (const purchaseId of uniquePurchaseIds) {
        const entries = groupedByPurchaseId.get(purchaseId) || [];
        let primaryMethod = null;
        const methodNames = [];
        const seenMethodIds = new Set();

        for (const entry of entries) {
            const method = entry?.paymentMethod;
            const methodId = parsePositiveInt(method?.id);
            if (!methodId) continue;

            if (!primaryMethod) {
                primaryMethod = {
                    id: methodId,
                    name: method?.name || null,
                    code: method?.code || null
                };
            }

            if (seenMethodIds.has(methodId)) continue;
            seenMethodIds.add(methodId);

            const methodLabel = String(method?.name || method?.code || '').trim();
            if (methodLabel) {
                methodNames.push(methodLabel);
            }
        }

        const payment = methodNames.length > 0
            ? methodNames.join(' + ')
            : null;

        presentationMap.set(purchaseId, {
            payment,
            paymentMethod: primaryMethod,
            paymentMethodCode: primaryMethod?.code || null
        });
    }

    return presentationMap;
};

const getSaleOutstandingRowsForAllocation = async (
    txOrClient,
    customerId,
    { customerBalanceOverride = null } = {},
) => {
    const parsedCustomerId = parsePositiveInt(customerId);
    if (!parsedCustomerId) return [];

    const sales = await txOrClient.sale.findMany({
        where: { customerId: parsedCustomerId },
        select: {
            id: true,
            invoiceDate: true,
            createdAt: true
        },
        orderBy: [
            { invoiceDate: 'asc' },
            { id: 'asc' }
        ]
    });

    if (sales.length === 0) return [];
    const saleIds = sales.map((sale) => sale.id);

    const [saleTransactions, allocationsAgg, customer] = await Promise.all([
        txOrClient.customerTransaction.groupBy({
            by: ['referenceId'],
            where: {
                customerId: parsedCustomerId,
                referenceType: 'SALE',
                referenceId: { in: saleIds }
            },
            _sum: {
                debit: true,
                credit: true
            }
        }),
        txOrClient.paymentAllocation.groupBy({
            by: ['saleId'],
            where: { saleId: { in: saleIds } },
            _sum: { amount: true }
        }),
        txOrClient.customer.findUnique({
            where: { id: parsedCustomerId },
            select: { balance: true }
        })
    ]);

    const outstandingBySaleId = new Map();
    saleTransactions.forEach((row) => {
        const saleId = parsePositiveInt(row.referenceId);
        if (!saleId) return;
        const outstanding = Math.max(0, toNumber(row?._sum?.debit) - toNumber(row?._sum?.credit));
        outstandingBySaleId.set(saleId, outstanding);
    });

    const allocationBySaleId = new Map();
    allocationsAgg.forEach((row) => {
        const saleId = parsePositiveInt(row.saleId);
        if (!saleId) return;
        allocationBySaleId.set(saleId, Math.max(0, toNumber(row?._sum?.amount)));
    });

    const rows = sales
        .map((sale) => {
            const baseOutstanding = Math.max(0, toNumber(outstandingBySaleId.get(sale.id)));
            const allocated = Math.max(0, toNumber(allocationBySaleId.get(sale.id)));
            const outstanding = Math.max(0, Number((baseOutstanding - allocated).toFixed(2)));
            return {
                saleId: sale.id,
                invoiceDate: sale.invoiceDate || sale.createdAt || new Date(),
                outstanding
            };
        })
        .filter((row) => row.outstanding > 0)
        .sort((a, b) => (
            a.invoiceDate.getTime() - b.invoiceDate.getTime() || a.saleId - b.saleId
        ));

    const referenceBalance = Math.max(
        0,
        toNumber(customerBalanceOverride, toNumber(customer?.balance, 0))
    );
    const rawOutstandingTotal = rows.reduce((sum, row) => sum + row.outstanding, 0);
    let settledWithoutAllocation = Math.max(0, Number((rawOutstandingTotal - referenceBalance).toFixed(2)));
    if (settledWithoutAllocation > 0) {
        for (const row of rows) {
            if (settledWithoutAllocation <= 0) break;
            const reduction = Math.min(row.outstanding, settledWithoutAllocation);
            row.outstanding = Number((row.outstanding - reduction).toFixed(2));
            settledWithoutAllocation = Number((settledWithoutAllocation - reduction).toFixed(2));
        }
    }

    return rows.filter((row) => row.outstanding > 0);
};

const applyAllocationsFromOutstandingRows = async (
    tx,
    {
        outstandingRows = [],
        sourceType,
        amount,
        customerId = null,
        customerPaymentId = null,
        treasuryEntryId = null,
        createdByUserId = null,
        note = null,
        allocationDate = new Date()
    } = {},
) => {
    let remaining = Math.max(0, toNumber(amount));
    if (remaining <= 0) return [];

    const allocations = [];
    for (const row of outstandingRows) {
        if (remaining <= 0) break;
        const outstanding = Math.max(0, toNumber(row?.outstanding));
        if (outstanding <= 0) continue;

        const allocated = Number(Math.min(remaining, outstanding).toFixed(2));
        if (allocated <= 0) continue;

        const createdAllocation = await tx.paymentAllocation.create({
            data: {
                customerId: parsePositiveInt(customerId),
                saleId: row.saleId,
                sourceType,
                customerPaymentId: parsePositiveInt(customerPaymentId),
                treasuryEntryId: parsePositiveInt(treasuryEntryId),
                amount: allocated,
                allocationDate: parseDateOrDefault(allocationDate, new Date()),
                createdByUserId: getActorUserId(createdByUserId),
                note: note || null
            }
        });

        row.outstanding = Number((outstanding - allocated).toFixed(2));
        remaining = Number((remaining - allocated).toFixed(2));
        allocations.push(createdAllocation);
    }

    return allocations;
};

const createTreasuryEntry = async (tx, {
    treasuryId = null,
    entryType = TREASURY_ENTRY_TYPE.MANUAL_IN,
    direction = TREASURY_DIRECTION.IN,
    amount = 0,
    notes = null,
    note = null,
    referenceType = null,
    referenceId = null,
    paymentMethodId = null,
    sourceTreasuryId = null,
    targetTreasuryId = null,
    entryDate = null,
    allowNegative = false,
    idempotencyKey = null,
    createdByUserId = undefined,
    meta = null
} = {}) => {
    const safeDirection = direction === TREASURY_DIRECTION.OUT
        ? TREASURY_DIRECTION.OUT
        : TREASURY_DIRECTION.IN;
    const safeAmount = Math.max(0, toNumber(amount));
    if (safeAmount <= 0) {
        return { error: 'Invalid treasury amount' };
    }

    const safeEntryDate = parseDateOrDefault(entryDate);
    const safeIdempotencyKey = normalizeIdempotencyKey(idempotencyKey);
    const includeRelations = {
        treasury: true,
        paymentMethod: true,
        sourceTreasury: true,
        targetTreasury: true
    };

    if (safeIdempotencyKey) {
        await acquireIdempotencyLock(tx, safeIdempotencyKey);
        const existingEntry = await tx.treasuryEntry.findUnique({
            where: { idempotencyKey: safeIdempotencyKey },
            include: includeRelations
        });
        if (existingEntry) {
            return { success: true, entry: existingEntry, idempotent: true };
        }
    }

    const resolvedTreasuryId = await resolveTreasuryId(tx, treasuryId);

    const treasury = await lockTreasuryForUpdate(tx, resolvedTreasuryId);
    if (!treasury) {
        return { error: 'Treasury not found' };
    }
    if (!treasury?.isActive) {
        return { error: 'Treasury is inactive' };
    }

    const balanceBefore = toNumber(treasury.currentBalance, 0);
    const delta = safeDirection === TREASURY_DIRECTION.IN ? safeAmount : -safeAmount;
    const balanceAfter = Number((balanceBefore + delta).toFixed(2));

    if (!allowNegative && safeDirection === TREASURY_DIRECTION.OUT && balanceAfter < -0.0001) {
        return { error: 'Insufficient treasury balance' };
    }

    await tx.treasury.update({
        where: { id: resolvedTreasuryId },
        data: { currentBalance: balanceAfter }
    });

    let entry;
    try {
        entry = await tx.treasuryEntry.create({
            data: {
                treasuryId: resolvedTreasuryId,
                entryType,
                direction: safeDirection,
                amount: safeAmount,
                balanceBefore,
                balanceAfter,
                notes: notes || note || null,
                note: note || notes || null,
                referenceType: referenceType || null,
                referenceId: parsePositiveInt(referenceId),
                paymentMethodId: parsePositiveInt(paymentMethodId),
                idempotencyKey: safeIdempotencyKey,
                createdByUserId: getActorUserId(createdByUserId),
                meta: meta ?? null,
                sourceTreasuryId: parsePositiveInt(sourceTreasuryId),
                targetTreasuryId: parsePositiveInt(targetTreasuryId),
                entryDate: safeEntryDate
            },
            include: includeRelations
        });
    } catch (error) {
        const duplicateByIdempotency = (
            safeIdempotencyKey &&
            error?.code === 'P2002'
        );
        if (duplicateByIdempotency) {
            const existingEntry = await tx.treasuryEntry.findUnique({
                where: { idempotencyKey: safeIdempotencyKey },
                include: includeRelations
            });
            if (existingEntry) {
                return { success: true, entry: existingEntry, idempotent: true };
            }
        }
        throw error;
    }

    await writeAuditLog(tx, {
        action: AUDIT_ACTION.TREASURY_ENTRY_CREATE,
        entityType: 'TreasuryEntry',
        entityId: entry.id,
        treasuryId: entry.treasuryId,
        treasuryEntryId: entry.id,
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        performedByUserId: parsePositiveInt(createdByUserId),
        note: entry.note || entry.notes || null,
        meta: {
            entryType: entry.entryType,
            direction: entry.direction,
            amount: entry.amount,
            idempotencyKey: entry.idempotencyKey || null
        }
    });

    return { success: true, entry };
};

const rollbackTreasuryEntriesByReference = async (tx, referenceType, referenceId) => {
    const parsedReferenceId = parsePositiveInt(referenceId);
    if (!referenceType || !parsedReferenceId) {
        return { count: 0 };
    }

    const entries = await tx.treasuryEntry.findMany({
        where: {
            referenceType: String(referenceType),
            referenceId: parsedReferenceId
        },
        select: {
            id: true,
            treasuryId: true,
            direction: true,
            amount: true,
            entryDate: true,
            createdAt: true
        }
    });

    if (entries.length === 0) {
        return { count: 0 };
    }

    const balanceDeltaByTreasury = new Map();
    entries.forEach((entry) => {
        const rollbackDelta = entry.direction === TREASURY_DIRECTION.IN
            ? -Math.max(0, toNumber(entry.amount))
            : Math.max(0, toNumber(entry.amount));
        const previous = balanceDeltaByTreasury.get(entry.treasuryId) || 0;
        balanceDeltaByTreasury.set(entry.treasuryId, Number((previous + rollbackDelta).toFixed(2)));
    });

    for (const treasuryId of balanceDeltaByTreasury.keys()) {
        await lockTreasuryForUpdate(tx, treasuryId);
    }

    for (const [treasuryId, delta] of balanceDeltaByTreasury.entries()) {
        await tx.treasury.update({
            where: { id: treasuryId },
            data: {
                currentBalance: {
                    increment: delta
                }
            }
        });
    }

    const entryIds = entries.map((entry) => entry.id);
    if (String(referenceType).toUpperCase() === 'PAYMENT') {
        await tx.paymentAllocation.deleteMany({
            where: { customerPaymentId: parsedReferenceId }
        });
    }
    await tx.paymentAllocation.deleteMany({
        where: { treasuryEntryId: { in: entryIds } }
    });

    await tx.treasuryEntry.deleteMany({
        where: {
            id: {
                in: entryIds
            }
        }
    });

    await writeAuditLog(tx, {
        action: AUDIT_ACTION.TREASURY_ENTRY_ROLLBACK,
        entityType: 'TreasuryEntry',
        referenceType: String(referenceType),
        referenceId: parsedReferenceId,
        note: `Rollback by reference ${referenceType}#${parsedReferenceId}`,
        meta: {
            count: entries.length,
            treasuryIds: [...new Set(entries.map((entry) => entry.treasuryId))]
        }
    });

    return { count: entries.length };
};

const throwIfResultError = (result, fallbackMessage = 'Operation failed') => {
    if (result?.error) {
        throw new Error(result.error || fallbackMessage);
    }
    return result;
};

const resolveReportRange = (params = {}) => {
    const hasFromTo = Boolean(params?.fromDate || params?.toDate);
    if (!hasFromTo) {
        const reportDate = params?.date || new Date();
        return {
            from: startOfDay(reportDate),
            to: endOfDay(reportDate),
            isSingleDay: true
        };
    }

    const rawFrom = params?.fromDate || params?.date || new Date();
    const rawTo = params?.toDate || params?.date || rawFrom;
    const from = startOfDay(rawFrom);
    const to = endOfDay(rawTo);
    if (from.getTime() <= to.getTime()) {
        return { from, to, isSingleDay: false };
    }
    return { from: startOfDay(rawTo), to: endOfDay(rawFrom), isSingleDay: false };
};

const shiftDateRange = ({ from, to }, daysBack = 1) => {
    const shiftMs = Math.max(1, Number(daysBack || 1)) * 24 * 60 * 60 * 1000;
    return {
        from: new Date(from.getTime() - shiftMs),
        to: new Date(to.getTime() - shiftMs)
    };
};

const getDepositSummary = async (txOrClient, depositReferenceId) => {
    const parsedReferenceId = parsePositiveInt(depositReferenceId);
    if (!parsedReferenceId) {
        return { error: 'Invalid deposit reference' };
    }

    const [entries, appliedAgg] = await Promise.all([
        txOrClient.treasuryEntry.findMany({
            where: {
                referenceType: 'DEPOSIT',
                referenceId: parsedReferenceId,
                entryType: {
                    in: [TREASURY_ENTRY_TYPE.DEPOSIT_IN, TREASURY_ENTRY_TYPE.DEPOSIT_REFUND]
                }
            },
            orderBy: [{ id: 'asc' }]
        }),
        txOrClient.paymentAllocation.aggregate({
            where: {
                sourceType: PAYMENT_ALLOCATION_SOURCE_TYPE.DEPOSIT,
                treasuryEntry: {
                    referenceType: 'DEPOSIT',
                    referenceId: parsedReferenceId,
                    entryType: TREASURY_ENTRY_TYPE.DEPOSIT_IN
                }
            },
            _sum: { amount: true }
        })
    ]);

    const totalIn = entries
        .filter((entry) => entry.entryType === TREASURY_ENTRY_TYPE.DEPOSIT_IN)
        .reduce((sum, entry) => sum + toNumber(entry.amount), 0);
    const totalRefund = entries
        .filter((entry) => entry.entryType === TREASURY_ENTRY_TYPE.DEPOSIT_REFUND)
        .reduce((sum, entry) => sum + toNumber(entry.amount), 0);
    const totalApplied = Math.max(0, toNumber(appliedAgg?._sum?.amount));
    const remaining = Number(Math.max(0, totalIn - totalRefund - totalApplied).toFixed(2));

    return {
        referenceId: parsedReferenceId,
        entries,
        totalIn,
        totalRefund,
        totalApplied,
        remaining
    };
};

const computeExpectedCashFromLedger = async (
    txOrClient,
    {
        treasuryId = null,
        from,
        to
    } = {},
) => {
    const parsedTreasuryId = parsePositiveInt(treasuryId);
    const where = {
        entryDate: {
            gte: startOfDay(from),
            lte: endOfDay(to)
        },
        ...(parsedTreasuryId ? { treasuryId: parsedTreasuryId } : {})
    };

    const cashEntries = await txOrClient.treasuryEntry.findMany({
        where,
        include: {
            paymentMethod: true
        }
    });

    let inCash = 0;
    let outCash = 0;
    cashEntries.forEach((entry) => {
        const code = resolveReportPaymentMethodCode(entry?.paymentMethod);
        if (code !== 'CASH') return;

        const amount = Math.max(0, toNumber(entry.amount));
        if (entry.direction === TREASURY_DIRECTION.IN) inCash += amount;
        else outCash += amount;
    });

    return {
        expectedCash: Number((inCash - outCash).toFixed(2)),
        cashIn: Number(inCash.toFixed(2)),
        cashOut: Number(outCash.toFixed(2)),
        entryCount: cashEntries.length
    };
};

const dbService = {
    async getWhatsAppOverdueCustomers(params = {}) {
        const overdueDays = params.overdueDays || '30';
        const minBalance = params.minBalance;

        try {
            const whereClause = {
                balance: { gt: 0 } // فقط العملاء اللي عليهم رصيد
            };

            if (minBalance !== '' && minBalance !== null && minBalance !== undefined) {
                const parsed = parseFloat(minBalance);
                if (Number.isFinite(parsed)) {
                    whereClause.balance = { gte: parsed };
                }
            }

            // Fetch customers - lightweight select, no nested includes
            const customers = await prisma.customer.findMany({
                where: whereClause,
                orderBy: { balance: 'desc' },
                take: 500,
                select: {
                    id: true,
                    name: true,
                    phone: true,
                    phone2: true,
                    balance: true,
                    lastPaymentDate: true,
                    city: true,
                    customerType: true
                }
            });

            // Fetch latest payment for these customers in one batch query
            const customerIds = customers.map(c => c.id);
            const latestPayments = customerIds.length > 0
                ? await prisma.customerTransaction.findMany({
                    where: {
                        customerId: { in: customerIds },
                        type: 'PAYMENT'
                    },
                    orderBy: { date: 'desc' },
                    distinct: ['customerId'],
                    select: { customerId: true, date: true, referenceType: true, credit: true }
                })
                : [];

            const paymentByCustomer = new Map();
            for (const tx of latestPayments) {
                paymentByCustomer.set(tx.customerId, tx);
            }

            // Enrich with effective last payment date
            const enriched = customers.map(c => {
                const latestTx = paymentByCustomer.get(c.id);
                let effectiveLastPaymentDate = latestTx?.date || c.lastPaymentDate || null;
                let lastPaymentType = '—';
                let lastPaymentAmount = latestTx?.credit || 0;

                if (latestTx) {
                    if (latestTx.referenceType === 'SALE') {
                        lastPaymentType = '\u0641\u0627\u062a\u0648\u0631\u0629';
                    } else if (latestTx.referenceType === 'PAYMENT') {
                        lastPaymentType = '\u0625\u0630\u0646 \u062f\u0641\u0639';
                    } else {
                        lastPaymentType = '\u062f\u0641\u0639\u0629';
                    }
                }

                const phone = c.phone || c.phone2;
                const hasPhone = Boolean(phone && String(phone).replace(/\D/g, '').length >= 10);

                return {
                    id: c.id,
                    name: c.name,
                    phone: c.phone,
                    phone2: c.phone2,
                    balance: c.balance,
                    lastPaymentDate: effectiveLastPaymentDate,
                    lastPaymentType,
                    lastPaymentAmount,
                    city: c.city,
                    customerType: c.customerType,
                    hasPhone
                };
            });

            // Filter by overdue days
            let filtered = enriched;
            if (overdueDays !== 'all') {
                const days = parseInt(overdueDays) || 0;
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - days);
                filtered = enriched.filter(c => {
                    if (!c.lastPaymentDate) return true;
                    return new Date(c.lastPaymentDate) < cutoffDate;
                });
            }

            // Fetch WhatsApp log counts only (lightweight)
            const customerIdsStr = filtered.map(c => String(c.id));
            if (customerIdsStr.length > 0) {
                const logCounts = await prisma.auditLog.groupBy({
                    by: ['entityId'],
                    where: {
                        action: 'WHATSAPP_SENT',
                        entityType: 'CUSTOMER',
                        entityId: { in: customerIdsStr },
                        meta: { path: ['success'], equals: true }
                    },
                    _count: { id: true }
                });
                const countMap = new Map();
                for (const row of logCounts) {
                    countMap.set(row.entityId, row._count.id);
                }
                filtered.forEach(c => {
                    c.whatsappLogCount = countMap.get(String(c.id)) || 0;
                });
            } else {
                filtered.forEach(c => { c.whatsappLogCount = 0; });
            }
            return { data: filtered };
        } catch (error) {
            console.error('[db:getWhatsAppOverdueCustomers] Error:', error);
            return { error: error.message };
        }
    },
    async logWhatsAppMessage(params = {}) {
        const { customerId, messageType, message, success, error } = params;
        try {
            await writeEntityAuditLog(prisma, {
                action: 'WHATSAPP_SENT',
                entityType: 'CUSTOMER',
                entityId: customerId,
                note: success ? 'رسالة واتساب ناجحة' : 'فشل إرسال واتساب',
                meta: { messageType, message, success, error, sentAt: new Date().toISOString() }
            });
            return { success: true };
        } catch (err) {
            console.error('[db:logWhatsAppMessage] Error:', err);
            return { error: err.message };
        }
    },
    // ==================== AUTH ====================
    async setCurrentSessionUser(user) {
        currentSessionUser = user && typeof user === 'object'
            ? {
                id: parsePositiveInt(user.id) || null,
                name: String(user.name || '').trim() || null,
                roleId: parsePositiveInt(user.roleId) || null,
                role: user.role || null,
                warehouseId: parsePositiveInt(user.warehouseId) || null,
                permissions: Array.isArray(user.permissions) ? user.permissions : [],
                // Ensure name is stored as it might be needed for audit displays if relation is missing
                displayName: user.name || user.username || 'N/A'
            }
            : null;

        return { success: true, user: currentSessionUser };
    },

    hasPermission(permissionKey) {
        if (!currentSessionUser) return false;
        // ADMIN always has full access
        if (currentSessionUser.role?.name === 'ADMIN' || currentSessionUser.role === 'ADMIN') return true;
        return Array.isArray(currentSessionUser.permissions) && currentSessionUser.permissions.includes(permissionKey);
    },


    async clearCurrentSessionUser() {
        const previousUser = currentSessionUser;
        currentSessionUser = null;

        if (previousUser?.id) {
            await writeAuditLog(prisma, {
                action: AUDIT_ACTION.LOGOUT,
                entityType: 'User',
                entityId: previousUser.id,
                performedByUserId: previousUser.id,
                note: `User logout: ${previousUser.name || previousUser.id}`,
                meta: {
                    role: previousUser.role?.name || previousUser.role || null
                }
            });
        }

        return { success: true };
    },

    async login({ username, password }) {
        try {
            const user = await prisma.user.findUnique({
                where: { username },
                include: {
                    role: {
                        include: {
                            permissions: {
                                include: {
                                    permission: true
                                }
                            }
                        }
                    }
                }
            });

            if (!user) return { error: 'المستخدم غير موجود' };

            // Check if user is active
            if (user.isActive === false) {
                return { error: 'هذا الحساب معطل. تواصل مع مدير النظام.' };
            }

            const valid = await bcrypt.compare(password, user.password);
            if (!valid) return { error: 'كلمة المرور غير صحيحة' };

            const permissions = user.role?.permissions?.map(rp => rp.permission.key) || [];
            
            const token = jwt.sign({ 
                id: user.id, 
                roleId: user.roleId,
                roleName: user.role?.name 
            }, SECRET_KEY);

            // Update lastLoginAt
            await prisma.user.update({
                where: { id: user.id },
                data: { lastLoginAt: new Date() }
            });

            currentSessionUser = {
                id: user.id,
                name: user.name,
                roleId: user.roleId,
                role: user.role,
                warehouseId: user.warehouseId,
                permissions
            };

            await writeAuditLog(prisma, {
                action: AUDIT_ACTION.LOGIN_SUCCESS,
                entityType: 'User',
                entityId: user.id,
                performedByUserId: user.id,
                note: `User login: ${user.name}`,
                meta: {
                    username: user.username,
                    role: user.role?.name || null
                }
            });

            return { 
                token, 
                user: { 
                    id: user.id, 
                    name: user.name, 
                    roleId: user.roleId,
                    role: user.role,
                    warehouseId: user.warehouseId,
                    permissions 
                } 
            };
        } catch (error) {
            return { error: error.message };
        }
    },

    // ==================== DASHBOARD ====================
    async getFinancialInsights() {
        try {
            const now = new Date();
            const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

            // 1. Predictive Analysis (Last 3 Months Sales)
            const pastSales = await prisma.sale.groupBy({
                by: ['invoiceDate'],
                where: { invoiceDate: { gte: new Date(now.getFullYear(), now.getMonth() - 3, 1) } },
                _sum: { total: true }
            });

            const monthlyAggregation = {};
            pastSales.forEach(s => {
                const mo = s.invoiceDate.getMonth();
                if (!monthlyAggregation[mo]) monthlyAggregation[mo] = 0;
                monthlyAggregation[mo] += s._sum.total || 0;
            });
            const moValues = Object.values(monthlyAggregation);
            const avgMonthlySales = moValues.length > 0 ? (moValues.reduce((a, b) => a + b, 0) / moValues.length) : 0;

            // 2. Inventory Velocity & Dead-stock Analysis
            const [soldItemIdsThisMonth, activeInventory] = await Promise.all([
                prisma.saleItem.findMany({
                    where: { sale: { invoiceDate: { gte: last30Days } } },
                    select: { variantId: true },
                    distinct: ['variantId']
                }),
                prisma.inventory.findMany({
                    where: { totalQuantity: { gt: 0 } },
                    include: { product: { select: { name: true } } }
                })
            ]);

            const soldSet = new Set(soldItemIdsThisMonth.map(i => i.variantId));
            // simplified turnover: if variant was sold in last 30 days, it's 'active'. 
            // In a better system we'd check SaleItems for each product across its variants.
            // For now, let's identify variants in stock that HAVEN'T been in any SaleItem in last 30 days.
            const deadStock = [];
            const variantsInStock = await prisma.variant.findMany({
                where: { quantity: { gt: 0 } },
                include: { product: { select: { name: true } } }
            });

            variantsInStock.forEach(v => {
                if (!soldSet.has(v.id)) {
                    deadStock.push({ name: `${v.product.name} (${v.productSize} ${v.color})`, qty: v.quantity });
                }
            });

            // 3. Profit & Loss Deep Dive
            const [thisMonthSalesItems, lastMonthSalesItems, thisMonthExps, lastMonthExps, categories] = await Promise.all([
                prisma.saleItem.findMany({
                    where: { sale: { invoiceDate: { gte: startOfThisMonth } } },
                    include: { variant: { select: { cost: true } } }
                }),
                prisma.saleItem.findMany({
                    where: { sale: { invoiceDate: { gte: startOfLastMonth, lte: endOfLastMonth } } },
                    include: { variant: { select: { cost: true } } }
                }),
                prisma.expense.groupBy({ by: ['categoryId'], where: { expenseDate: { gte: startOfThisMonth } }, _sum: { amount: true } }),
                prisma.expense.groupBy({ by: ['categoryId'], where: { expenseDate: { gte: startOfLastMonth, lte: endOfLastMonth } }, _sum: { amount: true } }),
                prisma.expenseCategory.findMany()
            ]);

            const calc = (items) => {
                let rev = 0, cogs = 0;
                items.forEach(i => { rev += i.quantity * i.price; cogs += i.quantity * Number(i.variant?.cost || 0); });
                return { rev, profit: rev - cogs };
            };

            const curr = calc(thisMonthSalesItems);
            const prev = calc(lastMonthSalesItems);
            const currentExpTotal = thisMonthExps.reduce((sum, e) => sum + (e._sum.amount || 0), 0);
            const previousExpTotal = lastMonthExps.reduce((sum, e) => sum + (e._sum.amount || 0), 0);

            const expenseBreakdown = categories.map(cat => {
                const c = thisMonthExps.find(e => e.categoryId === cat.id)?._sum?.amount || 0;
                const p = lastMonthExps.find(e => e.categoryId === cat.id)?._sum?.amount || 0;
                return { name: cat.name, current: c, previous: p, percentChange: p > 0 ? ((c - p) / p * 100).toFixed(1) : (c > 0 ? 100 : 0) };
            }).filter(i => i.current > 0 || i.previous > 0);

            // 4. Financial Health
            const [treasuryAgg, customerDebtResult, supplierDebtResult] = await Promise.all([
                prisma.treasury.aggregate({ where: { isActive: true }, _sum: { currentBalance: true } }),
                prisma.customerTransaction.aggregate({ _sum: { debit: true, credit: true } }),
                prisma.supplier.aggregate({ _sum: { balance: true } })
            ]);

            const liquidity = treasuryAgg?._sum?.currentBalance || 0;
            const cDebt = (customerDebtResult._sum.debit || 0) - (customerDebtResult._sum.credit || 0);
            const sDebt = supplierDebtResult._sum.balance || 0;

            // 5. Strategic Advice v2.0
            let advice = "";
            if (curr.profit > avgMonthlySales * 0.15) advice += "الأداء فوق المتوسط التاريخي. استثمر الفائض في بضاعة جديدة. ";
            if (deadStock.length > 5) advice += `عندك ${deadStock.length} صنف راكدين بقالهم شهر، اعمل عليهم عرض تصفية عشان تسييل الفلوس. `;
            if (cDebt > liquidity * 2) advice += "خد بالك! الديون عند العملاء كبيرة جداً مقارنة بالكاش، وقف البيع الآجل لبعضهم. ";
            if (curr.rev < avgMonthlySales * 0.8 && now.getDate() > 15) advice += "المبيعات متأخرة عن المستهدف الشهري، جرب تعمل مهرجان خصومات لتنشيط الحركة. ";

            return {
                summary: advice || "العمل يسير بشكل منتظم ومستقر.",
                stats: {
                    revenue: { current: curr.rev, previous: prev.rev, forecast: avgMonthlySales },
                    profit: { current: curr.profit, previous: prev.profit },
                    expenses: { current: currentExpTotal, previous: previousExpTotal },
                    expenseBreakdown,
                    deadStock: deadStock.slice(0, 10), // Return top 10 dead stock items
                    liquidity,
                    customersDebt: cDebt,
                    suppliersDebt: sDebt,
                    healthScore: Math.min(100, Math.max(0, 70 + (curr.profit > prev.profit ? 10 : -10) - (cDebt > liquidity ? 15 : 0)))
                }
            };
        } catch (error) {
            console.error('[FinancialInsights] Error:', error);
            return { error: 'فشل في تحليل البيانات المالية' };
        }
    },

    async getDashboardStats() {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const sales = await prisma.sale.findMany({
                where: { createdAt: { gte: today } }
            });

            const expenses = await prisma.expense.findMany({
                where: { createdAt: { gte: today } }
            });

            const productsCount = await prisma.product.count();

            const lowStockVariants = await prisma.variant.findMany({
                where: { quantity: { lte: 5 } },
                include: { product: true },
                take: 10
            });

            const salesAmount = sales.reduce((sum, sale) => sum + sale.total, 0);
            const expensesAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0);

            // حساب الديون من CustomerTransaction
            const customerDebtResult = await prisma.customerTransaction.aggregate({
                _sum: {
                    debit: true,
                    credit: true
                }
            });

            const totalDebit = customerDebtResult._sum.debit || 0;
            const totalCredit = customerDebtResult._sum.credit || 0;
            const customersDebt = totalDebit - totalCredit;

            const suppliersDebt = await prisma.supplier.aggregate({
                _sum: { balance: true }
            });

            let treasuryBalance = 0;
            let treasuryInToday = 0;
            let treasuryOutToday = 0;

            try {
                const [treasuryAgg, treasuryTodayAgg] = await Promise.all([
                    prisma.treasury.aggregate({
                        where: { isActive: true },
                        _sum: { currentBalance: true }
                    }),
                    prisma.treasuryEntry.groupBy({
                        by: ['direction'],
                        where: { entryDate: { gte: today } },
                        _sum: { amount: true }
                    })
                ]);

                treasuryBalance = treasuryAgg?._sum?.currentBalance || 0;
                treasuryTodayAgg.forEach((entry) => {
                    const amount = entry?._sum?.amount || 0;
                    if (entry.direction === TREASURY_DIRECTION.IN) {
                        treasuryInToday += amount;
                    } else {
                        treasuryOutToday += amount;
                    }
                });
            } catch (treasuryError) {
                console.warn('Treasury stats are unavailable:', treasuryError?.message || treasuryError);
            }

            return {
                salesAmount,
                salesCount: sales.length,
                expensesAmount,
                productsCount,
                customersDebt: customersDebt || 0,
                suppliersDebt: suppliersDebt._sum.balance || 0,
                netProfit: salesAmount - expensesAmount,
                treasuryBalance,
                treasuryInToday,
                treasuryOutToday,
                lowStockVariants: lowStockVariants.map(v => ({
                    id: v.id,
                    productName: v.product.name,
                    size: v.productSize,
                    color: v.color,
                    quantity: v.quantity,
                    price: v.price
                }))
            };
        } catch (error) {
            return { error: error.message };
        }
    },

    // ==================== PRODUCTS ====================
    async getProducts({
        page = 1,
        pageSize = 50,
        searchTerm = '',
        columnSearches = {},
        categoryId = null,
        stockFilter = 'all',
        sortCol = 'id',
        sortDir = 'desc',
        includeTotal = true,
        includeDescription = true,
        includeImage = true,
        includeCategory = true,
        includeInventory = true,
        includeVariants = true,
        includeWarehouseStocks = true,
        warehouseId = null
    } = {}) {
        try {
            const safePage = Math.max(1, parseInt(page, 10) || 1);
            const safePageSize = Math.min(10000, Math.max(1, parseInt(pageSize, 10) || 50));
            const skip = (safePage - 1) * safePageSize;
            const andConditions = [];

            const parsedCategoryId = parsePositiveInt(categoryId);
            if (parsedCategoryId) {
                andConditions.push({ categoryId: parsedCategoryId });
            }

            let parsedWarehouseId = parsePositiveInt(warehouseId);
            if (currentSessionUser?.warehouseId) {
                parsedWarehouseId = currentSessionUser.warehouseId;
            }

            if (parsedWarehouseId) {
                andConditions.push({
                    OR: [
                        {
                            warehouseStocks: {
                                some: {
                                    warehouseId: parsedWarehouseId
                                }
                            }
                        },
                        {
                            variants: {
                                some: {
                                    warehouseStocks: {
                                        some: {
                                            warehouseId: parsedWarehouseId
                                        }
                                    }
                                }
                            }
                        }
                    ]
                });
            }

            // Stock filter – server-side so frontend doesn't need to fetch all products
            const safeStockFilter = String(stockFilter || 'all').trim().toLowerCase();
            if (safeStockFilter === 'out') {
                andConditions.push({ inventory: { is: { totalQuantity: { lte: 0 } } } });
            } else if (safeStockFilter === 'available') {
                andConditions.push({ inventory: { is: { totalQuantity: { gt: 0 } } } });
            } else if (safeStockFilter === 'low') {
                const lowStockRows = await prisma.$queryRaw`
                    SELECT "productId"
                    FROM "Inventory"
                    WHERE "totalQuantity" <= "minStock"
                `;

                const lowStockIds = Array.from(new Set(
                    (Array.isArray(lowStockRows) ? lowStockRows : [])
                        .map((row) => parsePositiveInt(row?.productId))
                        .filter(Boolean)
                ));

                if (lowStockIds.length === 0) {
                    return {
                        data: [],
                        total: includeTotal !== false ? 0 : null,
                        page: safePage,
                        totalPages: includeTotal !== false ? 1 : null,
                        hasMore: false
                    };
                }

                andConditions.push({ id: { in: lowStockIds } });
            }

            const normalizedSearch = String(searchTerm || '').trim();
            if (normalizedSearch.length > 0) {
                const variantBarcodeRows = await prisma.variant.findMany({
                    where: { barcode: { startsWith: normalizedSearch } },
                    select: { productId: true },
                    take: 150
                });

                const barcodeProductIds = Array.from(new Set(
                    variantBarcodeRows.map((row) => row.productId)
                )).filter((id) => Number.isFinite(id) && id > 0);

                const globalSearchOr = [
                    { name: { contains: normalizedSearch, mode: 'insensitive' } },
                    { sku: { startsWith: normalizedSearch, mode: 'insensitive' } },
                    { barcode: { startsWith: normalizedSearch } }
                ];

                if (barcodeProductIds.length > 0) {
                    globalSearchOr.push({ id: { in: barcodeProductIds } });
                }

                andConditions.push({ OR: globalSearchOr });
            }

            const normalizedColumnSearches = Object.entries(
                columnSearches && typeof columnSearches === 'object' ? columnSearches : {}
            )
                .map(([key, value]) => [String(key || '').trim(), String(value || '').trim()])
                .filter(([key, value]) => key && value);

            for (const [columnKey, value] of normalizedColumnSearches) {
                switch (columnKey) {
                    case 'name':
                        andConditions.push({ name: { contains: value, mode: 'insensitive' } });
                        break;

                    case 'code': {
                        const numericPart = parseInt(value.replace(/[^0-9-]/g, ''), 10);
                        const codeOr = [
                            { sku: { startsWith: value, mode: 'insensitive' } },
                            { barcode: { startsWith: value } },
                            { variants: { some: { barcode: { startsWith: value } } } }
                        ];
                        if (Number.isFinite(numericPart) && numericPart > 0) {
                            codeOr.push({ id: numericPart });
                        }
                        andConditions.push({ OR: codeOr });
                        break;
                    }

                    case 'category':
                        andConditions.push({ category: { is: { name: { contains: value, mode: 'insensitive' } } } });
                        break;

                    case 'brand':
                        andConditions.push({ brand: { contains: value, mode: 'insensitive' } });
                        break;

                    case 'barcode':
                        andConditions.push({
                            OR: [
                                { barcode: { startsWith: value } },
                                { variants: { some: { barcode: { startsWith: value } } } }
                            ]
                        });
                        break;

                    case 'unit':
                        andConditions.push({ unitName: { contains: value, mode: 'insensitive' } });
                        break;

                    case 'warehouse': {
                        const parsed = Number.parseInt(value, 10);
                        if (Number.isFinite(parsed)) {
                            andConditions.push({ inventory: { is: { warehouseQty: parsed } } });
                        }
                        break;
                    }

                    case 'quantity': {
                        const parsed = Number.parseInt(value, 10);
                        if (Number.isFinite(parsed)) {
                            andConditions.push({ inventory: { is: { totalQuantity: parsed } } });
                        }
                        break;
                    }

                    case 'saleLimit': {
                        const parsed = Number.parseInt(value, 10);
                        if (Number.isFinite(parsed)) {
                            andConditions.push({ inventory: { is: { minStock: parsed } } });
                        }
                        break;
                    }

                    case 'salePrice': {
                        const parsed = Number.parseFloat(value);
                        if (Number.isFinite(parsed)) {
                            andConditions.push({
                                OR: [
                                    { basePrice: parsed },
                                    { variants: { some: { price: parsed } } }
                                ]
                            });
                        }
                        break;
                    }

                    case 'costPrice': {
                        const parsed = Number.parseFloat(value);
                        if (Number.isFinite(parsed)) {
                            andConditions.push({
                                OR: [
                                    { cost: parsed },
                                    { variants: { some: { cost: parsed } } }
                                ]
                            });
                        }
                        break;
                    }

                    case 'wholesalePrice': {
                        const parsed = Number.parseFloat(value);
                        if (Number.isFinite(parsed)) {
                            andConditions.push({ wholesalePrice: parsed });
                        }
                        break;
                    }

                    case 'notes':
                        andConditions.push({ inventory: { is: { notes: { contains: value, mode: 'insensitive' } } } });
                        break;

                    default:
                        break;
                }
            }

            const where = andConditions.length > 0 ? { AND: andConditions } : {};

            const validSortCols = ['id', 'name', 'basePrice', 'cost', 'createdAt', 'updatedAt'];
            const safeSortDir = sortDir === 'asc' ? 'asc' : 'desc';
            const orderBy = validSortCols.includes(sortCol) ? { [sortCol]: safeSortDir } : { id: 'desc' };

            const needTotal = includeTotal !== false;
            let products = [];
            let total = null;
            const shouldIncludeWarehouseStocks = includeWarehouseStocks !== false;

            const runProductQuery = async (withWarehouseStocks) => {
                const queryArgs = {
                    skip,
                    take: safePageSize,
                    where,
                    orderBy,
                    select: buildProductSelect({
                        includeDescription: includeDescription !== false,
                        includeImage: includeImage !== false,
                        includeCategory: includeCategory !== false,
                        includeInventory: includeInventory !== false,
                        includeVariants: includeVariants !== false,
                        includeWarehouseStocks: withWarehouseStocks
                    })
                };

                if (needTotal) {
                    return await Promise.all([
                        prisma.product.findMany(queryArgs),
                        prisma.product.count({ where })
                    ]);
                }

                const rows = await prisma.product.findMany(queryArgs);
                return [rows, null];
            };

            if (shouldIncludeWarehouseStocks) {
                [products, total] = await withWarehouseStockRelationFallback(
                    'getProducts',
                    () => runProductQuery(true),
                    () => runProductQuery(false)
                );
            } else {
                [products, total] = await runProductQuery(false);
            }

            const totalPages = needTotal ? Math.ceil((total || 0) / safePageSize) : null;

            return {
                data: products,
                total,
                page: safePage,
                totalPages,
                hasMore: needTotal ? safePage < totalPages : products.length === safePageSize
            };
        } catch (error) {
            return { error: error.message };
        }
    },

    async getProduct(id) {
        try {
            const productId = parsePositiveInt(id);
            if (!productId) {
                return { error: 'Invalid productId' };
            }

            const product = await withWarehouseStockRelationFallback(
                'getProduct',
                () => prisma.product.findUnique({
                    where: { id: productId },
                    select: buildProductSelect({ includeWarehouseStocks: true })
                }),
                () => prisma.product.findUnique({
                    where: { id: productId },
                    select: buildProductSelect({ includeWarehouseStocks: false })
                })
            );

            if (!product) {
                return { error: 'Product not found' };
            }

            return product;
        } catch (error) {
            return { error: error.message };
        }
    },

    async addProduct(productData) {
        try {
            // تنظيف البيانات
            const basePrice = toMoney(productData.basePrice, 0);
            const cost = toMoney(productData.cost, 0);
            const singleUnit = normalizeSingleProductUnit(productData, {
                baseSalePrice: basePrice,
                baseCostPrice: cost,
                fallbackBarcode: productData?.barcode
            });
            const name = String(productData.name ?? '').trim();
            if (!name) return { error: 'Product name is required' };
            const requestedTotalQuantity = Math.max(
                0,
                toInteger(
                    productData.totalQuantity,
                    toInteger(productData.openingQty, 0) + toInteger(productData.displayQty, 0)
                )
            );
            const hasVariantsRequested = Boolean(productData?.hasVariants)
                || (Array.isArray(productData?.variants) && productData.variants.length > 0);

            const cleanData = {
                name,
                description: normalizeString(productData.description),
                categoryId: productData.categoryId ? parsePositiveInt(productData.categoryId) : null,
                brand: normalizeString(productData.brand),
                unitName: singleUnit.unitName,
                basePrice: singleUnit.salePrice,
                wholesalePrice: singleUnit.wholesalePrice,
                minSalePrice: singleUnit.minSalePrice,
                cost: singleUnit.purchasePrice,
                image: normalizeString(productData.image),
                sku: normalizeString(productData.sku),
                barcode: singleUnit.barcode,
                isActive: productData.isActive ?? true,
                type: normalizeString(productData.type) || 'store',
            };

            const createdProduct = await prisma.$transaction(async (tx) => {
                const product = await tx.product.create({
                    data: {
                        ...cleanData,
                        inventory: {
                            create: {
                                warehouseQty: requestedTotalQuantity,
                                displayQty: 0,
                                totalQuantity: requestedTotalQuantity,
                                lastRestock: requestedTotalQuantity > 0 ? new Date() : null
                            }
                        },
                        variants: {
                            create: hasVariantsRequested 
                                ? (Array.isArray(productData.variants) ? productData.variants : []).map(v => ({
                                    productSize: (v.size || v.productSize || '').trim(),
                                    color: (v.color || '').trim(),
                                    price: toMoney(v.price, cleanData.basePrice),
                                    cost: toMoney(v.cost, cleanData.cost),
                                    quantity: parseInt(v.quantity) || 0,
                                    barcode: (v.barcode || '').trim() || null
                                }))
                                : [{
                                    productSize: '',
                                    color: '',
                                    price: cleanData.basePrice,
                                    cost: cleanData.cost,
                                    quantity: requestedTotalQuantity,
                                    barcode: cleanData.barcode
                                }]
                        }
                    },
                    include: { variants: true, inventory: true }
                });

                // Create Product Warehouse Stocks
                if (Array.isArray(productData.warehouseStocks) && productData.warehouseStocks.length > 0) {
                    await tx.warehouseStock.createMany({
                        data: productData.warehouseStocks.map(s => ({
                            productId: product.id,
                            warehouseId: parseInt(s.warehouseId),
                            quantity: parseInt(s.quantity) || 0
                        }))
                    });

                    // If simple product, the default variant (product.variants[0]) should inherit these warehouse stocks
                    if (!hasVariantsRequested && product.variants && product.variants[0]) {
                        await tx.variantWarehouseStock.createMany({
                            data: productData.warehouseStocks.map(s => ({
                                variantId: product.variants[0].id,
                                warehouseId: parseInt(s.warehouseId),
                                quantity: parseInt(s.quantity) || 0
                            }))
                        });
                    }
                }

                // Create Variant Warehouse Stocks
                if (hasVariantsRequested && Array.isArray(productData.variantWarehouseStocks) && productData.variantWarehouseStocks.length > 0) {
                    const rowsToCreate = [];
                    productData.variantWarehouseStocks.forEach(s => {
                        // Find the variant by its tempId (which should be passed from frontend)
                        const matchedVariant = product.variants.find(v => {
                            const vData = (productData.variants || []).find(pdv => pdv.tempId === s.tempId);
                            if (!vData) return false;
                            const sizeMatch = (v.productSize || '') === (vData.size || vData.productSize || '').trim();
                            const colorMatch = (v.color || '') === (vData.color || '').trim();
                            return sizeMatch && colorMatch;
                        });

                        if (matchedVariant) {
                            rowsToCreate.push({
                                variantId: matchedVariant.id,
                                warehouseId: parseInt(s.warehouseId),
                                quantity: parseInt(s.quantity) || 0
                            });
                        }
                    });

                    if (rowsToCreate.length > 0) {
                        await tx.variantWarehouseStock.createMany({
                            data: rowsToCreate
                        });
                    }
                }

                return product;
            });

            await writeEntityAuditLog(prisma, {
                action: AUDIT_ACTION.PRODUCT_CREATE,
                entityType: 'Product',
                entityId: createdProduct.id,
                note: `Create product ${createdProduct.name}`,
                after: createdProduct
            });

            return createdProduct;
        } catch (error) {
            return { error: error.message };
        }
    },

    async updateProduct(id, productData) {
        try {
            const productId = parseInt(id);
            const cleanData = {};
            const basePrice = toMoney(productData.basePrice, 0);
            const cost = toMoney(productData.cost, 0);
            const singleUnit = normalizeSingleProductUnit(productData, {
                baseSalePrice: basePrice,
                baseCostPrice: cost,
                fallbackBarcode: productData?.barcode
            });

            if (productData.name !== undefined) cleanData.name = String(productData.name ?? '').trim();
            if (productData.description !== undefined) cleanData.description = normalizeString(productData.description);
            if (productData.categoryId !== undefined) cleanData.categoryId = productData.categoryId ? parsePositiveInt(productData.categoryId) : null;
            if (productData.brand !== undefined) cleanData.brand = normalizeString(productData.brand);
            if (productData.unitName !== undefined) cleanData.unitName = singleUnit.unitName;
            if (productData.basePrice !== undefined) cleanData.basePrice = singleUnit.salePrice;
            if (productData.wholesalePrice !== undefined) cleanData.wholesalePrice = singleUnit.wholesalePrice;
            if (productData.minSalePrice !== undefined) cleanData.minSalePrice = singleUnit.minSalePrice;
            if (productData.cost !== undefined) cleanData.cost = singleUnit.purchasePrice;
            if (productData.image !== undefined) cleanData.image = normalizeString(productData.image);
            if (productData.sku !== undefined) cleanData.sku = normalizeString(productData.sku);
            if (productData.barcode !== undefined) cleanData.barcode = singleUnit.barcode;
            if (productData.isActive !== undefined) cleanData.isActive = productData.isActive;
            if (productData.type !== undefined) cleanData.type = normalizeString(productData.type) || 'store';

            return await prisma.$transaction(async (tx) => {
                const before = await tx.product.findUnique({
                    where: { id: productId },
                    include: { variants: true, category: true, inventory: true }
                });

                await tx.product.update({
                    where: { id: productId },
                    data: cleanData
                });

                const updatedProduct = await tx.product.findUnique({
                    where: { id: productId },
                    include: { variants: true, category: true, inventory: true }
                });

                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.PRODUCT_UPDATE,
                    entityType: 'Product',
                    entityId: productId,
                    note: `Update product ${updatedProduct?.name || productId}`,
                    before,
                    after: updatedProduct,
                    meta: { changedFields: Object.keys(cleanData) }
                });

                return updatedProduct;
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async deleteProduct(id) {
        try {
            const productId = parsePositiveInt(id);
            if (!productId) {
                return { error: 'Invalid productId' };
            }

            const [
                linkedSaleItem,
                linkedReturnItem,
                linkedPurchaseItem,
                linkedPurchaseReturnItem
            ] = await Promise.all([
                prisma.saleItem.findFirst({
                    where: { variant: { productId } },
                    select: { saleId: true }
                }),
                prisma.returnItem.findFirst({
                    where: { variant: { productId } },
                    select: { returnId: true }
                }),
                prisma.purchaseItem.findFirst({
                    where: { variant: { productId } },
                    select: { purchaseId: true }
                }),
                prisma.purchaseReturnItem.findFirst({
                    where: { variant: { productId } },
                    select: { purchaseReturnId: true }
                })
            ]);

            if (linkedSaleItem) {
                return { error: 'لا يمكن حذف المنتج لارتباطه بفواتير بيع.' };
            }
            if (linkedReturnItem) {
                return { error: 'لا يمكن حذف المنتج لارتباطه بمرتجعات بيع.' };
            }
            if (linkedPurchaseItem) {
                return { error: 'لا يمكن حذف المنتج لارتباطه بفواتير شراء.' };
            }
            if (linkedPurchaseReturnItem) {
                return { error: 'لا يمكن حذف المنتج لارتباطه بمرتجعات شراء.' };
            }

            const product = await prisma.product.findUnique({
                where: { id: productId },
                include: { variants: true, category: true, inventory: true }
            });

            const deletedProduct = await prisma.product.delete({
                where: { id: productId }
            });

            await writeEntityAuditLog(prisma, {
                action: AUDIT_ACTION.PRODUCT_DELETE,
                entityType: 'Product',
                entityId: productId,
                note: `Delete product ${product?.name || productId}`,
                before: product,
                after: deletedProduct
            });

            return deletedProduct;
        } catch (error) {
            const friendlyMessage = mapProductDeleteConstraintError(error);
            if (friendlyMessage) {
                return { error: friendlyMessage };
            }
            return { error: error.message };
        }
    },

    async previewPriceUpdate(params) {
        try {
            const { categoryId, warehouseId, brand, formulaType, formulaVal, roundingRule, targetFields } = params;

            const andConditions = [];
            if (categoryId) {
                andConditions.push({ categoryId: parseInt(categoryId, 10) });
            }
            if (brand) {
                andConditions.push({ brand: { contains: brand.trim(), mode: 'insensitive' } });
            }
            if (warehouseId) {
                andConditions.push({
                    warehouseStocks: {
                        some: {
                            warehouseId: parseInt(warehouseId, 10),
                            quantity: { gt: 0 }
                        }
                    }
                });
            }

            const where = andConditions.length > 0 ? { AND: andConditions } : {};

            // Fetch all products matching filters
            const products = await prisma.product.findMany({
                where,
                include: {
                    variants: true,
                    category: true
                },
                orderBy: { name: 'asc' }
            });
            const totalCount = products.length;

            const calculateNewPrice = (oldPriceVal, oldCostVal) => {
                const oldPrice = Number(oldPriceVal || 0);
                const oldCost = Number(oldCostVal || 0);
                let newPrice = oldPrice;

                if (formulaType === 'percentage') {
                    newPrice = oldPrice * (1 + Number(formulaVal || 0) / 100);
                } else if (formulaType === 'fixed') {
                    newPrice = oldPrice + Number(formulaVal || 0);
                } else if (formulaType === 'costMarginPercentage') {
                    newPrice = oldCost * (1 + Number(formulaVal || 0) / 100);
                } else if (formulaType === 'costMarginFixed') {
                    newPrice = oldCost + Number(formulaVal || 0);
                }

                if (newPrice < 0) newPrice = 0;

                // Rounding
                if (roundingRule === 'nearestInteger') {
                    newPrice = Math.round(newPrice);
                } else if (roundingRule === 'nearestHalf') {
                    newPrice = Math.round(newPrice * 2) / 2;
                } else if (roundingRule === 'nearestFive') {
                    newPrice = Math.round(newPrice / 5) * 5;
                } else if (roundingRule === 'psychological99') {
                    newPrice = Math.floor(newPrice) + 0.99;
                } else if (roundingRule === 'psychological95') {
                    newPrice = Math.floor(newPrice) + 0.95;
                } else if (roundingRule === 'ceiling') {
                    newPrice = Math.ceil(newPrice);
                } else if (roundingRule === 'floor') {
                    newPrice = Math.floor(newPrice);
                } else {
                    newPrice = Number(newPrice.toFixed(2));
                }

                return Math.max(0, newPrice);
            };

            const previewData = [];

            for (const product of products) {
                const productPreview = {
                    id: product.id,
                    name: product.name,
                    barcode: product.barcode,
                    sku: product.sku,
                    categoryName: product.category?.name || 'غير مصنف',
                    oldPrices: {
                        basePrice: Number(product.basePrice || 0),
                        wholesalePrice: Number(product.wholesalePrice || 0),
                        minSalePrice: Number(product.minSalePrice || 0),
                        cost: Number(product.cost || 0)
                    },
                    newPrices: {}
                };

                // Calculate for Product targets
                for (const field of ['basePrice', 'wholesalePrice', 'minSalePrice', 'cost']) {
                    if (targetFields.includes(field)) {
                        productPreview.newPrices[field] = calculateNewPrice(product[field], product.cost);
                    } else {
                        productPreview.newPrices[field] = Number(product[field] || 0);
                    }
                }

                // If product has variants, also preview changes for them
                if (product.variants && product.variants.length > 0) {
                    productPreview.variants = product.variants.map(v => {
                        const variantPreview = {
                            id: v.id,
                            productSize: v.productSize,
                            color: v.color,
                            barcode: v.barcode,
                            oldPrices: {
                                price: Number(v.price || 0),
                                cost: Number(v.cost || 0)
                            },
                            newPrices: {}
                        };

                        // Calculate new variant price if 'basePrice' is targeted
                        if (targetFields.includes('basePrice')) {
                            variantPreview.newPrices.price = calculateNewPrice(v.price, v.cost);
                        } else {
                            variantPreview.newPrices.price = Number(v.price || 0);
                        }

                        // Calculate new variant cost if 'cost' is targeted
                        if (targetFields.includes('cost')) {
                            variantPreview.newPrices.cost = calculateNewPrice(v.cost, v.cost);
                        } else {
                            variantPreview.newPrices.cost = Number(v.cost || 0);
                        }

                        return variantPreview;
                    });
                }

                previewData.push(productPreview);
            }

            return {
                previewItems: previewData,
                totalCount
            };
        } catch (error) {
            return { error: error.message };
        }
    },

    async applyPriceUpdate(params) {
        try {
            const { categoryId, warehouseId, brand, formulaType, formulaVal, roundingRule, targetFields, excludedIds } = params;

            const andConditions = [];
            if (categoryId) {
                andConditions.push({ categoryId: parseInt(categoryId, 10) });
            }
            if (brand) {
                andConditions.push({ brand: { contains: brand.trim(), mode: 'insensitive' } });
            }
            if (warehouseId) {
                andConditions.push({
                    warehouseStocks: {
                        some: {
                            warehouseId: parseInt(warehouseId, 10),
                            quantity: { gt: 0 }
                        }
                    }
                });
            }

            const where = andConditions.length > 0 ? { AND: andConditions } : {};
            const excludedSet = new Set(Array.isArray(excludedIds) ? excludedIds.map(id => parseInt(id, 10)) : []);

            // Fetch all products matching filters
            const products = await prisma.product.findMany({
                where,
                include: {
                    variants: true
                }
            });

            const calculateNewPrice = (oldPriceVal, oldCostVal) => {
                const oldPrice = Number(oldPriceVal || 0);
                const oldCost = Number(oldCostVal || 0);
                let newPrice = oldPrice;

                if (formulaType === 'percentage') {
                    newPrice = oldPrice * (1 + Number(formulaVal || 0) / 100);
                } else if (formulaType === 'fixed') {
                    newPrice = oldPrice + Number(formulaVal || 0);
                } else if (formulaType === 'costMarginPercentage') {
                    newPrice = oldCost * (1 + Number(formulaVal || 0) / 100);
                } else if (formulaType === 'costMarginFixed') {
                    newPrice = oldCost + Number(formulaVal || 0);
                }

                if (newPrice < 0) newPrice = 0;

                // Rounding
                if (roundingRule === 'nearestInteger') {
                    newPrice = Math.round(newPrice);
                } else if (roundingRule === 'nearestHalf') {
                    newPrice = Math.round(newPrice * 2) / 2;
                } else if (roundingRule === 'nearestFive') {
                    newPrice = Math.round(newPrice / 5) * 5;
                } else if (roundingRule === 'psychological99') {
                    newPrice = Math.floor(newPrice) + 0.99;
                } else if (roundingRule === 'psychological95') {
                    newPrice = Math.floor(newPrice) + 0.95;
                } else if (roundingRule === 'ceiling') {
                    newPrice = Math.ceil(newPrice);
                } else if (roundingRule === 'floor') {
                    newPrice = Math.floor(newPrice);
                } else {
                    newPrice = Number(newPrice.toFixed(2));
                }

                return Math.max(0, newPrice);
            };

            const updatedProductsCount = await prisma.$transaction(async (tx) => {
                let count = 0;

                for (const product of products) {
                    if (excludedSet.has(product.id)) continue;

                    const before = await tx.product.findUnique({
                        where: { id: product.id },
                        include: { variants: true }
                    });

                    if (!before) continue;

                    const cleanData = {};
                    for (const field of ['basePrice', 'wholesalePrice', 'minSalePrice', 'cost']) {
                        if (targetFields.includes(field)) {
                            cleanData[field] = calculateNewPrice(product[field], product.cost);
                        }
                    }

                    // Update main product
                    if (Object.keys(cleanData).length > 0) {
                        await tx.product.update({
                            where: { id: product.id },
                            data: cleanData
                        });
                    }

                    // Update variants if any
                    if (Array.isArray(product.variants) && product.variants.length > 0) {
                        for (const variant of product.variants) {
                            const vData = {};
                            if (targetFields.includes('basePrice')) {
                                vData.price = calculateNewPrice(variant.price, variant.cost);
                            }
                            if (targetFields.includes('cost')) {
                                vData.cost = calculateNewPrice(variant.cost, variant.cost);
                            }

                            if (Object.keys(vData).length > 0) {
                                await tx.variant.update({
                                    where: { id: variant.id },
                                    data: vData
                                });
                            }
                        }
                    }

                    const after = await tx.product.findUnique({
                        where: { id: product.id },
                        include: { variants: true }
                    });

                    // Write audit log per product update
                    await writeEntityAuditLog(tx, {
                        action: AUDIT_ACTION.PRODUCT_UPDATE,
                        entityType: 'Product',
                        entityId: product.id,
                        note: `تحديث جماعي للأسعار للصنف: ${after?.name || product.id}`,
                        before,
                        after,
                        meta: { 
                            isBulkUpdate: true, 
                            formulaType, 
                            formulaVal, 
                            roundingRule, 
                            changedFields: Object.keys(cleanData) 
                        }
                    });

                    count++;
                }

                return count;
            });

            return { success: true, count: updatedProductsCount };
        } catch (error) {
            return { error: error.message };
        }
    },

    async searchProducts(query) {
        try {
            return await prisma.product.findMany({
                where: {
                    OR: [
                        { name: { contains: query, mode: 'insensitive' } },
                        { barcode: { contains: query } },
                        { sku: { contains: query, mode: 'insensitive' } }
                    ]
                },
                include: { variants: true, category: true, inventory: true },
                take: 20
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    // ==================== CATEGORIES ====================
    async getCategories() {
        try {
            return await prisma.category.findMany({
                orderBy: { name: 'asc' }
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async addCategory(categoryData) {
        try {
            const category = await prisma.category.create({
                data: categoryData
            });
            await writeEntityAuditLog(prisma, {
                action: AUDIT_ACTION.CATEGORY_CREATE,
                entityType: 'Category',
                entityId: category.id,
                note: `Create category ${category.name}`,
                after: category
            });
            return category;
        } catch (error) {
            return { error: error.message };
        }
    },

    async updateCategory(id, categoryData) {
        try {
            const categoryId = parseInt(id);
            const before = await prisma.category.findUnique({ where: { id: categoryId } });
            const category = await prisma.category.update({
                where: { id: categoryId },
                data: categoryData
            });
            await writeEntityAuditLog(prisma, {
                action: AUDIT_ACTION.CATEGORY_UPDATE,
                entityType: 'Category',
                entityId: category.id,
                note: `Update category ${category.name}`,
                before,
                after: category
            });
            return category;
        } catch (error) {
            return { error: error.message };
        }
    },

    async deleteCategory(id) {
        try {
            const categoryId = parseInt(id);
            const before = await prisma.category.findUnique({ where: { id: categoryId } });
            const category = await prisma.category.delete({
                where: { id: categoryId }
            });
            await writeEntityAuditLog(prisma, {
                action: AUDIT_ACTION.CATEGORY_DELETE,
                entityType: 'Category',
                entityId: category.id,
                note: `Delete category ${before?.name || category.id}`,
                before,
                after: category
            });
            return category;
        } catch (error) {
            return { error: error.message };
        }
    },

    // ==================== INVENTORY ====================
    async getInventory(productId) {
        try {
            return await prisma.inventory.findUnique({
                where: { productId: parseInt(productId) }
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async updateInventory(productId, inventoryData) {
        try {
            const productIdInt = parseInt(productId);
            const before = await prisma.inventory.findUnique({
                where: { productId: productIdInt }
            });
            const normalizedInventoryData = {
                ...(inventoryData && typeof inventoryData === 'object' ? inventoryData : {})
            };
            const hasTotalQuantity = Object.prototype.hasOwnProperty.call(normalizedInventoryData, 'totalQuantity');
            const hasWarehouseQty = Object.prototype.hasOwnProperty.call(normalizedInventoryData, 'warehouseQty');
            const hasDisplayQty = Object.prototype.hasOwnProperty.call(normalizedInventoryData, 'displayQty');

            const variantStats = await prisma.variant.aggregate({
                where: { productId: productIdInt },
                _sum: { quantity: true },
                _count: { id: true }
            });
            const hasVariants = Math.max(0, toInteger(variantStats?._count?.id, 0)) > 0;

            if (hasVariants) {
                const variantTotal = Math.max(0, toInteger(variantStats?._sum?.quantity, 0));
                normalizedInventoryData.totalQuantity = variantTotal;
                normalizedInventoryData.warehouseQty = variantTotal;
                normalizedInventoryData.displayQty = 0;
            }

            if (hasTotalQuantity || hasWarehouseQty || hasDisplayQty) {
                const normalizedTotalQuantity = Math.max(
                    0,
                    toInteger(
                        hasTotalQuantity ? normalizedInventoryData.totalQuantity : null,
                        toInteger(normalizedInventoryData.warehouseQty, 0) + toInteger(normalizedInventoryData.displayQty, 0)
                    )
                );
                normalizedInventoryData.totalQuantity = normalizedTotalQuantity;
                normalizedInventoryData.warehouseQty = normalizedTotalQuantity;
                normalizedInventoryData.displayQty = 0;
            }

            if (
                Object.prototype.hasOwnProperty.call(normalizedInventoryData, 'minStock')
                || Object.prototype.hasOwnProperty.call(normalizedInventoryData, 'maxStock')
            ) {
                const minStock = Math.max(0, toInteger(normalizedInventoryData.minStock, 5));
                const maxStock = Math.max(minStock, toInteger(normalizedInventoryData.maxStock, 100));
                normalizedInventoryData.minStock = minStock;
                normalizedInventoryData.maxStock = maxStock;
            }

            const existing = await prisma.inventory.findUnique({
                where: { productId: productIdInt }
            });

            let inventoryRecord;
            if (existing) {
                inventoryRecord = await prisma.inventory.update({
                    where: { productId: productIdInt },
                    data: normalizedInventoryData
                });
            } else {
                inventoryRecord = await prisma.inventory.create({
                    data: {
                        productId: productIdInt,
                        ...normalizedInventoryData
                    }
                });
            }

            if (!hasVariants) {
                await writeEntityAuditLog(prisma, {
                    action: AUDIT_ACTION.INVENTORY_UPDATE,
                    entityType: 'Inventory',
                    entityId: inventoryRecord.id,
                    note: `Update inventory for product #${productIdInt}`,
                    before,
                    after: inventoryRecord,
                    meta: { productId: productIdInt }
                });
                return inventoryRecord;
            }

            await syncSingleProductInventoryWithVariants(prisma, productIdInt);
            const finalInventory = await prisma.inventory.findUnique({
                where: { productId: productIdInt }
            });
            await writeEntityAuditLog(prisma, {
                action: AUDIT_ACTION.INVENTORY_UPDATE,
                entityType: 'Inventory',
                entityId: finalInventory?.id,
                note: `Update inventory for product #${productIdInt}`,
                before,
                after: finalInventory,
                meta: { productId: productIdInt }
            });
            return finalInventory;
        } catch (error) {
            return { error: error.message };
        }
    },

    // ==================== WAREHOUSES ====================
    async getWarehouses() {
        try {
            const userWarehouseId = currentSessionUser?.warehouseId;
            const whereClause = userWarehouseId ? { id: userWarehouseId } : {};

            return await prisma.warehouse.findMany({
                where: whereClause,
                orderBy: { name: 'asc' }
            });
        } catch (error) {
            if (isWarehouseSchemaMissingError(error)) {
                logWarehouseSchemaFallback('getWarehouses', error);
                return [];
            }
            return { error: error.message };
        }
    },

    async addWarehouse(warehouseData) {
        try {
            const warehouse = await prisma.warehouse.create({
                data: warehouseData
            });
            await writeEntityAuditLog(prisma, {
                action: AUDIT_ACTION.WAREHOUSE_CREATE,
                entityType: 'Warehouse',
                entityId: warehouse.id,
                note: `Create warehouse ${warehouse.name}`,
                after: warehouse
            });
            return warehouse;
        } catch (error) {
            if (isWarehouseSchemaMissingError(error)) {
                logWarehouseSchemaFallback('addWarehouse', error);
                return { error: WAREHOUSE_SCHEMA_MISSING_MESSAGE };
            }
            return { error: error.message };
        }
    },

    async updateWarehouse(id, warehouseData) {
        try {
            const warehouseId = parseInt(id);
            const before = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
            const warehouse = await prisma.warehouse.update({
                where: { id: warehouseId },
                data: warehouseData
            });
            await writeEntityAuditLog(prisma, {
                action: AUDIT_ACTION.WAREHOUSE_UPDATE,
                entityType: 'Warehouse',
                entityId: warehouse.id,
                note: `Update warehouse ${warehouse.name}`,
                before,
                after: warehouse
            });
            return warehouse;
        } catch (error) {
            if (isWarehouseSchemaMissingError(error)) {
                logWarehouseSchemaFallback('updateWarehouse', error);
                return { error: WAREHOUSE_SCHEMA_MISSING_MESSAGE };
            }
            return { error: error.message };
        }
    },

    async deleteWarehouse(id) {
        try {
            const warehouseId = parseInt(id);
            const [productStocks, variantStocks] = await Promise.all([
                prisma.warehouseStock.findFirst({
                    where: { warehouseId, quantity: { gt: 0 } }
                }),
                withVariantWarehouseStockRelationFallback(
                    'deleteWarehouse',
                    () => prisma.variantWarehouseStock.findFirst({
                        where: { warehouseId, quantity: { gt: 0 } }
                    }),
                    () => Promise.resolve(null)
                )
            ]);

            if (productStocks || variantStocks) {
                return { error: 'Cannot delete warehouse because it still has stock.' };
            }

            const before = await prisma.warehouse.findUnique({
                where: { id: warehouseId }
            });
            const warehouse = await prisma.warehouse.delete({
                where: { id: warehouseId }
            });
            await writeEntityAuditLog(prisma, {
                action: AUDIT_ACTION.WAREHOUSE_DELETE,
                entityType: 'Warehouse',
                entityId: warehouse.id,
                note: `Delete warehouse ${before?.name || warehouse.id}`,
                before,
                after: warehouse
            });
            return warehouse;
        } catch (error) {
            if (isWarehouseSchemaMissingError(error)) {
                logWarehouseSchemaFallback('deleteWarehouse', error);
                return { error: WAREHOUSE_SCHEMA_MISSING_MESSAGE };
            }
            return { error: error.message };
        }
    },

    async getWarehouseStocks(productId) {
        try {
            const productIdInt = parseInt(productId);
            return await withVariantWarehouseStockRelationFallback(
                'getWarehouseStocks',
                async () => {
                    const [variants, legacyTotals] = await Promise.all([
                        prisma.variant.findMany({
                            where: { productId: productIdInt },
                            select: {
                                id: true,
                                productId: true,
                                productSize: true,
                                color: true,
                                quantity: true,
                                barcode: true,
                                warehouseStocks: {
                                    include: { warehouse: true },
                                    orderBy: { warehouse: { name: 'asc' } }
                                }
                            },
                            orderBy: [{ id: 'asc' }]
                        }),
                        prisma.warehouseStock.findMany({
                            where: { productId: productIdInt },
                            include: { warehouse: true },
                            orderBy: { warehouse: { name: 'asc' } }
                        })
                    ]);

                    let finalVariants = variants;
                    let finalLegacyTotals = legacyTotals;
                    const userWarehouseId = currentSessionUser?.warehouseId;
                    if (userWarehouseId) {
                        finalVariants = variants.map(variant => ({
                            ...variant,
                            warehouseStocks: (variant.warehouseStocks || []).filter(ws => ws.warehouseId === userWarehouseId)
                        }));
                        finalLegacyTotals = legacyTotals.filter(lt => lt.warehouseId === userWarehouseId);
                    }

                    const totalsMap = new Map();
                    for (const variant of finalVariants) {
                        for (const stock of (variant.warehouseStocks || [])) {
                            const warehouseId = parsePositiveInt(stock?.warehouseId);
                            if (!warehouseId) continue;
                            const current = totalsMap.get(warehouseId) || {
                                warehouseId,
                                quantity: 0,
                                warehouse: stock.warehouse || null
                            };
                            current.quantity += Math.max(0, toInteger(stock?.quantity, 0));
                            if (!current.warehouse && stock.warehouse) current.warehouse = stock.warehouse;
                            totalsMap.set(warehouseId, current);
                        }
                    }
                    const computedTotals = Array.from(totalsMap.values()).filter((row) => row.quantity > 0);
                    const totals = computedTotals.length > 0
                        ? computedTotals
                        : finalLegacyTotals.map((row) => ({
                            warehouseId: row.warehouseId,
                            quantity: Math.max(0, toInteger(row.quantity, 0)),
                            warehouse: row.warehouse || null
                        }));

                    return {
                        productId: productIdInt,
                        totals,
                        variants: finalVariants.map((variant) => ({
                            id: variant.id,
                            productId: variant.productId,
                            productSize: variant.productSize,
                            color: variant.color,
                            quantity: Math.max(0, toInteger(variant.quantity, 0)),
                            barcode: variant.barcode || null,
                            warehouseStocks: (variant.warehouseStocks || []).map((stock) => ({
                                id: stock.id,
                                warehouseId: stock.warehouseId,
                                quantity: Math.max(0, toInteger(stock.quantity, 0)),
                                warehouse: stock.warehouse || null
                            }))
                        }))
                    };
                },
                async () => {
                    const [legacyRows, variants] = await Promise.all([
                        prisma.warehouseStock.findMany({
                            where: { productId: productIdInt },
                            include: { warehouse: true },
                            orderBy: { warehouse: { name: 'asc' } }
                        }),
                        prisma.variant.findMany({
                            where: { productId: productIdInt },
                            select: {
                                id: true,
                                productId: true,
                                productSize: true,
                                color: true,
                                quantity: true,
                                barcode: true
                            },
                            orderBy: [{ id: 'asc' }]
                        })
                    ]);

                    return {
                        productId: productIdInt,
                        totals: legacyRows.map((row) => ({
                            warehouseId: row.warehouseId,
                            quantity: Math.max(0, toInteger(row.quantity, 0)),
                            warehouse: row.warehouse || null
                        })),
                        variants: variants.map((variant) => ({
                            ...variant,
                            warehouseStocks: []
                        }))
                    };
                }
            );
        } catch (error) {
            if (isWarehouseSchemaMissingError(error)) {
                logWarehouseSchemaFallback('getWarehouseStocks', error);
                return [];
            }
            return { error: error.message };
        }
    },

    async getWarehouseInventory(warehouseId) {
        try {
            const warehouseIdInt = parseInt(warehouseId);
            const userWarehouseId = currentSessionUser?.warehouseId;
            if (userWarehouseId && warehouseIdInt !== userWarehouseId) {
                return { error: 'ليس لديك صلاحية للوصول إلى هذا المخزن.' };
            }
            return await withVariantWarehouseStockRelationFallback(
                'getWarehouseInventory',
                () => prisma.variantWarehouseStock.findMany({
                    where: {
                        warehouseId: warehouseIdInt,
                        quantity: { gt: 0 }
                    },
                    include: {
                        warehouse: true,
                        variant: {
                            include: {
                                product: true
                            }
                        }
                    },
                    orderBy: { id: 'asc' }
                }),
                () => prisma.warehouseStock.findMany({
                    where: { warehouseId: warehouseIdInt },
                    include: {
                        product: {
                            include: {
                                variants: true
                            }
                        }
                    },
                    orderBy: { product: { name: 'asc' } }
                })
            );
        } catch (error) {
            if (isWarehouseSchemaMissingError(error)) {
                logWarehouseSchemaFallback('getWarehouseInventory', error);
                return [];
            }
            return { error: error.message };
        }
    },

    async reconcileWarehouseInventory(warehouseId, items) {
        try {
            const warehouseIdInt = parseInt(warehouseId);
            const userWarehouseId = currentSessionUser?.warehouseId;
            if (userWarehouseId && warehouseIdInt !== userWarehouseId) {
                return { error: 'ليس لديك صلاحية للوصول إلى هذا المخزن.' };
            }

            return await withVariantWarehouseStockRelationFallback(
                'reconcileWarehouseInventory',
                async () => {
                    const affectedProductIds = new Set();

                    await prisma.$transaction(async (tx) => {
                        for (const item of (items || [])) {
                            const variantId = parsePositiveInt(item.variantId);
                            const actualQty = Math.max(0, toInteger(item.actualQty, 0));
                            if (!variantId) continue;

                            await tx.variantWarehouseStock.upsert({
                                where: {
                                    variantId_warehouseId: {
                                        variantId,
                                        warehouseId: warehouseIdInt
                                    }
                                },
                                update: { quantity: actualQty },
                                create: {
                                    variantId,
                                    warehouseId: warehouseIdInt,
                                    quantity: actualQty
                                }
                            });

                            const stockSum = await tx.variantWarehouseStock.aggregate({
                                where: { variantId },
                                _sum: { quantity: true }
                            });
                            const totalQty = toInteger(stockSum._sum?.quantity, 0);

                            const variantRecord = await tx.variant.update({
                                where: { id: variantId },
                                data: { quantity: totalQty },
                                select: { productId: true }
                            });

                            if (variantRecord?.productId) {
                                affectedProductIds.add(variantRecord.productId);
                            }
                        }

                        for (const productId of affectedProductIds) {
                            await syncSingleProductInventoryWithVariants(tx, productId);
                        }
                    });

                    await writeEntityAuditLog(prisma, {
                        action: AUDIT_ACTION.INVENTORY_RECONCILE,
                        entityType: 'WarehouseInventoryReconciliation',
                        entityId: warehouseIdInt,
                        note: `Reconcile inventory for warehouse #${warehouseIdInt} with ${items?.length || 0} items`,
                        after: { warehouseId: warehouseIdInt, itemsCount: items?.length || 0 },
                        meta: { warehouseId: warehouseIdInt, items }
                    });

                    return { success: true };
                },
                async () => {
                    await prisma.$transaction(async (tx) => {
                        for (const item of (items || [])) {
                            const productId = parsePositiveInt(item.productId);
                            const actualQty = Math.max(0, toInteger(item.actualQty, 0));
                            if (!productId) continue;

                            await tx.warehouseStock.upsert({
                                where: {
                                    productId_warehouseId: {
                                        productId,
                                        warehouseId: warehouseIdInt
                                    }
                                },
                                update: { quantity: actualQty },
                                create: {
                                    productId,
                                    warehouseId: warehouseIdInt,
                                    quantity: actualQty
                                }
                            });

                            await syncSingleProductInventoryWithVariants(tx, productId);
                        }
                    });

                    await writeEntityAuditLog(prisma, {
                        action: AUDIT_ACTION.INVENTORY_RECONCILE,
                        entityType: 'WarehouseInventoryReconciliation',
                        entityId: warehouseIdInt,
                        note: `Reconcile legacy inventory for warehouse #${warehouseIdInt} with ${items?.length || 0} items`,
                        after: { warehouseId: warehouseIdInt, itemsCount: items?.length || 0 },
                        meta: { warehouseId: warehouseIdInt, items }
                    });

                    return { success: true };
                }
            );
        } catch (error) {
            if (isWarehouseSchemaMissingError(error)) {
                logWarehouseSchemaFallback('reconcileWarehouseInventory', error);
                return { error: WAREHOUSE_SCHEMA_MISSING_MESSAGE };
            }
            return { error: error.message };
        }
    },

    async updateWarehouseStock(productId, warehouseId, quantity) {
        try {
            const productIdInt = parseInt(productId);
            const warehouseIdInt = parseInt(warehouseId);
            const qty = Math.max(0, parseInt(quantity) || 0);

            return await withVariantWarehouseStockRelationFallback(
                'updateWarehouseStock',
                async () => {
                    let variants = await prisma.variant.findMany({
                        where: { productId: productIdInt },
                        select: { id: true },
                        orderBy: [{ id: 'asc' }]
                    });
                    if (variants.length === 0) {
                        const product = await prisma.product.findUnique({
                            where: { id: productIdInt },
                            select: { basePrice: true, cost: true, barcode: true }
                        });
                        if (!product) {
                            return { error: 'Product not found.' };
                        }

                        const createdVariant = await prisma.variant.create({
                            data: {
                                productId: productIdInt,
                                productSize: '',
                                color: '',
                                price: Math.max(0, toNumber(product.basePrice, 0)),
                                cost: Math.max(0, toNumber(product.cost, 0)),
                                quantity: qty,
                                barcode: product.barcode || null
                            },
                            select: { id: true }
                        });
                        variants = [createdVariant];
                    }
                    if (variants.length > 1) {
                        return { error: 'This product has sizes/colors. Update stock per variant per warehouse.' };
                    }

                    const variantId = variants[0].id;
                    if (qty > 0) {
                        await prisma.variantWarehouseStock.upsert({
                            where: {
                                variantId_warehouseId: {
                                    variantId,
                                    warehouseId: warehouseIdInt
                                }
                            },
                            update: { quantity: qty },
                            create: {
                                variantId,
                                warehouseId: warehouseIdInt,
                                quantity: qty
                            }
                        });
                    } else {
                        await prisma.variantWarehouseStock.deleteMany({
                            where: { variantId, warehouseId: warehouseIdInt }
                        });
                    }

                    await syncSingleProductInventoryWithVariants(prisma, productIdInt);
                    const result = await this.getWarehouseStocks(productIdInt);
                    await writeEntityAuditLog(prisma, {
                        action: AUDIT_ACTION.WAREHOUSE_STOCK_UPDATE,
                        entityType: 'WarehouseStock',
                        entityId: variantId,
                        note: `Update warehouse stock for product #${productIdInt} in warehouse #${warehouseIdInt}`,
                        after: result,
                        meta: { productId: productIdInt, warehouseId: warehouseIdInt, quantity: qty, mode: 'variant' }
                    });
                    return result;
                },
                async () => {
                    await prisma.warehouseStock.upsert({
                        where: {
                            productId_warehouseId: {
                                productId: productIdInt,
                                warehouseId: warehouseIdInt
                            }
                        },
                        update: { quantity: qty },
                        create: {
                            productId: productIdInt,
                            warehouseId: warehouseIdInt,
                            quantity: qty
                        }
                    });

                    await syncSingleProductInventoryWithVariants(prisma, productIdInt);

                    const result = await prisma.warehouseStock.findUnique({
                        where: {
                            productId_warehouseId: {
                                productId: productIdInt,
                                warehouseId: warehouseIdInt
                            }
                        }
                    });
                    await writeEntityAuditLog(prisma, {
                        action: AUDIT_ACTION.WAREHOUSE_STOCK_UPDATE,
                        entityType: 'WarehouseStock',
                        entityId: result?.id,
                        note: `Update warehouse stock for product #${productIdInt} in warehouse #${warehouseIdInt}`,
                        after: result,
                        meta: { productId: productIdInt, warehouseId: warehouseIdInt, quantity: qty, mode: 'legacy' }
                    });
                    return result;
                }
            );
        } catch (error) {
            if (isWarehouseSchemaMissingError(error)) {
                logWarehouseSchemaFallback('updateWarehouseStock', error);
                return { error: WAREHOUSE_SCHEMA_MISSING_MESSAGE };
            }
            return { error: error.message };
        }
    },

    async updateMultipleWarehouseStocks(productId, stocks) {
        try {
            const productIdInt = parseInt(productId);
            return await withVariantWarehouseStockRelationFallback(
                'updateMultipleWarehouseStocks',
                async () => {
                    const normalizedRows = (Array.isArray(stocks) ? stocks : [])
                        .map((stock) => ({
                            warehouseId: parsePositiveInt(stock?.warehouseId),
                            quantity: Math.max(0, toInteger(stock?.quantity, 0))
                        }))
                        .filter((stock) => stock.warehouseId);

                    let variants = await prisma.variant.findMany({
                        where: { productId: productIdInt },
                        select: { id: true },
                        orderBy: [{ id: 'asc' }]
                    });
                    if (variants.length === 0) {
                        const totalQuantity = normalizedRows.reduce((sum, row) => sum + Math.max(0, toInteger(row.quantity, 0)), 0);
                        const product = await prisma.product.findUnique({
                            where: { id: productIdInt },
                            select: { basePrice: true, cost: true, barcode: true }
                        });
                        if (!product) {
                            return { error: 'Product not found.' };
                        }

                        const createdVariant = await prisma.variant.create({
                            data: {
                                productId: productIdInt,
                                productSize: '',
                                color: '',
                                price: Math.max(0, toNumber(product.basePrice, 0)),
                                cost: Math.max(0, toNumber(product.cost, 0)),
                                quantity: totalQuantity,
                                barcode: product.barcode || null
                            },
                            select: { id: true }
                        });
                        variants = [createdVariant];
                    }
                    if (variants.length > 1) {
                        return { error: 'This product has sizes/colors. Update stock per variant per warehouse.' };
                    }

                    const variantId = variants[0].id;

                    await prisma.$transaction(async (tx) => {
                        await tx.variantWarehouseStock.deleteMany({
                            where: { variantId }
                        });

                        const rowsToCreate = normalizedRows
                            .filter((row) => row.quantity > 0)
                            .map((row) => ({
                                variantId,
                                warehouseId: row.warehouseId,
                                quantity: row.quantity
                            }));
                        if (rowsToCreate.length > 0) {
                            await tx.variantWarehouseStock.createMany({
                                data: rowsToCreate
                            });
                        }

                        await syncSingleProductInventoryWithVariants(tx, productIdInt);
                    });

                    const result = await this.getWarehouseStocks(productIdInt);
                    await writeEntityAuditLog(prisma, {
                        action: AUDIT_ACTION.WAREHOUSE_STOCK_BULK_UPDATE,
                        entityType: 'WarehouseStock',
                        entityId: productIdInt,
                        note: `Bulk update warehouse stocks for product #${productIdInt}`,
                        after: result,
                        meta: { productId: productIdInt, rows: normalizedRows, mode: 'variant-single' }
                    });
                    return result;
                },
                async () => {
                    for (const stock of stocks) {
                        const qty = Math.max(0, parseInt(stock.quantity) || 0);
                        await prisma.warehouseStock.upsert({
                            where: {
                                productId_warehouseId: {
                                    productId: productIdInt,
                                    warehouseId: parseInt(stock.warehouseId)
                                }
                            },
                            update: { quantity: qty },
                            create: {
                                productId: productIdInt,
                                warehouseId: parseInt(stock.warehouseId),
                                quantity: qty
                            }
                        });
                    }

                    await syncSingleProductInventoryWithVariants(prisma, productIdInt);

                    const result = await prisma.warehouseStock.findMany({
                        where: { productId: productIdInt },
                        include: { warehouse: true },
                        orderBy: { warehouse: { name: 'asc' } }
                    });
                    await writeEntityAuditLog(prisma, {
                        action: AUDIT_ACTION.WAREHOUSE_STOCK_BULK_UPDATE,
                        entityType: 'WarehouseStock',
                        entityId: productIdInt,
                        note: `Bulk update warehouse stocks for product #${productIdInt}`,
                        after: result,
                        meta: { productId: productIdInt, rows: stocks, mode: 'legacy' }
                    });
                    return result;
                }
            );
        } catch (error) {
            if (isWarehouseSchemaMissingError(error)) {
                logWarehouseSchemaFallback('updateMultipleWarehouseStocks', error);
                return { error: WAREHOUSE_SCHEMA_MISSING_MESSAGE };
            }
            return { error: error.message };
        }
    },

    async updateVariantWarehouseStocks(productId, stocks) {
        try {
            const productIdInt = parseInt(productId);
            return await withVariantWarehouseStockRelationFallback(
                'updateVariantWarehouseStocks',
                async () => {
                    const variants = await prisma.variant.findMany({
                        where: { productId: productIdInt },
                        select: { id: true },
                        orderBy: [{ id: 'asc' }]
                    });
                    if (variants.length === 0) {
                        return { error: 'No variants found for this product.' };
                    }

                    const validVariantIds = new Set(variants.map((variant) => variant.id));
                    const normalizedRows = (Array.isArray(stocks) ? stocks : [])
                        .map((stock) => ({
                            variantId: parsePositiveInt(stock?.variantId),
                            warehouseId: parsePositiveInt(stock?.warehouseId),
                            quantity: Math.max(0, toInteger(stock?.quantity, 0))
                        }))
                        .filter((stock) => stock.variantId && stock.warehouseId && validVariantIds.has(stock.variantId));

                    await prisma.$transaction(async (tx) => {
                        await tx.variantWarehouseStock.deleteMany({
                            where: {
                                variantId: { in: Array.from(validVariantIds) }
                            }
                        });

                        const rowsToCreate = normalizedRows
                            .filter((row) => row.quantity > 0)
                            .map((row) => ({
                                variantId: row.variantId,
                                warehouseId: row.warehouseId,
                                quantity: row.quantity
                            }));
                        if (rowsToCreate.length > 0) {
                            await tx.variantWarehouseStock.createMany({
                                data: rowsToCreate
                            });
                        }

                        await syncSingleProductInventoryWithVariants(tx, productIdInt);
                    });

                    const result = await this.getWarehouseStocks(productIdInt);
                    await writeEntityAuditLog(prisma, {
                        action: AUDIT_ACTION.VARIANT_WAREHOUSE_STOCK_UPDATE,
                        entityType: 'VariantWarehouseStock',
                        entityId: productIdInt,
                        note: `Update variant warehouse stocks for product #${productIdInt}`,
                        after: result,
                        meta: { productId: productIdInt, rows: normalizedRows }
                    });
                    return result;
                },
                async () => ({ error: 'Please run database migrations to enable per-variant warehouse stock.' })
            );
        } catch (error) {
            if (isWarehouseSchemaMissingError(error)) {
                logWarehouseSchemaFallback('updateVariantWarehouseStocks', error);
                return { error: WAREHOUSE_SCHEMA_MISSING_MESSAGE };
            }
            return { error: error.message };
        }
    },

    async reconcileVariantInventoryStocks(productId = null) {
        try {
            const parsedProductId = parsePositiveInt(productId);
            const variantRows = await prisma.variant.groupBy({
                by: ['productId'],
                ...(parsedProductId ? { where: { productId: parsedProductId } } : {})
            });

            const targetProductIds = Array.from(new Set(
                variantRows
                    .map((row) => parsePositiveInt(row?.productId))
                    .filter(Boolean)
            ));

            const summary = {
                processed: targetProductIds.length,
                synced: 0,
                failed: 0,
                errors: []
            };

            for (const targetProductId of targetProductIds) {
                try {
                    await syncSingleProductInventoryWithVariants(prisma, targetProductId);
                    summary.synced += 1;
                } catch (error) {
                    summary.failed += 1;
                    if (summary.errors.length < 20) {
                        summary.errors.push({
                            productId: targetProductId,
                            message: error?.message || 'Unknown error'
                        });
                    }
                }
            }

            await writeEntityAuditLog(prisma, {
                action: AUDIT_ACTION.INVENTORY_RECONCILE,
                entityType: 'Inventory',
                entityId: parsedProductId || null,
                note: parsedProductId
                    ? `Reconcile inventory for product #${parsedProductId}`
                    : 'Reconcile inventory for all products',
                after: summary,
                meta: { productId: parsedProductId || null }
            });
            return summary;
        } catch (error) {
            return { error: error.message };
        }
    },

    async transferProductBetweenWarehouses(productId, fromWarehouseId, toWarehouseId, quantity, notes, variantId = null) {
        try {
            const productIdInt = parseInt(productId);
            const fromId = parseInt(fromWarehouseId);
            const toId = parseInt(toWarehouseId);
            const qty = Math.max(1, parseInt(quantity) || 0);
            const requestedVariantId = parsePositiveInt(variantId);

            if (fromId === toId) {
                return { error: 'Cannot transfer to the same warehouse.' };
            }

            return await withVariantWarehouseStockRelationFallback(
                'transferProductBetweenWarehouses',
                async () => {
                    const variants = await prisma.variant.findMany({
                        where: { productId: productIdInt },
                        select: { id: true },
                        orderBy: [{ id: 'asc' }]
                    });
                    if (variants.length === 0) {
                        return { error: 'No variants found for this product.' };
                    }

                    let targetVariantId = requestedVariantId;
                    if (targetVariantId) {
                        const exists = variants.some((variant) => variant.id === targetVariantId);
                        if (!exists) {
                            return { error: 'Selected variant does not belong to this product.' };
                        }
                    } else if (variants.length === 1) {
                        targetVariantId = variants[0].id;
                    } else {
                        return { error: 'Please select the size/color variant before transfer.' };
                    }

                    const fromStock = await prisma.variantWarehouseStock.findUnique({
                        where: {
                            variantId_warehouseId: {
                                variantId: targetVariantId,
                                warehouseId: fromId
                            }
                        }
                    });
                    if (!fromStock || fromStock.quantity < qty) {
                        return { error: 'Insufficient quantity in source warehouse.' };
                    }

                    const result = await prisma.$transaction(async (tx) => {
                        await tx.variantWarehouseStock.update({
                            where: {
                                variantId_warehouseId: {
                                    variantId: targetVariantId,
                                    warehouseId: fromId
                                }
                            },
                            data: { quantity: { decrement: qty } }
                        });

                        await tx.variantWarehouseStock.upsert({
                            where: {
                                variantId_warehouseId: {
                                    variantId: targetVariantId,
                                    warehouseId: toId
                                }
                            },
                            update: { quantity: { increment: qty } },
                            create: {
                                variantId: targetVariantId,
                                warehouseId: toId,
                                quantity: qty
                            }
                        });

                        const transfer = await tx.warehouseTransfer.create({
                            data: {
                                productId: productIdInt,
                                variantId: targetVariantId,
                                fromWarehouseId: fromId,
                                toWarehouseId: toId,
                                quantity: qty,
                                notes: notes || null
                            }
                        });

                        await syncSingleProductInventoryWithVariants(tx, productIdInt);
                        return transfer;
                    });

                    await writeEntityAuditLog(prisma, {
                        action: AUDIT_ACTION.WAREHOUSE_TRANSFER_CREATE,
                        entityType: 'WarehouseTransfer',
                        entityId: result?.id,
                        note: `Transfer product #${productIdInt} between warehouses`,
                        after: result,
                        meta: {
                            productId: productIdInt,
                            variantId: targetVariantId,
                            fromWarehouseId: fromId,
                            toWarehouseId: toId,
                            quantity: qty
                        }
                    });
                    return result;
                },
                async () => {
                    const fromStock = await prisma.warehouseStock.findUnique({
                        where: {
                            productId_warehouseId: {
                                productId: productIdInt,
                                warehouseId: fromId
                            }
                        }
                    });

                    if (!fromStock || fromStock.quantity < qty) {
                        return { error: 'Insufficient quantity in source warehouse.' };
                    }

                    const result = await prisma.$transaction(async (tx) => {
                        await tx.warehouseStock.update({
                            where: {
                                productId_warehouseId: {
                                    productId: productIdInt,
                                    warehouseId: fromId
                                }
                            },
                            data: { quantity: { decrement: qty } }
                        });

                        await tx.warehouseStock.upsert({
                            where: {
                                productId_warehouseId: {
                                    productId: productIdInt,
                                    warehouseId: toId
                                }
                            },
                            update: { quantity: { increment: qty } },
                            create: {
                                productId: productIdInt,
                                warehouseId: toId,
                                quantity: qty
                            }
                        });

                        return await tx.warehouseTransfer.create({
                            data: {
                                productId: productIdInt,
                                fromWarehouseId: fromId,
                                toWarehouseId: toId,
                                quantity: qty,
                                notes: notes || null
                            }
                        });
                    });
                    await writeEntityAuditLog(prisma, {
                        action: AUDIT_ACTION.WAREHOUSE_TRANSFER_CREATE,
                        entityType: 'WarehouseTransfer',
                        entityId: result?.id,
                        note: `Transfer product #${productIdInt} between warehouses`,
                        after: result,
                        meta: {
                            productId: productIdInt,
                            fromWarehouseId: fromId,
                            toWarehouseId: toId,
                            quantity: qty,
                            mode: 'legacy'
                        }
                    });
                    return result;
                }
            );
        } catch (error) {
            if (isWarehouseSchemaMissingError(error)) {
                logWarehouseSchemaFallback('transferProductBetweenWarehouses', error);
                return { error: WAREHOUSE_SCHEMA_MISSING_MESSAGE };
            }
            return { error: error.message };
        }
    },

    async getWarehouseTransfers(productId, limit = 50) {
        try {
            return await prisma.warehouseTransfer.findMany({
                where: productId ? { productId: parseInt(productId) } : {},
                include: {
                    product: { select: { id: true, name: true, sku: true } },
                    variant: { select: { id: true, productSize: true, color: true, barcode: true } },
                    fromWarehouse: { select: { id: true, name: true } },
                    toWarehouse: { select: { id: true, name: true } }
                },
                orderBy: { createdAt: 'desc' },
                take: parseInt(limit)
            });
        } catch (error) {
            if (isWarehouseSchemaMissingError(error)) {
                logWarehouseSchemaFallback('getWarehouseTransfers', error);
                return [];
            }
            return { error: error.message };
        }
    },

    // ==================== VARIANTS ====================
    async getVariants() {
        try {
            // Self-healing: Ensure all products have at least one variant
            const productsWithoutVariants = await prisma.product.findMany({
                where: { variants: { none: {} } },
                include: { inventory: true }
            });

            if (productsWithoutVariants.length > 0) {
                await prisma.$transaction(
                    productsWithoutVariants.map(product => {
                        const qty = product.inventory?.totalQuantity || 0;
                        return prisma.variant.create({
                            data: {
                                productId: product.id,
                                productSize: '',
                                color: '',
                                price: product.basePrice,
                                cost: product.cost,
                                quantity: qty,
                                barcode: product.barcode
                            }
                        });
                    })
                );
            }

            const runVariantQuery = (withWarehouseStocks) => (
                prisma.variant.findMany({
                    include: {
                        product: withWarehouseStocks
                            ? { include: { warehouseStocks: true } }
                            : true,
                        warehouseStocks: withWarehouseStocks ? true : false
                    },
                    orderBy: { id: 'desc' }
                })
            );

            return await withWarehouseStockRelationFallback(
                'getVariants',
                () => runVariantQuery(true),
                () => runVariantQuery(false)
            );
        } catch (error) {
            return { error: error.message };
        }
    },

    async searchVariants(query) {
        try {
            const where = {
                OR: [
                    { barcode: { contains: query } },
                    { product: { name: { contains: query, mode: 'insensitive' } } },
                    { product: { barcode: { contains: query } } }
                ]
            };
            const runVariantQuery = (withWarehouseStocks) => (
                prisma.variant.findMany({
                    where,
                    include: {
                        product: withWarehouseStocks
                            ? { include: { warehouseStocks: true } }
                            : true
                    },
                    take: 20
                })
            );

            return await withWarehouseStockRelationFallback(
                'searchVariants',
                () => runVariantQuery(true),
                () => runVariantQuery(false)
            );
        } catch (error) {
            return { error: error.message };
        }
    },

    async addVariant(variantData) {
        try {
            const productId = parseInt(variantData.productId);
            return await prisma.$transaction(async (tx) => {
                const createdVariant = await tx.variant.create({
                    data: {
                        productId,
                        productSize: variantData.size,
                        color: variantData.color,
                        price: parseFloat(variantData.price),
                        cost: parseFloat(variantData.cost),
                        quantity: parseInt(variantData.quantity),
                        barcode: variantData.barcode || null
                    },
                    include: { product: true }
                });

                await syncSingleProductInventoryWithVariants(tx, createdVariant.productId);
                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.VARIANT_CREATE,
                    entityType: 'Variant',
                    entityId: createdVariant.id,
                    note: `Create variant for product #${createdVariant.productId}`,
                    after: createdVariant
                });
                return createdVariant;
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async updateVariant(id, variantData) {
        try {
            const variantId = parseInt(id);
            const updateData = {};
            if (variantData.size !== undefined) updateData.productSize = variantData.size;
            if (variantData.color !== undefined) updateData.color = variantData.color;
            if (variantData.price !== undefined) updateData.price = parseFloat(variantData.price);
            if (variantData.cost !== undefined) updateData.cost = parseFloat(variantData.cost);
            if (variantData.quantity !== undefined) updateData.quantity = parseInt(variantData.quantity);
            if (variantData.barcode !== undefined) updateData.barcode = variantData.barcode || null;

            return await prisma.$transaction(async (tx) => {
                const before = await tx.variant.findUnique({
                    where: { id: variantId },
                    include: { product: true }
                });
                const updatedVariant = await tx.variant.update({
                    where: { id: variantId },
                    data: updateData,
                    include: { product: true }
                });

                await syncSingleProductInventoryWithVariants(tx, updatedVariant.productId);
                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.VARIANT_UPDATE,
                    entityType: 'Variant',
                    entityId: updatedVariant.id,
                    note: `Update variant #${updatedVariant.id}`,
                    before,
                    after: updatedVariant
                });
                return updatedVariant;
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async deleteVariant(id) {
        try {
            const variantId = parseInt(id);
            return await prisma.$transaction(async (tx) => {
                const before = await tx.variant.findUnique({
                    where: { id: variantId },
                    include: { product: true }
                });
                const deletedVariant = await tx.variant.delete({
                    where: { id: variantId }
                });

                await syncSingleProductInventoryWithVariants(tx, deletedVariant.productId);
                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.VARIANT_DELETE,
                    entityType: 'Variant',
                    entityId: deletedVariant.id,
                    note: `Delete variant #${deletedVariant.id}`,
                    before,
                    after: deletedVariant
                });
                return deletedVariant;
            });
        } catch (error) {
            let errorMessage = error.message;

            if (String(error?.code || '').trim() === 'P2003') {
                errorMessage = 'لا يمكن حذف المتغير لارتباطه بحركات مالية المبيعات والمشتريات.';
            }

            return { error: errorMessage };
        }
    },

    // ==================== SALES ====================
    async getSales(options = {}) {
        const perf = startPerfTimer('db:getSales', {
            hasPagination: Boolean(options?.paginated || options?.page || options?.pageSize),
            limit: options?.limit || null,
            customerId: options?.customerId || null,
            searchLength: String(options?.searchTerm || '').trim().length
        });

        try {
            const {
                customerId,
                limit,
                page,
                pageSize,
                paginated = false,
                fromDate,
                toDate,
                searchTerm = '',
                sortCol = 'invoiceDate',
                sortDir = 'desc',
                columnSearch = {},
                lightweight = false
            } = options || {};

            const hasPagination = Boolean(
                paginated
                || Object.prototype.hasOwnProperty.call(options || {}, 'page')
                || Object.prototype.hasOwnProperty.call(options || {}, 'pageSize')
            );

            const whereClause = {};
            const parsedCustomerId = parsePositiveInt(customerId);
            if (parsedCustomerId) {
                whereClause.customerId = parsedCustomerId;
            }

            const parseOptionalFilterDate = (value, endOfDayValue = false) => {
                if (!value) return null;
                const parsedDate = parseDateOrDefault(value, null);
                if (!parsedDate) return null;
                if (endOfDayValue) {
                    parsedDate.setHours(23, 59, 59, 999);
                } else {
                    parsedDate.setHours(0, 0, 0, 0);
                }
                return parsedDate;
            };

            const invoiceDateRange = {};
            const parsedFromDate = parseOptionalFilterDate(fromDate, false);
            const parsedToDate = parseOptionalFilterDate(toDate, true);
            if (parsedFromDate) invoiceDateRange.gte = parsedFromDate;
            if (parsedToDate) invoiceDateRange.lte = parsedToDate;
            if (Object.keys(invoiceDateRange).length > 0) {
                whereClause.invoiceDate = invoiceDateRange;
            }

            const andFilters = [];

            const normalizedSearchTerm = String(searchTerm || '').trim();
            if (normalizedSearchTerm) {
                const searchOrFilters = [
                    { notes: { contains: normalizedSearchTerm, mode: 'insensitive' } },
                    { saleType: { contains: normalizedSearchTerm, mode: 'insensitive' } },
                    { customer: { is: { name: { contains: normalizedSearchTerm, mode: 'insensitive' } } } },
                    { paymentMethod: { is: { name: { contains: normalizedSearchTerm, mode: 'insensitive' } } } }
                ];

                const numericSearch = parsePositiveInt(normalizedSearchTerm);
                if (numericSearch) {
                    searchOrFilters.unshift({ id: numericSearch });
                }

                andFilters.push({ OR: searchOrFilters });
            }

            const normalizedColumnSearch = (
                columnSearch && typeof columnSearch === 'object' && !Array.isArray(columnSearch)
            )
                ? columnSearch
                : {};

            const addContainsFilter = (value, builder) => {
                const normalized = String(value || '').trim();
                if (!normalized) return;
                andFilters.push(builder(normalized));
            };

            const idColumnSearch = parsePositiveInt(normalizedColumnSearch.id);
            if (idColumnSearch) {
                andFilters.push({ id: idColumnSearch });
            }

            addContainsFilter(
                normalizedColumnSearch.customer
                || normalizedColumnSearch.customerName
                || normalizedColumnSearch.name,
                (value) => ({
                    customer: {
                        is: {
                            name: { contains: value, mode: 'insensitive' }
                        }
                    }
                })
            );

            addContainsFilter(
                normalizedColumnSearch.paymentMethod
                || normalizedColumnSearch.payment,
                (value) => ({
                    paymentMethod: {
                        is: {
                            name: { contains: value, mode: 'insensitive' }
                        }
                    }
                })
            );

            addContainsFilter(normalizedColumnSearch.saleType, (value) => ({
                saleType: { contains: value, mode: 'insensitive' }
            }));

            addContainsFilter(normalizedColumnSearch.notes, (value) => ({
                notes: { contains: value, mode: 'insensitive' }
            }));

            addContainsFilter(normalizedColumnSearch.total, (value) => {
                const numericValue = Number.parseFloat(value);
                if (!Number.isFinite(numericValue)) {
                    return { notes: { contains: value, mode: 'insensitive' } };
                }
                return {
                    total: {
                        gte: Math.max(0, numericValue - 0.01),
                        lte: numericValue + 0.01
                    }
                };
            });

            addContainsFilter(normalizedColumnSearch.invoiceDate, (value) => {
                const exactDate = parseOptionalFilterDate(value, false);
                if (!exactDate) return {};
                const exactDateEnd = new Date(exactDate);
                exactDateEnd.setHours(23, 59, 59, 999);
                return {
                    invoiceDate: {
                        gte: exactDate,
                        lte: exactDateEnd
                    }
                };
            });

            const validAndFilters = andFilters.filter((entry) => Object.keys(entry || {}).length > 0);
            if (validAndFilters.length > 0) {
                whereClause.AND = [...(whereClause.AND || []), ...validAndFilters];
            }

            const safeSortDir = String(sortDir).toLowerCase() === 'asc' ? 'asc' : 'desc';
            const sortableColumns = new Set([
                'id',
                'invoiceDate',
                'createdAt',
                'total',
                'saleType',
                'customer',
                'customerName',
                'paymentMethod'
            ]);
            const safeSortCol = sortableColumns.has(sortCol) ? sortCol : 'invoiceDate';

            let orderBy;
            if (safeSortCol === 'customer' || safeSortCol === 'customerName') {
                orderBy = [
                    { customer: { name: safeSortDir } },
                    { id: 'desc' }
                ];
            } else if (safeSortCol === 'paymentMethod') {
                orderBy = [
                    { paymentMethod: { name: safeSortDir } },
                    { id: 'desc' }
                ];
            } else if (safeSortCol === 'invoiceDate' || safeSortCol === 'createdAt') {
                orderBy = [
                    { [safeSortCol]: safeSortDir },
                    { id: 'desc' }
                ];
            } else {
                orderBy = { [safeSortCol]: safeSortDir };
            }

            const includeClause = lightweight
                ? {
                    customer: {
                        select: {
                            id: true,
                            name: true,
                            phone: true,
                            address: true
                        }
                    },
                    paymentMethod: true,
                    _count: {
                        select: { items: true }
                    }
                }
                : {
                    customer: true,
                    paymentMethod: true,
                    items: {
                        include: {
                            variant: {
                                include: { product: true }
                            }
                        }
                    },
                    returns: {
                        include: {
                            items: true
                        }
                    }
                };

            const mapSalesWithComputedFields = async (rawSales) => {
                if (!Array.isArray(rawSales) || rawSales.length === 0) return [];

                const saleIds = rawSales
                    .map((sale) => sale?.id)
                    .filter((id) => Number.isFinite(id));

                const shouldFetchOutstanding = saleIds.length > 0 && saleIds.length <= 2000;
                let outstandingBySaleId = new Map();
                let paidBySaleId = new Map();
                let itemCountBySaleId = new Map();

                if (shouldFetchOutstanding) {
                    const [saleTransactions, saleItemsAgg] = await Promise.all([
                        prisma.customerTransaction.findMany({
                            where: {
                                referenceType: 'SALE',
                                referenceId: { in: saleIds }
                            },
                            select: {
                                referenceId: true,
                                debit: true,
                                credit: true
                            }
                        }),
                        prisma.saleItem.groupBy({
                            by: ['saleId'],
                            where: { saleId: { in: saleIds } },
                            _count: { _all: true }
                        })
                    ]);

                    saleTransactions.forEach((transaction) => {
                        const saleReferenceId = transaction.referenceId;
                        if (!saleReferenceId) return;
                        
                        const delta = toNumber(transaction.debit) - toNumber(transaction.credit);
                        outstandingBySaleId.set(saleReferenceId, (outstandingBySaleId.get(saleReferenceId) || 0) + delta);
                        
                        const credit = toNumber(transaction.credit);
                        if (credit > 0) {
                            paidBySaleId.set(saleReferenceId, (paidBySaleId.get(saleReferenceId) || 0) + credit);
                        }
                    });

                    itemCountBySaleId = saleItemsAgg.reduce((map, row) => {
                        map.set(row.saleId, Number(row?._count?._all || 0));
                        return map;
                    }, new Map());
                }

                return rawSales.map((sale) => {
                    const total = Math.max(0, toNumber(sale.total));
                    const fallbackOutstanding = isCreditSaleType(sale.saleType) ? total : 0;
                    
                    // We allow negative outstanding for excess payments
                    const remainingAmount = toNumber(outstandingBySaleId.get(sale.id) ?? fallbackOutstanding);
                    
                    // If we have explicit transaction record for paid amount, use it.
                    // Otherwise derive it (total - remaining), but ensure it's at least 0.
                    const paidAmount = paidBySaleId.has(sale.id)
                        ? paidBySaleId.get(sale.id)
                        : Math.max(0, total - Math.max(0, remainingAmount));

                    const itemsCount = typeof sale?._count?.items === 'number'
                        ? sale._count.items
                        : Number(
                            itemCountBySaleId.get(sale.id)
                            || (Array.isArray(sale?.items) ? sale.items.length : 0)
                        );

                    return {
                        ...sale,
                        payment: sale?.paymentMethod?.name || null,
                        paymentMethodCode: sale?.paymentMethod?.code || null,
                        paidAmount,
                        remainingAmount,
                        // Backward-compatible aliases.
                        paid: paidAmount,
                        remaining: remainingAmount,
                        itemsCount
                    };
                });
            };

            const buildFindManyArgs = () => ({
                where: whereClause,
                include: includeClause,
                orderBy
            });

            if (hasPagination) {
                const safePage = Math.max(1, parseInt(page, 10) || 1);
                const safePageSize = Math.min(500, Math.max(10, parseInt(pageSize, 10) || 100));
                const skip = (safePage - 1) * safePageSize;

                const [rawSales, total] = await Promise.all([
                    prisma.sale.findMany({
                        ...buildFindManyArgs(),
                        skip,
                        take: safePageSize
                    }),
                    prisma.sale.count({ where: whereClause })
                ]);

                const data = await mapSalesWithComputedFields(rawSales);
                perf({ rows: data.length });

                return {
                    data,
                    total,
                    page: safePage,
                    pageSize: safePageSize,
                    totalPages: Math.max(1, Math.ceil(total / safePageSize))
                };
            }

            const queryArgs = buildFindManyArgs();
            if (limit) {
                queryArgs.take = Math.max(1, parseInt(limit, 10) || 1);
            }

            const rawSales = await prisma.sale.findMany(queryArgs);
            const data = await mapSalesWithComputedFields(rawSales);
            perf({ rows: data.length });
            return data;
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    async getSaleById(saleId) {
        try {
            const sale = await prisma.sale.findUnique({
                where: { id: parseInt(saleId) },
                include: {
                    customer: true,
                    paymentMethod: true,
                    coupon: true,
                    items: {
                        include: {
                            variant: {
                                include: { product: true }
                            }
                        }
                    },
                    returns: {
                        include: {
                            items: true
                        }
                    }
                }
            });
            if (!sale) return { error: 'لم يتم العثور على الفاتورة' };

            // Calculate paid amount from CustomerTransaction
            const transactions = await prisma.customerTransaction.findMany({
                where: {
                    referenceType: 'SALE',
                    referenceId: sale.id,
                    type: 'PAYMENT'
                }
            });
            const total = Math.max(0, toNumber(sale?.total, 0));
            const paidFromTransactions = transactions.reduce((sum, t) => sum + t.credit, 0);
            const paid = transactions.length > 0
                ? Math.max(0, paidFromTransactions)
                : (isCreditSaleType(sale?.saleType) ? 0 : total);
            const remaining = Math.max(0, total - paid);

            return {
                ...sale,
                paid: paid,
                paidAmount: paid,
                remaining,
                remainingAmount: remaining,
                payment: sale?.paymentMethod?.name || null,
                paymentMethodCode: sale?.paymentMethod?.code || null
            };
        } catch (error) {
            return { error: error.message };
        }
    },

    async createSale(saleData) {
        const perf = startPerfTimer('db:createSale', {
            hasCustomer: Boolean(saleData?.customerId),
            saleType: saleData?.saleType || null,
            itemCount: Array.isArray(saleData?.items) ? saleData.items.length : 0
        });

        try {
            const result = await prisma.$transaction(async (tx) => {
                const parsedCustomerId = parsePositiveInt(saleData.customerId);
                const resolvedPaymentMethodId = await resolvePaymentMethodId(
                    tx,
                    saleData.paymentMethodId ?? saleData.paymentMethod ?? saleData.payment,
                    1
                );

                                const newSale = await tx.sale.create({
                    data: {
                        customerId: parsedCustomerId || undefined,
                        paymentMethodId: resolvedPaymentMethodId || undefined,
                        total: parseFloat(saleData.total),
                        discount: parseFloat(saleData.discount || 0),
                        couponDiscount: parseFloat(saleData.couponDiscount || 0),
                        couponId: saleData.couponId ? parseInt(saleData.couponId) : undefined,
                        saleType: saleData.saleType || 'نقدي',
                        notes: saleData.notes || null,
                        invoiceDate: saleData.invoiceDate
                            ? new Date(saleData.invoiceDate)
                            : undefined,
                        createdByUserId: getActorUserId(saleData?.createdByUserId, saleData?.userId)
                    }
                });

                if (saleData.couponId) {
                    await tx.coupon.update({
                        where: { id: parseInt(saleData.couponId) },
                        data: { usedCount: { increment: 1 } }
                    });
                }

                const affectedProductIds = new Set();

                // إنشاء بنود الفاتورة وتحديث المخزون
                for (let i = 0; i < saleData.items.length; i++) {
                    const item = saleData.items[i];

                    await tx.saleItem.create({
                        data: {
                            id: i + 1,
                            saleId: newSale.id,
                            variantId: parseInt(item.variantId),
                            quantity: parseInt(item.quantity),
                            price: parseFloat(item.price),
                            discount: parseFloat(item.discount || 0)
                        }
                    });

                    const updatedVariant = await tx.variant.update({
                        where: { id: parseInt(item.variantId) },
                        data: { quantity: { decrement: parseInt(item.quantity) } },
                        select: { productId: true }
                    });

                    if (updatedVariant?.productId) {
                        affectedProductIds.add(updatedVariant.productId);
                    }

                    const variantIdInt = parseInt(item.variantId);
                    let warehouseIdInt = parsePositiveInt(saleData.warehouseId);
                    if (currentSessionUser?.warehouseId) {
                        warehouseIdInt = currentSessionUser.warehouseId;
                    }

                    if (warehouseIdInt) {
                        // 1. Update VariantWarehouseStock (Deduct from specific warehouse)
                        await tx.variantWarehouseStock.upsert({
                            where: {
                                variantId_warehouseId: {
                                    variantId: variantIdInt,
                                    warehouseId: warehouseIdInt
                                }
                            },
                        update: { quantity: { decrement: parseInt(item.quantity) } },
                        create: {
                                variantId: variantIdInt,
                                warehouseId: warehouseIdInt,
                                quantity: -parseInt(item.quantity)
                            }
                        });

                        // 2. Update legacy WarehouseStock (Deduct from specific warehouse)
                        const productIdInt = updatedVariant?.productId;
                        if (productIdInt) {
                            await tx.warehouseStock.upsert({
                                where: {
                                    productId_warehouseId: {
                                        productId: productIdInt,
                                        warehouseId: warehouseIdInt
                                    }
                                },
                            update: { quantity: { decrement: parseInt(item.quantity) } },
                            create: {
                                    productId: productIdInt,
                                    warehouseId: warehouseIdInt,
                                    quantity: -parseInt(item.quantity)
                                }
                            });
                        }
                    }
                }

                await syncProductInventoriesWithVariants(tx, Array.from(affectedProductIds));

                const outstandingAmount = computeSaleOutstandingAmount({
                    total: saleData.total,
                    discount: saleData.discount || 0,
                    paid: saleData.paid || 0,
                    saleType: saleData.saleType
                });

                // إنشاء سجلات الأستاذ (Debit/Credit)
                if (parsedCustomerId) {
                    const saleTotal = toNumber(saleData.total);
                    const paidAmount = toNumber(saleData.paid);
                    
                    // 1. سجل البيع الأصلي (مدين)
                    await tx.customerTransaction.create({
                        data: {
                            customerId: parsedCustomerId,
                            date: newSale.invoiceDate || new Date(),
                            type: 'SALE',
                            referenceType: 'SALE',
                            referenceId: newSale.id,
                            debit: saleTotal,
                            credit: 0,
                            notes: `فاتورة #${newSale.id} - ${saleData.notes || 'بيع'}`,
                            createdByUserId: getActorUserId(saleData?.createdByUserId, saleData?.userId)
                        }
                    });

                    // 2. سجل الدفع (دائن) - إذا تم دفع أي مبلغ
                    if (paidAmount > 0) {
                        await tx.customerTransaction.create({
                            data: {
                                customerId: parsedCustomerId,
                                date: newSale.invoiceDate || new Date(),
                                type: 'PAYMENT',
                                referenceType: 'SALE',
                                referenceId: newSale.id,
                                debit: 0,
                                credit: paidAmount,
                                notes: `دفعة لفاتورة #${newSale.id}${paidAmount > saleTotal ? ' (دفعة مقدمة)' : ''}`,
                                createdByUserId: getActorUserId(saleData?.createdByUserId, saleData?.userId)
                            }
                        });
                    }

                    await applyCustomerFinancialDelta(tx, {
                        customerId: parsedCustomerId,
                        balanceDelta: outstandingAmount,
                        activityDate: newSale.invoiceDate || new Date(),
                        // If customer paid ANY amount (cash or partial credit), track as last payment
                        paymentDate: paidAmount > 0 ? (newSale.invoiceDate || new Date()) : null
                    });
                }

                if (parsedCustomerId) {
                    const customer = await tx.customer.findUnique({
                        where: { id: parsedCustomerId },
                        include: {
                            sales: true,
                            payments: true
                        }
                    });

                    if (customer) {
                        // حساب إجمالي المشتريات
                        const totalPurchases = customer.sales.reduce((sum, sale) => sum + sale.total, 0);

                        // حساب التقييم الذكي (0-5 نجوم)
                        let rating = 0;

                        // معايير التقييم:
                        // 1. حجم المشتريات (40%)
                        if (totalPurchases >= 50000) rating += 2;
                        else if (totalPurchases >= 20000) rating += 1.5;
                        else if (totalPurchases >= 10000) rating += 1;
                        else if (totalPurchases >= 5000) rating += 0.5;

                        // 2. عدد المعاملات (20%)
                        const salesCount = customer.sales.length;
                        if (salesCount >= 50) rating += 1;
                        else if (salesCount >= 20) rating += 0.7;
                        else if (salesCount >= 10) rating += 0.5;
                        else if (salesCount >= 5) rating += 0.3;

                        // 3. انتظام السداد (40%) - من الرصيد الملخص
                        const currentBalance = customer.balance || 0;
                        const debtRatio = currentBalance / Math.max(totalPurchases, 1);

                        if (debtRatio < 0.1 && salesCount >= 5) rating += 2;
                        else if (debtRatio < 0.2 && salesCount >= 3) rating += 1.5;
                        else if (debtRatio < 0.3) rating += 1;
                        else if (debtRatio < 0.5) rating += 0.5;

                        rating = Math.min(5, rating); // الحد الأقصى 5 نجوم

                        // تصنيف تلقائي للعميل
                        let customerType = 'عادي';
                        if (totalPurchases >= 50000 && rating >= 4) {
                            customerType = 'VIP';
                        } else if (totalPurchases >= 30000 && salesCount >= 10) {
                            customerType = 'تاجر جملة';
                        } else if (totalPurchases >= 20000 || rating >= 3.5) {
                            customerType = 'VIP';
                        }

                        // تحديث بيانات العميل (rating و customerType فقط)
                        await tx.customer.update({
                            where: { id: parsedCustomerId },
                            data: {
                                rating,
                                customerType
                            }
                        });
                    }
                }

                const paidAmount = Math.max(0, toNumber(saleData.paid, 0));
                if (paidAmount > 0) {
                    const saleTreasuryId = await resolveTreasuryId(tx, saleData?.treasuryId);
                    const splitRows = await resolvePaymentSplits(tx, {
                        splitPayments: saleData?.splitPayments ?? saleData?.payments,
                        fallbackPaymentMethodId: resolvedPaymentMethodId || 1,
                        totalAmount: paidAmount
                    });
                    if (splitRows?.error) {
                        return { error: splitRows.error };
                    }

                    for (const splitRow of splitRows) {
                        const splitAmount = Math.max(0, toNumber(splitRow.amount));
                        if (splitAmount <= 0) continue;

                        const treasuryEntryResult = await createTreasuryEntry(tx, {
                            treasuryId: saleTreasuryId,
                            entryType: TREASURY_ENTRY_TYPE.SALE_INCOME,
                            direction: TREASURY_DIRECTION.IN,
                            amount: splitAmount,
                            notes: `Sale #${newSale.id}${saleData.notes ? ` - ${saleData.notes}` : ''}`,
                            note: splitRow?.note || null,
                            referenceType: 'SALE',
                            referenceId: newSale.id,
                            paymentMethodId: splitRow.paymentMethodId,
                            entryDate: newSale.invoiceDate || new Date(),
                            idempotencyKey: generateIdempotencyKey('SALE_PAYMENT', [
                                newSale.id,
                                splitRow.paymentMethodId,
                                normalizeAmountForKey(splitAmount),
                                splitRow.index,
                                'CREATE'
                            ]),
                            createdByUserId: getActorUserId(saleData?.createdByUserId, saleData?.userId),
                            meta: {
                                source: 'createSale',
                                splitIndex: splitRow.index,
                                splitCount: splitRows.length
                            }
                        });
                        throwIfResultError(treasuryEntryResult);
                    }
                }

                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.SALE_CREATE,
                    entityType: 'Sale',
                    entityId: newSale.id,
                    note: `Create sale #${newSale.id}`,
                    after: newSale,
                    referenceType: 'SALE',
                    referenceId: newSale.id
                });

                return newSale;
            });

            perf({ rows: 1 });
            return result;
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    async getSaleDetails(saleId) {
        try {
            const sale = await prisma.sale.findUnique({
                where: { id: parseInt(saleId) },
                include: {
                    customer: true,
                    paymentMethod: true,
                    items: {
                        include: {
                            variant: {
                                include: {
                                    product: true
                                }
                            }
                        }
                    },
                    coupon: true
                }
            });

            if (!sale) return null;

            return {
                ...sale,
                payment: sale?.paymentMethod?.name || null,
                paymentMethodCode: sale?.paymentMethod?.code || null
            };
        } catch (error) {
            return { error: error.message };
        }
    },

    async deleteSale(saleId) {
        const perf = startPerfTimer('db:deleteSale', {
            saleId: parseInt(saleId, 10) || null
        });

        try {
            const result = await prisma.$transaction(async (tx) => {
                // الحصول على بيانات الفاتورة
                const sale = await tx.sale.findUnique({
                    where: { id: parseInt(saleId) },
                    include: {
                        items: true,
                        customer: true
                    }
                });

                if (!sale) {
                    return { error: 'Sale not found' };
                }

                const saleTransactions = await tx.customerTransaction.findMany({
                    where: {
                        referenceType: 'SALE',
                        referenceId: parseInt(saleId)
                    },
                    select: {
                        debit: true,
                        credit: true
                    }
                });
                const previousSaleDelta = saleTransactions.reduce((sum, trx) => (
                    sum + (toNumber(trx.debit) - toNumber(trx.credit))
                ), 0);
                const affectedProductIds = new Set();

                // استرجاع الكميات للمنتجات
                for (const item of sale.items) {
                    const updatedVariant = await tx.variant.update({
                        where: { id: item.variantId },
                        data: { quantity: { increment: item.quantity } },
                        select: { productId: true }
                    });
                    if (updatedVariant?.productId) {
                        affectedProductIds.add(updatedVariant.productId);
                    }
                }

                await syncProductInventoriesWithVariants(tx, Array.from(affectedProductIds));

                await tx.customerTransaction.deleteMany({
                    where: {
                        referenceType: 'SALE',
                        referenceId: parseInt(saleId)
                    }
                });
                const rollbackResult = await rollbackTreasuryEntriesByReference(tx, 'SALE', parseInt(saleId));
                throwIfResultError(rollbackResult, 'Failed to rollback sale treasury entries');

                // حذف بنود الفاتورة
                await tx.saleItem.deleteMany({
                    where: { saleId: parseInt(saleId) }
                });

                // حذف الفاتورة
                const deletedSale = await tx.sale.delete({
                    where: { id: parseInt(saleId) }
                });

                if (sale.customerId) {
                    if (previousSaleDelta !== 0) {
                        await applyCustomerFinancialDelta(tx, {
                            customerId: sale.customerId,
                            balanceDelta: -previousSaleDelta
                        });
                    }
                    await recalculateCustomerActivityDates(tx, sale.customerId);
                }

                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.SALE_DELETE,
                    entityType: 'Sale',
                    entityId: deletedSale.id,
                    note: `Delete sale #${deletedSale.id}`,
                    before: sale,
                    after: deletedSale,
                    referenceType: 'SALE',
                    referenceId: deletedSale.id
                });

                return { success: true, data: deletedSale };
            });

            perf({ rows: result?.success ? 1 : 0 });
            return result;
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    async updateSale(saleId, saleData) {
        const perf = startPerfTimer('db:updateSale', {
            saleId: parseInt(saleId, 10) || null,
            hasCustomer: Object.prototype.hasOwnProperty.call(saleData || {}, 'customerId'),
            itemCount: Array.isArray(saleData?.items) ? saleData.items.length : 0
        });

        try {
            const result = await prisma.$transaction(async (tx) => {
                // الحصول على الفاتورة الحالية
                const currentSale = await tx.sale.findUnique({
                    where: { id: parseInt(saleId) },
                    include: {
                        items: true,
                        customer: true
                    }
                });

                if (!currentSale) {
                    return { error: 'Sale not found' };
                }

                const newCustomerId = Object.prototype.hasOwnProperty.call(saleData, 'customerId')
                    ? parsePositiveInt(saleData.customerId)
                    : currentSale.customerId;
                const hasPaymentMethodUpdate = (
                    Object.prototype.hasOwnProperty.call(saleData || {}, 'paymentMethodId') ||
                    Object.prototype.hasOwnProperty.call(saleData || {}, 'paymentMethod') ||
                    Object.prototype.hasOwnProperty.call(saleData || {}, 'payment')
                );
                const nextPaymentMethodId = hasPaymentMethodUpdate
                    ? await resolvePaymentMethodId(
                        tx,
                        saleData.paymentMethodId ?? saleData.paymentMethod ?? saleData.payment,
                        currentSale.paymentMethodId || 1
                    )
                    : currentSale.paymentMethodId;
                const hasInvoiceDateUpdate = Object.prototype.hasOwnProperty.call(saleData || {}, 'invoiceDate');
                const nextInvoiceDate = hasInvoiceDateUpdate
                    ? resolveEditedDateKeepingPosition(
                        saleData?.invoiceDate,
                        currentSale?.invoiceDate || currentSale?.createdAt || new Date()
                    )
                    : (toValidDate(currentSale?.invoiceDate) || toValidDate(currentSale?.createdAt) || new Date());

                const oldSaleTransactions = await tx.customerTransaction.findMany({
                    where: {
                        referenceType: 'SALE',
                        referenceId: parseInt(saleId)
                    },
                    select: {
                        debit: true,
                        credit: true
                    }
                });
                const oldOutstanding = oldSaleTransactions.reduce((sum, trx) => (
                    sum + (toNumber(trx.debit) - toNumber(trx.credit))
                ), 0);
                const affectedProductIds = new Set();

                // استرجاع الكميات القديمة
                for (const item of currentSale.items) {
                    const updatedVariant = await tx.variant.update({
                        where: { id: item.variantId },
                        data: { quantity: { increment: item.quantity } },
                        select: { productId: true }
                    });
                    if (updatedVariant?.productId) {
                        affectedProductIds.add(updatedVariant.productId);
                    }
                }

                await tx.customerTransaction.deleteMany({
                    where: {
                        referenceType: 'SALE',
                        referenceId: parseInt(saleId)
                    }
                });

                // حذف البنود القديمة
                await tx.saleItem.deleteMany({
                    where: { saleId: parseInt(saleId) }
                });

                // إنشاء البنود الجديدة
                if (saleData.items && saleData.items.length > 0) {
                    for (let i = 0; i < saleData.items.length; i++) {
                        const item = saleData.items[i];

                        await tx.saleItem.create({
                            data: {
                                id: i + 1,
                                saleId: parseInt(saleId),
                                variantId: parseInt(item.variantId),
                                quantity: parseInt(item.quantity),
                                price: parseFloat(item.price),
                                discount: parseFloat(item.discount || 0)
                            }
                        });

                        const updatedVariant = await tx.variant.update({
                            where: { id: parseInt(item.variantId) },
                            data: { quantity: { decrement: parseInt(item.quantity) } },
                            select: { productId: true }
                        });
                        if (updatedVariant?.productId) {
                            affectedProductIds.add(updatedVariant.productId);
                        }
                    }
                }

                // تحديث بيانات الفاتورة
                await syncProductInventoriesWithVariants(tx, Array.from(affectedProductIds));

                // التعامل مع تغير الكوبون
                const oldCouponId = currentSale.couponId;
                const hasCouponUpdate = Object.prototype.hasOwnProperty.call(saleData, 'couponId');
                const newCouponId = hasCouponUpdate ? (saleData.couponId ? parseInt(saleData.couponId) : null) : oldCouponId;

                if (hasCouponUpdate && oldCouponId !== newCouponId) {
                    if (oldCouponId) {
                        await tx.coupon.update({
                            where: { id: oldCouponId },
                            data: { usedCount: { decrement: 1 } }
                        });
                    }
                    if (newCouponId) {
                        await tx.coupon.update({
                            where: { id: newCouponId },
                            data: { usedCount: { increment: 1 } }
                        });
                    }
                }

                const updatedSale = await tx.sale.update({
                    where: { id: parseInt(saleId) },
                    data: {
                        customerId: Object.prototype.hasOwnProperty.call(saleData, 'customerId')
                            ? (newCustomerId || null)
                            : undefined,
                        paymentMethodId: hasPaymentMethodUpdate
                            ? (nextPaymentMethodId || null)
                            : undefined,
                        total: parseFloat(saleData.total),
                        discount: parseFloat(saleData.discount || 0),
                        couponDiscount: Object.prototype.hasOwnProperty.call(saleData, 'couponDiscount')
                            ? parseFloat(saleData.couponDiscount || 0)
                            : undefined,
                        couponId: hasCouponUpdate ? newCouponId : undefined,
                        saleType: saleData.saleType || 'نقدي',
                        notes: saleData.notes || null,
                        invoiceDate: hasInvoiceDateUpdate ? nextInvoiceDate : undefined
                    },
                    include: {
                        customer: true,
                        paymentMethod: true,
                        items: true
                    }
                });

                const newOutstanding = computeSaleOutstandingAmount({
                    total: saleData.total,
                    discount: saleData.discount || 0,
                    paid: saleData.paid || 0,
                    saleType: saleData.saleType
                });

                // إنشاء سجل CustomerTransaction الجديد (دين أو دائن)
                if (newCustomerId) {
                    const saleTotal = toNumber(updatedSale.total);
                    const paidAmount = toNumber(saleData.paid);
                    
                    // 1. سجل البيع الأصلي (مدين)
                    await tx.customerTransaction.create({
                        data: {
                            customerId: newCustomerId,
                            date: updatedSale.invoiceDate || new Date(),
                            type: 'SALE',
                            referenceType: 'SALE',
                            referenceId: updatedSale.id,
                            debit: saleTotal,
                            credit: 0,
                            notes: `فاتورة معدلة #${updatedSale.id} - ${saleData.notes || 'بيع'}`,
                            createdByUserId: getActorUserId(saleData?.createdByUserId, saleData?.userId)
                        }
                    });

                    // 2. سجل الدفع (دائن)
                    if (paidAmount > 0) {
                        await tx.customerTransaction.create({
                            data: {
                                customerId: newCustomerId,
                                date: updatedSale.invoiceDate || new Date(),
                                type: 'PAYMENT',
                                referenceType: 'SALE',
                                referenceId: updatedSale.id,
                                debit: 0,
                                credit: paidAmount,
                                notes: `دفعة لفاتورة #${updatedSale.id}${paidAmount > saleTotal ? ' (دفعة مقدمة)' : ''}`,
                                createdByUserId: getActorUserId(saleData?.createdByUserId, saleData?.userId)
                            }
                        });
                    }
                }

                if (currentSale.customerId && currentSale.customerId === newCustomerId) {
                    const delta = newOutstanding - oldOutstanding;
                    await applyCustomerFinancialDelta(tx, {
                        customerId: newCustomerId,
                        balanceDelta: delta,
                        activityDate: updatedSale.invoiceDate || new Date()
                    });
                    await recalculateCustomerActivityDates(tx, newCustomerId);
                } else {
                    if (currentSale.customerId) {
                        if (oldOutstanding !== 0) {
                            await applyCustomerFinancialDelta(tx, {
                                customerId: currentSale.customerId,
                                balanceDelta: -oldOutstanding
                            });
                        }
                        await recalculateCustomerActivityDates(tx, currentSale.customerId);
                    }

                    if (newCustomerId) {
                        await applyCustomerFinancialDelta(tx, {
                            customerId: newCustomerId,
                            balanceDelta: newOutstanding,
                            activityDate: updatedSale.invoiceDate || new Date()
                        });
                    }
                }

                const rollbackResult = await rollbackTreasuryEntriesByReference(tx, 'SALE', parseInt(saleId));
                throwIfResultError(rollbackResult, 'Failed to rollback sale treasury entries');

                const paidAmount = Math.max(0, toNumber(saleData.paid, 0));
                if (paidAmount > 0) {
                    const saleTreasuryId = await resolveTreasuryId(tx, saleData?.treasuryId);
                    const splitRows = await resolvePaymentSplits(tx, {
                        splitPayments: saleData?.splitPayments ?? saleData?.payments,
                        fallbackPaymentMethodId: nextPaymentMethodId || 1,
                        totalAmount: paidAmount
                    });
                    if (splitRows?.error) {
                        return { error: splitRows.error };
                    }

                    for (const splitRow of splitRows) {
                        const splitAmount = Math.max(0, toNumber(splitRow.amount));
                        if (splitAmount <= 0) continue;

                        const treasuryEntryResult = await createTreasuryEntry(tx, {
                            treasuryId: saleTreasuryId,
                            entryType: TREASURY_ENTRY_TYPE.SALE_INCOME,
                            direction: TREASURY_DIRECTION.IN,
                            amount: splitAmount,
                            notes: `Sale update #${updatedSale.id}${saleData.notes ? ` - ${saleData.notes}` : ''}`,
                            note: splitRow?.note || null,
                            referenceType: 'SALE',
                            referenceId: updatedSale.id,
                            paymentMethodId: splitRow.paymentMethodId,
                            entryDate: updatedSale.invoiceDate || new Date(),
                            idempotencyKey: generateIdempotencyKey('SALE_PAYMENT', [
                                updatedSale.id,
                                splitRow.paymentMethodId,
                                normalizeAmountForKey(splitAmount),
                                splitRow.index,
                                'UPDATE'
                            ]),
                            createdByUserId: parsePositiveInt(saleData?.createdByUserId ?? saleData?.userId),
                            meta: {
                                source: 'updateSale',
                                splitIndex: splitRow.index,
                                splitCount: splitRows.length
                            }
                        });
                        throwIfResultError(treasuryEntryResult);
                    }
                }

                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.SALE_UPDATE,
                    entityType: 'Sale',
                    entityId: updatedSale.id,
                    note: `Update sale #${updatedSale.id}`,
                    before: currentSale,
                    after: updatedSale,
                    referenceType: 'SALE',
                    referenceId: updatedSale.id
                });

                return { success: true, data: updatedSale };
            });

            perf({ rows: result?.success ? 1 : 0 });
            return result;
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    // ==================== PURCHASES (فواتير المشتريات) ====================
    async getPurchases(options = {}) {
        const perf = startPerfTimer('db:getPurchases', {
            hasPagination: Boolean(options?.paginated || options?.page || options?.pageSize),
            limit: options?.limit || null,
            supplierId: options?.supplierId || null,
            searchLength: String(options?.searchTerm || '').trim().length
        });

        try {
            const {
                supplierId,
                limit,
                page,
                pageSize,
                paginated = false,
                fromDate,
                toDate,
                searchTerm = '',
                sortCol = 'createdAt',
                sortDir = 'desc',
                lightweight = false
            } = options || {};

            const hasPagination = Boolean(
                paginated
                || Object.prototype.hasOwnProperty.call(options || {}, 'page')
                || Object.prototype.hasOwnProperty.call(options || {}, 'pageSize')
            );

            const whereClause = {};
            const parsedSupplierId = parsePositiveInt(supplierId);
            if (parsedSupplierId) {
                whereClause.supplierId = parsedSupplierId;
            }

            const parseOptionalFilterDate = (value, endOfDayValue = false) => {
                if (!value) return null;
                const parsedDate = parseDateOrDefault(value, null);
                if (!parsedDate) return null;
                if (endOfDayValue) {
                    parsedDate.setHours(23, 59, 59, 999);
                } else {
                    parsedDate.setHours(0, 0, 0, 0);
                }
                return parsedDate;
            };

            const createdAtRange = {};
            const parsedFromDate = parseOptionalFilterDate(fromDate, false);
            const parsedToDate = parseOptionalFilterDate(toDate, true);
            if (parsedFromDate) createdAtRange.gte = parsedFromDate;
            if (parsedToDate) createdAtRange.lte = parsedToDate;
            if (Object.keys(createdAtRange).length > 0) {
                whereClause.createdAt = createdAtRange;
            }

            const normalizedSearchTerm = String(searchTerm || '').trim();
            if (normalizedSearchTerm) {
                const searchOrFilters = [
                    { notes: { contains: normalizedSearchTerm, mode: 'insensitive' } },
                    { supplier: { is: { name: { contains: normalizedSearchTerm, mode: 'insensitive' } } } }
                ];

                const numericSearch = parsePositiveInt(normalizedSearchTerm);
                if (numericSearch) {
                    searchOrFilters.unshift({ id: numericSearch });
                }

                whereClause.AND = [...(whereClause.AND || []), { OR: searchOrFilters }];
            }

            const safeSortDir = String(sortDir).toLowerCase() === 'asc' ? 'asc' : 'desc';
            const sortableColumns = new Set([
                'id',
                'createdAt',
                'total',
                'supplier',
                'supplierName'
            ]);
            const safeSortCol = sortableColumns.has(sortCol) ? sortCol : 'createdAt';

            let orderBy;
            if (safeSortCol === 'supplier' || safeSortCol === 'supplierName') {
                orderBy = [
                    { supplier: { name: safeSortDir } },
                    { createdAt: 'desc' },
                    { id: 'desc' }
                ];
            } else if (safeSortCol === 'createdAt') {
                orderBy = [
                    { createdAt: safeSortDir },
                    { id: 'desc' }
                ];
            } else {
                orderBy = { [safeSortCol]: safeSortDir };
            }

            const includeClause = lightweight
                ? {
                    supplier: {
                        select: {
                            id: true,
                            name: true,
                            phone: true,
                            address: true
                        }
                    },
                    _count: {
                        select: {
                            items: true,
                            returns: true
                        }
                    }
                }
                : {
                    supplier: true,
                    createdByUser: { select: { name: true } },
                    items: {
                        include: {
                            variant: {
                                include: { product: true }
                            }
                        }
                    },
                    returns: {
                        include: {
                            items: true,
                            createdByUser: { select: { name: true } }
                        },
                        orderBy: { createdAt: 'desc' }
                    }
                };

            const mapPurchasesWithComputedFields = async (rawPurchases) => {
                if (!Array.isArray(rawPurchases) || rawPurchases.length === 0) return [];

                const purchaseIds = rawPurchases
                    .map((purchase) => parsePositiveInt(purchase?.id))
                    .filter(Boolean);

                const paymentPresentationByPurchaseId = await buildPurchasePaymentPresentationMap(
                    prisma,
                    purchaseIds
                );

                return rawPurchases.map((purchase) => {
                    const paymentPresentation = paymentPresentationByPurchaseId.get(purchase.id) || {};
                    const totalAmount = Math.max(0, toNumber(purchase?.total, 0));
                    const paidAmount = Math.max(0, Math.min(totalAmount, toNumber(purchase?.paid, 0)));
                    const fallbackPaymentLabel = paidAmount <= 0
                        ? (totalAmount > 0 ? '\u0622\u062c\u0644' : null)
                        : (paidAmount + 0.01 >= totalAmount ? '\u0646\u0642\u062f\u064a' : '\u062c\u0632\u0626\u064a');
                    const itemsCount = typeof purchase?._count?.items === 'number'
                        ? purchase._count.items
                        : (Array.isArray(purchase?.items) ? purchase.items.length : 0);
                    const returnsCount = typeof purchase?._count?.returns === 'number'
                        ? purchase._count.returns
                        : (Array.isArray(purchase?.returns) ? purchase.returns.length : 0);

                    return {
                        ...purchase,
                        payment: paymentPresentation.payment || fallbackPaymentLabel || null,
                        paymentMethod: paymentPresentation.paymentMethod || null,
                        paymentMethodCode: paymentPresentation.paymentMethodCode || null,
                        paidAmount,
                        remainingAmount: Math.max(0, totalAmount - paidAmount),
                        itemsCount,
                        returnsCount,
                        items: Array.isArray(purchase?.items)
                            ? purchase.items.map((item) => ({
                                ...item,
                                price: toNumber(item.cost, 0)
                            }))
                            : []
                    };
                });
            };

            const buildFindManyArgs = () => ({
                where: whereClause,
                include: includeClause,
                orderBy
            });

            if (hasPagination) {
                const safePage = Math.max(1, parseInt(page, 10) || 1);
                const safePageSize = Math.min(500, Math.max(10, parseInt(pageSize, 10) || 100));
                const skip = (safePage - 1) * safePageSize;

                const [rawPurchases, total] = await Promise.all([
                    prisma.purchase.findMany({
                        ...buildFindManyArgs(),
                        skip,
                        take: safePageSize
                    }),
                    prisma.purchase.count({ where: whereClause })
                ]);

                const data = await mapPurchasesWithComputedFields(rawPurchases);
                perf({ rows: data.length });

                return {
                    data,
                    total,
                    page: safePage,
                    pageSize: safePageSize,
                    totalPages: Math.max(1, Math.ceil(total / safePageSize))
                };
            }

            const queryArgs = buildFindManyArgs();
            if (limit) {
                queryArgs.take = Math.max(1, parseInt(limit, 10) || 1);
            }

            const rawPurchases = await prisma.purchase.findMany(queryArgs);
            const data = await mapPurchasesWithComputedFields(rawPurchases);
            perf({ rows: data.length });
            return data;
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    async getPurchaseById(purchaseId) {
        try {
            const parsedPurchaseId = parsePositiveInt(purchaseId);
            if (!parsedPurchaseId) return { error: 'Invalid purchase id' };

            const purchase = await prisma.purchase.findUnique({
                where: { id: parsedPurchaseId },
                include: {
                    supplier: true,
                    items: {
                        include: {
                            variant: {
                                include: { product: true }
                            }
                        }
                    },
                    returns: {
                        include: {
                            items: true
                        },
                        orderBy: { createdAt: 'desc' }
                    }
                }
            });

            if (!purchase) return { error: 'Purchase not found' };
            const paymentPresentationByPurchaseId = await buildPurchasePaymentPresentationMap(
                prisma,
                [purchase.id]
            );
            const paymentPresentation = paymentPresentationByPurchaseId.get(purchase.id) || {};
            const totalAmount = Math.max(0, toNumber(purchase?.total, 0));
            const paidAmount = Math.max(0, toNumber(purchase?.paid, 0));
            const fallbackPaymentLabel = paidAmount <= 0
                ? (totalAmount > 0 ? 'آجل' : null)
                : (paidAmount + 0.01 >= totalAmount ? 'نقدي' : 'جزئي');

            return {
                ...purchase,
                payment: paymentPresentation.payment || fallbackPaymentLabel || null,
                paymentMethod: paymentPresentation.paymentMethod || null,
                paymentMethodCode: paymentPresentation.paymentMethodCode || null,
                items: Array.isArray(purchase.items)
                    ? purchase.items.map((item) => ({
                        ...item,
                        price: toNumber(item.cost, 0)
                    }))
                    : []
            };
        } catch (error) {
            return { error: error.message };
        }
    },

    async createPurchase(purchaseData) {
        try {
            return await prisma.$transaction(async (tx) => {
                const parsedSupplierId = parsePositiveInt(purchaseData?.supplierId);
                const safeTotal = Math.max(0, toNumber(purchaseData?.total, 0));
                const safePaid = Math.max(0, toNumber(purchaseData?.paid, 0));
                const invoiceDate = parseDateOrDefault(
                    purchaseData?.invoiceDate ?? purchaseData?.createdAt,
                    new Date()
                );
                const resolvedPaymentMethodId = await resolvePaymentMethodId(
                    tx,
                    purchaseData?.paymentMethodId ?? purchaseData?.paymentMethod ?? purchaseData?.payment,
                    1
                );

                if (!Array.isArray(purchaseData?.items) || purchaseData.items.length === 0) {
                    return { error: 'Purchase items are required' };
                }

                const newPurchase = await tx.purchase.create({
                    data: {
                        supplierId: parsedSupplierId,
                        total: safeTotal,
                        paid: safePaid,
                        notes: purchaseData.notes || null,
                        createdAt: invoiceDate,
                        createdByUserId: getActorUserId(purchaseData?.createdByUserId, purchaseData?.userId)
                    }
                });
                const affectedProductIds = new Set();

                for (let i = 0; i < purchaseData.items.length; i++) {
                    const item = purchaseData.items[i];
                    const variantId = parsePositiveInt(item?.variantId);
                    const quantity = Math.max(1, toInteger(item?.quantity, 1));
                    const cost = Math.max(0, toNumber(item?.cost ?? item?.price, 0));

                    if (!variantId) {
                        return { error: 'Invalid variantId in purchase items' };
                    }

                    await tx.purchaseItem.create({
                        data: {
                            id: i + 1,
                            purchaseId: newPurchase.id,
                            variantId,
                            quantity,
                            cost
                        }
                    });

                    const variantRecord = await tx.variant.findUnique({
                        where: { id: variantId },
                        select: { productId: true }
                    });
                    if (variantRecord?.productId) {
                        affectedProductIds.add(variantRecord.productId);
                    }

                    // زيادة المخزون
                    await tx.variant.update({
                        where: { id: variantId },
                        data: {
                            quantity: { increment: quantity },
                            cost // تحديث سعر التكلفة
                        }
                    });

                    const parsedWarehouseId = parsePositiveInt(purchaseData?.warehouseId);
                    if (parsedWarehouseId && variantRecord?.productId) {
                        try {
                            await tx.variantWarehouseStock.upsert({
                                where: {
                                    variantId_warehouseId: {
                                        variantId,
                                        warehouseId: parsedWarehouseId
                                    }
                                },
                                update: { quantity: { increment: quantity } },
                                create: {
                                    variantId,
                                    warehouseId: parsedWarehouseId,
                                    quantity: quantity
                                }
                            });
                        } catch (warehouseError) {
                            if (isVariantWarehouseStockTableMissingError(warehouseError)) {
                                await tx.warehouseStock.upsert({
                                    where: {
                                        productId_warehouseId: {
                                            productId: variantRecord.productId,
                                            warehouseId: parsedWarehouseId
                                        }
                                    },
                                    update: { quantity: { increment: quantity } },
                                    create: {
                                        productId: variantRecord.productId,
                                        warehouseId: parsedWarehouseId,
                                        quantity: quantity
                                    }
                                });
                            } else if (!isWarehouseSchemaMissingError(warehouseError)) {
                                throw warehouseError;
                            } else {
                                logWarehouseSchemaFallback('createPurchase', warehouseError);
                            }
                        }
                    }
                }

                // تحديث رصيد المورد
                await syncProductInventoriesWithVariants(tx, Array.from(affectedProductIds));

                if (parsedSupplierId) {
                    const remaining = safeTotal - safePaid;
                    await tx.supplier.update({
                        where: { id: parsedSupplierId },
                        data: { balance: { decrement: remaining } }
                    });
                }

                const paidAmount = safePaid;
                if (paidAmount > 0) {
                    const purchaseTreasuryId = await resolveTreasuryId(tx, purchaseData?.treasuryId);
                    const splitRows = await resolvePaymentSplits(tx, {
                        splitPayments: purchaseData?.splitPayments ?? purchaseData?.payments,
                        fallbackPaymentMethodId: resolvedPaymentMethodId || 1,
                        totalAmount: paidAmount
                    });
                    if (splitRows?.error) {
                        return { error: splitRows.error };
                    }

                    for (const splitRow of splitRows) {
                        const splitAmount = Math.max(0, toNumber(splitRow.amount));
                        if (splitAmount <= 0) continue;

                        const treasuryEntryResult = await createTreasuryEntry(tx, {
                            treasuryId: purchaseTreasuryId,
                            entryType: TREASURY_ENTRY_TYPE.PURCHASE_PAYMENT,
                            direction: TREASURY_DIRECTION.OUT,
                            amount: splitAmount,
                            notes: `Purchase #${newPurchase.id}${purchaseData.notes ? ` - ${purchaseData.notes}` : ''}`,
                            note: splitRow?.note || null,
                            referenceType: 'PURCHASE',
                            referenceId: newPurchase.id,
                            paymentMethodId: splitRow.paymentMethodId,
                            entryDate: invoiceDate,
                            allowNegative: true,
                            idempotencyKey: generateIdempotencyKey('PURCHASE_PAYMENT', [
                                newPurchase.id,
                                splitRow.paymentMethodId,
                                normalizeAmountForKey(splitAmount),
                                splitRow.index,
                                'CREATE'
                            ]),
                            createdByUserId: parsePositiveInt(purchaseData?.createdByUserId ?? purchaseData?.userId),
                            meta: {
                                source: 'createPurchase',
                                splitIndex: splitRow.index,
                                splitCount: splitRows.length
                            }
                        });

                        throwIfResultError(treasuryEntryResult);
                    }
                }

                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.PURCHASE_CREATE,
                    entityType: 'Purchase',
                    entityId: newPurchase.id,
                    note: `Create purchase #${newPurchase.id}`,
                    after: newPurchase,
                    referenceType: 'PURCHASE',
                    referenceId: newPurchase.id
                });

                return newPurchase;
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    // ==================== PURCHASES (MANAGE) ====================
    async deletePurchase(purchaseId) {
        const perf = startPerfTimer('db:deletePurchase', {
            purchaseId: parseInt(purchaseId, 10) || null
        });

        try {
            const result = await prisma.$transaction(async (tx) => {
                const parsedPurchaseId = parsePositiveInt(purchaseId);
                if (!parsedPurchaseId) {
                    return { error: 'Invalid purchase id' };
                }

                const purchase = await tx.purchase.findUnique({
                    where: { id: parsedPurchaseId },
                    include: {
                        items: true,
                        returns: {
                            select: { id: true }
                        }
                    }
                });
                if (!purchase) {
                    return { error: 'Purchase not found' };
                }

                if (Array.isArray(purchase.returns) && purchase.returns.length > 0) {
                    return { error: 'لا يمكن حذف فاتورة مشتريات مرتبطة بمرتجع مشتريات.' };
                }

                const oldOutstanding = Math.max(0, toNumber(purchase.total, 0) - toNumber(purchase.paid, 0));
                const affectedProductIds = new Set();

                for (const item of purchase.items || []) {
                    const variantId = parsePositiveInt(item?.variantId);
                    const quantity = Math.max(0, toInteger(item?.quantity, 0));
                    if (!variantId || quantity <= 0) continue;

                    const variantRecord = await tx.variant.findUnique({
                        where: { id: variantId },
                        select: { id: true, productId: true, quantity: true }
                    });
                    if (!variantRecord) {
                        throw new Error(`Variant not found (id: ${variantId})`);
                    }

                    if (toNumber(variantRecord.quantity, 0) < quantity) {
                        throw new Error('لا يمكن حذف الفاتورة لأن بعض الأصناف تم استخدامها من المخزون.');
                    }

                    await tx.variant.update({
                        where: { id: variantId },
                        data: {
                            quantity: { decrement: quantity }
                        }
                    });

                    if (variantRecord.productId) {
                        affectedProductIds.add(variantRecord.productId);
                    }
                }

                await syncProductInventoriesWithVariants(tx, Array.from(affectedProductIds));

                const rollbackResult = await rollbackTreasuryEntriesByReference(tx, 'PURCHASE', parsedPurchaseId);
                throwIfResultError(rollbackResult, 'Failed to rollback purchase treasury entries');

                await tx.purchaseItem.deleteMany({
                    where: { purchaseId: parsedPurchaseId }
                });

                const deletedPurchase = await tx.purchase.delete({
                    where: { id: parsedPurchaseId }
                });

                if (purchase.supplierId && oldOutstanding > 0) {
                    await tx.supplier.update({
                        where: { id: purchase.supplierId },
                        data: { balance: { increment: oldOutstanding } }
                    });
                }

                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.PURCHASE_DELETE,
                    entityType: 'Purchase',
                    entityId: deletedPurchase.id,
                    note: `Delete purchase #${deletedPurchase.id}`,
                    before: purchase,
                    after: deletedPurchase,
                    referenceType: 'PURCHASE',
                    referenceId: deletedPurchase.id
                });

                return { success: true, data: deletedPurchase };
            });

            perf({ rows: result?.success ? 1 : 0 });
            return result;
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    async updatePurchase(purchaseId, purchaseData) {
        const perf = startPerfTimer('db:updatePurchase', {
            purchaseId: parseInt(purchaseId, 10) || null,
            hasSupplier: Object.prototype.hasOwnProperty.call(purchaseData || {}, 'supplierId'),
            itemCount: Array.isArray(purchaseData?.items) ? purchaseData.items.length : 0
        });

        try {
            const result = await prisma.$transaction(async (tx) => {
                const parsedPurchaseId = parsePositiveInt(purchaseId);
                if (!parsedPurchaseId) {
                    return { error: 'Invalid purchase id' };
                }

                const currentPurchase = await tx.purchase.findUnique({
                    where: { id: parsedPurchaseId },
                    include: {
                        items: true,
                        returns: {
                            select: { id: true }
                        }
                    }
                });
                if (!currentPurchase) {
                    return { error: 'Purchase not found' };
                }

                if (Array.isArray(currentPurchase.returns) && currentPurchase.returns.length > 0) {
                    return { error: 'لا يمكن تعديل فاتورة مشتريات مرتبطة بمرتجع مشتريات.' };
                }

                if (!Array.isArray(purchaseData?.items) || purchaseData.items.length === 0) {
                    return { error: 'Purchase items are required' };
                }

                const newSupplierId = Object.prototype.hasOwnProperty.call(purchaseData || {}, 'supplierId')
                    ? parsePositiveInt(purchaseData?.supplierId)
                    : currentPurchase.supplierId;

                const safeTotal = Math.max(0, toNumber(
                    Object.prototype.hasOwnProperty.call(purchaseData || {}, 'total')
                        ? purchaseData.total
                        : currentPurchase.total,
                    0
                ));
                const safePaid = Math.max(0, toNumber(
                    Object.prototype.hasOwnProperty.call(purchaseData || {}, 'paid')
                        ? purchaseData.paid
                        : currentPurchase.paid,
                    0
                ));
                const invoiceDate = parseDateOrDefault(
                    purchaseData?.invoiceDate ?? currentPurchase.createdAt,
                    currentPurchase.createdAt || new Date()
                );
                const oldOutstanding = toNumber(currentPurchase.total, 0) - toNumber(currentPurchase.paid, 0);

                const resolvedPaymentMethodId = await resolvePaymentMethodId(
                    tx,
                    purchaseData?.paymentMethodId ?? purchaseData?.paymentMethod ?? purchaseData?.payment,
                    1
                );
                const affectedProductIds = new Set();

                // Remove old purchase impact from stock first.
                for (const item of currentPurchase.items || []) {
                    const variantId = parsePositiveInt(item?.variantId);
                    const quantity = Math.max(0, toInteger(item?.quantity, 0));
                    if (!variantId || quantity <= 0) continue;

                    const variantRecord = await tx.variant.findUnique({
                        where: { id: variantId },
                        select: { id: true, productId: true, quantity: true }
                    });
                    if (!variantRecord) {
                        throw new Error(`Variant not found (id: ${variantId})`);
                    }

                    if (toNumber(variantRecord.quantity, 0) < quantity) {
                        throw new Error('لا يمكن تعديل الفاتورة لأن بعض الأصناف تم استخدامها من المخزون.');
                    }

                    await tx.variant.update({
                        where: { id: variantId },
                        data: {
                            quantity: { decrement: quantity }
                        }
                    });

                    if (variantRecord.productId) {
                        affectedProductIds.add(variantRecord.productId);
                    }
                }

                await tx.purchaseItem.deleteMany({
                    where: { purchaseId: parsedPurchaseId }
                });

                const parsedWarehouseId = parsePositiveInt(purchaseData?.warehouseId);

                // Apply new purchase items.
                for (let i = 0; i < purchaseData.items.length; i++) {
                    const item = purchaseData.items[i];
                    const variantId = parsePositiveInt(item?.variantId);
                    const quantity = Math.max(1, toInteger(item?.quantity, 1));
                    const cost = Math.max(0, toNumber(item?.cost ?? item?.price, 0));

                    if (!variantId) {
                        throw new Error('Invalid variantId in purchase items');
                    }

                    const variantRecord = await tx.variant.findUnique({
                        where: { id: variantId },
                        select: { id: true, productId: true }
                    });
                    if (!variantRecord) {
                        throw new Error(`Variant not found (id: ${variantId})`);
                    }

                    await tx.purchaseItem.create({
                        data: {
                            id: i + 1,
                            purchaseId: parsedPurchaseId,
                            variantId,
                            quantity,
                            cost
                        }
                    });

                    await tx.variant.update({
                        where: { id: variantId },
                        data: {
                            quantity: { increment: quantity },
                            cost
                        }
                    });

                    if (variantRecord.productId) {
                        affectedProductIds.add(variantRecord.productId);
                    }

                    if (parsedWarehouseId && variantRecord.productId) {
                        try {
                            await tx.variantWarehouseStock.upsert({
                                where: {
                                    variantId_warehouseId: {
                                        variantId,
                                        warehouseId: parsedWarehouseId
                                    }
                                },
                                update: { quantity: { increment: quantity } },
                                create: {
                                    variantId,
                                    warehouseId: parsedWarehouseId,
                                    quantity
                                }
                            });
                        } catch (warehouseError) {
                            if (isVariantWarehouseStockTableMissingError(warehouseError)) {
                                await tx.warehouseStock.upsert({
                                    where: {
                                        productId_warehouseId: {
                                            productId: variantRecord.productId,
                                            warehouseId: parsedWarehouseId
                                        }
                                    },
                                    update: { quantity: { increment: quantity } },
                                    create: {
                                        productId: variantRecord.productId,
                                        warehouseId: parsedWarehouseId,
                                        quantity
                                    }
                                });
                            } else if (!isWarehouseSchemaMissingError(warehouseError)) {
                                throw warehouseError;
                            } else {
                                logWarehouseSchemaFallback('updatePurchase', warehouseError);
                            }
                        }
                    }
                }

                await syncProductInventoriesWithVariants(tx, Array.from(affectedProductIds));

                if (currentPurchase.supplierId && oldOutstanding !== 0) {
                    await tx.supplier.update({
                        where: { id: currentPurchase.supplierId },
                        data: { balance: { increment: oldOutstanding } }
                    });
                }

                const newOutstanding = safeTotal - safePaid;
                if (newSupplierId && newOutstanding !== 0) {
                    await tx.supplier.update({
                        where: { id: newSupplierId },
                        data: { balance: { decrement: newOutstanding } }
                    });
                }

                const updatedPurchase = await tx.purchase.update({
                    where: { id: parsedPurchaseId },
                    data: {
                        supplierId: newSupplierId || null,
                        total: safeTotal,
                        paid: safePaid,
                        notes: purchaseData?.notes || null,
                        createdAt: invoiceDate
                    },
                    include: {
                        supplier: true,
                        items: true,
                        returns: true
                    }
                });

                const rollbackResult = await rollbackTreasuryEntriesByReference(tx, 'PURCHASE', parsedPurchaseId);
                throwIfResultError(rollbackResult, 'Failed to rollback purchase treasury entries');

                if (safePaid > 0) {
                    const purchaseTreasuryId = await resolveTreasuryId(tx, purchaseData?.treasuryId);
                    const splitRows = await resolvePaymentSplits(tx, {
                        splitPayments: purchaseData?.splitPayments ?? purchaseData?.payments,
                        fallbackPaymentMethodId: resolvedPaymentMethodId || 1,
                        totalAmount: safePaid
                    });
                    if (splitRows?.error) {
                        throw new Error(splitRows.error);
                    }

                    for (const splitRow of splitRows) {
                        const splitAmount = Math.max(0, toNumber(splitRow.amount));
                        if (splitAmount <= 0) continue;

                        const treasuryEntryResult = await createTreasuryEntry(tx, {
                            treasuryId: purchaseTreasuryId,
                            entryType: TREASURY_ENTRY_TYPE.PURCHASE_PAYMENT,
                            direction: TREASURY_DIRECTION.OUT,
                            amount: splitAmount,
                            notes: `Purchase update #${updatedPurchase.id}${purchaseData?.notes ? ` - ${purchaseData.notes}` : ''}`,
                            note: splitRow?.note || null,
                            referenceType: 'PURCHASE',
                            referenceId: updatedPurchase.id,
                            paymentMethodId: splitRow.paymentMethodId,
                            entryDate: invoiceDate,
                            allowNegative: true,
                            idempotencyKey: generateIdempotencyKey('PURCHASE_PAYMENT', [
                                updatedPurchase.id,
                                splitRow.paymentMethodId,
                                normalizeAmountForKey(splitAmount),
                                splitRow.index,
                                'UPDATE'
                            ]),
                            createdByUserId: parsePositiveInt(purchaseData?.createdByUserId ?? purchaseData?.userId),
                            meta: {
                                source: 'updatePurchase',
                                splitIndex: splitRow.index,
                                splitCount: splitRows.length
                            }
                        });
                        throwIfResultError(treasuryEntryResult);
                    }
                }

                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.PURCHASE_UPDATE,
                    entityType: 'Purchase',
                    entityId: updatedPurchase.id,
                    note: `Update purchase #${updatedPurchase.id}`,
                    before: currentPurchase,
                    after: updatedPurchase,
                    referenceType: 'PURCHASE',
                    referenceId: updatedPurchase.id
                });

                return { success: true, data: updatedPurchase };
            });

            perf({ rows: result?.success ? 1 : 0 });
            return result;
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    // ==================== RETURNS (المرتجعات) ====================
    async getReturns(options = {}) {
        const perf = startPerfTimer('db:getReturns', {
            hasPagination: Boolean(options?.paginated || options?.page || options?.pageSize),
            limit: options?.limit || null,
            customerId: options?.customerId || null,
            saleId: options?.saleId || null,
            searchLength: String(options?.searchTerm || '').trim().length
        });

        try {
            const {
                customerId,
                saleId,
                limit,
                page,
                pageSize,
                paginated = false,
                fromDate,
                toDate,
                searchTerm = '',
                sortCol = 'createdAt',
                sortDir = 'desc',
                lightweight = false
            } = options || {};

            const hasPagination = Boolean(
                paginated
                || Object.prototype.hasOwnProperty.call(options || {}, 'page')
                || Object.prototype.hasOwnProperty.call(options || {}, 'pageSize')
            );

            const whereClause = {};
            const parsedCustomerId = parsePositiveInt(customerId);
            if (parsedCustomerId) {
                whereClause.customerId = parsedCustomerId;
            }
            const parsedSaleId = parsePositiveInt(saleId);
            if (parsedSaleId) {
                whereClause.saleId = parsedSaleId;
            }

            const parseOptionalFilterDate = (value, endOfDayValue = false) => {
                if (!value) return null;
                const parsedDate = parseDateOrDefault(value, null);
                if (!parsedDate) return null;
                if (endOfDayValue) {
                    parsedDate.setHours(23, 59, 59, 999);
                } else {
                    parsedDate.setHours(0, 0, 0, 0);
                }
                return parsedDate;
            };

            const createdAtRange = {};
            const parsedFromDate = parseOptionalFilterDate(fromDate, false);
            const parsedToDate = parseOptionalFilterDate(toDate, true);
            if (parsedFromDate) createdAtRange.gte = parsedFromDate;
            if (parsedToDate) createdAtRange.lte = parsedToDate;
            if (Object.keys(createdAtRange).length > 0) {
                whereClause.createdAt = createdAtRange;
            }

            const normalizedSearchTerm = String(searchTerm || '').trim();
            if (normalizedSearchTerm) {
                const searchOrFilters = [
                    { notes: { contains: normalizedSearchTerm, mode: 'insensitive' } },
                    { customer: { is: { name: { contains: normalizedSearchTerm, mode: 'insensitive' } } } }
                ];

                const numericSearch = parsePositiveInt(normalizedSearchTerm);
                if (numericSearch) {
                    searchOrFilters.unshift({ id: numericSearch });
                    searchOrFilters.push({ saleId: numericSearch });
                }

                whereClause.AND = [...(whereClause.AND || []), { OR: searchOrFilters }];
            }

            const safeSortDir = String(sortDir).toLowerCase() === 'asc' ? 'asc' : 'desc';
            const sortableColumns = new Set([
                'id',
                'createdAt',
                'total',
                'customer',
                'customerName',
                'saleId'
            ]);
            const safeSortCol = sortableColumns.has(sortCol) ? sortCol : 'createdAt';

            let orderBy;
            if (safeSortCol === 'customer' || safeSortCol === 'customerName') {
                orderBy = [
                    { customer: { name: safeSortDir } },
                    { createdAt: 'desc' },
                    { id: 'desc' }
                ];
            } else if (safeSortCol === 'createdAt') {
                orderBy = [
                    { createdAt: safeSortDir },
                    { id: 'desc' }
                ];
            } else {
                orderBy = { [safeSortCol]: safeSortDir };
            }

            const includeClause = lightweight
                ? {
                    sale: {
                        select: {
                            id: true,
                            total: true,
                            invoiceDate: true,
                            createdAt: true
                        }
                    },
                    customer: {
                        select: {
                            id: true,
                            name: true,
                            phone: true,
                            address: true
                        }
                    },
                    _count: {
                        select: { items: true }
                    }
                }
                : {
                    sale: {
                        include: {
                            customer: true,
                            paymentMethod: true
                        }
                    },
                    customer: true,
                    items: {
                        include: {
                            variant: {
                                include: { product: true }
                            }
                        }
                    }
                };

            const mapReturnsWithComputedFields = (rawReturns) => {
                if (!Array.isArray(rawReturns) || rawReturns.length === 0) return [];

                return rawReturns.map((row) => ({
                    ...row,
                    total: Math.max(0, toNumber(row?.total, 0)),
                    itemsCount: typeof row?._count?.items === 'number'
                        ? row._count.items
                        : (Array.isArray(row?.items) ? row.items.length : 0)
                }));
            };

            const buildFindManyArgs = () => ({
                where: whereClause,
                include: includeClause,
                orderBy
            });

            if (hasPagination) {
                const safePage = Math.max(1, parseInt(page, 10) || 1);
                const safePageSize = Math.min(500, Math.max(10, parseInt(pageSize, 10) || 100));
                const skip = (safePage - 1) * safePageSize;

                const [rawReturns, total] = await Promise.all([
                    prisma.return.findMany({
                        ...buildFindManyArgs(),
                        skip,
                        take: safePageSize
                    }),
                    prisma.return.count({ where: whereClause })
                ]);

                const data = mapReturnsWithComputedFields(rawReturns);
                perf({ rows: data.length });

                return {
                    data,
                    total,
                    page: safePage,
                    pageSize: safePageSize,
                    totalPages: Math.max(1, Math.ceil(total / safePageSize))
                };
            }

            const queryArgs = buildFindManyArgs();
            if (limit) {
                queryArgs.take = Math.max(1, parseInt(limit, 10) || 1);
            }

            const rawReturns = await prisma.return.findMany(queryArgs);
            const data = mapReturnsWithComputedFields(rawReturns);
            perf({ rows: data.length });
            return data;
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    async getReturnById(returnId) {
        try {
            const parsedReturnId = parsePositiveInt(returnId);
            if (!parsedReturnId) return { error: 'Invalid return id' };

            const returnInvoice = await prisma.return.findUnique({
                where: { id: parsedReturnId },
                include: {
                    sale: {
                        include: {
                            customer: true,
                            paymentMethod: true
                        }
                    },
                    customer: true,
                    items: {
                        include: {
                            variant: {
                                include: { product: true }
                            }
                        }
                    }
                }
            });

            if (!returnInvoice) return { error: 'Return not found' };
            return {
                ...returnInvoice,
                total: Math.max(0, toNumber(returnInvoice?.total, 0)),
                itemsCount: Array.isArray(returnInvoice?.items) ? returnInvoice.items.length : 0
            };
        } catch (error) {
            return { error: error.message };
        }
    },

    async createReturn(returnData) {
        const perf = startPerfTimer('db:createReturn', {
            hasCustomer: Boolean(returnData?.customerId),
            itemCount: Array.isArray(returnData?.items) ? returnData.items.length : 0
        });

        try {
            const result = await prisma.$transaction(async (tx) => {
                const returnDate = parseDateOrDefault(returnData?.returnDate, new Date());
                const newReturn = await tx.return.create({
                    data: {
                        saleId: returnData.saleId ? parseInt(returnData.saleId) : null,
                        customerId: returnData.customerId ? parseInt(returnData.customerId) : null,
                        total: parseFloat(returnData.total),
                        notes: returnData.notes || null,
                        createdByUserId: getActorUserId(returnData?.createdByUserId, returnData?.userId)
                    }
                });
                const affectedProductIds = new Set();

                for (let i = 0; i < returnData.items.length; i++) {
                    const item = returnData.items[i];

                    await tx.returnItem.create({
                        data: {
                            id: i + 1,
                            returnId: newReturn.id,
                            variantId: parseInt(item.variantId),
                            quantity: parseInt(item.quantity),
                            price: parseFloat(item.price)
                        }
                    });

                    // إرجاع الكمية للمخزون
                    const updatedVariant = await tx.variant.update({
                        where: { id: parseInt(item.variantId) },
                        data: { quantity: { increment: parseInt(item.quantity) } },
                        select: { productId: true }
                    });
                    if (updatedVariant?.productId) {
                        affectedProductIds.add(updatedVariant.productId);
                    }
                }

                await syncProductInventoriesWithVariants(tx, Array.from(affectedProductIds));

                // إنشاء سجل مرتجعات في CustomerTransaction
                if (returnData.customerId) {
                    const parsedCustomerId = parseInt(returnData.customerId);
                    const returnAmount = Math.max(0, toNumber(returnData.total));

                    await tx.customerTransaction.create({
                        data: {
                            customerId: parsedCustomerId,
                            date: returnDate,
                            type: 'RETURN',
                            referenceType: 'RETURN',
                            referenceId: newReturn.id,
                            debit: 0,
                            credit: returnAmount,
                            notes: `مرتجع #${newReturn.id} - ${returnData.notes || 'مرتجع'}`,
                            createdByUserId: getActorUserId(returnData?.createdByUserId, returnData?.userId)
                        }
                    });

                    await applyCustomerFinancialDelta(tx, {
                        customerId: parsedCustomerId,
                        balanceDelta: -returnAmount,
                        activityDate: returnDate
                    });
                }

                const refundAmount = Math.max(0, toNumber(
                    returnData?.refundAmount !== undefined ? returnData.refundAmount : returnData.total
                ));
                if (refundAmount > 0) {
                    const returnTreasuryId = await resolveTreasuryId(tx, returnData?.treasuryId);
                    const refundMode = String(returnData?.refundMode || REFUND_MODE.SAME_METHOD)
                        .trim()
                        .toUpperCase();

                    let resolvedPaymentMethodId;
                    if (refundMode === REFUND_MODE.CASH_ONLY) {
                        resolvedPaymentMethodId = await resolveCashPaymentMethodId(tx, 1);
                    } else {
                        let sameMethodCandidate = returnData?.paymentMethodId ?? returnData?.paymentMethod;
                        if (!sameMethodCandidate && returnData?.saleId) {
                            const sourceSale = await tx.sale.findUnique({
                                where: { id: parsePositiveInt(returnData.saleId) || 0 },
                                select: { paymentMethodId: true }
                            });
                            sameMethodCandidate = sourceSale?.paymentMethodId || null;
                        }
                        resolvedPaymentMethodId = await resolvePaymentMethodId(
                            tx,
                            sameMethodCandidate,
                            1
                        );
                    }

                    const treasuryEntryResult = await createTreasuryEntry(tx, {
                        treasuryId: returnTreasuryId,
                        entryType: TREASURY_ENTRY_TYPE.RETURN_REFUND,
                        direction: TREASURY_DIRECTION.OUT,
                        amount: refundAmount,
                        notes: `Return #${newReturn.id}${returnData.notes ? ` - ${returnData.notes}` : ''}`,
                        referenceType: 'RETURN',
                        referenceId: newReturn.id,
                        paymentMethodId: resolvedPaymentMethodId,
                        entryDate: returnDate,
                        allowNegative: true,
                        idempotencyKey: generateIdempotencyKey('RETURN_REFUND', [
                            newReturn.id,
                            resolvedPaymentMethodId,
                            normalizeAmountForKey(refundAmount),
                            refundMode
                        ]),
                        createdByUserId: getActorUserId(returnData?.createdByUserId, returnData?.userId),
                        meta: {
                            refundMode
                        }
                    });

                    throwIfResultError(treasuryEntryResult);
                }

                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.SALES_RETURN_CREATE,
                    entityType: 'Return',
                    entityId: newReturn.id,
                    note: `Create sales return #${newReturn.id}`,
                    after: newReturn,
                    referenceType: 'RETURN',
                    referenceId: newReturn.id
                });

                return newReturn;
            });

            perf({ rows: 1 });
            return result;
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    async updateReturn(returnId, returnData) {
        const perf = startPerfTimer('db:updateReturn', {
            returnId: parseInt(returnId, 10) || null,
            hasCustomer: Boolean(returnData?.customerId),
            itemCount: Array.isArray(returnData?.items) ? returnData.items.length : 0
        });

        try {
            const result = await prisma.$transaction(async (tx) => {
                const parsedReturnId = parsePositiveInt(returnId);
                if (!parsedReturnId) {
                    return { error: 'Invalid return id' };
                }

                if (!Array.isArray(returnData?.items) || returnData.items.length === 0) {
                    return { error: 'Return items are required' };
                }

                const currentReturn = await tx.return.findUnique({
                    where: { id: parsedReturnId },
                    include: {
                        items: true
                    }
                });

                if (!currentReturn) {
                    return { error: 'Return not found' };
                }

                const oldTransactions = await tx.customerTransaction.findMany({
                    where: {
                        referenceType: 'RETURN',
                        referenceId: parsedReturnId
                    },
                    select: {
                        debit: true,
                        credit: true
                    }
                });
                const oldReturnDelta = oldTransactions.reduce((sum, trx) => (
                    sum + (toNumber(trx.debit) - toNumber(trx.credit))
                ), 0);

                const hasReturnDateUpdate = Object.prototype.hasOwnProperty.call(returnData || {}, 'returnDate');
                const returnDate = hasReturnDateUpdate
                    ? resolveEditedDateKeepingPosition(
                        returnData?.returnDate,
                        currentReturn?.createdAt || new Date()
                    )
                    : (toValidDate(currentReturn?.createdAt) || new Date());
                const nextCustomerId = Object.prototype.hasOwnProperty.call(returnData || {}, 'customerId')
                    ? parsePositiveInt(returnData?.customerId)
                    : parsePositiveInt(currentReturn.customerId);
                const nextSaleId = Object.prototype.hasOwnProperty.call(returnData || {}, 'saleId')
                    ? parsePositiveInt(returnData?.saleId)
                    : parsePositiveInt(currentReturn.saleId);

                const affectedProductIds = new Set();

                // Revert old stock impact first.
                for (const oldItem of currentReturn.items || []) {
                    const variantId = parsePositiveInt(oldItem?.variantId);
                    const quantity = Math.max(0, toInteger(oldItem?.quantity, 0));
                    if (!variantId || quantity <= 0) continue;

                    const variant = await tx.variant.findUnique({
                        where: { id: variantId },
                        select: { id: true, productId: true, quantity: true }
                    });
                    if (!variant) {
                        return { error: 'Variant not found while reverting return' };
                    }
                    if (toNumber(variant.quantity, 0) < quantity) {
                        return { error: 'Insufficient stock to revert previous return quantities' };
                    }
                    if (variant.productId) {
                        affectedProductIds.add(variant.productId);
                    }

                    await tx.variant.update({
                        where: { id: variantId },
                        data: {
                            quantity: { decrement: quantity }
                        }
                    });
                }

                await tx.customerTransaction.deleteMany({
                    where: {
                        referenceType: 'RETURN',
                        referenceId: parsedReturnId
                    }
                });
                const rollbackResult = await rollbackTreasuryEntriesByReference(tx, 'RETURN', parsedReturnId);
                throwIfResultError(rollbackResult, 'Failed to rollback return treasury entries');

                await tx.returnItem.deleteMany({
                    where: { returnId: parsedReturnId }
                });

                let computedTotal = 0;
                for (let i = 0; i < returnData.items.length; i++) {
                    const item = returnData.items[i];
                    const variantId = parsePositiveInt(item?.variantId);
                    const quantity = Math.max(1, toInteger(item?.quantity, 1));
                    const price = Math.max(0, toNumber(item?.price, 0));
                    if (!variantId) {
                        return { error: 'Invalid variantId in return items' };
                    }

                    const variant = await tx.variant.findUnique({
                        where: { id: variantId },
                        select: { id: true, productId: true }
                    });
                    if (!variant) {
                        return { error: 'Variant not found in return items' };
                    }
                    if (variant.productId) {
                        affectedProductIds.add(variant.productId);
                    }

                    await tx.returnItem.create({
                        data: {
                            id: i + 1,
                            returnId: parsedReturnId,
                            variantId,
                            quantity,
                            price
                        }
                    });

                    await tx.variant.update({
                        where: { id: variantId },
                        data: {
                            quantity: { increment: quantity }
                        }
                    });

                    computedTotal += price * quantity;
                }

                const requestedTotal = Math.max(0, toNumber(returnData?.total, 0));
                const finalTotal = Math.max(0, toNumber(
                    requestedTotal > 0 ? requestedTotal : computedTotal
                ));

                const updatedReturn = await tx.return.update({
                    where: { id: parsedReturnId },
                    data: {
                        saleId: nextSaleId || null,
                        customerId: nextCustomerId || null,
                        total: finalTotal,
                        notes: returnData?.notes || null,
                        createdAt: returnDate
                    }
                });

                // Reverse old customer effect then apply new one.
                if (currentReturn.customerId && oldReturnDelta !== 0) {
                    await applyCustomerFinancialDelta(tx, {
                        customerId: currentReturn.customerId,
                        balanceDelta: -oldReturnDelta,
                        activityDate: returnDate
                    });
                }

                if (nextCustomerId) {
                    await tx.customerTransaction.create({
                        data: {
                            customerId: nextCustomerId,
                            date: returnDate,
                            type: 'RETURN',
                            referenceType: 'RETURN',
                            referenceId: parsedReturnId,
                            debit: 0,
                            credit: finalTotal,
                            notes: `مرتجع #${parsedReturnId} - ${returnData?.notes || 'مرتجع'}`
                        }
                    });

                    if (finalTotal > 0) {
                        await applyCustomerFinancialDelta(tx, {
                            customerId: nextCustomerId,
                            balanceDelta: -finalTotal,
                            activityDate: returnDate
                        });
                    }
                }

                const refundAmount = Math.max(0, toNumber(
                    returnData?.refundAmount !== undefined ? returnData.refundAmount : finalTotal
                ));
                if (refundAmount > 0) {
                    const returnTreasuryId = await resolveTreasuryId(tx, returnData?.treasuryId);
                    const refundMode = String(returnData?.refundMode || REFUND_MODE.SAME_METHOD)
                        .trim()
                        .toUpperCase();

                    let resolvedPaymentMethodId;
                    if (refundMode === REFUND_MODE.CASH_ONLY) {
                        resolvedPaymentMethodId = await resolveCashPaymentMethodId(tx, 1);
                    } else {
                        let sameMethodCandidate = returnData?.paymentMethodId ?? returnData?.paymentMethod;
                        if (!sameMethodCandidate && nextSaleId) {
                            const sourceSale = await tx.sale.findUnique({
                                where: { id: nextSaleId },
                                select: { paymentMethodId: true }
                            });
                            sameMethodCandidate = sourceSale?.paymentMethodId || null;
                        }
                        resolvedPaymentMethodId = await resolvePaymentMethodId(
                            tx,
                            sameMethodCandidate,
                            1
                        );
                    }

                    const treasuryEntryResult = await createTreasuryEntry(tx, {
                        treasuryId: returnTreasuryId,
                        entryType: TREASURY_ENTRY_TYPE.RETURN_REFUND,
                        direction: TREASURY_DIRECTION.OUT,
                        amount: refundAmount,
                        notes: `Return #${parsedReturnId}${returnData?.notes ? ` - ${returnData.notes}` : ''}`,
                        referenceType: 'RETURN',
                        referenceId: parsedReturnId,
                        paymentMethodId: resolvedPaymentMethodId,
                        entryDate: returnDate,
                        allowNegative: true,
                        idempotencyKey: generateIdempotencyKey('RETURN_REFUND', [
                            parsedReturnId,
                            resolvedPaymentMethodId,
                            normalizeAmountForKey(refundAmount),
                            refundMode
                        ]),
                        createdByUserId: parsePositiveInt(returnData?.createdByUserId ?? returnData?.userId),
                        meta: {
                            refundMode
                        }
                    });
                    throwIfResultError(treasuryEntryResult);
                }

                const recalcCustomerIds = new Set();
                if (currentReturn.customerId) recalcCustomerIds.add(currentReturn.customerId);
                if (nextCustomerId) recalcCustomerIds.add(nextCustomerId);
                for (const customerId of recalcCustomerIds) {
                    await recalculateCustomerActivityDates(tx, customerId);
                }

                await syncProductInventoriesWithVariants(tx, Array.from(affectedProductIds));

                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.SALES_RETURN_UPDATE,
                    entityType: 'Return',
                    entityId: updatedReturn.id,
                    note: `Update sales return #${updatedReturn.id}`,
                    before: currentReturn,
                    after: updatedReturn,
                    referenceType: 'RETURN',
                    referenceId: updatedReturn.id
                });

                return { success: true, data: updatedReturn };
            });

            perf({ rows: result?.success ? 1 : 0 });
            return result;
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    async deleteReturn(returnId) {
        const perf = startPerfTimer('db:deleteReturn', {
            returnId: parseInt(returnId, 10) || null
        });

        try {
            const result = await prisma.$transaction(async (tx) => {
                const parsedReturnId = parsePositiveInt(returnId);
                if (!parsedReturnId) {
                    return { error: 'Invalid return id' };
                }

                const currentReturn = await tx.return.findUnique({
                    where: { id: parsedReturnId },
                    include: {
                        items: true
                    }
                });
                if (!currentReturn) {
                    return { error: 'Return not found' };
                }

                const returnTransactions = await tx.customerTransaction.findMany({
                    where: {
                        referenceType: 'RETURN',
                        referenceId: parsedReturnId
                    },
                    select: {
                        debit: true,
                        credit: true
                    }
                });
                const previousReturnDelta = returnTransactions.reduce((sum, trx) => (
                    sum + (toNumber(trx.debit) - toNumber(trx.credit))
                ), 0);

                const affectedProductIds = new Set();

                for (const item of currentReturn.items || []) {
                    const variantId = parsePositiveInt(item?.variantId);
                    const quantity = Math.max(0, toInteger(item?.quantity, 0));
                    if (!variantId || quantity <= 0) continue;

                    const variant = await tx.variant.findUnique({
                        where: { id: variantId },
                        select: { id: true, productId: true, quantity: true }
                    });
                    if (!variant) {
                        return { error: 'Variant not found while deleting return' };
                    }
                    if (toNumber(variant.quantity, 0) < quantity) {
                        return { error: 'Insufficient stock to delete this return' };
                    }
                    if (variant.productId) {
                        affectedProductIds.add(variant.productId);
                    }

                    await tx.variant.update({
                        where: { id: variantId },
                        data: {
                            quantity: { decrement: quantity }
                        }
                    });
                }

                await syncProductInventoriesWithVariants(tx, Array.from(affectedProductIds));

                await tx.customerTransaction.deleteMany({
                    where: {
                        referenceType: 'RETURN',
                        referenceId: parsedReturnId
                    }
                });
                const rollbackResult = await rollbackTreasuryEntriesByReference(tx, 'RETURN', parsedReturnId);
                throwIfResultError(rollbackResult, 'Failed to rollback return treasury entries');

                await tx.returnItem.deleteMany({
                    where: { returnId: parsedReturnId }
                });

                const deletedReturn = await tx.return.delete({
                    where: { id: parsedReturnId }
                });

                if (currentReturn.customerId && previousReturnDelta !== 0) {
                    await applyCustomerFinancialDelta(tx, {
                        customerId: currentReturn.customerId,
                        balanceDelta: -previousReturnDelta
                    });
                }
                if (currentReturn.customerId) {
                    await recalculateCustomerActivityDates(tx, currentReturn.customerId);
                }

                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.SALES_RETURN_DELETE,
                    entityType: 'Return',
                    entityId: deletedReturn.id,
                    note: `Delete sales return #${deletedReturn.id}`,
                    before: currentReturn,
                    after: deletedReturn,
                    referenceType: 'RETURN',
                    referenceId: deletedReturn.id
                });

                return { success: true, data: deletedReturn };
            });

            perf({ rows: result?.success ? 1 : 0 });
            return result;
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    async getPurchaseReturns(options = {}) {
        const perf = startPerfTimer('db:getPurchaseReturns', {
            hasPagination: Boolean(options?.paginated || options?.page || options?.pageSize),
            limit: options?.limit || null,
            supplierId: options?.supplierId || null,
            purchaseId: options?.purchaseId || null,
            searchLength: String(options?.searchTerm || '').trim().length
        });

        try {
            const {
                supplierId,
                purchaseId,
                limit,
                page,
                pageSize,
                paginated = false,
                fromDate,
                toDate,
                searchTerm = '',
                sortCol = 'createdAt',
                sortDir = 'desc',
                lightweight = false
            } = options || {};

            const hasPagination = Boolean(
                paginated
                || Object.prototype.hasOwnProperty.call(options || {}, 'page')
                || Object.prototype.hasOwnProperty.call(options || {}, 'pageSize')
            );

            const whereClause = {};
            const parsedSupplierId = parsePositiveInt(supplierId);
            if (parsedSupplierId) {
                whereClause.supplierId = parsedSupplierId;
            }
            const parsedPurchaseId = parsePositiveInt(purchaseId);
            if (parsedPurchaseId) {
                whereClause.purchaseId = parsedPurchaseId;
            }

            const parseOptionalFilterDate = (value, endOfDayValue = false) => {
                if (!value) return null;
                const parsedDate = parseDateOrDefault(value, null);
                if (!parsedDate) return null;
                if (endOfDayValue) {
                    parsedDate.setHours(23, 59, 59, 999);
                } else {
                    parsedDate.setHours(0, 0, 0, 0);
                }
                return parsedDate;
            };

            const createdAtRange = {};
            const parsedFromDate = parseOptionalFilterDate(fromDate, false);
            const parsedToDate = parseOptionalFilterDate(toDate, true);
            if (parsedFromDate) createdAtRange.gte = parsedFromDate;
            if (parsedToDate) createdAtRange.lte = parsedToDate;
            if (Object.keys(createdAtRange).length > 0) {
                whereClause.createdAt = createdAtRange;
            }

            const normalizedSearchTerm = String(searchTerm || '').trim();
            if (normalizedSearchTerm) {
                const searchOrFilters = [
                    { notes: { contains: normalizedSearchTerm, mode: 'insensitive' } },
                    { supplier: { is: { name: { contains: normalizedSearchTerm, mode: 'insensitive' } } } }
                ];

                const numericSearch = parsePositiveInt(normalizedSearchTerm);
                if (numericSearch) {
                    searchOrFilters.unshift({ id: numericSearch });
                    searchOrFilters.push({ purchaseId: numericSearch });
                }

                whereClause.AND = [...(whereClause.AND || []), { OR: searchOrFilters }];
            }

            const safeSortDir = String(sortDir).toLowerCase() === 'asc' ? 'asc' : 'desc';
            const sortableColumns = new Set([
                'id',
                'createdAt',
                'total',
                'supplier',
                'supplierName',
                'purchaseId'
            ]);
            const safeSortCol = sortableColumns.has(sortCol) ? sortCol : 'createdAt';

            let orderBy;
            if (safeSortCol === 'supplier' || safeSortCol === 'supplierName') {
                orderBy = [
                    { supplier: { name: safeSortDir } },
                    { createdAt: 'desc' },
                    { id: 'desc' }
                ];
            } else if (safeSortCol === 'createdAt') {
                orderBy = [
                    { createdAt: safeSortDir },
                    { id: 'desc' }
                ];
            } else {
                orderBy = { [safeSortCol]: safeSortDir };
            }

            const includeClause = lightweight
                ? {
                    purchase: {
                        select: {
                            id: true,
                            total: true,
                            createdAt: true
                        }
                    },
                    supplier: {
                        select: {
                            id: true,
                            name: true,
                            phone: true,
                            address: true
                        }
                    },
                    _count: {
                        select: { items: true }
                    }
                }
                : {
                    purchase: {
                        include: {
                            supplier: true
                        }
                    },
                    supplier: true,
                    items: {
                        include: {
                            variant: {
                                include: { product: true }
                            }
                        }
                    }
                };

            const mapPurchaseReturnsWithComputedFields = (rawRows) => {
                if (!Array.isArray(rawRows) || rawRows.length === 0) return [];
                return rawRows.map((row) => ({
                    ...row,
                    total: Math.max(0, toNumber(row?.total, 0)),
                    itemsCount: typeof row?._count?.items === 'number'
                        ? row._count.items
                        : (Array.isArray(row?.items) ? row.items.length : 0)
                }));
            };

            const buildFindManyArgs = () => ({
                where: whereClause,
                include: includeClause,
                orderBy
            });

            if (hasPagination) {
                const safePage = Math.max(1, parseInt(page, 10) || 1);
                const safePageSize = Math.min(500, Math.max(10, parseInt(pageSize, 10) || 100));
                const skip = (safePage - 1) * safePageSize;

                const [rawRows, total] = await Promise.all([
                    prisma.purchaseReturn.findMany({
                        ...buildFindManyArgs(),
                        skip,
                        take: safePageSize
                    }),
                    prisma.purchaseReturn.count({ where: whereClause })
                ]);

                const data = mapPurchaseReturnsWithComputedFields(rawRows);
                perf({ rows: data.length });

                return {
                    data,
                    total,
                    page: safePage,
                    pageSize: safePageSize,
                    totalPages: Math.max(1, Math.ceil(total / safePageSize))
                };
            }

            const queryArgs = buildFindManyArgs();
            if (limit) {
                queryArgs.take = Math.max(1, parseInt(limit, 10) || 1);
            }

            const rawRows = await prisma.purchaseReturn.findMany(queryArgs);
            const data = mapPurchaseReturnsWithComputedFields(rawRows);
            perf({ rows: data.length });
            return data;
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    async getPurchaseReturnById(returnId) {
        try {
            const parsedReturnId = parsePositiveInt(returnId);
            if (!parsedReturnId) return { error: 'Invalid purchase return id' };

            const returnInvoice = await prisma.purchaseReturn.findUnique({
                where: { id: parsedReturnId },
                include: {
                    purchase: {
                        include: {
                            supplier: true
                        }
                    },
                    supplier: true,
                    items: {
                        include: {
                            variant: {
                                include: { product: true }
                            }
                        }
                    }
                }
            });

            if (!returnInvoice) return { error: 'Purchase return not found' };
            return {
                ...returnInvoice,
                total: Math.max(0, toNumber(returnInvoice?.total, 0)),
                itemsCount: Array.isArray(returnInvoice?.items) ? returnInvoice.items.length : 0
            };
        } catch (error) {
            return { error: error.message };
        }
    },

    async createPurchaseReturn(returnData) {
        const perf = startPerfTimer('db:createPurchaseReturn', {
            hasSupplier: Boolean(returnData?.supplierId),
            itemCount: Array.isArray(returnData?.items) ? returnData.items.length : 0
        });

        try {
            const result = await prisma.$transaction(async (tx) => {
                if (!Array.isArray(returnData?.items) || returnData.items.length === 0) {
                    throw new Error('Purchase return items are required');
                }

                const returnDate = parseDateOrDefault(returnData?.returnDate, new Date());
                const parsedPurchaseId = parsePositiveInt(returnData?.purchaseId);
                let effectiveSupplierId = parsePositiveInt(returnData?.supplierId);
                const requestedTotal = Math.max(0, toNumber(returnData?.total, 0));
                const purchasedQtyByVariant = new Map();
                const returnedQtyByVariant = new Map();

                if (parsedPurchaseId) {
                    const sourcePurchase = await tx.purchase.findUnique({
                        where: { id: parsedPurchaseId },
                        include: {
                            items: true,
                            returns: {
                                include: {
                                    items: true
                                }
                            }
                        }
                    });
                    if (!sourcePurchase) {
                        throw new Error('Purchase not found for purchase return');
                    }

                    if (sourcePurchase.supplierId && effectiveSupplierId && sourcePurchase.supplierId !== effectiveSupplierId) {
                        throw new Error('Supplier does not match selected purchase');
                    }
                    if (!effectiveSupplierId && sourcePurchase.supplierId) {
                        effectiveSupplierId = sourcePurchase.supplierId;
                    }

                    for (const purchaseItem of sourcePurchase.items || []) {
                        const variantId = parsePositiveInt(purchaseItem?.variantId);
                        if (!variantId) continue;
                        const qty = Math.max(0, toInteger(purchaseItem?.quantity, 0));
                        purchasedQtyByVariant.set(variantId, (purchasedQtyByVariant.get(variantId) || 0) + qty);
                    }
                    for (const prevReturn of sourcePurchase.returns || []) {
                        for (const prevItem of prevReturn.items || []) {
                            const variantId = parsePositiveInt(prevItem?.variantId);
                            if (!variantId) continue;
                            const qty = Math.max(0, toInteger(prevItem?.quantity, 0));
                            returnedQtyByVariant.set(variantId, (returnedQtyByVariant.get(variantId) || 0) + qty);
                        }
                    }
                }

                const newPurchaseReturn = await tx.purchaseReturn.create({
                    data: {
                        purchaseId: parsedPurchaseId || null,
                        supplierId: effectiveSupplierId || null,
                        total: requestedTotal,
                        notes: returnData?.notes || null,
                        createdAt: returnDate,
                        createdByUserId: getActorUserId(returnData?.createdByUserId, returnData?.userId)
                    }
                });

                let computedTotal = 0;
                const affectedProductIds = new Set();
                for (let i = 0; i < returnData.items.length; i++) {
                    const item = returnData.items[i];
                    const variantId = parsePositiveInt(item?.variantId);
                    const quantity = Math.max(1, toInteger(item?.quantity, 1));
                    const price = Math.max(0, toNumber(item?.price, 0));
                    if (!variantId) {
                        throw new Error('Invalid variantId in purchase return items');
                    }

                    if (parsedPurchaseId) {
                        const purchasedQty = Math.max(0, purchasedQtyByVariant.get(variantId) || 0);
                        const alreadyReturnedQty = Math.max(0, returnedQtyByVariant.get(variantId) || 0);
                        const remainingQty = Math.max(0, purchasedQty - alreadyReturnedQty);
                        if (purchasedQty <= 0) {
                            throw new Error('Variant does not exist in selected purchase');
                        }
                        if (quantity > remainingQty) {
                            throw new Error('Requested return quantity exceeds purchase remaining quantity');
                        }
                        returnedQtyByVariant.set(variantId, alreadyReturnedQty + quantity);
                    }

                    const variant = await tx.variant.findUnique({
                        where: { id: variantId },
                        select: { id: true, productId: true, quantity: true }
                    });
                    if (!variant) {
                        throw new Error('Variant not found in purchase return items');
                    }
                    if (variant.productId) {
                        affectedProductIds.add(variant.productId);
                    }

                    if (toNumber(variant.quantity, 0) < quantity) {
                        throw new Error('Insufficient stock quantity for purchase return');
                    }

                    await tx.purchaseReturnItem.create({
                        data: {
                            id: i + 1,
                            purchaseReturnId: newPurchaseReturn.id,
                            variantId,
                            quantity,
                            price
                        }
                    });

                    await tx.variant.update({
                        where: { id: variantId },
                        data: {
                            quantity: { decrement: quantity }
                        }
                    });

                    computedTotal += price * quantity;
                }

                await syncProductInventoriesWithVariants(tx, Array.from(affectedProductIds));

                const finalTotal = Math.max(0, toNumber(
                    requestedTotal > 0 ? requestedTotal : computedTotal
                ));
                if (Math.abs(finalTotal - requestedTotal) > 0.009) {
                    await tx.purchaseReturn.update({
                        where: { id: newPurchaseReturn.id },
                        data: { total: finalTotal }
                    });
                }

                if (effectiveSupplierId) {
                    await tx.supplier.update({
                        where: { id: effectiveSupplierId },
                        data: {
                            balance: { increment: finalTotal }
                        }
                    });
                }

                const refundAmount = Math.max(0, toNumber(
                    returnData?.refundAmount !== undefined ? returnData.refundAmount : finalTotal
                ));
                if (refundAmount > 0) {
                    const returnTreasuryId = await resolveTreasuryId(tx, returnData?.treasuryId);
                    const refundMode = String(returnData?.refundMode || REFUND_MODE.SAME_METHOD)
                        .trim()
                        .toUpperCase();

                    let resolvedPaymentMethodId;
                    if (refundMode === REFUND_MODE.CASH_ONLY) {
                        resolvedPaymentMethodId = await resolveCashPaymentMethodId(tx, 1);
                    } else {
                        const sameMethodCandidate = returnData?.paymentMethodId ?? returnData?.paymentMethod;
                        resolvedPaymentMethodId = await resolvePaymentMethodId(
                            tx,
                            sameMethodCandidate,
                            1
                        );
                    }

                    const treasuryEntryResult = await createTreasuryEntry(tx, {
                        treasuryId: returnTreasuryId,
                        entryType: TREASURY_ENTRY_TYPE.RETURN_REFUND,
                        direction: TREASURY_DIRECTION.IN,
                        amount: refundAmount,
                        notes: `Purchase Return #${newPurchaseReturn.id}${returnData?.notes ? ` - ${returnData.notes}` : ''}`,
                        referenceType: 'PURCHASE_RETURN',
                        referenceId: newPurchaseReturn.id,
                        paymentMethodId: resolvedPaymentMethodId,
                        entryDate: returnDate,
                        idempotencyKey: generateIdempotencyKey('PURCHASE_RETURN_REFUND', [
                            newPurchaseReturn.id,
                            resolvedPaymentMethodId,
                            normalizeAmountForKey(refundAmount),
                            refundMode
                        ]),
                        createdByUserId: parsePositiveInt(returnData?.createdByUserId ?? returnData?.userId),
                        meta: {
                            refundMode
                        }
                    });
                    throwIfResultError(treasuryEntryResult);
                }

                const createdPurchaseReturn = {
                    ...newPurchaseReturn,
                    total: finalTotal
                };
                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.PURCHASE_RETURN_CREATE,
                    entityType: 'PurchaseReturn',
                    entityId: newPurchaseReturn.id,
                    note: `Create purchase return #${newPurchaseReturn.id}`,
                    after: createdPurchaseReturn,
                    referenceType: 'PURCHASE_RETURN',
                    referenceId: newPurchaseReturn.id
                });

                return createdPurchaseReturn;
            });

            perf({ rows: 1 });
            return result;
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    async updatePurchaseReturn(returnId, returnData) {
        const perf = startPerfTimer('db:updatePurchaseReturn', {
            returnId: parseInt(returnId, 10) || null,
            hasSupplier: Boolean(returnData?.supplierId),
            itemCount: Array.isArray(returnData?.items) ? returnData.items.length : 0
        });

        try {
            const result = await prisma.$transaction(async (tx) => {
                const parsedReturnId = parsePositiveInt(returnId);
                if (!parsedReturnId) {
                    return { error: 'Invalid purchase return id' };
                }

                if (!Array.isArray(returnData?.items) || returnData.items.length === 0) {
                    return { error: 'Purchase return items are required' };
                }

                const currentReturn = await tx.purchaseReturn.findUnique({
                    where: { id: parsedReturnId },
                    include: {
                        items: true
                    }
                });
                if (!currentReturn) {
                    return { error: 'Purchase return not found' };
                }

                const oldSupplierId = parsePositiveInt(currentReturn.supplierId);
                const oldTotal = Math.max(0, toNumber(currentReturn.total, 0));

                const hasReturnDateUpdate = Object.prototype.hasOwnProperty.call(returnData || {}, 'returnDate');
                const returnDate = hasReturnDateUpdate
                    ? resolveEditedDateKeepingPosition(
                        returnData?.returnDate,
                        currentReturn?.createdAt || new Date()
                    )
                    : (toValidDate(currentReturn?.createdAt) || new Date());
                const nextPurchaseId = Object.prototype.hasOwnProperty.call(returnData || {}, 'purchaseId')
                    ? parsePositiveInt(returnData?.purchaseId)
                    : parsePositiveInt(currentReturn.purchaseId);
                let nextSupplierId = Object.prototype.hasOwnProperty.call(returnData || {}, 'supplierId')
                    ? parsePositiveInt(returnData?.supplierId)
                    : parsePositiveInt(currentReturn.supplierId);

                const purchasedQtyByVariant = new Map();
                const returnedQtyByVariant = new Map();

                if (nextPurchaseId) {
                    const sourcePurchase = await tx.purchase.findUnique({
                        where: { id: nextPurchaseId },
                        include: {
                            items: true,
                            returns: {
                                include: {
                                    items: true
                                }
                            }
                        }
                    });

                    if (!sourcePurchase) {
                        return { error: 'Purchase not found for purchase return' };
                    }
                    if (sourcePurchase.supplierId && nextSupplierId && sourcePurchase.supplierId !== nextSupplierId) {
                        return { error: 'Supplier does not match selected purchase' };
                    }
                    if (!nextSupplierId && sourcePurchase.supplierId) {
                        nextSupplierId = sourcePurchase.supplierId;
                    }

                    for (const purchaseItem of sourcePurchase.items || []) {
                        const variantId = parsePositiveInt(purchaseItem?.variantId);
                        if (!variantId) continue;
                        const qty = Math.max(0, toInteger(purchaseItem?.quantity, 0));
                        purchasedQtyByVariant.set(variantId, (purchasedQtyByVariant.get(variantId) || 0) + qty);
                    }
                    for (const previousReturn of sourcePurchase.returns || []) {
                        if (parsePositiveInt(previousReturn?.id) === parsedReturnId) continue;
                        for (const previousItem of previousReturn.items || []) {
                            const variantId = parsePositiveInt(previousItem?.variantId);
                            if (!variantId) continue;
                            const qty = Math.max(0, toInteger(previousItem?.quantity, 0));
                            returnedQtyByVariant.set(variantId, (returnedQtyByVariant.get(variantId) || 0) + qty);
                        }
                    }
                }

                const affectedProductIds = new Set();

                // Revert old stock impact first.
                for (const oldItem of currentReturn.items || []) {
                    const variantId = parsePositiveInt(oldItem?.variantId);
                    const quantity = Math.max(0, toInteger(oldItem?.quantity, 0));
                    if (!variantId || quantity <= 0) continue;

                    const variant = await tx.variant.findUnique({
                        where: { id: variantId },
                        select: { id: true, productId: true }
                    });
                    if (!variant) {
                        return { error: 'Variant not found while reverting purchase return' };
                    }
                    if (variant.productId) {
                        affectedProductIds.add(variant.productId);
                    }

                    await tx.variant.update({
                        where: { id: variantId },
                        data: {
                            quantity: { increment: quantity }
                        }
                    });
                }

                const rollbackResult = await rollbackTreasuryEntriesByReference(tx, 'PURCHASE_RETURN', parsedReturnId);
                throwIfResultError(rollbackResult, 'Failed to rollback purchase return treasury entries');

                await tx.purchaseReturnItem.deleteMany({
                    where: { purchaseReturnId: parsedReturnId }
                });

                let computedTotal = 0;
                for (let i = 0; i < returnData.items.length; i++) {
                    const item = returnData.items[i];
                    const variantId = parsePositiveInt(item?.variantId);
                    const quantity = Math.max(1, toInteger(item?.quantity, 1));
                    const price = Math.max(0, toNumber(item?.price, 0));
                    if (!variantId) {
                        return { error: 'Invalid variantId in purchase return items' };
                    }

                    if (nextPurchaseId) {
                        const purchasedQty = Math.max(0, purchasedQtyByVariant.get(variantId) || 0);
                        const alreadyReturnedQty = Math.max(0, returnedQtyByVariant.get(variantId) || 0);
                        const remainingQty = Math.max(0, purchasedQty - alreadyReturnedQty);
                        if (purchasedQty <= 0) {
                            return { error: 'Variant does not exist in selected purchase' };
                        }
                        if (quantity > remainingQty) {
                            return { error: 'Requested return quantity exceeds purchase remaining quantity' };
                        }
                        returnedQtyByVariant.set(variantId, alreadyReturnedQty + quantity);
                    }

                    const variant = await tx.variant.findUnique({
                        where: { id: variantId },
                        select: { id: true, productId: true, quantity: true }
                    });
                    if (!variant) {
                        return { error: 'Variant not found in purchase return items' };
                    }
                    if (variant.productId) {
                        affectedProductIds.add(variant.productId);
                    }
                    if (toNumber(variant.quantity, 0) < quantity) {
                        return { error: 'Insufficient stock quantity for purchase return' };
                    }

                    await tx.purchaseReturnItem.create({
                        data: {
                            id: i + 1,
                            purchaseReturnId: parsedReturnId,
                            variantId,
                            quantity,
                            price
                        }
                    });

                    await tx.variant.update({
                        where: { id: variantId },
                        data: {
                            quantity: { decrement: quantity }
                        }
                    });

                    computedTotal += price * quantity;
                }

                const requestedTotal = Math.max(0, toNumber(returnData?.total, 0));
                const finalTotal = Math.max(0, toNumber(
                    requestedTotal > 0 ? requestedTotal : computedTotal
                ));

                const updatedPurchaseReturn = await tx.purchaseReturn.update({
                    where: { id: parsedReturnId },
                    data: {
                        purchaseId: nextPurchaseId || null,
                        supplierId: nextSupplierId || null,
                        total: finalTotal,
                        notes: returnData?.notes || null,
                        createdAt: returnDate
                    }
                });

                if (oldSupplierId && oldTotal > 0) {
                    await tx.supplier.update({
                        where: { id: oldSupplierId },
                        data: {
                            balance: { decrement: oldTotal }
                        }
                    });
                }

                if (nextSupplierId && finalTotal > 0) {
                    await tx.supplier.update({
                        where: { id: nextSupplierId },
                        data: {
                            balance: { increment: finalTotal }
                        }
                    });
                }

                const refundAmount = Math.max(0, toNumber(
                    returnData?.refundAmount !== undefined ? returnData.refundAmount : finalTotal
                ));
                if (refundAmount > 0) {
                    const returnTreasuryId = await resolveTreasuryId(tx, returnData?.treasuryId);
                    const refundMode = String(returnData?.refundMode || REFUND_MODE.SAME_METHOD)
                        .trim()
                        .toUpperCase();

                    let resolvedPaymentMethodId;
                    if (refundMode === REFUND_MODE.CASH_ONLY) {
                        resolvedPaymentMethodId = await resolveCashPaymentMethodId(tx, 1);
                    } else {
                        const sameMethodCandidate = returnData?.paymentMethodId ?? returnData?.paymentMethod;
                        resolvedPaymentMethodId = await resolvePaymentMethodId(
                            tx,
                            sameMethodCandidate,
                            1
                        );
                    }

                    const treasuryEntryResult = await createTreasuryEntry(tx, {
                        treasuryId: returnTreasuryId,
                        entryType: TREASURY_ENTRY_TYPE.RETURN_REFUND,
                        direction: TREASURY_DIRECTION.IN,
                        amount: refundAmount,
                        notes: `Purchase Return #${parsedReturnId}${returnData?.notes ? ` - ${returnData.notes}` : ''}`,
                        referenceType: 'PURCHASE_RETURN',
                        referenceId: parsedReturnId,
                        paymentMethodId: resolvedPaymentMethodId,
                        entryDate: returnDate,
                        idempotencyKey: generateIdempotencyKey('PURCHASE_RETURN_REFUND', [
                            parsedReturnId,
                            resolvedPaymentMethodId,
                            normalizeAmountForKey(refundAmount),
                            refundMode
                        ]),
                        createdByUserId: parsePositiveInt(returnData?.createdByUserId ?? returnData?.userId),
                        meta: {
                            refundMode
                        }
                    });
                    throwIfResultError(treasuryEntryResult);
                }

                await syncProductInventoriesWithVariants(tx, Array.from(affectedProductIds));

                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.PURCHASE_RETURN_UPDATE,
                    entityType: 'PurchaseReturn',
                    entityId: updatedPurchaseReturn.id,
                    note: `Update purchase return #${updatedPurchaseReturn.id}`,
                    before: currentReturn,
                    after: updatedPurchaseReturn,
                    referenceType: 'PURCHASE_RETURN',
                    referenceId: updatedPurchaseReturn.id
                });

                return { success: true, data: updatedPurchaseReturn };
            });

            perf({ rows: result?.success ? 1 : 0 });
            return result;
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    async deletePurchaseReturn(returnId) {
        const perf = startPerfTimer('db:deletePurchaseReturn', {
            returnId: parseInt(returnId, 10) || null
        });

        try {
            const result = await prisma.$transaction(async (tx) => {
                const parsedReturnId = parsePositiveInt(returnId);
                if (!parsedReturnId) {
                    return { error: 'Invalid purchase return id' };
                }

                const currentReturn = await tx.purchaseReturn.findUnique({
                    where: { id: parsedReturnId },
                    include: {
                        items: true
                    }
                });
                if (!currentReturn) {
                    return { error: 'Purchase return not found' };
                }

                const affectedProductIds = new Set();
                for (const item of currentReturn.items || []) {
                    const variantId = parsePositiveInt(item?.variantId);
                    const quantity = Math.max(0, toInteger(item?.quantity, 0));
                    if (!variantId || quantity <= 0) continue;

                    const variant = await tx.variant.findUnique({
                        where: { id: variantId },
                        select: { id: true, productId: true }
                    });
                    if (!variant) {
                        return { error: 'Variant not found while deleting purchase return' };
                    }
                    if (variant.productId) {
                        affectedProductIds.add(variant.productId);
                    }

                    await tx.variant.update({
                        where: { id: variantId },
                        data: {
                            quantity: { increment: quantity }
                        }
                    });
                }

                await syncProductInventoriesWithVariants(tx, Array.from(affectedProductIds));

                const rollbackResult = await rollbackTreasuryEntriesByReference(tx, 'PURCHASE_RETURN', parsedReturnId);
                throwIfResultError(rollbackResult, 'Failed to rollback purchase return treasury entries');

                await tx.purchaseReturnItem.deleteMany({
                    where: { purchaseReturnId: parsedReturnId }
                });

                const deletedPurchaseReturn = await tx.purchaseReturn.delete({
                    where: { id: parsedReturnId }
                });

                const parsedSupplierId = parsePositiveInt(currentReturn.supplierId);
                const returnTotal = Math.max(0, toNumber(currentReturn.total, 0));
                if (parsedSupplierId && returnTotal > 0) {
                    await tx.supplier.update({
                        where: { id: parsedSupplierId },
                        data: {
                            balance: { decrement: returnTotal }
                        }
                    });
                }

                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.PURCHASE_RETURN_DELETE,
                    entityType: 'PurchaseReturn',
                    entityId: deletedPurchaseReturn.id,
                    note: `Delete purchase return #${deletedPurchaseReturn.id}`,
                    before: currentReturn,
                    after: deletedPurchaseReturn,
                    referenceType: 'PURCHASE_RETURN',
                    referenceId: deletedPurchaseReturn.id
                });

                return { success: true, data: deletedPurchaseReturn };
            });

            perf({ rows: result?.success ? 1 : 0 });
            return result;
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    // ==================== CUSTOMERS ====================
    async getCustomerBalance(customerId) {
        try {
            const parsedCustomerId = parseInt(customerId);
            const customer = await prisma.customer.findUnique({
                where: { id: parsedCustomerId },
                select: {
                    id: true,
                    balance: true
                }
            });

            if (!customer) return 0;

            return customer.balance || 0;
        } catch (error) {
            return { error: error.message };
        }
    },

    async getCustomerStatement(customerId, fromDate, toDate) {
        try {
            const whereClause = { customer: { id: parseInt(customerId) } };

            if (fromDate || toDate) {
                whereClause.date = {};
                if (fromDate) whereClause.date.gte = new Date(fromDate);
                if (toDate) whereClause.date.lte = new Date(toDate);
            }

            const transactions = await prisma.customerTransaction.findMany({
                where: whereClause,
                orderBy: { date: 'asc' },
                include: {
                    customer: {
                        select: { name: true, phone: true }
                    },
                    createdByUser: {
                        select: { name: true }
                    }
                }
            });

            // Calculate running balance
            let runningBalance = 0;
            const statement = transactions.map(t => {
                runningBalance += t.debit - t.credit;
                return {
                    ...t,
                    runningBalance
                };
            });

            return statement;
        } catch (error) {
            return { error: error.message };
        }
    },

    async getCustomerTransactions(customerId) {
        try {
            return await prisma.customerTransaction.findMany({
                where: { customer: { id: parseInt(customerId) } },
                orderBy: { date: 'desc' },
                take: 50,
                include: {
                    createdByUser: {
                        select: { name: true }
                    }
                }
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async getCustomerStats({
        overdueThreshold = 30,
        searchTerm = '',
        customerType = null,
        city = '',
        columnFilters = {},
        overdueOnly = false
    } = {}) {
        const perf = startPerfTimer('db:getCustomerStats', {
            searchLength: String(searchTerm || '').trim().length,
            customerType: customerType || 'all',
            cityLength: String(city || '').trim().length,
            columnFilterCount: Object.keys(columnFilters || {}).length
        });
        try {
            const where = buildCustomersWhereClause({
                searchTerm,
                customerType,
                city,
                columnFilters,
                overdueOnly,
                overdueThreshold
            });

            // We need to fetch basic fields to compute overdue status,
            // but we don't need all columns in the DB, just the ones affecting stats
            const customers = await prisma.customer.findMany({
                where,
                select: {
                    balance: true,
                    customerType: true,
                    firstActivityDate: true,
                    lastPaymentDate: true,
                }
            });

            let vipCount = 0;
            let debtedCount = 0;
            let compliantCount = 0;
            let totalDebt = 0;
            let overdueCount = 0;

            let filteredTotal = 0;

            for (const c of customers) {
                const status = computeCustomerPaymentStatus(
                    c.firstActivityDate,
                    c.lastPaymentDate,
                    overdueThreshold
                );

                if (overdueOnly && !status.isOverdue) continue;

                filteredTotal += 1;

                if (c.customerType === 'VIP') vipCount += 1;

                const balance = c.balance || 0;
                if (balance > 0) {
                    debtedCount += 1;
                    totalDebt += balance;
                } else {
                    compliantCount += 1;
                }

                if (status.isOverdue) {
                    overdueCount += 1;
                }
            }

            perf({ rows: filteredTotal });
            return {
                totalCount: filteredTotal,
                vipCount,
                debtedCount,
                compliantCount,
                totalDebt,
                overdueCount
            };
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    async getCustomers({
        page = 1,
        pageSize = 1000,
        searchTerm = '',
        customerType = null,
        city = '',
        columnFilters = {},
        sortCol = 'createdAt',
        sortDir = 'desc',
        overdueThreshold = 30,
        overdueOnly = false
    } = {}) {
        const perf = startPerfTimer('db:getCustomers', {
            page,
            pageSize,
            searchLength: String(searchTerm || '').trim().length,
            customerType: customerType || 'all',
            cityLength: String(city || '').trim().length,
            columnFilterCount: Object.keys(columnFilters || {}).length,
            sortCol,
            sortDir
        });

        try {
            const safePage = Math.max(1, parseInt(page, 10) || 1);
            const safePageSize = Math.min(2000, Math.max(1, parseInt(pageSize, 10) || 1000));
            const safeSortDir = String(sortDir).toLowerCase() === 'asc' ? 'asc' : 'desc';
            const skip = (safePage - 1) * safePageSize;

            const where = buildCustomersWhereClause({
                searchTerm,
                customerType,
                city,
                columnFilters,
                overdueOnly,
                overdueThreshold
            });

            const safeSortCol = CUSTOMER_SORTABLE_COLUMNS.has(sortCol) ? sortCol : 'createdAt';
            const orderBy = safeSortCol === 'lastPaymentDate'
                ? [{ lastPaymentDate: safeSortDir }, { id: 'desc' }]
                : { [safeSortCol]: safeSortDir };

            const [customers, total] = await Promise.all([
                prisma.customer.findMany({
                    skip,
                    take: safePageSize,
                    where,
                    orderBy,
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        phone2: true,
                        address: true,
                        city: true,
                        district: true,
                        notes: true,
                        creditLimit: true,
                        customerType: true,
                        rating: true,
                        balance: true,
                        firstActivityDate: true,
                        lastPaymentDate: true,
                        createdAt: true,
                        payments: {
                            take: 1,
                            orderBy: { paymentDate: 'desc' },
                            select: { amount: true }
                        }
                    }
                }),
                prisma.customer.count({ where })
            ]);

            let data = customers.map((customer) => {
                const status = computeCustomerPaymentStatus(
                    customer.firstActivityDate,
                    customer.lastPaymentDate,
                    overdueThreshold,
                );

                return {
                    ...customer,
                    balance: customer.balance || 0,
                    lastPaymentDays: status.lastPaymentDays,
                    isOverdue: status.isOverdue,
                    lastPaymentAmount: Array.isArray(customer.payments) && customer.payments.length > 0 ? customer.payments[0].amount : 0
                };
            });

            let finalTotal = total;

            perf({ rows: data.length });

            return {
                data,
                total: finalTotal,
                page: safePage,
                totalPages: Math.max(1, Math.ceil(finalTotal / safePageSize))
            };
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    async getCustomerLookup({ searchTerm = '' } = {}) {
        const perf = startPerfTimer('db:getCustomerLookup', {
            searchLength: String(searchTerm || '').trim().length
        });

        try {
            const where = buildCustomersWhereClause({ searchTerm });
            const customers = await prisma.customer.findMany({
                where,
                orderBy: { id: 'desc' },
                select: {
                    id: true,
                    name: true,
                    phone: true,
                    customerType: true
                }
            });

            perf({ rows: customers.length });
            return customers;
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    async getCustomer(id) {
        try {
            const parsedCustomerId = parseInt(id);
            const customer = await prisma.customer.findUnique({
                where: { id: parsedCustomerId }
            });

            if (!customer) return { error: 'العميل غير موجود' };

            const status = computeCustomerPaymentStatus(
                customer.firstActivityDate,
                customer.lastPaymentDate,
                30,
            );

            return {
                ...customer,
                balance: customer.balance ?? 0,
                lastPaymentDays: status.lastPaymentDays,
                isOverdue: status.isOverdue
            };
        } catch (error) {
            return { error: error.message };
        }
    },

    async getCustomerSales(customerId) {
        try {
            const parsedCustomerId = parseInt(customerId);
            const sales = await prisma.sale.findMany({
                where: { customerId: parseInt(customerId) },
                include: {
                    createdByUser: { select: { name: true } },
                    paymentMethod: true,
                    items: {
                        include: {
                            variant: { include: { product: true } }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                take: 200
            });

            const saleIds = sales.map((sale) => sale.id);
            const saleTransactions = await prisma.customerTransaction.findMany({
                where: {
                    customerId: parsedCustomerId,
                    referenceType: 'SALE',
                    referenceId: { in: saleIds }
                },
                select: {
                    referenceId: true,
                    debit: true,
                    credit: true
                }
            });

            const outstandingBySaleId = new Map();
            const paidBySaleId = new Map();

            saleTransactions.forEach((transaction) => {
                const saleReferenceId = transaction.referenceId;
                if (!saleReferenceId) return;

                const delta = toNumber(transaction.debit) - toNumber(transaction.credit);
                outstandingBySaleId.set(saleReferenceId, (outstandingBySaleId.get(saleReferenceId) || 0) + delta);

                const credit = toNumber(transaction.credit);
                if (credit > 0) {
                    paidBySaleId.set(saleReferenceId, (paidBySaleId.get(saleReferenceId) || 0) + credit);
                }
            });

            return sales.map((sale) => {
                const total = Math.max(0, toNumber(sale.total));
                const remainingAmount = toNumber(outstandingBySaleId.get(sale.id) || 0);

                const paidAmount = paidBySaleId.has(sale.id)
                    ? paidBySaleId.get(sale.id)
                    : Math.max(0, total - Math.max(0, remainingAmount));

                return {
                    ...sale,
                    payment: sale?.paymentMethod?.name || null,
                    paymentMethodCode: sale?.paymentMethod?.code || null,
                    remainingAmount,
                    paidAmount,
                    // Backward-compatible aliases used by some UI paths.
                    remaining: remainingAmount,
                    paid: paidAmount
                };
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async getCustomerReturns(customerId) {
        try {
            return await prisma.return.findMany({
                where: { customerId: parseInt(customerId) },
                include: {
                    createdByUser: { select: { name: true } },
                    items: {
                        include: {
                            variant: { include: { product: true } }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async addCustomer(customerData) {
        try {
            const initialBalance = Number(toNumber(customerData?.balance, 0).toFixed(2));

            return await prisma.$transaction(async (tx) => {
                const createdCustomer = await tx.customer.create({
                    data: {
                        name: customerData.name,
                        phone: customerData.phone || null,
                        phone2: customerData.phone2 || null,
                        address: customerData.address || null,
                        city: customerData.city || null,
                        district: customerData.district || null,
                        notes: customerData.notes || null,
                        creditLimit: parseFloat(customerData.creditLimit || 0),
                        balance: initialBalance,
                        firstActivityDate: null,
                        lastPaymentDate: null,
                        financialsUpdatedAt: new Date(),
                        customerType: customerData.customerType || 'عادي'
                    }
                });

                if (Math.abs(initialBalance) > 0.0001) {
                    await tx.customerTransaction.create({
                        data: {
                            customerId: createdCustomer.id,
                            date: new Date(),
                            type: 'ADJUSTMENT',
                            referenceType: null,
                            referenceId: null,
                            debit: initialBalance > 0 ? initialBalance : 0,
                            credit: initialBalance < 0 ? Math.abs(initialBalance) : 0,
                            notes: 'Imported opening balance',
                            createdByUserId: getActorUserId()
                        }
                    });
                }

                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.CUSTOMER_CREATE,
                    entityType: 'Customer',
                    entityId: createdCustomer.id,
                    note: `Create customer ${createdCustomer.name}`,
                    after: createdCustomer
                });

                return createdCustomer;
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async updateCustomer(id, customerData) {
        try {
            const customerId = parseInt(id, 10);
            const hasBalanceInPayload = (
                customerData?.balance !== undefined
                && customerData?.balance !== null
                && String(customerData?.balance).trim() !== ''
            );

            const sharedData = {
                name: customerData.name,
                phone: customerData.phone || null,
                phone2: customerData.phone2 || null,
                address: customerData.address || null,
                city: customerData.city || null,
                district: customerData.district || null,
                notes: customerData.notes || null,
                creditLimit: customerData.creditLimit !== undefined ? parseFloat(customerData.creditLimit) : undefined,
                customerType: customerData.customerType || undefined
            };

            if (!hasBalanceInPayload) {
                const updatedCustomer = await prisma.customer.update({
                    where: { id: customerId },
                    data: sharedData
                });

                await writeEntityAuditLog(prisma, {
                    action: AUDIT_ACTION.CUSTOMER_UPDATE,
                    entityType: 'Customer',
                    entityId: customerId,
                    note: `Update customer ${updatedCustomer?.name || customerId}`,
                    after: updatedCustomer,
                    meta: { changedFields: Object.keys(sharedData).filter((key) => sharedData[key] !== undefined) }
                });

                return updatedCustomer;
            }

            const nextBalance = Number(toNumber(customerData.balance, 0).toFixed(2));

            return await prisma.$transaction(async (tx) => {
                const existingCustomer = await tx.customer.findUnique({
                    where: { id: customerId },
                    select: { id: true, balance: true }
                });
                if (!existingCustomer) {
                    return { error: 'Customer not found' };
                }

                const previousBalance = Number(toNumber(existingCustomer.balance, 0).toFixed(2));
                const balanceDelta = Number((nextBalance - previousBalance).toFixed(2));

                const updatedCustomer = await tx.customer.update({
                    where: { id: customerId },
                    data: {
                        ...sharedData,
                        balance: nextBalance
                    }
                });

                if (Math.abs(balanceDelta) > 0.0001) {
                    await tx.customerTransaction.create({
                        data: {
                            customerId,
                            date: new Date(),
                            type: 'ADJUSTMENT',
                            referenceType: null,
                            referenceId: null,
                            debit: balanceDelta > 0 ? balanceDelta : 0,
                            credit: balanceDelta < 0 ? Math.abs(balanceDelta) : 0,
                            notes: 'Customer balance adjustment',
                            createdByUserId: getActorUserId()
                        }
                    });
                }

                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.CUSTOMER_UPDATE,
                    entityType: 'Customer',
                    entityId: customerId,
                    note: `Update customer ${updatedCustomer?.name || customerId}`,
                    before: existingCustomer,
                    after: updatedCustomer,
                    meta: { balanceDelta }
                });

                return updatedCustomer;
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async deleteCustomer(id) {
        try {
            const customerId = parsePositiveInt(id);
            if (!customerId) {
                return { error: 'معرف العميل غير صالح.' };
            }

            const customer = await prisma.customer.findUnique({
                where: { id: customerId },
                select: { id: true }
            });
            if (!customer) {
                return { error: 'العميل غير موجود.' };
            }

            const [saleLink, paymentLink, returnLink, allocationLink, transactionLink] = await Promise.all([
                prisma.sale.findFirst({
                    where: { customerId },
                    select: { id: true }
                }),
                prisma.customerPayment.findFirst({
                    where: { customerId },
                    select: { id: true }
                }),
                prisma.return.findFirst({
                    where: { customerId },
                    select: { id: true }
                }),
                prisma.paymentAllocation.findFirst({
                    where: { customerId },
                    select: { id: true }
                }),
                prisma.customerTransaction.findFirst({
                    where: { customerId },
                    select: { id: true }
                })
            ]);

            if (saleLink) {
                return { error: 'لا يمكن حذف العميل لارتباطه بفواتير بيع.' };
            }
            if (paymentLink) {
                return { error: 'لا يمكن حذف العميل لارتباطه بدفعات مسجلة.' };
            }
            if (returnLink) {
                return { error: 'لا يمكن حذف العميل لارتباطه بمرتجعات بيع.' };
            }
            if (allocationLink) {
                return { error: 'لا يمكن حذف العميل لارتباطه بتسويات مدفوعات.' };
            }
            if (transactionLink) {
                return { error: 'لا يمكن حذف العميل لوجود حركات مالية مرتبطة به.' };
            }

            const customerSnapshot = await prisma.customer.findUnique({
                where: { id: customerId }
            });
            const deletedCustomer = await prisma.customer.delete({
                where: { id: customerId }
            });

            await writeEntityAuditLog(prisma, {
                action: AUDIT_ACTION.CUSTOMER_DELETE,
                entityType: 'Customer',
                entityId: customerId,
                note: `Delete customer ${customerSnapshot?.name || customerId}`,
                before: customerSnapshot,
                after: deletedCustomer
            });

            return deletedCustomer;
        } catch (error) {
            const friendlyMessage = mapCustomerDeleteConstraintError(error);
            if (friendlyMessage) {
                return { error: friendlyMessage };
            }
            return { error: error.message };
        }
    },

    async previewCustomerPaymentAllocation(params = {}) {
        try {
            const customerId = parsePositiveInt(params?.customerId);
            if (!customerId) return { error: 'Invalid customerId' };

            const requestedAmount = Math.max(0, toNumber(params?.amount));
            if (requestedAmount <= 0) return { error: 'Invalid amount' };

            return await prisma.$transaction(async (tx) => {
                const customer = await tx.customer.findUnique({
                    where: { id: customerId },
                    select: { id: true, balance: true }
                });
                if (!customer) return { error: 'Customer not found' };

                const outstandingRows = await getSaleOutstandingRowsForAllocation(tx, customerId, {
                    customerBalanceOverride: Math.max(0, toNumber(customer.balance))
                });

                let remaining = Number(requestedAmount.toFixed(2));
                const allocations = [];
                for (const row of outstandingRows) {
                    if (remaining <= 0) break;
                    const allocationAmount = Number(Math.min(remaining, row.outstanding).toFixed(2));
                    if (allocationAmount <= 0) continue;
                    allocations.push({
                        saleId: row.saleId,
                        invoiceDate: row.invoiceDate,
                        outstandingBefore: row.outstanding,
                        amount: allocationAmount,
                        outstandingAfter: Number((row.outstanding - allocationAmount).toFixed(2))
                    });
                    remaining = Number((remaining - allocationAmount).toFixed(2));
                }

                return {
                    success: true,
                    data: {
                        customerId,
                        customerBalance: toNumber(customer.balance),
                        requestedAmount,
                        allocatedAmount: Number((requestedAmount - remaining).toFixed(2)),
                        unallocatedAmount: remaining,
                        allocations
                    }
                };
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async createCustomerPayment(paymentData = {}) {
        const perf = startPerfTimer('db:createCustomerPayment', {
            hasPaymentDate: Boolean(paymentData?.paymentDate),
            hasSplitPayments: Array.isArray(paymentData?.splitPayments) || Array.isArray(paymentData?.payments)
        });

        try {
            const customerId = parsePositiveInt(paymentData?.customerId);
            if (!customerId) {
                return { error: 'Invalid customerId' };
            }

            // If payment date is today, use current time. Otherwise use start of day.
            // Parse the input date (user selected day)
            const paymentDateInput = paymentData?.paymentDate ? new Date(paymentData.paymentDate) : new Date();

            // Apply current time to the selected date
            // This ensures even backdated payments have a time component (preserving entry order)
            const now = new Date();
            const paymentDate = new Date(paymentDateInput);
            paymentDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
            const createdByUserId = parsePositiveInt(paymentData?.createdByUserId ?? paymentData?.userId);

            const rawSplitRows = normalizeSplitPaymentsInput(
                paymentData?.splitPayments ?? paymentData?.payments
            );
            const fallbackAmount = Math.max(0, toNumber(paymentData?.amount));
            const totalAmount = rawSplitRows.length > 0
                ? rawSplitRows.reduce((sum, row) => sum + row.amount, 0)
                : fallbackAmount;
            if (totalAmount <= 0) {
                return { error: 'Invalid payment amount' };
            }

            const result = await prisma.$transaction(async (tx) => {
                const customer = await tx.customer.findUnique({
                    where: { id: customerId },
                    select: { id: true, balance: true }
                });
                if (!customer) return { error: 'Customer not found' };

                const paymentTreasuryId = await resolveTreasuryId(tx, paymentData?.treasuryId);
                const splitRows = await resolvePaymentSplits(tx, {
                    splitPayments: rawSplitRows,
                    fallbackPaymentMethodId: paymentData?.paymentMethodId ?? paymentData?.paymentMethod ?? 1,
                    totalAmount
                });
                if (splitRows?.error) return { error: splitRows.error };

                const fifoOutstandingRows = await getSaleOutstandingRowsForAllocation(tx, customerId, {
                    customerBalanceOverride: Math.max(0, toNumber(customer.balance))
                });

                const payments = [];
                const treasuryEntries = [];
                const allocations = [];
                for (const splitRow of splitRows) {
                    const splitAmount = Math.max(0, toNumber(splitRow.amount));
                    if (splitAmount <= 0) continue;

                    const payment = await tx.customerPayment.create({
                        data: {
                            customerId: customerId,
                            paymentMethodId: splitRow.paymentMethodId,
                            amount: splitAmount,
                            notes: paymentData?.notes || splitRow?.note || null,
                            paymentDate,
                            createdByUserId: getActorUserId(paymentData?.createdByUserId, paymentData?.userId)
                        },
                        include: {
                            paymentMethod: true
                        }
                    });

                    await tx.customerTransaction.create({
                        data: {
                            customerId: customerId,
                            date: paymentDate,
                            type: 'PAYMENT',
                            referenceType: 'PAYMENT',
                            referenceId: payment.id,
                            debit: 0,
                            credit: splitAmount,
                            notes: `دفعة #${payment.id} - ${paymentData?.notes || 'دفعة عميل'}`,
                            createdByUserId: getActorUserId(createdByUserId)
                        }
                    });

                    const treasuryEntryResult = await createTreasuryEntry(tx, {
                        treasuryId: paymentTreasuryId,
                        entryType: TREASURY_ENTRY_TYPE.CUSTOMER_PAYMENT,
                        direction: TREASURY_DIRECTION.IN,
                        amount: splitAmount,
                        notes: `Customer payment #${payment.id}${paymentData?.notes ? ` - ${paymentData.notes}` : ''}`,
                        referenceType: 'PAYMENT',
                        referenceId: payment.id,
                        paymentMethodId: splitRow.paymentMethodId,
                        entryDate: paymentDate,
                        idempotencyKey: generateIdempotencyKey('CUSTOMER_PAYMENT', [
                            payment.id,
                            splitRow.paymentMethodId,
                            normalizeAmountForKey(splitAmount),
                            splitRow.index
                        ]),
                        createdByUserId,
                        meta: {
                            source: 'createCustomerPayment',
                            splitIndex: splitRow.index,
                            splitCount: splitRows.length
                        }
                    });
                    throwIfResultError(treasuryEntryResult);

                    const createdAllocations = await applyAllocationsFromOutstandingRows(tx, {
                        outstandingRows: fifoOutstandingRows,
                        sourceType: PAYMENT_ALLOCATION_SOURCE_TYPE.CUSTOMER_PAYMENT,
                        amount: splitAmount,
                        customerId,
                        customerPaymentId: payment.id,
                        createdByUserId: getActorUserId(createdByUserId),
                        note: `FIFO allocation for payment #${payment.id}`,
                        allocationDate: paymentDate
                    });

                    if (createdAllocations.length > 0) {
                        await writeAuditLog(tx, {
                            action: AUDIT_ACTION.PAYMENT_ALLOCATION_CREATE,
                            entityType: 'PaymentAllocation',
                            referenceType: 'PAYMENT',
                            referenceId: payment.id,
                            performedByUserId: createdByUserId,
                            note: `FIFO allocations created for payment #${payment.id}`,
                            meta: {
                                allocationCount: createdAllocations.length,
                                amount: splitAmount
                            }
                        });
                    }

                    payments.push(payment);
                    treasuryEntries.push(treasuryEntryResult.entry);
                    allocations.push(...createdAllocations);
                }

                await applyCustomerFinancialDelta(tx, {
                    customerId,
                    balanceDelta: -totalAmount,
                    activityDate: paymentDate,
                    paymentDate
                });
                await recalculateCustomerActivityDates(tx, customerId);

                return {
                    success: true,
                    data: {
                        customerId,
                        totalAmount,
                        paymentDate,
                        payments,
                        treasuryEntries,
                        allocations
                    }
                };
            });

            if (result?.success) {
                await writeEntityAuditLog(prisma, {
                    action: AUDIT_ACTION.CUSTOMER_PAYMENT_CREATE,
                    entityType: 'CustomerPayment',
                    entityId: result?.data?.payments?.[0]?.id || null,
                    note: `Create customer payment for customer #${customerId}`,
                    after: result.data,
                    referenceType: 'PAYMENT',
                    referenceId: result?.data?.payments?.[0]?.id || null,
                    performedByUserId: createdByUserId
                });
            }

            perf({ rows: Array.isArray(result?.data?.payments) ? result.data.payments.length : 0 });
            return result;
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    async addCustomerPayment(paymentData) {
        const result = await this.createCustomerPayment(paymentData);
        if (result?.error) {
            return result;
        }

        const payments = Array.isArray(result?.data?.payments) ? result.data.payments : [];
        if (payments.length === 1) {
            return payments[0];
        }
        return result;
    },

    async getCustomerPayments(customerId) {
        try {
            return await prisma.customerPayment.findMany({
                where: { customerId: parseInt(customerId) },
                include: {
                    paymentMethod: true,
                    createdByUser: { select: { name: true } }
                },
                orderBy: { paymentDate: 'desc' }
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async getCustomerPaymentById(paymentId) {
        try {
            const payment = await prisma.customerPayment.findUnique({
                where: { id: parseInt(paymentId) },
                include: { customer: true, paymentMethod: true }
            });
            if (!payment) return { error: 'إذن الدفع غير موجود' };
            return payment;
        } catch (error) {
            return { error: error.message };
        }
    },

    async updateCustomerPayment(paymentId, paymentData) {
        const perf = startPerfTimer('db:updateCustomerPayment', {
            paymentId: parseInt(paymentId, 10) || null
        });

        try {
            const parsedPaymentId = parsePositiveInt(paymentId);
            if (!parsedPaymentId) {
                return { error: 'Invalid paymentId' };
            }

            const amount = Math.max(0, toNumber(paymentData?.amount));
            if (amount <= 0) {
                return { error: 'Invalid payment amount' };
            }

            const result = await prisma.$transaction(async (tx) => {
                const existingPayment = await tx.customerPayment.findUnique({
                    where: { id: parsedPaymentId },
                    select: {
                        id: true,
                        customerId: true,
                        amount: true,
                        paymentDate: true,
                        paymentMethodId: true
                    }
                });

                if (!existingPayment) {
                    return { error: 'Payment not found' };
                }

                const hasPaymentDateUpdate = Object.prototype.hasOwnProperty.call(paymentData || {}, 'paymentDate');
                const paymentDate = hasPaymentDateUpdate
                    ? resolveEditedDateKeepingPosition(
                        paymentData?.paymentDate,
                        existingPayment?.paymentDate || new Date()
                    )
                    : (toValidDate(existingPayment?.paymentDate) || new Date());

                const nextCustomerId = Object.prototype.hasOwnProperty.call(paymentData || {}, 'customerId')
                    ? parsePositiveInt(paymentData.customerId)
                    : existingPayment.customerId;

                if (!nextCustomerId) {
                    return { error: 'Invalid customerId' };
                }

                const paymentMethodId = await resolvePaymentMethodId(
                    tx,
                    paymentData?.paymentMethodId ?? paymentData?.paymentMethod,
                    existingPayment.paymentMethodId || 1
                );
                if (!paymentMethodId) {
                    return { error: 'Invalid paymentMethodId' };
                }

                const updatedPayment = await tx.customerPayment.update({
                    where: { id: parsedPaymentId },
                    data: {
                        customerId: nextCustomerId,
                        paymentMethodId,
                        amount,
                        notes: paymentData?.notes || null,
                        paymentDate
                    },
                    include: {
                        paymentMethod: true
                    }
                });

                await tx.customerTransaction.deleteMany({
                    where: {
                        referenceType: 'PAYMENT',
                        referenceId: parsedPaymentId
                    }
                });

                await tx.customerTransaction.create({
                    data: {
                        customerId: nextCustomerId,
                        date: paymentDate,
                        type: 'PAYMENT',
                        referenceType: 'PAYMENT',
                        referenceId: parsedPaymentId,
                        debit: 0,
                        credit: amount,
                        notes: `دفعة معدلة #${parsedPaymentId} - ${paymentData?.notes || 'دفعة نقدية'}`,
                        createdByUserId: getActorUserId(paymentData?.createdByUserId, paymentData?.userId)
                    }
                });

                const oldAmount = Math.max(0, toNumber(existingPayment.amount));

                if (existingPayment.customerId === nextCustomerId) {
                    const balanceDelta = oldAmount - amount;
                    if (balanceDelta !== 0) {
                        await applyCustomerFinancialDelta(tx, {
                            customerId: nextCustomerId,
                            balanceDelta,
                            paymentDate
                        });
                    } else {
                        await applyCustomerFinancialDelta(tx, {
                            customerId: nextCustomerId,
                            balanceDelta: 0,
                            paymentDate
                        });
                    }
                    await recalculateCustomerActivityDates(tx, nextCustomerId);
                } else {
                    await applyCustomerFinancialDelta(tx, {
                        customerId: existingPayment.customerId,
                        balanceDelta: oldAmount
                    });
                    await recalculateCustomerActivityDates(tx, existingPayment.customerId);

                    await applyCustomerFinancialDelta(tx, {
                        customerId: nextCustomerId,
                        balanceDelta: -amount,
                        paymentDate
                    });
                    await recalculateCustomerActivityDates(tx, nextCustomerId);
                }

                const rollbackResult = await rollbackTreasuryEntriesByReference(tx, 'PAYMENT', parsedPaymentId);
                throwIfResultError(rollbackResult, 'Failed to rollback payment treasury entries');
                const paymentTreasuryId = await resolveTreasuryId(tx, paymentData?.treasuryId);
                const treasuryEntryResult = await createTreasuryEntry(tx, {
                    treasuryId: paymentTreasuryId,
                    entryType: TREASURY_ENTRY_TYPE.CUSTOMER_PAYMENT,
                    direction: TREASURY_DIRECTION.IN,
                    amount,
                    notes: `Customer payment update #${parsedPaymentId}${paymentData?.notes ? ` - ${paymentData.notes}` : ''}`,
                    referenceType: 'PAYMENT',
                    referenceId: parsedPaymentId,
                    paymentMethodId,
                    entryDate: paymentDate,
                    idempotencyKey: generateIdempotencyKey('CUSTOMER_PAYMENT', [
                        parsedPaymentId,
                        paymentMethodId,
                        normalizeAmountForKey(amount),
                        'UPDATE'
                    ]),
                    createdByUserId: parsePositiveInt(paymentData?.createdByUserId ?? paymentData?.userId),
                    meta: {
                        source: 'updateCustomerPayment'
                    }
                });
                throwIfResultError(treasuryEntryResult);

                const currentCustomer = await tx.customer.findUnique({
                    where: { id: nextCustomerId },
                    select: { balance: true }
                });
                const balanceBeforePayment = Math.max(0, toNumber(currentCustomer?.balance) + amount);
                const fifoOutstandingRows = await getSaleOutstandingRowsForAllocation(tx, nextCustomerId, {
                    customerBalanceOverride: balanceBeforePayment
                });
                await applyAllocationsFromOutstandingRows(tx, {
                    outstandingRows: fifoOutstandingRows,
                    sourceType: PAYMENT_ALLOCATION_SOURCE_TYPE.CUSTOMER_PAYMENT,
                    amount,
                    customerId: nextCustomerId,
                    customerPaymentId: parsedPaymentId,
                    createdByUserId: parsePositiveInt(paymentData?.createdByUserId ?? paymentData?.userId),
                    note: `FIFO allocation for updated payment #${parsedPaymentId}`,
                    allocationDate: paymentDate
                });

                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.CUSTOMER_PAYMENT_UPDATE,
                    entityType: 'CustomerPayment',
                    entityId: updatedPayment.id,
                    note: `Update customer payment #${updatedPayment.id}`,
                    before: existingPayment,
                    after: updatedPayment,
                    referenceType: 'PAYMENT',
                    referenceId: updatedPayment.id
                });

                return { success: true, data: updatedPayment };
            });

            perf({ rows: result?.success ? 1 : 0 });
            return result;
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    async deleteCustomerPayment(paymentId) {
        const perf = startPerfTimer('db:deleteCustomerPayment', {
            paymentId: parseInt(paymentId, 10) || null
        });

        try {
            return await prisma.$transaction(async (tx) => {
                const payment = await tx.customerPayment.findUnique({
                    where: { id: parseInt(paymentId) },
                    select: {
                        id: true,
                        customerId: true,
                        amount: true,
                        paymentDate: true
                    }
                });

                if (!payment) {
                    return { error: 'Payment not found' };
                }

                await tx.customerTransaction.deleteMany({
                    where: {
                        customerId: payment.customerId,
                        referenceType: 'PAYMENT',
                        referenceId: parseInt(paymentId)
                    }
                });

                const rollbackResult = await rollbackTreasuryEntriesByReference(tx, 'PAYMENT', parseInt(paymentId));
                throwIfResultError(rollbackResult, 'Failed to rollback payment treasury entries');

                const deletedPayment = await tx.customerPayment.delete({
                    where: { id: parseInt(paymentId) }
                });

                await applyCustomerFinancialDelta(tx, {
                    customerId: payment.customerId,
                    balanceDelta: Math.max(0, toNumber(payment.amount))
                });

                await recalculateCustomerActivityDates(tx, payment.customerId);

                perf({ rows: 1 });
                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.CUSTOMER_PAYMENT_DELETE,
                    entityType: 'CustomerPayment',
                    entityId: deletedPayment.id,
                    note: `Delete customer payment #${deletedPayment.id}`,
                    before: payment,
                    after: deletedPayment,
                    referenceType: 'PAYMENT',
                    referenceId: deletedPayment.id
                });

                return { success: true, data: deletedPayment };
            });
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    async rebuildCustomerFinancials(customerId) {
        const parsedCustomerId = parsePositiveInt(customerId);
        if (!parsedCustomerId) {
            return { error: 'Invalid customerId' };
        }

        const perf = startPerfTimer('db:rebuildCustomerFinancials', {
            customerId: parsedCustomerId
        });

        try {
            const result = await prisma.$transaction(async (tx) => {
                const customer = await tx.customer.findUnique({
                    where: { id: parsedCustomerId },
                    select: { id: true }
                });

                if (!customer) {
                    return { error: 'Customer not found' };
                }

                const summary = await rebuildCustomerFinancialSummary(tx, parsedCustomerId);
                return { success: true, data: summary };
            });

            perf({ rows: result?.success ? 1 : 0 });
            return result;
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    async rebuildAllCustomersFinancials({ batchSize = 200, startAfterId = 0 } = {}) {
        const safeBatchSize = Math.min(1000, Math.max(10, parseInt(batchSize, 10) || 200));
        let cursorId = Math.max(0, parseInt(startAfterId, 10) || 0);

        const perf = startPerfTimer('db:rebuildAllCustomersFinancials', {
            batchSize: safeBatchSize,
            startAfterId: cursorId
        });

        try {
            let processed = 0;
            let updated = 0;
            let batches = 0;

            while (true) {
                const batchCustomers = await prisma.customer.findMany({
                    where: { id: { gt: cursorId } },
                    orderBy: { id: 'asc' },
                    take: safeBatchSize,
                    select: { id: true }
                });

                if (batchCustomers.length === 0) break;

                const batchIds = batchCustomers.map((customer) => customer.id);

                const updatedInBatch = await prisma.$transaction(async (tx) => {
                    const summaryMap = await calculateCustomerFinancialSummaries(tx, batchIds);
                    return persistCustomerFinancialSummaries(tx, summaryMap);
                });

                processed += batchIds.length;
                updated += updatedInBatch;
                batches += 1;
                cursorId = batchIds[batchIds.length - 1];

                console.log(`[REBUILD][CUSTOMERS] batch=${batches} processed=${processed} updated=${updated} cursor=${cursorId}`);
            }

            const result = {
                success: true,
                processed,
                updated,
                batches,
                batchSize: safeBatchSize
            };

            perf({ rows: processed });
            return result;
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    async checkCustomerFinancialsHealth() {
        try {
            await prisma.customer.findFirst({
                select: {
                    id: true,
                    balance: true,
                    firstActivityDate: true,
                    lastPaymentDate: true,
                    financialsUpdatedAt: true
                }
            });

            return { ok: true };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    },

    // ==================== PAYMENT METHODS ====================
    async getPaymentMethods() {
        try {
            const methods = await prisma.paymentMethod.findMany({
                where: { isActive: true },
                orderBy: { createdAt: 'asc' }
            });

            console.log('📋 طرق الدفع:', methods);
            return methods;
        } catch (error) {
            console.error('❌ خطأ في جلب طرق الدفع:', error);
            return [];
        }
    },

    async getPaymentMethodStats() {
        try {
            const stats = await prisma.paymentMethod.findMany({
                where: { isActive: true },
                include: {
                    payments: {
                        select: { amount: true }
                    }
                }
            });

            return stats.map(method => ({
                ...method,
                totalAmount: method.payments.reduce((sum, p) => sum + p.amount, 0),
                count: method.payments.length
            }));
        } catch (error) {
            console.error('❌ خطأ في جلب إحصائيات طرق الدفع:', error);
            return [];
        }
    },

    async createDepositReceipt(params = {}) {
        try {
            const amount = Math.max(0, toNumber(params?.amount));
            if (amount <= 0) return { error: 'Invalid deposit amount' };

            const customerId = parsePositiveInt(params?.customerId);
            const entryDate = parseDateOrDefault(params?.entryDate ?? params?.paymentDate, new Date());
            const createdByUserId = parsePositiveInt(params?.createdByUserId ?? params?.userId);

            return await prisma.$transaction(async (tx) => {
                let referenceId = parsePositiveInt(params?.referenceId ?? params?.depositReferenceId);
                if (!referenceId) {
                    const latestRef = await tx.treasuryEntry.findFirst({
                        where: { referenceType: 'DEPOSIT' },
                        orderBy: { referenceId: 'desc' },
                        select: { referenceId: true }
                    });
                    referenceId = Math.max(100000, parsePositiveInt(latestRef?.referenceId) || 100000) + 1;
                }

                const treasuryId = await resolveTreasuryId(tx, params?.treasuryId);
                const paymentMethodId = await resolvePaymentMethodId(
                    tx,
                    params?.paymentMethodId ?? params?.paymentMethod,
                    1
                );
                if (!paymentMethodId) {
                    return { error: 'Invalid paymentMethodId' };
                }

                const entryResult = await createTreasuryEntry(tx, {
                    treasuryId,
                    entryType: TREASURY_ENTRY_TYPE.DEPOSIT_IN,
                    direction: TREASURY_DIRECTION.IN,
                    amount,
                    notes: params?.notes || 'Deposit receipt',
                    referenceType: 'DEPOSIT',
                    referenceId,
                    paymentMethodId,
                    entryDate,
                    idempotencyKey: generateIdempotencyKey('DEPOSIT_RECEIPT', [
                        referenceId,
                        paymentMethodId,
                        normalizeAmountForKey(amount),
                        toDayLockDate(entryDate).toISOString()
                    ]),
                    createdByUserId,
                    meta: {
                        customerId,
                        referenceType: params?.referenceType || 'DEPOSIT'
                    }
                });
                throwIfResultError(entryResult);
                await writeAuditLog(tx, {
                    action: AUDIT_ACTION.DEPOSIT_RECEIPT_CREATE,
                    entityType: 'TreasuryEntry',
                    entityId: entryResult.entry.id,
                    treasuryId,
                    treasuryEntryId: entryResult.entry.id,
                    referenceType: 'DEPOSIT',
                    referenceId,
                    performedByUserId: createdByUserId,
                    note: `Deposit receipt #${referenceId}`,
                    meta: {
                        customerId,
                        amount,
                        paymentMethodId
                    }
                });

                return {
                    success: true,
                    data: {
                        referenceId,
                        entry: entryResult.entry
                    }
                };
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async applyDepositToSale(params = {}) {
        try {
            const saleId = parsePositiveInt(params?.saleId);
            const referenceId = parsePositiveInt(params?.depositReferenceId ?? params?.referenceId);
            const amountApplied = Math.max(0, toNumber(params?.amountApplied ?? params?.amount));
            const applyDate = parseDateOrDefault(params?.applyDate ?? params?.entryDate, new Date());
            const createdByUserId = parsePositiveInt(params?.createdByUserId ?? params?.userId);

            if (!saleId) return { error: 'Invalid saleId' };
            if (!referenceId) return { error: 'Invalid deposit reference' };
            if (amountApplied <= 0) return { error: 'Invalid amountApplied' };

            return await prisma.$transaction(async (tx) => {
                const sale = await tx.sale.findUnique({
                    where: { id: saleId },
                    select: { id: true, customerId: true }
                });
                if (!sale) return { error: 'Sale not found' };
                const customerId = parsePositiveInt(params?.customerId) || parsePositiveInt(sale.customerId);

                const depositSummary = await getDepositSummary(tx, referenceId);
                if (depositSummary?.error) return depositSummary;
                if (depositSummary.remaining + 0.0001 < amountApplied) {
                    return { error: 'Deposit remaining amount is insufficient' };
                }

                const depositInEntries = depositSummary.entries
                    .filter((entry) => entry.entryType === TREASURY_ENTRY_TYPE.DEPOSIT_IN)
                    .sort((a, b) => a.id - b.id);
                if (depositInEntries.length === 0) {
                    return { error: 'No deposit receipt found for this reference' };
                }

                const depositEntryIds = depositInEntries.map((entry) => entry.id);
                const usedByEntry = await tx.paymentAllocation.groupBy({
                    by: ['treasuryEntryId'],
                    where: {
                        sourceType: PAYMENT_ALLOCATION_SOURCE_TYPE.DEPOSIT,
                        treasuryEntryId: { in: depositEntryIds }
                    },
                    _sum: { amount: true }
                });
                const usedMap = new Map();
                usedByEntry.forEach((row) => {
                    usedMap.set(row.treasuryEntryId, Math.max(0, toNumber(row?._sum?.amount)));
                });

                let remainingToApply = Number(amountApplied.toFixed(2));
                const createdAllocations = [];
                for (const depositEntry of depositInEntries) {
                    if (remainingToApply <= 0) break;
                    const entryAmount = Math.max(0, toNumber(depositEntry.amount));
                    const alreadyUsed = Math.max(0, toNumber(usedMap.get(depositEntry.id)));
                    const available = Number(Math.max(0, entryAmount - alreadyUsed).toFixed(2));
                    if (available <= 0) continue;

                    const allocationAmount = Number(Math.min(remainingToApply, available).toFixed(2));
                    if (allocationAmount <= 0) continue;

                    const allocation = await tx.paymentAllocation.create({
                        data: {
                            customerId: customerId || null,
                            saleId,
                            sourceType: PAYMENT_ALLOCATION_SOURCE_TYPE.DEPOSIT,
                            treasuryEntryId: depositEntry.id,
                            amount: allocationAmount,
                            allocationDate: applyDate,
                            createdByUserId,
                            note: params?.notes || `Apply deposit #${referenceId} to sale #${saleId}`
                        }
                    });
                    createdAllocations.push(allocation);
                    remainingToApply = Number((remainingToApply - allocationAmount).toFixed(2));
                }

                if (remainingToApply > 0.01) {
                    return { error: 'Unable to allocate requested amount from deposit balance' };
                }
                await writeAuditLog(tx, {
                    action: AUDIT_ACTION.DEPOSIT_APPLY_TO_SALE,
                    entityType: 'PaymentAllocation',
                    referenceType: 'DEPOSIT',
                    referenceId,
                    performedByUserId: createdByUserId,
                    note: `Apply deposit #${referenceId} to sale #${saleId}`,
                    meta: {
                        saleId,
                        customerId: customerId || null,
                        amountApplied,
                        allocationCount: createdAllocations.length
                    }
                });

                return {
                    success: true,
                    data: {
                        referenceId,
                        saleId,
                        amountApplied,
                        allocations: createdAllocations
                    }
                };
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async refundDeposit(params = {}) {
        try {
            const referenceId = parsePositiveInt(params?.depositReferenceId ?? params?.referenceId);
            const amount = Math.max(0, toNumber(params?.amount));
            if (!referenceId) return { error: 'Invalid deposit reference' };
            if (amount <= 0) return { error: 'Invalid refund amount' };

            const refundDate = parseDateOrDefault(params?.refundDate ?? params?.entryDate, new Date());
            const refundMode = String(params?.refundMode || REFUND_MODE.SAME_METHOD).trim().toUpperCase();
            const createdByUserId = parsePositiveInt(params?.createdByUserId ?? params?.userId);

            return await prisma.$transaction(async (tx) => {
                const depositSummary = await getDepositSummary(tx, referenceId);
                if (depositSummary?.error) return depositSummary;
                if (depositSummary.remaining + 0.0001 < amount) {
                    return { error: 'Deposit remaining amount is insufficient for refund' };
                }

                const sourceEntry = depositSummary.entries.find(
                    (entry) => entry.entryType === TREASURY_ENTRY_TYPE.DEPOSIT_IN
                );
                if (!sourceEntry) {
                    return { error: 'No deposit receipt found for this reference' };
                }

                let paymentMethodId;
                if (refundMode === REFUND_MODE.CASH_ONLY) {
                    paymentMethodId = await resolveCashPaymentMethodId(tx, 1);
                } else {
                    paymentMethodId = await resolvePaymentMethodId(
                        tx,
                        params?.paymentMethodId ?? params?.paymentMethod ?? sourceEntry.paymentMethodId,
                        1
                    );
                }
                if (!paymentMethodId) {
                    return { error: 'Invalid paymentMethodId for refund' };
                }

                const customerIdFromMeta = parsePositiveInt(sourceEntry?.meta?.customerId);
                const customerId = parsePositiveInt(params?.customerId) || customerIdFromMeta;

                const refundEntryResult = await createTreasuryEntry(tx, {
                    treasuryId: sourceEntry.treasuryId,
                    entryType: TREASURY_ENTRY_TYPE.DEPOSIT_REFUND,
                    direction: TREASURY_DIRECTION.OUT,
                    amount,
                    notes: params?.notes || `Deposit refund #${referenceId}`,
                    referenceType: 'DEPOSIT',
                    referenceId,
                    paymentMethodId,
                    entryDate: refundDate,
                    allowNegative: true,
                    idempotencyKey: generateIdempotencyKey('DEPOSIT_REFUND', [
                        referenceId,
                        paymentMethodId,
                        normalizeAmountForKey(amount),
                        refundMode
                    ]),
                    createdByUserId,
                    meta: {
                        refundMode
                    }
                });
                throwIfResultError(refundEntryResult);
                await writeAuditLog(tx, {
                    action: AUDIT_ACTION.DEPOSIT_REFUND,
                    entityType: 'TreasuryEntry',
                    entityId: refundEntryResult.entry.id,
                    treasuryId: refundEntryResult.entry.treasuryId,
                    treasuryEntryId: refundEntryResult.entry.id,
                    referenceType: 'DEPOSIT',
                    referenceId,
                    performedByUserId: createdByUserId,
                    note: `Deposit refund #${referenceId}`,
                    meta: {
                        amount,
                        refundMode,
                        paymentMethodId
                    }
                });

                return {
                    success: true,
                    data: {
                        referenceId,
                        entry: refundEntryResult.entry
                    }
                };
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    // ==================== TREASURY ====================
    async getTreasuries() {
        try {
            let treasuries = await prisma.treasury.findMany({
                where: { isDeleted: false },
                include: {
                    _count: {
                        select: {
                            entries: true
                        }
                    }
                },
                orderBy: [
                    { isDefault: 'desc' },
                    { isActive: 'desc' },
                    { createdAt: 'asc' }
                ]
            });

            if (treasuries.length === 0) {
                await getOrCreateDefaultTreasury(prisma);
                treasuries = await prisma.treasury.findMany({
                    where: { isDeleted: false },
                    include: {
                        _count: {
                            select: {
                                entries: true
                            }
                        }
                    },
                    orderBy: [
                        { isDefault: 'desc' },
                        { isActive: 'desc' },
                        { createdAt: 'asc' }
                    ]
                });
            }

            if (treasuries.length > 0 && !treasuries.some((row) => row.isDefault)) {
                const fallbackDefault = await getOrCreateDefaultTreasury(prisma);
                treasuries = treasuries.map((row) => ({
                    ...row,
                    isDefault: row.id === fallbackDefault.id
                }));
            }

            const activeCount = treasuries.filter((row) => row.isActive).length;
            const linkedEntryAgg = await prisma.treasuryEntry.groupBy({
                by: ['treasuryId'],
                where: {
                    treasuryId: { in: treasuries.map((row) => row.id) },
                    entryType: { not: TREASURY_ENTRY_TYPE.OPENING_BALANCE }
                },
                _count: { _all: true }
            });
            const linkedEntryMap = new Map(
                linkedEntryAgg.map((row) => [row.treasuryId, row?._count?._all || 0])
            );

            // Fetch payment methods to map IDs to codes
            const paymentMethods = await prisma.paymentMethod.findMany();
            const pmMap = new Map(paymentMethods.map(pm => [pm.id, { code: pm.code, name: pm.name }]));

            // Aggregate balances by Treasury + PaymentMethod
            // We need to sum amounts based on direction (IN vs OUT)
            // Group by: treasuryId, paymentMethodId, direction
            const breakdownAgg = await prisma.treasuryEntry.groupBy({
                by: ['treasuryId', 'paymentMethodId', 'direction'],
                where: {
                    treasuryId: { in: treasuries.map((row) => row.id) },
                    entryType: { not: TREASURY_ENTRY_TYPE.OPENING_BALANCE } // Optional: exclude opening balance if it doesn't have PM?
                },
                _sum: { amount: true },
                _count: { _all: true }
            });

            // Process aggregation into a map: treasuryId -> { [pmCode]: { balance, count, name } }
            const breakdownMap = {}; // { [treasuryId]: [ { code, name, balance, count } ] }

            breakdownAgg.forEach(row => {
                const tid = row.treasuryId;
                const pmid = row.paymentMethodId;
                const direction = row.direction;
                const amount = row._sum.amount || 0;
                const count = row._count._all || 0;

                if (!breakdownMap[tid]) breakdownMap[tid] = {};

                // key for the method in the map (e.g., 'CASH', 'VODAFONE_CASH')
                // If paymentMethodId is null, usually means CASH or internal. Let's assume CASH default for now or 'OTHER'
                let code = 'CASH';
                let name = 'نقدي';

                if (pmid && pmMap.has(pmid)) {
                    code = pmMap.get(pmid).code;
                    name = pmMap.get(pmid).name;
                } else if (pmid === null) {
                    code = 'CASH';
                    name = 'نقدي';
                } else {
                    code = 'OTHER';
                    name = 'أخرى';
                }

                if (!breakdownMap[tid][code]) {
                    breakdownMap[tid][code] = { code, name, balance: 0, count: 0 };
                }

                if (direction === 'IN') {
                    breakdownMap[tid][code].balance += amount;
                } else {
                    breakdownMap[tid][code].balance -= amount;
                }
                breakdownMap[tid][code].count += count;
            });

            const enriched = treasuries.map((treasury) => {
                const nonOpeningEntryCount = linkedEntryMap.get(treasury.id) || 0;
                const hasLinkedOperations = nonOpeningEntryCount > 0;
                const canDelete = treasury.isActive
                    ? activeCount > 1
                    : activeCount >= 1;

                // NEW: Get breakdown
                const breakdownObj = breakdownMap[treasury.id] || {};
                const breakdown = Object.values(breakdownObj).sort((a, b) => b.balance - a.balance);

                return {
                    ...treasury,
                    nonOpeningEntryCount,
                    hasLinkedOperations,
                    canEdit: true, // Always allow editing (name, description, etc.)
                    canDelete,
                    breakdown
                };
            });

            const totalBalance = enriched.reduce(
                (sum, treasury) => sum + toNumber(treasury.currentBalance),
                0
            );

            return {
                data: enriched,
                totalBalance
            };
        } catch (error) {
            return { error: error.message };
        }
    },

    async createTreasury(treasuryData = {}) {
        try {
            const name = String(treasuryData?.name || '').trim();
            const requestedCode = normalizeTreasuryCode(treasuryData?.code || name);
            const openingBalance = Math.max(0, toNumber(treasuryData?.openingBalance));
            const openingDate = parseDateOrDefault(treasuryData?.openingDate, new Date());
            const requestedDefault = Boolean(treasuryData?.isDefault);

            if (!name) {
                return { error: 'Treasury name is required' };
            }

            return await prisma.$transaction(async (tx) => {
                let code = requestedCode;
                if (!code) {
                    // If name/code contains unsupported chars only, fallback to generated code.
                    code = generateTreasuryCode();
                }

                const defaultCount = await tx.treasury.count({
                    where: { isDefault: true, isDeleted: false }
                });
                const shouldSetAsDefault = requestedDefault || defaultCount === 0;

                let createdTreasury = await tx.treasury.create({
                    data: {
                        name,
                        code,
                        description: treasuryData?.description || null,
                        openingBalance,
                        currentBalance: 0,
                        isActive: true,
                        isDefault: false
                    }
                });

                if (openingBalance > 0) {
                    const openingEntryResult = await createTreasuryEntry(tx, {
                        treasuryId: createdTreasury.id,
                        entryType: TREASURY_ENTRY_TYPE.OPENING_BALANCE,
                        direction: TREASURY_DIRECTION.IN,
                        amount: openingBalance,
                        notes: treasuryData?.openingNotes || 'Opening balance',
                        entryDate: openingDate,
                        allowNegative: true
                    });
                    throwIfResultError(openingEntryResult);
                }

                if (shouldSetAsDefault) {
                    const defaultResult = await setDefaultTreasuryInternal(tx, createdTreasury.id, {
                        forceActivate: true
                    });
                    if (defaultResult?.error) {
                        return { error: defaultResult.error };
                    }
                    createdTreasury = defaultResult.treasury;
                }

                await writeAuditLog(tx, {
                    action: AUDIT_ACTION.TREASURY_CREATE,
                    entityType: 'Treasury',
                    entityId: createdTreasury.id,
                    treasuryId: createdTreasury.id,
                    performedByUserId: parsePositiveInt(treasuryData?.createdByUserId ?? treasuryData?.userId),
                    note: `Create treasury ${createdTreasury.name}`,
                    meta: {
                        code: createdTreasury.code,
                        openingBalance,
                        isDefault: Boolean(createdTreasury?.isDefault)
                    }
                });

                return createdTreasury;
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async updateTreasury(id, treasuryData = {}) {
        try {
            const treasuryId = parsePositiveInt(id);
            if (!treasuryId) {
                return { error: 'Invalid treasuryId' };
            }

            const hasName = Object.prototype.hasOwnProperty.call(treasuryData, 'name');
            const hasCode = Object.prototype.hasOwnProperty.call(treasuryData, 'code');
            const hasDescription = Object.prototype.hasOwnProperty.call(treasuryData, 'description');
            const hasIsActive = Object.prototype.hasOwnProperty.call(treasuryData, 'isActive');
            const hasIsDefault = Object.prototype.hasOwnProperty.call(treasuryData, 'isDefault');
            const hasOpeningBalance = Object.prototype.hasOwnProperty.call(treasuryData, 'openingBalance');

            const data = {};
            if (hasName) {
                const name = String(treasuryData?.name || '').trim();
                if (!name) return { error: 'Treasury name cannot be empty' };
                data.name = name;
            }
            if (hasCode) {
                const code = normalizeTreasuryCode(treasuryData?.code);
                if (!code) return { error: 'Treasury code cannot be empty' };
                data.code = code;
            }
            if (hasDescription) {
                data.description = treasuryData?.description || null;
            }
            if (hasIsActive) {
                data.isActive = Boolean(treasuryData.isActive);
            }

            const openingBalance = hasOpeningBalance
                ? Math.max(0, toNumber(treasuryData?.openingBalance))
                : null;
            const openingDate = parseDateOrDefault(treasuryData?.openingDate, new Date());
            const requestedDefault = hasIsDefault ? Boolean(treasuryData?.isDefault) : null;
            const updatedByUserId = parsePositiveInt(treasuryData?.updatedByUserId ?? treasuryData?.userId);

            if (Object.keys(data).length === 0 && !hasIsDefault && !hasOpeningBalance) {
                return { error: 'No fields to update' };
            }

            return await prisma.$transaction(async (tx) => {
                const existingTreasury = await tx.treasury.findUnique({
                    where: { id: treasuryId },
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        isActive: true,
                        isDefault: true,
                        isDeleted: true,
                        openingBalance: true
                    }
                });
                if (!existingTreasury) {
                    return { error: 'Treasury not found' };
                }
                if (existingTreasury.isDeleted) {
                    return { error: 'Treasury is deleted' };
                }

                const linkStats = await getTreasuryOperationLinkStats(tx, treasuryId);
                const isMasterDataChangeRequested = (
                    hasName ||
                    hasCode ||
                    hasDescription ||
                    hasIsActive ||
                    hasOpeningBalance
                );
                if (linkStats.hasLinkedOperations && isMasterDataChangeRequested) {
                    return { error: 'Cannot edit treasury because it is linked to operations' };
                }

                if (hasIsActive && data.isActive === false) {
                    const activeCount = await tx.treasury.count({
                        where: { isActive: true, id: { not: treasuryId } }
                    });
                    if (activeCount === 0) {
                        return { error: 'At least one active treasury is required' };
                    }
                    if (existingTreasury.isDefault && requestedDefault !== false) {
                        return { error: 'Default treasury cannot be deactivated. Set another default first' };
                    }
                }

                if (hasOpeningBalance) {
                    data.openingBalance = openingBalance;
                }

                const changedFields = [];
                let updatedTreasury = existingTreasury;

                if (Object.keys(data).length > 0) {
                    updatedTreasury = await tx.treasury.update({
                        where: { id: treasuryId },
                        data
                    });
                    changedFields.push(...Object.keys(data));
                }

                if (hasOpeningBalance) {
                    const openingDelta = Number((openingBalance - toNumber(existingTreasury.openingBalance)).toFixed(2));
                    if (Math.abs(openingDelta) > 0.0001) {
                        const openingAdjustResult = await createTreasuryEntry(tx, {
                            treasuryId,
                            entryType: openingDelta > 0
                                ? TREASURY_ENTRY_TYPE.OPENING_BALANCE
                                : TREASURY_ENTRY_TYPE.ADJUSTMENT_OUT,
                            direction: openingDelta > 0
                                ? TREASURY_DIRECTION.IN
                                : TREASURY_DIRECTION.OUT,
                            amount: Math.abs(openingDelta),
                            notes: `Opening balance update for treasury #${treasuryId}`,
                            entryDate: openingDate,
                            allowNegative: true,
                            idempotencyKey: generateIdempotencyKey('TREASURY_OPENING_BALANCE_UPDATE', [
                                treasuryId,
                                normalizeAmountForKey(openingBalance),
                                openingDate.toISOString(),
                            ]),
                            createdByUserId: updatedByUserId,
                            meta: {
                                source: 'updateTreasury',
                                openingBalanceBefore: toNumber(existingTreasury.openingBalance),
                                openingBalanceAfter: openingBalance
                            }
                        });
                        throwIfResultError(openingAdjustResult);
                    }
                }

                if (hasIsDefault) {
                    if (requestedDefault) {
                        const setDefaultResult = await setDefaultTreasuryInternal(tx, treasuryId, {
                            forceActivate: true
                        });
                        if (setDefaultResult?.error) return { error: setDefaultResult.error };
                        updatedTreasury = setDefaultResult.treasury;
                        if (!changedFields.includes('isDefault')) changedFields.push('isDefault');
                    } else if (existingTreasury.isDefault) {
                        const replacementTreasury = await tx.treasury.findFirst({
                            where: {
                                id: { not: treasuryId },
                                isActive: true,
                                isDeleted: false
                            },
                            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                            select: { id: true }
                        });
                        if (!replacementTreasury?.id) {
                            return { error: 'Cannot remove default treasury without another active treasury' };
                        }

                        const replacementSetResult = await setDefaultTreasuryInternal(tx, replacementTreasury.id, {
                            forceActivate: true
                        });
                        if (replacementSetResult?.error) return { error: replacementSetResult.error };

                        updatedTreasury = await tx.treasury.update({
                            where: { id: treasuryId },
                            data: { isDefault: false }
                        });
                        if (!changedFields.includes('isDefault')) changedFields.push('isDefault');
                    }
                }

                if (changedFields.length === 0) {
                    return { error: 'No fields to update' };
                }

                await writeAuditLog(tx, {
                    action: AUDIT_ACTION.TREASURY_UPDATE,
                    entityType: 'Treasury',
                    entityId: updatedTreasury.id,
                    treasuryId: updatedTreasury.id,
                    performedByUserId: updatedByUserId,
                    note: `Update treasury ${updatedTreasury.name}`,
                    meta: {
                        changedFields
                    }
                });

                return updatedTreasury;
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async setDefaultTreasury(id, options = {}) {
        try {
            const treasuryId = parsePositiveInt(id ?? options?.treasuryId);
            if (!treasuryId) {
                return { error: 'Invalid treasuryId' };
            }

            return await prisma.$transaction(async (tx) => {
                const result = await setDefaultTreasuryInternal(tx, treasuryId, {
                    forceActivate: true
                });
                if (result?.error) return { error: result.error };

                await writeAuditLog(tx, {
                    action: AUDIT_ACTION.TREASURY_DEFAULT_SET,
                    entityType: 'Treasury',
                    entityId: treasuryId,
                    treasuryId,
                    performedByUserId: parsePositiveInt(options?.updatedByUserId ?? options?.userId),
                    note: `Set treasury #${treasuryId} as default`,
                    meta: {
                        source: options?.source || 'setDefaultTreasury'
                    }
                });

                return result.treasury;
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async deleteTreasury(id, options = {}) {
        try {
            const treasuryId = parsePositiveInt(id);
            if (!treasuryId) {
                return { error: 'Invalid treasuryId' };
            }

            return await prisma.$transaction(async (tx) => {
                const treasury = await tx.treasury.findUnique({
                    where: { id: treasuryId },
                    include: {
                        _count: {
                            select: {
                                entries: true
                            }
                        }
                    }
                });

                if (!treasury) {
                    return { error: 'Treasury not found' };
                }
                if (treasury.isDeleted) {
                    return { error: 'Treasury already deleted' };
                }

                const linkStats = await getTreasuryOperationLinkStats(tx, treasuryId);

                if (treasury.isActive) {
                    const activeCount = await tx.treasury.count({
                        where: { isActive: true, isDeleted: false, id: { not: treasuryId } }
                    });
                    if (activeCount < 1) {
                        return { error: 'At least one active treasury is required' };
                    }
                }

                if (treasury.isDefault) {
                    const replacementTreasury = await tx.treasury.findFirst({
                        where: {
                            id: { not: treasuryId },
                            isActive: true,
                            isDeleted: false
                        },
                        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                        select: { id: true }
                    });
                    if (!replacementTreasury?.id) {
                        return { error: 'Cannot delete default treasury without another active treasury' };
                    }

                    const replacementSetResult = await setDefaultTreasuryInternal(tx, replacementTreasury.id, {
                        forceActivate: true
                    });
                    if (replacementSetResult?.error) {
                        return { error: replacementSetResult.error };
                    }
                }

                const deletedByUserId = parsePositiveInt(options?.deletedByUserId ?? options?.userId);

                if (linkStats.hasLinkedOperations) {
                    const archiveCode = normalizeTreasuryCode(
                        `DEL_${treasury.code}_${treasuryId}_${Date.now().toString(36)}`
                    ) || `DEL_${treasuryId}_${Date.now().toString(36).toUpperCase()}`;
                    const archiveName = `${treasury.name} [محذوف]`;

                    const archivedTreasury = await tx.treasury.update({
                        where: { id: treasuryId },
                        data: {
                            isDeleted: true,
                            isActive: false,
                            isDefault: false,
                            code: archiveCode,
                            name: archiveName
                        }
                    });

                    await writeAuditLog(tx, {
                        action: AUDIT_ACTION.TREASURY_DELETE,
                        entityType: 'Treasury',
                        entityId: archivedTreasury.id,
                        treasuryId: archivedTreasury.id,
                        performedByUserId: deletedByUserId,
                        note: `Archive treasury ${treasury.name}`,
                        meta: {
                            mode: 'SOFT_DELETE',
                            deletedTreasuryId: archivedTreasury.id,
                            previousCode: treasury.code,
                            previousName: treasury.name,
                            linkedOperations: linkStats
                        }
                    });

                    return {
                        success: true,
                        data: archivedTreasury,
                        softDeleted: true
                    };
                }

                if (treasury._count.entries > 0) {
                    await tx.treasuryEntry.deleteMany({
                        where: { treasuryId }
                    });
                }

                const deletedTreasury = await tx.treasury.delete({
                    where: { id: treasuryId }
                });

                await writeAuditLog(tx, {
                    action: AUDIT_ACTION.TREASURY_DELETE,
                    entityType: 'Treasury',
                    entityId: deletedTreasury.id,
                    treasuryId: null,
                    performedByUserId: deletedByUserId,
                    note: `Delete treasury ${deletedTreasury.name}`,
                    meta: {
                        mode: 'HARD_DELETE',
                        deletedTreasuryId: deletedTreasury.id,
                        code: deletedTreasury.code,
                        isDefault: Boolean(deletedTreasury?.isDefault)
                    }
                });

                return deletedTreasury;
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async createTreasuryTransaction(transactionData = {}) {
        try {
            const transactionTypeRaw = String(
                transactionData?.transactionType || transactionData?.type || 'IN'
            ).trim().toUpperCase();
            const transactionType = ['IN', 'OUT', 'TRANSFER'].includes(transactionTypeRaw)
                ? transactionTypeRaw
                : 'IN';

            const amount = Math.max(0, toNumber(transactionData?.amount));
            if (amount <= 0) {
                return { error: 'Invalid transaction amount' };
            }

            const entryDate = parseDateOrDefault(transactionData?.entryDate, new Date());
            const notes = String(transactionData?.notes || '').trim();
            const createdByUserId = parsePositiveInt(
                transactionData?.createdByUserId ?? transactionData?.userId
            );

            return await prisma.$transaction(async (tx) => {
                if (transactionType === 'TRANSFER') {
                    const sourceTreasuryId = parsePositiveInt(
                        transactionData?.sourceTreasuryId ?? transactionData?.fromTreasuryId
                    );
                    const targetTreasuryId = parsePositiveInt(
                        transactionData?.targetTreasuryId ?? transactionData?.toTreasuryId
                    );

                    if (!sourceTreasuryId || !targetTreasuryId) {
                        return { error: 'Transfer requires source and target treasuries' };
                    }
                    if (sourceTreasuryId === targetTreasuryId) {
                        return { error: 'Source and target treasuries must be different' };
                    }

                    const [sourceTreasury, targetTreasury] = await Promise.all([
                        tx.treasury.findFirst({
                            where: { id: sourceTreasuryId, isActive: true },
                            select: { id: true }
                        }),
                        tx.treasury.findFirst({
                            where: { id: targetTreasuryId, isActive: true },
                            select: { id: true }
                        })
                    ]);

                    if (!sourceTreasury || !targetTreasury) {
                        return { error: 'Source or target treasury is invalid/inactive' };
                    }

                    const outEntryResult = await createTreasuryEntry(tx, {
                        treasuryId: sourceTreasuryId,
                        entryType: TREASURY_ENTRY_TYPE.TRANSFER_OUT,
                        direction: TREASURY_DIRECTION.OUT,
                        amount,
                        notes: notes || `Transfer to treasury #${targetTreasuryId}`,
                        sourceTreasuryId,
                        targetTreasuryId,
                        entryDate,
                        idempotencyKey: generateIdempotencyKey('TREASURY_TRANSFER', [
                            sourceTreasuryId,
                            targetTreasuryId,
                            normalizeAmountForKey(amount),
                            toDayLockDate(entryDate).toISOString(),
                            'OUT'
                        ]),
                        createdByUserId,
                        allowNegative: true
                    });
                    throwIfResultError(outEntryResult);

                    const inEntryResult = await createTreasuryEntry(tx, {
                        treasuryId: targetTreasuryId,
                        entryType: TREASURY_ENTRY_TYPE.TRANSFER_IN,
                        direction: TREASURY_DIRECTION.IN,
                        amount,
                        notes: notes || `Transfer from treasury #${sourceTreasuryId}`,
                        sourceTreasuryId,
                        targetTreasuryId,
                        entryDate,
                        allowNegative: true,
                        idempotencyKey: generateIdempotencyKey('TREASURY_TRANSFER', [
                            sourceTreasuryId,
                            targetTreasuryId,
                            normalizeAmountForKey(amount),
                            toDayLockDate(entryDate).toISOString(),
                            'IN'
                        ]),
                        createdByUserId
                    });
                    throwIfResultError(inEntryResult);

                    const transferResult = {
                        success: true,
                        data: {
                            sourceEntry: outEntryResult.entry,
                            targetEntry: inEntryResult.entry
                        }
                    };
                    await writeEntityAuditLog(tx, {
                        action: AUDIT_ACTION.TREASURY_TRANSACTION_CREATE,
                        entityType: 'TreasuryTransaction',
                        entityId: outEntryResult.entry?.id,
                        note: `Create treasury transfer ${sourceTreasuryId} -> ${targetTreasuryId}`,
                        after: transferResult.data,
                        performedByUserId: createdByUserId
                    });
                    return transferResult;
                }

                const treasuryId = await resolveTreasuryId(tx, transactionData?.treasuryId);
                const paymentMethodId = await resolvePaymentMethodId(
                    tx,
                    transactionData?.paymentMethodId ?? transactionData?.paymentMethod,
                    1
                );
                const direction = transactionType === 'OUT'
                    ? TREASURY_DIRECTION.OUT
                    : TREASURY_DIRECTION.IN;

                const providedEntryType = String(transactionData?.entryType || '').trim().toUpperCase();
                const entryType = TREASURY_ENTRY_TYPE_SET.has(providedEntryType)
                    ? providedEntryType
                    : (direction === TREASURY_DIRECTION.OUT
                        ? TREASURY_ENTRY_TYPE.MANUAL_OUT
                        : TREASURY_ENTRY_TYPE.MANUAL_IN);

                const entryResult = await createTreasuryEntry(tx, {
                    treasuryId,
                    entryType,
                    direction,
                    amount,
                    notes: notes || null,
                    referenceType: transactionData?.referenceType || null,
                    referenceId: transactionData?.referenceId || null,
                    paymentMethodId,
                    entryDate,
                    idempotencyKey: normalizeIdempotencyKey(transactionData?.idempotencyKey),
                    createdByUserId,
                    allowNegative: transactionData?.allowNegative ?? (direction === TREASURY_DIRECTION.OUT),
                    meta: transactionData?.meta ?? null
                });

                throwIfResultError(entryResult);

                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.TREASURY_TRANSACTION_CREATE,
                    entityType: 'TreasuryTransaction',
                    entityId: entryResult.entry?.id,
                    note: `Create treasury transaction ${entryType}`,
                    after: entryResult.entry,
                    performedByUserId: createdByUserId
                });

                return { success: true, data: entryResult.entry };
            });
        } catch (error) {
            return { error: error.message };
        }
    },
    async getPaymentMethodReport(params = {}) {
        try {
            const treasuryId = parsePositiveInt(params.treasuryId);
            const paymentMethodId = parsePositiveInt(params.paymentMethodId);
            if (!treasuryId || !paymentMethodId) return { error: 'Missing treasuryId or paymentMethodId' };

            const where = {
                treasuryId,
                paymentMethodId,
                entryType: { not: TREASURY_ENTRY_TYPE.OPENING_BALANCE },
                isDeleted: false // Assuming we might add soft delete later
            };

            if (params.fromDate) where.entryDate = { ...where.entryDate, gte: startOfDay(params.fromDate) };
            if (params.toDate) where.entryDate = { ...where.entryDate, lte: endOfDay(params.toDate) };

            // Fetch entries
            const entries = await prisma.treasuryEntry.findMany({
                where: {
                    treasuryId,
                    paymentMethodId,
                    entryType: { not: TREASURY_ENTRY_TYPE.OPENING_BALANCE }
                },
                include: {
                    paymentMethod: true,
                    createdByUser: {
                        select: { name: true }
                    }
                },
                orderBy: { entryDate: 'desc' }
            });

            // Enrich with entity names (Customer/Supplier)
            // We need to look up referenceType/referenceId
            // Optimization: Collect IDs and fetch in batches
            const customerPaymentIds = [];
            const saleIds = [];
            const supplierPaymentIds = [];

            entries.forEach(e => {
                if (e.referenceType === 'PAYMENT') customerPaymentIds.push(e.referenceId);
                else if (e.referenceType === 'SALE') saleIds.push(e.referenceId);
                else if (e.referenceType === 'SUPPLIER_PAYMENT') supplierPaymentIds.push(e.referenceId);
            });

            const customerPayments = customerPaymentIds.length > 0
                ? await prisma.customerPayment.findMany({ where: { id: { in: customerPaymentIds } }, include: { customer: true } })
                : [];
            const sales = saleIds.length > 0
                ? await prisma.sale.findMany({ where: { id: { in: saleIds } }, include: { customer: true } })
                : [];
            const supplierPayments = supplierPaymentIds.length > 0
                ? await prisma.supplierPayment.findMany({ where: { id: { in: supplierPaymentIds } }, include: { supplier: true } })
                : [];

            const cpMap = new Map(customerPayments.map(i => [i.id, i.customer?.name || 'Unknown Customer']));
            const saleMap = new Map(sales.map(i => [i.id, i.customer?.name || 'Unknown Customer']));
            const spMap = new Map(supplierPayments.map(i => [i.id, i.supplier?.name || 'Unknown Supplier']));

            const enrichedEntries = entries.map(e => {
                let entityName = '-';
                if (e.referenceType === 'PAYMENT') entityName = cpMap.get(e.referenceId) || '-';
                else if (e.referenceType === 'SALE') entityName = saleMap.get(e.referenceId) || '-';
                else if (e.referenceType === 'SUPPLIER_PAYMENT') entityName = spMap.get(e.referenceId) || '-';

                return {
                    ...e,
                    entityName
                };
            });

            // Calculate totals
            const totalIn = enrichedEntries.reduce((sum, e) => e.direction === 'IN' ? sum + e.amount : sum, 0);
            const totalOut = enrichedEntries.reduce((sum, e) => e.direction === 'OUT' ? sum + e.amount : sum, 0);

            return {
                data: enrichedEntries,
                summary: { totalIn, totalOut, net: totalIn - totalOut }
            };

        } catch (error) {
            return { error: error.message };
        }
    },

    async getTreasuryEntries(params = {}) {
        try {
            const page = Math.max(1, parseInt(params?.page, 10) || 1);
            const pageSize = Math.min(500, Math.max(1, parseInt(params?.pageSize, 10) || 100));
            const skip = (page - 1) * pageSize;

            const where = {};
            const treasuryId = parsePositiveInt(params?.treasuryId);
            const direction = String(params?.direction || '').trim().toUpperCase();
            const entryType = String(params?.entryType || '').trim().toUpperCase();
            const referenceType = String(params?.referenceType || '').trim();
            const search = String(params?.search || '').trim();
            const paymentMethodId = parsePositiveInt(params?.paymentMethodId);
            const userId = parsePositiveInt(params?.userId);

            if (treasuryId) where.treasuryId = treasuryId;
            if (paymentMethodId) where.paymentMethodId = paymentMethodId;
            if (userId) where.createdByUserId = userId;
            if (direction && direction !== 'ALL' && Object.values(TREASURY_DIRECTION).includes(direction)) {
                where.direction = direction;
            }
            if (entryType && entryType !== 'ALL' && TREASURY_ENTRY_TYPE_SET.has(entryType)) {
                where.entryType = entryType;
            }
            if (referenceType) {
                where.referenceType = referenceType;
            }
            if (params?.fromDate || params?.toDate) {
                where.entryDate = {};
                if (params?.fromDate) where.entryDate.gte = startOfDay(params.fromDate);
                if (params?.toDate) where.entryDate.lte = endOfDay(params.toDate);
            }
            if (search) {
                where.OR = [
                    { notes: { contains: search, mode: 'insensitive' } },
                    { referenceType: { contains: search, mode: 'insensitive' } }
                ];
            }

            const [entries, total, totalsByDirection] = await Promise.all([
                prisma.treasuryEntry.findMany({
                    where,
                    skip,
                    take: pageSize,
                    include: {
                        treasury: true,
                        paymentMethod: true,
                        sourceTreasury: true,
                        targetTreasury: true,
                        createdByUser: {
                            select: { id: true, name: true, username: true }
                        }
                    },
                    orderBy: [
                        { id: 'desc' }
                    ]
                }),
                prisma.treasuryEntry.count({ where }),
                prisma.treasuryEntry.groupBy({
                    by: ['direction'],
                    where,
                    _sum: { amount: true }
                })
            ]);

            let totalIn = 0;
            let totalOut = 0;
            totalsByDirection.forEach((row) => {
                const amountByDirection = row?._sum?.amount || 0;
                if (row.direction === TREASURY_DIRECTION.IN) totalIn += amountByDirection;
                else totalOut += amountByDirection;
            });

            return {
                data: entries,
                total,
                page,
                totalPages: Math.max(1, Math.ceil(total / pageSize)),
                summary: {
                    totalIn,
                    totalOut,
                    net: totalIn - totalOut
                }
            };
        } catch (error) {
            return { error: error.message };
        }
    },

    async getDailyRevenueReportLegacy(params = {}) {
        try {
            const reportDate = params?.date || new Date();
            const from = startOfDay(reportDate);
            const to = endOfDay(reportDate);
            const previousFrom = new Date(from);
            previousFrom.setDate(previousFrom.getDate() - 1);
            const previousTo = new Date(to);
            previousTo.setDate(previousTo.getDate() - 1);
            const treasuryId = parsePositiveInt(params?.treasuryId);

            const where = {
                entryDate: {
                    gte: from,
                    lte: to
                },
                ...(treasuryId ? { treasuryId } : {})
            };

            const previousWhere = {
                entryDate: {
                    gte: previousFrom,
                    lte: previousTo
                },
                ...(treasuryId ? { treasuryId } : {})
            };

            const [entries, totalsByDirection, previousTotalsByDirection] = await Promise.all([
                prisma.treasuryEntry.findMany({
                    where,
                    include: {
                        treasury: true,
                        paymentMethod: true,
                        sourceTreasury: true,
                        targetTreasury: true,
                        createdByUser: {
                            select: { id: true, name: true, username: true }
                        }
                    },
                    orderBy: [
                        { entryDate: 'desc' },
                        { id: 'desc' }
                    ]
                }),
                prisma.treasuryEntry.groupBy({
                    by: ['direction'],
                    where,
                    _sum: { amount: true }
                }),
                prisma.treasuryEntry.groupBy({
                    by: ['direction'],
                    where: previousWhere,
                    _sum: { amount: true }
                })
            ]);

            let totalIn = 0;
            let totalOut = 0;
            totalsByDirection.forEach((row) => {
                const amountByDirection = row?._sum?.amount || 0;
                if (row.direction === TREASURY_DIRECTION.IN) totalIn += amountByDirection;
                else totalOut += amountByDirection;
            });

            let previousIn = 0;
            let previousOut = 0;
            previousTotalsByDirection.forEach((row) => {
                const amountByDirection = row?._sum?.amount || 0;
                if (row.direction === TREASURY_DIRECTION.IN) previousIn += amountByDirection;
                else previousOut += amountByDirection;
            });

            const byPaymentMethodMap = new Map();
            const byEntryTypeMap = new Map();

            entries.forEach((entry) => {
                const paymentMethodId = entry?.paymentMethod?.id || 0;
                const paymentMethodCode = entry?.paymentMethod?.code || 'UNSPECIFIED';
                const paymentMethodName = entry?.paymentMethod?.name || 'غير محدد';
                const paymentMethodKey = `${paymentMethodId}:${paymentMethodCode}`;
                const signedAmount = entry.direction === TREASURY_DIRECTION.IN
                    ? toNumber(entry.amount)
                    : -toNumber(entry.amount);

                if (!byPaymentMethodMap.has(paymentMethodKey)) {
                    byPaymentMethodMap.set(paymentMethodKey, {
                        paymentMethodId: paymentMethodId || null,
                        code: paymentMethodCode,
                        name: paymentMethodName,
                        totalIn: 0,
                        totalOut: 0,
                        net: 0,
                        count: 0
                    });
                }
                const methodRow = byPaymentMethodMap.get(paymentMethodKey);
                if (entry.direction === TREASURY_DIRECTION.IN) methodRow.totalIn += toNumber(entry.amount);
                else methodRow.totalOut += toNumber(entry.amount);
                methodRow.net += signedAmount;
                methodRow.count += 1;

                const typeKey = entry.entryType;
                if (!byEntryTypeMap.has(typeKey)) {
                    byEntryTypeMap.set(typeKey, {
                        entryType: typeKey,
                        totalIn: 0,
                        totalOut: 0,
                        net: 0,
                        count: 0
                    });
                }
                const typeRow = byEntryTypeMap.get(typeKey);
                if (entry.direction === TREASURY_DIRECTION.IN) typeRow.totalIn += toNumber(entry.amount);
                else typeRow.totalOut += toNumber(entry.amount);
                typeRow.net += signedAmount;
                typeRow.count += 1;
            });

            const net = totalIn - totalOut;
            const previousNet = previousIn - previousOut;

            return {
                date: from.toISOString().split('T')[0],
                summary: {
                    totalIn,
                    totalOut,
                    net,
                    previousDayNet: previousNet,
                    changeFromPreviousDay: net - previousNet
                },
                byPaymentMethod: [...byPaymentMethodMap.values()].sort((a, b) => b.net - a.net),
                byEntryType: [...byEntryTypeMap.values()].sort((a, b) => b.net - a.net),
                entries
            };
        } catch (error) {
            return { error: error.message };
        }
    },

    async getDailyRevenueReport(params = {}) {
        try {
            const { from, to, isSingleDay } = resolveReportRange(params);
            const treasuryId = parsePositiveInt(params?.treasuryId);
            const includeDepositsInRevenue = Boolean(params?.includeDepositsInRevenue);
            const rangeMs = endOfDay(to).getTime() - startOfDay(from).getTime();
            const rangeDays = Math.max(1, Math.ceil((rangeMs + 1) / (24 * 60 * 60 * 1000)));
            const previousRange = shiftDateRange({ from, to }, rangeDays);

            const where = {
                entryDate: {
                    gte: from,
                    lte: to
                },
                ...(treasuryId ? { treasuryId } : {})
            };
            const previousWhere = {
                entryDate: {
                    gte: previousRange.from,
                    lte: previousRange.to
                },
                ...(treasuryId ? { treasuryId } : {})
            };

            const revenueEntryTypes = [
                TREASURY_ENTRY_TYPE.SALE_INCOME,
                TREASURY_ENTRY_TYPE.CUSTOMER_PAYMENT,
                TREASURY_ENTRY_TYPE.DEPOSIT_IN,
                TREASURY_ENTRY_TYPE.DEPOSIT_REFUND
            ];

            const [
                entries,
                totalsByDirection,
                previousTotalsByDirection,
                previousRevenueByType,
                salesAgg,
                previousSalesAgg,
                returnsAgg,
                previousReturnsAgg
            ] = await Promise.all([
                prisma.treasuryEntry.findMany({
                    where,
                    include: {
                        treasury: true,
                        paymentMethod: true,
                        sourceTreasury: true,
                        targetTreasury: true,
                        createdByUser: {
                            select: { id: true, name: true, username: true }
                        }
                    },
                    orderBy: [
                        { entryDate: 'desc' },
                        { id: 'desc' }
                    ]
                }),
                prisma.treasuryEntry.groupBy({
                    by: ['direction'],
                    where,
                    _sum: { amount: true }
                }),
                prisma.treasuryEntry.groupBy({
                    by: ['direction'],
                    where: previousWhere,
                    _sum: { amount: true }
                }),
                prisma.treasuryEntry.groupBy({
                    by: ['entryType', 'direction'],
                    where: {
                        ...previousWhere,
                        entryType: { in: revenueEntryTypes }
                    },
                    _sum: { amount: true }
                }),
                prisma.sale.aggregate({
                    where: {
                        invoiceDate: {
                            gte: from,
                            lte: to
                        }
                    },
                    _sum: { total: true },
                    _count: { id: true }
                }),
                prisma.sale.aggregate({
                    where: {
                        invoiceDate: {
                            gte: previousRange.from,
                            lte: previousRange.to
                        }
                    },
                    _sum: { total: true },
                    _count: { id: true }
                }),
                prisma.return.aggregate({
                    where: {
                        createdAt: {
                            gte: from,
                            lte: to
                        }
                    },
                    _sum: { total: true },
                    _count: { id: true }
                }),
                prisma.return.aggregate({
                    where: {
                        createdAt: {
                            gte: previousRange.from,
                            lte: previousRange.to
                        }
                    },
                    _sum: { total: true },
                    _count: { id: true }
                })
            ]);

            // Enrich with entity names (Customer/Supplier)
            const customerPaymentIds = [];
            const saleIds = [];
            const supplierPaymentIds = [];

            entries.forEach(e => {
                if (e.referenceType === 'PAYMENT') customerPaymentIds.push(e.referenceId);
                else if (e.referenceType === 'SALE') saleIds.push(e.referenceId);
                else if (e.referenceType === 'SUPPLIER_PAYMENT') supplierPaymentIds.push(e.referenceId);
            });

            const customerPayments = customerPaymentIds.length > 0
                ? await prisma.customerPayment.findMany({ where: { id: { in: customerPaymentIds } }, include: { customer: true } })
                : [];
            const sales = saleIds.length > 0
                ? await prisma.sale.findMany({ where: { id: { in: saleIds } }, include: { customer: true } })
                : [];
            const supplierPayments = supplierPaymentIds.length > 0
                ? await prisma.supplierPayment.findMany({ where: { id: { in: supplierPaymentIds } }, include: { supplier: true } })
                : [];

            const cpMap = new Map(customerPayments.map(i => [i.id, i.customer?.name || '']));
            const saleMap = new Map(sales.map(i => [i.id, i.customer?.name || '']));
            const spMap = new Map(supplierPayments.map(i => [i.id, i.supplier?.name || '']));

            entries.forEach(e => {
                let entityName = '';
                if (e.referenceType === 'PAYMENT') entityName = cpMap.get(e.referenceId) || '';
                else if (e.referenceType === 'SALE') entityName = saleMap.get(e.referenceId) || '';
                else if (e.referenceType === 'SUPPLIER_PAYMENT') entityName = spMap.get(e.referenceId) || '';
                e.entityName = entityName;
            });

            let totalIn = 0;
            let totalOut = 0;
            totalsByDirection.forEach((row) => {
                const amountByDirection = toNumber(row?._sum?.amount);
                if (row.direction === TREASURY_DIRECTION.IN) totalIn += amountByDirection;
                else totalOut += amountByDirection;
            });

            let previousIn = 0;
            let previousOut = 0;
            previousTotalsByDirection.forEach((row) => {
                const amountByDirection = toNumber(row?._sum?.amount);
                if (row.direction === TREASURY_DIRECTION.IN) previousIn += amountByDirection;
                else previousOut += amountByDirection;
            });

            let previousSaleIncome = 0;
            let previousCustomerPayments = 0;
            let previousDepositsIn = 0;
            let previousDepositsRefund = 0;
            previousRevenueByType.forEach((row) => {
                const amount = toNumber(row?._sum?.amount);
                const signedAmount = row.direction === TREASURY_DIRECTION.IN ? amount : -amount;

                if (row.entryType === TREASURY_ENTRY_TYPE.SALE_INCOME) {
                    previousSaleIncome += signedAmount;
                } else if (row.entryType === TREASURY_ENTRY_TYPE.CUSTOMER_PAYMENT) {
                    previousCustomerPayments += signedAmount;
                } else if (row.entryType === TREASURY_ENTRY_TYPE.DEPOSIT_IN) {
                    previousDepositsIn += signedAmount;
                } else if (row.entryType === TREASURY_ENTRY_TYPE.DEPOSIT_REFUND) {
                    previousDepositsRefund += Math.abs(signedAmount);
                }
            });

            const byPaymentMethodMap = new Map();
            const byEntryTypeMap = new Map();
            const byTreasuryMap = new Map();
            const revenueByPaymentMethodMap = new Map();
            const revenueByTreasuryMap = new Map();
            const revenueEntries = [];

            const saleReferences = new Set();
            const customerPaymentReferences = new Set();
            const depositInReferences = new Set();
            const depositRefundReferences = new Set();
            const sourceCountByType = new Map();

            const revenueChannelTotals = {
                cash: 0,
                vodafoneCash: 0,
                instaPay: 0,
                other: 0
            };

            let totalSaleIncome = 0;
            let totalCustomerPayments = 0;
            let totalDepositsIn = 0;
            let totalDepositsRefund = 0;
            let cashIn = 0;
            let cashOut = 0;

            entries.forEach((entry) => {
                const amount = Math.max(0, toNumber(entry.amount));
                const signedAmount = entry.direction === TREASURY_DIRECTION.IN ? amount : -amount;
                const paymentMethodId = entry?.paymentMethod?.id || 0;
                const paymentMethodCode = resolveReportPaymentMethodCode(entry?.paymentMethod);
                const paymentMethodName = entry?.paymentMethod?.name || 'غير محدد';
                const paymentMethodKey = `${paymentMethodId}:${paymentMethodCode}`;
                const treasuryKey = entry?.treasury?.id || entry?.treasuryId || 0;
                const treasuryName = entry?.treasury?.name || `Treasury #${treasuryKey}`;

                if (!byPaymentMethodMap.has(paymentMethodKey)) {
                    byPaymentMethodMap.set(paymentMethodKey, {
                        paymentMethodId: paymentMethodId || null,
                        code: paymentMethodCode,
                        name: paymentMethodName,
                        totalIn: 0,
                        totalOut: 0,
                        net: 0,
                        count: 0
                    });
                }
                const methodRow = byPaymentMethodMap.get(paymentMethodKey);
                if (entry.direction === TREASURY_DIRECTION.IN) methodRow.totalIn += amount;
                else methodRow.totalOut += amount;
                methodRow.net += signedAmount;
                methodRow.count += 1;

                if (!byEntryTypeMap.has(entry.entryType)) {
                    byEntryTypeMap.set(entry.entryType, {
                        entryType: entry.entryType,
                        totalIn: 0,
                        totalOut: 0,
                        net: 0,
                        count: 0
                    });
                }
                const typeRow = byEntryTypeMap.get(entry.entryType);
                if (entry.direction === TREASURY_DIRECTION.IN) typeRow.totalIn += amount;
                else typeRow.totalOut += amount;
                typeRow.net += signedAmount;
                typeRow.count += 1;

                if (!byTreasuryMap.has(treasuryKey)) {
                    byTreasuryMap.set(treasuryKey, {
                        treasuryId: treasuryKey || null,
                        treasuryName,
                        totalIn: 0,
                        totalOut: 0,
                        net: 0,
                        count: 0
                    });
                }
                const treasurySummaryRow = byTreasuryMap.get(treasuryKey);
                if (entry.direction === TREASURY_DIRECTION.IN) treasurySummaryRow.totalIn += amount;
                else treasurySummaryRow.totalOut += amount;
                treasurySummaryRow.net += signedAmount;
                treasurySummaryRow.count += 1;

                if (paymentMethodCode === 'CASH') {
                    if (entry.direction === TREASURY_DIRECTION.IN) cashIn += amount;
                    else cashOut += amount;
                }

                if (!TREASURY_REVENUE_ENTRY_TYPES.has(entry.entryType)) {
                    return;
                }

                revenueEntries.push(entry);

                const sourceCountKey = `${entry.entryType}:${entry.direction}`;
                sourceCountByType.set(sourceCountKey, (sourceCountByType.get(sourceCountKey) || 0) + 1);

                if (entry.entryType === TREASURY_ENTRY_TYPE.SALE_INCOME) {
                    totalSaleIncome += signedAmount;
                    if (entry.referenceId) saleReferences.add(entry.referenceId);
                } else if (entry.entryType === TREASURY_ENTRY_TYPE.CUSTOMER_PAYMENT) {
                    totalCustomerPayments += signedAmount;
                    if (entry.referenceId) customerPaymentReferences.add(entry.referenceId);
                } else if (entry.entryType === TREASURY_ENTRY_TYPE.DEPOSIT_IN) {
                    totalDepositsIn += signedAmount;
                    if (entry.referenceId) depositInReferences.add(entry.referenceId);
                } else if (entry.entryType === TREASURY_ENTRY_TYPE.DEPOSIT_REFUND) {
                    totalDepositsRefund += Math.abs(signedAmount);
                    if (entry.referenceId) depositRefundReferences.add(entry.referenceId);
                }

                if (!revenueByPaymentMethodMap.has(paymentMethodKey)) {
                    revenueByPaymentMethodMap.set(paymentMethodKey, {
                        paymentMethodId: paymentMethodId || null,
                        code: paymentMethodCode,
                        name: paymentMethodName,
                        totalIn: 0,
                        totalOut: 0,
                        net: 0,
                        count: 0,
                        saleIncomeAmount: 0,
                        customerPaymentAmount: 0,
                        depositsInAmount: 0,
                        depositsRefundAmount: 0,
                        revenueAmount: 0
                    });
                }
                const revenueMethodRow = revenueByPaymentMethodMap.get(paymentMethodKey);
                if (entry.direction === TREASURY_DIRECTION.IN) revenueMethodRow.totalIn += amount;
                else revenueMethodRow.totalOut += amount;
                revenueMethodRow.net += signedAmount;
                revenueMethodRow.count += 1;

                if (entry.entryType === TREASURY_ENTRY_TYPE.SALE_INCOME) {
                    revenueMethodRow.saleIncomeAmount += signedAmount;
                } else if (entry.entryType === TREASURY_ENTRY_TYPE.CUSTOMER_PAYMENT) {
                    revenueMethodRow.customerPaymentAmount += signedAmount;
                } else if (entry.entryType === TREASURY_ENTRY_TYPE.DEPOSIT_IN) {
                    revenueMethodRow.depositsInAmount += signedAmount;
                } else if (entry.entryType === TREASURY_ENTRY_TYPE.DEPOSIT_REFUND) {
                    revenueMethodRow.depositsRefundAmount += Math.abs(signedAmount);
                }

                const channelKey = resolveRevenueChannelFromCode(paymentMethodCode);
                revenueChannelTotals[channelKey] += signedAmount;

                if (!revenueByTreasuryMap.has(treasuryKey)) {
                    revenueByTreasuryMap.set(treasuryKey, {
                        treasuryId: treasuryKey || null,
                        treasuryName,
                        totalIn: 0,
                        totalOut: 0,
                        net: 0,
                        count: 0
                    });
                }
                const revenueTreasuryRow = revenueByTreasuryMap.get(treasuryKey);
                if (entry.direction === TREASURY_DIRECTION.IN) revenueTreasuryRow.totalIn += amount;
                else revenueTreasuryRow.totalOut += amount;
                revenueTreasuryRow.net += signedAmount;
                revenueTreasuryRow.count += 1;
            });

            const totalSales = Math.max(0, toNumber(salesAgg?._sum?.total));
            const totalReturns = Math.max(0, toNumber(returnsAgg?._sum?.total));
            const netSales = totalSales - totalReturns;
            const saleCount = parseInt(salesAgg?._count?.id, 10) || 0;
            const returnCount = parseInt(returnsAgg?._count?.id, 10) || 0;

            const previousTotalSales = Math.max(0, toNumber(previousSalesAgg?._sum?.total));
            const previousTotalReturns = Math.max(0, toNumber(previousReturnsAgg?._sum?.total));
            const previousNetSales = previousTotalSales - previousTotalReturns;

            const depositsNet = totalDepositsIn - totalDepositsRefund;
            const previousDepositsNet = previousDepositsIn - previousDepositsRefund;
            const totalRevenue = totalSaleIncome
                + totalCustomerPayments
                + (includeDepositsInRevenue ? totalDepositsIn : 0);
            const previousPeriodRevenue = previousSaleIncome
                + previousCustomerPayments
                + (includeDepositsInRevenue ? previousDepositsIn : 0);

            const net = totalIn - totalOut;
            const previousNet = previousIn - previousOut;
            const cashNet = cashIn - cashOut;

            const revenueByPaymentMethod = [...revenueByPaymentMethodMap.values()]
                .map((row) => {
                    const rowRevenueAmount = row.saleIncomeAmount
                        + row.customerPaymentAmount
                        + (includeDepositsInRevenue ? row.depositsInAmount : 0);

                    return {
                        ...row,
                        amount: row.net,
                        revenueAmount: rowRevenueAmount,
                        percentOfRevenue: totalRevenue > 0
                            ? Number(((rowRevenueAmount / totalRevenue) * 100).toFixed(2))
                            : 0
                    };
                })
                .sort((a, b) => b.revenueAmount - a.revenueAmount);

            const revenueByTreasury = [...revenueByTreasuryMap.values()]
                .map((row) => ({
                    ...row,
                    amount: row.net
                }))
                .sort((a, b) => b.net - a.net);

            const byPaymentMethod = [...byPaymentMethodMap.values()]
                .sort((a, b) => b.net - a.net);

            const byEntryType = [...byEntryTypeMap.values()]
                .sort((a, b) => b.net - a.net);

            const byTreasury = [...byTreasuryMap.values()]
                .sort((a, b) => b.net - a.net);

            return {
                date: from.toISOString().split('T')[0],
                fromDate: from.toISOString().split('T')[0],
                toDate: to.toISOString().split('T')[0],
                period: {
                    from: from.toISOString(),
                    to: to.toISOString(),
                    previousFrom: previousRange.from.toISOString(),
                    previousTo: previousRange.to.toISOString(),
                    days: rangeDays,
                    isSingleDay
                },
                summary: {
                    totalIn,
                    totalOut,
                    net,
                    cashIn,
                    cashOut,
                    cashNet,
                    netCashIn: cashNet,
                    previousDayNet: previousNet,
                    previousPeriodNet: previousNet,
                    changeFromPreviousDay: net - previousNet,
                    changeFromPreviousPeriod: net - previousNet
                },
                sales: {
                    totalSales,
                    totalReturns,
                    netSales,
                    saleCount,
                    returnCount,
                    previousPeriodNetSales: previousNetSales,
                    changeFromPreviousPeriodNetSales: netSales - previousNetSales
                },
                byPaymentMethod,
                byEntryType,
                byTreasury,
                revenue: {
                    config: {
                        includeDepositsInRevenue
                    },
                    summary: {
                        totalRevenue,
                        saleIncome: totalSaleIncome,
                        customerPayments: totalCustomerPayments,
                        depositsIn: totalDepositsIn,
                        depositsRefund: totalDepositsRefund,
                        depositsNet,
                        invoiceCount: saleReferences.size,
                        customerPaymentCount: customerPaymentReferences.size,
                        depositReceiptCount: depositInReferences.size,
                        depositRefundCount: depositRefundReferences.size,
                        previousDayRevenue: previousPeriodRevenue,
                        previousPeriodRevenue,
                        changeFromPreviousDayRevenue: totalRevenue - previousPeriodRevenue,
                        changeFromPreviousPeriodRevenue: totalRevenue - previousPeriodRevenue,
                        previousPeriodDepositsNet: previousDepositsNet,
                        channelTotals: {
                            cash: Number(revenueChannelTotals.cash.toFixed(2)),
                            vodafoneCash: Number(revenueChannelTotals.vodafoneCash.toFixed(2)),
                            instaPay: Number(revenueChannelTotals.instaPay.toFixed(2)),
                            other: Number(revenueChannelTotals.other.toFixed(2))
                        }
                    },
                    bySource: [
                        {
                            entryType: TREASURY_ENTRY_TYPE.SALE_INCOME,
                            direction: TREASURY_DIRECTION.IN,
                            amount: totalSaleIncome,
                            totalIn: totalSaleIncome,
                            totalOut: 0,
                            net: totalSaleIncome,
                            count: sourceCountByType.get(`${TREASURY_ENTRY_TYPE.SALE_INCOME}:${TREASURY_DIRECTION.IN}`) || 0,
                            referenceCount: saleReferences.size
                        },
                        {
                            entryType: TREASURY_ENTRY_TYPE.CUSTOMER_PAYMENT,
                            direction: TREASURY_DIRECTION.IN,
                            amount: totalCustomerPayments,
                            totalIn: totalCustomerPayments,
                            totalOut: 0,
                            net: totalCustomerPayments,
                            count: sourceCountByType.get(`${TREASURY_ENTRY_TYPE.CUSTOMER_PAYMENT}:${TREASURY_DIRECTION.IN}`) || 0,
                            referenceCount: customerPaymentReferences.size
                        },
                        {
                            entryType: TREASURY_ENTRY_TYPE.DEPOSIT_IN,
                            direction: TREASURY_DIRECTION.IN,
                            amount: totalDepositsIn,
                            totalIn: totalDepositsIn,
                            totalOut: 0,
                            net: totalDepositsIn,
                            count: sourceCountByType.get(`${TREASURY_ENTRY_TYPE.DEPOSIT_IN}:${TREASURY_DIRECTION.IN}`) || 0,
                            referenceCount: depositInReferences.size
                        },
                        {
                            entryType: TREASURY_ENTRY_TYPE.DEPOSIT_REFUND,
                            direction: TREASURY_DIRECTION.OUT,
                            amount: totalDepositsRefund,
                            totalIn: 0,
                            totalOut: totalDepositsRefund,
                            net: -totalDepositsRefund,
                            count: sourceCountByType.get(`${TREASURY_ENTRY_TYPE.DEPOSIT_REFUND}:${TREASURY_DIRECTION.OUT}`) || 0,
                            referenceCount: depositRefundReferences.size
                        }
                    ],
                    byPaymentMethod: revenueByPaymentMethod,
                    byTreasury: revenueByTreasury,
                    entries: revenueEntries
                },
                entries
            };
        } catch (error) {
            return { error: error.message };
        }
    },
    // ==================== PROFIT REPORT ====================
    async getProfitReport(params = {}) {
        try {
            const { from, to } = resolveReportRange(params);
            const customerId = parsePositiveInt(params?.customerId);
            const categoryId = parsePositiveInt(params?.categoryId);
            const saleType = params?.saleType || null;
            const userId = parsePositiveInt(params?.userId);

            // Build sale where clause
            const saleWhere = {
                invoiceDate: { gte: from, lte: to }
            };
            if (customerId) saleWhere.customerId = customerId;
            if (saleType && saleType !== 'ALL') saleWhere.saleType = saleType;
            if (userId) saleWhere.createdByUserId = userId;

            // ── 1. Fetch Sales with Items + Variants + Products ──
            const sales = await prisma.sale.findMany({
                where: saleWhere,
                include: {
                    customer: { select: { id: true, name: true } },
                    createdByUser: { select: { id: true, name: true } },
                    items: {
                        include: {
                            variant: {
                                include: {
                                    product: {
                                        select: { id: true, name: true, cost: true, categoryId: true, category: { select: { id: true, name: true } } }
                                    }
                                }
                            }
                        }
                    }
                },
                orderBy: [{ invoiceDate: 'desc' }, { id: 'desc' }]
            });

            // ── 2. Fetch Returns in the period ──
            const returnWhere = {
                createdAt: { gte: from, lte: to }
            };
            if (customerId) returnWhere.customerId = customerId;

            const returns = await prisma.return.findMany({
                where: returnWhere,
                include: {
                    customer: { select: { id: true, name: true } },
                    items: {
                        include: {
                            variant: {
                                include: {
                                    product: { select: { id: true, name: true, cost: true, categoryId: true } }
                                }
                            }
                        }
                    }
                }
            });

            // ── 3. Fetch Expenses in the period ──
            const expenses = await prisma.expense.findMany({
                where: {
                    expenseDate: { gte: from, lte: to }
                },
                include: {
                    category: { select: { id: true, name: true } }
                },
                orderBy: { expenseDate: 'desc' }
            });

            // ── 4. Helper: resolve cost for a variant ──
            const resolveCost = (variant) => {
                const variantCost = Number(variant?.cost || 0);
                if (variantCost > 0) return variantCost;
                const productCost = Number(variant?.product?.cost || 0);
                if (productCost > 0) return productCost;
                return 0;
            };

            // ── 5. Calculate per-invoice profit ──
            let totalSalesRevenue = 0;
            let totalCOGS = 0;
            let totalItemDiscounts = 0;
            let totalInvoiceDiscounts = 0;
            let totalInvoicesCount = 0;
            let itemsWithNoCost = 0;
            let totalQuantitySold = 0;

            // Aggregation maps
            const productMap = new Map();
            const categoryMap = new Map();
            const customerMap = new Map();

            const invoiceDetails = [];

            // Filter by category if needed
            const filteredSales = categoryId
                ? sales.filter(sale => sale.items.some(item => item.variant?.product?.categoryId === categoryId))
                : sales;

            for (const sale of filteredSales) {
                let invoiceRevenue = 0;
                let invoiceCOGS = 0;
                let invoiceItemDiscount = 0;
                let invoiceItemCount = 0;
                let invoiceHasNoCost = false;

                const saleItems = categoryId
                    ? sale.items.filter(item => item.variant?.product?.categoryId === categoryId)
                    : sale.items;

                for (const item of saleItems) {
                    const qty = Math.max(0, Number(item.quantity || 0));
                    const salePrice = Number(item.price || 0);
                    const itemDiscount = Number(item.discount || 0);
                    const cost = resolveCost(item.variant);

                    if (cost === 0) {
                        itemsWithNoCost++;
                        invoiceHasNoCost = true;
                    }

                    const lineRevenue = salePrice * qty;
                    const lineCOGS = cost * qty;

                    invoiceRevenue += lineRevenue;
                    invoiceCOGS += lineCOGS;
                    invoiceItemDiscount += itemDiscount;
                    invoiceItemCount += qty;

                    // Aggregate by product
                    const variantId = item.variantId;
                    const productId = item.variant?.product?.id || 0;
                    const productName = item.variant?.product?.name || 'منتج غير معروف';
                    const variantLabel = item.variant ? `${item.variant.productSize || ''} ${item.variant.color || ''}`.trim() : '';
                    const productKey = `${productId}:${variantId}`;

                    if (!productMap.has(productKey)) {
                        productMap.set(productKey, {
                            productId,
                            variantId,
                            productName,
                            variantLabel,
                            cost,
                            quantitySold: 0,
                            totalRevenue: 0,
                            totalCOGS: 0,
                            totalDiscount: 0,
                            totalProfit: 0,
                            salesPrices: [],
                            hasCost: cost > 0,
                            categoryId: item.variant?.product?.categoryId || null,
                            categoryName: item.variant?.product?.category?.name || 'بدون تصنيف'
                        });
                    }

                    const pEntry = productMap.get(productKey);
                    pEntry.quantitySold += qty;
                    pEntry.totalRevenue += lineRevenue;
                    pEntry.totalCOGS += lineCOGS;
                    pEntry.totalDiscount += itemDiscount;
                    pEntry.salesPrices.push(salePrice);

                    // Aggregate by category
                    const catId = item.variant?.product?.categoryId || 0;
                    const catName = item.variant?.product?.category?.name || 'بدون تصنيف';
                    const catKey = catId;

                    if (!categoryMap.has(catKey)) {
                        categoryMap.set(catKey, {
                            categoryId: catId,
                            categoryName: catName,
                            productsSet: new Set(),
                            quantitySold: 0,
                            totalRevenue: 0,
                            totalCOGS: 0,
                            totalDiscount: 0
                        });
                    }

                    const cEntry = categoryMap.get(catKey);
                    cEntry.productsSet.add(productId);
                    cEntry.quantitySold += qty;
                    cEntry.totalRevenue += lineRevenue;
                    cEntry.totalCOGS += lineCOGS;
                    cEntry.totalDiscount += itemDiscount;
                }

                // Sale-level discount
                const saleDiscount = Number(sale.discount || 0);
                const invoiceProfit = invoiceRevenue - invoiceCOGS - invoiceItemDiscount - saleDiscount;
                const invoiceMargin = invoiceRevenue > 0 ? (invoiceProfit / invoiceRevenue) * 100 : 0;

                totalSalesRevenue += invoiceRevenue;
                totalCOGS += invoiceCOGS;
                totalItemDiscounts += invoiceItemDiscount;
                totalInvoiceDiscounts += saleDiscount;
                totalInvoicesCount++;
                totalQuantitySold += invoiceItemCount;

                invoiceDetails.push({
                    saleId: sale.id,
                    invoiceDate: sale.invoiceDate,
                    customerName: sale.customer?.name || 'عميل نقدي',
                    customerId: sale.customerId,
                    saleType: sale.saleType,
                    createdBy: sale.createdByUser?.name || '-',
                    invoiceTotal: Number(sale.total || 0),
                    revenue: invoiceRevenue,
                    cogs: invoiceCOGS,
                    itemDiscount: invoiceItemDiscount,
                    saleDiscount,
                    profit: invoiceProfit,
                    marginPercent: Number(invoiceMargin.toFixed(1)),
                    itemCount: invoiceItemCount,
                    hasNoCost: invoiceHasNoCost
                });

                // Aggregate by customer
                const custId = sale.customerId || 0;
                const custName = sale.customer?.name || 'عميل نقدي';

                if (!customerMap.has(custId)) {
                    customerMap.set(custId, {
                        customerId: custId || null,
                        customerName: custName,
                        invoiceCount: 0,
                        totalRevenue: 0,
                        totalCOGS: 0,
                        totalDiscount: 0,
                        totalProfit: 0
                    });
                }

                const custEntry = customerMap.get(custId);
                custEntry.invoiceCount++;
                custEntry.totalRevenue += invoiceRevenue;
                custEntry.totalCOGS += invoiceCOGS;
                custEntry.totalDiscount += invoiceItemDiscount + saleDiscount;
                custEntry.totalProfit += invoiceProfit;
            }

            // ── 6. Calculate returns impact ──
            let totalReturnsAmount = 0;
            let totalReturnsCOGS = 0;
            let totalReturnsProfitLost = 0;
            const returnDetails = [];

            for (const ret of returns) {
                let returnRevenue = 0;
                let returnCOGS = 0;

                for (const item of ret.items) {
                    const qty = Math.max(0, Number(item.quantity || 0));
                    const returnPrice = Number(item.price || 0);
                    const cost = resolveCost(item.variant);

                    returnRevenue += returnPrice * qty;
                    returnCOGS += cost * qty;
                }

                const profitLost = returnRevenue - returnCOGS;
                totalReturnsAmount += returnRevenue;
                totalReturnsCOGS += returnCOGS;
                totalReturnsProfitLost += profitLost;

                returnDetails.push({
                    returnId: ret.id,
                    saleId: ret.saleId,
                    createdAt: ret.createdAt,
                    customerName: ret.customer?.name || '-',
                    amount: returnRevenue,
                    cogs: returnCOGS,
                    profitLost
                });
            }

            // ── 7. Calculate expenses ──
            const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
            const expenseByCategoryMap = new Map();

            for (const exp of expenses) {
                const catId = exp.categoryId || 0;
                const catName = exp.category?.name || 'بدون تصنيف';

                if (!expenseByCategoryMap.has(catId)) {
                    expenseByCategoryMap.set(catId, {
                        categoryId: catId || null,
                        categoryName: catName,
                        count: 0,
                        total: 0
                    });
                }

                const entry = expenseByCategoryMap.get(catId);
                entry.count++;
                entry.total += Number(exp.amount || 0);
            }

            // ── 8. Finalize product aggregations ──
            const productReport = [];
            for (const [, pData] of productMap) {
                const profit = pData.totalRevenue - pData.totalCOGS - pData.totalDiscount;
                const avgSalePrice = pData.salesPrices.length > 0
                    ? pData.salesPrices.reduce((s, p) => s + p, 0) / pData.salesPrices.length
                    : 0;
                const margin = pData.totalRevenue > 0 ? (profit / pData.totalRevenue) * 100 : 0;

                productReport.push({
                    productId: pData.productId,
                    variantId: pData.variantId,
                    productName: pData.productName,
                    variantLabel: pData.variantLabel,
                    cost: pData.cost,
                    quantitySold: pData.quantitySold,
                    avgSalePrice: Number(avgSalePrice.toFixed(2)),
                    totalRevenue: pData.totalRevenue,
                    totalCOGS: pData.totalCOGS,
                    totalDiscount: pData.totalDiscount,
                    profit,
                    marginPercent: Number(margin.toFixed(1)),
                    hasCost: pData.hasCost,
                    categoryName: pData.categoryName
                });
            }
            productReport.sort((a, b) => b.profit - a.profit);

            // ── 9. Finalize category aggregations ──
            const categoryReport = [];
            for (const [, cData] of categoryMap) {
                const profit = cData.totalRevenue - cData.totalCOGS - cData.totalDiscount;
                const margin = cData.totalRevenue > 0 ? (profit / cData.totalRevenue) * 100 : 0;

                categoryReport.push({
                    categoryId: cData.categoryId || null,
                    categoryName: cData.categoryName,
                    productCount: cData.productsSet.size,
                    quantitySold: cData.quantitySold,
                    totalRevenue: cData.totalRevenue,
                    totalCOGS: cData.totalCOGS,
                    totalDiscount: cData.totalDiscount,
                    profit,
                    marginPercent: Number(margin.toFixed(1))
                });
            }
            categoryReport.sort((a, b) => b.profit - a.profit);

            // ── 10. Finalize customer aggregations ──
            const customerReport = [];
            for (const [, custData] of customerMap) {
                const margin = custData.totalRevenue > 0 ? (custData.totalProfit / custData.totalRevenue) * 100 : 0;

                customerReport.push({
                    ...custData,
                    marginPercent: Number(margin.toFixed(1))
                });
            }
            customerReport.sort((a, b) => b.totalProfit - a.totalProfit);

            // ── 11. Finalize expense by category ──
            const expenseByCategory = [];
            for (const [, expData] of expenseByCategoryMap) {
                expenseByCategory.push({
                    ...expData,
                    percentOfRevenue: totalSalesRevenue > 0
                        ? Number(((expData.total / totalSalesRevenue) * 100).toFixed(1))
                        : 0
                });
            }
            expenseByCategory.sort((a, b) => b.total - a.total);

            // ── 12. Build summary ──
            const totalDiscounts = totalItemDiscounts + totalInvoiceDiscounts;
            const grossProfit = totalSalesRevenue - totalCOGS - totalDiscounts;
            const netProfitAfterReturns = grossProfit - totalReturnsProfitLost;
            const netProfit = netProfitAfterReturns - totalExpenses;
            const grossMargin = totalSalesRevenue > 0 ? (grossProfit / totalSalesRevenue) * 100 : 0;
            const netMargin = totalSalesRevenue > 0 ? (netProfit / totalSalesRevenue) * 100 : 0;
            const avgProfitPerInvoice = totalInvoicesCount > 0 ? netProfitAfterReturns / totalInvoicesCount : 0;

            return {
                summary: {
                    totalSalesRevenue: Number(totalSalesRevenue.toFixed(2)),
                    totalCOGS: Number(totalCOGS.toFixed(2)),
                    totalItemDiscounts: Number(totalItemDiscounts.toFixed(2)),
                    totalInvoiceDiscounts: Number(totalInvoiceDiscounts.toFixed(2)),
                    totalDiscounts: Number(totalDiscounts.toFixed(2)),
                    grossProfit: Number(grossProfit.toFixed(2)),
                    grossMarginPercent: Number(grossMargin.toFixed(1)),
                    totalReturnsAmount: Number(totalReturnsAmount.toFixed(2)),
                    totalReturnsProfitLost: Number(totalReturnsProfitLost.toFixed(2)),
                    netProfitAfterReturns: Number(netProfitAfterReturns.toFixed(2)),
                    totalExpenses: Number(totalExpenses.toFixed(2)),
                    netProfit: Number(netProfit.toFixed(2)),
                    netMarginPercent: Number(netMargin.toFixed(1)),
                    invoiceCount: totalInvoicesCount,
                    returnCount: returns.length,
                    avgProfitPerInvoice: Number(avgProfitPerInvoice.toFixed(2)),
                    totalQuantitySold,
                    itemsWithNoCost
                },
                invoices: invoiceDetails,
                products: productReport,
                categories: categoryReport,
                customers: customerReport,
                returns: returnDetails,
                expenses: {
                    total: Number(totalExpenses.toFixed(2)),
                    byCategory: expenseByCategory
                },
                period: {
                    from: from.toISOString(),
                    to: to.toISOString()
                }
            };
        } catch (error) {
            return { error: error.message };
        }
    },

    // ==================== SUPPLIERS ====================
    async getSuppliers() {
        try {
            return await prisma.supplier.findMany({
                orderBy: { createdAt: 'desc' }
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async addSupplier(supplierData) {
        try {
            const supplier = await prisma.supplier.create({
                data: {
                    name: supplierData.name,
                    phone: supplierData.phone || null,
                    address: supplierData.address || null,
                    balance: parseFloat(supplierData.balance || 0)
                }
            });

            await writeEntityAuditLog(prisma, {
                action: AUDIT_ACTION.SUPPLIER_CREATE,
                entityType: 'Supplier',
                entityId: supplier.id,
                note: `Create supplier ${supplier.name}`,
                after: supplier
            });

            return supplier;
        } catch (error) {
            return { error: error.message };
        }
    },

    async updateSupplier(id, supplierData) {
        try {
            const supplierId = parseInt(id);
            const before = await prisma.supplier.findUnique({ where: { id: supplierId } });
            const supplier = await prisma.supplier.update({
                where: { id: parseInt(id) },
                data: {
                    name: supplierData.name,
                    phone: supplierData.phone || null,
                    address: supplierData.address || null
                }
            });

            await writeEntityAuditLog(prisma, {
                action: AUDIT_ACTION.SUPPLIER_UPDATE,
                entityType: 'Supplier',
                entityId: supplier.id,
                note: `Update supplier ${supplier.name}`,
                before,
                after: supplier
            });

            return supplier;
        } catch (error) {
            return { error: error.message };
        }
    },

    async deleteSupplier(id) {
        try {
            const supplierId = parseInt(id);
            if (isNaN(supplierId)) return { error: 'Invalid supplier id' };

            // Check for operations
            const purchasesCount = await prisma.purchase.count({ where: { supplierId } });
            if (purchasesCount > 0) return { error: 'لا يمكن حذف المورد لارتباطه بفواتير شراء.' };

            const paymentsCount = await prisma.supplierPayment.count({ where: { supplierId } });
            if (paymentsCount > 0) return { error: 'لا يمكن حذف المورد لارتباطه بمدفوعات.' };

            const returnsCount = await prisma.purchaseReturn.count({ where: { supplierId } });
            if (returnsCount > 0) return { error: 'لا يمكن حذف المورد لارتباطه بمرتجعات شراء.' };

            const before = await prisma.supplier.findUnique({ where: { id: supplierId } });
            const supplier = await prisma.supplier.delete({
                where: { id: supplierId }
            });

            await writeEntityAuditLog(prisma, {
                action: AUDIT_ACTION.SUPPLIER_DELETE,
                entityType: 'Supplier',
                entityId: supplier.id,
                note: `Delete supplier ${before?.name || supplier.id}`,
                before,
                after: supplier
            });

            return supplier;
        } catch (error) {
            const mapped = mapSupplierDeleteConstraintError(error);
            return { error: mapped || error.message };
        }
    },

    async addSupplierPayment(paymentData) {
        try {
            const supplierId = parsePositiveInt(paymentData?.supplierId);
            const amount = Math.max(0, toNumber(paymentData?.amount));

            const paymentDateInput = paymentData?.paymentDate ? new Date(paymentData.paymentDate) : new Date();
            // If payment date is today, use current time. Otherwise use start of day.
            const today = new Date();
            const isToday = paymentDateInput.toDateString() === today.toDateString();
            const paymentDate = isToday ? new Date() : startOfDay(paymentDateInput);

            if (!supplierId) {
                return { error: 'Invalid supplierId' };
            }
            if (amount <= 0) {
                return { error: 'Invalid payment amount' };
            }

            return await prisma.$transaction(async (tx) => {
                const payment = await tx.supplierPayment.create({
                    data: {
                        supplierId,
                        amount,
                        notes: paymentData?.notes || null,
                        createdAt: paymentDate,
                        createdByUserId: getActorUserId(paymentData?.createdByUserId, paymentData?.userId)
                    }
                });

                await tx.supplier.update({
                    where: { id: supplierId },
                    data: { balance: { increment: amount } }
                });

                const supplierPaymentTreasuryId = await resolveTreasuryId(tx, paymentData?.treasuryId);
                const treasuryEntryResult = await createTreasuryEntry(tx, {
                    treasuryId: supplierPaymentTreasuryId,
                    entryType: TREASURY_ENTRY_TYPE.SUPPLIER_PAYMENT,
                    direction: TREASURY_DIRECTION.OUT,
                    amount,
                    notes: `Supplier payment #${payment.id}${paymentData?.notes ? ` - ${paymentData.notes}` : ''}`,
                    referenceType: 'SUPPLIER_PAYMENT',
                    referenceId: payment.id,
                    entryDate: paymentDate,
                    allowNegative: true
                });
                throwIfResultError(treasuryEntryResult);

                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.SUPPLIER_PAYMENT_CREATE,
                    entityType: 'SupplierPayment',
                    entityId: payment.id,
                    note: `Create supplier payment #${payment.id}`,
                    after: payment,
                    referenceType: 'SUPPLIER_PAYMENT',
                    referenceId: payment.id
                });

                return payment;
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async getSupplierPayments(supplierId) {
        try {
            return await prisma.supplierPayment.findMany({
                where: { supplierId: parseInt(supplierId) },
                orderBy: { createdAt: 'desc' },
                include: {
                    createdByUser: { select: { name: true } }
                }
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async updateSupplierPayment(paymentId, paymentData) {
        try {
            const id = parsePositiveInt(paymentId);
            if (!id) return { error: 'Invalid payment ID' };

            const supplierId = parsePositiveInt(paymentData?.supplierId);
            const amount = Math.max(0, toNumber(paymentData?.amount));
            const paymentDateInput = paymentData?.paymentDate ? new Date(paymentData.paymentDate) : new Date();

            return await prisma.$transaction(async (tx) => {
                const existingPayment = await tx.supplierPayment.findUnique({
                    where: { id }
                });

                if (!existingPayment) {
                    return { error: 'Payment not found' };
                }

                const amountDiff = amount - Number(existingPayment.amount);

                const payment = await tx.supplierPayment.update({
                    where: { id },
                    data: {
                        supplierId: supplierId || existingPayment.supplierId,
                        amount,
                        notes: paymentData?.notes ?? existingPayment.notes,
                        createdAt: paymentDateInput
                    }
                });

                if (amountDiff !== 0) {
                    await tx.supplier.update({
                        where: { id: existingPayment.supplierId },
                        data: { balance: { increment: amountDiff } }
                    });
                }

                // Update Treasury Entry if exists
                const treasuryEntry = await tx.treasuryEntry.findFirst({
                    where: { 
                        referenceType: 'SUPPLIER_PAYMENT',
                        referenceId: id
                    }
                });

                if (treasuryEntry) {
                    const treasuryId = await resolveTreasuryId(tx, paymentData?.treasuryId || treasuryEntry.treasuryId);
                    await tx.treasuryEntry.update({
                        where: { id: treasuryEntry.id },
                        data: {
                            amount,
                            entryDate: paymentDateInput,
                            treasuryId,
                            notes: `Supplier payment #${id}${payment.notes ? ` - ${payment.notes}` : ''}`
                        }
                    });
                }

                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.SUPPLIER_PAYMENT_UPDATE || 'UPDATE',
                    entityType: 'SupplierPayment',
                    entityId: id,
                    note: `Update supplier payment #${id}`,
                    before: existingPayment,
                    after: payment,
                    referenceType: 'SUPPLIER_PAYMENT',
                    referenceId: id
                });

                return payment;
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async deleteSupplierPayment(paymentId) {
        try {
            const id = parsePositiveInt(paymentId);
            if (!id) return { error: 'Invalid payment ID' };

            return await prisma.$transaction(async (tx) => {
                const existingPayment = await tx.supplierPayment.findUnique({
                    where: { id }
                });

                if (!existingPayment) {
                    return { error: 'Payment not found' };
                }

                await tx.supplier.update({
                    where: { id: existingPayment.supplierId },
                    data: { balance: { decrement: existingPayment.amount } }
                });

                await tx.treasuryEntry.deleteMany({
                    where: {
                        referenceType: 'SUPPLIER_PAYMENT',
                        referenceId: id
                    }
                });

                const payment = await tx.supplierPayment.delete({
                    where: { id }
                });

                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.SUPPLIER_PAYMENT_DELETE || 'DELETE',
                    entityType: 'SupplierPayment',
                    entityId: id,
                    note: `Delete supplier payment #${id}`,
                    before: existingPayment,
                    after: payment,
                    referenceType: 'SUPPLIER_PAYMENT',
                    referenceId: id
                });

                return payment;
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    // ==================== EXPENSES ====================
    async getExpenses(params = {}) {
        try {
            const where = {};
            const categoryId = parsePositiveInt(params?.categoryId);
            const userId = parsePositiveInt(params?.userId);
            if (categoryId) where.categoryId = categoryId;
            if (userId) where.createdByUserId = userId;
            if (params?.fromDate || params?.toDate) {
                where.expenseDate = {};
                if (params.fromDate) where.expenseDate.gte = startOfDay(new Date(params.fromDate));
                if (params.toDate) where.expenseDate.lte = endOfDay(new Date(params.toDate));
            }
            return await prisma.expense.findMany({
                where,
                include: { 
                    category: true,
                    createdByUser: { select: { name: true } }
                },
                orderBy: { expenseDate: 'desc' }
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async addExpense(expenseData) {
        try {
            const title = String(expenseData?.title || '').trim();
            const amount = Math.max(0, toNumber(expenseData?.amount));
            const expenseDate = parseDateOrDefault(expenseData?.expenseDate, new Date());

            if (!title) {
                return { error: 'Expense title is required' };
            }

            return await prisma.$transaction(async (tx) => {
                const expense = await tx.expense.create({
                    data: {
                        title,
                        amount,
                        expenseDate,
                        notes: expenseData.notes || null,
                        categoryId: parsePositiveInt(expenseData.categoryId) || undefined,
                        createdByUserId: getActorUserId(expenseData?.createdByUserId, expenseData?.userId)
                    },
                    include: { category: true }
                });

                const expenseTreasuryId = await resolveTreasuryId(tx, expenseData?.treasuryId);
                const paymentMethodId = await resolvePaymentMethodId(
                    tx,
                    expenseData?.paymentMethodId ?? expenseData?.paymentMethod,
                    1
                );

                const treasuryEntryResult = await createTreasuryEntry(tx, {
                    treasuryId: expenseTreasuryId,
                    entryType: TREASURY_ENTRY_TYPE.EXPENSE_PAYMENT,
                    direction: TREASURY_DIRECTION.OUT,
                    amount,
                    notes: `Expense #${expense.id}${expenseData?.title ? ` - ${expenseData.title}` : ''}`,
                    referenceType: 'EXPENSE',
                    referenceId: expense.id,
                    paymentMethodId,
                    entryDate: expenseDate,
                    allowNegative: true
                });
                throwIfResultError(treasuryEntryResult);

                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.EXPENSE_CREATE,
                    entityType: 'Expense',
                    entityId: expense.id,
                    note: `Create expense ${expense.title}`,
                    after: expense
                });

                return expense;
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async deleteExpense(id) {
        try {
            const parsedExpenseId = parsePositiveInt(id);
            if (!parsedExpenseId) {
                return { error: 'Invalid expenseId' };
            }

            return await prisma.$transaction(async (tx) => {
                const expense = await tx.expense.findUnique({
                    where: { id: parsedExpenseId },
                    select: { id: true }
                });

                if (!expense) {
                    return { error: 'Expense not found' };
                }

                const rollbackResult = await rollbackTreasuryEntriesByReference(tx, 'EXPENSE', parsedExpenseId);
                throwIfResultError(rollbackResult, 'Failed to rollback expense treasury entries');

                const before = await tx.expense.findUnique({
                    where: { id: parsedExpenseId },
                    include: { category: true }
                });

                const deletedExpense = await tx.expense.delete({
                    where: { id: parsedExpenseId }
                });

                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.EXPENSE_DELETE,
                    entityType: 'Expense',
                    entityId: parsedExpenseId,
                    note: `Delete expense ${before?.title || parsedExpenseId}`,
                    before,
                    after: deletedExpense
                });

                return deletedExpense;
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async updateExpense(id, expenseData) {
        try {
            const parsedId = parsePositiveInt(id);
            if (!parsedId) return { error: 'Invalid expenseId' };

            const title = String(expenseData?.title || '').trim();
            const amount = Math.max(0, toNumber(expenseData?.amount));
            if (!title) return { error: 'Expense title is required' };
            if (amount <= 0) return { error: 'Invalid expense amount' };

            const categoryId = parsePositiveInt(expenseData?.categoryId) || null;
            const notes = String(expenseData?.notes || '').trim() || null;
            const expenseDate = parseDateOrDefault(expenseData?.expenseDate, undefined);

            const data = { title, amount, categoryId, notes };
            if (expenseDate) data.expenseDate = expenseDate;

            return await prisma.$transaction(async (tx) => {
                const before = await tx.expense.findUnique({
                    where: { id: parsedId },
                    include: { category: true }
                });
                const updatedExpense = await tx.expense.update({
                    where: { id: parsedId },
                    data,
                    include: { category: true }
                });

                // Update associated TreasuryEntry to keep balance/totals in sync
                // Note: Treasury/PaymentMethod cannot be changed in edit mode currently, so we focus on amount/date/notes
                await tx.treasuryEntry.updateMany({
                    where: {
                        referenceType: 'EXPENSE',
                        referenceId: parsedId
                    },
                    data: {
                        amount,
                        entryDate: updatedExpense.expenseDate,
                        notes: `Expense #${updatedExpense.id}${updatedExpense.title ? ` - ${updatedExpense.title}` : ''}`
                    }
                });

                await writeEntityAuditLog(tx, {
                    action: AUDIT_ACTION.EXPENSE_UPDATE,
                    entityType: 'Expense',
                    entityId: parsedId,
                    note: `Update expense ${updatedExpense.title}`,
                    before,
                    after: updatedExpense
                });

                return updatedExpense;
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    // ==================== EXPENSE CATEGORIES ====================
    async getExpenseCategories() {
        try {
            return await prisma.expenseCategory.findMany({
                orderBy: { name: 'asc' },
                include: { _count: { select: { expenses: true } } }
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async addExpenseCategory(data) {
        try {
            const name = String(data?.name || '').trim();
            if (!name) return { error: 'Category name is required' };
            const category = await prisma.expenseCategory.create({ data: { name, color: data?.color || null, icon: data?.icon || null } });
            await writeEntityAuditLog(prisma, {
                action: AUDIT_ACTION.EXPENSE_CATEGORY_CREATE,
                entityType: 'ExpenseCategory',
                entityId: category.id,
                note: `Create expense category ${category.name}`,
                after: category
            });
            return category;
        } catch (error) {
            if (error?.code === 'P2002') return { error: 'اسم التصنيف موجود بالفعل' };
            return { error: error.message };
        }
    },

    async updateExpenseCategory(id, data) {
        try {
            const parsedId = parsePositiveInt(id);
            if (!parsedId) return { error: 'Invalid categoryId' };
            const name = String(data?.name || '').trim();
            if (!name) return { error: 'Category name is required' };
            const before = await prisma.expenseCategory.findUnique({ where: { id: parsedId } });
            const category = await prisma.expenseCategory.update({ where: { id: parsedId }, data: { name, color: data?.color || null, icon: data?.icon || null } });
            await writeEntityAuditLog(prisma, {
                action: AUDIT_ACTION.EXPENSE_CATEGORY_UPDATE,
                entityType: 'ExpenseCategory',
                entityId: category.id,
                note: `Update expense category ${category.name}`,
                before,
                after: category
            });
            return category;
        } catch (error) {
            if (error?.code === 'P2002') return { error: 'اسم التصنيف موجود بالفعل' };
            return { error: error.message };
        }
    },

    async deleteExpenseCategory(id) {
        try {
            const parsedId = parsePositiveInt(id);
            if (!parsedId) return { error: 'Invalid categoryId' };
            const before = await prisma.expenseCategory.findUnique({ where: { id: parsedId } });
            await prisma.expense.updateMany({ where: { categoryId: parsedId }, data: { categoryId: null } });
            const category = await prisma.expenseCategory.delete({ where: { id: parsedId } });
            await writeEntityAuditLog(prisma, {
                action: AUDIT_ACTION.EXPENSE_CATEGORY_DELETE,
                entityType: 'ExpenseCategory',
                entityId: category.id,
                note: `Delete expense category ${before?.name || category.id}`,
                before,
                after: category
            });
            return category;
        } catch (error) {
            return { error: error.message };
        }
    },

    // ==================== PRODUCT HISTORY ====================
    async getProductHistory(variantId) {
        const perf = startPerfTimer('db:getProductHistory', { variantId });
        try {
            const id = parsePositiveInt(variantId);
            if (!id) return { error: 'Invalid variant ID' };

            const [firstPurchase, lastPurchase, lastSale] = await Promise.all([
                // First Purchase
                prisma.purchaseItem.findFirst({
                    where: { variantId: id },
                    orderBy: { purchase: { invoiceDate: 'asc' } },
                    include: { purchase: { select: { invoiceDate: true } } }
                }),
                // Last Purchase
                prisma.purchaseItem.findFirst({
                    where: { variantId: id },
                    orderBy: { purchase: { invoiceDate: 'desc' } },
                    include: { purchase: { select: { invoiceDate: true } } }
                }),
                // Last Sale
                prisma.saleItem.findFirst({
                    where: { variantId: id },
                    orderBy: { sale: { invoiceDate: 'desc' } },
                    include: { sale: { select: { invoiceDate: true } } }
                })
            ]);

            const history = {
                firstPurchaseDate: firstPurchase?.purchase?.invoiceDate || null,
                lastPurchaseDate: lastPurchase?.purchase?.invoiceDate || null,
                lastSaleDate: lastSale?.sale?.invoiceDate || null
            };

            perf({ rows: 1 });
            return history;
        } catch (error) {
            perf({ error });
            return { error: error.message };
        }
    },

    // ==================== ROLES & PERMISSIONS ====================
    async getRoles() {
        try {
            return await prisma.role.findMany({
                include: {
                    permissions: {
                        include: {
                            permission: true
                        }
                    },
                    _count: {
                        select: { users: true }
                    }
                },
                orderBy: { name: 'asc' }
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async addRole(roleData) {
        try {
            return await prisma.$transaction(async (tx) => {
                const role = await tx.role.create({
                    data: {
                        name: roleData.name,
                        description: roleData.description || null
                    }
                });

                if (Array.isArray(roleData.permissionIds)) {
                    await tx.rolePermission.createMany({
                        data: roleData.permissionIds.map(pId => ({
                            roleId: role.id,
                            permissionId: pId
                        }))
                    });
                }

                return await tx.role.findUnique({
                    where: { id: role.id },
                    include: { permissions: { include: { permission: true } } }
                });
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async updateRole(id, roleData) {
        try {
            const roleId = parseInt(id);
            return await prisma.$transaction(async (tx) => {
                const role = await tx.role.update({
                    where: { id: roleId },
                    data: {
                        name: roleData.name,
                        description: roleData.description || null
                    }
                });

                if (Array.isArray(roleData.permissionIds)) {
                    // Update permissions: delete old ones and create new ones
                    await tx.rolePermission.deleteMany({
                        where: { roleId }
                    });
                    
                    if (roleData.permissionIds.length > 0) {
                        await tx.rolePermission.createMany({
                            data: roleData.permissionIds.map(pId => ({
                                roleId,
                                permissionId: pId
                            }))
                        });
                    }
                }

                return await tx.role.findUnique({
                    where: { id: roleId },
                    include: { permissions: { include: { permission: true } } }
                });
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async deleteRole(id) {
        try {
            const roleId = parseInt(id);
            // Check if any users are assigned to this role
            const userCount = await prisma.user.count({ where: { roleId } });
            if (userCount > 0) {
                return { error: 'لا يمكن حذف دور معين لمستخدمين. قم بتغيير أدوار المستخدمين أولاً.' };
            }

            return await prisma.role.delete({
                where: { id: roleId }
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async getPermissions() {
        try {
            return await prisma.permission.findMany({
                orderBy: { key: 'asc' }
            });
        } catch (error) {
            return { error: error.message };
        }
    },

    async syncPermissions() {
        try {
            console.log('[db-service] Syncing permissions...');
            const ops = PERMISSIONS.map(p => 
                prisma.permission.upsert({
                    where: { key: p.key },
                    update: { name: p.name },
                    create: p
                })
            );
            const savedPermissions = await Promise.all(ops);
            
            // Auto-assign all permissions to ADMIN role
            const adminRole = await prisma.role.findFirst({ where: { name: 'ADMIN' } });
            if (adminRole) {
                console.log('[db-service] Assigning all permissions to ADMIN...');
                const adminOps = savedPermissions.map(p => 
                    prisma.rolePermission.upsert({
                        where: {
                            roleId_permissionId: {
                                roleId: adminRole.id,
                                permissionId: p.id
                            }
                        },
                        update: {},
                        create: {
                            roleId: adminRole.id,
                            permissionId: p.id
                        }
                    })
                );
                await Promise.all(adminOps);
            }

            console.log(`[db-service] ✓ ${PERMISSIONS.length} permissions synced`);
            return { success: true };
        } catch (error) {
            console.error('[db-service] Permission sync failed:', error);
            return { error: error.message };
        }
    },

    // ==================== USERS ====================
    async getUsers() {
        try {
            const users = await prisma.user.findMany({
                include: {
                    role: {
                        select: { id: true, name: true }
                    },
                    warehouse: {
                        select: { id: true, name: true }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });
            return users.map(({ password, ...user }) => user);
        } catch (error) {
            return { error: error.message };
        }
    },

    async addUser(userData) {
        try {
            const hashedPassword = await bcrypt.hash(userData.password, 10);
            const user = await prisma.user.create({
                data: {
                    name: userData.name,
                    username: userData.username,
                    password: hashedPassword,
                    roleId: parsePositiveInt(userData.roleId),
                    warehouseId: parsePositiveInt(userData.warehouseId)
                },
                include: {
                    role: { select: { id: true, name: true } },
                    warehouse: { select: { id: true, name: true } }
                }
            });
            await writeEntityAuditLog(prisma, {
                action: AUDIT_ACTION.USER_CREATE,
                entityType: 'User',
                entityId: user.id,
                note: `Create user ${user.name}`,
                after: { id: user.id, name: user.name, username: user.username, roleId: user.roleId, roleName: user.role?.name, warehouseId: user.warehouseId }
            });
            const { password, ...userWithoutPassword } = user;
            return userWithoutPassword;
        } catch (error) {
            return { error: error.message };
        }
    },

    async updateUser(id, userData) {
        try {
            const userId = parseInt(id);

            // Self-protection: prevent changing own role
            const currentUserId = getCurrentSessionUserId();
            if (currentUserId && currentUserId === userId && userData.roleId) {
                const before = await prisma.user.findUnique({ where: { id: userId }, select: { roleId: true } });
                if (before && parsePositiveInt(userData.roleId) !== before.roleId) {
                    return { error: 'لا يمكنك تغيير دورك الخاص. اطلب من مسؤول آخر.' };
                }
            }

            const data = { 
                name: userData.name,
                username: userData.username,
                roleId: parsePositiveInt(userData.roleId),
                warehouseId: userData.hasOwnProperty('warehouseId') ? parsePositiveInt(userData.warehouseId) : undefined
            };

            if (userData.hasOwnProperty('isActive')) {
                // Self-protection: prevent deactivating self
                if (currentUserId && currentUserId === userId && !userData.isActive) {
                    return { error: 'لا يمكنك تعطيل حسابك الخاص.' };
                }
                data.isActive = Boolean(userData.isActive);
            }
            
            if (userData.password) {
                data.password = await bcrypt.hash(userData.password, 10);
            }
            
            const before = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, name: true, username: true, roleId: true, warehouseId: true, isActive: true, role: { select: { name: true } } }
            });
            
            const user = await prisma.user.update({
                where: { id: userId },
                data,
                include: {
                    role: { select: { id: true, name: true } },
                    warehouse: { select: { id: true, name: true } }
                }
            });
            
            await writeEntityAuditLog(prisma, {
                action: AUDIT_ACTION.USER_UPDATE,
                entityType: 'User',
                entityId: user.id,
                note: `Update user ${user.name}`,
                before,
                after: { id: user.id, name: user.name, username: user.username, roleId: user.roleId, warehouseId: user.warehouseId, isActive: user.isActive, roleName: user.role?.name }
            });
            const { password, ...userWithoutPassword } = user;
            return userWithoutPassword;
        } catch (error) {
            return { error: error.message };
        }
    },

    async deleteUser(id) {
        try {
            const userId = parseInt(id);

            // Self-protection: prevent deleting own account
            const currentUserId = getCurrentSessionUserId();
            if (currentUserId && currentUserId === userId) {
                return { error: 'لا يمكنك حذف حسابك الخاص.' };
            }

            const before = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, name: true, username: true, roleId: true }
            });
            const deletedUser = await prisma.user.delete({
                where: { id: userId }
            });

            await writeEntityAuditLog(prisma, {
                action: AUDIT_ACTION.USER_DELETE,
                entityType: 'User',
                entityId: deletedUser.id,
                note: `Delete user ${before?.name || deletedUser.id}`,
                before,
                after: { id: deletedUser.id, name: deletedUser.name, username: deletedUser.username, roleId: deletedUser.roleId }
            });

            return deletedUser;
        } catch (error) {
            return { error: error.message };
        }
    },

    async getAuditLogs(params = {}) {
        try {
            const page = Math.max(1, parseInt(params?.page, 10) || 1);
            const pageSize = Math.min(100, Math.max(10, parseInt(params?.pageSize, 10) || 25));
            const skip = (page - 1) * pageSize;
            const search = String(params?.search || '').trim();
            const userId = parsePositiveInt(params?.userId);
            const moduleFilter = normalizeString(params?.module);
            const actionFilter = normalizeString(params?.action);
            const fromDate = params?.fromDate ? startOfDay(new Date(params.fromDate)) : null;
            const toDate = params?.toDate ? endOfDay(new Date(params.toDate)) : null;

            // Entity types to hide (auto-generated internal ledger entries)
            const excludeModules = Array.isArray(params?.excludeModules)
                ? params.excludeModules.filter(Boolean)
                : [];

            const where = {
                ...(userId ? { performedByUserId: userId } : {}),
                ...(moduleFilter
                    ? { entityType: moduleFilter }
                    : excludeModules.length > 0 ? { entityType: { notIn: excludeModules } } : {}),
                ...(actionFilter ? { action: actionFilter } : {}),
                ...((fromDate || toDate) ? {
                    createdAt: {
                        ...(fromDate ? { gte: fromDate } : {}),
                        ...(toDate ? { lte: toDate } : {})
                    }
                } : {}),
                ...(search ? {
                    OR: [
                        { action: { contains: search, mode: 'insensitive' } },
                        { entityType: { contains: search, mode: 'insensitive' } },
                        { note: { contains: search, mode: 'insensitive' } },
                        { performedBy: { is: { name: { contains: search, mode: 'insensitive' } } } }
                    ]
                } : {})
            };

            const entityTypeWhere = excludeModules.length > 0
                ? { entityType: { notIn: excludeModules } }
                : {};

            const [total, logs, actions, entityTypes, users] = await Promise.all([
                prisma.auditLog.count({ where }),
                prisma.auditLog.findMany({
                    where,
                    include: {
                        performedBy: {
                            select: { id: true, name: true, username: true, role: true }
                        }
                    },
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: pageSize
                }),
                prisma.auditLog.findMany({
                    distinct: ['action'],
                    select: { action: true },
                    orderBy: { action: 'asc' }
                }),
                prisma.auditLog.findMany({
                    where: entityTypeWhere,
                    distinct: ['entityType'],
                    select: { entityType: true },
                    orderBy: { entityType: 'asc' }
                }),
                prisma.user.findMany({
                    select: { id: true, name: true, username: true, role: true },
                    orderBy: { name: 'asc' }
                })
            ]);

            return {
                data: logs,
                total,
                page,
                pageSize,
                totalPages: Math.max(1, Math.ceil(total / pageSize)),
                filters: {
                    actions: actions.map((item) => item.action).filter(Boolean),
                    modules: entityTypes.map((item) => item.entityType).filter(Boolean),
                    users
                }
            };
        } catch (error) {
            return { error: error.message };
        }
    },

    async logSystemActivity(payload = {}) {
        try {
            await writeEntityAuditLog(prisma, {
                action: String(payload?.action || 'SYSTEM_EVENT'),
                entityType: String(payload?.entityType || 'System'),
                entityId: payload?.entityId ?? null,
                note: payload?.note || null,
                referenceType: payload?.referenceType || null,
                referenceId: payload?.referenceId || null,
                performedByUserId: payload?.performedByUserId || null,
                before: payload?.before,
                after: payload?.after,
                meta: payload?.meta
            });
            return { success: true };
        } catch (error) {
            return { error: error.message };
        }
    },

    // ==================== WAREHOUSE & INVENTORY REPORTS ====================
    async getInventoryValuation() {
        try {
            const warehouses = await prisma.warehouse.findMany({
                where: { isActive: true },
                select: { id: true, name: true }
            });

            const valuation = [];
            for (const w of warehouses) {
                // Get product stocks
                const productStocks = await prisma.warehouseStock.findMany({
                    where: { warehouseId: w.id, quantity: { gt: 0 } },
                    include: { product: { select: { cost: true, basePrice: true } } }
                });

                // Get variant stocks
                const variantStocks = await prisma.variantWarehouseStock.findMany({
                    where: { warehouseId: w.id, quantity: { gt: 0 } },
                    include: { variant: { select: { cost: true, price: true } } }
                });

                let totalCost = 0;
                let totalValue = 0;
                let totalItems = 0;

                productStocks.forEach(s => {
                    const cost = toNumber(s.product?.cost || 0);
                    const price = toNumber(s.product?.basePrice || 0);
                    totalCost += cost * s.quantity;
                    totalValue += price * s.quantity;
                    totalItems += s.quantity;
                });

                variantStocks.forEach(s => {
                    const cost = toNumber(s.variant?.cost || 0);
                    const price = toNumber(s.variant?.price || 0);
                    totalCost += cost * s.quantity;
                    totalValue += price * s.quantity;
                    totalItems += s.quantity;
                });

                valuation.push({
                    warehouseId: w.id,
                    warehouseName: w.name,
                    totalCost: toMoney(totalCost),
                    totalValue: toMoney(totalValue),
                    totalItems
                });
            }

            return valuation;
        } catch (error) {
            return { error: error.message };
        }
    },

    async getLowStockReport() {
        try {
            const products = await prisma.product.findMany({
                where: { isActive: true },
                include: { 
                    inventory: true,
                    category: { select: { name: true } }
                }
            });

            return products
                .filter(p => p.inventory && p.inventory.totalQuantity < p.inventory.minStock)
                .map(p => ({
                    id: p.id,
                    name: p.name,
                    category: p.category?.name || 'بدون تصنيف',
                    quantity: p.inventory.totalQuantity,
                    minStock: p.inventory.minStock,
                    unit: p.unitName || 'قطعة'
                }));
        } catch (error) {
            return { error: error.message };
        }
    },

    async getSoldItemsReport(params = {}) {
        const { startDate, endDate, categoryId } = params;
        try {
            const dateFilter = {};
            if (startDate) dateFilter.gte = new Date(new Date(startDate).setHours(0, 0, 0, 0));
            if (endDate) dateFilter.lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));

            const where = {
                sale: {
                    invoiceDate: dateFilter
                }
            };

            if (categoryId && categoryId !== 'all') {
                where.variant = {
                    product: {
                        categoryId: parsePositiveInt(categoryId)
                    }
                };
            }

            const saleItems = await prisma.saleItem.findMany({
                where,
                include: {
                    variant: {
                        include: {
                            product: {
                                include: {
                                    category: true
                                }
                            }
                        }
                    },
                    sale: true
                }
            });

            const reportMap = new Map();

            saleItems.forEach(item => {
                const key = item.variantId;
                const existing = reportMap.get(key);

                const qty = item.quantity;
                const salePrice = item.price;
                const discount = item.discount || 0;
                const netPrice = salePrice - discount;
                const totalSales = netPrice * qty;
                
                const cost = toNumber(item.variant.cost || 0);
                const totalCost = cost * qty;
                const profit = totalSales - totalCost;

                if (existing) {
                    existing.quantity += qty;
                    existing.totalSales += totalSales;
                    existing.totalCost += totalCost;
                    existing.profit += profit;
                } else {
                    reportMap.set(key, {
                        variantId: item.variantId,
                        productId: item.variant.productId,
                        productName: item.variant.product.name,
                        variantCode: `${item.variant.productSize} / ${item.variant.color}`,
                        productCode: item.variant.product.sku || item.variant.product.barcode || item.variant.product.id,
                        category: item.variant.product.category?.name || 'بدون تصنيف',
                        unit: item.variant.product.unitName || 'قطعة',
                        quantity: qty,
                        totalSales: totalSales,
                        totalCost: totalCost,
                        profit: profit,
                        avgPrice: 0
                    });
                }
            });

            const result = Array.from(reportMap.values()).map(item => ({
                ...item,
                avgPrice: toMoney(item.totalSales / item.quantity),
                totalSales: toMoney(item.totalSales),
                totalCost: toMoney(item.totalCost),
                profit: toMoney(item.profit)
            }));

            return result.sort((a, b) => b.totalSales - a.totalSales);
        } catch (error) {
            console.error('getSoldItemsReport error:', error);
            return { error: error.message };
        }
    },

    async getItemMovementReport(params = {}) {
        const { productId, startDate, endDate } = params;
        const pId = parsePositiveInt(productId);
        if (!pId) return { error: 'لم يتم تحديد المنتج' };

        try {
            const product = await prisma.product.findUnique({
                where: { id: pId },
                include: {
                    category: true,
                    variants: true
                }
            });

            if (!product) return { error: 'المنتج غير موجود' };

            const vIds = product.variants.map(v => v.id);

            const dateFilter = {};
            if (startDate) dateFilter.gte = new Date(new Date(startDate).setHours(0, 0, 0, 0));
            if (endDate) dateFilter.lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));

            const sales = await prisma.saleItem.findMany({
                where: {
                    variantId: { in: vIds },
                    sale: {
                        invoiceDate: dateFilter
                    }
                },
                include: {
                    sale: {
                        include: { customer: true }
                    },
                    variant: true
                }
            });

            const salesReturns = await prisma.returnItem.findMany({
                where: {
                    variantId: { in: vIds },
                    return: {
                        createdAt: dateFilter
                    }
                },
                include: {
                    return: {
                        include: { customer: true }
                    },
                    variant: true
                }
            });

            const purchases = await prisma.purchaseItem.findMany({
                where: {
                    variantId: { in: vIds },
                    purchase: {
                        createdAt: dateFilter
                    }
                },
                include: {
                    purchase: {
                        include: { supplier: true }
                    },
                    variant: true
                }
            });

            const purchaseReturns = await prisma.purchaseReturnItem.findMany({
                where: {
                    variantId: { in: vIds },
                    purchaseReturn: {
                        createdAt: dateFilter
                    }
                },
                include: {
                    purchaseReturn: {
                        include: { supplier: true }
                    },
                    variant: true
                }
            });

            const salesMap = new Map();
            sales.forEach(item => {
                const key = `${item.saleId}-${item.variantId}`;
                const netPrice = item.price - (item.discount || 0);
                const qty = item.quantity;
                const total = netPrice * qty;

                if (salesMap.has(key)) {
                    const existing = salesMap.get(key);
                    existing.qtyOut += qty;
                    existing.total += total;
                } else {
                    salesMap.set(key, {
                        date: item.sale.invoiceDate || item.sale.createdAt,
                        type: 'SALE',
                        label: 'بيع',
                        reference: `فاتورة #${item.saleId}`,
                        party: item.sale.customer?.name || 'عميل نقدي',
                        qtyIn: 0,
                        qtyOut: qty,
                        price: netPrice,
                        total: total,
                        variant: `${item.variant.productSize} / ${item.variant.color}`
                    });
                }
            });

            // إضافة مرتجعات المبيعات لجدول المبيعات
            salesReturns.forEach(item => {
                const key = `ret-${item.returnId}-${item.variantId}`;
                const qty = item.quantity;
                const total = item.price * qty;

                salesMap.set(key, {
                    date: item.return.createdAt,
                    type: 'SALE_RETURN',
                    label: 'مرتجع بيع',
                    reference: `مرتجع #${item.returnId}`,
                    party: item.return.customer?.name || 'عميل نقدي',
                    qtyIn: qty,
                    qtyOut: 0,
                    price: item.price,
                    total: total,
                    variant: `${item.variant.productSize} / ${item.variant.color}`
                });
            });

            const purchaseMap = new Map();
            purchases.forEach(item => {
                const key = `${item.purchaseId}-${item.variantId}`;
                const qty = item.quantity;
                const total = item.price * qty;

                if (purchaseMap.has(key)) {
                    const existing = purchaseMap.get(key);
                    existing.qtyIn += qty;
                    existing.total += total;
                } else {
                    purchaseMap.set(key, {
                        date: item.purchase.createdAt,
                        type: 'PURCHASE',
                        label: 'شراء',
                        reference: `فاتورة #${item.purchaseId}`,
                        party: item.purchase.supplier?.name || 'مورد عام',
                        qtyIn: qty,
                        qtyOut: 0,
                        price: item.price,
                        total: total,
                        variant: `${item.variant.productSize} / ${item.variant.color}`
                    });
                }
            });

            // إضافة مرتجعات المشتريات لجدول المشتريات
            purchaseReturns.forEach(item => {
                const key = `pret-${item.purchaseReturnId}-${item.variantId}`;
                const qty = item.quantity;
                const total = item.price * qty;

                purchaseMap.set(key, {
                    date: item.purchaseReturn.createdAt,
                    type: 'PURCHASE_RETURN',
                    label: 'مرتجع شراء',
                    reference: `مرتجع #${item.purchaseReturnId}`,
                    party: item.purchaseReturn.supplier?.name || 'مورد عام',
                    qtyIn: 0,
                    qtyOut: qty,
                    price: item.price,
                    total: total,
                    variant: `${item.variant.productSize} / ${item.variant.color}`
                });
            });

            const movements = [...Array.from(salesMap.values()), ...Array.from(purchaseMap.values())];

            movements.sort((a, b) => new Date(a.date) - new Date(b.date));

            // الحصول على آخر مورد لهذا الصنف
            const lastPurchase = await prisma.purchaseItem.findFirst({
                where: { variantId: { in: vIds } },
                include: { purchase: { include: { supplier: true } } },
                orderBy: { purchase: { createdAt: 'desc' } }
            });

            return {
                product: {
                    id: product.id,
                    name: product.name,
                    sku: product.sku,
                    category: product.category?.name,
                    mainSupplier: lastPurchase?.purchase?.supplier?.name || 'غير محدد'
                },
                movements
            };
        } catch (error) {
            console.error('getItemMovementReport error:', error);
            return { error: error.message };
        }
    },

    async getStockMovementHistory(productId, warehouseId) {
        try {
            const pId = parsePositiveInt(productId);
            const wId = parsePositiveInt(warehouseId);
            if (!pId) return { error: 'Product ID is required' };

            // Fetch variants
            const variants = await prisma.variant.findMany({
                where: { productId: pId },
                select: { id: true, productSize: true, color: true }
            });
            const vIds = variants.map(v => v.id);

            // 1. Sales
            const sales = await prisma.saleItem.findMany({
                where: { 
                    variantId: { in: vIds },
                    sale: { ...(wId ? { notes: { contains: `WH:${wId}` } } : {}) } // Note: Real systems handle WH in SaleItem, here we might need to check how it's stored.
                },
                include: { sale: true, variant: true },
                orderBy: { sale: { createdAt: 'desc' } }
            });

            // 2. Purchases
            const purchases = await prisma.purchaseItem.findMany({
                where: { variantId: { in: vIds } },
                include: { purchase: true, variant: true },
                orderBy: { purchase: { createdAt: 'desc' } }
            });

            // 3. Transfers
            const transfers = await prisma.warehouseTransfer.findMany({
                where: { 
                    productId: pId,
                    OR: [
                        { fromWarehouseId: wId || undefined },
                        { toWarehouseId: wId || undefined }
                    ]
                },
                include: { fromWarehouse: true, toWarehouse: true, variant: true },
                orderBy: { createdAt: 'desc' }
            });

            const movements = [];

            sales.forEach(item => {
                movements.push({
                    type: 'SALE',
                    label: 'عملية بيع',
                    date: item.sale.invoiceDate || item.sale.createdAt,
                    qty: -item.quantity,
                    ref: `فاتورة #${item.saleId}`,
                    variant: `${item.variant.productSize} / ${item.variant.color}`
                });
            });

            purchases.forEach(item => {
                movements.push({
                    type: 'PURCHASE',
                    label: 'عملية شراء',
                    date: item.purchase.createdAt,
                    qty: item.quantity,
                    ref: `فاتورة #${item.purchaseId}`,
                    variant: `${item.variant.productSize} / ${item.variant.color}`
                });
            });

            transfers.forEach(t => {
                const isOut = wId && t.fromWarehouseId === wId;
                movements.push({
                    type: 'TRANSFER',
                    label: isOut ? 'تحويل صادر' : 'تحويل وارد',
                    date: t.createdAt,
                    qty: isOut ? -t.quantity : t.quantity,
                    ref: isOut ? `إلى ${t.toWarehouse.name}` : `من ${t.fromWarehouse.name}`,
                    variant: t.variant ? `${t.variant.productSize} / ${t.variant.color}` : 'المنتج الأساسي'
                });
            });

            return movements.sort((a, b) => new Date(b.date) - new Date(a.date));
        } catch (error) {
            return { error: error.message };
        }
    },



    async getSeasonReport(params = {}) {
        try {
            const { from, to } = resolveReportRange(params);
            const supplierId = parsePositiveInt(params?.supplierId);
            const warehouseId = parsePositiveInt(params?.warehouseId);
            
            // 1. Purchases (Net Capital)
            const purchaseWhere = { createdAt: { gte: from, lte: to } };
            if (supplierId) purchaseWhere.supplierId = supplierId;

            const purchases = await prisma.purchase.findMany({
                where: purchaseWhere,
                include: { items: true }
            });

            // If a specific supplier is selected, we track ONLY their variants for sales & stock
            let supplierVariantIds = null;
            if (supplierId) {
                const vSet = new Set();
                purchases.forEach(p => {
                    p.items.forEach(i => vSet.add(i.variantId));
                });
                supplierVariantIds = Array.from(vSet);
            }

            const purchaseReturnsWhere = { createdAt: { gte: from, lte: to } };
            if (supplierId) purchaseReturnsWhere.supplierId = supplierId;

            const purchaseReturns = await prisma.purchaseReturn.findMany({
                where: purchaseReturnsWhere
            });
            
            const totalPurchases = purchases.reduce((sum, p) => sum + (p.total || 0), 0);
            const totalShipping = purchases.reduce((sum, p) => sum + (p.expensesTotal || 0), 0);
            const totalPurchaseReturns = purchaseReturns.reduce((sum, r) => sum + (r.total || 0), 0);
            const netPurchases = totalPurchases + totalShipping - totalPurchaseReturns;

            // 2. Sales & COGS
            // We fetch all sales in the period. If supplierId is specified, we ONLY count the items belonging to that supplier.
            const sales = await prisma.sale.findMany({
                where: { invoiceDate: { gte: from, lte: to } },
                include: { items: { include: { variant: true } } }
            });
            
            // For sale returns, we need items too to filter by supplier. 
            // In the DB, 'Return' has 'items' (ReturnItem)
            const saleReturns = await prisma.return.findMany({
                where: { createdAt: { gte: from, lte: to } },
                include: { items: true }
            });

            let cashSales = 0;
            let creditSales = 0;
            let totalSalesDiscount = 0;
            let totalCOGS = 0;
            let supplierItemsRevenue = 0;

            sales.forEach(sale => {
                let invoiceHasSupplierItem = false;
                let invoiceSupplierRevenue = 0;

                sale.items.forEach(item => {
                    const isSupplierItem = supplierVariantIds === null || supplierVariantIds.includes(item.variantId);
                    if (isSupplierItem) {
                        invoiceHasSupplierItem = true;
                        const cost = Number(item.variant.cost) || 0;
                        totalCOGS += (cost * item.quantity);
                        
                        // proportional discount (approximate) or specific item discount
                        // In SaleItem, price is usually net or gross. The 'price' in SaleItem is the final price.
                        // Wait, SaleItem has price, quantity, discount.
                        const itemRevenue = (Number(item.price) * item.quantity) - Number(item.discount || 0);
                        supplierItemsRevenue += itemRevenue;
                        totalSalesDiscount += Number(item.discount || 0);
                    }
                });

                if (supplierVariantIds === null) {
                    if (sale.saleType === 'نقدي') cashSales += sale.total;
                    else if (sale.saleType === 'آجل') creditSales += sale.total;
                    totalSalesDiscount += Number(sale.discount || 0);
                } else {
                    // For specific supplier, we just attribute the item revenue to either cash or credit proportionally or totally.
                    // For simplicity, if the invoice is credit, the item revenue is credit.
                    if (sale.saleType === 'نقدي') cashSales += invoiceSupplierRevenue;
                    else if (sale.saleType === 'آجل') creditSales += invoiceSupplierRevenue;
                }
            });

            // If we are filtering by supplier, the total revenue is exactly supplierItemsRevenue, and we split it into cash/credit based on the invoice type.
            if (supplierVariantIds !== null) {
                cashSales = 0;
                creditSales = 0;
                sales.forEach(sale => {
                    let invoiceSupplierRevenue = 0;
                    sale.items.forEach(item => {
                        if (supplierVariantIds.includes(item.variantId)) {
                            invoiceSupplierRevenue += (Number(item.price) * item.quantity) - Number(item.discount || 0);
                            // approximate invoice-level discount
                            if (sale.discount > 0 && sale.total > 0) {
                                const prop = invoiceSupplierRevenue / (sale.total + sale.discount);
                                invoiceSupplierRevenue -= (sale.discount * prop);
                            }
                        }
                    });
                    if (sale.saleType === 'نقدي') cashSales += invoiceSupplierRevenue;
                    else if (sale.saleType === 'آجل') creditSales += invoiceSupplierRevenue;
                });
            }

            let totalSaleReturns = 0;
            saleReturns.forEach(ret => {
                if (supplierVariantIds === null) {
                    totalSaleReturns += ret.total;
                } else {
                    ret.items.forEach(item => {
                        if (supplierVariantIds.includes(item.variantId)) {
                            totalSaleReturns += (Number(item.price) * item.quantity);
                        }
                    });
                }
            });

            const netSales = cashSales + creditSales - totalSaleReturns;
            const grossProfit = netSales - totalCOGS;

            // 3. Customer Payments & Balances
            const customerPayments = await prisma.customerPayment.findMany({
                where: { paymentDate: { gte: from, lte: to } },
                include: { customer: true }
            });
            let totalPaymentsReceived = 0;
            
            if (supplierVariantIds === null) {
                totalPaymentsReceived = customerPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
            } else {
                // Approximate payments received for this supplier's goods
                // This is mathematically impossible to track exactly without strict invoice-to-payment allocation
                // We will use a proportional approach or just hide it? 
                // Best is to assume payments are proportional to the credit sales of this supplier.
                const totalCreditSalesAll = sales.reduce((sum, s) => s.saleType === 'آجل' ? sum + s.total : sum, 0);
                if (totalCreditSalesAll > 0) {
                    totalPaymentsReceived = customerPayments.reduce((sum, p) => sum + (p.amount || 0), 0) * (creditSales / totalCreditSalesAll);
                }
            }

            const pendingBalances = creditSales - totalPaymentsReceived;

            const allCustomers = await prisma.customer.findMany({
                where: { balance: { gt: 0 } },
                select: { id: true, name: true, balance: true }
            });
            const topOweCustomers = allCustomers.sort((a, b) => Number(b.balance) - Number(a.balance)).slice(0, 10);

            // 4. Remaining Stock
            const stockWhere = { quantity: { gt: 0 } };
            if (supplierVariantIds !== null) {
                stockWhere.variantId = { in: supplierVariantIds };
            }
            if (warehouseId) {
                stockWhere.warehouseId = warehouseId;
            }
            const stock = await prisma.variantWarehouseStock.findMany({
                where: stockWhere,
                include: { variant: { include: { product: true } } }
            });

            let totalStockCost = 0;
            let totalStockValue = 0;
            const topStockItems = [];
            
            stock.forEach(s => {
                const qty = s.quantity;
                const cost = Number(s.variant.cost) || 0;
                const price = Number(s.variant.price) || 0;
                
                const itemCostTotal = qty * cost;
                totalStockCost += itemCostTotal;
                totalStockValue += (qty * price);

                topStockItems.push({
                    id: s.variantId,
                    name: s.variant.product.name + (s.variant.size ? ` - ${s.variant.size}` : '') + (s.variant.color ? ` - ${s.variant.color}` : ''),
                    quantity: qty,
                    totalCost: itemCostTotal
                });
            });
            topStockItems.sort((a, b) => b.totalCost - a.totalCost);

            // 5. Operating Expenses
            let totalExpenses = 0;
            const expensesList = [];
            
            if (supplierVariantIds === null) {
                const expenses = await prisma.expense.findMany({
                    where: { expenseDate: { gte: from, lte: to } },
                    include: { category: true }
                });
                totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
                
                const expensesByCategory = {};
                expenses.forEach(e => {
                    const catName = e.category?.name || 'أخرى';
                    expensesByCategory[catName] = (expensesByCategory[catName] || 0) + e.amount;
                });
                for (const [name, total] of Object.entries(expensesByCategory)) {
                    expensesList.push({ name, total });
                }
                expensesList.sort((a, b) => b.total - a.total);
            }

            // Calculate Final Position
            const totalAssets = cashSales + totalPaymentsReceived + pendingBalances + totalStockCost;
            const netPosition = totalAssets - netPurchases - totalExpenses;

            return {
                summary: {
                    totalPurchases,
                    totalShipping,
                    totalPurchaseReturns,
                    netPurchases,

                    cashSales,
                    creditSales,
                    totalSaleReturns,
                    totalSalesDiscount,
                    totalCOGS,
                    grossProfit,

                    totalPaymentsReceived,
                    pendingBalances,

                    totalStockCost,
                    totalStockValue,
                    
                    totalExpenses,

                    netPosition
                },
                details: {
                    customers: topOweCustomers,
                    stock: topStockItems.slice(0, 20),
                    expenses: expensesList
                }
            };

        } catch (error) {
            console.error('[db:getSeasonReport] Error:', error);
            return { error: error.message };
        }
    },

    async getChatMessages(limit = 100) {
        try {
            return await prisma.chatMessage.findMany({
                take: limit,
                orderBy: { createdAt: 'asc' },
                include: {
                    sender: {
                        select: { id: true, name: true, username: true }
                    }
                }
            });
        } catch (error) {
            console.error('[db:getChatMessages] Error:', error);
            return { error: 'تعذر جلب الرسائل' };
        }
    },

    async sendChatMessage(content) {
        try {
            if (!currentSessionUser) {
                console.error('[db:sendChatMessage] Failed: No currentSessionUser set in main process');
                return { error: 'يجب تسجيل الدخول للإرسال (جلسة العمل غير متزامنة)' };
            }
            if (!content || !content.trim()) return { error: 'محتوى الرسالة فارغ' };

            console.log(`[db:sendChatMessage] Sending message from user ID: ${currentSessionUser.id}`);

            return await prisma.chatMessage.create({
                data: {
                    content: content.trim(),
                    senderId: currentSessionUser.id
                },
                include: {
                    sender: {
                        select: { id: true, name: true, username: true }
                    }
                }
            });
        } catch (error) {
            console.error('[db:sendChatMessage] Prisma Error:', error);
            // Check for foreign key constraint error (P2003) - means user ID doesn't exist in this DB
            if (error.code === 'P2003') {
                return { error: 'فشل الإرسال: المستخدم غير معرف في هذه القاعدة.' };
            }
            return { error: 'تعذر إرسال الرسالة' };
        }
    },

    async deleteChatMessage(messageId) {
        try {
            if (!currentSessionUser) return { error: 'غير مصرح لك' };

            const message = await prisma.chatMessage.findUnique({
                where: { id: messageId }
            });

            if (!message) return { error: 'الرسالة غير موجودة' };

            // Check if user is the sender OR has management permissions
            const isManager = currentSessionUser.role?.name === 'ADMIN' || 
                             this.hasPermission('roles:manage') || 
                             this.hasPermission('users:manage');

            const canDelete = message.senderId === currentSessionUser.id || isManager;

            if (!canDelete) return { error: 'لا يمكنك حذف رسالة الآخرين' };

            return await prisma.chatMessage.delete({
                where: { id: messageId }
            });
        } catch (error) {
            console.error('[db:deleteChatMessage] Error:', error);
            return { error: 'فشل حذف الرسالة' };
        }
    },

    async deleteAllChatMessages() {
        try {
            if (!currentSessionUser) return { error: 'غير مصرح لك' };

            const isManager = currentSessionUser.role?.name === 'ADMIN' || 
                             this.hasPermission('roles:manage') || 
                             this.hasPermission('users:manage');

            if (!isManager) return { error: 'هذه العملية تتطلب صلاحيات المدير' };

            return await prisma.chatMessage.deleteMany({});
        } catch (error) {
            console.error('[db:deleteAllChatMessages] Error:', error);
            return { error: 'فشل مسح الشات' };
        }
    },

    async getCoupons() {
        try {
            return await prisma.coupon.findMany({
                orderBy: { createdAt: 'desc' },
                include: {
                    sales: {
                        include: {
                            customer: {
                                select: { id: true, name: true, phone: true }
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('[db:getCoupons] Error:', error);
            return { error: 'تعذر جلب أكواد الخصم' };
        }
    },

    async addCoupon(couponData) {
        try {
            const { code, discountType, discountValue, maxDiscount, minOrderValue, startDate, endDate, usageLimit, isActive } = couponData;
            if (!code || !code.trim()) {
                return { error: 'كود الخصم مطلوب' };
            }
            if (!discountType || !['PERCENTAGE', 'FIXED'].includes(discountType)) {
                return { error: 'نوع الخصم غير صالح' };
            }
            if (parseFloat(discountValue) <= 0) {
                return { error: 'قيمة الخصم يجب أن تكون أكبر من صفر' };
            }

            const existing = await prisma.coupon.findUnique({
                where: { code: String(code).trim().toUpperCase() }
            });
            if (existing) {
                return { error: 'كود الخصم هذا موجود بالفعل' };
            }

            return await prisma.coupon.create({
                data: {
                    code: String(code).trim().toUpperCase(),
                    discountType,
                    discountValue: parseFloat(discountValue),
                    maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
                    minOrderValue: minOrderValue ? parseFloat(minOrderValue) : null,
                    startDate: startDate ? new Date(startDate) : new Date(),
                    endDate: endDate ? new Date(endDate) : null,
                    usageLimit: usageLimit ? parseInt(usageLimit) : null,
                    isActive: isActive !== false
                }
            });
        } catch (error) {
            console.error('[db:addCoupon] Error:', error);
            return { error: 'تعذر إضافة كود الخصم' };
        }
    },

    async updateCoupon(id, couponData) {
        try {
            const couponId = parseInt(id);
            const { code, discountType, discountValue, maxDiscount, minOrderValue, startDate, endDate, usageLimit, isActive } = couponData;
            
            if (code) {
                const existing = await prisma.coupon.findFirst({
                    where: {
                        code: String(code).trim().toUpperCase(),
                        NOT: { id: couponId }
                    }
                });
                if (existing) {
                    return { error: 'كود الخصم هذا مستخدم بالفعل لكوبون آخر' };
                }
            }

            return await prisma.coupon.update({
                where: { id: couponId },
                data: {
                    code: code ? String(code).trim().toUpperCase() : undefined,
                    discountType: discountType || undefined,
                    discountValue: discountValue ? parseFloat(discountValue) : undefined,
                    maxDiscount: maxDiscount !== undefined ? (maxDiscount ? parseFloat(maxDiscount) : null) : undefined,
                    minOrderValue: minOrderValue !== undefined ? (minOrderValue ? parseFloat(minOrderValue) : null) : undefined,
                    startDate: startDate ? new Date(startDate) : undefined,
                    endDate: endDate !== undefined ? (endDate ? new Date(endDate) : null) : undefined,
                    usageLimit: usageLimit !== undefined ? (usageLimit ? parseInt(usageLimit) : null) : undefined,
                    isActive: isActive !== undefined ? isActive : undefined
                }
            });
        } catch (error) {
            console.error('[db:updateCoupon] Error:', error);
            return { error: 'تعذر تعديل كود الخصم' };
        }
    },

    async deleteCoupon(id) {
        try {
            return await prisma.coupon.delete({
                where: { id: parseInt(id) }
            });
        } catch (error) {
            console.error('[db:deleteCoupon] Error:', error);
            return { error: 'تعذر حذف كود الخصم' };
        }
    },

    async validateCoupon(code, orderTotal) {
        try {
            const coupon = await prisma.coupon.findUnique({
                where: { code: String(code).trim().toUpperCase() }
            });
            if (!coupon) {
                return { error: "كوبون الخصم غير موجود" };
            }
            if (!coupon.isActive) {
                return { error: "كوبون الخصم غير نشط" };
            }
            const now = new Date();
            if (coupon.startDate && now < new Date(coupon.startDate)) {
                return { error: "هذا الكوبون لم يبدأ تفعيله بعد" };
            }
            if (coupon.endDate && now > new Date(coupon.endDate)) {
                return { error: "انتهت صلاحية هذا الكوبون" };
            }
            if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
                return { error: "تم استهلاك الحد الأقصى لتفعيل هذا الكوبون" };
            }
            if (coupon.minOrderValue !== null && parseFloat(orderTotal) < coupon.minOrderValue) {
                return { error: `الحد الأدنى لتفعيل الكوبون هو ${coupon.minOrderValue}` };
            }
            return { success: true, coupon };
        } catch (error) {
            console.error('[db:validateCoupon] Error:', error);
            return { error: error.message };
        }
    },

    async disconnect() {
        await prisma.$disconnect();
    }
};

Object.keys(dbService).forEach((methodName) => {
    const method = dbService[methodName];
    if (typeof method !== 'function') return;

    dbService[methodName] = async function wrappedDbServiceMethod(...args) {
        const result = await method.apply(dbService, args);
        return normalizeDecimalValues(result);
    };
});

module.exports = dbService;
module.exports.getCurrentSessionUser = () => currentSessionUser;
