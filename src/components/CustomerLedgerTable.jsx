import React, { useState, useMemo } from "react";
import TransactionActions from "./TransactionActions";

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString("ar-EG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const formatRowNumber = (value) => Number(value || 0).toLocaleString("ar-EG");

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

export default function CustomerLedgerTable({
  transactions,
  onPrintInvoice,
  onPrintReturn,
  onPrintReceipt,
  onEditSale,
  onEditReturn,
  onEditPayment,
  onDeleteSale,
  onDeleteReturn,
  onDeletePayment,
}) {
  const PAGE_SIZE = 50;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
  const pagedTransactions = useMemo(
    () => transactions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [transactions, currentPage]
  );

  // Reset page when transactions change
  React.useEffect(() => { setCurrentPage(1); }, [transactions.length]);

  return (
    <div className="customer-ledger-table-wrap">
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', marginBottom: '6px', fontSize: '13px' }}>
          <button 
            style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }} 
            disabled={currentPage <= 1} 
            onClick={() => setCurrentPage(p => p - 1)}
          >
            →
          </button>
          <span style={{ color: '#64748b', fontWeight: 'bold' }}>{currentPage} / {totalPages} ({transactions.length} عملية)</span>
          <button 
            style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }} 
            disabled={currentPage >= totalPages} 
            onClick={() => setCurrentPage(p => p + 1)}
          >
            ←
          </button>
        </div>
      )}
      <table className="customer-ledger-table">
        <thead>
          <tr>
            <th>{"\u0627\u0644\u062a\u0627\u0631\u064a\u062e"}</th>
            <th>{"\u0627\u0644\u0628\u064a\u0627\u0646"}</th>
            <th style={{ textAlign: "center" }}>
              {"\u0637\u0631\u064a\u0642\u0629 \u0627\u0644\u062f\u0641\u0639"}
            </th>
            <th style={{ textAlign: "center" }}>
              {"\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a"}
            </th>
            <th style={{ textAlign: "center" }}>
              {"\u0627\u0644\u0645\u062f\u0641\u0648\u0639"}
            </th>
            <th style={{ textAlign: "center" }}>
              {"\u0627\u0644\u0645\u062a\u0628\u0642\u064a"}
            </th>
            <th style={{ textAlign: "center" }}>
              {"\u0627\u0644\u0631\u0635\u064a\u062f"}
            </th>
            <th>{"\u0645\u0644\u0627\u062d\u0638\u0627\u062a"}</th>
            <th style={{ textAlign: "center" }}>
              {"\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645"}
            </th>
            <th style={{ textAlign: "center" }}>
              {"\u0625\u062c\u0631\u0627\u0621\u0627\u062a"}
            </th>
          </tr>
        </thead>

        <tbody>
          {transactions.length === 0 ? (
            <tr>
              <td colSpan="10" className="ledger-empty-state">
                {"\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u0639\u0627\u0645\u0644\u0627\u062a \u0641\u064a \u0627\u0644\u0641\u062a\u0631\u0629 \u0627\u0644\u0645\u062d\u062f\u062f\u0629"}
              </td>
            </tr>
          ) : (
            pagedTransactions.map((transaction, index) => {
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
                    <TransactionActions
                      transaction={transaction}
                      onPrintInvoice={onPrintInvoice}
                      onPrintReturn={onPrintReturn}
                      onPrintReceipt={onPrintReceipt}
                      onEditSale={onEditSale}
                      onEditReturn={onEditReturn}
                      onEditPayment={onEditPayment}
                      onDeleteSale={onDeleteSale}
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
