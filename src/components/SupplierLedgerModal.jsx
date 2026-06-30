import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ShoppingCart, CheckCircle, AlertCircle, Scale } from 'lucide-react';
import { safeAlert } from '../utils/safeAlert';
import { safeConfirm } from '../utils/safeConfirm';
import { SupplierLedgerService } from '../services/supplierLedgerService';
import { safePrint } from '../../printing/safePrint';
import { generateLedgerHTML as generateSupplierLedgerHTML, generateDetailedLedgerA4HTML as generateDetailedSupplierLedgerA4HTML } from '../../printing/supplierLedgerTemplate';
import { generatePurchaseInvoiceHTML } from '../../printing/generators/purchaseInvoiceGenerator';
import { generatePurchaseReturnInvoiceHTML } from '../../printing/generators/purchaseReturnGenerator';
import { generateReceiptHTML } from '../../printing/generators/paymentReceiptGenerator';
import { emitPurchaseEditorRequest, emitPurchaseReturnEditorRequest } from '../utils/posEditorBridge';
import PaymentModal from './PaymentModal';
import SupplierLedgerHeader from './SupplierLedgerHeader';
import SupplierLedgerSummary from './SupplierLedgerSummary';
import SupplierLedgerSmartInsightModal from './SupplierLedgerSmartInsightModal';
import SupplierLedgerTable from './SupplierLedgerTable';
import { getLocalDateString } from '../utils/dateUtils';
import './CustomerLedger.css';
// Assuming SupplierLedger will reuse CustomerLedger.css for styling. If needed, I will create a separate one or we can just reuse the classes.

