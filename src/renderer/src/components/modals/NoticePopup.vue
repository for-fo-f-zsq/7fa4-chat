<template>
  <Transition name="toast">
    <aside
      v-if="visible && currentPopupNotice"
      class="notice-popup-wrap"
      :class="{ 'is-narrow': narrow }"
      role="alertdialog"
      aria-live="assertive"
      aria-label="系统通知"
    >
      <div class="notice-popup-card">
        <div class="notice-popup-head">
          <span class="notice-popup-icon" aria-hidden="true">
            <i class="fas fa-bell"></i>
          </span>
          <div class="notice-popup-title-wrap">
            <span class="notice-popup-title">系统通知</span>
            <span
              v-if="currentPopupNotice.date"
              class="notice-popup-time u-tabular-nums"
              :title="fullTimeText"
            >
              {{ relTimeText }}
            </span>
          </div>
          <div class="notice-popup-head-actions">
            <UiBadge v-if="unNoticedList.length > 1" size="sm" variant="brand" class="u-tabular-nums">
              待确认 {{ unNoticedList.length }}
            </UiBadge>
            <UiIconButton
              icon="fas fa-list-ul"
              size="sm"
              variant="ghost"
              aria-label="打开通知列表"
              title="打开通知列表"
              @click="openNoticeModal"
            />
          </div>
        </div>

        <div class="notice-popup-body">
          <template v-for="(seg, idx) in bodySegments" :key="idx">
            <a
              v-if="seg.type === 'link'"
              :href="seg.url"
              class="notice-popup-link"
              @click.prevent="openNoticeJumpUrl(seg.url)"
            >
              {{ seg.text }}
            </a>
            <template v-else>{{ seg.text }}</template>
          </template>
        </div>

        <div v-if="noticeState.error" class="notice-popup-error">
          {{ noticeState.error }}
        </div>

        <div class="notice-popup-footer">
          <span class="notice-popup-hint">需手动点击确认关闭</span>
          <div class="notice-popup-btns">
            <UiButton
              v-if="jumpHref"
              size="sm"
              variant="secondary"
              icon="fas fa-external-link-alt"
              @click="openNoticeJumpUrl(currentPopupNotice.jump_url)"
            >
              查看页面
            </UiButton>
            <UiButton
              size="sm"
              variant="primary"
              icon="fas fa-check"
              :loading="isPending(currentPopupNotice.id, 'noticed')"
              @click="onConfirm"
            >
              已读 / 确认
            </UiButton>
          </div>
        </div>
      </div>
    </aside>
  </Transition>
</template>

<script setup>
import { computed } from 'vue'
import { UiBadge, UiButton, UiIconButton } from '@/ui'
import { gettime1, gettime2 } from '../../utils/format.js'
import { useNotices } from '../../composables/chat/useNotices.js'

defineProps({
  visible: { type: Boolean, default: false },
  narrow: { type: Boolean, default: false },
})

const {
  noticeState,
  unNoticedList,
  currentPopupNotice,
  isPending,
  confirmNoticed,
  openNoticeModal,
  openNoticeJumpUrl,
  formatNoticeSegments,
  getNoticeJumpHref,
} = useNotices()

const bodySegments = computed(() =>
  currentPopupNotice.value ? formatNoticeSegments(currentPopupNotice.value.notice_text) : [],
)
const jumpHref = computed(() =>
  currentPopupNotice.value ? getNoticeJumpHref(currentPopupNotice.value.jump_url) : '',
)
const relTimeText = computed(() =>
  currentPopupNotice.value?.date ? gettime1(currentPopupNotice.value.date) : '',
)
const fullTimeText = computed(() =>
  currentPopupNotice.value?.date ? gettime2(currentPopupNotice.value.date) : '',
)

async function onConfirm() {
  const cur = currentPopupNotice.value
  if (!cur) return
  await confirmNoticed(cur.id)
}
</script>

<style scoped src="../../css/components/notice-popup.css"></style>
