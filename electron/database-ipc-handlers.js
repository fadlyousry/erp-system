/**
 * Database IPC Handlers
 *
 * This module registers all IPC handlers that require dbService.
 * Accepts a `getDbService` function so handlers can be registered early
 * (before DB is ready) and will resolve dbService dynamically at call time.
 *
 * Usage:
 *   const { registerDatabaseIpcHandlers } = require('./database-ipc-handlers');
 *   registerDatabaseIpcHandlers(() => dbService);
 */

const { ipcMain } = require('electron');

function registerDatabaseIpcHandlers(getDbService) {
    // Helper to get dbService safely at call time
    const db = () => {
        const service = typeof getDbService === 'function' ? getDbService() : getDbService;
        if (!service) throw new Error('قاعدة البيانات غير جاهزة بعد. يرجى الانتظار.');
        return service;
    };

    // Permission enforcement helper
    // Uses the db() getter to access getCurrentSessionUser from the same
    // module instance that handles all other operations.  A separate
    // require('./db-service') was resolving to a stale or different module
    // instance in production builds (after obfuscation), causing
    // getCurrentSessionUser() to always return null and block every write.
    const requirePermission = (permissionKey) => {
        let user = null;
        try {
            const service = db();
            user = typeof service.getCurrentSessionUser === 'function'
                ? service.getCurrentSessionUser()
                : null;
        } catch {
            // DB service not ready yet
        }
        if (!user) return { error: 'يجب تسجيل الدخول أولاً.' };
        // ADMIN role always passes. Robust check for casing and ID 1 fallback.
        const roleName = String(user.role?.name || user.role || '').toUpperCase();
        if (roleName === 'ADMIN' || user.id === 1 || user.id === '1') return null;

        // Check permissions array
        if (Array.isArray(user.permissions) && user.permissions.includes(permissionKey)) return null;
        return { error: 'ليس لديك صلاحية لتنفيذ هذه العملية.' };
    };

    // Guarded handler: checks permission before executing
    const guarded = (permissionKey, handler) => async (...args) => {
        const denied = requirePermission(permissionKey);
        if (denied) return denied;
        return handler(...args);
    };

    // ==================== Auth (no guard) ====================
    ipcMain.handle('auth:login', async (event, credentials) => {
        return await db().login(credentials);
    });
    ipcMain.handle('auth:setCurrentUser', async (event, user) => {
        return await db().setCurrentSessionUser(user);
    });
    ipcMain.handle('auth:clearCurrentUser', async () => {
        return await db().clearCurrentSessionUser();
    });

    // ==================== Dashboard (no guard) ====================
    ipcMain.handle('db:getDashboardStats', async (event, token) => {
        return await db().getDashboardStats();
    });
    ipcMain.handle('db:getFinancialInsights', async () => {
        return await db().getFinancialInsights();
    });

    // ==================== Products ====================
    ipcMain.handle('db:getProducts', async (event, params) => {
        return await db().getProducts(params);
    });
    ipcMain.handle('db:getProduct', async (event, id) => {
        return await db().getProduct(id);
    });
    ipcMain.handle('db:addProduct', guarded('products:create', async (event, productData) => {
        return await db().addProduct(productData);
    }));
    ipcMain.handle('db:updateProduct', guarded('products:edit', async (event, id, productData) => {
        return await db().updateProduct(id, productData);
    }));
    ipcMain.handle('db:deleteProduct', guarded('products:delete', async (event, id) => {
        return await db().deleteProduct(id);
    }));
    ipcMain.handle('db:previewPriceUpdate', guarded('products:edit', async (event, params) => {
        return await db().previewPriceUpdate(params);
    }));
    ipcMain.handle('db:applyPriceUpdate', guarded('products:edit', async (event, params) => {
        return await db().applyPriceUpdate(params);
    }));
    ipcMain.handle('db:searchProducts', async (event, query) => {
        return await db().searchProducts(query);
    });

    // ==================== Categories ====================
    ipcMain.handle('db:getCategories', async () => {
        return await db().getCategories();
    });
    ipcMain.handle('db:addCategory', guarded('products:create', async (event, categoryData) => {
        return await db().addCategory(categoryData);
    }));
    ipcMain.handle('db:updateCategory', guarded('products:edit', async (event, id, categoryData) => {
        return await db().updateCategory(id, categoryData);
    }));
    ipcMain.handle('db:deleteCategory', guarded('products:delete', async (event, id) => {
        return await db().deleteCategory(id);
    }));

    // ==================== Inventory ====================
    ipcMain.handle('db:getInventory', async (event, productId) => {
        return await db().getInventory(productId);
    });
    ipcMain.handle('db:updateInventory', guarded('products:stock', async (event, productId, inventoryData) => {
        return await db().updateInventory(productId, inventoryData);
    }));

    // ==================== Warehouses ====================
    ipcMain.handle('db:getWarehouses', async () => {
        return await db().getWarehouses();
    });
    ipcMain.handle('db:getWarehouseInventory', async (event, warehouseId) => {
        return await db().getWarehouseInventory(warehouseId);
    });
    ipcMain.handle('db:reconcileWarehouseInventory', guarded('warehouses:manage', async (event, warehouseId, items) => {
        return await db().reconcileWarehouseInventory(warehouseId, items);
    }));
    ipcMain.handle('db:addWarehouse', guarded('warehouses:manage', async (event, warehouseData) => {
        return await db().addWarehouse(warehouseData);
    }));
    ipcMain.handle('db:updateWarehouse', guarded('warehouses:manage', async (event, id, warehouseData) => {
        return await db().updateWarehouse(id, warehouseData);
    }));
    ipcMain.handle('db:deleteWarehouse', guarded('warehouses:manage', async (event, id) => {
        return await db().deleteWarehouse(id);
    }));
    ipcMain.handle('db:getWarehouseStocks', async (event, productId) => {
        return await db().getWarehouseStocks(productId);
    });
    ipcMain.handle('db:updateWarehouseStock', guarded('warehouses:manage', async (event, productId, warehouseId, quantity) => {
        return await db().updateWarehouseStock(productId, warehouseId, quantity);
    }));
    ipcMain.handle('db:updateMultipleWarehouseStocks', guarded('warehouses:manage', async (event, productId, stocks) => {
        return await db().updateMultipleWarehouseStocks(productId, stocks);
    }));
    ipcMain.handle('db:updateVariantWarehouseStocks', guarded('warehouses:manage', async (event, productId, stocks) => {
        return await db().updateVariantWarehouseStocks(productId, stocks);
    }));
    ipcMain.handle('db:reconcileVariantInventoryStocks', guarded('warehouses:manage', async (event, productId) => {
        return await db().reconcileVariantInventoryStocks(productId);
    }));
    ipcMain.handle('db:transferProductBetweenWarehouses', guarded('warehouses:manage', async (event, productId, fromWarehouseId, toWarehouseId, quantity, notes, variantId) => {
        return await db().transferProductBetweenWarehouses(productId, fromWarehouseId, toWarehouseId, quantity, notes, variantId);
    }));
    ipcMain.handle('db:getWarehouseTransfers', async (event, productId, limit) => {
        return await db().getWarehouseTransfers(productId, limit);
    });
    ipcMain.handle('db:getInventoryValuation', async () => {
        return await db().getInventoryValuation();
    });
    ipcMain.handle('db:getLowStockReport', async () => {
        return await db().getLowStockReport();
    });
    ipcMain.handle('db:getStockMovementHistory', async (event, productId, warehouseId) => {
        return await db().getStockMovementHistory(productId, warehouseId);
    });

    // ==================== Variants ====================
    ipcMain.handle('db:getVariants', async () => {
        return await db().getVariants();
    });
    ipcMain.handle('db:addVariant', guarded('products:create', async (event, variantData) => {
        return await db().addVariant(variantData);
    }));
    ipcMain.handle('db:getProductHistory', async (event, variantId) => {
        return await db().getProductHistory(variantId);
    });
    ipcMain.handle('db:searchVariants', async (event, query) => {
        return await db().searchVariants(query);
    });
    ipcMain.handle('db:updateVariant', guarded('products:edit', async (event, id, variantData) => {
        return await db().updateVariant(id, variantData);
    }));
    ipcMain.handle('db:deleteVariant', guarded('products:delete', async (event, id) => {
        return await db().deleteVariant(id);
    }));

    // ==================== Sales ====================
    ipcMain.handle('db:getSales', async (event, options) => {
        return await db().getSales(options);
    });
    ipcMain.handle('db:getSaleById', async (event, saleId) => {
        return await db().getSaleById(saleId);
    });
    ipcMain.handle('db:createSale', guarded('pos:create', async (event, saleData) => {
        return await db().createSale(saleData);
    }));
    ipcMain.handle('db:deleteSale', guarded('sales:delete', async (event, saleId) => {
        return await db().deleteSale(saleId);
    }));
    ipcMain.handle('db:updateSale', guarded('sales:edit', async (event, saleId, saleData) => {
        return await db().updateSale(saleId, saleData);
    }));

    // ==================== Customers ====================
    ipcMain.handle('db:getCustomerStats', async (event, params) => {
        return await db().getCustomerStats(params);
    });
    ipcMain.handle('db:getCustomers', async (event, params) => {
        return await db().getCustomers(params);
    });
    ipcMain.handle('db:getCustomerLookup', async (event, params) => {
        return await db().getCustomerLookup(params);
    });
    ipcMain.handle('db:addCustomer', guarded('customers:manage', async (event, customerData) => {
        return await db().addCustomer(customerData);
    }));
    ipcMain.handle('db:updateCustomer', guarded('customers:manage', async (event, id, customerData) => {
        return await db().updateCustomer(id, customerData);
    }));
    ipcMain.handle('db:deleteCustomer', guarded('customers:manage', async (event, id) => {
        return await db().deleteCustomer(id);
    }));
    ipcMain.handle('db:getCustomer', async (event, id) => {
        return await db().getCustomer(id);
    });
    ipcMain.handle('db:getCustomerSales', async (event, customerId) => {
        return await db().getCustomerSales(customerId);
    });
    ipcMain.handle('db:getCustomerReturns', async (event, customerId) => {
        return await db().getCustomerReturns(customerId);
    });

    // ==================== Customer Payments ====================
    ipcMain.handle('db:addCustomerPayment', guarded('customers:payments', async (event, paymentData) => {
        return await db().addCustomerPayment(paymentData);
    }));
    ipcMain.handle('db:createCustomerPayment', guarded('customers:payments', async (event, paymentData) => {
        return await db().createCustomerPayment(paymentData || {});
    }));
    ipcMain.handle('db:previewCustomerPaymentAllocation', async (event, params) => {
        return await db().previewCustomerPaymentAllocation(params || {});
    });
    ipcMain.handle('db:getCustomerPayments', async (event, customerId) => {
        return await db().getCustomerPayments(customerId);
    });
    ipcMain.handle('db:updateCustomerPayment', guarded('customers:payments', async (event, paymentId, paymentData) => {
        return await db().updateCustomerPayment(paymentId, paymentData);
    }));
    ipcMain.handle('db:deleteCustomerPayment', guarded('customers:payments', async (event, paymentId) => {
        return await db().deleteCustomerPayment(paymentId);
    }));
    ipcMain.handle('db:rebuildCustomerFinancials', async (event, customerId) => {
        return await db().rebuildCustomerFinancials(customerId);
    });
    ipcMain.handle('db:rebuildAllCustomersFinancials', async (event, params) => {
        return await db().rebuildAllCustomersFinancials(params || {});
    });
    ipcMain.handle('db:checkCustomerFinancialsHealth', async () => {
        return await db().checkCustomerFinancialsHealth();
    });
    ipcMain.handle('db:getPaymentMethods', async () => {
        return await db().getPaymentMethods();
    });
    ipcMain.handle('db:getPaymentMethodStats', async () => {
        return await db().getPaymentMethodStats();
    });

    // ==================== Suppliers ====================
    ipcMain.handle('db:getSuppliers', async () => {
        return await db().getSuppliers();
    });
    ipcMain.handle('db:addSupplier', guarded('suppliers:manage', async (event, supplierData) => {
        return await db().addSupplier(supplierData);
    }));
    ipcMain.handle('db:updateSupplier', guarded('suppliers:manage', async (event, id, supplierData) => {
        return await db().updateSupplier(id, supplierData);
    }));
    ipcMain.handle('db:deleteSupplier', guarded('suppliers:manage', async (event, id) => {
        return await db().deleteSupplier(id);
    }));

    // ==================== Supplier Payments ====================
    ipcMain.handle('db:addSupplierPayment', guarded('suppliers:payments', async (event, paymentData) => {
        return await db().addSupplierPayment(paymentData);
    }));
    ipcMain.handle('db:getSupplierPayments', async (event, supplierId) => {
        return await db().getSupplierPayments(supplierId);
    });
    ipcMain.handle('db:updateSupplierPayment', guarded('suppliers:payments', async (event, paymentId, paymentData) => {
        return await db().updateSupplierPayment(paymentId, paymentData);
    }));
    ipcMain.handle('db:deleteSupplierPayment', guarded('suppliers:payments', async (event, paymentId) => {
        return await db().deleteSupplierPayment(paymentId);
    }));

    // ==================== Purchases ====================
    ipcMain.handle('db:getPurchases', async (event, options) => {
        return await db().getPurchases(options || {});
    });
    ipcMain.handle('db:getPurchaseById', async (event, purchaseId) => {
        return await db().getPurchaseById(purchaseId);
    });
    ipcMain.handle('db:createPurchase', guarded('purchases:create', async (event, purchaseData) => {
        return await db().createPurchase(purchaseData);
    }));
    ipcMain.handle('db:updatePurchase', guarded('purchases:create', async (event, purchaseId, purchaseData) => {
        return await db().updatePurchase(purchaseId, purchaseData || {});
    }));
    ipcMain.handle('db:deletePurchase', guarded('purchases:create', async (event, purchaseId) => {
        return await db().deletePurchase(purchaseId);
    }));

    // ==================== Returns ====================
    ipcMain.handle('db:getReturns', async (event, options) => {
        return await db().getReturns(options || {});
    });
    ipcMain.handle('db:getReturnById', async (event, returnId) => {
        return await db().getReturnById(returnId);
    });
    ipcMain.handle('db:createReturn', guarded('returns:create', async (event, returnData) => {
        return await db().createReturn(returnData);
    }));
    ipcMain.handle('db:updateReturn', guarded('returns:create', async (event, returnId, returnData) => {
        return await db().updateReturn(returnId, returnData || {});
    }));
    ipcMain.handle('db:deleteReturn', guarded('returns:create', async (event, returnId) => {
        return await db().deleteReturn(returnId);
    }));

    // ==================== Purchase Returns ====================
    ipcMain.handle('db:getPurchaseReturns', async (event, options) => {
        return await db().getPurchaseReturns(options || {});
    });
    ipcMain.handle('db:getPurchaseReturnById', async (event, returnId) => {
        return await db().getPurchaseReturnById(returnId);
    });
    ipcMain.handle('db:createPurchaseReturn', guarded('returns:create', async (event, returnData) => {
        return await db().createPurchaseReturn(returnData);
    }));
    ipcMain.handle('db:updatePurchaseReturn', guarded('returns:create', async (event, returnId, returnData) => {
        return await db().updatePurchaseReturn(returnId, returnData || {});
    }));
    ipcMain.handle('db:deletePurchaseReturn', guarded('returns:create', async (event, returnId) => {
        return await db().deletePurchaseReturn(returnId);
    }));

    // ==================== Expenses ====================
    ipcMain.handle('db:getExpenses', async (event, params) => {
        return await db().getExpenses(params || {});
    });
    ipcMain.handle('db:addExpense', guarded('expenses:manage', async (event, expenseData) => {
        return await db().addExpense(expenseData);
    }));
    ipcMain.handle('db:updateExpense', guarded('expenses:manage', async (event, id, expenseData) => {
        return await db().updateExpense(id, expenseData);
    }));
    ipcMain.handle('db:deleteExpense', guarded('expenses:manage', async (event, id) => {
        return await db().deleteExpense(id);
    }));

    // ==================== Expense Categories ====================
    ipcMain.handle('db:getExpenseCategories', async () => {
        return await db().getExpenseCategories();
    });
    ipcMain.handle('db:addExpenseCategory', guarded('expenses:manage', async (event, data) => {
        return await db().addExpenseCategory(data);
    }));
    ipcMain.handle('db:updateExpenseCategory', guarded('expenses:manage', async (event, id, data) => {
        return await db().updateExpenseCategory(id, data);
    }));

    // ==================== Treasury ====================
    ipcMain.handle('db:getTreasuries', async () => {
        return await db().getTreasuries();
    });
    ipcMain.handle('db:createTreasury', guarded('treasury:manage', async (event, treasuryData) => {
        return await db().createTreasury(treasuryData);
    }));
    ipcMain.handle('db:updateTreasury', guarded('treasury:manage', async (event, id, treasuryData) => {
        return await db().updateTreasury(id, treasuryData);
    }));
    ipcMain.handle('db:setDefaultTreasury', guarded('treasury:manage', async (event, id, options) => {
        return await db().setDefaultTreasury(id, options || {});
    }));
    ipcMain.handle('db:deleteTreasury', guarded('treasury:manage', async (event, id, options) => {
        return await db().deleteTreasury(id, options || {});
    }));
    ipcMain.handle('db:createTreasuryTransaction', guarded('treasury:transactions', async (event, transactionData) => {
        return await db().createTreasuryTransaction(transactionData);
    }));
    ipcMain.handle('db:createDepositReceipt', guarded('treasury:transactions', async (event, params) => {
        return await db().createDepositReceipt(params || {});
    }));
    ipcMain.handle('db:applyDepositToSale', guarded('treasury:transactions', async (event, params) => {
        return await db().applyDepositToSale(params || {});
    }));
    ipcMain.handle('db:refundDeposit', guarded('treasury:transactions', async (event, params) => {
        return await db().refundDeposit(params || {});
    }));
    ipcMain.handle('db:getTreasuryEntries', async (event, params) => {
        return await db().getTreasuryEntries(params || {});
    });
    ipcMain.handle('db:getPaymentMethodReport', async (event, params) => {
        return await db().getPaymentMethodReport(params || {});
    });
    ipcMain.handle('db:getDailyRevenueReport', async (event, params) => {
        return await db().getDailyRevenueReport(params || {});
    });
    ipcMain.handle('db:getSoldItemsReport', guarded('reports:view', async (event, params) => {
        return await db().getSoldItemsReport(params || {});
    }));
    ipcMain.handle('db:getItemMovementReport', guarded('reports:view', async (event, params) => {
        return await db().getItemMovementReport(params || {});
    }));
    ipcMain.handle('db:getProfitReport', guarded('reports:view', async (event, params) => {
        return await db().getProfitReport(params || {});
    }));
    ipcMain.handle('db:getSeasonReport', guarded('reports:view', async (event, params) => {
        return await db().getSeasonReport(params || {});
    }));

    // ==================== Roles & Permissions ====================
    ipcMain.handle('db:getRoles', async () => {
        return await db().getRoles();
    });
    ipcMain.handle('db:addRole', guarded('roles:manage', async (event, roleData) => {
        return await db().addRole(roleData);
    }));
    ipcMain.handle('db:updateRole', guarded('roles:manage', async (event, id, roleData) => {
        return await db().updateRole(id, roleData);
    }));
    ipcMain.handle('db:deleteRole', guarded('roles:manage', async (event, id) => {
        return await db().deleteRole(id);
    }));
    ipcMain.handle('db:getPermissions', async () => {
        return await db().getPermissions();
    });

    // ==================== Users ====================
    ipcMain.handle('db:getUsers', async () => {
        return await db().getUsers();
    });
    ipcMain.handle('db:getAuditLogs', async (event, params) => {
        return await db().getAuditLogs(params || {});
    });
    ipcMain.handle('db:addUser', guarded('users:manage', async (event, userData) => {
        return await db().addUser(userData);
    }));
    ipcMain.handle('db:updateUser', guarded('users:manage', async (event, id, userData) => {
        return await db().updateUser(id, userData);
    }));
    ipcMain.handle('db:deleteUser', guarded('users:manage', async (event, id) => {
        return await db().deleteUser(id);
    }));

    // ==================== Chat ====================
    ipcMain.handle('db:getChatMessages', async (event, limit) => {
        return await db().getChatMessages(limit);
    });
    ipcMain.handle('db:sendChatMessage', async (event, content) => {
        return await db().sendChatMessage(content);
    });
    ipcMain.handle('db:deleteChatMessage', async (event, messageId) => {
        return await db().deleteChatMessage(messageId);
    });
    ipcMain.handle('db:deleteAllChatMessages', async (event) => {
        return await db().deleteAllChatMessages();
    });

    // ==================== WhatsApp (whatsapp-web.js) ====================
    const { getWhatsAppService, normalizePhoneNumber, buildCustomerMessage, sleep, RATE_LIMIT_DELAY_MS } = require('./whatsapp-service');
    const { BrowserWindow } = require('electron');
    const { app } = require('electron');
    const path = require('path');

    const getSessionPath = () => {
        try {
            return path.join(app.getPath('userData'), 'whatsapp-session');
        } catch {
            return path.join(process.cwd(), '.whatsapp-session');
        }
    };

    ipcMain.handle('whatsapp:initialize', async (event) => {
        try {
            const wa = getWhatsAppService();
            const sessionPath = getSessionPath();

            // Wire up events to send to renderer
            wa.on('qr', (qrDataUrl) => {
                if (event?.sender && !event.sender.isDestroyed()) {
                    event.sender.send('whatsapp:qr', qrDataUrl);
                }
            });

            wa.on('ready', () => {
                if (event?.sender && !event.sender.isDestroyed()) {
                    event.sender.send('whatsapp:ready');
                }
            });

            wa.on('disconnected', (reason) => {
                if (event?.sender && !event.sender.isDestroyed()) {
                    event.sender.send('whatsapp:disconnected', reason);
                }
            });

            wa.on('status', (statusObj) => {
                if (event?.sender && !event.sender.isDestroyed()) {
                    event.sender.send('whatsapp:statusChanged', statusObj);
                }
            });

            const result = await wa.initialize(sessionPath);
            return result;
        } catch (error) {
            console.error('[whatsapp:initialize] Error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('whatsapp:getStatus', async () => {
        return getWhatsAppService().getStatus();
    });

    ipcMain.handle('whatsapp:disconnect', async () => {
        try {
            await getWhatsAppService().disconnect();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
    
    ipcMain.handle('whatsapp:reset', async (event) => {
        try {
            const wa = getWhatsAppService();
            const sessionPath = getSessionPath();
            
            // Re-bind events to ensure they reach the current sender
            wa.on('qr', (qrDataUrl) => {
                if (event?.sender && !event.sender.isDestroyed()) {
                    event.sender.send('whatsapp:qr', qrDataUrl);
                }
            });
            wa.on('ready', () => {
                if (event?.sender && !event.sender.isDestroyed()) {
                    event.sender.send('whatsapp:ready');
                }
            });
            wa.on('disconnected', (reason) => {
                if (event?.sender && !event.sender.isDestroyed()) {
                    event.sender.send('whatsapp:disconnected', reason);
                }
            });
            wa.on('status', (statusObj) => {
                if (event?.sender && !event.sender.isDestroyed()) {
                    event.sender.send('whatsapp:statusChanged', statusObj);
                }
            });

            return await wa.reset(sessionPath);
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('whatsapp:getOverdueCustomers', async (event, params = {}) => {
        try {
            return await db().getWhatsAppOverdueCustomers(params);
        } catch (error) {
            console.error('[whatsapp:getOverdueCustomers] Error:', error);
            return { error: error.message };
        }
    });

    ipcMain.handle('whatsapp:sendMessage', async (event, params = {}) => {
        const { customerId, customerName, phoneNumber, message } = params;
        const wa = getWhatsAppService();

        if (!wa.getStatus().isConnected) {
            return { success: false, error: 'واتساب غير متصل. يرجى مسح QR Code أولاً.' };
        }

        if (!phoneNumber) {
            return { success: false, error: 'رقم الهاتف مطلوب.' };
        }

        if (!message) {
            return { success: false, error: 'نص الرسالة مطلوب.' };
        }

        const result = await wa.sendTextMessage(phoneNumber, message);
        if (result?.success) {
            await db().logWhatsAppMessage({ customerId: String(customerId), messageType: 'TEXT', message, success: true });
        }
        return { ...result, customerId, customerName };
    });

    ipcMain.handle('whatsapp:checkNumber', async (event, phone) => {
        const wa = getWhatsAppService();
        return await wa.checkNumber(phone);
    });

    // ── Invoice Image Generation & Sending ──────────────────────────
    ipcMain.handle('whatsapp:sendInvoiceImage', async (event, params = {}) => {
        const { docId, docType, phoneNumber, customerName } = params;
        const wa = getWhatsAppService();

        if (!wa.getStatus().isConnected) {
            return { success: false, error: 'واتساب غير متصل.' };
        }

        if (!docId || !phoneNumber) {
            return { success: false, error: 'رقم المستند ورقم الهاتف مطلوبين.' };
        }

        try {
            let docHtml = '';
            let caption = '';
            let customerIdToLog = '';

            if (docType === 'PAYMENT') {
                const payment = await db().getCustomerPaymentById(docId);
                if (payment?.error) return { success: false, error: payment.error };
                docHtml = buildReceiptHtml(payment);
                caption = `إذن دفع رقم #${docId} - ${customerName || payment.customer?.name || ''}`;
                customerIdToLog = payment.customerId;
            } else {
                const sale = await db().getSaleById(docId);
                if (sale?.error) return { success: false, error: sale.error };
                docHtml = buildInvoiceHtml(sale);
                caption = `فاتورة رقم #${docId} - ${customerName || sale.customer?.name || ''}`;
                customerIdToLog = sale.customerId;
            }

            // 3. Capture as image using hidden BrowserWindow
            const base64Image = await captureHtmlAsImage(docHtml);
            if (!base64Image) {
                return { success: false, error: 'فشل في تحويل المستند لصورة.' };
            }

            // 4. Send via WhatsApp
            const result = await wa.sendImageMessage(phoneNumber, base64Image, caption);
            if (result?.success && customerIdToLog) {
                await db().logWhatsAppMessage({ customerId: String(customerIdToLog), messageType: 'IMAGE', message: caption, success: true });
            }
            return result;
        } catch (error) {
            console.error('[whatsapp:sendInvoiceImage] Error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('whatsapp:getCustomerInvoices', async (event, customerId) => {
        try {
            const [salesRes, paymentsRes] = await Promise.all([
                db().getCustomerSales(customerId),
                db().getCustomerPayments(customerId)
            ]);

            const sales = Array.isArray(salesRes) ? salesRes : (salesRes?.data || []);
            const payments = Array.isArray(paymentsRes) ? paymentsRes : (paymentsRes?.data || []);

            const combined = [
                ...sales.map(s => ({ ...s, type: 'SALE', _sortDate: new Date(s.invoiceDate).getTime() })),
                ...payments.map(p => ({ ...p, type: 'PAYMENT', _sortDate: new Date(p.paymentDate).getTime(), total: p.amount }))
            ];

            combined.sort((a, b) => b._sortDate - a._sortDate);

            return { data: combined.slice(0, 30) }; // Last 30 transactions
        } catch (error) {
            return { error: error.message };
        }
    });

    // ── Bulk Send ───────────────────────────────────────────────────
    ipcMain.handle('whatsapp:sendBulk', async (event, params = {}) => {
        const { customers, messageTemplate } = params;
        const wa = getWhatsAppService();

        if (!wa.getStatus().isConnected) {
            return { error: 'واتساب غير متصل.' };
        }

        if (!Array.isArray(customers) || customers.length === 0) {
            return { error: 'لا يوجد عملاء للإرسال.' };
        }

        if (!messageTemplate) {
            return { error: 'نص الرسالة مطلوب.' };
        }

        const results = [];
        let sentCount = 0;
        let failedCount = 0;

        for (let i = 0; i < customers.length; i++) {
            const customer = customers[i];
            const phone = customer.phone || customer.phone2;

            if (!phone) {
                results.push({ customerId: customer.id, customerName: customer.name, success: false, error: 'لا يوجد رقم هاتف' });
                failedCount++;
                continue;
            }

            const personalMessage = buildCustomerMessage(customer, messageTemplate);
            const result = await wa.sendTextMessage(phone, personalMessage);

            results.push({
                customerId: customer.id,
                customerName: customer.name,
                phoneNumber: normalizePhoneNumber(phone),
                ...result
            });

            if (result.success) { sentCount++; } else { failedCount++; }

            // Progress update
            if (event?.sender && !event.sender.isDestroyed()) {
                event.sender.send('whatsapp:bulkProgress', {
                    current: i + 1,
                    total: customers.length,
                    sentCount,
                    failedCount,
                    lastCustomer: customer.name,
                    lastResult: result.success
                });
            }

            // Rate limiting
            if (i < customers.length - 1) {
                await sleep(RATE_LIMIT_DELAY_MS);
            }
        }

        return {
            success: true,
            results,
            summary: { total: customers.length, sent: sentCount, failed: failedCount }
        };
    });

    // ── Helper: Build Invoice HTML ──────────────────────────────────
    function buildInvoiceHtml(sale) {
        const items = (sale.items || []).map((item, idx) => {
            const name = item.variant?.product?.name || 'منتج';
            const variant = item.variant ? `${item.variant.productSize || ''} ${item.variant.color || ''}`.trim() : '';
            const displayName = variant ? `${name} (${variant})` : name;
            return `<tr>
                <td>${idx + 1}</td>
                <td>${displayName}</td>
                <td>${item.quantity}</td>
                <td>${Number(item.price || 0).toFixed(2)}</td>
                <td>${(Number(item.quantity || 0) * Number(item.price || 0)).toFixed(2)}</td>
            </tr>`;
        }).join('');

        const customerName = sale.customer?.name || 'عميل نقدي';
        const saleDate = sale.invoiceDate ? new Date(sale.invoiceDate).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
        const paymentMethod = sale.payment || sale.saleType || 'نقدي';

        const paid = Number(sale.paid || 0);
        const total = Number(sale.total || 0);
        const discount = Number(sale.discount || 0);
        const taxAmount = Number(sale.taxAmount || 0);
        const remaining = total - paid;
        const currentBalance = Number(sale.customer?.balance || 0);
        const previousBalance = currentBalance - remaining;

        return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;800&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', sans-serif; }
body { background: #f8fafc; padding: 24px; width: 650px; color: #1e293b; }
.invoice-card { background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }
.header { background: linear-gradient(135deg, #0ea5e9, #2563eb); color: #fff; padding: 20px; text-align: center; }
.header h1 { font-size: 24px; font-weight: 800; margin-bottom: 4px; }
.header p { font-size: 14px; opacity: 0.9; }
.content { padding: 24px; }
.meta { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; }
.meta div { padding: 10px 14px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-weight: 700; color: #475569; }
.meta div span { color: #0ea5e9; margin-right: 4px; font-weight: 800; }
table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
th { background: #f1f5f9; padding: 12px; text-align: right; font-weight: 800; color: #334155; border-bottom: 2px solid #e2e8f0; }
td { padding: 12px; border-bottom: 1px solid #f1f5f9; font-weight: 700; color: #0f172a; }
tr:last-child td { border-bottom: none; }
.summary-container { display: flex; gap: 20px; }
.totals-box { flex: 1; background: #f8fafc; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0; }
.balances-box { flex: 1; background: #ecfdf5; padding: 16px; border-radius: 12px; border: 2px dashed #10b981; }
.row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 15px; font-weight: 700; color: #475569; }
.row span:last-child { color: #0f172a; }
.total-row { font-size: 18px; font-weight: 800; color: #0ea5e9; border-top: 2px solid #e2e8f0; padding-top: 10px; margin-top: 6px; }
.paid-row { color: #10b981; font-size: 16px; }
.paid-row span:last-child { color: #10b981; }
.rem-row { color: #ef4444; font-size: 16px; }
.rem-row span:last-child { color: #ef4444; }
.bal-title { font-size: 16px; font-weight: 800; color: #065f46; margin-bottom: 12px; border-bottom: 1px solid #a7f3d0; padding-bottom: 8px; text-align: center; }
.footer { text-align: center; padding: 16px; background: #f8fafc; font-size: 13px; font-weight: 700; color: #64748b; border-top: 1px dashed #cbd5e1; }
</style></head>
<body>
<div class="invoice-card">
    <div class="header">
        <h1>فاتورة مبيعات</h1>
        <p>رقم الفاتورة: #${sale.id}</p>
    </div>
    <div class="content">
        <div class="meta">
            <div>العميل: <span>${customerName}</span></div>
            <div>التاريخ: <span>${saleDate}</span></div>
            <div>الدفع: <span>${paymentMethod}</span></div>
        </div>
        <table>
            <thead><tr><th>#</th><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
            <tbody>${items}</tbody>
        </table>
        
        <div class="summary-container">
            <div class="totals-box">
                ${discount > 0 ? `<div class="row"><span>الخصم:</span><span>${discount.toFixed(2)} ج.م</span></div>` : ''}
                ${taxAmount > 0 ? `<div class="row"><span>الضريبة:</span><span>${taxAmount.toFixed(2)} ج.م</span></div>` : ''}
                <div class="row total-row"><span>إجمالي الفاتورة:</span><span>${total.toFixed(2)} ج.م</span></div>
                <div class="row paid-row"><span>المدفوع:</span><span>${paid.toFixed(2)} ج.م</span></div>
                <div class="row rem-row"><span>المتبقي من الفاتورة:</span><span>${remaining.toFixed(2)} ج.م</span></div>
            </div>
            ${sale.customer ? `
            <div class="balances-box">
                <div class="bal-title">موقف حساب العميل</div>
                <div class="row"><span>الرصيد السابق:</span><span>${previousBalance.toFixed(2)} ج.م</span></div>
                <div class="row"><span>الرصيد الحالي:</span><span style="color: #059669; font-weight: 800;">${currentBalance.toFixed(2)} ج.م</span></div>
            </div>
            ` : ''}
        </div>
    </div>
    <div class="footer">شكراً لتعاملكم معنا 🙏</div>
</div>
</body></html>`;
    }

    function buildReceiptHtml(payment) {
        const customerName = payment.customer?.name || 'غير محدد';
        const paymentDate = payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '';
        
        const paidAmount = Number(payment.amount || 0);
        const remainingBalance = Number(payment.customer?.balance || 0);
        const previousBalance = remainingBalance + paidAmount;

        const formatNum = (num) => Number(num).toLocaleString('en-US');

        return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;800&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', sans-serif; }
body { background: #f8fafc; padding: 24px; width: 450px; color: #1e293b; }
.receipt-card { background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }
.header { background: linear-gradient(135deg, #0ea5e9, #2563eb); color: #fff; padding: 24px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.header svg { width: 54px; height: 54px; fill: #fff; margin-bottom: 4px; }
.header h1 { font-size: 26px; font-weight: 800; margin: 0; letter-spacing: 1px; line-height: 1; }
.header p { font-size: 16px; font-weight: 700; opacity: 0.9; margin: 0; }
.title-bar { background: #f1f5f9; padding: 14px; text-align: center; border-bottom: 2px solid #e2e8f0; }
.title-bar h2 { font-size: 24px; color: #1e293b; font-weight: 800; margin: 0; }
.content { padding: 24px 20px; }
.table { width: 100%; border-collapse: separate; border-spacing: 0; border: 2px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
.table tr { border-bottom: 1px solid #e2e8f0; }
.table tr:last-child td, .table tr:last-child th { border-bottom: none; }
.table td, .table th { padding: 14px 16px; font-size: 18px; border-bottom: 1px solid #e2e8f0; }
.table th { background: #f8fafc; text-align: right; font-weight: 800; color: #475569; width: 40%; border-left: 2px solid #e2e8f0; }
.table td { background: #fff; font-weight: 700; color: #0f172a; text-align: center; }
.table .amount { color: #0f172a; }
.table .paid-amount { color: #10b981; font-weight: 800; font-size: 20px; }
.table .rem-amount { color: #ef4444; font-weight: 800; font-size: 20px; }
.footer { background: #f8fafc; padding: 20px; text-align: center; border-top: 2px dashed #cbd5e1; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.footer-content { display: flex; align-items: center; justify-content: center; gap: 12px; }
.qr-placeholder { width: 64px; height: 64px; }
.footer-text { text-align: left; }
.footer-text p { font-size: 16px; font-weight: 800; color: #334155; margin: 0; }
.footer-text span { font-size: 14px; color: #64748b; font-weight: 700; }
</style>
</head>
<body>
<div class="receipt-card">
    <div class="header">
        <svg viewBox="0 0 24 24"><path d="M20.37 8.38l-2.07-2.67C17.9 5.2 17.38 5 16.8 5H14c0-1.1-.9-2-2-2s-2 .9-2 2H7.2c-.58 0-1.1.2-1.5.71L3.63 8.38c-.35.45-.48 1.05-.33 1.6l1.24 4.36c.16.56.66.96 1.24.96H7v6c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2v-6h1.22c.58 0 1.08-.4 1.24-.96l1.24-4.36c.15-.55.02-1.15-.33-1.6z"/></svg>
        <h1>ELYOUSR</h1>
        <p>للملابس الجاهزة</p>
    </div>
    <div class="title-bar">
        <h2>دفع قسط</h2>
    </div>
    <div class="content">
        <table class="table">
            <tr>
                <th>التاريخ</th>
                <td>${paymentDate}</td>
            </tr>
            <tr>
                <th>إسم العميل</th>
                <td>${customerName}</td>
            </tr>
            <tr>
                <th>الرصيد السابق</th>
                <td class="amount">${formatNum(previousBalance)}</td>
            </tr>
            <tr>
                <th>المدفوع</th>
                <td class="paid-amount">${formatNum(paidAmount)}</td>
            </tr>
            <tr>
                <th>المتبقى</th>
                <td class="rem-amount">${formatNum(remainingBalance)}</td>
            </tr>
        </table>
    </div>
    <div class="footer">
        <div class="footer-content">
            <svg class="qr-placeholder" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><path d="M6 6h.01M17 6h.01M17 17h.01M6 17h.01M10 10h4v4h-4z"></path></svg>
            <div class="footer-text">
                <p>Scan QR</p>
                <span>وتابعنا علي FaceBook</span>
            </div>
        </div>
    </div>
</div>
</body>
</html>`;
    }

    // ── Helper: Capture HTML as Image ───────────────────────────────
    function captureHtmlAsImage(html) {
        return new Promise((resolve) => {
            try {
                const win = new BrowserWindow({
                    width: 650,
                    height: 900,
                    show: false,
                    webPreferences: { nodeIntegration: false, contextIsolation: true }
                });

                win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

                win.webContents.on('did-finish-load', async () => {
                    try {
                        // Wait a bit for fonts to load
                        await sleep(500);
                        const image = await win.webContents.capturePage();
                        const pngBuffer = image.toPNG();
                        const base64 = pngBuffer.toString('base64');
                        win.close();
                        resolve(base64);
                    } catch (err) {
                        console.error('[captureHtmlAsImage] Capture error:', err);
                        win.close();
                        resolve(null);
                    }
                });

                // Timeout safety
                setTimeout(() => {
                    if (!win.isDestroyed()) {
                        win.close();
                    }
                    resolve(null);
                }, 10000);
            } catch (err) {
                console.error('[captureHtmlAsImage] Error:', err);
                resolve(null);
            }
        });
    }

    // ==================== Coupons ====================
    ipcMain.handle('db:getCoupons', async () => {
        return await db().getCoupons();
    });
    ipcMain.handle('db:addCoupon', guarded('settings:view', async (event, couponData) => {
        return await db().addCoupon(couponData);
    }));
    ipcMain.handle('db:updateCoupon', guarded('settings:view', async (event, id, couponData) => {
        return await db().updateCoupon(id, couponData);
    }));
    ipcMain.handle('db:deleteCoupon', guarded('settings:view', async (event, id) => {
        return await db().deleteCoupon(id);
    }));
    ipcMain.handle('db:validateCoupon', async (event, code, orderTotal) => {
        return await db().validateCoupon(code, orderTotal);
    });

    console.log('[database-ipc-handlers] ✓ Database IPC handlers registered successfully (with permission enforcement)');
}

module.exports = { registerDatabaseIpcHandlers };
