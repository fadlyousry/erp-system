import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { getCompanyName } from '../utils/appSettings';

const REMEMBERED_LOGIN_KEY = 'remembered_login_credentials';

const readRememberedLogin = () => {
  try {
    const raw = localStorage.getItem(REMEMBERED_LOGIN_KEY);
    if (!raw) return { username: '', password: '', rememberMe: true };
    const parsed = JSON.parse(raw);
    return {
      username: String(parsed?.username || ''),
      password: String(parsed?.password || ''),
      rememberMe: Boolean(parsed?.rememberMe)
    };
  } catch {
    return { username: '', password: '', rememberMe: true };
  }
};

const saveRememberedLogin = ({ username, password, rememberMe }) => {
  localStorage.setItem(REMEMBERED_LOGIN_KEY, JSON.stringify({ username, password, rememberMe }));
};

const clearRememberedLogin = () => {
  localStorage.removeItem(REMEMBERED_LOGIN_KEY);
};

export default function Login({ onLogin }) {
  const rememberedLogin = readRememberedLogin();
  const [username, setUsername] = useState(rememberedLogin.username);
  const [password, setPassword] = useState(rememberedLogin.password);
  const [rememberMe, setRememberMe] = useState(rememberedLogin.rememberMe);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isDbPreparing, setIsDbPreparing] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [logoClicks, setLogoClicks] = useState(0);
  const logoTimeoutRef = React.useRef(null);

  React.useEffect(() => {
    return () => {
      if (logoTimeoutRef.current) clearTimeout(logoTimeoutRef.current);
    };
  }, []);

  const handleLogoClick = () => {
    const nextClicks = logoClicks + 1;
    if (nextClicks >= 5) {
      setShowSettings(true);
      setLogoClicks(0);
      if (logoTimeoutRef.current) {
        clearTimeout(logoTimeoutRef.current);
        logoTimeoutRef.current = null;
      }
    } else {
      setLogoClicks(nextClicks);
      if (logoTimeoutRef.current) {
        clearTimeout(logoTimeoutRef.current);
      }
      logoTimeoutRef.current = setTimeout(() => {
        setLogoClicks(0);
      }, 2000);
    }
  };

  const companyName = getCompanyName() || 'FYC Store Manager';

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!window.api) {
        setError('يجب تشغيل التطبيق عبر Electron وليس المتصفح');
        setLoading(false);
        return;
      }

      const result = await window.api.login({ username, password, rememberMe });
      
      if (result.error) {
        if (result.error.includes('قاعدة البيانات غير جاهزة')) {
          handleDbNotReady();
          return;
        }
        setError(result.error);
        setIsDbPreparing(false);
        setRetryCount(0);
        setLoading(false); 
      } else {
        if (rememberMe) {
          saveRememberedLogin({ username, password, rememberMe: true });
        } else {
          clearRememberedLogin();
        }
        onLogin(result.token, result.user, rememberMe);
      }
    } catch (err) {
      if (err.message.includes('قاعدة البيانات غير جاهزة')) {
        handleDbNotReady();
        return;
      }
      setError(`خطأ في الاتصال بالنظام: ${err.message}`);
      setIsDbPreparing(false);
      setRetryCount(0);
      setLoading(false); 
    }
  };


  const handleDbNotReady = () => {
    if (retryCount < 15) {
      setIsDbPreparing(true);
      setRetryCount(prev => prev + 1);
      setTimeout(() => handleSubmit(null), 2000);
    } else {
      setError('استغرقت قاعدة البيانات وقتاً طويلاً للتشغيل. يرجى إغلاق البرنامج وفتحه مرة أخرى.');
      setLoading(false);
      setIsDbPreparing(false);
      setRetryCount(0);
    }
  };

  const handleRememberMeChange = (checked) => {
    setRememberMe(checked);
    if (!checked) clearRememberedLogin();
  };

  return (
    <div className="lp-page">
      <style>{`
        .lp-page,
        .lp-input,
        .lp-btn {
          font-family: 'Cairo', 'Tajawal', 'Segoe UI', Tahoma, sans-serif;
        }

        .lp-page {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 24px 16px;
          background:
            radial-gradient(ellipse at 20% 10%, rgba(37, 99, 235, 0.15) 0%, transparent 40%),
            radial-gradient(ellipse at 80% 90%, rgba(37, 99, 235, 0.1) 0%, transparent 40%),
            linear-gradient(160deg, #f1f5f9 0%, #e2e8f0 50%, #f8fafc 100%);
          direction: rtl;
        }

        .lp-card {
          position: relative;
          width: min(420px, 100%);
          background: rgba(255,255,255,0.85);
          backdrop-filter: blur(20px);
          border-radius: 32px;
          border: 1px solid rgba(255,255,255,0.7);
          box-shadow:
            0 2px 0 rgba(255,255,255,0.8) inset,
            0 32px 80px rgba(15, 23, 42, 0.15);
          padding: 48px 40px 40px;
          display: grid;
          gap: 28px;
        }

        .lp-settings-toggle {
          position: absolute;
          top: 24px;
          right: 24px;
          width: 42px;
          height: 42px;
          border-radius: 12px;
          border: 1px solid rgba(37, 99, 235, 0.15);
          background: rgba(255,255,255,0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 20px;
          transition: all 0.2s;
          color: #2563eb;
          z-index: 10;
        }

        .lp-settings-toggle:hover {
          background: #fff;
          transform: rotate(15deg) scale(1.05);
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);
        }

        /* Server Settings Modal Styles */
        .ssm-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(8px);
          display: grid;
          place-items: center;
          padding: 24px;
          z-index: 1000;
        }

        .ssm-card {
          width: min(500px, 100%);
          background: white;
          border-radius: 24px;
          padding: 32px;
          box-shadow: 0 40px 100px rgba(2, 6, 23, 0.3);
          display: grid;
          gap: 24px;
        }

        .ssm-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .ssm-title {
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .ssm-close {
          border: none;
          background: none;
          font-size: 24px;
          color: #94a3b8;
          cursor: pointer;
        }

        .ssm-modes {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .ssm-mode-btn {
          border: 2px solid #f1f5f9;
          background: #f8fafc;
          border-radius: 12px;
          padding: 12px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .ssm-mode-btn.active {
          border-color: #2563eb;
          background: rgba(37, 99, 235, 0.04);
          color: #2563eb;
        }

        .ssm-form { display: grid; gap: 14px; }

        .ssm-field { display: grid; gap: 6px; }

        .ssm-field label { font-size: 13px; font-weight: 600; color: #475569; }

        .ssm-input {
          width: 100%;
          padding: 10px 12px;
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          font-size: 14px;
          transition: all 0.2s;
          box-sizing: border-box;
          direction: ltr;
        }

        .ssm-input:focus {
          border-color: #2563eb;
          outline: none;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }

        .ssm-footer {
          display: flex;
          gap: 12px;
          margin-top: 10px;
        }

        .ssm-btn {
          flex: 1;
          padding: 12px;
          border-radius: 12px;
          border: none;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }

        .ssm-btn-test { background: #f1f5f9; color: #475569; }
        .ssm-btn-save { background: #2563eb; color: white; }

        .lp-logo-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .lp-logo-badge {
          width: 120px;
          height: 120px;
          border-radius: 24px;
          overflow: hidden;
          background: #ffffff;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .lp-logo-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
          margin-top: 30%;
          transform: scale(2.5);
        }

        .lp-brand-name {
          font-size: 28px;
          font-weight: 900;
          color: #0f172a;
          letter-spacing: -0.02em;
          margin: 0;
        }

        .lp-brand-sub {
          font-size: 14px;
          color: #64748b;
          margin: 0;
          margin-top: -8px;
          text-align: center;
        }

        .lp-form {
          display: grid;
          gap: 20px;
        }

        .lp-field {
          display: grid;
          gap: 8px;
        }

        .lp-field label {
          font-size: 14px;
          font-weight: 700;
          color: #1e293b;
        }

        .lp-input {
          width: 100%;
          height: 52px;
          border-radius: 14px;
          border: 1.5px solid #e2e8f0;
          background: #ffffff;
          padding: 0 16px;
          font-size: 15px;
          color: #0f172a;
          box-shadow: 0 2px 4px rgba(0,0,0,0.02);
          transition: all 0.2s;
          box-sizing: border-box;
        }

        .lp-input:focus {
          outline: none;
          border-color: #008ae6;
          box-shadow: 0 0 0 4px rgba(0, 138, 230, 0.1);
        }

        .lp-error {
          background: #fef2f2;
          color: #dc2626;
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid #fee2e2;
          font-size: 14px;
          line-height: 1.6;
        }

        .lp-options {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .lp-remember {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #1e293b;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }

        .lp-remember input {
          width: 18px;
          height: 18px;
          accent-color: #008ae6;
        }

        .lp-btn {
          width: 100%;
          height: 56px;
          border: none;
          border-radius: 16px;
          background: linear-gradient(135deg, #008ae6, #004b7c);
          color: #fff;
          font-size: 17px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 10px 25px rgba(0, 138, 230, 0.25);
          transition: all 0.2s;
        }

        .lp-btn:hover:enabled {
          transform: translateY(-2px);
          box-shadow: 0 15px 30px rgba(0, 138, 230, 0.35);
        }

        .lp-btn:active:enabled { transform: translateY(0); }

        .lp-footer {
          text-align: center;
          color: #94a3b8;
          font-size: 13px;
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div className="lp-card">
        {/* Logo (Click 5 times consecutively to open settings) */}
        <div 
          className="lp-logo-wrap" 
          onClick={handleLogoClick} 
          style={{ cursor: 'pointer', userSelect: 'none' }}
          title={logoClicks > 0 ? `اضغط ${5 - logoClicks} مرات إضافية للتهيئة` : ''}
        >
          <div 
            className="lp-logo-badge" 
            style={{ 
              width: '100%', 
              height: 'auto', 
              background: 'transparent', 
              boxShadow: 'none', 
              borderRadius: '0', 
              padding: '10px 0' 
            }}
          >
            <img
              src="fyc_store_manager_logo_login.png"
              alt="FYC Store Manager"
              style={{ 
                width: '100%', 
                maxWidth: '280px', 
                height: 'auto', 
                objectFit: 'contain', 
                display: 'block'
              }}
            />
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="lp-form">
          {error && <div className="lp-error">{error}</div>}

          <div className="lp-field">
            <label htmlFor="lp-username">اسم المستخدم</label>
            <input
              id="lp-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="lp-input"
              placeholder="أدخل اسم المستخدم"
              autoComplete="username"
              required
            />
          </div>

          <div className="lp-field">
            <label htmlFor="lp-password">كلمة المرور</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                id="lp-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="lp-input"
                placeholder="أدخل كلمة المرور"
                autoComplete="current-password"
                required
                style={{ paddingLeft: '48px' }} // Make room for the icon on the left
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  left: '16px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  color: '#94a3b8'
                }}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div className="lp-options">
            <label className="lp-remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => handleRememberMeChange(e.target.checked)}
              />
              تذكرني
            </label>
            <span className="lp-note" style={{ color: '#64748b', fontSize: '12px' }}>يتم الحفظ على هذا الجهاز فقط</span>
          </div>

          <button type="submit" disabled={loading} className="lp-btn">
            {isDbPreparing ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span className="spinner"></span>
                قاعدة البيانات قيد التجهيز...
              </span>
            ) : loading ? (
              'جاري التحقق...'
            ) : (
              'دخول'
            )}
          </button>
        </form>

        <div className="lp-footer">تم البرمجة والتطوير بواسطة شركة FYC-solutions</div>
      </div>

      {showSettings && (
        <ServerSettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

function ServerSettingsModal({ onClose }) {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [formData, setFormData] = useState({
    databaseMode: 'local_server',
    dbHost: '',
    dbPort: '5433',
    dbName: '',
    dbUsername: '',
    dbPassword: ''
  });

  React.useEffect(() => {
    const loadCurrent = async () => {
      try {
        const status = await window.api.getSetupStatus();
        const db = status?.database || {};
        setFormData({
          databaseMode: db.mode === 'remote_client' ? 'remote_client' : 'local_server',
          dbHost: db.host || '',
          dbPort: db.port || '5433',
          dbName: db.databaseName || '',
          dbUsername: db.appUser || '',
          dbPassword: db.appPassword || ''
        });
      } catch (err) {
        console.error('Failed to load DB settings:', err);
      }
    };
    loadCurrent();
  }, []);

  const handleTest = async () => {
    setTesting(true);
    setMsg({ text: '', type: '' });
    try {
      const result = await window.api.testDatabaseConnection(formData);
      if (result.success) {
        setMsg({ text: '✅ تم الاتصال بنجاح!', type: 'success' });
      } else {
        setMsg({ text: '❌ فشل الاتصال: ' + (result.error || 'خطأ غير معروف'), type: 'error' });
      }
    } catch (err) {
      setMsg({ text: '❌ خطأ: ' + err.message, type: 'error' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setMsg({ text: '', type: '' });
    try {
      const result = await window.api.saveDatabaseConnection(formData);
      if (result.success) {
        setMsg({ text: '✅ تم حفظ الإعدادات! سيتم إعادة تشغيل البرنامج...', type: 'success' });
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setMsg({ text: '❌ فشل الحفظ: ' + (result.error || 'خطأ غير معروف'), type: 'error' });
        setLoading(false);
      }
    } catch (err) {
      setMsg({ text: '❌ خطأ: ' + err.message, type: 'error' });
      setLoading(false);
    }
  };

  const isRemote = formData.databaseMode === 'remote_client';

  return (
    <div className="ssm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ssm-card">
        <div className="ssm-header">
          <h2 className="ssm-title">🌐 إعدادات الاتصال بالسيرفر</h2>
          <button className="ssm-close" onClick={onClose}>&times;</button>
        </div>

        <div className="ssm-modes">
          <div 
            className={`ssm-mode-btn ${!isRemote ? 'active' : ''}`}
            onClick={() => setFormData(p => ({ ...p, databaseMode: 'local_server' }))}
          >
            <strong>🗄️ جهاز رئيسي</strong>
            <span>محلية (Local)</span>
          </div>
          <div 
            className={`ssm-mode-btn ${isRemote ? 'active' : ''}`}
            onClick={() => setFormData(p => ({ ...p, databaseMode: 'remote_client' }))}
          >
            <strong>🔗 جهاز فرعي</strong>
            <span>سيرفر (Remote)</span>
          </div>
        </div>

        {isRemote && (
          <div className="ssm-form">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '10px' }}>
              <div className="ssm-field">
                <label>عنوان السيرفر (IP)</label>
                <input 
                  className="ssm-input" 
                  value={formData.dbHost}
                  onChange={e => setFormData(p => ({ ...p, dbHost: e.target.value }))}
                  placeholder="192.168.1.10"
                />
              </div>
              <div className="ssm-field">
                <label>المنفذ</label>
                <input 
                  className="ssm-input" 
                  value={formData.dbPort}
                  onChange={e => setFormData(p => ({ ...p, dbPort: e.target.value }))}
                  placeholder="5433"
                />
              </div>
            </div>
            <div className="ssm-field">
              <label>اسم قاعدة البيانات</label>
              <input 
                className="ssm-input" 
                value={formData.dbName}
                onChange={e => setFormData(p => ({ ...p, dbName: e.target.value }))}
                placeholder="erp_db"
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="ssm-field">
                <label>المستخدم</label>
                <input 
                  className="ssm-input" 
                  value={formData.dbUsername}
                  onChange={e => setFormData(p => ({ ...p, dbUsername: e.target.value }))}
                  placeholder="postgres"
                />
              </div>
              <div className="ssm-field">
                <label>كلمة المرور</label>
                <input 
                  type="password"
                  className="ssm-input" 
                  value={formData.dbPassword}
                  onChange={e => setFormData(p => ({ ...p, dbPassword: e.target.value }))}
                />
              </div>
            </div>
          </div>
        )}

        {!isRemote && (
          <div className="ssm-alert ssm-alert-success" style={{ textAlign: 'center' }}>
            سيتم استخدام قاعدة البيانات المثبتة محلياً على هذا الجهاز.
          </div>
        )}

        {msg.text && (
          <div className={`ssm-alert ssm-alert-${msg.type}`}>
            {msg.text}
          </div>
        )}

        <div className="ssm-footer">
          {isRemote && (
            <button 
              className="ssm-btn ssm-btn-test" 
              onClick={handleTest}
              disabled={testing || loading}
            >
              {testing ? 'جاري الاختبار...' : 'اختبار الاتصال'}
            </button>
          )}
          <button 
            className="ssm-btn ssm-btn-save" 
            onClick={handleSave}
            disabled={loading || testing}
          >
            {loading ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
          </button>
        </div>
      </div>
    </div>
  );
}
