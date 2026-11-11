<template>
  <div class="settings-panel">
    <div class="settings-header">
      <h2 class="page-title"><i class="fas fa-cog"></i> 设置</h2>
    </div>
    <div class="settings-card">
      <div class="options-grid">
        <div class="options-col">
          <!-- 网页版固定走当前站点（同源），没有 jx/in 可切，整行隐藏 -->
          <div class="option-row" v-if="!isWeb">
            <span class="option-label">API 地址<i class="fas fa-circle-info option-info" title="选择连接的服务器：jx.7fa4.cn 为默认站点，in.7fa4.cn 为校内备用入口"></i></span>
            <UiDropdown
              class="settings-select"
              :model-value="apiUrlValue"
              :options="apiUrlOptions"
              aria-label="API 地址"
              @update:model-value="selectApiUrl"
            />
          </div>
          <div class="option-row theme-row" role="button" tabindex="0" @click="$emit('openThemeModal')" @keydown.enter="$emit('openThemeModal')" @keydown.space.prevent="$emit('openThemeModal')">
            <span class="option-label">主题<i class="fas fa-circle-info option-info" title="切换界面配色，内置 6 套预设主题与「自定义」；自定义可逐项调整颜色"></i></span>
            <div class="theme-current"><UiBadge dot :color="currentThemeColor" :title="currentThemeLabel" /><span>{{ currentThemeLabel }}</span><i class="fas fa-chevron-right theme-row-arrow"></i></div>
          </div>
          <div class="option-row">
            <span class="option-label">特效<i class="fas fa-circle-info option-info" title="界面动效强度：性能（无粒子与鼠标渐变）/ 效率（无粒子）/ 精美（全部效果）"></i></span>
            <UiDropdown
              class="settings-select"
              :model-value="effectValue"
              :options="effectOptions"
              aria-label="特效强度"
              @update:model-value="selectEffect"
            />
          </div>
          <div class="option-row slider-row">
            <span class="option-label">轮询间隔<i class="fas fa-circle-info option-info" title="多久向服务器拉取一次新消息（1.0–10.0 秒）；越短越及时，也越耗流量与电量"></i></span>
            <div class="slider-wrap">
              <input type="range" class="slider" :value="setting.pollInterval || 1000" @input="onPollChange($event.target.value)" min="1000" max="10000" step="100" aria-label="轮询间隔" />
              <span class="slider-value">{{ formatPoll(setting.pollInterval || 1000) }}</span>
            </div>
          </div>
          <div class="option-row slider-row">
            <span class="option-label">字体大小<i class="fas fa-circle-info option-info" title="聊天与界面文字的字号（12–20 px），调整后立即生效"></i></span>
            <div class="slider-wrap">
              <input type="range" class="slider" :value="setting.fontSize || 14" @input="onFontSizeChange($event.target.value)" min="12" max="20" step="1" aria-label="字体大小" />
              <span class="slider-value">{{ setting.fontSize || 14 }}px</span>
            </div>
          </div>
          <div class="option-row shortcut-entry" role="button" tabindex="0" @click="$emit('openShortcutModal')" @keydown.enter="$emit('openShortcutModal')" @keydown.space.prevent="$emit('openShortcutModal')">
            <span class="option-label">快捷键<i class="fas fa-circle-info option-info" title="自定义页面切换与常用操作的键盘快捷键"></i></span>
            <div class="shortcut-entry-right"><span class="shortcut-entry-hint">自定义</span><i class="fas fa-chevron-right theme-row-arrow"></i></div>
          </div>
        </div>
        <div class="options-col">
          <!-- 「保持后台运行」只由 Electron 主进程消费（见 src/main/index.js），
               网页端与安卓端没有任何实现，显示出来会让人误以为已开启。 -->
          <div class="option-row" v-if="isElectron">
            <span class="option-label">保持后台运行<i class="fas fa-circle-info option-info" title="关闭主窗口后隐藏到系统托盘并继续接收消息；需要彻底退出时用托盘菜单的「退出」（仅桌面端）"></i></span>
            <UiSwitch :model-value="setting.minimizeToTray !== false" aria-label="保持后台运行" @update:model-value="onSettingChange('minimizeToTray', $event)" />
          </div>
          <div class="option-row" v-if="isElectron">
            <span class="option-label">自动更新<i class="fas fa-circle-info option-info" title="启动后自动检查并下载新版本（仅桌面端）"></i></span>
            <UiSwitch :model-value="setting.autoUpdate !== false" aria-label="自动更新" @update:model-value="onSettingChange('autoUpdate', $event)" />
          </div>
          <div class="option-row">
            <span class="option-label">保持登录<i class="fas fa-circle-info option-info" title="在本机保存登录凭据以便下次自动登录；关闭会清除已保存的账号与密码，之后需要重新登录"></i></span>
            <UiSwitch :model-value="!!setting.keepLogin" :disabled="!setting.keepLogin" aria-label="保持登录" @update:model-value="onKeepLoginChange" />
          </div>
          <div class="option-row">
            <span class="option-label">隐藏弹窗内容<i class="fas fa-circle-info option-info" title="系统通知只显示「收到一条新消息」，不显示消息正文"></i></span>
            <UiSwitch :model-value="!!setting.notifPrivacy" aria-label="隐藏弹窗内容" @update:model-value="onSettingChange('notifPrivacy', $event)" />
          </div>
          <div class="option-row">
            <span class="option-label">免打扰<i class="fas fa-circle-info option-info" title="开启后不再弹出任何新消息通知（消息照常接收，只是不提醒）"></i></span>
            <UiSwitch :model-value="!!setting.dndEnabled" aria-label="免打扰" @update:model-value="onSettingChange('dndEnabled', $event)" />
          </div>
          <div class="option-row">
            <span class="option-label">隐藏非双向好友<i class="fas fa-circle-info option-info" title="开启后，会话列表只保留互相关注的好友（单向关注的关系将隐藏，数据不会被删除）"></i></span>
            <UiSwitch :model-value="setting.hideNonMutual === true" aria-label="隐藏非双向好友" @update:model-value="onSettingChange('hideNonMutual', $event)" />
          </div>
        </div>
      </div>
      <div class="settings-divider" v-if="!isWeb"></div>
      <div class="option-row shortcut-entry" v-if="!isWeb" role="button" tabindex="0" @click="exportData" @keydown.enter="exportData" @keydown.space.prevent="exportData">
        <span class="option-label">备份聊天数据<i class="fas fa-circle-info option-info" title="把本机的聊天记录、群与设置全部导出为一个文件" @click.stop></i></span>
        <div class="shortcut-entry-right"><span class="shortcut-entry-hint">导出到文件</span><i class="fas fa-download theme-row-arrow"></i></div>
      </div>
      <div class="option-row shortcut-entry" v-if="!isWeb" role="button" tabindex="0" @click="importData" @keydown.enter="importData" @keydown.space.prevent="importData">
        <span class="option-label">恢复聊天数据<i class="fas fa-circle-info option-info" title="从备份文件恢复聊天记录与设置；会写入并覆盖本机对应数据" @click.stop></i></span>
        <div class="shortcut-entry-right"><span class="shortcut-entry-hint">从文件导入</span><i class="fas fa-upload theme-row-arrow"></i></div>
      </div>
      <div class="option-row shortcut-entry" v-if="!isWeb && cacheSize !== null" role="button" tabindex="0" @click="clearCache" @keydown.enter="clearCache" @keydown.space.prevent="clearCache">
        <span class="option-label">缓存管理<i class="fas fa-circle-info option-info" title="本机聊天数据的占用空间；点击清理会删除本地缓存并从服务器重新拉取" @click.stop></i></span>
        <div class="shortcut-entry-right"><span class="shortcut-entry-hint">{{ formatSize(cacheSize) }} · 点击清理</span><i class="fas fa-trash theme-row-arrow"></i></div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 用法：<SettingsPanel :self="self" :setting="setting" @setting-change="save" @open-theme-modal="..." />

