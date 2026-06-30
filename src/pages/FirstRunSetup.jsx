import { useMemo, useState, useEffect, useRef } from 'react';
import { saveAppSettings } from '../utils/appSettings';

const normalizeInitialValue = (value, fallback = '') => String(value ?? fallback).trim();

export default function FirstRunSetup({ initialConfig, setupStatus, onCompleted }) {
  const initialDatabase = initialConfig?.database || setupStatus?.database || {};
  
  const initialValues = useMemo(() => {
    let type = 'standalone';
    if (initialDatabase?.mode === 'remote_client') {
      type = 'client';
    } else if (initialDatabase?.serverMode === 'server') {
      type = 'server';
    }

    // استخدام المسار الافتراضي من مجلد تثبيت البرنامج بدلاً من AppData
    const defaultDataDir = setupStatus?.defaultDataDir || '';

    return {
      setupType: type, // 'server', 'client', 'standalone'
      dbHost: normalizeInitialValue(initialDatabase?.host, type === 'client' ? '' : '127.0.0.1'),
      dbPort: normalizeInitialValue(initialDatabase?.port, '5433'),
      dbName: normalizeInitialValue(initialDatabase?.databaseName, 'erp_main'),
      dbUsername: normalizeInitialValue(initialDatabase?.appUser, 'erp_user'),
      dbPassword: normalizeInitialValue(initialDatabase?.appPassword, 'StrongPass123!'),
      dataDir: normalizeInitialValue(initialDatabase?.dataDir, defaultDataDir),
      companyName: normalizeInitialValue(initialConfig?.companyName),
      companyContactNumbers: normalizeInitialValue(initialConfig?.companyContactNumbers),
      companyAddress: normalizeInitialValue(initialConfig?.companyAddress),
      adminName: 'مدير النظام',
      username: 'admin',
      password: '',
      confirmPassword: ''
    };
  }, [initialConfig, initialDatabase, setupStatus?.defaultDataDir]);

  const [formData, setFormData] = useState(initialValues);
  const [error, setError] = useState(() => normalizeInitialValue(setupStatus?.database?.error));
  const [loading, setLoading] = useState(false);
  const [setupProgress, setSetupProgress] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const formRef = useRef(null);

  useEffect(() => {
    if (window.api?.onSetupProgress) {
      window.api.onSetupProgress((data) => {
        setSetupProgress(data);
      });
    }
    return () => window.api?.offSetupProgress?.();
  }, []);

  const updateField = (key, value) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleChooseDataDir = async () => {
    try {
      const result = await window.api.chooseDirectory({
        title: 'اختر مجلد تخزين بيانات قاعدة البيانات',
        defaultPath: formData.dataDir
      });
      if (result.success && result.directoryPath) {
        updateField('dataDir', result.directoryPath);
      }
    } catch (err) {
      console.error('Failed to choose directory:', err);
    }
  };

  const steps = formData.setupType === 'client'
    ? ['وضع التشغيل', 'الاتصال بالسيرفر']
    : ['وضع التشغيل', 'إعدادات البيانات', 'بيانات النشاط'];

  const canGoNext = () => {
    if (currentStep === 0) return true;
    if (currentStep === 1) {
      if (formData.setupType === 'client') {
        return formData.dbHost && formData.dbName && formData.dbUsername;
      }
      return true; // dataDir has a default
    }
    return true;
  };

  const goNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const goBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const { setupType, dbHost, dbPort, dbName, dbUsername, dbPassword, dataDir, companyName, adminName, username, password, confirmPassword } = formData;

    // Validation
    if (setupType === 'client') {
      if (!dbHost) return setError('عنوان السيرفر أو IP مطلوب.');
      if (!dbName) return setError('اسم قاعدة البيانات مطلوب.');
      if (!dbUsername) return setError('اسم مستخدم قاعدة البيانات مطلوب.');
    } else {
      if (!companyName) return setError('اسم النشاط مطلوب.');
      if (!adminName) return setError('اسم المسؤول مطلوب.');
      if (!username) return setError('اسم المستخدم مطلوب.');
      if (password.length < 4) return setError('كلمة المرور يجب ألا تقل عن 4 أحرف.');
      if (password !== confirmPassword) return setError('تأكيد كلمة المرور غير مطابق.');
    }

    if (!window.api?.completeFirstRunSetup) {
      setError('يجب تشغيل التطبيق عبر Electron.');
      return;
    }

    setLoading(true);
    try {
      const result = await window.api.completeFirstRunSetup({
        databaseMode: setupType === 'client' ? 'remote_client' : 'local_server',
        serverMode: setupType, // Passed to backend
        dbHost: setupType === 'client' ? dbHost : '127.0.0.1',
        dbPort,
        dbName,
        dbUsername,
        dbPassword,
        dataDir,
        companyName,
        companyContactNumbers: formData.companyContactNumbers,
        companyAddress: formData.companyAddress,
        adminName,
        username,
        password
      });

      if (result?.error) {
        setError(result.error);
        return;
      }

      saveAppSettings({
        companyName,
        companyContactNumbers: formData.companyContactNumbers,
        companyAddress: formData.companyAddress
      });

      onCompleted?.(result);
    } catch (submitError) {
      setError(submitError?.message || 'تعذر حفظ إعدادات أول تشغيل.');
    } finally {
      setLoading(false);
    }
  };

  const isLastStep = currentStep === steps.length - 1;

  // ─── Step Content Renderers ─────────────────────────────────────────
  const renderStep0 = () => (
    <div className="frs-step-content frs-fade-in" key="step0">
      <div className="frs-step-header">
        <h3>اختر وضع التشغيل</h3>
        <p>حدد كيف سيعمل البرنامج على هذا الجهاز</p>
      </div>

      <div className="frs-mode-grid">
        {[
          { key: 'standalone', icon: '💻', title: 'جهاز مستقل', desc: 'قاعدة بيانات محلية لهذا الجهاز فقط — الأنسب للمحلات الفردية', tag: 'الأكثر شيوعاً' },
          { key: 'server', icon: '🖥️', title: 'جهاز رئيسي (سيرفر)', desc: 'يعمل كسيرفر مركزي للأجهزة الأخرى في الشبكة المحلية', tag: 'للشبكات' },
          { key: 'client', icon: '🔗', title: 'جهاز عميل', desc: 'يتصل بسيرفر موجود مسبقاً — لا يُخزّن بيانات محلياً', tag: 'جهاز فرعي' }
        ].map(mode => (
          <div
            key={mode.key}
            className={`frs-mode-card ${formData.setupType === mode.key ? 'active' : ''}`}
            onClick={() => { updateField('setupType', mode.key); setCurrentStep(0); }}
          >
            {mode.tag && <span className="frs-mode-tag">{mode.tag}</span>}
            <div className="frs-mode-icon">{mode.icon}</div>
            <strong>{mode.title}</strong>
            <span className="frs-mode-desc">{mode.desc}</span>
            <div className={`frs-radio ${formData.setupType === mode.key ? 'checked' : ''}`} />
          </div>
        ))}
      </div>
    </div>
  );

  const renderStep1 = () => {
    if (formData.setupType === 'client') {
      return (
        <div className="frs-step-content frs-fade-in" key="step1-client">
          <div className="frs-step-header">
            <h3>🔗 بيانات الاتصال بالسيرفر</h3>
            <p>أدخل بيانات السيرفر الرئيسي الذي ستتصل به</p>
          </div>

          <div className="frs-fields-grid">
            <div className="frs-field">
              <label>عنوان السيرفر (IP)</label>
              <input
                className="frs-input"
                value={formData.dbHost}
                onChange={(e) => updateField('dbHost', e.target.value)}
                placeholder="مثال: 192.168.1.10"
                disabled={loading}
              />
            </div>
            <div className="frs-field">
              <label>البورت</label>
              <input
                className="frs-input"
                value={formData.dbPort}
                onChange={(e) => updateField('dbPort', e.target.value)}
                placeholder="5433"
                disabled={loading}
              />
            </div>
            <div className="frs-field">
              <label>اسم قاعدة البيانات</label>
              <input
                className="frs-input"
                value={formData.dbName}
                onChange={(e) => updateField('dbName', e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="frs-field">
              <label>اسم المستخدم</label>
              <input
                className="frs-input"
                value={formData.dbUsername}
                onChange={(e) => updateField('dbUsername', e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="frs-field full">
              <label>كلمة المرور</label>
              <input
                type="password"
                className="frs-input"
                value={formData.dbPassword}
                onChange={(e) => updateField('dbPassword', e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
        </div>
      );
    }

    // Local (standalone / server)
    return (
      <div className="frs-step-content frs-fade-in" key="step1-local">
        <div className="frs-step-header">
          <h3>🗄️ إعدادات قاعدة البيانات</h3>
          <p>سيتم تثبيت وتجهيز PostgreSQL تلقائياً على هذا الجهاز</p>
        </div>

        <div className="frs-field full">
          <label>📁 مكان تخزين البيانات</label>
          <div className="frs-dir-picker">
            <input
              className="frs-input"
              value={formData.dataDir}
              onChange={(e) => updateField('dataDir', e.target.value)}
              placeholder="تلقائي (مجلد البرنامج/database)"
              disabled={loading}
            />
            <button type="button" className="frs-btn secondary" onClick={handleChooseDataDir} disabled={loading}>
              📂 اختر...
            </button>
          </div>
          <span className="frs-hint-inline">
            💡 البيانات ستُحفظ بجوار البرنامج — حتى لو نزّلت ويندوز جديد بياناتك في أمان!
          </span>
        </div>

        <div className="frs-advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
          {showAdvanced ? '▲ إخفاء الإعدادات المتقدمة' : '▼ إعدادات قاعدة البيانات المتقدمة (اختياري)'}
        </div>

        {showAdvanced && (
          <div className="frs-fields-grid frs-fade-in" style={{ marginTop: 12 }}>
            <div className="frs-field">
              <label>اسم قاعدة البيانات</label>
              <input
                className="frs-input"
                value={formData.dbName}
                onChange={(e) => updateField('dbName', e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="frs-field">
              <label>البورت</label>
              <input
                className="frs-input"
                value={formData.dbPort}
                onChange={(e) => updateField('dbPort', e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="frs-field">
              <label>مستخدم النظام</label>
              <input
                className="frs-input"
                value={formData.dbUsername}
                onChange={(e) => updateField('dbUsername', e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="frs-field">
              <label>كلمة مرور النظام</label>
              <input
                type="password"
                className="frs-input"
                value={formData.dbPassword}
                onChange={(e) => updateField('dbPassword', e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderStep2 = () => (
    <div className="frs-step-content frs-fade-in" key="step2">
      <div className="frs-step-header">
        <h3>🏢 بيانات النشاط التجاري</h3>
        <p>أدخل بيانات نشاطك وحساب المدير للدخول للبرنامج</p>
      </div>

      <div className="frs-fields-grid">
        <div className="frs-field full">
          <label>اسم النشاط / المحل *</label>
          <input
            className="frs-input"
            value={formData.companyName}
            onChange={(e) => updateField('companyName', e.target.value)}
            placeholder="مثال: صيدلية النور"
            disabled={loading}
          />
        </div>
        <div className="frs-field">
          <label>أرقام التواصل</label>
          <input
            className="frs-input"
            value={formData.companyContactNumbers}
            onChange={(e) => updateField('companyContactNumbers', e.target.value)}
            placeholder="01xxxxxxxxx"
            disabled={loading}
          />
        </div>
        <div className="frs-field">
          <label>اسم مدير النظام *</label>
          <input
            className="frs-input"
            value={formData.adminName}
            onChange={(e) => updateField('adminName', e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="frs-field full">
          <label>العنوان</label>
          <textarea
            className="frs-textarea"
            value={formData.companyAddress}
            onChange={(e) => updateField('companyAddress', e.target.value)}
            disabled={loading}
            rows={2}
          />
        </div>
      </div>

      <div className="frs-divider" />

      <div className="frs-step-header" style={{ marginTop: 0 }}>
        <h3>👤 حساب الدخول للبرنامج</h3>
      </div>

      <div className="frs-fields-grid">
        <div className="frs-field">
          <label>اسم المستخدم *</label>
          <input
            className="frs-input"
            value={formData.username}
            onChange={(e) => updateField('username', e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="frs-field">
          <label>كلمة المرور *</label>
          <input
            type="password"
            className="frs-input"
            value={formData.password}
            onChange={(e) => updateField('password', e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="frs-field">
          <label>تأكيد كلمة المرور *</label>
          <input
            type="password"
            className="frs-input"
            value={formData.confirmPassword}
            onChange={(e) => updateField('confirmPassword', e.target.value)}
            disabled={loading}
          />
        </div>
      </div>
    </div>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0: return renderStep0();
      case 1: return renderStep1();
      case 2: return renderStep2();
      default: return null;
    }
  };

  return (
    <div className="frs-page">
      <style>{`
        @keyframes frsFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes frsFloat {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-8px); }
        }
        @keyframes frsPulse {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 0.7; }
        }
        @keyframes frsProgress {
          from { background-position: 200% 0; }
          to   { background-position: -200% 0; }
        }
        @keyframes frsSpin {
          to { transform: rotate(360deg); }
        }

        .frs-page {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 20px;
          direction: rtl;
          background: #060b16;
          font-family: Cairo, Tajawal, 'Segoe UI', sans-serif;
          color: #e2e8f0;
          position: relative;
          overflow: hidden;
        }

        /* Ambient background orbs */
        .frs-page::before,
        .frs-page::after {
          content: '';
          position: fixed;
          border-radius: 50%;
          pointer-events: none;
          animation: frsPulse 6s ease-in-out infinite;
        }
        .frs-page::before {
          width: 600px; height: 600px;
          top: -200px; right: -100px;
          background: radial-gradient(circle, rgba(56, 189, 248, 0.12), transparent 70%);
        }
        .frs-page::after {
          width: 500px; height: 500px;
          bottom: -150px; left: -80px;
          background: radial-gradient(circle, rgba(16, 185, 129, 0.10), transparent 70%);
          animation-delay: 3s;
        }

        .frs-container {
          width: min(960px, 100%);
          position: relative;
          z-index: 1;
          animation: frsFadeIn 0.5s ease-out;
        }

        /* ─── Header ─── */
        .frs-brand {
          text-align: center;
          margin-bottom: 28px;
        }
        .frs-logo {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 64px; height: 64px;
          border-radius: 20px;
          background: linear-gradient(135deg, #0ea5e9, #10b981);
          color: #fff;
          font-size: 24px;
          font-weight: 900;
          box-shadow: 0 16px 40px rgba(14, 165, 233, 0.3);
          animation: frsFloat 4s ease-in-out infinite;
          margin-bottom: 12px;
        }
        .frs-brand h1 {
          margin: 0;
          font-size: 26px;
          font-weight: 800;
          background: linear-gradient(135deg, #f0f9ff, #bae6fd);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .frs-brand p {
          margin: 4px 0 0;
          color: #64748b;
          font-size: 13px;
        }

        /* ─── Stepper ─── */
        .frs-stepper {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0;
          margin-bottom: 28px;
          padding: 0 40px;
        }
        .frs-step-dot {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 100px;
          font-size: 12px;
          font-weight: 600;
          color: #475569;
          transition: all 0.3s ease;
          white-space: nowrap;
          cursor: default;
        }
        .frs-step-dot.active {
          background: rgba(14, 165, 233, 0.12);
          color: #38bdf8;
          box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.2);
        }
        .frs-step-dot.done {
          color: #10b981;
        }
        .frs-step-num {
          width: 26px; height: 26px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          font-size: 11px;
          font-weight: 700;
          background: rgba(51, 65, 85, 0.5);
          border: 1.5px solid rgba(100, 116, 139, 0.3);
          transition: all 0.3s ease;
        }
        .frs-step-dot.active .frs-step-num {
          background: linear-gradient(135deg, #0ea5e9, #0284c7);
          border-color: transparent;
          color: #fff;
          box-shadow: 0 4px 12px rgba(14, 165, 233, 0.4);
        }
        .frs-step-dot.done .frs-step-num {
          background: linear-gradient(135deg, #10b981, #059669);
          border-color: transparent;
          color: #fff;
        }
        .frs-step-line {
          width: 40px;
          height: 2px;
          background: rgba(51, 65, 85, 0.4);
          transition: background 0.3s;
        }
        .frs-step-line.done {
          background: linear-gradient(90deg, #10b981, #0ea5e9);
        }

        /* ─── Card ─── */
        .frs-card {
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 24px;
          box-shadow:
            0 32px 64px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.04);
          overflow: hidden;
        }
        .frs-card-body {
          padding: 32px 36px;
          max-height: 58vh;
          overflow-y: auto;
        }
        .frs-card-body::-webkit-scrollbar { width: 5px; }
        .frs-card-body::-webkit-scrollbar-track { background: transparent; }
        .frs-card-body::-webkit-scrollbar-thumb {
          background: rgba(100, 116, 139, 0.3);
          border-radius: 10px;
        }

        /* ─── Step Content ─── */
        .frs-fade-in {
          animation: frsFadeIn 0.35s ease-out;
        }
        .frs-step-header {
          margin-bottom: 20px;
        }
        .frs-step-header h3 {
          margin: 0 0 4px;
          font-size: 20px;
          font-weight: 700;
          color: #f1f5f9;
        }
        .frs-step-header p {
          margin: 0;
          color: #64748b;
          font-size: 13px;
        }

        /* ─── Mode Cards ─── */
        .frs-mode-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
        }
        .frs-mode-card {
          position: relative;
          border: 1.5px solid rgba(100, 116, 139, 0.2);
          border-radius: 18px;
          padding: 20px 16px 18px;
          cursor: pointer;
          transition: all 0.25s ease;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          background: rgba(15, 23, 42, 0.5);
        }
        .frs-mode-card:hover {
          border-color: rgba(148, 163, 184, 0.35);
          background: rgba(15, 23, 42, 0.7);
          transform: translateY(-2px);
        }
        .frs-mode-card.active {
          border-color: #0ea5e9;
          background: rgba(14, 165, 233, 0.06);
          box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.12), 0 8px 24px rgba(14, 165, 233, 0.08);
          transform: translateY(-3px);
        }
        .frs-mode-tag {
          position: absolute;
          top: -10px;
          left: 50%;
          transform: translateX(-50%);
          padding: 2px 12px;
          border-radius: 100px;
          font-size: 10px;
          font-weight: 700;
          background: linear-gradient(135deg, #0ea5e9, #0284c7);
          color: #fff;
          white-space: nowrap;
          box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3);
        }
        .frs-mode-card:not(.active) .frs-mode-tag {
          background: rgba(51, 65, 85, 0.8);
          box-shadow: none;
        }
        .frs-mode-icon {
          font-size: 36px;
          margin: 4px 0;
        }
        .frs-mode-card strong {
          font-size: 14px;
          color: #e2e8f0;
        }
        .frs-mode-desc {
          font-size: 11px;
          color: #64748b;
          line-height: 1.6;
        }
        .frs-radio {
          width: 18px; height: 18px;
          border-radius: 50%;
          border: 2px solid rgba(100, 116, 139, 0.3);
          margin-top: 4px;
          transition: all 0.2s;
          position: relative;
        }
        .frs-radio.checked {
          border-color: #0ea5e9;
        }
        .frs-radio.checked::after {
          content: '';
          position: absolute;
          top: 3px; left: 3px;
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #0ea5e9;
        }

        /* ─── Form Fields ─── */
        .frs-fields-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 14px;
        }
        .frs-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .frs-field.full {
          grid-column: 1 / -1;
        }
        .frs-field label {
          font-size: 12px;
          font-weight: 600;
          color: #94a3b8;
          letter-spacing: 0.01em;
        }
        .frs-input, .frs-textarea {
          width: 100%;
          box-sizing: border-box;
          border-radius: 12px;
          border: 1.5px solid rgba(100, 116, 139, 0.2);
          background: rgba(15, 23, 42, 0.7);
          color: #f1f5f9;
          padding: 11px 14px;
          font-size: 13px;
          font-family: inherit;
          transition: all 0.2s ease;
        }
        .frs-textarea {
          min-height: 60px;
          resize: vertical;
        }
        .frs-input:focus, .frs-textarea:focus {
          outline: none;
          border-color: #0ea5e9;
          box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.12);
          background: rgba(15, 23, 42, 0.9);
        }
        .frs-input::placeholder { color: #475569; }

        .frs-dir-picker {
          display: flex;
          gap: 8px;
        }
        .frs-dir-picker .frs-input {
          flex: 1;
          font-size: 12px;
          direction: ltr;
          text-align: left;
        }
        .frs-hint-inline {
          font-size: 11px;
          color: #0ea5e9;
          margin-top: 2px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .frs-advanced-toggle {
          display: inline-block;
          margin: 16px 0 0;
          color: #64748b;
          font-size: 12px;
          cursor: pointer;
          transition: color 0.2s;
          user-select: none;
        }
        .frs-advanced-toggle:hover {
          color: #94a3b8;
        }
        .frs-divider {
          height: 1px;
          background: rgba(100, 116, 139, 0.15);
          margin: 20px 0;
        }

        /* ─── Error ─── */
        .frs-error {
          margin-bottom: 16px;
          padding: 12px 16px;
          border-radius: 14px;
          background: rgba(127, 29, 29, 0.2);
          border: 1px solid rgba(248, 113, 113, 0.25);
          color: #fca5a5;
          font-size: 13px;
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }
        .frs-error-reset {
          margin-top: 8px;
          border: none;
          border-radius: 8px;
          background: #991b1b;
          color: #fecaca;
          padding: 6px 14px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.2s;
        }
        .frs-error-reset:hover { background: #7f1d1d; }

        /* ─── Footer ─── */
        .frs-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 18px 36px;
          border-top: 1px solid rgba(100, 116, 139, 0.1);
          background: rgba(15, 23, 42, 0.4);
        }
        .frs-footer-hint {
          color: #475569;
          font-size: 11px;
          line-height: 1.6;
          flex: 1;
        }
        .frs-footer-actions {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        /* ─── Buttons ─── */
        .frs-btn {
          border: none;
          border-radius: 12px;
          padding: 11px 24px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          white-space: nowrap;
        }
        .frs-btn.primary {
          background: linear-gradient(135deg, #0ea5e9, #2563eb);
          color: #fff;
          box-shadow: 0 4px 16px rgba(14, 165, 233, 0.25);
        }
        .frs-btn.primary:hover:enabled {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(14, 165, 233, 0.35);
        }
        .frs-btn.primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .frs-btn.secondary {
          background: rgba(51, 65, 85, 0.4);
          border: 1px solid rgba(100, 116, 139, 0.2);
          color: #94a3b8;
        }
        .frs-btn.secondary:hover:enabled {
          background: rgba(51, 65, 85, 0.6);
          color: #cbd5e1;
        }
        .frs-btn.ghost {
          background: transparent;
          color: #64748b;
          padding: 11px 16px;
        }
        .frs-btn.ghost:hover:enabled {
          color: #94a3b8;
          background: rgba(51, 65, 85, 0.2);
        }

        /* ─── Progress ─── */
        .frs-progress-area {
          flex: 1;
        }
        .frs-progress-msg {
          font-size: 12px;
          font-weight: 600;
          color: #38bdf8;
          margin-bottom: 6px;
        }
        .frs-progress-bar {
          width: 100%;
          height: 5px;
          background: rgba(51, 65, 85, 0.4);
          border-radius: 100px;
          overflow: hidden;
        }
        .frs-progress-fill {
          height: 100%;
          border-radius: 100px;
          background: linear-gradient(90deg, #0ea5e9, #10b981, #0ea5e9);
          background-size: 200% 100%;
          animation: frsProgress 2s linear infinite;
          transition: width 0.4s ease;
        }

        .frs-spinner {
          width: 18px; height: 18px;
          border: 2.5px solid rgba(255,255,255,0.2);
          border-top-color: #fff;
          border-radius: 50%;
          animation: frsSpin 0.7s linear infinite;
        }

        /* ─── Responsive ─── */
        @media (max-width: 700px) {
          .frs-mode-grid {
            grid-template-columns: 1fr;
          }
          .frs-fields-grid {
            grid-template-columns: 1fr;
          }
          .frs-card-body { padding: 20px; }
          .frs-footer { padding: 14px 20px; }
          .frs-stepper { padding: 0; gap: 0; flex-wrap: wrap; }
        }
      `}</style>

      <div className="frs-container">
        {/* Brand */}
        <div className="frs-brand">
          <div className="frs-logo">ERP</div>
          <h1>FADL ERP</h1>
          <p>تجهيز النظام للعمل على هذا الجهاز</p>
        </div>

        {/* Stepper */}
        <div className="frs-stepper">
          {steps.map((label, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && <div className={`frs-step-line ${i <= currentStep ? 'done' : ''}`} />}
              <div className={`frs-step-dot ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'done' : ''}`}>
                <div className="frs-step-num">
                  {i < currentStep ? '✓' : i + 1}
                </div>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="frs-card">
          <form ref={formRef} onSubmit={handleSubmit}>
            <div className="frs-card-body">
              {error && (
                <div className="frs-error frs-fade-in">
                  <div style={{ flex: 1 }}>
                    ⚠️ {error}
                    {(error.includes('تعارض') || error.includes('P3009')) && (
                      <button
                        type="button"
                        className="frs-error-reset"
                        onClick={async () => {
                          if (window.confirm('⚠️ تحذير: سيتم حذف قاعدة البيانات المحلية بالكامل والبدء من جديد. هل أنت متأكد؟')) {
                            setLoading(true);
                            setError('');
                            const res = await window.api.forceResetLocalDatabase();
                            if (res.success) window.location.reload();
                            else setError(res.error);
                            setLoading(false);
                          }
                        }}
                      >
                        🗑️ مسح وإعادة إنشاء قاعدة البيانات
                      </button>
                    )}
                  </div>
                </div>
              )}

              {renderCurrentStep()}
            </div>

            {/* Footer */}
            <div className="frs-footer">
              {loading ? (
                <div className="frs-progress-area">
                  <div className="frs-progress-msg">{setupProgress?.message || 'جاري التجهيز...'}</div>
                  <div className="frs-progress-bar">
                    <div className="frs-progress-fill" style={{ width: `${setupProgress?.percent || 5}%` }} />
                  </div>
                </div>
              ) : (
                <div className="frs-footer-hint">
                  {currentStep === 0 && '💡 إذا كنت تثبت البرنامج لأول مرة، اختر "جهاز مستقل".'}
                  {currentStep === 1 && (formData.setupType === 'client'
                    ? '💡 تأكد من أن السيرفر الرئيسي يعمل ومفتوح للاتصال.'
                    : '💡 يُفضل اختيار بارتيشن غير الـ C لضمان أمان البيانات.')}
                  {currentStep === 2 && '⏳ التثبيت قد يستغرق من 2 لـ 5 دقائق حسب سرعة جهازك.'}
                </div>
              )}

              <div className="frs-footer-actions">
                {currentStep > 0 && !loading && (
                  <button type="button" className="frs-btn ghost" onClick={goBack}>
                    → رجوع
                  </button>
                )}

                {isLastStep ? (
                  <button type="submit" className="frs-btn primary" disabled={loading}>
                    {loading ? (
                      <>
                        <div className="frs-spinner" />
                        جاري الإعداد...
                      </>
                    ) : '🚀 حفظ وبدء التشغيل'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="frs-btn primary"
                    disabled={!canGoNext()}
                    onClick={goNext}
                  >
                    التالي ←
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
