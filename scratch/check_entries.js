const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const entries = await prisma.treasuryEntry.findMany({
        take: 10,
        orderBy: { id: 'desc' },
        include: {
            createdByUser: true
        }
    });
    console.log(JSON.stringify(entries, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
