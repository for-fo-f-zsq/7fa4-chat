<template>
  <PanelShell title="关于" icon="fas fa-circle-info">
    <UiCard class="about-card about-hero" size="lg">
      <div class="about-hero-top">
        <div class="about-logo-wrap">
          <img :src="iconUrl" alt="7FA4 Chat" class="about-logo" />
        </div>
        <div class="about-hero-info">
          <div class="about-title-row">
            <h1 class="about-name">7FA4 Chat</h1>
            <UiBadge v-if="version" class="about-version u-tabular-nums" variant="brand" size="sm">
              v{{ version }}
            </UiBadge>
            <UiBadge variant="neutral" size="sm">{{ platformLabel }}</UiBadge>
          </div>
          <p class="about-tagline">
            简洁高效的跨平台即时通讯与学习工具箱，内置 Markdown、KaTeX 公式、图论与图像画板，聊天数据本地加密存储。
          </p>
          <div class="about-author-inline">
            <span class="about-author-label">作者</span>
            <span class="about-author-name">for_fo_f</span>
            <span class="about-meta-dot" aria-hidden="true">·</span>
            <UiPopover v-model:open="aiPopoverOpen" trigger="hover" placement="bottom" :offset="8">
              <template #trigger>
                <button
                  type="button"
                  class="about-ai-trigger"
                  @focus="aiPopoverOpen = true"
                  @blur="aiPopoverOpen = false"
                >
                  <i class="fas fa-robot" aria-hidden="true"></i>
                  <span>AI 协作</span>
                </button>
              </template>
              <template #content>
                <div class="about-ai-popover">
                  <div class="about-ai-popover-head">
                    <span>参与协作的 AI</span>
                    <span class="about-ai-popover-count u-tabular-nums">{{ totalAiEntries }}</span>
                  </div>
                  <div class="about-ai-popover-list">
                    <div v-for="family in aiFamilies" :key="family.id" class="about-ai-group">
                      <div class="about-ai-group-name">{{ family.label }}</div>
                      <div class="about-ai-tags">
                        <span
                          v-for="model in family.models"
                          :key="model.name"
                          class="about-ai-pill"
                          :class="{ 'is-recent': model.recent }"
                        >{{ model.name }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </UiPopover>
          </div>
        </div>
      </div>

      <div class="about-hero-actions">
        <div class="about-links">
          <UiButton variant="secondary" size="sm" icon="fas fa-house" @click="openLink(officialSiteUrl())">官网</UiButton>
          <UiButton variant="secondary" size="sm" icon="fab fa-github" @click="openLink('https://github.com/for-fo-f-zsq/7fa4-chat')">GitHub</UiButton>
          <UiButton variant="secondary" size="sm" icon="fab fa-gitlab" @click="openLink(gitlabProjectUrl())">GitLab</UiButton>
        </div>
        <div class="about-quick-actions">
          <UiButton variant="ghost" size="sm" icon="fas fa-comment-dots" @click="openFeedback">意见反馈</UiButton>
          <UiButton variant="ghost" size="sm" icon="fas fa-book-open" @click="openGuide">新手指引</UiButton>
        </div>
      </div>
    </UiCard>

    <UiCard class="about-card" size="lg">
      <template #header>
        <div class="about-card-head">
          <span class="about-card-head-title">
            <i class="fas fa-cubes about-card-icon" aria-hidden="true"></i>
            <span>核心能力</span>
          </span>
          <span class="about-card-meta">消息 · 工具 · 隐私</span>
        </div>
      </template>

      <div class="about-feat-grid">
        <div v-for="feat in features" :key="feat.name" class="about-feat-item">
          <div class="about-feat-icon"><i :class="feat.icon" aria-hidden="true"></i></div>
          <div class="about-feat-body">
            <div class="about-feat-name">{{ feat.name }}</div>
            <div class="about-feat-desc">{{ feat.desc }}</div>
          </div>
        </div>
      </div>
    </UiCard>

    <UiCard class="about-card about-stack-card" size="lg">
      <template #header>
        <div class="about-card-head">
          <span class="about-card-head-title">
            <i class="fas fa-code about-card-icon" aria-hidden="true"></i>
            <span>技术底座</span>
          </span>
        </div>
      </template>

      <div class="about-tech">
        <UiBadge v-for="tech in techStack" :key="tech" variant="neutral" size="sm">{{ tech }}</UiBadge>
      </div>

      <div class="about-footer">
        <span class="about-copyright">© 2026 for_fo_f · 本地 SQLite 加密存储 · 零遥测、无广告</span>
        <div class="about-footer-actions">
          <UiButton variant="text" size="sm" icon="fas fa-comment-dots" @click="openFeedback">意见反馈</UiButton>
          <UiButton variant="text" size="sm" icon="fas fa-book-open" @click="openGuide">重新查看新手指引</UiButton>
        </div>
      </div>
    </UiCard>
  </PanelShell>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { UiBadge, UiButton, UiCard, UiPopover } from '@/ui'
import { assetUrl } from '@/platform/asset-base.js'
import { feedbackPageUrl, gitlabProjectUrl, isWebBrowser, officialSiteUrl } from '@/utils.js'
import PanelShell from '@/components/common/PanelShell.vue'

const iconUrl = assetUrl('icon.png')
const props = defineProps({ version: { type: String, default: '' } })

const version = ref(props.version || '')
const aiPopoverOpen = ref(false)

const platformLabel = computed(() => {
  if (typeof window !== 'undefined' && window.__7FA4_PLATFORM__ === 'android') return 'Android'
  if (isWebBrowser()) return 'Web 网页版'
  return 'Electron 桌面端'
})

function openGuide() {
  window.dispatchEvent(new Event('open-onboarding'))
}

function openFeedback() {
  if (isWebBrowser()) {
    window.api?.openExternal?.(feedbackPageUrl('web', version.value || ''))
    return
  }
  window.dispatchEvent(new Event('open-feedback'))
}

function openLink(url) {
  window.api?.openExternal?.(url)
}

onMounted(() => {
  if (!version.value && typeof window.api?.getVersion === 'function') {
    window.api.getVersion().then((v) => {
      if (v) version.value = v
    }).catch(() => {})
  }
})

// 参与协作的 AI：只有主力用过的条目才加 is-recent 高亮，避免满屏都是强调色。
const aiFamilies = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    models: [
      { name: 'DeepSeek V4 Flash 0731', recent: false },
      { name: 'DeepSeek V4 Flash Vision (Exp)', recent: false },
      { name: 'DeepSeek V4.1 Flash', recent: false },
      { name: 'DeepSeek V4.1 Flash 1017', recent: true },
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    models: [
      { name: 'Gemini 4 Argon', recent: false },
      { name: 'Gemini 4 Hydrogen', recent: true },
    ],
  },
  {
    id: 'glm',
    label: 'GLM',
    models: [
      { name: 'GLM-5.1', recent: false },
      { name: 'GLM-5.2', recent: false },
      { name: 'GLM-5.3', recent: false },
      { name: 'GLM-5.3 Flash', recent: false },
    ],
  },
  {
    id: 'hy',
    label: 'Hy',
    models: [
      { name: 'Hy3', recent: false },
      { name: 'Hy4 Preview', recent: false },
      { name: 'Hy4', recent: false },
    ],
  },
  {
    id: 'agents',
    label: 'Agents',
    models: [
      { name: 'CodeBuddy', recent: false },
      { name: 'WorkBuddy', recent: false },
      { name: 'DeepSeek Harness', recent: false },
      { name: 'Antigravity', recent: true },
    ],
  },
]

