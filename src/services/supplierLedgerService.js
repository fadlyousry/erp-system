export class SupplierLedgerService {
  static SMART_MONTHS_DEFAULT = 6;

  static toValidDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return this.isValidDate(date) ? date : null;
  }

  static compareTransactionIds(aId, bId, direction = 'desc') {
    const safeA = String(aId || '');
    const safeB = String(bId || '');
    if (safeA === safeB) return 0;
    return direction === 'asc'
      ? safeA.localeCompare(safeB)
      : safeB.localeCompare(safeA);
  }

  static compareTransactions(a, b, direction = 'desc') {
    const aSortDate = this.toValidDate(a.sortDate) || this.toValidDate(a.date) || new Date(0);
    const bSortDate = this.toValidDate(b.sortDate) || this.toValidDate(b.date) || new Date(0);
    const primaryDiff = aSortDate.getTime() - bSortDate.getTime();
    if (primaryDiff !== 0) {
      return direction === 'asc' ? primaryDiff : -primaryDiff;
    }

    const aDate = this.toValidDate(a.date) || aSortDate;
    const bDate = this.toValidDate(b.date) || bSortDate;
    const secondaryDiff = aDate.getTime() - bDate.getTime();
    if (secondaryDiff !== 0) {
      return direction === 'asc' ? secondaryDiff : -secondaryDiff;
    }

    return this.compareTransactionIds(a.id, b.id, direction);
  }

  static hasTimePart(dateValue) {
    const date = this.toValidDate(dateValue);
    if (!date) return false;
    return date.getHours() !== 0
      || date.getMinutes() !== 0
      || date.getSeconds() !== 0
      || date.getMilliseconds() !== 0;
  }

  static mergeDateWithTime(dateValue, timeValue) {
    const datePart = this.toValidDate(dateValue);
    const timePart = this.toValidDate(timeValue);
    if (!datePart) return timePart;
    if (!timePart) return datePart;

    const merged = new Date(datePart.getTime());
    merged.setHours(
      timePart.getHours(),
      timePart.getMinutes(),
      timePart.getSeconds(),
      timePart.getMilliseconds()
    );
    return merged;
  }

  static resolveSortDate(baseDate, fallbackTimeDate = null) {
    const resolvedBase = this.toValidDate(baseDate);
    if (!resolvedBase) return this.toValidDate(fallbackTimeDate);
    if (this.hasTimePart(resolvedBase) || !fallbackTimeDate) return resolvedBase;
    return this.mergeDateWithTime(resolvedBase, fallbackTimeDate);
  }

  static getPurchaseDate(purchase) {
    return purchase.invoiceDate ? new Date(purchase.invoiceDate) : new Date(purchase.createdAt);
  }

  static buildLedgerTransactions(purchases, returns, payments) {
    const transactions = [];

    // Process purchases
    purchases.forEach((purchase) => {
      const total = Number(purchase.total || 0);
      const paid = Number(purchase.paidAmount ?? purchase.paid ?? 0);
      const remaining = Math.max(0, total - paid);
      const purchaseDate = this.getPurchaseDate(purchase);
      const purchaseCreatedAt = this.toValidDate(purchase?.createdAt);
      const paymentMethodName = purchase?.paymentMethod?.name || purchase?.payment || '-';

      transactions.push({
        id: `purchase-${purchase.id}`,
        date: purchaseDate,
        sortDate: this.resolveSortDate(purchaseDate, purchaseCreatedAt),
        type: 'مشتريات',
        typeColor: '#3b82f6',
        description: `فاتورة مشتريات #${purchase.id}`,
        debit: remaining > 0 ? remaining : 0, 
        credit: 0,
        total,
        paid,
        remaining,
        paymentMethodName,
        notes: purchase.notes || '✓ بدون ملاحظات',
        createdByUser: purchase.createdByUser,
        details: purchase
      });
    });

    // Process returns
    returns.forEach((returnItem) => {
      const returnDate = new Date(returnItem.createdAt);
      transactions.push({
        id: `return-${returnItem.id}`,
        date: returnDate,
        sortDate: returnDate,
        type: 'مرتجع',
        typeColor: '#f59e0b',
        description: `مرتجع مشتريات #${returnItem.id}`,
        debit: 0,
        credit: returnItem.total,
        total: returnItem.total,
        paid: returnItem.total,
        remaining: 0,
        paymentMethodName: '-',
        notes: returnItem.notes || '✓ بدون ملاحظات',
        createdByUser: returnItem.createdByUser,
        details: returnItem
      });
    });

    // Process payments
    payments.forEach((payment) => {
      const paymentDate = payment.paymentDate
        ? new Date(payment.paymentDate)
        : new Date(payment.createdAt);
      const paymentCreatedAt = this.toValidDate(payment?.createdAt);
      const paymentMethodName = payment?.paymentMethod?.name || '-';

      transactions.push({
        id: `payment-${payment.id}`,
        date: paymentDate,
        sortDate: this.resolveSortDate(paymentDate, paymentCreatedAt),
        type: 'سداد',
        typeColor: '#10b981',
        description: paymentMethodName === '-'
          ? 'سداد مورد'
          : `سداد مورد (${paymentMethodName})`,
        debit: 0,
        credit: payment.amount,
        total: payment.amount,
        paid: payment.amount,
        remaining: 0,
        paymentMethodName,
        notes: payment.notes || '✓ بدون ملاحظات',
        createdByUser: payment.createdByUser,
        details: payment
      });
    });

    return transactions.sort((a, b) => this.compareTransactions(a, b, 'desc'));
  }

  static getTransactionEffect(transaction) {
    if (transaction.type === 'مشتريات') {
        return Number(transaction.remaining); // Increases what we owe
    } else if (transaction.type === 'مرتجع') {
        return -Number(transaction.total); // Decreases what we owe
    } else if (transaction.type === 'سداد') {
        return -Number(transaction.total); // Decreases what we owe
    }
    return 0;
  }

  static attachRunningBalance(transactions, finalBalance) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return [];
    }

    const ascending = [...transactions].sort((a, b) => this.compareTransactions(a, b, 'asc'));

    const totalEffect = ascending.reduce(
      (sum, transaction) => sum + this.getTransactionEffect(transaction),
      0
    );

    let runningBalance = Number(finalBalance || 0) - totalEffect;
    const balanceById = new Map();

    ascending.forEach(transaction => {
      runningBalance += this.getTransactionEffect(transaction);
      balanceById.set(transaction.id, runningBalance);
    });

    return transactions.map(transaction => ({
      ...transaction,
      runningBalance: balanceById.get(transaction.id) ?? Number(finalBalance || 0)
    }));
  }

  static calculateSummary(transactions, supplierBalance) {
    const totalPurchases = transactions
      .filter(t => t.type === 'مشتريات')
      .reduce((sum, t) => sum + t.total, 0);

    const totalPaid = transactions
      .filter(t => t.type !== 'مرتجع' && t.type !== 'مشتريات')
      .reduce((sum, t) => sum + t.paid, 0);

    const totalPaidInPurchases = transactions
      .filter(t => t.type === 'مشتريات')
      .reduce((sum, t) => sum + t.paid, 0);

    const totalRemaining = transactions
      .filter(t => t.type === 'مشتريات')
      .reduce((sum, t) => sum + t.remaining, 0);

    const totalReturns = transactions
      .filter(t => t.type === 'مرتجع')
      .reduce((sum, t) => sum + t.credit, 0);

    return {
      totalPurchases,
      totalPaid: totalPaid + totalPaidInPurchases,
      totalRemaining,
      totalReturns,
      totalPayments: totalPaid,
      totalPaidInPurchases,
      finalBalance: supplierBalance
    };
  }

  static filterByDateRange(transactions, fromDate, toDate) {
    if (!fromDate && !toDate) return transactions;
    const fromBoundary = fromDate ? new Date(fromDate) : null;
    const toBoundary = toDate ? new Date(toDate) : null;
    if (fromBoundary) fromBoundary.setHours(0, 0, 0, 0);
    if (toBoundary) toBoundary.setHours(23, 59, 59, 999);

    return transactions.filter(t => {
      const transDate = t.date;
      if (fromBoundary && transDate < fromBoundary) return false;
      if (toBoundary && transDate > toBoundary) return false;
      return true;
    });
  }

  static clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  static getMonthStart(dateValue) {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  }
  static getMonthEnd(monthStart) {
    return new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  static getMonthKey(dateValue) {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${date.getFullYear()}-${month}`;
  }
  static isValidDate(value) { return value instanceof Date && !Number.isNaN(value.getTime()); }

  static buildSmartPaymentInsight(supplier, purchases = [], payments = [], returns = [], options = {}) {
    const monthsCount = Math.max(1, parseInt(options?.months, 10) || this.SMART_MONTHS_DEFAULT);
    const now = options?.now ? new Date(options.now) : new Date();
    const safeNow = this.isValidDate(now) ? now : new Date();
    const currentMonthStart = this.getMonthStart(safeNow);
    const windowStart = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - (monthsCount - 1), 1, 0, 0, 0, 0);

    const firstActivityDate = supplier?.createdAt ? new Date(supplier.createdAt) : null;
    const firstActivityMonth = this.isValidDate(firstActivityDate) ? this.getMonthStart(firstActivityDate) : null;
    const effectiveStart = firstActivityMonth && firstActivityMonth > windowStart ? firstActivityMonth : windowStart;

    const buckets = [];
    const bucketByKey = new Map();

    for (let offset = monthsCount - 1; offset >= 0; offset -= 1) {
      const monthStart = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - offset, 1, 0, 0, 0, 0);
      if (monthStart < effectiveStart) continue;

      const key = this.getMonthKey(monthStart);
      const bucket = {
        key, label: monthStart.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' }),
        monthStart, monthEnd: this.getMonthEnd(monthStart),
        dueAmount: 0, paidAmount: 0, reliefAmount: 0, paymentEvents: 0, delayDays: 0, hadObligation: false, statusLabel: 'لا نشاط'
      };
      buckets.push(bucket);
      bucketByKey.set(key, bucket);
    }

    const paymentEventDates = [];

    (purchases || []).forEach((purchase) => {
      const purchaseDate = this.getPurchaseDate(purchase);
      if (!this.isValidDate(purchaseDate)) return;
      const monthKey = this.getMonthKey(purchaseDate);
      const bucket = bucketByKey.get(monthKey);
      if (!bucket) return;

      const total = Math.max(0, Number(purchase?.total || 0));
      const paid = Number(purchase?.paidAmount ?? purchase?.paid ?? 0);
      bucket.dueAmount += total;
      if (paid > 0) {
        bucket.paidAmount += paid;
        bucket.paymentEvents += 1;
        paymentEventDates.push(new Date(purchaseDate));
      }
    });

    (payments || []).forEach((payment) => {
      const amount = Math.max(0, Number(payment?.amount || 0));
      if (amount <= 0) return;
      const paymentDate = payment?.paymentDate ? new Date(payment.paymentDate) : new Date(payment?.createdAt);
      if (!this.isValidDate(paymentDate)) return;

      const monthKey = this.getMonthKey(paymentDate);
      const bucket = bucketByKey.get(monthKey);
      if (!bucket) return;

      bucket.paidAmount += amount;
      bucket.paymentEvents += 1;
      paymentEventDates.push(new Date(paymentDate));
    });

    (returns || []).forEach((ret) => {
      const returnDate = new Date(ret?.createdAt);
      if (!this.isValidDate(returnDate)) return;
      const monthKey = this.getMonthKey(returnDate);
      const bucket = bucketByKey.get(monthKey);
      if (!bucket) return;

      bucket.reliefAmount += Math.max(0, Number(ret?.total || 0));
    });

    paymentEventDates.sort((a, b) => a - b);
    let runningOutstanding = 0;
    
    buckets.forEach((bucket) => {
      bucket.hadObligation = runningOutstanding > 0 || bucket.dueAmount > 0;
      runningOutstanding = Math.max(0, runningOutstanding + bucket.dueAmount - bucket.paidAmount - bucket.reliefAmount);
      bucket.statusLabel = bucket.hadObligation ? (bucket.paymentEvents > 0 ? 'مستقر' : 'تأخر بالدفع') : 'لا يوجد استحقاق';
      bucket.outstandingEnd = runningOutstanding;
    });

    return {
      periodMonths: monthsCount, from: effectiveStart, to: safeNow, classification: 'مورد', tone: 'good',
      timeline: buckets
    };
  }
}
