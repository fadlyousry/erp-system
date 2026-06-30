import React, { useState, useEffect, useRef } from "react";

/**
 * VariantModal Component
 * موديال اختيار المقاسات والألوان مع تحديد الكمية
 * 
 * الخصائص:
 * - selectedProductForVariant: المنتج المختار
 * - selectedVariantIndex: فهرس المتغير المختار
 * - onClose: دالة الإغلاق
 * - onSelectVariant: دالة الاختيار (تمرير المتغير والكمية)
 * - onVariantIndexChange: تحديث الفهرس
 */

function VariantModal({
    selectedProductForVariant,
    selectedVariantIndex,
    onClose,
    onSelectVariant,
    onVariantIndexChange,
    allowZeroQuantity = false,
}) {
    const [quantity, setQuantity] = useState(1);
    const modalRef = useRef(null);

    // إعادة تعيين الكمية والتحديد عند تغيير الموديال
    useEffect(() => {
        if (selectedProductForVariant) {
            setQuantity(1);
            // تحديد أول عنصر تلقائياً
            if (selectedVariantIndex === -1) {
                onVariantIndexChange(0);
            }
            // التركيز على الموديال
            if (modalRef.current) {
                modalRef.current.focus();
            }
        }
    }, [selectedProductForVariant?.id, onVariantIndexChange, selectedVariantIndex]);

    // معالجة الكيبورد (جميع مفاتيح الموديال)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!selectedProductForVariant) return;

            const currentVariant = selectedProductForVariant.variants[selectedVariantIndex];
            if (!currentVariant) return;

            const variants = selectedProductForVariant.variants;

            switch (e.key) {
                // التنقل بين المتغيرات
                case "ArrowDown":
                    e.preventDefault();
                    const newIndexDown = Math.min(selectedVariantIndex + 1, variants.length - 1);
                    onVariantIndexChange(newIndexDown);
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    const newIndexUp = selectedVariantIndex > 0 ? selectedVariantIndex - 1 : -1;
                    onVariantIndexChange(newIndexUp);
                    break;
                // تغيير الكمية
                case "ArrowRight":
                    e.preventDefault();
                    setQuantity((prev) =>
                        (allowZeroQuantity || prev < currentVariant.quantity) ? prev + 1 : prev
                    );
                    break;
                case "ArrowLeft":
                    e.preventDefault();
                    setQuantity((prev) => (prev > 1 ? prev - 1 : 1));
                    break;
                // إضافة المنتج أو الإغلاق
                case "Enter":
                    e.preventDefault();
                    onSelectVariant({ ...currentVariant, quantitySelected: quantity });
                    break;
                case "Escape":
                    e.preventDefault();
                    onClose();
                    break;
                default:
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedProductForVariant, selectedVariantIndex, quantity, onSelectVariant, onVariantIndexChange, onClose]);

    if (!selectedProductForVariant) return null;

    const currentVariant = selectedProductForVariant.variants[selectedVariantIndex];

    return (
        <div
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0,0,0,0.5)",
                zIndex: 200,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}
            onClick={onClose}
        >

            <div
                ref={modalRef}
                style={{
                    backgroundColor: "white",
                    padding: "30px",
                    borderRadius: "15px",
                    width: "520px",
                    maxHeight: "80vh",
                    overflowY: "auto",
                    outline: "none",
                    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header مع السعر */}
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: "30px",
                        paddingBottom: "20px",
                        borderBottom: "2px solid #f3f4f6",
                    }}
                >
                    <div style={{ flex: 1 }}>
                        <h2 style={{ margin: "0 0 8px 0", fontSize: "24px", color: "#111827" }}>
                            {selectedProductForVariant.name}
                        </h2>
                        <div style={{ fontSize: "14px", color: "#6b7280" }}>
                            اختر المقاس واللون
                        </div>
                    </div>
                    <div style={{ textAlign: "right" }}>

                        <div style={{ fontSize: "28px", fontWeight: "bold", color: "#059669", paddingLeft: "15px" }}>
                            {selectedProductForVariant.basePrice.toFixed(2)}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: "none",
                            border: "none",
                            fontSize: "32px",
                            cursor: "pointer",
                            color: "#9ca3af",
                            marginLeft: "15px",
                            padding: "0",
                            lineHeight: "1",
                        }}
                    >
                        ×
                    </button>
                </div>



                {/* المقاسات والألوان */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        marginBottom: "25px",
                        maxHeight: "35vh",
                        overflowY: "auto",
                        padding: "8px",
                    }}
                >
                    {selectedProductForVariant.variants.map((variant, index) => {
                        const isSelected = selectedVariantIndex === index;
                        const isDisabled = !allowZeroQuantity && variant.quantity <= 0;

                        return (
                            <div
                                key={variant.id}
                                data-variant-index={index}
                                tabIndex={isDisabled ? -1 : 0}
                                onMouseEnter={() => onVariantIndexChange(index)}
                                onFocus={() => onVariantIndexChange(index)}
                                onClick={() => {
                                    if (!isDisabled) {
                                        onSelectVariant({ ...variant, quantitySelected: quantity });
                                    }
                                }}
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "12px 15px",
                                    borderRadius: "8px",


                                    border: "1px solid #e5e7eb",       // ثابت

                                    boxShadow: selectedVariantIndex === index
                                        ? '0 0 0 2px #3b82f6'
                                        : 'none',

                                    cursor: isDisabled ? "not-allowed" : "pointer",
                                    backgroundColor: isSelected ? "#eff6ff" : "white",
                                    opacity: isDisabled ? 0.5 : 1,
                                    transition: "all 0.2s ease",
                                }}
                            >
                                <div style={{ fontWeight: "600", fontSize: "15px", color: "#111827" }}>
                                    {variant.productSize} / {variant.color}
                                </div>

                                <div style={{ textAlign: "right" }}>
                                    <div
                                        style={{
                                            fontSize: "12px",
                                            color: variant.quantity < 5 ? "#ef4444" : "#6b7280",
                                            fontWeight: variant.quantity < 5 ? "bold" : "normal",
                                        }}
                                    >
                                        {(variant.quantity === 0 && !allowZeroQuantity)
                                            ? "غير متاح"
                                            : `${variant.quantity} متاح`}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* قسم الكمية */}
                {selectedProductForVariant && (
                    <div
                        style={{
                            backgroundColor: "#f9fafb",
                            padding: "20px",
                            borderRadius: "12px",
                            border: "1px solid #e5e7eb",
                        }}
                    >
                        <div style={{ marginBottom: "15px" }}>
                            <label
                                style={{
                                    display: "block",
                                    fontSize: "13px",
                                    color: "#6b7280",
                                    marginBottom: "10px",
                                    fontWeight: "600",
                                }}
                            >
                                الكمية المطلوبة
                            </label>
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                }}
                            >
                                <button
                                    onClick={() =>
                                        setQuantity((prev) =>
                                            (allowZeroQuantity || prev < currentVariant.quantity) ? prev + 1 : prev,
                                        )
                                    }
                                    style={{
                                        width: "40px",
                                        height: "40px",
                                        border: "1px solid #d1d5db",
                                        borderRadius: "6px",
                                        backgroundColor: "white",
                                        cursor: "pointer",
                                        fontSize: "18px",
                                        fontWeight: "bold",
                                        color: "#3b82f6",
                                        transition: "all 0.2s",
                                    }}
                                    onMouseEnter={(e) => {
                                        e.target.style.backgroundColor = "#eff6ff";
                                        e.target.style.borderColor = "#3b82f6";
                                    }}
                                    onMouseLeave={(e) => {
                                        e.target.style.backgroundColor = "white";
                                        e.target.style.borderColor = "#d1d5db";
                                    }}
                                >
                                    +
                                </button>

                                <div
                                    style={{
                                        flex: 1,
                                        textAlign: "center",
                                        padding: "8px",
                                        backgroundColor: "white",
                                        border: "1px solid #d1d5db",
                                        borderRadius: "6px",
                                        fontSize: "16px",
                                        fontWeight: "bold",
                                        color: "#111827",
                                    }}
                                >
                                    {quantity}
                                </div>

                                <button
                                    onClick={() =>
                                        setQuantity((prev) => (prev > 1 ? prev - 1 : 1))
                                    }
                                    style={{
                                        width: "40px",
                                        height: "40px",
                                        border: "1px solid #d1d5db",
                                        borderRadius: "6px",
                                        backgroundColor: "white",
                                        cursor: "pointer",
                                        fontSize: "18px",
                                        fontWeight: "bold",
                                        color: "#ef4444",
                                        transition: "all 0.2s",
                                    }}
                                    onMouseEnter={(e) => {
                                        e.target.style.backgroundColor = "#fee2e2";
                                        e.target.style.borderColor = "#ef4444";
                                    }}
                                    onMouseLeave={(e) => {
                                        e.target.style.backgroundColor = "white";
                                        e.target.style.borderColor = "#d1d5db";
                                    }}
                                >
                                    −
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default VariantModal;