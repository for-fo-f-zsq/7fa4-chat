// ========== 更新日志 Markdown → HTML（结构固定：## 版本 + - 条目，渲染逻辑保持极简） ==========
// 标签「新功能 / 优化 / 修复 / 通知」渲染为带样式的 change-tag，其余文本原样转义输出。
const TAG_CLASS = { 新功能: 'new', 优化: 'improve', 修复: 'fix', 通知: 'notice' };

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

export function renderChangelogMarkdown(markdown) {
  if (!markdown) return '';
  const out = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (const rawLine of String(markdown).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      closeList();
      out.push(`<h2>${escapeHtml(heading[1])}</h2>`);
      continue;
    }

    const item = line.match(/^[-*]\s+(.+)$/);
    if (item) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      const tag = item[1].match(/^(新功能|优化|修复|通知)[：:]\s*(.*)$/);
      if (tag) {
        out.push(`<li><span class="change-tag ${TAG_CLASS[tag[1]]}">${tag[1]}</span>${escapeHtml(tag[2])}</li>`);
      } else {
        out.push(`<li>${escapeHtml(item[1])}</li>`);
      }
      continue;
    }

    closeList();
    out.push(`<p>${escapeHtml(line)}</p>`);
  }

  closeList();
  return out.join('');
}
