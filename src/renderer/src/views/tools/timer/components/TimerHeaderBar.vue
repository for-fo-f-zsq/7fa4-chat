<template>
  <div class="tm-header-right">
    <UiSegmented
      v-model="timer.layout"
      :items="layoutItems"
      size="sm"
      title="显示格数"
      aria-label="显示格数"
    />

    <UiIconButton
      size="sm"
      :icon="timer.soundOn ? 'fas fa-volume-high' : 'fas fa-volume-xmark'"
      :active="timer.soundOn"
      :title="timer.soundOn ? '提示音：开' : '提示音：关'"
      :aria-label="timer.soundOn ? '关闭提示音' : '开启提示音'"
      @click="timer.soundOn = !timer.soundOn"
    />

    <div v-if="timer.floatSupported" class="tm-float-group">
      <UiIconButton
        size="sm"
        icon="fas fa-window-restore"
        :active="timer.float.on"
        :title="timer.float.on ? '关闭计时器悬浮窗' : '打开计时器悬浮窗（置顶显示，随时瞄一眼）'"
        aria-label="计时器悬浮窗"
        @click="toggleFloat"
      />
      <UiPopover v-model:open="timer.floatPanelOpen" placement="bottom-end">
        <template #trigger>
          <UiIconButton
            size="sm"
            icon="fas fa-chevron-down"
            :active="timer.float.on"
            title="悬浮窗设置（位置 / 置顶）"
            aria-label="悬浮窗设置"
          />
        </template>
        <template #content>
          <div class="tm-float-pop">
            <div class="tm-float-title">计时器悬浮窗</div>
            <div class="tm-float-row">
              <span class="tm-float-label">位置</span>
              <div class="tm-float-pos">
                <UiButton
                  v-for="opt in FLOAT_POS"
                  :key="opt.key"
                  size="sm"
                  :variant="timer.float.pos === opt.key ? 'primary' : 'secondary'"
                  :title="opt.label"
                  @click="setFloatPos(opt.key)"
                >{{ opt.short }}</UiButton>
              </div>
            </div>
            <UiSwitch
              :model-value="timer.float.onTop"
              size="sm"
              label="窗口置顶"
              @update:model-value="timer.float.onTop = $event"
              @change="pushFloatConfig"
            />
            <p class="tm-float-tip">直接拖动悬浮窗可自由移动，位置会被记住；切换「位置」则回到预设角落。</p>
          </div>
        </template>
      </UiPopover>
    </div>
  </div>
</template>

<script setup>
import { UiButton, UiIconButton, UiPopover, UiSegmented, UiSwitch } from '@/ui'
import {
  timer,
  LAYOUTS,
  FLOAT_POS,
  toggleFloat,
  setFloatPos,
  pushFloatConfig
} from '../timerStore.js'

const layoutItems = LAYOUTS.map((n) => ({ value: n, label: `${n} 格` }))
</script>

<style scoped>
.tm-header-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.tm-float-group {
  display: flex;
  align-items: stretch;
  gap: 2px;
}

.tm-float-pop {
  width: 224px;
  color: var(--fg);
  text-align: left;
}

.tm-float-title {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  margin-bottom: var(--space-2);
  color: var(--fg);
}

.tm-float-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.tm-float-label {
  font-size: var(--text-sm);
  color: var(--fg-muted);
  flex-shrink: 0;
}

.tm-float-pos {
  display: flex;
  gap: var(--space-1);
  margin-left: auto;
}

.tm-float-tip {
  margin: var(--space-2) 0 0;
  font-size: var(--text-xs);
  line-height: var(--leading-normal);
  color: var(--fg-muted);
}
</style>
