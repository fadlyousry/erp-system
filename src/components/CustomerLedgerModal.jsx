import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ShoppingCart, CheckCircle, AlertCircle, Scale } from 'lucide-react';
import { safeAlert } from '../utils/safeAlert';
import { safeConfirm } from '../utils/safeConfirm';
import { CustomerLedgerService } from '../services/customerLedgerService';
import { safePrint } from '../../printing/safePrint';
import { generateInvoiceHTML } from '../../printing/generators/saleInvoiceGenerator';
import { generateReturnInvoiceHTML } from '../../printing/generators/saleReturnGenerator';
import { generateReceiptHTML } from '../../printing/generators/paymentReceiptGenerator';
import { generateLedgerHTML, generateDetailedLedgerA4HTML } from '../../printing/ledgerTemplate';
import { emitPosEditorRequest, emitReturnEditorRequest } from '../utils/posEditorBridge';
import PaymentModal from './PaymentModal';
import CustomerLedgerHeader from './CustomerLedgerHeader';
import CustomerLedgerSummary from './CustomerLedgerSummary';
import CustomerLedgerSmartInsightModal from './CustomerLedgerSmartInsightModal';
import CustomerLedgerTable from './CustomerLedgerTable';
import { filterPosPaymentMethods } from '../utils/paymentMethodFilters';
import { getLocalDateString } from '../utils/dateUtils';
import './CustomerLedger.css';

