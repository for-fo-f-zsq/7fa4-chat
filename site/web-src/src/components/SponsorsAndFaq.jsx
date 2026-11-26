import { motion } from 'motion/react';
import { amountValue } from '../utils/format';

export default function SponsorsAndFaq({ sponsors, sponsorsLoading, downloads, reducedMotion }) {
  const list = (sponsors?.list || [])
    .slice()
    .sort((a, b) => amountValue(b.amount) - amountValue(a.amount));
  const maxAmt = list.length ? amountValue(list[0].amount) : 0;

  const hashItems = (downloads?.items || []).filter((i) => i.sha256);
  const versionText = downloads?.version ? ` 以下为 v${downloads.version} 的校验信息。` : '';

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
    <>
      {/* Sponsors */}
      <section id="sponsors" className="py-20 sm:py-28 bg-gradient-to-b from-transparent via-white/[0.018] light:via-slate-200/35 to-transparent">
        <div className="max-w-[1160px] mx-auto px-6">
          <motion.header {...reveal(0)} className="text-center max-w-[660px] mx-auto mb-12">
            <p className="font-mono text-xs tracking-[0.14em] uppercase text-cyan-400 light:text-cyan-700 mb-3">
              COMMUNITY &amp; SPONSORS
            </p>
            <h2 className="text-[clamp(28px,4vw,42px)] font-bold tracking-tight text-[var(--ink-primary)] mb-3">
              由社区共同托举的开源项目
            </h2>
            <p className="text-[15px] text-[var(--ink-muted)] leading-relaxed">
              全端免费且无任何商业推广，打包构建与持续分发由以下赞助成员自愿支持。
            </p>
          </motion.header>

          <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_0.65fr] gap-5 items-start">
            <motion.div {...reveal(0.04)} className="grid gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5" aria-live="polite">
                {sponsorsLoading && <p className="text-sm text-[var(--ink-faint)]">正在获取赞助名单…</p>}
                {!sponsorsLoading && list.length === 0 && <p className="text-sm text-[var(--ink-faint)]">暂无赞助记录。</p>}
                {!sponsorsLoading && list.map((s, idx) => {
                  const isTop = maxAmt > 0 && amountValue(s.amount) >= maxAmt * 0.9;
                  return (
                    <div
                      key={`${s.name}-${idx}`}
                      className={[
                        'flex items-center justify-between gap-2 px-4 py-3 rounded-2xl border',
                        isTop
                          ? 'border-cyan-400/40 bg-gradient-to-br from-cyan-500/12 to-[#0b0e17]/90 light:to-white'
                          : 'border-[var(--border-hairline)] bg-[#0b0e17]/70 light:bg-white/90'
                      ].join(' ')}
                    >
                      <span className="text-sm font-medium text-[var(--ink-primary)] truncate">{s.name || '匿名'}</span>
                      <span className="font-mono text-xs text-cyan-400 light:text-cyan-700 shrink-0">{s.amount}</span>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-[var(--border-hairline)] bg-[#0b0e17]/65 light:bg-white/85 p-5 sm:p-6">
                <h3 className="text-[15px] font-semibold text-[var(--ink-primary)] mb-3">赞助经费用途</h3>
                <ul className="grid gap-2.5 text-[13.5px]">
                  <li className="flex flex-wrap justify-between gap-2 text-[var(--ink-muted)]">
                    <span className="text-[var(--ink-primary)] font-medium">多端构建与打包</span>
                    <em>Windows / macOS / Linux / Android 自动化构建</em>
                  </li>
                  <li className="flex flex-wrap justify-between gap-2 text-[var(--ink-muted)]">
                    <span className="text-[var(--ink-primary)] font-medium">存储与分发带宽</span>
                    <em>全平台安装包、静态工具包与增量更新托管</em>
                  </li>
                  <li className="flex flex-wrap justify-between gap-2 text-[var(--ink-muted)]">
                    <span className="text-[var(--ink-primary)] font-medium">维护与文档响应</span>
                    <em>新特性适配、问题追踪与服务稳定运行</em>
                  </li>
                </ul>
              </div>
            </motion.div>

            <motion.aside
              {...reveal(0.08)}
              className="rounded-3xl border border-[var(--border-hairline)] bg-[#0b0e17]/80 light:bg-white/95 p-6 text-center"
            >
              <div className="w-48 mx-auto mb-4 p-2.5 rounded-2xl bg-white shadow-md">
                <img src="api/donate-qr" alt="赞赏码" width={200} height={200} loading="lazy" className="w-full h-auto rounded-lg" />
              </div>
              <h3 className="text-base font-semibold text-[var(--ink-primary)] mb-1">请作者喝一杯</h3>
              <p className="text-[13px] text-[var(--ink-muted)]">完全自愿，金额随意，不解锁任何特权。</p>
            </motion.aside>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 sm:py-24" aria-labelledby="faq-heading">
        <div className="max-w-[840px] mx-auto px-6">
          <motion.header {...reveal(0)} className="text-center max-w-[640px] mx-auto mb-12">
            <p className="font-mono text-xs tracking-[0.14em] uppercase text-cyan-400 light:text-cyan-700 mb-3">
              VERIFICATION &amp; FAQ
            </p>
            <h2 id="faq-heading" className="text-[clamp(28px,4vw,42px)] font-bold tracking-tight text-[var(--ink-primary)] mb-3">
              校验命令与常见疑问
            </h2>
            <p className="text-[15px] text-[var(--ink-muted)]">安装校验、双线路说明与本地数据备份方式。</p>
          </motion.header>

          <div className="grid gap-2.5">
            <details className="accordion-item faq-item rounded-2xl border border-[var(--border-hairline)] hover:border-[var(--border-strong)] open:border-indigo-400/40 bg-[#0b0e17]/70 light:bg-white/90 px-5">
              <summary className="flex items-center gap-3 py-4 text-[14.5px] font-medium text-[var(--ink-primary)]">
                如何校验下载文件的完整性？
              </summary>
              <div className="pb-4 pt-3 border-t border-[var(--border-hairline)] text-[13.5px] text-[var(--ink-secondary)] grid gap-2.5">
                <p>每个安装包都有唯一的 SHA-256 摘要。下载后可在本地终端计算并比对下方列表：</p>
                <ul className="grid gap-1.5 pl-4 list-disc">
                  <li>Windows（PowerShell / CMD）：<code className="font-mono text-xs px-1.5 py-0.5 rounded bg-white/8 light:bg-slate-200/70">certutil -hashfile 7FA4-Chat-4.0.3-x64.exe SHA256</code></li>
                  <li>macOS / Linux：<code className="font-mono text-xs px-1.5 py-0.5 rounded bg-white/8 light:bg-slate-200/70">shasum -a 256</code> 或 <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-white/8 light:bg-slate-200/70">sha256sum</code> 后接文件名</li>
                </ul>
                <p className="text-[var(--ink-muted)]">仅字母大小写不同属正常现象；若有任意字符不一致，请删除并重新下载。{versionText}</p>
                <div className="grid gap-1.5 max-h-60 overflow-auto">
                  {hashItems.length > 0 ? (
                    hashItems.map((i) => (
                      <div key={i.file} className="px-3 py-2 rounded-lg bg-white/[0.035] light:bg-slate-100">
                        <b className="block text-xs text-[var(--ink-primary)] break-all">{i.file}</b>
                        <code className="font-mono text-[11px] text-[var(--ink-muted)] break-all">{i.sha256}</code>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-[var(--ink-faint)]">GitHub Releases 安装包请在发布页查看对应 SHA-256 摘要。</p>
                  )}
                </div>
              </div>
            </details>

            <details className="accordion-item faq-item rounded-2xl border border-[var(--border-hairline)] hover:border-[var(--border-strong)] open:border-indigo-400/40 bg-[#0b0e17]/70 light:bg-white/90 px-5">
              <summary className="flex items-center gap-3 py-4 text-[14.5px] font-medium text-[var(--ink-primary)]">
                支持哪些操作系统与网页端？
              </summary>
              <div className="pb-4 pt-3 border-t border-[var(--border-hairline)] text-[13.5px] text-[var(--ink-secondary)]">
                <ul className="grid gap-1.5 pl-4 list-disc">
                  <li>Windows 10 / 11（x64、arm64 安装版与便携 zip）</li>
                  <li>macOS 11+（Apple Silicon 与 Intel dmg）</li>
                  <li>Linux（x86_64、arm64 的 AppImage 与 deb 包）</li>
                  <li>Android 8.0+（arm64 APK）与纯浏览器网页端</li>
                </ul>
              </div>
            </details>

            <details className="accordion-item faq-item rounded-2xl border border-[var(--border-hairline)] hover:border-[var(--border-strong)] open:border-indigo-400/40 bg-[#0b0e17]/70 light:bg-white/90 px-5">
              <summary className="flex items-center gap-3 py-4 text-[14.5px] font-medium text-[var(--ink-primary)]">
                需要重新注册账号吗？校内外线路如何选择？
              </summary>
              <div className="pb-4 pt-3 border-t border-[var(--border-hairline)] text-[13.5px] text-[var(--ink-secondary)]">
                <p>
                  不需要。直接使用日常登录 7FA4 OJ 的账号密码即可，会话与群组完全同步。默认线路为 <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-white/8 light:bg-slate-200/70">jx.7fa4.cn</code>，如在校内网环境可将登录页「API 网址」切换为 <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-white/8 light:bg-slate-200/70">in.7fa4.cn</code>。
                </p>
              </div>
            </details>

            <details className="accordion-item faq-item rounded-2xl border border-[var(--border-hairline)] hover:border-[var(--border-strong)] open:border-indigo-400/40 bg-[#0b0e17]/70 light:bg-white/90 px-5">
              <summary className="flex items-center gap-3 py-4 text-[14.5px] font-medium text-[var(--ink-primary)]">
                聊天记录存在哪里？换设备会丢失吗？
              </summary>
              <div className="pb-4 pt-3 border-t border-[var(--border-hairline)] text-[13.5px] text-[var(--ink-secondary)]">
                <p>
                  桌面端与安卓端均保存在本地数据目录（SQLite WAL / IndexedDB），不会转存第三方服务器。可在「设置 → 数据与存储」中一键导出备份文件并在新设备上恢复。
                </p>
              </div>
            </details>

            <details className="accordion-item faq-item rounded-2xl border border-[var(--border-hairline)] hover:border-[var(--border-strong)] open:border-indigo-400/40 bg-[#0b0e17]/70 light:bg-white/90 px-5">
              <summary className="flex items-center gap-3 py-4 text-[14.5px] font-medium text-[var(--ink-primary)]">
                遇到 Bug 或想提功能建议怎么反馈？
              </summary>
              <div className="pb-4 pt-3 border-t border-[var(--border-hairline)] text-[13.5px] text-[var(--ink-secondary)]">
                <p>
                  可通过本站 <a href="feedback/" className="text-cyan-400 light:text-cyan-700 hover:underline">在线意见反馈</a>（支持直接 Ctrl+V 粘贴截图，免登录提交），或前往{' '}
                  <a href="https://github.com/for-fo-f-zsq/7fa4-chat/issues" target="_blank" rel="noopener" className="text-cyan-400 light:text-cyan-700 hover:underline">GitHub Issues</a> /{' '}
                  <a href="https://jx.7fa4.cn:9080/student-archive/7fa4-chat/-/issues" target="_blank" rel="noopener" className="text-cyan-400 light:text-cyan-700 hover:underline">GitLab 议题</a> 提交。
                </p>
              </div>
            </details>
          </div>
        </div>
      </section>
    </>
  );
}
