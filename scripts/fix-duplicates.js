const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Checking for duplicate variants...');

  try {
    const variants = await prisma.variant.findMany({
      orderBy: { createdAt: 'desc' }
    });

    const seen = new Set();
    const duplicates = [];

    for (const v of variants) {
      // Create a unique key for the variant: productId-size-color
      // We normalize size and color to lower case just in case
      const size = (v.productSize || '').toLowerCase();
      const color = (v.color || '').toLowerCase();
      const key = `${v.productId}-${size}-${color}`;

      if (seen.has(key)) {
        duplicates.push(v.id);
      } else {
        seen.add(key);
      }
    }

    console.log(`Found ${duplicates.length} duplicate variants.`);

    if (duplicates.length > 0) {
      console.log('Deleting duplicates...');
      const result = await prisma.variant.deleteMany({
        where: {
          id: {
            in: duplicates
          }
        }
      });
      console.log(`Deleted ${result.count} duplicate variants.`);
    } else {
      console.log('No duplicates found.');
    }
  } catch (error) {
    console.error('Error during duplicate cleanup:', error);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
