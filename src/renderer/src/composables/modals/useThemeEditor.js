import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { DEFAULT_PALETTE } from '../../utils.js'
import { THEMES } from '../constants.js'
import { showAlert } from '../useDialog.js'
import { showToast } from '../useToast.js'

const NON_COLOR_VARS = [
  '--radius',
  '--shadow-card',
  '--shadow-card-hover',
  '--shadow-modal',
  '--arrow-border',
  '--arrow-border-left',
  '--arrow-border-right',
]

export function isColorVar(name) {
  return !NON_COLOR_VARS.includes(name)
}

export const RAW_VAR_GROUPS = [
  {
    label: '背景',
    vars: [
      { name: '--bg-app', label: '应用背景' },
      { name: '--bg-sidebar', label: '侧栏背景' },
      { name: '--bg-sidebar-hover', label: '侧栏悬停' },
      { name: '--bg-sidebar-active', label: '侧栏激活' },
      { name: '--bg-conversation-hover', label: '会话悬停' },
      { name: '--bg-conversation-active', label: '会话激活' },
      { name: '--bg-conversation-press', label: '会话按下' },
      { name: '--bg-input', label: '输入框背景' },
      { name: '--bg-input-focus', label: '输入框聚焦' },
      { name: '--bg-settings-info', label: '设置卡片背景' },
      { name: '--bg-group-detail', label: '抬升面板背景' },
      { name: '--bg-table-header', label: '表头背景' },
      { name: '--bg-code-block', label: '代码块背景' },
      { name: '--bg-code-inline', label: '行内代码背景' },
      { name: '--bg-modal-overlay', label: '模态遮罩' },
      { name: '--bg-gradient-end', label: '渐变终止色' },
    ],
  },
  {
    label: '文字',
    vars: [
      { name: '--text-primary', label: '主要文字' },
      { name: '--text-secondary', label: '次要文字' },
      { name: '--text-sidebar', label: '侧栏文字' },
      { name: '--text-link', label: '链接文字' },
      { name: '--text-placeholder', label: '占位文字' },
      { name: '--text-error', label: '错误文字' },
      { name: '--text-unread-badge', label: '未读角标文字' },
      { name: '--text-on-accent', label: '强调上文字' },
      { name: '--text-blockquote', label: '引用文字' },
    ],
  },
  {
    label: '强调色',
    vars: [
      { name: '--accent', label: '主强调色' },
      { name: '--accent-hover', label: '强调悬停' },
      { name: '--accent-active', label: '强调激活' },
      { name: '--accent-light', label: '强调浅色' },
      { name: '--accent-outline', label: '强调轮廓' },
      { name: '--gradient-accent', label: '强调渐变' },
      { name: '--gradient-subtle', label: '微弱渐变' },
    ],
  },
  {
    label: '消息气泡',
    vars: [
      { name: '--message-self-bg', label: '自己气泡背景' },
      { name: '--message-self-text', label: '自己气泡文字' },
      { name: '--message-other-bg', label: '他人气泡背景' },
      { name: '--mention-color', label: '@提及文字' },
      { name: '--mention-soft', label: '@提及底色' },
    ],
  },
  {
    label: '边框',
    vars: [
      { name: '--border-light', label: '浅边框' },
      { name: '--border-table', label: '表格边框' },
      { name: '--border-row', label: '行边框' },
    ],
  },
  {
    label: '头像色板',
    vars: [
      { name: '--avatar-tint-1', label: '头像色 1' },
      { name: '--avatar-tint-2', label: '头像色 2' },
      { name: '--avatar-tint-3', label: '头像色 3' },
      { name: '--avatar-tint-4', label: '头像色 4' },
      { name: '--avatar-tint-5', label: '头像色 5' },
      { name: '--avatar-tint-6', label: '头像色 6' },
      { name: '--avatar-tint-7', label: '头像色 7' },
      { name: '--avatar-tint-8', label: '头像色 8' },
      { name: '--avatar-tint-text', label: '头像文字色' },
    ],
  },
  {
    label: '主题色板',
    vars: [
      { name: '--palette-1', label: '色板 1' },
      { name: '--palette-2', label: '色板 2' },
      { name: '--palette-3', label: '色板 3' },
      { name: '--palette-4', label: '色板 4' },
    ],
  },
  {
    label: '滚动条',
    vars: [
      { name: '--scrollbar-thumb', label: '滚动条滑块' },
      { name: '--scrollbar-thumb-hover', label: '滚动条悬停' },
    ],
  },
  {
    label: '阴影',
    vars: [
      { name: '--shadow-card', label: '卡片阴影' },
      { name: '--shadow-card-hover', label: '卡片悬停阴影' },
      { name: '--shadow-modal', label: '模态阴影' },
    ],
  },
  {
    label: '其他',
    vars: [
      { name: '--divider-bg', label: '分隔线' },
      { name: '--radius', label: '圆角' },
      { name: '--logout-hover-bg', label: '退出按钮悬停' },
      { name: '--btn-ripple', label: '按钮涟漪' },
    ],
  },
]

