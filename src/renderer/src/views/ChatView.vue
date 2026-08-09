<template>
  <div class="app">
    <div class="title-bar">
      <div class="title-bar-drag">
        <span class="title-bar-title">7FA4 Chat</span>
      </div>
      <div class="title-bar-controls">
        <button class="title-btn title-minimize" @click="windowMinimize"><i class="fas fa-minus"></i></button>
        <button class="title-btn title-maximize" @click="windowMaximize"><i class="fas" :class="isMaximized ? 'fa-clone' : 'fa-square'"></i></button>
        <button class="title-btn title-close" @click="windowClose"><i class="fas fa-times"></i></button>
      </div>
    </div>
    <div class="app-body">
    <div class="network-banner" v-if="!store.online"><i class="fas fa-wifi"></i> 网络连接已断开，正在尝试重连...</div>
    <NavBar
      :pageType="navPageType"
      :users="store.users"
      :groups="store.groups"
      @switch="switchPage"
    />
    <ConversationList
      ref="conversationListRef"
      v-if="isChatPage && !(isNarrowLayout && pageId)"
      class="fade-content"
      :class="{ 'fade-out': listFading }"
      :pageType="displayPageType"
      :pageId="displayPageId"
      :users="store.users"
      :groups="store.groups"
      :messages="store.messages"
      :style="isNarrowLayout ? { width: 'auto', flex: '1 1 0%' } : { width: listWidth + 'px' }"
      @select="onSelectConversation"
      @Targetmenu="onTargetMenu"
      @dropFile="onDropFile"
      @markAllRead="markAllRead"
      @newConversation="onNewConversationFromList"
    />
    <div class="list-resize-bar" v-if="!isNarrowLayout" @mousedown="startListResize"></div>
    <InputModal
      v-model:visible="showCreateGroupModal"
      title="新建群聊"
      placeholder="群名称"
      @confirm="createGroup"
    />
    <AddFriendModal
      v-model:visible="showAddFriendModal"
      @confirm="addfriend"
      @viewUser="openuserinfo"
    />
    <div class="chat-main fade-content" :class="{ 'fade-out': contentFading }" v-if="isChatPage && pageId">
      <ChatHeader
        :pageType="pageType"
        :pageId="pageId"
        :targetUser="targetUser"
        :targetGroup="targetGroup"
        @back="onBackFromChat"
        @openUserInfo="openuserinfo"
        @openGroupSettings="openGroupSettings"
        @toggleSearch="toggleSearch"
        @addfriend="addfriend"
      />
      <div v-if="watchWarnText" class="chat-watch-warn">{{ watchWarnText }}</div>
      <SearchPanel
        ref="searchPanelRef"
        :visible="searchVisible"
        :pageType="pageType"
        :pageId="pageId"
        :messages="currentMessages"
        @close="closeSearch"
        @jump="onSearchJump"
      />
      <MessageList
        ref="messageListRef"
        :pageType="pageType"
        :pageId="pageId"
        :selfUid="store.self.uid"
        :collapsedMsgs="collapsedMsgs"
        :visibleCount="visibleCount"
        @sendPat="sendPat"
        @openGroupActionMenu="openGroupActionMenu"
        @scrollToTop="onMessageAreaScrollToTop"
        @startReply="startReply"
        @openUserInfo="openuserinfo"
        @forward="startForward"
        @delete="deleteMsg"
        @batchForward="batchForward"
        @batchDelete="batchDelete"
        @batchFavorite="batchFavorite"
        @openPreview="onOpenPreview"
      />
      <InputFooter
        ref="inputFooterRef"
        :pageType="pageType"
        :pageId="pageId"
        :targetUser="targetUser"
        :targetGroup="targetGroup"
        :inputDisabled="inputDisabled"
      @dropFile="onDropFile"
      @openPreview="onOpenPreview"
      @openFavorites="switchPage('favorites')"
      />
    </div>
    <FavoritesPanel
      v-if="pageType==='favorites'"
      class="fade-content"
      :class="{ 'fade-out': contentFading }"
      @preview="onFavPreview"
      @forward="onFavForward"
      @copy="onFavCopy"
      @download="onFavDownload"
    />
    <ToolsPage
      v-if="pageType==='tools'"
      ref="toolsPageRef"
      class="fade-content"
      :class="{ 'fade-out': contentFading }"
      :current-tool="currentTool"
      @open-tool="currentTool = $event"
      @dirty-change="toolsDirty = $event"
    />
    <SettingsPanel
      v-if="pageType==='settings'"
      class="fade-content"
      :class="{ 'fade-out': contentFading }"
      :self="store.self"
      :setting="setting"
      :allThemes="allThemes"
      @logout="logout"
      @settingChange="onSettingChange"
      @openThemeModal="openThemeModal"
      @openShortcutModal="shortcutModal = true"
    />
    <AboutPanel
      v-if="pageType==='about'"
      class="fade-content"
      :class="{ 'fade-out': contentFading }"
      :version="version"
    />
    </div>
  </div>
  <TargetMenu
    v-if="targetMenu.show"
    :x="targetMenu.x"
    :y="targetMenu.y"
    :type="targetMenu.type"
    :id="targetMenu.id"
    :isPinned="targetMenu.isPinned"
    :isUnread="targetMenu.isUnread"
    @close="targetMenu.show = false"
    @pin="togglePin"
    @showuserinfo="()=>{openuserinfo(targetMenu.id)}"
    @showgroupinfo="()=>openGroupSettings(targetMenu.id)"
    @leavegroup="leaveGroupFromMenu"
    @blockgroup="blockGroupFromMenu"
    @unblockgroup="unblockGroupFromMenu"
    @deletegroup="deleteGroupFromMenu"
    @dissolvegroup="dissolveGroupFromMenu"
    @deleteconvo="deleteConvo"
    @mute="toggleMute"
    @unmute="toggleMute"
    @markread="toggleRead"
    @markunread="toggleRead"
  />
  <GroupModal
    v-if="groupModal.show"
    :groupId="groupModal.groupId"
    :groups="store.groups"
    :users="store.users"
    :selfUid="store.self.uid"
    @close="groupModal.show = false;groupModal.groupId=0"
    @submit="submitGroupAction"
    @openuserinfo="openuserinfo"
    @switchToChat="onSelectConversation"
  />
  <ThemeModal
    v-if="themeModal"
    :setting="setting"
    @close="themeModal = false"
    @settingChange="onSettingChange"
  />
  <ShortcutModal
    v-if="shortcutModal"
    :setting="setting"
    @close="shortcutModal = false"
    @settingChange="onSettingChange"
  />
  <SaveConfirmModal
    v-model:visible="saveConfirmVisible"
    title="未保存的修改"
    message="当前内容尚未保存，是否保存后再离开？"
    @save="onSaveConfirmSave"
    @discard="onSaveConfirmDiscard"
    @cancel="pendingSwitch = null"
  />
  <UserInfoModal
    v-if="userinfo.show"
    :uid="userinfo.uid"
    @close="userinfo.show = false"
    @addfriend="addfriend"
    @switchToChat="onSelectConversation"
  />
  <GroupActionMenu
    :visible="groupaction.show"
    :x="groupaction.x"
    :y="groupaction.y"
    :gid="pageId"
    :mid="groupaction.mid"
    @close="groupaction.show = false"
    @action="onGroupAction"
  />
  <InputModal
    v-model:visible="muteModalVisible"
    title="禁言成员"
    placeholder="请输入禁言分钟数"
    confirm-text="确定"
    @confirm="onMuteMinutesConfirm"
  />
  <ForwardModal
    v-if="forwardModalVisible"
    :msgContent="forwardMsgContent"
    @close="forwardModalVisible = false"
    @forward="doForward"
  />
  <ContentPreviewModal
    v-if="previewData.show"
    :type="previewData.type"
    :title="previewData.title"
    :src="previewData.src"
    :text="previewData.text"
    :rawContent="previewData.rawContent"
    :showActions="previewData.showActions"
    @close="previewData.show = false"
    @copy="onPreviewCopy"
    @forward="onPreviewForward"
    @download="onPreviewDownload"
  />
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { store } from '../store.js';
import { safeFetch, gettime2, getUsername, parseContent, parseMsgContent, applyChatToStore, sendChatMessage, displayName, getGradeColor, getGradeLabel, getAvatarInitial, startRanklistFetch, stopRanklistFetch, startVisitReport, stopVisitReport, shouldNotify, getNotifContent, playNotificationSound, getConvoKey, applyFontSize, compressImage } from '../utils.js';

