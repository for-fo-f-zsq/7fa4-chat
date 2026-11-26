import { sitePath } from '../utils/siteBase';

export default function SubpageFooter({ label = '官网子系统' }) {
  return (
    <footer className="relative z-10 border-t border-[var(--border-hairline)] bg-[var(--bg-obsidian)]/70 backdrop-blur-xl py-8">
      <div className="max-w-[1140px] mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[13px] text-[var(--ink-muted)]">
        <div className="flex items-center gap-2.5">
          <img src={sitePath('assets/icon.png')} alt="" width={18} height={18} className="rounded" />
          <span className="font-semibold text-[var(--ink-primary)]">7FA4 Chat</span>
          <span className="text-[var(--ink-faint)]">·</span>
          <span>{label}</span>
          <span className="hidden sm:inline font-mono text-[11px] text-[var(--ink-faint)]">v{__SITE_APP_VERSION__}</span>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-5" aria-label="页脚链接">
          <a href={sitePath('')} className="hover:text-[var(--ink-primary)] transition-colors">官网首页</a>
          <a href={sitePath('web/')} className="hover:text-[var(--ink-primary)] transition-colors">网页版</a>
          <a href={sitePath('feedback/')} className="hover:text-[var(--ink-primary)] transition-colors">意见反馈</a>
          <a href={sitePath('admin')} className="hover:text-[var(--ink-primary)] transition-colors">管理后台</a>
          <a
            href="https://github.com/for-fo-f-zsq/7fa4-chat"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--ink-primary)] transition-colors"
          >
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
