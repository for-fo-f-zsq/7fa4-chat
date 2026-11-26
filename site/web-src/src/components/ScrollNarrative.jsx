import { useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValueEvent, useScroll } from 'motion/react';
import { Activity, Cpu, Database, Layers, ShieldCheck, Sigma } from 'lucide-react';
import KatexBlock from './KatexBlock';

const CHAPTERS = [
  {
    id: 'typeset',
    num: '01',
    kicker: '排版即正义',
    title: '公式与代码，原生同框呈现',
    body: '告别截屏发图与格式错乱。行内 $LaTeX$、多行矩阵方程与语法高亮代码块直接与消息流混排，支持渲染后一键复制源码或拖拽引用。',
    metrics: [
      { label: '公式引擎', value: 'KaTeX 0.18' },
      { label: '表情体系', value: '312 APNG' }
    ],
    Icon: Sigma
  },
  {
    id: 'toolkit',
    num: '02',
    kicker: '工具不离手',
    title: '把常用演算工具装进侧边栏',
    body: '图论编辑器、Markdown 制图、图片打码标注、BigInt 科学计算器、四宫格计时器与 GeoGebra 全部拆分为独立静态包，逐文件 SHA-256 校验，断网也能独立运行。',
    metrics: [
      { label: '离线工具包', value: '6 款按需加载' },
      { label: '图片回传', value: '零中转直发' }
    ],
    Icon: Cpu
  },
  {
    id: 'sovereignty',
    num: '03',
    kicker: '本地即主权',
    title: 'SQLite WAL 落盘与 72h 连接遥测',
    body: '聊天记录与加密凭据保存在本机目录，支持全量备份导出与跨设备恢复。后台持久化记录最近 72 小时连接可用率与延迟曲线，异常波动一目了然。',
    metrics: [
      { label: '持久层', value: 'SQLite WAL' },
      { label: '离线回看', value: '全历史秒开' }
    ],
    Icon: Database
  }
];

