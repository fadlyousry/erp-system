import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Sparkles, Search, Send, Users, RefreshCw, 
  AlertCircle, CheckCircle2, MessageSquare, Megaphone, 
  HelpCircle, Settings, PhoneCall
} from 'lucide-react';
import { safeAlert } from '../utils/safeAlert';
import { safeConfirm } from '../utils/safeConfirm';
import './AiMarketing.css';

const nInt = (val, fallback = 0) => {
  const parsed = parseInt(val, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toArabicNum = (num) => {
  if (num == null) return '';
  return String(num).replace(/[0-9]/g, w => ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'][+w]);
};

export default function AiMarketing() {
  // App/Connection Status
  const [waStatus, setWaStatus] = useState({ isConnected: false, status: 'disconnected' });
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  
  // Products
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  
  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(false);

  // AI Prompters
  const [targetCustomerType, setTargetCustomerType] = useState('جميع العملاء');
  const [customPrompt, setCustomPrompt] = useState('');
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Sending Configurations
  const [sendingMode, setSendingMode] = useState('group'); // 'group', 'customers', 'manual'
  const [manualNumbers, setManualNumbers] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [bulkProgress, setBulkProgress] = useState(null);

  // Load status and groups
  const loadWaStatus = useCallback(async () => {
    try {
      const res = await window.api.whatsappGetStatus();
      setWaStatus(res);
      if (res.isConnected) {
        const groupRes = await window.api.aiMarketingGetGroups();
        if (groupRes.success) {
          setGroups(groupRes.groups || []);
        }
      }
    } catch (err) {
      console.error('Failed to load WhatsApp status:', err);
    }
  }, []);

  useEffect(() => {
    loadWaStatus();

    const handleStatusChange = (newStatus) => {
      setWaStatus(newStatus);
      if (newStatus.isConnected) {
        window.api.aiMarketingGetGroups().then(groupRes => {
          if (groupRes.success) setGroups(groupRes.groups || []);
        });
      }
    };

    window.api.onWhatsappStatusChanged?.(handleStatusChange);
    return () => {
      window.api.offWhatsappStatusChanged?.();
    };
  }, [loadWaStatus]);

  // Load Products & Categories
  const loadProductsData = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const prodRes = await window.api.getProducts({
        page: 1,
        pageSize: 100, // Load first 100 products for quick selector
        searchTerm: '',
        categoryId: '',
        stockFilter: 'all',
        sortCol: 'createdAt',
        sortDir: 'desc'
      });
      if (prodRes && !prodRes.error) {
        setProducts(Array.isArray(prodRes) ? prodRes : (prodRes.data || []));
      }

      const catRes = await window.api.getCategories();
      if (catRes && !catRes.error) {
        setCategories(catRes);
      }
    } catch (err) {
      console.error('Failed to load products/categories in AI marketing:', err);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    loadProductsData();
  }, [loadProductsData]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (p.barcode || '').includes(searchTerm) || 
                            (p.sku || '').includes(searchTerm);
      const matchesCategory = !categoryFilter || String(p.categoryId) === String(categoryFilter);
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, categoryFilter]);

  // Handle select product
  const handleSelectProduct = (prod) => {
    setSelectedProduct(prod);
    setGeneratedMessage('');
    setIsEditing(false);
  };

  // Generate marketing message
  const handleGenerate = async () => {
    if (!selectedProduct) return;
    setGenerating(true);
    setSendResult(null);
    try {
      const res = await window.api.aiMarketingGenerate({
        product: selectedProduct,
        customPrompt,
        targetCustomerType
      });
      if (res.success) {
        setGeneratedMessage(res.message);
      } else {
        await safeAlert('فشل توليد الرسالة: ' + (res.error || 'خطأ غير معروف'), null, {
          type: 'error',
          title: 'الذكاء الاصطناعي'
        });
      }
    } catch (err) {
      await safeAlert(err.message || 'حدث خطأ أثناء التوليد', null, {
        type: 'error',
        title: 'الذكاء الاصطناعي'
      });
    } finally {
      setGenerating(false);
    }
  };

  // Send Campaign
  const handleSend = async () => {
    if (!generatedMessage.trim()) {
      return safeAlert('الرجاء كتابة أو توليد رسالة تسويقية أولاً.', null, { type: 'warning' });
    }

    if (sendingMode === 'group' && !selectedGroup) {
      return safeAlert('الرجاء اختيار مجموعة الواتساب المستهدفة.', null, { type: 'warning' });
    }

    setSending(true);
    setSendResult(null);
    setBulkProgress(null);

    try {
      if (sendingMode === 'group') {
        const res = await window.api.aiMarketingSendToGroup({
          groupId: selectedGroup,
          message: generatedMessage
        });
        if (res.success) {
          setSendResult({ success: true, message: 'تم إرسال الرسالة بنجاح إلى المجموعة! 🎉' });
        } else {
          setSendResult({ success: false, error: res.error });
        }
      } else if (sendingMode === 'customers') {
        let dbType = 'all';
        if (targetCustomerType === 'عملاء القطاعي (عادي)') dbType = 'عادي';
        else if (targetCustomerType === 'عملاء الجملة (تاجر جملة)') dbType = 'تاجر جملة';
        else if (targetCustomerType === 'عملاء VIP') dbType = 'VIP';

        // Fetch targets from DB
        const fetchRes = await window.api.getCustomers({
          page: 1,
          pageSize: 10000,
          searchTerm: '',
          customerType: dbType,
          city: '',
          sortCol: 'createdAt',
          sortDir: 'desc'
        });

        if (fetchRes?.error) throw new Error(fetchRes.error);

        const list = Array.isArray(fetchRes?.data) ? fetchRes.data : [];
        const numbers = list.map(c => String(c.phone || c.phone2 || '').trim()).filter(p => p.length >= 7);

        if (numbers.length === 0) {
          setSendResult({ success: false, error: 'لا يوجد عملاء لديهم أرقام هواتف مسجلة في هذه الفئة.' });
          setSending(false);
          return;
        }

        const ok = await safeConfirm(`سيتم إرسال الرسالة إلى ${numbers.length} عميل بشكل فردي متتابع. هل ترغب في البدء؟`, {
          title: 'تأكيد إرسال الحملة'
        });

        if (!ok) {
          setSending(false);
          return;
        }

        // Setup bulk progress simulator/handler
        setBulkProgress({ current: 0, total: numbers.length, sentCount: 0, failedCount: 0 });

        const res = await window.api.aiMarketingSendToNumbers({
          numbers,
          message: generatedMessage
        });

        if (res.success) {
          setSendResult({
            success: true,
            message: `تم إطلاق الحملة بنجاح! تم الإرسال لـ ${res.sentCount} عميل، وفشل ${res.failedCount} عميل.`
          });
        } else {
          setSendResult({ success: false, error: res.error });
        }
      } else if (sendingMode === 'manual') {
        const numbers = manualNumbers.split(/[\n,;]+/).map(n => n.trim()).filter(n => n.length >= 7);
        if (numbers.length === 0) {
          setSending(false);
          return safeAlert('الرجاء إدخال أرقام هواتف صالحة تفصل بينها فاصلة.', null, { type: 'warning' });
        }

        const ok = await safeConfirm(`هل ترغب في إرسال الرسالة إلى ${numbers.length} رقماً يدوياً؟`, {
          title: 'تأكيد الإرسال اليدوي'
        });
        if (!ok) {
          setSending(false);
          return;
        }

        setBulkProgress({ current: 0, total: numbers.length, sentCount: 0, failedCount: 0 });

        const res = await window.api.aiMarketingSendToNumbers({
          numbers,
          message: generatedMessage
        });

        if (res.success) {
          setSendResult({
            success: true,
            message: `تم إرسال الرسائل لـ ${res.sentCount} رقم بنجاح، وفشل ${res.failedCount} رقم.`
          });
        } else {
          setSendResult({ success: false, error: res.error });
        }
      }
    } catch (err) {
      setSendResult({ success: false, error: err.message });
    } finally {
      setSending(false);
      setBulkProgress(null);
    }
  };

  const handleNavigateToWhatsApp = () => {
    // Navigate via POS bridge event or directly
    const event = new CustomEvent('app-navigate', { detail: { page: 'whatsapp' } });
    window.dispatchEvent(event);
  };

  return (
    <div className="ai-mkt-page">
      <header className="ai-mkt-header">
        <h1>
          <div className="ai-mkt-header-icon"><Sparkles size={22} /></div>
          مساعد التسويق الذكي بالذكاء الاصطناعي (AI Marketing)
        </h1>

        <div 
          className={`ai-mkt-connection-badge ${waStatus.isConnected ? 'connected' : 'disconnected'}`}
          onClick={handleNavigateToWhatsApp}
          title="اضغط للانتقال لشاشة اتصال واتساب"
        >
          {waStatus.isConnected ? (
            <>
              <CheckCircle2 size={16} />
              <span>واتساب متصل</span>
            </>
          ) : (
            <>
              <AlertCircle size={16} />
              <span>واتساب غير متصل (اضغط للربط)</span>
            </>
          )}
        </div>
      </header>

      <div className="ai-mkt-layout">
        {/* LEFT PANEL: Products list */}
        <aside className="ai-mkt-sidebar-card">
          <div className="ai-mkt-sidebar-title">
            <Megaphone size={18} color="#0ea5e9" />
            <span>اختر المنتج للحملة</span>
          </div>

          <div className="ai-mkt-search-wrapper">
            <input 
              type="text" 
              placeholder="ابحث باسم المنتج أو الباركود..."
              className="ai-mkt-search-input"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <select 
            className="ai-mkt-category-select"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
          >
            <option value="">جميع الفئات</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <div className="ai-mkt-products-list">
            {loadingProducts ? (
              <div className="ai-mkt-loading-spinner">
                <RefreshCw size={24} className="loading" />
                <span>جاري تحميل المنتجات...</span>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                لا توجد منتجات مطابقة للبحث.
              </div>
            ) : (
              filteredProducts.map(p => {
                const stockQty = nInt(p.inventory?.totalQuantity, 0);
                const isSelected = selectedProduct?.id === p.id;
                return (
                  <div 
                    key={p.id} 
                    className={`ai-mkt-product-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectProduct(p)}
                  >
                    <div className="ai-mkt-product-item-details">
                      <span className="ai-mkt-product-name">{p.name}</span>
                      <span className="ai-mkt-product-price">{toArabicNum(p.price)} ج.م</span>
                    </div>
                    <span className={`ai-mkt-product-stock-badge ${stockQty > 10 ? 'ok' : stockQty > 0 ? 'warning' : 'empty'}`}>
                      {stockQty > 0 ? `${toArabicNum(stockQty)} قطعة` : 'نفذت الكمية'}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* RIGHT PANEL: Workspace */}
        <main className="ai-mkt-workspace">
          {/* Workspace Left: AI Configuration */}
          <div className="ai-mkt-workspace-pane">
            <h2 className="ai-mkt-pane-title">
              <Sparkles size={20} color="#0ea5e9" />
              صياغة الحملة بالذكاء الاصطناعي
            </h2>

            {selectedProduct ? (
              <>
                <div style={{ backgroundColor: '#f0f9ff', padding: '12px 16px', borderRadius: '12px', border: '1px solid #bae6fd' }}>
                  <span style={{ fontSize: '0.85rem', color: '#0369a1', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>المنتج المحدد حالياً:</span>
                  <strong style={{ fontSize: '1.05rem', color: '#0c4a6e' }}>{selectedProduct.name}</strong>
                  <div style={{ display: 'flex', gap: '15px', marginTop: '6px', fontSize: '0.85rem', color: '#0284c7' }}>
                    <span>السعر: {toArabicNum(selectedProduct.price)} ج.م</span>
                    <span>الكمية: {toArabicNum(nInt(selectedProduct.inventory?.totalQuantity, 0))} قطع</span>
                  </div>
                </div>

                <div className="ai-mkt-section-card">
                  <label className="ai-mkt-section-label">
                    <Users size={16} color="#475569" />
                    الجمهور المستهدف (لتوجيه النبرة)
                  </label>
                  <select
                    className="ai-mkt-category-select"
                    style={{ marginBottom: 0 }}
                    value={targetCustomerType}
                    onChange={e => setTargetCustomerType(e.target.value)}
                  >
                    <option value="جميع العملاء">جميع العملاء (عام ومتوازن)</option>
                    <option value="عملاء القطاعي (عادي)">عملاء القطاعي (عادي — نبرة ودية وقصيرة)</option>
                    <option value="عملاء الجملة (تاجر جملة)">عملاء الجملة (تجار جملة — صياغة تجارية وعروض كميات)</option>
                    <option value="عملاء VIP">عملاء VIP (نبرة ترحيبية راقية وحصرية)</option>
                  </select>
                </div>

                <div className="ai-mkt-section-card">
                  <label className="ai-mkt-section-label">
                    <MessageSquare size={16} color="#475569" />
                    تعليمات مخصصة إضافية للذكاء الاصطناعي
                  </label>
                  <textarea
                    className="ai-mkt-textarea"
                    placeholder="مثال: ركز على جودة الخامات المصرية، أو أضف عرض خصم ١٠٪ لفترة محدودة، أو حدد الألوان المتوفرة..."
                    value={customPrompt}
                    onChange={e => setCustomPrompt(e.target.value)}
                  />
                </div>

                <button 
                  className="ai-mkt-generate-btn"
                  onClick={handleGenerate}
                  disabled={generating}
                >
                  {generating ? (
                    <>
                      <RefreshCw size={18} className="loading" />
                      <span>جاري الصياغة السحرية...</span>
                    </>
                  ) : (
                    <>
                      <span>🪄 توليد النص التسويقي بالـ AI</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: '15px', padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: '50px' }}>📢</div>
                <h3>لم يتم تحديد منتج بعد</h3>
                <p style={{ maxWidth: '280px', fontSize: '0.9rem' }}>الرجاء تحديد منتج من القائمة الجانبية ليقوم الذكاء الاصطناعي بقراءة تفاصيله وصياغة رسالة إعلانية باهرة وموجهة لعملائك.</p>
              </div>
            )}
          </div>

          {/* Workspace Right: Message Preview & Send */}
          <div className="ai-mkt-workspace-pane">
            <h2 className="ai-mkt-pane-title">
              <Send size={20} color="#10b981" />
              مراجعة وإطلاق الحملة
            </h2>

            {/* Simulated Chat view */}
            <div className="ai-mkt-wa-window">
              {generatedMessage ? (
                isEditing ? (
                  <textarea 
                    className="ai-mkt-wa-editor"
                    value={generatedMessage}
                    onChange={e => setGeneratedMessage(e.target.value)}
                  />
                ) : (
                  <div className="ai-mkt-wa-bubble">
                    {generatedMessage}
                    <div className="ai-mkt-wa-time">
                      <span>{new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span>✔️✔️</span>
                    </div>
                  </div>
                )
              ) : (
                <div style={{ alignSelf: 'center', margin: 'auto', textAlign: 'center', color: '#64748b', fontSize: '0.9rem', backgroundColor: 'rgba(255,255,255,0.9)', padding: '15px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                  الرسالة المنسقة ستظهر هنا كمعاينة حية فور توليدها ✨
                </div>
              )}
            </div>

            {generatedMessage && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button 
                  style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', background: 'white', fontWeight: 'bold', fontSize: '0.85rem' }}
                  onClick={() => setIsEditing(!isEditing)}
                >
                  {isEditing ? '💾 حفظ التعديل والمعاينة' : '✏️ تعديل نص الرسالة'}
                </button>
              </div>
            )}

            {generatedMessage && (
              <div className="ai-mkt-launch-panel">
                <div className="ai-mkt-tabs">
                  <button className={`ai-mkt-tab ${sendingMode === 'group' ? 'active' : ''}`} onClick={() => setSendingMode('group')}>
                    <Users size={16} /> مجموعات واتساب
                  </button>
                  <button className={`ai-mkt-tab ${sendingMode === 'customers' ? 'active' : ''}`} onClick={() => setSendingMode('customers')}>
                    <Users size={16} /> فئات العملاء (ERP)
                  </button>
                  <button className={`ai-mkt-tab ${sendingMode === 'manual' ? 'active' : ''}`} onClick={() => setSendingMode('manual')}>
                    <PhoneCall size={16} /> أرقام مخصصة
                  </button>
                </div>

                <div className="ai-mkt-tab-content">
                  {sendingMode === 'group' && (
                    <>
                      <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#475569' }}>اختر مجموعة الواتساب المستهدفة:</label>
                      {groups.length === 0 ? (
                        <div style={{ padding: '10px', backgroundColor: '#fff7ed', border: '1px solid #ffedd5', color: '#c2410c', borderRadius: '8px', fontSize: '0.85rem' }}>
                          ⚠️ لم يتم العثور على أي مجموعات في حساب الواتساب المتصل. تأكد من ربط حساب نشط يحتوي على مجموعات.
                        </div>
                      ) : (
                        <select 
                          className="ai-mkt-category-select"
                          value={selectedGroup}
                          onChange={e => setSelectedGroup(e.target.value)}
                        >
                          <option value="">-- اختر المجموعة --</option>
                          {groups.map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>
                      )}
                    </>
                  )}

                  {sendingMode === 'customers' && (
                    <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '10px', fontSize: '0.9rem', color: '#166534' }}>
                      سيتم سحب جميع أرقام هواتف العملاء المسجلين في فئة <strong>({targetCustomerType})</strong> وإرسال الرسالة التسويقية إليهم بشكل متتابع آمن للحفاظ على أمان رقمك.
                    </div>
                  )}

                  {sendingMode === 'manual' && (
                    <>
                      <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#475569' }}>أدخل الأرقام يدوياً (افصل بفاصلة أو سطر جديد):</label>
                      <textarea
                        className="ai-mkt-textarea"
                        placeholder="مثال: 01012345678, 01234567890"
                        value={manualNumbers}
                        onChange={e => setManualNumbers(e.target.value)}
                      />
                    </>
                  )}

                  {sendResult && (
                    <div style={{
                      padding: '12px',
                      borderRadius: '10px',
                      backgroundColor: sendResult.success ? '#ecfdf5' : '#fef2f2',
                      border: `1px solid ${sendResult.success ? '#a7f3d0' : '#fecaca'}`,
                      color: sendResult.success ? '#065f46' : '#991b1b',
                      fontSize: '0.9rem',
                      fontWeight: 'bold'
                    }}>
                      {sendResult.success ? `✅ ${sendResult.message}` : `❌ فشل الإرسال: ${sendResult.error}`}
                    </div>
                  )}

                  <button
                    className="ai-mkt-send-btn"
                    disabled={sending || !waStatus.isConnected}
                    onClick={handleSend}
                  >
                    {sending ? (
                      <>
                        <RefreshCw size={18} className="loading" />
                        <span>جاري إرسال الحملة...</span>
                      </>
                    ) : (
                      <>
                        <span>🚀 إطلاق وإرسال حملة واتساب</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Progress Overlay */}
      {sending && bulkProgress && (
        <div className="ai-mkt-overlay">
          <div className="ai-mkt-progress-modal">
            <h3 style={{ marginBottom: '10px' }}>📤 جاري إرسال الحملة التسويقية...</h3>
            <p style={{ fontSize: '0.9rem', color: '#64748b' }}>يرجى عدم إغلاق هذه النافذة أو التطبيق لضمان إرسال الرسائل بأمان لجميع العملاء.</p>
            
            <div className="ai-mkt-progress-bar-container">
              <div 
                className="ai-mkt-progress-bar-fill"
                style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
              />
            </div>

            <div style={{ fontWeight: 'bold', fontSize: '1.25rem', color: '#1e293b' }}>
              {toArabicNum(bulkProgress.current)} / {toArabicNum(bulkProgress.total)}
            </div>

            <div className="ai-mkt-progress-stats">
              <span className="ai-mkt-stat-ok">✅ {toArabicNum(bulkProgress.sentCount)} نجح</span>
              <span className="ai-mkt-stat-fail">❌ {toArabicNum(bulkProgress.failedCount)} فشل</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
