import React, { useEffect } from "react";

export default function ShortcutsHelpModal({
    isOpen,
    onClose,
    title = "الاختصارات",
    accentColor = "#2563eb",
    sections = [],
}) {
    useEffect(() => {
        if (!isOpen) return undefined;

        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose?.();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(15, 23, 42, 0.55)",
                zIndex: 1300,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "16px",
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: "100%",
                    maxWidth: "760px",
                    maxHeight: "90vh",
                    overflowY: "auto",
                    backgroundColor: "white",
                    borderRadius: "16px",
                    boxShadow: "0 25px 60px rgba(15, 23, 42, 0.25)",
                    border: "1px solid #d1d5db",
                    direction: "rtl",
                }}
                onClick={(event) => event.stopPropagation()}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 16px",
                        borderBottom: "1px solid #e5e7eb",
                        backgroundColor: "#ffffff",
                    }}
                >
                    <div style={{ fontSize: "18px", fontWeight: "bold", color: "#111827" }}>
                        {title}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            width: "30px",
                            height: "30px",
                            borderRadius: "8px",
                            border: "none",
                            backgroundColor: "#f3f4f6",
                            color: "#6b7280",
                            cursor: "pointer",
                            fontSize: "20px",
                            lineHeight: 1,
                        }}
                        title="إغلاق"
                    >
                        ×
                    </button>
                </div>

                <div style={{ padding: "12px" }}>
                    <div
                        style={{
                            border: "1px solid #d1d5db",
                            borderRadius: "10px",
                            overflow: "hidden",
                            backgroundColor: "white",
                        }}
                    >
                        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                            <thead>
                                <tr style={{ backgroundColor: "#f3f4f6" }}>
                                    <th
                                        style={{
                                            padding: "10px 10px",
                                            borderBottom: "1px solid #d1d5db",
                                            textAlign: "center",
                                            color: "#111827",
                                            fontSize: "14px",
                                            fontWeight: "bold",
                                            width: "34%",
                                        }}
                                    >
                                        المفتاح الاختصاري
                                    </th>
                                    <th
                                        style={{
                                            padding: "10px 10px",
                                            borderRight: "1px solid #d1d5db",
                                            borderBottom: "1px solid #d1d5db",
                                            textAlign: "center",
                                            color: "#111827",
                                            fontSize: "14px",
                                            fontWeight: "bold",
                                            width: "66%",
                                        }}
                                    >
                                        الإجراء
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {sections.map((section, sectionIndex) => (
                                    <React.Fragment key={`${section.title}-${sectionIndex}`}>
                                        <tr style={{ backgroundColor: `${accentColor}10` }}>
                                            <td
                                                colSpan={2}
                                                style={{
                                                    padding: "7px 10px",
                                                    borderBottom: "1px solid #dbe3f0",
                                                    textAlign: "center",
                                                    color: accentColor,
                                                    fontSize: "12px",
                                                    fontWeight: "bold",
                                                }}
                                            >
                                                {section.title}
                                            </td>
                                        </tr>
                                        {(section.items || []).map((row, rowIndex) => (
                                            <tr
                                                key={`${section.title}-${row.keys}-${rowIndex}`}
                                                style={{
                                                    backgroundColor: rowIndex % 2 === 0 ? "#ffffff" : "#fafafa",
                                                }}
                                            >
                                                <td
                                                    style={{
                                                        padding: "8px 10px",
                                                        borderBottom: "1px solid #e5e7eb",
                                                        textAlign: "center",
                                                        color: accentColor,
                                                        fontSize: "14px",
                                                        fontWeight: "bold",
                                                    }}
                                                >
                                                    {row.keys}
                                                </td>
                                                <td
                                                    style={{
                                                        padding: "8px 10px",
                                                        borderRight: "1px solid #e5e7eb",
                                                        borderBottom: "1px solid #e5e7eb",
                                                        textAlign: "center",
                                                        color: "#1f2937",
                                                        fontSize: "14px",
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    {row.description}
                                                </td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
