import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { GitBranch, Globe, MessageSquarePlus } from 'lucide-react';
import { formatDate } from '../utils/format';

function GithubIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
    </svg>
  );
}

export default function HorizonFooter({ downloads, onAnchorClick, reducedMotion }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let stars = [];
    let raf = 0;

    const draw = (t) => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      for (const s of stars) {
        const alpha = 0.2 + 0.5 * (0.5 + 0.5 * Math.sin(s.phase + t * s.speed));
        ctx.fillStyle = `rgba(165, 188, 255, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = Array.from({ length: 72 }, () => ({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        r: Math.random() * 1.4 + 0.4,
        phase: Math.random() * Math.PI * 2,
        speed: 0.008 + Math.random() * 0.015
      }));
      draw(0);
    };

    const loop = (ts) => {
      draw(ts * 0.06);
      if (!reducedMotion) raf = requestAnimationFrame(loop);
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });
    if (!reducedMotion) raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', resize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reducedMotion]);

  const versionText = downloads?.version
    ? `v${downloads.version} · ${formatDate(downloads.releaseDate || downloads.generatedAt)}`
    : `v${__SITE_APP_VERSION__}`;

  return (
    <>
      <section className="relative overflow-hidden py-24 sm:py-36 border-t border-[var(--border-hairline)] text-center" aria-labelledby="horizon-heading">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />
        <div
          aria-hidden="true"
          className="absolute -inset-x-[10%] -bottom-[35%] h-[85%] pointer-events-none bg-[radial-gradient(ellipse_65%_70%_at_50%_85%,rgba(56,110,235,0.28),rgba(34,211,238,0.08)_45%,transparent_72%)]"
        />

        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 max-w-[680px] mx-auto px-6"
        >
          <h2 id="horizon-heading" className="text-[clamp(30px,4.4vw,48px)] font-bold tracking-tight text-[var(--ink-primary)] mb-4">
            让讨论发生，其余交给 7FA4 Chat。
          </h2>
          <p className="text-[15.5px] text-[var(--ink-muted)] leading-relaxed mb-8">
            MIT 开源许可、零商业广告、全端同步进化。现在打开网页版即刻体验，或下载桌面端解锁完整本地存储与离线工具箱。
          </p>

          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="web/"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-[#f8fafc] text-[#050811] light:bg-[#0b0f1a] light:text-white font-semibold text-sm hover:brightness-105 transition-all"
            >
              <Globe className="w-4 h-4" />
              立即打开网页版
            </a>
            <a
              href="https://github.com/for-fo-f-zsq/7fa4-chat"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full border border-[var(--border-strong)] bg-white/[0.045] light:bg-white/85 backdrop-blur-md text-sm font-medium text-[var(--ink-primary)] hover:bg-white/10 transition-all"
            >
              <GithubIcon className="w-4 h-4" />
              查看 GitHub
            </a>
            <a
              href="feedback/"
              className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full border border-[var(--border-strong)] bg-white/[0.045] light:bg-white/85 backdrop-blur-md text-sm font-medium text-[var(--ink-primary)] hover:bg-white/10 transition-all"
            >
              <MessageSquarePlus className="w-4 h-4" />
              意见反馈
            </a>
            <a
              href="https://jx.7fa4.cn:9080/student-archive/7fa4-chat"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full border border-[var(--border-strong)] bg-white/[0.045] light:bg-white/85 backdrop-blur-md text-sm font-medium text-[var(--ink-primary)] hover:bg-white/10 transition-all"
            >
              <GitBranch className="w-4 h-4" />
              GitLab 镜像
            </a>
          </div>
        </motion.div>
      </section>

      <footer className="border-t border-[var(--border-hairline)] py-7 text-[13px] text-[var(--ink-muted)]">
        <div className="max-w-[1160px] mx-auto px-6 flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex items-center gap-2.5 text-[var(--ink-primary)] font-medium">
            <img src="assets/icon.png" alt="" width={22} height={22} className="rounded-md" />
            <span>7FA4 Chat · 由 for_fo_f 维护</span>
          </div>
          <p className="text-xs text-[var(--ink-faint)]">
            开源 · MIT · 本站仅用于客户端发布与说明，请遵守学校规范与学术诚信
          </p>
          <div className="inline-flex items-center gap-2.5">
            <span className="font-mono text-xs">{versionText}</span>
            <span aria-hidden="true">·</span>
            <a href="feedback/" className="hover:text-[var(--ink-primary)]">反馈</a>
            <span aria-hidden="true">·</span>
            <a href="#downloads" onClick={(e) => onAnchorClick(e, '#downloads')} className="hover:text-[var(--ink-primary)]">
              下载
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
