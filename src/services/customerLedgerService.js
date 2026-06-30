/**
 * Customer Ledger Service
 * Handles all accounting logic and ledger calculations
 */

export class CustomerLedgerService {
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

  /**
   * Get sale date with fallback
   */
  static getSaleDate(sale) {
    return sale.invoiceDate ? new Date(sale.invoiceDate) : new Date(sale.createdAt);
  }

  /**
   * Build unified ledger transactions from sales, returns, and payments
   */
  static buildLedgerTransactions(sales, returns, payments) {
    const transactions = [];

    // Process sales
    sales.forEach((sale) => {
      const total = Number(sale.total || 0);
      const remainingFromSale = Number(sale.remainingAmount ?? sale.remaining);
      const paidFromSale = Number(sale.paidAmount ?? sale.paid);
      const saleDate = this.getSaleDate(sale);
      const saleCreatedAt = this.toValidDate(sale?.createdAt);
      const remaining = Number.isFinite(remainingFromSale)
        ? remainingFromSale
        : (sale.saleType === '\u0622\u062c\u0644' ? total : 0);
      const paid = Number.isFinite(paidFromSale)
        ? Math.max(0, paidFromSale)
        : Math.max(0, total - Math.max(0, remaining));
      const paymentMethodName = sale?.paymentMethod?.name || sale?.payment || '-';

      transactions.push({
        id: `sale-${sale.id}`,
        date: saleDate,
        sortDate: this.resolveSortDate(saleDate, saleCreatedAt),
        type: '\u0628\u064a\u0639',
        typeColor: '#3b82f6',
        description: `\u0641\u0627\u062a\u0648\u0631\u0629 \u0628\u064a\u0639 #${sale.id}`,
        debit: total,
        credit: paid,
        total,
        paid,
        remaining,
        paymentMethodName,
        notes: sale.notes || '\u2713 \u0628\u062f\u0648\u0646 \u0645\u0644\u0627\u062d\u0638\u0627\u062a',
        createdByUser: sale.createdByUser,
        details: sale
      });
    });

    // Process returns
    returns.forEach((returnItem) => {
      const returnDate = new Date(returnItem.createdAt);
      transactions.push({
        id: `return-${returnItem.id}`,
        date: returnDate,
        sortDate: returnDate,
        type: '\u0645\u0631\u062a\u062c\u0639',
        typeColor: '#f59e0b',
        description: `\u0645\u0631\u062a\u062c\u0639 #${returnItem.id}`,
        debit: 0,
        credit: returnItem.total,
        total: returnItem.total,
        paid: returnItem.total,
        remaining: 0,
        paymentMethodName: '-',
        notes: returnItem.notes || '\u2713 \u0628\u062f\u0648\u0646 \u0645\u0644\u0627\u062d\u0638\u0627\u062a',
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
        type: '\u062f\u0641\u0639\u0629',
        typeColor: '#10b981',
        description: paymentMethodName === '-'
          ? '\u062f\u0641\u0639\u0629'
          : `\u062f\u0641\u0639\u0629 (${paymentMethodName})`,
        debit: 0,
        credit: payment.amount,
        total: payment.amount,
        paid: payment.amount,
        remaining: 0,
        paymentMethodName,
        notes: payment.notes || '\u2713 \u0628\u062f\u0648\u0646 \u0645\u0644\u0627\u062d\u0638\u0627\u062a',
        createdByUser: payment.createdByUser,
        details: payment
      });
    });

    return transactions.sort((a, b) => this.compareTransactions(a, b, 'desc'));
  }

  /**
   * Net balance effect of a single transaction
   * Positive -> increases receivable, Negative -> decreases receivable
   */
  static getTransactionEffect(transaction) {
    const debit = Number(transaction?.debit || 0);
    const credit = Number(transaction?.credit || 0);
    return debit - credit;
  }

  /**
   * Attach running balance to each transaction row
   */
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

