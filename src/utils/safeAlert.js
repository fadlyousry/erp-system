const ALERT_THEME = {
  error: {
    bg: '#fee2e2',
    fg: '#b91c1c',
    border: '#fecaca',
    icon: '!'
  },
  warning: {
    bg: '#fef3c7',
    fg: '#92400e',
    border: '#fde68a',
    icon: '!'
  },
  success: {
    bg: '#dcfce7',
    fg: '#166534',
    border: '#bbf7d0',
    icon: '✓'
  },
  info: {
    bg: '#dbeafe',
    fg: '#1d4ed8',
    border: '#bfdbfe',
    icon: 'i'
  }
};

const ALERT_TITLE_BY_TYPE = {
  error: 'تعذر التنفيذ',
  warning: 'تنبيه',
  success: 'تمت العملية',
  info: 'معلومة'
};

let alertQueue = Promise.resolve();

const normalizeButtons = (buttons) => {
  if (!Array.isArray(buttons) || buttons.length === 0) return ['موافق'];
  const normalized = buttons
    .map((button) => String(button ?? '').trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : ['موافق'];
};

const asInt = (value, fallback = 0) => (Number.isInteger(value) ? value : fallback);

const enqueueAlert = (task) => {
  const next = alertQueue.then(task, task);
  alertQueue = next.catch(() => undefined);
  return next;
};

const showDomAlert = (rawMessage, options = {}) => new Promise((resolve) => {
  const doc = window.document;
  if (!doc?.body) {
    resolve({ response: 0 });
    return;
  }

  const message = String(rawMessage ?? '');
  const typeKey = typeof options.type === 'string' ? options.type.toLowerCase() : 'info';
  const type = ALERT_THEME[typeKey] ? typeKey : 'info';
  const theme = ALERT_THEME[type];
  const buttons = normalizeButtons(options.buttons);
  const defaultId = Math.max(0, Math.min(buttons.length - 1, asInt(options.defaultId, 0)));
  const cancelId = Math.max(0, Math.min(buttons.length - 1, asInt(options.cancelId, buttons.length - 1)));
  const title = String(options.title || ALERT_TITLE_BY_TYPE[type] || 'تنبيه');
  const detail = options.detail ? String(options.detail) : '';

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
    width: 'min(500px, calc(100vw - 28px))',
    background: '#ffffff',
    borderRadius: '14px',
    boxShadow: '0 24px 60px rgba(2, 6, 23, 0.35)',
    border: `1px solid ${theme.border}`,
    overflow: 'hidden',
    fontFamily: '"Cairo","Segoe UI",Tahoma,sans-serif'
  });

  const head = doc.createElement('div');
  Object.assign(head.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '16px 18px',
    borderBottom: `1px solid ${theme.border}`,
    background: '#f8fafc'
  });

  const icon = doc.createElement('span');
  icon.textContent = theme.icon;
  Object.assign(icon.style, {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '999px',
    background: theme.bg,
    color: theme.fg,
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
    const detailNode = doc.createElement('pre');
    detailNode.textContent = detail;
    Object.assign(detailNode.style, {
      margin: '12px 0 0 0',
      padding: '10px 12px',
      borderRadius: '10px',
      border: '1px solid #e2e8f0',
      background: '#f8fafc',
      color: '#475569',
      fontFamily: '"Consolas","Cascadia Mono",monospace',
      fontSize: '12px',
      lineHeight: '1.6',
      maxHeight: '220px',
      overflow: 'auto',
      whiteSpace: 'pre-wrap'
    });
    body.appendChild(detailNode);
  }

  const footer = doc.createElement('div');
  Object.assign(footer.style, {
    display: 'flex',
    justifyContent: 'flex-start',
    gap: '10px',
    padding: '16px 18px 18px'
  });

  const buttonNodes = buttons.map((label, idx) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = label;
    Object.assign(button.style, {
      appearance: 'none',
      borderRadius: '10px',
      border: idx === defaultId ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
      background: idx === defaultId ? '#1d4ed8' : '#ffffff',
      color: idx === defaultId ? '#ffffff' : '#0f172a',
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
    resolve({ response });
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

export const safeAlert = (message, focusEl, options = {}) => {
  const show = async () => {
    if (typeof window !== 'undefined' && window.document?.body) {
      await showDomAlert(message, options);
      return;
    }

    if (typeof window !== 'undefined' && window.api?.showMessageBox) {
      await window.api.showMessageBox({
        type: options.type || 'info',
        title: options.title,
        message: String(message ?? ''),
        detail: options.detail,
        buttons: options.buttons
      });
      return;
    }

    if (typeof window !== 'undefined' && window.alert) {
      window.alert(message);
    }
  };

  return enqueueAlert(show).finally(() => {
    setTimeout(() => {
      try {
        window.focus();
      } catch (err) {
        // ignore focus errors (e.g. if window is not available)
      }
      if (focusEl && typeof focusEl.focus === 'function') {
        focusEl.focus();
      }
    }, 0);
  });
};

export const safeConfirm = async (message, title = 'تأكيد') => {
  if (typeof window !== 'undefined' && window.api?.showMessageBox) {
    const result = await window.api.showMessageBox({
      type: 'question',
      title,
      message: String(message ?? ''),
      buttons: ['موافق', 'إلغاء'],
      defaultId: 0,
      cancelId: 1
    });
    return result?.response === 0;
  }

  if (typeof window !== 'undefined' && window.confirm) {
    return window.confirm(message);
  }

  return false;
};
