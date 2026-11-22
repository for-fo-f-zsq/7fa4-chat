<template>
  <Transition name="toast">
    <aside
      v-if="showPopup"
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
            <span class="notice-popup-title">未读通知</span>
            <span
              v-if="currentPopupNotice.date"
              class="notice-popup-time u-tabular-nums"
              :title="fullTimeText"
            >
              {{ relTimeText }}
            </span>
          </div>
          <div class="notice-popup-head-actions">
            <UiBadge v-if="currentPopupNotice._isTest" size="sm" variant="warning">测试</UiBadge>
            <UiBadge v-if="unNoticedList.length > 1" size="sm" variant="brand" class="u-tabular-nums">
              还有 {{ unNoticedList.length }} 条
            </UiBadge>
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
          <span class="notice-popup-hint">不定时关闭，请手动确认</span>
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
              :loading="isPending(currentPopupNotice.id)"
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
import { UiBadge, UiButton } from '@/ui'
import { store } from '../../store.js'
import { gettime1, gettime2 } from '../../utils/format.js'
import { useNotices } from '../../composables/chat/useNotices.js'

defineProps({
  narrow: { type: Boolean, default: false },
})

const {
  noticeState,
  unNoticedList,
  currentPopupNotice,
  isPending,
  confirmNoticed,
  openNoticeJumpUrl,
  formatNoticeSegments,
  getNoticeJumpHref,
} = useNotices()

const showPopup = computed(() =>
  Boolean(currentPopupNotice.value && (store.logined || currentPopupNotice.value._isTest)),
)
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
