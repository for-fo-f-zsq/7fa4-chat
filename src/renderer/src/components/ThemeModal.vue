<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-container">
      <div class="theme-modal-card">
        <div class="theme-modal-header">
          <h3>主题设置</h3>
          <button class="modal-close-btn" @click="$emit('close')"><i class="fas fa-times"></i></button>
        </div>

        <div class="theme-modal-tabs">
          <div class="tmtab" :class="{ active: tab === 'preset' }" @click="tab = 'preset'">预设主题</div>
          <div class="tmtab" :class="{ active: tab === 'custom' }" @click="tab = 'custom'">自定义主题</div>
          <div class="tmtab" :class="{ active: tab === 'grade' }" @click="tab = 'grade'">年级颜色</div>
        </div>

        <div class="theme-modal-body">
          <div v-if="tab === 'preset'" class="preset-panel">
            <div class="theme-grid-modal">
              <div class="theme-item" v-for="t in themes" :key="t.value" :class="{ active: currentTheme === t.value, original: t.original }" @click.stop="selectTheme(t.value)" @mouseenter="previewTheme(t.value)" @mouseleave="restoreTheme">
                <span class="theme-dot" :style="{ background: t.color }"></span>
                <span class="theme-name">{{ t.label }}</span>
                <span v-if="t.original" class="theme-star">★</span>
              </div>
            </div>
          </div>

          <div v-if="tab === 'custom'" class="custom-panel">
            <div class="custom-theme-actions">
              <button class="tm-btn tm-btn-secondary" @click="exportCSS"><i class="fas fa-download"></i> 导出 CSS</button>
              <button class="tm-btn tm-btn-secondary" @click="triggerImport"><i class="fas fa-upload"></i> 导入 CSS</button>
              <input ref="importInput" type="file" accept=".css" style="display:none" @change="importCSS" />
              <button class="tm-btn tm-btn-secondary" @click="resetCustom"><i class="fas fa-undo"></i> 重置默认</button>
              <button class="tm-btn tm-btn-primary" @click="applyCustom"><i class="fas fa-check"></i> 应用</button>
            </div>
            <div class="var-groups">
              <div class="var-group" v-for="group in varGroups" :key="group.label">
                <div class="var-group-header" @click="toggleGroup(group.label)">
                  <span>{{ group.label }}</span>
                  <i class="fas fa-chevron-down" :class="{ collapsed: !groupOpen[group.label] }"></i>
                </div>
                <div class="var-group-body" v-if="groupOpen[group.label]">
                  <div class="var-row" v-for="v in group.vars" :key="v.name">
                    <label class="var-name" :title="v.name">{{ v.label }}</label>
                    <div class="var-input-wrap">
                      <input type="color" class="var-color" v-model="customVars[v.name]" v-if="isColorVar(v.name)" />
                      <input type="text" class="var-text" v-model="customVars[v.name]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="tab === 'grade'" class="grade-panel">
            <div class="grade-colors-grid">
              <div class="grade-color-item" v-for="k in COLOR_KEYS" :key="k">
                <span class="grade-color-label">{{ GRADE_LABELS[k] || k }}</span>
                <input type="color" class="grade-color-picker" :value="getGradeColorValue(k)" @input="onGradeColorChange(k, $event.target.value)" />
                <input type="text" class="grade-color-hex" :value="getGradeColorValue(k)" @change="onGradeColorHexChange(k, $event.target.value)" />
              </div>
            </div>
            <button class="tm-btn tm-btn-secondary" @click="resetGradeColors" style="margin-top:12px"><i class="fas fa-undo"></i> 重置默认</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { THEMES } from '../composables/constants.js'
import { COLOR_KEYS, GRADE_LABELS, DEFAULT_PALETTE } from '../utils.js'

const props = defineProps({
  setting: Object
})

const emit = defineEmits(['close', 'settingChange'])

