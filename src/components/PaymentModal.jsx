// موديل اذن استلام نقديه
import React, {
    useRef,
    useEffect,
    useState,
    useMemo,
    useCallback,
} from "react";
import { X, Printer, Save, FileText } from "lucide-react";
import { filterPosPaymentMethods } from "../utils/paymentMethodFilters";
import { safePrint } from "../../printing/safePrint";
import { generateReceiptHTML } from "../../printing/generators/paymentReceiptGenerator";
import { getLocalDateString } from "../utils/dateUtils";


// ثابت (عدم إعادة إنشاء المصفوفة في كل رندر)
const DEFAULT_PAYMENT_METHODS = [
    { id: 1, name: "Cash", code: "CASH" },
    { id: 2, name: "Vodafone Cash", code: "VODAFONE_CASH" },
    { id: 3, name: "InstaPay", code: "INSTAPAY" },
];

export default function PaymentModal({
    isOpen,
    selectedCustomer,
    paymentData,
    onSubmit,
    onClose,
    isSubmitting,
    paymentMethods = DEFAULT_PAYMENT_METHODS,
    title = "تسجيل مستند قبض",
    isSupplier = false,
}) {
    /* =======================
       Hooks (ثابتة دائمًا)
    ======================= */
    const amountRef = useRef(null);
    const safePaymentMethods = useMemo(() => {
        const filtered = filterPosPaymentMethods(paymentMethods);
        if (filtered.length > 0) return filtered;

        return filterPosPaymentMethods(DEFAULT_PAYMENT_METHODS);
    }, [paymentMethods]);

    const [amount, setAmount] = useState("");
    const [date, setDate] = useState("");
    const [notes, setNotes] = useState("");
    const [alert, setAlert] = useState({ message: "", type: "info" }); 
    const [paymentMethod, setPaymentMethod] = useState(String(safePaymentMethods[0]?.id || ""));

    useEffect(() => {
        if (isOpen) {
            setAmount(paymentData.amount || "");
            // ensure date is formatted as YYYY-MM-DD for <input type="date">
            const formatDateForInput = (d) => {
                if (!d) return "";
                return getLocalDateString(d);
            };


            setDate(formatDateForInput(paymentData.paymentDate) || getLocalDateString());
            setNotes(paymentData.notes || "");
            const requestedMethodId = String(paymentData.paymentMethodId || "");
            const hasRequestedMethod = safePaymentMethods.some(
                (method) => String(method?.id) === requestedMethodId
            );
            setPaymentMethod(
                hasRequestedMethod
                    ? requestedMethodId
                    : String(safePaymentMethods[0]?.id || "")
            );
            setTimeout(() => {
                amountRef.current?.focus();
                amountRef.current?.select();
            }, 50);
        }
    }, [isOpen, paymentData, safePaymentMethods]);

    const amountNumber = parseFloat(amount) || 0;

    const newBalance = useMemo(() => {
        if (!selectedCustomer) return 0;
        return isSupplier
            ? Number(selectedCustomer.balance) + amountNumber
            : Number(selectedCustomer.balance) - amountNumber;
    }, [amountNumber, selectedCustomer, isSupplier]);

    // تنسيق الرقم بدون رمز العملة، وإظهار الكسور فقط عند الحاجة
    const formatPlainNumber = (val) => {
        const n = Number(val) || 0;
        const abs = Math.abs(n);
        const hasDecimals = Math.abs(Math.round((abs - Math.floor(abs)) * 100)) > 0;
        const opts = { minimumFractionDigits: hasDecimals ? 2 : 0, maximumFractionDigits: 2 };
        // استخدم toLocaleString لعرض الفواصل آلاف بحسب locale بدون عملة
        return (n).toLocaleString(undefined, opts);
    };

    const balanceColor = newBalance > 0 ? "#dc2626" : newBalance === 0 ? "#059669" : "#2563eb";

    const submitAndMaybePrint = useCallback(
        async (withPrint = false) => {
            if (isSubmitting) return;

            if (!amount || !date || !paymentMethod) {
                setAlert({ message: "المبلغ، التاريخ وطريقة الدفع مطلوبة.", type: "error" });
                return;
            }

            // clear previous alerts
            setAlert({ message: "", type: "info" });

            // call parent submit and capture result
            const result = await onSubmit({
                ...paymentData,
                amount,
                paymentDate: date,
                // ensure we send a number id
                paymentMethodId: parseInt(paymentMethod, 10)
                    || parseInt(safePaymentMethods[0]?.id, 10)
                    || 1,
                notes,
            });

            // if error returned from parent, show error alert
            if (result && result.error) {
                setAlert({ message: result.error || 'فشل في التسجيل', type: 'error' });
                return;
            }

            // print if requested
            if (withPrint) {
                const selectedPaymentMethod = safePaymentMethods.find(
                    (method) => String(method?.id) === String(paymentMethod)
                );
                const paymentId = result?.id
                    || result?.paymentId
                    || result?.data?.id
                    || paymentData?.id
                    || paymentData?.paymentId
                    || "-";
                const paymentForPrint = {
                    ...paymentData,
                    ...(result?.data || {}),
                    id: paymentId,
                    amount: Number(amount) || 0,
                    paymentDate: date || getLocalDateString(),
                    createdAt: result?.createdAt || paymentData?.createdAt || new Date().toISOString(),
                    notes,
                    paymentMethod: selectedPaymentMethod || paymentData?.paymentMethod || null
                };
                const html = generateReceiptHTML(paymentForPrint, selectedCustomer);
                let printResult = await safePrint(html, {
                    title: `إيصال دفع رقم ${paymentId}`,
                    silent: true
                });

                // If silent print fails (e.g. printer offline or canceled by driver), 
                // fallback to normal print dialog
                if (printResult?.error && printResult.error.includes('canceled')) {
                    printResult = await safePrint(html, {
                        title: `إيصال دفع رقم ${paymentId}`,
                        silent: false
                    });
                }

                if (printResult?.error) {
                    setAlert({ message: printResult.error || "تعذر تنفيذ الطباعة", type: "error" });
                    return;
                }
            }

            // close modal immediately after successful save
            onClose && onClose();
        },
        [amount, date, paymentMethod, notes, isSubmitting, onSubmit, paymentData, safePaymentMethods]
    );

    useEffect(() => {
        // Prevent catching the bubbling "Enter" keydown that might have opened this modal.
        let isMountingPhase = true;
        const timer = setTimeout(() => {
            isMountingPhase = false;
        }, 50);

        const handler = (e) => {
            if (!isOpen || isSubmitting || isMountingPhase) return;

            if (e.key === "F1") {
                e.preventDefault();
                submitAndMaybePrint(false);
            } else if (e.key === "F2" || e.key === "Enter") {
                e.preventDefault();
                submitAndMaybePrint(true);
            } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            }
        };

        window.addEventListener("keydown", handler);
        return () => {
            window.removeEventListener("keydown", handler);
            clearTimeout(timer);
        };
    }, [isOpen, isSubmitting, submitAndMaybePrint, onClose]);

    // auto-dismiss alert after 4 seconds
    useEffect(() => {
        if (!alert.message) return;
        const t = setTimeout(() => setAlert({ message: "", type: "info" }), 3000);
        return () => clearTimeout(t);
    }, [alert]);

    /* =======================
       ✅ return بعد كل Hooks
    ======================= */
    if (!isOpen || !selectedCustomer) return null;

    /* =======================
       Styles
    ======================= */
    const styles = {
        overlay: {
            position: "absolute",
            inset: 0,
            background: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
        },
        modal: {
            background: "#fff",
            width: "100%",
            maxWidth: 480,
            borderRadius: 12,
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 15px rgba(0,0,0,0.05)",
            overflow: "hidden",
            border: "1px solid #cbd5e1",
        },
        header: {
            padding: "16px 20px",
            borderBottom: "1px solid #eee",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#fcfcfc",
        },
        label: { fontSize: 13, fontWeight: 600, marginBottom: 6 },
        input: {
            width: "100%",
            padding: "10px 12px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            outline: "none", 
            boxShadow: "none",
            fontSize: 14,
        },
        amountInput: {
            fontSize: 22,
            fontWeight: "bold",
            textAlign: "center",
            border: "2px solid #008ae6",
            outline: "none",
            color: "#007bb5",
        },
        btnPrimary: {
            flex: 1,
            background: "linear-gradient(135deg, #008ae6 0%, #007bb5 100%)",
            color: "#fff",
            border: "none",
            padding: 12,
            borderRadius: 6,
            fontWeight: "bold",
            cursor: "pointer",
            display: "flex",
            gap: 8,
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 12px rgba(0, 138, 230, 0.3)",
        },
        btnSecondary: {
            flex: 1,
            background: "linear-gradient(135deg, #03273fff 0%, #002a5aff 100%)",
            color: "#fff",
            border: "none",
            padding: 12,
            borderRadius: 6,
            fontWeight: "bold",
            cursor: "pointer",
            display: "flex",
            gap: 8,
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 12px rgba(51, 65, 85, 0.3)",
        },
        alertBase: {
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
        },
        alertInfo: {
            background: '#eef2ff',
            border: '1px solid #c7d2fe',
            color: '#1e293b'
        },
        alertError: {
            background: '#fff1f2',
            border: '1px solid #fecaca',
            color: '#7f1d1d'
        },
        alertSuccess: {
            background: '#ecfdf5',
            border: '1px solid #bbf7d0',
            color: '#065f46'
        },
    };

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div style={styles.header}>
                    <h3 style={{ margin: 0, display: "flex", gap: 8 }}>
                        <FileText size={20} color="#10b981" />
                        {title}
                    </h3>
                    <button onClick={onClose} style={{ background: "none", border: 0 }}>
                        <X size={20} color="#999" />
                    </button>
                </div>

                <div style={{ padding: 20 }}>
                    {/* Customer */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 12,
                            background: "#f0f7ff",
                            padding: 14,
                            borderRadius: 8,
                            marginBottom: 18,
                        }}
                    >
                        <div>
                            <div style={{ fontSize: 11, color: "#666" }}>العميل</div>
                            <strong style={{ display: 'block', fontSize: 16, color: '#111' }}>{selectedCustomer.name}</strong>
                        </div>
                        <div style={{ textAlign: "left" }}>
                            <div style={{ fontSize: 11, color: "#666" }}>الرصيد السابق</div>
                            <strong style={{ display: 'block', fontSize: 16, color: (Number(selectedCustomer.balance) > 0 ? '#dc2626' : Number(selectedCustomer.balance) === 0 ? '#059669' : '#2563eb') }}>
                                {formatPlainNumber(selectedCustomer.balance)}
                            </strong>
                        </div>
                    </div>

                    {/* Missing Phone Alert */}
                    {!selectedCustomer.phone && !isSupplier && (
                        <div style={{ 
                            background: '#fffbeb', 
                            border: '1px solid #fcd34d', 
                            borderRadius: 8, 
                            padding: '8px 12px', 
                            marginBottom: 15,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            color: '#92400e',
                            fontSize: 13,
                            fontWeight: 600
                        }}>
                            <span style={{ fontSize: 18 }}>⚠️</span>
                            <span>تنبيه: هذا العميل ليس له رقم هاتف مسجل </span>
                        </div>
                    )}

                    {/* Amount (label beside input) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                        <div style={{ minWidth: 120 }}>
                            <div style={{ ...styles.label, marginBottom: 0 }}>المبلغ المستلم *</div>
                        </div>
                        <div style={{ flex: 1 }}>
                            <input
                                ref={amountRef}
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                style={{ ...styles.input, ...styles.amountInput }}
                            />
                        </div>
                    </div>

                    {/* Payment Method & Date */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        
                            <div style={{ flex: 1 }}>
                                <select
                                    value={paymentMethod}
                                    onChange={(e) => setPaymentMethod(e.target.value)}
                                    style={{
                                        ...styles.input,
                                        fontSize: 14,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {safePaymentMethods.map((method) => (
                                        <option key={method.id} value={String(method.id)}>
                                            {method.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  
                            <div style={{ flex: 1 }}>
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    style={styles.input}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    <label style={{ ...styles.label, marginTop: 14 }}>ملاحظات</label>
                    <textarea
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        style={{ ...styles.input, resize: "none" }}
                    />

                    {/* Balance After */}
                    <div style={{ marginTop: 14, padding: 12, background: "#f0f7ff", borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>الرصيد الحالي</div>
                        <div
                            style={{
                                fontSize: 18,
                                fontWeight: "bold",
                                color: balanceColor,
                            }}
                        >
                            {formatPlainNumber(newBalance)}
                        </div>
                    </div>

                    {/* Unified alert (validation / info / shortcuts) */}
                    <div style={{ marginTop: 14 }}>
                        {alert.message ? (
                            <div
                                style={{
                                    ...styles.alertBase,
                                    ...(alert.type === 'error' ? styles.alertError : alert.type === 'success' ? styles.alertSuccess : styles.alertInfo)
                                }}
                            >
                                <div style={{ fontWeight: 700 }}>{alert.type === 'error' ? 'خطأ' : alert.type === 'success' ? 'تم' : 'معلومة'}</div>
                                <div style={{ flex: 1 }}>{alert.message}</div>
                            </div>
                        ) : (
                            <div style={{ ...styles.alertBase, ...styles.alertInfo }}>
                                <div style={{ fontWeight: 700 }}>اختصارات</div>
                                <div style={{ flex: 1 }}>F1: حفظ • Enter / F2: حفظ وطباعة • ESC: خروج</div>
                            </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                            <button onClick={() => submitAndMaybePrint(false)} style={styles.btnPrimary}>
                                <Save size={18} /> حفظ (F1)
                            </button>
                            <button onClick={() => submitAndMaybePrint(true)} style={styles.btnSecondary}>
                                <Printer size={18} /> حفظ وطباعة (Enter / F2)
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
