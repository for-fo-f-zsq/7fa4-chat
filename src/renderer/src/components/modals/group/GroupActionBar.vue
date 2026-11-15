<template>
  <div class="action-panel">
    <div class="action-panel-field">
      <UiDropdown
        :model-value="actionType"
        :options="availableActions"
        size="sm"
        aria-label="选择群操作"
        @update:model-value="onActionSelect"
      />
    </div>

    <div v-if="showChooseUser && filteredUserOptions.length" class="action-panel-field">
      <UiDropdown
        :model-value="userModelValue"
        :options="filteredUserOptions"
        :multiple="multiSelect"
        :searchable="true"
        :select-all="multiSelect"
        size="sm"
        placeholder="选择用户"
        aria-label="选择目标成员"
        @update:model-value="onUsersUpdate"
      />
    </div>

    <div v-if="showMuteTime" class="action-panel-field">
      <UiInput
        :model-value="String(muteMinutes)"
        size="sm"
        type="number"
        placeholder="禁言分钟"
        @update:model-value="(v) => (muteMinutes = Number(v) || 0)"
      />
    </div>

    <div v-if="showNewName" class="action-panel-field">
      <UiInput v-model="newName" size="sm" placeholder="新群名" />
    </div>

    <UiButton
      variant="primary"
      size="md"
      :loading="!!progress?.show"
      :disabled="!!progress?.show"
      @click="execute"
    >
      {{ progress?.show ? progressLabel : '执行' }}
    </UiButton>

    <div v-if="selectError" class="group-select-error">{{ selectError }}</div>
  </div>

  <div v-if="progress?.show" class="group-progress-wrap">
    <UiProgress :value="progressPercent" size="sm" :label="progress.label || '处理中…'" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { UiButton, UiDropdown, UiInput, UiProgress } from '@/ui'
import {
  SINGLE_SELECT_ACTIONS,
  USER_SELECT_ACTIONS,
} from '@/composables/modals/useGroupMembers.js'

const props = defineProps({
  availableActions: { type: Array, default: () => [] },
  filteredUserOptions: { type: Array, default: () => [] },
  actionType: { type: String, required: true },
  progress: { type: Object, default: null },
})

const emit = defineEmits(['update:actionType', 'submit', 'closeModal'])

const selectedUsers = ref([])
const selectError = ref('')
const muteMinutes = ref(60)
const newName = ref('')

const showChooseUser = computed(() => USER_SELECT_ACTIONS.includes(props.actionType))
const showMuteTime = computed(() => ['mute_member', 'mute_group'].includes(props.actionType))
const showNewName = computed(() => props.actionType === 'set_title')
const multiSelect = computed(() => !SINGLE_SELECT_ACTIONS.includes(props.actionType))

const userModelValue = computed(() =>
  multiSelect.value ? selectedUsers.value : (selectedUsers.value[0] || '')
)

const progressPercent = computed(() => {
  if (!props.progress?.total) return 0
  return Math.round((props.progress.current / props.progress.total) * 100)
})

const progressLabel = computed(() => props.progress?.label || '处理中…')

watch(
  () => props.actionType,
  () => {
    selectedUsers.value = []
    selectError.value = ''
    muteMinutes.value = 60
    newName.value = ''
  }
)

function onActionSelect(val) {
  emit('update:actionType', val)
}

function onUsersUpdate(val) {
  selectError.value = ''
  selectedUsers.value = Array.isArray(val) ? val.map(String) : (val ? [String(val)] : [])
}

function execute() {
  if (showChooseUser.value && selectedUsers.value.length === 0) {
    selectError.value = '请至少选择一名成员'
    return
  }
  selectError.value = ''
  emit('submit', {
    type: props.actionType,
    targetIds: selectedUsers.value,
    targetId: '',
    muteMinutes: muteMinutes.value,
    title: newName.value,
  })
  if (['leave', 'dissolve', 'block'].includes(props.actionType)) {
    emit('closeModal')
  }
}
</script>
