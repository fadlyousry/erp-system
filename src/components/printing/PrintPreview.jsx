/**
 * PrintPreview - معاينة الفاتورة قبل الطباعة
 * Preview invoice before printing
 */

import { useState, useEffect } from 'react';
import PrintService from '../../services/printing/PrintService';

function PrintPreview({ invoiceData, templateId, onPrint, onClose }) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPreview();
  }, [invoiceData, templateId]);

  const loadPreview = async () => {
    try {
      setLoading(true);
      setError(null);
      const rendered = await PrintService.previewInvoice(invoiceData, templateId);
      setHtml(rendered);
    } catch (err) {
      console.error('Preview error:', err);
      setError(err.message || 'فشل تحميل المعاينة / Failed to load preview');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        width: '90%',
        height: '90%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '15px 20px',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0 }}>معاينة الطباعة / Print Preview</h3>
          <button 
            onClick={onClose}
            style={{
              padding: '5px 15px',
              backgroundColor: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            إغلاق / Close
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '50px' }}>
              جاري التحميل... / Loading...
            </div>
          )}
          
          {error && (
            <div style={{ 
              textAlign: 'center', 
              padding: '50px',
              color: '#f44336'
            }}>
              {error}
            </div>
          )}
          
          {!loading && !error && html && (
            <iframe 
              srcDoc={html} 
              title="Preview"
              style={{
                width: '100%',
                height: '100%',
                border: '1px solid #ddd',
                borderRadius: '4px'
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '15px 20px',
          borderTop: '1px solid #ddd',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px'
        }}>
          <button 
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: '#ccc',
              color: '#333',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            إلغاء / Cancel
          </button>
          <button 
            onClick={handlePrint}
            disabled={loading || error}
            style={{
              padding: '8px 16px',
              backgroundColor: loading || error ? '#ccc' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading || error ? 'not-allowed' : 'pointer'
            }}
          >
            طباعة / Print
          </button>
        </div>
      </div>
    </div>
  );
}

export default PrintPreview;
