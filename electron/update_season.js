const fs = require('fs');

const path = 'd:\\erp-new\\erp system\\erp-desktop\\electron\\db-service.js';
let content = fs.readFileSync(path, 'utf8');

const updatedFunction = `
    async getSeasonReport(params = {}) {
        try {
            const { from, to } = resolveReportRange(params);
            const supplierId = parsePositiveInt(params?.supplierId);
            
            // 1. Purchases (Net Capital)
            const purchaseWhere = { createdAt: { gte: from, lte: to } };
            if (supplierId) purchaseWhere.supplierId = supplierId;

            const purchases = await prisma.purchase.findMany({
                where: purchaseWhere,
                include: { items: true }
            });

            // If a specific supplier is selected, we track ONLY their variants for sales & stock
            let supplierVariantIds = null;
            if (supplierId) {
                const vSet = new Set();
                purchases.forEach(p => {
                    p.items.forEach(i => vSet.add(i.variantId));
                });
                supplierVariantIds = Array.from(vSet);
            }

            const purchaseReturnsWhere = { createdAt: { gte: from, lte: to } };
            if (supplierId) purchaseReturnsWhere.supplierId = supplierId;

            const purchaseReturns = await prisma.purchaseReturn.findMany({
                where: purchaseReturnsWhere
            });
            
            const totalPurchases = purchases.reduce((sum, p) => sum + (p.total || 0), 0);
            const totalShipping = purchases.reduce((sum, p) => sum + (p.expensesTotal || 0), 0);
            const totalPurchaseReturns = purchaseReturns.reduce((sum, r) => sum + (r.total || 0), 0);
            const netPurchases = totalPurchases + totalShipping - totalPurchaseReturns;

            // 2. Sales & COGS
            // We fetch all sales in the period. If supplierId is specified, we ONLY count the items belonging to that supplier.
            const sales = await prisma.sale.findMany({
                where: { invoiceDate: { gte: from, lte: to } },
                include: { items: { include: { variant: true } } }
            });
            
            // For sale returns, we need items too to filter by supplier. 
            // In the DB, 'Return' has 'items' (ReturnItem)
            const saleReturns = await prisma.return.findMany({
                where: { createdAt: { gte: from, lte: to } },
                include: { items: true }
            });

            let cashSales = 0;
            let creditSales = 0;
            let totalSalesDiscount = 0;
            let totalCOGS = 0;
            let supplierItemsRevenue = 0;

            sales.forEach(sale => {
                let invoiceHasSupplierItem = false;
                let invoiceSupplierRevenue = 0;

                sale.items.forEach(item => {
                    const isSupplierItem = supplierVariantIds === null || supplierVariantIds.includes(item.variantId);
                    if (isSupplierItem) {
                        invoiceHasSupplierItem = true;
                        const cost = Number(item.variant.cost) || 0;
                        totalCOGS += (cost * item.quantity);
                        
                        // proportional discount (approximate) or specific item discount
                        // In SaleItem, price is usually net or gross. The 'price' in SaleItem is the final price.
                        // Wait, SaleItem has price, quantity, discount.
                        const itemRevenue = (Number(item.price) * item.quantity) - Number(item.discount || 0);
                        supplierItemsRevenue += itemRevenue;
                        totalSalesDiscount += Number(item.discount || 0);
                    }
                });

                if (supplierVariantIds === null) {
                    if (sale.saleType === 'نقدي') cashSales += sale.total;
                    else if (sale.saleType === 'آجل') creditSales += sale.total;
                    totalSalesDiscount += Number(sale.discount || 0);
                } else {
                    // For specific supplier, we just attribute the item revenue to either cash or credit proportionally or totally.
                    // For simplicity, if the invoice is credit, the item revenue is credit.
                    if (sale.saleType === 'نقدي') cashSales += invoiceSupplierRevenue;
                    else if (sale.saleType === 'آجل') creditSales += invoiceSupplierRevenue;
                }
            });

            // If we are filtering by supplier, the total revenue is exactly supplierItemsRevenue, and we split it into cash/credit based on the invoice type.
            if (supplierVariantIds !== null) {
                cashSales = 0;
                creditSales = 0;
                sales.forEach(sale => {
                    let invoiceSupplierRevenue = 0;
                    sale.items.forEach(item => {
                        if (supplierVariantIds.includes(item.variantId)) {
                            invoiceSupplierRevenue += (Number(item.price) * item.quantity) - Number(item.discount || 0);
                            // approximate invoice-level discount
                            if (sale.discount > 0 && sale.total > 0) {
                                const prop = invoiceSupplierRevenue / (sale.total + sale.discount);
                                invoiceSupplierRevenue -= (sale.discount * prop);
                            }
                        }
                    });
                    if (sale.saleType === 'نقدي') cashSales += invoiceSupplierRevenue;
                    else if (sale.saleType === 'آجل') creditSales += invoiceSupplierRevenue;
                });
            }

            let totalSaleReturns = 0;
            saleReturns.forEach(ret => {
                if (supplierVariantIds === null) {
                    totalSaleReturns += ret.total;
                } else {
                    ret.items.forEach(item => {
                        if (supplierVariantIds.includes(item.variantId)) {
                            totalSaleReturns += (Number(item.price) * item.quantity);
                        }
                    });
                }
            });

            const netSales = cashSales + creditSales - totalSaleReturns;
            const grossProfit = netSales - totalCOGS;

            // 3. Customer Payments & Balances
            const customerPayments = await prisma.customerPayment.findMany({
                where: { paymentDate: { gte: from, lte: to } },
                include: { customer: true }
            });
            let totalPaymentsReceived = 0;
            
            if (supplierVariantIds === null) {
                totalPaymentsReceived = customerPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
            } else {
                // Approximate payments received for this supplier's goods
                // This is mathematically impossible to track exactly without strict invoice-to-payment allocation
                // We will use a proportional approach or just hide it? 
                // Best is to assume payments are proportional to the credit sales of this supplier.
                const totalCreditSalesAll = sales.reduce((sum, s) => s.saleType === 'آجل' ? sum + s.total : sum, 0);
                if (totalCreditSalesAll > 0) {
                    totalPaymentsReceived = customerPayments.reduce((sum, p) => sum + (p.amount || 0), 0) * (creditSales / totalCreditSalesAll);
                }
            }

            const pendingBalances = creditSales - totalPaymentsReceived;

            const allCustomers = await prisma.customer.findMany({
                where: { balance: { gt: 0 } },
                select: { id: true, name: true, balance: true }
            });
            const topOweCustomers = allCustomers.sort((a, b) => Number(b.balance) - Number(a.balance)).slice(0, 10);

            // 4. Remaining Stock
            const stockWhere = { quantity: { gt: 0 } };
            if (supplierVariantIds !== null) {
                stockWhere.variantId = { in: supplierVariantIds };
            }
            const stock = await prisma.warehouseStock.findMany({
                where: stockWhere,
                include: { variant: { include: { product: true } } }
            });

            let totalStockCost = 0;
            let totalStockValue = 0;
            const topStockItems = [];
            
            stock.forEach(s => {
                const qty = s.quantity;
                const cost = Number(s.variant.cost) || 0;
                const price = Number(s.variant.price) || 0;
                
                const itemCostTotal = qty * cost;
                totalStockCost += itemCostTotal;
                totalStockValue += (qty * price);

                topStockItems.push({
                    id: s.variantId,
                    name: s.variant.product.name + (s.variant.size ? \` - \${s.variant.size}\` : '') + (s.variant.color ? \` - \${s.variant.color}\` : ''),
                    quantity: qty,
                    totalCost: itemCostTotal
                });
            });
            topStockItems.sort((a, b) => b.totalCost - a.totalCost);

            // 5. Operating Expenses
            let totalExpenses = 0;
            const expensesList = [];
            
            if (supplierVariantIds === null) {
                const expenses = await prisma.expense.findMany({
                    where: { expenseDate: { gte: from, lte: to } },
                    include: { category: true }
                });
                totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
                
                const expensesByCategory = {};
                expenses.forEach(e => {
                    const catName = e.category?.name || 'أخرى';
                    expensesByCategory[catName] = (expensesByCategory[catName] || 0) + e.amount;
                });
                for (const [name, total] of Object.entries(expensesByCategory)) {
                    expensesList.push({ name, total });
                }
                expensesList.sort((a, b) => b.total - a.total);
            }

            // Calculate Final Position
            const totalAssets = cashSales + totalPaymentsReceived + pendingBalances + totalStockCost;
            const netPosition = totalAssets - netPurchases - totalExpenses;

            return {
                summary: {
                    totalPurchases,
                    totalShipping,
                    totalPurchaseReturns,
                    netPurchases,

                    cashSales,
                    creditSales,
                    totalSaleReturns,
                    totalSalesDiscount,
                    totalCOGS,
                    grossProfit,

                    totalPaymentsReceived,
                    pendingBalances,

                    totalStockCost,
                    totalStockValue,
                    
                    totalExpenses,

                    netPosition
                },
                details: {
                    customers: topOweCustomers,
                    stock: topStockItems.slice(0, 20),
                    expenses: expensesList
                }
            };

        } catch (error) {
            console.error('[db:getSeasonReport] Error:', error);
            return { error: error.message };
        }
    }`;

// Replace the old getSeasonReport entirely
const regex = /    async getSeasonReport\(params = \{\}\) \{[\s\S]*?    \},/g;
if (regex.test(content)) {
    content = content.replace(regex, updatedFunction + ',');
    fs.writeFileSync(path, content, 'utf8');
    console.log("Updated.");
} else {
    console.log("Not found.");
}
