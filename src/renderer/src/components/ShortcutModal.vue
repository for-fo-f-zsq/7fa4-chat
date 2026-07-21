<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-container">
      <div class="shortcut-modal-card">
        <div class="shortcut-modal-header">
          <h3>快捷键设置</h3>
          <button class="modal-close-btn" @click="$emit('close')"><i class="fas fa-times"></i></button>
        </div>
        <div class="shortcut-modal-body">
          <div class="shortcut-list">
            <div class="shortcut-row" v-for="item in shortcutItems" :key="item.action">
              <span class="shortcut-label">{{ item.label }}</span>
              <div class="shortcut-key-wrap">
                <button
                  class="shortcut-key-btn"
                  :class="{ recording: recordingAction === item.action }"
                  @click="startRecording(item.action)"
                >
                  <template v-if="recordingAction === item.action">
                    <i class="fas fa-circle fa-beat-fade recording-dot"></i> 按下快捷键...
                  </template>
                  <template v-else>
                    {{ formatShortcut(getShortcutValue(item.action)) }}
                  </template>
                </button>
                <button v-if="getShortcutValue(item.action) !== defaultShortcuts[item.action]" class="shortcut-reset-btn" @click="resetShortcut(item.action)" title="恢复默认">
                  <i class="fas fa-undo"></i>
                </button>
              </div>
            </div>
          </div>
          <div class="shortcut-footer">
            <button class="shortcut-reset-all-btn" @click="resetAll">
              <i class="fas fa-undo"></i> 恢复全部默认
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'

const props = defineProps({
  setting: Object
})

const emit = defineEmits(['close', 'settingChange'])

const defaultShortcuts = {
  sendMessage: 'enter',
  search: 'ctrl+f',
  switchToChat: 'ctrl+1',
  switchToFavorites: 'ctrl+2',
  switchToSettings: 'ctrl+3',
  switchToAbout: 'ctrl+4',
  newConversation: 'ctrl+n',
  screenshot: 'ctrl+shift+s'
}

const shortcutItems = [
  { action: 'sendMessage', label: '发送消息' },
  { action: 'search', label: '搜索' },
  { action: 'switchToChat', label: '切换到消息' },
  { action: 'switchToFavorites', label: '切换到收藏' },
  { action: 'switchToSettings', label: '切换到设置' },
  { action: 'switchToAbout', label: '切换到关于' },
  { action: 'newConversation', label: '新建会话' },
  { action: 'screenshot', label: '截图' }
]

const recordingAction = ref(null)

function getShortcutValue(action) {
  return props.setting?.shortcuts?.[action] || defaultShortcuts[action]
}

function formatShortcut(shortcut) {
  if (!shortcut) return '未设置'
  return shortcut
    .split('+')
    .map(part => {
      if (part === 'ctrl') return 'Ctrl'
      if (part === 'meta') return 'Cmd'
      if (part === 'shift') return 'Shift'
      if (part === 'alt') return 'Alt'
      return part.toUpperCase()
    })
    .join(' + ')
}

function startRecording(action) {
  if (recordingAction.value === action) {
    recordingAction.value = null
    return
  }
  recordingAction.value = action
  document.addEventListener('keydown', onRecordingKeydown)
}

function onRecordingKeydown(e) {
  if (!recordingAction.value) return
  if (['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) return
  e.preventDefault()
  e.stopPropagation()

  // Escape 取消录制
  if (e.key === 'Escape') {
    recordingAction.value = null
    document.removeEventListener('keydown', onRecordingKeydown)
    return
  }

  const parts = []
  if (e.ctrlKey) parts.push('ctrl')
  if (e.metaKey) parts.push('meta')
  if (e.shiftKey) parts.push('shift')
  if (e.altKey) parts.push('alt')
  parts.push(e.key.toLowerCase())

  const shortcut = parts.join('+')

  // 检查冲突：是否与其他快捷键重复
  const conflictAction = shortcutItems
    .filter(item => item.action !== recordingAction.value)
    .find(item => getShortcutValue(item.action) === shortcut)
  if (conflictAction) {
    recordingAction.value = null
    document.removeEventListener('keydown', onRecordingKeydown)
    return
  }

  const currentShortcuts = { ...(props.setting?.shortcuts || {}) }
  currentShortcuts[recordingAction.value] = shortcut
  emit('settingChange', { shortcuts: currentShortcuts })
  recordingAction.value = null
  document.removeEventListener('keydown', onRecordingKeydown)
}

function resetShortcut(action) {
  const currentShortcuts = { ...(props.setting?.shortcuts || {}) }
  delete currentShortcuts[action]
  emit('settingChange', { shortcuts: currentShortcuts })
}

function resetAll() {
  emit('settingChange', { shortcuts: {} })
}

onUnmounted(() => {
  recordingAction.value = null
  document.removeEventListener('keydown', onRecordingKeydown)
})
</script>
