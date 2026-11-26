import { useEffect } from 'react';
import { MotionConfig, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, Globe, MessageSquarePlus, Terminal } from 'lucide-react';
import TechBackdrop from './components/TechBackdrop';
import SubpageHeader from './components/SubpageHeader';
import SubpageFooter from './components/SubpageFooter';
import { handlePointerSpotlight } from './utils/format';
import { sitePath } from './utils/siteBase';

export default function NotFoundApp() {
  const prefersReduced = useReducedMotion() ?? false;
  const currentPath = typeof window !== 'undefined' ? window.location.pathname || '/' : '/';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <TechBackdrop reducedMotion={prefersReduced} />
      <SubpageHeader badgeText="HTTP 404" activePage="notfound" />

      <main className="relative z-10 min-h-[calc(100vh-88px)] flex items-center justify-center px-4 sm:px-6 pt-24 pb-16">
        <motion.section
          initial={prefersReduced ? false : { opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          onPointerMove={handlePointerSpotlight}
          className="spotlight-card w-full max-w-[540px] rounded-3xl border border-[var(--border-strong)] p-8 sm:p-10 text-center shadow-[0_32px_80px_-34px_rgba(0,0,0,0.92)] space-y-5"
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-cyan-400/35 bg-cyan-400/10 font-mono text-[12px] text-cyan-300">
            <Terminal className="w-3.5 h-3.5" />
            <span>HTTP 404 // NOT_FOUND</span>
          </div>

          <h1 className="text-[clamp(28px,4.5vw,38px)] font-bold tracking-tight text-[var(--ink-primary)]">
            页面未找到
          </h1>

          <p className="text-[14.5px] leading-relaxed text-[var(--ink-muted)]">
            你访问的链接可能已调整、拼写有误，或对应版本资源尚未发布。
          </p>

          {currentPath !== '/' && (
            <div className="px-4 py-2.5 rounded-xl border border-[var(--border-hairline)] bg-[#060911]/85 font-mono text-[12.5px] text-[var(--ink-secondary)] break-all">
              {currentPath}
            </div>
          )}

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <a
              href={sitePath('')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-[#050811] text-[13.5px] font-semibold hover:opacity-92 transition-all shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>返回官网首页</span>
            </a>

            <a
              href={sitePath('web/')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-[var(--border-strong)] bg-white/[0.04] text-[13.5px] font-medium text-[var(--ink-primary)] hover:bg-white/10 transition-colors"
            >
              <Globe className="w-4 h-4 text-cyan-400" />
              <span>打开网页版</span>
            </a>

            <a
              href={sitePath('feedback/')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-[var(--border-hairline)] bg-white/[0.03] text-[13.5px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:border-[var(--border-strong)] transition-colors"
            >
              <MessageSquarePlus className="w-4 h-4 text-indigo-400" />
              <span>反馈问题</span>
            </a>
          </div>
        </motion.section>
      </main>

      <SubpageFooter label="404 Not Found" />
    </MotionConfig>
  );
}
