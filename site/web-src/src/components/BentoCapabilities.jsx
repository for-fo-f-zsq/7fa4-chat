import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useInView } from 'motion/react';
import { Bell, Pause, Play } from 'lucide-react';
import KatexBlock from './KatexBlock';
import { handlePointerSpotlight } from '../utils/format';

const LATEX_PRESETS = [
  {
    id: 0,
    label: '级数收敛',
    tex: String.raw`\sum_{n=1}^{\infty} u_n(x) \le \sum_{n=1}^{\infty} M_n < +\infty`,
    note: 'Weierstrass 判别法 · 支持实时编辑下方源码'
  },
  {
    id: 1,
    label: '高斯积分',
    tex: String.raw`\int_{-\infty}^{+\infty} e^{-x^2}\,dx = \sqrt{\pi}`,
    note: '极坐标换元 · KaTeX 0.18 原生排版'
  },
  {
    id: 2,
    label: 'Tarjan DP',
    tex: String.raw`dp[v] = \max\bigl(dp[u] + w[v]\bigr)`,
    note: '图论编辑器内建 scc_dag 点权路径求解'
  }
];

const PLUGIN_ROWS = [
  { name: '图论编辑器', tag: 'tree_mwis · dag_lp', dot: 'bg-blue-400', stat: 'dag_lp = 13' },
  { name: 'Markdown 编辑器', tag: '大纲 · 长图导出', dot: 'bg-cyan-400', stat: 'Ctrl+F 就绪' },
  { name: '图片标注与马赛克', tag: '编辑后直接发送', dot: 'bg-violet-400', stat: 'O(1) 采样' },
  { name: '科学计算器 & 计时器', tag: 'BigInt · 四宫格', dot: 'bg-emerald-400', stat: '精确分数' }
];

const STREAM_FILES = [
  { ext: 'TS', color: 'bg-blue-500/20 text-blue-300 light:text-blue-700', name: 'web-api.js', size: '14.2 KB' },
  { ext: 'XLS', color: 'bg-emerald-500/20 text-emerald-300 light:text-emerald-700', name: '实验数据-第3组.xlsx', size: '46.0 KB' },
  { ext: 'MD', color: 'bg-violet-500/20 text-violet-300 light:text-violet-700', name: '数学分析笔记.md', size: '18.4 KB' },
  { ext: 'PNG', color: 'bg-cyan-500/20 text-cyan-300 light:text-cyan-700', name: '板演-第3题.png', size: '1.18 MB' },
  { ext: 'PDF', color: 'bg-rose-500/20 text-rose-300 light:text-rose-700', name: '线性代数讲义.pdf', size: '3.40 MB' }
];

const TELEMETRY_HOURS = Array.from({ length: 24 }, (_, idx) => ({
  hour: `${String(idx).padStart(2, '0')}:00`,
  uptime: idx === 13 ? '98.6%' : '100%',
  latency: idx === 13 ? '42ms' : `${11 + (idx % 6)}ms`,
  warn: idx === 13
}));

function PauseControl({ paused, onToggle }) {
  const label = paused ? '继续演示' : '暂停演示';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className="w-8 h-8 rounded-full shrink-0 border border-[var(--border-hairline)] bg-white/[0.04] light:bg-slate-100 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:border-[var(--border-strong)] grid place-items-center transition-colors cursor-pointer"
    >
      {paused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
    </button>
  );
}

