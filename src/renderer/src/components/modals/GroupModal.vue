<template>
  <UiModal v-model:open="modalOpen" size="md" aria-label="群聊详情" @closed="finishClose">
    <template #header>
      <div class="group-detail-header">
        <div class="group-avatar-section">
          <UiAvatar
            shape="rounded"
            size="2xl"
            :color="avatarTint('group:' + (group?.name || ''))"
            :name="group?.name || '群'"
          />
        </div>
        <div class="group-name-wrapper">
          <EditableTitle
            :value="group?.name || ''"
            :editable="canEditName"
            :maxlength="50"
            @save="saveGroupName"
          />
        </div>
      </div>
    </template>

    <template v-if="group">
      <div class="group-info-section">
        <div class="group-info-item">
          <span class="group-info-label">群ID</span>
          <span class="group-info-value u-tabular-nums">{{ groupId }}</span>
        </div>
        <div class="group-info-item">
          <span class="group-info-label">成员数</span>
          <span class="group-info-value u-tabular-nums">{{ group.users.length }} 人</span>
        </div>
        <div class="group-info-item">
          <span class="group-info-label">我的身份</span>
          <span class="group-info-value">
            <UiBadge :variant="roleBadgeVariant(selfType)" size="sm">{{ roleLabel(selfType) }}</UiBadge>
          </span>
        </div>
        <div class="group-info-item">
          <span class="group-info-label">我的禁言</span>
          <span class="group-info-value">
            <UiBadge :variant="selfMuteTime > nowSeconds ? 'danger' : 'neutral'" size="sm">
              {{ selfMuteTime > nowSeconds ? getMutetime(selfMuteTime, nowSeconds) : '正常' }}
            </UiBadge>
          </span>
        </div>
      </div>

      <GroupMemberTable
        ref="memberTableRef"
        :group-id="groupId"
        :group-mute="group.mute || 0"
        :members="group.users"
        :users="store.users"
        @openuserinfo="emit('openuserinfo', $event)"
        @switchToChat="emit('switchToChat', $event)"
        @submit="emit('submit', $event)"
        @closeModal="closeModal"
      />

      <GroupActionBar
        v-model:action-type="actionType"
        :available-actions="availableActions"
        :filtered-user-options="filteredUserOptions"
        :progress="progress"
        @submit="emit('submit', $event)"
        @closeModal="closeModal"
      />
    </template>
  </UiModal>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { UiAvatar, UiBadge, UiModal } from '@/ui'
import { store } from '@/store.js'
import { avatarTint, getMutetime } from '@/utils.js'
import { useNowSeconds } from '@/composables/useNowSeconds.js'
import {
  roleBadgeVariant,
  roleLabel,
  useGroupMembers,
} from '@/composables/modals/useGroupMembers.js'
import EditableTitle from '@/components/common/EditableTitle.vue'
import GroupMemberTable from './group/GroupMemberTable.vue'
import GroupActionBar from './group/GroupActionBar.vue'

const props = defineProps({
  groupId: [String, Number],
  groups: Object,
  users: Object,
  selfUid: [String, Number],
  progress: { type: Object, default: null },
})

const emit = defineEmits(['close', 'submit', 'openuserinfo', 'switchToChat'])

const modalOpen = ref(false)
const memberTableRef = ref(null)
const actionType = ref('leave')

const group = computed(() => props.groups?.[props.groupId] || null)
const selfUidRef = computed(() => props.selfUid)
const nowSeconds = useNowSeconds()

const { selfType, selfMuteTime, canEditName, availableActions, filteredUserOptions } =
  useGroupMembers(group, selfUidRef, actionType)

watch(
  availableActions,
  (actions) => {
    if (actions.length && !actions.find((a) => a.value === actionType.value)) {
      actionType.value = actions[0].value
    }
  },
  { immediate: true }
)

function closeModal() {
  modalOpen.value = false
}

function finishClose() {
  emit('close')
}

function saveGroupName(nextName) {
  if (!group.value || !nextName || nextName === group.value.name) return
  emit('submit', {
    type: 'set_title',
    targetId: '',
    muteMinutes: 0,
    title: nextName,
  })
}

function onFocusGroupSearch() {
  memberTableRef.value?.focusSearch()
}

onMounted(() => {
  document.addEventListener('focus-group-search', onFocusGroupSearch)
  nextTick(() => {
    modalOpen.value = true
  })
})

onUnmounted(() => {
  document.removeEventListener('focus-group-search', onFocusGroupSearch)
})
</script>

<style src="../../css/components/group-modal.css"></style>
