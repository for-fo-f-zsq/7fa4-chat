import { useEffect } from 'react';

/**
 * 同步表单字段交互后校验的 ARIA 状态与跨浏览器 :user-invalid 兜底：
 * - 页面加载时预设 aria-invalid="false"，避免空必填项过早读作错误
 * - 失焦/提交失败后将错误提示 id 接入 aria-describedby（错误消失后移除），并通过单个 polite live region 播报
 */
export function useUserInvalidSync(formRef) {
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const announcer = document.createElement('div');
    announcer.setAttribute('aria-live', 'polite');
    announcer.className = 'visually-hidden';
    document.body.append(announcer);

    const flagged = new WeakSet();
    const announced = new WeakSet();
    const dirtyState = new WeakMap();
    const supportsUserInvalid = typeof CSS !== 'undefined' && CSS.supports('selector(:user-invalid)');
    let announceTimer = 0;
    let announcedField = null;

    const linkError = (el, shown) => {
      const errorId = el.dataset?.error;
      if (!errorId) return;
      const ids = (el.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter((id) => id && id !== errorId);
      if (shown) ids.push(errorId);
      if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
      else el.removeAttribute('aria-describedby');
    };

    const announceError = (el) => {
      const errorEl = el.dataset?.error ? document.getElementById(el.dataset.error) : null;
      if (!errorEl) return;
      const labelText = el.labels?.[0]?.textContent?.replace(/\s+/g, ' ').trim();
      const errText = errorEl.textContent?.replace(/\s+/g, ' ').trim();
      if (!errText) return;
      clearTimeout(announceTimer);
      announcer.textContent = '';
      announcedField = el;
      announceTimer = window.setTimeout(() => {
        announcer.textContent = labelText ? `${labelText}: ${errText}` : errText;
      }, 500);
    };

    const syncAria = (el, announce = false) => {
      if (!el?.matches?.('input, select, textarea')) return;
      const invalid = supportsUserInvalid
        ? el.matches(':user-invalid')
        : el.classList.contains('user-invalid-fallback');
      if (invalid) {
        if (announce && !announced.has(el)) {
          announceError(el);
          announced.add(el);
        }
        el.setAttribute('aria-invalid', 'true');
        linkError(el, true);
        flagged.add(el);
      } else if (flagged.has(el) || el.getAttribute('aria-invalid') !== 'true') {
        el.setAttribute('aria-invalid', 'false');
        linkError(el, false);
        flagged.delete(el);
        announced.delete(el);
        if (announcedField === el) {
          clearTimeout(announceTimer);
          announcer.textContent = '';
        }
      }
    };

    const updateFallbackValidity = (el) => {
      if (supportsUserInvalid || !el?.checkValidity) return;
      const valid = el.validity.valid;
      el.classList.toggle('user-invalid-fallback', !valid);
      el.classList.toggle('user-valid-fallback', valid);
    };

    form.querySelectorAll('input, select, textarea').forEach((el) => syncAria(el));

    const onBlur = (e) => {
      const el = e.target;
      if (!supportsUserInvalid && el?.checkValidity) {
        const st = dirtyState.get(el) || { hasInteracted: false, hasBlurred: false };
        st.hasBlurred = true;
        dirtyState.set(el, st);
        if (st.hasInteracted) updateFallbackValidity(el);
      }
      syncAria(el, true);
    };

    const onInput = (e) => {
      const el = e.target;
      if (!supportsUserInvalid && el?.checkValidity) {
        const st = dirtyState.get(el) || { hasInteracted: false, hasBlurred: false };
        st.hasInteracted = true;
        dirtyState.set(el, st);
        if (st.hasBlurred) updateFallbackValidity(el);
      }
      if (el.hasAttribute?.('aria-invalid')) syncAria(el, false);
    };

    const onChange = (e) => {
      const el = e.target;
      if (!supportsUserInvalid && el?.checkValidity) {
        const st = dirtyState.get(el) || { hasInteracted: false, hasBlurred: false };
        st.hasInteracted = true;
        dirtyState.set(el, st);
        if (st.hasBlurred) updateFallbackValidity(el);
      }
      syncAria(el, true);
    };

    const onInvalid = (e) => {
      const el = e.target;
      if (!supportsUserInvalid && el?.checkValidity) {
        dirtyState.set(el, { hasInteracted: true, hasBlurred: true });
        updateFallbackValidity(el);
      }
      announced.add(el);
      syncAria(el, false);
    };

    const onReset = () => {
      window.setTimeout(() => {
        form.querySelectorAll('input, select, textarea').forEach((el) => {
          dirtyState.delete(el);
          el.classList.remove('user-invalid-fallback', 'user-valid-fallback');
          syncAria(el, false);
        });
      });
    };

    form.addEventListener('blur', onBlur, true);
    form.addEventListener('input', onInput);
    form.addEventListener('change', onChange, true);
    form.addEventListener('invalid', onInvalid, true);
    form.addEventListener('reset', onReset, true);

    return () => {
      clearTimeout(announceTimer);
      form.removeEventListener('blur', onBlur, true);
      form.removeEventListener('input', onInput);
      form.removeEventListener('change', onChange, true);
      form.removeEventListener('invalid', onInvalid, true);
      form.removeEventListener('reset', onReset, true);
      announcer.remove();
    };
  }, [formRef]);
}