const tab = ref('preset')
const importInput = ref(null)
const groupOpen = reactive({})

let previewTimer = null
let isPreviewing = false

onUnmounted(() => {
  clearTimeout(previewTimer)
})

const themes = THEMES

const currentTheme = computed(() => props.setting?.theme || 'default')

const varGroups = [
  { label: '背景', vars: [
    { name: '--bg-app', label: '应用背景' },
    { name: '--bg-sidebar', label: '侧栏背景' },
    { name: '--bg-sidebar-hover', label: '侧栏悬停' },
    { name: '--bg-sidebar-active', label: '侧栏激活' },
    { name: '--bg-conversation-hover', label: '会话悬停' },
    { name: '--bg-conversation-active', label: '会话激活' },
    { name: '--bg-conversation-press', label: '会话按下' },
    { name: '--bg-input', label: '输入框背景' },
    { name: '--bg-input-focus', label: '输入框聚焦' },
    { name: '--bg-code-block', label: '代码块背景' },
    { name: '--bg-code-inline', label: '行内代码背景' },
    { name: '--bg-modal-overlay', label: '模态遮罩' },
    { name: '--bg-settings-info', label: '设置信息背景' },
    { name: '--bg-gradient-end', label: '渐变终止色' },
  ]},
  { label: '边框', vars: [
    { name: '--border-light', label: '浅边框' },
    { name: '--border-table', label: '表格边框' },
    { name: '--border-row', label: '行边框' },
  ]},
  { label: '文字', vars: [
    { name: '--text-primary', label: '主要文字' },
    { name: '--text-secondary', label: '次要文字' },
    { name: '--text-sidebar', label: '侧栏文字' },
    { name: '--text-link', label: '链接文字' },
    { name: '--text-placeholder', label: '占位文字' },
    { name: '--text-error', label: '错误文字' },
    { name: '--text-on-accent', label: '强调上文字' },
    { name: '--text-blockquote', label: '引用文字' },
  ]},
  { label: '强调色', vars: [
    { name: '--accent', label: '主强调色' },
    { name: '--accent-hover', label: '强调悬停' },
    { name: '--accent-active', label: '强调激活' },
    { name: '--accent-light', label: '强调浅色' },
    { name: '--accent-outline', label: '强调轮廓' },
    { name: '--gradient-accent', label: '强调渐变' },
    { name: '--gradient-subtle', label: '微弱渐变' },
  ]},
  { label: '消息气泡', vars: [
    { name: '--message-self-bg', label: '自己气泡背景' },
    { name: '--message-self-text', label: '自己气泡文字' },
    { name: '--message-other-bg', label: '他人气泡背景' },
  ]},
  { label: '滚动条', vars: [
    { name: '--scrollbar-thumb', label: '滚动条滑块' },
    { name: '--scrollbar-thumb-hover', label: '滚动条悬停' },
  ]},
  { label: '阴影', vars: [
    { name: '--shadow-card', label: '卡片阴影' },
    { name: '--shadow-card-hover', label: '卡片悬停阴影' },
    { name: '--shadow-modal', label: '模态阴影' },
  ]},
  { label: '其他', vars: [
    { name: '--divider-bg', label: '分隔线' },
    { name: '--radius', label: '圆角' },
    { name: '--logout-hover-bg', label: '退出按钮悬停' },
    { name: '--btn-ripple', label: '按钮涟漪' },
  ]},
]

for (const g of varGroups) {
  groupOpen[g.label] = g.label === '背景'
}

const customVars = reactive({})

onMounted(() => {
  if (props.setting?.theme === 'custom' && props.setting?.customVars) {
    for (const g of varGroups) {
      for (const v of g.vars) {
        customVars[v.name] = props.setting.customVars[v.name] || ''
      }
    }
  } else {
    loadCurrentVars()
  }
})

function loadCurrentVars() {
  const root = document.documentElement
  const style = getComputedStyle(root)
  for (const g of varGroups) {
    for (const v of g.vars) {
      customVars[v.name] = style.getPropertyValue(v.name).trim()
    }
  }
}

