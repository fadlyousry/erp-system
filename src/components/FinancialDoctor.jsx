import React, { useState, useEffect } from 'react';

const FinancialDoctor = ({ isOpen, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchInsights();
    }
  }, [isOpen]);

  const fetchInsights = async () => {
    setLoading(true);
    try {
      const result = await window.api.getFinancialInsights();
      setData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div style={styles.headerTitle}>
            <span style={{ fontSize: '24px' }}>🧠</span> مركز الذكاء المالي v2.0
          </div>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        <div style={styles.content}>
          {loading ? (
            <div style={styles.loadingArea}>
              <div className="pulse-loader" style={styles.loader}></div>
              <div style={{ marginTop: '20px', fontSize: '18px' }}>جاري تشريح التدفقات النقدية والمخزون... 🧬</div>
            </div>
          ) : data?.error ? (
            <div style={{ color: 'red', textAlign: 'center', padding: '20px' }}>{data.error}</div>
          ) : (
            <div style={styles.container}>
              
              {/* Top Section: Health Score & Strategic Advice */}
              <div style={styles.topRow}>
                <div style={styles.healthCard}>
                  <div style={styles.scoreCircle}>
                    <div style={{ ...styles.scoreValue, color: getScoreColor(data.stats.healthScore) }}>
                      {data.stats.healthScore}
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>درجة الأداء</div>
                  </div>
                  <div style={{ textAlign: 'center', marginTop: '10px', fontWeight: 'bold' }}>الحالة العامة للمؤسسة</div>
                </div>

                <div style={styles.adviceCard}>
                  <div style={styles.adviceHeader}>✨ توصيات الذكاء الاصطناعي الاستراتيجية:</div>
                  <div style={styles.adviceText}>{data.summary}</div>
                </div>
              </div>

              {/* Middle Section: Forecast & Main Stats */}
              <div style={styles.statsGrid}>
                <ForecastCard 
                  label="المبيعات والمستهدف" 
                  current={data.stats.revenue.current} 
                  target={data.stats.revenue.forecast} 
                  unit="ج.م"
                />
                <SummaryCard 
                  label="صافي الربح الحقيقي" 
                  value={data.stats.profit.current} 
                  prev={data.stats.profit.previous} 
                />
                <SummaryCard 
                  label="إجمالي المصاريف" 
                  value={data.stats.expenses.current} 
                  prev={data.stats.expenses.previous} 
                  reverse
                />
              </div>

              {/* Bottom Section: Expenses & Dead Stock */}
              <div style={styles.bottomGrid}>
                <div style={styles.panel}>
                  <div style={styles.panelTitle}>📦 أصناف راكدة (تحتاج تسييل)</div>
                  {data.stats.deadStock.length > 0 ? (
                    <div style={styles.scrollList}>
                      {data.stats.deadStock.map((item, i) => (
                        <div key={i} style={styles.listItem}>
                          <span>{item.name}</span>
                          <span style={styles.badge}>{item.qty} قطعة</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={styles.emptyMsg}>المخزون يتحرك بشكل ممتاز! ✅</div>
                  )}
                </div>

                <div style={styles.panel}>
                  <div style={styles.panelTitle}>📊 مقارنة المصاريف</div>
                  <div style={styles.scrollList}>
                    {data.stats.expenseBreakdown.map((ex, i) => (
                      <div key={i} style={styles.listItem}>
                        <span>{ex.name}</span>
                        <span style={{ color: ex.percentChange > 0 ? '#ef4444' : '#10b981' }}>
                          {ex.percentChange > 0 ? '↑' : '↓'} {ex.percentChange}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Liquidity Row */}
              <div style={styles.healthRow}>
                <HealthItem label="السيولة المتاحة" value={data.stats.liquidity} color="#3b82f6" />
                <HealthItem label="ديون العملاء" value={data.stats.customersDebt} color="#f59e0b" />
                <HealthItem label="مستحقات الموردين" value={data.stats.suppliersDebt} color="#ef4444" />
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const getScoreColor = (score) => {
  if (score >= 80) return '#10b981';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
};

const ForecastCard = ({ label, current, target, unit }) => {
  const percent = Math.min(100, (current / target * 100) || 0);
  return (
    <div style={styles.card}>
      <div style={styles.cardLabel}>{label}</div>
      <div style={styles.cardValue}>{current.toLocaleString()} {unit}</div>
      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '5px' }}>مستهدف: {target.toLocaleString()}</div>
      <div style={styles.progressBg}>
        <div style={{ ...styles.progressFill, width: `${percent}%`, background: percent > 80 ? '#10b981' : '#6366f1' }}></div>
      </div>
    </div>
  );
};

const SummaryCard = ({ label, value, prev, reverse }) => {
  const diff = prev > 0 ? ((value - prev) / prev * 100).toFixed(1) : 100;
  const isUp = value >= prev;
  const isGood = reverse ? !isUp : isUp;
  return (
    <div style={styles.card}>
      <div style={styles.cardLabel}>{label}</div>
      <div style={styles.cardValue}>{value.toLocaleString()} ج.م</div>
      <div style={{ ...styles.cardSub, color: isGood ? '#10b981' : '#ef4444' }}>
        {isUp ? '↑' : '↓'} %{Math.abs(diff)} عن السابق
      </div>
    </div>
  );
};

const HealthItem = ({ label, value, color }) => (
  <div style={{ ...styles.healthItem, borderLeft: `4px solid ${color}` }}>
    <div style={{ fontSize: '13px', color: '#64748b' }}>{label}</div>
    <div style={{ fontSize: '18px', fontWeight: 'bold', color }}>{value.toLocaleString()} ج.م</div>
  </div>
);

const styles = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(2, 6, 23, 0.7)', backdropFilter: 'blur(12px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px'
  },
  modal: {
    background: '#f8fafc', width: '100%', maxWidth: '1000px', maxHeight: '90vh',
    borderRadius: '32px', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', border: '1px solid rgba(255,255,255,0.2)'
  },
  header: {
    padding: '25px 35px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
  },
  headerTitle: { fontSize: '22px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '12px', letterSpacing: '0.5px' },
  closeBtn: { background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', cursor: 'pointer', width: '30px', height: '30px', borderRadius: '50%', fontSize: '14px' },
  content: { padding: '35px', overflowY: 'auto', background: '#f8fafc' },
  container: { display: 'flex', flexDirection: 'column', gap: '25px' },
  topRow: { display: 'flex', gap: '20px', alignItems: 'stretch' },
  healthCard: {
    padding: '25px', background: 'white', borderRadius: '24px', width: '220px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0'
  },
  scoreCircle: {
    width: '100px', height: '100px', borderRadius: '50%', border: '8px solid #f1f5f9',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
  },
  scoreValue: { fontSize: '36px', fontWeight: '900', lineHeight: '1' },
  adviceCard: {
    flex: 1, padding: '25px', background: 'linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 100%)',
    borderRadius: '24px', border: '1px solid #E0E7FF', position: 'relative', overflow: 'hidden'
  },
  adviceHeader: { fontWeight: '800', color: '#4338ca', marginBottom: '15px', fontSize: '18px' },
  adviceText: { fontSize: '17px', color: '#1e293b', lineHeight: '1.7' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' },
  card: { padding: '25px', background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' },
  cardLabel: { fontSize: '14px', color: '#64748b', marginBottom: '8px', fontWeight: '600' },
  cardValue: { fontSize: '24px', fontWeight: '800', color: '#0f172a' },
  cardSub: { fontSize: '13px', marginTop: '8px', fontWeight: 'bold' },
  progressBg: { height: '8px', background: '#f1f5f9', borderRadius: '4px', marginTop: '15px', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: '4px', transition: 'width 1s ease-out' },
  bottomGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
  panel: { background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', padding: '25px' },
  panelTitle: { fontWeight: '800', fontSize: '16px', marginBottom: '20px', color: '#0f172a' },
  scrollList: { maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' },
  listItem: { padding: '12px 15px', background: '#f8fafc', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '14px', border: '1px solid #f1f5f9' },
  badge: { padding: '4px 10px', background: '#e2e8f0', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold' },
  healthRow: { display: 'flex', gap: '20px' },
  healthItem: { flex: 1, padding: '20px', background: 'white', borderRadius: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' },
  loadingArea: { padding: '120px 0', textAlign: 'center', color: '#6366f1' },
  loader: { width: '50px', height: '50px', border: '5px solid #f3f3f3', borderTop: '5px solid #6366f1', borderRadius: '50%', margin: '0 auto', animation: 'spin 1s linear infinite' },
  emptyMsg: { textAlign: 'center', padding: '40px 0', color: '#10b981', fontWeight: 'bold' }
};

export default FinancialDoctor;
