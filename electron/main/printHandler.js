/**
 * Print Handler - معالج الطباعة في Main Process
 * Print handler in Main Process
 */

const { ipcMain } = require('electron');
const { PosPrinter } = require('electron-pos-printer');
const { IPC_CHANNELS, PRINT_ERRORS } = require('../../printing/config');

let mainWindow = null;

/**
 * Initialize print handlers
 * @param {BrowserWindow} window - Main window instance
 */
function initializePrintHandlers(window) {
  mainWindow = window;

  // Handle print invoice request
  ipcMain.handle(IPC_CHANNELS.PRINT_INVOICE, async (event, payload) => {
    return await handlePrintRequest(event, payload);
  });

  // Handle get printers request
  ipcMain.handle(IPC_CHANNELS.GET_PRINTERS, async () => {
    return await getAvailablePrinters();
  });

  // Handle preview invoice request
  ipcMain.handle(IPC_CHANNELS.PREVIEW_INVOICE, async (event, payload) => {
    return { success: true, html: payload.html };
  });

  console.log('Print handlers initialized');
}

/**
 * Handle print request from renderer
 * @param {Object} event - IPC event
 * @param {Object} payload - Print payload
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function handlePrintRequest(event, payload) {
  try {
    const { html, printerName, paperSize, options = {} } = payload;

    if (!html) {
      throw new Error(PRINT_ERRORS.NO_HTML_CONTENT);
    }

    // Validate printer if specified
    if (printerName) {
      const printers = await getAvailablePrinters();
      const printerExists = printers.some(p => p.name === printerName);
      if (!printerExists) {
        throw new Error(PRINT_ERRORS.PRINTER_NOT_FOUND);
      }
    }

    // Prepare print options
    const printOptions = {
      preview: options.preview || false,
      width: paperSize === '80mm' ? '80mm' : '210mm',
      margin: '0 0 0 0',
      copies: options.copies || 1,
      printerName: printerName || undefined,
      timeOutPerLine: options.timeOutPerLine || 400,
      silent: options.silent !== false,
      pageSize: paperSize === '80mm' ? { width: 80000, height: 200000 } : 'A4'
    };

    // Execute print
    const result = await executePrint(html, printOptions);
    
    // Send result back to renderer via event
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send(IPC_CHANNELS.PRINT_RESULT, result);
    }
    
    return result;

  } catch (error) {
    console.error('Print request error:', error);
    const errorResult = {
      success: false,
      error: error.message || PRINT_ERRORS.PRINT_FAILED
    };
    
    // Send error result to renderer
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send(IPC_CHANNELS.PRINT_RESULT, errorResult);
    }
    
    return errorResult;
  }
}

/**
 * Get available printers
 * @returns {Promise<Array<{name: string, displayName: string}>>}
 */
async function getAvailablePrinters() {
  try {
    if (!mainWindow || !mainWindow.webContents) {
      return [];
    }

    const webContents = mainWindow.webContents;
    let printers = [];
    if (typeof webContents.getPrintersAsync === 'function') {
      printers = await webContents.getPrintersAsync();
    } else if (typeof webContents.getPrinters === 'function') {
      printers = webContents.getPrinters();
    }

    return printers.map(printer => ({
      name: printer.name,
      displayName: printer.displayName || printer.name,
      description: printer.description || '',
      status: printer.status || 0,
      isDefault: printer.isDefault || false
    }));

  } catch (error) {
    console.error('Get printers error:', error);
    return [];
  }
}

/**
 * Execute print using electron-pos-printer
 * @param {string} html - HTML content to print
 * @param {Object} options - Print options
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function executePrint(html, options) {
  try {
    // Prepare data for electron-pos-printer
    const data = [
      {
        type: 'text',
        value: html,
        style: `
          * { 
            margin: 0; 
            padding: 0; 
            box-sizing: border-box; 
          }
          body { 
            font-family: 'Cairo', 'Tajawal', Arial, sans-serif;
            direction: rtl;
            text-align: right;
          }
          @media print {
            body { margin: 0; }
            @page { margin: 0; }
          }
        `,
        css: []
      }
    ];

    // Print using electron-pos-printer
    await PosPrinter.print(data, options);

    console.log('Print executed successfully');
    return { success: true };

  } catch (error) {
    console.error('Execute print error:', error);
    return {
      success: false,
      error: error.message || PRINT_ERRORS.PRINT_FAILED
    };
  }
}

module.exports = {
  initializePrintHandlers,
  handlePrintRequest,
  getAvailablePrinters,
  executePrint
};
