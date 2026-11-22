<template>
  <InputModal
    v-model:visible="state.showCreateGroupModal"
    title="新建群聊"
    placeholder="群名称"
    @confirm="emit('createGroup', $event)"
  />
  <AddFriendModal
    v-model:visible="state.showAddFriendModal"
    :initial-query="state.addFriendInitialQuery"
    @confirm="emit('addfriend', $event)"
    @viewUser="emit('openUserInfo', $event)"
  />
  <TargetMenu
    v-if="state.targetMenu.show"
    :x="state.targetMenu.x"
    :y="state.targetMenu.y"
    :type="state.targetMenu.type"
    :id="state.targetMenu.id"
    :isPinned="state.targetMenu.isPinned"
    :isUnread="state.targetMenu.isUnread"
    @close="state.targetMenu.show = false"
    @pin="onTogglePin"
    @showuserinfo="() => emit('openUserInfo', state.targetMenu.id)"
    @showgroupinfo="() => emit('openGroupSettings', state.targetMenu.id)"
    @leavegroup="onTargetAction('leavegroup')"
    @blockgroup="onTargetAction('blockgroup')"
    @unblockgroup="onTargetAction('unblockgroup')"
    @dissolvegroup="onTargetAction('dissolvegroup')"
    @togglehidden="onTargetAction('togglehidden')"
    @mute="onTargetAction('mute')"
    @unmute="onTargetAction('mute')"
    @markread="onTargetAction('read')"
    @markunread="onTargetAction('read')"
  />
  <GroupModal
    v-if="state.groupModal.show"
    :groupId="state.groupModal.groupId"
    :groups="store.groups"
    :users="store.users"
    :selfUid="store.self.uid"
    :progress="groupActionProgress"
    @close="closeGroupModal"
    @submit="emit('submitGroupAction', $event)"
    @openuserinfo="emit('openUserInfo', $event)"
    @switchToChat="emit('selectConversation', $event)"
  />
  <ShortcutModal
    v-if="state.shortcutModal"
    :setting="setting"
    @close="state.shortcutModal = false"
    @settingChange="emit('settingChange', $event)"
  />
  <UserInfoModal
    v-if="state.userinfo.show"
    :uid="state.userinfo.uid"
    @close="state.userinfo.show = false"
    @addfriend="emit('addfriend', $event)"
    @switchToChat="emit('selectConversation', $event)"
  />
  <GroupActionMenu
    :visible="state.groupaction.show"
    :x="state.groupaction.x"
    :y="state.groupaction.y"
    :gid="pageId"
    :mid="state.groupaction.mid"
    @close="state.groupaction.show = false"
    @action="emit('groupAction', $event)"
  />
  <InputModal
    :visible="muteModalVisible"
    title="禁言成员"
    placeholder="请输入禁言分钟数"
    confirm-text="确定"
    @update:visible="emit('update:muteModalVisible', $event)"
    @confirm="emit('muteMinutesConfirm', $event)"
  />
  <ForwardModal
    ref="forwardModalRef"
    v-if="forwardModalVisible"
    :title="imageSendPending ? '发送图片' : '转发消息'"
    :msgContent="forwardMsgContent"
    @close="emit('closeForwardModal')"
    @forward="emit('forwardConfirm', $event)"
  />
  <ContentPreviewModal
    v-if="previewData.show"
    :type="previewData.type"
    :title="previewData.title"
    :src="previewData.src"
    :text="previewData.text"
    :rawContent="previewData.rawContent"
    :showActions="previewData.showActions"
    :showEdit="false"
    @close="previewData.show = false"
    @copy="emit('previewCopy')"
    @forward="emit('previewForward')"
    @download="emit('previewDownload')"
  />
</template>

<script setup>
import { ref } from 'vue'
import { store } from '../../store.js'
import { persistNow } from '../../composables/chat/useChatPersistence.js'
import TargetMenu from '../common/TargetMenu.vue'
import GroupActionMenu from '../common/GroupActionMenu.vue'
import ForwardModal from '../modals/ForwardModal.vue'
import ContentPreviewModal from '../modals/ContentPreviewModal.vue'
import UserInfoModal from '../modals/UserInfoModal.vue'
import GroupModal from '../modals/GroupModal.vue'
import ShortcutModal from '../modals/ShortcutModal.vue'
import InputModal from '../modals/InputModal.vue'
import AddFriendModal from '../modals/AddFriendModal.vue'

const props = defineProps({
  pageId: { type: [Number, String], default: null },
  setting: { type: Object, default: () => ({}) },
  state: { type: Object, required: true },
  groupActionProgress: { type: Object, required: true },
  muteModalVisible: Boolean,
  forwardModalVisible: Boolean,
  forwardMsgContent: { type: String, default: '' },
  imageSendPending: { type: Object, default: null },
  previewData: { type: Object, required: true },
})

const emit = defineEmits([
  'update:muteModalVisible',
  'createGroup',
  'addfriend',
  'openUserInfo',
  'openGroupSettings',
  'targetMenuAction',
  'submitGroupAction',
  'selectConversation',
  'settingChange',
  'groupAction',
  'muteMinutesConfirm',
  'closeForwardModal',
  'forwardConfirm',
  'previewCopy',
  'previewForward',
  'previewDownload',
])

const forwardModalRef = ref(null)

function closeGroupModal() {
  props.state.groupModal.show = false
  props.state.groupModal.groupId = 0
}

function onTogglePin() {
  const { type, id } = props.state.targetMenu
  const item = type === 'user' ? store.users[id] : store.groups[id]
  if (item) {
    item.pinned = !item.pinned
    const key = `${type}_${id}`
    if (!store.pinnedConvos || typeof store.pinnedConvos !== 'object') store.pinnedConvos = {}
    if (item.pinned) store.pinnedConvos[key] = true
    else delete store.pinnedConvos[key]
    persistNow()
  }
  props.state.targetMenu.show = false
}

function onTargetAction(kind) {
  const { type, id, isUnread } = props.state.targetMenu
  props.state.targetMenu.show = false
  emit('targetMenuAction', { kind, type, id, isUnread })
}

defineExpose({
  focusForward: () => forwardModalRef.value?.focus?.(),
})
</script>
