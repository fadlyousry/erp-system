import React, { useState, useEffect } from 'react';
import './UpdateNotification.css';

const UpdateNotification = () => {
  const [updateStatus, setUpdateStatus] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.api && window.api.onUpdateStatus) {
      window.api.onUpdateStatus((data) => {
        setUpdateStatus(data);
        
        // Show notification for specific statuses
        if (['available', 'downloading', 'ready', 'error'].includes(data.status)) {
          setVisible(true);
        }
        
        // Auto-hide 'up-to-date' or 'checking' after a few seconds if we wanted to show them
        // But usually we keep them silent unless initiated manually
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
    if (window.api && window.api.installUpdate) {
      window.api.installUpdate();
    }
  };

  const handleDismiss = () => {
    setVisible(false);
  };

  const renderContent = () => {
    switch (updateStatus.status) {
      case 'available':
        return (
          <>
            <h4>تحديث جديد متاح</h4>
            <p>إصدار {updateStatus.version} متاح للتنزيل. هل تريد تحديث التطبيق الآن؟</p>
            <div className="update-notification-actions">
              <button className="btn-update-primary" onClick={handleDownload}>تحديث الآن</button>
              <button className="btn-update-secondary" onClick={handleDismiss}>لاحقاً</button>
            </div>
          </>
        );
      
      case 'downloading':
        return (
          <>
            <h4>جاري تنزيل التحديث...</h4>
            <div className="update-progress-container">
              <div className="update-progress-bar">
                <div 
                  className="update-progress-fill" 
                  style={{ width: `${updateStatus.percent || 0}%` }}
                ></div>
              </div>
              <span className="update-progress-text">
                {Math.round(updateStatus.percent || 0)}%
              </span>
            </div>
            <div className="update-notification-actions">
              <button className="btn-update-secondary" onClick={handleDismiss}>إخفاء</button>
            </div>
          </>
        );

      case 'ready':
        return (
          <>
            <h4>التحديث جاهز!</h4>
            <p>تم تنزيل التحديث بنجاح. يرجى إعادة تشغيل التطبيق لتثبيته.</p>
            <div className="update-notification-actions">
              <button className="btn-update-primary" onClick={handleInstall}>إعادة التشغيل الآن</button>
              <button className="btn-update-secondary" onClick={handleDismiss}>لاحقاً</button>
            </div>
          </>
        );

      case 'error':
        return (
          <>
            <h4>خطأ في التحديث</h4>
            <p className="update-error-text">{updateStatus.message || 'حدث خطأ غير متوقع أثناء التحديث.'}</p>
            <div className="update-notification-actions">
              <button className="btn-update-secondary" onClick={handleDismiss}>إغلاق</button>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  const content = renderContent();
  if (!content) return null;

  return (
    <div className="update-notification-container">
      <div className="update-notification-content">
        {content}
      </div>
    </div>
  );
};

export default UpdateNotification;
