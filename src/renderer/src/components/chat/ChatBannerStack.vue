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
  background: var(--surface-glass);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
}

.network-banner.ui-banner--danger {
  --banner-action-fg: var(--status-danger-ink);
  background: color-mix(in srgb, var(--status-danger) 12%, var(--surface-glass));
}

.network-banner.ui-banner--warning {
  --banner-action-fg: var(--status-warning-ink);
  background: color-mix(in srgb, var(--status-warning) 14%, var(--surface-glass));
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
