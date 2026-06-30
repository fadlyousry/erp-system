/**
 * SettingsManager - إدارة إعدادات الطباعة
 * Manage printing settings
 */

const SETTINGS_KEY = 'fadl_print_settings';

const DEFAULT_SETTINGS = {
  printers: {
    a4: {
      default: null,
      lastUsed: null
    },
    thermal80mm: {
      default: null,
      lastUsed: null
    }
  },
  templates: {
    saleInvoice: {
      a4: 'classic-a4',
      thermal80mm: 'professional-80mm'
    },
    purchaseInvoice: {
      a4: 'classic-a4',
      thermal80mm: 'professional-80mm'
    },
    saleReturn: {
      a4: 'classic-a4',
      thermal80mm: 'professional-80mm'
    },
    purchaseReturn: {
      a4: 'classic-a4',
      thermal80mm: 'professional-80mm'
    },
    paymentReceipt: {
      a4: 'classic-a4',
      thermal80mm: 'professional-80mm'
    }
  },
  printOptions: {
    silent: true,
    preview: false,
    copies: 1
  }
};

class SettingsManager {
  /**
   * Load user settings
   * @returns {Promise<Object>} - User settings
   */
  async loadSettings() {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const settings = JSON.parse(stored);
        // Merge with defaults to ensure all keys exist
        return this._mergeWithDefaults(settings);
      }
      return { ...DEFAULT_SETTINGS };
    } catch (error) {
      console.error('Load settings error:', error);
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Save user settings
   * @param {Object} settings - Settings to save
   * @returns {Promise<void>}
   */
  async saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Save settings error:', error);
      throw error;
    }
  }

  /**
   * Get default printer for paper size
   * @param {string} paperSize - 'a4' or 'thermal80mm'
   * @returns {Promise<string>} - Printer name
   */
  async getDefaultPrinter(paperSize) {
    try {
      const settings = await this.loadSettings();
      return settings.printers[paperSize]?.default || 
             settings.printers[paperSize]?.lastUsed || 
             null;
    } catch (error) {
      console.error('Get default printer error:', error);
      return null;
    }
  }

  /**
   * Get default template for invoice type
   * @param {string} invoiceType - Invoice type
   * @param {string} paperSize - Paper size
   * @returns {Promise<string>} - Template ID
   */
  async getDefaultTemplate(invoiceType, paperSize) {
    try {
      const settings = await this.loadSettings();
      return settings.templates[invoiceType]?.[paperSize] || null;
    } catch (error) {
      console.error('Get default template error:', error);
      return null;
    }
  }

  /**
   * Update printer setting
   * @param {string} paperSize - Paper size
   * @param {string} printerName - Printer name
   * @returns {Promise<void>}
   */
  async updatePrinter(paperSize, printerName) {
    try {
      const settings = await this.loadSettings();
      settings.printers[paperSize].lastUsed = printerName;
      if (!settings.printers[paperSize].default) {
        settings.printers[paperSize].default = printerName;
      }
      await this.saveSettings(settings);
    } catch (error) {
      console.error('Update printer error:', error);
      throw error;
    }
  }

  /**
   * Update template setting
   * @param {string} invoiceType - Invoice type
   * @param {string} paperSize - Paper size
   * @param {string} templateId - Template ID
   * @returns {Promise<void>}
   */
  async updateTemplate(invoiceType, paperSize, templateId) {
    try {
      const settings = await this.loadSettings();
      if (!settings.templates[invoiceType]) {
        settings.templates[invoiceType] = {};
      }
      settings.templates[invoiceType][paperSize] = templateId;
      await this.saveSettings(settings);
    } catch (error) {
      console.error('Update template error:', error);
      throw error;
    }
  }

  /**
   * Merge stored settings with defaults
   * @private
   */
  _mergeWithDefaults(settings) {
    return {
      printers: {
        ...DEFAULT_SETTINGS.printers,
        ...settings.printers
      },
      templates: {
        ...DEFAULT_SETTINGS.templates,
        ...settings.templates
      },
      printOptions: {
        ...DEFAULT_SETTINGS.printOptions,
        ...settings.printOptions
      }
    };
  }
}

export default new SettingsManager();