export const varGroups = RAW_VAR_GROUPS
  .map((g) => ({
    ...g,
    vars: g.vars.filter((v) => isColorVar(v.name)),
  }))
  .filter((g) => g.vars.length > 0)

export const ALLOWED_THEME_VARS = new Set(varGroups.flatMap((g) => g.vars.map((v) => v.name)))

export function isValidThemeVarValue(val) {
  return typeof val === 'string' && val.length > 0 && !/[;{}]/.test(val)
}

/**
 * 解析常见 CSS 颜色格式 (#rgb/#rrggbb/#rrggbbaa/rgb/rgba) 为 RGBA 通道对象。
 * @param {string} value
 * @returns {{ r: number, g: number, b: number, a: number, hasAlpha: boolean } | null}
 */
export function parseCssColor(value) {
  const s = String(value || '').trim()
  if (!s) return null
  if (s.startsWith('#')) {
    const hex = s.slice(1)
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
        hasAlpha: false,
      }
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
        hasAlpha: false,
      }
    }
    if (/^[0-9a-fA-F]{8}$/.test(hex)) {
      const a = Math.round((parseInt(hex.slice(6, 8), 16) / 255) * 100) / 100
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a,
        hasAlpha: a < 1,
      }
    }
    return null
  }
  const m = s.match(/^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i)
  if (!m) return null
  let a = 1
  if (m[4] !== undefined) {
    a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
    if (!Number.isFinite(a)) a = 1
  }
  return {
    r: Math.max(0, Math.min(255, Math.round(Number(m[1])))),
    g: Math.max(0, Math.min(255, Math.round(Number(m[2])))),
    b: Math.max(0, Math.min(255, Math.round(Number(m[3])))),
    a: Math.max(0, Math.min(1, a)),
    hasAlpha: m[4] !== undefined && a < 1,
  }
}

