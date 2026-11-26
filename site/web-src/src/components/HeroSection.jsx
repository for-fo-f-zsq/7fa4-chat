import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import {
  ChevronDown,
  Download,
  ExternalLink,
  Globe,
  MoveHorizontal,
  Sparkles
} from 'lucide-react';
import { formatDate, formatSize } from '../utils/format';

function GithubIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
    </svg>
  );
}

const HOTSPOTS = [
  {
    id: 'sidebar',
    x: '2.5%',
    y: '18%',
    alignLeft: true,
    label: '工具舱与多端入口',
    detail: '左侧导轨一键切出 6 款离线演算工具，支持桌面独立窗复用。'
  },
  {
    id: 'katex',
    x: '46%',
    y: '34%',
    label: '原生 KaTeX 渲染',
    detail: '行内 $...$ 与块级 $$...$$ 与 OJ 排版完全对齐，拒绝模糊截图。'
  },
  {
    id: 'file',
    x: '46%',
    y: '60%',
    label: '本地缓存文件卡片',
    detail: '实验表格、课件与代码文件支持拖拽互传，断网即可回看历史。'
  },
  {
    id: 'composer',
    x: '31%',
    y: '92%',
    label: 'MD / 纯文本即时切换',
    detail: '内置 312 款 APNG 表情、Ctrl+V 贴图与自定义快捷键。'
  }
];

