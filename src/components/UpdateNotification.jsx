import React, { useState, useEffect } from 'react';
import './UpdateNotification.css';

const formatBytes = (bytes) => {
  if (!bytes || bytes <= 0) return '0 ب';
  const units = ['بايت', 'ك.ب', 'م.ب', 'ج.ب'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + (units[i] || '');
};

const UpdateNotification = () => {
  const [updateStatus, setUpdateStatus] = useState(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (window.api && window.api.onUpdateStatus) {
      window.api.onUpdateStatus((data) => {
        setUpdateStatus(data);

        if (['available', 'downloading', 'ready', 'error', 'up-to-date'].includes(data.status)) {
          // If the error is 'No published versions on GitHub', we treat it as 'up-to-date'
          if (data.status === 'error' && data.message && data.message.includes('No published versions on GitHub')) {
            setUpdateStatus({ status: 'up-to-date' });
            setVisible(true);
          } else {
            setVisible(true);
          }
        }
      });

      return () => window.api.offUpdateStatus();
    }
  }, []);

  if (!visible || !updateStatus) return null;

  const handleDownload = () => {
    if (window.api && window.api.downloadUpdate) {
      window.api.downloadUpdate();
    }
  };

  const handleInstall = () => {
    setInstalling(true);
    // Give the UI a moment to show "جاري التسطيب" before quitting
    setTimeout(() => {
      if (window.api && window.api.installUpdate) {
        window.api.installUpdate();
      }
    }, 1500);
  };

  const handleDismiss = () => {
    setVisible(false);
  };

  const percent = Math.round(updateStatus.percent || 0);

  // ── Installing (after user clicked install) ──
  if (installing) {
    return (
      <div className="update-notification-overlay">
        <div className="update-notification-card">
          <div className="update-spinner" />
          <h3 className="update-card-title">جاري تسطيب التحديث...</h3>
          <p className="update-card-desc">
            سيتم إغلاق التطبيق وإعادة فتحه تلقائياً بعد اكتمال التسطيب.
            <br />قد يستغرق ذلك دقيقتين، يرجى عدم إغلاق الجهاز.
          </p>
        </div>
      </div>
    );
  }

  // ── Available ──
  if (updateStatus.status === 'available') {
    return (
      <div className="update-notification-overlay">
        <div className="update-notification-card">
          <div className="update-card-icon available">🚀</div>
          <h3 className="update-card-title">تحديث جديد متاح</h3>
          <p className="update-card-desc">
            الإصدار <strong>{updateStatus.version}</strong> متاح للتنزيل.
            <br />هل تريد تحديث التطبيق الآن؟
          </p>
          <div className="update-card-actions">
            <button className="update-card-btn-primary" onClick={handleDownload}>تحديث الآن</button>
            <button className="update-card-btn-secondary" onClick={handleDismiss}>لاحقاً</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Downloading ──
  if (updateStatus.status === 'downloading') {
    return (
      <div className="update-notification-overlay">
        <div className="update-notification-card">
          <div className="update-spinner" />
          <h3 className="update-card-title">جاري تنزيل التحديث...</h3>
          <p className="update-card-desc">يرجى الانتظار حتى يتم تنزيل التحديث</p>

          <div className="update-card-progress-wrap">
            <div className="update-card-progress-track">
              <div className="update-card-progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <div className="update-card-progress-row">
              <span>{percent}%</span>
              <span>
                {formatBytes(updateStatus.transferred)} / {formatBytes(updateStatus.total)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Ready ──
  if (updateStatus.status === 'ready') {
    return (
      <div className="update-notification-overlay">
        <div className="update-notification-card">
          <div className="update-card-icon ready">✅</div>
          <h3 className="update-card-title">التحديث جاهز!</h3>
          <p className="update-card-desc">
            تم تنزيل التحديث بنجاح. سيتم إعادة تشغيل التطبيق لتثبيته.
          </p>
          <div className="update-card-actions">
            <button className="update-card-btn-primary" onClick={handleInstall}>إعادة التشغيل الآن</button>
            <button className="update-card-btn-secondary" onClick={handleDismiss}>لاحقاً</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Up to date ──
  if (updateStatus.status === 'up-to-date') {
    return (
      <div className="update-notification-overlay">
        <div className="update-notification-card">
          <div className="update-card-icon ready" style={{ background: '#008ae6', color: '#fff' }}>🌟</div>
          <h3 className="update-card-title">أنت تستخدم أحدث إصدار!</h3>
          <p className="update-card-desc">
            لا توجد تحديثات جديدة حالياً. أنت تستخدم أحدث وأفضل نسخة من النظام.
          </p>
          <div className="update-card-actions">
            <button className="update-card-btn-primary" onClick={handleDismiss} style={{ background: '#008ae6', width: '100%' }}>حسناً</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (updateStatus.status === 'error') {
    return (
      <div className="update-notification-overlay">
        <div className="update-notification-card">
          <div className="update-card-icon error">⚠️</div>
          <h3 className="update-card-title">خطأ في التحديث</h3>
          <p className="update-card-error-text">
            {updateStatus.message || 'حدث خطأ غير متوقع أثناء التحديث.'}
          </p>
          <div className="update-card-actions">
            <button className="update-card-btn-secondary" onClick={handleDismiss}>إغلاق</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default UpdateNotification;