const formatCurrency = (value) => Number(value || 0).toLocaleString('ar-EG', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

export default function SupplierLedgerModal({
  supplierId,
  onClose,
  onSupplierUpdated,
  onDataChanged,
  onEditSupplier
}) {
  const [supplier, setSupplier] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [returns, setReturns] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentEditModal, setShowPaymentEditModal] = useState(false);
  const [showSmartInsightModal, setShowSmartInsightModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [showSummary, setShowSummary] = useState(false);
  const [showFooter, setShowFooter] = useState(false);

  const loadSupplierData = useCallback(async () => {
    try {
      // NOTE: getSuppliers is available. We can filter. 
      // If there is no getSupplier(id), we use getSuppliers and find.
      const suppliersData = await window.api.getSuppliers();
      const currentSupplier = Array.isArray(suppliersData) ? suppliersData.find(s => s.id === supplierId) : null;
      
      const [purchasesData, returnsData, paymentsData] = await Promise.all([
        window.api.getPurchases({ supplierId }),
        window.api.getPurchaseReturns({ supplierId }),
        window.api.getSupplierPayments(supplierId)
      ]);

      if (!currentSupplier) throw new Error("المورد غير موجود");
      if (purchasesData.error) throw new Error(purchasesData.error);
      if (returnsData.error) throw new Error(returnsData.error);
      if (paymentsData.error) throw new Error(paymentsData.error);

      setSupplier(currentSupplier);
      
      // Some API methods might return not exact filtering if options aren't fully respected, so doing manual filter just in case.
      const pData = Array.isArray(purchasesData) ? purchasesData.filter(p => p.supplierId === supplierId) : purchasesData?.data?.filter(p => p.supplierId === supplierId) || [];
      const rData = Array.isArray(returnsData) ? returnsData.filter(r => r.supplierId === supplierId) : returnsData?.data?.filter(r => r.supplierId === supplierId) || [];

      setPurchases(pData);
      setReturns(rData);
      setPayments(paymentsData || []);
    } catch (err) {
      console.error('Failed to load supplier ledger data:', err.message);
      setSupplier(null);
      setPurchases([]);
      setReturns([]);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    loadSupplierData();
  }, [loadSupplierData]);

  const allTransactions = useMemo(() => {
    const ledgerRows = SupplierLedgerService.buildLedgerTransactions(purchases, returns, payments);
    return SupplierLedgerService.attachRunningBalance(ledgerRows, supplier?.balance || 0);
  }, [purchases, returns, payments, supplier?.balance]);

  const transactions = useMemo(() => {
    return SupplierLedgerService.filterByDateRange(
      allTransactions,
      dateRange.from,
      dateRange.to
    );
  }, [allTransactions, dateRange.from, dateRange.to]);

  const summary = useMemo(() => {
    return SupplierLedgerService.calculateSummary(transactions, supplier?.balance || 0);
  }, [transactions, supplier?.balance]);

  const smartInsight = useMemo(() => {
    return SupplierLedgerService.buildSmartPaymentInsight(supplier, purchases, payments, returns, {
      months: 6
    });
  }, [supplier, purchases, payments, returns]);

  const paymentEditModalSupplier = useMemo(() => {
    if (!supplier || !editingPayment) return null;
    const originalAmount = Number(editingPayment.amount || 0);
    return {
      ...supplier,
      balance: Number(supplier.balance || 0) - originalAmount
    };
  }, [supplier, editingPayment]);

  const paymentEditData = useMemo(() => ({
    amount: editingPayment?.amount ?? '',
    notes: editingPayment?.notes || '',
    paymentDate: editingPayment?.paymentDate || getLocalDateString(),
    paymentMethodId: 1
  }), [editingPayment]);

  const handlePrintInvoice = async (purchase) => {
    if (!purchase?.id) return;
    
    let fullPurchase = purchase;
    // If items are missing, fetch the full purchase details for accurate printing
    if (!Array.isArray(purchase.items) || purchase.items.length === 0) {
      const result = await window.api.getPurchaseById(purchase.id);
      if (result && !result.error) {
        fullPurchase = result;
      }
    }

    const html = generatePurchaseInvoiceHTML(fullPurchase);
    const result = await safePrint(html, { title: `فاتورة مشتريات #${fullPurchase.id}` });
    if (result.error) {
      await safeAlert('خطأ في الطباعة: ' + result.error);
    }
  };

  const handlePrintReturn = async (returnInvoice) => {
    if (!returnInvoice?.id) return;
    
    let fullReturn = returnInvoice;
    if (!Array.isArray(returnInvoice.items) || returnInvoice.items.length === 0) {
      const result = await window.api.getPurchaseReturnById(returnInvoice.id);
      if (result && !result.error) {
        fullReturn = result;
      }
    }

    const html = generatePurchaseReturnInvoiceHTML(fullReturn, supplier);
    const result = await safePrint(html, { title: `مرتجع مشتريات #${fullReturn.id}` });
    if (result.error) {
      await safeAlert('خطأ في الطباعة: ' + result.error);
    }
  };

  const handlePrintReceipt = async (payment) => {
    if (!payment?.id) return;
    
    // Payments usually have enough info in the summary, but we ensure helper fields for receipt
    const html = generateReceiptHTML(payment, supplier);
    const result = await safePrint(html, { title: `إيصال سداد مورد #${payment.id}` });
    if (result.error) {
      await safeAlert('خطأ في الطباعة: ' + result.error);
    }
  };

  const handlePrintLedger = async () => {
    const html = generateSupplierLedgerHTML(supplier, transactions, summary);
    const result = await safePrint(html, { title: `كشف حساب ${supplier?.name}` });

    if (result.error) {
      await safeAlert('خطأ في الطباعة: ' + result.error);
    }
  };

  const handlePrintDetailedLedger = async () => {
    const html = generateDetailedSupplierLedgerA4HTML({
      supplier,
      purchases,
      returns,
      payments,
      summary,
      dateRange
    });

    const result = await safePrint(html, {
      title: `تقرير كشف حساب تفصيلي ${supplier?.name || ''}`.trim()
    });

    if (result.error) {
      await safeAlert('خطأ في الطباعة: ' + result.error);
    }
  };

  const handleDeletePurchase = async (purchase) => {
    const confirmed = await safeConfirm(
      `هل تريد حذف فاتورة المشتريات رقم ${purchase.id}؟`,
      { title: 'تأكيد الحذف', detail: 'لا يمكن التراجع' }
    );

    if (!confirmed) return;

    try {
      const result = await window.api.deletePurchase(purchase.id);
      if (result.error) {
        await safeAlert('خطأ: ' + result.error);
        return;
      }
      onDataChanged?.();
      await safeAlert('✅ تم حذف الفاتورة بنجاح');
      await loadSupplierData();
    } catch (err) {
      await safeAlert('خطأ في الحذف: ' + err.message);
    }
  };

  const handleDeleteReturn = async (returnInvoice) => {
    const confirmed = await safeConfirm(
      `هل تريد حذف مرتجع المشتريات رقم ${returnInvoice.id}؟`,
      { title: 'تأكيد الحذف', detail: 'لا يمكن التراجع' }
    );

    if (!confirmed) return;

    try {
      const result = await window.api.deletePurchaseReturn(returnInvoice.id);
      if (result.error) {
        await safeAlert('خطأ: ' + result.error);
        return;
      }
      onDataChanged?.();
      await safeAlert('✅ تم حذف المرتجع بنجاح');
      await loadSupplierData();
    } catch (err) {
      await safeAlert('خطأ في الحذف: ' + err.message);
    }
  };

  const handleDeletePayment = async (payment) => {
    const confirmed = await safeConfirm(
      `هل تريد حذف السداد رقم ${payment.id}؟`,
      { title: 'تأكيد الحذف', detail: 'لا يمكن التراجع' }
    );

    if (!confirmed) return;

    try {
      const result = await window.api.deleteSupplierPayment(payment.id);
      if (result.error) {
        await safeAlert('خطأ: ' + result.error);
        return;
      }
      onDataChanged?.();
      await safeAlert('✅ تم حذف السداد بنجاح');
      await loadSupplierData();
    } catch (err) {
      await safeAlert('خطأ في الحذف: ' + err.message);
    }
  };

  const handleEditPurchase = (transaction) => {
    const purchase = transaction?.details;
    if (!purchase?.id) return;
    emitPurchaseEditorRequest({ type: 'purchase', transaction, supplier });
    onClose?.();
  };

  const handleEditReturn = (transaction) => {
    const returnInvoice = transaction?.details;
    if (!returnInvoice?.id) return;
    emitPurchaseReturnEditorRequest({ type: 'return', transaction, supplier });
    onClose?.();
  };

  const handleEditPayment = (transaction) => {
    const payment = transaction?.details;
    if (!payment?.id) return;
    setEditingPayment(payment);
    setShowPaymentEditModal(true);
  };

  const handleClosePaymentEditModal = () => {
    setShowPaymentEditModal(false);
    setEditingPayment(null);
  };

  const submitPaymentEdit = async (paymentFormData) => {
    if (!editingPayment?.id) return { error: 'بيانات غير مكتملة' };
    const amount = parseFloat(paymentFormData?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { error: 'الرجاء إدخال مبلغ صالح' };

    setPaymentSubmitting(true);
    try {
      const result = await window.api.updateSupplierPayment(editingPayment.id, {
        supplierId: supplier?.id,
        amount,
        paymentDate: paymentFormData?.paymentDate,
        notes: paymentFormData?.notes || ''
      });

      if (result?.error) return result;

      await loadSupplierData();
      onDataChanged?.();
      return result;
    } catch (err) {
      return { error: err?.message || 'فشل التعديل' };
    } finally {
      setPaymentSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="customer-ledger-overlay">
        <div className="customer-ledger-loading">جاري التحميل...</div>
      </div>
    );
  }

  const finalBalanceClass = summary.finalBalance < 0
        ? 'ledger-balance-credit'
        : summary.finalBalance > 0
          ? 'ledger-balance-debit' 
          : 'ledger-balance-neutral';

  return (
    <div className="customer-ledger-overlay">
      <div className="customer-ledger-modal">
        <SupplierLedgerHeader
          supplier={supplier}
          onPrintLedger={handlePrintLedger}
          onPrintDetailedLedger={handlePrintDetailedLedger}
          onOpenSmartInsight={() => setShowSmartInsightModal(true)}
          onClose={onClose}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          smartInsight={smartInsight}
          showSummary={showSummary}
          setShowSummary={setShowSummary}
          showFooter={showFooter}
          setShowFooter={setShowFooter}
          currentBalance={summary.finalBalance}
          onEditSupplier={onEditSupplier}
        />

        {showSummary && (
          <SupplierLedgerSummary
            supplier={supplier}
            transactions={transactions}
            summary={summary}
          />
        )}

        <SupplierLedgerTable
          transactions={transactions}
          onPrintInvoice={handlePrintInvoice}
          onPrintReturn={handlePrintReturn}
          onPrintReceipt={handlePrintReceipt}
          onEditPurchase={handleEditPurchase}
          onEditReturn={handleEditReturn}
          onEditPayment={handleEditPayment}
          onDeletePurchase={handleDeletePurchase}
          onDeleteReturn={handleDeleteReturn}
          onDeletePayment={handleDeletePayment}
        />

        {showFooter && (
          <div className="customer-ledger-footer">
            <div className="ledger-total-card">
              <div className="ledger-total-icon ledger-total-sales">
                <ShoppingCart size={20} />
              </div>
              <div className="ledger-total-content">
                <div className="ledger-total-label">إجمالي المشتريات</div>
                <div className="ledger-total-value text-blue-600">
                  {formatCurrency(summary.totalPurchases)}
                </div>
              </div>
            </div>

            <div className="ledger-total-card">
              <div className="ledger-total-icon" style={{ background: '#fff7ed', color: '#ea580c' }}>
                <AlertCircle size={20} />
              </div>
              <div className="ledger-total-content">
                <div className="ledger-total-label">مرتجعات المشتريات</div>
                <div className="ledger-total-value text-orange-600">
                  {formatCurrency(summary.totalReturns)}
                </div>
              </div>
            </div>

            <div className="ledger-total-card">
              <div className="ledger-total-icon ledger-total-paid">
                <CheckCircle size={20} />
              </div>
              <div className="ledger-total-content">
                <div className="ledger-total-label">إجمالي المدفوعات</div>
                <div className="ledger-total-value ledger-total-paid">
                  {formatCurrency(summary.totalPayments)}
                </div>
              </div>
            </div>

            <div className="ledger-total-card">
              <div className="ledger-total-icon ledger-total-balance">
                <Scale size={20} />
              </div>
              <div className="ledger-total-content">
                <div className="ledger-total-label">الرصيد المتبقي</div>
                <div className={`ledger-total-value ${finalBalanceClass}`}>
                  {formatCurrency(summary.finalBalance)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <SupplierLedgerSmartInsightModal
        isOpen={showSmartInsightModal}
        onClose={() => setShowSmartInsightModal(false)}
        supplier={supplier}
        smartInsight={smartInsight}
      />

      {showPaymentEditModal && paymentEditModalSupplier && (
        <PaymentModal
          isOpen={showPaymentEditModal}
          onClose={handleClosePaymentEditModal}
          onSuccess={handleClosePaymentEditModal}
          selectedCustomer={paymentEditModalSupplier}
          onSubmit={submitPaymentEdit}
          paymentData={paymentEditData}
          isSubmitting={paymentSubmitting}
          title="تعديل سداد المورد"
        />
      )}
    </div>
  );
}