export default function HeroSection({ downloads, primaryDownload, platformLabel, onAnchorClick, reducedMotion }) {
  const stageRef = useRef(null);
  const popRef = useRef(null);
  const triggerRef = useRef(null);
  const [popOpen, setPopOpen] = useState(false);
  const [viewMode, setViewMode] = useState('split'); // 'dark' | 'split' | 'light'
  const [splitPct, setSplitPct] = useState(54);
  const [activePin, setActivePin] = useState('katex');

  const { scrollYProgress } = useScroll({
    target: stageRef,
    offset: ['start end', 'center center']
  });
  const rotateX = useTransform(scrollYProgress, [0, 1], reducedMotion ? [0, 0] : [7, 0]);
  const stageScale = useTransform(scrollYProgress, [0, 1], reducedMotion ? [1, 1] : [0.96, 1]);

  useEffect(() => {
    const trigger = triggerRef.current;
    const pop = popRef.current;
    if (!trigger || !pop) return;

    if (Object.hasOwn(HTMLElement.prototype, 'popover')) {
      const onToggle = (ev) => setPopOpen(ev.newState === 'open');
      pop.addEventListener('toggle', onToggle);
      return () => pop.removeEventListener('toggle', onToggle);
    }

    const toggle = (e) => {
      e.stopPropagation();
      setPopOpen(pop.classList.toggle(':popover-open'));
    };
    const close = (e) => {
      if (!pop.contains(e.target) && e.target !== trigger) {
        pop.classList.remove(':popover-open');
        setPopOpen(false);
      }
    };
    trigger.addEventListener('click', toggle);
    document.addEventListener('click', close);
    return () => {
      trigger.removeEventListener('click', toggle);
      document.removeEventListener('click', close);
    };
  }, []);

  const items = downloads?.items || [];
  const primaries = ['windows', 'macos', 'linux', 'android']
    .map((pf) => items.find((i) => i.platform === pf && i.primary) || items.find((i) => i.platform === pf))
    .filter(Boolean);

  const versionText = downloads?.version ? `v${downloads.version}` : `v${__SITE_APP_VERSION__}`;
  const dateText = downloads?.releaseDate ? formatDate(downloads.releaseDate) : '同步中';
  const mainHref = primaryDownload?.url || '#downloads';
  const mainLabel = platformLabel ? `下载 ${platformLabel} 版` : '下载客户端';
  const currentPin = HOTSPOTS.find((h) => h.id === activePin) || HOTSPOTS[1];

  const effectiveClip = viewMode === 'dark' ? 100 : viewMode === 'light' ? 0 : splitPct;

  return (
    <section className="relative pt-32 sm:pt-36 pb-12 overflow-x-clip">
      <div className="max-w-[1160px] mx-auto px-6 flex flex-col items-center text-center">
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[var(--border-hairline)] bg-white/[0.04] light:bg-white/85 font-mono text-[12px] text-[var(--ink-secondary)] mb-6"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 light:text-cyan-600" />
          <span>7FA4 CHAT</span>
          <span className="text-[var(--ink-faint)]">·</span>
          <span>{versionText}</span>
          <span className="text-[var(--ink-faint)]">·</span>
          <span>OPEN SOURCE</span>
        </motion.div>

        <motion.h1
          initial={reducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.52, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
          className="text-[clamp(40px,5.8vw,72px)] font-semibold tracking-[-0.02em] leading-[1.1] mb-6"
        >
          <span className="block text-[var(--ink-primary)]">把推导、代码与群聊，</span>
          <span className="block bg-gradient-to-r from-[#f8fafc] via-[#9db4ff] to-[#5eead4] light:from-[#0f172a] light:via-[#4f6bff] light:to-[#0aa7c2] bg-clip-text text-transparent">
            放进同一张桌面。
          </span>
        </motion.h1>

        <motion.p
          initial={reducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.52, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-[660px] text-[clamp(15.5px,1.5vw,18px)] leading-[1.7] text-[var(--ink-muted)] mb-8"
        >
          不是又一个网页套壳聊天窗。原生 KaTeX 排版、六合一离线演算工具、
          本地 SQLite 持久存储与毫秒级增量同步，为高密度技术交流而重构。
        </motion.p>

        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.52, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-wrap items-center justify-center gap-3 mb-9"
        >
          <div className="inline-flex items-stretch rounded-full shadow-[0_14px_38px_-12px_rgba(142,166,255,0.45)] light:shadow-[0_14px_34px_-14px_rgba(15,23,42,0.4)]">
            <a
              href={mainHref}
              onClick={(e) => {
                if (mainHref === '#downloads') onAnchorClick(e, '#downloads');
              }}
              rel={mainHref === '#downloads' ? undefined : 'nofollow'}
              className="inline-flex items-center gap-2 pl-6 pr-4 py-3.5 rounded-l-full bg-[#f8fafc] text-[#050811] light:bg-[#0b0f1a] light:text-white font-semibold text-[15px] hover:brightness-105 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>{mainLabel}</span>
            </a>
            <button
              ref={triggerRef}
              type="button"
              popoverTarget="hero-dl-popover"
              aria-expanded={popOpen}
              aria-label="选择其他平台安装包"
              className="inline-flex items-center px-3.5 py-3.5 rounded-r-full bg-[#f8fafc] text-[#050811] light:bg-[#0b0f1a] light:text-white border-l border-slate-900/15 light:border-white/20 hover:brightness-95 transition-all cursor-pointer"
            >
              <ChevronDown className="w-4 h-4" />
            </button>

            <div id="hero-dl-popover" ref={popRef} popover="auto" className="dl-popover text-left">
              <div className="px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
                选择安装平台
              </div>
              <div className="grid gap-1">
                {primaries.length > 0 ? (
                  primaries.map((item) => (
                    <a
                      key={item.file}
                      href={item.url}
                      rel="nofollow"
                      className="flex items-center justify-between gap-3 px-2.5 py-2 rounded-xl text-[13.5px] text-[var(--ink-primary)] hover:bg-indigo-500/15 transition-colors"
                    >
                      <span>{item.platformLabel} · {item.kindLabel}</span>
                      <em className="not-italic font-mono text-[11px] text-[var(--ink-muted)]">
                        {item.archLabel} · {formatSize(item.size)}
                      </em>
                    </a>
                  ))
                ) : (
                  <a
                    href="#downloads"
                    onClick={(e) => onAnchorClick(e, '#downloads')}
                    className="px-2.5 py-2 rounded-xl text-[13.5px] text-[var(--ink-primary)] hover:bg-indigo-500/15"
                  >
                    前往平台下载矩阵 →
                  </a>
                )}
              </div>
              <a
                href="#downloads"
                onClick={(e) => {
                  popRef.current?.hidePopover?.();
                  onAnchorClick(e, '#downloads');
                }}
                className="block mt-1.5 pt-2 px-2.5 pb-1 border-t border-[var(--border-hairline)] text-[12.5px] text-cyan-400 light:text-cyan-700 hover:underline"
              >
                查看全部安装包与 SHA-256 校验值 →
              </a>
            </div>
          </div>

          <a
            href="web/"
            className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full border border-[var(--border-strong)] bg-white/[0.045] light:bg-white/85 backdrop-blur-md text-[15px] font-medium text-[var(--ink-primary)] hover:bg-white/10 light:hover:bg-white transition-all"
          >
            <Globe className="w-4 h-4 text-cyan-400 light:text-cyan-600" />
            打开网页版
          </a>

          <a
            href="https://github.com/for-fo-f-zsq/7fa4-chat"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full border border-[var(--border-hairline)] bg-white/[0.03] light:bg-white/75 backdrop-blur-md text-[15px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:border-[var(--border-strong)] transition-all"
          >
            <GithubIcon className="w-4 h-4" />
            GitHub
          </a>
        </motion.div>

        <motion.ul
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.52, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex flex-wrap justify-center gap-x-8 gap-y-2.5 px-6 py-3.5 rounded-full border border-[var(--border-hairline)] bg-white/[0.03] light:bg-white/80 mb-12"
        >
          <li className="flex items-baseline gap-2"><strong className="font-mono text-sm text-[var(--ink-primary)]">{versionText}</strong><span className="text-xs text-[var(--ink-muted)]">最新版本</span></li>
          <li className="flex items-baseline gap-2"><strong className="font-mono text-sm text-[var(--ink-primary)]">{dateText}</strong><span className="text-xs text-[var(--ink-muted)]">发布日期</span></li>
          <li className="flex items-baseline gap-2"><strong className="font-mono text-sm text-[var(--ink-primary)]">22</strong><span className="text-xs text-[var(--ink-muted)]">内置主题</span></li>
          <li className="flex items-baseline gap-2"><strong className="font-mono text-sm text-[var(--ink-primary)]">6</strong><span className="text-xs text-[var(--ink-muted)]">离线工具包</span></li>
          <li className="flex items-baseline gap-2"><strong className="font-mono text-sm text-[var(--ink-primary)]">4 + Web</strong><span className="text-xs text-[var(--ink-muted)]">全端覆盖</span></li>
        </motion.ul>
      </div>

      {/* 真实客户端高精实机展示台（深/浅双模可拖拽对比 + 交互式功能锚点） */}
      <div className="max-w-[1160px] mx-auto px-6 relative" ref={stageRef}>
        <div
          aria-hidden="true"
          className="absolute -inset-x-8 -top-8 h-60 bg-[radial-gradient(ellipse_at_50%_40%,rgba(109,139,255,0.34),rgba(34,211,238,0.12)_48%,transparent_72%)] blur-3xl pointer-events-none -z-10"
        />

        <motion.div
          style={{
            rotateX,
            scale: stageScale,
            transformPerspective: 1400
          }}
          className="rounded-3xl border border-white/15 light:border-slate-900/12 bg-[#0a0d16]/95 light:bg-white shadow-[0_40px_110px_-30px_rgba(0,0,0,0.95)] light:shadow-[0_32px_90px_-30px_rgba(15,23,42,0.22)] overflow-hidden"
        >
          {/* Chrome Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-hairline)] bg-white/[0.025] light:bg-slate-100/80">
            <div className="flex items-center gap-2" aria-hidden="true">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400/75" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400/75" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/75" />
            </div>

            <span className="font-mono text-xs text-[var(--ink-muted)]">7FA4 CHAT // 真实桌面客户端实机对比</span>

            <div className="inline-flex p-0.5 rounded-full border border-[var(--border-hairline)] bg-black/30 light:bg-slate-200/70" role="tablist" aria-label="客户端主题实拍视图">
              {[
                { id: 'dark', label: '深色实拍' },
                { id: 'split', label: '双模滑动对比' },
                { id: 'light', label: '浅色实拍' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === tab.id}
                  onClick={() => setViewMode(tab.id)}
                  className={[
                    'px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer',
                    viewMode === tab.id
                      ? 'bg-white/16 light:bg-white text-[var(--ink-primary)] shadow-sm'
                      : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Real Screenshot Split-Comparison Stage */}
          <div className="relative w-full aspect-[16/10] bg-[#06080f] select-none overflow-hidden">
            {/* Light Screenshot Base */}
            <img
              src="assets/hero-light.webp"
              width={1600}
              height={1000}
              alt="7FA4 Chat 浅色主题桌面客户端实拍界面"
              className="absolute inset-0 w-full h-full object-cover object-top"
              draggable={false}
            />

            {/* Dark Screenshot Clipped Overlay */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 ${100 - effectiveClip}% 0 0)` }}
            >
              <img
                src="assets/hero-dark.webp"
                width={1600}
                height={1000}
                alt="7FA4 Chat 深色主题桌面客户端实拍界面"
                className="w-full h-full object-cover object-top"
                draggable={false}
              />
            </div>

            {/* Split Slider Divider */}
            {viewMode === 'split' && (
              <>
                <div
                  aria-hidden="true"
                  className="absolute inset-y-0 w-0.5 bg-gradient-to-b from-cyan-300 via-white to-indigo-400 shadow-[0_0_16px_rgba(34,211,238,0.8)] pointer-events-none"
                  style={{ left: `${splitPct}%` }}
                >
                  <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-[#0b0e17]/90 border border-cyan-300/70 text-white grid place-items-center shadow-xl">
                    <MoveHorizontal className="w-4 h-4" />
                  </div>
                </div>
                <input
                  type="range"
                  min={8}
                  max={92}
                  value={splitPct}
                  onChange={(e) => setSplitPct(Number(e.target.value))}
                  aria-label="拖动对比深色与浅色客户端主题"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-10"
                />
              </>
            )}

            {/* Interactive Feature Hotspots */}
            {HOTSPOTS.map((pin) => {
              const active = activePin === pin.id;
              return (
                <button
                  key={pin.id}
                  type="button"
                  onClick={() => setActivePin(pin.id)}
                  style={{ left: pin.x, top: pin.y }}
                  aria-label={pin.label}
                  className={[
                    'hidden sm:flex absolute z-20 -translate-y-1/2 items-center gap-1.5 group cursor-pointer',
                    pin.alignLeft ? 'translate-x-0' : '-translate-x-1/2'
                  ].join(' ')}
                >
                  <span
                    className={[
                      'w-3.5 h-3.5 rounded-full border-2 transition-all shrink-0',
                      active
                        ? 'bg-cyan-400 border-white scale-115 shadow-[0_0_0_6px_rgba(34,211,238,0.28)]'
                        : 'bg-[#0b0e17]/85 border-cyan-400/80 hover:scale-110'
                    ].join(' ')}
                  />
                  <span
                    className={[
                      'px-2.5 py-1 rounded-full text-[11px] font-medium backdrop-blur-md border transition-all whitespace-nowrap',
                      active
                        ? 'bg-[#0b0e17]/92 border-cyan-400/60 text-white shadow-lg opacity-100'
                        : 'bg-[#0b0e17]/80 border-white/15 text-slate-200 opacity-0 group-hover:opacity-100 pointer-events-none'
                    ].join(' ')}
                  >
                    {pin.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Bottom Interactive Callout & Live Web Entry Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t border-[var(--border-hairline)] bg-[#0b0e17]/90 light:bg-slate-50 text-left">
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-mono text-[11px] px-2.5 py-0.5 rounded-full border border-cyan-400/35 bg-cyan-400/10 text-cyan-400 light:text-cyan-700 shrink-0">
                {currentPin.label}
              </span>
              <p className="text-xs sm:text-[13px] text-[var(--ink-secondary)] truncate sm:whitespace-normal">
                {currentPin.detail}
              </p>
            </div>
            <a
              href="web/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-400 light:text-cyan-700 hover:underline shrink-0 ml-auto"
            >
              直接打开网页版实操
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
