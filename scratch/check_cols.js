const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const schemaTables = [
            'User', 'Role', 'Permission', 'RolePermission', 'Category', 'Product', 
            'Variant', 'Inventory', 'Warehouse', 'WarehouseStock', 'WarehouseTransfer', 
            'VariantWarehouseStock', 'Customer', 'CustomerTransaction', 'Sale', 
            'SaleItem', 'Return', 'ReturnItem', 'PaymentMethod', 'CustomerPayment', 
            'Supplier', 'Purchase', 'PurchaseItem', 'PurchaseReturn', 'PurchaseReturnItem', 
            'SupplierPayment', 'ExpenseCategory', 'Expense', 'Treasury', 'TreasuryEntry', 
            'PaymentAllocation', 'AuditLog'
        ];

        console.log('Comparing schema.prisma fields vs Database columns...');

        for (const table of schemaTables) {
            try {
                // Get database columns for this table
                const dbColsRaw = await prisma.$queryRawUnsafe(`
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_name = '${table}';
                `);
                const dbCols = dbColsRaw.map(c => c.column_name);

                if (dbCols.length === 0) {
                    console.log(`Table '${table}' does NOT exist in DB!`);
                    continue;
                }

                // Hard-coded check for auditing fields that are common in this schema
                const auditingFields = ['createdByUserId', 'meta', 'notes', 'createdAt', 'updatedAt'];
                for (const field of auditingFields) {
                     // We would ideally parse the schema.prisma here, but for now we just check these common ones
                     // and we already know many are missing.
                }

                // Specifically look for missing columns the schema DEFINITELY has for these models:
                const expected = {
                    'Sale': ['createdByUserId'],
                    'Return': ['createdByUserId'],
                    'CustomerPayment': ['createdByUserId'],
                    'CustomerTransaction': ['createdByUserId'],
                    'PurchaseReturn': ['createdByUserId'],
                    'SupplierPayment': ['createdByUserId'],
                    'Expense': ['createdByUserId'],
                    'Purchase': ['createdByUserId'], // We know this has it
                    'User': ['isActive', 'lastLoginAt'] // Added in migration 2
                };

                if (expected[table]) {
                    for (const field of expected[table]) {
                        if (!dbCols.includes(field)) {
                            console.log(`Table '${table}' is MISSING '${field}' column.`);
                        }
                    }
                }

            } catch (err) {
                console.log(`Error checking table '${table}': ${err.message}`);
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
