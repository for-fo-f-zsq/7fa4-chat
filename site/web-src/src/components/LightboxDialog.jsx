import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

/**
 * 原生顶层 <dialog closedby="any"> 截图灯箱预览组件：
 * - 支持 Light-Dismiss（原生 closedby="any" + 不支持浏览器点击 backdrop 区域兜底）
 * - 支持多图左右切换及 Esc 关闭
 * - 通过 CSS dialog:modal / ::backdrop 的 overscroll-behavior: contain 阻止底层页面滚动穿透
 */
export default function LightboxDialog({
  open,
  images = [],
  index = 0,
  onIndexChange,
  onClose
}) {
  const dialogRef = useRef(null);
  const count = images.length;
  const safeIdx = count > 0 ? Math.min(Math.max(0, index), count - 1) : 0;
  const current = count > 0 ? images[safeIdx] : null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && current) {
      if (!dialog.open) {
        try {
          dialog.showModal();
        } catch {
          dialog.setAttribute('open', '');
        }
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open, current]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      onClose?.();
    };

    // Fallback for browsers without closedby="any" support (Safari)
    const handleClick = (event) => {
      if ('closedBy' in HTMLDialogElement.prototype) return;
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const inside =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!inside) {
        dialog.close();
      }
    };

    dialog.addEventListener('close', handleClose);
    dialog.addEventListener('click', handleClick);
    return () => {
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('click', handleClick);
    };
  }, [onClose]);

  useEffect(() => {
    if (!open || count <= 1) return;
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onIndexChange?.((safeIdx - 1 + count) % count);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onIndexChange?.((safeIdx + 1) % count);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, count, safeIdx, onIndexChange]);

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-label={current?.alt || '截图大图预览'}
      className="site-dialog"
    >
      {current && (
        <div className="relative flex flex-col items-center justify-center max-w-[92vw] max-h-[90dvh]">
          <div className="relative rounded-2xl border border-[var(--border-strong)] bg-[#070a12]/95 p-2 shadow-[0_32px_90px_rgba(0,0,0,0.88)]">
            <img
              src={current.src}
              alt={current.alt || '截图预览'}
              className="max-w-[88vw] max-h-[78dvh] rounded-xl object-contain block select-none"
            />

            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="关闭大图预览"
              className="absolute -top-3.5 -right-3.5 w-9 h-9 rounded-full border border-[var(--border-strong)] bg-[#0d1220] text-[var(--ink-primary)] grid place-items-center shadow-lg hover:bg-white hover:text-[#050811] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {count > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => onIndexChange?.((safeIdx - 1 + count) % count)}
                  aria-label="上一张截图"
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full border border-white/20 bg-black/65 backdrop-blur-md text-white grid place-items-center hover:bg-black/85 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => onIndexChange?.((safeIdx + 1) % count)}
                  aria-label="下一张截图"
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full border border-white/20 bg-black/65 backdrop-blur-md text-white grid place-items-center hover:bg-black/85 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}
          </div>

          <div className="mt-3 flex items-center gap-3 px-3.5 py-1.5 rounded-full border border-[var(--border-hairline)] bg-[#0b0e17]/90 backdrop-blur-md text-[12px] font-mono text-[var(--ink-secondary)]">
            <span className="truncate max-w-[240px]">{current.label || current.alt || '截图'}</span>
            {count > 1 && (
              <span className="text-cyan-400">
                {safeIdx + 1} / {count}
              </span>
            )}
            <span className="hidden sm:inline text-[var(--ink-faint)]">Esc 或点击空白处关闭</span>
          </div>
        </div>
      )}
    </dialog>
  );
}
