import { useState } from 'react';
import { motion } from 'motion/react';
import { Check, Copy } from 'lucide-react';
import { handlePointerSpotlight } from '../utils/format';

function CopyChip({ value }) {
  const [copied, setCopied] = useState(false);

  const onCopy = () => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-white/[0.06] light:bg-white text-xs text-[var(--ink-primary)] hover:border-[var(--border-strong)] transition-colors shrink-0 cursor-pointer"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[var(--ink-muted)]" />}
      <span>{copied ? '已复制' : '复制'}</span>
    </button>
  );
}

export default function ArchitectureStrip({ reducedMotion }) {
  const cardMotion = (delay = 0) =>
    reducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 38, scale: 0.96, filter: 'blur(6px)' },
          whileInView: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
          viewport: { once: true, amount: 0.25 },
          transition: { duration: 0.62, delay, ease: [0.22, 1, 0.36, 1] }
        };

  return (
    <section id="architecture" className="py-16 sm:py-24">
      <div className="max-w-[1160px] mx-auto px-6">
        <motion.header {...cardMotion(0)} className="max-w-[640px] mb-10">
          <p className="font-mono text-xs tracking-[0.14em] uppercase text-cyan-400 light:text-cyan-700 mb-3">
            跨端架构与开源生态
          </p>
          <h2 className="text-[clamp(26px,3.6vw,40px)] font-bold tracking-tight text-[var(--ink-primary)] mb-3">
            一套代码底座，全端一致体验
          </h2>
          <p className="text-[15px] text-[var(--ink-muted)] leading-relaxed">
            桌面端使用 Electron + V8 字节码加速冷启动，Android 基于 Capacitor 7 复用渲染层与 IndexedDB，网页版零安装即刻登录。
          </p>
        </motion.header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.article
            {...cardMotion(0.04)}
            onPointerMove={handlePointerSpotlight}
            className="spotlight-card rounded-3xl border border-[var(--border-hairline)] hover:border-[var(--border-strong)] p-7 flex flex-col gap-4 transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold text-[var(--ink-primary)]">多端直连 · 双线路切换</h3>
              <span className="font-mono text-[11px] px-2.5 py-0.5 rounded-full border border-cyan-400/35 bg-cyan-400/10 text-cyan-400 light:text-cyan-700">
                MIT · 零广告
              </span>
            </div>
            <p className="text-[14.5px] text-[var(--ink-muted)] leading-relaxed">
              无需单独注册，直接使用 7FA4 账号密码登录。默认连接校外 <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-white/8 light:bg-slate-100">jx.7fa4.cn</code>，校内环境可切至 <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-white/8 light:bg-slate-100">in.7fa4.cn</code>。
            </p>
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-[var(--border-hairline)] bg-black/35 light:bg-slate-100">
              <code className="font-mono text-xs text-[var(--ink-secondary)] truncate">https://jx.7fa4.cn:8888/7fa4-chat/web/</code>
              <CopyChip value="https://jx.7fa4.cn:8888/7fa4-chat/web/" />
            </div>
            <div className="flex flex-wrap gap-2 mt-auto pt-1">
              {['Windows x64 / arm64', 'macOS Apple Silicon', 'Linux AppImage / deb', 'Android APK'].map((t) => (
                <span key={t} className="font-mono text-[11px] px-2.5 py-1 rounded-full border border-[var(--border-hairline)] text-[var(--ink-secondary)]">
                  {t}
                </span>
              ))}
            </div>
          </motion.article>

          <motion.article
            {...cardMotion(0.1)}
            onPointerMove={handlePointerSpotlight}
            className="spotlight-card rounded-3xl border border-[var(--border-hairline)] hover:border-[var(--border-strong)] p-7 flex flex-col gap-4 transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold text-[var(--ink-primary)]">源码可审计 · 学术交流公约</h3>
              <span className="font-mono text-[11px] px-2.5 py-0.5 rounded-full border border-[var(--border-hairline)] text-[var(--ink-muted)]">
                可复现构建
              </span>
            </div>
            <p className="text-[14.5px] text-[var(--ink-muted)] leading-relaxed">
              全部客户端与工具包源码公开于 GitHub 与 GitLab。软件仅用于校内课程学习与学术交流，请遵守考场纪律，勿在考试期间使用或发布无关内容。
            </p>
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-[var(--border-hairline)] bg-black/35 light:bg-slate-100">
              <code className="font-mono text-xs text-[var(--ink-secondary)] truncate">git clone https://github.com/for-fo-f-zsq/7fa4-chat.git</code>
              <CopyChip value="git clone https://github.com/for-fo-f-zsq/7fa4-chat.git" />
            </div>
            <div className="flex flex-wrap gap-5 mt-auto pt-1 text-[13.5px] text-cyan-400 light:text-cyan-700">
              <a href="feedback/" className="hover:underline">提交意见反馈 →</a>
              <a href="https://jx.7fa4.cn:9080/student-archive/7fa4-chat" target="_blank" rel="noopener" className="hover:underline">
                GitLab 镜像仓库 →
              </a>
            </div>
          </motion.article>
        </div>
      </div>
    </section>
  );
}
