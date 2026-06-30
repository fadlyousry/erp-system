# Fadl ERP Desktop - توثيق مشروع للـ CV

## ملخص المشروع

**Fadl ERP Desktop** هو تطبيق ERP مكتبي لإدارة عمليات البيع والشراء والمخزون والحسابات داخل الشركات والمتاجر، مع دعم كامل للغة العربية وواجهة RTL.  
التطبيق مبني كحل Desktop باستخدام Electron وReact، ويعتمد على PostgreSQL وPrisma لإدارة البيانات والمعاملات المالية والمخزنية بشكل منظم.

## صياغة قصيرة للـ CV

**ERP Desktop Application - Electron, React, PostgreSQL**

طورت تطبيق ERP مكتبي لإدارة المبيعات، المشتريات، المخزون، العملاء، الموردين، الخزائن، التقارير، الصلاحيات، الطباعة، النسخ الاحتياطي، وتكامل WhatsApp. بنيت النظام باستخدام Electron وReact وPrisma/PostgreSQL، مع طبقة IPC آمنة بين الواجهة وقاعدة البيانات، ونظام صلاحيات RBAC، وسجل عمليات، وترخيص مرتبط بالجهاز، وتوزيع Windows Installer باستخدام electron-builder.

## English CV Version

**ERP Desktop Application - Electron, React, PostgreSQL**

Built a production-ready Arabic ERP desktop application for sales, purchases, inventory, customers, suppliers, treasury, reporting, role-based access control, printing, backup/restore, licensing, and WhatsApp customer communication. Implemented the app with Electron, React, Prisma, and PostgreSQL, including secure IPC data access, transactional business logic, database bootstrap, audit logging, and Windows installer packaging with electron-builder.

## Bullet Points جاهزة للـ CV

- Developed a full-featured desktop ERP system using **Electron, React, Vite, Prisma, and PostgreSQL**.
- Implemented modules for **sales, purchases, returns, inventory, warehouses, customers, suppliers, treasury, expenses, and reports**.
- Built a **role-based access control system (RBAC)** with users, roles, permissions, protected UI navigation, and guarded IPC handlers.
- Designed transactional database workflows for invoices, returns, payments, stock movement, treasury entries, and customer/supplier ledgers.
- Implemented **Arabic RTL UI** with dashboard, POS screen, management pages, reports, settings, and operational shortcuts.
- Added **custom invoice printing** with A4, A5, and 80mm thermal receipt templates using Electron printing and Handlebars.
- Built **backup and restore workflows** for PostgreSQL, including automatic backup options and restore support from the desktop app.
- Added **license activation** using device fingerprint validation and signed license files.
- Integrated **WhatsApp Web** for customer reminders, overdue balance communication, bulk messaging, and invoice image sending.
- Packaged the application as a Windows desktop installer using **electron-builder / NSIS** with bundled runtime resources.

## المشكلة التي يحلها المشروع

كثير من المتاجر الصغيرة والمتوسطة تحتاج نظام محلي يعمل على Windows لإدارة العمليات اليومية بدون الاعتماد الكامل على الإنترنت. المشروع يوفر برنامج مكتبي موحد لإدارة:

- فواتير البيع ونقطة البيع POS.
- فواتير الشراء وسجل المشتريات.
- مرتجعات البيع والشراء.
- المنتجات، التصنيفات، الباركود، المتغيرات، والأسعار.
- المخازن والتحويلات بين المخازن.
- العملاء، الموردين، المدفوعات، والأرصدة.
- الخزائن، المصروفات، الإيرادات، والتقارير اليومية.
- المستخدمين، الأدوار، الصلاحيات، وسجل العمليات.
- الطباعة، النسخ الاحتياطي، الترخيص، ورسائل WhatsApp.

## نطاق العمل

### Frontend

- بناء واجهة React عربية RTL.
- تنظيم التطبيق إلى صفحات تشغيلية مثل Dashboard, POS, Products, Sales, Purchases, Customers, Suppliers, Treasury, Reports, Settings.
- استخدام Lazy Loading لتحسين تحميل الصفحات.
- حماية الصفحات بناء على صلاحيات المستخدم.
- بناء مكونات متخصصة مثل جداول العملاء، دفاتر الحسابات، إعدادات الطباعة، المساعد الذكي، وسجل العمليات.

### Desktop Backend

- بناء Electron main process لإدارة التطبيق المكتبي.
- تعريف IPC handlers كطبقة تواصل بين React وNode.js.
- عزل منطق قاعدة البيانات داخل `db-service`.
- إدارة بدء التطبيق، النافذة الرئيسية، Single Instance Lock، وعمليات الإغلاق الآمن.
- دعم النسخ الاحتياطي عند الإغلاق أو حسب الإعدادات.

### Database

- تصميم قاعدة بيانات PostgreSQL باستخدام Prisma Schema.
- نماذج رئيسية تشمل: User, Role, Permission, Product, Variant, Inventory, Warehouse, Customer, Supplier, Sale, Purchase, Return, Treasury, Expense, AuditLog.
- استخدام معاملات Database Transactions لضمان اتساق الفواتير، المدفوعات، المخزون، والخزائن.
- إضافة فهارس وعلاقات لتسهيل البحث والتقارير.

## المعمارية التقنية

```text
React UI
  |
  | window.api / contextBridge
  v
Electron Preload
  |
  | ipcRenderer.invoke(...)
  v
Electron Main Process
  |
  | guarded IPC handlers + business services
  v
Prisma Client
  |
  v
PostgreSQL Database
```

