#!/usr/bin/env node
const dbService = require('../electron/db-service');

const parseArgs = () => {
    const parsed = {};
    for (const arg of process.argv.slice(2)) {
        if (!arg.startsWith('--')) continue;
        const [key, value] = arg.slice(2).split('=');
        parsed[key] = value === undefined ? true : value;
    }
    return parsed;
};

const main = async () => {
    const args = parseArgs();

    if (args.customerId) {
        const result = await dbService.rebuildCustomerFinancials(args.customerId);
        if (result?.error) {
            console.error('[REBUILD][ERROR]', result.error);
            process.exitCode = 1;
            return;
        }

        console.log('[REBUILD][CUSTOMER] done', result);
        return;
    }

    const batchSize = args.batchSize ? parseInt(args.batchSize, 10) : 200;
    const startAfterId = args.startAfterId ? parseInt(args.startAfterId, 10) : 0;

    const result = await dbService.rebuildAllCustomersFinancials({
        batchSize,
        startAfterId
    });

    if (result?.error) {
        console.error('[REBUILD][ERROR]', result.error);
        process.exitCode = 1;
        return;
    }

    console.log('[REBUILD][ALL] done', result);
};

main()
    .catch((error) => {
        console.error('[REBUILD][FATAL]', error?.message || error);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await dbService.disconnect();
        } catch (_) {
            // no-op
        }
    });
