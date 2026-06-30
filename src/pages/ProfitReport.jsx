import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, TrendingUp, Package, HandCoins, Users, Tag, Banknote, RefreshCw, PieChart, ChevronDown, ChevronUp, AlertTriangle, Printer, Download } from 'lucide-react';
import './ProfitReport.css';

const toAr = (v) => String(v ?? 0).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
const fmtM = (v) => toAr(Number(v || 0).toLocaleString('en', { maximumFractionDigits: 2 })) + ' ج.م';
const fmtD = (v) => { if (!v) return '-'; const d = new Date(v); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

const CHART_COLORS = ['#10b981','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#06b6d4','#ec4899','#64748b'];

function DonutChart({ data, size = 140 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return null;
  const r = size / 2, cx = r, cy = r, ir = r * 0.6;
  let cum = 0;
  const arcs = data.map((d, i) => {
    const pct = d.value / total;
    const start = cum * 2 * Math.PI - Math.PI / 2;
    cum += pct;
    const end = cum * 2 * Math.PI - Math.PI / 2;
    const la = pct > 0.5 ? 1 : 0;
    const path = `M${cx + ir * Math.cos(start)},${cy + ir * Math.sin(start)} L${cx + r * Math.cos(start)},${cy + r * Math.sin(start)} A${r},${r} 0 ${la} 1 ${cx + r * Math.cos(end)},${cy + r * Math.sin(end)} L${cx + ir * Math.cos(end)},${cy + ir * Math.sin(end)} A${ir},${ir} 0 ${la} 0 ${cx + ir * Math.cos(start)},${cy + ir * Math.sin(start)}Z`;
    return <path key={i} d={path} fill={CHART_COLORS[i % CHART_COLORS.length]} />;
  });
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>{arcs}</svg>;
}

function BarChart({ data, color = 'green' }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="chart-bar-container">
      {data.slice(0, 8).map((d, i) => (
        <div key={i} className="chart-bar-row">
          <div className="chart-bar-label" title={d.label}>{d.label}</div>
          <div className="chart-bar-track">
            <div className={`chart-bar-fill ${color}`} style={{ width: `${Math.max(2, (d.value / max) * 100)}%` }}>{d.value > max * 0.15 ? fmtM(d.value) : ''}</div>
          </div>
          <div className="chart-bar-value">{fmtM(d.value)}</div>
        </div>
      ))}
    </div>
  );
}

function Section({ id, icon: Icon, title, count, open, onToggle, children }) {
  return (
    <div className="profit-section">
      <button type="button" className="profit-section-header" onClick={() => onToggle(id)}>
        <span><Icon size={18} style={{ marginInlineEnd: '8px' }} /> {title} ({toAr(count)})</span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && <div className="table-wrap">{children}</div>}
    </div>
  );
}

