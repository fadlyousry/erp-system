/**
 * PrintService - خدمة مركزية لإدارة عمليات الطباعة
 * Central service for managing print operations
 */

import TemplateManager from './TemplateManager.js';
import SettingsManager from './SettingsManager.js';
import { transformSaleToTemplateData } from './dataAdapter.js';

class PrintService {
  constructor() {
    this.api = typeof window !== 'undefined' ? (window.api || window.electron) : null;
    this.ipcAvailable = Boolean(this.api);
  }

  /**
   * Print invoice with specified template
   * @param {Object} invoiceData - Invoice data from sale
   * @param {string} templateId - Template identifier
   * @param {Object} options - Print options
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async printInvoice(invoiceData, templateId, options = {}) {
    try {
      // Validate IPC availability
      if (!this.ipcAvailable) {
        throw new Error('IPC غير متاح / IPC not available');
      }

      // Validate invoice data
      if (!invoiceData || !invoiceData.id) {
        throw new Error('بيانات الفاتورة غير صالحة / Invalid invoice data');
      }

      // Validate template ID
      if (!templateId) {
        throw new Error('معرف القالب مطلوب / Template ID required');
      }

      // Transform data to template format
      const company = options.company || {};
      const templateData = transformSaleToTemplateData(invoiceData, company);

      // Render template with data
      const html = await TemplateManager.renderTemplate(templateId, templateData);

      if (!html) {
        throw new Error('فشل عرض القالب / Template rendering failed');
      }

      // Get template metadata for paper size
      const templates = await TemplateManager.getAvailableTemplates();
      const template = templates.find(t => t.id === templateId);
      const paperSize = template?.paperSize || '80mm';

      // Get printer settings
      const printerName = options.printerName || await SettingsManager.getDefaultPrinter(
        paperSize === 'A4' ? 'a4' : 'thermal80mm'
      );

      // Prepare print payload
      const payload = {
        html,
        printerName,
        paperSize,
        options: {
          silent: options.silent !== false,
          preview: options.preview || false,
          copies: options.copies || 1,
          timeOutPerLine: options.timeOutPerLine || 400
        }
      };

      // Send to main process via IPC
      const result = await this.api.printInvoice(payload);

      // Update last used printer
      if (result.success && printerName) {
        await SettingsManager.updatePrinter(
          paperSize === 'A4' ? 'a4' : 'thermal80mm',
          printerName
        );
      }

      return result;

    } catch (error) {
      console.error('Print error:', error);
      return {
        success: false,
        error: error.message || 'فشلت عملية الطباعة / Print failed'
      };
    }
  }

  /**
   * Preview invoice before printing
   * @param {Object} invoiceData - Invoice data
   * @param {string} templateId - Template identifier
   * @returns {Promise<string>} - Rendered HTML
   */
  async previewInvoice(invoiceData, templateId, options = {}) {
    try {
      // Validate invoice data
      if (!invoiceData || !invoiceData.id) {
        throw new Error('بيانات الفاتورة غير صالحة / Invalid invoice data');
      }

      // Validate template ID
      if (!templateId) {
        throw new Error('معرف القالب مطلوب / Template ID required');
      }

      // Transform data to template format
      const company = options.company || {};
      const templateData = transformSaleToTemplateData(invoiceData, company);

      // Render template with data
      const html = await TemplateManager.renderTemplate(templateId, templateData);

      if (!html) {
        throw new Error('فشل عرض القالب / Template rendering failed');
      }

      return html;

    } catch (error) {
      console.error('Preview error:', error);
      throw error;
    }
  }

  /**
   * Get list of available printers
   * @returns {Promise<Array<{name: string, displayName: string}>>}
   */
  async getAvailablePrinters() {
    try {
      // Validate IPC availability
      if (!this.ipcAvailable) {
        console.warn('IPC غير متاح / IPC not available');
        return [];
      }

      // Get printers from main process via IPC
      const printers = await this.api.getPrinters();
      return printers || [];

    } catch (error) {
      console.error('Get printers error:', error);
      return [];
    }
  }
}

export default new PrintService();
