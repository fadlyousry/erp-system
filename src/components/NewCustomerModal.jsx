// موديل عميل جديد
import React, { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";


// دالة بسيطة للتحقق من رقم الهاتف المصري
const isValidEgyptianPhone = (phone) => {
  const regex = /^(010|011|012|015)[0-9]{8}$/;
  return regex.test(phone);
};

export default function NewCustomerModal({
  isOpen,
  customer,
  onChange,
  onClose,
  onSave,
  existingCustomers = [], // مصفوفة العملاء الحاليين [{name, phone}]
  title = "إضافة عميل جديد",
  zIndex = 1000,
  editingCustomerId = null, // معرّف العميل المراد تعديله (null عند الإضافة الجديدة)
  isEditMode = false, // فقط في التعديل: تنبيه التطابق الكامل فقط، لا اقتراحات
}) {
  const [phoneError, setPhoneError] = useState("");
  const [phone2Error, setPhone2Error] = useState("");
  const [duplicateNameError, setDuplicateNameError] = useState("");
  const [hoveredError, setHoveredError] = useState(null);

  const handleCancelClick = (e) => onClose?.(e);

  // تحديث التحقق من تطابق الاسم
  useEffect(() => {
    if (customer && customer.name && Array.isArray(existingCustomers) && existingCustomers.length > 0) {
      const normalizedInputName = customer.name.trim().toLowerCase();

      // فقط تنبيه exact match بدون اقتراحات
      
      // تحقق إذا الاسم موجود بالظبط (لكن تتجاهل نفس العميل المراد تعديله في mode التعديل)
      const exactMatch = existingCustomers.find(
        (c) => {
          if (!c.name) return false;
          const isSameNameExact = c.name.trim().toLowerCase() === normalizedInputName;
          
          // لو في edit mode، تتجاهل نفس العميل
          if (isEditMode) {
            return isSameNameExact && c.id !== editingCustomerId;
          }
          
          // في mode الإضافة، أي تطابق دقيق = خطأ
          return isSameNameExact;
        }
      );

      if (exactMatch) {
        setDuplicateNameError("هذا الاسم مسجل من قبل");
      } else {
        setDuplicateNameError("");
      }
    } else {
      setDuplicateNameError("");
    }
  }, [customer?.name, existingCustomers, editingCustomerId, isEditMode]);

  if (!isOpen || !customer) return null;

  const handlePhoneChange = (value) => {
    onChange({ ...customer, phone: value });
    // لو فاضي، مش نعمل validate
    if (!value.trim()) {
      setPhoneError("");
    } else if (!isValidEgyptianPhone(value)) {
      setPhoneError("رقم الهاتف غير صحيح (مثال: 01012345678)");
    } else {
      setPhoneError("");
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
  };

  const getInputStyle = (hasError) => ({
    ...inputStyle,
    borderColor: hasError ? "#ef4444" : "#d1d5db",
    borderWidth: hasError ? "2px" : "1px",
  });

  const inputContainerStyle = (hasError) => ({
    position: "relative",
    width: "100%",
  });

  const errorIconStyle = (hasError) => ({
    position: "absolute",
    left: "10px",
    top: "50%",
    transform: "translateY(-50%)",
    color: "#ef4444",
    cursor: "pointer",
    fontSize: "16px",
    opacity: hasError ? 1 : 0,
    pointerEvents: hasError ? "auto" : "none",
  });

const tooltipStyle = {
  position: "absolute",
  bottom: "110%",        // فوق العنصر
  left: "50%",
  transform: "translateX(-50%) translateY(-4px)",
  backgroundColor: "#fef3c7", // Amber لطيف
  color: "#92400e",
  padding: "6px 10px",
  borderRadius: "8px",
  fontSize: "11px",
  fontWeight: "500",
  whiteSpace: "nowrap",
  zIndex: 20,
  boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
  opacity: 0,
  pointerEvents: "none",
  transition: "all 0.2s ease",
};



  const iconWrapperStyle = {
    position: "relative",
    display: "inline-block",
  };

  const labelStyle = {
    display: "block",
    marginBottom: "5px",
    fontSize: "13px",
    fontWeight: "500",
  };

  const cardStyle = {
    backgroundColor: "#fff",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "transparent",
        zIndex: zIndex,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "15px",
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "16px",
          padding: "30px",
          width: "850px",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 0 40px rgba(0, 0, 0, 0.18), 0 20px 80px rgba(0, 0, 0, 0.12), 0 0 100px rgba(0, 0, 0, 0.08)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: "25px", fontSize: "22px" }}>{title}</h2>

        {/* التخطيط الأفقي: الجزء الأيسر المعلومات الأساسية + العنوان، الجزء الأيمن البيانات الإضافية */}
        <div style={{ display: "flex", gap: "20px" }}>
          {/* الجزء الأيسر */}
          <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* معلومات أساسية */}
            <div style={cardStyle}>
              <h3 style={{ marginBottom: "15px", fontSize: "16px" }}>معلومات أساسية</h3>

              <div style={{ marginBottom: "15px" }}>
                <label style={labelStyle}>الاسم *</label>
                <div style={inputContainerStyle(!!duplicateNameError)}>
                  <input
                    type="text"
                    value={customer.name}
                    onChange={(e) => onChange({ ...customer, name: e.target.value })}
                    style={{...getInputStyle(!!duplicateNameError), paddingLeft: duplicateNameError ? "35px" : "10px"}}
                  />
                  {duplicateNameError && (
                    <div
                      style={iconWrapperStyle}
                      onMouseEnter={() => setHoveredError("name")}
                      onMouseLeave={() => setHoveredError(null)}
                    >
                      <div
                        style={{...errorIconStyle(!!duplicateNameError)}}
                      >
<AlertTriangle size={18} color="#f59e0b" />
                      </div>
                      <div style={{
                        ...tooltipStyle,
                        opacity: hoveredError === "name" ? 1 : 0,
                      }}>
                        {duplicateNameError}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: "15px" }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>رقم الهاتف</label>
                  <div style={inputContainerStyle(!!phoneError)}>
                    <input
                      type="number"
                      value={customer.phone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      style={{...getInputStyle(!!phoneError), paddingLeft: phoneError ? "35px" : "10px"}}
                    />
                    {phoneError && (
                      <div
                        style={iconWrapperStyle}
                        onMouseEnter={() => setHoveredError("phone1")}
                        onMouseLeave={() => setHoveredError(null)}
                      >
                        <div style={{...errorIconStyle(!!phoneError)}}>
<AlertTriangle size={18} color="#f59e0b" />
                        </div>
                        <div style={{
                          ...tooltipStyle,
                          opacity: hoveredError === "phone1" ? 1 : 0,
                        }}>
                          {phoneError}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>رقم هاتف ثاني</label>
                  <div style={inputContainerStyle(!!phone2Error)}>
                    <input
                      type="number"
                      value={customer.phone2}
                      onChange={(e) => {
                        const value = e.target.value;
                        onChange({ ...customer, phone2: value });
                        // تحقق فوري أثناء الكتابة
                        if (value && !isValidEgyptianPhone(value)) {
                          setPhone2Error("رقم الهاتف غير صحيح (مثال: 01012345678)");
                        } else {
                          setPhone2Error("");
                        }
                      }}
                      style={{...getInputStyle(!!phone2Error), paddingLeft: phone2Error ? "35px" : "10px"}}
                    />
                    {phone2Error && (
                      <div
                        style={iconWrapperStyle}
                        onMouseEnter={() => setHoveredError("phone2")}
                        onMouseLeave={() => setHoveredError(null)}
                      >
                        <div style={{...errorIconStyle(!!phone2Error)}}>
<AlertTriangle size={18} color="#f59e0b" />
                        </div>
                        <div style={{
                          ...tooltipStyle,
                          opacity: hoveredError === "phone2" ? 1 : 0,
                        }}>
                          {phone2Error}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* العنوان */}
            <div style={cardStyle}>
              <h3 style={{ marginBottom: "15px", fontSize: "16px" }}>العنوان</h3>
              <div style={{ display: "flex", gap: "15px", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "150px" }}>
                  <label style={labelStyle}>المدينة</label>
                  <input
                    type="text"
                    value={customer.city}
                    onChange={(e) => onChange({ ...customer, city: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 1, minWidth: "150px" }}>
                  <label style={labelStyle}>المنطقة</label>
                  <input
                    type="text"
                    value={customer.district}
                    onChange={(e) => onChange({ ...customer, district: e.target.value })}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div style={{ marginTop: "15px" }}>
                <label style={labelStyle}>العنوان التفصيلي</label>
                <input
                  type="text"
                  value={customer.address}
                  onChange={(e) => onChange({ ...customer, address: e.target.value })}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* الجزء الأيمن: البيانات الإضافية */}
          <div style={{ flex: 1 }}>
            <div style={cardStyle}>
              <h3 style={{ marginBottom: "15px", fontSize: "16px" }}>بيانات إضافية</h3>
              <div style={{ marginBottom: "15px" }}>
                <label style={labelStyle}>نوع العميل</label>
                <select
                  value={customer.customerType}
                  onChange={(e) =>
                    onChange({ ...customer, customerType: e.target.value })
                  }
                  style={inputStyle}
                >
                  <option value="عادي">عادي</option>
                  <option value="VIP">VIP</option>
                  <option value="تاجر جملة">تاجر جملة</option>
                </select>
              </div>

              <div style={{ marginBottom: "15px" }}>
                <label style={labelStyle}>الحد الائتماني</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={customer.creditLimit}
                  onChange={(e) =>
                    onChange({
                      ...customer,
                      creditLimit: parseFloat(e.target.value) || 0,
                    })
                  }
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>ملاحظات</label>
                <textarea
                  value={customer.notes}
                  onChange={(e) => onChange({ ...customer, notes: e.target.value })}
                  rows="9"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: "10px", marginTop: "25px" }}>
          <button
            type="button"
            onClick={onSave}
            disabled={!customer.name || phoneError || phone2Error || !!duplicateNameError}
            style={{
              flex: 1,
              padding: "12px",
              backgroundColor: duplicateNameError || phoneError || phone2Error || !customer.name ? "#ccc" : "#10b981",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            حفظ
          </button>
          <button
            type="button"
            onClick={handleCancelClick}
            style={{
              flex: 1,
              padding: "12px",
              backgroundColor: "#6b7280",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            إلفاء
          </button>
        </div>
      </div>
    </div>
  );
}