import NavBar from '../components/NavBar.vue';
import ConversationList from '../components/ConversationList.vue';
import ChatHeader from '../components/ChatHeader.vue';
import MessageList from '../components/MessageList.vue';
import InputFooter from '../components/InputFooter.vue';
import ForwardModal from '../components/ForwardModal.vue';
import ContentPreviewModal from '../components/ContentPreviewModal.vue';
import SettingsPanel from '../components/SettingsPanel.vue';
import AboutPanel from '../components/AboutPanel.vue';
import TargetMenu from '../components/TargetMenu.vue';
import UserInfoModal from '../components/UserInfoModal.vue';
import GroupModal from '../components/GroupModal.vue';
import ThemeModal from '../components/ThemeModal.vue';
import ShortcutModal from '../components/ShortcutModal.vue';
import InputModal from '../components/InputModal.vue';
import AddFriendModal from '../components/AddFriendModal.vue';
import GroupActionMenu from '../components/GroupActionMenu.vue';
import SearchPanel from '../components/SearchPanel.vue';
import FavoritesPanel from '../components/FavoritesPanel.vue';
import ToolsPage from '../tools/ToolsPage.vue';
import SaveConfirmModal from '../components/SaveConfirmModal.vue';
import { useWindowControls } from '../composables/useWindowControls.js';
import { useMuteConfirm } from '../composables/useMuteConfirm.js';
import { useCurrentMessages } from '../composables/useCurrentMessages.js';

import '../css/base.css';
import '../css/nav-bar.css';
import '../css/conversation-list.css';
import '../css/chat-view.css';
import '../css/settings-panel.css';
import '../css/about-panel.css';
import '../css/context-menu.css';
import '../css/emoji-picker.css';
import '../css/group-modal.css';
import '../css/theme-modal.css';
import '../css/shortcut-modal.css';
import '../css/user-info.css';
import '../css/addfriend-modal.css';
import '../css/search-panel.css';
import '../css/favorites-panel.css';

import 'katex/dist/katex.min.css';
import '../../css/font-awesome/css/all.min.css';

// --- 页面状态 ---
const pageType = ref('chat');
const pageId = ref(null);
const currentTool = ref('list');
const toolsPageRef = ref(null);
const toolsDirty = ref(false); // 图片编辑未保存标记（ImageTool 上报）
const saveConfirmVisible = ref(false);
let pendingSwitch = null; // 被未保存拦截的切换动作（保存/不保存后执行）
const isChatPage = computed(() => pageType.value === 'chat' || pageType.value === 'user' || pageType.value === 'group');
const navPageType = computed(() => isChatPage.value ? 'chat' : pageType.value);
// 窄长窗口单列模式：窗口高/宽比超过阈值时，会话列表与消息区互斥显示（微信/QQ 窄窗口风格）
const NARROW_ASPECT = 1.4
const isNarrowLayout = ref(false)
function updateLayoutMode() {
  isNarrowLayout.value = window.innerHeight / Math.max(window.innerWidth, 1) > NARROW_ASPECT
}
const contentFading = ref(false);
const listFading = ref(false);
const displayPageType = ref(null);
const displayPageId = ref(null);
const searchVisible = ref(false);
const listWidth = ref(260);
const collapsedMsgs = reactive({});
const visibleCount = ref(20);
const setting = ref({});
const version = ref('');
const showCreateGroupModal = ref(false);
const showAddFriendModal = ref(false);
const allThemes = ['default', 'wechat', 'aurora', 'abyss', 'rose', 'lavender', 'mint', 'peach', 'amber', 'coral', 'sage', 'slate', 'obsidian', 'crimson', 'emerald', 'carbon', 'plasma', 'nord', 'dracula', 'monokai', 'cyberpunk', 'solarized'];
const lastMouseX = ref(0);
const lastMouseY = ref(0);

// --- 组件 ref ---
const messageListRef = ref(null);
const inputFooterRef = ref(null);
const conversationListRef = ref(null);
const searchPanelRef = ref(null);

// --- 弹窗状态 ---
const targetMenu = reactive({ show: false, x: 0, y: 0, type: '', id: null, isPinned: false, isUnread: false });
const userinfo = reactive({ show: false, uid: 0 });
const groupaction = reactive({ show: false, mid: 0, x: 0, y: 0 });
const groupModal = reactive({ show: false, groupId: null });
const themeModal = ref(false);
const shortcutModal = ref(false);
const forwardModalVisible = ref(false);
const forwardMsgContent = ref('');
const previewData = reactive({ show: false, type: '', title: '', src: '', text: '', rawContent: '', showActions: false });

// --- computed ---
const targetUser = computed(() => store.users?.[pageId.value] || null);
const targetGroup = computed(() => store.groups?.[pageId.value] || null);
// 单方面关注关系的提示栏（仅私信会话；群聊 pageId 可能与某用户 uid 相同，必须限定 pageType）
const watchWarnText = computed(() => {
  if (pageType.value !== 'user') return ''
  const u = targetUser.value
  if (!u) return ''
  if (u.watchee !== true && u.watcher === true) return '未关注对方，无法接收对方消息'
  if (u.watchee === true && u.watcher !== true) return '对方没有关注你，无法给对方发消息'
  return ''
});
const inputDisabled = computed(() => {
  // API 契约：可给关注我的人（watcher）发消息，无需我关注对方
  if (pageType.value === 'user') return !targetUser.value?.watcher;
  if (pageType.value === 'group') return !!targetGroup.value?.exited;
  return false;
});
const { currentMessages, currentMessagesLength } = useCurrentMessages(pageType, pageId);

// --- 窗口控制 ---
const { isMaximized, windowMinimize, windowMaximize, windowClose } = useWindowControls();
const { muteModalVisible, pendingMuteMemberId, requestMute, onMuteMinutesConfirm } = useMuteConfirm(submitGroupAction);

// --- 页面切换动画 ---
watch(pageType, (newType, oldType) => {
  if (!oldType) { displayPageType.value = newType; return; }
  const fromChat = oldType === 'user' || oldType === 'group' || oldType === 'chat';
  const toChat = newType === 'user' || newType === 'group' || newType === 'chat';
  // 聊天页面内部切换（user <-> group <-> chat）不需要列表动画
  if (fromChat && toChat) {
    contentFading.value = true;
    setTimeout(() => {
      displayPageType.value = newType;
      displayPageId.value = pageId.value;
      nextTick(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            contentFading.value = false;
          });
        });
      });
    }, 300);
  } else if (fromChat || toChat) {
    // 聊天页面与其他页面（设置/收藏/关于）之间切换
    listFading.value = true;
    contentFading.value = true;
    setTimeout(() => {
      displayPageType.value = newType;
      displayPageId.value = pageId.value;
      nextTick(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            listFading.value = false;
            contentFading.value = false;
          });
        });
      });
    }, 300);
  } else {
    contentFading.value = true;
    setTimeout(() => {
      displayPageType.value = newType;
      nextTick(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            contentFading.value = false;
          });
        });
      });
    }, 300);
  }
}, { immediate: true });