  /**
   * Calculate ledger summary
   */
  static calculateSummary(transactions, customerBalance) {
    const totalSales = transactions
      .filter(t => t.type === 'بيع')
      .reduce((sum, t) => sum + t.total, 0);

    const totalPaid = transactions
      .filter(t => t.type !== 'مرتجع')
      .reduce((sum, t) => sum + t.paid, 0);

    const totalRemaining = transactions
      .filter(t => t.type === 'بيع')
      .reduce((sum, t) => sum + t.remaining, 0);

    const totalReturns = transactions
      .filter(t => t.type === 'مرتجع')
      .reduce((sum, t) => sum + t.credit, 0);

    const totalPayments = transactions
      .filter(t => t.type === 'دفعة')
      .reduce((sum, t) => sum + t.credit, 0);

    const totalDebit = transactions.reduce((sum, t) => sum + t.debit, 0);
    const totalCredit = transactions.reduce((sum, t) => sum + t.credit, 0);

    return {
      totalSales,
      totalPaid,
      totalRemaining,
      totalReturns,
      totalPayments,
      totalDebit,
      totalCredit,
      finalBalance: customerBalance
    };
  }

  /**
   * Filter transactions by date range
   */
  static filterByDateRange(transactions, fromDate, toDate) {
    if (!fromDate && !toDate) return transactions;

    const fromBoundary = fromDate ? new Date(fromDate) : null;
    const toBoundary = toDate ? new Date(toDate) : null;

    if (fromBoundary) {
      fromBoundary.setHours(0, 0, 0, 0);
    }

    if (toBoundary) {
      toBoundary.setHours(23, 59, 59, 999);
    }

    return transactions.filter(t => {
      const transDate = t.date;
      if (fromBoundary && transDate < fromBoundary) return false;
      if (toBoundary && transDate > toBoundary) return false;
      return true;
    });
  }

  static clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

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

  static isValidDate(value) {
    return value instanceof Date && !Number.isNaN(value.getTime());
  }

  static normalizePaymentAmountFromSale(sale) {
    const total = Number(sale?.total || 0);
    const remainingFromSale = Number(sale?.remainingAmount ?? sale?.remaining);
    const paidFromSale = Number(sale?.paidAmount ?? sale?.paid);

    const remaining = Number.isFinite(remainingFromSale)
      ? Math.max(0, remainingFromSale)
      : 0;

    if (Number.isFinite(paidFromSale)) {
      return Math.max(0, paidFromSale);
    }

    return Math.max(0, total - remaining);
  }

