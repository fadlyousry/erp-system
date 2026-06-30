import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense } from "react";
import { Type, Barcode, Search, XCircle, Banknote, CalendarClock, Calendar, Store } from 'lucide-react';
import SupplierLedger from "./SupplierLedger";
import InvoicePreview from "./InvoicePreview";
import VariantModal from "../components/VariantModal";
import NewCustomerModal from "../components/NewCustomerModal";
import PaymentModal from "../components/PaymentModal";
import ShortcutsHelpModal from "../components/ShortcutsHelpModal";
const ProductModal = React.lazy(() => import("../components/products/ProductModal"));
const BarcodeStudioModal = React.lazy(() => import("../components/products/BarcodeStudioModal"));
import { getLocalDateString } from "../utils/dateUtils";
import {
    POS_EDITOR_REQUEST_EVENT,
    readPosEditorRequest,
    clearPosEditorRequest
} from "../utils/posEditorBridge";
import {
    DEFAULT_POS_PAYMENT_METHODS,
    filterPosPaymentMethods,
    normalizePaymentMethodCode
} from "../utils/paymentMethodFilters";
import {
    getDefaultPurchaseProductDisplayMode,
    getDefaultPurchaseSaleType,
    getDefaultPurchaseSearchMode,
    getDefaultPurchaseWarehouseId,
    getAllowExcessPayments,
    getAppSettings,
    saveAppSettings,
    normalizeBarcodePrintMode,
    normalizeBarcodeStudioStartTab,
    normalizeDefaultPrinterName
} from "../utils/appSettings";
import { safePrint } from "../../printing/safePrint";
import { generatePurchaseInvoiceHTML } from "../../printing/generators/purchaseInvoiceGenerator";
import {
    barcodeRowsFromPurchaseItems, 
    buildBarcodeLabels, 
    barcodeStudioHtml, 
    calculateBarcodePageSize,
    BARCODE_STUDIO_STORAGE_KEY,
    BARCODE_TEMPLATE_STORAGE_KEY,
    DEFAULT_BARCODE_STUDIO,
    BARCODE_STUDIO_TABS,
    sanitizeBarcodeStudioSettings,
    sanitizeBarcodeTemplate,
    parseBarcodeTemplates,
    isMatrixBarcodeFormat
} from "../utils/barcodeUtils";


/**
 * Toast Notification Component
 * عرض إشعارات مؤقتة في الزاوية السفلى اليسرى
 * 4 أنواع: success, error, warning, info
 */
const Toast = ({ message, type = "info", onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 2000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const bgColor = {
        success: "#10b981",
        error: "#ef4444",
        warning: "#f59e0b",
        info: "#3b82f6",
    }[type];

    const icon = {
        success: "✅",
        error: "❌",
        warning: "⚠️",
        info: "ℹ️",
    }[type];

    return (
        <div
            style={{
                position: "fixed",
                bottom: "20px",
                left: "20px",
                backgroundColor: bgColor,
                color: "white",
                padding: "15px 20px",
                borderRadius: "8px",
                boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
                zIndex: 9999,
                display: "flex",
                alignItems: "center",
                gap: "10px",
                animation: "slideIn 0.3s ease-out",
                maxWidth: "400px",
                fontSize: "14px",
            }}
        >
            <span style={{ fontSize: "20px" }}>{icon}</span>
            <span>{message}</span>
        </div>
    );
};

/**
 * ============================================
 * Custom Hooks - خطاطيف مخصصة
 * ============================================
 */

/**
 * Hook لحساب إجمالي الفاتورة
 * يحسب: المجموع، الخصم، المتبقي، المدفوع، والربح
 */
const useInvoiceCalculations = (invoice) => {
    return useMemo(() => {
        const subTotal = invoice.cart.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0,
        );
        const totalDiscount = invoice.cart.reduce(
            (sum, item) => sum + item.discount * item.quantity,
            0,
        );
        let billDiscount = parseFloat(invoice.discount) || 0;
        if (invoice.discountType === "percent") {
            billDiscount = ((subTotal - totalDiscount) * billDiscount) / 100;
        }

        const total = Math.max(0, subTotal - totalDiscount - billDiscount);
        const rawPaid = parseFloat(invoice.paidAmount);
        const paid = Math.max(0, Number.isFinite(rawPaid) ? rawPaid : 0);

        const allowExcess = getAllowExcessPayments();
        const finalPaid = allowExcess ? paid : Math.min(paid, total);
        const remaining = total - finalPaid;

        return {
            subTotal,
            totalDiscount,
            total,
            paid: finalPaid,
            remaining,
            billDiscount,
        };
    }, [invoice.cart, invoice.discount, invoice.discountType, invoice.paidAmount]);
};

/**
 * ============================================
 * Utility Functions - دوال مساعدة
 * ============================================
 */

/**
 * تشغيل صوت تنبيه للعمليات الناجحة
 */
const playSound = (soundType) => {
    try {
        if (soundType === "save") {
            const audioContext = new (
                window.AudioContext || window.webkitAudioContext
            )();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.type = "sine";

            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(
                0.01,
                audioContext.currentTime + 0.3,
            );

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
        }
    } catch (error) {
        console.log("Sound not available");
    }
};

/**
 * توليد معرّف فريد للفاتورة
 */
const generateInvoiceId = () => `INV-${Date.now().toString().slice(-6)}`;
const getTodayDate = () => getLocalDateString();


const toNumberSafe = (value, fallback = 0) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const toInputDate = (value) => {
    if (!value) return getTodayDate();
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return getTodayDate();
    return getLocalDateString(parsed);

};

const VARIANT_PLACEHOLDER_VALUES = new Set([
    "",
    "-",
    "standard",
    "default",
    "موحد",
    "افتراضي",
]);

const normalizeVariantLabel = (value) =>
    String(value || "").trim().toLowerCase();

const isPlaceholderVariantLabel = (value) =>
    VARIANT_PLACEHOLDER_VALUES.has(normalizeVariantLabel(value));

const hasMeaningfulVariantLabels = (size, color) =>
    !isPlaceholderVariantLabel(size) || !isPlaceholderVariantLabel(color);

const sanitizeVariantLabel = (value) =>
    isPlaceholderVariantLabel(value) ? "" : String(value || "").trim();

const createEmptyInvoice = (overrides = {}) => {
    const currentUser = (() => {
        try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
    })();
    const defaultWarehouseId = currentUser?.warehouseId ? currentUser.warehouseId : getDefaultPurchaseWarehouseId();
    const result = {
        id: generateInvoiceId(),
        invoiceDate: getTodayDate(),
        cart: [],
        customer: null,
        discount: 0,
        discountType: "value",
        paidAmount: "",
        saleType: getDefaultPurchaseSaleType(),
        paymentMethod: "CASH",
        notes: "",
        editorMode: "sale",
        isEditMode: false,
        sourceSaleId: null,
        sourcePaymentId: null,
        paymentEdit: null,
        warehouseId: defaultWarehouseId,
        ...overrides,
    };
    if (currentUser?.warehouseId) {
        result.warehouseId = currentUser.warehouseId;
    }
    return result;
};

const normalizeStoredInvoice = (invoice = {}) => {
    const normalizedPaymentEdit = invoice?.paymentEdit
        ? {
            ...invoice.paymentEdit,
            amount: toNumberSafe(invoice.paymentEdit.amount, 0),
            paymentDate: toInputDate(invoice.paymentEdit.paymentDate),
            paymentMethodId: parseInt(invoice.paymentEdit.paymentMethodId, 10) || 1,
        }
        : null;

    return createEmptyInvoice({
        ...invoice,
        id: invoice.id || generateInvoiceId(),
        invoiceDate: toInputDate(invoice.invoiceDate),
        cart: Array.isArray(invoice.cart) ? invoice.cart : [],
        customer: invoice.customer || null,
        paymentEdit: normalizedPaymentEdit,
    });
};

const isCreditSaleType = (saleType) => {
    const normalized = String(saleType || "").trim().toLowerCase();
    return normalized === "آجل" || normalized === "اجل" || normalized === "credit" || normalized === "deferred";
};
const PAYMENT_METHOD_UI_PRESETS = {
    CASH: { color: "#10b981", bg: "#ecfdf5", text: "#047857" },
    VODAFONE_CASH: { color: "#dc2626", bg: "#fef2f2", text: "#991b1b" },
    INSTAPAY: { color: "#6366f1", bg: "#eef2ff", text: "#4338ca" },
};



const PURCHASE_SHORTCUT_SECTIONS = [
    {
        title: "حفظ الفاتورة",
        items: [
            { keys: "F1", description: "حفظ فاتورة الشراء" },
            { keys: "F2", description: "حفظ وطباعة الفاتورة" },
            { keys: "F3", description: "حفظ مع معاينة الطباعة" },
        ],
    },
    {
        title: "التنقل السريع",
        items: [
            { keys: "F4", description: "الانتقال إلى بحث الأصناف" },
            { keys: "F5", description: "الانتقال إلى بحث الموردين" },
            { keys: "Esc", description: "الانتقال إلى حقل المدفوع عند عدم فتح أي مودال" },
        ],
    },
    {
        title: "الأصناف والموردون",
        items: [
            { keys: "Arrow Up / Arrow Down", description: "التنقل بين الأصناف أو الموردين في القوائم" },
            { keys: "Enter", description: "اختيار الصنف أو المورد المحدد" },
            { keys: "Esc", description: "إلغاء التحديد أو غلق قائمة الاختيار" },
        ],
    },
    {
        title: "مودال الكمية",
        items: [
            { keys: "Enter", description: "تأكيد إضافة الكمية المحددة" },
            { keys: "Arrow Up / Arrow Down", description: "زيادة أو تقليل الكمية داخل المودال" },
            { keys: "Esc", description: "إغلاق مودال الكمية" },
        ],
    },
];

/**
 * ============================================
 * Sub Components - المكونات الفرعية
 * ============================================
 */

/**
 * عنصان تبويب الفاتورة
 * يعرض اسم العميل أو رقم الفاتورة
 */
const InvoiceTab = ({ invoice, isActive, onSelect, onClose, canClose }) => {
    let tabLabel = invoice.customer ? `مورد: ${invoice.customer.name}` : `فاتورة ${invoice.id}`;
    if (invoice.editorMode === "payment" && invoice.sourcePaymentId) {
        tabLabel = `تعديل دفعة #${invoice.sourcePaymentId}`;
    } else if (invoice.isEditMode && invoice.sourceSaleId) {
        tabLabel = `تعديل فاتورة #${invoice.sourceSaleId}`;
    }

    return (
        <div
            onClick={onSelect}
            style={{
                padding: "8px 15px",
                backgroundColor: isActive ? "#f97316" : "#ffedd5",
                color: isActive ? "white" : "#9a3412",
                borderRadius: "8px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                minWidth: "120px",
                justifyContent: "space-between",
                boxShadow: isActive ? "0 4px 8px -1px rgba(249, 115, 22, 0.45)" : "none",
                transition: "all 0.2s",
            }}
        >
            <span>{tabLabel}</span>
            {canClose && (
                <span
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                    }}
                    style={{ fontSize: "18px", lineHeight: "1", opacity: 0.7 }}
                >
                    ×
                </span>
            )}
        </div>
    );
};

/**
 * بطاقة المنتج
 * تعرض: الاسم، السعر، المخزون المتاح
 */
const ProductCard = ({ product, onClick }) => (
    <div
        onClick={onClick}
        style={{
            border: "1px solid #e5e7eb",
            borderRadius: "10px",
            padding: "12px",
            cursor: "pointer",
            textAlign: "center",
            backgroundColor: "white",
            transition: "all 0.2s",
            boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
            position: "relative",
            overflow: "hidden",
        }}
        onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-3px)";
            e.currentTarget.style.boxShadow = "0 6px 12px rgba(0,0,0,0.1)";
        }}
        onMouseLeave={(e) => {
            e.currentTarget.style.transform = "none";
            e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.05)";
        }}
    >
        <div
            style={{
                fontWeight: "bold",
                marginBottom: "5px",
                fontSize: "14px",
                color: "#1f2937",
            }}
        >
            {product.name}
        </div>
        <div
            style={{
                color: "#059669",
                fontWeight: "bold",
                fontSize: "15px",
                marginBottom: "5px",
            }}
        >
            {product.basePrice.toFixed(2)}
        </div>
        <div
            style={{
                fontSize: "11px",
                color: product.totalQuantity > 0 ? "#6b7280" : "#ef4444",
                backgroundColor: product.totalQuantity > 0 ? "#f3f4f6" : "#fee2e2",
                padding: "2px 6px",
                borderRadius: "4px",
                display: "inline-block",
            }}
        >
            المخزون: {product.totalQuantity}
        </div>
    </div>
);

/**
 * صف في عربة التسوق
 * يعرض: المنتج، السعر، الكمية، الحذف
 */
const CartItemRow = ({ item, onUpdate, onRemove, onShowDetails }) => (
    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
        <td style={{ padding: "12px", textAlign: "center" }}>
            <input
                type="checkbox"
                checked={item.printBarcode !== false}
                onChange={(e) => onUpdate({ printBarcode: e.target.checked })}
                style={{
                    width: "18px",
                    height: "18px",
                    cursor: "pointer",
                }}
                title="طباعة باركود؟"
            />
        </td>
        <td style={{ padding: "12px" }}>
            <div style={{ fontWeight: "bold", fontSize: "14px" }}>
                {item.productName}
            </div>
            {hasMeaningfulVariantLabels(item.size, item.color) ? (
                <div style={{ fontSize: "12px", color: "#6b7280" }}>
                    {sanitizeVariantLabel(item.size)} | {sanitizeVariantLabel(item.color)}
                </div>
            ) : null}
        </td>
        <td style={{ padding: "12px", textAlign: "center" }}>
            <input
                type="number"
                value={item.price}
                onChange={(e) => onUpdate({ price: parseFloat(e.target.value) || 0 })}
                min="0"
                step="0.01"
                style={{
                    width: "70px",
                    padding: "5px",
                    borderRadius: "4px",
                    border: "1px solid #d1d5db",
                    textAlign: "center",
                }}
            />
        </td>
        <td style={{ padding: "12px", textAlign: "center" }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "5px",
                }}
            >
                <button
                    onClick={() => onUpdate({ quantity: item.quantity - 1 })}
                    style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "4px",
                        border: "none",
                        backgroundColor: "#ff5757ff",

                        cursor: "pointer",
                        color: "white",
                    }}
                    disabled={item.quantity <= 1}
                >
                    -
                </button>
                <span style={{ fontWeight: "bold", minWidth: "20px" }}>
                    {item.quantity}
                </span>
                <button
                    onClick={() => onUpdate({ quantity: item.quantity + 1 })}
                    style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "4px",
                        border: "none",
                        cursor: "pointer",
                        backgroundColor: "#10b981",
                        color: "white",
                    }}
                >
                    +
                </button>
            </div>
        </td>
        <td
            style={{
                padding: "12px",
                textAlign: "center",
                fontWeight: "bold",
                color: "#059669",
            }}
        >
            {(item.price * item.quantity).toFixed(2)}
        </td>
        <td style={{ padding: "12px", textAlign: "center" }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                }}
            >
                <button
                    onClick={onShowDetails}
                    style={{
                        width: "30px",
                        height: "30px",
                        borderRadius: "6px",
                        border: "none",
                        backgroundColor: "#eff6ff",
                        color: "#2563eb",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "16px",
                    }}
                    title="تفاصيل المنتج السابقة"
                >
                    ℹ️
                </button>
                <button
                    onClick={onRemove}
                    style={{
                        color: "#ef4444",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "18px",
                    }}
                >
                    <i className="fas fa-trash" style={{ color: "#ef4444", cursor: "pointer" }}></i>

                </button>
            </div>
        </td>
    </tr>
);