watch(pageId, (newId) => {
  displayPageId.value = newId;
}, { immediate: true });

// --- 列表宽度调整 ---
function startListResize(e) {
  e.preventDefault();
  const startX = e.clientX;
  const startW = listWidth.value;
  function onMove(ev) {
    const delta = ev.clientX - startX;
    listWidth.value = Math.max(180, Math.min(500, startW + delta));
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// --- 页面导航 ---
function switchPage(type) {
  // 未保存的工具内容（图片/Markdown）：离开工具前先确认（保存/不保存/取消）
  if (toolsDirty.value && pageType.value === 'tools' && currentTool.value !== 'list') {
    pendingSwitch = { type };
    saveConfirmVisible.value = true;
    return;
  }
  // “工具”入口：点击时进入工具列表；已在工具页（可能正打开某个工具）则回到列表
  if (type === 'tools') {
    if (pageType.value === 'tools') {
      if (currentTool.value !== 'list') currentTool.value = 'list';
      return;
    }
    groupModal.show = false;
    pageType.value = 'tools';
    pageId.value = null;
    currentTool.value = 'list';
    if (inputFooterRef.value) {
      inputFooterRef.value.mentionVisible = false;
      inputFooterRef.value.emojiVisible = false;
    }
    closeSearch();
    return;
  }
  if (pageType.value === type) return;
  // 'chat' 页面切换时，如果当前已在聊天页面，保留 pageType 不变
  if (type === 'chat' && isChatPage.value) return;
  groupModal.show = false;
  pageType.value = type;
  pageId.value = null;
  if (inputFooterRef.value) {
    inputFooterRef.value.mentionVisible = false;
    inputFooterRef.value.emojiVisible = false;
  }
  closeSearch();
  if (type === 'settings') updateSettingsPanel();
}

// 消息区头部返回：清除当前会话（pageId 置空）回到会话列表
function onBackFromChat() {
  if (pageId.value == null) return;
  pageId.value = null;
  pageType.value = 'chat';
  if (inputFooterRef.value) {
    inputFooterRef.value.mentionVisible = false;
    inputFooterRef.value.emojiVisible = false;
  }
  closeSearch();
  updateBadgeCount();
}

// 未保存拦截弹窗：保存后离开
async function onSaveConfirmSave() {
  saveConfirmVisible.value = false;
  // 按当前打开的工具调用对应保存
  if (currentTool.value === 'image') await toolsPageRef.value?.imageSave();
  else if (currentTool.value === 'markdown') await toolsPageRef.value?.markdownSave();
  else if (currentTool.value === 'math') await toolsPageRef.value?.mathSave();
  // 保存成功后 dirty=false → emit 更新 toolsDirty=false；失败/取消则留在页面
  if (!toolsDirty.value && pendingSwitch) {
    const t = pendingSwitch.type;
    pendingSwitch = null;
    switchPage(t);
  } else {
    pendingSwitch = null;
  }
}

// 未保存拦截弹窗：不保存直接离开
function onSaveConfirmDiscard() {
  saveConfirmVisible.value = false;
  if (pendingSwitch) {
    const t = pendingSwitch.type;
    pendingSwitch = null;
    switchPage(t);
  }
}

function onSelectConversation({ type, id }) {
  if (id === '__new__') {
    if (type === 'group') showCreateGroupModal.value = true;
    if (type === 'user') showAddFriendModal.value = true;
    return;
  }
  if (pageId.value === id && (pageType.value === type || pageType.value === 'chat')) return;
  const doSwitch = () => {
    pageType.value = type;
    pageId.value = id;
    if (inputFooterRef.value) {
      inputFooterRef.value.mentionVisible = false;
      inputFooterRef.value.emojiVisible = false;
      inputFooterRef.value.replyTo = null;
      inputFooterRef.value.errorMessage = '';
    }
    closeSearch();
    visibleCount.value = 20;
    Object.keys(collapsedMsgs).forEach(k => delete collapsedMsgs[k]);
    if (type === 'user') {
      const user = store.users[id];
      if (user) user.unread = 0;
    } else if (type === 'group') {
      const group = store.groups[id];
      if (group) { group.unread = 0; group.mentioned = false; }
    }
    updateBadgeCount();
    // 已读清零立即落盘（节流保存最长 30s，避免刷新/重登后未读恢复）
    saveConvos();
    // 懒加载：从 SQLite 补拉该会话的历史消息到内存（缺失内容）
    ensureConvoMessages(type, id);
  };
  contentFading.value = true;
  setTimeout(() => {
    doSwitch();
    nextTick(() => {
      messageListRef.value?.scrollToBottomInstant();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { contentFading.value = false; });
      });
    });
  }, 300);
}

function onNewConversationFromList(type) {
  if (type === 'group') showCreateGroupModal.value = true;
}

// --- 消息列表事件 ---
function onMessageAreaScrollToTop(height, loadAll) {
  if (loadAll) {
    visibleCount.value = currentMessagesLength.value;
  } else {
    visibleCount.value += 20;
    const el = messageListRef.value?.messageAreaEl;
    if (el) {
      // DOM 更新后第一时间修正滚动位置，缩短插入消息导致的闪烁窗口
      nextTick(() => {
        const target = el.scrollHeight - height;
        el.scrollTop = target > 0 ? target : 0;
      });
    }
  }
}

function jumpToMessage(msgId) {
  messageListRef.value?.jumpToMessage(msgId);
}

// 全局搜索跳转：支持跨会话跳转
function onSearchJump(data) {
  if (typeof data === 'object' && data.convoType) {
    pageType.value = data.convoType;
    pageId.value = data.convoId;
    nextTick(() => {
      setTimeout(() => messageListRef.value?.jumpToMessage(data.msgId), 300);
    });
  } else {
    jumpToMessage(data);
  }
}

function startReply(msg) {
  inputFooterRef.value?.startReply(msg);
}

function startForward(msgContent) {
  forwardMsgContent.value = msgContent;
  forwardModalVisible.value = true;
}

async function forwardToTarget(type, targetId, msgContent) {
  if (!type || !targetId || !msgContent) return;
  try {
    const r = await (await safeFetch('/chat/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, target_id: targetId, content: msgContent })
    })).json();
    if (!r.success) {
      if (inputFooterRef.value) inputFooterRef.value.errorMessage = '转发失败';
    } else {
      if (inputFooterRef.value) inputFooterRef.value.errorMessage = '';
      const { tokenInfo } = applyChatToStore(r, type, targetId);
      if (inputFooterRef.value) inputFooterRef.value.tokenInfo = tokenInfo;
    }
  } catch {
    if (inputFooterRef.value) inputFooterRef.value.errorMessage = '转发失败';
  }
}

async function doForward({ type, targetId, msgContent }) {
  // 检测是否为多条消息（JSON数组格式）
  let contents;
  try {
    const parsed = JSON.parse(msgContent);
    if (Array.isArray(parsed)) {
      contents = parsed;
    } else {
      contents = null;
    }
  } catch {
    contents = null;
  }

  if (contents) {
    // 多条消息逐条转发
    for (const content of contents) {
      await forwardToTarget(type, targetId, content);
    }
  } else {
    // 单条消息转发
    await forwardToTarget(type, targetId, msgContent);
  }
  forwardModalVisible.value = false;
}

