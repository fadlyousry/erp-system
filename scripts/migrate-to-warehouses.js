/**
 * Migration script to convert existing warehouseQty and displayQty to warehouse system
 * 
 * This script:
 * 1. Creates default warehouses if they don't exist
 * 2. Migrates existing inventory data to warehouse stocks
 * 
 * Run with: node scripts/migrate-to-warehouses.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting warehouse migration...\n');

  try {
    // Step 1: Create default warehouses if they don't exist
    console.log('📦 Step 1: Creating default warehouses...');
    
    const defaultWarehouse = await prisma.warehouse.upsert({
      where: { name: 'مخزن رئيسي' },
      update: {},
      create: {
        name: 'مخزن رئيسي',
        icon: '🏭',
        color: '#0f766e',
        isActive: true
      }
    });
    console.log(`   ✓ Created/Found: ${defaultWarehouse.name} (ID: ${defaultWarehouse.id})`);

    const displayWarehouse = await prisma.warehouse.upsert({
      where: { name: 'عرض' },
      update: {},
      create: {
        name: 'عرض',
        icon: '🛍️',
        color: '#3b82f6',
        isActive: true
      }
    });
    console.log(`   ✓ Created/Found: ${displayWarehouse.name} (ID: ${displayWarehouse.id})\n`);

    // Step 2: Get all products with inventory
    console.log('📊 Step 2: Migrating inventory data...');
    const inventories = await prisma.inventory.findMany({
      include: {
        product: true
      }
    });

    console.log(`   Found ${inventories.length} products with inventory data\n`);

    let migrated = 0;
    let skipped = 0;

    for (const inventory of inventories) {
      try {
        const warehouseQty = inventory.warehouseQty || 0;
        const displayQty = inventory.displayQty || 0;

        // Migrate warehouse quantity
        if (warehouseQty > 0) {
          await prisma.warehouseStock.upsert({
            where: {
              productId_warehouseId: {
                productId: inventory.productId,
                warehouseId: defaultWarehouse.id
              }
            },
            update: {
              quantity: warehouseQty
            },
            create: {
              productId: inventory.productId,
              warehouseId: defaultWarehouse.id,
              quantity: warehouseQty
            }
          });
        }

        // Migrate display quantity
        if (displayQty > 0) {
          await prisma.warehouseStock.upsert({
            where: {
              productId_warehouseId: {
                productId: inventory.productId,
                warehouseId: displayWarehouse.id
              }
            },
            update: {
              quantity: displayQty
            },
            create: {
              productId: inventory.productId,
              warehouseId: displayWarehouse.id,
              quantity: displayQty
            }
          });
        }

        migrated++;
        if (migrated % 100 === 0) {
          console.log(`   Migrated ${migrated} products...`);
        }
      } catch (error) {
        console.error(`   ✗ Error migrating product ${inventory.productId}:`, error.message);
        skipped++;
      }
    }

    console.log(`\n✅ Migration completed!`);
    console.log(`   - Migrated: ${migrated} products`);
    console.log(`   - Skipped: ${skipped} products`);
    console.log(`\n💡 Note: Original warehouseQty and displayQty fields are preserved in Inventory table for reference.\n`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
