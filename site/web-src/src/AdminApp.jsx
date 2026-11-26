import { useEffect, useMemo, useRef, useState } from 'react';
import Lenis from 'lenis';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Eye,
  EyeOff,
  Inbox,
  KeyRound,
  Loader2,
  LogOut,
  NotebookPen,
  RefreshCw,
  Save,
  Search,
  Trash2,
  ZoomIn
} from 'lucide-react';
import TechBackdrop from './components/TechBackdrop';
import SubpageHeader from './components/SubpageHeader';
import SubpageFooter from './components/SubpageFooter';
import LightboxDialog from './components/LightboxDialog';
import { copyTextToClipboard, handlePointerSpotlight } from './utils/format';
import { sitePath } from './utils/siteBase';

const MEMO_MAX = 50_000;
const MEMO_COLLAPSED_KEY = '7fa4-admin-memo-collapsed';

const PLATFORM_LABELS = {
  windows: 'Windows',
  linux: 'Linux',
  web: '网页版',
  macos: 'macOS',
  android: 'Android',
  unknown: '未知'
};

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function adminApi(subPath, opts = {}) {
  const res = await fetch(sitePath(`api/feedback/admin${subPath}`), {
    credentials: 'same-origin',
    ...opts
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export default function AdminApp() {
  const prefersReduced = useReducedMotion() ?? false;

  // 'checking' | 'login' | 'ready'
  const [phase, setPhase] = useState('checking');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [tab, setTab] = useState('all'); // 'all' | 'new' | 'handled'
  const [platformFilter, setPlatformFilter] = useState('all');
  const [query, setQuery] = useState('');

  const [confirmDeleteId, setConfirmDeleteId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [togglingId, setTogglingId] = useState('');
  const [copiedId, setCopiedId] = useState('');

  // Personal admin memo
  const [memoCollapsed, setMemoCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(MEMO_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [memoText, setMemoText] = useState('');
  const [memoSavedText, setMemoSavedText] = useState('');
  const [memoUpdatedAt, setMemoUpdatedAt] = useState(null);
  const [memoStatus, setMemoStatus] = useState({ text: '未加载', tone: 'muted' });
  const [memoSaving, setMemoSaving] = useState(false);
  const memoLoadedRef = useRef(false);
  const memoDirtyRef = useRef(false);
  const memoTimerRef = useRef(0);
  const memoLatestTextRef = useRef('');

  // Lightbox state
  const [lightboxImages, setLightboxImages] = useState([]);
  const [lightboxIdx, setLightboxIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  }, []);

  useEffect(() => {
    if (prefersReduced) return;
    const lenis = new Lenis({
      lerp: 0.22,
      wheelMultiplier: 1.35,
      touchMultiplier: 1.4,
      smoothWheel: true
    });
    let rafId = 0;
    const raf = (time) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, [prefersReduced]);

  const loadMemo = async (forceSync) => {
    try {
      const r = await adminApi('/memo');
      if (r.status === 401) {
        setPhase('login');
        return;
      }
      if (r.status === 200 && r.data?.ok) {
        const srvText = typeof r.data.content === 'string' ? r.data.content : '';
        const srvUpdated = r.data.updatedAt || null;
        setMemoSavedText(srvText);
        setMemoUpdatedAt(srvUpdated);
        if (forceSync || !memoDirtyRef.current) {
          memoLatestTextRef.current = srvText;
          setMemoText(srvText);
          memoDirtyRef.current = false;
          memoLoadedRef.current = true;
          setMemoStatus({
            text: srvUpdated ? '已同步' : '已就绪',
            tone: srvUpdated ? 'ok' : 'muted'
          });
        } else {
          memoLoadedRef.current = true;
          setMemoStatus({ text: '有未保存修改', tone: 'warn' });
        }
      }
    } catch {
      if (!memoLoadedRef.current) {
        setMemoStatus({ text: '备忘录加载失败', tone: 'err' });
      }
    }
  };

  const loadList = async () => {
    setLoadingList(true);
    try {
      const r = await adminApi('/list');
      if (r.status === 401) {
        setPhase('login');
        return;
      }
      setItems(Array.isArray(r.data?.items) ? r.data.items : []);
      setConfirmDeleteId('');
      setPhase('ready');
      await loadMemo(!memoLoadedRef.current);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadList();
    return () => window.clearTimeout(memoTimerRef.current);
  }, []);

  const saveMemo = async (manual = false, explicitContent) => {
    window.clearTimeout(memoTimerRef.current);
    if (memoSaving) return;
    const content = explicitContent !== undefined ? explicitContent : memoLatestTextRef.current;
    if (content.length > MEMO_MAX) {
      setMemoStatus({ text: `超出 ${MEMO_MAX} 字限制`, tone: 'err' });
      return;
    }
    if (!manual && content === memoSavedText) {
      memoDirtyRef.current = false;
      setMemoStatus({
        text: memoUpdatedAt ? '已同步' : '已就绪',
        tone: memoUpdatedAt ? 'ok' : 'muted'
      });
      return;
    }
    setMemoSaving(true);
    setMemoStatus({ text: '保存中…', tone: 'muted' });
    try {
      const r = await adminApi('/memo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (r.status === 401) {
        setPhase('login');
        return;
      }
      if (r.status === 200 && r.data?.ok) {
        const savedStr = typeof r.data.content === 'string' ? r.data.content : content;
        const ts = r.data.updatedAt || new Date().toISOString();
        setMemoSavedText(savedStr);
        setMemoUpdatedAt(ts);
        if (memoLatestTextRef.current !== content) {
          memoDirtyRef.current = memoLatestTextRef.current !== savedStr;
          if (memoDirtyRef.current) {
            setMemoStatus({ text: '有未保存修改', tone: 'warn' });
            memoTimerRef.current = window.setTimeout(() => saveMemo(false), 900);
          } else {
            setMemoStatus({ text: '已保存', tone: 'ok' });
          }
        } else {
          memoDirtyRef.current = false;
          setMemoStatus({ text: '已保存', tone: 'ok' });
        }
      } else {
        memoDirtyRef.current = true;
        setMemoStatus({
          text: `保存失败：${r.data?.error || '请重试'}`,
          tone: 'err'
        });
      }
    } catch {
      memoDirtyRef.current = true;
      setMemoStatus({ text: '保存失败：网络错误', tone: 'err' });
    } finally {
      setMemoSaving(false);
    }
  };

  const handleMemoChange = (val) => {
    memoLatestTextRef.current = val;
    setMemoText(val);
    const dirty = val !== memoSavedText;
    memoDirtyRef.current = dirty;
    window.clearTimeout(memoTimerRef.current);
    if (val.length > MEMO_MAX) {
      setMemoStatus({ text: `超出 ${MEMO_MAX} 字限制`, tone: 'err' });
      return;
    }
    if (dirty) {
      setMemoStatus({ text: '有未保存修改', tone: 'warn' });
      memoTimerRef.current = window.setTimeout(() => saveMemo(false), 900);
    } else {
      setMemoStatus({
        text: memoUpdatedAt ? '已同步' : '已就绪',
        tone: memoUpdatedAt ? 'ok' : 'muted'
      });
    }
  };

  const toggleMemoCollapse = () => {
    setMemoCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(MEMO_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (loginBusy) return;
    setLoginError('');
    setLoginBusy(true);
    try {
      const r = await adminApi('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (r.status === 200) {
        setPassword('');
        await loadList();
      } else {
        setLoginError(r.data?.error || '密码错误或登录失败');
      }
    } catch {
      setLoginError('网络错误，请稍后重试');
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    window.clearTimeout(memoTimerRef.current);
    await adminApi('/logout', { method: 'POST' }).catch(() => {});
    setItems([]);
    setConfirmDeleteId('');
    setDeletingId('');
    memoLoadedRef.current = false;
    memoDirtyRef.current = false;
    memoLatestTextRef.current = '';
    setMemoText('');
    setMemoSavedText('');
    setMemoUpdatedAt(null);
    setPhase('login');
  };

  const handleToggleStatus = async (item) => {
    const nextStatus = item.status === 'handled' ? 'new' : 'handled';
    setTogglingId(item.id);
    try {
      const r = await adminApi('/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, status: nextStatus })
      });
      if (r.status === 401) {
        setPhase('login');
        return;
      }
      if (r.status === 200) {
        setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: nextStatus } : it)));
      }
    } finally {
      setTogglingId('');
    }
  };

  const handleConfirmDelete = async (targetId) => {
    setDeletingId(targetId);
    try {
      const r = await adminApi('/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: targetId })
      });
      if (r.status === 401) {
        setPhase('login');
        return;
      }
      if (r.status === 200 || r.status === 404) {
        setItems((prev) => {
          const next = prev.filter((it) => it.id !== targetId);
          if (r.status === 200 && typeof r.data?.total === 'number' && r.data.total !== next.length) {
            loadList();
          }
          return next;
        });
        setConfirmDeleteId('');
      }
    } finally {
      setDeletingId('');
    }
  };

  const handleCopyId = async (id) => {
    if (await copyTextToClipboard(id)) {
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((curr) => (curr === id ? '' : curr)), 1600);
    }
  };

  const newCount = useMemo(() => items.filter((it) => it.status !== 'handled').length, [items]);
  const handledCount = items.length - newCount;

  const availablePlatforms = useMemo(() => {
    const counts = new Map();
    for (const it of items) {
      const p = it.platform || 'unknown';
      counts.set(p, (counts.get(p) || 0) + 1);
    }
    return Array.from(counts.entries());
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (tab === 'new' && it.status === 'handled') return false;
      if (tab === 'handled' && it.status !== 'handled') return false;
      if (platformFilter !== 'all' && (it.platform || 'unknown') !== platformFilter) return false;
      if (!q) return true;
      const haystack = `${it.content || ''} ${it.contact || ''} ${it.id || ''} ${it.version || ''} ${it.page || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [items, tab, platformFilter, query]);

  const memoStatusColor =
    memoStatus.tone === 'ok'
      ? 'text-emerald-400'
      : memoStatus.tone === 'warn'
        ? 'text-amber-300'
        : memoStatus.tone === 'err'
          ? 'text-rose-400'
          : 'text-[var(--ink-muted)]';

  return (
    <MotionConfig reducedMotion="user">
      <TechBackdrop reducedMotion={prefersReduced} />
      <SubpageHeader badgeText="反馈管理" activePage="admin" />

      <main className="relative z-10 min-h-[calc(100vh-88px)] pt-28 pb-20 px-4 sm:px-6">
        <div className="max-w-[1140px] mx-auto">
          {phase === 'checking' && (
            <div className="py-32 flex flex-col items-center justify-center gap-3 text-[var(--ink-muted)]">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
              <span className="text-[13.5px] font-mono">正在验证管理员会话…</span>
            </div>
          )}

          {phase === 'login' && (
            <motion.section
              initial={prefersReduced ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              onPointerMove={handlePointerSpotlight}
              className="spotlight-card max-w-[420px] mx-auto mt-10 rounded-3xl border border-[var(--border-strong)] p-7 sm:p-8 shadow-[0_28px_70px_-32px_rgba(0,0,0,0.92)]"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl border border-indigo-400/35 bg-indigo-500/15 grid place-items-center text-indigo-300">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-[20px] font-bold text-[var(--ink-primary)]">反馈管理控制台</h1>
                  <p className="text-[12px] font-mono text-[var(--ink-muted)]">ADMIN CONSOLE</p>
                </div>
              </div>

              <p className="text-[13.5px] text-[var(--ink-muted)] mb-6 leading-relaxed">
                输入管理口令后可查阅全部用户反馈、截图附件以及跨设备同步的个人备忘录。
              </p>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="adm-password" className="text-[13px] font-medium text-[var(--ink-secondary)] block">
                    管理密码
                  </label>
                  <div className="relative">
                    <input
                      id="adm-password"
                      name="password"
                      type={showPw ? 'text' : 'password'}
                      autoComplete="current-password"
                      enterKeyHint="done"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="输入 FEEDBACK_ADMIN_PASSWORD"
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[#060911]/85 pl-4 pr-14 py-2.5 min-h-[44px] text-[15px] text-[var(--ink-primary)] placeholder:text-[var(--ink-faint)] outline-none focus:border-indigo-400/80 focus:ring-2 focus:ring-indigo-500/25 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-pressed={showPw}
                      aria-label={showPw ? '隐藏密码' : '显示密码'}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 px-2.5 py-1.5 rounded-lg text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-white/8 transition-colors cursor-pointer"
                    >
                      {showPw ? <EyeOff className="w-4 h-4 pointer-events-none" /> : <Eye className="w-4 h-4 pointer-events-none" />}
                    </button>
                  </div>
                </div>

                <div role="alert" className="min-h-[20px] text-[13px] text-rose-400">
                  {loginError}
                </div>

                <button
                  type="submit"
                  disabled={loginBusy}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-full bg-white text-[#050811] text-[14px] font-semibold hover:opacity-92 disabled:opacity-60 transition-all cursor-pointer"
                >
                  {loginBusy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>验证中…</span>
                    </>
                  ) : (
                    <span>进入控制台</span>
                  )}
                </button>
              </form>
            </motion.section>
          )}

          {phase === 'ready' && (
            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="space-y-6"
            >
              {/* Top Bar & Telemetry Pills */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-[26px] sm:text-[30px] font-bold tracking-tight text-[var(--ink-primary)]">
                      用户反馈控制台
                    </h1>
                    <div className="flex flex-wrap items-center gap-2 text-[12px] font-mono">
                      <span className="px-2.5 py-1 rounded-full border border-[var(--border-hairline)] bg-white/[0.04] text-[var(--ink-secondary)]">
                        全部 <strong className="text-[var(--ink-primary)]">{items.length}</strong>
                      </span>
                      <span className="px-2.5 py-1 rounded-full border border-indigo-400/35 bg-indigo-500/15 text-indigo-300">
                        待处理 <strong>{newCount}</strong>
                      </span>
                      <span className="px-2.5 py-1 rounded-full border border-emerald-400/35 bg-emerald-500/15 text-emerald-300">
                        已处理 <strong>{handledCount}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={loadList}
                    disabled={loadingList}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-[var(--border-strong)] bg-white/[0.04] text-[13px] font-medium text-[var(--ink-primary)] hover:bg-white/10 disabled:opacity-60 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin text-cyan-400' : ''}`} />
                    <span>刷新</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-[var(--border-hairline)] bg-white/[0.03] text-[13px] font-medium text-[var(--ink-secondary)] hover:border-rose-400/40 hover:text-rose-300 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>退出</span>
                  </button>
                </div>
              </div>

              {/* Personal Server-Synced Memo Card */}
              <section
                aria-label="个人备忘录"
                onPointerMove={handlePointerSpotlight}
                className="spotlight-card rounded-2xl border border-[var(--border-strong)] p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <NotebookPen className="w-4 h-4 text-cyan-400" />
                    <h2 className="text-[16px] font-semibold text-[var(--ink-primary)]">个人备忘录</h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
                      仅管理员可见 · 跨设备服务端同步
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={toggleMemoCollapse}
                    aria-expanded={!memoCollapsed}
                    aria-controls="admin-memo-body"
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-medium border border-[var(--border-hairline)] bg-white/[0.04] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:border-[var(--border-strong)] transition-colors cursor-pointer"
                  >
                    <span>{memoCollapsed ? '展开' : '收起'}</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${memoCollapsed ? '-rotate-90' : ''}`} />
                  </button>
                </div>

                {!memoCollapsed && (
                  <div id="admin-memo-body" className="mt-3.5 space-y-3">
                    <textarea
                      aria-label="个人备忘录内容"
                      rows={4}
                      maxLength={MEMO_MAX}
                      value={memoText}
                      onChange={(e) => handleMemoChange(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                          e.preventDefault();
                          saveMemo(true, e.currentTarget.value);
                        }
                      }}
                      placeholder="记录待跟进事项、排查思路或版本备忘…（支持自动防抖保存与 Ctrl+S 手动保存，与反馈数据完全独立）"
                      className="site-textarea-autosize w-full min-h-[112px] resize-y rounded-xl border border-[var(--border-hairline)] bg-[#060911]/85 px-4 py-3 text-[14px] leading-relaxed text-[var(--ink-primary)] placeholder:text-[var(--ink-faint)] outline-none focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/20 transition-colors"
                    />

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-3 text-[12.5px] font-mono tabular-nums">
                        <span className={`font-sans font-medium ${memoStatusColor}`}>{memoStatus.text}</span>
                        <span className="text-[var(--ink-faint)]">·</span>
                        <span className="text-[var(--ink-muted)]">
                          上次保存：{memoUpdatedAt ? formatDateTime(memoUpdatedAt) : '尚未保存'}
                        </span>
                        <span className="text-[var(--ink-faint)]">·</span>
                        <span className="text-[var(--ink-muted)]">
                          {memoText.length} / {MEMO_MAX}
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={memoSaving}
                        onClick={() => saveMemo(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white text-[#050811] text-[12.5px] font-semibold hover:opacity-92 disabled:opacity-60 transition-all cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>保存备忘录</span>
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* Search & Filter Toolbar (<search> semantic landmark) */}
              <search aria-label="筛选和搜索反馈" className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div
                    role="tablist"
                    aria-label="状态筛选"
                    className="inline-flex items-center gap-1 p-1 rounded-full border border-[var(--border-hairline)] bg-white/[0.03]"
                  >
                    {[
                      { id: 'all', label: '全部', count: items.length },
                      { id: 'new', label: '待处理', count: newCount },
                      { id: 'handled', label: '已处理', count: handledCount }
                    ].map((t) => {
                      const active = tab === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setTab(t.id)}
                          className={[
                            'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] transition-all cursor-pointer',
                            active
                              ? 'bg-indigo-500/22 text-[var(--ink-primary)] font-semibold border border-indigo-400/40 shadow-sm'
                              : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)] border border-transparent'
                          ].join(' ')}
                        >
                          <span>{t.label}</span>
                          <span className="font-mono text-[11px] opacity-80 tabular-nums">{t.count}</span>
                        </button>
                      );
                    })}
                  </div>

                  {availablePlatforms.length > 1 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPlatformFilter('all')}
                        className={[
                          'px-2.5 py-1 rounded-full text-[12px] border transition-colors cursor-pointer',
                          platformFilter === 'all'
                            ? 'border-cyan-400/40 bg-cyan-400/12 text-cyan-200 font-medium'
                            : 'border-[var(--border-hairline)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                        ].join(' ')}
                      >
                        全平台
                      </button>
                      {availablePlatforms.map(([pf, count]) => (
                        <button
                          key={pf}
                          type="button"
                          onClick={() => setPlatformFilter((curr) => (curr === pf ? 'all' : pf))}
                          className={[
                            'px-2.5 py-1 rounded-full text-[12px] border transition-colors cursor-pointer',
                            platformFilter === pf
                              ? 'border-cyan-400/40 bg-cyan-400/12 text-cyan-200 font-medium'
                              : 'border-[var(--border-hairline)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                          ].join(' ')}
                        >
                          {PLATFORM_LABELS[pf] || pf} {count}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative w-full lg:w-[300px]">
                  <Search className="w-4 h-4 text-[var(--ink-faint)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    aria-label="搜索反馈内容、联系方式或编号"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autocorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="搜索内容 / 联系方式 / 编号…"
                    className="w-full rounded-full border border-[var(--border-strong)] bg-[#060911]/85 pl-9 pr-4 py-2 text-[13.5px] text-[var(--ink-primary)] placeholder:text-[var(--ink-faint)] outline-none focus:border-indigo-400/80 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
                  />
                </div>
              </search>

              {/* Feedback Items Stream */}
              {filteredItems.length === 0 ? (
                <div className="spotlight-card rounded-2xl border border-[var(--border-hairline)] py-16 px-6 text-center space-y-3">
                  <Inbox className="w-9 h-9 mx-auto text-[var(--ink-faint)]" />
                  <p className="text-[14.5px] text-[var(--ink-muted)]">没有符合当前条件的反馈条目</p>
                  {(tab !== 'all' || platformFilter !== 'all' || query.trim()) && (
                    <button
                      type="button"
                      onClick={() => {
                        setTab('all');
                        setPlatformFilter('all');
                        setQuery('');
                      }}
                      className="inline-flex items-center px-4 py-1.5 rounded-full text-[12.5px] border border-[var(--border-strong)] bg-white/[0.04] text-[var(--ink-primary)] hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      清空筛选条件
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <AnimatePresence initial={false}>
                    {filteredItems.map((it) => {
                      const isHandled = it.status === 'handled';
                      const isConfirming = confirmDeleteId === it.id;
                      const isDeleting = deletingId === it.id;
                      const isToggling = togglingId === it.id;
                      const attachments = Array.isArray(it.attachments) ? it.attachments : [];

                      return (
                        <motion.article
                          key={it.id}
                          layout
                          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                          animate={{ opacity: isHandled ? 0.78 : 1, y: 0 }}
                          exit={prefersReduced ? undefined : { opacity: 0, scale: 0.98 }}
                          onPointerMove={handlePointerSpotlight}
                          className={[
                            'spotlight-card rounded-2xl border border-[var(--border-hairline)] border-l-[3px] p-5 sm:p-6 transition-opacity hover:opacity-100',
                            isHandled ? 'border-l-emerald-400/70' : 'border-l-indigo-400'
                          ].join(' ')}
                        >
                          <div className="flex flex-wrap items-center gap-2 mb-3">
                            <span className="px-2.5 py-0.5 rounded-full text-[11.5px] font-medium border border-indigo-400/30 bg-indigo-500/12 text-indigo-300">
                              {PLATFORM_LABELS[it.platform] || it.platform || '未知'}
                            </span>
                            <span
                              className={[
                                'px-2.5 py-0.5 rounded-full text-[11.5px] font-medium border',
                                isHandled
                                  ? 'border-emerald-400/30 bg-emerald-500/12 text-emerald-300'
                                  : 'border-rose-400/35 bg-rose-500/15 text-rose-300'
                              ].join(' ')}
                            >
                              {isHandled ? '已处理' : '待处理'}
                            </span>
                            <time
                              dateTime={it.createdAt}
                              className="sm:ml-auto font-mono text-[12px] text-[var(--ink-muted)] tabular-nums"
                            >
                              {formatDateTime(it.createdAt)}
                            </time>
                          </div>

                          <p className="text-[14.5px] leading-[1.72] text-[var(--ink-primary)] whitespace-pre-wrap break-words mb-4">
                            {it.content}
                          </p>

                          {(it.version || it.contact || it.page || it.ip) && (
                            <div className="flex flex-wrap gap-x-5 gap-y-1.5 px-3.5 py-2.5 rounded-xl border border-[var(--border-hairline)] bg-[#060911]/60 text-[12px] text-[var(--ink-muted)] mb-4">
                              {it.version && (
                                <span>
                                  版本 <code className="font-mono text-[var(--ink-secondary)]">{it.version}</code>
                                </span>
                              )}
                              {it.contact && (
                                <span className="break-all">
                                  联系 <span className="text-[var(--ink-secondary)]">{it.contact}</span>
                                </span>
                              )}
                              {it.page && (
                                <span className="break-all">
                                  来源 <span className="font-mono text-[var(--ink-secondary)]">{it.page}</span>
                                </span>
                              )}
                              {it.ip && (
                                <span>
                                  IP <code className="font-mono text-[var(--ink-secondary)]">{it.ip}</code>
                                </span>
                              )}
                            </div>
                          )}

                          {attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2.5 mb-4">
                              {attachments.map((att, attIdx) => {
                                const src = sitePath(att.url);
                                return (
                                  <button
                                    key={att.file}
                                    type="button"
                                    onClick={() => {
                                      setLightboxImages(
                                        attachments.map((a, idx) => ({
                                          src: sitePath(a.url),
                                          alt: a.name || `反馈 ${it.id} 截图 ${idx + 1}`,
                                          label: a.name || a.file
                                        }))
                                      );
                                      setLightboxIdx(attIdx);
                                      setLightboxOpen(true);
                                    }}
                                    aria-label={`预览截图 ${att.name || att.file}`}
                                    className="group relative w-24 h-24 rounded-xl overflow-hidden border border-[var(--border-strong)] bg-[#0b0e17] cursor-zoom-in focus-visible:outline-2 focus-visible:outline-cyan-400"
                                  >
                                    <img
                                      src={src}
                                      alt={att.name || '截图附件'}
                                      loading="lazy"
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                    />
                                    <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 grid place-items-center transition-colors">
                                      <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          <div className="pt-3 border-t border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={isDeleting || isToggling}
                                onClick={() => handleToggleStatus(it)}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-medium border border-[var(--border-strong)] bg-white/[0.04] text-[var(--ink-primary)] hover:bg-white/10 disabled:opacity-50 transition-colors cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span>{isHandled ? '标记待处理' : '标记已处理'}</span>
                              </button>

                              {!isConfirming ? (
                                <button
                                  type="button"
                                  data-delete={it.id}
                                  disabled={isDeleting}
                                  onClick={() => setConfirmDeleteId(it.id)}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-medium border border-rose-400/35 bg-rose-500/12 text-rose-300 hover:bg-rose-500/22 disabled:opacity-50 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>删除</span>
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    data-confirm-delete={it.id}
                                    disabled={isDeleting}
                                    onClick={() => handleConfirmDelete(it.id)}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold bg-rose-500 text-white hover:brightness-110 disabled:opacity-60 transition-all cursor-pointer"
                                  >
                                    {isDeleting ? '删除中…' : '确认删除'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isDeleting}
                                    onClick={() => setConfirmDeleteId('')}
                                    className="inline-flex items-center px-3 py-1.5 rounded-full text-[12.5px] border border-[var(--border-hairline)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
                                  >
                                    取消
                                  </button>
                                </>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleCopyId(it.id)}
                              title="点击复制反馈编号"
                              className="inline-flex items-center gap-1.5 font-mono text-[12px] text-[var(--ink-muted)] hover:text-cyan-300 transition-colors cursor-pointer"
                            >
                              <span>{it.id}</span>
                              {copiedId === it.id ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Clipboard className="w-3 h-3 opacity-65" />
                              )}
                            </button>
                          </div>
                        </motion.article>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </main>

      <SubpageFooter label="反馈管理" />

      <LightboxDialog
        open={lightboxOpen}
        images={lightboxImages}
        index={lightboxIdx}
        onIndexChange={setLightboxIdx}
        onClose={() => setLightboxOpen(false)}
      />
    </MotionConfig>
  );
}
