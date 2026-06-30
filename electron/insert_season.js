const fs = require('fs');

const path = 'd:\\erp-new\\erp system\\erp-desktop\\electron\\db-service.js';
let content = fs.readFileSync(path, 'utf8');

const codeToInsert = `
    async getSeasonReport(params = {}) {
        try {
            const { from, to } = resolveReportRange(params);
            
            // 1. Purchases (Net Capital)
            const purchases = await prisma.purchase.findMany({
                where: { createdAt: { gte: from, lte: to } }
            });
            const purchaseReturns = await prisma.purchaseReturn.findMany({
                where: { createdAt: { gte: from, lte: to } }
            });
            
            const totalPurchases = purchases.reduce((sum, p) => sum + (p.total || 0), 0);
            const totalShipping = purchases.reduce((sum, p) => sum + (p.expensesTotal || 0), 0);
            const totalPurchaseReturns = purchaseReturns.reduce((sum, r) => sum + (r.total || 0), 0);
            const netPurchases = totalPurchases + totalShipping - totalPurchaseReturns;

            // 2. Sales & COGS
            const sales = await prisma.sale.findMany({
                where: { invoiceDate: { gte: from, lte: to } },
                include: { items: { include: { variant: true } } }
            });
            const saleReturns = await prisma.return.findMany({
                where: { createdAt: { gte: from, lte: to } }
            });

            let cashSales = 0;
            let creditSales = 0;
            let totalSalesDiscount = 0;
            let totalCOGS = 0;

            sales.forEach(sale => {
                if (sale.saleType === 'نقدي') cashSales += sale.total;
                else if (sale.saleType === 'آجل') creditSales += sale.total;
                totalSalesDiscount += (sale.discount || 0);

                sale.items.forEach(item => {
                    const cost = Number(item.variant.cost) || 0;
                    totalCOGS += (cost * item.quantity);
                    totalSalesDiscount += (item.discount || 0);
                });
            });
            const totalSaleReturns = saleReturns.reduce((sum, r) => sum + (r.total || 0), 0);
            const netSales = cashSales + creditSales - totalSaleReturns;
            const grossProfit = netSales - totalCOGS - totalSalesDiscount;

            // 3. Customer Payments & Balances
            const customerPayments = await prisma.customerPayment.findMany({
                where: { paymentDate: { gte: from, lte: to } },
                include: { customer: true }
            });
            const totalPaymentsReceived = customerPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
            
            // Net Pending from Credit Sales in this period
            const pendingBalances = creditSales - totalPaymentsReceived;

            // Get customers with current balances > 0 to show who owes money
            const allCustomers = await prisma.customer.findMany({
                where: { balance: { gt: 0 } },
                select: { id: true, name: true, balance: true }
            });
            const topOweCustomers = allCustomers.sort((a, b) => Number(b.balance) - Number(a.balance)).slice(0, 10);

            // 4. Remaining Stock
            const stock = await prisma.warehouseStock.findMany({
                where: { quantity: { gt: 0 } },
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
            const expenses = await prisma.expense.findMany({
                where: { expenseDate: { gte: from, lte: to } },
                include: { category: true }
            });
            const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
            
            const expensesByCategory = {};
            expenses.forEach(e => {
                const catName = e.category?.name || 'أخرى';
                expensesByCategory[catName] = (expensesByCategory[catName] || 0) + e.amount;
            });
            const expensesList = Object.entries(expensesByCategory).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);

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
    },
`;

if (content.includes('async getSeasonReport')) {
    console.log("Already exists.");
} else {
    content = content.replace('    async getChatMessages(limit = 100) {', codeToInsert + '\\n    async getChatMessages(limit = 100) {');
    fs.writeFileSync(path, content, 'utf8');
    console.log("Done.");
}