/**
 * ============================================
 * Main Component - المكون الرئيسي
 * ============================================
 */

/**
 * نظام نقطة البيع المحسّن (Enhanced POS)
 * الميزات الرئيسية:
 * - إدارة متعددة الفواتير (Multi-invoice)
 * - بحث فوري عن المنتجات
 * - نظام إدارة العملاء
 * - دعم كامل للكيبورد
 * - إخطارات Toast محترفة
 */
export default function Purchases() {
    const currentUser = (() => {
        try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
    })();
    /**
     * ========== البيانات العامة ==========
     * المتغيرات المرتبطة بقاعدة البيانات
     */
    const [variants, setVariants] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [warehouses, setWarehouses] = useState([]); // Added warehouses state
    const [paymentMethods, setPaymentMethods] = useState(DEFAULT_POS_PAYMENT_METHODS);
    const [loading, setLoading] = useState(false);

    /**
     * ========== حالة الفواتير المتعددة ==========
     * إدارة فواتير متعددة في نفس الجلسة
     */
    const [invoices, setInvoices] = useState(() => {
        try {
            const saved = sessionStorage.getItem("purchase_invoices");
            if (saved) {
                const parsedInvoices = JSON.parse(saved);
                if (Array.isArray(parsedInvoices) && parsedInvoices.length > 0) {
                    return parsedInvoices.map(normalizeStoredInvoice);
                }
                return [createEmptyInvoice()];
            }
            return [createEmptyInvoice()];
        } catch (e) {
            return [createEmptyInvoice()];
        }
    });

    /**
     * معرّف الفاتورة النشطة الحالية
     */
    const [activeInvoiceId, setActiveInvoiceId] = useState(() => {
        return (
            sessionStorage.getItem("purchase_activeId") || (invoices[0] ? invoices[0].id : "")
        );
    });

    /**
     * ========== حالة الواجهة (UI State) ==========
     * البحث، الاختيار، العرض والإدارة
     */
    const [searchTerm, setSearchTerm] = useState("");
    const [showProductModal, setShowProductModal] = useState(false);
    const [isSavingProduct, setIsSavingProduct] = useState(false);
    const [categories, setCategories] = useState([]);
    const [customerSearchTerm, setCustomerSearchTerm] = useState("");


    const [selectedProductForVariant, setSelectedProductForVariant] =
        useState(null);
    const [selectedCustomerIndex, setSelectedCustomerIndex] = useState(-1);
    const [selectedProductIndex, setSelectedProductIndex] = useState(-1);
    const [productDisplayMode, setProductDisplayMode] = useState(() => getDefaultPurchaseProductDisplayMode()); // 'grid' or 'list'
    const [selectedVariantIndex, setSelectedVariantIndex] = useState(-1);
    const searchInputRef = useRef(null);
    const customerDropdownRef = useRef(null);
    const customerListRef = useRef(null);
    const productGridRef = useRef(null);
    const variantModalRef = useRef(null);
    const showPaymentEditModalRef = useRef(false);
    const isFirstOpenRef = useRef(true);
    const handleCheckoutRef = useRef(null);
    const paymentInputRef = useRef(null);
    const isAnyModalOpenRef = useRef(false);
    const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
    const [newCustomer, setNewCustomer] = useState({
        name: "",
        phone: "",
        phone2: "",
        address: "",
        city: "",
        district: "",
        notes: "",
        creditLimit: 0,
        customerType: "عادي",
    });
    const [productDetailsModal, setProductDetailsModal] = useState({
        open: false,
        item: null,
    });
    const [showCustomerList, setShowCustomerList] = useState(false);
    const [showSupplierLedger, setShowSupplierLedger] = useState(null);
    const [showInvoicePreview, setShowInvoicePreview] = useState(false);
    const [showPaymentEditModal, setShowPaymentEditModal] = useState(false);
    const [showShortcutsModal, setShowShortcutsModal] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [singleQuantityModal, setSingleQuantityModal] = useState({
        open: false,
        product: null,
        variant: null,
        quantity: 1,
        maxQuantity: Number.MAX_SAFE_INTEGER,
    });

    /**
     * ========== حالة الإشعارات ==========
     * نظام Toast للرسائل المختلفة
     */
    const [toast, setToast] = useState(null);
    
    // --- Barcode Studio State ---
    const [showBarcodeStudio, setShowBarcodeStudio] = useState(false);
    const [barcodeStudioProducts, setBarcodeStudioProducts] = useState([]);
    const [barcodePrinting, setBarcodePrinting] = useState(false);
    const [barcodeStudioTab, setBarcodeStudioTab] = useState(BARCODE_STUDIO_TABS[0]?.id || "output");
    const [matrixBarcodeLibrary, setMatrixBarcodeLibrary] = useState(null);
    const [matrixBarcodeEngineLoading, setMatrixBarcodeEngineLoading] = useState(false);
    const [matrixBarcodeEngineError, setMatrixBarcodeEngineError] = useState("");
    const [barcodeTemplates, setBarcodeTemplates] = useState([]);
    const [activeBarcodeTemplateId, setActiveBarcodeTemplateId] = useState("");
    const [barcodeTemplateName, setBarcodeTemplateName] = useState("");
    const [barcodeTemplatePrinter, setBarcodeTemplatePrinter] = useState("");
    const [printers, setPrinters] = useState([]);
    const [loadingPrinters, setLoadingPrinters] = useState(false);
    const [barcodeStudioSettings, setBarcodeStudioSettings] = useState(() => {
        const appSettings = getAppSettings();
        return sanitizeBarcodeStudioSettings(appSettings.defaultBarcodeStudioSettings || DEFAULT_BARCODE_STUDIO);
    });

    const isRefreshingPrinters = useRef(false);



    const showToast = useCallback((message, type = "info") => {
        setToast({ message, type });
    }, []);

    /**
     * ========== حالات إضافية للواجهة ==========
     */
    const [searchMode, setSearchMode] = useState(() => getDefaultPurchaseSearchMode()); // 'name' أو 'barcode'

    const productNeedsVariantSelection = useCallback((product) => {
        const productVariants = Array.isArray(product?.variants) ? product.variants : [];
        if (productVariants.length === 0) return false;
        return productVariants.some((variant) =>
            hasMeaningfulVariantLabels(variant?.productSize, variant?.color)
        );
    }, []);

    const openSingleQuantityModal = useCallback((product) => {
        const productVariants = Array.isArray(product?.variants) ? product.variants : [];
        const baseVariant = productVariants[0] || null;

        if (!baseVariant) {
            showToast("هذا المنتج غير جاهز للشراء", "error");
            return;
        }

        setSingleQuantityModal({
            open: true,
            product,
            variant: baseVariant,
            quantity: 1,
            maxQuantity: Number.MAX_SAFE_INTEGER,
        });
    }, [showToast]);

    const closeSingleQuantityModal = useCallback(() => {
        setSingleQuantityModal({
            open: false,
            product: null,
            variant: null,
            quantity: 1,
            maxQuantity: Number.MAX_SAFE_INTEGER,
        });
    }, []);

    const handleProductSelection = useCallback((product, index = null) => {
        if (!product) return;
        if (Number.isInteger(index) && index >= 0) {
            setSelectedProductIndex(index);
        }

        if (productNeedsVariantSelection(product)) {
            setSelectedProductForVariant(product);
            setSelectedVariantIndex(-1);
            return;
        }

        setSelectedProductForVariant(null);
        setSelectedVariantIndex(-1);
        openSingleQuantityModal(product);
    }, [openSingleQuantityModal, productNeedsVariantSelection]);

    useEffect(() => {
        showPaymentEditModalRef.current = showPaymentEditModal;
        isAnyModalOpenRef.current = 
            showPaymentEditModal || 
            singleQuantityModal.open || 
            Boolean(selectedProductForVariant) || 
            showNewCustomerModal || 
            showShortcutsModal ||
            Boolean(showSupplierLedger) || 
            showInvoicePreview || 
            productDetailsModal.open;
    }, [showPaymentEditModal, singleQuantityModal.open, selectedProductForVariant, showNewCustomerModal, showShortcutsModal, showSupplierLedger, showInvoicePreview, productDetailsModal.open]);

    /**
     * ========== الحالة المشتقة ==========
     * حسابات وبيانات مشتقة من البيانات الأساسية
     */
    const activeInvoice =
        invoices.find((inv) => inv.id === activeInvoiceId) || invoices[0];
    const calculations = useInvoiceCalculations(activeInvoice);

    /**
     * تحديث تلقائي للمبلغ المدفوع عند تغيير إجمالي الفاتورة
     * في حال كانت الفاتورة "نقدي" فقط ولست في وضع التعديل لضمان عدم الكتابة فوق بيانات قديمة
     */
    useEffect(() => {
        if (
            activeInvoice?.saleType === "نقدي" &&
            activeInvoice?.editorMode !== "payment" &&
            !activeInvoice?.isEditMode
        ) {
            const currentPaid = parseFloat(activeInvoice.paidAmount) || 0;
            const total = calculations.total || 0;
            // إذا كان المبلغ المدفوع يختلف عن الإجمالي، نقوم بتحديثه
            if (activeInvoice.paidAmount === "" || Math.abs(currentPaid - total) > 0.01) {
                updateInvoice({ paidAmount: total > 0 ? total.toFixed(2) : "" });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [calculations.total, activeInvoice?.saleType, activeInvoice?.editorMode, activeInvoice?.isEditMode]);

    const supplierPreviousBalance = activeInvoice?.customer
        ? toNumberSafe(activeInvoice.customer.balance, 0)
        : 0;

    // --- Barcode Studio Derived State ---
    const barcodeStudioRows = useMemo(() => {
        if (!barcodeStudioProducts || !barcodeStudioProducts.length) return [];
        
        const preparedItems = [];
        barcodeStudioProducts.forEach(item => {
            const variantId = item.variantId || (item.variants ? null : item.id);
            
            if (variantId) {
                // Single variant (likely from cart)
                const v = variants.find(v => String(v.id) === String(variantId));
                preparedItems.push({
                    quantity: item.quantity || 1,
                    productName: item.name || item.productName,
                    size: item.size || v?.productSize,
                    color: item.color || v?.color,
                    price: item.price || v?.price,
                    variant: v || { 
                        id: variantId, 
                        product: { name: item.name || item.productName, barcode: item.barcode, sku: item.sku } 
                    }
                });
            } else if (item.variants && Array.isArray(item.variants)) {
                // Product group with multiple variants (from search)
                item.variants.forEach(v => {
                    preparedItems.push({
                        quantity: item.quantity || 1,
                        productName: item.name,
                        size: v.productSize,
                        color: v.color,
                        price: v.price || item.basePrice,
                        variant: { ...v, product: { name: item.name, barcode: item.barcode, sku: item.sku } }
                    });
                });
            }
        });
        
        return barcodeRowsFromPurchaseItems(preparedItems);
    }, [barcodeStudioProducts, variants]);

    const barcodePreview = useMemo(() => {
        const safeSettings = sanitizeBarcodeStudioSettings(barcodeStudioSettings);
        // Build first 10 labels for preview
        const { labels } = buildBarcodeLabels(barcodeStudioRows, safeSettings, 10);
        return { labels };
    }, [barcodeStudioRows, barcodeStudioSettings]);

    const activeBarcodeTemplate = useMemo(
        () => barcodeTemplates.find(t => t.id === activeBarcodeTemplateId) || null,
        [barcodeTemplates, activeBarcodeTemplateId]
    );

    const barcodePrintPreferences = useMemo(() => {
        const appSettings = getAppSettings();
        return {
            printerName: normalizeDefaultPrinterName(
                activeBarcodeTemplate?.printer
                || barcodeTemplatePrinter
                || appSettings.defaultBarcodePrinterName
                || appSettings.defaultPrinterName
            ),
            printMode: normalizeBarcodePrintMode(appSettings.defaultBarcodePrintMode),
            startTab: normalizeBarcodeStudioStartTab(appSettings.defaultBarcodeStudioStartTab),
            studioDefaults: sanitizeBarcodeStudioSettings(
                appSettings.defaultBarcodeStudioSettings || DEFAULT_BARCODE_STUDIO
            )
        };
    }, [activeBarcodeTemplate, barcodeTemplatePrinter]);

    const barcodeStudioSafeSettings = useMemo(
        () => sanitizeBarcodeStudioSettings(barcodeStudioSettings),
        [barcodeStudioSettings]
    );

    const barcodePreviewIsMatrix = useMemo(
        () => isMatrixBarcodeFormat(barcodeStudioSafeSettings.format),
        [barcodeStudioSafeSettings.format]
    );

    const supplierPaidAmount = Math.max(0, toNumberSafe(calculations.paid, 0));
    const supplierProjectedBalance = activeInvoice?.customer
        ? supplierPreviousBalance + supplierPaidAmount
        : null;
    const supplierProjectedBalanceDisplay = supplierProjectedBalance == null
        ? null
        : Math.abs(supplierProjectedBalance);
    const purchaseItemCount = activeInvoice?.cart?.length || 0;
    const purchaseTotalQuantity = useMemo(
        () => (activeInvoice?.cart || []).reduce((sum, item) => sum + toNumberSafe(item.quantity, 0), 0),
        [activeInvoice?.cart]
    );
    const variantQuantityById = useMemo(() => {
        const map = new Map();
        variants.forEach((variant) => {
            map.set(variant.id, toNumberSafe(variant.quantity, 0));
        });
        return map;
    }, [variants]);
    const getDefaultPaymentMethodId = useCallback(() => {
        const firstMethod = Array.isArray(paymentMethods) ? paymentMethods[0] : null;
        return firstMethod?.id || 'CASH';
    }, [paymentMethods]);
    const resolveInvoicePaymentMethodId = useCallback((rawMethod) => {
        const directId = parseInt(rawMethod, 10);
        if (Number.isFinite(directId) && directId > 0) {
            const exists = paymentMethods.some((method) => parseInt(method?.id, 10) === directId);
            if (exists || paymentMethods.length === 0) {
                return directId;
            }
        }

        const normalizedInput = String(rawMethod || "").trim();
        if (!normalizedInput) return getDefaultPaymentMethodId();
        const normalizedName = normalizedInput.toLowerCase();
        const mappedCode = normalizePaymentMethodCode(normalizedInput);
        const matchedMethod = paymentMethods.find((method) => {
            const methodCode = String(method?.code || "").trim().toUpperCase();
            const methodName = String(method?.name || "").trim().toLowerCase();
            return methodCode === mappedCode || methodName === normalizedName;
        });

        if (matchedMethod?.id) return matchedMethod.id;

        return getDefaultPaymentMethodId();
    }, [paymentMethods, getDefaultPaymentMethodId]);
    const paymentMethodButtons = useMemo(() => {
        const filteredMethods = filterPosPaymentMethods(paymentMethods);
        const source = filteredMethods.length > 0
            ? filteredMethods
            : DEFAULT_POS_PAYMENT_METHODS;

        return source.map((method) => {
            const normalizedCode = String(method?.code || "")
                .trim()
                .toUpperCase()
                .replace(/[\s-]+/g, "_");
            const visuals = PAYMENT_METHOD_UI_PRESETS[normalizedCode] || {
                color: "#2563eb",
                bg: "#eff6ff",
                text: "#1d4ed8",
            };

            return {
                ...method,
                buttonValue: String(method?.id ?? method?.code ?? method?.name ?? ""),
                normalizedCode,
                ...visuals,
            };
        });
    }, [paymentMethods]);
    const paymentEditModalCustomer = useMemo(() => {
        if (!activeInvoice?.customer || activeInvoice?.editorMode !== "payment") return null;
        const originalPaymentAmount = toNumberSafe(activeInvoice?.paymentEdit?.amount, 0);
        return {
            ...activeInvoice.customer,
            balance: toNumberSafe(activeInvoice.customer.balance, 0) + originalPaymentAmount,
        };
    }, [activeInvoice]);
    const paymentEditModalData = useMemo(() => ({
        amount: activeInvoice?.paymentEdit?.amount ?? "",
        notes: activeInvoice?.paymentEdit?.notes || "",
        paymentDate: activeInvoice?.paymentEdit?.paymentDate || getTodayDate(),
        paymentMethodId: parseInt(activeInvoice?.paymentEdit?.paymentMethodId, 10) || getDefaultPaymentMethodId(),
    }), [activeInvoice, getDefaultPaymentMethodId]);

    /**
     * حفظ البيانات في localStorage
     * للحفاظ على حالة الفواتير بين الجلسات
     */
    useEffect(() => {
        sessionStorage.setItem("purchase_invoices", JSON.stringify(invoices));
        sessionStorage.setItem("purchase_activeId", activeInvoiceId);
    }, [invoices, activeInvoiceId]);

    useEffect(() => {
        if (!Array.isArray(paymentMethods) || paymentMethods.length === 0) return;

        setInvoices((prev) => prev.map((invoice) => {
            if (invoice?.editorMode === "payment") return invoice;

            const resolvedId = resolveInvoicePaymentMethodId(invoice?.paymentMethod);
            const nextValue = String(resolvedId || "");
            return String(invoice?.paymentMethod || "") === nextValue
                ? invoice
                : { ...invoice, paymentMethod: nextValue };
        }));
    }, [paymentMethods, resolveInvoicePaymentMethodId]);

    /**
     * بناء فهرس المنتجات (يتم مرة واحدة عند تغيير variants)
     * هذا يجعل الفلترة سريعة وفورية مثل بحث العملاء
     */
    const allProductGroups = useMemo(() => {
        const groups = {};
        variants.forEach((variant) => {
            const displayCost = toNumberSafe(variant.cost, toNumberSafe(variant.price, 0));
            if (!groups[variant.productId]) {
                groups[variant.productId] = {
                    id: variant.productId,
                    name: variant.product.name,
                    nameLower: variant.product.name.toLowerCase(),
                    basePrice: displayCost,
                    totalQuantity: 0,
                    variants: [],
                };
            }
            groups[variant.productId].variants.push(variant);
            groups[variant.productId].totalQuantity += variant.quantity;
        });
        return Object.values(groups);
    }, [variants]);

    /**
     * فلترة فورية على الفهرس الجاهز (سريعة مثل بحث العملاء)
     * محدودة بـ 30 نتيجة كحد أقصى
     */
    const groupedProducts = useMemo(() => {
        if (!searchTerm || searchTerm.trim() === "") return [];

        if (searchMode === "barcode") {
            return allProductGroups
                .filter(p => p.variants.some(v => v.barcode?.includes(searchTerm)))
                .slice(0, 30);
        }

        const searchLower = searchTerm.toLowerCase();
        return allProductGroups
            .filter(p => p.nameLower.includes(searchLower))
            .slice(0, 30);
    }, [allProductGroups, searchTerm, searchMode]);

    /**
     * فلترة العملاء حسب البحث
     * تحديد أقصى 50 عميل بدون بحث، و 20 مع البحث
     */
    const filteredCustomers = useMemo(() => {
        if (!Array.isArray(customers)) return [];
        if (showCustomerList && !customerSearchTerm) return customers.slice(0, 50);
        if (!customerSearchTerm) return [];
        const lowerTerm = customerSearchTerm.toLowerCase();
        return customers
            .filter(
                (c) =>
                    c.name.toLowerCase().includes(lowerTerm) ||
                    c.phone?.includes(lowerTerm),
            )
            .slice(0, 20);
    }, [customers, customerSearchTerm, showCustomerList]);

    /**
     * ========== معالجات الكيبورد ==========
     * التنقل والاختيار باستخدام الأسهم و Enter
     */

    /**
     * معالجة مفاتيح الكيبورد للتنقل بين المنتجات
     * تنقل فقط بالأسهم (↑/↓)
     */
    const handleProductKeyDown = (e) => {
        // ⚠️ تجاهل أحداث الكيبورد إذا كان موديال المقاسات مفتوحاً
        if (selectedProductForVariant || singleQuantityModal.open) return;

        if (groupedProducts.length === 0) return;

        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setSelectedProductIndex((prev) =>
                    prev < groupedProducts.length - 1 ? prev + 1 : prev,
                );
                break;
            case "ArrowUp":
                e.preventDefault();
                setSelectedProductIndex((prev) => (prev > 0 ? prev - 1 : -1));
                break;
            case "Enter":
                e.preventDefault();
                if (
                    selectedProductIndex >= 0 &&
                    groupedProducts[selectedProductIndex]
                ) {
                    const selectedProduct = groupedProducts[selectedProductIndex];
                    handleProductSelection(selectedProduct, selectedProductIndex);
                }
                break;
            case "Escape":
                e.preventDefault();
                setSelectedProductIndex(-1);
                break;
            default:
                break;
        }
    };

    const handleCustomerKeyDown = (e) => {
        if (!showCustomerList || filteredCustomers.length === 0) return;

        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setSelectedCustomerIndex((prev) =>
                    prev < filteredCustomers.length - 1 ? prev + 1 : prev,
                );
                break;
            case "ArrowUp":
                e.preventDefault();
                setSelectedCustomerIndex((prev) => (prev > 0 ? prev - 1 : -1));
                break;
            case "Enter":
                e.preventDefault();
                if (
                    selectedCustomerIndex >= 0 &&
                    filteredCustomers[selectedCustomerIndex]
                ) {
                    const selectedCustomer = filteredCustomers[selectedCustomerIndex];
                    updateInvoice({ customer: selectedCustomer });
                    setCustomerSearchTerm("");
                    setShowCustomerList(false);
                    setSelectedCustomerIndex(-1);
                }
                break;
            case "Escape":
                e.preventDefault();
                setShowCustomerList(false);
                setSelectedCustomerIndex(-1);
                break;
            default:
                break;
        }
    };

    /**
     * ========== Effects - المؤثرات الجانبية ==========
     * تحميل البيانات، معالجات المفاتيح، الـ cleanup
     */
    useEffect(() => {
        loadData(true);

        const handleKeyPress = (e) => {
            if (showPaymentEditModalRef.current) return;

            if (e.key === "F1") {
                e.preventDefault();
                if (handleCheckoutRef.current) handleCheckoutRef.current(true);
            } else if (e.key === "F2") {
                e.preventDefault();
                if (handleCheckoutRef.current) handleCheckoutRef.current(false);
            } else if (e.key === "F3") {
                e.preventDefault();
                if (handleCheckoutRef.current) handleCheckoutRef.current(false, true);
            } else if (e.key === "F4") {
                e.preventDefault();
                if (searchInputRef.current) {
                    searchInputRef.current.focus();
                }
            } else if (e.key === "F5") {
                e.preventDefault();
                const customerInput = document.querySelector(
                    'input[placeholder*="ابحث عن مورد"]',
                );
                if (customerInput) {
                    customerInput.focus();
                }
            } else if (e.key === "Escape") {
                if (!isAnyModalOpenRef.current && paymentInputRef.current) {
                    e.preventDefault();
                    paymentInputRef.current.focus();
                }
            }
        };

        document.addEventListener("keydown", handleKeyPress);
        return () => document.removeEventListener("keydown", handleKeyPress);
    }, []);

    // === Reset selected customer index when search term changes ===
    useEffect(() => {
        setSelectedCustomerIndex(-1);
    }, [customerSearchTerm]);

    // === Auto scroll to selected customer ===
    useEffect(() => {
        if (selectedCustomerIndex >= 0 && customerListRef.current) {
            const items = customerListRef.current.querySelectorAll(
                "[data-customer-index]",
            );
            if (items[selectedCustomerIndex]) {
                items[selectedCustomerIndex].scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                });
            }
        }
    }, [selectedCustomerIndex]);

    /**
     * Scroll تلقائي للمنتج المختار بالكيبورد
     */
    useEffect(() => {
        if (selectedProductIndex >= 0 && productGridRef.current) {
            const items = productGridRef.current.querySelectorAll(
                "[data-product-index]",
            );
            if (items[selectedProductIndex]) {
                items[selectedProductIndex].scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                });
            }
        }
    }, [selectedProductIndex]);

    /**
     * إعادة تعيين الفهرس عند تغيير البحث
     */
    useEffect(() => {
        setSelectedProductIndex(-1);
    }, [searchTerm]);

    /**
     * Scroll تلقائي للمتغير المحدد في الموديال
     */
    useEffect(() => {
        if (selectedVariantIndex >= 0 && variantModalRef.current) {
            const items = variantModalRef.current.querySelectorAll(
                "[data-variant-index]",
            );
            if (items[selectedVariantIndex]) {
                items[selectedVariantIndex].scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                });
            }
        }
    }, [selectedVariantIndex]);

    /**
     * إغلاق قائمة العملاء عند الضغط خارجها
     */
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                customerDropdownRef.current &&
                !customerDropdownRef.current.contains(event.target)
            ) {
                setShowCustomerList(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const loadData = async (isBackground = false) => {
        try {
            if (!isBackground) setLoading(true);
            const [variantsData, customersData, warehousesData] = await Promise.all([
                window.api.getVariants(),
                window.api.getSuppliers(),
                window.api.getWarehouses?.() ?? Promise.resolve([]),
            ]);

            if (!variantsData.error) setVariants(variantsData);
            if (!customersData.error) {
                const suppliers = Array.isArray(customersData)
                    ? customersData
                    : (Array.isArray(customersData?.data) ? customersData.data : []);
                setCustomers(suppliers);
            }
            // Payment methods are hardcoded in DEFAULT_POS_PAYMENT_METHODS
            if (Array.isArray(warehousesData)) { // Set warehouses state
                setWarehouses(warehousesData);
            }
        } catch (error) {
            console.error(error);
            if (!isBackground) showToast("فشل في تحميل البيانات", "error");
        } finally {
            if (!isBackground) setLoading(false);
        }
    };

    const refreshPrinters = useCallback(async () => {
        if (isRefreshingPrinters.current) return;
        isRefreshingPrinters.current = true;
        setLoadingPrinters(true);
        try {
            const list = await window.api.getPrinters();
            setPrinters(Array.isArray(list) ? list : []);
        } catch (err) {
            console.error("Failed to load printers:", err);
        } finally {
            isRefreshingPrinters.current = false;
            setLoadingPrinters(false);
        }
    }, []);

    const loadBarcodeTemplates = useCallback(() => {
        try {
            const raw = localStorage.getItem(BARCODE_TEMPLATE_STORAGE_KEY);
            setBarcodeTemplates(parseBarcodeTemplates(raw));
        } catch (err) {
            console.error("Failed to load barcode templates:", err);
        }
    }, []);

    useEffect(() => {
        refreshPrinters();
        loadBarcodeTemplates();
    }, [refreshPrinters, loadBarcodeTemplates]);

    const applyBarcodeSystemDefaults = useCallback(() => {
        const appSettings = getAppSettings();
        const nextPrinterName = normalizeDefaultPrinterName(
            appSettings.defaultBarcodePrinterName || appSettings.defaultPrinterName
        );

        setActiveBarcodeTemplateId("");
        setBarcodeTemplateName("");
        setBarcodeTemplatePrinter(nextPrinterName);
        setBarcodeStudioSettings(
            sanitizeBarcodeStudioSettings(appSettings.defaultBarcodeStudioSettings || DEFAULT_BARCODE_STUDIO)
        );
        setBarcodeStudioTab(normalizeBarcodeStudioStartTab(appSettings.defaultBarcodeStudioStartTab));
    }, []);

    const setBarcodeSetting = useCallback((key, value) => {
        setBarcodeStudioSettings(prev => ({ ...prev, [key]: value }));
    }, []);

    const setBarcodeNumberSetting = useCallback((key, value) => {
        setBarcodeStudioSettings(prev => ({ ...prev, [key]: parseFloat(value) || 0 }));
    }, []);

    const applyBarcodePreset = useCallback((preset) => {
        if (!preset) return;
        setBarcodeStudioSettings(prev => ({
            ...prev,
            presetId: preset.id,
            labelWidthMm: preset.widthMm || prev.labelWidthMm,
            labelHeightMm: preset.heightMm || prev.labelHeightMm
        }));
    }, []);

    const applyBarcodeTemplate = useCallback((templateId) => {
        const template = barcodeTemplates.find(t => t.id === templateId);
        if (!template) {
            applyBarcodeSystemDefaults();
            return;
        }
        setActiveBarcodeTemplateId(template.id);
        setBarcodeTemplateName(template.name);
        setBarcodeTemplatePrinter(template.printer);
        setBarcodeStudioSettings(sanitizeBarcodeStudioSettings(template.settings));
    }, [barcodeTemplates, applyBarcodeSystemDefaults]);

    const saveNewBarcodeTemplate = useCallback((name, printer) => {
        const newTemplate = sanitizeBarcodeTemplate({
            id: `template-${Date.now()}`,
            name,
            printer,
            settings: barcodeStudioSettings
        });
        const next = [...barcodeTemplates, newTemplate];
        setBarcodeTemplates(next);
        localStorage.setItem(BARCODE_TEMPLATE_STORAGE_KEY, JSON.stringify(next));
        setActiveBarcodeTemplateId(newTemplate.id);
        showToast("✅ تم حفظ القالب الجديد بنجاح", "success");
    }, [barcodeTemplates, barcodeStudioSettings, showToast]);

    const updateBarcodeTemplate = useCallback((id, updates) => {
        const next = barcodeTemplates.map(t => t.id === id ? sanitizeBarcodeTemplate({ ...t, ...updates, settings: barcodeStudioSettings }) : t);
        setBarcodeTemplates(next);
        localStorage.setItem(BARCODE_TEMPLATE_STORAGE_KEY, JSON.stringify(next));
        showToast("✅ تم تحديث القالب بنجاح", "success");
    }, [barcodeTemplates, barcodeStudioSettings, showToast]);

    const deleteBarcodeTemplate = useCallback((id) => {
        const next = barcodeTemplates.filter(t => t.id !== id);
        setBarcodeTemplates(next);
        localStorage.setItem(BARCODE_TEMPLATE_STORAGE_KEY, JSON.stringify(next));
        if (activeBarcodeTemplateId === id) {
            applyBarcodeSystemDefaults();
        }
        showToast("✅ تم حذف القالب بنجاح", "success");
    }, [barcodeTemplates, activeBarcodeTemplateId, applyBarcodeSystemDefaults, showToast]);

    const saveBarcodeSystemSettings = useCallback(async (settings) => {
        try {
            const current = getAppSettings();
            const updated = {
                ...current,
                defaultBarcodePrinterName: settings.printerName,
                defaultBarcodePrintMode: settings.printMode,
                defaultBarcodeStudioStartTab: settings.startTab,
                defaultBarcodeStudioSettings: barcodeStudioSettings
            };
            saveAppSettings(updated);
            showToast("✅ تم حفظ الإعدادات الافتراضية للنظام", "success");
        } catch (err) {
            showToast("❌ فشل حفظ إعدادات النظام", "error");
        }
    }, [barcodeStudioSettings, showToast]);

    const ensureMatrixBarcodeLibrary = useCallback(async () => {
        if (matrixBarcodeLibrary && typeof matrixBarcodeLibrary.toSVG === "function") {
            return matrixBarcodeLibrary;
        }
        setMatrixBarcodeEngineLoading(true);
        try {
            const module = await import("bwip-js");
            const loaded = module?.default && typeof module.default.toSVG === "function" ? module.default : module;
            setMatrixBarcodeLibrary(loaded);
            return loaded;
        } catch (err) {
            setMatrixBarcodeEngineError("تعذر تحميل محرك QR/DataMatrix");
            throw err;
        } finally {
            setMatrixBarcodeEngineLoading(false);
        }
    }, [matrixBarcodeLibrary]);

    const executeBarcodeStudioPrint = async () => {
        if (barcodePrinting || !barcodeStudioRows.length) return;
        setBarcodePrinting(true);
        try {
            let matrixLib = null;
            if (isMatrixBarcodeFormat(barcodeStudioSafeSettings.format)) {
                matrixLib = await ensureMatrixBarcodeLibrary();
            }

            const { labels } = buildBarcodeLabels(barcodeStudioRows, barcodeStudioSafeSettings, Number.POSITIVE_INFINITY, matrixLib);
            if (!labels.length) {
                showToast("لا توجد أكواد صالحة للطباعة", "warning");
                return;
            }

            const html = barcodeStudioHtml(labels, barcodeStudioSafeSettings);
            const pageSize = calculateBarcodePageSize(labels.length, barcodeStudioSafeSettings);

            const result = await safePrint(html, {
                title: `ملصقات باركود المشتريات (${labels.length})`,
                printerName: barcodePrintPreferences.printerName,
                silent: barcodePrintPreferences.printMode === "silent",
                preview: barcodePrintPreferences.printMode === "preview",
                rawPreview: true,
                printOptions: {
                    printBackground: true,
                    pageSize
                }
            });

            if (result?.error) throw new Error(result.error);
            showToast("✅ تم إرسال أمر الطباعة بنجاح", "success");
        } catch (err) {
            showToast("❌ فشل طباعة الباركود: " + err.message, "error");
        } finally {
            setBarcodePrinting(false);
        }
    };

    const executeBarcodeStudioPdfExport = async () => {
        showToast("تصدير PDF غير متاح حالياً من هذه الشاشة", "info");
    };

    const openBarcodeStudio = useCallback(() => {
        if (!activeInvoice.cart.length) {
            showToast("السلة فارغة", "warning");
            return;
        }
        
        // Transform cart items to studio products format
        const studioProducts = activeInvoice.cart.filter(item => item.printBarcode !== false).map(item => ({
            id: item.variantId,
            name: item.productName,
            barcode: item.productBarcode || item.barcode,
            sku: item.sku,
            quantity: item.quantity,
            price: item.price,
            size: item.size,
            color: item.color
        }));
        
        setBarcodeStudioProducts(studioProducts);
        applyBarcodeSystemDefaults();
        setShowBarcodeStudio(true);
    }, [activeInvoice.cart, applyBarcodeSystemDefaults, showToast]);

    const openOrFocusInvoiceTab = useCallback((nextInvoice, matchExisting) => {
        if (!nextInvoice || typeof matchExisting !== "function") return;

        const existing = invoices.find(matchExisting);
        if (existing) {
            setActiveInvoiceId(existing.id);
            return;
        }

        setInvoices((prev) => [...prev, nextInvoice]);
        setActiveInvoiceId(nextInvoice.id);
    }, [invoices]);

    const buildSaleEditInvoice = useCallback((request) => {
        const transaction = request?.transaction || {};
        const sale = transaction?.details || request?.sale;
        if (!sale?.id) return null;

        const resolvedCustomer =
            request?.customer ||
            sale?.customer ||
            sale?.supplier ||
            customers.find((item) => String(item.id) === String(sale.customerId || sale.supplierId)) ||
            null;

        const saleItems = Array.isArray(sale.items) ? sale.items : [];
        const discount = toNumberSafe(sale.discount, 0);
        const invoiceTotal = Math.max(0, toNumberSafe(sale.total, 0));
        const remaining = Math.max(
            0,
            toNumberSafe(
                sale?.remainingAmount,
                toNumberSafe(
                    transaction?.remaining,
                    isCreditSaleType(sale.saleType) ? invoiceTotal : 0
                )
            )
        );
        const paidAmount = Math.max(0, invoiceTotal - remaining);
        const salePaymentMethodId = parseInt(sale?.paymentMethodId || sale?.paymentMethod?.id, 10);

        const cart = saleItems.map((item) => {
            const variantId = parseInt(item.variantId || item?.variant?.id, 10) || 0;
            const soldQty = Math.max(1, toNumberSafe(item.quantity, 1));
            const currentStock = variantQuantityById.get(variantId) || 0;
            const itemVariant = item?.variant || {};

            return {
                variantId,
                productId: itemVariant.productId || item.productId || 0,
                productName: itemVariant?.product?.name || item.productName || `منتج #${variantId}`,
                price: toNumberSafe(item.price, 0),
                costPrice: toNumberSafe(itemVariant.cost ?? item.costPrice, 0),
                quantity: soldQty,
                size: itemVariant.productSize || item.size || "-",
                color: itemVariant.color || item.color || "-",
                discount: toNumberSafe(item.discount, 0),
                maxQuantity: Math.max(soldQty, currentStock + soldQty),
            };
        });

        return createEmptyInvoice({
            id: `EDIT-SALE-${sale.id}-${Date.now()}`,
            invoiceDate: toInputDate(sale.invoiceDate || sale.createdAt),
            cart,
            customer: resolvedCustomer,
            discount,
            discountType: "value",
            paidAmount: paidAmount.toFixed(2),
            saleType: remaining > 0 ? "آجل" : "نقدي",
            paymentMethod: Number.isFinite(salePaymentMethodId) && salePaymentMethodId > 0
                ? String(salePaymentMethodId)
                : (remaining > 0 && paidAmount <= 0 ? "CREDIT" : "CASH"),
            notes: sale.notes || "",
            editorMode: "sale",
            isEditMode: true,
            sourceSaleId: sale.id,
            sourcePaymentId: null,
            paymentEdit: null,
            warehouseId: sale?.warehouseId || null,
        });
    }, [customers, variantQuantityById]);

    const buildPaymentEditInvoice = useCallback((request) => {
        const transaction = request?.transaction || {};
        const payment = transaction?.details || request?.payment;
        if (!payment?.id) return null;

        const resolvedCustomer =
            request?.customer ||
            payment?.customer ||
            customers.find((item) => String(item.id) === String(payment.customerId)) ||
            null;

        return createEmptyInvoice({
            id: `EDIT-PAYMENT-${payment.id}-${Date.now()}`,
            invoiceDate: toInputDate(payment.paymentDate || payment.createdAt),
            customer: resolvedCustomer,
            notes: payment.notes || "",
            editorMode: "payment",
            isEditMode: true,
            sourceSaleId: null,
            sourcePaymentId: payment.id,
            paymentEdit: {
                paymentId: payment.id,
                customerId: resolvedCustomer?.id || payment.customerId || null,
                amount: toNumberSafe(payment.amount, 0),
                paymentDate: toInputDate(payment.paymentDate || payment.createdAt),
                notes: payment.notes || "",
                paymentMethodId: parseInt(payment.paymentMethodId || payment?.paymentMethod?.id, 10) || getDefaultPaymentMethodId(),
            },
        });
    }, [customers, getDefaultPaymentMethodId]);

    const openIncomingEditorRequest = useCallback((request) => {
        if (!request?.type) return false;

        if (request.type === "sale" || request.type === "purchase") {
            const invoice = buildSaleEditInvoice(request);
            if (!invoice) return false;

            openOrFocusInvoiceTab(
                invoice,
                (inv) => inv.isEditMode && inv.editorMode === "sale" && inv.sourceSaleId === invoice.sourceSaleId
            );
            clearPosEditorRequest();
            showToast(`تم فتح الفاتورة #${invoice.sourceSaleId} للتعديل`, "info");
            return true;
        }

        if (request.type === "payment") {
            const invoice = buildPaymentEditInvoice(request);
            if (!invoice) return false;

            openOrFocusInvoiceTab(
                invoice,
                (inv) => inv.isEditMode && inv.editorMode === "payment" && inv.sourcePaymentId === invoice.sourcePaymentId
            );
            clearPosEditorRequest();
            showToast(`تم فتح الدفعة #${invoice.sourcePaymentId} للتعديل`, "info");
            return true;
        }

        return false;
    }, [buildPaymentEditInvoice, buildSaleEditInvoice, openOrFocusInvoiceTab, showToast]);

    const handleSavePaymentEdit = async (paymentFormData = null) => {
        const paymentEdit = {
            ...(activeInvoice?.paymentEdit || {}),
            ...(paymentFormData || {}),
        };
        const editingInvoiceId = activeInvoice?.id;
        if (!activeInvoice?.sourcePaymentId || !paymentEdit) {
            showToast("بيانات الدفعة غير مكتملة", "error");
            return { error: "بيانات الدفعة غير مكتملة" };
        }

        const amount = Math.max(0, toNumberSafe(paymentEdit.amount, 0));
        if (amount <= 0) {
            showToast("أدخل مبلغ صحيح للدفعة", "warning");
            return { error: "أدخل مبلغ صحيح للدفعة" };
        }

        try {
            setIsSaving(true);

            const result = await window.api.updateCustomerPayment(activeInvoice.sourcePaymentId, {
                customerId: paymentEdit.customerId || activeInvoice.customer?.id,
                paymentMethodId: parseInt(paymentEdit.paymentMethodId, 10) || getDefaultPaymentMethodId(),
                amount,
                paymentDate: (paymentEdit.paymentDate === getTodayDate())
                    ? getLocalDateString()
                    : (paymentEdit.paymentDate || getLocalDateString()),
                notes: paymentEdit.notes || "",
            });

            if (result?.error) {
                showToast(`خطأ: ${result.error}`, "error");
                return result;
            }

            await loadData(true);
            setShowPaymentEditModal(false);
            if (editingInvoiceId) {
                closeEditTabAndGoToFreshInvoice(editingInvoiceId);
            } else {
                resetInvoice();
            }
            showToast("✅ تم تعديل الدفعة بنجاح", "success");
            return result;
        } catch (error) {
            console.error(error);
            showToast("فشل تعديل الدفعة", "error");
            return { error: error?.message || "فشل تعديل الدفعة" };
        } finally {
            setIsSaving(false);
        }
    };

    useEffect(() => {
        const handleEditorRequest = (event) => {
            const request = event?.detail || readPosEditorRequest();
            if (!request) return;
            openIncomingEditorRequest(request);
        };

        window.addEventListener(POS_EDITOR_REQUEST_EVENT, handleEditorRequest);

        const pendingRequest = readPosEditorRequest();
        if (pendingRequest) {
            openIncomingEditorRequest(pendingRequest);
        }

        return () => {
            window.removeEventListener(POS_EDITOR_REQUEST_EVENT, handleEditorRequest);
        };
    }, [openIncomingEditorRequest]);

    useEffect(() => {
        if (activeInvoice?.editorMode === "payment" && activeInvoice?.paymentEdit) {
            setShowPaymentEditModal(true);
        } else {
            setShowPaymentEditModal(false);
        }
    }, [activeInvoiceId, activeInvoice?.editorMode, activeInvoice?.sourcePaymentId, activeInvoice?.paymentEdit]);

    /**
     * ========== عمليات الفاتورة ==========
     * التحديث، الحفظ، الحذف والإدارة
     */
    const updateInvoice = (updates) => {
        const finalUpdates = { ...updates };
        if (currentUser?.warehouseId) {
            finalUpdates.warehouseId = currentUser.warehouseId;
        }
        setInvoices((prev) =>
            prev.map((inv) =>
                inv.id === activeInvoiceId ? { ...inv, ...finalUpdates } : inv,
            ),
        );
    };

    const setInvoiceSaleType = (type) => {
        updateInvoice({
            saleType: type,
            paidAmount: type === "نقدي" ? calculations.total : 0,
        });
    };

    const addTab = () => {
        const newInvoice = createEmptyInvoice({
            paymentMethod: String(getDefaultPaymentMethodId()),
        });
        setInvoices((prev) => [...prev, newInvoice]);
        setActiveInvoiceId(newInvoice.id);
    };

    const closeTab = (invoiceId) => {
        if (invoices.length === 1) {
            showToast("لا يمكن إغلاق الفاتورة الوحيدة", "warning");
            return;
        }
        const newInvoices = invoices.filter((inv) => inv.id !== invoiceId);
        setInvoices(newInvoices);
        if (activeInvoiceId === invoiceId) {
            setActiveInvoiceId(newInvoices[newInvoices.length - 1].id);
        }
    };

    const closeEditTabAndGoToFreshInvoice = (invoiceId) => {
        const remainingTabs = invoices.filter((inv) => inv.id !== invoiceId);
        const preferredTab = remainingTabs.find(
            (inv) => !inv.isEditMode && inv.editorMode !== "payment"
        );

        if (preferredTab) {
            setInvoices(remainingTabs);
            setActiveInvoiceId(preferredTab.id);
            setCustomerSearchTerm("");
            return;
        }

        const freshInvoice = createEmptyInvoice({
            paymentMethod: String(getDefaultPaymentMethodId()),
        });
        setInvoices([...remainingTabs, freshInvoice]);
        setActiveInvoiceId(freshInvoice.id);
        setCustomerSearchTerm("");
    };

    const handleClosePaymentEditModal = () => {
        setShowPaymentEditModal(false);
    };

    const handleSaveProduct = async (productData) => {
        setIsSavingProduct(true);
        try {
            const res = await window.api.addProduct(productData);
            if (res?.error) throw new Error(res.error);

            const productId = res?.id;
            if (productId) {
                if (productData.hasVariants && Array.isArray(productData.variants)) {
                    for (const variant of productData.variants) {
                        const addVariantRes = await window.api.addVariant({
                            productId,
                            size: variant.size,
                            color: variant.color,
                            price: variant.price,
                            cost: variant.cost,
                            quantity: variant.quantity,
                            barcode: variant.barcode
                        });
                        if (addVariantRes?.error) throw new Error(addVariantRes.error);
                    }
                }
            }

            showToast("✅ تم إضافة المنتج بنجاح", "success");
            setShowProductModal(false);
            loadData(true);
        } catch (err) {
            showToast("خطأ: " + err.message, "error");
        } finally {
            setIsSavingProduct(false);
        }
    };

    const handleCancelPaymentEditTab = () => {
        setShowPaymentEditModal(false);
        if (activeInvoice?.editorMode === "payment" && activeInvoice?.id) {
            closeEditTabAndGoToFreshInvoice(activeInvoice.id);
        }
    };

    /**
     * ========== عمليات السلة ==========
     * إضافة، تحديث، حذف المنتجات من السلة
     */
    const addToCart = (variant) => {
        if (activeInvoice.editorMode === "payment") {
            showToast("تبويب الدفعة لا يدعم إضافة منتجات", "warning");
            return;
        }

        const requestedQuantity = Math.max(1, toNumberSafe(variant.quantitySelected, 1));
        const existingItem = activeInvoice.cart.find(
            (item) => item.variantId === variant.id,
        );
        let newCart;

        if (existingItem) {
            newCart = activeInvoice.cart.map((item) =>
                item.variantId === variant.id
                    ? { ...item, quantity: item.quantity + requestedQuantity }
                    : item,
            );
        } else {
            const defaultCost = toNumberSafe(variant.cost, toNumberSafe(variant.price, 0));
            newCart = [
                ...activeInvoice.cart,
                {
                    variantId: variant.id,
                    productId: variant.productId,
                    productName: variant.product?.name || variant.productName || "منتج",
                    price: defaultCost,
                    costPrice: defaultCost,
                    quantity: requestedQuantity,
                    size: sanitizeVariantLabel(variant.productSize || variant.size),
                    color: sanitizeVariantLabel(variant.color),
                    discount: 0,
                    maxQuantity: Number.MAX_SAFE_INTEGER,
                    printBarcode: true,
                },
            ];
        }

        updateInvoice({ cart: newCart });
        setSearchTerm("");
        if (searchInputRef.current) searchInputRef.current.focus();
    };

    const confirmSingleQuantitySelection = useCallback(() => {
        if (!singleQuantityModal.open || !singleQuantityModal.variant) return;

        const requestedQuantity = Math.max(
            1,
            Math.floor(toNumberSafe(singleQuantityModal.quantity, 1))
        );

        const variantPayload = {
            ...singleQuantityModal.variant,
            product:
                singleQuantityModal.variant.product ||
                { name: singleQuantityModal.product?.name || "منتج" },
            quantitySelected: requestedQuantity,
            productSize: sanitizeVariantLabel(singleQuantityModal.variant.productSize),
            color: sanitizeVariantLabel(singleQuantityModal.variant.color),
        };

        addToCart(variantPayload);
        closeSingleQuantityModal();
    }, [addToCart, closeSingleQuantityModal, singleQuantityModal]);

    useEffect(() => {
        if (!singleQuantityModal.open) return;

        const handleQuantityModalKeyDown = (e) => {
            if (!singleQuantityModal.open) return;

            if (e.key === "Escape") {
                e.preventDefault();
                closeSingleQuantityModal();
                return;
            }

            if (e.key === "Enter") {
                e.preventDefault();
                confirmSingleQuantitySelection();
                return;
            }

            if (e.key === "ArrowUp") {
                e.preventDefault();
                setSingleQuantityModal((prev) => ({
                    ...prev,
                    quantity: Math.max(1, toNumberSafe(prev.quantity, 1) + 1),
                }));
                return;
            }

            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSingleQuantityModal((prev) => ({
                    ...prev,
                    quantity: Math.max(1, toNumberSafe(prev.quantity, 1) - 1),
                }));
            }
        };

        window.addEventListener("keydown", handleQuantityModalKeyDown);
        return () => window.removeEventListener("keydown", handleQuantityModalKeyDown);
    }, [closeSingleQuantityModal, confirmSingleQuantitySelection, singleQuantityModal.open]);

    /**
     * تحديث سعر أو كمية المنتج في السلة
     */
    const updateCartItem = (variantId, updates) => {
        if (activeInvoice.editorMode === "payment") return;

        updateInvoice({
            cart: activeInvoice.cart.map((item) =>
                item.variantId === variantId ? { ...item, ...updates } : item,
            ),
        });
    };

    const removeFromCart = (variantId) => {
        if (activeInvoice.editorMode === "payment") return;
        updateInvoice({
            cart: activeInvoice.cart.filter((item) => item.variantId !== variantId),
        });
    };

    const printPurchaseFromData = useCallback(async (purchaseData, printMode = "silent") => {
        if (!purchaseData) throw new Error("لا توجد بيانات فاتورة للطباعة");

        const html = generatePurchaseInvoiceHTML(purchaseData);
        const result = await safePrint(html, {
            title: `فاتورة مشتريات رقم ${purchaseData.id || "-"}`,
            ...(printMode === "preview" ? { preview: true } : { silent: true }),
        });

        if (result?.error) {
            throw new Error(result.error);
        }
    }, []);

    const printPurchaseById = useCallback(async (purchaseId, fallbackPurchase = null, printMode = "silent") => {
        let purchaseForPrint = fallbackPurchase || null;

        if (purchaseId && typeof window?.api?.getPurchaseById === "function") {
            const fullPurchase = await window.api.getPurchaseById(purchaseId);
            if (!fullPurchase?.error && fullPurchase) {
                purchaseForPrint = fullPurchase;
            }
        }

        if (!purchaseForPrint) {
            throw new Error("تعذر تحميل بيانات فاتورة الشراء للطباعة");
        }

        await printPurchaseFromData(purchaseForPrint, printMode);
    }, [printPurchaseFromData]);

    const handlePrintBarcodes = useCallback(() => {
        openBarcodeStudio();
    }, [openBarcodeStudio]);

    const handleCheckout = async (shouldPrint = false, shouldPreview = false) => {
        if (isFirstOpenRef.current === "locked") return;
        isFirstOpenRef.current = "locked";

        setIsSaving(true);

        try {
            // احصل على أحدث حالة الفاتورة
            const currentInvoice =
                invoices.find((inv) => inv.id === activeInvoiceId) || invoices[0];

            if (currentInvoice?.editorMode === "payment") {
                if (!showPaymentEditModal) {
                    setShowPaymentEditModal(true);
                    return;
                }
                await handleSavePaymentEdit();
                return;
            }

            if (!currentInvoice || currentInvoice.cart.length === 0) return;
            const isEditingPurchase = Boolean(
                currentInvoice.isEditMode &&
                currentInvoice.editorMode === "sale" &&
                currentInvoice.sourceSaleId
            );

            // إجبار المستخدم على اختيار مخزن
            if (!currentInvoice.warehouseId) {
                showToast("⚠️ يرجى اختيار مخزن لإضافة المشتريات إليه.", "warning");
                return;
            }

            playSound("save");

            // أعد حساب على أساس الفاتورة الحالية
            const subTotal = currentInvoice.cart.reduce(
                (sum, item) => sum + item.price * item.quantity,
                0,
            );
            const totalDiscount = currentInvoice.cart.reduce(
                (sum, item) => sum + item.discount * item.quantity,
                0,
            );
            const total = Math.max(
                0,
                subTotal - totalDiscount - (parseFloat(currentInvoice.discount) || 0),
            );
            const rawPaid = parseFloat(currentInvoice.paidAmount);
            const paid = Math.max(0, Math.min(Number.isFinite(rawPaid) ? rawPaid : 0, total));
            const remaining = total - paid;

            let finalSaleType = currentInvoice.saleType;
            if (remaining > 0.01) {
                finalSaleType = "آجل";
            }

            // لا يمكن حفظ فاتورة آجل بدون تحديد مورد
            if (
                finalSaleType === "آجل"
                && (!currentInvoice.customer || !currentInvoice.customer.id)
            ) {
                showToast(
                    "⚠️ يوجد متبقي في الفاتورة، يرجى اختيار مورد لتسجيل الدين.",
                    "warning",
                );
                return;
            }

            const resolvedPaymentMethodId = resolveInvoicePaymentMethodId(currentInvoice.paymentMethod);
            const selectedPaymentMethod = paymentMethods.find(
                (method) => parseInt(method?.id, 10) === resolvedPaymentMethodId
            );
            let paymentLabel = selectedPaymentMethod?.name || String(currentInvoice.paymentMethod || "");
            let paymentCode = String(selectedPaymentMethod?.code || currentInvoice.paymentMethod || "")
                .trim()
                .toUpperCase()
                .replace(/[\s-]+/g, "_");
            if (paid === 0 && finalSaleType === "آجل") {
                paymentLabel = "Credit";
                paymentCode = "CREDIT";
            }

            const saleData = {
                items: currentInvoice.cart.map((item) => ({
                    variantId: item.variantId,
                    quantity: item.quantity,
                    cost: item.price,
                })),
                supplierId: currentInvoice.customer?.id,
                total: total,
                paid: paid,
                paymentMethodId: resolvedPaymentMethodId,
                paymentMethod: paymentCode,
                payment: paymentLabel,
                purchaseType: finalSaleType,
                discount: parseFloat(currentInvoice.discount || 0),
                notes: currentInvoice.notes || "",
                warehouseId: currentInvoice.warehouseId || null,
                invoiceDate: (currentInvoice.invoiceDate === getTodayDate())
                    ? new Date().toISOString()
                    : (currentInvoice.invoiceDate || new Date().toISOString()),
                splitPayments: paid > 0
                    ? [{ paymentMethodId: resolvedPaymentMethodId, amount: paid }]
                    : [],
            };

            if (shouldPreview && isEditingPurchase) {
                showToast("معاينة الطباعة متاحة عند إنشاء فاتورة جديدة فقط", "warning");
            }

            if (shouldPreview && !isEditingPurchase) {
                const result = await window.api.createPurchase(saleData);
                if (result.error) {
                    showToast("خطأ: " + result.error, "error");
                    return;
                }

                const savedPurchaseId = result.id || result.saleId || result?.data?.id || null;
                const previewPurchase = {
                    id: savedPurchaseId || "-",
                    createdAt: new Date().toISOString(),
                    invoiceDate:
                        currentInvoice.invoiceDate || getLocalDateString(),
                    customer: currentInvoice.customer,
                    supplier: currentInvoice.customer,
                    items: currentInvoice.cart.map((item) => ({
                        variant: {
                            product: { name: item.productName },
                            productSize: item.size,
                            color: item.color,
                        },
                        quantity: item.quantity,
                        price: item.price,
                        discount: item.discount || 0,
                    })),
                    total: total,
                    paid: paid,
                    payment: paymentLabel,
                    discount: parseFloat(currentInvoice.discount || 0),
                };

                try {
                    await printPurchaseById(savedPurchaseId, previewPurchase, "preview");
                } catch (printError) {
                    console.error(printError);
                    showToast(`تم الحفظ ولكن تعذر فتح المعاينة: ${printError.message}`, "warning");
                }

                loadData(true);
                resetInvoice();
                return;
            }

            const result = isEditingPurchase
                ? await window.api.updatePurchase(currentInvoice.sourceSaleId, saleData)
                : await window.api.createPurchase(saleData);
            const persistedPurchaseId = isEditingPurchase
                ? currentInvoice.sourceSaleId
                : (result.id || result.saleId || result?.data?.id);
            if (result.error) {
                showToast("خطأ: " + result.error, "error");
                return;
            }

            if (shouldPrint) {
                const previewPurchase = {
                    id: persistedPurchaseId,
                    createdAt: new Date().toISOString(),
                    invoiceDate:
                        currentInvoice.invoiceDate || new Date().toISOString().split("T")[0],
                    customer: currentInvoice.customer,
                    supplier: currentInvoice.customer,
                    items: currentInvoice.cart.map((item) => ({
                        variant: {
                            product: { name: item.productName },
                            productSize: item.size,
                            color: item.color,
                        },
                        quantity: item.quantity,
                        price: item.price,
                        discount: item.discount || 0,
                    })),
                    total: total,
                    paid: paid,
                    payment: paymentLabel,
                    discount: parseFloat(currentInvoice.discount || 0),
                };
                try {
                    await printPurchaseById(persistedPurchaseId, previewPurchase, "silent");
                } catch (printError) {
                    console.error(printError);
                    showToast(`تم الحفظ ولكن تعذر الطباعة: ${printError.message}`, "warning");
                }
            }

            loadData(true);
            if (isEditingPurchase) {
                closeEditTabAndGoToFreshInvoice(currentInvoice.id);
            } else {
                resetInvoice();
            }

            setTimeout(() => {
                if (searchInputRef.current) searchInputRef.current.focus();
            }, 100);

            showToast(
                isEditingPurchase
                    ? "✅ تم تعديل فاتورة المشتريات بنجاح"
                    : "✅ تم حفظ فاتورة المشتريات بنجاح",
                "success"
            );
        } catch (err) {
            console.error(err);
            const errMessage = String(err?.message || "");
            if (errMessage.includes("No handler registered for 'db:updatePurchase'")) {
                showToast("لازم تقفل التطبيق وتفتحه تاني بعد التحديث عشان التعديل يشتغل", "error");
            } else {
                showToast("خطأ في الاتصال بالقاعدة", "error");
            }
        } finally {
            isFirstOpenRef.current = false;
            setIsSaving(false);
        }
    };

    // Update the ref with the latest handleCheckout function
    useEffect(() => {
        handleCheckoutRef.current = handleCheckout;
    }, [handleCheckout]);

    /**
     * إعادة تعيين الفاتورة لبدء فاتورة جديدة
     */
    const resetInvoice = () => {
        const normalized = createEmptyInvoice({
            id: activeInvoiceId,
            paymentMethod: String(getDefaultPaymentMethodId()),
        });
        setInvoices((prev) =>
            prev.map((inv) => (inv.id === activeInvoiceId ? normalized : inv))
        );
        setCustomerSearchTerm("");
    };

    /**
     * تمييز النصوص المطابقة في البحث بلون أصفر
     */
    const highlightMatch = (text, searchTerm) => {
        if (!searchTerm) return text;

        const parts = [];
        const regex = new RegExp(
            `(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
            "gi",
        );
        const split = text.split(regex);

        split.forEach((part, index) => {
            if (part.toLowerCase() === searchTerm.toLowerCase()) {
                parts.push(
                    <span
                        key={index}
                        style={{ backgroundColor: "#fbbf24", fontWeight: "bold" }}
                    >
                        {part}
                    </span>,
                );
            } else {
                parts.push(part);
            }
        });

        return parts;
    };

    /**
     * ========== عمليات العملاء ==========
     * إضافة عميل جديد والتعامل مع بيانات العملاء
     */
    const handleAddSupplier = async () => {
        try {
            const res = await window.api.addSupplier({
                name: newCustomer.name,
                phone: newCustomer.phone,
                address: newCustomer.address,
            });
            if (!res.error) {
                showToast("تم إضافة المورد بنجاح", "success");
                setShowNewCustomerModal(false);
                setNewCustomer({
                    name: "",
                    phone: "",
                    phone2: "",
                    address: "",
                    city: "",
                    district: "",
                    notes: "",
                    creditLimit: 0,
                    customerType: "عادي",
                });
                loadData(true);

                if (res && res.id) {
                    updateInvoice({ customer: res });
                    setCustomerSearchTerm(res.name);
                }
            } else {
                showToast("خطأ: " + res.error, "error");
            }
        } catch (err) {
            showToast("خطأ في النظام", "error");
        }
    };



    /**
     * ========== الواجهة الرئيسية (Main UI) ==========
     * تخطيط ثنائي الأعمدة: منتجات على اليسار، الفاتورة على اليمين
     */
    return (
        <div
            className="purchase-page"
            style={{
                padding: "5px",
                height: "100%",
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                backgroundColor: "#f3f4f6",
                overflow: "hidden",
                boxSizing: "border-box",
            }}
        >
            {/* Global Styles */}
            <style>{`
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                @keyframes slideIn {
                    from { transform: translateX(400px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}</style>

            {/* Toast Notification */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}

            {/* ========== Header & Tabs ========== */}
            <div
                className="purchase-header"
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "15px",
                    gap: "12px",
                }}
            >
                {/* Invoice Tabs */}
                <div
                    className="hide-scrollbar"
                    style={{
                        display: "flex",
                        gap: "5px",
                        overflowX: "auto",
                        flex: 1,
                        paddingBottom: "5px",
                    }}
                >
                    {invoices.map((inv) => (
                        <InvoiceTab
                            key={inv.id}
                            invoice={inv}
                            isActive={activeInvoiceId === inv.id}
                            onSelect={() => setActiveInvoiceId(inv.id)}
                            onClose={() => closeTab(inv.id)}
                            canClose={invoices.length > 1}
                        />
                    ))}
                    <button
                        onClick={addTab}
                        style={{
                            padding: "8px 12px",
                            backgroundColor: "#10b981",
                            color: "white",
                            border: "none",
                            borderRadius: "8px",
                            cursor: "pointer",
                            fontSize: "18px",
                            fontWeight: "bold",
                        }}
                    >
                        +
                    </button>
                </div>
                <button
                    type="button"
                    onClick={() => setShowShortcutsModal(true)}
                    style={{
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "10px 16px",
                        backgroundColor: "white",
                        color: "#c2410c",
                        border: "1px solid #fed7aa",
                        borderRadius: "12px",
                        cursor: "pointer",
                        fontWeight: "bold",
                        boxShadow: "0 6px 16px rgba(249, 115, 22, 0.08)",
                    }}
                    title="عرض كل الاختصارات"
                >
                    <i className="fas fa-keyboard" aria-hidden="true"></i>
                </button>
            </div>

            {/* ========== Main Content ========== */}
            <div
                className="purchase-main"
                style={{ display: "flex", gap: "20px", flex: 1, overflow: "hidden" }}
            >
                {/* ========== Left Side: Products Grid/List ========== */}
                <div
                    className="purchase-products-panel"
                    style={{
                        flex: 2,
                        display: "flex",
                        flexDirection: "column",
                        backgroundColor: "white",
                        padding: "15px",
                        borderRadius: "12px",
                        boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
                    }}
                >
                    {/* Search & Display Mode Toggle */}
                    <div
                        className="purchase-product-controls"
                        style={{
                            display: "flex",
                            gap: "10px",
                            marginBottom: "15px",
                            alignItems: "center",
                            flexWrap: "wrap",
                        }}
                    >
                        {/* Product Search Input */}
                        <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder="ابدأ البحث لإظهار المنتجات..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={handleProductKeyDown}
                                autoFocus
                                style={{
                                    padding: "12px",
                                    paddingLeft: "45px", // Space for the + button
                                    borderRadius: "8px",
                                    border: "1px solid #d1d5db",
                                    fontSize: "16px",
                                    width: "100%",
                                    boxSizing: "border-box",
                                }}
                            />
                            <button
                                onClick={() => setShowProductModal(true)}
                                style={{
                                    position: "absolute",
                                    left: "6px",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    width: "32px",
                                    height: "32px",
                                    backgroundColor: "#ffedd5",
                                    color: "#9a3412",
                                    border: "none",
                                    borderRadius: "6px",
                                    fontWeight: "bold",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "18px",
                                    transition: "all 0.2s",
                                    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                                }}
                                title="إضافة صنف جديد"
                            >
                                +
                            </button>
                        </div>

                        {/* Search Mode Selector */}
                        <div style={{ display: "flex", gap: "4px", backgroundColor: "#f3f4f6", borderRadius: "8px", padding: "4px" }}>
                            <button
                                onClick={() => setSearchMode("name")}
                                style={{
                                    padding: "8px 12px",
                                    borderRadius: "6px",
                                    border: "none",
                                    backgroundColor: searchMode === "name" ? "white" : "transparent",
                                    color: searchMode === "name" ? "#3b82f6" : "#6b7280",
                                    cursor: "pointer",
                                    fontWeight: "bold",
                                    boxShadow: searchMode === "name" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
                                    transition: "all 0.2s",
                                    fontSize: "13px",
                                }}
                                title="بحث بالاسم"
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Type size={16} /> اسم</span>
                            </button>
                            <button
                                onClick={() => setSearchMode("barcode")}
                                style={{
                                    padding: "8px 12px",
                                    borderRadius: "6px",
                                    border: "none",
                                    backgroundColor: searchMode === "barcode" ? "white" : "transparent",
                                    color: searchMode === "barcode" ? "#dc2626" : "#6b7280",
                                    cursor: "pointer",
                                    fontWeight: "bold",
                                    boxShadow: searchMode === "barcode" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
                                    transition: "all 0.2s",
                                    fontSize: "13px",
                                }}
                                title="بحث بالباركود"
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Barcode size={16} /> باركود</span>
                            </button>
                        </div>

                    </div>

                    {/* Products Display */}
                    {!searchTerm.trim() ? (
                        // رسالة عدم وجود بحث
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                height: "100%",
                                color: "#9ca3af",
                                fontSize: "18px",
                                fontWeight: "bold",
                                textAlign: "center",
                                padding: "40px",
                            }}
                        >
                            <div>
                                <Search size={48} color="#9ca3af" style={{ marginBottom: "10px" }} />
                                <div>ابدأ البحث عن منتج لإظهار النتائج</div>
                                <div style={{ fontSize: "12px", marginTop: "10px", color: "#d1d5db" }}>
                                    ابحث بـ {searchMode === "name" ? "اسم المنتج" : "رقم الباركود"}
                                </div>
                            </div>
                        </div>
                    ) : groupedProducts.length === 0 ? (
                        // رسالة عدم وجود نتائج
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                height: "100%",
                                color: "#9ca3af",
                                fontSize: "16px",
                                fontWeight: "bold",
                                textAlign: "center",
                                padding: "40px",
                            }}
                        >
                            <div>
                                <XCircle size={40} color="#f87171" style={{ marginBottom: "10px" }} />
                                <div>لم يتم العثور على منتجات</div>
                                <div style={{ fontSize: "12px", marginTop: "10px", color: "#d1d5db" }}>
                                    جرب البحث بـ {searchMode === "name" ? "اسم مختلف" : "رقم باركود مختلف"}
                                </div>
                            </div>
                        </div>
                    ) : productDisplayMode === "grid" ? (
                        <div
                            ref={productGridRef}
                            className="purchase-product-grid"
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                                gap: "15px",
                                overflowY: "auto",
                                paddingRight: "5px",
                            }}
                        >
                            {groupedProducts.map((product, index) => (
                                <div
                                    key={product.id}
                                    data-product-index={index}
                                    onClick={() => {
                                        handleProductSelection(product, index);
                                    }}
                                    onMouseEnter={() => setSelectedProductIndex(index)}
                                    style={{
                                        cursor: "pointer",
                                        position: "relative",
                                        transition: "transform 0.2s",
                                    }}
                                >
                                    <ProductCard
                                        product={product}
                                        onClick={() => handleProductSelection(product, index)}
                                    />
                                    {selectedProductIndex === index && (
                                        <div
                                            style={{
                                                position: "absolute",
                                                top: 0,
                                                left: 0,
                                                right: 0,
                                                bottom: 0,
                                                border: "3px solid #3b82f6",
                                                borderRadius: "10px",
                                                pointerEvents: "none",
                                            }}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div ref={productGridRef} style={{ overflowY: "auto", flex: 1 }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead
                                    style={{
                                        backgroundColor: "#f9fafb",
                                        position: "sticky",
                                        top: 0,
                                    }}
                                >
                                    <tr>
                                        <th
                                            style={{
                                                padding: "12px",
                                                textAlign: "right",
                                                fontSize: "13px",
                                                color: "#4b5563",
                                            }}
                                        >
                                            المنتج
                                        </th>
                                        <th
                                            style={{
                                                padding: "12px",
                                                textAlign: "center",
                                                fontSize: "13px",
                                                color: "#4b5563",
                                            }}
                                        >
                                            سعر التكلفة
                                        </th>
                                        <th
                                            style={{
                                                padding: "12px",
                                                textAlign: "center",
                                                fontSize: "13px",
                                                color: "#4b5563",
                                            }}
                                        >
                                            المخزون
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {groupedProducts.map((product, index) => (
                                        <tr
                                            key={product.id}
                                            data-product-index={index}
                                            onClick={() => {
                                                handleProductSelection(product, index);
                                            }}
                                            onMouseEnter={() => setSelectedProductIndex(index)}
                                            style={{
                                                backgroundColor:
                                                    selectedProductIndex === index ? "#eff6ff" : "white",
                                                cursor: "pointer",
                                                borderBottom: "1px solid #e5e7eb",
                                                transition: "background-color 0.2s",
                                                borderLeft:
                                                    selectedProductIndex === index
                                                        ? "4px solid #3b82f6"
                                                        : "none",
                                            }}
                                        >
                                            <td style={{ padding: "12px", textAlign: "right" }}>
                                                <div style={{ fontWeight: "bold", fontSize: "14px" }}>
                                                    {product.name}
                                                </div>
                                            </td>
                                            <td style={{ padding: "12px", textAlign: "center" }}>
                                                <span style={{ color: "#059669", fontWeight: "bold" }}>
                                                    {product.basePrice.toFixed(2)}
                                                </span>
                                            </td>
                                            <td style={{ padding: "12px", textAlign: "center" }}>
                                                <span
                                                    style={{
                                                        fontSize: "11px",
                                                        color:
                                                            product.totalQuantity > 0 ? "#6b7280" : "#ef4444",
                                                        backgroundColor:
                                                            product.totalQuantity > 0 ? "#f3f4f6" : "#fee2e2",
                                                        padding: "2px 6px",
                                                        borderRadius: "4px",
                                                        display: "inline-block",
                                                    }}
                                                >
                                                    {product.totalQuantity}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* ========== Right Side: Invoice, Customer & Payment ========== */}
                <div
                    className="purchase-invoice-panel"
                    style={{
                        flex: 3,
                        display: "flex",
                        flexDirection: "column",
                        gap: "15px",
                        overflow: "hidden",
                    }}
                >
                    {activeInvoice.editorMode === "payment" && (
                        <div
                            style={{
                                backgroundColor: "#eef2ff",
                                border: "1px solid #c7d2fe",
                                borderRadius: "12px",
                                padding: "14px",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "12px",
                                flexWrap: "wrap",
                            }}
                        >
                            <div>
                                <div style={{ fontWeight: "bold", color: "#3730a3" }}>
                                    تعديل دفعة رقم #{activeInvoice.sourcePaymentId}
                                </div>
                                <div style={{ fontSize: "12px", color: "#4338ca" }}>
                                    {activeInvoice.customer?.name || "مورد غير محدد"}
                                </div>
                            </div>

                            <div style={{ display: "flex", gap: "8px" }}>
                                <button
                                    onClick={() => setShowPaymentEditModal(true)}
                                    style={{
                                        padding: "11px",
                                        borderRadius: "8px",
                                        border: "none",
                                        backgroundColor: "#4f46e5",
                                        color: "white",
                                        fontWeight: "bold",
                                        cursor: "pointer",
                                    }}
                                >
                                    فتح موديل الدفعة
                                </button>
                                <button
                                    onClick={handleCancelPaymentEditTab}
                                    style={{
                                        padding: "11px 14px",
                                        borderRadius: "8px",
                                        border: "1px solid #cbd5e1",
                                        backgroundColor: "white",
                                        color: "#334155",
                                        fontWeight: "bold",
                                        cursor: "pointer",
                                    }}
                                >
                                    إلغاء
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Section 1: Sale Type & Customer Selection */}
                    <div
                        className="purchase-supplier-panel"
                        style={{
                            backgroundColor: "white",
                            borderRadius: "12px",
                            padding: "15px",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                        }}
                    >
                        {/* Sale Type Toggle with Date */}
                        <div
                            className="purchase-sale-tools"
                            style={{
                                display: "flex",
                                backgroundColor: "#f3f4f6",
                                borderRadius: "8px",
                                padding: "4px",
                                gap: "10px",
                                alignItems: "center",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    flex: 1,
                                    backgroundColor: "#e5e7eb",
                                    borderRadius: "6px",
                                    padding: "2px",
                                }}
                            >
                                <button
                                    onClick={() => setInvoiceSaleType("نقدي")}
                                    style={{
                                        flex: 1,
                                        padding: "8px",
                                        borderRadius: "4px",
                                        border: "none",
                                        backgroundColor:
                                            activeInvoice.saleType === "نقدي" ? "white" : "transparent",
                                        color:
                                            activeInvoice.saleType === "نقدي" ? "#10b981" : "#6b7280",
                                        fontWeight: "bold",
                                        cursor: "pointer",
                                        boxShadow:
                                            activeInvoice.saleType === "نقدي"
                                                ? "0 1px 2px rgba(0,0,0,0.1)"
                                                : "none",
                                        transition: "all 0.2s",
                                    }}
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}><Banknote size={16} /> نقدي</span>
                                </button>
                                <button
                                    onClick={() => setInvoiceSaleType("آجل")}
                                    style={{
                                        flex: 1,
                                        padding: "8px",
                                        borderRadius: "4px",
                                        border: "none",
                                        backgroundColor:
                                            activeInvoice.saleType === "آجل" ? "white" : "transparent",
                                        color:
                                            activeInvoice.saleType === "آجل" ? "#f59e0b" : "#6b7280",
                                        fontWeight: "bold",
                                        cursor: "pointer",
                                        boxShadow:
                                            activeInvoice.saleType === "آجل"
                                                ? "0 1px 2px rgba(0,0,0,0.1)"
                                                : "none",
                                        transition: "all 0.2s",
                                    }}
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}><CalendarClock size={16} /> آجل</span>
                                </button>
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "5px",
                                    backgroundColor: "white",
                                    padding: "5px 10px",
                                    borderRadius: "6px",
                                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                                }}
                            >
                                <span style={{ fontSize: "14px", color: "#6b7280", fontWeight: "500" }}></span>
                                <input
                                    type="date"
                                    value={activeInvoice.invoiceDate || getLocalDateString()}
                                    onChange={(e) => updateInvoice({ invoiceDate: e.target.value })}
                                    style={{
                                        border: "none",
                                        outline: "none",
                                        fontSize: "14px",
                                        color: "#374151",
                                        fontWeight: "500",
                                        cursor: "pointer",
                                        backgroundColor: "transparent",
                                    }}
                                />
                            </div>

                            {/* Warehouse Selection */}
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "5px",
                                    backgroundColor: "white",
                                    padding: "5px 10px",
                                    borderRadius: "6px",
                                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                                    flex: 1,
                                }}
                            >
                                <span style={{ fontSize: "14px", color: "#6b7280", fontWeight: "500" }}><Store size={18} /></span>
                                <select
                                    value={activeInvoice.warehouseId || ""}
                                    onChange={(e) => updateInvoice({ warehouseId: e.target.value })}
                                    disabled={!!currentUser?.warehouseId}
                                    style={{
                                        border: "none",
                                        outline: "none",
                                        fontSize: "14px",
                                        color: "#374151",
                                        fontWeight: "high",
                                        cursor: currentUser?.warehouseId ? "not-allowed" : "pointer",
                                        backgroundColor: "transparent",
                                        width: "100%",
                                        opacity: currentUser?.warehouseId ? 0.7 : 1
                                    }}
                                >
                                    <option value="">المخزن (اختياري)</option>
                                    {warehouses.filter(wh => wh.isActive !== false).map(wh => (
                                        <option key={wh.id} value={wh.id}>{wh.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        {!activeInvoice.customer ? (
                            <div
                                ref={customerDropdownRef}
                                style={{ display: "flex", gap: "10px", position: "relative" }}
                            >
                                <div style={{ flex: 1, position: "relative" }}>
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            position: "relative",
                                        }}
                                    >
                                        <input
                                            type="text"
                                            placeholder="ابحث عن مورد (الاسم أو الهاتف)..."
                                            value={customerSearchTerm}
                                            onChange={(e) => {
                                                setCustomerSearchTerm(e.target.value);
                                                setShowCustomerList(true);
                                                setSelectedCustomerIndex(-1);
                                            }}
                                            onFocus={() => setShowCustomerList(true)}
                                            onKeyDown={handleCustomerKeyDown}
                                            style={{
                                                flex: 1,
                                                padding: "10px",
                                                borderRadius: "8px",
                                                border: "1px solid #d1d5db",
                                                paddingLeft: "30px",
                                            }}
                                        />
                                        <button
                                            onClick={() => {
                                                if (showCustomerList) {
                                                    setShowCustomerList(false);
                                                    setCustomerSearchTerm("");
                                                } else {
                                                    setShowCustomerList(true);
                                                }
                                            }}
                                            style={{
                                                position: "absolute",
                                                left: "10px",
                                                background: "none",
                                                border: "none",
                                                color: "#6b7280",
                                                cursor: "pointer",
                                            }}
                                        >
                                            ▼
                                        </button>
                                    </div>

                                    {showCustomerList && filteredCustomers.length > 0 && (
                                        <div
                                            ref={customerListRef}
                                            style={{
                                                position: "absolute",
                                                top: "100%",
                                                left: 0,
                                                right: 0,
                                                backgroundColor: "white",
                                                border: "1px solid #e5e7eb",
                                                borderRadius: "8px",
                                                marginTop: "5px",
                                                maxHeight: "200px",
                                                overflowY: "auto",
                                                zIndex: 100,
                                                boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                                            }}
                                        >
                                            {filteredCustomers.map((customer, index) => (
                                                <div
                                                    key={customer.id}
                                                    data-customer-index={index}
                                                    onClick={() => {
                                                        updateInvoice({ customer });
                                                        setCustomerSearchTerm("");
                                                        setShowCustomerList(false);
                                                        setSelectedCustomerIndex(-1);
                                                    }}
                                                    style={{
                                                        padding: "10px",
                                                        borderBottom: "1px solid #f3f4f6",
                                                        cursor: "pointer",
                                                        display: "flex",
                                                        justifyContent: "space-between",
                                                        backgroundColor:
                                                            selectedCustomerIndex === index
                                                                ? "#fef08a"
                                                                : "white",
                                                        transition: "background-color 0.2s",
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        setSelectedCustomerIndex(index);
                                                        e.currentTarget.style.backgroundColor = "#fef08a";
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        setSelectedCustomerIndex(-1);
                                                        e.currentTarget.style.backgroundColor = "white";
                                                    }}
                                                >
                                                    <span style={{ fontWeight: "bold" }}>
                                                        {highlightMatch(customer.name, customerSearchTerm)}
                                                    </span>
                                                    <span style={{ color: "#6b7280", fontSize: "12px" }}>
                                                        {highlightMatch(
                                                            customer.phone || "",
                                                            customerSearchTerm,
                                                        )}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => {
                                        setNewCustomer({
                                            name: "",
                                            phone: "",
                                            phone2: "",
                                            address: "",
                                            city: "",
                                            district: "",
                                            notes: "",
                                            creditLimit: 0,
                                            customerType: "عادي",
                                        });
                                        setShowNewCustomerModal(true);
                                    }}
                                    style={{
                                        padding: "10px 15px",
                                        backgroundColor: "#e0e7ff",
                                        color: "#4338ca",
                                        border: "none",
                                        borderRadius: "8px",
                                        fontWeight: "bold",
                                        cursor: "pointer",
                                    }}
                                >
                                    جديد +
                                </button>
                            </div>
                        ) : (
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    backgroundColor: "#eff6ff",
                                    padding: "10px",
                                    borderRadius: "8px",
                                    border: "1px solid #bfdbfe",
                                }}
                            >
                                <div>
                                    <span style={{ fontWeight: "bold", color: "#1e40af" }}>
                                        {activeInvoice.customer.name}
                                    </span>
                                    <span
                                        style={{
                                            fontSize: "12px",
                                            color: "#6b7280",
                                            marginRight: "10px",
                                        }}
                                    >
                                        {activeInvoice.customer.phone}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ fontSize: "13px", color: "#6b7280" }}>
                                        الرصيد السابق:{" "}
                                    </span>
                                    <span
                                        style={{
                                            fontWeight: "bold",
                                            color:
                                                (activeInvoice.customer.balance || 0) < 0
                                                    ? "#dc2626"
                                                    : "#059669",
                                            direction: "ltr",
                                            display: "inline-block",
                                        }}
                                    >
                                        {(activeInvoice.customer.balance || 0).toFixed(2)}
                                    </span>
                                </div>
                                <div style={{ display: "flex", gap: "5px" }}>
                                    <button
                                        onClick={() =>
                                            setShowSupplierLedger(activeInvoice.customer.id)
                                        }
                                        style={{
                                            background: "none",
                                            border: "none",
                                            color: "#3b82f6",
                                            cursor: "pointer",
                                            fontSize: "16px",
                                            padding: "2px 6px",
                                            borderRadius: "4px",
                                            backgroundColor: "#e0f2fe",
                                        }}
                                        title="عرض كشف حساب المورد"
                                    >
                                        <i className="fas fa-info-circle" style={{ color: "#3b82f6", fontSize: "20px" }}></i>
                                    </button>
                                    <button
                                        onClick={() => {
                                            updateInvoice({ customer: null });
                                            setCustomerSearchTerm("");
                                        }}
                                        style={{
                                            background: "none",
                                            border: "none",
                                            color: "#ef4444",
                                            cursor: "pointer",
                                            fontSize: "20px",
                                        }}
                                    >
                                        ×
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Section 2: Shopping Cart */}
                    <div
                        className="purchase-cart-panel"
                        style={{
                            flex: 1,
                            backgroundColor: "white",
                            borderRadius: "12px",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                            overflow: "hidden",
                            display: "flex",
                            flexDirection: "column",
                        }}
                    >
                        <div className="purchase-cart-scroll" style={{ overflowY: "auto", flex: 1 }}>
                            <table
                                style={{
                                    width: "100%",
                                    borderCollapse: "collapse",
                                    minWidth: "500px",
                                }}
                            >
                                <thead
                                    style={{
                                        backgroundColor: "#f9fafb",
                                        position: "sticky",
                                        top: 0,
                                        zIndex: 10,
                                    }}
                                >
                                    <tr>
                                        <th
                                            style={{
                                                padding: "12px",
                                                textAlign: "center",
                                                width: "40px"
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={activeInvoice.cart.length > 0 && activeInvoice.cart.every(item => item.printBarcode !== false)}
                                                onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    updateInvoice({
                                                        cart: activeInvoice.cart.map(item => ({ ...item, printBarcode: checked }))
                                                    });
                                                }}
                                                title="تحديد الكل للطباعة"
                                            />
                                        </th>
                                        <th
                                            style={{
                                                padding: "12px",
                                                textAlign: "right",
                                                fontSize: "13px",
                                                color: "#4b5563",
                                            }}
                                        >
                                            المنتج
                                        </th>
                                        <th
                                            style={{
                                                padding: "12px",
                                                textAlign: "center",
                                                fontSize: "13px",
                                                color: "#4b5563",
                                            }}
                                        >
                                            السعر
                                        </th>
                                        <th
                                            style={{
                                                padding: "12px",
                                                textAlign: "center",
                                                fontSize: "13px",
                                                color: "#4b5563",
                                            }}
                                        >
                                            الكمية
                                        </th>
                                        <th
                                            style={{
                                                padding: "12px",
                                                textAlign: "center",
                                                fontSize: "13px",
                                                color: "#4b5563",
                                            }}
                                        >
                                            الإجمالي
                                        </th>
                                        <th
                                            style={{
                                                padding: "4px 8px",
                                                textAlign: "center",
                                                fontSize: "13px",
                                                color: "#4b5563",
                                            }}
                                        >
                                            <button
                                                onClick={handlePrintBarcodes}
                                                disabled={activeInvoice.cart.length === 0}
                                                style={{
                                                    backgroundColor: activeInvoice.cart.length === 0 ? "#9ca3af" : "#6366f1",
                                                    color: "white",
                                                    border: "none",
                                                    borderRadius: "4px",
                                                    padding: "4px 8px",
                                                    fontSize: "12px",
                                                    fontWeight: "bold",
                                                    cursor: activeInvoice.cart.length === 0 ? "not-allowed" : "pointer",
                                                    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "4px",
                                                    margin: "0 auto"
                                                }}
                                                title="طباعة ملصقات الباركود لكل الأصناف في السلة"
                                            >
                                                <i className="fas fa-barcode"></i>
                                                <span>باركود</span>
                                            </button>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeInvoice.cart.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan="5"
                                                style={{
                                                    textAlign: "center",
                                                    padding: "30px",
                                                    color: "#9ca3af",
                                                }}
                                            >
                                                لا توجد منتجات في السلة
                                            </td>
                                        </tr>
                                    ) : (
                                        activeInvoice.cart.map((item) => (
                                            <CartItemRow
                                                key={item.variantId}
                                                item={item}
                                                onUpdate={(updates) =>
                                                    updateCartItem(item.variantId, updates)
                                                }
                                                onRemove={() => removeFromCart(item.variantId)}
                                                onShowDetails={async () => {
                                                    try {
                                                        const history = await window.api.getProductHistory(item.variantId);
                                                        setProductDetailsModal({ open: true, item: { ...item, history } });
                                                    } catch (err) {
                                                        setProductDetailsModal({ open: true, item: { ...item, history: null } });
                                                        console.error("Failed to load product history", err);
                                                    }
                                                }}
                                            />
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* ========== Payment Section (Redesigned) ========== */}
            <div
                className="purchase-payment-section"
                style={{
                    display: "flex",
                    gap: "15px",
                    marginTop: "15px",
                    alignItems: "stretch",
                    marginLeft: "15px",
                }}
            >



                {/* Container for Middle & Right Sections - 80% */}
                <div className="purchase-payment-main" style={{ flex: "0 0 80%", display: "flex", flexDirection: "column", gap: "10px" }}>

                    {/* Upper Row: Middle & Right */}
                    <div className="purchase-payment-main-row" style={{ display: "flex", gap: "15px", flex: 1 }}>

                        {/* Section 3: Right Panel (Payment Methods, Discount, Paid Input) */}
                        <div
                            className="purchase-payment-controls"
                            style={{
                                flex: 1,
                                display: "flex",
                                flexDirection: "column",
                                gap: "10px",
                            }}
                        >
                            {/* Row 1: Payment Methods & Discount (Merged) */}
                            <div className="purchase-payment-method-row" style={{ display: "flex", gap: "10px" }}>
                                {/* Payment Methods (No Label) */}
                                <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>

                                    <label style={{ fontSize: "12px", color: "#6b7280", width: "100px" }}>طريقة الدفع:</label>

                                    <div style={{ display: "flex", gap: "5px", flex: 2 }}>
                                        {paymentMethodButtons.map((method) => (
                                            <button
                                                key={String(method?.id ?? method?.code ?? method?.name)}
                                                onClick={() => updateInvoice({ paymentMethod: String(method.buttonValue) })}
                                                style={{
                                                    flex: 1,
                                                    padding: "11px", // Increased padding
                                                    borderRadius: "6px",
                                                    border: `2px solid ${String(activeInvoice.paymentMethod || "") === String(method.buttonValue) ? method.color : "#e5e7eb"}`,
                                                    backgroundColor: String(activeInvoice.paymentMethod || "") === String(method.buttonValue) ? method.bg : "white",
                                                    color: String(activeInvoice.paymentMethod || "") === String(method.buttonValue) ? method.text : "#374151",
                                                    fontWeight: "bold",
                                                    fontSize: "13px", // Increased font size
                                                    cursor: "pointer",
                                                    transition: "all 0.2s",

                                                }}
                                                title={method.name}
                                            >
                                                {method.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Discount (No Label) */}
                                <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>

                                    <label style={{ fontSize: "12px", color: "#6b7280", width: "50px" }}>الخصم:</label>
                                    <div style={{ display: "flex", gap: "5px", flex: 1 }}>
                                        <input
                                            type="number"
                                            value={activeInvoice.discount}
                                            onChange={(e) => updateInvoice({ discount: e.target.value })}
                                            min="0"
                                            step={activeInvoice.discountType === "percent" ? "1" : "0.01"}
                                            placeholder="الخصم"
                                            style={{
                                                flex: 1,
                                                padding: "8px",
                                                borderRadius: "6px",
                                                border: "1px solid #d1d5db",
                                                fontSize: "14px",
                                                textAlign: "center",
                                            }}
                                            onFocus={(e) => e.target.select()}
                                        />
                                        <select
                                            value={activeInvoice.discountType || "value"}
                                            onChange={(e) => updateInvoice({ discountType: e.target.value })}
                                            style={{
                                                padding: "0 5px",
                                                borderRadius: "6px",
                                                border: "1px solid #d1d5db",
                                                backgroundColor: "#f9fafb",
                                                fontSize: "13px",
                                                cursor: "pointer",
                                                width: "60px"
                                            }}
                                        >

                                            <option value="value">قيمة</option>
                                            <option value="percent">نسبه</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                                <label style={{ fontSize: "14px", color: "#111827", fontWeight: "bold" }}>المدفوع:</label>
                                <input
                                    ref={paymentInputRef}
                                    type="number"
                                    value={activeInvoice.paidAmount}
                                    onChange={(e) => updateInvoice({ paidAmount: e.target.value })}
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    style={{
                                        flex: 1,
                                        width: "100%",
                                        padding: "15px",
                                        fontSize: "20px",
                                        fontWeight: "bold",
                                        textAlign: "center",
                                        borderRadius: "8px",
                                        border: "2px solid #3b82f6",
                                        color: "#1e40af",
                                        backgroundColor: "#eff6ff",
                                    }}
                                    onFocus={(e) => e.target.select()}
                                />
                            </div>

                            {/* Action Buttons (Moved Here) */}
                            <div style={{ display: "flex", gap: "10px", marginTop: "0px" }}>
                                <button
                                    onClick={() => handleCheckout(false)}
                                    disabled={activeInvoice.cart.length === 0}
                                    style={{
                                        flex: 1,
                                        padding: "14px", // Increased padding
                                        backgroundColor: activeInvoice.cart.length === 0 ? "#9ca3af" : "#3b82f6",
                                        color: "white",
                                        border: "none",
                                        borderRadius: "6px",
                                        fontSize: "14px", // Increased font size slightly
                                        fontWeight: "bold",
                                        cursor: activeInvoice.cart.length === 0 ? "not-allowed" : "pointer",
                                        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                                    }}
                                >
                                    حفظ (F1)
                                </button>
                                <button
                                    onClick={() => handleCheckout(true)}
                                    disabled={activeInvoice.cart.length === 0}
                                    style={{
                                        flex: 1,
                                        padding: "16px", // Increased padding
                                        backgroundColor: activeInvoice.cart.length === 0 ? "#9ca3af" : "#10b981",
                                        color: "white",
                                        border: "none",
                                        borderRadius: "6px",
                                        fontSize: "14px", // Increased font size slightly
                                        fontWeight: "bold",
                                        cursor: activeInvoice.cart.length === 0 ? "not-allowed" : "pointer",
                                        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                                    }}
                                >
                                    حفظ وطباعة (F2)
                                </button>
                                <button
                                    onClick={() => handleCheckout(false, true)}
                                    disabled={activeInvoice.cart.length === 0}

                                    style={{
                                        flex: 1,
                                        padding: "14px", // Increased padding
                                        backgroundColor: activeInvoice.cart.length === 0 ? "#9ca3af" : "#f59e0b",
                                        color: "white",
                                        border: "none",
                                        borderRadius: "6px",
                                        fontSize: "14px", // Increased font size slightly
                                        fontWeight: "bold",
                                        cursor: activeInvoice.cart.length === 0 ? "not-allowed" : "pointer",
                                        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                                    }}
                                >
                                    حفظ ومعاينة (F3)
                                </button>


                            </div>
                        </div>

                        {/* Section 2: Middle Panel (Notes & Profit) */}
                        <div
                            className="purchase-notes-panel"
                            style={{
                                flex: 1,
                                display: "flex",
                                flexDirection: "column",
                                gap: "10px",
                            }}
                        >
                            {/* Notes Input */}
                            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                                <label style={{ fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>ملاحظات:</label>
                                <textarea
                                    value={activeInvoice.notes}
                                    onChange={(e) => updateInvoice({ notes: e.target.value })}
                                    style={{
                                        flex: 1,
                                        width: "100%",
                                        padding: "8px",
                                        borderRadius: "6px",
                                        border: "1px solid #d1d5db",
                                        fontSize: "13px",
                                        resize: "none",
                                    }}
                                    placeholder="ملاحظات الفاتورة..."
                                />
                            </div>

                            {/* Purchase Summary & Balances (Side by Side) */}
                            <div style={{ display: "flex", gap: "10px" }}>
                                {/* Purchase Summary Section */}
                                <div
                                    style={{
                                        flex: 1,
                                        backgroundColor: "#fff7ed",
                                        border: "1px dashed #fdba74",
                                        borderRadius: "6px",
                                        padding: "8px",
                                        display: "flex",
                                        flexDirection: "column",
                                        justifyContent: "center",
                                        gap: "8px",
                                        height: "80px",
                                    }}
                                >
                                    <span style={{ fontWeight: "bold", color: "#c2410c", fontSize: "13px" }}>
                                        ملخص المشتريات
                                    </span>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <span style={{ fontSize: "13px", color: "#9a3412" }}>
                                            الأصناف: {purchaseItemCount}
                                        </span>
                                        <span style={{ fontSize: "13px", fontWeight: "bold", color: "#c2410c" }}>
                                            الكمية: {purchaseTotalQuantity}
                                        </span>
                                    </div>
                                </div>

                                {/* Balances Card (Moved Here) */}
                                <div
                                    style={{
                                        flex: 1,
                                        backgroundColor: "white",
                                        padding: "8px",
                                        borderRadius: "8px",
                                        border: "1px solid #e5e7eb",
                                        display: "flex",
                                        flexDirection: "column",
                                        justifyContent: "center",
                                        gap: "5px",
                                        height: "80px",
                                    }}
                                >
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <span style={{ fontSize: "13px", color: "#6b7280" }}>الرصيد السابق :</span>
                                        <span
                                            style={{
                                                fontSize: "13px",
                                                fontWeight: "bold",
                                                color: supplierPreviousBalance < 0 ? "#dc2626" : "#059669",
                                            }}
                                        >
                                            {activeInvoice.customer ? supplierPreviousBalance.toFixed(2) : "0.00"}
                                        </span>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "5px", borderTop: "1px dashed #e5e7eb" }}>
                                        <span style={{ fontSize: "13px", color: "#6b7280" }}>الرصيد الحالي :</span>
                                        <span
                                            style={{
                                                fontSize: "13px",
                                                fontWeight: "bold",
                                                color: (supplierProjectedBalance ?? 0) < 0 ? "#dc2626" : "#059669",
                                            }}
                                        >
                                            {activeInvoice.customer
                                                ? supplierProjectedBalanceDisplay.toFixed(2)
                                                : "---"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>


                </div>

                {/* Section 1: left Panel (Totals) - Now Last - 20% */}
                <div
                    className="purchase-totals-panel"
                    style={{
                        flex: "0 0 20%",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                    }}
                >


                    {/* Invoice Totals Card */}
                    <div
                        style={{
                            backgroundColor: "white",
                            padding: "15px",
                            borderRadius: "8px",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            gap: "8px",
                        }}
                    >
                        {/* Subtotal */}
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: "13px", color: "#6b7280" }}>الإجمالي:</span>
                            <span style={{ fontWeight: "bold" }}>{(calculations.subTotal - calculations.totalDiscount).toFixed(2)}</span>
                        </div>

                        {/* Discount Display */}
                        <div style={{ display: "flex", justifyContent: "space-between", color: "#ef4444" }}>
                            <span style={{ fontSize: "13px" }}>الخصم:</span>
                            <span style={{ fontWeight: "bold" }}>- {calculations.billDiscount ? calculations.billDiscount.toFixed(2) : "0.00"}</span>
                        </div>

                        <div style={{ height: "1px", backgroundColor: "#e5e7eb", margin: "2px 0" }}></div>

                        {/* Net Total */}
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: "14px", fontWeight: "bold", color: "#111827" }}>الصافي:</span>
                            <span style={{ fontSize: "16px", fontWeight: "bold", color: "#111827" }}>{calculations.total.toFixed(2)}</span>
                        </div>

                        {/* Paid */}
                        <div style={{ display: "flex", justifyContent: "space-between", backgroundColor: "#f0fdf4", padding: "5px", borderRadius: "4px" }}>
                            <span style={{ fontSize: "13px", color: "#166534" }}>المدفوع:</span>
                            <span style={{ fontWeight: "bold", color: "#166534" }}>{calculations.paid.toFixed(2)}</span>
                        </div>

                        {/* Remaining */}
                        <div style={{ display: "flex", justifyContent: "space-between", backgroundColor: "#fef2f2", padding: "5px", borderRadius: "4px" }}>
                            <span style={{ fontSize: "13px", color: "#991b1b" }}>المتبقي:</span>
                            <span style={{ fontWeight: "bold", color: "#dc2626" }}>{calculations.remaining.toFixed(2)}</span>
                        </div>
                    </div>


                </div>
            </div>

            {/* === Modals === */}
            {/* Variant Selection Modal */}
            <VariantModal
                allowZeroQuantity={true}
                selectedProductForVariant={selectedProductForVariant}
                selectedVariantIndex={selectedVariantIndex}
                onClose={() => {
                    setSelectedProductForVariant(null);
                    setSelectedVariantIndex(-1);
                }}
                onSelectVariant={(variant) => {
                    addToCart(variant);
                    setSelectedProductForVariant(null);
                    setSelectedVariantIndex(-1);
                }}
                onVariantIndexChange={(index) => setSelectedVariantIndex(index)}
            />

            <ShortcutsHelpModal
                isOpen={showShortcutsModal}
                onClose={() => setShowShortcutsModal(false)}
                title="اختصارات فاتورة المشتريات"
                accentColor="#f97316"
                sections={PURCHASE_SHORTCUT_SECTIONS}
            />

            {singleQuantityModal.open && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        backgroundColor: "rgba(0,0,0,0.5)",
                        zIndex: 210,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                    onClick={closeSingleQuantityModal}
                >
                    <div
                        style={{
                            backgroundColor: "white",
                            borderRadius: "12px",
                            width: "100%",
                            maxWidth: "380px",
                            padding: "20px",
                            boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 style={{ margin: 0, color: "#111827", fontSize: "20px" }}>
                            {singleQuantityModal.product?.name || "المنتج"}
                        </h3>
                        <p style={{ margin: "8px 0 14px", color: "#6b7280", fontSize: "13px" }}>
                            أدخل الكمية المطلوبة
                        </p>

                        <input
                            type="number"
                            min="1"
                            value={singleQuantityModal.quantity}
                            onChange={(e) => {
                                const nextValue = Math.floor(toNumberSafe(e.target.value, 1));
                                setSingleQuantityModal((prev) => ({
                                    ...prev,
                                    quantity: Math.max(1, Number.isFinite(nextValue) ? nextValue : 1),
                                }));
                            }}
                            onFocus={(e) => e.target.select()}
                            autoFocus
                            style={{
                                width: "100%",
                                padding: "10px 12px",
                                borderRadius: "8px",
                                border: "1px solid #d1d5db",
                                fontSize: "18px",
                                fontWeight: "bold",
                                textAlign: "center",
                            }}
                        />

                        <div style={{ marginTop: "16px", display: "flex", gap: "8px" }}>
                            <button
                                type="button"
                                onClick={confirmSingleQuantitySelection}
                                style={{
                                    flex: 1,
                                    padding: "10px 12px",
                                    borderRadius: "8px",
                                    border: "none",
                                    backgroundColor: "#f97316",
                                    color: "white",
                                    fontWeight: "bold",
                                    cursor: "pointer",
                                }}
                            >
                                إضافة للسلة
                            </button>
                            <button
                                type="button"
                                onClick={closeSingleQuantityModal}
                                style={{
                                    flex: 1,
                                    padding: "10px 12px",
                                    borderRadius: "8px",
                                    border: "1px solid #cbd5e1",
                                    backgroundColor: "white",
                                    color: "#334155",
                                    fontWeight: "bold",
                                    cursor: "pointer",
                                }}
                            >
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <NewCustomerModal
                isOpen={showNewCustomerModal}
                customer={newCustomer}
                onChange={setNewCustomer}
                onSave={handleAddSupplier}
                existingCustomers={customers}
                title="إضافة مورد جديد"
                onClose={() => {
                    setShowNewCustomerModal(false);
                    setNewCustomer({
                        name: "",
                        phone: "",
                        phone2: "",
                        address: "",
                        city: "",
                        district: "",
                        notes: "",
                        creditLimit: 0,
                        customerType: "عادي",
                    });
                }}
                zIndex={1200}
            />

            {/* Product Details Modal */}
            {productDetailsModal.open && (
                <div
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(0,0,0,0.5)",
                        zIndex: 1100,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                    onClick={() => setProductDetailsModal({ open: false, item: null })}
                >
                    <div
                        style={{
                            backgroundColor: "white",
                            borderRadius: "12px",
                            padding: "25px",
                            width: "400px",
                            boxShadow:
                                "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            style={{
                                marginBottom: "20px",
                                borderBottom: "1px solid #e5e7eb",
                                paddingBottom: "10px",
                            }}
                        >
                            <h3 style={{ margin: 0, color: "#111827" }}>تفاصيل المنتج</h3>
                            <div
                                style={{ fontSize: "14px", color: "#6b7280", marginTop: "5px" }}
                            >
                                {productDetailsModal.item.productName}
                            </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "10px",
                                    backgroundColor: "#f9fafb",
                                    borderRadius: "8px",
                                    border: "1px solid #e5e7eb",
                                }}
                            >
                                <span style={{ color: "#4b5563" }}><span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={14} /> آخر بيع:</span></span>
                                <span style={{ fontWeight: "bold", color: "#111827" }}>
                                    {productDetailsModal.item.history?.lastSaleDate
                                        ? new Date(productDetailsModal.item.history.lastSaleDate).toLocaleDateString("ar-EG")
                                        : "لا يوجد"}
                                </span>
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "10px",
                                    backgroundColor: "#f9fafb",
                                    borderRadius: "8px",
                                    border: "1px solid #e5e7eb",
                                }}
                            >
                                <span style={{ color: "#4b5563" }}>⏳ أول شراء:</span>
                                <span style={{ fontWeight: "bold", color: "#111827" }}>
                                    {productDetailsModal.item.history?.firstPurchaseDate
                                        ? new Date(productDetailsModal.item.history.firstPurchaseDate).toLocaleDateString("ar-EG")
                                        : "لا يوجد"}
                                </span>
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "10px",
                                    backgroundColor: "#f9fafb",
                                    borderRadius: "8px",
                                    border: "1px solid #e5e7eb",
                                }}
                            >
                                <span style={{ color: "#4b5563" }}>🆕 أحدث شراء:</span>
                                <span style={{ fontWeight: "bold", color: "#111827" }}>
                                    {productDetailsModal.item.history?.lastPurchaseDate
                                        ? new Date(productDetailsModal.item.history.lastPurchaseDate).toLocaleDateString("ar-EG")
                                        : "لا يوجد"}
                                </span>
                            </div>
                        </div>

                        <div style={{ marginTop: "25px" }}>
                            <button
                                onClick={() => setProductDetailsModal({ open: false, item: null })}
                                style={{
                                    width: "100%",
                                    padding: "12px",
                                    backgroundColor: "#3b82f6",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                    fontWeight: "bold",
                                }}
                            >
                                إغلاق
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Customer Ledger Modal */}
            {
                showSupplierLedger && (
                    <SupplierLedger
                        supplierId={showSupplierLedger}
                        onClose={() => setShowSupplierLedger(null)}
                    />
                )
            }

            {/* Payment Edit Modal */}
            {activeInvoice?.editorMode === "payment" && (
                <PaymentModal
                    isOpen={showPaymentEditModal}
                    selectedCustomer={paymentEditModalCustomer}
                    paymentData={paymentEditModalData}
                    onSubmit={handleSavePaymentEdit}
                    onClose={handleClosePaymentEditModal}
                    isSubmitting={isSaving}
                    paymentMethods={paymentMethods}
                    title="تسجيل مستند صرف"
                />
            )}

            {/* Invoice Preview Modal */}
            {
                showInvoicePreview && previewData && (
                    <InvoicePreview
                        sale={previewData}
                        entityLabel="المورد"
                        invoiceTitle="فاتورة مشتريات"
                        onClose={() => {
                            setShowInvoicePreview(false);
                            setPreviewData(null);
                        }}
                        onPrint={async () => {
                            try {
                                await printPurchaseById(
                                    previewData.id,
                                    {
                                        ...previewData,
                                        supplier: previewData.supplier || previewData.customer || null,
                                    },
                                    "preview"
                                );

                                setShowInvoicePreview(false);
                                setPreviewData(null);

                                setTimeout(() => {
                                    if (searchInputRef.current) searchInputRef.current.focus();
                                }, 100);
                            } catch (err) {
                                console.error(err);
                                showToast("خطأ: " + err.message, "error");
                            }
                        }}
                    />
                )
            }
            <Suspense fallback={null}>
                {showProductModal && (
                    <ProductModal
                        isOpen={showProductModal}
                        onClose={() => setShowProductModal(false)}
                        onSave={handleSaveProduct}
                        mode="create"
                        categories={categories}
                        isSaving={isSavingProduct}
                    />
                )}
            </Suspense>

            {showBarcodeStudio && (
                <Suspense fallback={null}>
                    <BarcodeStudioModal
                        barcodeStudioProducts={barcodeStudioProducts}
                        setBarcodeStudioProducts={setBarcodeStudioProducts}
                        allAvailableProducts={allProductGroups}
                        barcodeStudioRows={barcodeStudioRows}
                        barcodeStudioSafeSettings={barcodeStudioSafeSettings}
                        barcodeStudioTab={barcodeStudioTab}
                        setBarcodeStudioTab={setBarcodeStudioTab}
                        barcodePrinting={barcodePrinting}
                        barcodePreview={barcodePreview}
                        barcodePreviewIsMatrix={barcodePreviewIsMatrix}
                        matrixBarcodeEngineLoading={matrixBarcodeEngineLoading}
                        matrixBarcodeEngineError={matrixBarcodeEngineError}
                        barcodeTemplates={barcodeTemplates}
                        activeBarcodeTemplateId={activeBarcodeTemplateId}
                        activeBarcodeTemplate={activeBarcodeTemplate}
                        barcodeTemplateName={barcodeTemplateName}
                        setBarcodeTemplateName={setBarcodeTemplateName}
                        barcodeTemplatePrinter={barcodeTemplatePrinter}
                        setBarcodeTemplatePrinter={setBarcodeTemplatePrinter}
                        barcodePrintPreferences={barcodePrintPreferences}
                        setBarcodeSetting={setBarcodeSetting}
                        setBarcodeNumberSetting={setBarcodeNumberSetting}
                        applyBarcodePreset={applyBarcodePreset}
                        applyBarcodeTemplate={applyBarcodeTemplate}
                        saveNewBarcodeTemplate={saveNewBarcodeTemplate}
                        updateBarcodeTemplate={updateBarcodeTemplate}
                        deleteBarcodeTemplate={deleteBarcodeTemplate}
                        resetBarcodeStudioSettings={applyBarcodeSystemDefaults}
                        applyBarcodeSystemDefaults={applyBarcodeSystemDefaults}
                        closeBarcodeStudio={() => setShowBarcodeStudio(false)}
                        executeBarcodeStudioPrint={executeBarcodeStudioPrint}
                        executeBarcodeStudioPdfExport={executeBarcodeStudioPdfExport}
                        printers={printers}
                        loadingPrinters={loadingPrinters}
                        refreshPrinters={refreshPrinters}
                        saveBarcodeSystemSettings={saveBarcodeSystemSettings}
                    />
                </Suspense>
            )}

        </div>
    );
}
