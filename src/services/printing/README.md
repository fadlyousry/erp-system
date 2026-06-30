# Print Service Usage Guide
# دليل استخدام خدمة الطباعة

## Overview / نظرة عامة

The PrintService provides a complete printing solution for invoices with support for multiple templates and paper sizes.

توفر خدمة الطباعة حلاً كاملاً لطباعة الفواتير مع دعم قوالب متعددة وأحجام ورق مختلفة.

## Basic Usage / الاستخدام الأساسي

```javascript
import PrintService from './services/printing/PrintService.js';

// Print an invoice
const result = await PrintService.printInvoice(
  invoiceData,      // Sale data from database
  'professional-80mm', // Template ID
  {
    company: companySettings,
    printerName: 'POS-80',  // Optional: auto-selected if not provided
    silent: true,            // Optional: default true
    copies: 1                // Optional: default 1
  }
);

if (result.success) {
  console.log('Print successful!');
} else {
  console.error('Print failed:', result.error);
}
```

## Preview Invoice / معاينة الفاتورة

```javascript
// Get rendered HTML for preview
const html = await PrintService.previewInvoice(
  invoiceData,
  'professional-80mm',
  { company: companySettings }
);

// Display in iframe or new window
document.getElementById('preview').innerHTML = html;
```

## Get Available Printers / الحصول على الطابعات المتاحة

```javascript
const printers = await PrintService.getAvailablePrinters();

printers.forEach(printer => {
  console.log(`${printer.displayName} (${printer.name})`);
});
```

## Invoice Data Structure / هيكل بيانات الفاتورة

```javascript
const invoiceData = {
  id: 'INV-001',
  date: new Date(),
  saleType: 'cash', // or 'credit'
  customer: {
    name: 'Customer Name',
    phone: '0123456789',
    balance: 1000
  },
  items: [
    {
      product: { name: 'Product 1' },
      variant: { color: 'Red', size: 'L' },
      quantity: 2,
      price: 100,
      discount: 10
    }
  ],
  discount: 20,
  paid: 150
};
```

## Company Settings / إعدادات الشركة

```javascript
const companySettings = {
  name: 'Company Name / اسم الشركة',
  logoUrl: 'path/to/logo.png',
  qrUrl: 'path/to/qr.png',
  facebookQrUrl: 'path/to/facebook-qr.png',
  instagramQrUrl: 'path/to/instagram-qr.png'
};
```

## Available Templates / القوالب المتاحة

- `professional-80mm` - Professional 80mm thermal receipt
- `simple-80mm` - Simple 80mm thermal receipt
- `classic-a4` - Classic A4 invoice
- `modern-a4` - Modern A4 invoice

## Error Handling / معالجة الأخطاء

```javascript
try {
  const result = await PrintService.printInvoice(invoiceData, templateId);
  
  if (!result.success) {
    // Handle print failure
    alert(result.error);
  }
} catch (error) {
  // Handle unexpected errors
  console.error('Unexpected error:', error);
}
```

## Integration with React Components / التكامل مع مكونات React

```jsx
import React, { useState } from 'react';
import PrintService from './services/printing/PrintService';

function InvoiceComponent({ invoice, company }) {
  const [printing, setPrinting] = useState(false);

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const result = await PrintService.printInvoice(
        invoice,
        'professional-80mm',
        { company }
      );
      
      if (result.success) {
        alert('تمت الطباعة بنجاح / Print successful');
      } else {
        alert(result.error);
      }
    } finally {
      setPrinting(false);
    }
  };

  return (
    <button onClick={handlePrint} disabled={printing}>
      {printing ? 'جاري الطباعة...' : 'طباعة'}
    </button>
  );
}
```

## Notes / ملاحظات

- The PrintService automatically selects the default printer if none is specified
- يختار PrintService الطابعة الافتراضية تلقائياً إذا لم يتم تحديد طابعة
- Templates are loaded dynamically on first use
- يتم تحميل القوالب ديناميكياً عند الاستخدام الأول
- All printing happens in the background without blocking the UI
- تتم جميع عمليات الطباعة في الخلفية دون تجميد الواجهة
- Error messages are provided in both Arabic and English
- يتم توفير رسائل الخطأ بالعربية والإنجليزية
