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
        </div>

        <div class="theme-modal-body">
          <div v-if="tab === 'preset'" class="preset-panel">
            <div class="theme-grid-modal">
              <div class="theme-item" v-for="t in themes" :key="t.value" :class="{ active: currentTheme === t.value, original: t.original, dark: isDarkTheme(t.value) }" @click.stop="selectTheme(t.value)" @mouseenter="previewTheme(t.value)" @mouseleave="restoreTheme">
                <!-- 迷你预览：该主题的真实配色（深浅与主色一眼可辨） -->
                <span class="theme-preview" :style="{ background: previewBg(t.value) }">
                  <span class="tp-side" :style="{ background: previewSide(t.value) }"></span>
                  <span class="tp-accent" :style="{ background: previewAccent(t.value) }"></span>
                  <span class="tp-line" :style="{ background: previewText(t.value) }"></span>
                </span>
                <span class="theme-name">{{ t.label }}</span>
                <span v-if="t.original" class="theme-star">★</span>
              </div>
            </div>
          </div>

          <div v-if="tab === 'custom'" class="custom-panel">
            <div class="tm-actions">
              <button class="tm-btn" @click="exportTheme"><i class="fas fa-download"></i> 导出主题</button>
              <button class="tm-btn" @click="triggerImport"><i class="fas fa-upload"></i> 导入主题</button>
              <input ref="importInput" type="file" accept=".json" style="display:none" @change="importCSS" />
              <button class="tm-btn" @click="resetCustom"><i class="fas fa-rotate-left"></i> 重置默认</button>
              <span class="tm-actions-gap"></span>
              <button class="tm-btn tm-apply" @click="applyCustom"><i class="fas fa-check"></i> 应用</button>
            </div>
            <div class="tm-hint">导出 / 导入包含：主题变量（颜色）与年级颜色，文件为 custom-theme.json</div>

            <div class="tm-cols">
              <!-- 左：主题变量（全展开，分组小标题） -->
              <div class="tm-pane">
                <div class="tm-pane-title">主题变量</div>
                <div class="tm-pane-scroll">
                  <template v-for="group in varGroups" :key="group.label">
                    <div class="tm-group-title">{{ group.label }}</div>
                    <label class="tm-var" v-for="v in group.vars" :key="v.name" :title="v.name">
                      <span class="tm-dot" :style="{ background: customVars[v.name] || '#888888' }"></span>
                      <span class="tm-var-name">{{ v.label }}</span>
                      <input type="color" class="tm-color" v-model="customVars[v.name]" />
                      <input type="text" class="tm-hex" v-model="customVars[v.name]" :title="customVars[v.name]" spellcheck="false" />
                    </label>
                  </template>
                </div>
              </div>

              <!-- 右：年级颜色（色卡网格，点色块直接取色） -->
              <div class="tm-pane">
                <div class="tm-pane-title"><i class="fas fa-palette"></i>年级颜色</div>
                <div class="tm-pane-scroll">
                  <div class="tm-swatches">
                    <label class="tm-swatch" v-for="k in COLOR_KEYS" :key="k">
                      <span class="tm-swatch-color" :style="{ background: getGradeColorValue(k) }">
                        <input type="color" :value="getGradeColorValue(k)" @input="onGradeColorChange(k, $event.target.value)" />
                      </span>
                      <span class="tm-swatch-name">{{ GRADE_LABELS[k] || k }}</span>
                      <input type="text" class="tm-swatch-hex" :value="getGradeColorValue(k)" @change="onGradeColorHexChange(k, $event.target.value)" spellcheck="false" />
                    </label>
                  </div>
                  <button class="tm-btn" style="margin-top:10px;width:100%" @click="resetGradeColors"><i class="fas fa-rotate-left"></i> 重置默认</button>
                </div>
              </div>
            </div>
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

let previewTimer = null
let isPreviewing = false

onUnmounted(() => {
  clearTimeout(previewTimer)
})

const themes = THEMES

const currentTheme = computed(() => props.setting?.theme || 'default')

const RAW_VAR_GROUPS = [
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

// 只保留颜色类变量：阴影 / 圆角 / 尺寸等非颜色值不适合在颜色面板里手工编辑（没有取色器可预览）。
// 在此处统一过滤，保证「编辑 / 应用 / 导出」三者口径一致。
const varGroups = RAW_VAR_GROUPS.map((g) => ({ ...g, vars: g.vars.filter((v) => isColorVar(v.name)) }))

const customVars = reactive({})

// 临时挂主题类读取该主题真实变量（用于迷你预览与深浅判定），结果缓存
const themePreviewCache = reactive({})
function themeVarsOf(value) {
  if (!themePreviewCache[value]) {
    const el = document.createElement('div')
    el.className = `theme-${value}`
    el.style.position = 'absolute'
    el.style.visibility = 'hidden'
    document.body.appendChild(el)
    const s = getComputedStyle(el)
    themePreviewCache[value] = {
      bg: s.getPropertyValue('--bg-app').trim() || '#ffffff',
      side: s.getPropertyValue('--bg-sidebar').trim() || '#eeeeee',
      accent: s.getPropertyValue('--accent').trim() || '#888888',
      text: s.getPropertyValue('--text-primary').trim() || '#333333',
    }
    el.remove()
  }
  return themePreviewCache[value]
}
const previewBg = (v) => themeVarsOf(v).bg
const previewSide = (v) => themeVarsOf(v).side
const previewAccent = (v) => themeVarsOf(v).accent
const previewText = (v) => themeVarsOf(v).text

/** 该主题是深色还是浅色（决定卡片框的灰阶） */
function isDarkTheme(value) {
  const c = themeVarsOf(value).bg
  let r = 255, g = 255, b = 255
  if (c.startsWith('#')) {
    const hex = c.slice(1)
    const full = hex.length === 3 ? hex.split('').map((x) => x + x).join('') : hex
    r = parseInt(full.slice(0, 2), 16); g = parseInt(full.slice(2, 4), 16); b = parseInt(full.slice(4, 6), 16)
  } else {
    const n = c.match(/\d+/g)
    if (n && n.length >= 3) { r = +n[0]; g = +n[1]; b = +n[2] }
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5
}

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

function buildThemeCSS() {
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
  return css
}

// 导出全部主题自定义配置：CSS 变量 + 年级颜色（年级颜色已融入主题颜色体系）
function exportTheme() {
  const payload = JSON.stringify({
    kind: 'theme',
    version: 1,
    css: buildThemeCSS(),
    gradeColors: props.setting?.gradeColors || {}
  }, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'custom-theme.json'
  a.click()
  URL.revokeObjectURL(url)
}

function triggerImport() {
  importInput.value?.click()
}

/** 解析一段 CSS 变量文本并应用（主题配置里的 css 字段走这里） */
function applyCSSText(text) {
  const matches = String(text || '').matchAll(/([a-zA-Z-]+)\s*:\s*([^;]+);/g)
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
  if (applied) emit('settingChange', { theme: 'custom', customVars: savedVars })
  return applied
}

/** 导入主题配置：只接受导出的 custom-theme.json（css + gradeColors），不再兼容旧版纯 CSS */
function importThemeText(text) {
  let j = null
  try { j = JSON.parse(String(text || '').trim()) } catch { j = null }
  if (!j || typeof j !== 'object') {
    alert('导入失败：这不是主题配置文件（应为导出的 custom-theme.json）')
    return
  }
  if (j.css) applyCSSText(j.css)
  if (j.gradeColors && typeof j.gradeColors === 'object') {
    emit('settingChange', { gradeColors: j.gradeColors })
  }
}

function importCSS(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => importThemeText(reader.result)
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
