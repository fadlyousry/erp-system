import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, FileText, Type, Barcode, Mailbox, User, Trash2, Banknote } from 'lucide-react';
import { safeAlert } from '../utils/safeAlert';
import { filterPosPaymentMethods, normalizePaymentMethodCode } from '../utils/paymentMethodFilters';
import { getLocalDateString } from "../utils/dateUtils";
import {
    getDefaultSalesReturnRightTab,
    getDefaultSalesReturnSearchMode
} from '../utils/appSettings';
import {
    POS_EDITOR_REQUEST_EVENT,
    readPosEditorRequest,
    clearPosEditorRequest
} from '../utils/posEditorBridge';

const toNumber = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const genId = () => `R-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const todayLocalISO = () => getLocalDateString();

const toInputDate = (value) => {
    if (!value) return todayLocalISO();
    return getLocalDateString(value);
};

const normalizeReturnNotesForEditor = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (text.startsWith('ملاحظات:')) {
        return text.slice('ملاحظات:'.length).trim();
    }
    return text;
};

const isCashMethod = (method) => {
    const code = normalizePaymentMethodCode(method?.code || method?.name);
    if (code === 'CASH') return true;
    const n = String(method?.name || '').toLowerCase();
    return n.includes('cash') || n.includes('نقد');
};

const emptySession = () => ({
    id: genId(),
    cart: [],
    customerId: null,
    customerName: '',
    selectedSaleId: null,
    returnNotes: '',
    returnDate: todayLocalISO(),
    refundMode: 'cashOut',
    paymentMethodId: '',
    sourceReturnId: null,
    isEditMode: false
});

// ─── Toast ───
function Toast({ message, type = 'info', onClose }) {
    useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t) }, [onClose]);
    const bg = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
    const ic = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    return <div style={{ position: 'fixed', bottom: 30, left: 30, zIndex: 9999, padding: '12px 20px', borderRadius: 8, color: '#fff', backgroundColor: bg[type] || bg.info, fontSize: 14, boxShadow: '0 4px 6px rgba(0,0,0,.1)', display: 'flex', alignItems: 'center', gap: 8, maxWidth: 400, cursor: 'pointer' }} onClick={onClose}><span>{ic[type]}</span><span>{message}</span></div>;
}

// ─── Tab ───
const ReturnTab = ({ session, isActive, onSelect, onClose, canClose }) => {
    const label = session.customerName ? `مرتجع: ${session.customerName}` : 'فاتوره مرتجع';
    const n = session.cart?.length || 0;
    return <div onClick={onSelect} style={{ padding: '8px 15px', backgroundColor: isActive ? '#dc2626' : '#e5e7eb', color: isActive ? '#fff' : '#374151', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, minWidth: 120, justifyContent: 'space-between', boxShadow: isActive ? '0 4px 6px -1px rgba(220,38,38,.3)' : 'none', transition: 'all .2s' }}>
        <span style={{ fontSize: 13 }}>{label}{n > 0 && <span style={{ marginRight: 5, fontSize: 11, opacity: .8 }}>({n})</span>}</span>
        {canClose && <span onClick={e => { e.stopPropagation(); onClose() }} style={{ fontSize: 18, lineHeight: '1', opacity: .7 }}>×</span>}
    </div>;
};

// ─── Highlight ───
function hl(text, term) { if (!term || !text) return text; const i = text.toLowerCase().indexOf(term.toLowerCase()); if (i === -1) return text; return <>{text.slice(0, i)}<span style={{ backgroundColor: '#fef08a', fontWeight: 'bold' }}>{text.slice(i, i + term.length)}</span>{text.slice(i + term.length)}</>; }

// ─── Confirmation Modal ───
function ConfirmModal({ cart, cartTotal, customer, refundMode, onConfirm, onCancel, confirmLabel = '✅ تأكيد وحفظ' }) {
    return <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: 25, width: 500, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <h3 style={{ margin: '0 0 15px', color: '#1f2937', fontSize: 18 }}>📋 ملخص المرتجع</h3>
            <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 12, marginBottom: 15 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span style={{ color: '#6b7280' }}>العميل:</span><span style={{ fontWeight: 'bold' }}>{customer?.name || 'عميل عابر'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#6b7280' }}>طريقة الرد:</span><span style={{ fontWeight: 'bold' }}>{refundMode === 'creditNote' ? 'إيداع في الرصيد' : 'إرجاع نقدي'}</span></div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 15, fontSize: 13 }}>
                <thead><tr style={{ backgroundColor: '#f9fafb' }}><th style={{ padding: 8, textAlign: 'right' }}>الصنف</th><th style={{ padding: 8, textAlign: 'center' }}>الكمية</th><th style={{ padding: 8, textAlign: 'center' }}>السعر</th><th style={{ padding: 8, textAlign: 'left' }}>الإجمالي</th></tr></thead>
                <tbody>{cart.map(i => <tr key={i.itemId} style={{ borderBottom: '1px solid #e5e7eb' }}><td style={{ padding: 8 }}>{i.productName} ({i.size})</td><td style={{ padding: 8, textAlign: 'center' }}>{i.returnQty}</td><td style={{ padding: 8, textAlign: 'center' }}>{parseFloat(i.price).toFixed(2)}</td><td style={{ padding: 8, textAlign: 'left', fontWeight: 'bold' }}>{(i.returnQty * i.price).toFixed(2)}</td></tr>)}</tbody>
            </table>
            <div style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: 12, textAlign: 'center', marginBottom: 20, border: '2px solid #fecaca' }}>
                <div style={{ fontSize: 12, color: '#991b1b' }}>إجمالي المرتجع</div>
                <div style={{ fontSize: 28, fontWeight: 'bold', color: '#dc2626' }}>{cartTotal.toFixed(2)} ج.م</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={onConfirm} style={{ flex: 1, padding: 14, backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,.1)' }}>{confirmLabel}</button>
                <button onClick={onCancel} style={{ flex: 1, padding: 14, backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 15, fontWeight: 'bold', cursor: 'pointer' }}>إلغاء</button>
            </div>
        </div>
    </div>;
}

export default function Returns() {
    // ─── Sessions ───
    const [sessions, setSessions] = useState(() => { try { const s = localStorage.getItem('ret_s'); if (s) { const p = JSON.parse(s); if (Array.isArray(p) && p.length > 0) return p; } } catch (e) { } return [emptySession()] });
    const [activeId, setActiveId] = useState(() => localStorage.getItem('ret_a') || (sessions[0] ? sessions[0].id : ''));
    useEffect(() => { localStorage.setItem('ret_s', JSON.stringify(sessions)); localStorage.setItem('ret_a', activeId) }, [sessions, activeId]);
    const sess = sessions.find(s => s.id === activeId) || sessions[0];
    const upd = useCallback((u) => setSessions(p => p.map(s => s.id === activeId ? { ...s, ...u } : s)), [activeId]);
    const addTab = () => { const n = emptySession(); setSessions(p => [...p, n]); setActiveId(n.id); showToast('تبويب جديد', 'info'); };
    const closeTab = (id) => { if (sessions.length === 1) return; const ns = sessions.filter(s => s.id !== id); setSessions(ns); if (activeId === id) setActiveId(ns[ns.length - 1].id); };

    // ─── Global ───
    const [loading, setLoading] = useState(false);
    const [paymentMethods, setPM] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [toast, setToast] = useState(null);
    const showToast = useCallback((m, t = 'info') => setToast({ message: m, type: t }), []);

    // ─── UI ───
    const searchRef = useRef(null);
    const custDDRef = useRef(null);
    const custListRef = useRef(null);
    const [searchTerm, setSearch] = useState('');
    const [custSearch, setCustSearch] = useState('');
    const [showCustList, setShowCL] = useState(false);
    const [custIdx, setCustIdx] = useState(-1);
    const [showConfirm, setShowConfirm] = useState(false);
    const [printOnConfirm, setPrintOnConfirm] = useState(false);
    const [rightTab, setRightTab] = useState(() => getDefaultSalesReturnRightTab());
    const [prodSearch, setProdSearch] = useState('');
    const [prodSearchMode, setProdSearchMode] = useState(() => getDefaultSalesReturnSearchMode());
    const [allVariants, setAllVariants] = useState([]);

    const selCust = useMemo(() => sess?.customerId ? customers.find(c => c.id === sess.customerId) || null : null, [sess?.customerId, customers]);
    const [custSales, setCustSales] = useState([]);
    const [selSale, setSelSale] = useState(null);
    const [saleItems, setSaleItems] = useState([]);

    const cart = sess?.cart || [];
    const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.price * i.returnQty, 0), [cart]);
    const cartCount = useMemo(() => cart.reduce((s, i) => s + i.returnQty, 0), [cart]);
    const isEditingReturn = !!sess?.sourceReturnId;
    const hasSelectedCustomer = !!selCust;
    const effectiveRefundMode = hasSelectedCustomer ? sess.refundMode : 'cashOut';
    const previousBalance = toNumber(selCust?.balance);
    const nextBalance = previousBalance - (effectiveRefundMode === 'creditNote' ? cartTotal : 0);
    const notesPanelHeight = 80;
    const summaryCardHeight = 60;

    const setSessionCustomer = useCallback((customer) => {
        const currentCustomerId = sess?.customerId ? String(sess.customerId) : '';
        const nextCustomerId = customer?.id ? String(customer.id) : '';
        const changed = currentCustomerId !== nextCustomerId;
        const nextState = { customerId: customer?.id || null, customerName: customer?.name || '' };
        if (changed) {
            nextState.cart = [];
            nextState.selectedSaleId = null;
            setSelSale(null);
            setSaleItems([]);
            if ((sess?.cart || []).length > 0) showToast('تم تفريغ السلة عند تغيير العميل', 'warning');
        }
        upd(nextState);
    }, [sess?.customerId, sess?.cart, showToast, upd]);

    const openIncomingEditorRequest = useCallback((request) => {
        if (!request?.type || request.type !== 'return') return false;

        const transaction = request?.transaction || {};
        const returnInvoice = transaction?.details || request?.return;
        if (!returnInvoice?.id) return false;

        const resolvedCustomer =
            request?.customer
            || returnInvoice?.customer
            || customers.find((item) => String(item.id) === String(returnInvoice.customerId))
            || null;

        const editItems = Array.isArray(returnInvoice?.items) ? returnInvoice.items : [];
        const mappedCart = editItems.map((item, index) => {
            const variantId = parseInt(item?.variantId || item?.variant?.id, 10) || 0;
            const quantity = Math.max(1, parseInt(item?.quantity, 10) || 1);
            const price = Math.max(0, toNumber(item?.price));

            return {
                itemId: `edit-${returnInvoice.id}-${variantId || index + 1}`,
                saleId: returnInvoice?.saleId || null,
                variantId,
                productName: item?.variant?.product?.name || item?.productName || `منتج #${variantId || index + 1}`,
                size: item?.variant?.productSize || item?.size || '-',
                color: item?.variant?.color || item?.color || '-',
                price,
                barcode: item?.variant?.barcode || item?.barcode || '',
                soldQty: quantity,
                alreadyReturned: 0,
                maxQuantity: Infinity,
                returnQty: quantity
            };
        });

        const nextSession = {
            ...emptySession(),
            id: `RET-EDIT-${returnInvoice.id}-${Date.now()}`,
            cart: mappedCart,
            customerId: resolvedCustomer?.id || returnInvoice?.customerId || null,
            customerName: resolvedCustomer?.name || '',
            selectedSaleId: returnInvoice?.saleId || null,
            returnNotes: normalizeReturnNotesForEditor(returnInvoice?.notes),
            returnDate: toInputDate(returnInvoice?.createdAt),
            sourceReturnId: returnInvoice.id,
            isEditMode: true
        };

        let targetSessionId = nextSession.id;
        setSessions((prev) => {
            const existingSession = prev.find(
                (session) => String(session?.sourceReturnId || '') === String(returnInvoice.id)
            );
            if (!existingSession) {
                return [...prev, nextSession];
            }

            targetSessionId = existingSession.id;
            return prev.map((session) => (
                session.id === existingSession.id
                    ? { ...nextSession, id: existingSession.id }
                    : session
            ));
        });
        setActiveId(targetSessionId);
        setSelSale(null);
        setSaleItems([]);
        setSearch('');
        setCustSearch('');
        setProdSearch('');
        setShowCL(false);
        clearPosEditorRequest();
        showToast(`تم فتح المرتجع #${returnInvoice.id} للتعديل`, 'info');
        return true;
    }, [customers, showToast]);

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

    // ─── Init ───
    useEffect(() => { (async () => { try { const [c, m, v] = await Promise.all([window.api.getCustomers(), window.api.getPaymentMethods(), window.api.getVariants()]); if (!c?.error) setCustomers(Array.isArray(c) ? c : (c?.data || [])); if (!m?.error) setPM(filterPosPaymentMethods(m || []).filter(isCashMethod)); if (!v?.error) setAllVariants(Array.isArray(v) ? v : []); } catch (e) { console.error(e) } })() }, []);
    useEffect(() => {
        if (!paymentMethods.length) return;
        const selected = String(sess?.paymentMethodId || '');
        const exists = paymentMethods.some(pm => String(pm.id) === selected);
        if (!exists) upd({ paymentMethodId: String(paymentMethods[0].id) });
    }, [paymentMethods, sess?.paymentMethodId, upd]);
    useEffect(() => {
        if (!sess?.customerId && sess?.refundMode !== 'cashOut') {
            upd({ refundMode: 'cashOut' });
        }
    }, [sess?.customerId, sess?.refundMode, upd]);

    // ─── Keys ───
    useEffect(() => { const h = (e) => { if (showConfirm) return; if (e.key === 'F1') { e.preventDefault(); handleCheckoutFlow(false); } else if (e.key === 'F2') { e.preventDefault(); handleCheckoutFlow(true); } else if (e.key === 'F4') { e.preventDefault(); searchRef.current?.focus(); } else if (e.key === 'F5') { e.preventDefault(); const ci = document.querySelector('input[placeholder*="ابحث عن عميل"]'); if (ci) ci.focus(); } else if (e.key === 'Escape' && cart.length > 0) { e.preventDefault(); upd({ cart: [] }); showToast('تم إفراغ السلة', 'warning'); } }; document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h) }, [cart, showConfirm, upd]);

    // ─── Click outside ───
    useEffect(() => { const h = (e) => { if (custDDRef.current && !custDDRef.current.contains(e.target)) setShowCL(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, []);
    useEffect(() => { setCustIdx(-1) }, [custSearch]);
    useEffect(() => { if (custIdx >= 0 && custListRef.current) { const it = custListRef.current.querySelectorAll('[data-ci]'); if (it[custIdx]) it[custIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }, [custIdx]);
    useEffect(() => {
        setSearch('');
        setCustSearch('');
        setShowCL(false);
        setSelSale(null);
        setSaleItems([]);
        setProdSearch('');
        setRightTab(getDefaultSalesReturnRightTab());
        setProdSearchMode(getDefaultSalesReturnSearchMode());
    }, [activeId]);

    // ─── Filtered Customers ───
    const filtCust = useMemo(() => { if (!Array.isArray(customers)) return []; if (showCustList && !custSearch) return customers.slice(0, 50); if (!custSearch) return []; const t = custSearch.toLowerCase(); return customers.filter(c => c.name.toLowerCase().includes(t) || c.phone?.includes(t)).slice(0, 20); }, [customers, custSearch, showCustList]);

    const handleCustKey = (e) => {
        if (!showCustList || filtCust.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setCustIdx(p => p < filtCust.length - 1 ? p + 1 : p);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setCustIdx(p => p > 0 ? p - 1 : -1);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (custIdx >= 0 && filtCust[custIdx]) {
                const c = filtCust[custIdx];
                setSessionCustomer(c);
                setCustSearch('');
                setShowCL(false);
                setCustIdx(-1);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setShowCL(false);
            setCustIdx(-1);
        }
    };

    // ─── Customer history ───
    useEffect(() => { (async () => { if (!sess?.customerId) { setCustSales([]); setSelSale(null); setSaleItems([]); return; } try { const s = await window.api.getSales({ customerId: sess.customerId, limit: 20 }); if (!s?.error) setCustSales(s); } catch (e) { console.error(e) } })() }, [sess?.customerId]);

    // ─── Sale items ───
    useEffect(() => { if (!selSale) { setSaleItems([]); return; } const rMap = {}; if (selSale.returns && Array.isArray(selSale.returns)) for (const r of selSale.returns) if (r.items) for (const ri of r.items) rMap[ri.variantId] = (rMap[ri.variantId] || 0) + ri.quantity; setSaleItems(selSale.items.map(item => { const ar = rMap[item.variantId] || 0; return { itemId: `${selSale.id}-${item.variantId}`, saleId: selSale.id, variantId: item.variantId, productName: item.variant?.product?.name || 'محذوف', size: item.variant?.productSize || '-', color: item.variant?.color || '-', price: item.price, barcode: item.variant?.barcode || '', soldQty: item.quantity, alreadyReturned: ar, maxQuantity: Math.max(0, item.quantity - ar), dbSku: item.variant?.product?.sku || '' }; })); }, [selSale]);

    const ageDays = (s) => Math.floor((new Date() - new Date(s.createdAt)) / 86400000);

    // ─── Customer variant map (tracks what variants exist in customer invoices) ───
    const customerVariantMap = useMemo(() => {
        const map = {};
        if (!custSales || !Array.isArray(custSales)) return map;
        for (const sale of custSales) {
            if (!sale.items) continue;
            for (const item of sale.items) {
                const vid = item.variantId;
                if (!map[vid]) map[vid] = { soldQty: 0, returnedQty: 0 };
                map[vid].soldQty += item.quantity;
            }
            if (sale.returns && Array.isArray(sale.returns)) {
                for (const r of sale.returns) if (r.items) for (const ri of r.items) {
                    if (map[ri.variantId]) map[ri.variantId].returnedQty += ri.quantity;
                }
            }
        }
        for (const vid in map) map[vid].remainingQty = Math.max(0, map[vid].soldQty - map[vid].returnedQty);
        return map;
    }, [custSales]);

    // ─── Filtered products for search tab ───
    const filteredProds = useMemo(() => {
        if (!prodSearch || prodSearch.trim() === '') return [];
        const term = prodSearch.trim().toLowerCase();
        const groups = {};
        for (const v of allVariants) {
            const nameMatch = v.product?.name?.toLowerCase().includes(term);
            const barcodeMatch = v.barcode && String(v.barcode).includes(prodSearch.trim());
            const isMatch = prodSearchMode === 'barcode' ? barcodeMatch : nameMatch;
            if (!isMatch) continue;
            const pid = v.productId;
            if (!groups[pid]) groups[pid] = { id: pid, name: v.product?.name || '', basePrice: v.price, variants: [], totalQuantity: 0 };
            groups[pid].variants.push(v);
            groups[pid].totalQuantity += v.quantity || 0;
        }
        return Object.values(groups).slice(0, 20);
    }, [allVariants, prodSearch, prodSearchMode]);

    // ─── Return progress for invoice ───
    const getReturnProgress = (sale) => { if (!sale.items || !sale.returns) return 0; let total = 0, returned = 0; for (const it of sale.items) total += it.quantity; if (sale.returns) for (const r of sale.returns) if (r.items) for (const ri of r.items) returned += ri.quantity; return total > 0 ? Math.round((returned / total) * 100) : 0; };

    // ─── Invoice lookup (invoice number only) ───
    const handleSearchSubmit = async (e) => {
        e.preventDefault();
        const term = searchTerm.trim();
        if (!term) return;
        const invoiceNo = term.startsWith('#') ? term.slice(1).trim() : term;
        if (!/^\d+$/.test(invoiceNo)) {
            showToast('اكتب رقم فاتورة صحيح فقط (مثال: #1234)', 'error');
            return;
        }
        const id = Number(invoiceNo);
        if (!Number.isInteger(id) || id <= 0) {
            showToast('رقم فاتورة غير صالح', 'error');
            return;
        }
        try {
            const sale = await window.api.getSaleById(id);
            if (sale?.error) { showToast(sale.error || 'تعذر تحميل الفاتورة', 'error'); }
            else {
                const selectedCustomerId = selCust?.id ? String(selCust.id) : '';
                const saleCustomerId = sale?.customer?.id ? String(sale.customer.id) : '';
                if (selCust && selectedCustomerId !== saleCustomerId) {
                    showToast('هذه الفاتورة ليست للعميل المحدد', 'error');
                    return;
                }
                if (!selCust && sale.customer) { setSessionCustomer(sale.customer); }
                setSelSale(sale);
                setCustSales(prev => { const exists = prev.find(s => s.id === sale.id); return exists ? prev : [sale, ...prev]; });
            }
        } catch (er) { console.error(er); showToast('خطأ في جلب الفاتورة', 'error'); }
        finally { searchRef.current?.focus(); }
    };

    // ─── Sound ───
    const playBeep = (success) => { try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value = success ? 800 : 300; g.gain.value = 0.15; o.start(); o.stop(ctx.currentTime + (success ? 0.1 : 0.3)); setTimeout(() => ctx.close(), 500); } catch (e) { } };

    // ─── Cart ───
    const addToCart = (item) => { const prev = sess.cart || []; const ex = prev.find(c => c.itemId === item.itemId); if (ex) { if (ex.returnQty >= item.maxQuantity) { showToast(`الحد الأقصى: ${item.maxQuantity}`, 'warning'); return; } upd({ cart: prev.map(c => c.itemId === item.itemId ? { ...c, returnQty: c.returnQty + 1 } : c) }); } else { showToast(`+ ${item.productName}`, 'success'); upd({ cart: [...prev, { ...item, returnQty: 1 }] }); } };
    const updQty = (id, val, max) => { const q = parseInt(val) || 0; if (q < 1) return; if (q > max && max !== Infinity) { showToast(`الحد الأقصى: ${max}`, 'warning'); return; } upd({ cart: cart.map(c => c.itemId === id ? { ...c, returnQty: q } : c) }); };
    const updPrice = (id, val) => upd({ cart: cart.map(c => c.itemId === id ? { ...c, price: Math.max(0, toNumber(val)) } : c) });
    const rmCart = (id) => upd({ cart: cart.filter(c => c.itemId !== id) });

    // ─── Add from product search tab (with customer invoice validation) ───
    const addFromSearch = (variant) => {
        if (selCust) {
            const info = customerVariantMap[variant.id];
            if (!info || info.soldQty === 0) {
                showToast('⚠️ هذا المنتج غير موجود في فواتير هذا العميل!', 'error');
                playBeep(false);
                return;
            }
            if (info.remainingQty <= 0) {
                showToast('⚠️ تم إرجاع كامل الكمية المباعة من هذا المنتج', 'warning');
                playBeep(false);
                return;
            }
            // Find the first sale with remaining quantity for this variant
            for (const sale of custSales) {
                if (!sale.items) continue;
                const saleItem = sale.items.find(i => i.variantId === variant.id);
                if (!saleItem) continue;
                const rMap = {};
                if (sale.returns && Array.isArray(sale.returns))
                    for (const r of sale.returns) if (r.items) for (const ri of r.items) rMap[ri.variantId] = (rMap[ri.variantId] || 0) + ri.quantity;
                const ar = rMap[variant.id] || 0;
                const remaining = saleItem.quantity - ar;
                if (remaining > 0) {
                    addToCart({ itemId: `${sale.id}-${variant.id}`, saleId: sale.id, variantId: variant.id, productName: variant.product?.name || '', size: variant.productSize || '-', color: variant.color || '-', price: saleItem.price, barcode: variant.barcode || '', soldQty: saleItem.quantity, alreadyReturned: ar, maxQuantity: remaining });
                    playBeep(true);
                    return;
                }
            }
            showToast('⚠️ تم إرجاع كامل الكمية المباعة', 'warning');
            playBeep(false);
        } else {
            addToCart({ itemId: `free-${variant.id}`, saleId: null, variantId: variant.id, productName: variant.product?.name || '', size: variant.productSize || '-', color: variant.color || '-', price: variant.price, barcode: variant.barcode || '', maxQuantity: Infinity });
            playBeep(true);
        }
    };

    // ─── Return ALL items from invoice ───
    const returnAllItems = () => { if (!saleItems.length) return; let added = 0; const prev = [...(sess.cart || [])]; for (const item of saleItems) { if (item.maxQuantity <= 0) continue; const ex = prev.find(c => c.itemId === item.itemId); if (!ex) { prev.push({ ...item, returnQty: item.maxQuantity }); added++; } else if (ex.returnQty < item.maxQuantity) { ex.returnQty = item.maxQuantity; added++; } } upd({ cart: prev }); showToast(`تم إضافة ${added} صنف للسلة`, 'success'); };

    // ─── Checkout Flow (shows confirmation modal) ───
    const handleCheckoutFlow = (shouldPrint = false) => {
        if (cart.length === 0) { showToast('السلة فارغة!', 'warning'); return; }
        const rm = effectiveRefundMode;
        const pmId = sess.paymentMethodId;
        if ((!selCust || rm === 'cashOut') && !pmId) { showToast('اختر طريقة الدفع', 'error'); return; }
        setPrintOnConfirm(shouldPrint);
        setShowConfirm(true);
    };

    const doCheckout = async () => {
        setShowConfirm(false); setLoading(true);
        const isEditMode = !!sess?.sourceReturnId;
        const ns = sess.returnNotes ? `ملاحظات: ${sess.returnNotes}` : '';
        const selectedReturnDate = sess.returnDate || todayLocalISO();
        const rd = {
            saleId: sess?.selectedSaleId || cart.find(c => c.saleId)?.saleId || null,
            customerId: sess.customerId || null,
            total: cartTotal,
            notes: ns,
            returnDate: selectedReturnDate,
            items: cart.map(i => ({ variantId: i.variantId, quantity: i.returnQty, price: i.price }))
        };
        if (sess.customerId) {
            if (sess.refundMode === 'cashOut') {
                rd.refundAmount = cartTotal;
                rd.paymentMethodId = sess.paymentMethodId;
                rd.refundMode = 'CASH_ONLY';
            } else {
                rd.refundAmount = 0;
            }
        } else {
            rd.refundAmount = cartTotal;
            rd.paymentMethodId = sess.paymentMethodId;
            rd.refundMode = 'CASH_ONLY';
        }
        try {
            const res = isEditMode
                ? await window.api.updateReturn(sess.sourceReturnId, rd)
                : await window.api.createReturn(rd);

            if (res?.error) {
                await safeAlert('خطأ: ' + res.error);
            } else {
                if (printOnConfirm) {
                    try {
                        await window.api.printHTML({ html: buildReceipt(res), title: 'إيصال مرتجع' });
                    } catch (printErr) {
                        console.error(printErr);
                        showToast('تم الحفظ ولكن تعذر طباعة إيصال المرتجع', 'warning');
                    }
                }
                showToast(isEditMode ? '✅ تم تعديل المرتجع' : '✅ تم حفظ المرتجع', 'success'); playBeep(true);
                upd({
                    cart: [],
                    returnNotes: '',
                    returnDate: todayLocalISO(),
                    selectedSaleId: null,
                    customerId: null,
                    customerName: '',
                    sourceReturnId: null,
                    isEditMode: false
                });
                setSelSale(null);
                setSaleItems([]);
                setCustSales([]);
                setSearch('');
                setCustSearch('');
                setProdSearch('');
                setShowCL(false);
                setPrintOnConfirm(false);
            }
        } catch (er) {
            console.error(er);
            await safeAlert(isEditMode ? 'تعذر تعديل المرتجع' : 'تعذر الحفظ');
        }
        finally { setLoading(false); setPrintOnConfirm(false); searchRef.current?.focus(); }
    };

    const buildReceipt = (res) => `<html dir="rtl"><head><style>body{font-family:'Segoe UI',Tahoma,sans-serif;padding:20px;font-size:14px}.header{text-align:center;margin-bottom:20px;border-bottom:2px dashed #000;padding-bottom:15px}.title{font-size:20px;font-weight:bold}.info div{display:flex;justify-content:space-between;padding:3px 0}table{width:100%;border-collapse:collapse;margin:15px 0}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:right}th{background:#f8f9fa}.total{font-size:18px;font-weight:bold;text-align:left;border-top:2px dashed #000;padding-top:15px;margin-top:15px}.footer{text-align:center;margin-top:30px;font-size:12px;color:#555}</style></head><body><div class="header"><div class="title">إيصال مرتجع</div><div>رقم: ${res.data?.id || '-'}</div><div>${new Date(`${(sess.returnDate || todayLocalISO())}T00:00:00`).toLocaleDateString('ar-EG')}</div></div><div class="info"><div><span>العميل:</span><span>${selCust ? selCust.name : 'عميل عابر'}</span></div></div><table><thead><tr><th>الصنف</th><th style="text-align:center">كمية</th><th style="text-align:center">سعر</th><th style="text-align:left">إجمالي</th></tr></thead><tbody>${cart.map(i => `<tr><td>${i.productName} (${i.size})</td><td style="text-align:center">${i.returnQty}</td><td style="text-align:center">${parseFloat(i.price).toFixed(2)}</td><td style="text-align:left">${(i.returnQty * i.price).toFixed(2)}</td></tr>`).join('')}</tbody></table><div class="total">الإجمالي: ${cartTotal.toFixed(2)} ج.م</div><div class="footer">شكراً لثقتكم</div></body></html>`;

    const confirmLabel = printOnConfirm
        ? (isEditingReturn ? '✅ تعديل وحفظ وطباعة' : '✅ تأكيد وحفظ وطباعة')
        : (isEditingReturn ? '✅ تعديل وحفظ' : '✅ تأكيد وحفظ');


    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', overflow: 'hidden', padding: 15, boxSizing: 'border-box' }}>
            <style>{`.hide-scrollbar::-webkit-scrollbar{display:none}.hide-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
            {loading && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner"></div></div>}
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
            {showConfirm && <ConfirmModal cart={cart} cartTotal={cartTotal} customer={selCust} refundMode={effectiveRefundMode} onConfirm={doCheckout} onCancel={() => { setShowConfirm(false); setPrintOnConfirm(false); }} confirmLabel={confirmLabel} />}

            {/* ═══ Tabs ═══ */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                <div className="hide-scrollbar" style={{ display: 'flex', gap: 5, overflowX: 'auto', flex: 1, paddingBottom: 5 }}>
                    {sessions.map(s => <ReturnTab key={s.id} session={s} isActive={activeId === s.id} onSelect={() => setActiveId(s.id)} onClose={() => closeTab(s.id)} canClose={sessions.length > 1} />)}
                    <button onClick={addTab} style={{ padding: '8px 12px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 18, fontWeight: 'bold' }}>+</button>
                </div>
            </div>

            {/* ═══ Main ═══ */}
            <div style={{ display: 'flex', gap: 20, flex: 1, overflow: 'hidden' }}>
                {/* ── LEFT: Product Search & Invoices (Tabbed) ── */}
                <div style={{ flex: 2, display: 'flex', flexDirection: 'column', backgroundColor: '#fff', padding: 15, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.1)' }}>
                    {/* Tab Switcher */}
                    <div style={{ display: 'flex', gap: 4, marginBottom: 12, backgroundColor: '#f3f4f6', borderRadius: 8, padding: 4 }}>
                        <button onClick={() => setRightTab('search')} style={{ flex: 1, padding: '9px 12px', borderRadius: 6, border: 'none', backgroundColor: rightTab === 'search' ? '#fff' : 'transparent', color: rightTab === 'search' ? '#dc2626' : '#6b7280', cursor: 'pointer', fontWeight: 'bold', boxShadow: rightTab === 'search' ? '0 1px 3px rgba(0,0,0,.1)' : 'none', transition: 'all .2s', fontSize: 13 }}><span style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}><Search size={14} /> بحث المنتجات</span>{filteredProds.length > 0 && <span style={{ marginRight: 4, fontSize: 10, backgroundColor: '#fee2e2', color: '#dc2626', padding: '1px 6px', borderRadius: 10 }}>{filteredProds.length}</span>}</button>
                        <button onClick={() => setRightTab('invoices')} style={{ flex: 1, padding: '9px 12px', borderRadius: 6, border: 'none', backgroundColor: rightTab === 'invoices' ? '#fff' : 'transparent', color: rightTab === 'invoices' ? '#3b82f6' : '#6b7280', cursor: 'pointer', fontWeight: 'bold', boxShadow: rightTab === 'invoices' ? '0 1px 3px rgba(0,0,0,.1)' : 'none', transition: 'all .2s', fontSize: 13 }}><span style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}><FileText size={14} /> فواتير العميل</span>{selCust && custSales.length > 0 && <span style={{ marginRight: 4, fontSize: 10, backgroundColor: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: 10 }}>{custSales.length}</span>}</button>
                    </div>

                    {rightTab === 'search' ? (<>
                        {/* Product Search */}
                        <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <input type="text" placeholder={prodSearchMode === 'barcode' ? '🔍 ابحث بالباركود...' : '🔍 ابحث بالاسم...'} value={prodSearch} onChange={e => setProdSearch(e.target.value)} onKeyDown={e => {
                                    if (e.key === 'Enter' && prodSearchMode === 'barcode' && prodSearch.trim()) {
                                        e.preventDefault();
                                        const term = prodSearch.trim();
                                        // Try exact barcode match in all variants
                                        const exactVariant = allVariants.find(v => v.barcode === term);
                                        if (exactVariant) {
                                            addFromSearch(exactVariant);
                                            setProdSearch('');
                                            return;
                                        }
                                        // Fallback: if one product with one variant found
                                        if (filteredProds.length === 1 && filteredProds[0].variants.length === 1) {
                                            addFromSearch(filteredProds[0].variants[0]);
                                            setProdSearch('');
                                            return;
                                        }
                                        // If one product with multiple variants, try to find exact barcode match within it
                                        if (filteredProds.length === 1) {
                                            const matched = filteredProds[0].variants.find(v => v.barcode === term);
                                            if (matched) {
                                                addFromSearch(matched);
                                                setProdSearch('');
                                                return;
                                            }
                                        }
                                    }
                                }} style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }} autoFocus />
                                {prodSearch && <button onClick={() => setProdSearch('')} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18 }}>×</button>}
                            </div>
                            <div style={{ display: 'flex', gap: 4, backgroundColor: '#f3f4f6', borderRadius: 8, padding: 4 }}>
                                <button onClick={() => setProdSearchMode('name')} style={{ padding: '8px 12px', borderRadius: 6, border: 'none', backgroundColor: prodSearchMode === 'name' ? '#fff' : 'transparent', color: prodSearchMode === 'name' ? '#3b82f6' : '#6b7280', cursor: 'pointer', fontWeight: 'bold', boxShadow: prodSearchMode === 'name' ? '0 1px 2px rgba(0,0,0,.1)' : 'none', transition: 'all .2s', fontSize: 13 }}><span style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}><Type size={14} /> اسم</span></button>
                                <button onClick={() => setProdSearchMode('barcode')} style={{ padding: '8px 12px', borderRadius: 6, border: 'none', backgroundColor: prodSearchMode === 'barcode' ? '#fff' : 'transparent', color: prodSearchMode === 'barcode' ? '#dc2626' : '#6b7280', cursor: 'pointer', fontWeight: 'bold', boxShadow: prodSearchMode === 'barcode' ? '0 1px 2px rgba(0,0,0,.1)' : 'none', transition: 'all .2s', fontSize: 13 }}><span style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}><Barcode size={14} /> باركود</span></button>
                            </div>
                        </div>
                        {/* Product Cards Grid */}
                        <div className="hide-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
                            {filteredProds.length === 0 ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', textAlign: 'center', padding: 40 }}>
                                    <div><div style={{ fontSize: 48, marginBottom: 10 }}>{prodSearch ? <Search size={48} color="#9ca3af" /> : <Barcode size={48} color="#9ca3af" />}</div><div style={{ fontSize: 14, fontWeight: 'bold' }}>{prodSearch ? 'لا توجد نتائج' : 'ابحث عن منتج لإرجاعه'}</div></div>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                                    {filteredProds.map(prod => {
                                        const hasCust = !!selCust;
                                        const prodInInvoice = hasCust && prod.variants.some(v => customerVariantMap[v.id]?.soldQty > 0);
                                        const prodFullyReturned = hasCust && prodInInvoice && prod.variants.every(v => !customerVariantMap[v.id] || customerVariantMap[v.id].remainingQty <= 0);
                                        const borderColor = !hasCust ? '#e5e7eb' : prodInInvoice ? (prodFullyReturned ? '#fbbf24' : '#10b981') : '#e5e7eb';
                                        return (
                                            <div key={prod.id} style={{ border: `2px solid ${borderColor}`, borderRadius: 10, padding: 10, cursor: 'pointer', backgroundColor: '#fff', transition: 'all .2s', boxShadow: '0 1px 3px rgba(0,0,0,.05)', position: 'relative', opacity: hasCust && !prodInInvoice ? 0.55 : 1 }}
                                                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.12)'; }}
                                                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.05)'; }}>
                                                {/* Status badge */}
                                                {hasCust && <div style={{ position: 'absolute', top: 6, left: 6, fontSize: 10, padding: '1px 5px', borderRadius: 4, backgroundColor: prodInInvoice ? (prodFullyReturned ? '#fef3c7' : '#ecfdf5') : '#f3f4f6', color: prodInInvoice ? (prodFullyReturned ? '#92400e' : '#047857') : '#9ca3af', fontWeight: 'bold' }}>
                                                    {prodInInvoice ? (prodFullyReturned ? '↩ مكتمل' : '✅ مُباع') : '⚠️ غير مُباع'}
                                                </div>}
                                                <div style={{ fontWeight: 'bold', fontSize: 13, color: '#1f2937', marginTop: hasCust ? 22 : 0, marginBottom: 4, lineHeight: 1.3 }}>{prod.name}</div>
                                                <div style={{ color: '#059669', fontWeight: 'bold', fontSize: 14, marginBottom: 4 }}>{prod.basePrice?.toFixed(2)} ج.م</div>
                                                {prod.variants.length > 1 && <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{prod.variants.length} مقاس</div>}
                                                {/* Return info */}
                                                {hasCust && prodInInvoice && <div style={{ fontSize: 10, color: '#4b5563', backgroundColor: '#f0fdf4', borderRadius: 4, padding: '3px 5px', marginBottom: 4, border: '1px solid #bbf7d0' }}>
                                                    {prod.variants.filter(v => customerVariantMap[v.id]).map(v => {
                                                        const info = customerVariantMap[v.id];
                                                        return <div key={v.id}>{v.productSize || v.color || '-'}: بيع {info.soldQty} | مرتجع {info.returnedQty} | <b style={{ color: info.remainingQty > 0 ? '#059669' : '#ef4444' }}>متبقي {info.remainingQty}</b></div>;
                                                    })}
                                                </div>}
                                                {/* Variant buttons */}
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                                    {prod.variants.length === 1 ? (
                                                        <button onClick={() => addFromSearch(prod.variants[0])} style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #93c5fd', backgroundColor: '#e0f2fe', color: '#1e40af', cursor: 'pointer', fontSize: 12, fontWeight: 'bold', transition: 'all .2s' }}
                                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#bfdbfe'} onMouseLeave={e => e.currentTarget.style.backgroundColor = '#e0f2fe'}>+ إضافة</button>
                                                    ) : prod.variants.map(v => {
                                                        const vInfo = selCust ? customerVariantMap[v.id] : null;
                                                        const vAvail = !selCust || (vInfo && vInfo.remainingQty > 0);
                                                        return <button key={v.id} onClick={() => addFromSearch(v)} disabled={selCust && !vAvail}
                                                            style={{ padding: '4px 8px', borderRadius: 5, border: `1px solid ${vAvail ? '#93c5fd' : '#e5e7eb'}`, backgroundColor: vAvail ? '#e0f2fe' : '#f9fafb', color: vAvail ? '#1e40af' : '#9ca3af', cursor: vAvail ? 'pointer' : 'not-allowed', fontSize: 11, fontWeight: 'bold', transition: 'all .2s' }}
                                                            title={vInfo ? `بيع: ${vInfo.soldQty} | متبقي: ${vInfo.remainingQty}` : ''}>{v.productSize || v.color || '-'}{vInfo ? ` (${vInfo.remainingQty})` : ''}</button>;
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </>) : (<>
                        {/* Search (invoice number only) */}
                        <div style={{ display: 'flex', gap: 10, marginBottom: 15, alignItems: 'center', position: 'relative' }}>
                            <input ref={searchRef} type="text" placeholder="ابحث برقم الفاتورة فقط (مثال: #1234)" value={searchTerm} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSearchSubmit(e); if (e.key === 'Escape') setSearch(''); }} style={{ padding: 12, borderRadius: 8, border: '1px solid #d1d5db', fontSize: 16, flex: 1, minWidth: 200 }} autoFocus />
                        </div>
                        {/* Invoice History or Empty */}
                        {(selCust || custSales.length > 0) ? (
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                <div style={{ fontSize: 13, color: '#4b5563', fontWeight: 'bold', marginBottom: 10 }}><span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FileText size={16} /> سجل الفواتير</span> ({custSales.length})</div>
                                {custSales.length === 0 ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: 16, fontWeight: 'bold', textAlign: 'center', padding: 40 }}><div><div style={{ marginBottom: 10 }}><Mailbox size={40} color="#9ca3af" /></div>لا يوجد فواتير</div></div>
                                    : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{custSales.map(sale => {
                                        const ag = ageDays(sale), old = ag > 14, isSel = selSale?.id === sale.id, prog = getReturnProgress(sale);
                                        return <div key={sale.id} style={{ border: `2px solid ${isSel ? '#3b82f6' : '#e5e7eb'}`, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', transition: 'all .2s', borderLeft: isSel ? '4px solid #3b82f6' : undefined }}>
                                            <div onClick={() => { setSelSale(isSel ? null : sale); }} style={{ padding: '10px 14px', backgroundColor: isSel ? '#eff6ff' : '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background .2s' }} onMouseEnter={e => { if (!isSel) e.currentTarget.style.backgroundColor = '#f9fafb' }} onMouseLeave={e => { if (!isSel) e.currentTarget.style.backgroundColor = '#fff' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                                                    <span style={{ fontWeight: 'bold', color: isSel ? '#1e40af' : '#1f2937', fontSize: 13 }}>فاتورة رقم #{sale.id}</span>
                                                    <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>{new Date(sale.createdAt).toLocaleDateString('ar-EG')}</span>
                                                    {old && <span style={{ fontSize: 10, backgroundColor: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: 4 }}>⚠️ {ag} يوم</span>}
                                                    {prog > 0 && <div style={{ flex: 1, maxWidth: 80, height: 6, backgroundColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden', marginRight: 5 }}><div style={{ width: `${prog}%`, height: '100%', backgroundColor: prog >= 100 ? '#10b981' : '#f59e0b', borderRadius: 3, transition: 'width .3s' }} /></div>}
                                                    {prog > 0 && <span style={{ fontSize: 10, color: prog >= 100 ? '#10b981' : '#f59e0b' }}>{prog}%</span>}
                                                </div>
                                                <span style={{ fontWeight: 'bold', color: '#059669', fontSize: 13 }}>{sale.total?.toFixed(2)}</span>
                                            </div>
                                            {isSel && <div style={{ backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb' }}>
                                                {old && <div style={{ padding: '8px 14px', backgroundColor: '#fef3c7', fontSize: 12, color: '#92400e', borderBottom: '1px solid #fde68a' }}>⚠️ فاتورة قديمة ({ag} يوم)</div>}
                                                <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'flex-end' }}><button onClick={e => { e.stopPropagation(); returnAllItems(); }} style={{ padding: '5px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>↩ إرجاع كل الفاتورة</button></div>
                                                <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead style={{ backgroundColor: '#f9fafb' }}><tr><th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: '#4b5563' }}>المنتج</th><th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, color: '#4b5563' }}>بيع/مرتجع</th><th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, color: '#4b5563' }}>سعر</th><th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, color: '#4b5563' }}></th></tr></thead>
                                                    <tbody>{saleItems.map(it => <tr key={it.itemId} style={{ borderBottom: '1px solid #e5e7eb' }}><td style={{ padding: '8px 12px', fontSize: 13 }}><div style={{ fontWeight: 'bold' }}>{it.productName}</div><div style={{ fontSize: 11, color: '#6b7280' }}>{it.size} - {it.color}</div></td><td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12 }}>{it.soldQty}{it.alreadyReturned > 0 && <span style={{ color: '#ef4444', fontSize: 11 }}> ({it.alreadyReturned}↩)</span>}</td><td style={{ padding: '8px 12px', textAlign: 'center', color: '#059669', fontWeight: 'bold', fontSize: 13 }}>{it.price}</td><td style={{ padding: '8px 12px', textAlign: 'center' }}>{it.maxQuantity > 0 ? <button onClick={e => { e.stopPropagation(); addToCart(it); }} style={{ padding: '5px 12px', backgroundColor: '#e0f2fe', border: '1px solid #93c5fd', color: '#1e40af', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold', transition: 'all .2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#bfdbfe'} onMouseLeave={e => e.currentTarget.style.backgroundColor = '#e0f2fe'}>+ ({it.maxQuantity})</button> : <span style={{ fontSize: 11, color: '#9ca3af', backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>✓ تم</span>}</td></tr>)}</tbody></table>
                                            </div>}
                                        </div>;
                                    })}</div>}
                            </div>
                        ) : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#9ca3af', fontSize: 18, fontWeight: 'bold', textAlign: 'center', padding: 40 }}><div><div style={{ marginBottom: 10 }}><User size={48} color="#9ca3af" /></div><div>اختر عميل أو اكتب <span style={{ color: '#3b82f6' }}>#رقم_فاتورة</span></div><div style={{ fontSize: 12, marginTop: 10, color: '#d1d5db' }}>مثال: #1234</div></div></div>}
                    </>)}
                </div>

                {/* ── RIGHT: Cart + Customer ── */}
                <div style={{ flex: 3, display: 'flex', flexDirection: 'column', gap: 15, overflow: 'hidden' }}>
                    {/* Customer */}
                    <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: 15, boxShadow: '0 1px 3px rgba(0,0,0,.1)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {!selCust ? <div ref={custDDRef} style={{ display: 'flex', gap: 10, position: 'relative' }}><div style={{ flex: 1, position: 'relative' }}><div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}><input type="text" placeholder="ابحث عن عميل (الاسم أو الهاتف)..." value={custSearch} onChange={e => { setCustSearch(e.target.value); setShowCL(true); setCustIdx(-1); }} onFocus={() => setShowCL(true)} onKeyDown={handleCustKey} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #d1d5db', paddingLeft: 30 }} /><button onClick={() => { setShowCL(!showCustList); setCustSearch(''); }} style={{ position: 'absolute', left: 10, background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}>▼</button></div>
                            {showCustList && filtCust.length > 0 && <div ref={custListRef} style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, marginTop: 5, maxHeight: 200, overflowY: 'auto', zIndex: 100, boxShadow: '0 4px 6px rgba(0,0,0,.1)' }}>{filtCust.map((c, i) => <div key={c.id} data-ci={i} onClick={() => { setSessionCustomer(c); setCustSearch(''); setShowCL(false); setCustIdx(-1); }} style={{ padding: 10, borderBottom: '1px solid #f3f4f6', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', backgroundColor: custIdx === i ? '#fef08a' : '#fff', transition: 'background .2s' }} onMouseEnter={e => { setCustIdx(i); e.currentTarget.style.backgroundColor = '#fef08a' }} onMouseLeave={e => { setCustIdx(-1); e.currentTarget.style.backgroundColor = '#fff' }}><span style={{ fontWeight: 'bold' }}>{hl(c.name, custSearch)}</span><span style={{ color: '#6b7280', fontSize: 12 }}>{hl(c.phone || '', custSearch)}</span></div>)}</div>}
                        </div></div>
                            : <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#eff6ff', padding: 10, borderRadius: 8, border: '1px solid #bfdbfe' }}><div><span style={{ fontWeight: 'bold', color: '#1e40af' }}>{selCust.name}</span><span style={{ fontSize: 12, color: '#6b7280', marginRight: 10 }}>{selCust.phone}</span></div><div><span style={{ fontSize: 13, color: '#6b7280' }}>الرصيد: </span><span style={{ fontWeight: 'bold', color: (selCust.balance || 0) > 0 ? '#dc2626' : '#059669' }}>{(selCust.balance || 0).toFixed(2)}</span></div><button onClick={() => { setSessionCustomer(null); setCustSearch(''); }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 20 }}>×</button></div>}
                    </div>

                    {/* Cart */}
                    <div style={{ flex: 1, backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
                                <thead style={{ backgroundColor: '#f9fafb', position: 'sticky', top: 0, zIndex: 10 }}><tr><th style={{ padding: 12, textAlign: 'right', fontSize: 13, color: '#4b5563' }}>المنتج</th><th style={{ padding: 12, textAlign: 'center', fontSize: 13, color: '#4b5563' }}>السعر</th><th style={{ padding: 12, textAlign: 'center', fontSize: 13, color: '#4b5563' }}>الكمية</th><th style={{ padding: 12, textAlign: 'center', fontSize: 13, color: '#4b5563' }}>الإجمالي</th><th style={{ padding: 12, textAlign: 'center', fontSize: 13, color: '#4b5563' }}></th></tr></thead>
                                <tbody>
                                    {cart.length === 0 ? <tr><td colSpan="5" style={{ textAlign: 'center', padding: 30, color: '#9ca3af' }}>لا توجد منتجات في سلة المرتجع</td></tr>
                                        : cart.map(item => <tr key={item.itemId} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                            <td style={{ padding: 12 }}><div style={{ fontWeight: 'bold', fontSize: 14 }}>{item.productName}</div><div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{item.size} - {item.color} {item.saleId ? <span style={{ marginRight: 6, backgroundColor: '#fef2f2', color: '#dc2626', padding: '1px 6px', borderRadius: 4, fontSize: 10 }}>#{item.saleId}</span> : <span style={{ marginRight: 6, backgroundColor: '#f0fdf4', color: '#059669', padding: '1px 6px', borderRadius: 4, fontSize: 10 }}>حالي</span>}</div></td>
                                            <td style={{ padding: 12, textAlign: 'center' }}><input type="number" step="0.5" min="0" value={item.price || ''} onChange={e => updPrice(item.itemId, e.target.value)} disabled={!!item.saleId} style={{ width: 80, padding: 8, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, textAlign: 'center', backgroundColor: item.saleId ? '#f9fafb' : '#fff' }} onFocus={e => e.target.select()} /></td>
                                            <td style={{ padding: 12, textAlign: 'center' }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><button onClick={() => updQty(item.itemId, item.returnQty - 1, item.maxQuantity)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #d1d5db', backgroundColor: '#f9fafb', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>-</button><input type="number" min="1" value={item.returnQty || ''} onChange={e => updQty(item.itemId, e.target.value, item.maxQuantity)} style={{ width: 50, padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, textAlign: 'center', fontWeight: 'bold' }} onFocus={e => e.target.select()} /><button onClick={() => updQty(item.itemId, item.returnQty + 1, item.maxQuantity)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #d1d5db', backgroundColor: '#f9fafb', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button></div>{item.maxQuantity !== Infinity && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>أقصى: {item.maxQuantity}</div>}</td>
                                            <td style={{ padding: 12, textAlign: 'center' }}><span style={{ color: '#059669', fontWeight: 'bold' }}>{(item.price * item.returnQty).toFixed(2)}</span></td>
                                            <td style={{ padding: 12, textAlign: 'center' }}>
                                                <button
                                                    onClick={() => rmCart(item.itemId)}
                                                    title="حذف من السلة"
                                                    style={{ width: 30, height: 30, borderRadius: 8, border: 'none', backgroundColor: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: 15, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,.15)' }}
                                                ><Trash2 size={16} /></button>
                                            </td>
                                        </tr>)}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ Bottom Bar ═══ */}
            {/* ═══ Bottom Bar (3 Sections layout: Right: Actions, Middle: Notes/Balances, Left: Total) ═══ */}
            <div style={{ display: 'flex', gap: 15, marginTop: 15, alignItems: 'stretch' }}>

                {/* Section 1: Actions & Refund Mode (Right) - flex 3 to match Cart parent */}
                <div style={{ flex: 2.15, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 10, minHeight: notesPanelHeight }}>
                        <div style={{ flex: '0 0 200px', display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>تاريخ المرتجع:</label>
                            <input type="date" value={sess.returnDate || todayLocalISO()} onChange={e => upd({ returnDate: e.target.value })} style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>طريقة الرد:</label>
                            <div style={{ display: 'flex', gap: 5, flex: 1 }}>
                                <button onClick={() => upd({ refundMode: 'creditNote' })} disabled={!hasSelectedCustomer} style={{ flex: 1, height: '100%', padding: 11, borderRadius: 6, border: `2px solid ${effectiveRefundMode === 'creditNote' ? '#f59e0b' : '#e5e7eb'}`, backgroundColor: !hasSelectedCustomer ? '#f3f4f6' : (effectiveRefundMode === 'creditNote' ? '#fefce8' : '#fff'), color: !hasSelectedCustomer ? '#9ca3af' : (effectiveRefundMode === 'creditNote' ? '#92400e' : '#374151'), fontWeight: 'bold', fontSize: 13, cursor: hasSelectedCustomer ? 'pointer' : 'not-allowed', transition: 'all .2s' }}><span style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}><FileText size={16} /> رصيد</span></button>
                                <button onClick={() => upd({ refundMode: 'cashOut' })} style={{ flex: 1, height: '100%', padding: 11, borderRadius: 6, border: `2px solid ${effectiveRefundMode === 'cashOut' ? '#10b981' : '#e5e7eb'}`, backgroundColor: effectiveRefundMode === 'cashOut' ? '#ecfdf5' : '#fff', color: effectiveRefundMode === 'cashOut' ? '#047857' : '#374151', fontWeight: 'bold', fontSize: 13, cursor: 'pointer', transition: 'all .2s' }}><span style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}><Banknote size={16} /> نقدي</span></button>
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', marginTop: 'auto', minHeight: summaryCardHeight }}>
                        <button id="btn-confirm-return" onClick={() => handleCheckoutFlow(false)} disabled={cart.length === 0} style={{ flex: 1, height: '100%', padding: 14, backgroundColor: cart.length === 0 ? '#9ca3af' : '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 'bold', cursor: cart.length === 0 ? 'not-allowed' : 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,.1)' }}>تأكيد المرتجع (F1)</button>
                        <button id="btn-confirm-print-return" onClick={() => handleCheckoutFlow(true)} disabled={cart.length === 0} style={{ flex: 1, height: '100%', padding: 14, backgroundColor: cart.length === 0 ? '#9ca3af' : '#10b981', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 'bold', cursor: cart.length === 0 ? 'not-allowed' : 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,.1)' }}>تأكيد وطباعة (F2)</button>
                        <button onClick={() => { upd({ cart: [] }); showToast('تم الإفراغ', 'warning'); }} disabled={cart.length === 0} style={{ height: '100%', padding: '14px 20px', backgroundColor: cart.length === 0 ? '#9ca3af' : '#f59e0b', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 'bold', cursor: cart.length === 0 ? 'not-allowed' : 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,.1)' }}>إفراغ</button>
                    </div>
                </div>

                {/* Section 2: Middle Panel (Notes & Balances with summaries) */}
                <div style={{ flex: 1.7, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Notes Input */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: notesPanelHeight }}>
                        <label style={{ fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>ملاحظات:</label>
                        <textarea
                            value={sess.returnNotes}
                            onChange={e => upd({ returnNotes: e.target.value })}
                            style={{
                                flex: 1,
                                width: "100%",
                                padding: "8px",
                                borderRadius: "6px",
                                border: "1px solid #d1d5db",
                                fontSize: "13px",
                                resize: "none",
                                boxSizing: "border-box"
                            }}
                            placeholder="ملاحظات المرتجع..."
                        />
                    </div>

                    {/* Summaries Card */}
                    <div style={{ flex: 1, backgroundColor: 'white', padding: '8px', borderRadius: '8px', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '5px', minHeight: summaryCardHeight, boxSizing: 'border-box' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 'bold' }}>الملخص :</span>
                            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#166534' }}>{cartCount} وحدة · {cart.length} صنف</span>
                        </div>
                    </div>
                </div>

                {/* Section 3: Totals (Left) - matching width ratio of logic */}
                <div style={{ flex: 1.3, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,.1)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px' }}>

                        {/* Total Block at top */}
                        <div style={{ display: "flex", justifyContent: "space-between", backgroundColor: "#fef2f2", padding: "10px", borderRadius: "6px", alignItems: "center", border: "1px solid #fecaca" }}>
                            <span style={{ fontSize: "14px", fontWeight: "bold", color: "#991b1b" }}>الإجمالي:</span>
                            <div style={{ textAlign: 'left' }}>
                                <div style={{ fontSize: "24px", fontWeight: "bold", color: "#dc2626" }}>{cartTotal.toFixed(2)}</div>
                            </div>
                        </div>

                        {/* Balances below the Total */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto', paddingTop: '8px', borderTop: '1px dashed #e5e7eb' }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: "13px", color: "#6b7280" }}>الرصيد السابق :</span>
                                <span style={{ fontSize: "13px", fontWeight: "bold", color: "#4b5563" }}>
                                    {previousBalance.toFixed(2)}
                                </span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "5px" }}>
                                <span style={{ fontSize: "13px", color: "#6b7280" }}>بعد المرتجع :</span>
                                <span style={{ fontSize: "13px", fontWeight: "bold", color: "#d97706" }}>
                                    {nextBalance.toFixed(2)}
                                </span>
                            </div>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
}
