import React, { useEffect } from 'react';
import SupplierLedgerSmartTimeline from './SupplierLedgerSmartTimeline';

export default function SupplierLedgerSmartInsightModal({
  isOpen,
  onClose,
  supplier,
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
            <h3 className="customer-ledger-insight-title">التقييم الذكي للمورد</h3>
            <div className="customer-ledger-insight-subtitle">{supplier?.name || '-'}</div>
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
          <SupplierLedgerSmartTimeline smartInsight={smartInsight} />
        </div>
      </div>
    </div>
  );
}
