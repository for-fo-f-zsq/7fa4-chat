<template>
  <div class="about-panel">
    <!-- 返回条 -->
    <div class="about-topbar">
      <BackButton title="返回消息列表" @back="emit('back')" />
    </div>
    <!-- 概览 -->
    <div class="about-card about-hero">
      <div class="about-hero-center">
        <div class="about-logo-wrap">
          <img src="/icon.png" alt="7FA4 Chat" class="about-logo" />
        </div>
        <div class="about-name">7FA4 Chat</div>
        <div class="about-version-pill">v{{ version }}</div>
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
            <span
              v-for="m in aiModels"
              :key="m.name"
              class="ai-chip"
              :style="{ '--chip-color': m.color }"
              :title="m.name"
            >{{ m.name }}</span>
          </div>
        </div>
      </div>
      <div class="about-links">
        <button class="about-link-btn" @click="openLink('https://github.com/for-fo-f-zsq/7fa4-chat')"><i class="fab fa-github"></i> GitHub</button>
        <button class="about-link-btn" @click="openLink('https://jx.7fa4.cn:9080/student-archive/zsq-7fa4-chat')"><i class="fab fa-gitlab"></i> GitLab</button>
        <button class="about-link-btn" @click="openLink('https://chat.forfof.cloud')"><i class="fas fa-globe"></i> 官网</button>
      </div>
    </div>

    <!-- 功能特性 -->
    <div class="about-card">
      <div class="about-card-title"><i class="fas fa-cubes"></i>功能特性</div>
      <div class="about-feat-grid">
        <div class="about-feat">
          <div class="about-feat-icon"><i class="fas fa-comment-dots"></i></div>
          <div class="about-feat-body">
            <div class="about-feat-name">即时通讯</div>
            <div class="about-feat-desc">私聊与群聊、@ 提醒与拍一拍；消息置顶收藏、自定义表情、图片与文件消息，历史记录完整拉取。</div>
          </div>
        </div>
        <div class="about-feat">
          <div class="about-feat-icon"><i class="fas fa-file-alt"></i></div>
          <div class="about-feat-body">
            <div class="about-feat-name">消息渲染</div>
            <div class="about-feat-desc">Markdown 富文本与代码高亮，行内、块级 KaTeX 数学公式，图片按原始比例显示并支持全屏预览。</div>
          </div>
        </div>
        <div class="about-feat">
          <div class="about-feat-icon"><i class="fas fa-wrench"></i></div>
          <div class="about-feat-body">
            <div class="about-feat-name">内置工具箱</div>
            <div class="about-feat-desc">Markdown 编辑与预览、图片编辑、交互式 Graph Editor、科学计算器与 GeoGebra 数学画板，开箱即用。</div>
          </div>
        </div>
        <div class="about-feat">
          <div class="about-feat-icon"><i class="fas fa-calculator"></i></div>
          <div class="about-feat-body">
            <div class="about-feat-name">科学计算</div>
            <div class="about-feat-desc">科学计算器支持表达式、模运算与质因数分解；GeoGebra 数学画板提供完整的绘图体验。</div>
          </div>
        </div>
        <div class="about-feat">
          <div class="about-feat-icon"><i class="fas fa-shield-alt"></i></div>
          <div class="about-feat-body">
            <div class="about-feat-name">数据与隐私</div>
            <div class="about-feat-desc">聊天数据本地 SQLite + AES-256 加密存储，删除即彻底删除，无遥测、无广告。</div>
          </div>
        </div>
        <div class="about-feat">
          <div class="about-feat-icon"><i class="fas fa-laptop"></i></div>
          <div class="about-feat-body">
            <div class="about-feat-name">跨平台体验</div>
            <div class="about-feat-desc">支持 Windows、Linux 与 macOS，多套主题、可自定义快捷键与字体大小，窄窗自动单列布局。</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 技术栈 -->
    <div class="about-card">
      <div class="about-card-title"><i class="fas fa-code"></i>技术栈</div>
      <div class="about-tech">
        <span class="tech-tag">Vue 3</span>
        <span class="tech-tag">Electron</span>
        <span class="tech-tag">Node.js</span>
        <span class="tech-tag">Express</span>
        <span class="tech-tag">SQLite</span>
        <span class="tech-tag">Markdown</span>
        <span class="tech-tag">KaTeX</span>
        <span class="tech-tag">Prism</span>
        <span class="tech-tag">GeoGebra</span>
        <span class="tech-tag">Font Awesome</span>
      </div>
      <div class="about-footer">
        © 2026 for_fo_f 独立开发维护 · 反馈请到头像菜单「意见反馈」
        <button class="about-guide-link" @click="openGuide"><i class="fas fa-book-open"></i> 重新查看新手指引</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import BackButton from './BackButton.vue'

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