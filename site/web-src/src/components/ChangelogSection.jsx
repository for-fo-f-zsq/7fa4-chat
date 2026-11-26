import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { parseChangelog } from '../utils/format';

const TAG_COLORS = {
  新功能: 'border-cyan-400/35 bg-cyan-400/12 text-cyan-300 light:text-cyan-700',
  优化: 'border-indigo-400/35 bg-indigo-400/12 text-indigo-300 light:text-indigo-700',
  修复: 'border-emerald-400/35 bg-emerald-400/12 text-emerald-300 light:text-emerald-700',
  通知: 'border-amber-400/35 bg-amber-400/12 text-amber-300 light:text-amber-700'
};

function splitCategory(text) {
  const m = /^(新功能|优化|修复|通知)[：:]\s*(.+)$/.exec(text);
  if (!m) return { tag: null, body: text };
  return { tag: m[1], body: m[2] };
}

function renderInlineTokens(text) {
  const parts = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('`')) {
      parts.push(
        <code key={key++} className="font-mono text-[12px] px-1.5 py-0.5 rounded bg-white/8 light:bg-slate-200/70 text-[var(--ink-primary)] break-all">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**')) {
      parts.push(<strong key={key++} className="font-semibold text-[var(--ink-primary)]">{token.slice(2, -2)}</strong>);
    } else {
      const m = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(token);
      if (m) {
        parts.push(
          <a key={key++} href={m[2]} target="_blank" rel="noopener" className="text-cyan-400 light:text-cyan-700 hover:underline">
            {m[1]}
          </a>
        );
      } else {
        parts.push(token);
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function ChangelogSection({ markdown, loading, error, reducedMotion }) {
  const [expandedAll, setExpandedAll] = useState(false);
  const releases = useMemo(() => parseChangelog(markdown), [markdown]);
  const INITIAL = 5;
  const visible = expandedAll ? releases : releases.slice(0, INITIAL);

  const reveal = (idx = 0) =>
    reducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 34, filter: 'blur(6px)' },
          whileInView: { opacity: 1, y: 0, filter: 'blur(0px)' },
          viewport: { once: true, amount: 0.22 },
          transition: { duration: 0.55, delay: Math.min(idx * 0.06, 0.24), ease: [0.22, 1, 0.36, 1] }
        };

  return (
    <section id="changelog" className="py-20 sm:py-28">
      <div className="max-w-[860px] mx-auto px-6">
        <motion.header {...reveal(0)} className="text-center max-w-[640px] mx-auto mb-12">
          <p className="font-mono text-xs tracking-[0.14em] uppercase text-cyan-400 light:text-cyan-700 mb-3">
            RELEASE LEDGER
          </p>
          <h2 className="text-[clamp(28px,4vw,42px)] font-bold tracking-tight text-[var(--ink-primary)] mb-3">
            版本演进记录
          </h2>
          <p className="text-[15px] text-[var(--ink-muted)] leading-relaxed">
            每次版本发布与仓库 CHANGELOG 实时同步，清晰追踪新特性与底层优化。
          </p>
        </motion.header>

        <div className="grid grid-cols-1 gap-3 w-full min-w-0" aria-live="polite">
          {loading && <p className="text-center text-sm text-[var(--ink-faint)]">正在加载更新日志…</p>}
          {!loading && (error || releases.length === 0) && (
            <p className="text-center text-sm text-[var(--ink-faint)]">更新日志暂时不可用。</p>
          )}
          {!loading && !error && visible.map((rel, idx) => (
            <motion.div key={rel.version} {...reveal(idx)} className="w-full min-w-0">
              <details
                open={idx === 0}
                className="accordion-item group w-full min-w-0 overflow-hidden rounded-2xl border border-[var(--border-hairline)] hover:border-[var(--border-strong)] open:border-indigo-400/40 bg-[#0b0e17]/75 light:bg-white/90 px-4 sm:px-5 transition-colors"
              >
                <summary className="flex items-center gap-3 py-4 text-sm font-medium text-[var(--ink-primary)] min-w-0">
                  <span className="font-mono text-[13px] font-semibold shrink-0">{rel.version}</span>
                  <span className="text-[13px] text-[var(--ink-muted)] truncate min-w-0 flex-1">{rel.brief}</span>
                  {idx === 0 && (
                    <span className="shrink-0 font-mono text-[10.5px] px-2 py-0.5 rounded-full border border-cyan-400/35 bg-cyan-400/12 text-cyan-400 light:text-cyan-700 whitespace-nowrap">
                      最新
                    </span>
                  )}
                  <ChevronDown className="w-4 h-4 ml-auto text-[var(--ink-faint)] group-open:rotate-180 transition-transform shrink-0" />
                </summary>
                <div className="pb-4 pt-3 border-t border-[var(--border-hairline)] min-w-0 w-full">
                  <ul className="grid grid-cols-1 gap-2.5 min-w-0 w-full">
                    {rel.items.map((rawItem, i) => {
                      const { tag, body } = splitCategory(rawItem);
                      return (
                        <li key={i} className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-[var(--ink-secondary)] break-words whitespace-normal min-w-0">
                          {tag ? (
                            <span className={`shrink-0 mt-0.5 font-mono text-[10.5px] px-2 py-0.5 rounded-md border ${TAG_COLORS[tag] || 'border-[var(--border-hairline)] text-[var(--ink-muted)]'}`}>
                              {tag}
                            </span>
                          ) : (
                            <span className="shrink-0 mt-2 w-1.5 h-1.5 rounded-full bg-indigo-400" aria-hidden="true" />
                          )}
                          <span className="min-w-0 flex-1 break-words">{renderInlineTokens(body)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </details>
            </motion.div>
          ))}
        </div>

        {!loading && releases.length > INITIAL && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setExpandedAll((v) => !v)}
              className="px-5 py-2.5 rounded-full border border-[var(--border-strong)] bg-white/[0.04] light:bg-white text-[13px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-white/10 transition-colors cursor-pointer"
            >
              {expandedAll ? '收起历史版本' : `展开全部 ${releases.length} 个历史版本`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
