<template>
  <UiModal v-model:open="visible" title="快捷键设置" size="sm" @closed="emit('close')">
    <div class="shortcut-list">
      <div
        v-for="item in shortcutItems"
        :key="item.action"
        class="p-list-row shortcut-row"
      >
        <span class="p-list-row__main shortcut-label">{{ item.label }}</span>
        <div class="shortcut-key-wrap">
          <UiButton
            class="shortcut-key-btn u-tabular-nums"
            size="sm"
            :variant="recordingAction === item.action ? 'primary' : 'secondary'"
            @click="startRecording(item.action)"
          >
            <template v-if="recordingAction === item.action">
              <i class="fas fa-circle fa-beat-fade recording-dot"></i> 按下快捷键...
            </template>
            <template v-else>
              {{ formatShortcut(getShortcutValue(item.action)) }}
            </template>
          </UiButton>
          <UiIconButton
            v-if="getShortcutValue(item.action) !== defaultShortcuts[item.action]"
            size="sm"
            icon="fas fa-undo"
            aria-label="恢复默认"
            @click="resetShortcut(item.action)"
          />
        </div>
      </div>
    </div>
    <template #footer>
      <UiButton size="sm" variant="secondary" icon="fas fa-undo" @click="resetAll">恢复全部默认</UiButton>
    </template>
  </UiModal>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { UiButton, UiIconButton, UiModal } from '@/ui'
import { isWebBrowser } from '@/utils.js'

const props = defineProps({
  setting: Object,
})

const emit = defineEmits(['close', 'settingChange'])
const isWeb = isWebBrowser()

const defaultShortcuts = {
  sendMessage: 'enter',
  search: 'ctrl+f',
  switchToChat: 'ctrl+1',
  switchToTools: 'ctrl+2',
  switchToSettings: 'ctrl+3',
  switchToAbout: 'ctrl+4',
  newConversation: 'ctrl+n',
}

const shortcutItems = [
  { action: 'sendMessage', label: '发送消息' },
  { action: 'search', label: '搜索' },
  { action: 'switchToChat', label: '切换到消息' },
  ...(!isWeb ? [{ action: 'switchToTools', label: '切换到工具' }] : []),
  { action: 'switchToSettings', label: '切换到设置' },
  { action: 'switchToAbout', label: '切换到关于' },
  { action: 'newConversation', label: '新建会话' },
]

const recordingAction = ref(null)
const visible = ref(false)

onMounted(async () => {
  await nextTick()
  visible.value = true
})

function getShortcutValue(action) {
  return props.setting?.shortcuts?.[action] || defaultShortcuts[action]
}

function formatShortcut(shortcut) {
  if (!shortcut) return '未设置'
  return shortcut
    .split('+')
    .map((part) => {
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
    document.removeEventListener('keydown', onRecordingKeydown)
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

  const conflictAction = shortcutItems
    .filter((item) => item.action !== recordingAction.value)
    .find((item) => getShortcutValue(item.action) === shortcut)
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

<style scoped src="../../css/components/shortcut-modal.css"></style>
