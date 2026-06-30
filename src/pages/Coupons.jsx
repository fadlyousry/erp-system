import React, { useState, useEffect } from 'react';
import { safeAlert } from '../utils/safeAlert';
import { safeConfirm } from '../utils/safeConfirm';
import { 
  Percent, 
  Plus, 
  Search, 
  Calendar, 
  Users, 
  CheckCircle, 
  XCircle, 
  Trash2, 
  Edit, 
  ChevronDown, 
  ChevronUp, 
  RefreshCw, 
  AlertCircle,
  Sparkles,
  DollarSign
} from 'lucide-react';

export default function Coupons() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCouponId, setExpandedCouponId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const initialFormData = {
    code: '',
    discountType: 'PERCENTAGE',
    discountValue: '',
    maxDiscount: '',
    minOrderValue: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    usageLimit: '',
    isActive: true
  };

  const [formData, setFormData] = useState(initialFormData);

  useEffect(() => {
    loadCoupons();
  }, []);

  const loadCoupons = async () => {
    setLoading(true);
    try {
      const result = await window.api.getCoupons();
      if (result?.error) {
        safeAlert(result.error);
      } else {
        setCoupons(result || []);
      }
    } catch (err) {
      console.error('فشل تحميل الكوبونات', err);
      safeAlert('حدث خطأ أثناء تحميل الكوبونات');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateRandomCode = () => {
    const prefixes = ['SAVE', 'FADL', 'OFF', 'GIFT', 'DISC'];
    const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const randomChar = chars[Math.floor(Math.random() * chars.length)] + chars[Math.floor(Math.random() * chars.length)];
    setFormData(prev => ({
      ...prev,
      code: `${randomPrefix}-${randomChar}${randomNum}`.toUpperCase()
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.code || !formData.code.trim()) {
      safeAlert('الرجاء إدخال كود الكوبون');
      return;
    }

    if (parseFloat(formData.discountValue) <= 0) {
      safeAlert('قيمة الخصم يجب أن تكون أكبر من صفر');
      return;
    }

    const dataToSave = {
      ...formData,
      code: formData.code.trim().toUpperCase(),
      discountValue: parseFloat(formData.discountValue),
      maxDiscount: formData.maxDiscount ? parseFloat(formData.maxDiscount) : null,
      minOrderValue: formData.minOrderValue ? parseFloat(formData.minOrderValue) : null,
      startDate: formData.startDate ? new Date(formData.startDate).toISOString() : new Date().toISOString(),
      endDate: formData.endDate ? new Date(formData.endDate).toISOString() : null,
      usageLimit: formData.usageLimit ? parseInt(formData.usageLimit) : null,
      isActive: formData.isActive
    };

    try {
      let result;
      if (editingCoupon) {
        result = await window.api.updateCoupon(editingCoupon.id, dataToSave);
      } else {
        result = await window.api.addCoupon(dataToSave);
      }

      if (result?.error) {
        safeAlert(result.error);
        return;
      }

      setShowModal(false);
      setFormData(initialFormData);
      setEditingCoupon(null);
      loadCoupons();
    } catch (err) {
      console.error('خطأ في حفظ الكوبون', err);
      safeAlert('فشل حفظ الكوبون. الرجاء التحقق من البيانات.');
    }
  };

  const handleEdit = (coupon) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue.toString(),
      maxDiscount: coupon.maxDiscount ? coupon.maxDiscount.toString() : '',
      minOrderValue: coupon.minOrderValue ? coupon.minOrderValue.toString() : '',
      startDate: coupon.startDate ? new Date(coupon.startDate).toISOString().split('T')[0] : '',
      endDate: coupon.endDate ? new Date(coupon.endDate).toISOString().split('T')[0] : '',
      usageLimit: coupon.usageLimit ? coupon.usageLimit.toString() : '',
      isActive: coupon.isActive
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    const confirmed = await safeConfirm('هل أنت متأكد من حذف كود الخصم هذا نهائياً؟', {
      title: 'تأكيد حذف الكوبون',
      buttons: ['حذف الكوبون', 'إلغاء']
    });
    if (!confirmed) return;

    try {
      const result = await window.api.deleteCoupon(id);
      if (result?.error) {
        safeAlert(result.error);
      } else {
        loadCoupons();
      }
    } catch (err) {
      console.error('فشل حذف الكوبون', err);
      safeAlert('تعذر إتمام عملية الحذف.');
    }
  };

  const handleToggleActive = async (coupon) => {
    const nextState = !coupon.isActive;
    const actionText = nextState ? 'تفعيل' : 'تعطيل';
    
    try {
      const result = await window.api.updateCoupon(coupon.id, { isActive: nextState });
      if (result?.error) {
        safeAlert(result.error);
      } else {
        loadCoupons();
      }
    } catch (err) {
      console.error('خطأ في تغيير حالة الكوبون', err);
      safeAlert('تعذر تغيير حالة الكوبون.');
    }
  };

  const getCouponStatus = (coupon) => {
    if (!coupon.isActive) return { text: 'معطل', color: '#ef4444', bgColor: '#fee2e2' };
    
    const now = new Date();
    if (coupon.startDate && now < new Date(coupon.startDate)) {
      return { text: 'مجدول لاحقاً', color: '#f59e0b', bgColor: '#fef3c7' };
    }
    if (coupon.endDate && now > new Date(coupon.endDate)) {
      return { text: 'منتهي الصلاحية', color: '#6b7280', bgColor: '#f3f4f6' };
    }
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      return { text: 'نفدت التفعيلات', color: '#7c3aed', bgColor: '#f3e8ff' };
    }
    
    return { text: 'نشط وصالح', color: '#10b981', bgColor: '#d1fae5' };
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'مستمر (غير محدد)';
    return new Date(dateStr).toLocaleDateString('ar-EG', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  };

  // Filtered coupons search + status
  const filteredCoupons = coupons.filter(coupon => {
    const matchesSearch = coupon.code.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (statusFilter === 'all') return true;
    const st = getCouponStatus(coupon).text;
    if (statusFilter === 'active') return st === 'نشط وصالح';
    if (statusFilter === 'inactive') return st === 'معطل';
    if (statusFilter === 'expired') return st === 'منتهي الصلاحية';
    if (statusFilter === 'exhausted') return st === 'نفدت التفعيلات';
    if (statusFilter === 'scheduled') return st === 'مجدول لاحقاً';
    return true;
  });

  // Statistics
  const totalCoupons = coupons.length;
  const activeCoupons = coupons.filter(c => getCouponStatus(c).text === 'نشط وصالح').length;
  const totalUsages = coupons.reduce((sum, c) => sum + (c.usedCount || 0), 0);
  
  // Calculate total discounts granted
  const totalDiscountsGranted = coupons.reduce((sum, c) => {
    const saleDiscounts = c.sales?.reduce((sSum, sale) => sSum + parseFloat(sale.couponDiscount || 0), 0) || 0;
    return sum + saleDiscounts;
  }, 0);

  return (
    <div style={{ direction: 'rtl', fontFamily: 'Cairo, system-ui, sans-serif' }}>
      
      {/* Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Percent size={18} style={{ color: '#6366f1' }} />
          أكواد الخصم والكوبونات
        </h1>
        <button
          onClick={() => { setEditingCoupon(null); setFormData(initialFormData); setShowModal(true); }}
          style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} />
          كوبون جديد
        </button>
      </div>

      {/* Search + Filters Row */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: '220px' }}>
          <Search style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={15} />
          <input
            type="text"
            placeholder="بحث بالكود..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '7px 32px 7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none', backgroundColor: 'white' }}
            onFocus={(e) => e.currentTarget.style.borderColor = '#6366f1'}
            onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
          />
        </div>

        {[
          { key: 'all', label: `الكل (${totalCoupons})` },
          { key: 'active', label: `نشط (${activeCoupons})` },
          { key: 'inactive', label: 'معطل' },
          { key: 'expired', label: 'منتهي' },
          { key: 'exhausted', label: 'نفد' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            style={{
              padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: statusFilter === f.key ? '800' : '600',
              border: statusFilter === f.key ? '1px solid #6366f1' : '1px solid #e2e8f0',
              backgroundColor: statusFilter === f.key ? '#eef2ff' : 'white',
              color: statusFilter === f.key ? '#4f46e5' : '#64748b',
              cursor: 'pointer', transition: 'all 0.15s'
            }}
          >
            {f.label}
          </button>
        ))}

        <button onClick={loadCoupons} title="تحديث" style={{ marginRight: 'auto', backgroundColor: 'transparent', color: '#64748b', border: '1px solid #e2e8f0', padding: '6px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <RefreshCw size={14} className={loading ? 'spin-animation' : ''} />
        </button>
      </div>

      {/* Main Coupons Table */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: 'white', overflow: 'hidden' }}>
        {loading && coupons.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontSize: '13px' }}>
            <RefreshCw className="spin-animation" size={20} style={{ margin: '0 auto 8px', color: '#2563eb' }} />
            جاري التحميل...
          </div>
        ) : filteredCoupons.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13px' }}>
            {searchQuery || statusFilter !== 'all' ? 'لا توجد نتائج مطابقة' : 'لا توجد أكواد خصم — اضغط "كوبون جديد"'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '10px 14px', color: '#475569', fontWeight: '700', fontSize: '11px' }}>الكود</th>
                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: '700', fontSize: '11px' }}>الخصم</th>
                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: '700', fontSize: '11px' }}>الحد الأدنى</th>
                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: '700', fontSize: '11px' }}>الفترة</th>
                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: '700', fontSize: '11px' }}>الحد الأقصى</th>
                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: '700', fontSize: '11px', textAlign: 'center' }}>الاستخدام</th>
                <th style={{ padding: '10px 12px', color: '#475569', fontWeight: '700', fontSize: '11px', textAlign: 'center' }}>الحالة</th>
                <th style={{ padding: '10px 14px', color: '#475569', fontWeight: '700', fontSize: '11px', textAlign: 'center' }}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredCoupons.map((coupon) => {
                const statusObj = getCouponStatus(coupon);
                const isExpanded = expandedCouponId === coupon.id;

                return (
                  <React.Fragment key={coupon.id}>
                    <tr style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: isExpanded ? '#fafafa' : 'white', cursor: 'pointer' }}
                      onClick={() => setExpandedCouponId(isExpanded ? null : coupon.id)}
                    >
                      {/* Code */}
                      <td style={{ padding: '8px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <ChevronDown size={12} style={{ color: '#94a3b8', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }} />
                          <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: '700', color: '#1e293b', backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                            {coupon.code}
                          </span>
                        </div>
                      </td>

                      {/* Value */}
                      <td style={{ padding: '8px 12px', color: coupon.discountType === 'PERCENTAGE' ? '#4f46e5' : '#059669', fontWeight: '600' }}>
                        {coupon.discountType === 'PERCENTAGE' ? `%${coupon.discountValue}` : `${coupon.discountValue} ج.م`}
                        {coupon.discountType === 'PERCENTAGE' && coupon.maxDiscount ? ` (حد ${coupon.maxDiscount})` : ''}
                      </td>

                      {/* Minimum */}
                      <td style={{ padding: '8px 12px', color: coupon.minOrderValue ? '#334155' : '#cbd5e1' }}>
                        {coupon.minOrderValue ? `${coupon.minOrderValue} ج.م` : '—'}
                      </td>

                      {/* Validity */}
                      <td style={{ padding: '8px 12px', color: '#64748b' }}>
                        {formatDate(coupon.startDate)} → {formatDate(coupon.endDate)}
                      </td>

                      {/* Limit */}
                      <td style={{ padding: '8px 12px', color: coupon.usageLimit ? '#334155' : '#cbd5e1' }}>
                        {coupon.usageLimit ? `${coupon.usageLimit} مرة` : '∞'}
                      </td>

                      {/* Times Used */}
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: '700', color: coupon.usedCount > 0 ? '#7c3aed' : '#cbd5e1' }}>
                        {coupon.usedCount || 0}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', backgroundColor: statusObj.bgColor, color: statusObj.color }}>
                          <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: statusObj.color }}></span>
                          {statusObj.text}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '8px 14px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                          <button onClick={() => handleToggleActive(coupon)} style={{ backgroundColor: coupon.isActive ? '#fef2f2' : '#ecfdf5', color: coupon.isActive ? '#ef4444' : '#10b981', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
                            {coupon.isActive ? 'تعطيل' : 'تفعيل'}
                          </button>
                          <button onClick={() => handleEdit(coupon)} title="تعديل" style={{ color: '#3b82f6', backgroundColor: '#eff6ff', border: 'none', padding: '5px', borderRadius: '4px', cursor: 'pointer', display: 'inline-flex' }}>
                            <Edit size={13} />
                          </button>
                          <button onClick={() => handleDelete(coupon.id)} title="حذف" style={{ color: '#ef4444', backgroundColor: '#fef2f2', border: 'none', padding: '5px', borderRadius: '4px', cursor: 'pointer', display: 'inline-flex' }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expandable Beneficiary Rows List */}
                    {isExpanded && (
                      <tr onClick={(e) => e.stopPropagation()} style={{ backgroundColor: '#f8fafc' }}>
                        <td colSpan="8" style={{ padding: '20px 30px', borderBottom: '1px solid #e2e8f0' }}>
                          <div style={{ borderLeft: '4px solid #7c3aed', paddingLeft: '15px', marginRight: '15px' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 'bold', color: '#4c1d95', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Sparkles size={16} />
                              العملاء الذين استفادوا من هذا الكوبون ({coupon.sales?.length || 0} عملية شراء)
                            </h4>

                            {!coupon.sales || coupon.sales.length === 0 ? (
                              <p style={{ margin: 0, fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>
                                لم يتم استخدام هذا الكوبون في أي فواتير مبيعات سابقة حتى الآن.
                              </p>
                            ) : (
                              <div style={{ overflowX: 'auto', marginTop: '10px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                                  <thead>
                                    <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>اسم العميل</th>
                                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>رقم هاتف العميل</th>
                                      <th style={{ padding: '8px 12px', textAlign: 'center' }}>رقم الفاتورة</th>
                                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>تاريخ تفعيل الفاتورة</th>
                                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>إجمالي الفاتورة</th>
                                      <th style={{ padding: '8px 12px', textAlign: 'right', color: '#7c3aed', fontWeight: 'bold' }}>الخصم المستفاد منه</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {coupon.sales.map((sale) => (
                                      <tr key={sale.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '8px 12px', fontWeight: 'bold', color: '#1e293b' }}>
                                          {sale.customer?.name || 'عميل نقدي (عام)'}
                                        </td>
                                        <td style={{ padding: '8px 12px', color: '#64748b', fontFamily: 'monospace' }}>
                                          {sale.customer?.phone || '—'}
                                        </td>
                                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                          <span style={{ backgroundColor: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                            #{sale.id}
                                          </span>
                                        </td>
                                        <td style={{ padding: '8px 12px', color: '#475569' }}>
                                          {new Date(sale.invoiceDate || sale.createdAt).toLocaleDateString('ar-EG', {
                                            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                          })}
                                        </td>
                                        <td style={{ padding: '8px 12px', color: '#1e293b' }}>
                                          {parseFloat(sale.total).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
                                        </td>
                                        <td style={{ padding: '8px 12px', color: '#7c3aed', fontWeight: 'bold' }}>
                                          {parseFloat(sale.couponDiscount || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal for Coupon Creation/Editing */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            fontFamily: 'Cairo, sans-serif'
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '24px',
              padding: '36px',
              width: '560px',
              maxWidth: '92%',
              boxShadow: '0 24px 50px -12px rgba(0, 0, 0, 0.25)',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ borderBottom: '2px solid #f1f5f9', paddingBottom: '20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '900', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {editingCoupon ? '📝 تعديل بيانات الكوبون' : '✨ إنشاء كوبون خصم جديد'}
              </h2>
              <button 
                onClick={() => setShowModal(false)} 
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b', transition: 'all 0.2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; e.currentTarget.style.color = '#64748b'; }}
              >
                <XCircle size={22} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              
              {/* Code */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '800', color: '#334155' }}>كود الخصم *</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="مثال: SAVE20 أو SUMMER50"
                    required
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '2px solid transparent',
                      fontSize: '16px',
                      outline: 'none',
                      fontFamily: 'monospace',
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      backgroundColor: '#f8fafc',
                      transition: 'all 0.2s',
                      letterSpacing: '1px'
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.1)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                  <button
                    type="button"
                    onClick={handleGenerateRandomCode}
                    style={{
                      backgroundColor: '#eff6ff',
                      color: '#3b82f6',
                      border: 'none',
                      padding: '12px 20px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      fontWeight: '800',
                      fontSize: '14px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dbeafe'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#eff6ff'}
                  >
                    توليد تلقائي
                  </button>
                </div>
              </div>

              {/* Discount Type and Value */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '800', color: '#334155' }}>نوع الخصم *</label>
                  <select
                    value={formData.discountType}
                    onChange={(e) => setFormData({ ...formData, discountType: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '2px solid transparent',
                      fontSize: '15px',
                      outline: 'none',
                      backgroundColor: '#f8fafc',
                      transition: 'all 0.2s',
                      cursor: 'pointer'
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.1)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <option value="PERCENTAGE">نسبة مئوية (%)</option>
                    <option value="FIXED">قيمة ثابتة (جنيه)</option>
                  </select>
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '800', color: '#334155' }}>قيمة الخصم *</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                    placeholder={formData.discountType === 'PERCENTAGE' ? 'مثال: 15' : 'مثال: 50'}
                    required
                    min="0.01"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '2px solid transparent',
                      fontSize: '15px',
                      outline: 'none',
                      backgroundColor: '#f8fafc',
                      transition: 'all 0.2s',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.1)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>

              {/* Min Order Value and Max Discount */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '800', color: '#334155' }}>الحد الأدنى للفاتورة</label>
                  <input
                    type="number"
                    value={formData.minOrderValue}
                    onChange={(e) => setFormData({ ...formData, minOrderValue: e.target.value })}
                    placeholder="اختياري (مثال: 300)"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '2px solid transparent',
                      fontSize: '15px',
                      outline: 'none',
                      backgroundColor: '#f8fafc',
                      transition: 'all 0.2s',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.1)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '800', color: '#334155' }}>
                    الحد الأقصى للخصم {formData.discountType !== 'PERCENTAGE' && '(معطل للثابت)'}
                  </label>
                  <input
                    type="number"
                    value={formData.maxDiscount}
                    onChange={(e) => setFormData({ ...formData, maxDiscount: e.target.value })}
                    placeholder="اختياري (مثال: 100)"
                    disabled={formData.discountType !== 'PERCENTAGE'}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '2px solid transparent',
                      fontSize: '15px',
                      outline: 'none',
                      backgroundColor: formData.discountType !== 'PERCENTAGE' ? '#f1f5f9' : '#f8fafc',
                      transition: 'all 0.2s',
                      opacity: formData.discountType !== 'PERCENTAGE' ? 0.6 : 1
                    }}
                    onFocus={(e) => { if (formData.discountType === 'PERCENTAGE') { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.1)'; } }}
                    onBlur={(e) => { if (formData.discountType === 'PERCENTAGE') { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.boxShadow = 'none'; } }}
                  />
                </div>
              </div>

              {/* Start Date and End Date */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '800', color: '#334155' }}>تاريخ تفعيل الكوبون</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '2px solid transparent',
                      fontSize: '15px',
                      outline: 'none',
                      backgroundColor: '#f8fafc',
                      transition: 'all 0.2s',
                      fontFamily: 'inherit'
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.1)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '800', color: '#334155' }}>تاريخ انتهاء الفعالية</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '2px solid transparent',
                      fontSize: '15px',
                      outline: 'none',
                      backgroundColor: '#f8fafc',
                      transition: 'all 0.2s',
                      fontFamily: 'inherit'
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.1)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>

              {/* Usage limit and Activeness */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px', alignItems: 'center' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '800', color: '#334155' }}>الحد الأقصى للتفعيل</label>
                  <input
                    type="number"
                    value={formData.usageLimit}
                    onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value })}
                    placeholder="عدد مرات الاستخدام الإجمالي"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '2px solid transparent',
                      fontSize: '15px',
                      outline: 'none',
                      backgroundColor: '#f8fafc',
                      transition: 'all 0.2s',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.1)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '24px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#8b5cf6' }}
                  />
                  <label htmlFor="isActive" style={{ fontSize: '15px', fontWeight: '900', color: '#0f172a', cursor: 'pointer' }}>
                    كود الخصم نشط ومتاح
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '16px', borderTop: '2px solid #f1f5f9', paddingTop: '24px' }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    backgroundColor: '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '15px',
                    boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)'
                  }}
                >
                  حفظ الكوبون
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: '#64748b',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '15px'
                  }}
                >
                  إلغاء التغييرات
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
