import React from "react";
import SupplierTransactionActions from "./SupplierTransactionActions";

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString("ar-EG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const formatDateTime = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const datePart = date.toLocaleDateString("ar-EG");
  const timePart = date.toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${datePart} ${timePart}`;
};

export default function SupplierLedgerTable({
  transactions,
  onPrintInvoice,
  onPrintReturn,
  onPrintReceipt,
  onEditPurchase,
  onEditReturn,
  onEditPayment,
  onDeletePurchase,
  onDeleteReturn,
  onDeletePayment,
}) {
  return (
    <div className="customer-ledger-table-wrap">
      <table className="customer-ledger-table">
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>البيان</th>
            <th style={{ textAlign: "center" }}>طريقة السداد</th>
            <th style={{ textAlign: "center" }}>الإجمالي</th>
            <th style={{ textAlign: "center" }}>المدفوع</th>
            <th style={{ textAlign: "center" }}>المتبقي</th>
            <th style={{ textAlign: "center" }}>رصيد المورد</th>
            <th>ملاحظات</th>
            <th style={{ textAlign: "center" }}>المستخدم</th>
            <th style={{ textAlign: "center" }}>إجراءات</th>
          </tr>
        </thead>

        <tbody>
          {transactions.length === 0 ? (
            <tr>
              <td colSpan="10" className="ledger-empty-state">
                لا توجد حركات في الفترة المحددة للمورد
              </td>
            </tr>
          ) : (
            transactions.map((transaction) => {
              const remainingClass =
                transaction.remaining > 0
                  ? "ledger-money-remaining-debit"
                  : "ledger-money-remaining-credit";
              const notesText = transaction.notes?.trim() || "-";

              const runningBalance = Number(transaction.runningBalance || 0);
              const runningBalanceClass =
                runningBalance > 0
                  ? "ledger-balance-debit"
                  : runningBalance < 0
                    ? "ledger-balance-credit"
                    : "ledger-balance-neutral";

              return (
                <tr key={transaction.id}>
                  <td className="ledger-cell-date">
                    <div className="ledger-cell-date-main">{formatDateTime(transaction.date)}</div>
                  </td>

                  <td className="ledger-cell-description">{transaction.description}</td>

                  <td style={{ textAlign: "center" }}>
                    {transaction.paymentMethodName || "-"}
                  </td>

                  <td className="ledger-money-cell">{formatCurrency(transaction.total)}</td>

                  <td className="ledger-money-cell ledger-money-paid">
                    {formatCurrency(transaction.paid)}
                  </td>

                  <td className={`ledger-money-cell ${remainingClass}`}>
                    {formatCurrency(transaction.remaining)}
                  </td>

                  <td className={`ledger-money-cell ${runningBalanceClass}`}>
                    {formatCurrency(runningBalance)}
                  </td>

                  <td className="ledger-cell-notes">
                    <span className="ledger-cell-notes-text" title={notesText}>
                      {notesText}
                    </span>
                  </td>

                  <td style={{ textAlign: "center", fontSize: "0.85em", color: "#666" }}>
                    {transaction.createdByUser?.name || "-"}
                  </td>

                  <td className="ledger-cell-actions" style={{ textAlign: "center" }}>
                    <SupplierTransactionActions
                      transaction={transaction}
                      onPrintInvoice={onPrintInvoice}
                      onPrintReturn={onPrintReturn}
                      onPrintReceipt={onPrintReceipt}
                      onEditPurchase={onEditPurchase}
                      onEditReturn={onEditReturn}
                      onEditPayment={onEditPayment}
                      onDeletePurchase={onDeletePurchase}
                      onDeleteReturn={onDeleteReturn}
                      onDeletePayment={onDeletePayment}
                    />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
