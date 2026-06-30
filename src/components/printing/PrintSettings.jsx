/**
 * PrintSettings - واجهة إعدادات الطباعة
 * Print settings interface
 */

import { useState, useEffect } from 'react';
import SettingsManager from '../../services/printing/SettingsManager';
import PrintService from '../../services/printing/PrintService';

function PrintSettings() {
  const [settings, setSettings] = useState(null);
  const [printers, setPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [userSettings, availablePrinters] = await Promise.all([
        SettingsManager.loadSettings(),
        PrintService.getAvailablePrinters()
      ]);
      setSettings(userSettings);
      setPrinters(availablePrinters);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await SettingsManager.saveSettings(settings);
      alert('تم حفظ الإعدادات بنجاح / Settings saved successfully');
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('فشل حفظ الإعدادات / Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const updatePrinterSetting = (paperSize, field, value) => {
    setSettings(prev => ({
      ...prev,
      printers: {
        ...prev.printers,
        [paperSize]: {
          ...prev.printers[paperSize],
          [field]: value
        }
      }
    }));
  };

  const updatePrintOption = (option, value) => {
    setSettings(prev => ({
      ...prev,
      printOptions: {
        ...prev.printOptions,
        [option]: value
      }
    }));
  };

  if (loading) {
    return <div>جاري التحميل... / Loading...</div>;
  }

  if (!settings) {
    return <div>فشل تحميل الإعدادات / Failed to load settings</div>;
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>إعدادات الطباعة / Print Settings</h2>

      {/* A4 Printer Settings */}
      <section style={{ marginBottom: '30px', padding: '15px', border: '1px solid #ddd', borderRadius: '4px' }}>
        <h3>طابعة A4 / A4 Printer</h3>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            الطابعة الافتراضية / Default Printer:
          </label>
          <select 
            value={settings.printers.a4.default || ''}
            onChange={(e) => updatePrinterSetting('a4', 'default', e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
          >
            <option value="">-- اختر طابعة / Select Printer --</option>
            {printers.map(p => (
              <option key={p.name} value={p.name}>{p.displayName || p.name}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Thermal 80mm Printer Settings */}
      <section style={{ marginBottom: '30px', padding: '15px', border: '1px solid #ddd', borderRadius: '4px' }}>
        <h3>طابعة حرارية 80mm / Thermal 80mm Printer</h3>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            الطابعة الافتراضية / Default Printer:
          </label>
          <select 
            value={settings.printers.thermal80mm.default || ''}
            onChange={(e) => updatePrinterSetting('thermal80mm', 'default', e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
          >
            <option value="">-- اختر طابعة / Select Printer --</option>
            {printers.map(p => (
              <option key={p.name} value={p.name}>{p.displayName || p.name}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Print Options */}
      <section style={{ marginBottom: '30px', padding: '15px', border: '1px solid #ddd', borderRadius: '4px' }}>
        <h3>خيارات الطباعة / Print Options</h3>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input 
              type="checkbox" 
              checked={settings.printOptions.silent}
              onChange={(e) => updatePrintOption('silent', e.target.checked)}
            />
            طباعة صامتة (بدون نافذة) / Silent Print (No Dialog)
          </label>
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input 
              type="checkbox" 
              checked={settings.printOptions.preview}
              onChange={(e) => updatePrintOption('preview', e.target.checked)}
            />
            معاينة قبل الطباعة / Preview Before Print
          </label>
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            عدد النسخ / Number of Copies:
          </label>
          <input 
            type="number" 
            min="1" 
            max="10"
            value={settings.printOptions.copies}
            onChange={(e) => updatePrintOption('copies', parseInt(e.target.value) || 1)}
            style={{ width: '100px', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>
      </section>

      {/* Save Button */}
      <button 
        onClick={handleSave}
        disabled={saving}
        style={{
          padding: '10px 20px',
          backgroundColor: saving ? '#ccc' : '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: saving ? 'not-allowed' : 'pointer',
          fontSize: '16px'
        }}
      >
        {saving ? 'جاري الحفظ... / Saving...' : 'حفظ / Save'}
      </button>
    </div>
  );
}

export default PrintSettings;
