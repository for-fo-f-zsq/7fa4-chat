import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Lenis from 'lenis';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clipboard,
  FileImage,
  HelpCircle,
  ImagePlus,
  Loader2,
  Monitor,
  Send,
  ShieldCheck,
  Sparkles,
  X
} from 'lucide-react';
import TechBackdrop from './components/TechBackdrop';
import SubpageHeader from './components/SubpageHeader';
import SubpageFooter from './components/SubpageFooter';
import LightboxDialog from './components/LightboxDialog';
import { useUserInvalidSync } from './hooks/useUserInvalidSync';
import { copyTextToClipboard, formatSize, handlePointerSpotlight } from './utils/format';
import { sitePath } from './utils/siteBase';

const MAX_SHOTS = 3;
const MAX_SHOT_BYTES = 3 * 1024 * 1024;
const MAX_CONTENT = 4000;
const MAX_CONTACT = 120;

const PLATFORM_OPTIONS = [
  { value: 'windows', label: 'Windows' },
  { value: 'linux', label: 'Linux' },
  { value: 'web', label: '网页版' },
  { value: 'macos', label: 'macOS' },
  { value: 'android', label: 'Android' },
  { value: 'unknown', label: '其它 / 不清楚' }
];

function detectInitialPlatform(urlParams) {
  const p = (urlParams.get('platform') || '').trim().toLowerCase();
  if (PLATFORM_OPTIONS.some((opt) => opt.value === p)) return p;
  if (p) return 'unknown';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (/Android/i.test(ua)) return 'android';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return 'linux';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macos';
  return 'web';
}

