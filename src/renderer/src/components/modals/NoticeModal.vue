<template>
  <UiModal
    :open="noticeState.modalOpen"
    title="系统通知"
    size="md"
    @close="closeNoticeModal"
  >
    <div class="notice-modal-body">
      <div class="notice-modal-toolbar">
        <UiSegmented
          v-model="filterMode"
          size="sm"
          aria-label="筛选通知状态"
          :items="filterItems"
        />
        <div class="notice-modal-actions">
          <UiButton
            v-if="uncheckedCount > 0"
            size="sm"
            variant="secondary"
            icon="fas fa-check-double"
            :disabled="noticeState.loading"
            @click="markAllNoticesChecked"
          >
            全部已读
          </UiButton>
          <UiButton
            size="sm"
            variant="ghost"
            icon="fas fa-sync-alt"
            :loading="noticeState.loading"
            @click="fetchNotices({ silent: false })"
          >
            刷新
          </UiButton>
        </div>
      </div>

      <div v-if="noticeState.error" class="notice-modal-error">
        {{ noticeState.error }}
      </div>

      <div v-if="noticeState.loading && !notices.length" class="notice-loading-row">
        <UiSpinner size="sm" label="正在加载通知" />
        <span>正在加载通知…</span>
      </div>

      <UiEmptyState
        v-else-if="!filteredNotices.length"
        size="sm"
        icon="fas fa-bell-slash"
        :title="emptyTitle"
        :description="emptyDesc"
      />

      <div v-else class="notice-list">
        <article
          v-for="item in filteredNotices"
          :key="item.id"
          class="notice-item"
          :class="{ 'is-unread': !item.checked, 'is-checked': item.checked }"
        >
          <div class="notice-item-meta">
            <div class="notice-item-meta-left">
              <span v-if="!item.checked" class="notice-item-dot" aria-label="未读"></span>
              <span class="notice-item-id u-tabular-nums">#{{ item.id }}</span>
              <span
                v-if="item.date"
                class="notice-item-time u-tabular-nums"
                :title="gettime2(item.date)"
              >
                {{ gettime2(item.date) }} · {{ gettime1(item.date) }}
              </span>
            </div>
            <div class="notice-item-tags">
              <UiBadge v-if="!item.noticed" size="sm" variant="warning">待弹窗确认</UiBadge>
              <UiBadge size="sm" :variant="item.checked ? 'outline' : 'brand'">
                {{ item.checked ? '已读' : '未读' }}
              </UiBadge>
            </div>
          </div>

          <div class="notice-item-content">
            <template v-for="(seg, idx) in formatNoticeSegments(item.notice_text)" :key="idx">
              <a
                v-if="seg.type === 'link'"
                :href="seg.url"
                class="notice-item-link"
                @click.prevent="openNoticeJumpUrl(seg.url)"
              >
                {{ seg.text }}
              </a>
              <template v-else>{{ seg.text }}</template>
            </template>
          </div>

          <div class="notice-item-footer">
            <UiButton
              v-if="getNoticeJumpHref(item.jump_url)"
              size="sm"
              variant="ghost"
              icon="fas fa-external-link-alt"
              @click="openNoticeJumpUrl(item.jump_url)"
            >
              跳转页面
            </UiButton>
            <UiButton
              v-if="!item.noticed"
              size="sm"
              variant="secondary"
              icon="fas fa-check-circle"
              :loading="isPending(item.id, 'noticed')"
              @click="confirmNoticed(item.id)"
            >
              确认弹窗
            </UiButton>
            <UiButton
              v-if="!item.checked"
              size="sm"
              variant="primary"
              icon="fas fa-check"
              :loading="isPending(item.id, 'checked')"
              @click="markNoticeChecked(item.id, true)"
            >
              标记已读
            </UiButton>
            <UiButton
              v-else
              size="sm"
              variant="ghost"
              icon="fas fa-undo"
              :loading="isPending(item.id, 'checked')"
              @click="markNoticeChecked(item.id, false)"
            >
              标为未读
            </UiButton>
          </div>
        </article>
      </div>
    </div>
  </UiModal>
</template>

<script setup>
import { computed, ref } from 'vue'
import { UiBadge, UiButton, UiEmptyState, UiModal, UiSegmented, UiSpinner } from '@/ui'
import { gettime1, gettime2 } from '../../utils/format.js'
import { useNotices } from '../../composables/chat/useNotices.js'

const filterMode = ref('all')

const {
  noticeState,
  notices,
  uncheckedCount,
  isPending,
  fetchNotices,
  confirmNoticed,
  markNoticeChecked,
  markAllNoticesChecked,
  closeNoticeModal,
  openNoticeJumpUrl,
  formatNoticeSegments,
  getNoticeJumpHref,
} = useNotices()

const checkedCount = computed(() => notices.value.filter((n) => n.checked).length)

const filterItems = computed(() => [
  { value: 'all', label: `全部 (${notices.value.length})` },
  { value: 'unread', label: `未读 (${uncheckedCount.value})` },
  { value: 'read', label: `已读 (${checkedCount.value})` },
])

const filteredNotices = computed(() => {
  if (filterMode.value === 'unread') return notices.value.filter((n) => !n.checked)
  if (filterMode.value === 'read') return notices.value.filter((n) => n.checked)
  return notices.value
})

const emptyTitle = computed(() => {
  if (filterMode.value === 'unread') return '暂无未读通知'
  if (filterMode.value === 'read') return '暂无已读通知'
  return '暂无系统通知'
})

const emptyDesc = computed(() =>
  filterMode.value === 'unread' ? '所有通知都已处理完毕' : '当 OJ 有新通知时会在此显示并弹窗提醒',
)
</script>

<style scoped src="../../css/components/notice-modal.css"></style>
