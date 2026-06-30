import React, { useState, useEffect } from 'react';
import { LogOut, Database, X, AlertTriangle } from 'lucide-react';

const ExitConfirmationModal = ({ isOpen, onConfirm }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState(false);

  // وظيفة لإصدار صوت تنبيه باستخدام Web Audio API (أكثر سلاسة وموثوقية)
  const playNotificationSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine'; // صوت ناعم
      oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime); // نغمة D5
      
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.4);
      
      // إغلاق الـ context لتوفير الموارد
      setTimeout(() => audioCtx.close(), 500);
    } catch (e) {
      console.error('Failed to play sound:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      playNotificationSound();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAction = async (choice) => {
    setIsProcessing(true);
    try {
      const result = await window.api.confirmExit(choice);
      if (choice === 'backup' && result?.success) {
        setBackupSuccess(true);
        setTimeout(() => setBackupSuccess(false), 3000);
      }
      if (choice === 'cancel') {
        onConfirm('cancel');
      }
    } catch (error) {
      console.error('Exit action failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="exit-modal-overlay">
      <div className="exit-modal-content">
        <div className="exit-modal-header">
          <div className="exit-modal-icon-wrapper">
            <AlertTriangle size={32} className="warning-icon" />
          </div>
          <button className="exit-close-btn" onClick={() => handleAction('cancel')} disabled={isProcessing}>
            <X size={20} />
          </button>
        </div>

        <div className="exit-modal-body">
          <h2>تأكيد إغلاق البرنامج</h2>
          <p>أنت على وشك مغادرة البرنامج. ماذا تريد أن تفعل قبل الإغلاق؟</p>
          
          <div className="exit-info-box">
            <p>اختيار "خروج" سيقوم بتسجيل خروج المستخدم الحالي وحفظ الجلسة ثم إغلاق التطبيق.</p>
          </div>

          {backupSuccess && (
            <div className="backup-success-toast">
              ✅ تم إنشاء النسخة الاحتياطية بنجاح!
            </div>
          )}
        </div>

        <div className="exit-modal-footer">
          <div className="primary-actions">
            <button 
              className="exit-btn-quit" 
              onClick={() => handleAction('quit')}
              disabled={isProcessing}
            >
              <LogOut size={18} />
              <span>خروج آمن</span>
            </button>
            <button 
              className="exit-btn-backup" 
              onClick={() => handleAction('backup')}
              disabled={isProcessing}
            >
              <Database size={18} />
              <span>نسخة احتياطية</span>
            </button>
          </div>
          <button 
            className="exit-btn-cancel" 
            onClick={() => handleAction('cancel')}
            disabled={isProcessing}
          >
            إلغاء
          </button>
        </div>
      </div>

      <style>{`
        .exit-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          direction: rtl;
          font-family: 'Tajawal', 'Cairo', sans-serif;
        }

        .exit-modal-content {
          background: #ffffff;
          width: 90%;
          max-width: 480px;
          border-radius: 24px;
          border: 1px solid #e2e8f0;
          overflow: hidden;
          position: relative;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
          animation: none; /* لا توجد أنيميشن لضمان السلاسة */
        }

        .exit-modal-header {
          padding: 24px 24px 0;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .exit-modal-icon-wrapper {
          background: #fffbeb;
          width: 64px;
          height: 64px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
        }

        .warning-icon {
          color: #f59e0b;
        }

        .exit-close-btn {
          background: #f1f5f9;
          border: none;
          width: 36px;
          height: 36px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #64748b;
          cursor: pointer;
        }

        .exit-modal-body {
          padding: 0 32px 32px;
          text-align: center;
        }

        .exit-modal-body h2 {
          font-size: 24px;
          font-weight: 800;
          color: #0f172a;
          margin-bottom: 12px;
        }

        .exit-modal-body p {
          color: #64748b;
          font-size: 15px;
          line-height: 1.6;
        }

        .exit-info-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 16px;
          border-radius: 16px;
          margin-top: 24px;
        }

        .exit-info-box p {
          font-size: 13px;
          color: #475569;
          margin: 0;
        }

        .backup-success-toast {
          margin-top: 16px;
          padding: 10px;
          background: #ecfdf5;
          color: #059669;
          border-radius: 12px;
          font-weight: 700;
          font-size: 13px;
        }

        .exit-modal-footer {
          padding: 32px;
          background: #f8fafc;
          border-top: 1px solid #f1f5f9;
        }

        .primary-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }

        .exit-btn-quit, .exit-btn-backup, .exit-btn-cancel {
          padding: 14px 24px;
          border-radius: 16px;
          font-weight: 700;
          font-size: 15px;
          cursor: pointer;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .exit-btn-quit {
          background: #ef4444;
          color: white;
        }

        .exit-btn-backup {
          background: #0f172a;
          color: white;
        }

        .exit-btn-cancel {
          width: 100%;
          background: transparent;
          color: #64748b;
          border: 1px solid #e2e8f0;
        }

        .exit-btn-quit:hover:not(:disabled) {
          background: #dc2626;
        }

        .exit-btn-backup:hover:not(:disabled) {
          background: #1e293b;
        }

        .exit-btn-cancel:hover:not(:disabled) {
          background: #fff;
          color: #0f172a;
        }

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          filter: grayscale(1);
        }
      `}</style>
    </div>
  );
};

export default ExitConfirmationModal;
