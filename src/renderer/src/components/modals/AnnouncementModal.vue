<template>
  <UiModal :open="visible" size="lg" :show-close="false" aria-label="版本公告" @close="emit('close')">
    <Transition name="fade-left" mode="out-in">
      <div v-if="page === 0" key="welcome" class="announcement-page announcement-welcome">
        <div class="announcement-welcome-inner">
          <div class="announcement-badge">
            <i class="fas fa-star" aria-hidden="true"></i>
            <span>体验打磨 · 预览切换与工具升级</span>
          </div>

          <div class="announcement-logo-stage">
            <span class="announcement-aura" aria-hidden="true"></span>
            <div class="announcement-logo">
              <img :src="iconUrl" alt="7FA4 Chat" class="announcement-logo-img" />
            </div>
          </div>

          <h1 class="announcement-version u-tabular-nums">V{{ appVersion || '4.0.2' }}</h1>
          <p class="announcement-tagline">图片预览左右切换、图论全主题高对比渲染、画图像素落笔与启动首爬全面修复</p>

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
          <p class="announcement-head-sub">V{{ appVersion || '4.0.2' }} 及历代版本变更详情</p>
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
  { icon: 'fas fa-images', label: '图片预览切换', sub: '左右按钮 · 键盘快捷键' },
  { icon: 'fas fa-project-diagram', label: '图论对比度与向心力', sub: '全主题适配 · 稳态布局' },
  { icon: 'fas fa-paint-brush', label: '画图与工具窗升级', sub: '文字像素落笔 · 独立防丢提示' },
  { icon: 'fas fa-shield-alt', label: '启动与断线修复', sub: '首爬遮罩 · 可用率分级配色' },
]

const HIGHLIGHTS = [
  {
    icon: 'fas fa-images',
    tag: '图片预览',
    title: '支持同会话图片左右切换',
    desc: '打开图片预览自动采集当前会话图片列表，支持左右悬浮按钮与方向键切换并显示页码，修复切换跳动与旋转动画异常。',
  },
  {
    icon: 'fas fa-project-diagram',
    tag: '图论工具',
    title: '质心向心力与全主题高对比渲染',
    desc: '物理引擎加入质心向心引力防止非连通分量无限远离，节点边框与边线改用主题前景色动态混色，浅/深及自定义主题均清晰锐利。',
  },
  {
    icon: 'fas fa-paint-brush',
    tag: '画图与工具',
    title: '画图文字像素落笔与独立窗口提示',
    desc: '画图文字确认后直接栅格化落笔，支持橡皮擦与马赛克擦除；独立工具窗各窗口独立计算未保存状态并在关闭时提示。',
  },
  {
    icon: 'fas fa-chart-bar',
    tag: '连接状态',
    title: '可用率 10% 分级配色与断线计时修复',
    desc: '时段条按 100% 纯绿、80%+ 绿至浅绿、0–80% 每 10% 浅红至深红着色，修复重连尝试时断线计时清零与已关闭提示复弹。',
  },
  {
    icon: 'fas fa-camera',
    tag: '系统相机',
    title: '桌面端调用系统相机与首次爬取修复',
    desc: '桌面端拍照改用系统相机应用；修复有本地缓存时提前进入界面与完整爬取期间误发通知的问题。',
  },
  {
    icon: 'fas fa-sliders-h',
    tag: '体验精简',
    title: '设置与通知文案精简',
    desc: '统一窄屏「关于」页导航栏显示逻辑并移除多余返回按钮，精简设置说明与站点通知弹窗中的冗余提示文案。',
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
