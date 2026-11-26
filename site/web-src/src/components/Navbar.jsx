import { useEffect, useState } from 'react';
import { motion, useScroll, useSpring, AnimatePresence } from 'motion/react';
import { Download, Globe, Menu, X } from 'lucide-react';

const NAV_ITEMS = [
  { href: '#capabilities', label: '核心能力' },
  { href: '#architecture', label: '跨端架构' },
  { href: '#downloads', label: '下载' },
  { href: '#changelog', label: '更新日志' },
  { href: '#sponsors', label: '赞助' },
  { href: '#faq', label: '常见问题' }
];

export default function Navbar({ version, primaryDownload, platformLabel, onAnchorClick }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 260, damping: 32, restDelta: 0.001 });

  useEffect(() => {
    const onScroll = () => setScrolled((window.scrollY || 0) > 28);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && mobileOpen) setMobileOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth > 900 && mobileOpen) setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [mobileOpen]);

  const dlHref = primaryDownload?.url || '#downloads';
  const dlLabel = platformLabel ? `下载 ${platformLabel} 版` : '下载客户端';

  return (
    <>
      <motion.div
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-gradient-to-r from-indigo-400 via-cyan-400 to-violet-400 pointer-events-none"
        style={{ scaleX }}
      />

      <header className="fixed inset-x-0 top-0 z-40 flex flex-col items-center px-4 pt-3.5 pointer-events-none">
        <motion.div
          layout
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className={[
            'pointer-events-auto flex items-center gap-2 sm:gap-3 rounded-full transition-colors duration-300 max-w-full overflow-hidden',
            scrolled
              ? 'w-full max-w-[920px] px-2.5 sm:px-3.5 py-1.5 sm:py-2 border border-white/15 bg-[#0b0e17]/82 backdrop-blur-2xl shadow-[0_20px_50px_-22px_rgba(0,0,0,0.94)]'
              : 'w-full max-w-[1180px] px-2.5 sm:px-3 py-2 sm:py-2.5 border border-transparent bg-transparent'
          ].join(' ')}
        >
          <a
            href="#top"
            onClick={(e) => onAnchorClick(e, '#top')}
            className="flex items-center gap-2 min-w-0 shrink-0"
            aria-label="7FA4 Chat 首页"
          >
            <img src="assets/icon.png" alt="" width={26} height={26} className="rounded-lg shrink-0" />
            <span className="font-semibold tracking-tight text-[14px] sm:text-[15px] text-[var(--ink-primary)] whitespace-nowrap">
              7FA4<span className="font-normal text-[var(--ink-muted)] ml-1">Chat</span>
            </span>
            {version && (
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono text-cyan-400 border border-cyan-400/30 bg-cyan-400/10">
                v{version}
              </span>
            )}
          </a>

          <nav className="hidden lg:flex items-center gap-0.5 mx-auto" aria-label="页面导航">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => onAnchorClick(e, item.href)}
                className="px-3 py-1.5 rounded-full text-[13.5px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white/8 transition-colors whitespace-nowrap"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto lg:ml-0 shrink-0">
            <a
              href="web/"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium border border-[var(--border-hairline)] bg-white/5 text-[var(--ink-primary)] hover:border-[var(--border-strong)] transition-colors whitespace-nowrap"
            >
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              网页版
            </a>

            <a
              href={dlHref}
              onClick={(e) => {
                if (dlHref === '#downloads') onAnchorClick(e, '#downloads');
              }}
              rel={dlHref === '#downloads' ? undefined : 'nofollow'}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-[12.5px] sm:text-[13px] font-semibold bg-white text-[#050811] hover:opacity-92 transition-all shadow-sm whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{dlLabel}</span>
              <span className="sm:hidden">下载</span>
            </a>

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? '关闭导航菜单' : '打开导航菜单'}
              aria-expanded={mobileOpen}
              className="lg:hidden w-8 h-8 sm:w-9 sm:h-9 rounded-full grid place-items-center border border-[var(--border-hairline)] bg-white/5 text-[var(--ink-primary)] cursor-pointer shrink-0"
            >
              {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </motion.div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.nav
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              aria-label="移动端导航"
              className="pointer-events-auto lg:hidden mt-2 w-full max-w-[920px] rounded-2xl border border-[var(--border-strong)] bg-[#0b0e17]/95 backdrop-blur-2xl p-2 grid gap-1 shadow-2xl"
            >
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={(e) => {
                    setMobileOpen(false);
                    onAnchorClick(e, item.href);
                  }}
                  className="px-3.5 py-2.5 rounded-xl text-[14px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white/8"
                >
                  {item.label}
                </a>
              ))}
              <a href="feedback/" className="px-3.5 py-2.5 rounded-xl text-[14px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white/8">
                意见反馈
              </a>
              <a href="web/" className="px-3.5 py-2.5 rounded-xl text-[14px] font-medium text-cyan-400 hover:bg-cyan-500/10">
                打开网页版 →
              </a>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}
