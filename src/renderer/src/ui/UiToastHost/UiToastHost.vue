<template>
  <Teleport to="body">
    <!-- 常驻壳：live region 必须先进 DOM，之后插入的子节点才会被读屏播报 -->
    <div
      class="ui-toast-host"
      :class="`ui-toast-host--${position}`"
      role="region"
      aria-label="通知提示"
      aria-live="polite"
    >
      <TransitionGroup name="toast">
        <div
          v-for="item in toasts"
          :key="item.id"
          class="ui-toast"
          :class="[
            `ui-toast--${item.type}`,
            { 'is-persistent': !(item.duration > 0), 'is-inert': !item.dismissible }
          ]"
          @click="onToastClick(item)"
          @mouseenter="pauseToast(item.id)"
          @mouseleave="resumeToast(item.id)"
        >
          <i class="ui-toast__icon" :class="item.icon || iconClass(item.type)" aria-hidden="true"></i>

          <div class="ui-toast__body">
            <div v-if="item.title" class="ui-toast__title">{{ item.title }}</div>
            <div class="ui-toast__text">{{ item.message }}</div>
          </div>

          <span v-if="item.count > 1" class="ui-toast__count">×{{ item.count }}</span>

          <button
            v-if="item.action && item.action.label"
            type="button"
            class="ui-toast__action"
            @click.stop="runAction(item)"
          >
            {{ item.action.label }}
          </button>

          <button
            v-if="item.dismissible"
            type="button"
            class="ui-toast__close"
            aria-label="关闭"
            @click.stop="dismissToast(item.id)"
          >
            <i class="fas fa-xmark" aria-hidden="true"></i>
          </button>

          <!-- key 里带 revision：同 key 又弹一次时换 key 重挂节点，进度条动画才会从头跑 -->
          <span
            v-if="item.progress && item.duration > 0"
            :key="`progress-${item.id}-${item.revision}`"
            class="ui-toast__progress"
            :style="{ '--toast-duration': `${item.duration}ms` }"
            aria-hidden="true"
          ></span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import {
  dismissToast,
  pauseToast,
  registerToastHost,
  resumeToast,
  toastPosition,
  toasts
} from '../../composables/useToast.js'

defineOptions({ name: 'UiToastHost' })

const position = computed(() => toastPosition.value || 'top')

let unregister = null

onMounted(() => {
  // 注册后 composable 会清掉 document.body 上的兜底容器，避免同一条提示显示两份
  unregister = registerToastHost()
})

onBeforeUnmount(() => {
  if (unregister) unregister()
  unregister = null
})

function iconClass(type) {
  switch (type) {
    case 'success':
      return 'fas fa-circle-check'
    case 'warning':
      return 'fas fa-triangle-exclamation'
    case 'error':
      return 'fas fa-circle-xmark'
    default:
      return 'fas fa-circle-info'
  }
}

function onToastClick(item) {
  if (!item.dismissible) return
  dismissToast(item.id)
}

function runAction(item) {
  const action = item.action
  if (!action) return
  try {
    if (action.onClick) action.onClick(item.id)
  } catch {
    /* 业务回调抛错不该把提示条卡在屏幕上 */
  }
  // keepOpen=true 时留给调用方自己决定何时收起（比如打开一个面板）
  if (!action.keepOpen) dismissToast(item.id)
}
</script>

<style src="./UiToastHost.css"></style>
