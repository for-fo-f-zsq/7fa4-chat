/* ============================================================
   7FA4 Chat 官网前端
   - 所有数据都来自同源 /api/*（由服务端转发 GitLab，前端不直连仓库）
   ============================================================ */

(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ------------------------------------------------------------ 主题 */

  const THEME_KEY = '7fa4-site-theme';

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#05060a' : '#f6f7fb');
    const btn = $('#theme-toggle');
    if (btn) btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) { /* ignore */ }
    let forced = null;
    try { forced = new URLSearchParams(location.search).get('theme'); } catch (e) { /* ignore */ }
    if (forced === 'light' || forced === 'dark') saved = forced;
    if (saved !== 'light' && saved !== 'dark') {
      saved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    applyTheme(saved);
    const btn = $('#theme-toggle');
    if (btn) {
      btn.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
      });
    }
  }

  /* ------------------------------------------------------------ 工具 */

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '—';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB';
    return mb.toFixed(1) + ' MB';
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function detectPlatform() {
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'android';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'android';
    if (/Mac OS X|Macintosh/i.test(ua)) return 'macos';
    if (/Win(dows|64|32)/i.test(ua)) return 'windows';
    if (/Linux/i.test(ua)) return 'linux';
    return null;
  }

  async function getJson(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  /* -------------------------------------------------------- 下载清单 */

  const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10m0 0 3.6-3.6M12 14l-3.6-3.6M5 18.4v.6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.6"/></svg>';

  let downloadsData = null;

  function renderDownloadItem(item) {
    return `
      <a class="dl-item${item.primary ? ' primary' : ''}" href="${escapeHtml(item.url)}"
         title="下载 ${escapeHtml(item.file)}" rel="nofollow">
        <span class="dl-text">
          <span class="dl-name">${escapeHtml(item.kindLabel)}
            <span class="dl-arch">${escapeHtml(item.archLabel)}</span>
          </span>
          <span class="dl-sub">${formatSize(item.size)} · ${escapeHtml(item.file.split('-').pop())}</span>
        </span>
        <span class="dl-go">${ICON_DOWNLOAD}</span>
      </a>`;
  }

  function renderDownloads(data) {
    downloadsData = data;
    const items = data.items || [];

    // 版本/日期
    const ver = data.version ? 'v' + data.version : '—';
    const metaVersion = $('#meta-version');
    const metaDate = $('#meta-date');
    if (metaVersion) metaVersion.textContent = data.version || '—';
    if (metaDate) metaDate.textContent = formatDate(data.releaseDate || data.generatedAt);

    const navVer = $('#nav-version');
    if (navVer && data.version) { navVer.textContent = 'v' + data.version; navVer.hidden = false; }

    const dlVer = $('#dl-version');
    if (dlVer) dlVer.textContent = 'v' + (data.version || '—');

    const footerVer = $('#footer-version');
    if (footerVer && data.version) footerVer.textContent = `当前版本 v${data.version} · ${formatDate(data.releaseDate)}`;

    // 每个平台卡片
    $$('.dl-links').forEach((box) => {
      const platform = box.getAttribute('data-links');
      const group = items.filter((i) => i.platform === platform);
      if (!group.length) {
        box.innerHTML = '<span class="skeleton">该平台暂无可用安装包，请稍后再试。</span>';
        return;
      }
      box.innerHTML = group.map(renderDownloadItem).join('');
    });

    // 高亮当前系统对应的卡片
    const cur = detectPlatform();
    $$('.dl-card').forEach((c) => c.classList.toggle('is-current', !!cur && c.getAttribute('data-platform') === cur));

    // Hero 主按钮：按当前系统给一个更明确的文案
    const hero = $('#hero-download');
    const label = $('#hero-download-label');
    const platform = detectPlatform();
    const map = { windows: 'Windows', macos: 'macOS', linux: 'Linux', android: 'Android' };
    if (hero && label) {
      if (platform && map[platform]) {
        const first = items.find((i) => i.platform === platform && i.primary) || items.find((i) => i.platform === platform);
        if (first) {
          label.textContent = `下载 ${map[platform]} 版`;
          hero.setAttribute('href', first.url);
          hero.setAttribute('rel', 'nofollow');
        }
      }
    }

    // 校验值 + 说明
    const note = $('#dl-note');
    if (note) {
      const total = items.reduce((n, i) => n + 1, 0);
      note.innerHTML = `共 ${total} 个安装包 · 版本 <code>v${escapeHtml(data.version || '')}</code> · 支持断点续传与 SHA-256 校验。`;
      note.hidden = false;
    }

    // 在「如何校验下载的文件」FAQ 里追加 hash 列表
    const hashList = $('#hash-list');
    if (hashList && items.length) {
      const rows = items
        .filter((i) => i.sha256)
        .map((i) => `<div class="hash-row"><b>${escapeHtml(i.file)}</b><code>${escapeHtml(i.sha256)}</code></div>`)
        .join('');
      if (rows) hashList.innerHTML = rows;
    }
    const faqVer = $('#faq-verify-version');
    if (faqVer && data.version) faqVer.textContent = `以下为 v${data.version} 的值。`;
  }

  function renderDownloadError() {
    $$('.dl-links').forEach((box) => {
      box.innerHTML = '<span class="skeleton">暂时无法获取版本信息，请稍后刷新页面。</span>';
    });
    const note = $('#dl-note');
    if (note) {
      note.textContent = '版本信息服务暂时不可用，请稍后重试。';
      note.hidden = false;
    }
    const hashList = $('#hash-list');
    if (hashList) {
      hashList.innerHTML = '<p class="skeleton">校验值暂时无法获取，请稍后刷新页面。</p>';
    }
  }

  async function initDownloads() {
    try {
      const data = await getJson('api/downloads');
      if (!data || !Array.isArray(data.items) || data.items.length === 0) throw new Error('empty');
      renderDownloads(data);
    } catch (e) {
      renderDownloadError();
    }
  }

  /* --------------------------------------------------------- 更新日志 */

  // 极简 Markdown 渲染：只覆盖 CHANGELOG 实际用到的语法（## 标题、- 列表、**粗体**、`代码`、链接）
  function renderInline(text) {
    let out = escapeHtml(text);
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener" target="_blank">$1</a>');
    return out;
  }

  function parseChangelog(md) {
    const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
    const releases = [];
    let current = null;
    let listBuf = [];

    const flushList = () => {
      if (!current || !listBuf.length) { listBuf = []; return; }
      current.html += '<ul>' + listBuf.map((li) => `<li>${renderInline(li)}</li>`).join('') + '</ul>';
      listBuf = [];
    };

    for (const raw of lines) {
      const line = raw.trimEnd();
      const h2 = /^##\s+(.+)$/.exec(line);
      if (h2) {
        flushList();
        current = { version: h2[1].trim(), html: '', brief: '' };
        releases.push(current);
        continue;
      }
      if (!current) continue;
      const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
      if (bullet) {
        if (!current.brief) current.brief = bullet[1].replace(/`/g, '').replace(/\*\*/g, '');
        listBuf.push(bullet[1]);
        continue;
      }
      flushList();
      if (!line.trim()) continue;
      const h3 = /^###\s+(.+)$/.exec(line);
      if (h3) { current.html += `<h3>${renderInline(h3[1])}</h3>`; continue; }
      current.html += `<p>${renderInline(line)}</p>`;
    }
    flushList();
    return releases;
  }

  const CARET = '<span class="rel-caret"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>';

  function renderChangelog(md) {
    const host = $('#changelog-body');
    if (!host) return;
    const releases = parseChangelog(md);
    if (!releases.length) {
      host.innerHTML = '<p class="skeleton">更新日志暂时不可用，请稍后刷新页面。</p>';
      return;
    }
    const INITIAL = 6; // 默认只展开最近若干个版本，其余折叠在「全部版本」里
    const card = (rel, idx, extra) => `
        <details class="release${extra ? ' release-extra' : ''}"${idx === 0 ? ' open' : ''}>
          <summary>
            <span class="rel-ver">${escapeHtml(rel.version)}</span>
            <span class="rel-brief">${escapeHtml(rel.brief || '')}</span>
            ${idx === 0 ? '<span class="rel-latest">最新</span>' : ''}
            ${CARET}
          </summary>
          <div class="release-body">${rel.html}</div>
        </details>`;

    const head = releases.slice(0, INITIAL).map((rel, idx) => card(rel, idx, false)).join('');
    const rest = releases.slice(INITIAL);
    const tail = rest.length
      ? `<div class="release-rest">${rest.map((rel, i) => card(rel, i + INITIAL, true)).join('')}</div>
         <button class="release-more" type="button">查看全部 ${releases.length} 个版本</button>`
      : '';

    host.innerHTML = head + tail;

    const more = $('.release-more', host);
    if (more) {
      more.addEventListener('click', () => {
        const expanded = host.classList.toggle('is-expanded');
        more.textContent = expanded ? '收起历史版本' : `查看全部 ${releases.length} 个版本`;
      });
    }
  }

  async function initChangelog() {
    const host = $('#changelog-body');
    try {
      const res = await fetch('api/changelog', { headers: { Accept: 'text/markdown' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      renderChangelog(await res.text());
    } catch (e) {
      if (host) host.innerHTML = '<p class="skeleton">更新日志暂时不可用，请稍后刷新页面。</p>';
    }
  }

  /* ----------------------------------------------------------- 赞助 */

  function amountValue(s) {
    const m = /([0-9]+(?:\.[0-9]+)?)/.exec(String(s || ''));
    return m ? parseFloat(m[1]) : 0;
  }

  function renderSponsors(data) {
    const host = $('#sponsor-list');
    if (!host) return;
    const list = (data && Array.isArray(data.list) ? data.list : [])
      .slice()
      .sort((a, b) => amountValue(b.amount) - amountValue(a.amount));

    if (!list.length) {
      host.innerHTML = '<p class="skeleton">暂无赞助记录。</p>';
      return;
    }
    const max = amountValue(list[0].amount) || 0;
    host.innerHTML = list
      .map((s) => {
        const amt = amountValue(s.amount);
        const top = max > 0 && amt >= max * 0.9;
        return `<div class="sponsor${top ? ' top' : ''}">
            <span class="sp-name">${escapeHtml(s.name || '匿名')}</span>
            <span class="sp-amt">${escapeHtml(s.amount || '')}</span>
          </div>`;
      })
      .join('');
  }

  async function initSponsors() {
    const host = $('#sponsor-list');
    const qr = $('#donate-qr');
    if (qr) qr.src = 'api/donate-qr';
    try {
      renderSponsors(await getJson('api/sponsors'));
    } catch (e) {
      if (host) host.innerHTML = '<p class="skeleton">赞助名单暂时不可用，请稍后刷新页面。</p>';
    }
  }

  /* ----------------------------------------------------- 视觉细节 */

  function initReveal() {
    const items = $$("[data-reveal]");
    if (!items.length) return;
    const vh = window.innerHeight || 800;
    const later = [];
    items.forEach((el) => {
      const top = el.getBoundingClientRect().top;
      if (top < vh * 1.02) el.classList.add("in");
      else later.push(el);
    });
    if (!("IntersectionObserver" in window)) {
      later.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
    later.forEach((el) => io.observe(el));
    // 兜底：任何原因导致观察器没触发时，2 秒后全部显示
    setTimeout(() => items.forEach((el) => el.classList.add("in")), 2000);
  }

  function initSpotlight() {
    $$('.cell, .dl-card').forEach((card) => {
      card.addEventListener('pointermove', (ev) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((ev.clientX - r.left) / r.width * 100).toFixed(1) + '%');
        card.style.setProperty('--my', ((ev.clientY - r.top) / r.height * 100).toFixed(1) + '%');
      });
    });
  }

  /* ------------------------------------------------------------ 顶栏 */

  function initTopbar() {
    const bar = $('.topbar');
    if (!bar) return;
    const onScroll = () => bar.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // 若用户通过校内网入口（in.7fa4.cn）访问官网，把页面内的 jx.7fa4.cn 链接同步为当前域名
  function initHostLinks() {
    if (location.hostname !== 'in.7fa4.cn') return;
    $$('a[href*="jx.7fa4.cn"]').forEach((a) => {
      a.href = a.href.replace(/jx\.7fa4\.cn/g, 'in.7fa4.cn');
    });
    const appUrl = $('.app-url');
    if (appUrl) appUrl.textContent = appUrl.textContent.replace('jx.7fa4.cn', 'in.7fa4.cn');
  }

  /* ------------------------------------------------------------ 启动 */

  function boot() {
    initTheme();
    initHostLinks();
    initReveal();
    initSpotlight();
    initTopbar();
    initDownloads();
    initChangelog();
    initSponsors();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
