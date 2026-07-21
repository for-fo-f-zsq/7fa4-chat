/* 7FA4 Chat landing page — interactions & live data from GitLab. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtSize = (b) => {
    if (!b) return '';
    const u = ['B', 'KB', 'MB', 'GB']; let i = 0, n = b;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n >= 10 || i < 2 ? 0 : 1)} ${u[i]}`;
  };
  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  /* ---------- nav: scroll state + burger ---------- */
  const nav = $('#nav');
  const onScroll = () => {
    nav.classList.toggle('scrolled', window.scrollY > 8);
    $('#toTop').classList.toggle('show', window.scrollY > 600);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const burger = $('#navBurger');
  const navLinks = $('.nav-links');
  burger.addEventListener('click', () => {
    const open = burger.classList.toggle('open');
    navLinks.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
  });
  $$('.nav-links a').forEach((a) => a.addEventListener('click', () => {
    burger.classList.remove('open'); navLinks.classList.remove('open');
  }));

  $('#toTop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  $('#footerYear').textContent = new Date().getFullYear();

  /* ---------- feature cards ---------- */
  const featGrid = $('#featureGrid');
  featGrid.innerHTML = (window.SITE_DATA?.features || []).map((f) => `
    <article class="feature-card">
      <div class="feature-ico"><i class="${f.ico}"></i></div>
      <h3>${escapeHtml(f.title)}</h3>
      <p>${escapeHtml(f.desc)}</p>
    </article>`).join('');
  $$('.feature-card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });

  /* ---------- 预览：4 张截图交叉重叠展示（纯 CSS，无需 JS） ---------- */

  /* ---------- downloads (live from GitLab) ---------- */
  let downloads = null;
  let activeOs = 'Windows';

  const detectOs = () => {
    const ua = navigator.userAgent;
    if (/Mac|iPhone|iPad/.test(ua)) return 'macOS';
    if (/Linux|X11/.test(ua)) return 'Linux';
    return 'Windows';
  };

  const osIcon = { Windows: 'fa-brands fa-windows', macOS: 'fa-brands fa-apple', Linux: 'fa-brands fa-linux' };
  const osHint = { Windows: '推荐 .exe 安装包（也可选绿色版 zip）', macOS: 'macOS 暂未发布安装包，敬请期待', Linux: '推荐 AppImage（免安装）或 deb 包' };

  const setLoading = (id, on) => {
    const el = $('#' + id);
    if (!el) return;
    el.innerHTML = on
      ? '<div class="loading"><span></span><span></span><span></span></div>'
      : '';
  };

  const renderDownloadGrid = () => {
    const latest = downloads?.versions?.[0];
    const grid = $('#downloadGrid');
    if (!latest) { grid.innerHTML = '<p class="muted">暂无下载，请稍后再试。</p>'; return; }
    const arts = latest.artifacts.filter((a) => a.os === activeOs);

    if (!arts.length) {
      grid.innerHTML = `
        <div class="dl-card" style="grid-column:1/-1">
          <div class="dl-ico"><i class="${osIcon[activeOs]}"></i></div>
          <div class="meta"><strong>${activeOs} 平台</strong><small>${osHint[activeOs]}</small></div>
        </div>`;
      return;
    }

    grid.innerHTML = arts.map((a) => `
      <a class="dl-card" href="${escapeHtml(a.url)}" target="_blank" rel="noopener" title="下载 ${escapeHtml(a.file_name)}">
        <div class="dl-ico"><i class="${a.icon}"></i></div>
        <div class="meta">
          <strong>${escapeHtml(a.os)} · ${escapeHtml(a.arch)} <span style="color:var(--text-mute);font-weight:500">.${escapeHtml(a.ext)}</span></strong>
          <small>${escapeHtml(a.sizeLabel || fmtSize(a.size))}${a.sha512 ? ' · SHA-512 已校验' : ''}</small>
        </div>
        <div class="dl-go"><i class="fa-solid fa-arrow-down"></i></div>
      </a>`).join('');
  };

  const renderAllVersions = () => {
    const list = $('#versionsList');
    if (!downloads?.versions?.length) { list.innerHTML = '<p class="muted" style="padding:16px">暂无历史版本。</p>'; return; }
    list.innerHTML = downloads.versions.map((v, i) => {
      const win = v.artifacts.filter((a) => a.os === 'Windows').slice(0, 4);
      const lin = v.artifacts.filter((a) => a.os === 'Linux').slice(0, 2);
      const chips = [...win, ...lin].map((a) =>
        `<a class="ver-file-chip" href="${escapeHtml(a.url)}" title="${escapeHtml(a.file_name)}">${escapeHtml(a.ext)}</a>`).join('');
      return `
        <div class="ver-row">
          <span class="ver-num">v${escapeHtml(v.version)}</span>
          ${i === 0 ? '<span class="ver-latest">最新</span>' : ''}
          <span class="ver-meta">${escapeHtml(fmtDate(v.created_at))} · ${v.artifacts.length} 个文件</span>
          <div class="ver-files">${chips}</div>
        </div>`;
    }).join('');
  };

  $$('#osSwitch .os-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('#osSwitch .os-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeOs = btn.dataset.os;
      renderDownloadGrid();
    });
  });

  const osLabelText = { Windows: 'Windows 版', macOS: 'macOS 版', Linux: 'Linux 版' };
  const detected = detectOs();
  if ($('#detectOsLabel')) $('#detectOsLabel').textContent = `下载 ${osLabelText[detected] || detected}`;

  // 为本机平台挑选最合适的安装包：Windows→exe，Linux→AppImage，其余按优先级
  const pickArtifact = (os, data) => {
    const latest = data?.versions?.[0];
    if (!latest) return null;
    const arts = latest.artifacts.filter((a) => a.os === os);
    if (!arts.length) return null;
    const rank = { exe: 3, AppImage: 3, zip: 2, deb: 2, dmg: 1, pkg: 1 };
    return arts.slice().sort((a, b) => (rank[b.ext] || 0) - (rank[a.ext] || 0))[0];
  };

  const triggerDownload = (url, fileName) => {
    const a = document.createElement('a');
    a.href = url;
    if (fileName) a.setAttribute('download', fileName);
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const PKG_FALLBACK = 'https://jx.7fa4.cn:9080/zsq/7fa4-chat/-/packages';

  const doDirectDownload = () => {
    const os = detectOs();
    const run = (data) => {
      const art = pickArtifact(os, data);
      if (art) triggerDownload(art.url, art.file_name);
      else window.open(PKG_FALLBACK, '_blank', 'noopener');
    };
    if (downloads) run(downloads);
    else GitLabAPI.fetchDownloads().then(run).catch(() => window.open(PKG_FALLBACK, '_blank', 'noopener'));
  };

  $('#detectOsBtn').addEventListener('click', (e) => {
    e.preventDefault();
    doDirectDownload();
  });

  setLoading('downloadGrid', true);
  setLoading('versionsList', true);
  $('#changelogList').innerHTML = '<div class="loading"><span></span><span></span><span></span></div>';

  GitLabAPI.fetchDownloads()
    .then((data) => {
      downloads = data;
      const latest = data.versions?.[0];
      if (latest) {
        $('#heroVersion').textContent = latest.version;
        $('#statReleases').textContent = data.versions.length;
        $('#dlVersion').textContent = `v${latest.version}`;
        $('#dlDate').textContent = `发布于 ${fmtDate(latest.created_at)}`;
        activeOs = detected;
        $$('#osSwitch .os-btn').forEach((b) => b.classList.toggle('active', b.dataset.os === activeOs));
      }
      if (data.project?.web_url) $('#footerRepo').href = data.project.web_url;
      if (data.project?.issues_url) $('#faqIssues').href = data.project.issues_url;
      renderDownloadGrid();
      renderAllVersions();
    })
    .catch((e) => {
      console.warn('fetchDownloads failed', e);
      $('#downloadGrid').innerHTML = `<p class="muted">下载列表加载失败（${escapeHtml(e.message)}）。可前往 <a class="link" href="https://jx.7fa4.cn:9080/zsq/7fa4-chat/-/packages" target="_blank" rel="noopener">GitLab 包仓库</a> 直接获取。</p>`;
      $('#versionsList').innerHTML = '';
      $('#footerRepo').href = 'https://jx.7fa4.cn:9080/zsq/7fa4-chat';
      $('#faqIssues').href = 'https://jx.7fa4.cn:9080/zsq/7fa4-chat/-/issues';
    });

  /* ---------- changelog (live from GitLab) ---------- */
  const CL_VISIBLE = 3;
  GitLabAPI.fetchChangelog()
    .then((entries) => {
      const list = entries || [];
      const html = list.map((e, i) => `
        <article class="cl-entry glass${i >= CL_VISIBLE ? ' cl-extra cl-hidden' : ''}">
          <div class="cl-version"><h3>v${escapeHtml(e.version)}</h3></div>
          <ul class="cl-list">
            ${e.items.map((it) => `
              <li class="cl-item">
                ${it.tag ? `<span class="cl-tag ${it.tag}">${escapeHtml(it.tagLabel)}</span>` : '<span class="cl-tag" style="visibility:hidden"></span>'}
                <span class="cl-body">${it.body}</span>
              </li>`).join('')}
          </ul>
        </article>`).join('');
      const toggle = list.length > CL_VISIBLE
        ? `<button type="button" class="cl-toggle btn btn-ghost" id="clToggle">查看全部 ${list.length} 条更新 <i class="fa-solid fa-angle-down"></i></button>`
        : '';
      $('#changelogList').innerHTML = html + toggle;
      const btn = $('#clToggle');
      if (btn) {
        btn.addEventListener('click', () => {
          const extra = $$('.cl-entry.cl-extra', $('#changelogList'));
          const expanded = btn.dataset.expanded === '1';
          if (expanded) {
            extra.forEach((el) => el.classList.add('cl-hidden'));
            btn.dataset.expanded = '0';
            btn.innerHTML = `查看全部 ${list.length} 条更新 <i class="fa-solid fa-angle-down"></i>`;
          } else {
            extra.forEach((el) => el.classList.remove('cl-hidden'));
            btn.dataset.expanded = '1';
            btn.innerHTML = `收起 <i class="fa-solid fa-angle-up"></i>`;
          }
        });
      }
      revealObserve();
    })
    .catch((e) => {
      console.warn('fetchChangelog failed', e);
      $('#changelogList').innerHTML = '<p class="muted">更新日志加载失败。</p>';
    });

  /* ---------- scroll reveal ---------- */
  let revealObserve = () => {};
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          const delay = en.target.dataset.delay || 0;
          setTimeout(() => en.target.classList.add('in'), delay);
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealObserve = () => $$('.reveal:not(.in)').forEach((el) => io.observe(el));
    revealObserve();
  } else {
    $$('.reveal').forEach((el) => el.classList.add('in'));
  }
})();
