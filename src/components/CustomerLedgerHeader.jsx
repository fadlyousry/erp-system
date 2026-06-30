import React, { useEffect, useState } from 'react';

const toInputDateValue = (date) => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseInputDate = (value, endOfDay = false) => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
};

export default function CustomerLedgerHeader({
  customer,
  onPrintLedger,
  onPrintDetailedLedger,
  onOpenSmartInsight,
  onClose,
  dateRange,
  onDateRangeChange,
  smartInsight,
  showSummary,
  setShowSummary,
  showFooter,
  setShowFooter,
  currentBalance,
  onEditCustomer
}) {
  const [allTime, setAllTime] = useState(() => !dateRange.from && !dateRange.to);
  const [localFrom, setLocalFrom] = useState(() => toInputDateValue(dateRange.from));
  const [localTo, setLocalTo] = useState(() => toInputDateValue(dateRange.to));

  useEffect(() => {
    const nextAllTime = !dateRange.from && !dateRange.to;
    setAllTime(nextAllTime);
    setLocalFrom(toInputDateValue(dateRange.from));
    setLocalTo(toInputDateValue(dateRange.to));
  }, [dateRange.from, dateRange.to]);

  const handleAllTimeToggle = (checked) => {
    setAllTime(checked);
    if (checked) {
      setLocalFrom('');
      setLocalTo('');
      onDateRangeChange({ from: null, to: null });
    } else {
      const today = toInputDateValue(new Date());
      setLocalFrom(today);
      setLocalTo(today);
    }
  };

  const handleSearch = () => {
    const parsedFrom = parseInputDate(localFrom);
    const parsedTo = parseInputDate(localTo, true);

    if (parsedFrom && parsedTo && parsedFrom > parsedTo) {
      onDateRangeChange({
        from: parseInputDate(localTo),
        to: parseInputDate(localFrom, true)
      });
      return;
    }

    onDateRangeChange({
      from: parsedFrom,
      to: parsedTo
    });
  };

  const smartScore = Number.isFinite(Number(smartInsight?.score))
    ? Math.round(Number(smartInsight.score))
    : 0;

  return (
    <div className="customer-ledger-header">
      <div className="customer-ledger-header-main">
        <div style={{ flex: 1 }}>
          <h2 className="customer-ledger-title" style={{ color: '#1e3a8a', fontSize: '28px', fontWeight: '900' }}>
            كشف حساب : {customer?.name || '-'}
          </h2>
        </div>

        <div className="customer-ledger-actions">
          <button onClick={onOpenSmartInsight} className="ledger-btn ledger-btn-insight">
            التقييم الذكي {smartScore}/100
          </button>
          <button onClick={() => onEditCustomer && onEditCustomer(customer)} className="ledger-btn ledger-btn-insight" style={{ background: '#f59e0b', borderColor: '#d97706' }}>
            تعديل البيانات
          </button>
          <button onClick={onPrintLedger} className="ledger-btn ledger-btn-primary">
            طباعة الكشف
          </button>
          <button onClick={onPrintDetailedLedger} className="ledger-btn ledger-btn-accent">
            تقرير تفصيلي A4
          </button>
          <button onClick={onClose} className="ledger-btn ledger-btn-secondary">
            إغلاق
          </button>
        </div>
      </div>

      <div className="customer-ledger-filter-row">
        <div className="customer-ledger-filter-main">
          <div className="customer-ledger-filter-fields">
            <label className="ledger-alltime-toggle">
              <input
                type="checkbox"
                checked={allTime}
                onChange={(e) => handleAllTimeToggle(e.target.checked)}
              />
              <span>كل الفترة</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 12px', background: showSummary ? '#ecfdf5' : '#f8fafc', border: '1px solid', borderColor: showSummary ? '#10b981' : '#e2e8f0', borderRadius: '8px', transition: 'all 0.2s' }}>
              <input
                type="checkbox"
                checked={showSummary}
                onChange={(e) => setShowSummary(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: '13px', fontWeight: '600', color: showSummary ? '#065f46' : '#64748b' }}>بيانات العميل</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 12px', background: showFooter ? '#eff6ff' : '#f8fafc', border: '1px solid', borderColor: showFooter ? '#3b82f6' : '#e2e8f0', borderRadius: '8px', transition: 'all 0.2s' }}>
              <input
                type="checkbox"
                checked={showFooter}
                onChange={(e) => setShowFooter(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: '13px', fontWeight: '600', color: showFooter ? '#1e40af' : '#64748b' }}>الإجماليات</span>
            </label>

            <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 8px' }} />

            <label htmlFor="ledger-date-from">من</label>
            <input
              id="ledger-date-from"
              type="date"
              className={`ledger-input ${allTime ? 'ledger-input-disabled' : ''}`}
              value={allTime ? '' : localFrom}
              disabled={allTime}
              onChange={(e) => setLocalFrom(e.target.value)}
            />

            <label htmlFor="ledger-date-to">إلى</label>
            <input
              id="ledger-date-to"
              type="date"
              className={`ledger-input ${allTime ? 'ledger-input-disabled' : ''}`}
              value={allTime ? '' : localTo}
              disabled={allTime}
              onChange={(e) => setLocalTo(e.target.value)}
            />

            {!allTime && (
              <button
                onClick={handleSearch}
                className="ledger-btn ledger-btn-primary"
              >
                بحث
              </button>
            )}
          </div>
        </div>

        {/* عرض الرصيد المتبقي بتصميم بريميوم (بشكل عرضي) */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'row', 
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          padding: '8px 16px',
          background: currentBalance > 0 ? '#fff1f2' : currentBalance === 0 ? '#f0fdf4' : '#eff6ff',
          border: '1px solid',
          borderColor: currentBalance > 0 ? '#fecaca' : currentBalance === 0 ? '#bbf7d0' : '#bfdbfe',
          borderRadius: '12px',
          minWidth: '220px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          marginLeft: '4px'
        }}>
          <span style={{ 
            fontSize: '13px', 
            color: currentBalance > 0 ? '#9f1239' : currentBalance === 0 ? '#065f46' : '#1e40af', 
            fontWeight: '800', 
            opacity: 0.8
          }}>
            الرصيد المتبقي:
          </span>
          <span style={{ 
            fontSize: '26px', 
            fontWeight: '1000', 
            color: currentBalance > 0 ? '#be123c' : currentBalance === 0 ? '#047857' : '#1d4ed8',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em'
          }}>
            {(currentBalance || 0).toLocaleString('ar-EG')}
          </span>
        </div>
      </div>
    </div>
  );
}
