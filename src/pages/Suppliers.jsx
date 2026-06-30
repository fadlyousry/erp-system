import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { safeAlert } from "../utils/safeAlert";
import { safeConfirm } from "../utils/safeConfirm";
import { filterPosPaymentMethods } from "../utils/paymentMethodFilters";
import PaymentModal from '../components/PaymentModal';
import { getLocalDateString } from '../utils/dateUtils';
import NewCustomerModal from "../components/NewCustomerModal";
import SupplierLedger from "./SupplierLedger";
import SuppliersTable from "../components/suppliers/SuppliersTable";
import { Settings, Search } from "lucide-react";
import "./Suppliers.css";

const today = () => getLocalDateString();
const toNumber = (value, fallback = 0) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const formatMoney = (value) =>
    toNumber(value).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
const formatDate = (value) => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return "-";
    return parsed.toLocaleDateString("ar-EG");
};

const initialSupplierForm = {
    name: "", phone: "", phone2: "", address: "",
    city: "", district: "", notes: "",
    creditLimit: 0, customerType: "عادي", balance: "0"
};

const useWorkspaceState = (key, initialValue) => {
    const [state, setState] = useState(() => {
        try {
            const saved = localStorage.getItem(`supplier_ws_${key}`);
            if (saved !== null) return JSON.parse(saved);
        } catch (e) {}
        return initialValue;
    });

    useEffect(() => {
        try {
            localStorage.setItem(`supplier_ws_${key}`, JSON.stringify(state));
        } catch (e) {}
    }, [key, state]);

    return [state, setState];
};

