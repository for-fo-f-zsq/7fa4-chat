<template>
  <div class="about-panel">
    <!-- 返回条 -->
    <div class="about-topbar">
      <BackButton title="返回消息列表" @back="emit('back')" />
    </div>
    <!-- 概览 -->
    <UiCard class="about-card about-hero" size="lg">
      <div class="about-hero-center">
        <div class="about-logo-wrap">
          <img src="/icon.png" alt="7FA4 Chat" class="about-logo" />
        </div>
        <div class="about-name">7FA4 Chat</div>
        <UiBadge class="about-version" variant="brand" size="sm">v{{ version }}</UiBadge>
        <p class="about-tagline">基于 Vue 3 与 Electron 的跨平台即时通讯应用，内置 Markdown、数学公式、代码与画板等学习工具。</p>
        <!-- 作者 & AI 协作者 -->
        <div class="about-author">
          <div class="about-author-line">
            <span class="about-author-main">for_fo_f</span>
            <span class="about-author-sep">/</span>
            <span class="about-author-ai"><i class="fas fa-robot"></i> AI</span>
            <span class="about-author-note">协作开发</span>
          </div>
          <div class="about-ai-models">
            <UiBadge
              v-for="m in aiModels"
              :key="m.name"
              variant="outline"
              size="sm"
              :color="m.color"
              :title="m.name"
            >{{ m.name }}</UiBadge>
          </div>
        </div>
      </div>
      <div class="about-links">
        <UiButton variant="secondary" size="sm" icon="fab fa-github" @click="openLink('https://github.com/for-fo-f-zsq/7fa4-chat')">GitHub</UiButton>
        <UiButton variant="secondary" size="sm" icon="fab fa-gitlab" @click="openLink(gitlabProjectUrl())">GitLab</UiButton>
      </div>
    </UiCard>

    <!-- 功能特性 -->
    <UiCard class="about-card" size="lg">
      <template #header><i class="fas fa-cubes about-card-icon" aria-hidden="true"></i>功能特性</template>
      <div class="about-feat-grid">
        <UiCard v-for="feat in features" :key="feat.name" class="about-feat" size="sm">
          <div class="about-feat-inner">
            <div class="about-feat-icon"><i :class="feat.icon" aria-hidden="true"></i></div>
            <div class="about-feat-body">
              <div class="about-feat-name">{{ feat.name }}</div>
              <div class="about-feat-desc">{{ feat.desc }}</div>
            </div>
          </div>
        </UiCard>
      </div>
    </UiCard>

    <!-- 技术栈 -->
    <UiCard class="about-card" size="lg">
      <template #header><i class="fas fa-code about-card-icon" aria-hidden="true"></i>技术栈</template>
      <div class="about-tech">
        <UiBadge v-for="tech in techStack" :key="tech" variant="brand" size="sm">{{ tech }}</UiBadge>
      </div>
      <div class="about-footer">
        © 2026 for_fo_f 独立开发维护 · 问题反馈请到 GitLab Issues
        <UiButton class="about-guide-link" variant="text" size="sm" icon="fas fa-book-open" @click="openGuide">重新查看新手指引</UiButton>
      </div>
    </UiCard>
  </div>
</template>

<script setup>
// 用法：<AboutPanel :version="version" @back="view='chat'" />

import { ref, onMounted } from 'vue'
import BackButton from './BackButton.vue'
import { gitlabProjectUrl } from '../utils.js'
import { UiBadge, UiButton, UiCard } from '@/ui'

const props = defineProps({ version: { type: String, default: '' } })
const emit = defineEmits(['back'])

// 关于页入口：让 App 重新打开新手指引（已看过的用户也能回看）
function openGuide() {
  window.dispatchEvent(new Event('open-onboarding'))
}

// 兜底：外层异步传入可能为空，面板自身再拉一次版本号
const version = ref(props.version || '')
onMounted(() => {
  if (!version.value) {
    window.api.getVersion().then((v) => { if (v) version.value = v }).catch(() => {})
  }
})

// 用系统默认浏览器打开外部链接
function openLink(url) {
  window.api.openExternal(url)
}

// 功能特性（长文案保留原文）
const features = [
  { icon: 'fas fa-comment-dots', name: '即时通讯', desc: '私聊与群聊、@ 提醒与拍一拍；消息置顶、自定义表情、图片与文件消息，历史记录完整拉取。' },
  { icon: 'fas fa-file-alt', name: '消息渲染', desc: 'Markdown 富文本与代码高亮，行内、块级 KaTeX 数学公式，图片按原始比例显示并支持全屏预览。' },
  { icon: 'fas fa-wrench', name: '在线工具箱', desc: 'Markdown 编辑与预览、图片编辑、交互式 Graph Editor、科学计算器与 GeoGebra 数学画板，按需下载、即装即用。' },
  { icon: 'fas fa-calculator', name: '科学计算', desc: '科学计算器支持表达式、模运算与质因数分解；GeoGebra 数学画板提供完整的绘图体验。' },
  { icon: 'fas fa-shield-alt', name: '数据与隐私', desc: '聊天数据本地 SQLite + AES-256 加密存储，无遥测、无广告。' },
  { icon: 'fas fa-laptop', name: '跨平台体验', desc: '支持 Windows、Linux 与 macOS，多套主题、可自定义快捷键与字体大小，窄窗自动单列布局。' }
]

const techStack = ['Vue 3', 'Electron', 'Node.js', 'SQLite', 'Markdown', 'KaTeX', 'Prism', 'GeoGebra', 'Font Awesome']

// 参与开发的 AI 协作者（按需增删改名即可）；颜色按厂商分色系：
// DeepSeek=蓝系、GLM(智谱)=绿系、Hy3(腾讯混元)=橙，同厂商用同色系深浅区分具体模型
const aiModels = [
  { name: 'DeepSeek V4 Flash · 0731', color: '#3b5bfd' },
  { name: 'DeepSeek V4 Flash Vision (Exp)', color: '#6176ff' },
  { name: 'DeepSeek V4.1 Flash', color: '#8797ff' },
  { name: 'GLM-5.1', color: '#0a7a4b' },
  { name: 'GLM-5.2', color: '#0b8f5a' },
  { name: 'GLM-5.3', color: '#10a86b' },
  { name: 'GLM-5.3 Flash', color: '#28c18a' },
  { name: 'Hy3', color: '#e07b39' },
  { name: 'Hy4 Preview', color: '#eda366' },
]
</script>

<style scoped src="../css/about-panel.css"></style>
