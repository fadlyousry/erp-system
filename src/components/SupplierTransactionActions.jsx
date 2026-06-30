import React from 'react';

const isFn = (value) => typeof value === 'function';

export default function SupplierTransactionActions({
  transaction,
  onPrintInvoice,
  onPrintReturn,
  onPrintReceipt,
  onEditPurchase,
  onEditReturn,
  onEditPayment,
  onDeletePurchase,
  onDeleteReturn,
  onDeletePayment
}) {
  const type = transaction?.type;
  const details = transaction?.details;

  if (type === 'مشتريات') {
    return (
      <div className="ledger-actions-group">
        {isFn(onEditPurchase) && (
          <button
            type="button"
            onClick={() => onEditPurchase(transaction)}
            title="تعديل الفاتورة"
            className="ledger-action-btn is-edit"
          >
            ✏️
          </button>
        )}

        {isFn(onPrintInvoice) && (
          <button
            type="button"
            onClick={() => onPrintInvoice(details)}
            title="طباعة الفاتورة"
            className="ledger-action-btn is-print"
          >
            🖨️
          </button>
        )}

        {isFn(onDeletePurchase) && (
          <button
            type="button"
            onClick={() => onDeletePurchase(details)}
            title="حذف الفاتورة"
            className="ledger-action-btn is-delete"
          >
            🗑️
          </button>
        )}
      </div>
    );
  }

  if (type === 'مرتجع') {
    return (
      <div className="ledger-actions-group">
        {isFn(onEditReturn) && (
          <button
            type="button"
            onClick={() => onEditReturn(transaction)}
            title="تعديل المرتجع"
            className="ledger-action-btn is-edit"
          >
            ✏️
          </button>
        )}

        {isFn(onPrintReturn) && (
          <button
            type="button"
            onClick={() => onPrintReturn(details)}
            title="طباعة المرتجع"
            className="ledger-action-btn is-print"
          >
            🖨️
          </button>
        )}

        {isFn(onDeleteReturn) && (
          <button
            type="button"
            onClick={() => onDeleteReturn(details)}
            title="حذف المرتجع"
            className="ledger-action-btn is-delete"
          >
            🗑️
          </button>
        )}
      </div>
    );
  }

  if (type === 'سداد') {
    return (
      <div className="ledger-actions-group">
        {isFn(onEditPayment) && (
          <button
            type="button"
            onClick={() => onEditPayment(transaction)}
            title="تعديل السداد"
            className="ledger-action-btn is-edit"
          >
            ✏️
          </button>
        )}

        {isFn(onPrintReceipt) && (
          <button
            type="button"
            onClick={() => onPrintReceipt(details)}
            title="طباعة إيصال السداد"
            className="ledger-action-btn is-receipt"
          >
            🖨️
          </button>
        )}

        {isFn(onDeletePayment) && (
          <button
            type="button"
            onClick={() => onDeletePayment(details)}
            title="حذف السداد"
            className="ledger-action-btn is-delete"
          >
            🗑️
          </button>
        )}
      </div>
    );
  }

  return <span className="ledger-action-empty">-</span>;
}
