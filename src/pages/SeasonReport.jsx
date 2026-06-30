import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Banknote, Users, Package, ShoppingCart, TrendingUp, HandCoins, Printer, Download, ChevronDown, ChevronUp } from 'lucide-react';
import './SeasonReport.css';

const toAr = (v) => String(v ?? 0).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
const fmtM = (v) => toAr(Number(v || 0).toLocaleString('en', { maximumFractionDigits: 2 })) + ' ج.م';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function Section({ id, icon: Icon, title, open, onToggle, children }) {
  return (
    <div className="season-section">
      <button type="button" className="season-section-header" onClick={() => onToggle(id)}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon size={18} /> {title}</span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && <div style={{ overflowX: 'auto' }}>{children}</div>}
    </div>
  );
}

export default function SeasonReport() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ fromDate: today(), toDate: today(), supplierId: '', warehouseId: '' });
  const [sections, setSections] = useState({ stock: true, customers: true, expenses: false });
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [calcMode, setCalcMode] = useState('default');

  const toggle = (k) => setSections(p => ({ ...p, [k]: !p[k] }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await window.api.getSeasonReport({ 
        fromDate: filters.fromDate, 
        toDate: filters.toDate,
        supplierId: filters.supplierId || undefined,
        warehouseId: filters.warehouseId || undefined 
      });
      if (r?.error) throw new Error(r.error);
      setReport(r);
    } catch (e) {
      alert('خطأ: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const loadSuppliers = async () => {
      try {
        const res = await window.api.getSuppliers();
        if (Array.isArray(res)) setSuppliers(res);
      } catch (_) {}
    };
    const loadWarehouses = async () => {
      try {
        const res = await window.api.getWarehouses();
        if (Array.isArray(res)) setWarehouses(res);
      } catch (_) {}
    };
    void loadSuppliers();
    void loadWarehouses();
  }, []);

  const s = report?.summary || {};
  const d = report?.details || {};

  // Custom Calculation Logic
  let customNetPosition = 0;
  if (calcMode === 'default') {
    customNetPosition = s.netPosition; // (Cash + Pending + Stock) - (Purchases + Expenses)
  } else if (calcMode === 'cash_only_rest_negative') {
    customNetPosition = (s.cashSales + s.totalPaymentsReceived) - s.netPurchases - s.totalExpenses - s.pendingBalances - s.totalStockCost;
  } else if (calcMode === 'stock_negative') {
    customNetPosition = (s.cashSales + s.totalPaymentsReceived + s.pendingBalances) - s.netPurchases - s.totalExpenses - s.totalStockCost;
  }

  const isPos = customNetPosition >= 0;

  const handlePrint = useCallback(() => {
    if (!report) return;
    const isPos = customNetPosition >= 0;
    
    let formulaText = 'الافتراضي';
    if (calcMode === 'cash_only_rest_negative') formulaText = 'الكاش فقط موجب';
    if (calcMode === 'stock_negative') formulaText = 'المخزون سالب';

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box;font-family:'Cairo',sans-serif}body{padding:20px;font-size:14px}.h{text-align:center;margin-bottom:20px}.h h1{font-size:24px}.kpi{display:flex;gap:15px;margin:15px 0;flex-wrap:wrap}.kpi div{flex:1;min-width:140px;padding:15px;border:1px solid #ddd;border-radius:10px;text-align:center;background:#f9f9f9}.kpi div strong{display:block;font-size:18px;margin-top:8px}.result{margin:20px 0;padding:20px;background:#1e293b;color:white;border-radius:12px;text-align:center}.result h2{font-size:28px;color:${isPos ? '#34d399' : '#f87171'}}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ddd;padding:10px;text-align:right}th{background:#f0f0f0}</style></head><body>
      <div class="h"><h1>تقرير تحليل الموسم</h1><p>الفترة: ${toAr(filters.fromDate)} — ${toAr(filters.toDate)}</p></div>
      
      <div class="kpi">
        <div>المشتريات المستثمرة<strong>${fmtM(s.netPurchases)}</strong></div>
        <div>كاش فعلي محصّل<strong>${fmtM(s.cashSales + s.totalPaymentsReceived)}</strong></div>
        <div>أرصدة عند العملاء<strong>${fmtM(s.pendingBalances)}</strong></div>
        <div>بضاعة متبقية<strong>${fmtM(s.totalStockCost)}</strong></div>
      </div>

      <div class="result">
        <h3>صافي موقف الموسم (طريقة: ${formulaText})</h3>
        <h2>${isPos ? '✅ موجب (كسبان)' : '❌ سالب (خسران)'} بـ ${fmtM(Math.abs(customNetPosition))}</h2>
      </div>

      <h3>أكبر المديونيات</h3>
      <table><thead><tr><th>العميل</th><th>الرصيد</th></tr></thead><tbody>
      ${(d.customers || []).slice(0, 10).map(c => `<tr><td>${c.name}</td><td>${fmtM(c.balance)}</td></tr>`).join('') || '<tr><td colspan="2">لا يوجد</td></tr>'}
      </tbody></table>
    </body></html>`;
    window.api.printPreviewHTML?.({ html, title: 'تقرير الموسم' });
  }, [report, s, d, filters]);

  const KPI = ({ color, icon: I, label, value }) => (
    <div className={`season-kpi ${color}`}>
      <div className="season-kpi-icon"><I size={22} /></div>
      <div className="season-kpi-content">
        <div className="season-kpi-label">{label}</div>
        <div className="season-kpi-value">{value}</div>
      </div>
    </div>
  );

  return (
    <div className="season-page">
      <div className="season-header">
        <h1><Activity size={28} /> تحليل الموسم (الأرباح والسيولة)</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="season-btn ghost" onClick={handlePrint} disabled={!report}><Printer size={16} /> طباعة</button>
        </div>
      </div>

      <div className="season-filters-bar">
        <div className="season-filter-group">
          <span className="season-filter-label">من:</span>
          <input className="season-filter-input" type="date" value={filters.fromDate} onChange={e => setFilters(p => ({ ...p, fromDate: e.target.value }))} />
          <div style={{ width: 1, height: 16, background: '#cbd5e1', margin: '0 4px' }} />
          <span className="season-filter-label">إلى:</span>
          <input className="season-filter-input" type="date" value={filters.toDate} onChange={e => setFilters(p => ({ ...p, toDate: e.target.value }))} />
          <div style={{ width: 1, height: 16, background: '#cbd5e1', margin: '0 4px' }} />
          <span className="season-filter-label">المورد:</span>
          <select className="season-filter-input" style={{ cursor: 'pointer' }} value={filters.supplierId} onChange={e => setFilters(p => ({ ...p, supplierId: e.target.value }))}>
            <option value="">كل الموردين</option>
            {suppliers.map(sup => <option key={sup.id} value={sup.id}>{sup.name}</option>)}
          </select>
          <div style={{ width: 1, height: 16, background: '#cbd5e1', margin: '0 4px' }} />
          <span className="season-filter-label">المخزن (للمخزون):</span>
          <select className="season-filter-input" style={{ cursor: 'pointer' }} value={filters.warehouseId} onChange={e => setFilters(p => ({ ...p, warehouseId: e.target.value }))}>
            <option value="">كل المخازن</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <button className="season-btn primary" onClick={load} disabled={loading}>
          {loading ? 'جاري التحميل...' : 'تحديث التقرير'}
        </button>
      </div>

      {!loading && !report && <div className="season-empty">اضغط على تحديث لعرض التقرير</div>}

      {!loading && report && (
        <>
          <div className="season-kpi-grid">
            <KPI color="amber" icon={ShoppingCart} label="إجمالي المشتريات (بعد المرتجع)" value={fmtM(s.netPurchases)} />
            <KPI color="green" icon={TrendingUp} label="الكاش الفعلي (مبيعات + سداد)" value={fmtM(s.cashSales + s.totalPaymentsReceived)} />
            <KPI color="blue" icon={Users} label="أرصدة العملاء غير المحصلة" value={fmtM(s.pendingBalances)} />
            <KPI color="purple" icon={Package} label="تكلفة المخزون المتبقي" value={fmtM(s.totalStockCost)} />
          </div>

          <div style={{ background: 'white', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>معادلة حساب الصافي</h3>
              <select 
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                value={calcMode} 
                onChange={e => setCalcMode(e.target.value)}
              >
                <option value="default">الافتراضي (الكاش+العملاء+المخزون أصول)</option>
                <option value="cash_only_rest_negative">الكاش فقط موجب (الباقي سالب)</option>
                <option value="stock_negative">المخزون يعتبر سالب (خصم)</option>
              </select>
            </div>
            
            <div className="season-summary-box">
              <div className="season-summary-content">
                <div className="season-summary-formula">
                  
                  {/* Cash */}
                  <div className="season-formula-item">
                    <div className="season-formula-label">كاش محصل</div>
                    <span className="season-formula-val">{fmtM(s.cashSales + s.totalPaymentsReceived)}</span>
                  </div>
                  
                  <div className="season-formula-op">{['default', 'stock_negative'].includes(calcMode) ? '+' : '-'}</div>
                  
                  {/* Pending Balances */}
                  <div className="season-formula-item">
                    <div className="season-formula-label">أرصدة عملاء</div>
                    <span className="season-formula-val">{fmtM(s.pendingBalances)}</span>
                  </div>
                  
                  <div className="season-formula-op">{calcMode === 'default' ? '+' : '-'}</div>

                  {/* Stock */}
                  <div className="season-formula-item">
                    <div className="season-formula-label">المخزون</div>
                    <span className="season-formula-val">{fmtM(s.totalStockCost)}</span>
                  </div>

                  <div className="season-formula-op">-</div>

                  {/* Purchases */}
                  <div className="season-formula-item">
                    <div className="season-formula-label">مشتريات</div>
                    <span className="season-formula-val">{fmtM(s.netPurchases)}</span>
                  </div>

                  <div className="season-formula-op">-</div>

                  {/* Expenses */}
                  <div className="season-formula-item">
                    <div className="season-formula-label">مصروفات</div>
                    <span className="season-formula-val">{fmtM(s.totalExpenses)}</span>
                  </div>

                </div>

                <div className="season-summary-result">
                  <div className="season-result-label">صافي الموسم</div>
                  <div className={`season-result-value ${isPos ? 'positive' : 'negative'}`}>
                    {isPos ? '+' : '-'}{fmtM(Math.abs(customNetPosition))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Section id="stock" icon={Package} title="أكبر الأصناف المتبقية في المخزن (رأس مال متجمد)" open={sections.stock} onToggle={toggle}>
            <table className="season-table">
              <thead><tr><th>الصنف</th><th>الكمية المتبقية</th><th>التكلفة الإجمالية</th></tr></thead>
              <tbody>
                {(d.stock || []).length === 0 ? <tr><td colSpan="3" className="empty-cell">لا توجد بضاعة</td></tr> :
                  (d.stock || []).map((r, i) => <tr key={i}>
                    <td><strong>{r.name}</strong></td>
                    <td>{toAr(r.quantity)}</td>
                    <td style={{ color: '#b91c1c', fontWeight: 700 }}>{fmtM(r.totalCost)}</td>
                  </tr>)}
              </tbody>
            </table>
          </Section>

          <Section id="customers" icon={Users} title="أعلى العملاء مديونية (رصيد حالي)" open={sections.customers} onToggle={toggle}>
            <table className="season-table">
              <thead><tr><th>العميل</th><th>الرصيد المفتوح</th></tr></thead>
              <tbody>
                {(d.customers || []).length === 0 ? <tr><td colSpan="2" className="empty-cell">لا توجد ديون</td></tr> :
                  (d.customers || []).map((r, i) => <tr key={i}>
                    <td><strong>{r.name}</strong></td>
                    <td style={{ color: '#b91c1c', fontWeight: 700 }}>{fmtM(r.balance)}</td>
                  </tr>)}
              </tbody>
            </table>
          </Section>

          <Section id="expenses" icon={HandCoins} title="المصروفات في هذه الفترة" open={sections.expenses} onToggle={toggle}>
            <table className="season-table">
              <thead><tr><th>البند</th><th>القيمة</th></tr></thead>
              <tbody>
                {(d.expenses || []).length === 0 ? <tr><td colSpan="2" className="empty-cell">لا توجد مصروفات</td></tr> :
                  (d.expenses || []).map((r, i) => <tr key={i}>
                    <td><strong>{r.name}</strong></td>
                    <td style={{ color: '#b91c1c', fontWeight: 700 }}>{fmtM(r.total)}</td>
                  </tr>)}
              </tbody>
            </table>
          </Section>

        </>
      )}
    </div>
  );
}
