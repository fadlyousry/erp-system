import React from "react";
import SupplierLedgerModal from "../components/SupplierLedgerModal";

export default function SupplierLedger({ supplierId, onClose, onDataChanged, onEditSupplier }) {
    if (!supplierId) return null;

    return (
        <SupplierLedgerModal
            supplierId={supplierId}
            onClose={onClose}
            onDataChanged={onDataChanged}
            onSupplierUpdated={() => onDataChanged?.()}
            onEditSupplier={onEditSupplier}
        />
    );
}