export default function BentoCapabilities({ reducedMotion }) {
  const sectionRef = useRef(null);
  const inView = useInView(sectionRef, { once: true, amount: 0.2 });

  const [paused, setPaused] = useState({ latex: false, tools: false, files: false, telemetry: false });
  const [latexIdx, setLatexIdx] = useState(0);
  const [customTex, setCustomTex] = useState(LATEX_PRESETS[0].tex);
  const [userEdited, setUserEdited] = useState(false);

  const [toolIdx, setToolIdx] = useState(0);
  const [activeBar, setActiveBar] = useState(23);
  const [hoverHour, setHoverHour] = useState(null);
  const [onlyMention, setOnlyMention] = useState(true);

  const togglePause = (key) => setPaused((prev) => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    if (reducedMotion || !inView) return;
    const t1 = setInterval(() => {
      if (!paused.latex && !userEdited) {
        setLatexIdx((i) => {
          const next = (i + 1) % LATEX_PRESETS.length;
          setCustomTex(LATEX_PRESETS[next].tex);
          return next;
        });
      }
    }, 4500);
    const t2 = setInterval(() => {
      if (!paused.tools) setToolIdx((i) => (i + 1) % PLUGIN_ROWS.length);
      if (!paused.telemetry) setActiveBar((i) => (i + 1) % TELEMETRY_HOURS.length);
    }, 2200);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }, [paused, reducedMotion, inView, userEdited]);

  const selectPreset = (p) => {
    setUserEdited(false);
    setLatexIdx(p.id);
    setCustomTex(p.tex);
  };

  const displayedHour = hoverHour !== null ? TELEMETRY_HOURS[hoverHour] : TELEMETRY_HOURS[activeBar];

  const cardReveal = (idx) =>
    reducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 42, scale: 0.96, filter: 'blur(8px)' },
          whileInView: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
          viewport: { once: true, amount: 0.25 },
          transition: { duration: 0.65, delay: idx * 0.08, ease: [0.22, 1, 0.36, 1] }
        };

  return (
    <section id="capabilities" ref={sectionRef} className="py-20 sm:py-28">
      <div className="max-w-[1160px] mx-auto px-6">
        <motion.header
          {...cardReveal(0)}
          className="text-center max-w-[680px] mx-auto mb-12"
        >
          <p className="font-mono text-xs tracking-[0.14em] uppercase text-cyan-400 light:text-cyan-700 mb-3">
            ENGINEERING CAPABILITIES
          </p>
          <h2 className="text-[clamp(28px,4vw,44px)] font-bold tracking-tight text-[var(--ink-primary)] mb-3.5">
            高密度讨论的工程细节
          </h2>
          <p className="text-[15.5px] text-[var(--ink-muted)] leading-relaxed">
            把原本分散在公式编辑器、画图板与终端之间的步骤收拢到同一会话流中，滚动至此即可实时交互体验。
          </p>
        </motion.header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: Live Editable KaTeX */}
          <motion.article
            {...cardReveal(0)}
            onPointerMove={handlePointerSpotlight}
            className="spotlight-card rounded-3xl border border-[var(--border-hairline)] hover:border-[var(--border-strong)] p-6 sm:p-7 flex flex-col justify-between gap-5 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-[var(--ink-primary)] mb-2">实时可编辑 KaTeX 公式排版</h3>
                <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
                  支持直接编辑下方公式源码，右侧毫秒级实时渲染，与 OJ 题面排版完全一致。
                </p>
              </div>
              <PauseControl paused={paused.latex} onToggle={() => togglePause('latex')} />
            </div>

            <div className="rounded-2xl border border-[var(--border-hairline)] bg-[#05070d]/85 light:bg-slate-100/90 p-4 min-h-[264px] flex flex-col justify-between">
              <div className="flex flex-wrap gap-1.5 mb-3">
                {LATEX_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectPreset(p)}
                    className={[
                      'px-2.5 py-1 rounded-full text-xs border transition-colors cursor-pointer',
                      !userEdited && latexIdx === p.id
                        ? 'border-cyan-400/50 bg-cyan-400/15 text-[var(--ink-primary)]'
                        : 'border-[var(--border-hairline)] bg-white/[0.03] light:bg-white text-[var(--ink-muted)]'
                    ].join(' ')}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1">
                <label className="rounded-xl border border-[var(--border-hairline)] bg-white/[0.025] light:bg-white p-3 min-w-0 flex flex-col">
                  <span className="block font-mono text-[10px] tracking-wider text-[var(--ink-faint)] mb-1.5">INPUT · 可直接修改 TEX</span>
                  <textarea
                    value={customTex}
                    onChange={(e) => {
                      setUserEdited(true);
                      setCustomTex(e.target.value);
                    }}
                    rows={4}
                    aria-label="编辑 LaTeX 数学公式"
                    className="w-full flex-1 resize-none bg-transparent border-0 outline-none font-mono text-[12px] leading-relaxed text-[var(--ink-secondary)]"
                  />
                </label>

                <div className="rounded-xl border border-[var(--border-hairline)] bg-white/[0.025] light:bg-white p-3 min-w-0 flex flex-col justify-between">
                  <span className="block font-mono text-[10px] tracking-wider text-[var(--ink-faint)] mb-1.5">RENDER · REALTIME KATEX</span>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={customTex}
                      initial={reducedMotion ? false : { opacity: 0.4 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.16 }}
                      className="bento-katex px-2.5 py-2.5 rounded-lg bg-indigo-500/10 border border-indigo-400/25 text-[var(--ink-primary)] overflow-x-auto"
                    >
                      <KatexBlock tex={customTex || '\\text{请输入 LaTeX 公式}'} />
                    </motion.div>
                  </AnimatePresence>
                  <p className="text-[11.5px] text-[var(--ink-muted)] mt-2">
                    {userEdited ? '自定义输入实时渲染中' : LATEX_PRESETS[latexIdx].note}
                  </p>
                </div>
              </div>
            </div>
          </motion.article>

          {/* Card 2: 6 Offline Tools with Animated DAG Paths */}
          <motion.article
            {...cardReveal(1)}
            onPointerMove={handlePointerSpotlight}
            className="spotlight-card rounded-3xl border border-[var(--border-hairline)] hover:border-[var(--border-strong)] p-6 sm:p-7 flex flex-col justify-between gap-5 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-[var(--ink-primary)] mb-2">六大离线工具箱，按需即取</h3>
                <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
                  独立静态包逐文件 SHA-256 校验，断网照常使用；图片编辑完成后直接回传聊天输入框。
                </p>
              </div>
              <PauseControl paused={paused.tools} onToggle={() => togglePause('tools')} />
            </div>

            <div className="rounded-2xl border border-[var(--border-hairline)] bg-[#05070d]/85 light:bg-slate-100/90 p-4 min-h-[264px] grid grid-cols-1 sm:grid-cols-[1.05fr_0.95fr] gap-3 items-center">
              <div className="grid gap-2">
                {PLUGIN_ROWS.map((row, idx) => (
                  <button
                    key={row.name}
                    type="button"
                    onClick={() => setToolIdx(idx)}
                    className={[
                      'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left text-[12.5px] transition-all cursor-pointer',
                      toolIdx === idx
                        ? 'border-indigo-400/45 bg-indigo-500/14 text-[var(--ink-primary)]'
                        : 'border-[var(--border-hairline)] bg-white/[0.025] light:bg-white text-[var(--ink-secondary)]'
                    ].join(' ')}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${row.dot}`} />
                    <span className="truncate">{row.name}</span>
                    <em className="ml-auto not-italic font-mono text-[10.5px] text-[var(--ink-faint)] shrink-0">{row.tag}</em>
                  </button>
                ))}
              </div>

              <div className="rounded-2xl border border-[var(--border-strong)] bg-[#0f1320]/95 light:bg-white p-3.5 grid gap-2.5 shadow-lg">
                <div className="flex items-center justify-between gap-2 text-xs text-[var(--ink-muted)]">
                  <span className="truncate">{PLUGIN_ROWS[toolIdx].name}</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 light:text-emerald-700 whitespace-nowrap shrink-0">
                    SHA-256 ✓
                  </span>
                </div>
                <svg className="w-full h-auto" viewBox="0 0 180 94" aria-hidden="true">
                  <line x1="34" y1="54" x2="88" y2="24" className="stroke-slate-500/40" strokeWidth="1.8" />
                  <line x1="88" y1="24" x2="146" y2="48" className="stroke-slate-500/40" strokeWidth="1.8" />
                  <motion.line
                    x1="34" y1="54" x2="94" y2="74"
                    className="stroke-cyan-400/85"
                    strokeWidth="2.4"
                    initial={reducedMotion ? false : { pathLength: 0 }}
                    whileInView={{ pathLength: 1 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 0.75, delay: 0.2 }}
                  />
                  <motion.line
                    x1="94" y1="74" x2="146" y2="48"
                    className="stroke-cyan-400/85"
                    strokeWidth="2.4"
                    initial={reducedMotion ? false : { pathLength: 0 }}
                    whileInView={{ pathLength: 1 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 0.75, delay: 0.55 }}
                  />
                  <circle cx="34" cy="54" r="13" className="fill-[#0b1326] stroke-cyan-400" strokeWidth="2" />
                  <circle cx="88" cy="24" r="11" className="fill-[#141c33] stroke-indigo-400" strokeWidth="1.6" />
                  <circle cx="146" cy="48" r="13" className="fill-[#0b1326] stroke-cyan-400" strokeWidth="2" />
                  <circle cx="94" cy="74" r="12" className="fill-[#0b1326] stroke-cyan-400" strokeWidth="2" />
                  <text x="34" y="58" textAnchor="middle" className="fill-white font-mono text-[10px]">5</text>
                  <text x="88" y="28" textAnchor="middle" className="fill-white font-mono text-[10px]">2</text>
                  <text x="146" y="52" textAnchor="middle" className="fill-white font-mono text-[10px]">8</text>
                  <text x="94" y="78" textAnchor="middle" className="fill-white font-mono text-[10px]">3</text>
                </svg>
                <div className="flex items-center justify-between text-[11.5px] text-[var(--ink-muted)]">
                  <code className="font-mono text-cyan-400 light:text-cyan-700">{PLUGIN_ROWS[toolIdx].stat}</code>
                  <span className="font-mono">0.4ms</span>
                </div>
              </div>
            </div>
          </motion.article>

          {/* Card 3: File Stream & Local-first SQLite */}
          <motion.article
            {...cardReveal(2)}
            onPointerMove={handlePointerSpotlight}
            className="spotlight-card rounded-3xl border border-[var(--border-hairline)] hover:border-[var(--border-strong)] p-6 sm:p-7 flex flex-col justify-between gap-5 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-[var(--ink-primary)] mb-2">拖拽互传与本地优先存储</h3>
                <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
                  课件、代码与长图直接拖拽转发；SQLite WAL 本地持久化，1280px 智能压缩确保稳定送达。
                </p>
              </div>
              <PauseControl paused={paused.files} onToggle={() => togglePause('files')} />
            </div>

            <div
              className={[
                'rounded-2xl border border-[var(--border-hairline)] bg-[#05070d]/85 light:bg-slate-100/90 p-4 min-h-[264px] flex flex-col justify-between gap-3 overflow-hidden',
                paused.files ? 'is-paused' : ''
              ].join(' ')}
            >
              <div className="h-[118px] overflow-hidden [mask-image:linear-gradient(180deg,transparent,#000_22%,#000_78%,transparent)]" aria-hidden="true">
                <div className="grid gap-2 animate-vertical-marquee">
                  {[...STREAM_FILES, ...STREAM_FILES].map((f, idx) => (
                    <div
                      key={`${f.name}-${idx}`}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[var(--border-hairline)] bg-white/[0.03] light:bg-white text-[12.5px] text-[var(--ink-secondary)]"
                    >
                      <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md ${f.color}`}>{f.ext}</span>
                      <span className="truncate">{f.name}</span>
                      <em className="ml-auto not-italic font-mono text-[11px] text-[var(--ink-faint)]">{f.size}</em>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border-strong)] bg-[#0e121e]/95 light:bg-white p-3.5">
                <div className="flex items-center gap-2 text-xs text-[var(--ink-primary)] mb-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="font-medium">SQLite WAL · 本地加密缓存</span>
                  <code className="ml-auto font-mono text-[10.5px] px-1.5 py-0.5 rounded bg-white/8 light:bg-slate-100 text-[var(--ink-muted)]">sync=FULL</code>
                </div>
                <div className="grid gap-1 font-mono text-[11px]">
                  <div className="text-emerald-400 light:text-emerald-700">+ 凭据本地加密 · 支持导出备份与导入恢复</div>
                  <div className="text-emerald-400 light:text-emerald-700">+ 气泡拖到会话列表即转发 · 拖到输入区编辑</div>
                  <div className="text-[var(--ink-muted)]">~ 自动缩边至 1280px · 避免长文或大图拒收</div>
                </div>
              </div>
            </div>
          </motion.article>

          {/* Card 4: 72h Availability Telemetry (Cascading Bars on Scroll) */}
          <motion.article
            {...cardReveal(3)}
            onPointerMove={handlePointerSpotlight}
            className="spotlight-card rounded-3xl border border-[var(--border-hairline)] hover:border-[var(--border-strong)] p-6 sm:p-7 flex flex-col justify-between gap-5 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-[var(--ink-primary)] mb-2">72h 可用率监控与玻璃态通知</h3>
                <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
                  分时段记录在线延迟与故障计数；桌面端支持四角玻璃态通知卡片、定时免打扰与仅提醒 @我。
                </p>
              </div>
              <PauseControl paused={paused.telemetry} onToggle={() => togglePause('telemetry')} />
            </div>

            <div className="rounded-2xl border border-[var(--border-hairline)] bg-[#05070d]/85 light:bg-slate-100/90 p-4 min-h-[264px] flex flex-col justify-between gap-3.5">
              <div className="rounded-xl border border-[var(--border-hairline)] bg-white/[0.025] light:bg-white p-3.5">
                <div className="flex items-center justify-between gap-2 text-xs text-[var(--ink-muted)] mb-2.5">
                  <span>最近 24 小时连接可用率（{displayedHour.hour}）</span>
                  <strong className="font-mono text-emerald-400 light:text-emerald-700">
                    {displayedHour.uptime} · {displayedHour.latency}
                  </strong>
                </div>
                <div className="grid grid-cols-24 gap-1 h-8 items-end">
                  {TELEMETRY_HOURS.map((h, i) => {
                    const isHot = (hoverHour ?? activeBar) === i;
                    return (
                      <motion.button
                        key={h.hour}
                        type="button"
                        aria-label={`${h.hour} 可用率 ${h.uptime} 延迟 ${h.latency}`}
                        onMouseEnter={() => setHoverHour(i)}
                        onMouseLeave={() => setHoverHour(null)}
                        initial={reducedMotion ? false : { scaleY: 0 }}
                        whileInView={{ scaleY: isHot ? 1.15 : 1 }}
                        viewport={{ once: true, amount: 0.4 }}
                        transition={{ duration: 0.36, delay: i * 0.02 }}
                        className={[
                          'h-full origin-bottom rounded-[3px] transition-opacity cursor-pointer',
                          h.warn ? 'bg-lime-400' : 'bg-emerald-500',
                          isHot ? 'opacity-100 ring-1 ring-white/40' : 'opacity-80 hover:opacity-100'
                        ].join(' ')}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-indigo-400/30 bg-[#101524]/90 light:bg-white p-3.5">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-cyan-400 light:text-cyan-700">
                    <Bell className="w-3.5 h-3.5" />
                    7FA4 Chat · 桌面通知
                  </span>
                  <button
                    type="button"
                    onClick={() => setOnlyMention((v) => !v)}
                    className="px-2.5 py-0.5 rounded-full border border-[var(--border-hairline)] bg-white/5 light:bg-slate-100 text-[11px] text-[var(--ink-secondary)] hover:border-[var(--border-strong)] cursor-pointer"
                  >
                    仅提醒 @我：{onlyMention ? '开' : '关'}
                  </button>
                </div>
                <b className="block text-[13px] text-[var(--ink-primary)] mb-0.5">数学分析 · 讨论组</b>
                <p className="text-xs text-[var(--ink-muted)]">
                  {onlyMention
                    ? '@全体成员 下周习题课改至周三晚 19:00（同会话连续消息自动合并 3 条）'
                    : '王同学：刚把第 4 题的 MATLAB 图像传到群文件了'}
                </p>
              </div>
            </div>
          </motion.article>
        </div>
      </div>
    </section>
  );
}
