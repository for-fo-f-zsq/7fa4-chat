<template>
  <div v-if="visible" class="update-prompt" role="alert">
    <i class="fas fa-arrow-circle-up update-prompt-icon"></i>
    <div class="update-prompt-text">
      <div class="update-prompt-title">发现新版本 v{{ store.update.latest }}</div>
      <div class="update-prompt-sub">刷新页面即可升级到最新版</div>
    </div>
    <div class="update-prompt-actions">
      <button class="update-prompt-btn" @click="refresh">刷新升级</button>
      <button class="update-prompt-close" title="本次不再提示（出现更新的版本会再次提示）" @click="dismiss">
        <i class="fas fa-times"></i>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { store } from '../store.js'
import { isWebBrowser, reloadForUpdate } from '../utils.js'

// 网页端专有的「提示刷新升级」：
// 纯浏览器没有自动更新通道，唯一能做的就是重载页面拉取新构建；桌面端由 electron-updater
// 自己更新、安卓端走 APK 安装包（两者都有各自的「版本更新」面板），所以这里只服务网页端。
const DISMISS_KEY = '7fa4_update_prompt_dismissed'
const dismissed = ref(readDismissed())

function readDismissed() {
  // 会话级忽略：换标签页/重开浏览器会重新提示，但不落盘（新版本会再次弹出）
  try { return sessionStorage.getItem(DISMISS_KEY) || '' } catch { return '' }
}

const visible = computed(() => isWebBrowser()
  && store.update.hasUpdate
  && !!store.update.latest
  && dismissed.value !== store.update.latest)

function dismiss() {
  dismissed.value = store.update.latest || '1'
  try { sessionStorage.setItem(DISMISS_KEY, dismissed.value) } catch {}
}

function refresh() {
  reloadForUpdate()
}
</script>

<style scoped>
/* 顶部居中悬浮卡片：底部是输入框、右侧是悬浮工具，只有顶部这条带是空的 */
.update-prompt {
  position: fixed;
  top: 44px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1200;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(92vw, 480px);
  padding: 9px 10px 9px 14px;
  background: var(--bg-action-panel);
  border: 1px solid var(--accent-outline);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-dropdown);
  color: var(--text-primary);
  font-size: var(--font-size-small);
  animation: update-prompt-in 0.28s ease-out;
}
.update-prompt-icon {
  flex: 0 0 auto;
  color: var(--accent);
  font-size: 17px;
}
.update-prompt-text { flex: 1 1 auto; min-width: 0; }
.update-prompt-title {
  font-size: var(--font-size-base);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.update-prompt-sub {
  margin-top: 1px;
  color: var(--text-secondary);
}
.update-prompt-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 2px;
}
.update-prompt-btn {
  flex: 0 0 auto;
  padding: 5px 14px;
  border: none;
  border-radius: 14px;
  background: var(--accent);
  color: var(--text-on-accent);
  font-size: var(--font-size-small);
  cursor: pointer;
  transition: background var(--duration-fast) ease;
}
.update-prompt-btn:hover { background: var(--accent-hover); }
.update-prompt-btn:active { background: var(--accent-active); transform: translateY(1px); }
.update-prompt-close {
  flex: 0 0 auto;
  padding: 2px 6px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.update-prompt-close:hover { color: var(--text-primary); }
@keyframes update-prompt-in {
  from { opacity: 0; transform: translate(-50%, -14px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
/* 窄屏（手机浏览器）：挤成一行会把版本号截断成「发现新版…」→ 按钮整体换到第二行，
   卡片改为左右贴边撑满（用 left/right 而不是 width，跟全局 box-sizing 无关，最稳）。 */
@media (max-width: 480px) {
  .update-prompt {
    left: 12px;
    right: 12px;
    width: auto;
    max-width: none;
    transform: none;
    flex-wrap: wrap;
    row-gap: 8px;
    animation-name: update-prompt-in-narrow;
  }
  .update-prompt-actions {
    flex: 1 1 100%;
    justify-content: flex-end;
  }
}
@keyframes update-prompt-in-narrow {
  from { opacity: 0; transform: translateY(-14px); }
  to { opacity: 1; transform: none; }
}
</style>
