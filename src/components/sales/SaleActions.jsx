import React, { memo, useState } from 'react';
import { usePermissions } from '../../context/PermissionsContext';

function SaleActions({
  sale,
  onView,
  onPrint,
  onEdit,
  onDelete
}) {
  const [pendingAction, setPendingAction] = useState(null);
  const { hasPermission } = usePermissions();

  const runAction = async (actionKey, handler) => {
    if (pendingAction) return;

    // Verify permission before running the action
    if (actionKey === 'print' && !hasPermission('sales:print')) return;
    if (actionKey === 'edit' && !hasPermission('sales:edit')) return;
    if (actionKey === 'delete' && !hasPermission('sales:delete')) return;

    setPendingAction(actionKey);
    try {
      await handler?.(sale);
    } finally {
      setPendingAction(null);
    }
  };

  const isDisabled = Boolean(pendingAction);
  const canPrint = hasPermission('sales:print');
  const canEdit = hasPermission('sales:edit');
  const canDelete = hasPermission('sales:delete');

  return (
    <div className="sales-actions-cell">
      <button
        className="sales-action-btn"
        onClick={() => runAction('view', onView)}
        disabled={isDisabled}
        title="عرض التفاصيل"
        aria-label="عرض التفاصيل"
      >
        ▤
      </button>
      <button
        className="sales-action-btn is-print"
        onClick={() => runAction('print', onPrint)}
        disabled={isDisabled || !canPrint}
        title={canPrint ? "طباعة الفاتورة" : "غير مسموح بالطباعة"}
        aria-label="طباعة الفاتورة"
        style={{
          opacity: canPrint ? 1 : 0.4,
          cursor: canPrint ? 'pointer' : 'not-allowed'
        }}
      >
        ⎙
      </button>
      <button
        className="sales-action-btn is-edit"
        onClick={() => runAction('edit', onEdit)}
        disabled={isDisabled || !canEdit}
        title={canEdit ? "تعديل الفاتورة" : "غير مسموح بالتعديل"}
        aria-label="تعديل الفاتورة"
        style={{
          opacity: canEdit ? 1 : 0.4,
          cursor: canEdit ? 'pointer' : 'not-allowed'
        }}
      >
        ✎
      </button>
      <button
        className="sales-action-btn is-delete"
        onClick={() => runAction('delete', onDelete)}
        disabled={isDisabled || !canDelete}
        title={canDelete ? "حذف الفاتورة" : "غير مسموح بالحذف"}
        aria-label="حذف الفاتورة"
        style={{
          opacity: canDelete ? 1 : 0.4,
          cursor: canDelete ? 'pointer' : 'not-allowed'
        }}
      >
        ✖
      </button>
    </div>
  );
}

export default memo(SaleActions);
