<template>
  <UiModal :open="visible" size="lg" :show-close="false" aria-label="版本公告" @close="emit('close')">
    <Transition name="fade-left" mode="out-in">
      <div v-if="page === 0" key="welcome" class="announcement-page announcement-welcome">
        <div class="announcement-welcome-inner">
          <div class="announcement-badge">
            <i class="fas fa-star" aria-hidden="true"></i>
            <span>重大架构焕新 · 全新开始</span>
          </div>

          <div class="announcement-logo-stage">
            <span class="announcement-aura" aria-hidden="true"></span>
            <div class="announcement-logo">
              <img :src="iconUrl" alt="7FA4 Chat" class="announcement-logo-img" />
            </div>
          </div>

          <h1 class="announcement-version u-tabular-nums">V{{ appVersion || '4.0.0' }}</h1>
          <p class="announcement-tagline">全新设计语言、高清动态表情与重制工具箱，开启全新一代 7FA4 Chat</p>

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
          <p class="announcement-head-sub">V{{ appVersion || '4.0.0' }} 及历代版本变更详情</p>
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
            开启 V4.0.0<template #trailing><i class="fas fa-check"></i></template>
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
  { icon: 'fas fa-palette', label: '设计系统重构', sub: '统一令牌 · 双景预览' },
  { icon: 'fas fa-smile', label: '312 款 APNG 动图', sub: '清晰命名 · 拼音检索' },
  { icon: 'fas fa-toolbox', label: '5 大工具重制', sub: '图像 / MD / 图论 / 计算 / 计时' },
  { icon: 'fas fa-bell', label: '通知与工程跃迁', sub: '智能提醒 · 全量单测门禁' },
]

const HIGHLIGHTS = [
  {
    icon: 'fas fa-palette',
    tag: '设计系统',
    title: '统一组件原语与主题双景预览',
    desc: '引入全局语义令牌与 24 类标准化 UI 组件；自定义主题新增「聊天 + 关于」实时微缩画布，年级配色支持卡片直取。',
  },
  {
    icon: 'fas fa-smile',
    tag: '表情 4.0',
    title: '312 款高清动态 APNG 重构上线',
    desc: '彻底清理旧版低清 GIF 与重复接龙图片，换装 QFace 官方动画，全面对齐「/中文」「/全拼」与无冲突缩写检索。',
  },
  {
    icon: 'fas fa-toolbox',
    tag: '工具箱',
    title: '五大内置工具深度模块化重制',
    desc: '图片支持箭头/马赛克/非破坏旋转与 800% 缩放；MD 新增目录大纲与查找替换；图论/计算器/计时器交互全面革新。',
  },
  {
    icon: 'fas fa-bell',
    tag: '通知提醒',
    title: '单窗复用与更细致的免打扰策略',
    desc: '通知卡片精准锚定当前显示器并聚合计数，新增跨零点定时免打扰、@仅提醒、Web Audio 合成试听与隐私模式。',
  },
  {
    icon: 'fas fa-comments',
    tag: '体验打磨',
    title: '设置分区导航与聊天滚动画布加固',
    desc: '设置面板改用六大分类导航，「关于」升级 Bento 卡片矩阵；深度拆解消息区并验证上滑翻页与锚定稳定性。',
  },
  {
    icon: 'fas fa-cubes',
    tag: '多端与工程',
    title: '官网视觉同源与自动化测试门禁',
    desc: '官网、反馈页与管理后台共享设计令牌并同步深浅模式；新增 7 大测试套件并由 CI 门禁守护每一次版本发布。',
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
