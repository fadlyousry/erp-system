/**
 * TemplateManager - إدارة القوالب وتحميلها
 * Manage and load templates
 */

import Handlebars from 'handlebars';

class TemplateManager {
  constructor() {
    this.compiledTemplates = new Map();
    this.registerHelpers();
  }

  /**
   * Load template by ID
   * @param {string} templateId - Template identifier
   * @returns {Promise<string>} - Template HTML string
   */
  async loadTemplate(templateId) {
    try {
      // Import template registry
      const templateRegistry = await import('../../../printing/templates/templateRegistry.js');
      
      // Find template metadata across all types
      const allTemplates = templateRegistry.getAllTemplates();
      let templateMeta = null;
      let templateType = null;
      
      for (const [type, templates] of Object.entries(allTemplates)) {
        if (templates[templateId]) {
          templateMeta = templates[templateId];
          templateType = type;
          break;
        }
      }
      
      if (!templateMeta) {
        throw new Error(`Template not found: ${templateId}`);
      }
      
      // Load the template module dynamically
      const templatePath = `../../../printing/templates/${templateMeta.path}`;
      const templateModule = await import(templatePath);
      
      // Get the render function (convention: render + PascalCase name)
      const renderFunctionName = Object.keys(templateModule).find(key => 
        key.startsWith('render') && typeof templateModule[key] === 'function'
      );
      
      if (!renderFunctionName) {
        throw new Error(`No render function found in template: ${templateId}`);
      }
      
      // Store the render function for later use
      this.compiledTemplates.set(templateId, {
        renderFunction: templateModule[renderFunctionName],
        metadata: templateMeta
      });
      
      return templateId; // Return ID as confirmation
    } catch (error) {
      console.error('Load template error:', error);
      throw error;
    }
  }

  /**
   * Compile template with Handlebars
   * @param {string} templateHtml - Template HTML
   * @returns {Function} - Compiled template function
   */
  compileTemplate(templateHtml) {
    return Handlebars.compile(templateHtml);
  }

  /**
   * Render template with data
   * @param {string} templateId - Template identifier
   * @param {Object} data - Data to render
   * @returns {Promise<string>} - Rendered HTML
   */
  async renderTemplate(templateId, data) {
    try {
      // Check if template is already loaded
      if (!this.compiledTemplates.has(templateId)) {
        await this.loadTemplate(templateId);
      }
      
      const template = this.compiledTemplates.get(templateId);
      
      if (!template || !template.renderFunction) {
        throw new Error(`Template not loaded: ${templateId}`);
      }
      
      // Call the render function with data
      const html = template.renderFunction(data);
      
      return html;
    } catch (error) {
      console.error('Render template error:', error);
      throw error;
    }
  }

  /**
   * Get all available templates
   * @returns {Promise<Array<{id: string, name: string, paperSize: string}>>}
   */
  async getAvailableTemplates() {
    try {
      // Import template registry
      const templateRegistry = await import('../../../printing/templates/templateRegistry.js');
      
      // Get all templates
      const allTemplates = templateRegistry.getAllTemplates();
      
      // Flatten all templates into a single array
      const templateList = [];
      
      for (const [type, templates] of Object.entries(allTemplates)) {
        for (const [id, meta] of Object.entries(templates)) {
          templateList.push({
            id: meta.id,
            name: meta.name,
            nameAr: meta.nameAr,
            paperSize: meta.paperSize,
            width: meta.width,
            height: meta.height,
            type: meta.type
          });
        }
      }
      
      return templateList;
    } catch (error) {
      console.error('Get templates error:', error);
      return [];
    }
  }

  /**
   * Register custom Handlebars helpers
   */
  registerHelpers() {
    // Format money
    Handlebars.registerHelper('money', (value) => {
      return Number(value || 0).toFixed(2);
    });

    // Format date
    Handlebars.registerHelper('formatDate', (value, format) => {
      if (!value) return '';
      
      const date = new Date(value);
      if (isNaN(date.getTime())) return value;
      
      // Default format: DD/MM/YYYY
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      if (format === 'datetime') {
        return `${day}/${month}/${year} ${hours}:${minutes}`;
      }
      
      return `${day}/${month}/${year}`;
    });

    // Conditional rendering
    Handlebars.registerHelper('ifGreaterThan', function(v1, v2, options) {
      return v1 > v2 ? options.fn(this) : options.inverse(this);
    });

    // Image with fallback
    Handlebars.registerHelper('imageOrPlaceholder', (url, placeholder) => {
      return url ? `<img src="${url}" />` : placeholder;
    });

    // Safe HTML escape
    Handlebars.registerHelper('safe', (value) => {
      const escaped = String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
      return new Handlebars.SafeString(escaped);
    });
  }
}

export default new TemplateManager();
