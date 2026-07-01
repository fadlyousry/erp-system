import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { 
  ShoppingCart, 
  PackagePlus, 
  Users, 
  Package, 
  RotateCcw, 
  RefreshCw, 
  Landmark, 
  Warehouse, 
  UserCog, 
  History,
  ChevronLeft
} from 'lucide-react';
import { APP_NAVIGATE_EVENT } from '../utils/posEditorBridge';
import './Dashboard.css';

const getTodayLabel = () =>
  new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

function LiveClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hh = String(time.getHours()).padStart(2, '0');
  const mm = String(time.getMinutes()).padStart(2, '0');
  const ss = String(time.getSeconds()).padStart(2, '0');
  const period = time.getHours() >= 12 ? 'م' : 'ص';

  return (
    <div className="db-clock">
      <div className="db-clock-digits">
        <span className="db-clock-hm">{hh}:{mm}</span>
        <span className="db-clock-ss">{ss}</span>
        <span className="db-clock-period">{period}</span>
      </div>
      <div className="db-clock-date">{getTodayLabel()}</div>
    </div>
  );
}

const QUICK_ACTIONS = [
  { page: 'pos',             icon: ShoppingCart, title: 'فاتورة البيع',        subtitle: 'إنشاء فاتورة بيع جديدة',          tone: 'sales'     },
  { page: 'purchases',       icon: PackagePlus,  title: 'فاتورة المشتريات',    subtitle: 'تسجيل مشتريات جديدة',              tone: 'purchases' },
  { page: 'customers',       icon: Users,        title: 'العملاء',             subtitle: 'بحث وإدارة حسابات العملاء',        tone: 'customers' },
  { page: 'products',        icon: Package,      title: 'المنتجات',            subtitle: 'إضافة وتعديل الأصناف',             tone: 'products'  },
  { page: 'returns',         icon: RotateCcw,    title: 'مرتجع المبيعات',     subtitle: 'إدخال مرتجعات العملاء',            tone: 'returns'   },
  { page: 'purchaseReturns', icon: RefreshCw,    title: 'مرتجع المشتريات',    subtitle: 'إدخال مرتجعات الموردين',           tone: 'returns'   },
  { page: 'treasury',        icon: Landmark,     title: 'الحسابات',            subtitle: 'متابعة الخزنة والتقارير',          tone: 'finance'   },
  { page: 'warehouses',      icon: Warehouse,    title: 'المخازن',             subtitle: 'إدارة المخزون والتحويلات',         tone: 'warehouse' },
];

export default function Dashboard({ user }) {
  const handleNavigate = useCallback((page) => {
    window.dispatchEvent(
      new CustomEvent(APP_NAVIGATE_EVENT, { detail: { page, reason: 'dashboard-shortcut' } })
    );
  }, []);

  const quickActions = useMemo(() => {
    const list = [...QUICK_ACTIONS];
    const isAdmin = user?.role === 'ADMIN' || user?.role?.name === 'ADMIN';
    if (isAdmin) {
      list.push({ page: 'users', icon: UserCog, title: 'المستخدمين', subtitle: 'إدارة الصلاحيات والحسابات', tone: 'settings' });
      list.push({ page: 'activityLog', icon: History, title: 'سجل العمليات', subtitle: 'مراقبة تحركات المستخدمين والنظام', tone: 'logs' });
    }
    return list;
  }, [user?.role]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'صباح الخير';
    if (h < 17) return 'مساء النور';
    return 'مساء الخير';
  }, []);

  return (
    <div className="db-root">

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="db-hero">
        <div className="db-hero-text">
          <p className="db-hero-eyebrow">النظام المتكامل لإدارة المبيعات</p>
          <h1 className="db-hero-title">لوحة التحكم الرئيسية</h1>
          <p className="db-hero-sub">مرحباً بك في نظام FYC Store Manager. يمكنك الوصول السريع لكافة الوظائف الأساسية من هنا.</p>

          <div className="db-hero-btns">
            <button className="db-btn db-btn-primary" onClick={() => handleNavigate('pos')}>
              <ShoppingCart size={18} /> بدء فاتورة بيع
            </button>
            <button className="db-btn db-btn-secondary" onClick={() => handleNavigate('purchases')}>
              <PackagePlus size={18} /> بدء فاتورة مشتريات
            </button>
          </div>
        </div>

        <LiveClock />
      </section>

      {/* ── Quick actions ─────────────────────────────────── */}
      <section className="db-section">
        <div className="db-section-head">
          <div>
            <h2 className="db-section-title">الاختصارات السريعة</h2>
            <p className="db-section-sub">الوصول الفوري للمهام والأقسام الأكثر استخداماً</p>
          </div>
        </div>

        <div className="db-grid">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.page}
                type="button"
                className={`db-card-btn tone-${action.tone}`}
                onClick={() => handleNavigate(action.page)}
              >
                <span className="db-card-icon">
                  <Icon size={24} />
                </span>
                <span className="db-card-body">
                  <strong>{action.title}</strong>
                  <small>{action.subtitle}</small>
                </span>
                <span className="db-card-arrow">
                   <ChevronLeft size={18} />
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