## أهم المميزات

### إدارة المبيعات والمشتريات

- إنشاء فواتير بيع وشراء.
- تعديل وحذف الفواتير حسب الصلاحيات.
- دعم طرق دفع متعددة.
- ربط الفواتير بالخزائن والعملاء والموردين.
- سجل تفصيلي للعمليات السابقة.

### إدارة المخزون والمخازن

- إدارة المنتجات والتصنيفات.
- دعم SKU وBarcode.
- دعم متغيرات المنتج مثل المقاس واللون.
- متابعة كميات المخزون.
- تحويل المنتجات بين المخازن.
- تقارير انخفاض المخزون وقيمة المخزون.

### الحسابات والخزائن

- إدارة خزائن متعددة.
- تسجيل الإيرادات والمصروفات.
- تقارير إيراد يومي.
- تتبع المدفوعات وربطها بالمبيعات والمشتريات.
- دفاتر حسابات للعملاء والموردين.

### الصلاحيات والأمان

- تسجيل دخول للمستخدمين.
- أدوار وصلاحيات قابلة للإدارة.
- منع العمليات الحساسة من الواجهة ومن طبقة IPC.
- سجل عمليات Audit Log.
- ترخيص مرتبط ببصمة الجهاز.

### الطباعة

- قوالب فواتير متعددة.
- دعم A4 وA5 و80mm thermal receipt.
- معاينة وطباعة مباشرة.
- فصل نظام الطباعة في Services وTemplates قابلة للتوسع.

### النسخ الاحتياطي والاستعادة

- إنشاء نسخ احتياطية من قاعدة PostgreSQL.
- استعادة قاعدة البيانات من نسخة Backup.
- إعدادات للنسخ التلقائي.
- دعم مسار حفظ أساسي ومسار إضافي.

### WhatsApp

- اتصال عبر WhatsApp Web QR.
- إرسال رسائل للعملاء.
- رسائل جماعية للعملاء المتأخرين في السداد.
- إرسال صورة فاتورة.
- حفظ سجل رسائل العملاء.

## التقنيات المستخدمة

- **Electron**: بناء تطبيق Desktop على Windows.
- **React**: بناء واجهة المستخدم.
- **Vite**: بيئة تطوير وبناء Frontend.
- **PostgreSQL**: قاعدة البيانات.
- **Prisma ORM**: نمذجة البيانات وتنفيذ الاستعلامات.
- **Node.js**: منطق التطبيق في Electron main process.
- **electron-builder / NSIS**: بناء Installer للويندوز.
- **Handlebars**: قوالب الطباعة.
- **electron-pos-printer**: الطباعة الصامتة.
- **whatsapp-web.js**: تكامل WhatsApp.
- **bcrypt / JWT**: المصادقة وحماية كلمات المرور.
- **tweetnacl / node-machine-id**: التوقيع والترخيص المرتبط بالجهاز.
- **xlsx**: استيراد/تصدير بيانات Excel.

## ملفات مهمة في المشروع

- `src/App.jsx`: تنظيم الصفحات والتنقل وحماية الواجهة بالصلاحيات.
- `src/pages/`: صفحات التطبيق التشغيلية.
- `src/components/`: مكونات الواجهة المشتركة.
- `electron/main.js`: نقطة تشغيل Electron وإدارة النظام.
- `electron/preload.js`: تعريض API آمن للواجهة.
- `electron/database-ipc-handlers.js`: IPC handlers وطبقة الصلاحيات.
- `electron/db-service.js`: منطق الأعمال والتعامل مع Prisma.
- `electron/postgres-bootstrap.js`: تجهيز PostgreSQL وبيئة قاعدة البيانات.
- `prisma/schema.prisma`: تصميم قاعدة البيانات.
- `printing/`: قوالب وأنظمة الطباعة.
- `scripts/`: سكربتات البناء والتجهيز والترخيص.

## ما يوضح مستواك التقني في المشروع

- بناء تطبيق Desktop كامل وليس مجرد Web UI.
- التعامل مع Business Logic حقيقي فيه فواتير ومخزون ومدفوعات وخزائن.
- تصميم قاعدة بيانات مترابطة ومتعددة الجداول.
- استخدام Transactions لضمان اتساق العمليات المالية.
- بناء نظام صلاحيات فعلي على مستوى الواجهة والـ Backend.
- التعامل مع Packaging وتوزيع البرنامج على Windows.
- إضافة خصائص Production مثل Backup, Restore, Licensing, Audit Logs, Printing.

## صياغة LinkedIn مختصرة

Built a Windows desktop ERP system for Arabic businesses using Electron, React, Prisma, and PostgreSQL. The app covers POS, sales, purchases, inventory, warehouses, customers, suppliers, treasury, reports, RBAC permissions, audit logs, invoice printing, backup/restore, license activation, and WhatsApp communication.

## ملاحظات مهمة قبل مشاركة المشروع

- لا تشارك ملف `.env` أو أي كلمات مرور أو أسرار.
- استخدم Screenshots من الواجهة بدل نشر قاعدة البيانات.
- لو هتشارك Repository عام، احذف أي ملفات Build كبيرة أو بيانات تشغيل حقيقية.
- في الـ CV اكتب مسؤولياتك الفعلية فقط، ولا تذكر خصائص لم تكتمل أو لم تختبرها.
