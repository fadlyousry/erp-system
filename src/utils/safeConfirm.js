let confirmQueue = Promise.resolve();

const normalizeButtons = (buttons) => {
  if (!Array.isArray(buttons) || buttons.length === 0) return ['نعم', 'لا'];
  const normalized = buttons
    .map((button) => String(button ?? '').trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : ['نعم', 'لا'];
};

const asInt = (value, fallback = 0) => (Number.isInteger(value) ? value : fallback);

const enqueueConfirm = (task) => {
  const next = confirmQueue.then(task, task);
  confirmQueue = next.catch(() => undefined);
  return next;
};

const showDomConfirm = (rawMessage, options = {}) => new Promise((resolve) => {
  const doc = window.document;
  if (!doc?.body) {
    resolve(false);
    return;
  }

  const message = String(rawMessage ?? '');
  const title = String(options.title || 'تأكيد');
  const detail = options.detail ? String(options.detail) : '';
  const buttons = normalizeButtons(options.buttons);
  const defaultId = Math.max(0, Math.min(buttons.length - 1, asInt(options.defaultId, 0)));
  const cancelId = Math.max(0, Math.min(buttons.length - 1, asInt(options.cancelId, buttons.length - 1)));

  const overlay = doc.createElement('div');
  overlay.setAttribute('role', 'presentation');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(2, 6, 23, 0.45)',
    backdropFilter: 'blur(2px)',
    direction: 'rtl'
  });

  const card = doc.createElement('div');
  card.setAttribute('role', 'alertdialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', title);
  Object.assign(card.style, {
    width: 'min(520px, calc(100vw - 28px))',
    background: '#ffffff',
    borderRadius: '14px',
    boxShadow: '0 24px 60px rgba(2, 6, 23, 0.35)',
    border: '1px solid #cbd5e1',
    overflow: 'hidden',
    fontFamily: '"Cairo","Segoe UI",Tahoma,sans-serif'
  });

  const head = doc.createElement('div');
  Object.assign(head.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '16px 18px',
    borderBottom: '1px solid #e2e8f0',
    background: '#f8fafc'
  });

  const icon = doc.createElement('span');
  icon.textContent = 'i';
  Object.assign(icon.style, {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '30px',
    height: '30px',
    borderRadius: '999px',
    background: '#dbeafe',
    color: '#1d4ed8',
    fontWeight: '800',
    flex: '0 0 auto'
  });

  const titleNode = doc.createElement('strong');
  titleNode.textContent = title;
  Object.assign(titleNode.style, {
    color: '#0f172a',
    fontSize: '1rem',
    lineHeight: '1.4'
  });

  head.append(icon, titleNode);

  const body = doc.createElement('div');
  Object.assign(body.style, {
    padding: '16px 18px 6px 18px'
  });

  const messageNode = doc.createElement('div');
  messageNode.textContent = message;
  Object.assign(messageNode.style, {
    color: '#1f2937',
    lineHeight: '1.8',
    whiteSpace: 'pre-wrap',
    fontSize: '0.97rem'
  });
  body.appendChild(messageNode);

  if (detail) {
    const detailNode = doc.createElement('div');
    detailNode.textContent = detail;
    Object.assign(detailNode.style, {
      marginTop: '10px',
      color: '#475569',
      fontSize: '0.9rem',
      lineHeight: '1.7',
      whiteSpace: 'pre-wrap'
    });
    body.appendChild(detailNode);
  }

  const footer = doc.createElement('div');
  Object.assign(footer.style, {
    display: 'flex',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    gap: '10px',
    padding: '16px 18px 18px'
  });

  const buttonNodes = buttons.map((label, idx) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = label;

    const isPrimary = idx === defaultId;
    const isDestructive = /حذف|delete/i.test(label) && isPrimary;
    const primaryBg = isDestructive ? '#dc2626' : '#1d4ed8';
    const primaryBorder = isDestructive ? '#dc2626' : '#1d4ed8';

    Object.assign(button.style, {
      appearance: 'none',
      borderRadius: '10px',
      border: isPrimary ? `1px solid ${primaryBorder}` : '1px solid #cbd5e1',
      background: isPrimary ? primaryBg : '#ffffff',
      color: isPrimary ? '#ffffff' : '#0f172a',
      fontWeight: '700',
      fontSize: '0.92rem',
      minWidth: '92px',
      padding: '9px 16px',
      cursor: 'pointer'
    });
    return button;
  });
  buttonNodes.forEach((button) => footer.appendChild(button));

  card.append(head, body, footer);
  overlay.appendChild(card);
  doc.body.appendChild(overlay);

  let closed = false;
  const close = (response) => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKeyDown, true);
    overlay.remove();
    resolve(response === defaultId);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(cancelId);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      close(defaultId);
    }
  };

  window.addEventListener('keydown', onKeyDown, true);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close(cancelId);
    }
  });

  buttonNodes.forEach((button, idx) => {
    button.addEventListener('click', () => close(idx));
  });

  setTimeout(() => {
    buttonNodes[defaultId]?.focus();
  }, 0);
});

/**
 * Safe confirm dialog with custom in-app UI, and Electron/native fallback.
 */
export const safeConfirm = (message, options = {}) => {
  const confirmTask = async () => {
    if (typeof window !== 'undefined' && window.document?.body) {
      return showDomConfirm(message, options);
    }

    if (typeof window !== 'undefined' && window.api?.showMessageBox) {
      const buttons = normalizeButtons(options.buttons);
      const defaultId = Math.max(0, Math.min(buttons.length - 1, asInt(options.defaultId, 0)));
      const cancelId = Math.max(0, Math.min(buttons.length - 1, asInt(options.cancelId, buttons.length - 1)));

      const result = await window.api.showMessageBox({
        type: 'question',
        title: options.title || 'تأكيد',
        message: String(message ?? ''),
        detail: options.detail,
        buttons,
        defaultId,
        cancelId
      });

      return result?.response === defaultId;
    }

    if (typeof window !== 'undefined' && window.confirm) {
      return window.confirm(message);
    }

    return false;
  };

  return enqueueConfirm(confirmTask);
};
