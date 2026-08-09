<template>
  <div class="settings-panel">
    <div class="settings-header">
      <h2>设置</h2>
    </div>
    <div class="settings-card">
      <div class="info-grid">
        <div class="info-row"><span class="info-label">UID</span><span class="info-value">{{ self.uid }}</span></div>
        <div class="info-row" v-if="self.username"><span class="info-label">用户名</span><span class="info-value">{{ self.username }}</span></div>
        <div class="info-row" v-if="self.nickname"><span class="info-label">昵称</span><span class="info-value">{{ self.nickname }}</span></div>
        <div class="info-row" v-if="self.realname"><span class="info-label">真名</span><span class="info-value">{{ self.realname }}</span></div>
        <div class="info-row" v-if="self.school"><span class="info-label">学校</span><span class="info-value">{{ self.school }}</span></div>
        <div class="info-row" v-if="self.seat"><span class="info-label">座位</span><span class="info-value">{{ self.seat }}</span></div>
      </div>
      <div class="settings-divider"></div>
      <div class="options-grid">
        <div class="options-col">
          <div class="option-row">
            <span class="option-label">API 地址</span>
            <div class="custom-select" :class="{ open: apiUrlOpen }" @click="apiUrlOpen = !apiUrlOpen" v-click-outside="() => apiUrlOpen = false">
              <div class="custom-select-trigger"><span>{{ apiUrlLabel }}</span><i class="fas fa-chevron-down custom-select-arrow"></i></div>
              <div class="custom-select-dropdown" v-if="apiUrlOpen">
                <div class="custom-select-option" v-for="o in apiUrlOptions" :key="o.value" :class="{ active: (setting.apiUrl || 'http://jx.7fa4.cn') === o.value }" @click.stop="selectApiUrl(o.value)">
                  <span class="cs-dot" :style="{ background: o.color }"></span><span>{{ o.label }}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="option-row theme-row" @click="$emit('openThemeModal')">
            <span class="option-label">主题</span>
            <div class="theme-current"><span class="theme-dot" :style="{ background: currentThemeColor }"></span><span>{{ currentThemeLabel }}</span><i class="fas fa-chevron-right theme-row-arrow"></i></div>
          </div>
          <div class="option-row">
            <span class="option-label">特效</span>
            <div class="custom-select" :class="{ open: effectOpen }" @click="effectOpen = !effectOpen" v-click-outside="() => effectOpen = false">
              <div class="custom-select-trigger"><span>{{ effectLabel }}</span><i class="fas fa-chevron-down custom-select-arrow"></i></div>
              <div class="custom-select-dropdown" v-if="effectOpen">
                <div class="custom-select-option" v-for="o in effectOptions" :key="o.value" :class="{ active: (setting.effectLevel || 'fancy') === o.value }" @click.stop="selectEffect(o.value)">
                  <i :class="o.icon" class="cs-icon"></i><div class="cs-info"><span class="cs-name">{{ o.label }}</span><span class="cs-desc">{{ o.desc }}</span></div>
                </div>
              </div>
            </div>
          </div>
          <div class="option-row slider-row">
            <span class="option-label">轮询间隔</span>
            <div class="slider-wrap">
              <input type="range" class="slider" :value="setting.pollInterval || 1000" @input="onPollChange($event.target.value)" min="1000" max="10000" step="100" />
              <span class="slider-value">{{ formatPoll(setting.pollInterval || 1000) }}</span>
            </div>
          </div>
          <div class="option-row slider-row">
            <span class="option-label">字体大小</span>
            <div class="slider-wrap">
              <input type="range" class="slider" :value="setting.fontSize || 14" @input="onFontSizeChange($event.target.value)" min="12" max="20" step="1" />
              <span class="slider-value">{{ setting.fontSize || 14 }}px</span>
            </div>
          </div>
          <div class="option-row shortcut-entry" @click="$emit('openShortcutModal')">
            <span class="option-label">快捷键</span>
            <div class="shortcut-entry-right"><span class="shortcut-entry-hint">自定义</span><i class="fas fa-chevron-right theme-row-arrow"></i></div>
          </div>
        </div>
        <div class="options-col">
          <div class="option-row">
            <span class="option-label">保持后台运行</span>
            <label class="toggle-label"><input type="checkbox" :checked="setting.minimizeToTray !== false" @change="onSettingChange('minimizeToTray', $event.target.checked)" /><span class="toggle-slider"></span></label>
          </div>
          <div class="option-row">
            <span class="option-label">自动更新</span>
            <label class="toggle-label"><input type="checkbox" :checked="setting.autoUpdate !== false" @change="onSettingChange('autoUpdate', $event.target.checked)" /><span class="toggle-slider"></span></label>
          </div>
          <div class="option-row">
            <span class="option-label">保持登录</span>
            <label class="toggle-label css-locked" :class="{ locked: !setting.keepLogin }"><input type="checkbox" :checked="setting.keepLogin" :disabled="!setting.keepLogin" @change="onKeepLoginChange($event.target.checked)" /><span class="toggle-slider"></span></label>
          </div>
          <div class="option-row">
            <span class="option-label">隐藏弹窗内容</span>
            <label class="toggle-label"><input type="checkbox" :checked="setting.notifPrivacy" @change="onSettingChange('notifPrivacy', $event.target.checked)" /><span class="toggle-slider"></span></label>
          </div>
          <div class="option-row">
            <span class="option-label">免打扰</span>
            <label class="toggle-label"><input type="checkbox" :checked="setting.dndEnabled" @change="onSettingChange('dndEnabled', $event.target.checked)" /><span class="toggle-slider"></span></label>
          </div>
        </div>
      </div>
      <div class="settings-divider"></div>
      <div class="option-row shortcut-entry" @click="exportData">
        <span class="option-label">备份聊天数据</span>
        <div class="shortcut-entry-right"><span class="shortcut-entry-hint">导出到文件</span><i class="fas fa-download theme-row-arrow"></i></div>
      </div>
      <div class="option-row shortcut-entry" @click="importData">
        <span class="option-label">恢复聊天数据</span>
        <div class="shortcut-entry-right"><span class="shortcut-entry-hint">从文件导入</span><i class="fas fa-upload theme-row-arrow"></i></div>
      </div>
      <div class="option-row shortcut-entry" v-if="cacheSize !== null" @click="clearCache">
        <span class="option-label">缓存管理</span>
        <div class="shortcut-entry-right"><span class="shortcut-entry-hint">{{ formatSize(cacheSize) }} · 点击清理</span><i class="fas fa-trash theme-row-arrow"></i></div>
      </div>
    </div>
    <button class="logout-btn" @click="$emit('logout')"><i class="fas fa-sign-out-alt"></i> 退出登录</button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { store } from '../store.js'
