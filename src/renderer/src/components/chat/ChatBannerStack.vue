<template>
  <!-- 顶部浮层横幅层：绝对定位脱离布局流，出现/关闭均不改变列表与会话区尺寸 -->
  <TransitionGroup name="toast" tag="div" class="banner-stack">
    <UiBanner
      v-if="logined && serverNotice && !serverNoticeMuted"
      key="server-notice"
      class="network-banner"
      variant="danger"
      closable
      @close="emit('update:serverNoticeMuted', true)"
    >
      <template #icon><i class="fas fa-comment-slash" aria-hidden="true"></i></template>
      {{ serverNotice }}
    </UiBanner>
    <UiBanner
      v-if="logined && netError && !netBannerMuted"
      key="net-error"
      class="network-banner"
      variant="danger"
      closable
      @close="emit('update:netBannerMuted', true)"
    >
      <template #icon><i class="fas fa-wifi" aria-hidden="true"></i></template>
      未连接<template v-if="netDownText">，已断线 <span class="u-tabular-nums">{{ netDownText }}</span></template>，正在尝试重新连接…
      <template #action>
        <UiButton class="banner-login-btn" variant="ghost" size="sm" @click="emit('relogin')">重新登录</UiButton>
      </template>
    </UiBanner>
    <UiBanner
      v-if="!logined && !guestBannerMuted"
      key="guest-banner"
      class="network-banner"
      variant="warning"
      closable
      @close="emit('update:guestBannerMuted', true)"
    >
      <template #icon><i class="fas fa-user-lock" aria-hidden="true"></i></template>
      您还未登录，聊天暂不可用。
      <template #action>
        <UiButton class="banner-login-btn" variant="ghost" size="sm" @click="emit('gotoLogin')">去登录</UiButton>
      </template>
    </UiBanner>
  </TransitionGroup>
</template>

<script setup>
import { UiBanner, UiButton } from '@/ui'

defineProps({
  logined: { type: Boolean, default: false },
  netError: { type: Boolean, default: false },
  netDownText: { type: String, default: '' },
  netBannerMuted: { type: Boolean, default: false },
  serverNotice: { type: String, default: '' },
  serverNoticeMuted: { type: Boolean, default: false },
  guestBannerMuted: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:netBannerMuted',
  'update:serverNoticeMuted',
  'update:guestBannerMuted',
  'relogin',
  'gotoLogin',
])
</script>

<style scoped>
.banner-stack {
  position: absolute;
  top: 40px;
  left: 0;
  right: 0;
  z-index: var(--z-float);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  pointer-events: none;
}

body.web .banner-stack {
  top: var(--space-2);
}

/* 性能：这是聊天页最后一块「常驻 + 浮在滚动内容之上」的玻璃。
   它绝对定位在消息列表上方，列表每滚一帧它背后的 backdrop 都在变，blur 就得整块重新采样。
   去玻璃 → 不透明 --surface-raised：它正是旧 --surface-glass 的底色来源（86% of surface-raised），
   去掉透明度后色相零漂移，danger/warning 两个 12%/14% 混色结果与原来肉眼一致；
   层间分离改由「28% 动作色描边（见上）+ --elev-2 投影」承担，不靠模糊。
   对比度：横幅正文用 --status-danger-ink / --status-warning-ink（tokens.css §6/@supports 里
   已按主题明暗自适应的墨色），落在「12–14% 状态色 + 不透明 raised 底」上，与原来的半透底
   完全同源，因此 6 套主题都不需要新增覆盖。 */
.banner-stack .network-banner.ui-banner {
  pointer-events: auto;
  width: fit-content;
  max-width: min(560px, calc(100% - 2 * var(--space-6)));
  border-radius: var(--radius-pill);
  border: var(--border-width) solid color-mix(in srgb, var(--banner-action-fg) 28%, var(--line-hairline));
  box-shadow: var(--elev-2);
  padding: var(--space-2) var(--space-3);
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  font-size: var(--text-sm);
  background: var(--surface-raised);
}

.network-banner.ui-banner--danger {
  --banner-action-fg: var(--status-danger-ink);
  background: color-mix(in srgb, var(--status-danger) 12%, var(--surface-raised));
}

.network-banner.ui-banner--warning {
  --banner-action-fg: var(--status-warning-ink);
  background: color-mix(in srgb, var(--status-warning) 14%, var(--surface-raised));
}

.network-banner.ui-banner--danger :deep(.ui-banner-desc) {
  color: var(--status-danger-ink);
}

.network-banner.ui-banner--warning :deep(.ui-banner-desc) {
  color: var(--status-warning-ink);
}

.network-banner .banner-login-btn.ui-btn {
  margin-left: var(--space-2);
  --btn-radius: var(--radius-pill);
  --btn-fg: var(--banner-action-fg);
  --btn-bg: color-mix(in srgb, var(--banner-action-fg) 16%, transparent);
  --btn-border: color-mix(in srgb, var(--banner-action-fg) 40%, transparent);
  --btn-hover-bg: color-mix(in srgb, var(--banner-action-fg) 26%, transparent);
  --btn-hover-fg: var(--banner-action-fg);
}
</style>
