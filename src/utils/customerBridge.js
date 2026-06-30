/**
 * ERP Customer Bridge - Communicates between SmartAssistant and Customers page
 */

export const CUSTOMER_COMMAND_EVENT = 'erp:customer-command';

/**
 * Emit a command to the Customers page
 * @param {Object} payload { action: 'CREATE' | 'UPDATE', data: { name, phone } }
 */
export const emitCustomerCommand = (payload) => {
  if (typeof window === 'undefined' || !payload) return;

  const event = new CustomEvent(CUSTOMER_COMMAND_EVENT, {
    detail: {
      ...payload,
      timestamp: Date.now()
    }
  });

  window.dispatchEvent(event);
};
