import { useEffect, useMemo, useRef, useState } from 'react';
import type { LicenseStatus } from '../license/types';

interface LicensePageProps {
  onActivated?: (status: LicenseStatus) => void;
  onStatusChanged?: (status: LicenseStatus) => void;
  onClose?: () => void;
}

const statusColorMap: Record<LicenseStatus['status'], string> = {
  NO_LICENSE: '#334155',
  ACTIVE: '#166534',
  TRIAL_ACTIVE: '#0369a1',
  EXPIRED: '#b91c1c',
  INVALID_SIGNATURE: '#b45309',
  NOT_YET_VALID: '#7c2d12',
  DEVICE_MISMATCH: '#7f1d1d',
  CORRUPT: '#991b1b',
};

function formatDateAr(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-99999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

export default function LicensePage({ onActivated, onStatusChanged, onClose }: LicensePageProps) {
  const [currentStatus, setCurrentStatus] = useState<LicenseStatus | null>(null);
  const [candidateStatus, setCandidateStatus] = useState<LicenseStatus | null>(null);
  const [deviceFingerprint, setDeviceFingerprint] = useState('');
  const [licenseJsonText, setLicenseJsonText] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [isBusy, setIsBusy] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [notice, setNotice] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayedStatus = useMemo(() => {
    return candidateStatus ?? currentStatus;
  }, [candidateStatus, currentStatus]);

  const canActivate = candidateStatus?.status === 'ACTIVE' && licenseJsonText.trim().length > 0 && !isBusy;

  useEffect(() => {
    const loadInitialData = async () => {
      setIsBusy(true);
      try {
        const [status, fingerprint] = await Promise.all([
          window.licensing.getStatus(),
          window.licensing.getDeviceFingerprint(),
        ]);
        setCurrentStatus(status);
        setDeviceFingerprint(fingerprint);
      } catch (error) {
        console.error('License initialization failed:', error);
        setCurrentStatus({
          status: 'CORRUPT',
          messageAr: 'تعذر الاتصال بخدمة الترخيص. أعد تشغيل التطبيق.',
        });
      } finally {
        setIsBusy(false);
      }
    };

    void loadInitialData();
  }, []);

  const refreshCurrentStatus = async () => {
    try {
      const status = await window.licensing.getStatus();
      setCurrentStatus(status);
      onStatusChanged?.(status);
      return status;
    } catch (error) {
      console.error('License status refresh failed:', error);
      const fallback: LicenseStatus = {
        status: 'CORRUPT',
        messageAr: 'تعذر قراءة حالة الترخيص. أعد تشغيل التطبيق.',
      };
      setCurrentStatus(fallback);
      onStatusChanged?.(fallback);
      return fallback;
    }
  };

  const validateCandidate = async (text: string) => {
    setIsBusy(true);
    setNotice('');
    try {
      const result = await window.licensing.activateFromJson(text, { dryRun: true });
      setCandidateStatus(result);
    } catch (error) {
      console.error('License candidate validation failed:', error);
      setCandidateStatus({
        status: 'CORRUPT',
        messageAr: 'تعذر التحقق من ملف الترخيص حالياً.',
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleLicenseText = async (text: string, fileName = 'license.json') => {
    setLicenseJsonText(text);
    setSelectedFileName(fileName);
    await validateCandidate(text);
  };

  const handleFileSelect = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    await handleLicenseText(text, file.name || 'license.json');
  };

  const onActivateClick = async () => {
    if (!canActivate) return;

    setIsBusy(true);
    setNotice('');
    try {
      const result = await window.licensing.activateFromJson(licenseJsonText);
      setCurrentStatus(result);
      setCandidateStatus(result);
      onStatusChanged?.(result);
      if (result.status === 'ACTIVE') {
        onActivated?.(result);
        setNotice('تم تفعيل الترخيص بنجاح. يمكنك الآن متابعة العمل.');
      }
    } catch (error) {
      console.error('License activation failed:', error);
      setNotice('فشل تفعيل الترخيص. أعد تشغيل التطبيق ثم حاول مرة أخرى.');
    } finally {
      setIsBusy(false);
    }
  };

  const onRemoveClick = async () => {
    setIsBusy(true);
    setNotice('');
    try {
      const result = await window.licensing.remove();
      setCurrentStatus(result);
      setCandidateStatus(null);
      setLicenseJsonText('');
      setSelectedFileName('');
      onStatusChanged?.(result);
      setNotice('تم حذف الترخيص من هذا الجهاز.');
    } catch (error) {
      console.error('License removal failed:', error);
      setNotice('فشل حذف الترخيص حالياً. أعد تشغيل التطبيق ثم أعد المحاولة.');
    } finally {
      setIsBusy(false);
    }
  };

  const onCopyFingerprintClick = async () => {
    if (!deviceFingerprint) return;
    await copyText(deviceFingerprint);
    setNotice('تم نسخ بصمة الجهاز.');
  };

  const onDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    await handleFileSelect(file);
  };

  const cardColor = displayedStatus ? statusColorMap[displayedStatus.status] : '#1e293b';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 60%, #334155 100%)',
        direction: 'rtl',
        color: '#e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: 'min(900px, 100%)',
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          borderRadius: 18,
          padding: 24,
          boxShadow: '0 30px 80px rgba(2, 6, 23, 0.55)',
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: 8, fontSize: 30 }}>تفعيل الترخيص</h1>
        <p style={{ marginTop: 0, marginBottom: 18, color: '#cbd5e1', lineHeight: 1.7 }}>
          هذا الجهاز يحتاج ملف ترخيص صالح وموقع رقمياً لتشغيل Sales Manager.
        </p>

        <div
          style={{
            borderRadius: 14,
            border: '1px solid rgba(148, 163, 184, 0.3)',
            overflow: 'hidden',
            marginBottom: 16,
          }}
        >
          <div style={{ backgroundColor: cardColor, padding: '14px 16px', fontWeight: 700, fontSize: 18 }}>
            {displayedStatus ? displayedStatus.messageAr : 'جاري فحص حالة الترخيص...'}
          </div>
          <div style={{ padding: 16, backgroundColor: 'rgba(15, 23, 42, 0.75)' }}>
            <div style={{ marginBottom: 8 }}>
              <strong>الحالة:</strong> {displayedStatus?.status ?? '...'}
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>العميل:</strong> {displayedStatus?.details?.customerName ?? '-'}
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>رقم الترخيص:</strong> {displayedStatus?.details?.licenseId ?? '-'}
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>تاريخ الانتهاء:</strong> {formatDateAr(displayedStatus?.details?.expiresAt)}
            </div>
            <div>
              <strong>الخصائص:</strong>{' '}
              {displayedStatus?.details?.features?.length
                ? displayedStatus.details.features.join(' - ')
                : '-'}
            </div>
          </div>
        </div>

        <div
          onDrop={onDrop}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
          style={{
            borderRadius: 14,
            padding: 20,
            marginBottom: 14,
            border: isDragOver ? '2px dashed #38bdf8' : '2px dashed rgba(148, 163, 184, 0.45)',
            backgroundColor: isDragOver ? 'rgba(14, 116, 144, 0.2)' : 'rgba(30, 41, 59, 0.35)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            textAlign: 'center',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={async (event) => {
              const file = event.target.files?.[0] ?? null;
              await handleFileSelect(file);
              event.currentTarget.value = '';
            }}
          />
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>اسحب ملف الترخيص هنا أو اضغط للاختيار</div>
          <div style={{ color: '#cbd5e1' }}>
            {selectedFileName ? `الملف المختار: ${selectedFileName}` : 'الملف المطلوب: license.json'}
          </div>
        </div>

        <div
          style={{
            marginBottom: 14,
            backgroundColor: 'rgba(30, 41, 59, 0.5)',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div style={{ marginBottom: 6, fontWeight: 700 }}>بصمة الجهاز</div>
          <div
            style={{
              fontFamily: 'Consolas, ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
              fontSize: 12,
              wordBreak: 'break-all',
              color: '#e2e8f0',
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              borderRadius: 8,
              padding: 10,
            }}
          >
            {deviceFingerprint || '...'}
          </div>
        </div>

        {notice ? (
          <div
            style={{
              marginBottom: 14,
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid rgba(148, 163, 184, 0.3)',
              backgroundColor: 'rgba(30, 41, 59, 0.6)',
            }}
          >
            {notice}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            disabled={!canActivate}
            onClick={() => {
              void onActivateClick();
            }}
            style={{
              border: 0,
              borderRadius: 10,
              padding: '11px 16px',
              fontWeight: 700,
              cursor: canActivate ? 'pointer' : 'not-allowed',
              backgroundColor: canActivate ? '#16a34a' : '#475569',
              color: '#fff',
            }}
          >
            تفعيل الترخيص
          </button>

          <button
            disabled={isBusy}
            onClick={() => {
              void onRemoveClick();
            }}
            style={{
              border: 0,
              borderRadius: 10,
              padding: '11px 16px',
              fontWeight: 700,
              cursor: isBusy ? 'not-allowed' : 'pointer',
              backgroundColor: '#b91c1c',
              color: '#fff',
            }}
          >
            حذف الترخيص
          </button>

          <button
            disabled={!deviceFingerprint || isBusy}
            onClick={() => {
              void onCopyFingerprintClick();
            }}
            style={{
              border: 0,
              borderRadius: 10,
              padding: '11px 16px',
              fontWeight: 700,
              cursor: !deviceFingerprint || isBusy ? 'not-allowed' : 'pointer',
              backgroundColor: '#0369a1',
              color: '#fff',
            }}
          >
            نسخ بصمة الجهاز
          </button>

          <button
            disabled={isBusy}
            onClick={() => {
              void refreshCurrentStatus();
            }}
            style={{
              border: 0,
              borderRadius: 10,
              padding: '11px 16px',
              fontWeight: 700,
              cursor: isBusy ? 'not-allowed' : 'pointer',
              backgroundColor: '#334155',
              color: '#fff',
            }}
          >
            تحديث الحالة
          </button>

          {onClose ? (
            <button
              type="button"
              disabled={isBusy}
              onClick={onClose}
              style={{
                border: 0,
                borderRadius: 10,
                padding: '11px 16px',
                fontWeight: 700,
                cursor: isBusy ? 'not-allowed' : 'pointer',
                backgroundColor: '#0f766e',
                color: '#fff',
              }}
            >
              العودة للتطبيق
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
