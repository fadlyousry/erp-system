import React, { useEffect } from 'react';
import CustomerLedgerSmartTimeline from './CustomerLedgerSmartTimeline';

export default function CustomerLedgerSmartInsightModal({
  isOpen,
  onClose,
  customer,
  smartInsight
}) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="customer-ledger-insight-overlay" onClick={onClose}>
      <div className="customer-ledger-insight-modal" onClick={(e) => e.stopPropagation()}>
        <div className="customer-ledger-insight-header">
          <div>
            <h3 className="customer-ledger-insight-title">التقييم الذكي للعميل</h3>
            <div className="customer-ledger-insight-subtitle">{customer?.name || '-'}</div>
          </div>

          <button
            type="button"
            className="ledger-btn ledger-btn-light"
            onClick={onClose}
          >
            إغلاق
          </button>
        </div>

        <div className="customer-ledger-insight-modal-body">
          <CustomerLedgerSmartTimeline smartInsight={smartInsight} />
        </div>
      </div>
    </div>
  );
}
