const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'electron', 'db-service.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update createSale to support couponId and couponDiscount, and increment usedCount
const oldCreateSaleStr = `                const newSale = await tx.sale.create({
                    data: {
                        customerId: parsedCustomerId || undefined,
                        paymentMethodId: resolvedPaymentMethodId || undefined,
                        total: parseFloat(saleData.total),
                        discount: parseFloat(saleData.discount || 0),
                        saleType: saleData.saleType || 'نقدي',
                        notes: saleData.notes || null,
                        invoiceDate: saleData.invoiceDate
                            ? new Date(saleData.invoiceDate)
                            : undefined,
                        createdByUserId: getActorUserId(saleData?.createdByUserId, saleData?.userId)
                    }
                });
                const affectedProductIds = new Set();`;

const newCreateSaleStr = `                const newSale = await tx.sale.create({
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

                const affectedProductIds = new Set();`;

// Normalize line endings to do simple replace
const normalize = str => str.replace(/\r\n/g, '\n').trim();

let normalizedContent = content.replace(/\r\n/g, '\n');
let normalizedOldCreate = normalize(oldCreateSaleStr);
let normalizedNewCreate = normalizedNewCreateStr = newCreateSaleStr.replace(/\r\n/g, '\n');

if (normalizedContent.includes(normalizedOldCreate)) {
    normalizedContent = normalizedContent.replace(normalizedOldCreate, normalizedNewCreate);
    console.log('✅ Found and replaced createSale block.');
} else {
    console.error('❌ Could not find createSale block in db-service.js');
}

// 2. Add Coupon CRUD and validation methods before disconnect()
const oldDisconnectStr = `    async disconnect() {
        await prisma.$disconnect();
    }`;

const newCouponMethodsStr = `    async getCoupons() {
        try {
            return await prisma.coupon.findMany({
                orderBy: { createdAt: 'desc' }
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
                return { error: \`الحد الأدنى لتفعيل الكوبون هو \${coupon.minOrderValue}\` };
            }
            return { success: true, coupon };
        } catch (error) {
            console.error('[db:validateCoupon] Error:', error);
            return { error: error.message };
        }
    },

    async disconnect() {
        await prisma.$disconnect();
    }`;

let normalizedDisconnect = oldDisconnectStr.replace(/\r\n/g, '\n');
let normalizedNewCouponMethods = newCouponMethodsStr.replace(/\r\n/g, '\n');

if (normalizedContent.includes(normalizedDisconnect)) {
    normalizedContent = normalizedContent.replace(normalizedDisconnect, normalizedNewCouponMethods);
    console.log('✅ Found and replaced disconnect/injected Coupon methods.');
} else {
    console.error('❌ Could not find disconnect block in db-service.js');
}

// Write back with original line endings (CRLF for Windows)
const finalContent = normalizedContent.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, finalContent, 'utf8');
console.log('🎉 Successfully updated db-service.js!');
