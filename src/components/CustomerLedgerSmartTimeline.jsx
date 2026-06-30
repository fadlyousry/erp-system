import React from 'react';

const formatCurrency = (value) => `${Number(value || 0).toFixed(2)} ج.م`;

const toneClassMap = {
  good: 'ledger-smart-badge-good',
  warn: 'ledger-smart-badge-warn',
  bad: 'ledger-smart-badge-bad',
  danger: 'ledger-smart-badge-danger'
};

export default function CustomerLedgerSmartTimeline({ smartInsight }) {
  if (!smartInsight) return null;

  const badgeClass = toneClassMap[smartInsight.tone] || 'ledger-smart-badge-neutral';
  const timeline = Array.isArray(smartInsight.timeline) ? smartInsight.timeline : [];

  return (
    <div className="customer-ledger-smart-wrap">
      <div className="customer-ledger-smart-header">
        <div>
          <div className="customer-ledger-smart-title">التحليل الذكي - آخر 6 شهور</div>
          <div className="customer-ledger-smart-subtitle">{smartInsight.pattern}</div>
        </div>

        <div className="customer-ledger-smart-score">
          <span className={`ledger-smart-badge ${badgeClass}`}>
            {smartInsight.classification}
          </span>
          <div className="customer-ledger-smart-score-value">
            {smartInsight.score}
            <span>/100</span>
          </div>
        </div>
      </div>

      <div className="customer-ledger-smart-reasons">
        {(smartInsight.reasons || []).map((reason, index) => (
          <span key={`${reason}-${index}`} className="customer-ledger-smart-reason-item">
            {reason}
          </span>
        ))}
      </div>

      <div className="customer-ledger-smart-table-wrap">
        <table className="customer-ledger-smart-table">
          <thead>
            <tr>
              <th>الشهر</th>
              <th style={{ textAlign: 'center' }}>المستحق</th>
              <th style={{ textAlign: 'center' }}>المدفوع</th>
              <th style={{ textAlign: 'center' }}>مرات السداد</th>
              <th style={{ textAlign: 'center' }}>أيام التأخير</th>
              <th style={{ textAlign: 'center' }}>حالة الشهر</th>
            </tr>
          </thead>
          <tbody>
            {timeline.length === 0 ? (
              <tr>
                <td className="ledger-smart-empty" colSpan="6">
                  لا توجد بيانات كافية للتحليل
                </td>
              </tr>
            ) : (
              timeline.map((monthRow) => (
                <tr key={monthRow.key}>
                  <td>{monthRow.label}</td>
                  <td className="ledger-smart-money-cell">
                    {formatCurrency(monthRow.dueAmount)}
                  </td>
                  <td className="ledger-smart-money-cell ledger-smart-money-paid">
                    {formatCurrency(monthRow.paidAmount)}
                  </td>
                  <td className="ledger-smart-center-cell">{monthRow.paymentEvents}</td>
                  <td className="ledger-smart-center-cell">
                    {monthRow.hadObligation ? `${monthRow.delayDays} يوم` : '-'}
                  </td>
                  <td className="ledger-smart-center-cell">
                    <span className="ledger-smart-month-status">{monthRow.statusLabel}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
