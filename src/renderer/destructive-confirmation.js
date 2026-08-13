(function attachDestructiveConfirmation(global) {
  'use strict';

  const TEXT_LIMIT = 2_048;

  function safeText(value, fallback) {
    const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    return text.slice(0, TEXT_LIMIT) || fallback;
  }

  function prefersReducedMotion() {
    return Boolean(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function requiredElement(selector) {
    const element = global.document.querySelector(selector);
    if (!element) throw new Error(`Destructive confirmation is missing ${selector}.`);
    return element;
  }

  /**
   * Opens the one shared destructive-action gate. The component authorizes
   * nothing itself: callers receive a truthful approval payload and remain
   * responsible for passing a current reviewed plan to the privileged process.
   */
  function open(options = {}) {
    const dialog = requiredElement('#command-confirmation-dialog');
    if (dialog.open) return Promise.reject(new Error('Resolve the current destructive confirmation before opening another one.'));

    const title = requiredElement('#command-confirmation-title');
    const copy = requiredElement('#command-confirmation-copy');
    const target = requiredElement('#command-confirmation-target');
    const first = requiredElement('#command-confirmation-first');
    const second = requiredElement('#command-confirmation-second');
    const slider = requiredElement('#command-confirmation-slider');
    const progress = requiredElement('#command-confirmation-progress');
    const progressLabel = requiredElement('#command-confirmation-progress-label');
    const complete = requiredElement('#command-confirmation-complete');
    const emergencyExit = requiredElement('#command-confirmation-cancel');
    const approve = requiredElement('#command-confirmation-accept');
    const origin = options.origin instanceof HTMLElement ? options.origin : global.document.activeElement;

    title.textContent = safeText(options.title, 'Confirm destructive action');
    copy.textContent = safeText(options.copy, 'Review the affected action and data before authorizing it.');
    target.textContent = safeText(options.target, 'Affected resource: not supplied.');
    first.checked = false;
    second.checked = false;
    slider.value = '0';
    slider.disabled = true;
    progress.value = 0;
    progress.max = 100;
    progressLabel.textContent = 'Authorization progress: 0%.';
    complete.hidden = true;
    dialog.dataset.confirmationState = 'locked';
    dialog.dataset.reducedMotion = String(prefersReducedMotion());

    return new Promise((resolve) => {
      let finished = false;
      let completionTimer = null;

      const removeListeners = () => {
        first.removeEventListener('change', update);
        second.removeEventListener('change', update);
        slider.removeEventListener('input', update);
        dialog.removeEventListener('cancel', onCancel);
        dialog.removeEventListener('close', onClose);
        emergencyExit.removeEventListener('click', onEmergencyExit);
        approve.removeEventListener('click', onApprove);
        if (completionTimer !== null) global.clearTimeout(completionTimer);
      };

      const finish = (approved) => {
        if (finished) return;
        finished = true;
        removeListeners();
        if (dialog.open) dialog.close(approved ? 'authorized' : 'cancelled');
        if (origin && typeof origin.focus === 'function') {
          global.setTimeout(() => origin.focus({ preventScroll: true }), 0);
        }
        resolve({
          approved: approved === true,
          confirmation: approved === true
            ? {
              confirmed: true,
              firstConfirmation: true,
              secondConfirmation: true,
              sliderValue: 100,
              confirmedAt: new Date().toISOString()
            }
            : null
        });
      };

      function update() {
        const armed = first.checked && second.checked;
        if (!armed && Number(slider.value) !== 0) slider.value = '0';
        slider.disabled = !armed;
        const value = armed ? Math.max(0, Math.min(100, Number(slider.value) || 0)) : 0;
        progress.value = value;
        progressLabel.textContent = armed
          ? `Authorization progress: ${value}%. Move the slider to 100% to enable authorization.`
          : 'Authorization progress: 0%. Complete both confirmations to unlock the slider.';
        dialog.dataset.confirmationState = value >= 100 ? 'ready' : (armed ? 'arming' : 'locked');
        approve.disabled = !(armed && value >= 100);
      }

      function onEmergencyExit() {
        finish(false);
      }

      function onCancel(event) {
        event.preventDefault();
        finish(false);
      }

      function onClose() {
        finish(false);
      }

      function onApprove() {
        if (approve.disabled || !first.checked || !second.checked || Number(slider.value) < 100) return;
        dialog.dataset.confirmationState = 'complete';
        complete.hidden = false;
        approve.disabled = true;
        completionTimer = global.setTimeout(() => finish(true), prefersReducedMotion() ? 0 : 180);
      }

      first.addEventListener('change', update);
      second.addEventListener('change', update);
      slider.addEventListener('input', update);
      dialog.addEventListener('cancel', onCancel);
      dialog.addEventListener('close', onClose);
      emergencyExit.addEventListener('click', onEmergencyExit);
      approve.addEventListener('click', onApprove);
      update();
      dialog.showModal();
      first.focus({ preventScroll: true });
    });
  }

  global.StudioDestructiveConfirmation = Object.freeze({ open });
})(window);
