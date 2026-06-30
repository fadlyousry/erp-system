export const APP_NAVIGATE_EVENT = 'erp:navigate';
export const APP_OPEN_LICENSE_EVENT = 'erp:open-license';
export const POS_EDITOR_REQUEST_EVENT = 'erp:pos-editor-request';
export const POS_EDITOR_REQUEST_KEY = 'erp.posEditorRequest';

const emitEditorRequest = (payload, page = 'pos') => {
  if (typeof window === 'undefined' || !payload) return;

  const request = {
    ...payload,
    requestedAt: Date.now()
  };

  try {
    localStorage.setItem(POS_EDITOR_REQUEST_KEY, JSON.stringify(request));
  } catch (error) {
    console.error('Failed to persist POS editor request:', error);
  }

  window.dispatchEvent(new CustomEvent(POS_EDITOR_REQUEST_EVENT, { detail: request }));
  window.dispatchEvent(
    new CustomEvent(APP_NAVIGATE_EVENT, {
      detail: { page, reason: 'open-editor' }
    })
  );
};

export const emitPosEditorRequest = (payload) => {
  emitEditorRequest(payload, 'pos');
};

export const emitPurchaseEditorRequest = (payload) => {
  emitEditorRequest(payload, 'purchases');
};

export const emitReturnEditorRequest = (payload) => {
  emitEditorRequest(payload, 'returns');
};

export const emitPurchaseReturnEditorRequest = (payload) => {
  emitEditorRequest(payload, 'purchaseReturns');
};

export const readPosEditorRequest = () => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(POS_EDITOR_REQUEST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error('Failed to read POS editor request:', error);
    return null;
  }
};

export const clearPosEditorRequest = () => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(POS_EDITOR_REQUEST_KEY);
  } catch (error) {
    console.error('Failed to clear POS editor request:', error);
  }
};

export const emitOpenLicenseManagerRequest = () => {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent(APP_OPEN_LICENSE_EVENT, {
      detail: { source: 'settings', requestedAt: Date.now() }
    })
  );
};