async function onDropFile({ targetType, targetId, file }) {
  if (!file) return;
  if (inputFooterRef.value) inputFooterRef.value.errorMessage = '';
  try {
    const result = await compressImage(file);
    if (!result) return;
    const mime = file.type?.startsWith('image/') ? 'image/jpeg' : (file.type || 'application/octet-stream');
    const msgObj = { type: 'file', name: file.name, size: result.size, data: result.data, mime };
    const r = await sendChatMessage({ type: targetType, targetId, msgObj });
    if (!r.success) {
      if (inputFooterRef.value) inputFooterRef.value.errorMessage = r.err?.message || '发送失败';
    } else {
      if (inputFooterRef.value) inputFooterRef.value.errorMessage = '';
      const { tokenInfo } = applyChatToStore(r, targetType, targetId);
      if (inputFooterRef.value) inputFooterRef.value.tokenInfo = tokenInfo;
    }
  } catch {
    if (inputFooterRef.value) inputFooterRef.value.errorMessage = '发送失败';
  }
}

async function sendPat(targetUid) {
  if (inputFooterRef.value?.sending) return;
  inputFooterRef.value.sending = true;
  const msgObj = { type: 'pat', target: targetUid };
  try {
    const r = await sendChatMessage({ type: pageType.value, targetId: pageId.value, msgObj });
    if (r.success) {
      if (inputFooterRef.value) inputFooterRef.value.errorMessage = '';
      const { tokenInfo } = applyChatToStore(r, pageType.value, pageId.value);
      if (inputFooterRef.value) inputFooterRef.value.tokenInfo = tokenInfo;
    } else {
      if (inputFooterRef.value) inputFooterRef.value.errorMessage = r.err?.message || '拍一拍发送失败';
    }
  } catch {
    if (inputFooterRef.value) inputFooterRef.value.errorMessage = '拍一拍发送失败';
  }
  inputFooterRef.value.sending = false;
}

// --- 消息删除/批量操作 ---
function deleteMsg(msgId) {
  const msg = store.messages[msgId];
  if (!msg) return;
  delete store.messages[msgId];
  if (!store.deletedMsgIds) store.deletedMsgIds = [];
  if (!store.deletedMsgIds.includes(msgId)) store.deletedMsgIds.push(msgId);
  for (const user of Object.values(store.users)) {
    if (user.message_ids) {
      const idx = user.message_ids.indexOf(msgId);
      if (idx >= 0) user.message_ids.splice(idx, 1);
    }
  }
  for (const group of Object.values(store.groups)) {
    if (group.message_ids) {
      const idx = group.message_ids.indexOf(msgId);
      if (idx >= 0) group.message_ids.splice(idx, 1);
    }
  }
  saveData();
}

function batchForward() {
  const selectedIds = [...store.selectedMsgIds];
  if (!selectedIds.length) return;
  const contents = selectedIds.map(id => store.messages[id]?.content).filter(Boolean);
  if (contents.length === 1) {
    startForward(contents[0]);
  } else {
    // 多条消息：弹出选择弹窗，选择目标后逐条转发
    forwardMsgContent.value = JSON.stringify(contents);
    forwardModalVisible.value = true;
  }
  messageListRef.value?.exitMultiSelect();
}

function batchFavorite() {
  const selectedIds = [...store.selectedMsgIds];
  if (!selectedIds.length) return;
  for (const msgId of selectedIds) {
    const msg = store.messages[msgId];
    if (!msg) continue;
    if (!store.favorites.some(f => f.id === msgId)) {
      store.favorites.push({
        id: msgId,
        content: msg.content,
        sender: msg.sender,
        send_time: msg.send_time,
        fromType: pageType.value,
        fromId: pageId.value,
        savedAt: Date.now()
      });
    }
  }
  messageListRef.value?.exitMultiSelect();
  saveData();
}

function batchDelete() {
  if (!confirm(`确定删除 ${store.selectedMsgIds.length} 条消息？`)) return;
  for (const msgId of [...store.selectedMsgIds]) {
    deleteMsg(msgId);
  }
  messageListRef.value?.exitMultiSelect();
  saveData();
}

// --- 全部已读 ---
function markAllRead() {
  for (const user of Object.values(store.users)) user.unread = 0;
  for (const group of Object.values(store.groups)) group.unread = 0;
  updateBadgeCount();
  saveConvos(); // 立即落盘，避免刷新后未读恢复
}

// --- 未读计数 badge ---
function updateBadgeCount() {
  let total = 0;
  for (const u of Object.values(store.users)) total += (u.unread || 0);
  for (const g of Object.values(store.groups)) total += (g.unread || 0);
  if (window.api.setBadgeCount) window.api.setBadgeCount(total);
}

// --- 删除聊天记录/免打扰 ---
async function deleteConvo() {
  const { type, id } = targetMenu;
  targetMenu.show = false;
  if (!confirm('确定删除此会话？本地聊天记录将被清除。')) return;
  const item = type === 'user' ? store.users[id] : store.groups[id];
  if (item?.message_ids) {
    if (!store.deletedMsgIds) store.deletedMsgIds = [];
    for (const mid of item.message_ids) {
      delete store.messages[mid];
      if (!store.deletedMsgIds.includes(mid)) store.deletedMsgIds.push(mid);
    }
  }
  if (type === 'user') {
    if (store.users[id]) store.users[id].show = false;
  } else {
    delete store.groups[id];
  }
  if (pageId.value == id && (pageType.value === type || pageType.value === 'chat')) pageId.value = null;
  updateBadgeCount();
  await saveData();
}

function toggleMute() {
  const { type, id } = targetMenu;
  targetMenu.show = false;
  const key = getConvoKey(type, id);
  if (!store.mutedConvos) store.mutedConvos = {};
  store.mutedConvos[key] = !store.mutedConvos[key];
  if (!store.mutedConvos[key]) delete store.mutedConvos[key];
  saveData();
}

function toggleRead() {
  const { type, id, isUnread } = targetMenu;
  targetMenu.show = false;
  const item = type === 'user' ? store.users[id] : store.groups[id];
  if (!item) return;
  if (isUnread) {
    item.unread = 0;
    if (type === 'group') item.mentioned = false;
  } else {
    item.unread = 1;
  }
  updateBadgeCount();
  saveData();
}

// --- 搜索 ---
function toggleSearch() { searchVisible.value = !searchVisible.value; }
function closeSearch() { searchVisible.value = false; }

// --- 弹窗 ---
function onFavPreview(fav) {
  previewData.type = 'html';
  previewData.title = '收藏消息';
  previewData.src = '';
  previewData.text = parseContent(fav.content);
  previewData.rawContent = fav.content;
  previewData.showActions = true;
  previewData.show = true;
}

function onFavForward(fav) {
  startForward(fav.content);
}

async function onFavCopy(fav) {
  const obj = parseMsgContent(fav.content);
  if (obj && obj.type === 'file' && obj.data) {
    const isImage = /^image\//.test(obj.mime || '');
    if (isImage) {
      const r = await window.api.clipboardWriteImage(obj.data);
      if (!r.success) await window.api.clipboardWriteText(obj.name || '');
    } else {
      await window.api.clipboardWriteText(obj.name || '');
    }
  } else if (obj && obj.type === 'sticker' && obj.data) {
    const r = await window.api.clipboardWriteImage(obj.data);
    if (!r.success) await window.api.clipboardWriteText(obj.name || '');
  } else {
    let text = '';
    if (obj) {
      if (obj.type === 'text') text = obj.content;
      else if (obj.type === 'emoji') text = obj.content;
      else text = fav.content;
    } else {
      text = fav.content;
    }
    await window.api.clipboardWriteText(text);
  }
}

function onFavDownload(fav) {
  const obj = parseMsgContent(fav.content);
  if (obj && (obj.type === 'file' || obj.type === 'sticker') && obj.data) {
    window.api.downloadFile(obj.data, obj.name || 'download', obj.mime);
  }
}