/** 将任意 CSS 颜色值规范为 `<input type="color">` 所需的 `#rrggbb` 格式。 */
export function toHexColor(value, fallback = '#888888') {
  const c = parseCssColor(value)
  if (!c) return fallback
  const h = (n) => n.toString(16).padStart(2, '0')
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`
}

/** 用颜色选择器的新 hex 值更新原颜色值，若原值包含透明度则保留原 alpha。 */
export function mergePickedHex(currentValue, newHex) {
  const prev = parseCssColor(currentValue)
  const next = parseCssColor(newHex)
  if (!next) return newHex
  if (prev && prev.hasAlpha) {
    return `rgba(${next.r}, ${next.g}, ${next.b}, ${prev.a})`
  }
  return toHexColor(newHex)
}

export function isDarkColor(value) {
  const c = parseCssColor(value)
  if (!c) return false
  return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255 < 0.5
}

function clearThemeClasses(root = document.documentElement) {
  for (const cls of Array.from(root.classList)) {
    if (cls.startsWith('theme-')) root.classList.remove(cls)
  }
}

export function clearCustomRootVars(extraKeys = [], root = document.documentElement) {
  for (const name of ALLOWED_THEME_VARS) root.style.removeProperty(name)
  for (const name of extraKeys) {
    if (typeof name === 'string' && name.startsWith('--')) root.style.removeProperty(name)
  }
}

export function applyThemeClass(value) {
  const root = document.documentElement
  clearThemeClasses(root)
  if (value && value !== 'default' && value !== 'custom') {
    root.classList.add(`theme-${value}`)
  }
}

/**
 * 主题预设探针 + 自定义 CSS 变量与年级颜色状态管理。
 * @param {() => object|undefined} getSetting
 * @param {(patch: object) => void} onSettingChange
 */
export function useThemeEditor(getSetting, onSettingChange) {
  const customVars = reactive({})
  const savedSnapshot = reactive({})
  const selectedPresetBase = ref('')
  const themePreviewCache = reactive({})
  let previewTimer = null
  let isPreviewing = false
  let themeProbeFrame = null

  function snapshotCurrentVars() {
    for (const g of varGroups) {
      for (const v of g.vars) {
        savedSnapshot[v.name] = customVars[v.name] || ''
      }
    }
  }

  function ensureThemeProbe() {
    if (themeProbeFrame && themeProbeFrame.contentDocument) return themeProbeFrame
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0;border:0;visibility:hidden'
    document.body.appendChild(frame)
    const doc = frame.contentDocument
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const cssText = Array.from(sheet.cssRules || []).map((r) => r.cssText).join('\n')
        const st = doc.createElement('style')
        st.textContent = cssText
        doc.head.appendChild(st)
      } catch {
        if (sheet.href) {
          const link = doc.createElement('link')
          link.rel = 'stylesheet'
          link.href = sheet.href
          doc.head.appendChild(link)
        }
      }
    }
    themeProbeFrame = frame
    return frame
  }

  function readProbeStyle(presetValue) {
    const frame = ensureThemeProbe()
    const doc = frame.contentDocument
    const rootEl = doc.documentElement
    rootEl.className = presetValue === 'default' ? '' : `theme-${presetValue}`
    return frame.contentWindow.getComputedStyle(rootEl)
  }

  function themeVarsOf(value) {
    if (!themePreviewCache[value]) {
      const fallback = { bg: '#ffffff', side: '#eeeeee', accent: '#888888', text: '#333333' }
      try {
        const s = readProbeStyle(value)
        themePreviewCache[value] = {
          bg: s.getPropertyValue('--bg-app').trim() || fallback.bg,
          side: s.getPropertyValue('--bg-sidebar').trim() || fallback.side,
          accent: s.getPropertyValue('--accent').trim() || fallback.accent,
          text: s.getPropertyValue('--text-primary').trim() || fallback.text,
        }
      } catch {
        themePreviewCache[value] = fallback
      }
    }
    return themePreviewCache[value]
  }

  function isDarkTheme(value) {
    return isDarkColor(themeVarsOf(value).bg)
  }

  function loadCurrentVars() {
    const style = getComputedStyle(document.documentElement)
    for (const g of varGroups) {
      for (const v of g.vars) {
        customVars[v.name] = style.getPropertyValue(v.name).trim()
      }
    }
    snapshotCurrentVars()
  }

  function initVars() {
    const setting = getSetting()
    if (setting?.theme === 'custom' && setting?.customVars) {
      const style = getComputedStyle(document.documentElement)
      for (const g of varGroups) {
        for (const v of g.vars) {
          customVars[v.name] = setting.customVars[v.name] || style.getPropertyValue(v.name).trim()
        }
      }
      selectedPresetBase.value = ''
      snapshotCurrentVars()
    } else {
      selectedPresetBase.value = setting?.theme || 'default'
      loadCurrentVars()
    }
  }

  function loadPresetIntoCustom(presetValue) {
    try {
      const s = readProbeStyle(presetValue)
      for (const g of varGroups) {
        for (const v of g.vars) {
          customVars[v.name] = s.getPropertyValue(v.name).trim()
        }
      }
      selectedPresetBase.value = presetValue
      const label = THEMES.find((t) => t.value === presetValue)?.label || presetValue
      showToast(`已载入「${label}」配色至自定义预览`, 'info')
    } catch {
      loadCurrentVars()
    }
  }

  function updateCustomVar(name, value) {
    customVars[name] = value
    selectedPresetBase.value = ''
  }

  const isCustomDark = computed(() => isDarkColor(customVars['--bg-app'] || '#ffffff'))

  const hasUnsavedChanges = computed(() => {
    const setting = getSetting()
    const notCustomActive = setting?.theme !== 'custom'
    for (const g of varGroups) {
      for (const v of g.vars) {
        if ((customVars[v.name] || '') !== (savedSnapshot[v.name] || '')) return true
      }
    }
    return notCustomActive && selectedPresetBase.value !== (setting?.theme || 'default')
  })

  function selectTheme(value) {
    clearTimeout(previewTimer)
    isPreviewing = false
    const prevCustomKeys = Object.keys(getSetting()?.customVars || {})
    clearCustomRootVars(prevCustomKeys)
    applyThemeClass(value)
    onSettingChange({ theme: value, customVars: null })
    selectedPresetBase.value = value
    loadCurrentVars()
  }

  function previewTheme(value) {
    clearTimeout(previewTimer)
    previewTimer = setTimeout(() => {
      isPreviewing = true
      clearCustomRootVars(Object.keys(getSetting()?.customVars || {}))
      applyThemeClass(value)
    }, 500)
  }

  function restoreTheme() {
    clearTimeout(previewTimer)
    if (isPreviewing) {
      isPreviewing = false
      const setting = getSetting()
      const customKeys = Object.keys(setting?.customVars || {})
      clearCustomRootVars(customKeys)
      applyThemeClass(setting?.theme === 'custom' ? 'default' : setting?.theme || 'default')
      if (setting?.theme === 'custom' && setting?.customVars) {
        const root = document.documentElement
        for (const [k, v] of Object.entries(setting.customVars)) {
          if (ALLOWED_THEME_VARS.has(k) && isValidThemeVarValue(v)) {
            root.style.setProperty(k, v)
          }
        }
      }
    }
  }

  function applyCustom() {
    const root = document.documentElement
    const prevCustomKeys = Object.keys(getSetting()?.customVars || {})
    clearThemeClasses(root)
    clearCustomRootVars(prevCustomKeys, root)
    const savedVars = {}
    for (const g of varGroups) {
      for (const v of g.vars) {
        const val = String(customVars[v.name] || '').trim()
        if (val && isValidThemeVarValue(val)) {
          root.style.setProperty(v.name, val)
          savedVars[v.name] = val
        }
      }
    }
    snapshotCurrentVars()
    onSettingChange({ theme: 'custom', customVars: savedVars })
    showToast('已应用自定义主题', 'success')
  }

  function resetCustom() {
    const root = document.documentElement
    const prevCustomKeys = Object.keys(getSetting()?.customVars || {})
    clearThemeClasses(root)
    clearCustomRootVars(prevCustomKeys, root)
    selectedPresetBase.value = 'default'
    loadCurrentVars()
    onSettingChange({ theme: 'default', customVars: null })
    showToast('已重置为默认主题', 'info')
  }

  function buildThemeCSS() {
    const style = getComputedStyle(document.documentElement)
    let css = ':root {\n'
    for (const g of varGroups) {
      for (const v of g.vars) {
        const val = String(customVars[v.name] || '').trim() || style.getPropertyValue(v.name).trim()
        if (val) css += `  ${v.name}: ${val};\n`
      }
    }
    css += '}'
    return css
  }

  function exportTheme() {
    const payload = JSON.stringify(
      {
        kind: 'theme',
        version: 1,
        css: buildThemeCSS(),
      },
      null,
      2,
    )
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'custom-theme.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function applyCSSText(text) {
    const matches = String(text || '').matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]+);/g)
    const parsedVars = {}
    let applied = false
    for (const m of matches) {
      const name = m[1].trim()
      const val = m[2].trim()
      if (ALLOWED_THEME_VARS.has(name) && isValidThemeVarValue(val)) {
        parsedVars[name] = val
        applied = true
      }
    }
    if (!applied) return false
    const root = document.documentElement
    const prevCustomKeys = Object.keys(getSetting()?.customVars || {})
    clearThemeClasses(root)
    clearCustomRootVars(prevCustomKeys, root)
    for (const [name, val] of Object.entries(parsedVars)) {
      customVars[name] = val
      root.style.setProperty(name, val)
    }
    selectedPresetBase.value = ''
    snapshotCurrentVars()
    onSettingChange({ theme: 'custom', customVars: parsedVars })
    return true
  }

  function importThemeText(text) {
    let j = null
    try {
      j = JSON.parse(String(text || '').trim())
    } catch {
      j = null
    }
    if (!j || typeof j !== 'object' || typeof j.css !== 'string' || (j.kind != null && j.kind !== 'theme')) {
      showAlert({
        title: '导入失败',
        message: '这不是有效的主题配置文件（应为导出的 custom-theme.json）。',
      })
      return
    }
    if (!applyCSSText(j.css)) {
      showAlert({
        title: '导入失败',
        message: '主题配置中未包含有效的受支持配色变量。',
      })
      return
    }
    showToast('主题配置已导入并应用', 'success')
  }

  watch(
    () => [getSetting()?.theme || 'default', JSON.stringify(getSetting()?.customVars || null)],
    () => {
      if (!isPreviewing) initVars()
    },
  )

  function getGradeColorValue(key) {
    const setting = getSetting()
    if (setting?.gradeColors?.[key]) return setting.gradeColors[key]
    const cssVar = getComputedStyle(document.documentElement).getPropertyValue(`--grade-${key}`).trim()
    return cssVar || DEFAULT_PALETTE[key] || '#888888'
  }

  function onGradeColorChange(key, value) {
    const current = { ...getSetting()?.gradeColors }
    current[key] = value
    onSettingChange({ gradeColors: current })
  }

  function onGradeColorHexChange(key, value) {
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      onGradeColorChange(key, value)
    }
  }

  function resetGradeColors() {
    onSettingChange({ gradeColors: {} })
    showToast('年级颜色已恢复默认', 'info')
  }

  onUnmounted(() => {
    clearTimeout(previewTimer)
    try {
      themeProbeFrame?.remove()
    } catch {
      /* ignore */
    }
    themeProbeFrame = null
  })

  return {
    customVars,
    selectedPresetBase,
    isCustomDark,
    hasUnsavedChanges,
    themeVarsOf,
    isDarkTheme,
    initVars,
    loadPresetIntoCustom,
    updateCustomVar,
    selectTheme,
    previewTheme,
    restoreTheme,
    applyCustom,
    resetCustom,
    exportTheme,
    importThemeText,
    getGradeColorValue,
    onGradeColorChange,
    onGradeColorHexChange,
    resetGradeColors,
  }
}
