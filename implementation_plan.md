# خطة تحديث تطبيق ERP Desktop أونلاين (Auto-Update)

## الوضع الحالي

- التطبيق مبني بـ **Electron + electron-builder** مع NSIS installer
- حجم الـ Setup حالياً **~585MB** (كبير لأنه يتضمن PostgreSQL)
- electron-builder بالفعل يولّد ملف `latest.yml` و `.blockmap` (جاهز للتحديث التفاضلي)
- **لا يوجد** حالياً أي نظام تحديث مُفعّل
- الريبو على GitHub (branch: `design-2`)

---

## الطرق المتاحة للتحديث

### الطريقة 1: `electron-updater` مع GitHub Releases (⭐ الأفضل لك)

| الميزة | التفصيل |
|--------|---------|
| **التكلفة** | مجاني تماماً (GitHub Releases يدعم ملفات حتى 2GB) |
| **السهولة** | سهل جداً - 3 ملفات فقط تحتاج تعديل |
| **التحديث التفاضلي** | نعم - blockmap يسمح بتنزيل الأجزاء المتغيرة فقط بدل الـ 585MB كلها |
| **التوقيع** | يدعم code signing (اختياري) |
| **التحكم** | تقدر تنشر التحديث وقتما تريد من GitHub |

**كيف تعمل؟**
1. تعمل Build جديد بنسخة أعلى (مثلاً `1.0.1`)
2. ترفع ملفات الـ `.exe` + `latest.yml` + `.blockmap` كـ GitHub Release
3. التطبيق عند العميل يفحص تلقائياً وجود تحديث
4. لو لقى تحديث → يعرض إشعار → العميل يضغط "تحديث" → ينزّل ويثبّت تلقائياً

---

### الطريقة 2: سيرفر خاص (Self-hosted)

| الميزة | التفصيل |
|--------|---------|
| **التكلفة** | تكلفة الاستضافة + الـ bandwidth |
| **السهولة** | متوسطة - تحتاج سيرفر وإعداد |
| **التحكم** | تحكم كامل |
| **المناسب لـ** | لو عندك عملاء كتير (100+) ومحتاج تحكم في من يحصل على التحديث |

**كيف تعمل؟**
- ترفع ملفات التحديث على سيرفر عادي (VPS أو S3 bucket)
- التطبيق يفحص الـ URL بتاعك بدل GitHub

---

### الطريقة 3: Hot-Reload للـ Frontend فقط (تحديثات صغيرة سريعة)

| الميزة | التفصيل |
|--------|---------|
| **التكلفة** | مجاني |
| **السهولة** | متوسطة التعقيد |
| **المناسب لـ** | إصلاح مشاكل واجهة سريعة بدون إعادة تثبيت |

**كيف تعمل؟**
- التطبيق ينزّل ملفات الـ `dist/assets` الجديدة من سيرفر
- يستبدل الملفات المحلية ويعمل restart للنافذة فقط
- **لا يحتاج** إعادة تثبيت كاملة

---

## التوصية

> [!IMPORTANT]
> **الطريقة 1 (electron-updater + GitHub Releases)** هي الأنسب لحالتك لأن:
> 1. مجانية تماماً
> 2. electron-builder اللي بتستخدمه أصلاً يدعمها مباشرة
> 3. تدعم التحديث التفاضلي (differential update) - يعني العميل مش هينزّل 585MB كل مرة
> 4. سهلة التنفيذ - تقريباً 3 ملفات بس
> 5. آمنة - التحديث يتحقق من الـ SHA512

> [!TIP]
> ممكن نضيف **الطريقة 3 (Hot-Reload)** كميزة إضافية لاحقاً لإصلاح مشاكل الواجهة السريعة بدون تحديث كامل.

---

## خطة التنفيذ (الطريقة 1)

### الملفات المطلوب تعديلها/إنشاؤها

---

### 1. تثبيت المكتبة

```bash
npm install electron-updater
```

---

### 2. إعدادات البناء

#### [MODIFY] [package.json](file:///d:/erp-new/erp%20system/erp-desktop/package.json)
- إضافة `"publish"` config لـ GitHub Releases
- تعديل الإصدار `version` عند كل تحديث

```json
{
  "version": "1.0.1",
  "build": {
    "publish": [
      {
        "provider": "github",
        "owner": "YOUR_GITHUB_USERNAME",
        "repo": "erp-desktop"
      }
    ]
  }
}
```

---

### 3. كود التحديث في الـ Backend (Electron Main Process)

#### [NEW] [electron/auto-updater.js](file:///d:/erp-new/erp%20system/erp-desktop/electron/auto-updater.js)

ملف جديد يتعامل مع كل منطق التحديث:

```javascript
const { autoUpdater } = require('electron-updater');
const { ipcMain } = require('electron');

function setupAutoUpdater(mainWindow) {
    // فحص التحديثات كل 30 دقيقة
    autoUpdater.autoDownload = false; // لا تنزّل تلقائياً - خلّي المستخدم يقرر
    autoUpdater.autoInstallOnAppQuit = true;

    // إرسال حالة التحديث للواجهة
    autoUpdater.on('checking-for-update', () => {
        mainWindow.webContents.send('update:status', { status: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
        mainWindow.webContents.send('update:status', {
            status: 'available',
            version: info.version,
            releaseDate: info.releaseDate
        });
    });

    autoUpdater.on('update-not-available', () => {
        mainWindow.webContents.send('update:status', { status: 'up-to-date' });
    });

    autoUpdater.on('download-progress', (progress) => {
        mainWindow.webContents.send('update:status', {
            status: 'downloading',
            percent: progress.percent,
            transferred: progress.transferred,
            total: progress.total
        });
    });

    autoUpdater.on('update-downloaded', () => {
        mainWindow.webContents.send('update:status', { status: 'ready' });
    });

    autoUpdater.on('error', (error) => {
        mainWindow.webContents.send('update:status', {
            status: 'error',
            message: error?.message
        });
    });

    // IPC handlers - الواجهة تتحكم في التحديث
    ipcMain.handle('update:check', () => autoUpdater.checkForUpdates());
    ipcMain.handle('update:download', () => autoUpdater.downloadUpdate());
    ipcMain.handle('update:install', () => autoUpdater.quitAndInstall());

    // فحص تلقائي عند بدء التشغيل
    autoUpdater.checkForUpdates().catch(() => {});

    // فحص كل 30 دقيقة
    setInterval(() => {
        autoUpdater.checkForUpdates().catch(() => {});
    }, 30 * 60 * 1000);
}

module.exports = { setupAutoUpdater };
```

---

### 4. ربط التحديث في الـ Main Process

#### [MODIFY] [electron/main.js](file:///d:/erp-new/erp%20system/erp-desktop/electron/main.js)
- استدعاء `setupAutoUpdater` بعد إنشاء النافذة الرئيسية

---

### 5. واجهة التحديث في الـ Frontend

#### [MODIFY] [electron/preload.js](file:///d:/erp-new/erp%20system/erp-desktop/electron/preload.js)
- إضافة API calls للتحديث في الـ preload

#### [NEW] [src/components/UpdateNotification.jsx](file:///d:/erp-new/erp%20system/erp-desktop/src/components/UpdateNotification.jsx)
- مكون يعرض إشعار التحديث مع:
  - زر "تحديث الآن"
  - شريط تقدم التنزيل (progress bar)
  - زر "لاحقاً"

---

### 6. عملية النشر (Deployment Workflow)

عند كل تحديث جديد:

```bash
# 1. غيّر رقم الإصدار في package.json
# مثلاً: 1.0.0 → 1.0.1

# 2. ابني التطبيق
npm run dist

# 3. ارفع على GitHub Release
# الملفات المطلوبة:
#   - fadl-erp Setup 1.0.1.exe
#   - fadl-erp Setup 1.0.1.exe.blockmap
#   - latest.yml
```

---

## Open Questions

> [!IMPORTANT]
> ### 1. GitHub Repository
> هل الريبو بتاعك على GitHub **public** ولا **private**؟
> - لو **public**: التحديث يعمل مباشرة بدون أي إعداد إضافي
> - لو **private**: هنحتاج نضيف GitHub Token (أو نستخدم سيرفر بديل)

> [!IMPORTANT]
> ### 2. اسم الريبو على GitHub
> محتاج اسم الـ owner واسم الريبو بالظبط عشان أضبط الإعدادات
> مثال: `github.com/fadly/erp-desktop`

> [!WARNING]
> ### 3. Code Signing (توقيع الكود)
> حالياً التطبيق **غير موقّع** (no code signing certificate).
> - التحديث هيشتغل بدون توقيع لكن Windows Defender ممكن يعطي تحذير للمستخدم
> - هل تريد نتعامل مع هذا الموضوع لاحقاً؟

---

## Verification Plan

### اختبار محلي
1. عمل Build بنسخة `1.0.1` ورفعها كـ GitHub Release
2. تشغيل النسخة القديمة `1.0.0` والتأكد من ظهور إشعار التحديث
3. اختبار التنزيل والتثبيت التلقائي

### اختبار على جهاز العميل
- التأكد من أن التحديث يعمل عبر الإنترنت بدون مشاكل
- التأكد من عدم فقدان بيانات قاعدة البيانات بعد التحديث
