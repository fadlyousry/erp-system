/**
 * Ledger Print Template
 * Returns pure HTML string for printing full supplier ledger
 */

const generateLegacyLedgerHTML = (supplier, transactions, summary) => {
  const formatMoney = (value) => `${Number(value || 0).toFixed(2)} ج.م`;
  const getBalanceColor = (value) =>
    value > 0 ? '#ef4444' : value < 0 ? '#10b981' : '#475569';

  return `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>كشف حساب - ${supplier?.name || '-'}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 20px;
      direction: rtl;
      margin: 0;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 2px solid #000;
      padding-bottom: 15px;
    }
    .header h1 { margin: 0 0 10px 0; font-size: 24px; }
    .header h2 { margin: 0; font-size: 18px; color: #333; }
    .supplier-info {
      background: #f9fafb;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .supplier-info h3 { margin: 0 0 10px 0; font-size: 16px; }
    .supplier-info p { margin: 5px 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 14px;
    }
    th, td {
      border: 1px solid #000;
      padding: 8px;
      text-align: right;
    }
    th {
      background-color: #f0f0f0;
      font-weight: bold;
    }
    .summary {
      background: #f0fdf4;
      padding: 15px;
      border-radius: 8px;
      margin-top: 20px;
    }
    .summary h3 { margin: 0 0 10px 0; font-size: 16px; }
    .summary p { margin: 5px 0; }
    .print-button {
      padding: 12px 30px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
      font-weight: bold;
      margin: 10px;
    }
    .print-button:hover {
      background: #2563eb;
    }
    @media print {
      body { padding: 10px; }
      .print-button { display: none; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>⚡ ERP SYSTEM</h1>
    <h2>كشف حساب مورد</h2>
  </div>

  <div class="supplier-info">
    <h3>بيانات المورد:</h3>
    <p><strong>الاسم:</strong> ${supplier?.name || '-'}</p>
    <p><strong>الهاتف:</strong> ${supplier?.phone || '-'}</p>
    <p><strong>العنوان:</strong> ${supplier?.address || '-'}</p>
    <p><strong>تاريخ الكشف:</strong> ${new Date().toLocaleDateString('ar-EG')}</p>
  </div>

  <table>
    <thead>
      <tr>
        <th>التاريخ</th>
        <th>البيان</th>
        <th>له (دائن)</th>
        <th>عليه (مدين)</th>
        <th>الرصيد</th>
        <th>ملاحظات</th>
      </tr>
    </thead>
    <tbody>
      ${transactions.length === 0 ? `
        <tr>
          <td colspan="6" style="text-align: center; padding: 20px; color: #6b7280;">
            لا توجد معاملات
          </td>
        </tr>
      ` : transactions.map(t => `
        <tr>
          <td>${t.date.toLocaleDateString('ar-EG')}</td>
          <td>${t.description}</td>
          <td style="color: #ef4444;">${t.debit > 0 ? formatMoney(t.debit) : '-'}</td>
          <td style="color: #10b981;">${t.credit > 0 ? formatMoney(t.credit) : '-'}</td>
          <td style="color: ${getBalanceColor(Number(t.runningBalance || 0))}; font-weight: bold;">
            ${formatMoney(t.runningBalance || 0)}
          </td>
          <td>${t.notes || '-'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="summary">
    <h3>ملخص الحساب:</h3>
    <p><strong>إجمالي المشتريات:</strong> ${formatMoney(summary.totalSales)}</p>
    <p><strong>إجمالي المرتجعات:</strong> ${formatMoney(summary.totalReturns)}</p>
    <p><strong>إجمالي الدفعات:</strong> ${formatMoney(summary.totalPayments)}</p>
    <p style="font-size: 18px; color: ${getBalanceColor(summary.finalBalance)};">
      <strong>الرصيد الحالي:</strong> ${formatMoney(summary.finalBalance)}
    </p>
  </div>

  <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #6b7280;">
    <p>تم الطباعة في: ${new Date().toLocaleString('ar-EG')}</p>
    <div class="no-print">
      <button class="print-button" onclick="if(window.electronAPI){window.electronAPI.triggerPrint()}else{window.print()}">🖨️ طباعة كشف الحساب</button>
    </div>
  </div>

  <script>
    document.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'p') {
        e.preventDefault();
      }
    });
  </script>