export default function Suppliers() {
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [paymentMethods, setPaymentMethods] = useState([]);

    const [searchTerm, setSearchTerm] = useState("");
    const [balanceFilter, setBalanceFilter] = useState("all");

    const [showSupplierModal, setShowSupplierModal] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState(null);
    const [supplierForm, setSupplierForm] = useState(() => ({ ...initialSupplierForm }));

    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState(null);
    const [paymentSubmitting, setPaymentSubmitting] = useState(false);
    const [paymentForm, setPaymentForm] = useState({
        amount: "",
        paymentDate: today(),
        notes: "",
        paymentMethodId: "",
    });

    const [showLedger, setShowLedger] = useState(null);
    const [showColumnMenu, setShowColumnMenu] = useState(false);
    const [showSearchRow, setShowSearchRow] = useWorkspaceState('showSearchRow', false);
    const [columnSearch, setColumnSearch] = useWorkspaceState('columnSearch', {});
    const [visibleColumns, setVisibleColumns] = useWorkspaceState('visibleColumns', {
        id: true,
        name: true,
        phone: true,
        address: false,
        city: true,
        notes: false,
        balance: true,
        createdAt: false,
        actions: true,
    });

    const defaultPaymentMethodId = useMemo(
        () => String(paymentMethods[0]?.id || ""),
        [paymentMethods]
    );

    const loadSuppliers = useCallback(async (showLoader = true) => {
        if (showLoader) setLoading(true);
        try {
            const result = await window.api.getSuppliers();
            if (result?.error) throw new Error(result.error);
            setSuppliers(Array.isArray(result) ? result : []);
        } catch (error) {
            console.error("Failed to load suppliers:", error);
            await safeAlert("فشل تحميل الموردين");
        } finally {
            if (showLoader) setLoading(false);
        }
    }, []);

    const loadPaymentMethods = useCallback(async () => {
        try {
            const result = await window.api.getPaymentMethods();
            setPaymentMethods(Array.isArray(result) ? filterPosPaymentMethods(result) : []);
        } catch (error) {
            console.error("Failed to load payment methods:", error);
            setPaymentMethods([]);
        }
    }, []);

    useEffect(() => {
        const load = async () => {
            await Promise.all([loadSuppliers(true), loadPaymentMethods()]);
        };
        load();
    }, [loadSuppliers, loadPaymentMethods]);

    const filteredSuppliers = useMemo(() => {
        const normalized = String(searchTerm || "").trim().toLowerCase();
        let list = suppliers;

        if (normalized) {
            list = list.filter((supplier) => {
                const name = String(supplier.name || "").toLowerCase();
                const phone = String(supplier.phone || "").toLowerCase();
                const address = String(supplier.address || "").toLowerCase();
                return name.includes(normalized) || phone.includes(normalized) || address.includes(normalized);
            });
        }

        if (balanceFilter === "debt") {
            list = list.filter((supplier) => toNumber(supplier.balance) < 0);
        } else if (balanceFilter === "credit") {
            list = list.filter((supplier) => toNumber(supplier.balance) > 0);
        } else if (balanceFilter === "settled") {
            list = list.filter((supplier) => Math.abs(toNumber(supplier.balance)) < 0.0001);
        }

        return [...list].sort((a, b) => (b.id || 0) - (a.id || 0));
    }, [balanceFilter, searchTerm, suppliers]);

    const stats = useMemo(() => {
        let debtCount = 0;
        let creditCount = 0;
        let settledCount = 0;
        let debtAmount = 0;
        let creditAmount = 0;
        let net = 0;

        for (const supplier of filteredSuppliers) {
            const balance = toNumber(supplier.balance);
            net += balance;
            if (balance < 0) {
                debtCount += 1;
                debtAmount += Math.abs(balance);
            } else if (balance > 0) {
                creditCount += 1;
                creditAmount += balance;
            } else {
                settledCount += 1;
            }
        }

        return { debtCount, creditCount, settledCount, debtAmount, creditAmount, net };
    }, [filteredSuppliers]);

    const selectedSupplierLive = useMemo(() => {
        if (!selectedSupplier) return null;
        return suppliers.find((item) => String(item.id) === String(selectedSupplier.id)) || selectedSupplier;
    }, [selectedSupplier, suppliers]);

    const openAddSupplierModal = () => {
        setEditingSupplier(null);
        setSupplierForm({ ...initialSupplierForm });
        setShowSupplierModal(true);
    };

    const openEditSupplierModal = (supplier) => {
        setEditingSupplier(supplier);
        setSupplierForm({
            name: supplier.name || "",
            phone: supplier.phone || "",
            phone2: supplier.phone2 || "",
            address: supplier.address || "",
            city: supplier.city || "",
            district: supplier.district || "",
            notes: supplier.notes || "",
            creditLimit: 0,
            customerType: "عادي",
            balance: toNumber(supplier.balance).toFixed(2),
        });
        setShowSupplierModal(true);
    };

    const closeSupplierModal = () => {
        setShowSupplierModal(false);
        setEditingSupplier(null);
        setSupplierForm({ ...initialSupplierForm });
    };

    const saveSupplier = async () => {
        const supplierName = String(supplierForm.name || "").trim();
        if (!supplierName) {
            await safeAlert("اسم المورد مطلوب");
            return;
        }

        const payload = {
            name: supplierName,
            phone: String(supplierForm.phone || "").trim(),
            address: String(supplierForm.address || "").trim(),
        };
        const isEditMode = Boolean(editingSupplier);
        if (!isEditMode) payload.balance = toNumber(supplierForm.balance);

        try {
            const result = isEditMode
                ? await window.api.updateSupplier(editingSupplier.id, payload)
                : await window.api.addSupplier(payload);

            if (result?.error) {
                await safeAlert(`خطأ: ${result.error}`);
                return;
            }

            closeSupplierModal();
            await loadSuppliers(false);
        } catch (error) {
            console.error("Failed to save supplier:", error);
            await safeAlert("فشل حفظ بيانات المورد");
        }
    };

    const deleteSupplier = useCallback(async (supplierId) => {
        const confirmed = await safeConfirm("هل أنت متأكد من حذف المورد؟", {
            title: "تأكيد الحذف",
            buttons: ["حذف", "إلغاء"],
        });
        if (!confirmed) return;
        try {
            const result = await window.api.deleteSupplier(supplierId);
            if (result?.error) {
                await safeAlert(`خطأ: ${result.error}`);
                return;
            }
            await loadSuppliers(false);
        } catch (error) {
            console.error("Failed to delete supplier:", error);
            await safeAlert("فشل حذف المورد");
        }
    }, [loadSuppliers]);

    const openPaymentModal = (supplier) => {
        setSelectedSupplier(supplier);
        setPaymentForm({
            amount: "",
            paymentDate: today(),
            notes: "",
            paymentMethodId: defaultPaymentMethodId,
        });
        setShowPaymentModal(true);
    };

    const closePaymentModal = () => {
        setShowPaymentModal(false);
        setSelectedSupplier(null);
    };

    const saveSupplierPayment = async (dataFromModal) => {
        if (!selectedSupplierLive) return { error: "المورد غير محدد" };

        const amount = Math.max(0, toNumber(dataFromModal.amount));
        if (amount <= 0) {
            return { error: "الرجاء إدخال مبلغ سداد صحيح" };
        }

        setPaymentSubmitting(true);
        try {
            const result = await window.api.addSupplierPayment({
                supplierId: selectedSupplierLive.id,
                amount,
                paymentDate: dataFromModal.paymentDate || today(),
                notes: String(dataFromModal.notes || "").trim(),
                paymentMethodId: parseInt(dataFromModal.paymentMethodId, 10) || undefined,
            });

            if (result?.error) {
                return { error: result.error };
            }

            await loadSuppliers(false);
            return result;
        } catch (error) {
            console.error("Failed to save supplier payment:", error);
            return { error: "فشل تسجيل السداد" };
        } finally {
            setPaymentSubmitting(false);
        }
    };

    const exportCsv = async () => {
        if (filteredSuppliers.length === 0) {
            await safeAlert("لا توجد بيانات للتصدير");
            return;
        }

        const escapeCsv = (value) => {
            const text = String(value ?? "");
            return text.includes(",") || text.includes("\"") || text.includes("\n")
                ? `"${text.replace(/"/g, "\"\"")}"`
                : text;
        };

        const header = ["#", "اسم المورد", "الهاتف", "العنوان", "الرصيد", "تاريخ التسجيل"];
        const rows = filteredSuppliers.map((supplier) => [
            supplier.id,
            supplier.name || "",
            supplier.phone || "",
            supplier.address || "",
            toNumber(supplier.balance).toFixed(2),
            formatDate(supplier.createdAt),
        ]);
        const content = [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");

        const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `suppliers-${today()}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const toggleColumn = useCallback((column) => {
        setVisibleColumns(prev => ({
            ...prev,
            [column]: !prev[column]
        }));
    }, [setVisibleColumns]);

    const handleColumnSearchChange = useCallback((field, value) => {
        setColumnSearch(prev => ({
            ...prev,
            [field]: value
        }));
    }, [setColumnSearch]);



    return (
        <div className="suppliers-page">
            {/* ─── Header ─── */}
            <div className="suppliers-header">
                <h1>
                    <span className="suppliers-header-icon">🚛</span>
                    إدارة الموردين
                </h1>
                <div className="suppliers-header-actions">
                    <button className="suppliers-btn suppliers-btn-secondary" onClick={() => loadSuppliers(true)}>
                        🔄 تحديث
                    </button>
                    <button className="suppliers-btn suppliers-btn-secondary" onClick={exportCsv}>
                        📥 تصدير CSV
                    </button>
                    <button className="suppliers-btn suppliers-btn-primary" onClick={openAddSupplierModal}>
                        ➕ إضافة مورد
                    </button>
                </div>
            </div>

            {/* ─── Stats Cards ─── */}
            <div className="suppliers-stats">
                <div className="suppliers-stat-card">
                    <div className="suppliers-stat-icon is-total">👥</div>
                    <div className="suppliers-stat-info">
                        <span className="suppliers-stat-label">عدد الموردين</span>
                        <span className="suppliers-stat-value">{filteredSuppliers.length}</span>
                    </div>
                </div>
                <div className="suppliers-stat-card">
                    <div className="suppliers-stat-icon is-debt">📉</div>
                    <div className="suppliers-stat-info">
                        <span className="suppliers-stat-label">مستحقات علينا</span>
                        <span className="suppliers-stat-value is-debt">{formatMoney(stats.debtAmount)}</span>
                    </div>
                </div>
                <div className="suppliers-stat-card">
                    <div className="suppliers-stat-icon is-credit">📈</div>
                    <div className="suppliers-stat-info">
                        <span className="suppliers-stat-label">رصيد دائن للموردين</span>
                        <span className="suppliers-stat-value is-credit">{formatMoney(stats.creditAmount)}</span>
                    </div>
                </div>
                <div className="suppliers-stat-card">
                    <div className="suppliers-stat-icon is-net">⚖️</div>
                    <div className="suppliers-stat-info">
                        <span className="suppliers-stat-label">صافي الرصيد</span>
                        <span className={`suppliers-stat-value ${stats.net < 0 ? "is-net-negative" : "is-net-positive"}`}>
                            {formatMoney(stats.net)}
                        </span>
                    </div>
                </div>
            </div>

            {/* ─── Search & Filter ─── */}
            <div className="suppliers-search-bar">
                <div className="suppliers-search-wrapper">
                    <span className="suppliers-search-emoji">🔍</span>
                    <input
                        type="text"
                        placeholder="بحث بالاسم أو الهاتف أو العنوان..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="suppliers-filter-group">
                    <select value={balanceFilter} onChange={(e) => setBalanceFilter(e.target.value)}>
                        <option value="all">كل الأرصدة</option>
                        <option value="debt">علينا مستحقات</option>
                        <option value="credit">له رصيد دائن</option>
                        <option value="settled">متزن</option>
                    </select>

                    <button
                        onClick={() => setShowSearchRow(!showSearchRow)}
                        className={`suppliers-filter-btn ${showSearchRow ? 'is-active' : ''}`}
                        title="بحث في الأعمدة"
                    >
                        <Search size={20} />
                    </button>

                    <div className="suppliers-column-selector">
                        <button
                            onClick={() => setShowColumnMenu(!showColumnMenu)}
                            className={`suppliers-filter-btn ${showColumnMenu ? 'is-active' : ''}`}
                            title="تخصيص الأعمدة"
                        >
                            <Settings size={20} />
                        </button>

                        {showColumnMenu && (
                            <>
                                <div className="suppliers-menu-overlay" onClick={() => setShowColumnMenu(false)} />
                                <div className="suppliers-column-menu">
                                    <div className="suppliers-menu-header">تخصيص الأعمدة</div>
                                    <div className="suppliers-menu-list">
                                        {Object.keys(visibleColumns).map((col) => (
                                            <label key={col} className="suppliers-menu-item">
                                                <input
                                                    type="checkbox"
                                                    checked={visibleColumns[col]}
                                                    onChange={() => toggleColumn(col)}
                                                />
                                                {col === 'id' ? 'الكود' : col === 'name' ? 'الاسم' : col === 'phone' ? 'الهاتف' : col === 'address' ? 'العنوان' : col === 'city' ? 'المدينة' : col === 'notes' ? 'ملاحظات' : col === 'balance' ? 'الرصيد' : col === 'createdAt' ? 'تاريخ التسجيل' : col === 'actions' ? 'الإجراءات' : col}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* ─── Table ─── */}
            <div className="suppliers-table-card">
                <SuppliersTable
                    suppliers={filteredSuppliers}
                    visibleColumns={visibleColumns}
                    showSearchRow={showSearchRow}
                    columnSearch={columnSearch}
                    onColumnSearchChange={handleColumnSearchChange}
                    onShowLedger={setShowLedger}
                    onPayment={openPaymentModal}
                    onEdit={openEditSupplierModal}
                    onDelete={deleteSupplier}
                />
            </div>

            {/* ─── Add/Edit Supplier Modal ─── */}
            <NewCustomerModal
                isOpen={showSupplierModal}
                customer={supplierForm}
                onChange={setSupplierForm}
                onSave={saveSupplier}
                onClose={closeSupplierModal}
                existingCustomers={suppliers}
                title={editingSupplier ? "✏️ تعديل المورد" : "➕ إضافة مورد جديد"}
                editingCustomerId={editingSupplier?.id || null}
                isEditMode={Boolean(editingSupplier)}
                zIndex={1500}
            />

            {/* ─── Payment Modal ─── */}
            <PaymentModal
                isOpen={showPaymentModal}
                selectedCustomer={selectedSupplierLive}
                paymentData={paymentForm}
                onSubmit={saveSupplierPayment}
                onClose={closePaymentModal}
                isSubmitting={paymentSubmitting}
                paymentMethods={paymentMethods}
                title="تسجيل سداد لمورد"
                isSupplier={true}
            />

            {/* ─── Ledger ─── */}
            {showLedger && (
                <SupplierLedger
                    supplierId={showLedger}
                    onClose={() => setShowLedger(null)}
                    onEditSupplier={openEditSupplierModal}
                />
            )}
        </div>
    );
}
