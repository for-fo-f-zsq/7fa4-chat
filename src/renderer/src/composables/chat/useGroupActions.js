import { reactive } from 'vue'
import { store } from '../../store.js'
import { safeFetch } from '../../utils/chatSync.js'
import { showToast } from '../useToast.js'
import { useMuteConfirm } from '../useMuteConfirm.js'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const GROUP_ACTIONS = [
  'setup', 'leave', 'give_owner', 'add_member', 'del_member',
  'add_administrator', 'del_administrator', 'mute_member', 'mute_group', 'set_title',
]

/**
 * 群组管理操作（创建/加好友/批量踢人/禁言/屏蔽/解散等）与操作进度状态。
 */
export function useGroupActions({
  getActiveGroupId,
  onCloseGroupModal,
  onSelectConversation,
  onOpenUserInfo,
  onRefreshInfo,
}) {
  const groupActionProgress = reactive({ show: false, current: 0, total: 0, label: '' })
  const { muteModalVisible, requestMute, onMuteMinutesConfirm } = useMuteConfirm(submitGroupAction)

  async function postGroup(body) {
    return await (await safeFetch('/chat/group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })).json()
  }

  async function postGroupWithRetry(body, onStart, onEnd) {
    let lastResult = { success: false, err: { message: '操作失败' } }
    for (let attempt = 0; attempt < 3; attempt++) {
      onStart?.()
      if (attempt > 0) await wait(600)
      try {
        lastResult = await postGroup(body)
        if (lastResult.success) break
      } catch {
        lastResult = { success: false, err: { message: '网络异常，请重试' } }
      }
    }
    onEnd?.()
    return lastResult
  }

  async function submitGroupAction(action, gidOverride) {
    const gid = gidOverride || getActiveGroupId()
    if (action.type === 'block') {
      const group = store.groups[gid]
      if (group) {
        let r
        try {
          r = await postGroup({ type: 'leave', group_id: gid, target_id: 0 })
        } catch (e) {
          showToast('退出并屏蔽失败：' + (e && e.message ? e.message : '网络异常'), 'error')
          return
        }
        if (!r || !r.success) {
          showToast((r && r.err && r.err.message) || '退出并屏蔽失败，请稍后重试', 'error')
          return
        }
        group.exited = true
        group.blocked = true
        onCloseGroupModal?.()
      }
      return
    }
    if (action.type === 'dissolve') {
      const group = store.groups[gid]
      if (group) {
        const members = group.users.filter((u) => String(u.user_id) !== String(store.self.uid))
        if (members.length > 0) {
          groupActionProgress.show = true
          groupActionProgress.total = members.length
        }
        for (let i = 0; i < members.length; i++) {
          const m = members[i]
          groupActionProgress.current = i + 1
          groupActionProgress.label = `解散群聊：移除成员 ${i + 1}/${members.length}`
          await postGroupWithRetry({ type: 'del_member', group_id: gid, target_id: m.user_id }, null, null)
          if (i < members.length - 1) await wait(300)
        }
      }
      groupActionProgress.show = false
      action = { ...action, type: 'leave' }
    }
    if (!GROUP_ACTIONS.includes(action.type)) {
      console.warn('[group] 未知的群操作，已拦截：', action.type)
      showToast('不支持的操作：' + action.type, 'warning')
      return
    }
    const targets = (action.targetIds && action.targetIds.length)
      ? action.targetIds.map(String)
      : [action.targetId]
    if (action.type === 'give_owner' && targets.length > 1) {
      showToast('转让群主只能选择一名成员', 'warning')
      return
    }
    if (targets.length === 0) {
      showToast('请选择成员', 'warning')
      return
    }
    let failed = false
    if (targets.length > 1) {
      groupActionProgress.show = true
      groupActionProgress.total = targets.length
    }
    for (let i = 0; i < targets.length; i++) {
      const tid = targets[i]
      const body = { type: action.type, group_id: gid, target_id: tid, title: action.title }
      if (action.type === 'mute_member' || action.type === 'mute_group') {
        body.mute = Math.floor(Date.now() / 1000 + action.muteMinutes * 60)
      }
      if (targets.length > 1) {
        groupActionProgress.current = i + 1
        groupActionProgress.label = `操作进度 ${i + 1}/${targets.length}`
      }
      const done = await postGroupWithRetry(
        body,
        () => {
          if (targets.length > 1) {
            groupActionProgress.current = i + 1
            groupActionProgress.label = `操作进度 ${i + 1}/${targets.length}`
          }
        },
        () => {},
      ).catch(() => ({ success: false }))
      if (!done.success) {
        failed = true
        const msg = done.err?.message || '操作失败'
        if (targets.length === 1) {
          showToast(msg, 'error')
          groupActionProgress.show = false
          return
        }
      }
      if (i < targets.length - 1) await wait(300)
    }
    groupActionProgress.show = false
    if (failed && targets.length > 1) showToast('部分成员操作失败，请重试', 'warning')
    if (action.type === 'leave') {
      const group = store.groups[gid]
      if (group) group.exited = true
      onCloseGroupModal?.()
    }
    await onRefreshInfo?.()
  }

  function onGroupAction(action) {
    if (action.type === 'private_chat') { onSelectConversation?.({ type: 'user', id: action.targetId }); return }
    if (action.type === 'view_profile') { onOpenUserInfo?.(action.targetId); return }
    if (action.type === 'mute_member') { requestMute(action.targetId); return }
    const submitAction = { type: action.type, targetId: action.type !== 'leave' ? action.targetId : 0 }
    submitGroupAction(submitAction)
    muteModalVisible.value = false
  }

  async function createGroup(title) {
    if (!title) return
    try {
      const r = await postGroup({ type: 'setup', title })
      if (!r.success) { showToast(r.err?.message || '创建失败', 'error'); return }
      await onRefreshInfo?.()
    } catch {
      showToast('创建失败', 'error')
    }
  }

  async function addfriend(q) {
    if (!q) return
    try {
      const r = await (await safeFetch(`/user/${store.self.uid}/friend/json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q }),
      })).json()
      if (!r.success) { showToast(r.err?.message || '添加失败', 'error'); return }
      await onRefreshInfo?.()
    } catch {
      showToast('添加失败', 'error')
    }
  }

  async function leaveGroupFromMenu(gid) {
    await submitGroupAction({ type: 'leave', targetId: 0 }, gid)
  }

  async function blockGroupFromMenu(gid) {
    await submitGroupAction({ type: 'block' }, gid)
  }

  function unblockGroupFromMenu(gid) {
    const group = store.groups[gid]
    if (group) group.blocked = false
  }

  async function dissolveGroupFromMenu(gid) {
    if (!store.groups[gid]) return
    await submitGroupAction({ type: 'dissolve', targetId: 0 }, gid)
  }

  return {
    groupActionProgress,
    muteModalVisible,
    onMuteMinutesConfirm,
    postGroup,
    submitGroupAction,
    onGroupAction,
    createGroup,
    addfriend,
    leaveGroupFromMenu,
    blockGroupFromMenu,
    unblockGroupFromMenu,
    dissolveGroupFromMenu,
  }
}