function isColorVar(name) {
  const nonColor = ['--radius', '--shadow-card', '--shadow-card-hover', '--shadow-modal', '--arrow-border', '--arrow-border-left', '--arrow-border-right']
  return !nonColor.includes(name)
}

function toggleGroup(label) {
  groupOpen[label] = !groupOpen[label]
}

function applyThemeClass(value) {
  const root = document.documentElement
  root.className = ''
  if (value !== 'default') root.classList.add(`theme-${value}`)
}

function selectTheme(value) {
  clearTimeout(previewTimer)
  isPreviewing = false
  const root = document.documentElement
  for (const g of varGroups) {
    for (const v of g.vars) {
      root.style.removeProperty(v.name)
    }
  }
  applyThemeClass(value)
  emit('settingChange', { theme: value, customVars: null })
  loadCurrentVars()
}

function previewTheme(value) {
  clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    isPreviewing = true
    applyThemeClass(value)
  }, 500)
}

function restoreTheme() {
  clearTimeout(previewTimer)
  if (isPreviewing) {
    isPreviewing = false
    applyThemeClass(currentTheme.value)
  }
}

function applyCustom() {
  const root = document.documentElement
  root.className = ''
  for (const g of varGroups) {
    for (const v of g.vars) {
      root.style.setProperty(v.name, customVars[v.name])
    }
  }
  const savedVars = {}
  for (const g of varGroups) {
    for (const v of g.vars) {
      savedVars[v.name] = customVars[v.name]
    }
  }
  emit('settingChange', { theme: 'custom', customVars: savedVars })
}

function resetCustom() {
  const root = document.documentElement
  root.className = ''
  for (const g of varGroups) {
    for (const v of g.vars) {
      root.style.removeProperty(v.name)
    }
  }
  loadCurrentVars()
  emit('settingChange', { theme: 'default', customVars: null })
}

function exportCSS() {
  const root = document.documentElement
  const style = getComputedStyle(root)
  let css = ':root {\n'
  for (const g of varGroups) {
    for (const v of g.vars) {
      const val = style.getPropertyValue(v.name).trim()
      if (val) css += `  ${v.name}: ${val};\n`
    }
  }
  css += '}'
  const blob = new Blob([css], { type: 'text/css' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'custom-theme.css'
  a.click()
  URL.revokeObjectURL(url)
}

function triggerImport() {
  importInput.value?.click()
}

function importCSS(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const text = reader.result
    const matches = text.matchAll(/([a-zA-Z-]+)\s*:\s*([^;]+);/g)
    const root = document.documentElement
    root.className = ''
    const savedVars = {}
    let applied = false
    for (const m of matches) {
      const name = m[1].trim()
      if (name.startsWith('--')) {
        const val = m[2].trim()
        customVars[name] = val
        savedVars[name] = val
        root.style.setProperty(name, val)
        applied = true
      }
    }
    if (applied) {
      emit('settingChange', { theme: 'custom', customVars: savedVars })
    }
  }
  reader.readAsText(file)
  e.target.value = ''
}

function getGradeColorValue(key) {
  // 优先显示自定义值，否则显示当前主题的CSS变量值
  if (props.setting?.gradeColors?.[key]) return props.setting.gradeColors[key]
  const cssVar = getComputedStyle(document.documentElement).getPropertyValue(`--grade-${key}`).trim()
  return cssVar || DEFAULT_PALETTE[key] || '#888888'
}

function onGradeColorChange(key, value) {
  const current = { ...props.setting?.gradeColors }
  current[key] = value
  emit('settingChange', { gradeColors: current })
}

function onGradeColorHexChange(key, value) {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    onGradeColorChange(key, value)
  }
}

function resetGradeColors() {
  emit('settingChange', { gradeColors: {} })
}
</script>