const totalAiEntries = computed(() =>
  aiFamilies.reduce((sum, family) => sum + family.models.length, 0),
)

const features = [
  {
    icon: 'fas fa-comment-dots',
    name: '即时通讯',
    desc: '私聊与群聊、@ 提醒、引用回复与拍一拍；支持投票、自定义表情、图片与文件消息及历史完整拉取。',
  },
  {
    icon: 'fas fa-file-lines',
    name: '富文本与公式',
    desc: 'Markdown 渲染与代码高亮，行内与块级 KaTeX 数学公式，图片原比例展示及高清灯箱预览。',
  },
  {
    icon: 'fas fa-toolbox',
    name: '扩展工具箱',
    desc: '提供 Markdown、图像画板、Graph Editor、科学计算器、GeoGebra 与四宫格计时器，按需下载即装即用。',
  },
  {
    icon: 'fas fa-shield-alt',
    name: '本地加密与隐私',
    desc: '消息记录采用本地 SQLite + AES-256 加密存储，支持备份恢复；无广告、零遥测上报。',
  },
  {
    icon: 'fas fa-laptop',
    name: '多端协同体验',
    desc: '覆盖 Windows、Linux、macOS 桌面端以及网页端与 Android 端，窄屏窗口自动切换单栏视图。',
  },
  {
    icon: 'fas fa-palette',
    name: '主题与个性定制',
    desc: '内置多套低饱和护眼主题并支持自定义配色、字体字号调整与全局快捷键绑定。',
  },
]

const techStack = [
  'Vue 3',
  'Electron',
  'Vite',
  'Capacitor',
  'Node.js',
  'SQLite',
  'KaTeX',
  'Prism',
  'GeoGebra',
  'Font Awesome',
]
</script>

<style scoped src="../../css/components/about-panel.css"></style>