function onPreviewCopy() {
  const content = previewData.rawContent;
  if (!content) return;
  onFavCopy({ content });
}

function onPreviewForward() {
  const content = previewData.rawContent;
  if (!content) return;
  previewData.show = false;
  startForward(content);
}

function onPreviewDownload() {
  const content = previewData.rawContent;
  if (!content) return;
  onFavDownload({ content });
}

function onOpenPreview(data) {
  previewData.type = data.type;
  previewData.title = data.title;
  previewData.src = data.src;
  previewData.text = data.text;
  previewData.rawContent = '';
  previewData.showActions = false;
  previewData.show = true;
}
function openuserinfo(uid) { userinfo.uid = uid; userinfo.show = true; }
function openGroupSettings(gid) { groupModal.groupId = gid; groupModal.show = true; }
function openThemeModal() { themeModal.value = true; }
function updateSettingsPanel() {}
function openGroupActionMenu(event, member) {
  event.preventDefault();
  groupaction.show = false;
  groupaction.mid = member;
  groupaction.x = event.clientX;
  groupaction.y = event.clientY;
  setTimeout(() => groupaction.show = true, 1);
}

// --- 目标菜单 ---
function onTargetMenu(e, type, id) {
  e.preventDefault();
  const item = type === 'user' ? store.users[id] : store.groups[id];
  targetMenu.show = false;
  targetMenu.x = e.clientX;
  targetMenu.y = e.clientY;
  targetMenu.type = type;
  targetMenu.id = id;
  targetMenu.isPinned = item?.pinned || false;
  targetMenu.isUnread = (item?.unread || 0) > 0;
  setTimeout(() => targetMenu.show = true, 1);
}

async function togglePin() {
  const item = targetMenu.type === 'user' ? store.users[targetMenu.id] : store.groups[targetMenu.id];
  if (!item) return;
  item.pinned = !item.pinned;
  await saveData();
  targetMenu.show = false;
}

// --- 群组操作 ---
async function postGroup(body) {
  return await (await safeFetch('/chat/group', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
}

async function refreshInfo() {
  const info = await (await safeFetch('/chat/info')).json();
  if (info.success) await update(info);
}

async function leaveGroupFromMenu() {
  targetMenu.show = false;
  await submitGroupAction({ type: 'leave', targetId: 0 }, targetMenu.id);
}

async function blockGroupFromMenu() {
  targetMenu.show = false;
  await submitGroupAction({ type: 'block' }, targetMenu.id);
}

async function unblockGroupFromMenu() {
  const gid = targetMenu.id;
  targetMenu.show = false;
  const group = store.groups[gid];
  if (!group) return;
  group.blocked = false;
  await saveData();
}

async function deleteGroupFromMenu() {
  const gid = targetMenu.id;
  targetMenu.show = false;
  const group = store.groups[gid];
  if (!group || !group.exited) return;
  if (group.message_ids) { for (const mid of group.message_ids) delete store.messages[mid]; }
  delete store.groups[gid];
  if (pageId.value == gid && (pageType.value === 'group' || pageType.value === 'chat')) pageId.value = null;
  await saveData();
}

async function dissolveGroupFromMenu() {
  targetMenu.show = false;
  if (!store.groups[targetMenu.id]) return;
  await submitGroupAction({ type: 'dissolve', targetId: 0 }, targetMenu.id);
}

function onGroupAction(action) {
  if (action.type === 'private_chat') { onSelectConversation({ type: 'user', id: action.targetId }); return; }
  if (action.type === 'view_profile') { openuserinfo(action.targetId); return; }
  if (action.type === 'mute_member') { requestMute(action.targetId); return; }
  const submitAction = { type: action.type, targetId: action.type !== 'leave' ? action.targetId : 0 };
  submitGroupAction(submitAction);
  muteModalVisible.value = false;
}

async function submitGroupAction(action, gidOverride) {
  const gid = gidOverride || groupModal.groupId || pageId.value;
  if (action.type === 'block') {
    const group = store.groups[gid];
    if (group) {
      group.exited = true;
      group.blocked = true;
      try { await postGroup({ type: 'leave', group_id: gid, target_id: 0 }); } catch {}
      groupModal.show = false;
      await saveData();
    }
    return;
  }
  if (action.type === 'dissolve') {
    const group = store.groups[gid];
    if (group) {
      try {
        const members = group.users.filter(u => String(u.user_id) !== String(store.self.uid));
        for (const m of members) {
          await postGroup({ type: 'del_member', group_id: gid, target_id: m.user_id });
        }
      } catch {}
    }
    action = { ...action, type: 'leave' };
  }
  // 支持批量选人：targetIds 数组优先，否则回退单 targetId
  const targets = (action.targetIds && action.targetIds.length)
    ? action.targetIds.map(String)
    : [action.targetId];
  if (action.type === 'give_owner' && targets.length > 1) { alert('转让群主只能选择一名成员'); return; }
  if (targets.length === 0) { alert('请选择成员'); return; }
  let failed = false;
  for (const tid of targets) {
    const body = { type: action.type, group_id: gid, target_id: tid, title: action.title };
    if (action.type === 'mute_member' || action.type === 'mute_group') {
      body.mute = Math.floor(Date.now() / 1000 + action.muteMinutes * 60);
    }
    try {
      const r = await postGroup(body);
      if (!r.success) {
        failed = true;
        const msg = r.err?.message || '操作失败';
        if (targets.length === 1) { alert(msg); return; }
      }
    } catch { failed = true; if (targets.length === 1) { alert('操作失败，请重试'); return; } }
  }
  if (failed && targets.length > 1) alert('部分成员操作失败，请重试');
  if (action.type === 'leave') { const group = store.groups[gid]; if (group) group.exited = true; groupModal.show = false; }
  await refreshInfo();
}

async function createGroup(title) {
  if (!title) return;
  try {
    const r = await postGroup({ type: 'setup', title });
    if (!r.success) { alert(r.err?.message || '创建失败'); return; }
    await refreshInfo();
  } catch {}
}

async function addfriend(q) {
  if (!q) return;
  try {
    const r = await (await safeFetch(`/user/${store.self.uid}/friend/json`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q }) })).json();
    if (!r.success) { alert(r.err?.message || '添加失败'); return; }
    await refreshInfo();
  } catch {}
}

// --- 快捷键 ---
const DEFAULT_SHORTCUTS = { sendMessage: 'enter', search: 'ctrl+f', switchToChat: 'ctrl+1', switchToFavorites: 'ctrl+2', switchToSettings: 'ctrl+3', switchToAbout: 'ctrl+4', newConversation: 'ctrl+n' };
function getShortcutValue(action) { return setting.value?.shortcuts?.[action] || DEFAULT_SHORTCUTS[action]; }
function parseShortcut(shortcut) {
  const parts = shortcut.toLowerCase().split('+');
  return { ctrl: parts.includes('ctrl'), meta: parts.includes('meta'), shift: parts.includes('shift'), alt: parts.includes('alt'), key: parts.filter(p => !['ctrl', 'meta', 'shift', 'alt'].includes(p))[0] || '' };
}
function matchShortcut(e, shortcut) {
  const s = parseShortcut(shortcut);
  return e.ctrlKey === s.ctrl && e.metaKey === s.meta && e.shiftKey === s.shift && e.altKey === s.alt && e.key.toLowerCase() === s.key;
}

