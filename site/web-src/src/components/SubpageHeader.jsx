import { useEffect, useState } from 'react';
import { motion, useScroll, useSpring, AnimatePresence } from 'motion/react';
import { ArrowLeft, Globe, Menu, MessageSquarePlus, ShieldCheck, X } from 'lucide-react';
import { sitePath } from '../utils/siteBase';

export default function SubpageHeader({
  badgeText,
  activePage = 'feedback' // 'feedback' | 'admin' | 'notfound'
}) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 260, damping: 32, restDelta: 0.001 });

  useEffect(() => {
    const onScroll = () => setScrolled((window.scrollY || 0) > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && mobileOpen) setMobileOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth > 768 && mobileOpen) setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [mobileOpen]);

  const homeHref = sitePath('');
  const webHref = sitePath('web/');
  const feedbackHref = sitePath('feedback/');
  const adminHref = sitePath('admin');

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
              ? 'w-full max-w-[960px] px-2.5 sm:px-3.5 py-1.5 sm:py-2 border border-white/15 bg-[#0b0e17]/84 backdrop-blur-2xl shadow-[0_20px_50px_-22px_rgba(0,0,0,0.94)]'
              : 'w-full max-w-[1140px] px-2.5 sm:px-3 py-2 sm:py-2.5 border border-white/8 bg-[#0b0e17]/48 backdrop-blur-xl'
          ].join(' ')}
        >
          <a
            href={homeHref}
            className="flex items-center gap-2 min-w-0 shrink-0"
            aria-label="返回 7FA4 Chat 官网首页"
          >
            <img src={sitePath('assets/icon.png')} alt="" width={26} height={26} className="rounded-lg shrink-0" />
            <span className="font-semibold tracking-tight text-[14px] sm:text-[15px] text-[var(--ink-primary)] whitespace-nowrap">
              7FA4<span className="font-normal text-[var(--ink-muted)] ml-1">Chat</span>
            </span>
            {badgeText && (
              <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono text-cyan-400 border border-cyan-400/30 bg-cyan-400/10">
                {badgeText}
              </span>
            )}
          </a>

          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
            <nav className="hidden md:flex items-center gap-1.5" aria-label="子页导航">
              {activePage !== 'feedback' && (
                <a
                  href={feedbackHref}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white/8 transition-colors whitespace-nowrap"
                >
                  <MessageSquarePlus className="w-3.5 h-3.5 text-indigo-400" />
                  意见反馈
                </a>
              )}
              {activePage === 'feedback' && (
                <a
                  href={adminHref}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white/8 transition-colors whitespace-nowrap"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                  管理后台
                </a>
              )}
              <a
                href={webHref}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium border border-[var(--border-hairline)] bg-white/5 text-[var(--ink-primary)] hover:border-[var(--border-strong)] transition-colors whitespace-nowrap"
              >
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                网页版
              </a>
            </nav>

            <a
              href={homeHref}
              className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-full text-[12.5px] sm:text-[13px] font-semibold bg-white text-[#050811] hover:opacity-92 transition-all shadow-sm whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              返回官网
            </a>

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? '关闭导航菜单' : '打开导航菜单'}
              aria-expanded={mobileOpen}
              className="md:hidden w-8 h-8 sm:w-9 sm:h-9 rounded-full grid place-items-center border border-[var(--border-hairline)] bg-white/5 text-[var(--ink-primary)] cursor-pointer shrink-0"
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
              className="pointer-events-auto md:hidden mt-2 w-full max-w-[960px] rounded-2xl border border-[var(--border-strong)] bg-[#0b0e17]/95 backdrop-blur-2xl p-2 grid gap-1 shadow-2xl"
            >
              <a
                href={homeHref}
                onClick={() => setMobileOpen(false)}
                className="px-3.5 py-2.5 rounded-xl text-[14px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white/8"
              >
                官网首页
              </a>
              <a
                href={webHref}
                onClick={() => setMobileOpen(false)}
                className="px-3.5 py-2.5 rounded-xl text-[14px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white/8"
              >
                打开网页版
              </a>
              {activePage !== 'feedback' && (
                <a
                  href={feedbackHref}
                  onClick={() => setMobileOpen(false)}
                  className="px-3.5 py-2.5 rounded-xl text-[14px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white/8"
                >
                  意见反馈
                </a>
              )}
              {activePage !== 'admin' && (
                <a
                  href={adminHref}
                  onClick={() => setMobileOpen(false)}
                  className="px-3.5 py-2.5 rounded-xl text-[14px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white/8"
                >
                  管理后台
                </a>
              )}
            </motion.nav>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}
