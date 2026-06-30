import React from 'react';
import { Printer } from 'lucide-react';

const isFn = (value) => typeof value === 'function';

export default function TransactionActions({
  transaction,
  onPrintInvoice,
  onPrintReturn,
  onPrintReceipt,
  onEditSale,
  onEditReturn,
  onEditPayment,
  onDeleteSale,
  onDeleteReturn,
  onDeletePayment
}) {
  const type = transaction?.type;
  const details = transaction?.details;

  if (type === 'بيع') {
    return (
      <div className="ledger-actions-group">
        {isFn(onEditSale) && (
          <button
            type="button"
            onClick={() => onEditSale(transaction)}
            title="تعديل الفاتورة"
            className="ledger-action-btn is-edit"
          >
            ✎
          </button>
        )}

        {isFn(onPrintInvoice) && (
          <button
            type="button"
            onClick={() => onPrintInvoice(details)}
            title="طباعة الفاتورة"
            className="ledger-action-btn is-print"
          >
            <Printer size={14} />
          </button>
        )}

        {isFn(onDeleteSale) && (
          <button
            type="button"
            onClick={() => onDeleteSale(details)}
            title="حذف الفاتورة"
            className="ledger-action-btn is-delete"
          >
            ✖
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
            ✎
          </button>
        )}

        {isFn(onPrintReturn) && (
          <button
            type="button"
            onClick={() => onPrintReturn(details)}
            title="طباعة المرتجع"
            className="ledger-action-btn is-print"
          >
            <Printer size={14} />
          </button>
        )}

        {isFn(onDeleteReturn) && (
          <button
            type="button"
            onClick={() => onDeleteReturn(details)}
            title="حذف المرتجع"
            className="ledger-action-btn is-delete"
          >
            ✖
          </button>
        )}
      </div>
    );
  }

  if (type === 'دفعة') {
    return (
      <div className="ledger-actions-group">
        {isFn(onEditPayment) && (
          <button
            type="button"
            onClick={() => onEditPayment(transaction)}
            title="تعديل الدفعة"
            className="ledger-action-btn is-edit"
          >
            ✎
          </button>
        )}

        {isFn(onPrintReceipt) && (
          <button
            type="button"
            onClick={() => onPrintReceipt(details)}
            title="طباعة إيصال الدفع"
            className="ledger-action-btn is-receipt"
          >
            <Printer size={14} />
          </button>
        )}

        {isFn(onDeletePayment) && (
          <button
            type="button"
            onClick={() => onDeletePayment(details)}
            title="حذف الدفعة"
            className="ledger-action-btn is-delete"
          >
            ✖
          </button>
        )}
      </div>
    );
  }

  return <span className="ledger-action-empty">-</span>;
}
