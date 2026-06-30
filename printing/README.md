# نظام الطباعة المرنة / Flexible Printing System

## نظرة عامة / Overview

نظام طباعة مرن للفواتير يدعم الطباعة الصامتة والقوالب القابلة للتخصيص وأحجام الورق المتعددة.

A flexible invoice printing system that supports silent printing, customizable templates, and multiple paper sizes.

## البنية التحتية / Infrastructure

### المجلدات / Folders

```
src/
  services/
    printing/
      PrintService.js         - خدمة الطباعة الرئيسية / Main print service
      TemplateManager.js      - إدارة القوالب / Template management
      SettingsManager.js      - إدارة الإعدادات / Settings management
      dataAdapter.js          - تحويل البيانات / Data transformation
  components/
    printing/
      PrintButton.jsx         - زر الطباعة / Print button
      PrintSettings.jsx       - واجهة الإعدادات / Settings interface
      PrintPreview.jsx        - معاينة الطباعة / Print preview

printing/
  templates/
    saleInvoice/
      a4/                     - قوالب A4 / A4 templates
        classic.js
        modern.js
        professional.js
      receipt80/              - قوالب 80mm / 80mm templates
        classic.js
        modern.js
        professional.js
    templateRegistry.js       - سجل القوالب / Template registry
  config.js                   - إعدادات النظام / System configuration

electron/
  main/
    printHandler.js           - معالج الطباعة / Print handler
```

### الحزم المثبتة / Installed Packages

- **electron-pos-printer** (v1.4.0) - للطباعة الصامتة / For silent printing
- **handlebars** (v4.7.9) - لعرض القوالب / For template rendering

## الاستخدام / Usage

### طباعة فاتورة / Print Invoice

```javascript
import PrintService from './services/printing/PrintService';

const result = await PrintService.printInvoice(
  invoiceData,
  'professional-80mm',
  { silent: true }
);

if (result.success) {
  console.log('Print successful');
} else {
  console.error('Print failed:', result.error);
}
```

### إدارة الإعدادات / Settings Management

```javascript
import SettingsManager from './services/printing/SettingsManager';

// Load settings
const settings = await SettingsManager.loadSettings();

// Update printer
await SettingsManager.updatePrinter('thermal80mm', 'POS-80');

// Save settings
await SettingsManager.saveSettings(settings);
```

### استخدام المكونات / Using Components

```jsx
import PrintButton from './components/printing/PrintButton';

<PrintButton 
  invoiceData={sale}
  invoiceType="saleInvoice"
  onPrintComplete={() => console.log('Done')}
/>
```

## الإعدادات / Configuration

الإعدادات محفوظة في localStorage تحت المفتاح `fadl_print_settings`.

Settings are stored in localStorage under the key `fadl_print_settings`.

### هيكل الإعدادات / Settings Structure

```javascript
{
  printers: {
    a4: {
      default: "HP LaserJet",
      lastUsed: "HP LaserJet"
    },
    thermal80mm: {
      default: "POS-80",
      lastUsed: "POS-80"
    }
  },
  templates: {
    saleInvoice: {
      a4: "classic-a4",
      thermal80mm: "professional-80mm"
    }
  },
  printOptions: {
    silent: true,
    preview: false,
    copies: 1
  }
}
```

## القوالب / Templates

القوالب موجودة في `printing/templates/` ومنظمة حسب نوع الفاتورة وحجم الورق.

Templates are located in `printing/templates/` and organized by invoice type and paper size.

### أحجام الورق المدعومة / Supported Paper Sizes

- **A4** (210mm × 297mm)
- **Thermal 80mm** (80mm × auto height)
- **A5** (148mm × 210mm)

## التطوير / Development

### إضافة قالب جديد / Adding a New Template

1. أنشئ ملف القالب في المجلد المناسب
2. سجل القالب في `templateRegistry.js`
3. استخدم Handlebars للعرض الديناميكي

1. Create template file in appropriate folder
2. Register template in `templateRegistry.js`
3. Use Handlebars for dynamic rendering

## الحالة / Status

✅ البنية التحتية جاهزة / Infrastructure ready
⏳ التكامل قيد التطوير / Integration in progress

## المتطلبات / Requirements

- Electron 20+
- React 18+
- Windows 10/11