const formatCurrency = (value) => Number(value || 0).toLocaleString('ar-EG', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

export default function CustomerLedgerModal({
  customerId,
  onClose,
  onCustomerUpdated,
  onDataChanged,
  onEditCustomer
}) {
  const [customer, setCustomer] = useState(null);
  const [sales, setSales] = useState([]);
  const [returns, setReturns] = useState([]);
  const [payments, setPayments] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentEditModal, setShowPaymentEditModal] = useState(false);
  const [showSmartInsightModal, setShowSmartInsightModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [showSummary, setShowSummary] = useState(false);
  const [showFooter, setShowFooter] = useState(false);

  const loadCustomerData = useCallback(async () => {
    try {
      const [customerInfo, salesData, returnsData, paymentsData, paymentMethodsData] = await Promise.all([
        window.api.getCustomer(customerId),
        window.api.getCustomerSales(customerId),
        window.api.getCustomerReturns(customerId),
        window.api.getCustomerPayments(customerId),
        window.api.getPaymentMethods()
      ]);

      if (customerInfo.error) throw new Error(customerInfo.error);
      if (salesData.error) throw new Error(salesData.error);
      if (returnsData.error) throw new Error(returnsData.error);
      if (paymentsData.error) throw new Error(paymentsData.error);

      setCustomer(customerInfo);
      setSales(salesData);
      setReturns(returnsData);
      setPayments(paymentsData);
      setPaymentMethods(
        Array.isArray(paymentMethodsData)
          ? filterPosPaymentMethods(paymentMethodsData)
          : []
      );
    } catch (err) {
      console.error('Failed to load customer ledger data:', err.message);
      setCustomer(null);
      setSales([]);
      setReturns([]);
      setPayments([]);
      setPaymentMethods([]);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    loadCustomerData();
  }, [loadCustomerData]);

  const allTransactions = useMemo(() => {
    const ledgerRows = CustomerLedgerService.buildLedgerTransactions(sales, returns, payments);
    return CustomerLedgerService.attachRunningBalance(ledgerRows, customer?.balance || 0);
  }, [sales, returns, payments, customer?.balance]);

  const transactions = useMemo(() => {
    return CustomerLedgerService.filterByDateRange(
      allTransactions,
      dateRange.from,
      dateRange.to
    );
  }, [allTransactions, dateRange.from, dateRange.to]);

  const summary = useMemo(() => {
    return CustomerLedgerService.calculateSummary(transactions, customer?.balance || 0);
  }, [transactions, customer?.balance]);

  const smartInsight = useMemo(() => {
    return CustomerLedgerService.buildSmartPaymentInsight(customer, sales, payments, returns, {
      months: 6
    });
  }, [customer, sales, payments, returns]);

  const filteredSales = useMemo(() => {
    if (!dateRange.from && !dateRange.to) return sales;

    return sales.filter((sale) => {
      const saleDate = CustomerLedgerService.getSaleDate(sale);
      if (dateRange.from && saleDate < dateRange.from) return false;
      if (dateRange.to && saleDate > dateRange.to) return false;
      return true;
    });
  }, [sales, dateRange.from, dateRange.to]);

  const filteredReturns = useMemo(() => {
    if (!dateRange.from && !dateRange.to) return returns;

    return returns.filter((returnItem) => {
      const returnDate = new Date(returnItem.createdAt);
      if (dateRange.from && returnDate < dateRange.from) return false;
      if (dateRange.to && returnDate > dateRange.to) return false;
      return true;
    });
  }, [returns, dateRange.from, dateRange.to]);

  const filteredPayments = useMemo(() => {
    if (!dateRange.from && !dateRange.to) return payments;

    return payments.filter((payment) => {
      const paymentDate = payment.paymentDate
        ? new Date(payment.paymentDate)
        : new Date(payment.createdAt);
      if (dateRange.from && paymentDate < dateRange.from) return false;
      if (dateRange.to && paymentDate > dateRange.to) return false;
      return true;
    });
  }, [payments, dateRange.from, dateRange.to]);

  const paymentEditModalCustomer = useMemo(() => {
    if (!customer || !editingPayment) return null;
    const originalAmount = Number(editingPayment.amount || 0);
    return {
      ...customer,
      balance: Number(customer.balance || 0) + originalAmount
    };
  }, [customer, editingPayment]);

  const paymentEditData = useMemo(() => ({
    amount: editingPayment?.amount ?? '',
    notes: editingPayment?.notes || '',
    paymentDate: editingPayment?.paymentDate || getLocalDateString(),
    paymentMethodId: parseInt(
      editingPayment?.paymentMethodId || editingPayment?.paymentMethod?.id,
      10
    ) || parseInt(paymentMethods[0]?.id, 10) || 1
  }), [editingPayment, paymentMethods]);

  const handlePrintInvoice = async (sale) => {
    const html = generateInvoiceHTML(sale, customer);
    const result = await safePrint(html, { title: `فاتورة رقم ${sale.id}` });

    if (result.error) {
      await safeAlert('خطأ في الطباعة: ' + result.error);
    }
  };

  const handlePrintReturn = async (returnInvoice) => {
    const html = generateReturnInvoiceHTML(returnInvoice, customer);
    const result = await safePrint(html, { title: `مرتجع رقم ${returnInvoice.id}` });

    if (result.error) {
      await safeAlert('خطأ في الطباعة: ' + result.error);
    }
  };

  const handlePrintReceipt = async (payment) => {
    const html = generateReceiptHTML(payment, customer);
    const result = await safePrint(html, { title: `إيصال دفع رقم ${payment.id}` });

    if (result.error) {
      await safeAlert('خطأ في الطباعة: ' + result.error);
    }
  };

  const handlePrintLedger = async () => {
    const html = generateLedgerHTML(customer, transactions, summary);
    const result = await safePrint(html, { title: `كشف حساب ${customer?.name}` });

    if (result.error) {
      await safeAlert('خطأ في الطباعة: ' + result.error);
    }
  };

  const handlePrintDetailedLedger = async () => {
    const html = generateDetailedLedgerA4HTML({
      customer,
      sales: filteredSales,
      returns: filteredReturns,
      payments: filteredPayments,
      summary,
      dateRange
    });

    const result = await safePrint(html, {
      title: `تقرير كشف حساب تفصيلي ${customer?.name || ''}`.trim()
    });

    if (result.error) {
      await safeAlert('خطأ في الطباعة: ' + result.error);
    }
  };

  const handleDeleteSale = async (sale) => {
    const confirmed = await safeConfirm(
      `هل تريد حذف فاتورة رقم ${sale.id}؟`,
      { title: 'تأكيد الحذف', detail: 'لا يمكن التراجع عن هذا الإجراء' }
    );

    if (!confirmed) return;

    try {
      const result = await window.api.deleteSale(sale.id);
      if (result.error) {
        await safeAlert('خطأ: ' + result.error);
        return;
      }

      const updatedCustomer = await window.api.getCustomer(customerId);
      if (!updatedCustomer.error) {
        setCustomer(updatedCustomer);
        onCustomerUpdated?.(customerId, { balance: updatedCustomer.balance });
        onDataChanged?.();
      }

      await safeAlert('✅ تم حذف الفاتورة بنجاح');
      await loadCustomerData();
    } catch (err) {
      await safeAlert('خطأ في الحذف: ' + err.message);
    }
  };

  const handleDeleteReturn = async (returnInvoice) => {
    const confirmed = await safeConfirm(
      `هل تريد حذف المرتجع رقم ${returnInvoice.id}؟`,
      { title: 'تأكيد الحذف', detail: 'لا يمكن التراجع عن هذا الإجراء' }
    );

    if (!confirmed) return;

    try {
      const result = await window.api.deleteReturn(returnInvoice.id);
      if (result.error) {
        await safeAlert('خطأ: ' + result.error);
        return;
      }

      const updatedCustomer = await window.api.getCustomer(customerId);
      if (!updatedCustomer.error) {
        setCustomer(updatedCustomer);
        onCustomerUpdated?.(customerId, { balance: updatedCustomer.balance });
        onDataChanged?.();
      }

      await safeAlert('✅ تم حذف المرتجع بنجاح');
      await loadCustomerData();
    } catch (err) {
      await safeAlert('خطأ في الحذف: ' + err.message);
    }
  };

  const handleDeletePayment = async (payment) => {
    const confirmed = await safeConfirm(
      `هل تريد حذف الدفعة رقم ${payment.id}؟`,
      { title: 'تأكيد الحذف', detail: 'لا يمكن التراجع عن هذا الإجراء' }
    );

    if (!confirmed) return;

    try {
      const result = await window.api.deleteCustomerPayment(payment.id);
      if (result.error) {
        await safeAlert('خطأ: ' + result.error);
        return;
      }

      const updatedCustomer = await window.api.getCustomer(customerId);
      if (!updatedCustomer.error) {
        setCustomer(updatedCustomer);
        onCustomerUpdated?.(customerId, { balance: updatedCustomer.balance });
        onDataChanged?.();
      }

      await safeAlert('✅ تم حذف الدفعة بنجاح');
      await loadCustomerData();
    } catch (err) {
      await safeAlert('خطأ في الحذف: ' + err.message);
    }
  };

  const handleEditSale = (transaction) => {
    const sale = transaction?.details;
    if (!sale?.id) {
      safeAlert('تعذر فتح الفاتورة للتعديل');
      return;
    }

    emitPosEditorRequest({
      type: 'sale',
      transaction,
      customer
    });

    onClose?.();
  };

  const handleEditReturn = (transaction) => {
    const returnInvoice = transaction?.details;
    if (!returnInvoice?.id) {
      safeAlert('تعذر فتح المرتجع للتعديل');
      return;
    }

    emitReturnEditorRequest({
      type: 'return',
      transaction,
      customer
    });

    onClose?.();
  };

  const handleEditPayment = (transaction) => {
    const payment = transaction?.details;
    if (!payment?.id) {
      safeAlert('تعذر فتح الدفعة للتعديل');
      return;
    }
    setEditingPayment(payment);
    setShowPaymentEditModal(true);
  };

  const handleClosePaymentEditModal = () => {
    setShowPaymentEditModal(false);
    setEditingPayment(null);
  };

  const handleOpenSmartInsightModal = () => {
    setShowSmartInsightModal(true);
  };

  const handleCloseSmartInsightModal = () => {
    setShowSmartInsightModal(false);
  };

  const submitPaymentEdit = async (paymentFormData) => {
    if (!editingPayment?.id) {
      return { error: 'بيانات الدفعة غير مكتملة' };
    }

    const amount = parseFloat(paymentFormData?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: 'الرجاء إدخال مبلغ صالح' };
    }

    setPaymentSubmitting(true);
    try {
      const result = await window.api.updateCustomerPayment(editingPayment.id, {
        customerId: customer?.id || editingPayment.customerId,
        paymentMethodId: parseInt(paymentFormData?.paymentMethodId, 10)
          || parseInt(paymentMethods[0]?.id, 10)
          || 1,
        amount,
        paymentDate: paymentFormData?.paymentDate,
        notes: paymentFormData?.notes || ''
      });

      if (result?.error) {
        return result;
      }

      await loadCustomerData();
      const refreshedCustomer = await window.api.getCustomer(customerId);
      if (!refreshedCustomer?.error) {
        setCustomer(refreshedCustomer);
        onCustomerUpdated?.(customerId, { balance: refreshedCustomer.balance });
        onDataChanged?.();
      }

      return result;
    } catch (err) {
      return { error: err?.message || 'فشل تعديل الدفعة' };
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

  const finalBalanceClass =
    summary.finalBalance > 0
      ? 'ledger-balance-debit'
      : summary.finalBalance < 0
        ? 'ledger-balance-credit'
        : 'ledger-balance-neutral';

  return (
    <div className="customer-ledger-overlay">
      <div className="customer-ledger-modal">
        <CustomerLedgerHeader
          customer={customer}
          onPrintLedger={handlePrintLedger}
          onPrintDetailedLedger={handlePrintDetailedLedger}
          onOpenSmartInsight={handleOpenSmartInsightModal}
          onClose={onClose}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          smartInsight={smartInsight}
          showSummary={showSummary}
          setShowSummary={setShowSummary}
          showFooter={showFooter}
          setShowFooter={setShowFooter}
          currentBalance={summary.finalBalance}
          onEditCustomer={onEditCustomer}
        />

        {showSummary && (
          <CustomerLedgerSummary
            customer={customer}
            transactions={transactions}
            summary={summary}
          />
        )}

        <CustomerLedgerTable
          transactions={transactions}
          onPrintInvoice={handlePrintInvoice}
          onPrintReturn={handlePrintReturn}
          onPrintReceipt={handlePrintReceipt}
          onEditSale={handleEditSale}
          onEditReturn={handleEditReturn}
          onEditPayment={handleEditPayment}
          onDeleteSale={handleDeleteSale}
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
                <div className="ledger-total-label">إجمالي المبيعات</div>
                <div className="ledger-total-value ledger-total-sales">
                  {formatCurrency(summary.totalSales)}
                </div>
              </div>
            </div>

            <div className="ledger-total-card">
              <div className="ledger-total-icon ledger-total-paid">
                <CheckCircle size={20} />
              </div>
              <div className="ledger-total-content">
                <div className="ledger-total-label">إجمالي المدفوع</div>
                <div className="ledger-total-value ledger-total-paid">
                  {formatCurrency(summary.totalPaid)}
                </div>
              </div>
            </div>

            <div className="ledger-total-card">
              <div className="ledger-total-icon ledger-total-remaining">
                <AlertCircle size={20} />
              </div>
              <div className="ledger-total-content">
                <div className="ledger-total-label">إجمالي المتبقي</div>
                <div className="ledger-total-value ledger-total-remaining">
                  {formatCurrency(summary.totalRemaining)}
                </div>
              </div>
            </div>

            <div className="ledger-total-card">
              <div className="ledger-total-icon ledger-total-balance" style={{ color: summary.finalBalance > 0 ? '#be123c' : '#047857' }}>
                <Scale size={20} />
              </div>
              <div className="ledger-total-content">
                <div className="ledger-total-label">الرصيد الحالي</div>
                <div className={`ledger-total-value ${finalBalanceClass}`}>
                  {formatCurrency(summary.finalBalance)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <PaymentModal
        isOpen={showPaymentEditModal}
        selectedCustomer={paymentEditModalCustomer}
        paymentData={paymentEditData}
        onSubmit={submitPaymentEdit}
        onClose={handleClosePaymentEditModal}
        isSubmitting={paymentSubmitting}
        paymentMethods={paymentMethods}
      />

      <CustomerLedgerSmartInsightModal
        isOpen={showSmartInsightModal}
        onClose={handleCloseSmartInsightModal}
        customer={customer}
        smartInsight={smartInsight}
      />
    </div>
  );
}
