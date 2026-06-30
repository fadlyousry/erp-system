const PERMISSIONS = [
  // Dashboard
  { key: 'dashboard:view', name: 'عرض لوحة التحكم' },

  // POS
  { key: 'pos:view', name: 'عرض شاشة البيع' },
  { key: 'pos:create', name: 'إجراء عمليات بيع' },
  { key: 'pos:discount', name: 'إجراء خصم في شاشة البيع' },
  { key: 'pos:view_profit', name: 'إظهار الربح في شاشة البيع' },
  { key: 'pos:view_details', name: 'عرض تفاصيل المنتج في شاشة البيع' },
  { key: 'pos:change_price', name: 'تغيير سعر البيع في السلة' },
  { key: 'pos:delete_item', name: 'حذف صنف من سلة البيع' },
  { key: 'pos:change_warehouse', name: 'تغيير المخزن في شاشة البيع' },

  // Sales
  { key: 'sales:view', name: 'عرض المبيعات' },
  { key: 'sales:edit', name: 'تعديل المبيعات' },
  { key: 'sales:delete', name: 'حذف المبيعات' },
  { key: 'sales:print', name: 'طباعة الفواتير' },
  { key: 'sales:change_date', name: 'تعديل تاريخ فاتورة البيع' },
  { key: 'sales:download', name: 'تحميل أو تصدير الفواتير' },

  // Returns
  { key: 'returns:view', name: 'عرض المرتجعات' },
  { key: 'returns:create', name: 'إجراء عمليات ارتجاع' },

  // Products
  { key: 'products:view', name: 'عرض المنتجات' },
  { key: 'products:create', name: 'إضافة منتجات' },
  { key: 'products:edit', name: 'تعديل المنتجات' },
  { key: 'products:delete', name: 'حذف المنتجات' },
  { key: 'products:stock', name: 'إدارة المخزون' },

  // Warehouses
  { key: 'warehouses:view', name: 'عرض المخازن' },
  { key: 'warehouses:manage', name: 'إدارة المخازن والتحويلات' },

  // Customers
  { key: 'customers:view', name: 'عرض العملاء' },
  { key: 'customers:manage', name: 'إدارة العملاء (إضافة/تعديل/حذف)' },
  { key: 'customers:payments', name: 'إدارة مدفوعات العملاء' },

  // Suppliers
  { key: 'suppliers:view', name: 'عرض الموردين' },
  { key: 'suppliers:manage', name: 'إدارة الموردين (إضافة/تعديل/حذف)' },
  { key: 'suppliers:payments', name: 'إدارة مدفوعات الموردين' },
  { key: 'purchases:view', name: 'عرض المشتريات' },
  { key: 'purchases:create', name: 'إجراء عمليات شراء' },

  // Treasury
  { key: 'treasury:view', name: 'عرض الخزينة' },
  { key: 'treasury:manage', name: 'إدارة الخزائن' },
  { key: 'treasury:transactions', name: 'إجراء عمليات الخزينة (إيداع/سحب/تحويل)' },

  // Expenses
  { key: 'expenses:view', name: 'عرض المصروفات' },
  { key: 'expenses:manage', name: 'إدارة المصروفات والتصنيفات' },

  // Users & Permissions
  { key: 'users:view', name: 'عرض المستخدمين' },
  { key: 'users:manage', name: 'إدارة المستخدمين' },
  { key: 'roles:manage', name: 'إدارة الأدوار والصلاحيات' },

  // Reports
  { key: 'reports:view', name: 'عرض التقارير' },
  { key: 'reports:financial', name: 'عرض التقارير المالية' },
  { key: 'reports:profit', name: 'عرض تقرير الأرباح بالتفصيل' },
  { key: 'reports:season', name: 'عرض تقرير مواسم المبيعات' },

  // Activity Log
  { key: 'activityLog:view', name: 'عرض سجل النشاطات' },

  // Settings
  { key: 'settings:view', name: 'عرض الإعدادات' },
  { key: 'settings:edit', name: 'تعديل الإعدادات' },

  // Chat
  { key: 'chat:view', name: 'استخدام الدردشة الداخلية' },

  // WhatsApp Integration
  { key: 'whatsapp:view', name: 'عرض شاشة الواتساب والتنبيهات' },
  { key: 'whatsapp:manage', name: 'إدارة وتفعيل حساب وإعدادات الواتساب' },

  // AI Marketing
  { key: 'aiMarketing:view', name: 'عرض التسويق الذكي بالذكاء الاصطناعي' },
  { key: 'aiMarketing:manage', name: 'استخدام وإرسال حملات التسويق الذكي' },

  // Coupons & Discounts
  { key: 'coupons:view', name: 'عرض الكوبونات والخصومات' },
  { key: 'coupons:manage', name: 'إدارة الكوبونات والخصومات (إضافة/تعديل/حذف)' },

  // System Licensing
  { key: 'license:view', name: 'عرض معلومات ترخيص النظام' },
  { key: 'license:manage', name: 'تحديث وإدارة تراخيص النظام' },
];

module.exports = { PERMISSIONS };