function handleGlobalShortcuts(e) {
  if (matchShortcut(e, getShortcutValue('search'))) {
    e.preventDefault();
    const activeEl = document.activeElement;
    if (activeEl?.classList.contains('list-search-input')) {
      if (isChatPage.value) { if (!searchVisible.value) searchVisible.value = true; nextTick(() => searchPanelRef.value?.focusInput()); }
    } else if (activeEl?.classList.contains('search-input')) {
      conversationListRef.value?.focusSearch();
    } else if (forwardModalVisible.value) {
    } else if (groupModal.show) {
      document.dispatchEvent(new CustomEvent('focus-group-search'));
    } else if (inputFooterRef.value?.emojiVisible) {
      document.dispatchEvent(new CustomEvent('focus-emoji-search'));
    } else {
      const mouseTarget = document.elementFromPoint(lastMouseX.value, lastMouseY.value);
      const inChatArea = mouseTarget?.closest('.chat-main');
      if (inChatArea) {
        if (isChatPage.value) { if (!searchVisible.value) searchVisible.value = true; nextTick(() => searchPanelRef.value?.focusInput()); }
      } else if (searchVisible.value) {
        searchPanelRef.value?.focusInput();
      } else if (isChatPage.value) {
        conversationListRef.value?.focusSearch();
      }
    }
    return true;
  }
  if (matchShortcut(e, getShortcutValue('switchToChat'))) { e.preventDefault(); switchPage('chat'); return true; }
  if (matchShortcut(e, getShortcutValue('switchToFavorites'))) { e.preventDefault(); switchPage('favorites'); return true; }
  if (matchShortcut(e, getShortcutValue('switchToSettings'))) { e.preventDefault(); switchPage('settings'); return true; }
  if (matchShortcut(e, getShortcutValue('switchToAbout'))) { e.preventDefault(); switchPage('about'); return true; }
  if (matchShortcut(e, getShortcutValue('newConversation'))) { e.preventDefault(); showAddFriendModal.value = true; return true; }
  return false;
}

// --- 设置 ---
function onSettingChange(changes) {
  if (changes._clearCache) {
    clearCacheAndReload();
    return;
  }
  Object.assign(setting.value, changes);
  store.setting = setting.value;
  if (changes.fontSize !== undefined) applyFontSize(changes.fontSize);
  window.api.saveSetting(JSON.parse(JSON.stringify(setting.value)));
}

async function clearCacheAndReload() {
  store.initializing = true;
  try {
    // 清空内存中的聊天数据
    store.users = {};
    store.groups = {};
    store.messages = {};
    store.stickers = [];
    store.drafts = {};
    store.favorites = [];
    store.mutedConvos = {};
    store.hiddenConvos = {};
    store.deletedMsgIds = [];
    // 从服务器重新拉取
    const result = await (await safeFetch('/chat/info')).json();
    if (result.success) await update(result);
    await updateMessagesData();
  } catch {} finally {
    store.initializing = false;
  }
}

// --- 数据层 ---
let pollTimer = null;
let infoLoopRunning = false;
let autoSaveTimer = null;
let unsubscribeNotifClick = null;
let unsubscribeUploadProgress = null;

// 通知冷却（聚合）：同一会话 5 秒内只通知一次
const notifCooldown = {};
const notifPendingCount = {};

async function update(result) {
  if (!infoLoopRunning) return;
  // token 限制（滑动窗口恢复周期/容量）：/chat/info limit { time_limit, count_limit, ... }
  if (result.limit && typeof result.limit === 'object') store.tokenLimit = result.limit;
  Object.assign(store.self, { uid: result.user.id, username: result.user.uid, nickname: result.user.nickname, realname: result.user.real_name, school: result.user.school, seat: result.user.seat });
  const friendsMap = Object.fromEntries(result.friends
    .filter(f => f.watchee === true || f.watcher === true) // 既非我关注、也非关注我的关系条目不显示
    .map(f => {
      const old = store.users[f.id];
      return [f.id, { uid: f.id, realname: f.real_name, username: f.username, nickname: f.nickname, grade: f.grade, grade_class: f.grade_class, seat: f.seat, watchee: f.watchee === true, watcher: f.watcher === true, note: old ? old.note : '', message_ids: old ? old.message_ids : [], unread: old ? old.unread : 0, pinned: old ? old.pinned : false, _fetchedAt: old ? old._fetchedAt : undefined }];
    }));
  const hiddenUsers = Object.fromEntries(Object.entries(store.users).filter(([, u]) => u.show === false && !friendsMap[u.uid]));
  store.users = { ...friendsMap, ...hiddenUsers };
  startRanklistFetch();
  startVisitReport(); // 独立访问统计上报定时器（与 ranklist 解耦，防漏报）
  const newGroupIds = new Set(result.groups.map(g => g.id));
  const newGroups = Object.fromEntries(result.groups.map(g => {
    const old = store.groups[g.id];
    return [g.id, { gid: g.id, name: g.title, mute: g.mute, users: g.users.map(({ user_id, type, mute }) => ({ user_id, type, mute })), message_ids: old ? old.message_ids : [], unread: old ? old.unread : 0, pinned: old ? old.pinned : false, mentioned: old ? old.mentioned : false, exited: false, blocked: old ? old.blocked : false }];
  }));
  for (const [gid, oldGroup] of Object.entries(store.groups)) { if (!newGroupIds.has(Number(gid))) { oldGroup.exited = true; newGroups[gid] = oldGroup; } }
  for (const [gid, newGroup] of Object.entries(newGroups)) {
    if (newGroup.blocked && !newGroup.exited) { try { await postGroup({ type: 'leave', group_id: Number(gid), target_id: 0 }); newGroup.exited = true; } catch {} }
  }
  store.groups = newGroups;
  await saveData();
}

