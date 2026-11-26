import { useState } from 'react';
import { motion } from 'motion/react';
import { Check, Copy, Download, Laptop, Monitor, Smartphone, Terminal } from 'lucide-react';
import { formatSize, handlePointerSpotlight } from '../utils/format';

const PLATFORMS = [
  { id: 'windows', name: 'Windows', sub: 'Windows 10 / 11 · 安装版与便携版', Icon: Monitor },
  { id: 'macos', name: 'macOS', sub: 'macOS 11+ · Apple Silicon & Intel', Icon: Laptop },
  { id: 'linux', name: 'Linux', sub: 'AppImage 与 deb · x86_64 & arm64', Icon: Terminal },
  { id: 'android', name: 'Android', sub: 'Android 8.0 及以上 · Capacitor 7 APK', Icon: Smartphone }
];

export default function DownloadSection({ downloads, loading, error, currentPlatform, primaryDownload, platformLabel, reducedMotion }) {
  const [copiedSha, setCopiedSha] = useState(false);
  const [filterPf, setFilterPf] = useState('all');

  const items = downloads?.items || [];
  const versionText = downloads?.version ? `v${downloads.version}` : '—';
  const visiblePlatforms = filterPf === 'all' ? PLATFORMS : PLATFORMS.filter((p) => p.id === filterPf);

  const copySha = () => {
    if (!primaryDownload?.sha256) return;
    navigator.clipboard?.writeText(primaryDownload.sha256).then(() => {
      setCopiedSha(true);
      setTimeout(() => setCopiedSha(false), 1800);
    }).catch(() => {});
  };

  const reveal = (delay = 0) =>
    reducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 38, scale: 0.96, filter: 'blur(6px)' },
          whileInView: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
          viewport: { once: true, amount: 0.25 },
          transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }
        };

  return (
    <section id="downloads" className="py-20 sm:py-28 bg-gradient-to-b from-transparent via-white/[0.018] light:via-slate-200/35 to-transparent">
      <div className="max-w-[1160px] mx-auto px-6">
        <motion.header {...reveal(0)} className="text-center max-w-[660px] mx-auto mb-10">
          <p className="font-mono text-xs tracking-[0.14em] uppercase text-cyan-400 light:text-cyan-700 mb-3">
            DISTRIBUTION
          </p>
          <h2 className="text-[clamp(28px,4vw,44px)] font-bold tracking-tight text-[var(--ink-primary)] mb-3.5">
            全端交付，即装即用
          </h2>
          <p className="text-[15.5px] text-[var(--ink-muted)] leading-relaxed">
            当前发行版本{' '}
            <span className="inline-block font-mono text-xs px-2.5 py-0.5 rounded-full border border-[var(--border-hairline)] bg-white/[0.05] text-[var(--ink-primary)]">
              {versionText}
            </span>
            ，支持断点续传与 SHA-256 完整性校验。
          </p>
        </motion.header>

        <div className="flex flex-wrap justify-center gap-1.5 mb-8" role="tablist" aria-label="按操作系统筛选">
          {[
            { id: 'all', label: '全部平台' },
            { id: 'windows', label: 'Windows' },
            { id: 'macos', label: 'macOS' },
            { id: 'linux', label: 'Linux' },
            { id: 'android', label: 'Android' }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filterPf === tab.id}
              onClick={() => setFilterPf(tab.id)}
              className={[
                'px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer',
                filterPf === tab.id
                  ? 'border-cyan-400/50 bg-cyan-400/15 text-[var(--ink-primary)]'
                  : 'border-[var(--border-hairline)] bg-white/[0.03] light:bg-white text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {primaryDownload && (
          <motion.div
            {...reveal(0.04)}
            className="mb-6 rounded-3xl border border-cyan-400/35 bg-gradient-to-r from-cyan-500/12 via-indigo-500/8 to-[#0b0e17]/90 light:to-white p-6 sm:p-7 flex flex-wrap items-center justify-between gap-5"
          >
            <div>
              <span className="inline-block font-mono text-[11px] px-2.5 py-0.5 rounded-full border border-cyan-400/35 bg-cyan-400/10 text-cyan-400 light:text-cyan-700 mb-2">
                已识别当前系统：{platformLabel}
              </span>
              <h3 className="text-xl font-semibold text-[var(--ink-primary)] mb-1">{primaryDownload.file}</h3>
              <p className="text-sm text-[var(--ink-muted)]">
                推荐 {primaryDownload.kindLabel}（{primaryDownload.archLabel}）· {formatSize(primaryDownload.size)} · {versionText}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <a
                href={primaryDownload.url}
                rel="nofollow"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[#f8fafc] text-[#050811] light:bg-[#0b0f1a] light:text-white font-semibold text-sm hover:brightness-105 transition-all"
              >
                <Download className="w-4 h-4" />
                下载 {platformLabel} 版
              </a>
              {primaryDownload.sha256 && (
                <button
                  type="button"
                  onClick={copySha}
                  className="inline-flex items-center gap-1.5 px-4 py-3 rounded-full border border-[var(--border-strong)] bg-white/[0.05] light:bg-white text-sm text-[var(--ink-primary)] hover:bg-white/10 transition-colors cursor-pointer"
                >
                  {copiedSha ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedSha ? 'SHA-256 已复制' : '复制 SHA-256'}</span>
                </button>
              )}
            </div>
          </motion.div>
        )}

        <div className={visiblePlatforms.length === 1 ? 'grid grid-cols-1 max-w-[640px] mx-auto gap-4' : 'grid grid-cols-1 md:grid-cols-2 gap-4'} aria-live="polite">
          {visiblePlatforms.map((pf, idx) => {
            const Icon = pf.Icon;
            const group = items.filter((i) => i.platform === pf.id);
            const isCurrent = currentPlatform === pf.id;
            return (
              <motion.article
                key={pf.id}
                {...reveal(0.04 * idx)}
                onPointerMove={handlePointerSpotlight}
                className={[
                  'spotlight-card rounded-3xl border p-6 flex flex-col transition-all',
                  isCurrent ? 'border-cyan-400/45' : 'border-[var(--border-hairline)] hover:border-[var(--border-strong)]'
                ].join(' ')}
              >
                <div className="flex items-center gap-3.5 mb-4">
                  <span className="w-11 h-11 rounded-2xl border border-[var(--border-hairline)] bg-white/[0.04] light:bg-slate-100 grid place-items-center text-[var(--ink-primary)]">
                    <Icon className="w-5 h-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[17px] font-semibold text-[var(--ink-primary)]">{pf.name}</h3>
                    <p className="text-xs text-[var(--ink-muted)]">{pf.sub}</p>
                  </div>
                  {isCurrent && (
                    <span className="ml-auto font-mono text-[10.5px] px-2.5 py-0.5 rounded-full border border-cyan-400/35 bg-cyan-400/10 text-cyan-400 light:text-cyan-700 whitespace-nowrap shrink-0">
                      当前系统
                    </span>
                  )}
                </div>

                <div className="grid gap-2">
                  {loading && <span className="text-xs text-[var(--ink-faint)]">正在获取版本信息…</span>}
                  {!loading && error && <span className="text-xs text-[var(--ink-faint)]">暂时无法获取版本信息，请稍后刷新。</span>}
                  {!loading && !error && group.length === 0 && (
                    <span className="text-xs text-[var(--ink-faint)]">该平台暂无可用安装包。</span>
                  )}
                  {!loading && !error && group.map((item) => (
                    <a
                      key={item.file}
                      href={item.url}
                      rel="nofollow"
                      title={`下载 ${item.file}`}
                      className="group flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-[var(--border-hairline)] bg-black/25 light:bg-slate-50 hover:border-indigo-400/45 hover:bg-indigo-500/10 transition-all"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-medium text-[var(--ink-primary)]">
                          <span>{item.kindLabel}</span>
                          <span className="font-mono text-[10.5px] font-normal px-1.5 py-0.2 rounded border border-[var(--border-hairline)] text-[var(--ink-muted)]">
                            {item.archLabel}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--ink-faint)] font-mono tabular-nums">
                          {formatSize(item.size)} · {downloads?.fallback ? 'GitHub Release' : item.file.split('-').pop()}
                        </div>
                      </div>
                      <Download className="w-4 h-4 text-[var(--ink-muted)] group-hover:text-cyan-400 transition-colors shrink-0" />
                    </a>
                  ))}
                </div>
              </motion.article>
            );
          })}
        </div>

        {downloads && (
          <p className="mt-4 px-4 py-3 rounded-xl border border-[var(--border-hairline)] bg-white/[0.025] light:bg-white/75 text-xs text-[var(--ink-muted)]">
            {downloads.fallback
              ? `当前处于本地离线预览模式，已为你加载基于 v${downloads.version} 的 GitHub Releases 分发清单。`
              : `共 ${items.length} 个安装包 · 版本 v${downloads.version} · 支持断点续传与 SHA-256 校验。`}
          </p>
        )}
      </div>
    </section>
  );
}