  /**
   * Build a smart payment behavior report for last N months.
   * Includes invoice-paid amounts + standalone payments.
   */
  static buildSmartPaymentInsight(
    customer,
    sales = [],
    payments = [],
    returns = [],
    options = {}
  ) {
    const monthsCount = Math.max(
      1,
      parseInt(options?.months, 10) || this.SMART_MONTHS_DEFAULT
    );

    const now = options?.now ? new Date(options.now) : new Date();
    const safeNow = this.isValidDate(now) ? now : new Date();
    const currentMonthStart = this.getMonthStart(safeNow);
    const windowStart = new Date(
      currentMonthStart.getFullYear(),
      currentMonthStart.getMonth() - (monthsCount - 1),
      1,
      0,
      0,
      0,
      0
    );

    const firstActivityDate = customer?.firstActivityDate
      ? new Date(customer.firstActivityDate)
      : null;
    const firstActivityMonth = this.isValidDate(firstActivityDate)
      ? this.getMonthStart(firstActivityDate)
      : null;

    const effectiveStart =
      firstActivityMonth && firstActivityMonth > windowStart ? firstActivityMonth : windowStart;

    const buckets = [];
    const bucketByKey = new Map();

    for (let offset = monthsCount - 1; offset >= 0; offset -= 1) {
      const monthStart = new Date(
        currentMonthStart.getFullYear(),
        currentMonthStart.getMonth() - offset,
        1,
        0,
        0,
        0,
        0
      );

      if (monthStart < effectiveStart) continue;

      const key = this.getMonthKey(monthStart);
      const bucket = {
        key,
        label: monthStart.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' }),
        monthStart,
        monthEnd: this.getMonthEnd(monthStart),
        dueAmount: 0,
        paidAmount: 0,
        reliefAmount: 0,
        paymentEvents: 0,
        hasInvoicePayment: false,
        hasStandalonePayment: false,
        delayDays: 0,
        hadObligation: false,
        statusLabel: 'لا نشاط'
      };

      buckets.push(bucket);
      bucketByKey.set(key, bucket);
    }

    const paymentEventDates = [];

    (sales || []).forEach((sale) => {
      const saleDate = this.getSaleDate(sale);
      if (!this.isValidDate(saleDate)) return;
      const monthKey = this.getMonthKey(saleDate);
      const bucket = bucketByKey.get(monthKey);
      if (!bucket) return;

      const total = Math.max(0, Number(sale?.total || 0));
      const paid = this.normalizePaymentAmountFromSale(sale);

      bucket.dueAmount += total;
      if (paid > 0) {
        bucket.paidAmount += paid;
        bucket.paymentEvents += 1;
        bucket.hasInvoicePayment = true;
        paymentEventDates.push(new Date(saleDate));
      }
    });

    (payments || []).forEach((payment) => {
      const amount = Math.max(0, Number(payment?.amount || 0));
      if (amount <= 0) return;

      const paymentDate = payment?.paymentDate
        ? new Date(payment.paymentDate)
        : new Date(payment?.createdAt);
      if (!this.isValidDate(paymentDate)) return;

      const monthKey = this.getMonthKey(paymentDate);
      const bucket = bucketByKey.get(monthKey);
      if (!bucket) return;

      bucket.paidAmount += amount;
      bucket.paymentEvents += 1;
      bucket.hasStandalonePayment = true;
      paymentEventDates.push(new Date(paymentDate));
    });

    (returns || []).forEach((returnItem) => {
      const returnDate = new Date(returnItem?.createdAt);
      if (!this.isValidDate(returnDate)) return;

      const monthKey = this.getMonthKey(returnDate);
      const bucket = bucketByKey.get(monthKey);
      if (!bucket) return;

      const returnTotal = Math.max(0, Number(returnItem?.total || 0));
      bucket.reliefAmount += returnTotal;
    });

    paymentEventDates.sort((a, b) => a - b);

    const totalDue = buckets.reduce((sum, bucket) => sum + bucket.dueAmount, 0);
    const totalPaid = buckets.reduce((sum, bucket) => sum + bucket.paidAmount, 0);
    const totalRelief = buckets.reduce((sum, bucket) => sum + bucket.reliefAmount, 0);
    const windowNet = totalDue - totalPaid - totalRelief;
    const currentBalance = Math.max(0, Number(customer?.balance || 0));
    const inferredStartOutstanding = Math.max(0, currentBalance - windowNet);

    const dayMs = 24 * 60 * 60 * 1000;
    let runningOutstanding = inferredStartOutstanding;
    let expectedMonths = 0;
    let monthsWithPayment = 0;
    let missedMonths = 0;
    let longestMissStreak = 0;
    let activeMissStreak = 0;
    let delayDaysTotal = 0;
    let delayMonthsCount = 0;

    buckets.forEach((bucket) => {
      const hadObligation = runningOutstanding > 0.009 || bucket.dueAmount > 0.009;
      const hasPayment = bucket.paymentEvents > 0;
      bucket.hadObligation = hadObligation;

      if (hadObligation) {
        expectedMonths += 1;
        if (hasPayment) {
          monthsWithPayment += 1;
          activeMissStreak = 0;
          bucket.delayDays = 0;
        } else {
          missedMonths += 1;
          activeMissStreak += 1;
          longestMissStreak = Math.max(longestMissStreak, activeMissStreak);

          const nextPaymentDate = paymentEventDates.find((eventDate) => eventDate > bucket.monthEnd);
          const delayReference = nextPaymentDate || safeNow;
          const rawDelay = Math.ceil((delayReference - bucket.monthEnd) / dayMs);
          bucket.delayDays = Math.max(0, rawDelay);
          delayDaysTotal += bucket.delayDays;
          delayMonthsCount += 1;
        }
      } else {
        bucket.delayDays = 0;
        activeMissStreak = 0;
      }

      if (!hadObligation) {
        bucket.statusLabel = 'لا يوجد استحقاق';
      } else if (hasPayment) {
        bucket.statusLabel = 'مدفوع';
      } else if (bucket.delayDays <= 30) {
        bucket.statusLabel = 'متأخر';
      } else {
        bucket.statusLabel = 'متأخر بشدة';
      }

      runningOutstanding = Math.max(
        0,
        runningOutstanding + bucket.dueAmount - bucket.paidAmount - bucket.reliefAmount
      );
      bucket.outstandingEnd = runningOutstanding;
    });

    const averageDelayDays =
      delayMonthsCount > 0 ? delayDaysTotal / delayMonthsCount : 0;
    const regularityRate = expectedMonths > 0 ? monthsWithPayment / expectedMonths : 1;
    const coverageRatio =
      totalDue > 0 ? this.clamp(totalPaid / totalDue, 0, 2) : (totalPaid > 0 ? 1 : 1);

    let score = 100;
    score -= (1 - regularityRate) * 55;
    score -= Math.min(4, longestMissStreak) * 8;
    score -= (Math.min(averageDelayDays, 90) / 90) * 20;
    if (coverageRatio < 1) {
      score -= (1 - coverageRatio) * 25;
    }
    score = Math.round(this.clamp(score, 0, 100));

    let classification = 'ملتزم';
    let tone = 'good';
    if (score < 30) {
      classification = 'عالي المخاطر';
      tone = 'danger';
    } else if (score < 50) {
      classification = 'متأخر';
      tone = 'bad';
    } else if (score < 70) {
      classification = 'متذبذب';
      tone = 'warn';
    } else if (score < 85) {
      classification = 'جيد';
      tone = 'good';
    }

    let pattern = 'منتظم شهريا';
    if (expectedMonths === 0) {
      pattern = 'لا توجد مديونية خلال الفترة';
    } else if (monthsWithPayment === 0) {
      pattern = 'لا يوجد سداد خلال آخر 6 شهور';
    } else if (missedMonths === 0) {
      pattern = 'دفع مرة واحدة على الأقل كل شهر';
    } else if (longestMissStreak >= 2) {
      pattern = `يدفع ثم يتأخر ${longestMissStreak} شهر`;
    } else {
      pattern = 'سداد غير منتظم';
    }

    const reasons = [];
    reasons.push(`التزام شهري: ${monthsWithPayment}/${expectedMonths || 0}`);
    reasons.push(`نسبة تغطية السداد: ${(coverageRatio * 100).toFixed(0)}%`);
    if (missedMonths > 0) {
      reasons.push(`أشهر بدون سداد: ${missedMonths}`);
    }
    if (averageDelayDays > 0) {
      reasons.push(`متوسط التأخير: ${averageDelayDays.toFixed(0)} يوم`);
    }

    return {
      periodMonths: monthsCount,
      from: effectiveStart,
      to: safeNow,
      score,
      classification,
      tone,
      pattern,
      reasons,
      metrics: {
        expectedMonths,
        monthsWithPayment,
        missedMonths,
        longestMissStreak,
        averageDelayDays,
        totalDue,
        totalPaid,
        totalRelief,
        regularityRate,
        coverageRatio,
        inferredStartOutstanding
      },
      timeline: buckets.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        dueAmount: bucket.dueAmount,
        paidAmount: bucket.paidAmount,
        paymentEvents: bucket.paymentEvents,
        delayDays: bucket.delayDays,
        hadObligation: bucket.hadObligation,
        statusLabel: bucket.statusLabel,
        outstandingEnd: bucket.outstandingEnd
      }))
    };
  }

  /**
   * Convert number to Arabic words (simplified)
   */
  static numberToArabicWords(num) {
    const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
    const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
    const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

    const integerPart = Math.floor(num);
    if (integerPart < 10) return ones[integerPart];
    if (integerPart < 100) {
      const tensDigit = Math.floor(integerPart / 10);
      const onesDigit = integerPart % 10;
      return `${tens[tensDigit]} ${ones[onesDigit]}`.trim();
    }
    return `${integerPart}`;
  }
}
