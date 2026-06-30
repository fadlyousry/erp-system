import React, { useState, useEffect, useRef } from 'react';

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (!Number.isFinite(d.getTime())) return '-';
  return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
};

const getCouponStatus = (coupon) => {
  const now = new Date();
  if (!coupon.isActive) return { label: 'معطّل', color: '#94a3b8', bg: '#f1f5f9' };
  if (coupon.endDate && now > new Date(coupon.endDate)) return { label: 'منتهي', color: '#ef4444', bg: '#fef2f2' };
  if (coupon.startDate && now < new Date(coupon.startDate)) return { label: 'لم يبدأ', color: '#f59e0b', bg: '#fffbeb' };
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return { label: 'مستنفد', color: '#ef4444', bg: '#fef2f2' };
  return { label: 'متاح', color: '#10b981', bg: '#f0fdf4' };
};

export default function ChooseCouponModal({ open, onClose, onApply, currentTotal, anchorEl }) {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [applyingId, setApplyingId] = useState(null);
  const [error, setError] = useState('');
  const [position, setPosition] = useState({ bottom: 0, left: 0, width: 420 });
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setError('');
    setManualCode('');
    setApplyingId(null);
    loadCoupons();
    setTimeout(() => inputRef.current?.focus(), 150);

    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const modalWidth = 440; // pop-up width
      
      // Calculate bottom to place it above the button, with 12px spacing
      let bottom = window.innerHeight - rect.top + 12;
      
      // Center horizontally relative to the button
      let left = rect.left + (rect.width / 2) - (modalWidth / 2);
      
      // Keep within window bounds
      if (left < 10) left = 10;
      if (left + modalWidth > window.innerWidth - 10) left = window.innerWidth - modalWidth - 10;
      
      setPosition({ bottom, left, width: modalWidth });
    }
  }, [open, anchorEl]);

  const loadCoupons = async () => {
    setLoading(true);
    try {
      const result = await window.api.getCoupons();
      if (result?.error) {
        setCoupons([]);
      } else {
        setCoupons(Array.isArray(result) ? result : []);
      }
    } catch {
      setCoupons([]);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyCoupon = async (code) => {
    setError('');
    setApplyingId(code);
    try {
      const trimmedCode = String(code).trim().toUpperCase();
      if (!trimmedCode) {
        setError('يرجى إدخال كود الكوبون');
        setApplyingId(null);
        return;
      }

      const result = await window.api.validateCoupon(trimmedCode, currentTotal || 0);

      if (result?.error) {
        setError(result.error);
        setApplyingId(null);
        return;
      }

      if (result?.success && result?.coupon) {
        onApply(result.coupon);
        onClose();
      } else {
        setError('كوبون غير صالح أو منتهي الصلاحية');
        setApplyingId(null);
      }
    } catch (err) {
      console.error('Error applying coupon:', err);
      setError('حدث خطأ أثناء التحقق من الكوبون');
      setApplyingId(null);
    }
  };

  const handleManualApply = () => {
    if (manualCode.trim()) {
      handleApplyCoupon(manualCode.trim());
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleManualApply();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  const availableCoupons = coupons.filter(c => {
    const status = getCouponStatus(c);
    return status.label === 'متاح';
  });

  const otherCoupons = coupons.filter(c => {
    const status = getCouponStatus(c);
    return status.label !== 'متاح';
  });

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        backgroundColor: anchorEl ? 'transparent' : 'rgba(0,0,0,0.5)',
        display: anchorEl ? 'block' : 'flex', 
        alignItems: 'center', justifyContent: 'center',
        backdropFilter: anchorEl ? 'none' : 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#fff', borderRadius: '16px',
          width: anchorEl ? `${position.width}px` : '520px', 
          maxHeight: anchorEl ? '450px' : '80vh',
          boxShadow: '0 20px 40px -10px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeInUp 0.2s ease-out',
          position: anchorEl ? 'absolute' : 'relative',
          bottom: anchorEl ? `${position.bottom}px` : 'auto',
          left: anchorEl ? `${position.left}px` : 'auto',
          transformOrigin: 'bottom center',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          borderBottom: '1px solid #f1f5f9',
          color: '#1e293b',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
               اختيار كوبون خصم
            </h2>
            <button
              onClick={onClose}
              style={{
                background: '#f1f5f9', border: 'none',
                color: '#64748b', width: '32px', height: '32px',
                borderRadius: '8px', cursor: 'pointer', fontSize: '18px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b'; }}
            >
              ×
            </button>
          </div>

          {/* Manual Code Input */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="اكتب كود الكوبون هنا..."
              value={manualCode}
              onChange={(e) => {
                setManualCode(e.target.value.toUpperCase());
                setError('');
              }}
              onKeyDown={handleKeyDown}
              style={{
                flex: 1, padding: '10px 14px',
                borderRadius: '10px', border: '2px solid #e2e8f0',
                backgroundColor: '#ffffff',
                color: '#1e293b', fontSize: '15px',
                fontFamily: 'monospace', fontWeight: 'bold',
                outline: 'none', letterSpacing: '1px',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => e.target.style.borderColor = '#7c3aed'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            />
            <button
              onClick={handleManualApply}
              disabled={!manualCode.trim() || !!applyingId}
              style={{
                padding: '10px 20px', borderRadius: '10px',
                border: 'none',
                backgroundColor: manualCode.trim() ? '#7c3aed' : '#f1f5f9',
                color: manualCode.trim() ? '#ffffff' : '#94a3b8',
                fontWeight: 'bold', fontSize: '14px',
                cursor: manualCode.trim() ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
                boxShadow: manualCode.trim() ? '0 2px 6px rgba(124,58,237,0.25)' : 'none',
              }}
            >
              {applyingId === manualCode.trim().toUpperCase() ? '...' : 'تطبيق'}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            margin: '12px 24px 0', padding: '10px 14px',
            backgroundColor: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: '8px', color: '#dc2626',
            fontSize: '13px', fontWeight: 'bold',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Content */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '16px 24px 20px',
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>⏳</div>
              جاري تحميل الكوبونات...
            </div>
          ) : coupons.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
              <p style={{ margin: 0, fontWeight: 'bold' }}>لا توجد كوبونات</p>
              <p style={{ margin: '4px 0 0', fontSize: '13px' }}>يمكنك كتابة كود يدوياً في الحقل أعلاه</p>
            </div>
          ) : (
            <>
              {/* Available Coupons */}
              {availableCoupons.length > 0 && (
                <>
                  <div style={{
                    fontSize: '13px', fontWeight: 'bold', color: '#10b981',
                    marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    ✅ كوبونات متاحة ({availableCoupons.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                    {availableCoupons.map((coupon) => (
                      <CouponCard
                        key={coupon.id}
                        coupon={coupon}
                        onApply={() => handleApplyCoupon(coupon.code)}
                        isApplying={applyingId === coupon.code}
                        currentTotal={currentTotal}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* Other/Expired Coupons */}
              {otherCoupons.length > 0 && (
                <>
                  <div style={{
                    fontSize: '13px', fontWeight: 'bold', color: '#94a3b8',
                    marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    🚫 كوبونات غير متاحة ({otherCoupons.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', opacity: 0.55 }}>
                    {otherCoupons.map((coupon) => (
                      <CouponCard
                        key={coupon.id}
                        coupon={coupon}
                        disabled
                        currentTotal={currentTotal}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(15px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

function CouponCard({ coupon, onApply, isApplying, disabled, currentTotal }) {
  const status = getCouponStatus(coupon);
  const isPercentage = coupon.discountType === 'PERCENTAGE';
  const isAvailable = status.label === 'متاح';

  // Calculate estimated savings
  let savings = 0;
  if (currentTotal > 0 && isAvailable) {
    if (isPercentage) {
      savings = (currentTotal * coupon.discountValue) / 100;
      if (coupon.maxDiscount && savings > coupon.maxDiscount) {
        savings = coupon.maxDiscount;
      }
    } else {
      savings = coupon.discountValue;
    }
  }

  return (
    <div
      style={{
        border: `2px solid ${isAvailable ? '#e9d5ff' : '#e5e7eb'}`,
        borderRadius: '12px',
        padding: '14px 16px',
        backgroundColor: isAvailable ? '#faf5ff' : '#f9fafb',
        transition: 'all 0.2s',
        cursor: disabled ? 'default' : 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
      onClick={() => !disabled && onApply && onApply()}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.borderColor = '#7c3aed';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(124,58,237,0.15)';
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.borderColor = '#e9d5ff';
          e.currentTarget.style.boxShadow = 'none';
        }
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        {/* Code + Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontFamily: 'monospace', fontWeight: 'bold', fontSize: '16px',
            color: isAvailable ? '#7c3aed' : '#94a3b8',
            letterSpacing: '1.5px',
          }}>
            {coupon.code}
          </span>
          <span style={{
            padding: '2px 8px', borderRadius: '6px',
            fontSize: '11px', fontWeight: 'bold',
            color: status.color, backgroundColor: status.bg,
          }}>
            {status.label}
          </span>
        </div>

        {/* Discount Badge */}
        <div style={{
          backgroundColor: isAvailable ? '#7c3aed' : '#94a3b8',
          color: 'white', padding: '4px 10px',
          borderRadius: '8px', fontSize: '13px', fontWeight: 'bold',
          whiteSpace: 'nowrap',
        }}>
          {isPercentage
            ? `${coupon.discountValue}% خصم`
            : `${coupon.discountValue} ج.م خصم`
          }
        </div>
      </div>

      {/* Details row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '12px', color: '#64748b' }}>
        {coupon.endDate && (
          <span>📅 ينتهي: {formatDate(coupon.endDate)}</span>
        )}
        {coupon.usageLimit !== null && (
          <span>🔄 {coupon.usedCount || 0}/{coupon.usageLimit} استخدام</span>
        )}
        {coupon.minOrderValue > 0 && (
          <span>💰 حد أدنى: {coupon.minOrderValue} ج.م</span>
        )}
        {savings > 0 && (
          <span style={{ color: '#10b981', fontWeight: 'bold' }}>
            💸 توفير تقريبي: {savings.toFixed(2)} ج.م
          </span>
        )}
      </div>

      {/* Apply Button for available coupons */}
      {isAvailable && !disabled && (
        <div style={{
          position: 'absolute', left: '16px', top: '50%',
          transform: 'translateY(-50%)',
        }}>
    
        </div>
      )}
    </div>
  );
}