export default function FeedbackApp() {
  const prefersReduced = useReducedMotion() ?? false;
  const searchParams = useMemo(
    () => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()),
    []
  );
  const clientVersion = useMemo(() => (searchParams.get('version') || '').trim(), [searchParams]);

  const [content, setContent] = useState('');
  const [platform, setPlatform] = useState(() => detectInitialPlatform(searchParams));
  const [contact, setContact] = useState('');
  const [shots, setShots] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: '', isError: false });
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState(null);
  const [copiedId, setCopiedId] = useState(false);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(0);

  const formRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragDepthRef = useRef(0);

  useUserInvalidSync(formRef);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  }, []);

  useEffect(() => {
    if (prefersReduced) return;
    const lenis = new Lenis({
      lerp: 0.22,
      wheelMultiplier: 1.35,
      touchMultiplier: 1.4,
      smoothWheel: true
    });
    let rafId = 0;
    const raf = (time) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, [prefersReduced]);

  const addShotFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;

    setShots((prev) => {
      const room = MAX_SHOTS - prev.length;
      if (room <= 0) {
        setStatusMsg({ text: `最多只能添加 ${MAX_SHOTS} 张截图`, isError: true });
        return prev;
      }
      if (incoming.length > room) {
        setStatusMsg({ text: `最多添加 ${MAX_SHOTS} 张截图，已读取前 ${room} 张`, isError: true });
      }
      const candidates = incoming.slice(0, room);
      candidates.forEach((f) => {
        if (!/^image\/(png|jpeg|webp|gif)$/i.test(f.type)) {
          setStatusMsg({ text: '仅支持 PNG / JPG / WebP / GIF 格式图片', isError: true });
          return;
        }
        if (f.size > MAX_SHOT_BYTES) {
          setStatusMsg({ text: '单张截图大小不能超过 3 MB', isError: true });
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          setShots((curr) => {
            if (curr.length >= MAX_SHOTS) return curr;
            setStatusMsg({ text: '', isError: false });
            return [
              ...curr,
              {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                type: f.type,
                data: String(reader.result),
                name: f.name || 'screenshot.png',
                size: f.size
              }
            ];
          });
        };
        reader.readAsDataURL(f);
      });
      return prev;
    });
  }, []);

  useEffect(() => {
    if (submittedId) return;
    const onPaste = (e) => {
      const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
      const imgFiles = items
        .filter((it) => it.kind === 'file' && /^image\//.test(it.type))
        .map((it) => it.getAsFile())
        .filter(Boolean);
      if (!imgFiles.length) return;
      e.preventDefault();
      addShotFiles(imgFiles);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [addShotFiles, submittedId]);

  const validateContentField = (val) => {
    const el = textareaRef.current;
    if (!el) return true;
    const trimmed = String(val || '').trim();
    if (!trimmed) {
      el.setCustomValidity('请填写具体问题描述或功能建议');
      return false;
    }
    if (val.length > MAX_CONTENT) {
      el.setCustomValidity(`内容不能超过 ${MAX_CONTENT} 字`);
      return false;
    }
    el.setCustomValidity('');
    return true;
  };

  const handleContentChange = (e) => {
    const next = e.target.value;
    setContent(next);
    if (textareaRef.current) {
      textareaRef.current.setCustomValidity('');
    }
    if (statusMsg.isError) setStatusMsg({ text: '', isError: false });
  };

  const handleContentBlur = () => {
    if (content.length > 0 && !content.trim()) {
      validateContentField(content);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const valid = validateContentField(content);
    if (!valid || (formRef.current && !formRef.current.checkValidity())) {
      formRef.current?.reportValidity?.();
      textareaRef.current?.scrollIntoView?.({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'center' });
      textareaRef.current?.focus?.({ preventScroll: true });
      setStatusMsg({ text: !content.trim() ? '请先填写问题描述或建议' : `内容不能超过 ${MAX_CONTENT} 字`, isError: true });
      return;
    }

    setSubmitting(true);
    setStatusMsg({ text: '', isError: false });

    const payload = {
      content: content.trim(),
      platform,
      contact: contact.trim(),
      page: window.location.href,
      version: clientVersion,
      screenshots: shots.map((s) => ({ type: s.type, data: s.data, name: s.name }))
    };

    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 60_000);
      const res = await fetch(sitePath('api/feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      window.clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && data.ok) {
        setSubmittedId(data.id || '—');
        setCopiedId(false);
      } else {
        setStatusMsg({
          text: (data && data.error) || `提交失败（HTTP ${res.status}）`,
          isError: true
        });
      }
    } catch (err) {
      setStatusMsg({
        text: err?.name === 'AbortError' ? '提交超时，请检查网络后重试' : '网络错误，请检查连接后重试',
        isError: true
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTextareaKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (e.nativeEvent?.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      formRef.current?.requestSubmit?.();
    }
  };

  const handleResetForNew = () => {
    setSubmittedId(null);
    setContent('');
    setShots([]);
    setContact('');
    setStatusMsg({ text: '', isError: false });
    window.setTimeout(() => {
      formRef.current?.reset?.();
      textareaRef.current?.setCustomValidity?.('');
      textareaRef.current?.focus();
    }, 30);
  };

  const handleCopyId = async () => {
    if (!submittedId || submittedId === '—') return;
    if (await copyTextToClipboard(submittedId)) {
      setCopiedId(true);
      window.setTimeout(() => setCopiedId(false), 1800);
    }
  };

  const lightboxImages = useMemo(
    () => shots.map((s, idx) => ({ src: s.data, alt: `截图 ${idx + 1}`, label: s.name })),
    [shots]
  );

  const count = content.length;
  const countColor =
    count > MAX_CONTENT
      ? 'text-rose-400 font-semibold'
      : count > MAX_CONTENT * 0.9
        ? 'text-amber-300'
        : 'text-[var(--ink-muted)]';

  const activePlatformLabel = PLATFORM_OPTIONS.find((p) => p.value === platform)?.label || platform;

  return (
    <MotionConfig reducedMotion="user">
      <TechBackdrop reducedMotion={prefersReduced} />
      <SubpageHeader badgeText="意见反馈" activePage="feedback" />

      <main className="relative z-10 min-h-[calc(100vh-88px)] pt-28 pb-20 px-4 sm:px-6">
        <div className="max-w-[1080px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left rail: Editorial context & diagnostic telemetry */}
          <motion.aside
            initial={prefersReduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="lg:col-span-5 space-y-5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono tracking-wider text-cyan-300 border border-cyan-400/30 bg-cyan-400/10">
                <Sparkles className="w-3 h-3" />
                FEEDBACK // 意见反馈
              </span>
              {clientVersion && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-mono text-indigo-300 border border-indigo-400/30 bg-indigo-400/10">
                  客户端 {/^v/i.test(clientVersion) ? clientVersion : `v${clientVersion}`}
                </span>
              )}
            </div>

            <h1 className="text-[clamp(28px,4vw,42px)] font-bold tracking-tight leading-[1.15] text-[var(--ink-primary)]">
              把问题和想法
              <br />
              <span className="bg-gradient-to-r from-indigo-300 via-cyan-300 to-violet-300 bg-clip-text text-transparent">
                直接告诉我们
              </span>
            </h1>

            <p className="text-[15px] leading-relaxed text-[var(--ink-muted)]">
              无论是桌面端公式渲染异常、同步延迟、工具栏细节问题，还是你希望新增的实验室工具与交互灵感，都会直达开发者工作台。
            </p>

            <div
              onPointerMove={handlePointerSpotlight}
              className="spotlight-card rounded-2xl border border-[var(--border-hairline)] p-5 space-y-4"
            >
              <div className="flex items-center justify-between text-[12px] font-mono text-[var(--ink-muted)] pb-3 border-b border-[var(--border-hairline)]">
                <span className="flex items-center gap-1.5 text-[var(--ink-secondary)]">
                  <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                  自动识别上下文
                </span>
                <span className="text-emerald-400">READY</span>
              </div>

              <dl className="grid grid-cols-2 gap-3 text-[13px]">
                <div>
                  <dt className="text-[11px] font-mono text-[var(--ink-faint)] mb-0.5">当前选定平台</dt>
                  <dd className="text-[var(--ink-primary)] font-medium">{activePlatformLabel}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-mono text-[var(--ink-faint)] mb-0.5">客户端版本</dt>
                  <dd className="font-mono text-[var(--ink-primary)]">
                    {clientVersion ? (/^v/i.test(clientVersion) ? clientVersion : `v${clientVersion}`) : 'Web / 手动访问'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-mono text-[var(--ink-faint)] mb-0.5">截图附件配额</dt>
                  <dd className="font-mono text-[var(--ink-secondary)]">最多 3 张 · ≤ 3 MB</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-mono text-[var(--ink-faint)] mb-0.5">快捷键提交</dt>
                  <dd className="font-mono text-[var(--ink-secondary)]">Ctrl / Cmd + Enter</dd>
                </div>
              </dl>

              <div className="pt-3 border-t border-[var(--border-hairline)] flex flex-wrap gap-3 text-[12.5px]">
                <a
                  href={`${sitePath('')}#faq`}
                  className="inline-flex items-center gap-1 text-[var(--ink-secondary)] hover:text-cyan-300 transition-colors"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  查看常见问题
                </a>
                <a
                  href={sitePath('admin')}
                  className="inline-flex items-center gap-1 text-[var(--ink-secondary)] hover:text-indigo-300 transition-colors ml-auto"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  管理员入口
                </a>
              </div>
            </div>
          </motion.aside>

          {/* Right column: Interactive form or confirmation */}
          <motion.section
            initial={prefersReduced ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.48, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="lg:col-span-7"
          >
            <div
              onPointerMove={handlePointerSpotlight}
              className="spotlight-card rounded-3xl border border-[var(--border-strong)] p-6 sm:p-8 shadow-[0_28px_70px_-32px_rgba(0,0,0,0.9)]"
            >
              <AnimatePresence mode="wait">
                {!submittedId ? (
                  <motion.form
                    key="feedback-form"
                    ref={formRef}
                    onSubmit={handleSubmit}
                    noValidate
                    aria-labelledby="fb-form-heading"
                    initial={prefersReduced ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={prefersReduced ? undefined : { opacity: 0 }}
                    className="space-y-6"
                  >
                    <h2 id="fb-form-heading" className="visually-hidden">
                      提交 7FA4 Chat 意见反馈表单
                    </h2>

                    {/* 1. Feedback content */}
                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <label htmlFor="fb-content" className="text-[14px] font-semibold text-[var(--ink-primary)]">
                          反馈内容 <span className="text-rose-400" aria-hidden="true">*</span>
                          <span className="font-normal text-[12px] text-[var(--ink-muted)] ml-2">必填，最多 4000 字</span>
                        </label>
                        <span className={`font-mono text-[12px] tabular-nums shrink-0 ${countColor}`}>
                          {count} / {MAX_CONTENT}
                        </span>
                      </div>
                      <p id="fb-content-hint" className="text-[12.5px] text-[var(--ink-muted)]">
                        请写清当前操作、预期结果与实际异常表现，能稳定复现的步骤越详细越好。
                      </p>
                      <textarea
                        ref={textareaRef}
                        id="fb-content"
                        name="content"
                        required
                        maxLength={MAX_CONTENT}
                        value={content}
                        onChange={handleContentChange}
                        onBlur={handleContentBlur}
                        onKeyDown={handleTextareaKeyDown}
                        enterKeyHint="enter"
                        aria-describedby="fb-content-hint"
                        data-error="fb-content-error"
                        placeholder="描述你遇到的问题或想法，例如：在数学公式卡片内连续粘贴多行 LaTeX 后…"
                        className="site-field site-textarea-autosize w-full min-h-[168px] resize-y rounded-2xl border border-[var(--border-strong)] bg-[#060911]/85 px-4 py-3 text-[15px] leading-relaxed text-[var(--ink-primary)] placeholder:text-[var(--ink-faint)] outline-none focus:border-indigo-400/80 focus:ring-2 focus:ring-indigo-500/25 transition-colors"
                      />
                      <div
                        id="fb-content-error"
                        className="site-field-error items-center gap-1.5 text-[12.5px] text-rose-400 pt-0.5"
                      >
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" role="img" aria-label="错误" />
                        <span>请填写具体问题描述或功能建议（不能为空且不超过 4000 字）。</span>
                      </div>
                    </div>

                    {/* 2. Platform selection fieldset */}
                    <fieldset className="space-y-2.5 border-0 p-0 m-0">
                      <legend className="text-[14px] font-semibold text-[var(--ink-primary)] flex items-center gap-2">
                        <span>运行平台</span>
                        <span className="font-normal text-[12px] text-[var(--ink-muted)]">已自动识别，可手动改选</span>
                      </legend>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {PLATFORM_OPTIONS.map((opt) => {
                          const checked = platform === opt.value;
                          return (
                            <label
                              key={opt.value}
                              className={[
                                'relative inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-[13px] border cursor-pointer select-none transition-all',
                                checked
                                  ? 'border-indigo-400/70 bg-indigo-500/18 text-[var(--ink-primary)] font-semibold shadow-[0_0_20px_-6px_rgba(109,139,255,0.5)]'
                                  : 'border-[var(--border-hairline)] bg-white/[0.03] text-[var(--ink-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)]'
                              ].join(' ')}
                            >
                              <input
                                type="radio"
                                name="platform"
                                value={opt.value}
                                checked={checked}
                                onChange={() => setPlatform(opt.value)}
                                className="visually-hidden peer"
                              />
                              <span
                                aria-hidden="true"
                                className={[
                                  'w-2 h-2 rounded-full transition-transform',
                                  checked ? 'bg-cyan-400 scale-110' : 'bg-[var(--ink-faint)]'
                                ].join(' ')}
                              />
                              <span>{opt.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>

                    {/* 3. Screenshots dropzone */}
                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[14px] font-semibold text-[var(--ink-primary)]">
                          界面截图
                          <span className="font-normal text-[12px] text-[var(--ink-muted)] ml-2">
                            可选，最多 {MAX_SHOTS} 张，单张 ≤ 3 MB
                          </span>
                        </span>
                        <span className="font-mono text-[12px] text-[var(--ink-muted)]">
                          {shots.length} / {MAX_SHOTS}
                        </span>
                      </div>

                      <div
                        onDragEnter={(e) => {
                          e.preventDefault();
                          dragDepthRef.current += 1;
                          setDragOver(true);
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
                          if (!dragDepthRef.current) setDragOver(false);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          dragDepthRef.current = 0;
                          setDragOver(false);
                          if (e.dataTransfer?.files) addShotFiles(e.dataTransfer.files);
                        }}
                        className={[
                          'rounded-2xl border border-dashed p-3.5 transition-colors',
                          dragOver
                            ? 'border-cyan-400 bg-cyan-500/10'
                            : 'border-[var(--border-strong)] bg-[#060911]/55'
                        ].join(' ')}
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <AnimatePresence>
                            {shots.map((s, idx) => (
                              <motion.div
                                key={s.id}
                                layout
                                initial={prefersReduced ? false : { opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={prefersReduced ? undefined : { opacity: 0, scale: 0.85 }}
                                className="group relative w-24 h-24 rounded-xl overflow-hidden border border-[var(--border-strong)] bg-[#0b0e17]"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLightboxIdx(idx);
                                    setLightboxOpen(true);
                                  }}
                                  aria-label={`放大查看截图 ${idx + 1}: ${s.name}`}
                                  className="w-full h-full block cursor-zoom-in focus-visible:outline-2 focus-visible:outline-cyan-400"
                                >
                                  <img
                                    src={s.data}
                                    alt={`已添加截图 ${idx + 1}`}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setShots((prev) => prev.filter((item) => item.id !== s.id))}
                                  aria-label={`移除截图 ${idx + 1}`}
                                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-[#030407]/85 text-white grid place-items-center hover:bg-rose-500 transition-colors cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                                <span className="pointer-events-none absolute inset-x-0 bottom-0 px-1.5 py-0.5 text-[10px] font-mono bg-gradient-to-t from-black/85 to-transparent text-white/90 truncate">
                                  {formatSize(s.size)}
                                </span>
                              </motion.div>
                            ))}
                          </AnimatePresence>

                          {shots.length < MAX_SHOTS && (
                            <button
                              type="button"
                              onClick={() => {
                                if (!fileInputRef.current) return;
                                fileInputRef.current.value = '';
                                fileInputRef.current.click();
                              }}
                              className="w-24 h-24 rounded-xl border border-dashed border-[var(--border-strong)] bg-white/[0.03] hover:bg-indigo-500/12 hover:border-indigo-400/70 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] flex flex-col items-center justify-center gap-1.5 text-[12px] font-medium transition-all cursor-pointer"
                            >
                              <ImagePlus className="w-5 h-5" />
                              <span>添加截图</span>
                            </button>
                          )}
                        </div>

                        <p className="mt-3 text-[12px] text-[var(--ink-muted)] flex flex-wrap items-center gap-1.5">
                          <FileImage className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span>支持点击上传、拖拽图片到此区域，或直接</span>
                          <kbd className="px-1.5 py-0.5 rounded bg-white/8 border border-[var(--border-hairline)] font-mono text-[11px] text-[var(--ink-secondary)]">
                            Ctrl
                          </kbd>
                          <span>+</span>
                          <kbd className="px-1.5 py-0.5 rounded bg-white/8 border border-[var(--border-hairline)] font-mono text-[11px] text-[var(--ink-secondary)]">
                            V
                          </kbd>
                          <span>粘贴截图（PNG / JPG / WebP / GIF）</span>
                        </p>
                      </div>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        multiple
                        className="visually-hidden"
                        onChange={(e) => addShotFiles(e.target.files)}
                      />
                    </div>

                    {/* 4. Contact */}
                    <div className="space-y-1.5">
                      <label htmlFor="fb-contact" className="text-[14px] font-semibold text-[var(--ink-primary)] block">
                        联系方式
                        <span className="font-normal text-[12px] text-[var(--ink-muted)] ml-2">可选，方便有需要时联系你</span>
                      </label>
                      <input
                        id="fb-contact"
                        name="contact"
                        type="text"
                        maxLength={MAX_CONTACT}
                        value={contact}
                        onChange={(e) => setContact(e.target.value)}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        enterKeyHint="done"
                        placeholder="OJ 用户名 / 邮箱 / QQ，任选其一"
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[#060911]/85 px-4 py-2.5 min-h-[44px] text-[15px] text-[var(--ink-primary)] placeholder:text-[var(--ink-faint)] outline-none focus:border-indigo-400/80 focus:ring-2 focus:ring-indigo-500/25 transition-colors"
                      />
                    </div>

                    {/* 5. Submit & status */}
                    <div className="pt-4 border-t border-[var(--border-hairline)] flex flex-wrap items-center gap-3">
                      <button
                        type="submit"
                        disabled={submitting}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-white text-[#050811] text-[14px] font-semibold shadow-[0_12px_32px_-12px_rgba(255,255,255,0.45)] hover:opacity-92 disabled:opacity-60 transition-all cursor-pointer"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>提交中…</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            <span>提交反馈</span>
                          </>
                        )}
                      </button>

                      <span
                        role="status"
                        aria-live="polite"
                        className={[
                          'text-[13.5px] font-medium',
                          statusMsg.isError ? 'text-rose-400' : 'text-emerald-400'
                        ].join(' ')}
                      >
                        {statusMsg.text}
                      </span>

                      <span className="hidden sm:inline-flex items-center gap-1 ml-auto text-[12px] font-mono text-[var(--ink-faint)]">
                        <kbd className="px-1.5 py-0.5 rounded bg-white/8 border border-[var(--border-hairline)]">Ctrl</kbd>
                        +
                        <kbd className="px-1.5 py-0.5 rounded bg-white/8 border border-[var(--border-hairline)]">Enter</kbd>
                        提交
                      </span>
                    </div>
                  </motion.form>
                ) : (
                  <motion.div
                    key="feedback-done"
                    initial={prefersReduced ? false : { opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="py-8 sm:py-12 px-2 text-center space-y-5"
                  >
                    <div className="w-16 h-16 mx-auto rounded-full border border-emerald-400/40 bg-emerald-500/15 text-emerald-400 grid place-items-center shadow-[0_0_40px_rgba(16,185,129,0.22)]">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>

                    <div className="space-y-2">
                      <h2 className="text-2xl font-bold text-[var(--ink-primary)]">已收到，谢谢你的反馈！</h2>
                      <p className="text-[14.5px] text-[var(--ink-muted)] max-w-[420px] mx-auto leading-relaxed">
                        反馈已安全写入服务端工作台，我们会在后续版本迭代中进行排查与跟进。
                      </p>
                    </div>

                    <div className="inline-flex items-center gap-3 pl-4 pr-2 py-1.5 rounded-full border border-[var(--border-strong)] bg-white/[0.04]">
                      <span className="text-[12px] text-[var(--ink-muted)]">反馈编号</span>
                      <code className="font-mono text-[13.5px] font-semibold text-cyan-300 select-all">
                        {submittedId}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyId}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-medium bg-white/10 hover:bg-white/18 text-[var(--ink-primary)] transition-colors cursor-pointer"
                      >
                        {copiedId ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>已复制</span>
                          </>
                        ) : (
                          <>
                            <Clipboard className="w-3.5 h-3.5" />
                            <span>复制</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="pt-2 flex flex-wrap justify-center gap-3">
                      <button
                        type="button"
                        onClick={handleResetForNew}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-[#050811] text-[13.5px] font-semibold hover:opacity-92 transition-all cursor-pointer"
                      >
                        再提交一条
                      </button>
                      <a
                        href={sitePath('')}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[var(--border-strong)] bg-white/5 text-[13.5px] font-medium text-[var(--ink-primary)] hover:bg-white/10 transition-colors"
                      >
                        返回官网首页
                      </a>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.section>
        </div>
      </main>

      <SubpageFooter label="意见反馈" />

      <LightboxDialog
        open={lightboxOpen}
        images={lightboxImages}
        index={lightboxIdx}
        onIndexChange={setLightboxIdx}
        onClose={() => setLightboxOpen(false)}
      />
    </MotionConfig>
  );
}
