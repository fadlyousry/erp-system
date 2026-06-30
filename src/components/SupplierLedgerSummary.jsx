import React from "react";
import { Phone, Smartphone, MapPin, Info, Wallet, Hash } from "lucide-react";

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString("ar-EG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const formatInteger = (value) => Number(value || 0).toLocaleString("ar-EG");

export default function SupplierLedgerSummary({ supplier, transactions }) {
  const supplierDetails = supplier?.notes || "-";

  const summaryCards = [
    {
      icon: <Phone size={18} />,
      label: "الهاتف",
      value: supplier?.phone || "-",
      type: "muted",
      gradient: "linear-gradient(180deg, #93c5fd, #2563eb)",
    },
    {
      icon: <Smartphone size={18} />,
      label: "الهاتف 2",
      value: supplier?.phone2 || "-",
      type: "muted",
      gradient: "linear-gradient(180deg, #bfdbfe, #3b82f6)",
    },
    {
      icon: <MapPin size={18} />,
      label: "العنوان",
      value: supplier?.address || "-",
      type: "text",
      gradient: "linear-gradient(180deg, #67e8f9, #0891b2)",
    },
    {
      icon: <Info size={18} />,
      label: "تفاصيل المورد",
      value: supplierDetails,
      type: "text",
      gradient: "linear-gradient(180deg, #a7f3d0, #10b981)",
    },
    {
      icon: <Wallet size={18} />,
      label: "الحد الائتماني",
      value: formatCurrency(supplier?.creditLimit || 0),
      type: "accent",
      gradient: "linear-gradient(180deg, #fde68a, #d97706)",
    },
    {
      icon: <Hash size={18} />,
      label: "عدد المعاملات",
      value: formatInteger(transactions?.length || 0),
      type: "normal",
      gradient: "linear-gradient(180deg, #c4b5fd, #7c3aed)",
    },
  ];

  return (
    <div className="customer-ledger-summary">
      <div className="customer-ledger-summary-grid">
        {summaryCards.map((card, idx) => (
          <div key={idx} className="ledger-summary-card" style={{ "--card-gradient": card.gradient }}>
            <div className="ledger-summary-icon" style={{ color: card.gradient.split(",")[1].trim().replace(")", "") }}>
              {card.icon}
            </div>
            <div className="ledger-summary-content">
              <div className="ledger-summary-label">{card.label}</div>
              <div className={`ledger-summary-value ${card.type === 'muted' ? 'ledger-summary-value-muted' : ''} ${card.type === 'text' ? 'ledger-summary-value-text' : ''} ${card.type === 'accent' ? 'ledger-summary-value-accent' : ''}`}>
                {card.value}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
