/**
 * PrintButton - زر الطباعة مع خيارات
 * Print button with options
 */

import { useState, useEffect } from 'react';
import PrintService from '../../services/printing/PrintService';
import SettingsManager from '../../services/printing/SettingsManager';

function PrintButton({ invoiceData, invoiceType = 'saleInvoice', onPrintComplete }) {
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const userSettings = await SettingsManager.loadSettings();
      setSettings(userSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handlePrint = async () => {
    if (!settings) {
      alert('جاري تحميل الإعدادات... / Loading settings...');
      return;
    }

    setLoading(true);
    try {
      // Determine paper size (default to thermal80mm for now)
      const paperSize = 'thermal80mm';
      const templateId = settings.templates[invoiceType]?.[paperSize] || 'professional-80mm';
      
      const result = await PrintService.printInvoice(
        invoiceData,
        templateId,
        { 
          silent: settings.printOptions.silent,
          paperSize 
        }
      );
      
      if (result.success) {
        alert('تمت الطباعة بنجاح / Print successful');
        onPrintComplete?.();
      } else {
        alert(`فشلت الطباعة / Print failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Print error:', error);
      alert('فشلت الطباعة / Print failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={handlePrint} 
      disabled={loading || !settings}
      style={{
        padding: '8px 16px',
        backgroundColor: loading ? '#ccc' : '#4CAF50',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: loading ? 'not-allowed' : 'pointer',
        fontSize: '14px'
      }}
    >
      {loading ? 'جاري الطباعة... / Printing...' : 'طباعة / Print'}
    </button>
  );
}

export default PrintButton;
