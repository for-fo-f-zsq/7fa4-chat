<template>
  <div class="modal-overlay" v-if="groupId" @click.self="$emit('close')">
    <div class="modal-container">
      <div class="group-detail-card" v-if="group">
        <div class="group-detail-header">
          <div class="group-avatar-section">
            <div class="group-avatar-container">
              <div class="avatar-placeholder-lg">{{ group.name ? group.name.charAt(0) : '群' }}</div>
            </div>
          </div>
          <div class="group-name-wrapper" v-if="canEditName && editingName">
            <input
              ref="nameInputRef"
              v-model="tempName"
              type="text"
              class="group-name-input"
              @keydown.enter="saveGroupName"
              @keydown.esc="cancelEditName"
              @blur="saveGroupName"
              maxlength="50"
            />
          </div>
          <div class="group-name-wrapper" v-else>
            <h3 class="editable-name" :class="{ 'editable': canEditName }" @click="startEditName">
              {{ group.name }}
              <i v-if="canEditName" class="fas fa-pencil-alt edit-icon"></i>
            </h3>
          </div>
          <button class="modal-close-btn" @click="$emit('close')"><i class="fas fa-times"></i></button>
        </div>
        <div class="group-info-section">
          <div class="group-info-item">
            <span class="group-info-label">群ID</span>
            <span class="group-info-value">{{ groupId }}</span>
          </div>
          <div class="group-info-item">
            <span class="group-info-label">成员数</span>
            <span class="group-info-value">{{ group.users.length }}人</span>
          </div>
          <div class="group-info-item">
            <span class="group-info-label">我的身份</span>
            <span class="group-info-value"><span class="role-badge" :class="roleClass(selfType)">{{ roleLabel(selfType) }}</span></span>
          </div>
          <div class="group-info-item">
            <span class="group-info-label">我的禁言</span>
            <span class="group-info-value"><span class="mute-status" :class="selfEffectiveMute > nowSeconds ? 'mute-warning' : 'mute-normal'">{{ selfEffectiveMute > nowSeconds ? getMutetime(selfEffectiveMute, nowSeconds) : '正常' }}</span></span>
          </div>
        </div>
        <div class="section-title"><i class="fas fa-users"></i> 成员列表({{ group.users.length }}人)</div>
        <div class="member-search-bar">
          <input class="member-search-input" v-model="memberSearchQuery" placeholder="搜索成员..." ref="memberSearchInput" />
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
                @contextmenu.prevent="openMemberMenu($event, member.user_id)"
              >
                <td class="member-avatar-cell" @click="emit('openuserinfo', member.user_id)">
                  <div class="member-avatar">
                    <div class="avatar-placeholder-xs">{{ getAvatarInitial(member.user_id) }}</div>
                  </div>
                </td>
                <td class="user-id-cell" @click="emit('openuserinfo', member.user_id)">{{ member.user_id }}</td>
                <td class="user-name-cell" @click="emit('openuserinfo', member.user_id)">{{ getUsername(member.user_id, store.users) }}</td>
                <td><span class="role-badge" :class="roleClass(member.type)">{{ roleLabel(member.type) }}</span></td>
                <td><span class="mute-status" :class="muteClass(member)">{{ getMutetime(muteValue(member), nowSeconds) }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="action-panel">
          <div class="custom-select" :class="{ open: actionOpen, dropup: actionDropup }" @click="toggleActionSelect" v-click-outside="() => actionOpen = false">
            <div class="custom-select-trigger">
              <span>{{ currentActionLabel }}</span>
              <i class="fas fa-chevron-down custom-select-arrow"></i>
            </div>
            <div class="custom-select-dropdown" :class="{ dropup: actionDropup }" v-if="actionOpen">
              <div class="custom-select-option" v-for="a in availableActions" :key="a.value" :class="{ active: actionType === a.value }" @click.stop="selectAction(a.value)">
                <span>{{ a.label }}</span>
              </div>
            </div>
          </div>
          <div class="custom-select" :class="{ open: userOpen, dropup: userDropup }" @click="toggleUserSelect" v-click-outside="() => userOpen = false" v-if="showChooseUser && filteredUsers.length">
            <div class="custom-select-trigger">
              <span>{{ currentUserLabel }}</span>
              <i class="fas fa-chevron-down custom-select-arrow"></i>
            </div>
            <div class="custom-select-dropdown user-dropdown" :class="{ dropup: userDropup }" v-if="userOpen">
              <div class="custom-select-search" @click.stop>
                <input class="custom-select-search-input" v-model="userSearchQuery" placeholder="搜索用户..." ref="userSearchInput" />
              </div>
              <div class="select-all-option" v-if="multiSelect && searchedUsers.length" @click.stop="toggleSelectAll">
                <input type="checkbox" :checked="allSearchedSelected" @click.stop.prevent="toggleSelectAll" />
                <span>全选（已选 {{ selectedUsers.length }}）</span>
              </div>
              <div class="custom-select-options">
                <div class="custom-select-option" v-for="u in searchedUsers" :key="u.id" :class="{ active: selectedUsers.includes(String(u.id)) }" @click.stop="toggleUser(u.id)">
                  <input type="checkbox" :checked="selectedUsers.includes(String(u.id))" @click.stop.prevent="toggleUser(u.id)" />
                  <span>{{ u.name }}</span>
                </div>
                <div v-if="!searchedUsers.length" class="custom-select-empty">无匹配结果</div>
              </div>
            </div>
          </div>
          <div class="group-select-error" v-if="selectError">{{ selectError }}</div>
          <input v-if="showMuteTime" v-model.number="muteMinutes" type="number" class="mute-input" placeholder="禁言分钟" min="1" />
          <input v-if="showNewName" v-model="newName" type="text" class="name-input" placeholder="新群名" />
          <button class="execute-btn" @click="executeAction">执行</button>
        </div>

        <GroupActionMenu
          :visible="menuVisible"
          :x="menuX"
          :y="menuY"
          :gid="groupId"
          :mid="currentMember"
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
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { getUsername, getMutetime, getAvatarInitial, getGradeColor } from '../utils.js'
import { store } from '../store.js'
import GroupActionMenu from './GroupActionMenu.vue'
import InputModal from './InputModal.vue'
import { vClickOutside } from '../composables/vClickOutside.js'
import { useMuteConfirm } from '../composables/useMuteConfirm.js'
import { useNowSeconds } from '../composables/useNowSeconds.js'

const props = defineProps({
  groupId: [String, Number],
  groups: Object,
  users: Object,
  selfUid: [String, Number]
})

const emit = defineEmits(['close', 'submit', 'openuserinfo', 'switchToChat'])

function emitSubmit(action) {
  emit('submit', action)
}

const { muteModalVisible, pendingMuteMemberId, requestMute, onMuteMinutesConfirm } = useMuteConfirm(emitSubmit)

const nowSeconds = useNowSeconds()

// ----- 底部操作面板状态（原有）-----
const actionType = ref('leave')
const selectedUsers = ref([])
const selectError = ref('')
const muteMinutes = ref(60)
const newName = ref('')
const actionOpen = ref(false)
const userOpen = ref(false)
const actionDropup = ref(false)
const userDropup = ref(false)

// ----- 右键菜单状态（新增）-----
const menuVisible = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const currentMember = ref(null)

// ----- 群名编辑状态 -----
const editingName = ref(false)
const tempName = ref('')
const nameInputRef = ref(null)

// ----- 成员搜索状态 -----
const memberSearchQuery = ref('')
const memberSearchInput = ref(null)

// ----- 用户选择搜索状态 -----
const userSearchQuery = ref('')
const userSearchInput = ref(null)

// ----- 计算属性与原有方法（修正）-----
function checkDropup(el) {
  const rect = el.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom
  const estimatedHeight = 200
  return spaceBelow < estimatedHeight
}

function toggleActionSelect(e) {
  actionOpen.value = !actionOpen.value
  if (actionOpen.value) {
    actionDropup.value = checkDropup(e.currentTarget)
  }
}

function toggleUserSelect(e) {
  userOpen.value = !userOpen.value
  if (userOpen.value) {
    userDropup.value = checkDropup(e.currentTarget)
    userSearchQuery.value = ''
    nextTick(() => userSearchInput.value?.focus())
  }
}

const group = computed(() => props.groups?.[props.groupId] || null)

const filteredMembers = computed(() => {
  if (!group.value) return []
  const q = memberSearchQuery.value.trim().toLowerCase()
  if (!q) return group.value.users
  return group.value.users.filter(m => {
    const name = getUsername(m.user_id, store.users).toLowerCase()
    const uid = String(m.user_id)
    return name.includes(q) || uid.includes(q)
  })
})

const selfType = computed(() => {
  if (!group.value) return 'Member'
  const found = group.value.users.find(u => String(u.user_id) === String(props.selfUid))
  return found?.type || 'Member'
})

const selfMuteTime = computed(() => {
  if (!group.value) return 0
  const selfMember = group.value.users.find(u => String(u.user_id) === String(props.selfUid))
  return Math.max(group.value.mute || 0, selfMember?.mute || 0)
})

const selfEffectiveMute = computed(() => selfMuteTime.value)

// 是否有权限编辑群名（群主或管理员）
const canEditName = computed(() => {
  const role = selfType.value
  return role === 'Owner' || role === 'Administrator'
})

const allActions = {
  Owner: [
    { value: 'dissolve', label: '解散群聊' },
    { value: 'add_member', label: '添加成员' },
    { value: 'del_member', label: '踢出成员' },
    { value: 'mute_member', label: '禁言成员' },
    { value: 'mute_group', label: '全员禁言' },
    { value: 'set_title', label: '修改群名' },
    { value: 'add_administrator', label: '设为管理员' },
    { value: 'del_administrator', label: '取消管理员' },
    { value: 'give_owner', label: '转让群主' }
  ],
  Administrator: [
    { value: 'leave', label: '退出群聊' },
    { value: 'block', label: '退出并屏蔽' },
    { value: 'add_member', label: '添加成员' },
    { value: 'del_member', label: '踢出成员' },
    { value: 'mute_member', label: '禁言成员' },
    { value: 'mute_group', label: '全员禁言' },
    { value: 'set_title', label: '修改群名' }
  ],
  Member: [
    { value: 'leave', label: '退出群聊' },
    { value: 'block', label: '退出并屏蔽' }
  ]
}

const userActions = ['add_member', 'del_member', 'mute_member', 'add_administrator', 'del_administrator', 'give_owner']

const userFilterFns = {
  add_member: () => {
    // 群拉人资格同私信：可拉关注我的人（watcher），无需我关注对方
    return Object.values(store.users || {})
      .filter(u => u.watcher && !group.value.users.find(gu => String(gu.user_id) === String(u.uid)))
      .map(u => ({ id: u.uid, name: getUsername(u.uid, store.users) }))
  },
  del_member: () => {
    let candidates = group.value.users.filter(u => String(u.user_id) !== String(props.selfUid))
    if (selfType.value === 'Owner') {
      candidates = candidates.filter(u => u.type !== 'Owner')
    } else if (selfType.value === 'Administrator') {
      candidates = candidates.filter(u => u.type === 'Member')
    } else {
      return []
    }
    return candidates.map(u => ({ id: u.user_id, name: getUsername(u.user_id, store.users) }))
  },
  mute_member: () => {
    let candidates = group.value.users.filter(u => String(u.user_id) !== String(props.selfUid))
    if (selfType.value === 'Owner') {
      candidates = candidates.filter(u => u.type !== 'Owner')
    } else if (selfType.value === 'Administrator') {
      candidates = candidates.filter(u => u.type === 'Member')
    } else {
      return []
    }
    return candidates.map(u => ({ id: u.user_id, name: getUsername(u.user_id, store.users) }))
  },
  add_administrator: () => {
    if (selfType.value !== 'Owner') return []
    return group.value.users
      .filter(u => u.type === 'Member')
      .map(u => ({ id: u.user_id, name: getUsername(u.user_id, store.users) }))
  },
  del_administrator: () => {
    if (selfType.value !== 'Owner') return []
    return group.value.users
      .filter(u => u.type === 'Administrator')
      .map(u => ({ id: u.user_id, name: getUsername(u.user_id, store.users) }))
  },
  give_owner: () => {
    if (selfType.value !== 'Owner') return []
    return group.value.users
      .filter(u => u.type !== 'Owner')
      .map(u => ({ id: u.user_id, name: getUsername(u.user_id, store.users) }))
  }
}

const availableActions = computed(() => {
  const role = selfType.value
  const actions = allActions[role] || allActions.Member
  if (!group.value) return actions
  // Filter out actions that have no candidates
  return actions.filter(a => {
    if (!userActions.includes(a.value)) return true
    // Check if filteredUsers for this action would have candidates
    const filterFn = userFilterFns[a.value]
    if (!filterFn) return true
    return filterFn().length > 0
  })
})

// Reset actionType if it's no longer available
watch(availableActions, (actions) => {
  if (!actions.find(a => a.value === actionType.value)) {
    actionType.value = actions[0]?.value || 'leave'
    onActionChange()
  }
})

const showChooseUser = computed(() => userActions.includes(actionType.value))
const showMuteTime = computed(() => ['mute_member', 'mute_group'].includes(actionType.value))
const showNewName = computed(() => actionType.value === 'set_title')

const filteredUsers = computed(() => {
  if (!group.value) return []
  const filterFn = userFilterFns[actionType.value]
  if (!filterFn) return []
  return filterFn()
})

const searchedUsers = computed(() => {
  const q = userSearchQuery.value.trim().toLowerCase()
  if (!q) return filteredUsers.value
  return filteredUsers.value.filter(u => {
    const name = (u.name || '').toLowerCase()
    const id = String(u.id)
    return name.includes(q) || id.includes(q)
  })
})

function roleLabel(type) {
  if (type === 'Owner') return '群主'
  if (type === 'Administrator') return '管理员'
  return '成员'
}

function roleClass(type) {
  if (type === 'Owner') return 'role-owner'
  if (type === 'Administrator') return 'role-admin'
  return 'role-member'
}

function muteValue(member) {
  if (!group.value) return 0
  return Math.max(group.value.mute || 0, member.mute || 0)
}

function muteClass(member) {
  return muteValue(member) <= nowSeconds.value ? 'mute-normal' : 'mute-warning'
}

function onActionChange() {
  selectedUsers.value = []
  selectError.value = ''
  muteMinutes.value = 60
  newName.value = ''
}

const currentActionLabel = computed(() => {
  return availableActions.value.find(a => a.value === actionType.value)?.label || ''
})

const singleSelectActions = ['give_owner']
const multiSelect = computed(() => !singleSelectActions.includes(actionType.value))
const allSearchedSelected = computed(() => {
  const ids = searchedUsers.value.map(u => String(u.id))
  return ids.length > 0 && ids.every(id => selectedUsers.value.includes(id))
})
const currentUserLabel = computed(() => {
  if (selectedUsers.value.length === 0) return '选择用户'
  if (!multiSelect.value) {
    const found = filteredUsers.value.find(u => String(u.id) === selectedUsers.value[0])
    return found?.name || '选择用户'
  }
  return `已选 ${selectedUsers.value.length} 人`
})

function selectAction(value) {
  actionOpen.value = false
  actionType.value = value
  onActionChange()
}

function toggleUser(id) {
  id = String(id)
  selectError.value = ''
  if (!multiSelect.value) {
    selectedUsers.value = [id]
    userOpen.value = false
    return
  }
  const idx = selectedUsers.value.indexOf(id)
  if (idx >= 0) selectedUsers.value.splice(idx, 1)
  else selectedUsers.value.push(id)
}

function toggleSelectAll() {
  selectError.value = ''
  const ids = searchedUsers.value.map(u => String(u.id))
  if (!ids.length) return
  const allSelected = ids.every(id => selectedUsers.value.includes(id))
  if (allSelected) {
    selectedUsers.value = selectedUsers.value.filter(id => !ids.includes(id))
  } else {
    const set = new Set(selectedUsers.value)
    ids.forEach(id => set.add(id))
    selectedUsers.value = Array.from(set)
  }
}

function executeAction() {
  if (userActions.includes(actionType.value) && selectedUsers.value.length === 0) {
    selectError.value = '请至少选择一名成员'
    return
  }
  selectError.value = ''
  const action = {
    type: actionType.value,
    targetIds: selectedUsers.value,
    targetId: '',
    muteMinutes: muteMinutes.value,
    title: newName.value
  }
  emit('submit', action)
  if (actionType.value === 'leave' || actionType.value === 'dissolve' || actionType.value === 'block') emit('close')
}

function openMemberMenu(event, member) {
  event.preventDefault()
  menuVisible.value = false
  currentMember.value = member
  menuX.value = event.clientX
  menuY.value = event.clientY
  setTimeout(()=>menuVisible.value = true,1)
}

function onMemberAction(action) {
  if (action.type === 'private_chat') {
    emit('close')
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
  const submitAction = {
    type: action.type,
    targetId: action.type !== 'leave'?action.targetId:0,
    muteMinutes: 0,
    title: ''
  }
  emit('submit', submitAction)
  menuVisible.value = false
}

function startEditName() {
  if (!canEditName.value) return
  tempName.value = group.value.name
  editingName.value = true
  nextTick(() => {
    nameInputRef.value?.focus()
    nameInputRef.value?.select()
  })
}

function saveGroupName() {
  const newGroupName = tempName.value.trim()
  if (!newGroupName || newGroupName === group.value.name) {
    editingName.value = false
    return
  }
  emit('submit', {
    type: 'set_title',
    targetId: '',
    muteMinutes: 0,
    title: newGroupName
  })
  editingName.value = false
}

function cancelEditName() {
  editingName.value = false
}

// ========== 群头像 ==========

// ----- 监听全局搜索聚焦事件 -----
function onFocusGroupSearch() {
  memberSearchInput.value?.focus()
}

onMounted(() => {
  document.addEventListener('focus-group-search', onFocusGroupSearch)
})

onUnmounted(() => {
  document.removeEventListener('focus-group-search', onFocusGroupSearch)
})
</script>