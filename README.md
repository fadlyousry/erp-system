# Sales Manager Desktop

نظام إدارة المبيعات والمخزون والحسابات - تطبيق سطح المكتب

## 📋 نظرة عامة

Sales Manager هو نظام متكامل لإدارة:
- 💰 المبيعات والفواتير
- 📦 المخزون والمستودعات
- 👥 العملاء والموردين
- 💵 الخزائن والمصروفات
- 📊 التقارير والإحصائيات

## 🚀 التثبيت

### للمستخدمين
اقرأ [دليل التثبيت](INSTALLATION_GUIDE.md) للحصول على تعليمات مفصلة.

### للمطورين

#### المتطلبات
- Node.js 18+
- PostgreSQL 16
- Windows 10/11

#### خطوات التطوير

1. **Clone المشروع**
```bash
git clone <repository-url>
cd erp-desktop
```

2. **تثبيت Dependencies**
```bash
npm install
```

3. **إعداد قاعدة البيانات**
```bash
# نسخ ملف البيئة
copy .env.example .env

# تعديل .env بإعدادات PostgreSQL الخاصة بك

# تشغيل Migrations
npm run prisma:migrate:dev

# تشغيل Bootstrap (إنشاء البيانات الأولية)
npm run prisma:bootstrap
```

4. **تشغيل التطبيق في وضع التطوير**
```bash
# Terminal 1: تشغيل Vite dev server
npm run dev

# Terminal 2: تشغيل Electron
npm run app
```

## 📦 البناء والتوزيع

### بناء النسخة النهائية
```bash
npm run dist
```

سيتم إنشاء ملف Setup في مجلد `release-build/`

### ملاحظات مهمة للبناء
- تأكد من وجود PostgreSQL installer في `vendor/postgresql-16.4-1-windows-x64.exe`
- سيتم تضمين Prisma migrations تلقائيًا
- سيتم إنشاء `electron/runtime.env` تلقائيًا

## 🏗️ البنية التقنية

### Frontend
- React 19
- Vite
- Lucide Icons
- Cairo Font (دعم العربية)

### Backend
- Electron 40
- Node.js
- Express (للطباعة)

### Database
- PostgreSQL 16
- Prisma ORM

### Build
- electron-builder
- NSIS installer

## 📁 هيكل المشروع

```
erp-desktop/
├── src/                    # React frontend
│   ├── components/         # مكونات React
│   ├── pages/             # صفحات التطبيق
│   └── utils/             # دوال مساعدة
├── electron/              # Electron main process
│   ├── main.js           # نقطة البداية
│   ├── postgres-bootstrap.js  # إدارة PostgreSQL
│   ├── db-service.js     # خدمات قاعدة البيانات
│   └── database-ipc-handlers.js  # IPC handlers
├── prisma/               # Database schema & migrations
│   ├── schema.prisma     # نموذج قاعدة البيانات
│   ├── migrations/       # ملفات الترحيل
│   └── bootstrap.js      # البيانات الأولية
├── printing/             # نظام الطباعة
├── scripts/              # Build scripts
│   ├── prepare-dist.js   # تحضير التوزيع
│   └── generate-build-assets.js  # إنشاء الأيقونات
├── build/                # Build resources
│   ├── icon.ico
│   ├── installerIcon.ico
│   └── uninstallerIcon.ico
└── vendor/               # PostgreSQL installer
    └── postgresql-16.4-1-windows-x64.exe
```

## 🔧 Scripts المتاحة

```bash
# Development
npm run dev              # تشغيل Vite dev server
npm run app              # تشغيل Electron
npm start                # alias لـ npm run dev

# Database
npm run prisma:generate  # توليد Prisma Client
npm run prisma:migrate:dev  # تشغيل migrations في التطوير
npm run prisma:migrate:deploy  # تشغيل migrations في الإنتاج
npm run prisma:bootstrap  # إنشاء البيانات الأولية
npm run seed             # alias لـ bootstrap

# Build
npm run build            # بناء Frontend فقط
npm run dist             # بناء التطبيق الكامل + Installer

# Utilities
npm run license:generate  # توليد ملف ترخيص
```

## 🐛 حل المشاكل

اقرأ [دليل حل المشاكل](TROUBLESHOOTING.md) للحصول على حلول للمشاكل الشائعة.

### مشاكل شائعة في التطوير

#### 1. Prisma Client لا يعمل
```bash
npm run prisma:generate
```

#### 2. Database connection failed
```bash
# تحقق من PostgreSQL
psql -h localhost -p 5433 -U erp_user -d erp_clothing

# أعد تشغيل migrations
npm run prisma:migrate:dev
```

#### 3. Vite dev server لا يعمل
```bash
# تأكد من Port 5173 غير محجوز
netstat -ano | findstr :5173

# أعد تشغيل
npm run dev
```

## 📝 المساهمة

### Coding Standards
- استخدم ESLint للتحقق من الكود
- اتبع نمط الكود الموجود
- اكتب تعليقات واضحة بالعربية للوظائف المهمة

### Git Workflow
```bash
# إنشاء branch جديد
git checkout -b feature/feature-name

# Commit changes
git add .
git commit -m "وصف التغييرات"

# Push
git push origin feature/feature-name
```

## 📄 الترخيص

هذا المشروع محمي بحقوق الملكية. جميع الحقوق محفوظة © 2026 Fadl Tech

## 📞 الدعم

للدعم الفني أو الاستفسارات، تواصل مع فريق التطوير.

---

## 🔐 الأمان

### ملاحظات مهمة
- لا تشارك ملف `.env` أبدًا
- غيّر `JWT_SECRET` في الإنتاج
- استخدم كلمات مرور قوية لـ PostgreSQL
- قم بعمل Backup دوري لقاعدة البيانات

### Backup
يمكنك عمل Backup من داخل البرنامج:
```
الإعدادات → النسخ الاحتياطي → إنشاء نسخة احتياطية
```

أو يدويًا:
```bash
pg_dump -h localhost -p 5433 -U erp_user erp_clothing > backup.sql
```

---

**Built with ❤️ by Fadl Tech**
