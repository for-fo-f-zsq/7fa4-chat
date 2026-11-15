<template>
  <div class="changelog-viewer">
    <div v-if="loading" class="changelog-loading">
      <UiSpinner size="sm" label="加载更新日志中" /> 加载中...
    </div>
    <UiBanner v-else-if="error" variant="danger" :description="error" />
    <div v-else-if="html" class="changelog-body" v-html="html"></div>
    <UiEmptyState v-else size="sm" icon="fa-inbox" title="暂无更新日志" />
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { renderChangelogMarkdown } from '../../changelog-md.js'
import { UiBanner, UiEmptyState, UiSpinner } from '@/ui'

const props = defineProps({
  autoLoad: { type: Boolean, default: true },
  fallbackMarkdown: { type: String, default: '' },
  preferLocal: { type: Boolean, default: false },
})

const loading = ref(false)
const error = ref('')
const html = ref('')

async function load() {
  if (loading.value || html.value) return
  if (props.preferLocal && props.fallbackMarkdown) {
    html.value = renderChangelogMarkdown(props.fallbackMarkdown)
    return
  }
  loading.value = true
  error.value = ''
  try {
    const result = await window.api.fetchChangelog()
    if (result.success) {
      html.value = renderChangelogMarkdown(result.markdown)
    } else if (props.fallbackMarkdown) {
      html.value = renderChangelogMarkdown(props.fallbackMarkdown)
    } else {
      error.value = result.error || '获取失败'
    }
  } catch (e) {
    if (props.fallbackMarkdown) {
      html.value = renderChangelogMarkdown(props.fallbackMarkdown)
    } else {
      error.value = e.message || '网络错误'
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (props.autoLoad) load()
})

watch(
  () => props.autoLoad,
  (v) => {
    if (v) load()
  },
)

defineExpose({ load })
</script>

<style scoped src="../../css/components/changelog-viewer.css"></style>