</body>
</html>
  `.trim();
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatMoney = (value) => `${Number(value || 0).toFixed(2)} ج.م`;

const formatDate = (value, withTime = false) => {
  if (!value) return '-';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return withTime ? parsed.toLocaleString('ar-EG') : parsed.toLocaleDateString('ar-EG');
};

const getSaleDate = (sale) => sale?.invoiceDate || sale?.createdAt || null;

const formatDateRangeLabel = (dateRange) => {
  const from = dateRange?.from ? formatDate(dateRange.from) : null;
  const to = dateRange?.to ? formatDate(dateRange.to) : null;

  if (from && to) return `${from} - ${to}`;
  if (from) return `من ${from}`;
  if (to) return `إلى ${to}`;
  return 'كل الفترات';
};

export const generateLedgerHTML = (supplier, transactions, summary) => {
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const totalSales = Number(summary?.totalSales || 0);
  const totalReturns = Number(summary?.totalReturns || 0);
  const totalPayments = Number(summary?.totalPayments || 0);
  const totalRemaining = Number(summary?.totalRemaining || 0);
  const finalBalance = Number(summary?.finalBalance ?? supplier?.balance ?? 0);
  const finalBalanceClass =
    finalBalance > 0 ? 'danger' : finalBalance < 0 ? 'success' : 'neutral';

  const transactionRows = safeTransactions.length
    ? safeTransactions.map((transaction, index) => {
      const runningBalance = Number(transaction?.runningBalance || 0);
      const runningBalanceClass =
        runningBalance > 0 ? 'danger' : runningBalance < 0 ? 'success' : 'neutral';

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${formatDate(transaction?.date)}</td>
          <td>${escapeHtml(transaction?.description || '-')}</td>
          <td>${escapeHtml(transaction?.paymentMethodName || '-')}</td>
          <td class="amount-cell neutral">${formatMoney(transaction?.total || 0)}</td>
          <td class="amount-cell success">${formatMoney(transaction?.paid || 0)}</td>
          <td class="amount-cell danger">${formatMoney(transaction?.remaining || 0)}</td>
          <td class="amount-cell ${runningBalanceClass}">${formatMoney(runningBalance)}</td>
          <td class="notes-cell">${escapeHtml(transaction?.notes || '-')}</td>
        </tr>
      `;
    }).join('')
    : `
      <tr>
        <td colspan="9" class="empty-row">لا توجد معاملات في الفترة المحددة</td>
      </tr>
    `;

  return `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>كشف حساب - ${escapeHtml(supplier?.name || '-')}</title>
  <style>
    @page {
      size: A4;
      margin: 10mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: #f1f5f9;
      direction: rtl;
      font-family: "Segoe UI", Tahoma, Arial, sans-serif;
      color: #0f172a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      width: 100%;
      max-width: 190mm;
      margin: 8px auto;
      background: #ffffff;
      border: 1px solid #dbe3f0;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
    }

    .header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      flex-wrap: wrap;
    }

    .header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 800;
    }

    .header h2 {
      margin: 4px 0 0;
      font-size: 14px;
      color: #334155;
      font-weight: 700;
    }

    .header-meta {
      font-size: 12px;
      color: #475569;
      text-align: left;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 12px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .info-card {
      background: #f8fafc;
      border: 1px solid #dbe3f0;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 12px;
      line-height: 1.6;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 14px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .summary-card {
      border: 1px solid #dbe3f0;
      border-radius: 8px;
      padding: 8px;
      background: #ffffff;
      text-align: center;
    }

    .summary-label {
      color: #64748b;
      font-size: 11px;
      margin-bottom: 4px;
    }

    .summary-value {
      font-size: 14px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }

    .summary-value.success { color: #059669; }
    .summary-value.danger { color: #dc2626; }
    .summary-value.neutral { color: #334155; }

    .section-title {
      margin: 14px 0 8px;
      font-size: 15px;
      color: #0f172a;
      border-inline-start: 4px solid #2563eb;
      padding-inline-start: 8px;
      font-weight: 800;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      font-size: 11px;
      table-layout: fixed;
    }

    th, td {
      border: 1px solid #cbd5e1;
      padding: 5px 6px;
      text-align: right;
      vertical-align: top;
      word-break: break-word;
    }

    th {
      background: #f8fafc;
      color: #334155;
      font-weight: 700;
    }

    .amount-cell {
      font-variant-numeric: tabular-nums;
      font-weight: 700;
    }

    .amount-cell.success { color: #059669; }
    .amount-cell.danger { color: #dc2626; }
    .amount-cell.neutral { color: #334155; }

    .notes-cell {
      color: #334155;
      line-height: 1.45;
    }

    .empty-row {
      text-align: center;
      color: #64748b;
      padding: 12px;
      font-size: 12px;
    }

    .footer {
      margin-top: 14px;
      border-top: 1px solid #dbe3f0;
      padding-top: 8px;
      font-size: 11px;
      color: #64748b;
      text-align: center;
    }

    .print-button {
      border: none;
      border-radius: 8px;
      padding: 8px 16px;
      background: #2563eb;
      color: #fff;
      cursor: pointer;
      font-size: 13px;
      font-weight: 700;
      margin-top: 8px;
    }

    .print-button:hover {
      background: #1d4ed8;
    }

    @media print {
      body {
        background: #ffffff;
      }

      .page {
        margin: 0;
        max-width: none;
        border: none;
        border-radius: 0;
        box-shadow: none;
        padding: 0;
      }

      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="header">
      <div>
        <h1>ERP SYSTEM</h1>
        <h2>كشف حساب مورد</h2>
      </div>
      <div class="header-meta">
        <div><strong>المورد:</strong> ${escapeHtml(supplier?.name || '-')}</div>
        <div><strong>تاريخ الطباعة:</strong> ${formatDate(new Date(), true)}</div>
      </div>
    </header>

    <section class="info-grid">
      <div class="info-card">
        <div><strong>الاسم:</strong> ${escapeHtml(supplier?.name || '-')}</div>
        <div><strong>الهاتف:</strong> ${escapeHtml(supplier?.phone || '-')}</div>
        <div><strong>الهاتف 2:</strong> ${escapeHtml(supplier?.phone2 || '-')}</div>
      </div>
      <div class="info-card">
        <div><strong>العنوان:</strong> ${escapeHtml(supplier?.address || '-')}</div>
        <div><strong>ملاحظات المورد:</strong> ${escapeHtml(supplier?.notes || '-')}</div>
        <div><strong>الحد الائتماني:</strong> ${formatMoney(supplier?.creditLimit || 0)}</div>
      </div>
    </section>

    <section class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">إجمالي المشتريات</div>
        <div class="summary-value neutral">${formatMoney(totalSales)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">إجمالي المدفوعات</div>
        <div class="summary-value success">${formatMoney(totalPayments)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">إجمالي المرتجعات</div>
        <div class="summary-value success">${formatMoney(totalReturns)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">إجمالي المتبقي</div>
        <div class="summary-value danger">${formatMoney(totalRemaining)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">الرصيد الحالي</div>
        <div class="summary-value ${finalBalanceClass}">${formatMoney(finalBalance)}</div>
      </div>
    </section>

    <h3 class="section-title">حركة الحساب</h3>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>التاريخ</th>
          <th>البيان</th>
          <th>طريقة الدفع</th>
          <th>الإجمالي</th>
          <th>المدفوع</th>
          <th>المتبقي</th>
          <th>الرصيد</th>
          <th>ملاحظات</th>
        </tr>
      </thead>
      <tbody>
        ${transactionRows}
      </tbody>
    </table>

    <div class="footer">
      تم توليد التقرير من شاشة كشف حساب المورد
      <div class="no-print">
        <button class="print-button" onclick="if(window.electronAPI){window.electronAPI.triggerPrint()}else{window.print()}">
          طباعة كشف الحساب
        </button>
      </div>
    </div>
  </div>

  <script>
    document.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'p') {
        e.preventDefault();
      }
    });
  </script>
</body>
</html>
  `.trim();
};

