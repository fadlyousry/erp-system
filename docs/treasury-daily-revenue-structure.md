# شرح جزء الخزنة والإيراد اليومي

## الهدف
الجزء ده معمول عشان:
- يوحد كل حركات الفلوس في جدول قيود واحد (`TreasuryEntry`).
- يحافظ على رصيد كل خزنة لحظيًا (`Treasury.currentBalance`).
- يطلع تقرير "الإيراد اليومي" بشكل واضح حسب المصدر ووسيلة الدفع والخزنة.

## 1) الاستراكشر العام (Layers)
1. الواجهة: `src/pages/Treasury.jsx`
2. جسر Electron: `electron/preload.js`
3. IPC Handlers: `electron/main.js`
4. Business Logic: `electron/db-service.js`
5. Database Models: `prisma/schema.prisma`

التدفق:
`Treasury.jsx` -> `window.api.*` -> `ipcMain.handle(...)` -> `dbService.*` -> Prisma -> PostgreSQL

## 2) موديل البيانات
الموديلات الأساسية موجودة في `prisma/schema.prisma`:

### `Treasury`
- تعريف الخزنة نفسها (`name`, `code`, `isActive`).
- `openingBalance` رصيد افتتاحي.
- `currentBalance` الرصيد الحالي المتحدث باستمرار.

### `TreasuryEntry`
- كل حركة مالية (وارد/منصرف).
- أهم الحقول:
- `entryType` نوع الحركة (بيع، دفعة عميل، مصروف...).
- `direction` (`IN` أو `OUT`).
- `amount` المبلغ.
- `balanceBefore` / `balanceAfter` قبل/بعد الحركة.
- `referenceType` + `referenceId` ربط الحركة بالمصدر الأصلي (فاتورة/دفعة/مصروف...).
- `paymentMethodId` وسيلة الدفع.
- `sourceTreasuryId` + `targetTreasuryId` في حالة التحويل بين خزن.

