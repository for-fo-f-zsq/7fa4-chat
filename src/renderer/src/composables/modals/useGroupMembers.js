import { computed } from 'vue'
import { store } from '../../store.js'
import { getUsername } from '../../utils.js'

export const ROLE_ACTIONS = {
  Owner: [
    { value: 'dissolve', label: '解散群聊' },
    { value: 'add_member', label: '添加成员' },
    { value: 'del_member', label: '踢出成员' },
    { value: 'mute_member', label: '禁言成员' },
    { value: 'mute_group', label: '全员禁言' },
    { value: 'set_title', label: '修改群名' },
    { value: 'add_administrator', label: '设为管理员' },
    { value: 'del_administrator', label: '取消管理员' },
    { value: 'give_owner', label: '转让群主' },
  ],
  Administrator: [
    { value: 'leave', label: '退出群聊' },
    { value: 'block', label: '退出并屏蔽' },
    { value: 'add_member', label: '添加成员' },
    { value: 'del_member', label: '踢出成员' },
    { value: 'mute_member', label: '禁言成员' },
    { value: 'mute_group', label: '全员禁言' },
    { value: 'set_title', label: '修改群名' },
  ],
  Member: [
    { value: 'leave', label: '退出群聊' },
    { value: 'block', label: '退出并屏蔽' },
  ],
}

export const USER_SELECT_ACTIONS = [
  'add_member',
  'del_member',
  'mute_member',
  'add_administrator',
  'del_administrator',
  'give_owner',
]

export const SINGLE_SELECT_ACTIONS = ['give_owner']

export function roleLabel(type) {
  if (type === 'Owner') return '群主'
  if (type === 'Administrator') return '管理员'
  return '成员'
}

export function roleBadgeVariant(type) {
  if (type === 'Owner') return 'warning'
  if (type === 'Administrator') return 'brand'
  return 'neutral'
}

/**
 * 群成员权限、操作列表与候选成员筛选。
 * @param {import('vue').Ref<object|null>} group
 * @param {import('vue').Ref<string|number>} selfUid
 * @param {import('vue').Ref<string>} actionType
 */
export function useGroupMembers(group, selfUid, actionType) {
  const selfType = computed(() => {
    if (!group.value) return 'Member'
    const found = group.value.users.find((u) => String(u.user_id) === String(selfUid.value))
    return found?.type || 'Member'
  })

  const selfMuteTime = computed(() => {
    if (!group.value) return 0
    const selfMember = group.value.users.find((u) => String(u.user_id) === String(selfUid.value))
    return Math.max(group.value.mute || 0, selfMember?.mute || 0)
  })

  const canEditName = computed(() => selfType.value === 'Owner' || selfType.value === 'Administrator')

  function manageableMembers() {
    if (!group.value) return []
    const candidates = group.value.users.filter((u) => String(u.user_id) !== String(selfUid.value))
    if (selfType.value === 'Owner') return candidates.filter((u) => u.type !== 'Owner')
    if (selfType.value === 'Administrator') return candidates.filter((u) => u.type === 'Member')
    return []
  }

  const userFilterFns = {
    add_member: () =>
      Object.values(store.users || {})
        .filter((u) => u.watcher && !group.value?.users.find((gu) => String(gu.user_id) === String(u.uid)))
        .map((u) => ({ value: String(u.uid), label: getUsername(u.uid, store.users) })),
    del_member: () =>
      manageableMembers().map((u) => ({ value: String(u.user_id), label: getUsername(u.user_id, store.users) })),
    mute_member: () =>
      manageableMembers().map((u) => ({ value: String(u.user_id), label: getUsername(u.user_id, store.users) })),
    add_administrator: () => {
      if (selfType.value !== 'Owner' || !group.value) return []
      return group.value.users
        .filter((u) => u.type === 'Member')
        .map((u) => ({ value: String(u.user_id), label: getUsername(u.user_id, store.users) }))
    },
    del_administrator: () => {
      if (selfType.value !== 'Owner' || !group.value) return []
      return group.value.users
        .filter((u) => u.type === 'Administrator')
        .map((u) => ({ value: String(u.user_id), label: getUsername(u.user_id, store.users) }))
    },
    give_owner: () => {
      if (selfType.value !== 'Owner' || !group.value) return []
      return group.value.users
        .filter((u) => u.type !== 'Owner')
        .map((u) => ({ value: String(u.user_id), label: getUsername(u.user_id, store.users) }))
    },
  }

  const availableActions = computed(() => {
    const actions = ROLE_ACTIONS[selfType.value] || ROLE_ACTIONS.Member
    if (!group.value) return actions
    return actions.filter((a) => {
      if (!USER_SELECT_ACTIONS.includes(a.value)) return true
      const fn = userFilterFns[a.value]
      return fn ? fn().length > 0 : true
    })
  })

  const filteredUserOptions = computed(() => {
    if (!group.value) return []
    const fn = userFilterFns[actionType.value]
    return fn ? fn() : []
  })

  return {
    selfType,
    selfMuteTime,
    canEditName,
    availableActions,
    filteredUserOptions,
  }
}