async function fetchMessages(type, end) {
  if (!infoLoopRunning) return;
  try {
    const endSec = Math.floor(end / 1000);
    const r = await (await safeFetch(`/chat/chat?type=${type}&end_time=${endSec}&take=10`)).json();
    if (!r.success || !r.chats || !r.chats.length) return;
    let needContinue = true;
    const pendingPersist = {}; // 本轮新消息按会话分组，循环后增量入库
    for (const c of r.chats) {
      if (!infoLoopRunning) return;
      end = Math.min(end, c.send_time * 1000 - 1);
      if (type === 'user' && c.sender_id === store.self.uid) continue;
      const t = type === 'group' ? store.groups[c.receiver_id] : type === 'send_user' ? store.users[c.receiver_id] : store.users[c.sender_id];
      if (!t) continue;
      const isCurrentPage = (pageType.value === (type === 'group' ? 'group' : 'user') || (isChatPage.value && pageId.value)) && pageId.value === (type === 'group' ? c.receiver_id : (type === 'send_user' ? c.receiver_id : c.sender_id));
      if (isCurrentPage) t.unread = 0;
      if (t.message_ids.includes(c.id) || (store.deletedMsgIds && store.deletedMsgIds.includes(c.id))) { needContinue = false; } else {
        const msgContent = c.content;
        store.messages[c.id] = { id: c.id, sender: c.sender_id, send_time: c.send_time, content: msgContent };
        t.message_ids.push(c.id);
        const persistKind = type === 'group' ? 'group' : 'user';
        const persistCid = type === 'group' ? c.receiver_id : (type === 'send_user' ? c.receiver_id : c.sender_id);
        const pk = persistKind + ':' + persistCid;
        if (!pendingPersist[pk]) pendingPersist[pk] = { kind: persistKind, cid: persistCid, msgs: [] };
        pendingPersist[pk].msgs.push({ id: c.id, sender: c.sender_id, send_time: c.send_time, content: msgContent });
        const state = await window.api.getWindowState();
        if (!state.focused || !state.visible) {
          const chatType = type === 'group' ? 'group' : 'user';
          const targetId = type === 'group' ? c.receiver_id : (type === 'send_user' ? c.receiver_id : c.sender_id);
          if (shouldNotify(chatType, targetId, setting.value)) {
            const convoKey = getConvoKey(chatType, targetId);
            notifPendingCount[convoKey] = (notifPendingCount[convoKey] || 0) + 1;
            const now = Date.now();
            if (!notifCooldown[convoKey] || now - notifCooldown[convoKey] > 5000) {
              notifCooldown[convoKey] = now;
              const msg = JSON.parse(msgContent);
              // 通知正文内容提取（拍一拍等结构化消息没有 content 字段）
              let notifRaw = ''
              if (msg.type === 'file') notifRaw = '📄 ' + (msg.name || '')
              else if (msg.type === 'sticker') notifRaw = '🖼️ ' + (msg.name || '表情')
              else if (msg.type === 'pat') notifRaw = '👋 拍了拍'
              else if (msg.type === 'emoji') notifRaw = (msg.content || '') + ' '
              else notifRaw = msg.content || ''
              const notifContent = notifPendingCount[convoKey] > 1
                ? `${getNotifContent(notifRaw, setting.value)} (+${notifPendingCount[convoKey] - 1})`
                : getNotifContent(notifRaw, setting.value);
              // 标题：群聊显示群名（避免误判私信），私信显示发送者；正文：群聊前置发送者名
              const notifTitle = chatType === 'group'
                ? (store.groups[targetId]?.name || '群聊')
                : getUsername(c.sender_id, store.users);
              const notifBody = chatType === 'group'
                ? `${getUsername(c.sender_id, store.users)}：${notifContent}`
                : notifContent;
              await window.api.notify(notifTitle, notifBody, chatType, targetId);
              if (setting.value?.notifSound !== false) playNotificationSound(msg.mentions?.includes(store.self.uid) ? 'mention' : 'default');
              notifPendingCount[convoKey] = 0; // 已弹窗，聚合计数归零，避免 (+N) 无限累积
            }
          }
          // 仅真正的新消息计未读/提及（已读历史消息不计，避免刷新/重登后未读恢复）
          if (c.sender_id !== store.self.uid && !isCurrentPage) t.unread = (t.unread || 0) + 1;
          if (type === 'group' && c.sender_id !== store.self.uid) {
            try { const msgObj = JSON.parse(msgContent); if (msgObj.mentions && (msgObj.mentions.includes(store.self.uid) || msgObj.mentions.includes('all'))) t.mentioned = true; } catch {}
          }
        }
      }
    }
    // 本轮新消息增量入库（按会话事务批量写）
    for (const { kind, cid, msgs } of Object.values(pendingPersist)) {
      persistMessages(msgs, kind, cid)
    }
    updateBadgeCount();
    if (needContinue) await fetchMessages(type, end);
  } catch (e) { console.error(e); }
}

async function updateMessagesData() {
  await fetchMessages('user', Date.now());
  await fetchMessages('send_user', Date.now());
  await fetchMessages('group', Date.now());
}

// ===== SQLite 存储（加密）：偏好 / 元数据节流 / 消息懒加载 =====
let convoSaveTimer = null
let prefSaveTimer = null

async function saveConvos() {
  const uid = store.self.uid
  if (!uid) return
  const convos = []
  for (const [id, u] of Object.entries(store.users || {})) {
    if (u && u.uid != null) convos.push({ kind: 'user', cid: Number(id), meta: u })
  }
  for (const [id, g] of Object.entries(store.groups || {})) {
    if (g && g.gid != null) convos.push({ kind: 'group', cid: Number(id), meta: g })
  }
  if (convos.length) {
    try { await window.api.storeSaveConvos(uid, convos) } catch {}
  }
}

function scheduleConvoSave(delay = 30000) {
  clearTimeout(convoSaveTimer)
  convoSaveTimer = setTimeout(() => { saveConvos() }, delay)
}

async function savePrefs() {
  const uid = store.self.uid
  if (!uid) return
  try {
    await window.api.storeSavePrefs(uid, {
      drafts: store.drafts || {},
      favorites: store.favorites || [],
      mutedConvos: store.mutedConvos || {},
      hiddenConvos: store.hiddenConvos || {},
      deletedMsgIds: store.deletedMsgIds || [],
      stickers: store.stickers || []
    })
  } catch {}
}

function schedulePrefSave(delay = 1500) {
  clearTimeout(prefSaveTimer)
  prefSaveTimer = setTimeout(() => { savePrefs() }, delay)
}

/** 消息增量入库（按会话事务批量写） */
async function persistMessages(msgs, kind, cid) {
  const uid = store.self.uid
  if (!uid || !msgs || !msgs.length) return
  try { await window.api.storeSaveMessages(uid, kind, Number(cid), msgs) } catch {}
}

/** 懒加载：进入会话时从 SQLite 补拉缺失的历史消息到内存 */
async function ensureConvoMessages(kind, cid) {
  const uid = store.self.uid
  if (!uid || cid == null) return
  const target = kind === 'group' ? store.groups[cid] : store.users[cid]
  if (!target || !Array.isArray(target.message_ids) || !target.message_ids.length) return
  const missing = target.message_ids.filter(mid => !store.messages[mid])
  if (!missing.length) return
  try {
    const r = await window.api.storeLoadMessages(uid, kind, Number(cid), 1000)
    if (r.success && Array.isArray(r.data)) {
      for (const m of r.data) {
        if (m && m.id != null && !store.messages[m.id]) store.messages[m.id] = m
      }
    }
  } catch {}
}

/** 立即落盘（退出登录前调用） */
async function flushData() {
  clearTimeout(convoSaveTimer)
  clearTimeout(prefSaveTimer)
  convoSaveTimer = null
  prefSaveTimer = null
  await Promise.all([saveConvos(), savePrefs()])
}

async function loadData() {
  const uid = store.self.uid
  if (!uid) return
  try { await window.api.storeInit(uid) } catch {}
  try {
    const [cr, pr, lr] = await Promise.all([
      window.api.storeLoadConvos(uid),
      window.api.storeLoadPrefs(uid),
      window.api.storeLoadLastMessages(uid)
    ])
    // 每个会话最新一条消息（会话列表预览/排序）
    if (lr && lr.success && Array.isArray(lr.data)) {
      for (const { msg } of lr.data) {
        if (msg && msg.id != null && !store.messages[msg.id]) store.messages[msg.id] = msg
      }
    }
    if (cr && cr.success) {
      if (cr.users) store.users = { ...store.users, ...cr.users }
      if (cr.groups) store.groups = { ...store.groups, ...cr.groups }
    }
    if (pr && pr.success && pr.data) {
      const d = pr.data
      if (d.favorites) store.favorites = d.favorites
      if (d.drafts) store.drafts = d.drafts
      if (d.mutedConvos) store.mutedConvos = d.mutedConvos
      if (d.hiddenConvos) store.hiddenConvos = d.hiddenConvos
      if (d.deletedMsgIds) store.deletedMsgIds = d.deletedMsgIds
      if (d.stickers) store.stickers = d.stickers
    }
  } catch {}
  if (Array.isArray(store.users)) store.users = Object.fromEntries(store.users.map(u => [u.uid, u]));
  if (Array.isArray(store.groups)) store.groups = Object.fromEntries(store.groups.map(g => [g.gid, g]));
  if (!store.messages || typeof store.messages !== 'object') store.messages = {};
  Object.values(store.users).forEach(u => {
    if (Array.isArray(u.messages) && !u.message_ids) { u.message_ids = []; for (const m of u.messages) u.message_ids.push(m.id); delete u.messages; }
    if (!Array.isArray(u.message_ids)) u.message_ids = [];
    if (u.unread === undefined) u.unread = 0;
    if (u.unread === true) u.unread = 1;
    if (u.unread === false) u.unread = 0;
    if (u.pinned === undefined) u.pinned = false;
  });
  Object.values(store.groups).forEach(g => {
    if (Array.isArray(g.messages) && !g.message_ids) { g.message_ids = []; for (const m of g.messages) g.message_ids.push(m.id); delete g.messages; }
    if (!Array.isArray(g.message_ids)) g.message_ids = [];
    if (g.unread === undefined) g.unread = 0;
    if (g.unread === true) g.unread = 1;
    if (g.unread === false) g.unread = 0;
    if (g.pinned === undefined) g.pinned = false;
    if (g.mentioned === undefined) g.mentioned = false;
    if (g.exited === undefined) g.exited = false;
    if (g.blocked === undefined) g.blocked = false;
  });
}

