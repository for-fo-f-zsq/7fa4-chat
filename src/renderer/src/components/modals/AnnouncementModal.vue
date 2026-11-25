<template>
  <UiModal :open="visible" size="lg" :show-close="false" aria-label="版本公告" @close="emit('close')">
    <Transition name="fade-left" mode="out-in">
      <div v-if="page === 0" key="welcome" class="announcement-page announcement-welcome">
        <div class="announcement-welcome-inner">
          <div class="announcement-badge">
            <i class="fas fa-star" aria-hidden="true"></i>
            <span>流畅度深度优化 · 界面与工具打磨</span>
          </div>

          <div class="announcement-logo-stage">
            <span class="announcement-aura" aria-hidden="true"></span>
            <div class="announcement-logo">
              <img :src="iconUrl" alt="7FA4 Chat" class="announcement-logo-img" />
            </div>
          </div>

          <h1 class="announcement-version u-tabular-nums">V{{ appVersion || '4.0.3' }}</h1>
          <p class="announcement-tagline">桌面端流畅度大幅提升，默认主题、聊天布局与窄屏工具体验全面优化</p>

          <div class="announcement-pillars motion-stagger">
            <div v-for="pillar in PILLARS" :key="pillar.label" class="announcement-pillar">
              <i :class="pillar.icon" aria-hidden="true"></i>
              <div class="announcement-pillar-text">
                <strong>{{ pillar.label }}</strong>
                <span>{{ pillar.sub }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="page === 1" key="update" class="announcement-page announcement-page--highlights">
        <div class="announcement-head">
          <h2><i class="fas fa-star" aria-hidden="true"></i> 本次更新亮点</h2>
          <p class="announcement-head-sub">从界面原语、表情系统到内置工具箱的全面重制</p>
        </div>

        <div class="announcement-scroll">
          <div class="announcement-grid motion-stagger">
            <article v-for="(item, idx) in HIGHLIGHTS" :key="idx" class="announcement-card">
              <div class="announcement-card-icon">
                <i :class="item.icon" aria-hidden="true"></i>
              </div>
              <div class="announcement-card-body">
                <div class="announcement-card-top">
                  <span class="announcement-card-tag">{{ item.tag }}</span>
                  <h3>{{ item.title }}</h3>
                </div>
                <p>{{ item.desc }}</p>
              </div>
            </article>
          </div>
        </div>
      </div>

      <div v-else-if="page === 2" key="changelog" class="announcement-page announcement-page--changelog">
        <div class="announcement-head">
          <h2><i class="fas fa-file-alt" aria-hidden="true"></i> 完整更新日志</h2>
          <p class="announcement-head-sub">V{{ appVersion || '4.0.3' }} 及历代版本变更详情</p>
        </div>
        <div class="announcement-changelog">
          <ChangelogViewer :auto-load="true" :prefer-local="true" :fallback-markdown="bundledChangelog" />
        </div>
      </div>

      <div v-else-if="page === 3" key="thanks" class="announcement-page announcement-thanks">
        <div class="announcement-head">
          <h2><i class="fas fa-heart" aria-hidden="true"></i> 喜欢这个全新的开始吗？</h2>
          <p class="announcement-head-sub">由 for_fo_f 独立开发维护，你的每一份赞赏与反馈都是持续打磨的动力</p>
        </div>

        <div class="announcement-thanks-grid" :class="{ 'is-solo': !sponsors.length }">
          <div class="announcement-donate-card">
            <DonateQrBox :src="donateSrc" :qr-error="qrError" compact @error="onQrImgError" />
            <p class="announcement-sign">— for_fo_f · 2026 —</p>
          </div>

          <div v-if="sponsors.length" class="announcement-sponsors">
            <div class="announcement-sponsor-head">
              <span class="announcement-sponsor-title">感谢以下赞助者</span>
              <span class="announcement-sponsor-count u-tabular-nums">{{ sponsors.length }} 人</span>
            </div>
            <div class="announcement-sponsor-scroll">
              <SponsorTable :sponsors="sponsors" :show-empty="false" />
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <template #footer>
      <div class="p-modal-footer p-modal-footer--between">
        <UiButton variant="text" size="sm" icon="fas fa-times" @click="emit('close')">跳过</UiButton>
        <StepDots :count="4" :current="page" centered />
        <div class="announcement-nav-right">
          <UiButton v-if="page > 0" variant="secondary" size="sm" icon="fas fa-chevron-left" @click="page--">上一页</UiButton>
          <UiButton v-if="page < 3" variant="primary" size="sm" @click="page++">
            下一页<template #trailing><i class="fas fa-chevron-right"></i></template>
          </UiButton>
          <UiButton v-else variant="primary" size="sm" @click="emit('close')">
            开启 V{{ appVersion || '4.0.1' }}<template #trailing><i class="fas fa-check"></i></template>
          </UiButton>
        </div>
      </div>
    </template>
  </UiModal>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import bundledChangelog from '../../../../../CHANGELOG?raw'
import { UiButton, UiModal } from '@/ui'
import { assetUrl } from '@/platform/asset-base.js'
import { useDonateQr } from '@/composables/modals/useDonateQr.js'
import ChangelogViewer from '@/components/common/ChangelogViewer.vue'
import DonateQrBox from '@/components/common/DonateQrBox.vue'
import SponsorTable from '@/components/common/SponsorTable.vue'
import StepDots from '@/components/common/StepDots.vue'

const PILLARS = [
  { icon: 'fas fa-tachometer-alt', label: '桌面端流畅提速', sub: '告别轮询与滚动卡顿' },
  { icon: 'fas fa-palette', label: '主题与布局微调', sub: '观感更协调 · 浅色发送' },
  { icon: 'fas fa-toolbox', label: '工具窄屏与体验', sub: '窄屏可用 · 下载即时刷新' },
  { icon: 'fas fa-check-circle', label: '列表与状态修复', sub: '排序 · 加载 · 状态提示' },
]

const HIGHLIGHTS = [
  {
    icon: 'fas fa-tachometer-alt',
    tag: '流畅度',
    title: '桌面端使用流畅度大幅提升',
    desc: '显著改善轮询、滚动消息与切换会话时的卡顿问题。',
  },
  {
    icon: 'fas fa-palette',
    tag: '界面微调',
    title: '默认主题配色与聊天区布局优化',
    desc: '微调默认主题配色深浅与饱和度，优化导航栏、会话列表与输入区布局。',
  },
  {
    icon: 'fas fa-toolbox',
    tag: '工具体验',
    title: '工具支持窄屏使用与下载状态修复',
    desc: '支持在窄窗口下使用工具，修复批量下载刷新不及时、GeoGebra 缩放异常及部分工具窄屏顶栏重叠。',
  },
  {
    icon: 'fas fa-comments',
    tag: '消息列表',
    title: '修复会话排序、加载区分与历史翻页',
    desc: '修复聊天列表排序的部分问题，区分加载中与无消息提示，修复网页端无滚动条时无法加载更多消息的 BUG。',
  },
  {
    icon: 'fas fa-chart-bar',
    tag: '连接状态',
    title: '修复 24 小时状态提示与未登录记录问题',
    desc: '修复设置页最近 24 小时连接状态显示不全，以及未登录时误记连接状态的问题。',
  },
]

const props = defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const iconUrl = assetUrl('icon.png')
const appVersion = ref('')
const page = ref(0)

const { donateSrc, qrError, sponsors, onQrImgError, loadSponsors } = useDonateQr()

onMounted(async () => {
  try {
    const v = await window.api?.getVersion?.()
    if (v) appVersion.value = String(v).replace(/^v/i, '')
  } catch {
    /* ignore */
  }
})

watch(
  () => props.visible,
  (v) => {
    if (v) {
      page.value = 0
      loadSponsors()
    }
  },
  { immediate: true }
)
</script>

<style scoped src="../../css/components/announcement-modal.css"></style>
