#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const statements = [
    'ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "balance" DOUBLE PRECISION NOT NULL DEFAULT 0',
    'ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "firstActivityDate" TIMESTAMP(3)',
    'ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "lastPaymentDate" TIMESTAMP(3)',
    'ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "financialsUpdatedAt" TIMESTAMP(3)',
    'CREATE INDEX IF NOT EXISTS "Customer_financialsUpdatedAt_idx" ON "Customer" ("financialsUpdatedAt")',
    'CREATE INDEX IF NOT EXISTS "Customer_balance_idx" ON "Customer" ("balance")',
    'CREATE INDEX IF NOT EXISTS "Customer_lastPaymentDate_idx" ON "Customer" ("lastPaymentDate")',
    'CREATE INDEX IF NOT EXISTS "Customer_createdAt_idx" ON "Customer" ("createdAt")',
    'CREATE INDEX IF NOT EXISTS "Customer_customerType_city_idx" ON "Customer" ("customerType", "city")'
];

const main = async () => {
    for (const statement of statements) {
        await prisma.$executeRawUnsafe(statement);
    }
    console.log('[LEGACY-GUARD] customer financial schema is ensured.');
};

main()
    .catch((error) => {
        console.error('[LEGACY-GUARD][ERROR]', error?.message || error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