export default function ProfitReport() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ fromDate: today(), toDate: today(), customerId: '', categoryId: '', saleType: 'ALL' });
  const [sections, setSections] = useState({ products: true, categories: true, expenses: true, customers: false, invoices: false, returns: false });
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);

  const toggle = (k) => setSections(p => ({ ...p, [k]: !p[k] }));
  const s = report?.summary || {};

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await window.api.getProfitReport({
        fromDate: filters.fromDate, toDate: filters.toDate,
        customerId: filters.customerId ? Number(filters.customerId) : undefined,
        categoryId: filters.categoryId ? Number(filters.categoryId) : undefined,
        saleType: filters.saleType !== 'ALL' ? filters.saleType : undefined
      });
      if (r?.error) throw new Error(r.error);
      setReport(r);
    } catch (e) { alert('خطأ: ' + e.message); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const [c1, c2] = await Promise.all([window.api.getCategories(), window.api.getCustomers({ lightweight: true })]);
        if (Array.isArray(c1)) setCategories(c1);
        setCustomers(Array.isArray(c2) ? c2 : (c2?.data || []));
      } catch (_) {}
    })();
  }, []);

  const handlePrint = useCallback(() => {
    if (!report) return;
    const rows = (report.products || []).slice(0, 30).map(r =>
      `<tr><td>${r.productName}</td><td>${toAr(r.quantitySold)}</td><td>${fmtM(r.avgSalePrice)}</td><td>${fmtM(r.cost)}</td><td>${fmtM(r.profit)}</td><td>${toAr(r.marginPercent)}٪</td></tr>`
    ).join('');
    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box;font-family:'Cairo',sans-serif}body{padding:20px;font-size:13px}.h{text-align:center;margin-bottom:16px}.h h1{font-size:20px}.kpi{display:flex;gap:12px;margin:12px 0;flex-wrap:wrap}.kpi div{flex:1;min-width:120px;padding:10px;border:1px solid #ddd;border-radius:8px;text-align:center}.kpi div strong{display:block;font-size:16px;margin-top:4px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ddd;padding:8px;text-align:right}th{background:#f0f0f0}h2{font-size:16px;margin-top:16px}</style></head><body>
    <div class="h"><h1>تقرير الأرباح المفصّل</h1><p>الفترة: ${toAr(filters.fromDate)} — ${toAr(filters.toDate)}</p></div>
    <div class="kpi"><div>إجمالي المبيعات<strong>${fmtM(s.totalSalesRevenue)}</strong></div><div>تكلفة البضاعة<strong>${fmtM(s.totalCOGS)}</strong></div><div>إجمالي الربح<strong>${fmtM(s.grossProfit)}</strong></div><div>صافي الربح<strong>${fmtM(s.netProfit)}</strong></div></div>
    <div class="kpi"><div>الخصومات<strong>${fmtM(s.totalDiscounts)}</strong></div><div>المرتجعات<strong>${fmtM(s.totalReturnsProfitLost)}</strong></div><div>المصروفات<strong>${fmtM(s.totalExpenses)}</strong></div><div>هامش صافي<strong>${toAr(s.netMarginPercent)}٪</strong></div></div>
    <h2>أعلى المنتجات ربحية</h2><table><thead><tr><th>المنتج</th><th>الكمية</th><th>متوسط البيع</th><th>التكلفة</th><th>الربح</th><th>الهامش</th></tr></thead><tbody>${rows || '<tr><td colspan="6" style="text-align:center">لا توجد بيانات</td></tr>'}</tbody></table>
    </body></html>`;
    window.api.printPreviewHTML?.({ html, title: 'تقرير الأرباح' });
  }, [report, s, filters]);

  const handleExcel = useCallback(async () => {
    if (!report) return;
    try {
      const XLSX = (await import('xlsx')).default || (await import('xlsx'));
      const wb = XLSX.utils.book_new();
      // Summary
      const sumData = [
        ['البند', 'القيمة'],
        ['إجمالي المبيعات', s.totalSalesRevenue], ['تكلفة البضاعة', s.totalCOGS],
        ['إجمالي الربح', s.grossProfit], ['هامش الربح %', s.grossMarginPercent],
        ['المرتجعات', s.totalReturnsProfitLost], ['المصروفات', s.totalExpenses],
        ['صافي الربح', s.netProfit], ['هامش صافي %', s.netMarginPercent],
        ['عدد الفواتير', s.invoiceCount], ['متوسط ربح الفاتورة', s.avgProfitPerInvoice]
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sumData), 'الملخص');
      // Products
      const prodData = [['المنتج', 'التصنيف', 'الكمية', 'متوسط البيع', 'التكلفة', 'الإيراد', 'التكلفة الإجمالية', 'الربح', 'الهامش %']];
      (report.products || []).forEach(r => prodData.push([r.productName, r.categoryName, r.quantitySold, r.avgSalePrice, r.cost, r.totalRevenue, r.totalCOGS, r.profit, r.marginPercent]));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prodData), 'المنتجات');
      // Invoices
      const invData = [['#', 'التاريخ', 'العميل', 'النوع', 'الإجمالي', 'التكلفة', 'الربح', 'الهامش %']];
      (report.invoices || []).forEach(r => invData.push([r.saleId, fmtD(r.invoiceDate), r.customerName, r.saleType, r.invoiceTotal, r.cogs, r.profit, r.marginPercent]));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(invData), 'الفواتير');
      // Categories
      const catData = [['التصنيف', 'المنتجات', 'الكمية', 'الإيراد', 'التكلفة', 'الربح', 'الهامش %']];
      (report.categories || []).forEach(r => catData.push([r.categoryName, r.productCount, r.quantitySold, r.totalRevenue, r.totalCOGS, r.profit, r.marginPercent]));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(catData), 'التصنيفات');
      // Customers
      const custData = [['العميل', 'الفواتير', 'المشتريات', 'الربح', 'الهامش %']];
      (report.customers || []).forEach(r => custData.push([r.customerName, r.invoiceCount, r.totalRevenue, r.totalProfit, r.marginPercent]));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(custData), 'العملاء');
      XLSX.writeFile(wb, `تقرير_الأرباح_${filters.fromDate}_${filters.toDate}.xlsx`);
    } catch (e) { alert('خطأ في التصدير: ' + e.message); }
  }, [report, s, filters]);

  const catChartData = useMemo(() => (report?.categories || []).slice(0, 8).map(c => ({ label: c.categoryName, value: Math.max(0, c.profit) })), [report]);
  const expChartData = useMemo(() => (report?.expenses?.byCategory || []).slice(0, 8).map(c => ({ label: c.categoryName, value: c.total })), [report]);

  const KPI = ({ color, icon: I, label, value, sub }) => (
    <div className={`profit-kpi ${color}`}><div className="profit-kpi-icon"><I size={22} /></div>
      <div className="profit-kpi-content"><div className="profit-kpi-label">{label}</div><div className="profit-kpi-value">{value}</div>{sub && <div className="profit-kpi-sub">{sub}</div>}</div></div>
  );

  return (
    <div className="profit-page">
      <div className="profit-header">
        <h1><BarChart3 size={28} /> تقرير الأرباح المفصّل</h1>
        <div className="profit-header-actions">
          <button className="profit-btn ghost" onClick={handlePrint} disabled={!report}><Printer size={16} /> طباعة</button>
          <button className="profit-btn ghost" onClick={handleExcel} disabled={!report}><Download size={16} /> Excel</button>
        </div>
      </div>

      <div className="profit-filters-bar">
        <div className="profit-filter-group">
          <span className="profit-filter-label">من:</span>
          <input className="profit-filter-input" type="date" value={filters.fromDate} onChange={e => setFilters(p => ({ ...p, fromDate: e.target.value }))} />
          <div className="profit-filter-divider" />
          <span className="profit-filter-label">إلى:</span>
          <input className="profit-filter-input" type="date" value={filters.toDate} onChange={e => setFilters(p => ({ ...p, toDate: e.target.value }))} />
        </div>
        <select className="profit-filter-select" value={filters.saleType} onChange={e => setFilters(p => ({ ...p, saleType: e.target.value }))}>
          <option value="ALL">كل الأنواع</option><option value="نقدي">نقدي</option><option value="آجل">آجل</option>
        </select>
        <select className="profit-filter-select" value={filters.categoryId} onChange={e => setFilters(p => ({ ...p, categoryId: e.target.value }))}>
          <option value="">كل التصنيفات</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="profit-filter-select" value={filters.customerId} onChange={e => setFilters(p => ({ ...p, customerId: e.target.value }))}>
          <option value="">كل العملاء</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loading && <div className="profit-empty">جاري تحميل التقرير...</div>}

      {!loading && !report && <div className="profit-empty"><BarChart3 size={48} style={{ marginBottom: 12, opacity: 0.5 }} /><div>حدد التاريخ لعرض التقرير</div></div>}

      {!loading && report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* KPIs */}
          <div className="profit-kpi-grid">
            <KPI color="blue" icon={Banknote} label="إجمالي المبيعات" value={fmtM(s.totalSalesRevenue)} />
            <KPI color="red" icon={Package} label="تكلفة البضاعة" value={fmtM(s.totalCOGS)} />
            <KPI color="green" icon={TrendingUp} label="إجمالي الربح" value={fmtM(s.grossProfit)} sub={`هامش: ${toAr(s.grossMarginPercent)}٪`} />
            <KPI color={s.netProfit >= 0 ? 'green' : 'red'} icon={BarChart3} label="صافي الربح النهائي" value={fmtM(s.netProfit)} sub={`هامش: ${toAr(s.netMarginPercent)}٪`} />
            <KPI color="amber" icon={Tag} label="الخصومات" value={fmtM(s.totalDiscounts)} />
            <KPI color="red" icon={RefreshCw} label="ربح مفقود (مرتجعات)" value={fmtM(s.totalReturnsProfitLost)} />
            <KPI color="red" icon={HandCoins} label="المصروفات" value={fmtM(s.totalExpenses)} />
            <KPI color="purple" icon={PieChart} label="متوسط ربح الفاتورة" value={fmtM(s.avgProfitPerInvoice)} sub={`${toAr(s.invoiceCount)} فاتورة`} />
          </div>

          {s.itemsWithNoCost > 0 && (
            <div className="profit-warning"><AlertTriangle size={18} /><span>تنبيه: <strong>{toAr(s.itemsWithNoCost)}</strong> صنف بدون تكلفة محددة</span></div>
          )}

          {/* Charts */}
          {(catChartData.length > 0 || expChartData.length > 0) && (
            <div className="profit-charts-row">
              {catChartData.length > 0 && (
                <div className="profit-chart-card">
                  <h3 className="profit-chart-title"><Tag size={18} /> الربح حسب التصنيف</h3>
                  <div className="donut-container">
                    <DonutChart data={catChartData} />
                    <div className="donut-legend">
                      {catChartData.slice(0, 6).map((d, i) => (
                        <div key={i} className="donut-legend-item">
                          <span className="donut-legend-dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                          <span>{d.label}</span>
                          <span className="donut-legend-value">{fmtM(d.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {(report.products || []).length > 0 && (
                <div className="profit-chart-card">
                  <h3 className="profit-chart-title"><Package size={18} /> أعلى المنتجات ربحية</h3>
                  <BarChart data={(report.products || []).slice(0, 8).map(p => ({ label: p.productName, value: Math.max(0, p.profit) }))} color="green" />
                </div>
              )}
            </div>
          )}

          {/* Products */}
          <Section id="products" icon={Package} title="تفاصيل المنتجات" count={(report.products||[]).length} open={sections.products} onToggle={toggle}>
            <table className="profit-table"><thead><tr><th>المنتج</th><th>التصنيف</th><th>الكمية</th><th>متوسط البيع</th><th>التكلفة</th><th>الإيراد</th><th>إج. التكلفة</th><th>الربح</th><th>الهامش</th></tr></thead>
            <tbody>{(report.products||[]).length===0?<tr><td colSpan="9" className="empty-cell">لا توجد بيانات</td></tr>:
              (report.products||[]).slice(0,50).map((r,i)=><tr key={i}><td><strong>{r.productName}</strong>{r.variantLabel&&<span style={{fontSize:'0.8em',color:'#64748b',marginRight:6}}>({r.variantLabel})</span>}{!r.hasCost&&<AlertTriangle size={14} style={{color:'#f59e0b',marginRight:4}} />}</td><td style={{color:'#64748b'}}>{r.categoryName}</td><td>{toAr(r.quantitySold)}</td><td>{fmtM(r.avgSalePrice)}</td><td>{fmtM(r.cost)}</td><td className="in-text">{fmtM(r.totalRevenue)}</td><td className="out-text">{fmtM(r.totalCOGS)}</td><td style={{fontWeight:700,color:r.profit>=0?'#047857':'#dc2626'}}>{fmtM(r.profit)}</td><td>{toAr(r.marginPercent)}٪</td></tr>)}
            </tbody></table>
          </Section>

          {/* Categories */}
          <Section id="categories" icon={Tag} title="الربح حسب التصنيف" count={(report.categories||[]).length} open={sections.categories} onToggle={toggle}>
            <table className="profit-table"><thead><tr><th>التصنيف</th><th>المنتجات</th><th>الكمية</th><th>الإيراد</th><th>التكلفة</th><th>الربح</th><th>الهامش</th></tr></thead>
            <tbody>{(report.categories||[]).length===0?<tr><td colSpan="7" className="empty-cell">لا توجد بيانات</td></tr>:
              (report.categories||[]).map((r,i)=><tr key={i}><td><strong>{r.categoryName}</strong></td><td>{toAr(r.productCount)}</td><td>{toAr(r.quantitySold)}</td><td className="in-text">{fmtM(r.totalRevenue)}</td><td className="out-text">{fmtM(r.totalCOGS)}</td><td style={{fontWeight:700,color:r.profit>=0?'#047857':'#dc2626'}}>{fmtM(r.profit)}</td><td>{toAr(r.marginPercent)}٪</td></tr>)}
            </tbody></table>
          </Section>

          {/* Expenses */}
          <Section id="expenses" icon={HandCoins} title={`المصروفات التشغيلية (${fmtM(report.expenses?.total)})`} count={(report.expenses?.byCategory||[]).length} open={sections.expenses} onToggle={toggle}>
            <table className="profit-table"><thead><tr><th>التصنيف</th><th>العدد</th><th>الإجمالي</th><th>% من الإيراد</th></tr></thead>
            <tbody>{(report.expenses?.byCategory||[]).length===0?<tr><td colSpan="4" className="empty-cell">لا توجد مصروفات</td></tr>:
              (report.expenses?.byCategory||[]).map((r,i)=><tr key={i}><td><strong>{r.categoryName}</strong></td><td>{toAr(r.count)}</td><td className="out-text">{fmtM(r.total)}</td><td>{toAr(r.percentOfRevenue)}٪</td></tr>)}
            </tbody></table>
          </Section>

          {/* Customers */}
          <Section id="customers" icon={Users} title="الربح حسب العميل" count={(report.customers||[]).length} open={sections.customers} onToggle={toggle}>
            <table className="profit-table"><thead><tr><th>العميل</th><th>الفواتير</th><th>المشتريات</th><th>الربح</th><th>الهامش</th></tr></thead>
            <tbody>{(report.customers||[]).length===0?<tr><td colSpan="5" className="empty-cell">لا توجد بيانات</td></tr>:
              (report.customers||[]).map((r,i)=><tr key={i}><td><strong>{r.customerName}</strong></td><td>{toAr(r.invoiceCount)}</td><td>{fmtM(r.totalRevenue)}</td><td style={{fontWeight:700,color:r.totalProfit>=0?'#047857':'#dc2626'}}>{fmtM(r.totalProfit)}</td><td>{toAr(r.marginPercent)}٪</td></tr>)}
            </tbody></table>
          </Section>

          {/* Invoices */}
          <Section id="invoices" icon={Banknote} title="تفاصيل الفواتير" count={(report.invoices||[]).length} open={sections.invoices} onToggle={toggle}>
            <table className="profit-table"><thead><tr><th>#</th><th>التاريخ</th><th>العميل</th><th>النوع</th><th>الإجمالي</th><th>التكلفة</th><th>الخصم</th><th>الربح</th><th>الهامش</th></tr></thead>
            <tbody>{(report.invoices||[]).length===0?<tr><td colSpan="9" className="empty-cell">لا توجد فواتير</td></tr>:
              (report.invoices||[]).map(r=><tr key={r.saleId}><td>{toAr(r.saleId)}</td><td>{fmtD(r.invoiceDate)}</td><td>{r.customerName}</td><td><span className="profit-type-badge">{r.saleType}</span></td><td>{fmtM(r.invoiceTotal)}</td><td className="out-text">{fmtM(r.cogs)}</td><td>{fmtM(r.itemDiscount+r.saleDiscount)}</td><td style={{fontWeight:700,color:r.profit>=0?'#047857':'#dc2626'}}>{fmtM(r.profit)}</td><td>{toAr(r.marginPercent)}٪</td></tr>)}
            </tbody></table>
          </Section>

          {/* Returns */}
          <Section id="returns" icon={RefreshCw} title="تحليل المرتجعات" count={(report.returns||[]).length} open={sections.returns} onToggle={toggle}>
            <table className="profit-table"><thead><tr><th>رقم المرتجع</th><th>فاتورة الأصل</th><th>التاريخ</th><th>العميل</th><th>المبلغ</th><th>الربح المفقود</th></tr></thead>
            <tbody>{(report.returns||[]).length===0?<tr><td colSpan="6" className="empty-cell">لا توجد مرتجعات</td></tr>:
              (report.returns||[]).map(r=><tr key={r.returnId}><td>{toAr(r.returnId)}</td><td>{r.saleId?`#${toAr(r.saleId)}`:'-'}</td><td>{fmtD(r.createdAt)}</td><td>{r.customerName}</td><td>{fmtM(r.amount)}</td><td className="out-text" style={{fontWeight:700}}>{fmtM(r.profitLost)}</td></tr>)}
            </tbody></table>
          </Section>
        </div>
      )}
    </div>
  );
}
