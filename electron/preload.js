const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // System Setup & Maintenance
    getSetupStatus: () => ipcRenderer.invoke('system:getSetupStatus'),
    getBackupSettings: () => ipcRenderer.invoke('system:getBackupSettings'),
    testDatabaseConnection: (payload) => ipcRenderer.invoke('system:testDatabaseConnection', payload),
    saveDatabaseConnection: (payload) => ipcRenderer.invoke('system:saveDatabaseConnection', payload),
    resetDatabaseConnection: () => ipcRenderer.invoke('system:resetDatabaseConnection'),
    chooseBackupDirectory: (currentDirectoryPath) => ipcRenderer.invoke('system:chooseBackupDirectory', { currentDirectoryPath }),
    chooseDirectory: (payload) => ipcRenderer.invoke('system:chooseDirectory', payload),
    saveBackupSettings: (payload) => ipcRenderer.invoke('system:saveBackupSettings', payload),
    saveBusinessProfile: (payload) => ipcRenderer.invoke('system:saveBusinessProfile', payload),
    completeFirstRunSetup: (payload) => ipcRenderer.invoke('system:completeFirstRunSetup', payload),
    forceResetLocalDatabase: () => ipcRenderer.invoke('system:forceResetLocalDatabase'),
    backupDatabase: (options) => ipcRenderer.invoke('system:backupDatabase', options),
    restoreDatabase: () => ipcRenderer.invoke('system:restoreDatabase'),
    restartApp: () => ipcRenderer.invoke('system:restartApp'),
    onSetupProgress: (callback) => ipcRenderer.on('system:setupProgress', (_event, data) => callback(data)),
    offSetupProgress: () => ipcRenderer.removeAllListeners('system:setupProgress'),

    // Auth
    login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
    setCurrentUser: (user) => ipcRenderer.invoke('auth:setCurrentUser', user),
    clearCurrentUser: () => ipcRenderer.invoke('auth:clearCurrentUser'),

    // Dashboard
    getDashboardStats: (token) => ipcRenderer.invoke('db:getDashboardStats', token),
    getFinancialInsights: () => ipcRenderer.invoke('db:getFinancialInsights'),

    // Products
    getProducts: (params) => ipcRenderer.invoke('db:getProducts', params),
    getProduct: (id) => ipcRenderer.invoke('db:getProduct', id),
    searchProducts: (query) => ipcRenderer.invoke('db:searchProducts', query),
    addProduct: (productData) => ipcRenderer.invoke('db:addProduct', productData),
    updateProduct: (id, productData) => ipcRenderer.invoke('db:updateProduct', id, productData),
    deleteProduct: (id) => ipcRenderer.invoke('db:deleteProduct', id),
    previewPriceUpdate: (params) => ipcRenderer.invoke('db:previewPriceUpdate', params),
    applyPriceUpdate: (params) => ipcRenderer.invoke('db:applyPriceUpdate', params),

    // Categories
    getCategories: () => ipcRenderer.invoke('db:getCategories'),
    addCategory: (categoryData) => ipcRenderer.invoke('db:addCategory', categoryData),
    updateCategory: (id, categoryData) => ipcRenderer.invoke('db:updateCategory', id, categoryData),
    deleteCategory: (id) => ipcRenderer.invoke('db:deleteCategory', id),

    // Warehouses
    getWarehouses: () => ipcRenderer.invoke('db:getWarehouses'),
    getWarehouseInventory: (warehouseId) => ipcRenderer.invoke('db:getWarehouseInventory', warehouseId),
    reconcileWarehouseInventory: (warehouseId, items) => ipcRenderer.invoke('db:reconcileWarehouseInventory', warehouseId, items),
    addWarehouse: (warehouseData) => ipcRenderer.invoke('db:addWarehouse', warehouseData),
    updateWarehouse: (id, warehouseData) => ipcRenderer.invoke('db:updateWarehouse', id, warehouseData),
    deleteWarehouse: (id) => ipcRenderer.invoke('db:deleteWarehouse', id),
    getWarehouseStocks: (productId) => ipcRenderer.invoke('db:getWarehouseStocks', productId),
    updateWarehouseStock: (productId, warehouseId, quantity) => ipcRenderer.invoke('db:updateWarehouseStock', productId, warehouseId, quantity),
    updateMultipleWarehouseStocks: (productId, stocks) => ipcRenderer.invoke('db:updateMultipleWarehouseStocks', productId, stocks),
    updateVariantWarehouseStocks: (productId, stocks) => ipcRenderer.invoke('db:updateVariantWarehouseStocks', productId, stocks),
    reconcileVariantInventoryStocks: (productId) => ipcRenderer.invoke('db:reconcileVariantInventoryStocks', productId),
    transferProductBetweenWarehouses: (productId, fromWarehouseId, toWarehouseId, quantity, notes, variantId) => ipcRenderer.invoke('db:transferProductBetweenWarehouses', productId, fromWarehouseId, toWarehouseId, quantity, notes, variantId),
    getWarehouseTransfers: (productId, limit) => ipcRenderer.invoke('db:getWarehouseTransfers', productId, limit),
    getInventoryValuation: () => ipcRenderer.invoke('db:getInventoryValuation'),
    getLowStockReport: () => ipcRenderer.invoke('db:getLowStockReport'),
    getStockMovementHistory: (productId, warehouseId) => ipcRenderer.invoke('db:getStockMovementHistory', productId, warehouseId),

    // Inventory
    getInventory: (productId) => ipcRenderer.invoke('db:getInventory', productId),
    updateInventory: (productId, inventoryData) => ipcRenderer.invoke('db:updateInventory', productId, inventoryData),

    // Variants
    getVariants: () => ipcRenderer.invoke('db:getVariants'),
    searchVariants: (query) => ipcRenderer.invoke('db:searchVariants', query),
    addVariant: (variantData) => ipcRenderer.invoke('db:addVariant', variantData),
    updateVariant: (id, variantData) => ipcRenderer.invoke('db:updateVariant', id, variantData),
    deleteVariant: (id) => ipcRenderer.invoke('db:deleteVariant', id),
    getProductHistory: (variantId) => ipcRenderer.invoke('db:getProductHistory', variantId),

    // Sales
    getSales: (options) => ipcRenderer.invoke('db:getSales', options),
    getSaleById: (saleId) => ipcRenderer.invoke('db:getSaleById', saleId),
    createSale: (saleData) => ipcRenderer.invoke('db:createSale', saleData),
    printSale: (saleId, companyInfo) => ipcRenderer.invoke('print:sale', saleId, companyInfo),
    printHTML: (options) => ipcRenderer.invoke('print:printHTML', options),
    listPrinters: () => ipcRenderer.invoke('print:listPrinters'),
    deleteSale: (saleId) => ipcRenderer.invoke('db:deleteSale', saleId),
    updateSale: (saleId, saleData) => ipcRenderer.invoke('db:updateSale', saleId, saleData),
    getSoldItemsReport: (params) => ipcRenderer.invoke('db:getSoldItemsReport', params),
    getItemMovementReport: (params) => ipcRenderer.invoke('db:getItemMovementReport', params),

    // Purchases
    getPurchases: (options) => ipcRenderer.invoke('db:getPurchases', options),
    getPurchaseById: (purchaseId) => ipcRenderer.invoke('db:getPurchaseById', purchaseId),
    createPurchase: (purchaseData) => ipcRenderer.invoke('db:createPurchase', purchaseData),
    updatePurchase: (purchaseId, purchaseData) => ipcRenderer.invoke('db:updatePurchase', purchaseId, purchaseData),
    deletePurchase: (purchaseId) => ipcRenderer.invoke('db:deletePurchase', purchaseId),

    // Returns
    getReturns: (options) => ipcRenderer.invoke('db:getReturns', options),
    getReturnById: (returnId) => ipcRenderer.invoke('db:getReturnById', returnId),
    createReturn: (returnData) => ipcRenderer.invoke('db:createReturn', returnData),
    updateReturn: (returnId, returnData) => ipcRenderer.invoke('db:updateReturn', returnId, returnData),
    deleteReturn: (returnId) => ipcRenderer.invoke('db:deleteReturn', returnId),
    getPurchaseReturns: (options) => ipcRenderer.invoke('db:getPurchaseReturns', options),
    getPurchaseReturnById: (returnId) => ipcRenderer.invoke('db:getPurchaseReturnById', returnId),
    createPurchaseReturn: (returnData) => ipcRenderer.invoke('db:createPurchaseReturn', returnData),
    updatePurchaseReturn: (returnId, returnData) => ipcRenderer.invoke('db:updatePurchaseReturn', returnId, returnData),
    deletePurchaseReturn: (returnId) => ipcRenderer.invoke('db:deletePurchaseReturn', returnId),

    // Customers
    getCustomerStats: (params) => ipcRenderer.invoke('db:getCustomerStats', params),
    getCustomers: (params) => ipcRenderer.invoke('db:getCustomers', params),
    getCustomerLookup: (params) => ipcRenderer.invoke('db:getCustomerLookup', params),
    addCustomer: (customerData) => ipcRenderer.invoke('db:addCustomer', customerData),
    updateCustomer: (id, customerData) => ipcRenderer.invoke('db:updateCustomer', id, customerData),
    deleteCustomer: (id) => ipcRenderer.invoke('db:deleteCustomer', id),
    getCustomer: (id) => ipcRenderer.invoke('db:getCustomer', id),
    getCustomerSales: (customerId) => ipcRenderer.invoke('db:getCustomerSales', customerId),
    getCustomerReturns: (customerId) => ipcRenderer.invoke('db:getCustomerReturns', customerId),
    addCustomerPayment: (paymentData) => ipcRenderer.invoke('db:addCustomerPayment', paymentData),
    createCustomerPayment: (paymentData) => ipcRenderer.invoke('db:createCustomerPayment', paymentData),
    previewCustomerPaymentAllocation: (params) => ipcRenderer.invoke('db:previewCustomerPaymentAllocation', params),
    getCustomerPayments: (customerId) => ipcRenderer.invoke('db:getCustomerPayments', customerId),
    updateCustomerPayment: (paymentId, paymentData) => ipcRenderer.invoke('db:updateCustomerPayment', paymentId, paymentData),
    deleteCustomerPayment: (paymentId) => ipcRenderer.invoke('db:deleteCustomerPayment', paymentId),
    rebuildCustomerFinancials: (customerId) => ipcRenderer.invoke('db:rebuildCustomerFinancials', customerId),
    rebuildAllCustomersFinancials: (params) => ipcRenderer.invoke('db:rebuildAllCustomersFinancials', params),
    checkCustomerFinancialsHealth: () => ipcRenderer.invoke('db:checkCustomerFinancialsHealth'),
    getPaymentMethods: () => ipcRenderer.invoke('db:getPaymentMethods'),
    getPaymentMethodStats: () => ipcRenderer.invoke('db:getPaymentMethodStats'),
    getPaymentMethodReport: (params) => ipcRenderer.invoke('db:getPaymentMethodReport', params),

    // Treasury
    getTreasuries: () => ipcRenderer.invoke('db:getTreasuries'),
    createTreasury: (treasuryData) => ipcRenderer.invoke('db:createTreasury', treasuryData),
    updateTreasury: (id, treasuryData) => ipcRenderer.invoke('db:updateTreasury', id, treasuryData),
    setDefaultTreasury: (id, options) => ipcRenderer.invoke('db:setDefaultTreasury', id, options),
    deleteTreasury: (id, options) => ipcRenderer.invoke('db:deleteTreasury', id, options),
    createTreasuryTransaction: (transactionData) => ipcRenderer.invoke('db:createTreasuryTransaction', transactionData),
    createDepositReceipt: (params) => ipcRenderer.invoke('db:createDepositReceipt', params),
    applyDepositToSale: (params) => ipcRenderer.invoke('db:applyDepositToSale', params),
    refundDeposit: (params) => ipcRenderer.invoke('db:refundDeposit', params),
    getTreasuryEntries: (params) => ipcRenderer.invoke('db:getTreasuryEntries', params),
    getDailyRevenueReport: (params) => ipcRenderer.invoke('db:getDailyRevenueReport', params),
    getProfitReport: (params) => ipcRenderer.invoke('db:getProfitReport', params),
    getSeasonReport: (params) => ipcRenderer.invoke('db:getSeasonReport', params),

    // Suppliers
    getSuppliers: () => ipcRenderer.invoke('db:getSuppliers'),
    addSupplier: (supplierData) => ipcRenderer.invoke('db:addSupplier', supplierData),
    updateSupplier: (id, supplierData) => ipcRenderer.invoke('db:updateSupplier', id, supplierData),
    deleteSupplier: (id) => ipcRenderer.invoke('db:deleteSupplier', id),
    addSupplierPayment: (paymentData) => ipcRenderer.invoke('db:addSupplierPayment', paymentData),
    getSupplierPayments: (supplierId) => ipcRenderer.invoke('db:getSupplierPayments', supplierId),
    updateSupplierPayment: (paymentId, paymentData) => ipcRenderer.invoke('db:updateSupplierPayment', paymentId, paymentData),
    deleteSupplierPayment: (paymentId) => ipcRenderer.invoke('db:deleteSupplierPayment', paymentId),

    // Expenses
    getExpenses: (params) => ipcRenderer.invoke('db:getExpenses', params),
    addExpense: (expenseData) => ipcRenderer.invoke('db:addExpense', expenseData),
    updateExpense: (id, expenseData) => ipcRenderer.invoke('db:updateExpense', id, expenseData),
    deleteExpense: (id) => ipcRenderer.invoke('db:deleteExpense', id),

    // Expense Categories
    getExpenseCategories: () => ipcRenderer.invoke('db:getExpenseCategories'),
    addExpenseCategory: (data) => ipcRenderer.invoke('db:addExpenseCategory', data),
    updateExpenseCategory: (id, data) => ipcRenderer.invoke('db:updateExpenseCategory', id, data),
    deleteExpenseCategory: (id) => ipcRenderer.invoke('db:deleteExpenseCategory', id),

    // Roles & Permissions
    getRoles: () => ipcRenderer.invoke('db:getRoles'),
    addRole: (roleData) => ipcRenderer.invoke('db:addRole', roleData),
    updateRole: (id, roleData) => ipcRenderer.invoke('db:updateRole', id, roleData),
    deleteRole: (id) => ipcRenderer.invoke('db:deleteRole', id),
    getPermissions: () => ipcRenderer.invoke('db:getPermissions'),

    // Coupons
    getCoupons: () => ipcRenderer.invoke('db:getCoupons'),
    addCoupon: (couponData) => ipcRenderer.invoke('db:addCoupon', couponData),
    updateCoupon: (id, couponData) => ipcRenderer.invoke('db:updateCoupon', id, couponData),
    deleteCoupon: (id) => ipcRenderer.invoke('db:deleteCoupon', id),
    validateCoupon: (code, orderTotal) => ipcRenderer.invoke('db:validateCoupon', code, orderTotal),

    // Users
    getUsers: () => ipcRenderer.invoke('db:getUsers'),
    getAuditLogs: (params) => ipcRenderer.invoke('db:getAuditLogs', params),
    addUser: (userData) => ipcRenderer.invoke('db:addUser', userData),
    updateUser: (id, userData) => ipcRenderer.invoke('db:updateUser', id, userData),
    deleteUser: (id) => ipcRenderer.invoke('db:deleteUser', id),

    // Chat
    getChatMessages: (limit) => ipcRenderer.invoke('db:getChatMessages', limit),
    sendChatMessage: (content) => ipcRenderer.invoke('db:sendChatMessage', content),
    deleteChatMessage: (messageId) => ipcRenderer.invoke('db:deleteChatMessage', messageId),
    deleteAllChatMessages: () => ipcRenderer.invoke('db:deleteAllChatMessages'),

    // Dialog & Printing
    showMessageBox: (options) => ipcRenderer.invoke('dialog:showMessageBox', options),
    printPreviewHTML: (options) => ipcRenderer.invoke('print:html', options),
    exportPDF: (options) => ipcRenderer.invoke('print:exportPDF', options),
    
    // New Flexible Printing System
    printInvoice: (payload) => ipcRenderer.invoke('print-invoice', payload),
    getPrinters: () => ipcRenderer.invoke('get-printers'),
    previewInvoice: (payload) => ipcRenderer.invoke('preview-invoice', payload),

    // WhatsApp (whatsapp-web.js)
    whatsappInitialize: () => ipcRenderer.invoke('whatsapp:initialize'),
    whatsappReset: () => ipcRenderer.invoke('whatsapp:reset'),
    whatsappGetStatus: () => ipcRenderer.invoke('whatsapp:getStatus'),
    whatsappDisconnect: () => ipcRenderer.invoke('whatsapp:disconnect'),
    whatsappGetOverdueCustomers: (params) => ipcRenderer.invoke('whatsapp:getOverdueCustomers', params),
    whatsappSendMessage: (params) => ipcRenderer.invoke('whatsapp:sendMessage', params),
    whatsappSendBulk: (params) => ipcRenderer.invoke('whatsapp:sendBulk', params),
    whatsappSendInvoiceImage: (params) => ipcRenderer.invoke('whatsapp:sendInvoiceImage', params),
    whatsappGetCustomerInvoices: (customerId) => ipcRenderer.invoke('whatsapp:getCustomerInvoices', customerId),
    whatsappCheckNumber: (phone) => ipcRenderer.invoke('whatsapp:checkNumber', phone),
    onWhatsappQR: (callback) => ipcRenderer.on('whatsapp:qr', (_event, qr) => callback(qr)),
    offWhatsappQR: () => ipcRenderer.removeAllListeners('whatsapp:qr'),
    onWhatsappReady: (callback) => ipcRenderer.on('whatsapp:ready', () => callback()),
    offWhatsappReady: () => ipcRenderer.removeAllListeners('whatsapp:ready'),
    onWhatsappDisconnected: (callback) => ipcRenderer.on('whatsapp:disconnected', (_event, reason) => callback(reason)),
    offWhatsappDisconnected: () => ipcRenderer.removeAllListeners('whatsapp:disconnected'),
    onWhatsappStatusChanged: (callback) => ipcRenderer.on('whatsapp:statusChanged', (_event, data) => callback(data)),
    offWhatsappStatusChanged: () => ipcRenderer.removeAllListeners('whatsapp:statusChanged'),
    onWhatsappBulkProgress: (callback) => ipcRenderer.on('whatsapp:bulkProgress', (_event, data) => callback(data)),
    offWhatsappBulkProgress: () => ipcRenderer.removeAllListeners('whatsapp:bulkProgress'),

    // AI Marketing
    aiMarketingGenerate: (payload) => ipcRenderer.invoke('ai-marketing:generate', payload),
    aiMarketingGetGroups: () => ipcRenderer.invoke('ai-marketing:getGroups'),
    aiMarketingSendToGroup: (payload) => ipcRenderer.invoke('ai-marketing:sendToGroup', payload),
    aiMarketingSendToNumbers: (payload) => ipcRenderer.invoke('ai-marketing:sendToNumbers', payload),
    aiMarketingGetSettings: () => ipcRenderer.invoke('ai-marketing:getSettings'),
    aiMarketingSaveSettings: (payload) => ipcRenderer.invoke('ai-marketing:saveSettings', payload),

    // App Exit
    onExitRequested: (callback) => ipcRenderer.on('app:request-close', () => callback()),
    offExitRequested: () => ipcRenderer.removeAllListeners('app:request-close'),
    confirmExit: (choice) => ipcRenderer.invoke('app:confirm-exit', choice)
});

contextBridge.exposeInMainWorld('licensing', {
    getStatus: () => ipcRenderer.invoke('licensing:getStatus'),
    activateFromJson: (licenseJsonText, options) => ipcRenderer.invoke('licensing:activateFromJson', licenseJsonText, options),
    remove: () => ipcRenderer.invoke('licensing:remove'),
    getDeviceFingerprint: () => ipcRenderer.invoke('licensing:getDeviceFingerprint')
});
