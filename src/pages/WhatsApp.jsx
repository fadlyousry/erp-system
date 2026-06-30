import { useState, useEffect, useCallback, useMemo } from 'react';
import CustomerLedger from './CustomerLedger';
import ModernConfirmModal from '../components/ModernConfirmModal';
import './WhatsApp.css';

const TEMPLATES = [
    {
        id: 'friendly',
        name: 'تذكير ودي (افتراضي)',
        text: `السلام عليكم {اسم_العميل}،

نود تذكيركم بأن لديكم مبلغ مستحق قدره {المبلغ} ج.م.
آخر دفعة كانت بتاريخ: {تاريخ_آخر_دفعة}.

نرجو التكرم بسداد المبلغ في أقرب وقت.
شكراً لتعاملكم معنا 🙏`
    },
    {
        id: 'formal',
        name: 'إشعار رسمي (تأخير)',
        text: `السيد/ة {اسم_العميل} المحترم،

تحية طيبة وبعد،
يرجى العلم بأنه قد استحقت عليكم مديونية بقيمة {المبلغ} ج.م ولم يتم السداد منذ آخر دفعة بتاريخ {تاريخ_آخر_دفعة}.
برجاء سرعة المبادرة بتسوية الرصيد لتجنب إيقاف الخدمة أو التعامل.

للتواصل والاستفسار يرجى الرد على هذه الرسالة.`
    },
    {
        id: 'short',
        name: 'رسالة قصيرة',
        text: `مرحباً {اسم_العميل}،
برجاء سداد الرصيد المستحق ({المبلغ} ج.م).
شكراً لك.`
    }
];

const DEFAULT_MESSAGE = TEMPLATES[0].text;


const OVERDUE_OPTIONS = [
    { value: '7', label: '7 أيام' },
    { value: '14', label: '14 يوم' },
    { value: '30', label: '30 يوم' },
    { value: '60', label: '60 يوم' },
    { value: '90', label: '90 يوم' },
    { value: 'all', label: 'الكل' }
];

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
                maxWidth: "400px",
                fontSize: "14px",
            }}
        >
            <span style={{ fontSize: "20px" }}>{icon}</span>
            <span>{message}</span>
        </div>
    );
};

