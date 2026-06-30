import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BookOpen,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  KeyRound,
  Landmark,
  LayoutDashboard,
  MessageCircle,
  Package,
  PackagePlus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Settings as SettingsIcon,
  ShoppingCart,
  Sparkles,
  Truck,
  Undo2,
  UserRound,
  Users as UsersIcon,
  Warehouse,
  Percent
} from 'lucide-react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import EnhancedPOS from './pages/EnhancedPOS';
import Sales from './pages/Sales';
import PurchaseHistory from './pages/PurchaseHistory';
import Purchases from './pages/Purchases';
import Returns from './pages/Returns';
import PurchaseReturns from './pages/PurchaseReturns';
import SalesReturnsHistory from './pages/SalesReturnsHistory';
import PurchaseReturnsHistory from './pages/PurchaseReturnsHistory';
import Customers from './pages/Customers';
import Suppliers from './pages/Suppliers';
import Users from './pages/Users';
import Roles from './pages/Roles';
import ActivityLog from './pages/ActivityLog';
import Treasury from './pages/Treasury';
import ProfitReport from './pages/ProfitReport';
import SeasonReport from './pages/SeasonReport';
import Warehouses from './pages/Warehouses';
import Settings from './pages/Settings';
import Reports from './pages/Reports';
import WhatsApp from './pages/WhatsApp';
import AiMarketing from './pages/AiMarketing';
import Coupons from './pages/Coupons';
import LicensePage from './pages/LicensePage';
import FirstRunSetup from './pages/FirstRunSetup';
import ChatWidget from './components/ChatWidget';
import SmartAssistant from './components/SmartAssistant';
import FinancialDoctor from './components/FinancialDoctor';
import { APP_NAVIGATE_EVENT, APP_OPEN_LICENSE_EVENT } from './utils/posEditorBridge';
import { saveAppSettings } from './utils/appSettings';
import { PermissionsProvider, usePermissions } from './context/PermissionsContext';
import ExitConfirmationModal from './components/ExitConfirmationModal';
import './index.css';

const PageLoading = () => (
  <div className="page-loading" role="status" aria-label="جاري تحميل الصفحة">
    <div className="page-loading-spinner" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
  </div>
);

const PAGES_WITH_INTERNAL_SCROLL = new Set([
  'pos',
  'purchases',
  'returns',
  'purchaseReturns',
  'customers',
  'sales',
  'purchaseHistory',
  'returnsHistory',
  'purchaseReturnsHistory',
  'products',
  'reports_sold_items',
  'reports_item_movement'
]);

