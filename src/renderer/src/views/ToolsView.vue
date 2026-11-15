<template>
  <PanelShell title="工具" icon="fas fa-toolbox" :scrollable="false">
    <template #header-actions>
      <span
        v-if="updatedAtText"
        class="tools-updated u-tabular-nums"
        :title="manifestBuiltAtText ? '远端清单构建于 ' + manifestBuiltAtText : ''"
      >
        更新于 {{ updatedAtText }}
      </span>
      <UiButton
        v-if="batchRunning || batchActionable"
        variant="soft"
        size="sm"
        :loading="batchRunning"
        :disabled="batchRunning || loading"
        :title="batchTitle"
        icon="fas fa-download"
        @click="batchInstall"
      >
        {{ batchLabel }}
      </UiButton>
      <UiButton
        variant="secondary"
        size="sm"
        :loading="loading"
        :disabled="loading"
        title="刷新工具列表"
        icon="fas fa-rotate-right"
        @click="() => load()"
      >
        {{ loading ? '刷新中' : '刷新' }}
      </UiButton>
    </template>

    <div class="tools-body">
      <UiBanner v-if="errorText" variant="danger" class="tools-error-bar">
        <template #default>{{ errorText }}</template>
        <template #action>
          <UiButton v-if="canRetry" variant="ghost" size="sm" @click="() => load()">重试</UiButton>
          <UiButton v-else variant="ghost" size="sm" @click="dismissError">关闭</UiButton>
        </template>
      </UiBanner>

      <div v-if="loading && remoteCards.length === 0 && !errorText" class="tools-loading">
        <UiSpinner size="md" />
        <span>正在获取工具列表…</span>
      </div>

      <TransitionGroup v-else-if="remoteCards.length > 0" tag="div" name="list" class="tools-grid motion-stagger" appear>
        <ToolCard
          v-for="card in remoteCards"
          :key="'remote-' + card.id"
          :card="card"
          @install="installTool"
          @open="openRemote"
          @remove="removeTool"
        />
      </TransitionGroup>

      <UiEmptyState
        v-else
        class="tools-empty"
        icon="fas fa-box-open"
        title="暂无可用工具"
        description="工具需要联网获取：请检查网络后点右上角「刷新」重试。"
      />
    </div>
  </PanelShell>
</template>

<script setup>
import { UiBanner, UiButton, UiEmptyState, UiSpinner } from '@/ui'
import PanelShell from '@/components/common/PanelShell.vue'
import ToolCard from '@/components/tools/ToolCard.vue'
import { useToolsManager } from '@/composables/modals/useToolsManager.js'

const emit = defineEmits(['openTool'])

const {
  loading,
  errorText,
  canRetry,
  remoteCards,
  updatedAtText,
  manifestBuiltAtText,
  batchRunning,
  batchActionable,
  batchLabel,
  batchTitle,
  load,
  installTool,
  removeTool,
  openRemote,
  batchInstall,
  dismissError,
} = useToolsManager((payload) => emit('openTool', payload))
</script>

<style src="../css/components/tools.css"></style>