export default function ScrollNarrative({ reducedMotion }) {
  const containerRef = useRef(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start 25%', 'end 75%']
  });

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const next = v < 0.34 ? 0 : v < 0.68 ? 1 : 2;
    if (next !== activeIdx) setActiveIdx(next);
  });

  const active = CHAPTERS[activeIdx];

  return (
    <section ref={containerRef} className="relative py-20 sm:py-28">
      <div className="max-w-[1160px] mx-auto px-6">
        <div className="max-w-[660px] mb-12 sm:mb-16">
          <p className="font-mono text-xs tracking-[0.16em] uppercase text-cyan-400 light:text-cyan-700 mb-3">
            WORKFLOW ARCHITECTURE
          </p>
          <h2 className="text-[clamp(28px,4vw,44px)] font-semibold tracking-[-0.018em] leading-[1.14] text-[var(--ink-primary)] mb-4">
            从一道推导开始，
            <span className="block text-[var(--ink-muted)] font-medium">重构高密度协作的每一拍。</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-8 lg:gap-12 items-start">
          {/* Left scrolling chapters */}
          <div className="grid grid-cols-1 gap-5 sm:gap-6 min-w-0 w-full">
            {CHAPTERS.map((ch, idx) => {
              const Icon = ch.Icon;
              const isActive = activeIdx === idx;
              return (
                <motion.button
                  key={ch.id}
                  type="button"
                  onClick={() => setActiveIdx(idx)}
                  initial={reducedMotion ? false : { opacity: 0, y: 34, filter: 'blur(6px)' }}
                  whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{ duration: 0.58, delay: idx * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  className={[
                    'w-full min-w-0 text-left rounded-3xl border p-6 sm:p-7 transition-all duration-300 cursor-pointer',
                    isActive
                      ? 'border-indigo-400/45 bg-gradient-to-br from-indigo-500/12 via-[#0b0e17]/90 to-[#06080f]/95 light:from-indigo-50 light:to-white shadow-[0_24px_60px_-30px_rgba(99,102,241,0.45)]'
                      : 'border-[var(--border-hairline)] bg-white/[0.02] light:bg-white/60 opacity-65 hover:opacity-100'
                  ].join(' ')}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="font-mono text-xs px-2.5 py-1 rounded-full border border-[var(--border-hairline)] bg-white/[0.04] text-cyan-400 light:text-cyan-700">
                      {ch.num} · {ch.kicker}
                    </span>
                    <Icon className={`w-4 h-4 ml-auto ${isActive ? 'text-cyan-400 light:text-cyan-700' : 'text-[var(--ink-faint)]'}`} />
                  </div>
                  <h3 className="text-xl font-semibold text-[var(--ink-primary)] mb-2.5">{ch.title}</h3>
                  <p className="text-[14.5px] leading-relaxed text-[var(--ink-muted)] mb-5">{ch.body}</p>
                  <div className="grid grid-cols-2 gap-3 pt-4 border-t border-[var(--border-hairline)]">
                    {ch.metrics.map((m) => (
                      <div key={m.label}>
                        <span className="block text-[11px] font-mono text-[var(--ink-faint)]">{m.label}</span>
                        <strong className="text-sm font-mono text-[var(--ink-primary)]">{m.value}</strong>
                      </div>
                    ))}
                  </div>
                </motion.button>
              );
            })}
          </div>

          {/* Right sticky visual stage */}
          <div className="lg:sticky lg:top-28 min-w-0 w-full">
            <div className="relative w-full min-w-0 rounded-3xl border border-white/15 light:border-slate-900/12 bg-gradient-to-b from-[#111625]/95 to-[#070910]/98 light:from-white light:to-slate-50 p-6 sm:p-7 shadow-[0_36px_90px_-30px_rgba(0,0,0,0.92)] overflow-hidden min-h-[420px] flex flex-col justify-between">
              <div
                aria-hidden="true"
                className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none"
              />

              <div className="flex items-center justify-between gap-3 pb-4 border-b border-[var(--border-hairline)]">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400 light:text-cyan-700" />
                  <span className="font-mono text-xs text-[var(--ink-secondary)]">STAGE // {active.num}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {CHAPTERS.map((c, i) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-label={`切换到 ${c.kicker}`}
                      onClick={() => setActiveIdx(i)}
                      className={[
                        'h-1.5 rounded-full transition-all cursor-pointer',
                        activeIdx === i ? 'w-7 bg-cyan-400' : 'w-2 bg-white/20 light:bg-slate-300'
                      ].join(' ')}
                    />
                  ))}
                </div>
              </div>

              <div className="my-auto py-6">
                <AnimatePresence mode="popLayout" initial={false}>
                  {activeIdx === 0 && (
                    <motion.div
                      key="stage-0"
                      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reducedMotion ? undefined : { opacity: 0, y: -12 }}
                      transition={{ duration: 0.25 }}
                      className="grid gap-4"
                    >
                      <div className="rounded-2xl border border-[var(--border-hairline)] bg-black/40 light:bg-slate-100 p-4 font-mono text-xs text-[var(--ink-secondary)] min-w-0 overflow-hidden">
                        <div className="text-[10px] text-[var(--ink-faint)] mb-2">MESSAGE SOURCE · MARKDOWN + TEX</div>
                        <p className="text-indigo-300 light:text-indigo-700 break-words">$$A = U \Sigma V^T,\quad \|Ax - b\|_2 \to \min$$</p>
                        <p className="text-[var(--ink-muted)] mt-1">利用奇异值分解求最小二乘解，代码片段一键复制。</p>
                      </div>
                      <div className="rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-5 text-[var(--ink-primary)] min-w-0 overflow-x-auto">
                        <div className="text-[10px] font-mono text-cyan-400 light:text-cyan-700 mb-2">RENDERED OUTPUT · KATEX</div>
                        <KatexBlock tex={String.raw`A = U \Sigma V^T,\qquad \hat{x} = \arg\min_{x} \|Ax - b\|_2`} />
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-mono text-[var(--ink-muted)]">
                          <span className="px-2 py-0.5 rounded bg-white/6 light:bg-white">行内公式 $...$</span>
                          <span className="px-2 py-0.5 rounded bg-white/6 light:bg-white">块级方程 $$...$$</span>
                          <span className="px-2 py-0.5 rounded bg-white/6 light:bg-white">Prism 代码高亮</span>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeIdx === 1 && (
                    <motion.div
                      key="stage-1"
                      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reducedMotion ? undefined : { opacity: 0, y: -12 }}
                      transition={{ duration: 0.25 }}
                      className="grid gap-3"
                    >
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { name: '图论编辑器', desc: 'Tarjan · MST · 树形 DP', ver: 'v1.1.4' },
                          { name: '图片标注', desc: 'O(1) 马赛克 · 矢量箭头', ver: 'v1.1.5' },
                          { name: '科学计算器', desc: 'BigInt 分数 · 模线性同余', ver: 'v1.1.0' },
                          { name: 'Markdown 工作台', desc: '大纲抽屉 · 导出高清长图', ver: 'v1.1.3' }
                        ].map((tool) => (
                          <div key={tool.name} className="rounded-2xl border border-[var(--border-hairline)] bg-white/[0.035] light:bg-white p-3.5">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <b className="text-xs text-[var(--ink-primary)]">{tool.name}</b>
                              <span className="font-mono text-[10px] text-cyan-400 light:text-cyan-700">{tool.ver}</span>
                            </div>
                            <p className="text-[11.5px] text-[var(--ink-muted)]">{tool.desc}</p>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-2 text-emerald-300 light:text-emerald-800">
                          <ShieldCheck className="w-4 h-4" />
                          全部工具支持逐文件 SHA-256 校验与离线运行
                        </span>
                        <span className="font-mono text-[11px] text-emerald-400 light:text-emerald-700">VERIFIED</span>
                      </div>
                    </motion.div>
                  )}

                  {activeIdx === 2 && (
                    <motion.div
                      key="stage-2"
                      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reducedMotion ? undefined : { opacity: 0, y: -12 }}
                      transition={{ duration: 0.25 }}
                      className="grid gap-3.5"
                    >
                      <div className="rounded-2xl border border-[var(--border-hairline)] bg-black/35 light:bg-white p-4">
                        <div className="flex items-center justify-between text-xs mb-3">
                          <span className="inline-flex items-center gap-1.5 text-[var(--ink-secondary)]">
                            <Activity className="w-3.5 h-3.5 text-emerald-400" />
                            72h 链路可用率监控
                          </span>
                          <span className="font-mono text-emerald-400 light:text-emerald-700">99.96% · 12ms</span>
                        </div>
                        <div className="grid grid-cols-12 gap-1.5 h-7">
                          {Array.from({ length: 12 }, (_, i) => (
                            <span key={i} className={`rounded ${i === 7 ? 'bg-lime-400/85' : 'bg-emerald-500/85'}`} />
                          ))}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-[var(--border-hairline)] bg-white/[0.03] light:bg-slate-100 p-4 font-mono text-xs grid gap-1.5">
                        <div className="text-[var(--ink-primary)]">PRAGMA journal_mode = WAL;</div>
                        <div className="text-emerald-400 light:text-emerald-700">PRAGMA synchronous = FULL;</div>
                        <div className="text-[var(--ink-muted)]">// 断网秒恢复本地消息缓存，支持一键导出备份包</div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="pt-3 border-t border-[var(--border-hairline)] flex items-center justify-between text-xs text-[var(--ink-faint)] font-mono">
                <span>SCROLL-LINKED STAGE</span>
                <span>{activeIdx + 1} / {CHAPTERS.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