// Separate component to use the context hooks
function MainLayout({
  user,
  token,
  handleLogout,
  currentPage,
  setCurrentPage,
  openNavGroups,
  setOpenNavGroups,
}) {
  const { hasPermission } = usePermissions();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const newState = !prev;
      localStorage.setItem('sidebarCollapsed', newState);
      return newState;
    });
  };

  const fixedNavItems = useMemo(() => [
    { page: 'dashboard', icon: LayoutDashboard, label: 'لوحة التحكم' },
    { page: 'pos', icon: ShoppingCart, label: 'فاتورة البيع', permission: 'pos:view' },
    { page: 'customers', icon: UsersIcon, label: 'العملاء', permission: 'customers:view' },
    { page: 'treasury', icon: Landmark, label: 'الحسابات', permission: 'treasury:view' },
    { page: 'products', icon: Boxes, label: 'المنتجات', permission: 'products:view' }
  ].filter(item => !item.permission || hasPermission(item.permission)), [hasPermission]);

  const navSections = useMemo(() => ([
    {
      id: 'sales',
      title: 'المبيعات والمشتريات',
      items: [
        { page: 'purchases', icon: PackagePlus, label: 'فاتورة المشتريات', permission: 'purchases:create' },
        { page: 'sales', icon: ClipboardList, label: ' المبيعات السابقة', permission: 'sales:view' },
        { page: 'purchaseHistory', icon: BookOpen, label: 'المشتريات السابقة', permission: 'purchases:view' }
      ]
    },
    {
      id: 'returns',
      title: 'المرتجعات',
      items: [
        { page: 'returns', icon: ReceiptText, label: 'فاتورة مرتجع المبيعات', permission: 'returns:create' },
        { page: 'returnsHistory', icon: Undo2, label: 'سجل مرتجع المبيعات', permission: 'returns:view' },
        { page: 'purchaseReturns', icon: ReceiptText, label: 'فاتورة مرتجع المشتريات', permission: 'returns:create' },
        { page: 'purchaseReturnsHistory', icon: RotateCcw, label: 'سجل مرتجع المشتريات', permission: 'returns:view' }
      ]
    },
    {
      id: 'reports',
      title: 'التقارير',
      items: [
        { page: 'reports_sold_items', icon: Package, label: 'الأصناف المباعة', permission: 'reports:view' },
        { page: 'reports_item_movement', icon: RefreshCw, label: 'بيان حركة صنف', permission: 'reports:view' },
        { page: 'profitReport', icon: ReceiptText, label: 'تقرير الأرباح', permission: 'reports:profit' },
        { page: 'seasonReport', icon: Activity, label: 'تحليل الموسم', permission: 'reports:season' }
      ]
    },
    {
      id: 'management',
      title: 'الإدارة',
      items: [
        { page: 'ai-marketing', icon: Sparkles, label: 'التسويق الذكي (AI)', permission: 'aiMarketing:view' },
        { page: 'warehouses', icon: Warehouse, label: 'المخازن', permission: 'warehouses:view' },
        { page: 'suppliers', icon: Truck, label: 'الموردين', permission: 'suppliers:view' },
        { page: 'whatsapp', icon: MessageCircle, label: 'رسائل واتساب', permission: 'whatsapp:view' },
        { page: 'coupons', icon: Percent, label: 'أكواد الخصم (الكوبونات)', permission: 'coupons:view' }
      ]
    },
    {
      id: 'system',
      title: 'النظام',
      items: [
        { page: 'settings', icon: SettingsIcon, label: 'الإعدادات', permission: 'settings:view' },
        { page: 'users', icon: UserRound, label: 'المستخدمين', permission: 'users:view' },
        { page: 'roles', icon: KeyRound, label: 'الصلاحيات', permission: 'roles:manage' },
        { page: 'activityLog', icon: ScrollText, label: 'سجل العمليات', permission: 'activityLog:view' }
      ]
    }
  ].map(section => ({
    ...section,
    items: section.items.filter(item => !item.permission || hasPermission(item.permission))
  })).filter(section => section.items.length > 0)), [hasPermission]);

  useEffect(() => {
    const activeSection = navSections.find((section) =>
      section.items.some((item) => item.page === currentPage)
    );
    if (!activeSection) return;

    setOpenNavGroups((prev) => (
      prev[activeSection.id]
        ? prev
        : { ...prev, [activeSection.id]: true }
    ));
  }, [currentPage, navSections, setOpenNavGroups]);

  const useInternalScrollLayout = PAGES_WITH_INTERNAL_SCROLL.has(currentPage);

  const renderPage = () => {
    const checkPermission = (perm, element) => {
        return hasPermission(perm) ? element : <div className="p-10 text-center"><h3>ليس لديك صلاحية للوصول لهذه الصفحة</h3></div>;
    };

    switch (currentPage) {
      case 'dashboard':
        return <Dashboard token={token} user={user} />;
      case 'pos':
        return checkPermission('pos:view', <EnhancedPOS />);
      case 'sales':
        return checkPermission(
          'sales:view',
          <Sales />
        );
      case 'purchaseHistory':
        return checkPermission('purchases:view', <PurchaseHistory />);
      case 'purchases':
        return checkPermission('purchases:create', <Purchases />);
      case 'returns':
        return checkPermission('returns:create', <Returns />);
      case 'purchaseReturns':
        return checkPermission('returns:create', <PurchaseReturns />);
      case 'returnsHistory':
        return checkPermission('returns:view', <SalesReturnsHistory />);
      case 'purchaseReturnsHistory':
        return checkPermission('returns:view', <PurchaseReturnsHistory />);
      case 'products':
        return checkPermission('products:view', <Products />);
      case 'warehouses':
        return checkPermission('warehouses:view', <Warehouses />);
      case 'customers':
        return checkPermission('customers:view', <Customers />);
      case 'suppliers':
        return checkPermission('suppliers:view', <Suppliers />);
      case 'treasury':
        return checkPermission('treasury:view', <Treasury />);
      case 'settings':
        return checkPermission('settings:view', <Settings />);
      case 'users':
        return checkPermission('users:view', <Users />);
      case 'roles':
        return checkPermission('roles:manage', <Roles />);
      case 'activityLog':
        return checkPermission('activityLog:view', <ActivityLog />);
      case 'reports_sold_items':
        return checkPermission('reports:view', <Reports activeReport="sold-items" />);
      case 'reports_item_movement':
        return checkPermission('reports:view', <Reports activeReport="item-movement" />);
      case 'profitReport':
        return checkPermission('reports:profit', <ProfitReport />);
      case 'seasonReport':
        return checkPermission('reports:season', <SeasonReport />);
      case 'whatsapp':
        return checkPermission('whatsapp:view', <WhatsApp />);
      case 'ai-marketing':
        return checkPermission('aiMarketing:view', <AiMarketing />);
      case 'coupons':
        return checkPermission('coupons:view', <Coupons />);
      default:
        return <Dashboard token={token} user={user} />;
    }
  };

  const NavItem = ({ page, icon: Icon, label }) => (
      <li
      onClick={() => {
        setCurrentPage(page);
      }}
      title={isSidebarCollapsed ? label : ''}
      style={{
        padding: isSidebarCollapsed ? '10px 0' : '10px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
        gap: isSidebarCollapsed ? '0' : '8px',
        cursor: 'pointer',
        backgroundColor: currentPage === page ? '#334155' : 'transparent',
        border: currentPage === page ? '1px solid #475569' : '1px solid transparent',
        borderRadius: '8px',
        marginBottom: '6px',
        fontWeight: currentPage === page ? '700' : '500',
        fontSize: '14px',
        transition: 'all 0.2s'
      }}
      onMouseEnter={(event) => {
        if (currentPage !== page) event.currentTarget.style.backgroundColor = '#2d3748';
      }}
      onMouseLeave={(event) => {
        if (currentPage !== page) event.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <span
        style={{
          width: '20px',
          height: '20px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: currentPage === page ? '#e2e8f0' : '#cbd5e1',
          flexShrink: 0
        }}
      >
        <Icon size={isSidebarCollapsed ? 20 : 17} strokeWidth={2} aria-hidden="true" />
      </span>
      {!isSidebarCollapsed && <span>{label}</span>}
    </li>
  );

  const NavSection = ({ section }) => {
    const isOpen = openNavGroups[section.id] ?? false;
    const hasActiveItem = section.items.some((item) => item.page === currentPage);

    return (
      <div style={{ marginBottom: '10px' }}>
        {!isSidebarCollapsed && (
          <button
            type="button"
            onClick={() => setOpenNavGroups((prev) => ({ ...prev, [section.id]: !isOpen }))}
            style={{
              width: '100%',
              padding: '4px 6px 8px',
              background: 'transparent',
              border: 'none',
              color: hasActiveItem ? '#e2e8f0' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              fontWeight: '700',
              fontSize: '11px',
              letterSpacing: '0.4px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{section.title}</span>
              {isOpen ? (
                <ChevronDown size={13} strokeWidth={2.2} color="#cbd5e1" aria-hidden="true" />
              ) : (
                <ChevronLeft size={13} strokeWidth={2.2} color="#cbd5e1" aria-hidden="true" />
              )}
            </div>
          </button>
        )}

        {(isOpen || isSidebarCollapsed) && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {section.items.map((item) => (
              <NavItem key={item.page} page={item.page} icon={item.icon} label={item.label} />
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="app-container" style={{ display: 'flex', height: '100vh', overflow: 'hidden', direction: 'rtl' }}>
      <div
        className={`sidebar ${isSidebarCollapsed ? 'is-collapsed' : 'is-expanded'}`}
        style={{
          width: isSidebarCollapsed ? '80px' : '280px',
          backgroundColor: '#1e293b',
          color: 'white',
          padding: isSidebarCollapsed ? '16px 8px' : '16px 14px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), padding 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          willChange: 'width',
          position: 'relative'
        }}
      >
        <button
          onClick={toggleSidebar}
          style={{
            position: 'absolute',
            left: '-12px',
            top: '40px',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            backgroundColor: '#334155',
            color: 'white',
            border: '1px solid #475569',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            zIndex: 100,
            transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          title={isSidebarCollapsed ? 'توسيع القائمة' : 'تصغير القائمة'}
        >
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `rotate(${isSidebarCollapsed ? '180deg' : '0deg'})`,
            transition: 'transform 0.3s'
          }}>
            <ChevronRight size={14} strokeWidth={2.5} aria-hidden="true" />
          </span>
        </button>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            borderBottom: '2px solid #334155',
            paddingBottom: '16px',
            marginBottom: '8px',
            overflow: 'hidden'
          }}
        >
          <div 
            style={{ 
              width: isSidebarCollapsed ? '48px' : '72px', 
              height: isSidebarCollapsed ? '48px' : '72px', 
              borderRadius: '16px',
              backgroundColor: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
   
          >
            <img 
              src="icon.png" 
              alt="FADL ERP Logo" 
              style={{ 
                width: '100%', 
                height: '100%',
                objectFit: 'contain',
                marginTop: '30%',
                transform: 'scale(2.5)', // تكبير مع الحفاظ على التوسيط التام
              }} 
            />
          </div>
          {!isSidebarCollapsed && (
            <h2
              style={{
                fontSize: '22px',
                fontFamily: 'system-ui, sans-serif',
                fontWeight: '800',
                margin: 0,
                textAlign: 'center',
                letterSpacing: '1px',
                color: '#ffffff',
                whiteSpace: 'nowrap'
              }}
            >
              FADL ERP
            </h2>
          )}
        </div>

          <nav 
            className={isSidebarCollapsed ? 'no-scrollbar' : ''}
            style={{ 
              flex: 1, 
              minHeight: 0, 
              overflowY: 'auto', 
              padding: isSidebarCollapsed ? '2px 0' : '2px 4px 2px 0',
              scrollbarWidth: isSidebarCollapsed ? 'none' : 'auto',
              msOverflowStyle: isSidebarCollapsed ? 'none' : 'auto'
            }}
          >
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
            {fixedNavItems.map((item) => (
              <NavItem key={item.page} page={item.page} icon={item.icon} label={item.label} />
            ))}
          </ul>

          {navSections.map((section) => (
            <NavSection key={section.id} section={section} />
          ))}
        </nav>

        <div style={{ borderTop: '1px solid #334155', paddingTop: '12px' }}>
          {!isSidebarCollapsed && (
            <div
              style={{
                marginBottom: '10px',
                padding: '10px',
                backgroundColor: '#334155',
                borderRadius: '8px'
              }}
            >
              <div style={{ fontSize: '14px', marginBottom: '5px', fontWeight: 'bold' }}>{user?.name}</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                {(() => {
                  const roleName = user?.role?.name || user?.role;
                  if (roleName === 'ADMIN') return 'مدير النظام';
                  if (roleName === 'CASHIER') return 'كاشير';
                  if (roleName === 'STOREKEEPER') return 'أمين مخزن';
                  return roleName || 'مستخدم';
                })()}

              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            title={isSidebarCollapsed ? 'تسجيل خروج' : ''}
            style={{
              width: '100%',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              padding: '10px',
              borderRadius: isSidebarCollapsed ? '8px' : '5px',
              cursor: 'pointer',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
          >
            <svg 
              width={isSidebarCollapsed ? "20" : "18"} 
              height={isSidebarCollapsed ? "20" : "18"} 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2.5" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              style={{ transform: 'rotate(180deg)' }} // RTL Flip
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {!isSidebarCollapsed && <span>تسجيل خروج</span>}
          </button>
        </div>
      </div>

      <div
        className="main-content"
        style={{
          flex: 1,
          position: 'relative',
          padding: useInternalScrollLayout ? '10px' : '30px 30px 10px 30px',
          backgroundColor: '#f9fafb',
          overflowY: useInternalScrollLayout ? 'hidden' : 'auto'
        }}
      >
        {useMemo(
          () => renderPage(),
          [currentPage, token, user, hasPermission]
        )}
      </div>

      <ChatWidget currentUser={user} />
    </div>
  );
}

function App() {
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [isLicenseLoading, setIsLicenseLoading] = useState(true);
  const [setupStatus, setSetupStatus] = useState(null);
  const [isSetupLoading, setIsSetupLoading] = useState(true);
  const [isDatabaseReady, setIsDatabaseReady] = useState(false);
  const [showLicenseManager, setShowLicenseManager] = useState(false);
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [openNavGroups, setOpenNavGroups] = useState({
    sales: false,
    returns: false,
    management: false,
    system: false,
    reports: false
  });
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isFinancialDoctorOpen, setIsFinancialDoctorOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadLicenseStatus = async () => {
      try {
        const status = await window.licensing.getStatus();
        if (isMounted) {
          setLicenseStatus(status);
        }
      } catch (error) {
        console.error('License status check failed:', error);
        if (isMounted) {
          setLicenseStatus({
            status: 'CORRUPT',
            messageAr: 'تعذر قراءة حالة الترخيص. يرجى إعادة المحاولة.',
          });
        }
      } finally {
        if (isMounted) {
          setIsLicenseLoading(false);
        }
      }
    };

    loadLicenseStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadSetupStatus = async () => {
      try {
        const status = await window.api?.getSetupStatus?.();
        if (!isMounted) return;

        setSetupStatus(status || { setupCompleted: false, database: { configured: false, ready: false }, config: null });

        if (status?.config) {
          saveAppSettings({
            companyName: status.config.companyName,
            companyContactNumbers: status.config.companyContactNumbers,
            companyAddress: status.config.companyAddress
          });
        }
      } catch (error) {
        console.error('Setup status check failed:', error);
        if (isMounted) {
          setSetupStatus({ setupCompleted: false, database: { configured: false, ready: false }, config: null });
        }
      } finally {
        if (isMounted) {
          setIsSetupLoading(false);
        }
      }
    };

    loadSetupStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  // Poll for database readiness after setup is complete
  useEffect(() => {
    if (!setupStatus?.setupCompleted || !setupStatus?.database?.configured) return;
    if (setupStatus?.database?.ready) {
      setIsDatabaseReady(true);
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const status = await window.api?.getSetupStatus?.();
        if (cancelled) return;
        if (status?.database?.ready) {
          setIsDatabaseReady(true);
          setSetupStatus(status);
        } else {
          setTimeout(poll, 1000);
        }
      } catch {
        if (!cancelled) setTimeout(poll, 1000);
      }
    };
    setTimeout(poll, 500);
    return () => { cancelled = true; };
  }, [setupStatus]);

  useEffect(() => {
    // Sync current user with main process more aggressively
    // when database becomes ready or when setup status changes.
    // This handles cases where dbService was re-initialized in the backend.
    if (user && isDatabaseReady) {
      console.log('[App] Syncing user session with main process...');
      window.api?.setCurrentUser?.(user).then((res) => {
        if (res?.success) {
          console.log('[App] User session synced successfully');
        } else {
          console.error('[App] User session sync returned error:', res?.error);
        }
      }).catch((error) => {
        console.error('Failed to sync current user session:', error);
      });
    }
  }, [user, isDatabaseReady, setupStatus?.database?.mode]);

  useEffect(() => {
    const allowedPages = new Set([
      'pos',
      'dashboard',
      'sales',
      'purchaseHistory',
      'purchases',
      'purchaseReturns',
      'purchaseReturnsHistory',
      'returns',
      'returnsHistory',
      'products',
      'warehouses',
      'customers',
      'suppliers',
      'treasury',
      'settings',
      'users',
      'roles',
      'activityLog',
      'reports_sold_items',
      'reports_item_movement',
      'profitReport',
      'seasonReport',
      'whatsapp',
      'ai-marketing',
      'coupons'
    ]);

    const handleNavigate = (event) => {
      const targetPage = event?.detail?.page;
      if (!allowedPages.has(targetPage)) return;
      setCurrentPage(targetPage);
    };

    window.addEventListener(APP_NAVIGATE_EVENT, handleNavigate);
    
    const handleKeyDown = (e) => {
      if (((e.ctrlKey || e.metaKey) && e.key === 'k') || e.key === 'F12') {
        e.preventDefault();
        setIsAssistantOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener(APP_NAVIGATE_EVENT, handleNavigate);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const handleOpenLicenseManager = () => {
      setShowLicenseManager(true);
    };

    window.addEventListener(APP_OPEN_LICENSE_EVENT, handleOpenLicenseManager);
    return () => window.removeEventListener(APP_OPEN_LICENSE_EVENT, handleOpenLicenseManager);
  }, []);

  useEffect(() => {
    if (!window.api?.onExitRequested) return;

    const handleExitRequested = () => {
      setIsExitModalOpen(true);
    };

    window.api.onExitRequested(handleExitRequested);
    return () => window.api.offExitRequested?.();
  }, []);

  const handleLogin = (newToken, userData, remember = true) => {
    if (remember) {
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(userData));
    }
    window.api?.setCurrentUser?.(userData).catch((error) => {
      console.error('Failed to sync current user session:', error);
    });
    setToken(newToken);
    setUser(userData);
    setCurrentPage('dashboard');
  };

  const handleLogout = () => {
    window.api?.clearCurrentUser?.().catch((error) => {
      console.error('Failed to clear current user session:', error);
    });
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  const isLicenseAccessAllowed =
    licenseStatus?.status === 'ACTIVE' || licenseStatus?.status === 'TRIAL_ACTIVE';

  const requiresInitialSetup =
    !setupStatus?.setupCompleted
    || !setupStatus?.database?.configured;

  const renderAppContent = () => {
    if (isLicenseLoading || isSetupLoading) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            direction: 'rtl',
            backgroundColor: '#0f172a',
            color: '#e2e8f0',
            fontSize: '18px',
            fontWeight: '600',
          }}
        >
          جاري تجهيز النظام...
        </div>
      );
    }

    if (!isLicenseAccessAllowed || showLicenseManager) {
      return (
        <LicensePage
          onStatusChanged={(status) => setLicenseStatus(status)}
          onActivated={(status) => {
            setLicenseStatus(status);
            setShowLicenseManager(false);
          }}
          onClose={() => setShowLicenseManager(false)}
        />
      );
    }

    if (requiresInitialSetup) {
      return (
        <FirstRunSetup
          initialConfig={setupStatus?.config}
          setupStatus={setupStatus}
          onCompleted={(result) => {
            setSetupStatus({
              setupCompleted: true,
              database: result?.database || setupStatus?.database || { configured: false, ready: false },
              config: result?.config || null
            });
          }}
        />
      );
    }

    if (!token) {
      return (
        <Login onLogin={handleLogin} />
      );
    }

    return (
      <PermissionsProvider user={user}>
        <MainLayout 
          user={user}
          token={token}
          handleLogout={handleLogout}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          openNavGroups={openNavGroups}
          setOpenNavGroups={setOpenNavGroups}
        />
      </PermissionsProvider>
    );
  };

  return (
    <>
      {renderAppContent()}
      <ExitConfirmationModal 
        isOpen={isExitModalOpen} 
        onConfirm={(action) => {
          if (action === 'cancel') {
            setIsExitModalOpen(false);
          }
        }} 
      />
      <SmartAssistant
        isOpen={isAssistantOpen}
        onClose={() => setIsAssistantOpen(false)}
        onNavigate={(page) => setCurrentPage(page)}
        onOpenFinancialDoctor={() => {
          setIsAssistantOpen(false);
          setIsFinancialDoctorOpen(true);
        }}
        hasPermission={(perm) => {
          const roleName = String(user?.role?.name || user?.role || '').toUpperCase();
          if (roleName === 'ADMIN' || user?.id === 1 || user?.id === '1') return true;
          return user?.permissions && user?.permissions.includes(perm);
        }}
      />

      <FinancialDoctor
        isOpen={isFinancialDoctorOpen}
        onClose={() => setIsFinancialDoctorOpen(false)}
      />
    </>
  );
}

export default App;