const toArabicNum = (num) => {
    if (num == null) return '';
    return String(num).replace(/[0-9]/g, w => ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'][+w]);
};

export default function WhatsApp() {
    const [activeTab, setActiveTab] = useState('overdue'); // overdue, messages, invoices, connection
    
    // Connection
    const [connectionStatus, setConnectionStatus] = useState('disconnected');
    const [qrDataUrl, setQrDataUrl] = useState(null);
    const [connecting, setConnecting] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [showBulkConfirm, setShowBulkConfirm] = useState(false);

    // Ledger
    const [showCustomerLedger, setShowCustomerLedger] = useState(null);

    // Customers
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 50;

    // Filters
    const [overdueDays, setOverdueDays] = useState('30');
    const [minBalance, setMinBalance] = useState('');
    const [searchText, setSearchText] = useState('');

    // Message
    const [messageTemplate, setMessageTemplate] = useState(DEFAULT_MESSAGE);

    // Bulk send
    const [sending, setSending] = useState(false);
    const [bulkProgress, setBulkProgress] = useState(null);
    const [results, setResults] = useState(null);

    // Invoice
    const [invoiceModal, setInvoiceModal] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [loadingInvoices, setLoadingInvoices] = useState(false);
    const [sendingInvoice, setSendingInvoice] = useState(false);
    const [invoiceCustomerSearch, setInvoiceCustomerSearch] = useState('');

    const [toast, setToast] = useState(null);
    const showToast = (message, type = 'info') => setToast({ message, type });

    const api = window.api;
    const isConnected = connectionStatus === 'connected';

    // ── Status on mount ──
    useEffect(() => {
        api.whatsappGetStatus().then(s => {
            setConnectionStatus(s.status || 'disconnected');
            if (s.qrDataUrl) setQrDataUrl(s.qrDataUrl);
        }).catch(() => {});
    }, []);

    // ── IPC listeners ──
    useEffect(() => {
        api.onWhatsappQR((qr) => { setQrDataUrl(qr); setConnectionStatus('qr_pending'); setConnecting(false); });
        api.onWhatsappReady(() => { setConnectionStatus('connected'); setQrDataUrl(null); setConnecting(false); });
        api.onWhatsappDisconnected(() => { setConnectionStatus('disconnected'); setQrDataUrl(null); });
        api.onWhatsappBulkProgress((data) => setBulkProgress(data));
        return () => { api.offWhatsappQR(); api.offWhatsappReady(); api.offWhatsappDisconnected(); api.offWhatsappBulkProgress(); };
    }, []);

    // ── Load customers ──
    const loadCustomers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.whatsappGetOverdueCustomers({ overdueDays, minBalance });
            setCustomers(res?.data || []);
            setSelectedIds(new Set());
        } catch { setCustomers([]); }
        setLoading(false);
    }, [overdueDays, minBalance]);

    useEffect(() => { loadCustomers(); }, [loadCustomers]);

    // ── Connect / Disconnect ──
    const handleConnect = async () => {
        setConnecting(true); setConnectionStatus('connecting');
        try { await api.whatsappInitialize(); }
        catch { setConnecting(false); setConnectionStatus('disconnected'); }
    };
    const handleDisconnect = async () => {
        await api.whatsappDisconnect();
        setConnectionStatus('disconnected'); setQrDataUrl(null);
    };
    const handleReset = () => {
        setShowResetConfirm(true);
    };

    const confirmReset = async () => {
        setShowResetConfirm(false);
        setConnecting(true); setConnectionStatus('connecting'); setQrDataUrl(null);
        try { await api.whatsappReset(); }
        catch { setConnecting(false); setConnectionStatus('disconnected'); }
    };

    // ── Filter (memoized) ──
    const filtered = useMemo(() => {
        if (!searchText.trim()) return customers;
        const q = searchText.trim().toLowerCase();
        return customers.filter(c =>
            (c.name || '').toLowerCase().includes(q) ||
            (c.phone || '').includes(q) ||
            (c.city || '').toLowerCase().includes(q)
        );
    }, [customers, searchText]);

    // Reset page when filters change
    useEffect(() => { setCurrentPage(1); }, [searchText, overdueDays, minBalance]);

    // ── Selection (only customers with phone) ──
    const phoneCustomers = useMemo(() => filtered.filter(c => c.hasPhone), [filtered]);
    const toggleSelect = (id) => {
        setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    };
    const toggleAllPhone = () => {
        if (selectedIds.size === phoneCustomers.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(phoneCustomers.map(c => c.id)));
    };

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pagedCustomers = useMemo(() => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [filtered, currentPage]);
    const phonePages = Math.max(1, Math.ceil(phoneCustomers.length / PAGE_SIZE));
    const pagedPhoneCustomers = useMemo(() => phoneCustomers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [phoneCustomers, currentPage]);

    // ── Send single ──
    const handleSendSingle = async (customer) => {
        if (!isConnected) return showToast('واتساب غير متصل!', 'error');
        if (!messageTemplate.trim()) return showToast('اكتب نص الرسالة أولاً', 'warning');
        const msg = buildMessage(customer);
        const phone = customer.phone || customer.phone2;
        const res = await api.whatsappSendMessage({ customerId: customer.id, customerName: customer.name, phoneNumber: phone, message: msg });
        if (res?.success) showToast(`تم الإرسال لـ ${customer.name}`, 'success');
        else showToast(`فشل: ${res?.error || 'خطأ'}`, 'error');
    };

    // ── Send bulk ──
    const handleSendBulk = async () => {
        if (!isConnected) return showToast('واتساب غير متصل!', 'error');
        if (!messageTemplate.trim()) return showToast('اكتب نص الرسالة', 'warning');
        const selected = phoneCustomers.filter(c => selectedIds.has(c.id));
        if (selected.length === 0) return showToast('حدد عملاء أولاً', 'warning');
        setShowBulkConfirm(true);
    };

    const confirmSendBulk = async () => {
        setShowBulkConfirm(false);
        const selected = phoneCustomers.filter(c => selectedIds.has(c.id));
        setSending(true); setBulkProgress(null);
        try { const res = await api.whatsappSendBulk({ customers: selected, messageTemplate }); setResults(res); }
        catch (err) { showToast('خطأ: ' + err.message, 'error'); }
        setSending(false); setBulkProgress(null);
    };

    // ── Invoice modal ──
    const openInvoiceModal = async (customer) => {
        setInvoiceModal(customer); setLoadingInvoices(true);
        try { const res = await api.whatsappGetCustomerInvoices(customer.id); setInvoices(res?.data || []); }
        catch { setInvoices([]); }
        setLoadingInvoices(false);
    };
    const sendInvoiceImage = async (docId, docType) => {
        if (!isConnected) return showToast('واتساب غير متصل!', 'error');
        setSendingInvoice(true);
        const phone = invoiceModal.phone || invoiceModal.phone2;
        try {
            const res = await api.whatsappSendInvoiceImage({ docId, docType, phoneNumber: phone, customerName: invoiceModal.name });
            if (res?.success) showToast('تم الإرسال بنجاح', 'success');
            else showToast(res?.error || 'فشل الإرسال', 'error');
            if (res?.success) setInvoiceModal(null);
        } catch (err) { showToast('خطأ: ' + err.message, 'error'); }
        setSendingInvoice(false);
    };

    // ── Helpers ──
    const buildMessage = (customer) => {
        const balance = typeof customer.balance === 'number' ? customer.balance.toFixed(2) : String(customer.balance || 0);
        let lastPay = 'لا يوجد';
        if (customer.lastPaymentDate) {
            try { const d = new Date(customer.lastPaymentDate); if (!isNaN(d.getTime())) lastPay = d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }); } catch {}
        }
        return messageTemplate.replace(/\{اسم_العميل\}/g, customer.name || '').replace(/\{المبلغ\}/g, balance).replace(/\{تاريخ_آخر_دفعة\}/g, lastPay);
    };

    const daysSince = (date) => {
        if (!date) return '—';
        const d = new Date(date);
        return isNaN(d.getTime()) ? '—' : Math.ceil((Date.now() - d.getTime()) / 86400000);
    };

    const daysBadgeClass = (days) => {
        if (days === '—') return '';
        const d = parseInt(days);
        if (d > 60) return 'critical';
        if (d > 30) return 'overdue';
        return 'ok';
    };

    const totalBalance = filtered.reduce((s, c) => s + (c.balance || 0), 0);
    const withPhone = phoneCustomers;
    const withoutPhone = useMemo(() => filtered.filter(c => !c.hasPhone), [filtered]);
    const critical = useMemo(() => filtered.filter(c => { const d = daysSince(c.lastPaymentDate); return d !== '—' && parseInt(d) > 60; }), [filtered]);

    // ── Invoice tab customer search ──
    const invoiceCustomers = customers.filter(c => {
        if (!c.hasPhone) return false;
        if (!invoiceCustomerSearch.trim()) return true;
        const q = invoiceCustomerSearch.trim().toLowerCase();
        return (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q);
    });

    return (
        <div className="wa-page">
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
            {/* ── Alert Bar ── */}
            {critical.length > 0 && (
                <div className="wa-alert-bar">
                    <span className="wa-alert-icon">🚨</span>
                    <span><strong>{toArabicNum(critical.length)}</strong> عميل متأخر أكثر من {toArabicNum(60)} يوم — إجمالي المعرض للخطر: <strong>{toArabicNum(critical.reduce((s, c) => s + (c.balance || 0), 0).toFixed(0))} ج.م</strong></span>
                    <span className="wa-alert-sub">{withoutPhone.length > 0 && `• ${toArabicNum(withoutPhone.length)} بدون رقم هاتف`}</span>
                </div>
            )}

            {/* ── Stats ── */}
            <div className="wa-stats">
                <div className="wa-stat-card"><span className="wa-stat-value">{toArabicNum(filtered.length)}</span><span className="wa-stat-label">إجمالي المتأخرين</span></div>
                <div className="wa-stat-card"><span className="wa-stat-value">{toArabicNum(totalBalance.toFixed(0))}<small> ج.م</small></span><span className="wa-stat-label">إجمالي المستحقات</span></div>
                <div className="wa-stat-card"><span className="wa-stat-value">{toArabicNum(withPhone.length)}</span><span className="wa-stat-label">لديهم هاتف</span></div>
                <div className="wa-stat-card"><span className={`wa-stat-value ${isConnected ? 'text-green' : 'text-red'}`}>{isConnected ? 'متصل' : 'غير متصل'}</span><span className="wa-stat-label">حالة واتساب</span></div>
            </div>

            {/* ── Tabs ── */}
            <div className="wa-tabs">
                <button className={`wa-tab ${activeTab === 'connection' ? 'active' : ''}`} onClick={() => setActiveTab('connection')}>📱 حالة الاتصال</button>
                <button className={`wa-tab ${activeTab === 'overdue' ? 'active' : ''}`} onClick={() => setActiveTab('overdue')}>📋 العملاء المتأخرين</button>
                <button className={`wa-tab ${activeTab === 'messages' ? 'active' : ''}`} onClick={() => setActiveTab('messages')}>💬 إرسال رسائل</button>
                <button className={`wa-tab ${activeTab === 'invoices' ? 'active' : ''}`} onClick={() => setActiveTab('invoices')}>🧾 إرسال فواتير</button>
            </div>

            {/* ═══ TAB: Connection ═══ */}
            {activeTab === 'connection' && (
                <div className="wa-tab-content">
                    <div className="wa-connection-page">
                        <div className={`wa-conn-status-icon ${connectionStatus}`}>
                            {connectionStatus === 'connected' && '✅'}
                            {connectionStatus === 'qr_pending' && '📱'}
                            {connectionStatus === 'connecting' && '⏳'}
                            {connectionStatus === 'disconnected' && '❌'}
                        </div>
                        <h2>{connectionStatus === 'connected' ? 'واتساب متصل ويعمل بنجاح' : connectionStatus === 'qr_pending' ? 'امسح الكود لربط الجهاز' : connectionStatus === 'connecting' ? 'جاري الاتصال...' : 'واتساب غير متصل'}</h2>
                        <p>{connectionStatus === 'connected' ? 'النظام جاهز الآن لإرسال الرسائل والفواتير للعملاء أوتوماتيكياً. يمكنك البدء في استخدام الخدمات من التابات المجاورة.' : connectionStatus === 'qr_pending' ? 'افتح تطبيق واتساب على هاتفك، اذهب إلى الأجهزة المرتبطة (Linked Devices)، ثم اضغط على ربط جهاز (Link a Device) وامسح الكود التالي.' : connectionStatus === 'connecting' ? 'يرجى الانتظار بينما يتم تجهيز خوادم واتساب للاتصال.' : 'يجب ربط حساب واتساب الخاص بك لتتمكن من إرسال الإشعارات للعملاء.'}</p>
                        
                        {connectionStatus === 'qr_pending' && qrDataUrl && (
                            <div className="wa-qr-container">
                                <img src={qrDataUrl} alt="WhatsApp QR Code" />
                            </div>
                        )}
                        
                        <div className="wa-conn-actions" style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '20px' }}>
                            {/* Connect Button - Shown when disconnected or stuck */}
                            {(connectionStatus === 'disconnected' || connectionStatus === 'qr_pending' || connectionStatus === 'connecting') && !connecting && (
                                <button className="wa-btn wa-btn-connect" onClick={handleConnect} style={{ backgroundColor: '#2563eb', color: 'white', padding: '12px 24px', borderRadius: '10px', fontWeight: 'bold', border: 'none', cursor: 'pointer', boxShadow: '0 4px 6px rgba(37, 99, 235, 0.2)' }}>
                                    🔗 ربط حساب جديد
                                </button>
                            )}
                            
                            {/* Loading State */}
                            {connecting && (
                                <button className="wa-btn wa-btn-connect" disabled style={{ backgroundColor: '#94a3b8', color: 'white', padding: '12px 24px', borderRadius: '10px', fontWeight: 'bold', border: 'none', cursor: 'not-allowed' }}>
                                    ⏳ جاري التجهيز...
                                </button>
                            )}
                            
                            {/* Reset Button - ALWAYS shown if not connected to allow clearing stuck states */}
                            {!isConnected && (
                                <button 
                                    className="wa-btn wa-btn-reset" 
                                    onClick={handleReset} 
                                    title="امسح الجلسة وابدأ من جديد"
                                    style={{ backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fee2e2', padding: '12px 24px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}
                                >
                                    ♻️ إعادة تعيين الاتصال
                                </button>
                            )}
                            
                            {/* Disconnect Button - Shown only when connected */}
                            {isConnected && (
                                <button className="wa-btn wa-btn-disconnect" onClick={handleDisconnect} style={{ backgroundColor: '#ef4444', color: 'white', padding: '12px 24px', borderRadius: '10px', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>
                                    ⛓️‍💥 فصل الحساب الحالي
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ TAB: Overdue Customers ═══ */}
            {activeTab === 'overdue' && (
                <div className="wa-tab-content">
                    <div className="wa-filters">
                        <select value={overdueDays} onChange={e => setOverdueDays(e.target.value)}>
                            {OVERDUE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <input type="number" placeholder="أقل مبلغ..." value={minBalance} onChange={e => setMinBalance(e.target.value)} />
                        <input type="text" placeholder="بحث بالاسم أو الرقم..." value={searchText} onChange={e => setSearchText(e.target.value)} className="wa-search" />
                        <button className="wa-btn wa-btn-refresh" onClick={loadCustomers} disabled={loading}>{loading ? '⏳' : '🔄'} تحديث</button>
                    </div>
                    <div className="wa-table-wrap">
                        <table className="wa-table">
                            <thead>
                                <tr>
                                    <th>العميل</th>
                                    <th>الهاتف</th>
                                    <th>الرصيد</th>
                                    <th>آخر دفع</th>
                                    <th>مبلغ الدفع</th>
                                    <th>أيام التأخر</th>
                                    <th>نوع الدفع</th>
                                    <th>المدينة</th>
                                    <th>إجراءات</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? <tr><td colSpan="9" className="wa-empty">جاري التحميل...</td></tr>
                                : filtered.length === 0 ? <tr><td colSpan="9" className="wa-empty">لا يوجد عملاء متأخرين</td></tr>
                                : pagedCustomers.map(c => {
                                    const days = daysSince(c.lastPaymentDate);
                                    return (
                                    <tr key={c.id} className={!c.hasPhone ? 'no-phone' : ''}>
                                        <td><div className="wa-customer-name">
                                            {c.name}
                                            {c.whatsappLogCount > 0 && (
                                                <span className="wa-log-badge" title={`${c.whatsappLogCount} رسالة مرسلة`}>
                                                    🔔 {toArabicNum(c.whatsappLogCount)}
                                                </span>
                                            )}
                                        </div></td>
                                        <td className={c.hasPhone ? '' : 'wa-no-phone'}>
                                            {c.hasPhone ? toArabicNum(c.phone || c.phone2) : <span>لا يوجد رقم</span>}
                                        </td>
                                        <td className="wa-balance">{toArabicNum(Number(c.balance || 0).toFixed(2))}</td>
                                        <td className="wa-date">{toArabicNum(c.lastPaymentDate ? new Date(c.lastPaymentDate).toLocaleDateString('ar-EG') : '—')}</td>
                                        <td className="wa-amount">{toArabicNum(c.lastPaymentAmount ? Number(c.lastPaymentAmount).toFixed(2) : '0.00')}</td>
                                        <td><span className={`wa-days-badge ${daysBadgeClass(days)}`}>{toArabicNum(days)}</span></td>
                                        <td className="wa-type">{c.lastPaymentType || '—'}</td>
                                        <td className="wa-city">{c.city || '—'}</td>
                                        <td className="wa-actions">
                                            <button 
                                                className="wa-action-btn ledger" 
                                                onClick={() => setShowCustomerLedger(c.id)} 
                                                title="عرض كشف الحساب"
                                            >
                                                👁️
                                            </button>
                                            {c.hasPhone ? (
                                                <button 
                                                    className="wa-action-btn whatsapp" 
                                                    onClick={() => handleSendSingle(c)} 
                                                    disabled={!isConnected} 
                                                    title="إرسال تذكير واتساب"
                                                >
                                                    📲
                                                </button>
                                            ) : (
                                                <span className="wa-no-phone-icon" title="لا يوجد رقم مسجل">🚫</span>
                                            )}
                                        </td>
                                    </tr>);
                                })}
                            </tbody>
                        </table>
                    </div>
                    {totalPages > 1 && (
                        <div className="wa-pagination">
                            <button disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>← السابق</button>
                            <span>صفحة {toArabicNum(currentPage)} من {toArabicNum(totalPages)} ({toArabicNum(filtered.length)} عميل)</span>
                            <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>التالي →</button>
                        </div>
                    )}
                </div>
            )}

            {/* ═══ TAB: Messages ═══ */}
            {activeTab === 'messages' && (
                <div className="wa-tab-content">
                    <div className="wa-main">
                        <div className="wa-table-section">
                            <div className="wa-filters">
                                <input type="text" placeholder="بحث بالاسم أو الرقم..." value={searchText} onChange={e => setSearchText(e.target.value)} className="wa-search" />
                            </div>
                            <div className="wa-table-wrap">
                                <table className="wa-table">
                                    <thead>
                                        <tr>
                                            <th><input type="checkbox" checked={phoneCustomers.length > 0 && selectedIds.size === phoneCustomers.length} onChange={toggleAllPhone} /></th>
                                            <th>العميل</th>
                                            <th>الرصيد</th>
                                            <th>آخر دفع</th>
                                            <th>أيام</th>
                                            <th>إرسال</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {phoneCustomers.length === 0 ? <tr><td colSpan="6" className="wa-empty">لا يوجد عملاء بأرقام هاتف</td></tr>
                                        : pagedPhoneCustomers.map(c => (
                                            <tr key={c.id} className={selectedIds.has(c.id) ? 'selected' : ''}>
                                                <td><input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} /></td>
                                                <td><div className="wa-customer-name">{c.name}</div><div className="wa-customer-phone">{toArabicNum(c.phone || c.phone2)}</div></td>
                                                <td className="wa-balance">{toArabicNum(Number(c.balance || 0).toFixed(2))}</td>
                                                <td className="wa-date">{toArabicNum(c.lastPaymentDate ? new Date(c.lastPaymentDate).toLocaleDateString('ar-EG') : '—')}</td>
                                                <td><span className={`wa-days-badge ${daysBadgeClass(daysSince(c.lastPaymentDate))}`}>{toArabicNum(daysSince(c.lastPaymentDate))}</span></td>
                                                <td><button className="wa-icon-btn" onClick={() => handleSendSingle(c)} disabled={!isConnected} title="إرسال">💬</button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {selectedIds.size > 0 && (
                                <div className="wa-bulk-bar">
                                    <span>تم تحديد {toArabicNum(selectedIds.size)} عميل</span>
                                    <button className="wa-btn wa-btn-send" onClick={handleSendBulk} disabled={sending || !isConnected}>
                                        {sending ? '⏳ جاري...' : `📤 إرسال جماعي (${toArabicNum(selectedIds.size)})`}
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="wa-message-section">
                            <h3>📝 قالب الرسالة</h3>
                            <select 
                                className="wa-template-selector" 
                                onChange={(e) => {
                                    const selected = TEMPLATES.find(t => t.id === e.target.value);
                                    if (selected) setMessageTemplate(selected.text);
                                }}
                            >
                                <option value="" disabled>-- اختر قالب جاهز --</option>
                                {TEMPLATES.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                            <div className="wa-vars">
                                <span className="wa-var" onClick={() => setMessageTemplate(p => p + '{اسم_العميل}')}>اسم العميل</span>
                                <span className="wa-var" onClick={() => setMessageTemplate(p => p + '{المبلغ}')}>المبلغ</span>
                                <span className="wa-var" onClick={() => setMessageTemplate(p => p + '{تاريخ_آخر_دفعة}')}>تاريخ آخر دفعة</span>
                            </div>
                            <textarea value={messageTemplate} onChange={e => setMessageTemplate(e.target.value)} rows={10} placeholder="اكتب نص الرسالة..." />
                            <div className="wa-preview"><h4>معاينة:</h4><div className="wa-preview-bubble">{customers[0] ? buildMessage(customers[0]) : messageTemplate}</div></div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ TAB: Invoices ═══ */}
            {activeTab === 'invoices' && (
                <div className="wa-tab-content">
                    <div className="wa-invoice-search-section">
                        <h3>🧾 اختر عميل لإرسال فاتورته</h3>
                        <input type="text" placeholder="ابحث عن عميل بالاسم أو الرقم..." value={invoiceCustomerSearch} onChange={e => setInvoiceCustomerSearch(e.target.value)} className="wa-invoice-search" />
                    </div>
                    <div className="wa-invoice-customers-grid">
                        {invoiceCustomers.length === 0 ? <p className="wa-empty-text">لا يوجد عملاء</p>
                        : invoiceCustomers.slice(0, 50).map(c => (
                            <div key={c.id} className="wa-invoice-customer-card" onClick={() => openInvoiceModal(c)}>
                                <div className="wa-inv-card-name">{c.name}</div>
                                <div className="wa-inv-card-phone">{toArabicNum(c.phone || c.phone2)}</div>
                                <div className="wa-inv-card-balance">{toArabicNum(Number(c.balance || 0).toFixed(0))} ج.م</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Bulk Progress Modal ── */}
            {sending && bulkProgress && (
                <div className="wa-modal-overlay">
                    <div className="wa-modal">
                        <h3>📤 جاري الإرسال...</h3>
                        <div className="wa-progress-bar"><div className="wa-progress-fill" style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }} /></div>
                        <p>{toArabicNum(bulkProgress.current)} / {toArabicNum(bulkProgress.total)}</p>
                        <p>✅ {toArabicNum(bulkProgress.sentCount)} | ❌ {toArabicNum(bulkProgress.failedCount)}</p>
                    </div>
                </div>
            )}

            {/* ── Results Modal ── */}
            {results && (
                <div className="wa-modal-overlay" onClick={() => setResults(null)}>
                    <div className="wa-modal wa-results-modal" onClick={e => e.stopPropagation()}>
                        <h3>📊 نتائج الإرسال</h3>
                        <div className="wa-results-summary">
                            <span className="wa-result-sent">✅ {toArabicNum(results.summary?.sent || 0)} نجح</span>
                            <span className="wa-result-failed">❌ {toArabicNum(results.summary?.failed || 0)} فشل</span>
                        </div>
                        <div className="wa-results-list">
                            {(results.results || []).map((r, i) => (
                                <div key={i} className={`wa-result-item ${r.success ? 'success' : 'fail'}`}>
                                    <span>{r.customerName}</span>
                                    <span>{r.success ? '✅' : `❌ ${r.error || ''}`}</span>
                                </div>
                            ))}
                        </div>
                        <button className="wa-btn wa-btn-close" onClick={() => setResults(null)}>إغلاق</button>
                    </div>
                </div>
            )}

            {/* ── Reset Confirmation Modal ── */}
            <ModernConfirmModal
                isOpen={showResetConfirm}
                title="تأكيد إعادة الاتصال"
                message={"هل تريد مسح الاتصال الحالي والبدء باتصال جديد تماماً؟\nسيتم مسح الجلسة القديمة وتوليد كود QR جديد."}
                type="danger"
                confirmText="نعم، ابدأ من جديد"
                onConfirm={confirmReset}
                onCancel={() => setShowResetConfirm(false)}
            />

            {/* ── Bulk Send Confirmation Modal ── */}
            <ModernConfirmModal
                isOpen={showBulkConfirm}
                title="تأكيد الإرسال الجماعي"
                message={`هل تريد إرسال رسائل لـ ${phoneCustomers.filter(c => selectedIds.has(c.id)).length} عميل؟`}
                type="info"
                confirmText="بدء الإرسال"
                onConfirm={confirmSendBulk}
                onCancel={() => setShowBulkConfirm(false)}
            />

            {/* ── Invoice Modal ── */}
            {invoiceModal && (
                <div className="wa-modal-overlay" onClick={() => { setInvoiceModal(null); setInvoices([]); }}>
                    <div className="wa-modal wa-invoice-modal" onClick={e => e.stopPropagation()}>
                        <h3>🧾 فواتير {invoiceModal.name}</h3>
                        {loadingInvoices ? <p>جاري التحميل...</p> : invoices.length === 0 ? <p>لا يوجد فواتير</p> : (
                            <div className="wa-invoice-table-container">
                                <table className="wa-invoice-table">
                                    <thead>
                                        <tr>
                                            <th>الرقم</th>
                                            <th>النوع</th>
                                            <th>التاريخ</th>
                                            <th>الإجمالي</th>
                                            <th>المدفوع</th>
                                            <th>المتبقي</th>
                                            <th>الحالة</th>
                                            <th>الإجراء</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invoices.map(inv => {
                                            const isSale = inv.type === 'SALE';
                                            const dateStr = inv._sortDate ? new Date(inv._sortDate).toLocaleDateString('ar-EG') : '—';
                                            const status = inv.status || (isSale ? 'مكتمل' : 'سداد');
                                            
                                            // Handle amounts for payments if not present
                                            const total = Number(inv.total || 0);
                                            const paid = isSale ? Number(inv.paid || 0) : total;
                                            const remaining = isSale ? Number(inv.remaining || 0) : 0;

                                            return (
                                                <tr key={`${inv.type}-${inv.id}`}>
                                                    <td><strong>{toArabicNum(inv.id)}</strong></td>
                                                    <td>
                                                        <span className={`wa-type-badge ${inv.type.toLowerCase()}`}>
                                                            {isSale ? 'فاتورة بيع' : 'إذن دفع'}
                                                        </span>
                                                    </td>
                                                    <td><span className="wa-date">{toArabicNum(dateStr)}</span></td>
                                                    <td><span className="wa-inv-total-cell">{toArabicNum(total.toFixed(2))} ج.م</span></td>
                                                    <td><span className="wa-inv-paid-cell">{toArabicNum(paid.toFixed(2))} ج.م</span></td>
                                                    <td><span className="wa-inv-rem-cell">{toArabicNum(remaining.toFixed(2))} ج.م</span></td>
                                                    <td><span className="wa-days-badge ok">{status}</span></td>
                                                    <td>
                                                        <button 
                                                            className="wa-btn wa-btn-send-inv" 
                                                            onClick={() => sendInvoiceImage(inv.id, inv.type)} 
                                                            disabled={sendingInvoice}
                                                        >
                                                            {sendingInvoice ? '⏳' : '📤'} إرسال واتساب
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <button className="wa-btn wa-btn-close" onClick={() => { setInvoiceModal(null); setInvoices([]); }}>إغلاق</button>
                    </div>
                </div>
            )}

            {/* Customer Ledger Modal */}
            {showCustomerLedger && (
                <CustomerLedger
                    customerId={showCustomerLedger}
                    onClose={() => setShowCustomerLedger(null)}
                />
            )}
        </div>
    );
}