import { ref, computed, onMounted } from 'vue'
import { store } from '../store.js'
import { THEMES } from '../composables/constants.js'
import { applyFontSize, formatSize, isWebBrowser } from '../utils.js'
import { UiBadge, UiDropdown, UiSwitch } from '@/ui'

const props = defineProps({
  self: Object,
  setting: Object
})

const emit = defineEmits(['logout', 'settingChange', 'openThemeModal', 'openShortcutModal'])

onMounted(() => { if (!isWeb) loadCacheSize() })

const cacheSize = ref(null)

// 是否 Electron 桌面端：直接读 __7FA4_WEB__（= 「非 Electron」）。
// 不要用 isWebBrowser()——它对 Electron 和 Android 都返回 false，会把安卓也算成桌面端。
const isElectron = !window.__7FA4_WEB__
// 网页版：API 与页面同源，不提供 jx / in 切换
const isWeb = isWebBrowser()

const themes = THEMES

const apiUrlOptions = [
  { value: 'https://jx.7fa4.cn', label: 'jx.7fa4.cn', color: '#E67E22' },
  { value: 'https://in.7fa4.cn', label: 'in.7fa4.cn', color: '#12B7F5' }
]

const currentTheme = computed(() => props.setting?.theme || 'default')
const currentThemeLabel = computed(() => {
  if (currentTheme.value === 'custom') return '自定义（Custom）'
  return themes.find(t => t.value === currentTheme.value)?.label || '雾蓝（Default）'
})
const currentThemeColor = computed(() => {
  if (currentTheme.value === 'custom') return 'var(--accent)'
  return themes.find(t => t.value === currentTheme.value)?.color || '#3C8CE7'
})
const apiUrlValue = computed(() => (props.setting?.apiUrl || 'https://jx.7fa4.cn').replace(/^http:\/\//, 'https://'))
const effectValue = computed(() => props.setting?.effectLevel || 'fancy')

const effectOptions = [
  { value: 'performance', label: '性能', desc: '无粒子和鼠标渐变', icon: 'fas fa-bolt' },
  { value: 'efficiency', label: '效率', desc: '无粒子效果', icon: 'fas fa-feather' },
  { value: 'fancy', label: '精美', desc: '全部效果', icon: 'fas fa-magic' }
]

function selectApiUrl(value) { emit('settingChange', { apiUrl: value }) }
function selectEffect(value) { emit('settingChange', { effectLevel: value }) }

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
    // 全量备份：系统数据（prefs 聚合）+ 设置（setting）
    const prefs = { ...((r.prefs && typeof r.prefs === 'object') ? r.prefs : {}) }
    const data = JSON.stringify({
      kind: 'full',
      version: 1,
      users: r.users,
      groups: r.groups,
      messages: r.messages,
      prefs,
      setting: { ...(props.setting || {}) }
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
    // v1 格式：prefs 聚合 + setting
    if (loaded.users) store.users = loaded.users
    if (loaded.groups) store.groups = loaded.groups
    if (loaded.messages) store.messages = loaded.messages
    if (loaded.prefs && typeof loaded.prefs === 'object') {
      const CORE = ['users', 'groups', 'messages', 'self', 'setting']
      for (const [k, v] of Object.entries(loaded.prefs)) {
        if (!CORE.includes(k) && k in store) store[k] = v
      }
    }
    if (loaded.setting && typeof loaded.setting === 'object') {
      emit('settingChange', loaded.setting) // 整体恢复设置（主题 / 年级颜色 / API 地址等）
    }
    // 同步写入 SQLite（消息按会话归属，事务批量）
    const imp = await window.api.storeImportAll(uid, loaded)
    if (!imp.success) { alert('恢复警告：写入本地存储失败（' + (imp.error || '') + '）'); return }
    alert('恢复成功')
  } catch (e) { alert('恢复失败：' + e.message) }
}
</script>

<style scoped src="../css/settings-panel.css"></style>
