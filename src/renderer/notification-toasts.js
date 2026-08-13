(function attachNotificationToasts(global) {
  'use strict';

  const AUTO_DISMISS_MS = Object.freeze({ info: 5_000, success: 5_000, progress: 7_000 });

  function text(value, fallback = '') {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
  }

  function iconFor(kind) {
    return ({ error: '⚠️', warning: '⚠️', success: '✓', progress: '⏳' })[kind] || 'ℹ️';
  }

  function show(options = {}) {
    const region = global.document.querySelector('#toast-region');
    if (!region) return { dismiss() {} };
    const kind = ['info', 'success', 'warning', 'error', 'progress'].includes(options.kind) ? options.kind : 'info';
    const item = global.document.createElement('article');
    item.className = `toast ${kind}`;
    item.tabIndex = 0;
    item.setAttribute('role', kind === 'error' || kind === 'warning' ? 'alert' : 'status');
    item.setAttribute('aria-label', `${text(options.title, 'Notification')}: ${text(options.detail, 'No detail supplied.')}`);

    const decoration = global.document.createElement('span');
    decoration.className = 'toast-emoji';
    decoration.setAttribute('aria-hidden', 'true');
    decoration.textContent = iconFor(kind);
    if (options.showEmoji === false) decoration.hidden = true;

    const content = global.document.createElement('div');
    content.className = 'toast-content';
    const title = global.document.createElement('strong');
    title.className = 'toast-title';
    title.textContent = text(options.title, 'Notification');
    const detail = global.document.createElement('span');
    detail.className = 'toast-copy';
    detail.textContent = text(options.detail, 'No detail supplied.');
    content.append(title, detail);

    const controls = global.document.createElement('div');
    controls.className = 'toast-controls';
    if (typeof options.onAction === 'function' && options.actionLabel) {
      const action = global.document.createElement('button');
      action.type = 'button';
      action.className = 'text-action toast-action';
      action.textContent = text(options.actionLabel, 'Open');
      action.addEventListener('click', () => options.onAction());
      controls.append(action);
    }
    const dismiss = global.document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'icon-action toast-dismiss';
    dismiss.textContent = '×';
    dismiss.setAttribute('aria-label', `Dismiss notification: ${text(options.title, 'Notification')}`);

    let timer = null;
    const remove = () => {
      if (timer !== null) global.clearTimeout(timer);
      item.remove();
    };
    dismiss.addEventListener('click', async () => {
      remove();
      if (typeof options.onDismiss === 'function') await options.onDismiss();
    });
    controls.append(dismiss);
    item.append(decoration, content, controls);
    region.append(item);
    const timeout = AUTO_DISMISS_MS[kind];
    if (timeout) timer = global.setTimeout(remove, timeout);
    return { dismiss: remove, element: item };
  }

  global.StudioNotificationToasts = Object.freeze({ show });
})(window);