import { vClickOutside } from '../composables/vClickOutside.js'
import { THEMES } from '../composables/constants.js'
import { applyFontSize, formatSize } from '../utils.js'

const props = defineProps({
  self: Object,
  setting: Object
})

const emit = defineEmits(['logout', 'settingChange', 'openThemeModal', 'openShortcutModal'])

onMounted(() => { loadCacheSize() })

const apiUrlOpen = ref(false)
const effectOpen = ref(false)
const cacheSize = ref(null)

const themes = THEMES

const apiUrlOptions = [
  { value: 'http://jx.7fa4.cn', label: 'jx.7fa4.cn', color: '#E67E22' },
  { value: 'http://in.7fa4.cn', label: 'in.7fa4.cn', color: '#12B7F5' }
]

const currentTheme = computed(() => props.setting?.theme || 'default')
const currentThemeLabel = computed(() => {
  if (currentTheme.value === 'custom') return '自定义（Custom）'
  return themes.find(t => t.value === currentTheme.value)?.label || 'QQ'
})
const currentThemeColor = computed(() => {
  if (currentTheme.value === 'custom') return 'var(--accent)'
  return themes.find(t => t.value === currentTheme.value)?.color || '#3C8CE7'
})
const apiUrlLabel = computed(() => {
  const v = props.setting?.apiUrl || 'http://jx.7fa4.cn'
  return apiUrlOptions.find(o => o.value === v)?.label || v
})

