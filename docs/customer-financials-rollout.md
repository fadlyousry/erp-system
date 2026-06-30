# Customer Financials Rollout (No Downtime)

## 1) Deploy order
1. Deploy backend code that **reads summary fields only** and uses incremental deltas.
2. Run `npm run prisma:migrate:deploy`.
3. Run one-time backfill:
   - Single customer: `node scripts/rebuild-customer-financials.js --customerId=123`
   - All customers: `npm run rebuild:customer-financials -- --batchSize=200`

## 2) Drift-safe path for legacy environments
If old environments were created without Prisma migrations history:
1. Run guard once:
   - `npm run db:legacy:customer-financial-guard`
2. Mark migration as applied (without reset):
   - `npx prisma migrate resolve --applied 20260210_customer_financial_summary_indexes`
3. Continue with normal deploys:
   - `npm run prisma:migrate:deploy`

## 3) Verification
1. `npx prisma migrate status`
2. Open customers page and check:
   - pagination/search/filter/sort works
   - no white screen / no full-table freeze
3. Run reconcile and confirm idempotency (same totals after second run).

## 4) Optional perf logs
- Enable: `ENABLE_PERF_LOGS=1`
- Slow threshold: `PERF_SLOW_QUERY_MS=250`
- Disable after validation by removing env flags.
