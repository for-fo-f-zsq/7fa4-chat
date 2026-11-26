export function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function detectPlatform() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'android';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macos';
  if (/Win(dows|64|32)/i.test(ua)) return 'windows';
  if (/Linux/i.test(ua)) return 'linux';
  return null;
}

export function parseChangelog(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const releases = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h2 = /^##\s+(.+)$/.exec(line);
    if (h2) {
      current = { version: h2[1].trim(), brief: '', items: [], sections: [] };
      releases.push(current);
      continue;
    }
    if (!current) continue;
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      const text = bullet[1].trim();
      if (!current.brief) current.brief = text.replace(/`/g, '').replace(/\*\*/g, '');
      current.items.push(text);
      continue;
    }
    const h3 = /^###\s+(.+)$/.exec(line);
    if (h3) {
      current.sections.push(h3[1].trim());
    }
  }
  return releases;
}

export function amountValue(s) {
  const m = /([0-9]+(?:\.[0-9]+)?)/.exec(String(s || ''));
  return m ? parseFloat(m[1]) : 0;
}

export function handlePointerSpotlight(e) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
  el.style.setProperty('--my', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
}