### Enums
- `TreasuryDirection`: `IN`, `OUT`
- `TreasuryEntryType`:
  `OPENING_BALANCE`, `SALE_INCOME`, `CUSTOMER_PAYMENT`, `MANUAL_IN`, `EXPENSE_PAYMENT`, `PURCHASE_PAYMENT`, `SUPPLIER_PAYMENT`, `RETURN_REFUND`, `MANUAL_OUT`, `TRANSFER_IN`, `TRANSFER_OUT`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`

## 3) قلب النظام: إنشاء قيد خزنة
الدالة الأساسية: `createTreasuryEntry` في `electron/db-service.js`.

الخطوات:
1. التحقق من `amount` واتجاه الحركة.
2. حل `treasuryId` عبر `resolveTreasuryId`.
3. لو `treasuryId` مش متبعت أو غير صالح: يستخدم خزنة افتراضية `MAIN` (ويُنشئها تلقائيًا لو غير موجودة).
4. قراءة `currentBalance` الحالي والتأكد إن الخزنة نشطة.
5. حساب `balanceAfter`.
6. منع الرصيد السالب في حركات `OUT` (إلا لو `allowNegative=true`).
7. تحديث `Treasury.currentBalance`.
8. إنشاء سطر `TreasuryEntry` بكل البيانات المرجعية.

## 4) مصادر القيود (مين بينشئ أي Entry)
الربط موجود داخل `electron/db-service.js`:

- إنشاء/تعديل فاتورة بيع مدفوع فيها -> `SALE_INCOME` + `IN` + `referenceType='SALE'`
- إضافة/تعديل دفعة عميل -> `CUSTOMER_PAYMENT` + `IN` + `referenceType='PAYMENT'`
- مشتريات مدفوعة -> `PURCHASE_PAYMENT` + `OUT`
- مرتجع مع رد فلوس -> `RETURN_REFUND` + `OUT`
- دفعة مورد -> `SUPPLIER_PAYMENT` + `OUT`
- مصروف -> `EXPENSE_PAYMENT` + `OUT`
- إنشاء خزنة برصيد افتتاحي -> `OPENING_BALANCE` + `IN`
- حركة يدوية من شاشة الخزنة -> `MANUAL_IN` أو `MANUAL_OUT` (أو نوع مخصص)
- تحويل بين خزن -> قيدين معًا:
- `TRANSFER_OUT` من خزنة المصدر
- `TRANSFER_IN` في خزنة الوجهة

## 5) التعديل والحذف بدون كسر الأرصدة
الدالة `rollbackTreasuryEntriesByReference` تستخدم عند تعديل/حذف البيع أو الدفعة أو المصروف:
- تجيب كل القيود المرتبطة بنفس `referenceType/referenceId`.
- تعكس تأثيرها على رصيد الخزنة.
- تحذف القيود القديمة.

الهدف: ضمان إن الرصيد النهائي صحيح بعد أي Update/Delete.

## 6) تعريف الإيراد اليومي (مهم)
الدالة: `getDailyRevenueReport` في `electron/db-service.js`.

### ما هو الإيراد اليومي هنا؟
الإيراد اليومي = **فقط** الحركات التي:
- `direction = IN`
- `entryType` ضمن:
- `SALE_INCOME`
- `CUSTOMER_PAYMENT`

يعني باقي الوارد/المنصرف يظهر في تقرير الحركة العامة، لكن لا يدخل في "Revenue".

### ناتج التقرير
- `summary`:
- `totalIn`, `totalOut`, `net` لكل الحركات اليومية.
- مقارنة بصافي اليوم السابق.
- `revenue.summary`:
- `totalRevenue`
- `saleIncome`
- `customerPayments`
- `invoiceCount` (عدد مراجع البيع المميزة)
- `customerPaymentCount` (عدد مراجع دفعات العملاء المميزة)
- `previousDayRevenue`
- `changeFromPreviousDayRevenue`
- `channelTotals` (cash / vodafoneCash / instaPay / other)
- `revenue.byPaymentMethod`
- `revenue.bySource`
- `revenue.byTreasury`
- `revenue.entries` (تفاصيل عمليات الإيراد فقط)

## 7) واجهة شاشة الخزنة
الملف: `src/pages/Treasury.jsx`

الشاشة مقسمة إلى:
- إدارة الخزن (عرض الرصيد + إنشاء خزنة جديدة).
- تسجيل حركة خزنة (IN / OUT / TRANSFER).
- تقرير الإيراد اليومي (ملخص + حسب وسيلة الدفع + حسب الخزنة + حسب المصدر).
- تقرير أنواع الحركات لليوم.
- جدول كل الحركات بفلاتر (خزنة/تاريخ/اتجاه/نوع/بحث).
- مودال تفاصيل الإيراد اليومي.

الدوال الأساسية في الواجهة:
- `loadTreasuryBaseData`
- `loadEntries`
- `loadDailyReport`
- `handleCreateTreasury`
- `handleCreateTransaction`

## 8) API المستخدمة بين الواجهة والبك
في `electron/preload.js` و`electron/main.js`:
- `getTreasuries`
- `createTreasury`
- `updateTreasury`
- `deleteTreasury`
- `createTreasuryTransaction`
- `getTreasuryEntries`
- `getDailyRevenueReport`

## 9) ملاحظة تشغيلية مهمة
في العمليات التلقائية (مثل البيع من `EnhancedPOS` أو دفعات العملاء من `Customers`)، غالبًا `treasuryId` لا يتم إرساله من الواجهة.

النتيجة: الباك يستخدم `resolveTreasuryId` ويرحل الحركة تلقائيًا إلى الخزنة الافتراضية `MAIN`.

لو الهدف توزيع الحركات تلقائيًا على خزن مختلفة، لازم الواجهات التي تنشئ البيع/الدفعات تبدأ تبعت `treasuryId` صريحًا.

## 10) أماكن الكود المرجعية السريعة
- `prisma/schema.prisma`
- `prisma/migrations/20260216_treasury_system/migration.sql`
- `electron/db-service.js`
- `electron/preload.js`
- `electron/main.js`
- `src/pages/Treasury.jsx`
- `src/pages/EnhancedPOS.jsx`
- `src/pages/Customers.jsx`
