const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log('Starting DB schema fix...');

        const tables = [
            'Sale', 'Return', 'CustomerPayment', 'CustomerTransaction', 
            'PurchaseReturn', 'SupplierPayment', 'Expense'
        ];

        for (const table of tables) {
            console.log(`Checking/Fixing table: ${table}...`);
            
            // Check if column exists
            const columnExists = await prisma.$queryRawUnsafe(`
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = '${table}' AND column_name = 'createdByUserId'
            `);

            if (columnExists.length === 0) {
                console.log(`Adding column 'createdByUserId' to table '${table}'...`);
                await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "createdByUserId" INTEGER`);
                
                console.log(`Adding foreign key constraint to table '${table}'...`);
                await prisma.$executeRawUnsafe(`
                    ALTER TABLE "${table}" 
                    ADD CONSTRAINT "${table}_createdByUserId_fkey" 
                    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") 
                    ON DELETE SET NULL ON UPDATE CASCADE
                `);
            } else {
                console.log(`Column 'createdByUserId' already exists in table '${table}'.`);
            }
        }

        console.log('DB schema fix completed successfully!');
    } catch (err) {
        console.error('Error fixing DB schema:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