/** 兼容旧调用点：安排保存（元数据与偏好节流；消息走增量入库） */
function saveData() {
  scheduleConvoSave()
  schedulePrefSave()
}

async function logout() {
  // 先停止轮询与后台任务，防止异步操作继续往 store 写数据
  infoLoopRunning = false;
  if (pollTimer) clearInterval(pollTimer);
  if (autoSaveTimer) clearInterval(autoSaveTimer);
  stopRanklistFetch(); // 停止 ranklist 轮询（退登结束，重新登录后自动重启）
  stopVisitReport();   // 停止访问统计上报定时器
  // 等待可能正在执行的异步操作完成
  await new Promise(r => setTimeout(r, 100));
  // 退出前先保存当前数据（立即落盘，不等节流）
  await flushData();
  // 服务端登出：POST /logout 销毁服务器会话，并由服务器返回 Set-Cookie 删除有效 cookie
  try { await safeFetch('/logout', { method: 'POST' }, 10000) } catch {}
  // 本地兜底：清除会话 cookie（含 HttpOnly，渲染进程 document.cookie 无法删除）
  try { await window.api.clearSessionCookies(); } catch {}
  const s = await window.api.loadSetting();
  s.keepLogin = false;
  s.loginUsername = '';
  s.loginPassword = '';
  await window.api.saveSetting(s);
  Object.assign(store, { self: { uid: null, username: null, nickname: null, realname: null }, users: {}, groups: {}, messages: {}, stickers: [], drafts: {}, favorites: [], mutedConvos: {}, hiddenConvos: {} });
  store.logined = false;
}

async function startInfoLoop() {
  if (!store.logined) return;
  infoLoopRunning = true;
  let failCount = 0;
  while (infoLoopRunning && store.logined) {
    try { const result = await (await safeFetch('/chat/info')).json(); if (!infoLoopRunning) break; if (result.success) { await update(result); failCount = 0; } else failCount++; } catch { failCount++; }
    if (!infoLoopRunning) break;
    if (failCount >= 3) {
      // 连续失败（如无法访问 jx）：退避到 10s，避免高频空转
      await new Promise(r => setTimeout(r, 10000));
      continue;
    }
    try { await updateMessagesData(); } catch {}
    if (!infoLoopRunning) break;
    try {
      const tr = await (await safeFetch('/chat/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'none' }) })).json();
      if (tr.success && tr.remain_token_count !== undefined) {
        if (inputFooterRef.value) inputFooterRef.value.tokenInfo = { remain: tr.remain_token_count, total: tr.remain_token_count + tr.used_token_count };
      }
    } catch {}
    await new Promise(r => setTimeout(r, setting.value.pollInterval || 1000));
  }
}

// --- 全局事件 ---
function onDocKeydown(e) {
  if (handleGlobalShortcuts(e)) return;
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && isChatPage.value) {
    const tag = document.activeElement?.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !document.activeElement?.isContentEditable) {
      e.preventDefault();
      conversationListRef.value?.navigateConversation(e.key === 'ArrowUp' ? -1 : 1);
      return;
    }
  }
  if (e.key === 'Escape') {
    if (store.multiSelectMode) { messageListRef.value?.exitMultiSelect(); return; }
    if (shortcutModal.value) { shortcutModal.value = false; return; }
    if (inputFooterRef.value) { inputFooterRef.value.emojiVisible = false; inputFooterRef.value.mentionVisible = false; }
    targetMenu.show = false;
    if (messageListRef.value) { messageListRef.value.msgCtx.show = false; }
    if (previewData.show) { previewData.show = false; return; }
    forwardModalVisible.value = false;
    groupModal.show = false;
    if (inputFooterRef.value?.replyTo) { inputFooterRef.value.replyTo = null; return; }
  }
}

function onDocClick(e) {
  if (!e.target.closest('.context-menu')) targetMenu.show = false;
  if (!e.target.closest('.msg-ctx') && messageListRef.value) messageListRef.value.msgCtx.show = false;
  if (!e.target.closest('.emoji-picker') && !e.target.closest('#emoji_btn')) {
    if (inputFooterRef.value?.emojiVisible) inputFooterRef.value.emojiVisible = false;
  }
}

// --- 网络状态 ---
function onOnline() { store.online = true; }
function onOffline() { store.online = false; }

// 窗口重新获得焦点时清空各会话的待通知计数
function onWindowFocus() {
  for (const k of Object.keys(notifPendingCount)) notifPendingCount[k] = 0;
}

// --- 生命周期 ---
onMounted(async () => {
  store.initializing = true;
  setting.value = await window.api.loadSetting();
  store.setting = setting.value;
  if (setting.value.fontSize) applyFontSize(setting.value.fontSize);
  store.online = navigator.onLine;
  try { version.value = await window.api.getVersion(); } catch {}
  const root = document.documentElement;
  if (setting.value.theme && setting.value.theme !== 'default' && setting.value.theme !== 'custom') root.classList.add(`theme-${setting.value.theme}`);
  if (setting.value.theme === 'custom' && setting.value.customVars) { for (const [k, v] of Object.entries(setting.value.customVars)) root.style.setProperty(k, v); }
  autoSaveTimer = setInterval(async () => { saveConvos(); }, 10000);
  unsubscribeNotifClick = window.api.onNotifClick((data) => { if (data.chatType && data.targetId) { pageType.value = data.chatType; pageId.value = Number(data.targetId); } });
  // 网络状态监听
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  window.addEventListener('focus', onWindowFocus);
  window.addEventListener('resize', updateLayoutMode);
  updateLayoutMode();
  try {
    const initialInfo = await (await safeFetch('/chat/info')).json();
    if (initialInfo.success) Object.assign(store.self, { uid: initialInfo.user.id, username: initialInfo.user.uid, nickname: initialInfo.user.nickname, realname: initialInfo.user.real_name });
    await loadData();
    if (initialInfo.success) await update(initialInfo);
    await updateMessagesData();
    updateBadgeCount();
    nextTick(() => { messageListRef.value?.scrollToBottomInstant(); });
  } finally {
    store.initializing = false;
  }
  if (store.logined) startInfoLoop();
  document.addEventListener('keydown', onDocKeydown);
  document.addEventListener('click', onDocClick);
  document.addEventListener('mousemove', (e) => { lastMouseX.value = e.clientX; lastMouseY.value = e.clientY; });
});

onUnmounted(() => {
  infoLoopRunning = false;
  if (pollTimer) clearInterval(pollTimer);
  if (autoSaveTimer) clearInterval(autoSaveTimer);
  document.removeEventListener('keydown', onDocKeydown);
  document.removeEventListener('click', onDocClick);
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
  window.removeEventListener('focus', onWindowFocus);
  window.removeEventListener('resize', updateLayoutMode);
  if (unsubscribeNotifClick) unsubscribeNotifClick();
  if (unsubscribeUploadProgress) unsubscribeUploadProgress();
});
</script>
