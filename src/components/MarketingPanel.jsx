import React, { useState, useEffect } from 'react';
import { Share2, Send, Users, RefreshCw, AlertCircle, CheckCircle2, Image as ImageIcon, MessageSquare, PlusCircle } from 'lucide-react';

export default function MarketingPanel({ product, onClose }) {
  const [status, setStatus] = useState({ isConnected: false, status: 'disconnected' });
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [preview, setPreview] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [sendWithImage, setSendWithImage] = useState(false);
  const [targetCustomerType, setTargetCustomerType] = useState('جميع العملاء');
  const [sendingMode, setSendingMode] = useState('group'); // 'group' or 'direct_customers'

  useEffect(() => {
    // التحقق من حالة الواتساب عند فتح المكون
    window.api.whatsappGetStatus().then((res) => {
      setStatus(res);
      if (res.isConnected) {
        loadGroups();
      }
    });

    const handleStatusChange = (newStatus) => {
      setStatus(newStatus);
      if (newStatus.isConnected) {
        loadGroups();
      }
    };

    window.api.onWhatsappStatusChanged(handleStatusChange);

    return () => {
      window.api.offWhatsappStatusChanged();
    };
  }, []);

  async function loadGroups() {
    const res = await window.api.aiMarketingGetGroups();
    if (res.success) {
      setGroups(res.groups);
    }
  }

  async function handleGenerate() {
    if (!product) return;
    setGenerating(true);
    setResult(null);
    try {
      const res = await window.api.aiMarketingGenerate({ product, customPrompt, targetCustomerType });
      if (res.success) {
        setPreview(res.message);
      } else {
        setResult({ success: false, error: 'فشل التوليد: ' + (res.error || 'خطأ غير معروف') });
      }
    } catch (err) {
      setResult({ success: false, error: err.message });
    }
    setGenerating(false);
  }

  async function handleSend() {
    if (sendingMode === 'group' && !selectedGroup) return alert('الرجاء اختيار مجموعة الواتساب');
    if (!preview) return alert('الرجاء توليد أو كتابة رسالة');
    
    setSending(true);
    setResult(null);

    try {
      let base64Image = null; 
      
      if (sendingMode === 'group') {
        const res = await window.api.aiMarketingSendToGroup({
          groupId: selectedGroup,
          message: preview,
          base64Image: base64Image
        });

        if (res.success) {
          setResult({ success: true, message: 'تم الإرسال بنجاح إلى المجموعة!' });
        } else {
          setResult({ success: false, error: res.error });
        }
      } else {
        // إرسال مباشر للعملاء من فئة معينة
        let dbType = 'all';
        if (targetCustomerType === 'عملاء القطاعي (عادي)') dbType = 'عادي';
        else if (targetCustomerType === 'عملاء الجملة (تاجر جملة)') dbType = 'تاجر جملة';
        else if (targetCustomerType === 'عملاء VIP') dbType = 'VIP';

        // جلب العملاء المسجلين
        const fetchRes = await window.api.getCustomers({
          page: 1,
          pageSize: 10000,
          searchTerm: '',
          customerType: dbType,
          city: '',
          sortCol: 'createdAt',
          sortDir: 'desc'
        });

        if (fetchRes?.error) {
          throw new Error('فشل جلب العملاء: ' + fetchRes.error);
        }

        const customerList = Array.isArray(fetchRes?.data) ? fetchRes.data : [];
        const numbers = customerList
          .map(c => String(c.phone || '').trim())
          .filter(phone => phone.length >= 7);

        if (numbers.length === 0) {
          setResult({ success: false, error: 'لا يوجد عملاء لديهم أرقام هواتف مسجلة في هذه الفئة.' });
          setSending(false);
          return;
        }

        const confirmSend = confirm(`سيتم إرسال الرسالة التسويقية إلى ${numbers.length} عميل بشكل فردي متتابع. هل ترغب في البدء؟`);
        if (!confirmSend) {
          setSending(false);
          return;
        }

        const res = await window.api.aiMarketingSendToNumbers({
          numbers,
          message: preview,
          base64Image: base64Image
        });

        if (res.success) {
          setResult({ 
            success: true, 
            message: `تم إرسال الحملة بنجاح! تم الإرسال لـ ${res.sentCount} عميل، وفشل ${res.failedCount} عميل.` 
          });
        } else {
          setResult({ success: false, error: res.error });
        }
      }
    } catch (err) {
      setResult({ success: false, error: err.message });
    }
    setSending(false);
  }

  return (
    <div className="marketing-panel" style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <Share2 size={24} color="#0ea5e9" />
          <h2 style={{ margin: 0, color: '#1e293b', fontSize: '1.25rem' }}>تسويق ذكي (AI)</h2>
        </div>
        {onClose && (
          <button onClick={onClose} style={styles.closeButton}>×</button>
        )}
      </div>

      <div style={styles.content}>
        {/* حالة الواتساب */}
        <div style={{ ...styles.statusCard, background: status.isConnected ? '#ecfdf5' : '#fef2f2', borderColor: status.isConnected ? '#a7f3d0' : '#fecaca' }}>
          {status.isConnected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669', fontWeight: 'bold' }}>
              <CheckCircle2 size={20} />
              واتساب متصل وجاهز للإرسال
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626', fontWeight: 'bold' }}>
              <AlertCircle size={20} />
              واتساب غير متصل. يرجى ربط الواتساب من شاشة الإعدادات.
            </div>
          )}
        </div>

        {product && (
          <div style={styles.productInfo}>
            <strong>المنتج:</strong> {product.name} — {product.price} ج.م
          </div>
        )}

        <div style={styles.formGroup}>
          <label style={styles.label}><Users size={16} /> فئة العملاء المستهدفة (لصياغة الـ AI):</label>
          <select
            style={styles.select}
            value={targetCustomerType}
            onChange={(e) => setTargetCustomerType(e.target.value)}
          >
            <option value="جميع العملاء">جميع العملاء</option>
            <option value="عملاء القطاعي (عادي)">عملاء القطاعي (عادي)</option>
            <option value="عملاء الجملة (تاجر جملة)">عملاء الجملة (تاجر جملة)</option>
            <option value="عملاء VIP">عملاء VIP</option>
          </select>
        </div>

        {status.isConnected && (
          <>
            <div style={styles.formGroup}>
              <label style={styles.label}><Send size={16} /> طريقة الإرسال المستهدفة:</label>
              <div style={{ display: 'flex', gap: '20px', marginTop: '4px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.95rem', color: '#334155' }}>
                  <input
                    type="radio"
                    name="sendingMode"
                    value="group"
                    checked={sendingMode === 'group'}
                    onChange={() => setSendingMode('group')}
                  />
                  مجموعة واتساب
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.95rem', color: '#334155' }}>
                  <input
                    type="radio"
                    name="sendingMode"
                    value="direct_customers"
                    checked={sendingMode === 'direct_customers'}
                    onChange={() => setSendingMode('direct_customers')}
                  />
                  إرسال مباشر للعملاء
                </label>
              </div>
            </div>

            {sendingMode === 'group' ? (
              <div style={styles.formGroup}>
                <label style={styles.label}><Users size={16} /> إختر المجموعة المستهدفة:</label>
                <select
                  style={styles.select}
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                >
                  <option value="">-- اختر مجموعة --</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <div style={styles.refreshGroups} onClick={loadGroups}>
                  <RefreshCw size={14} /> تحديث القائمة
                </div>
              </div>
            ) : (
              <div style={{ ...styles.statusCard, background: '#f0f9ff', borderColor: '#bae6fd', color: '#0369a1', fontSize: '0.9rem' }}>
                ℹ️ سيتم إرسال الرسالة إلى جميع جهات الاتصال المسجلة في النظام والتي تنتمي للفئة المحددة أعلاه تلقائياً وبأمان.
              </div>
            )}
          </>
        )}

        <div style={styles.formGroup}>
          <label style={styles.label}><MessageSquare size={16} /> نص الرسالة:</label>
          <textarea
            style={styles.textarea}
            value={preview}
            onChange={(e) => setPreview(e.target.value)}
            placeholder="اضغط على توليد بالذكاء الاصطناعي لكتابة الرسالة، أو اكتبها بنفسك هنا..."
            rows={6}
          />
        </div>

        {/* عرض النتائج والأخطاء */}
        {result && (
          <div style={{ ...styles.result, background: result.success ? '#ecfdf5' : '#fef2f2', color: result.success ? '#059669' : '#dc2626' }}>
            {result.success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            {result.success ? result.message : result.error}
          </div>
        )}

        <div style={styles.actions}>
          <button 
            style={{ ...styles.button, ...styles.generateBtn }} 
            onClick={handleGenerate} 
            disabled={generating || !product}
          >
            {generating ? <RefreshCw size={18} className="spin" /> : <PlusCircle size={18} />}
            {generating ? 'جاري التفكير...' : 'توليد بالذكاء الاصطناعي 🪄'}
          </button>

          <button 
            style={{ 
              ...styles.button, 
              ...styles.sendBtn, 
              opacity: (!status.isConnected || (sendingMode === 'group' && !selectedGroup) || !preview || sending) ? 0.6 : 1 
            }} 
            onClick={handleSend}
            disabled={!status.isConnected || (sendingMode === 'group' && !selectedGroup) || !preview || sending}
          >
            {sending ? <RefreshCw size={18} className="spin" /> : <Send size={18} />}
            {sending ? 'جاري الإرسال...' : 'إرسال الحملة'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    background: '#ffffff',
    borderRadius: '16px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
    width: '100%',
    maxWidth: '500px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "'Cairo', sans-serif",
    border: '1px solid #e2e8f0',
    overflow: 'hidden'
  },
  header: {
    background: '#f8fafc',
    padding: '16px 20px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  closeButton: {
    background: 'transparent',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#64748b'
  },
  content: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  statusCard: {
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid',
    fontSize: '0.95rem'
  },
  productInfo: {
    background: '#f1f5f9',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '0.95rem',
    color: '#334155'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontWeight: 'bold',
    color: '#475569',
    fontSize: '0.95rem'
  },
  select: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '1rem',
    outline: 'none',
    width: '100%',
    fontFamily: 'inherit'
  },
  refreshGroups: {
    fontSize: '0.85rem',
    color: '#0ea5e9',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    alignSelf: 'flex-start'
  },
  textarea: {
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '1rem',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
    lineHeight: '1.5'
  },
  actions: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px'
  },
  button: {
    flex: 1,
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    fontWeight: 'bold',
    fontSize: '1rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'all 0.2s',
    fontFamily: 'inherit'
  },
  generateBtn: {
    background: '#f8fafc',
    color: '#0ea5e9',
    border: '1px solid #0ea5e9'
  },
  sendBtn: {
    background: '#10b981',
    color: '#ffffff'
  },
  result: {
    padding: '10px 14px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.95rem',
    fontWeight: 'bold'
  }
};
