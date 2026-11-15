<template>
  <div class="group-members-block">
    <div class="group-section-title"><i class="fas fa-users"></i> 成员列表({{ members.length }}人)</div>
    <div class="member-search-bar">
      <UiInput
        ref="searchInputRef"
        v-model="searchQuery"
        size="sm"
        clearable
        prefix-icon="fas fa-search"
        placeholder="搜索成员..."
      />
    </div>
    <div class="table-wrapper">
      <table class="member-table">
        <thead>
          <tr>
            <th></th>
            <th>ID</th>
            <th>用户</th>
            <th>角色</th>
            <th>禁言</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="member in filteredMembers"
            :key="member.user_id"
            @contextmenu.prevent="openMenu($event, member.user_id)"
          >
            <td class="member-avatar-cell" @click="$emit('openuserinfo', member.user_id)">
              <UiAvatar
                shape="rounded"
                size="sm"
                :color="avatarTint(member.user_id)"
                :name="getAvatarInitial(member.user_id)"
              />
            </td>
            <td class="user-id-cell u-tabular-nums" @click="$emit('openuserinfo', member.user_id)">{{ member.user_id }}</td>
            <td class="user-name-cell" @click="$emit('openuserinfo', member.user_id)">
              {{ getUsername(member.user_id, users) }}
            </td>
            <td>
              <UiBadge :variant="roleBadgeVariant(member.type)" size="sm">{{ roleLabel(member.type) }}</UiBadge>
            </td>
            <td>
              <UiBadge :variant="isMuted(member) ? 'danger' : 'neutral'" size="sm">{{ muteLabel(member) }}</UiBadge>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <GroupActionMenu
      :visible="menuVisible"
      :x="menuX"
      :y="menuY"
      :gid="Number(groupId)"
      :mid="currentMember != null ? Number(currentMember) : 0"
      @close="menuVisible = false"
      @action="onMemberAction"
    />

    <InputModal
      v-model:visible="muteModalVisible"
      title="禁言成员"
      placeholder="请输入禁言分钟数"
      confirm-text="确定"
      @confirm="onMuteMinutesConfirm"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { UiAvatar, UiBadge, UiInput } from '@/ui'
import { avatarTint, getAvatarInitial, getMutetime, getUsername } from '@/utils.js'
import { useMuteConfirm } from '@/composables/useMuteConfirm.js'
import { useNowSeconds } from '@/composables/useNowSeconds.js'
import { roleBadgeVariant, roleLabel } from '@/composables/modals/useGroupMembers.js'
import GroupActionMenu from '@/components/common/GroupActionMenu.vue'
import InputModal from '../InputModal.vue'

const props = defineProps({
  groupId: [String, Number],
  groupMute: { type: Number, default: 0 },
  members: { type: Array, default: () => [] },
  users: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['openuserinfo', 'switchToChat', 'submit', 'closeModal'])

const nowSeconds = useNowSeconds()
const searchQuery = ref('')
const searchInputRef = ref(null)

const menuVisible = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const currentMember = ref(null)

const { muteModalVisible, requestMute, onMuteMinutesConfirm } = useMuteConfirm((action) => {
  emit('submit', action)
})

const filteredMembers = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return props.members
  return props.members.filter((m) => {
    const name = getUsername(m.user_id, props.users).toLowerCase()
    return name.includes(q) || String(m.user_id).includes(q)
  })
})

function muteValue(member) {
  return Math.max(props.groupMute || 0, member.mute || 0)
}

function isMuted(member) {
  return muteValue(member) > nowSeconds.value
}

function muteLabel(member) {
  return getMutetime(muteValue(member), nowSeconds.value) || '正常'
}

function openMenu(event, memberId) {
  menuVisible.value = false
  currentMember.value = memberId
  menuX.value = event.clientX
  menuY.value = event.clientY
  setTimeout(() => {
    menuVisible.value = true
  }, 1)
}

function onMemberAction(action) {
  if (action.type === 'private_chat') {
    emit('closeModal')
    emit('switchToChat', { type: 'user', id: action.targetId })
    return
  }
  if (action.type === 'view_profile') {
    emit('openuserinfo', action.targetId)
    return
  }
  if (action.type === 'mute_member') {
    requestMute(action.targetId)
    return
  }
  emit('submit', {
    type: action.type,
    targetId: action.type !== 'leave' ? action.targetId : 0,
    muteMinutes: 0,
    title: '',
  })
  menuVisible.value = false
}

function focusSearch() {
  searchInputRef.value?.focus()
}

defineExpose({ focusSearch })
</script>
