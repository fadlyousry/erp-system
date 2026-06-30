import React, { useEffect } from 'react';
import { X, AlertCircle, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';

const ModernConfirmModal = ({ 
  isOpen, 
  onConfirm, 
  onCancel, 
  title = 'تأكيد', 
  message = '', 
  type = 'warning', // warning, success, info, danger
  confirmText = 'موافق',
  cancelText = 'إلغاء'
}) => {
  
  // وظيفة لإصدار صوت تنبيه باستخدام Web Audio API (أكثر سلاسة وموثوقية)
  const playNotificationSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime); // نغمة D5
      
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.4);
      
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

  const getIcon = () => {
    switch (type) {
      case 'danger': return <AlertCircle size={32} color="#ef4444" />;
      case 'success': return <CheckCircle2 size={32} color="#22c55e" />;
      case 'info': return <HelpCircle size={32} color="#3b82f6" />;
      default: return <AlertTriangle size={32} color="#f59e0b" />;
    }
  };

  const getIconBg = () => {
    switch (type) {
      case 'danger': return '#fef2f2';
      case 'success': return '#f0fdf4';
      case 'info': return '#eff6ff';
      default: return '#fffbeb';
    }
  };

  const getConfirmBg = () => {
    switch (type) {
      case 'danger': return '#ef4444';
      case 'success': return '#22c55e';
      case 'info': return '#3b82f6';
      default: return '#f59e0b';
    }
  };

  return (
    <div className="modern-modal-overlay">
      <div className="modern-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modern-modal-header">
          <div className="modern-modal-icon-wrapper" style={{ background: getIconBg() }}>
            {getIcon()}
          </div>
          <button className="modern-close-btn" onClick={onCancel}>
            <X size={20} />
          </button>
        </div>

        <div className="modern-modal-body">
          <h2>{title}</h2>
          <div className="modern-message">
             {message.split('\n').map((line, idx) => (
                <p key={idx}>{line}</p>
             ))}
          </div>
        </div>

        <div className="modern-modal-footer">
          <button className="modern-btn-confirm" onClick={onConfirm} style={{ background: getConfirmBg() }}>
            {confirmText}
          </button>
          <button className="modern-btn-cancel" onClick={onCancel}>
            {cancelText}
          </button>
        </div>
      </div>

      <style>{`
        .modern-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          direction: rtl;
          font-family: 'Tajawal', 'Cairo', sans-serif;
        }
        .modern-modal-content {
          background: #ffffff;
          width: 90%;
          max-width: 400px;
          border-radius: 24px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
          overflow: hidden;
          animation: none;
        }
        .modern-modal-header {
          padding: 24px 24px 0;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .modern-modal-icon-wrapper {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
        }
        .modern-close-btn {
          background: #f1f5f9;
          border: none;
          width: 32px;
          height: 32px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #64748b;
          cursor: pointer;
        }
        .modern-modal-body {
          padding: 0 24px 24px;
          text-align: center;
        }
        .modern-modal-body h2 {
          font-size: 20px;
          font-weight: 800;
          color: #0f172a;
          margin-bottom: 8px;
        }
        .modern-message p {
          color: #64748b;
          font-size: 14px;
          line-height: 1.6;
          margin: 0;
        }
        .modern-modal-footer {
          padding: 20px 24px;
          background: #f8fafc;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          border-top: 1px solid #f1f5f9;
        }
        .modern-btn-confirm, .modern-btn-cancel {
          padding: 12px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          border: none;
          font-family: inherit;
        }
        .modern-btn-confirm {
          color: white;
        }
        .modern-btn-cancel {
          background: white;
          color: #64748b;
          border: 1px solid #e2e8f0;
        }
        .modern-btn-confirm:hover {
          filter: brightness(0.9);
        }
        .modern-btn-cancel:hover {
          background: #f1f5f9;
        }
      `}</style>
    </div>
  );
};

export default ModernConfirmModal;