export const generateDetailedLedgerA4HTML = ({
  supplier,
  purchases = [],
  returns = [],
  payments = [],
  summary = {},
  dateRange = { from: null, to: null }
} = {}) => {
  const safeSales = Array.isArray(purchases) ? purchases : [];
  const safeReturns = Array.isArray(returns) ? returns : [];
  const safePayments = Array.isArray(payments) ? payments : [];

  const totalSales = Number(
    summary?.totalSales ?? safeSales.reduce((sum, sale) => sum + Number(sale?.total || 0), 0)
  );
  const totalReturns = Number(
    summary?.totalReturns ?? safeReturns.reduce((sum, ret) => sum + Number(ret?.total || 0), 0)
  );
  const totalPayments = Number(
    summary?.totalPayments ??
      safePayments.reduce((sum, payment) => sum + Number(payment?.amount || 0), 0)
  );
  const totalRemaining = Number(
    summary?.totalRemaining ??
      safeSales.reduce((sum, sale) => {
        const remaining = Number(sale?.remainingAmount ?? sale?.remaining ?? 0);
        return sum + Math.max(0, remaining);
      }, 0)
  );
  const finalBalance = Number(summary?.finalBalance ?? supplier?.balance ?? 0);

  const purchasesSection = safeSales.length
    ? safeSales.map((sale, saleIndex) => {
        const items = Array.isArray(sale?.items) ? sale.items : [];
        const total = Number(sale?.total || 0);
        const remaining = Math.max(0, Number(sale?.remainingAmount ?? sale?.remaining ?? 0));
        const paid = Math.max(0, Number(sale?.paidAmount ?? sale?.paid ?? total - remaining));
        const discount = Number(sale?.discount || 0);

        const itemsRows = items.length
          ? items.map((item, itemIndex) => {
              const itemName = item?.variant?.product?.name || item?.productName || '-';
              const size = item?.variant?.productSize || '-';
              const color = item?.variant?.color || '-';
              const quantity = Number(item?.quantity || 0);
              const price = Number(item?.price ?? item?.unitPrice ?? 0);
              const itemDiscount = Number(item?.discount || 0);
              const lineTotal = Math.max(0, (price - itemDiscount) * quantity);

              return `
                <tr>
                  <td>${itemIndex + 1}</td>
                  <td>${escapeHtml(itemName)}</td>
                  <td>${escapeHtml(size)}</td>
                  <td>${escapeHtml(color)}</td>
                  <td>${quantity}</td>
                  <td>${formatMoney(price)}</td>
                  <td>${formatMoney(itemDiscount)}</td>
                  <td>${formatMoney(lineTotal)}</td>
                </tr>
              `;
            }).join('')
          : `
            <tr>
              <td colspan="8" class="empty-row">لا توجد أصناف على الفاتورة</td>
            </tr>
          `;

        return `
          <section class="invoice-block">
            <div class="invoice-head">
              <div><strong>فاتورة:</strong> #${sale?.id ?? '-'}</div>
              <div><strong>التاريخ:</strong> ${formatDate(getSaleDate(sale))}</div>
              <div><strong>النوع:</strong> ${escapeHtml(sale?.saleType || '-')}</div>
              <div><strong>الإجمالي:</strong> ${formatMoney(total)}</div>
              <div><strong>المدفوع:</strong> ${formatMoney(paid)}</div>
              <div><strong>المتبقي:</strong> ${formatMoney(remaining)}</div>
              <div><strong>خصم الفاتورة:</strong> ${formatMoney(discount)}</div>
            </div>

            <table class="details-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>الصنف</th>
                  <th>المقاس</th>
                  <th>اللون</th>
                  <th>الكمية</th>
                  <th>السعر</th>
                  <th>الخصم</th>
                  <th>الإجمالي</th>
                </tr>
              </thead>
              <tbody>${itemsRows}</tbody>
            </table>

            <div class="notes-row">
              <strong>ملاحظات:</strong> ${escapeHtml(sale?.notes || '-')}
            </div>
          </section>
          ${saleIndex < safeSales.length - 1 ? '<div class="invoice-separator"></div>' : ''}
        `;
      }).join('')
    : '<div class="empty-section">لا توجد فواتير في الفترة المحددة</div>';

  const paymentsRows = safePayments.length
    ? safePayments.map((payment, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>#${payment?.id ?? '-'}</td>
        <td>${formatDate(payment?.paymentDate || payment?.createdAt)}</td>
        <td>${escapeHtml(payment?.paymentMethod?.name || '-')}</td>
        <td>${formatMoney(payment?.amount)}</td>
        <td>${escapeHtml(payment?.notes || '-')}</td>
      </tr>
    `).join('')
    : `
      <tr>
        <td colspan="6" class="empty-row">لا توجد مدفوعات في الفترة المحددة</td>
      </tr>
    `;

  const returnsRows = safeReturns.length
    ? safeReturns.map((ret, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>#${ret?.id ?? '-'}</td>
        <td>${formatDate(ret?.createdAt)}</td>
        <td>${formatMoney(ret?.total)}</td>
        <td>${escapeHtml(ret?.notes || '-')}</td>
      </tr>
    `).join('')
    : `
      <tr>
        <td colspan="5" class="empty-row">لا توجد مرتجعات في الفترة المحددة</td>
      </tr>
    `;

  const finalBalanceClass =
    finalBalance > 0 ? 'danger' : finalBalance < 0 ? 'success' : 'neutral';

  return `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>تقرير كشف حساب تفصيلي - ${escapeHtml(supplier?.name || '-')}</title>
  <style>
    @page {
      size: A4;
      margin: 10mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: #f1f5f9;
      direction: rtl;
      font-family: "Segoe UI", Tahoma, Arial, sans-serif;
      color: #0f172a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      width: 100%;
      max-width: 190mm;
      margin: 8px auto;
      background: #ffffff;
      border: 1px solid #dbe3f0;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
    }

    .header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      flex-wrap: wrap;
    }

    .header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 800;
    }

    .header h2 {
      margin: 4px 0 0;
      font-size: 14px;
      color: #334155;
      font-weight: 700;
    }

    .header-meta {
      font-size: 12px;
      color: #475569;
      text-align: left;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 12px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .info-card {
      background: #f8fafc;
      border: 1px solid #dbe3f0;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 12px;
      line-height: 1.6;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 14px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .summary-card {
      border: 1px solid #dbe3f0;
      border-radius: 8px;
      padding: 8px;
      background: #ffffff;
      text-align: center;
    }

    .summary-label {
      color: #64748b;
      font-size: 11px;
      margin-bottom: 4px;
    }

    .summary-value {
      font-size: 14px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }

    .summary-value.success { color: #059669; }
    .summary-value.danger { color: #dc2626; }
    .summary-value.neutral { color: #334155; }

    .section-title {
      margin: 14px 0 8px;
      font-size: 15px;
      color: #0f172a;
      border-inline-start: 4px solid #2563eb;
      padding-inline-start: 8px;
      font-weight: 800;
    }

    .invoice-block {
      border: 1px solid #dbe3f0;
      border-radius: 8px;
      padding: 10px;
      margin-bottom: 10px;
      page-break-inside: avoid;
      break-inside: avoid;
      background: #ffffff;
    }

    .invoice-head {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px 10px;
      font-size: 12px;
      margin-bottom: 8px;
    }

    .invoice-separator {
      height: 4px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      font-size: 11px;
      table-layout: fixed;
    }

    th, td {
      border: 1px solid #cbd5e1;
      padding: 5px 6px;
      text-align: right;
      vertical-align: top;
      word-break: break-word;
    }

    th {
      background: #f8fafc;
      color: #334155;
      font-weight: 700;
    }

    .notes-row {
      margin-top: 8px;
      font-size: 12px;
      color: #334155;
      line-height: 1.55;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 6px 8px;
    }

    .empty-row,
    .empty-section {
      text-align: center;
      color: #64748b;
      padding: 12px;
      font-size: 12px;
    }

    .footer {
      margin-top: 14px;
      border-top: 1px solid #dbe3f0;
      padding-top: 8px;
      font-size: 11px;
      color: #64748b;
      text-align: center;
    }

    .print-button {
      border: none;
      border-radius: 8px;
      padding: 8px 16px;
      background: #2563eb;
      color: #fff;
      cursor: pointer;
      font-size: 13px;
      font-weight: 700;
      margin-top: 8px;
    }

    .print-button:hover {
      background: #1d4ed8;
    }

    @media print {
      body {
        background: #ffffff;
      }

      .page {
        margin: 0;
        max-width: none;
        border: none;
        border-radius: 0;
        box-shadow: none;
        padding: 0;
      }

      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="header">
      <div>
        <h1>ERP SYSTEM</h1>
        <h2>تقرير كشف حساب مورد تفصيلي</h2>
      </div>
      <div class="header-meta">
        <div><strong>المورد:</strong> ${escapeHtml(supplier?.name || '-')}</div>
        <div><strong>الفترة:</strong> ${escapeHtml(formatDateRangeLabel(dateRange))}</div>
        <div><strong>تاريخ الطباعة:</strong> ${formatDate(new Date(), true)}</div>
      </div>
    </header>

    <section class="info-grid">
      <div class="info-card">
        <div><strong>الاسم:</strong> ${escapeHtml(supplier?.name || '-')}</div>
        <div><strong>الهاتف:</strong> ${escapeHtml(supplier?.phone || '-')}</div>
        <div><strong>الهاتف 2:</strong> ${escapeHtml(supplier?.phone2 || '-')}</div>
      </div>
      <div class="info-card">
        <div><strong>العنوان:</strong> ${escapeHtml(supplier?.address || '-')}</div>
        <div><strong>تفاصيل المورد:</strong> ${escapeHtml(supplier?.notes || '-')}</div>
        <div><strong>الحد الائتماني:</strong> ${formatMoney(supplier?.creditLimit || 0)}</div>
      </div>
    </section>

    <section class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">إجمالي المشتريات</div>
        <div class="summary-value neutral">${formatMoney(totalSales)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">إجمالي المدفوعات</div>
        <div class="summary-value success">${formatMoney(totalPayments)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">إجمالي المرتجعات</div>
        <div class="summary-value success">${formatMoney(totalReturns)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">إجمالي المتبقي</div>
        <div class="summary-value danger">${formatMoney(totalRemaining)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">الرصيد الحالي</div>
        <div class="summary-value ${finalBalanceClass}">${formatMoney(finalBalance)}</div>
      </div>
    </section>

    <h3 class="section-title">الفواتير بالأصناف</h3>
    ${purchasesSection}

    <h3 class="section-title">المدفوعات</h3>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>رقم الدفعة</th>
          <th>التاريخ</th>
          <th>طريقة الدفع</th>
          <th>المبلغ</th>
          <th>ملاحظات</th>
        </tr>
      </thead>
      <tbody>${paymentsRows}</tbody>
    </table>

    <h3 class="section-title">المرتجعات</h3>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>رقم المرتجع</th>
          <th>التاريخ</th>
          <th>الإجمالي</th>
          <th>ملاحظات</th>
        </tr>
      </thead>
      <tbody>${returnsRows}</tbody>
    </table>

    <div class="footer">
      تم توليد التقرير من شاشة كشف حساب المورد
      <div class="no-print">
        <button class="print-button" onclick="if(window.electronAPI){window.electronAPI.triggerPrint()}else{window.print()}">
          طباعة التقرير
        </button>
      </div>
    </div>
  </div>

  <script>
    document.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'p') {
        e.preventDefault();
      }
    });
  </script>
</body>
</html>
  `.trim();
};
