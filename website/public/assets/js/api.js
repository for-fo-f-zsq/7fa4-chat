/* ============================================================
   7FA4 Chat — runtime data bridge.
   数据由服务器聚合服务（同域名 /changelog /version /download）提供，
   前端不再直连外部 GitLab，避免 Mixed Content 并隐藏 token。
   ============================================================ */
window.GitLabAPI = (() => {
  'use strict';

  async function getJson(url) {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
    return res.json();
  }

  async function fetchChangelog() {
    return getJson('/changelog');
  }

  async function fetchDownloads() {
    return getJson('/download');
  }

  // 项目元信息已并入 /download 的 project 字段
  async function fetchProjectMeta() {
    try {
      const d = await getJson('/download');
      return d.project || null;
    } catch {
      return null;
    }
  }

  return {
    BASE: '',
    API: '',
    PROJECT_ID: 663,
    fetchDownloads,
    fetchChangelog,
    fetchProjectMeta,
  };
})();