const effectOptions = [
  { value: 'performance', label: '性能', desc: '无粒子和鼠标渐变', icon: 'fas fa-bolt' },
  { value: 'efficiency', label: '效率', desc: '无粒子效果', icon: 'fas fa-feather' },
  { value: 'fancy', label: '精美', desc: '全部效果', icon: 'fas fa-magic' }
]

const effectLabel = computed(() => {
  const v = props.setting?.effectLevel || 'fancy'
  return effectOptions.find(o => o.value === v)?.label || '精美'
})

function selectApiUrl(value) { apiUrlOpen.value = false; emit('settingChange', { apiUrl: value }) }
function selectEffect(value) { effectOpen.value = false; emit('settingChange', { effectLevel: value }) }

function onSettingChange(key, value) { emit('settingChange', { [key]: value }) }
function onPollChange(val) { emit('settingChange', { pollInterval: Number(val) }) }
function onFontSizeChange(val) {
  const size = Number(val)
  emit('settingChange', { fontSize: size })
  applyFontSize(size)
}

function formatPoll(ms) {
  if (ms >= 1000) return (ms / 1000).toFixed(1) + 's'
  return ms + 'ms'
}

function onKeepLoginChange(checked) {
  if (!checked) emit('settingChange', { keepLogin: false, loginUsername: '', loginPassword: '' })
}

// ========== 缓存管理 ==========
async function loadCacheSize() {
  try {
    const r = await window.api.getCacheSize()
    if (r.success) cacheSize.value = r.size
  } catch {}
}

async function clearCache() {
  if (!confirm('确定要清理缓存吗？这将删除所有本地聊天数据并从服务器重新拉取。')) return
  try {
    const r = await window.api.clearCache()
    if (r.success) {
      cacheSize.value = 0
      emit('settingChange', { _clearCache: true })
    }
  } catch {}
}

// ========== 备份/恢复 ==========
async function exportData() {
  try {
    const uid = store.self.uid
    if (!uid) { alert('未登录，无法备份'); return }
    // 从 SQLite 全量导出（含所有历史消息，内存可能只加载了活跃会话）
    const r = await window.api.storeExportAll(uid)
    if (!r.success) { alert('备份失败：' + (r.error || '存储不可用')); return }
    const data = JSON.stringify({
      users: r.users,
      groups: r.groups,
      messages: r.messages,
      drafts: (r.prefs && r.prefs.drafts) || {},
      favorites: (r.prefs && r.prefs.favorites) || [],
      stickers: (r.prefs && r.prefs.stickers) || [],
      mutedConvos: (r.prefs && r.prefs.mutedConvos) || {},
      hiddenConvos: (r.prefs && r.prefs.hiddenConvos) || {},
      deletedMsgIds: (r.prefs && r.prefs.deletedMsgIds) || []
    })
    const saveR = await window.api.exportData(data)
    if (saveR.success) alert('备份成功：' + saveR.path)
  } catch (e) { alert('备份失败：' + e.message) }
}

async function importData() {
  try {
    const uid = store.self.uid
    if (!uid) { alert('未登录，无法恢复'); return }
    const r = await window.api.importData()
    if (!r.success || !r.data) return
    const loaded = JSON.parse(r.data)
    if (loaded.users) store.users = loaded.users
    if (loaded.groups) store.groups = loaded.groups
    if (loaded.messages) store.messages = loaded.messages
    if (loaded.stickers) store.stickers = loaded.stickers
    if (loaded.drafts) store.drafts = loaded.drafts
    if (loaded.favorites) store.favorites = loaded.favorites
    if (loaded.mutedConvos) store.mutedConvos = loaded.mutedConvos
    if (loaded.hiddenConvos) store.hiddenConvos = loaded.hiddenConvos
    if (loaded.deletedMsgIds) store.deletedMsgIds = loaded.deletedMsgIds
    // 同步写入 SQLite（消息按会话归属，事务批量）
    const imp = await window.api.storeImportAll(uid, loaded)
    if (!imp.success) { alert('恢复警告：写入本地存储失败（' + (imp.error || '') + '）'); return }
    alert('恢复成功')
  } catch (e) { alert('恢复失败：' + e.message) }
}
</script>

<style scoped>
.search-date {
  padding: 4px 6px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 4px;
  font-size: 13px;
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #333);
}
</style>
