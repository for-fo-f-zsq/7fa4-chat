<template>
  <UiCard :interactive="!card.blocked" class="tool-card" :class="{ 'is-disabled': card.blocked }">
    <div class="tool-card-top">
      <div class="tool-card-icon-wrap" aria-hidden="true">
        <i class="tool-card-icon" :class="toolIcon(card)"></i>
      </div>
      <UiBadge class="tool-card-status" size="sm" :variant="statusVariant">
        {{ statusText(card.state) }}
      </UiBadge>
    </div>

    <div class="tool-card-info">
      <div class="tool-card-name" :title="card.name || card.id">{{ card.name || card.id }}</div>
      <div class="tool-card-desc u-line-clamp-2">{{ card.desc || '远端工具' }}</div>
    </div>

    <div class="tool-card-meta u-tabular-nums">
      <span class="tool-meta-inline">
        <span>v{{ card.version || '?' }}</span>
        <template v-if="formatSize(card.size)">
          <span class="tool-meta-sep" aria-hidden="true">·</span>
          <span>{{ formatSize(card.size) }}</span>
        </template>
      </span>
      <span v-if="card.state === 'outdated' && card.installedInfo" class="tool-meta-outdated">
        已装 v{{ card.installedInfo.version || '?' }}
      </span>
    </div>

    <div v-if="card.progress" class="tool-progress-block">
      <UiProgress
        class="tool-progress"
        size="sm"
        :value="progressPercent(card)"
        :label="'下载进度 ' + progressPercent(card) + '%'"
      />
      <div class="tool-progress-text u-tabular-nums">
        <span class="u-ellipsis">{{ progressFile(card) }}</span>
        <span>{{ progressPercent(card) }}%</span>
      </div>
    </div>

    <div v-if="card.blocked" class="tool-blocked-hint">
      <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
      <span>需要应用版本 ≥ v{{ card.minAppVersion }}</span>
    </div>

    <template #footer>
      <div class="tool-card-footer">
        <UiButton v-if="card.blocked" size="sm" variant="secondary" disabled>请先更新应用</UiButton>

        <UiButton v-else-if="card.state === 'downloading'" size="sm" variant="soft" disabled>
          {{ card.busy === 'install' ? '安装中…' : '下载中…' }}
        </UiButton>

        <UiButton
          v-else-if="card.state === 'not-installed'"
          variant="primary"
          size="sm"
          icon="fas fa-download"
          class="tool-install-btn"
          :disabled="!!card.busy"
          @click="emit('install', card)"
        >
          {{ card.busy === 'install' ? '安装中…' : '获取工具' }}
        </UiButton>

        <template v-else>
          <UiButton
            v-if="card.state === 'outdated'"
            variant="primary"
            size="sm"
            icon="fas fa-download"
            :disabled="!!card.busy"
            @click="emit('install', card)"
          >
            {{ card.busy === 'install' ? '更新中…' : '更新' }}
          </UiButton>
          <UiButton
            :variant="card.state === 'outdated' ? 'secondary' : 'soft'"
            size="sm"
            class="tool-open-btn"
            :disabled="!!card.busy"
            @click="emit('open', card)"
          >
            {{ card.busy === 'open' ? '打开中…' : '打开' }}
            <template #trailing>
              <i class="fas fa-arrow-right tool-open-arrow" aria-hidden="true"></i>
            </template>
          </UiButton>
          <UiButton
            variant="ghost"
            size="sm"
            icon="fas fa-trash"
            class="tool-remove-btn"
            :disabled="!!card.busy"
            @click="emit('remove', card)"
          >
            卸载
          </UiButton>
        </template>
      </div>
    </template>
  </UiCard>
</template>

<script setup>
import { computed } from 'vue'
import { UiBadge, UiButton, UiCard, UiProgress } from '@/ui'
import { formatSize } from '@/utils.js'
import { progressFile, progressPercent, statusText, toolIcon } from '@/composables/modals/useToolsManager.js'

const props = defineProps({
  card: { type: Object, required: true },
})

const emit = defineEmits(['install', 'open', 'remove'])

const statusVariant = computed(() => {
  if (props.card.blocked) return 'danger'
  if (props.card.state === 'outdated') return 'warning'
  if (props.card.state === 'installed') return 'success'
  if (props.card.state === 'downloading') return 'brand'
  return 'neutral'
})
</script>
