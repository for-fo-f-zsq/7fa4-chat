import { nextTick, reactive, toRef, watch } from 'vue'
import { store } from '../../store.js'

/**
 * ChatView 弹窗与右键菜单状态及打开/触发处理器。
 */
export function useChatModals() {
  const modalState = reactive({
    showCreateGroupModal: false,
    showAddFriendModal: false,
    addFriendInitialQuery: '',
    shortcutModal: false,
    targetMenu: { show: false, x: 0, y: 0, type: '', id: null, isPinned: false, isUnread: false },
    userinfo: { show: false, uid: 0 },
    groupaction: { show: false, mid: 0, x: 0, y: 0 },
    groupModal: { show: false, groupId: null },
  })

  watch(() => modalState.showAddFriendModal, (v) => {
    if (!v) modalState.addFriendInitialQuery = ''
  })

  function openUserInfo(uid) {
    modalState.userinfo.uid = uid
    modalState.userinfo.show = true
  }

  function openGroupSettings(gid) {
    modalState.groupModal.groupId = gid
    modalState.groupModal.show = true
  }

  function openGroupActionMenu(event, member) {
    event.preventDefault()
    modalState.groupaction.show = false
    modalState.groupaction.mid = member
    modalState.groupaction.x = event.clientX
    modalState.groupaction.y = event.clientY
    nextTick(() => { modalState.groupaction.show = true })
  }

  function openTargetMenu(e, type, id) {
    e.preventDefault()
    const item = type === 'user' ? store.users[id] : store.groups[id]
    modalState.targetMenu.show = false
    modalState.targetMenu.x = e.clientX
    modalState.targetMenu.y = e.clientY
    modalState.targetMenu.type = type
    modalState.targetMenu.id = id
    modalState.targetMenu.isPinned = item?.pinned || false
    modalState.targetMenu.isUnread = (item?.unread || 0) > 0
    nextTick(() => { modalState.targetMenu.show = true })
  }

  return {
    modalState,
    showCreateGroupModal: toRef(modalState, 'showCreateGroupModal'),
    showAddFriendModal: toRef(modalState, 'showAddFriendModal'),
    addFriendInitialQuery: toRef(modalState, 'addFriendInitialQuery'),
    shortcutModal: toRef(modalState, 'shortcutModal'),
    openUserInfo,
    openGroupSettings,
    openGroupActionMenu,
    openTargetMenu,
  }
}
