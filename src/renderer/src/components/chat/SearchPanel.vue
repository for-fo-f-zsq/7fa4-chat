<template>
  <Transition name="fade-down">
    <div class="search-panel" v-if="visible">
      <div class="search-bar">
        <div class="search-field">
          <label class="search-label">关键词</label>
          <UiSearchInput ref="searchInputRef" v-model="query" class="search-input" placeholder="搜索消息..." size="sm" />
        </div>

        <div class="search-field">
          <label class="search-label">范围</label>
          <UiDropdown v-model="searchScope" :options="SCOPE_OPTIONS" size="sm" autoWidth />
        </div>

        <div class="search-field" v-if="isGroup && searchScope === 'current' && senderCandidates.length">
          <label class="search-label">发送者</label>
          <UiDropdown
            v-model="senderFilter"
            :options="senderOptions"
            size="sm"
            searchable
            autoWidth
            :minPanelWidth="160"
          />
        </div>

        <div class="search-field">
          <label class="search-label">类型</label>
          <UiDropdown v-model="msgTypeFilter" :options="TYPE_OPTIONS" size="sm" autoWidth />
        </div>

        <div class="search-field">
          <label class="search-label">起始日期</label>
          <UiInput class="search-date" type="date" v-model="dateAfter" size="sm" />
        </div>

        <div class="search-field">
          <label class="search-label">结束日期</label>
          <UiInput class="search-date" type="date" v-model="dateBefore" size="sm" />
        </div>

        <UiIconButton class="search-close-btn" icon="fas fa-times" aria-label="关闭搜索" size="sm" @click="$emit('close')" />
      </div>

      <div class="search-results" v-if="hasFilter && pagedResults.length">
        <div class="search-results-header">找到 {{ results.length }} 条消息</div>
        <div
          v-for="msg in pagedResults"
          :key="msg.id"
          class="search-result-item"
          @click="onJump(msg)"
        >
          <span class="search-result-sender" v-if="searchScope === 'all'">[{{ getConvoName(msg) }}] </span>
          <span class="search-result-sender">{{ displayName(msgSenderUser(msg)) }}</span>
          <span class="search-result-content" v-html="resultPreview(msg)"></span>
          <span class="search-result-time u-tabular-nums">{{ gettime2(msg.send_time) }}</span>
        </div>
        <UiButton
          v-if="results.length > resultLimit"
          class="search-more-btn"
          variant="text"
          size="sm"
          block
          @click="resultLimit += 50"
        >查看更多 ({{ results.length - resultLimit }} 条)</UiButton>
      </div>
      <div class="search-results" v-else-if="hasFilter && !results.length">
        <div class="search-results-header">无匹配结果</div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { store } from '../../store.js'
import { displayName, gettime2 } from '../../utils.js'
import { UiButton, UiDropdown, UiIconButton, UiInput, UiSearchInput } from '@/ui'
import { useMessageSearch } from '../../composables/chat/useMessageSearch.js'

const SCOPE_OPTIONS = [
  { value: 'current', label: '当前会话' },
  { value: 'all', label: '全部会话' },
]

const TYPE_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'text', label: '文本' },
  { value: 'file', label: '文件' },
  { value: 'emoji', label: '表情' },
]

const props = defineProps({
  visible: Boolean,
  pageType: String,
  pageId: [String, Number],
  messages: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'jump'])

const searchInputRef = ref(null)

const {
  query, senderFilter, msgTypeFilter, dateAfter, dateBefore, searchScope, resultLimit,
  isGroup, hasFilter, senderCandidates, senderOptions, results, pagedResults,
  resultPreview, getConvoName, resetFilters,
} = useMessageSearch({
  pageType: () => props.pageType,
  pageId: () => props.pageId,
  messages: () => props.messages,
})

function msgSenderUser(msg) {
  return store.users?.[msg.sender] || { uid: msg.sender }
}

function onJump(msg) {
  if (searchScope.value === 'all' && msg._convoType && msg._convoId) {
    emit('jump', { msgId: msg.id, convoType: msg._convoType, convoId: msg._convoId })
  } else {
    emit('jump', msg.id)
  }
}

function focusInput() {
  searchInputRef.value?.focus()
}

watch(() => props.visible, (v) => {
  if (v) nextTick(focusInput)
  else resetFilters()
})

defineExpose({ focusInput })
</script>

<style scoped src="../../css/components/search-panel.css"></style>
