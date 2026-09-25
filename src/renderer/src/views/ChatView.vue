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
    <!-- 网络/登录状态横幅：位于 app-body 外，全宽横条 -->
    <div class="network-banner" v-if="store.logined && store.netError && !netBannerMuted"><i class="fas fa-wifi"></i> 未连接<template v-if="netDownText">，已断线 {{ netDownText }}</template>，正在尝试重新连接… <button class="banner-login-btn" @click="onUserAction('relogin')">重新登录</button><button class="banner-close" title="本次不再提示（重新连接成功后再次断开会重新出现）" @click="netBannerMuted = true"><i class="fas fa-times"></i></button></div>
    <div class="network-banner not-logged-in" v-if="!store.logined && !guestBannerMuted"><i class="fas fa-user-lock"></i> 您还未登录，聊天与收藏暂不可用。 <button class="banner-login-btn" @click="gotoLogin">去登录</button><button class="banner-close" title="本次不再提示（重新登录或重启后会重新出现）" @click="guestBannerMuted = true"><i class="fas fa-times"></i></button></div>
    <div class="app-body" :class="{ narrow: isNarrowLayout }">
    <NavBar
      v-if="showNavBar"
      :pageType="navPageType"
      :users="store.users"
      :groups="store.groups"
      :loggedIn="store.logined"
      :self="store.self"
      @switch="switchPage"
      @user-action="onUserAction"
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
      @jump="onFavJump"
      @back="backToChatList"
    />
    <!-- 发现页：推荐（人/群）+ 聚合搜索 -->
    <DiscoverView
      v-if="pageType==='discover'"
      class="fade-content"
      :class="{ 'fade-out': contentFading }"
      @open-user="openuserinfo"
      @add-friend="addfriend"
      @open-convo="onSelectConversation"
      @open-message="onSearchJump"
      @open-favorite="switchPage('favorites')"
    />
    <!-- 工具入口页（仅列表）；各工具在外层独立渲染：返回时按打开来源回到工具列表或对应会话 -->
    <ToolsView
      v-if="pageType==='tools' && currentTool==='list'"
      class="fade-content"
      :class="{ 'fade-out': contentFading }"
      @open-tool="onOpenTool"
    />
    <MarkdownTool
      v-else-if="pageType==='tools' && currentTool==='markdown'"
      ref="markdownToolRef"
      class="ide-host fade-content"
      :class="{ 'fade-out': contentFading }"
      @back="onToolBack"
      @dirty-change="toolsDirty = $event"
    />
    <ImageTool
      v-else-if="pageType==='tools' && currentTool==='image'"
      ref="imageToolRef"
      class="ide-host fade-content"
      :class="{ 'fade-out': contentFading }"
      @back="onToolBack"
      @dirty-change="toolsDirty = $event"
      @send-image="onImageToolSend"
    />
    <GraphTool
      v-else-if="pageType==='tools' && currentTool==='graph_editor'"
      ref="graphToolRef"
      class="ide-host fade-content"
      :class="{ 'fade-out': contentFading }"
      @back="onToolBack"
      @dirty-change="toolsDirty = $event"
    />
    <CalculatorTool
      v-else-if="pageType==='tools' && currentTool==='calculator'"
      class="ide-host fade-content"
      :class="{ 'fade-out': contentFading }"
      @back="onToolBack"
    />
    <TimerTool
      v-else-if="pageType==='tools' && currentTool==='timer'"
      class="ide-host fade-content"
      :class="{ 'fade-out': contentFading }"
      @back="onToolBack"
    />
    <MathTool
      v-else-if="pageType==='tools' && currentTool==='math'"
      ref="mathToolRef"
      class="ide-host fade-content"
      :class="{ 'fade-out': contentFading }"
      @back="onToolBack"
      @dirty-change="toolsDirty = $event"
    />
    <SettingsPanel
      v-if="pageType==='settings'"
      class="fade-content"
      :class="{ 'fade-out': contentFading }"
      :self="store.self"
      :setting="setting"
      :allThemes="allThemes"
      @logout="() => onUserAction('logout')"
      @settingChange="onSettingChange"
      @openThemeModal="openThemeModal"
      @openShortcutModal="shortcutModal = true"
    />
    <AboutPanel
      v-if="pageType==='about'"
      class="fade-content"
      :class="{ 'fade-out': contentFading }"
      :version="version"
      @back="backToChatList"
    />
    <UpdatePanel
      v-if="pageType==='update'"
      class="fade-content"
      :class="{ 'fade-out': contentFading }"
      :version="version"
      @back="backToChatList"
    />
    <DonatePanel
      v-if="pageType==='donate'"
      class="fade-content"
      :class="{ 'fade-out': contentFading }"
      @back="backToChatList"
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
    :progress="groupActionProgress"
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
    ref="forwardModalRef"
    v-if="forwardModalVisible"
    :title="imageSendPending ? '发送图片' : '转发消息'"
    :msgContent="forwardMsgContent"
    @close="closeForwardModal"
    @forward="onForwardConfirm"
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
    @edit="onPreviewEdit"
  />
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { store } from '../store.js';
import { safeFetch, gettime2, getUsername, parseContent, parseMsgContent, applyChatToStore, sendChatMessage, displayName, getGradeColor, getGradeLabel, getAvatarInitial, startRanklistFetch, stopRanklistFetch, startVisitReport, stopVisitReport, shouldNotify, getNotifContent, playNotificationSound, getConvoKey, applyFontSize, compressImage, compressBase64Image, markMsgDirty, takeDirtyMsgKeys, isUserHiddenBySetting, checkAppUpdate, normalizeFavorites, makeFavorite } from '../utils.js';

import NavBar from '../components/NavBar.vue';
import ConversationList from '../components/ConversationList.vue';
import ChatHeader from '../components/ChatHeader.vue';
import MessageList from '../components/MessageList.vue';
import InputFooter from '../components/InputFooter.vue';
import ForwardModal from '../components/ForwardModal.vue';
import ContentPreviewModal from '../components/ContentPreviewModal.vue';
import SettingsPanel from '../components/SettingsPanel.vue';
import AboutPanel from '../components/AboutPanel.vue';
import UpdatePanel from '../components/UpdatePanel.vue';
import DonatePanel from '../components/DonatePanel.vue';
import TargetMenu from '../components/TargetMenu.vue';
import UserInfoModal from '../components/UserInfoModal.vue';
import DiscoverView from './DiscoverView.vue';
import GroupModal from '../components/GroupModal.vue';
import ThemeModal from '../components/ThemeModal.vue';
import ShortcutModal from '../components/ShortcutModal.vue';
import InputModal from '../components/InputModal.vue';
import AddFriendModal from '../components/AddFriendModal.vue';
import GroupActionMenu from '../components/GroupActionMenu.vue';
import SearchPanel from '../components/SearchPanel.vue';
import FavoritesPanel from '../components/FavoritesPanel.vue';
import ToolsView from './ToolsView.vue';
import MarkdownTool from './tools/MarkdownTool.vue';
import ImageTool from './tools/ImageTool.vue';
import GraphTool from './tools/graph/GraphTool.vue';
import CalculatorTool from './tools/calculator/CalculatorTool.vue';
import TimerTool from './tools/timer/TimerTool.vue';
import MathTool from './tools/math/MathTool.vue';
import SaveConfirmModal from '../components/SaveConfirmModal.vue';
import { useWindowControls } from '../composables/useWindowControls.js';
import { useMuteConfirm } from '../composables/useMuteConfirm.js';
import { useCurrentMessages } from '../composables/useCurrentMessages.js';
import { NARROW_ASPECT } from '../composables/constants.js';

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
import '../css/discover-view.css';
import '../css/announcement.css';

import 'katex/dist/katex.min.css';
import '../../css/font-awesome/css/all.min.css';

// --- 页面状态 ---
const pageType = ref('chat');
const pageId = ref(null);
const currentTool = ref('list');
const imageToolRef = ref(null);
const markdownToolRef = ref(null);
const mathToolRef = ref(null);
const graphToolRef = ref(null);
// 工具打开来源：'list'=从工具列表进入（返回回列表）；chat 会话=记住来源会话（返回回到对应消息界面）
let toolOrigin = { type: 'list' };
const toolsDirty = ref(false); // 图片编辑未保存标记（ImageTool 上报）
const saveConfirmVisible = ref(false);
let pendingSwitch = null; // 被未保存拦截的切换动作（保存/不保存后执行）
const isChatPage = computed(() => pageType.value === 'chat' || pageType.value === 'user' || pageType.value === 'group');
const navPageType = computed(() => isChatPage.value ? 'chat' : pageType.value);
// 窄模式导航栏：仅消息对象列表（chat/user/group 且未打开具体详情）与工具列表（未进入工具详情）显示，其余页/详情态隐藏
// 非窄（桌面宽窗）模式：导航栏恒显示，不因进入会话/工具详情隐藏（窄模式专属行为）
// 发现页 / 设置页是 TabBar 一级入口（底栏有常驻图标），窄模式同样保留导航栏；既有一级入口即无需返回按钮
const showNavBar = computed(() => {
  if (!isNarrowLayout.value) return true
  if (isChatPage.value && pageId.value) return false
  if (navPageType.value === 'tools') return currentTool.value === 'list'
  if (navPageType.value === 'discover' || navPageType.value === 'settings') return true
  return navPageType.value === 'chat'
})

// 游客模式：聊天/收藏不可用，落到关于页浏览
watch(() => store.logined, (logged) => {
  if (!logged && (isChatPage.value || pageType.value === 'favorites' || pageType.value === 'discover')) {
    pageType.value = 'about';
    pageId.value = null;
  }
}, { immediate: true });

// 返回登录页（游客模式"去登录"）：退出游客，回到登录界面
function gotoLogin() {
  if (store.logined) return;
  store.guestMode = false;
  store.logined = false;
}

// --- 顶部状态横幅的「本次忽略」 ---
// 两条横幅都只忽略本次、不落盘：重启自动恢复，状态变化也会复位。
// 连接失败条尤其不能永久隐藏 —— 静默失败会让用户误以为"没人发消息"，实际是消息根本没收到。
const netBannerMuted = ref(false);   // 未连接横幅
const guestBannerMuted = ref(false); // 未登录（游客）横幅
const netDownAt = ref(0);            // 本次断线起始时间戳（ms），0 = 未断线
const nowTick = ref(Date.now());     // 驱动断线时长文本刷新
let downTicker = null;

// 断线时长：<1min 走秒，<1h 走分，更长走时分 —— 让用户能判断是网络抖动还是服务器真挂了
const netDownText = computed(() => {
  if (!netDownAt.value) return '';
  const s = Math.max(0, Math.floor((nowTick.value - netDownAt.value) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
});

watch(() => store.netError, (v, old) => {
  // false→true = 新的一次断线（含恢复后再断）：重新提示，清掉上一次的"本次忽略"
  if (v && !old) { netDownAt.value = Date.now(); netBannerMuted.value = false; }
  if (!v) netDownAt.value = 0;
  // 只在断线期间跑刷新定时器：恢复即停，避免常驻每秒重渲染
  if (v && !downTicker) downTicker = setInterval(() => { nowTick.value = Date.now(); }, 1000);
  if (!v && downTicker) { clearInterval(downTicker); downTicker = null; }
}, { immediate: true });

// 登录态变化（登录成功 / 退出登录回到游客）都重新提示，避免"本次忽略"跨状态残留
watch(() => store.logined, () => { guestBannerMuted.value = false; });

// 左下角头像菜单动作：login / relogin / logout
// relogin = 完整退出但保留密码 + 回登录页；logout = 完整退出清密码 + 回游客主界面
async function onUserAction(kind) {
  if (kind === 'logout' && store.logined) {
    await logout(false, true); // 退出登录 → 清密码 + 回游客主界面
    return;
  }
  if (kind === 'relogin' && store.logined) {
    await logout(true, false); // 重新登录 → 保留密码 + 回登录页
    return;
  }
  if (kind === 'login') {
    // 游客模式去登录
    store.guestMode = false;
    store.logined = false;
  }
}
// 窄长窗口单列模式：窗口高/宽比超过阈值时，会话列表与消息区互斥显示（微信/QQ 窄窗口风格）
const isNarrowLayout = ref(false)
let lastLayH = 0
let lastLayW = 0
function updateLayoutMode() {
  const nowH = window.innerHeight
  const nowW = window.innerWidth
  // 软键盘（Android 聚焦输入框/搜索框）会把 window.innerHeight 顶起骤降，但宽基本不变。
  // 若按此重算，高宽比可能跌破 1.4，把窄屏单列误判回宽屏双列，导致会话列表/导航栏闪现。
  // 识别"宽未变 + 高骤降(>150px)"的键盘场景并忽略，保持当前窄/宽判定；转横屏等真实尺寸变化仍正常响应。
  if (lastLayW && Math.abs(nowW - lastLayW) < 40 && (lastLayH - nowH) > 150) {
    lastLayH = nowH
    lastLayW = nowW
    return
  }
  lastLayH = nowH
  lastLayW = nowW
  isNarrowLayout.value = nowH / Math.max(nowW, 1) > NARROW_ASPECT
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
// 群详情多选操作进度：{ show, current, total, label }（show=false 表示空闲）
const groupActionProgress = reactive({ show: false, current: 0, total: 0, label: '' });
const themeModal = ref(false);
const shortcutModal = ref(false);
const forwardModalVisible = ref(false);
const forwardMsgContent = ref('');
const forwardModalRef = ref(null);
const imageSendPending = ref(null); // 待发送的图片消息对象（图片编辑器"发送"→ 选接收方后发送）
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

// 登录后恢复本地数据：uid 就绪即触发 loadData()
// 根因修复：onMounted 时若 /chat/info 失败（uid 未设置），loadData 会 return 跳过，
// 之后轮询 update() 虽会设置 uid，但 loadData 不会再被调用 → 本地数据永不恢复 → 消息全从服务器重拉 + 收藏丢失
watch(() => (store.logined && store.self.uid) || false, (ready) => {
  if (ready) loadData();
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
  // 游客模式：聊天/收藏/发现不可用，拦截导航
  if (!store.logined && (type === 'chat' || type === 'favorites' || type === 'discover')) return;
  // 未保存的工具内容（图片/Markdown）：离开工具前先确认（保存/不保存/取消）
  if (toolsDirty.value && pageType.value === 'tools' && currentTool.value !== 'list') {
    pendingSwitch = { type };
    saveConfirmVisible.value = true;
    return;
  }
  // “工具”入口：点击时进入工具列表；已在工具页（可能正打开某个工具）则回到列表
  if (type === 'tools') {
    if (pageType.value === 'tools') {
      if (currentTool.value !== 'list') { currentTool.value = 'list'; toolOrigin = { type: 'list' }; }
      return;
    }
    groupModal.show = false;
    pageType.value = 'tools';
    pageId.value = null;
    currentTool.value = 'list';
    toolOrigin = { type: 'list' };
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

// 从头像菜单子页（收藏/设置/关于/更新/赞助）返回消息列表
function backToChatList() {
  // 未登录（游客）无消息列表可回：返回按钮始终可用，回到游客可用的工具列表；
  // 登录用户则回到消息列表。switchPage('tools') 会把 currentTool 置 'list' 回到工具列表。
  if (!store.logined) { switchPage('tools'); return; }
  switchPage('chat');
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

// 从工具列表进入某个工具：来源=工具列表（返回回列表）
function onOpenTool(tool) {
  toolOrigin = { type: 'list' };
  currentTool.value = tool;
}

// 工具内返回：按打开来源回跳（会话 → 对应消息界面；工具列表 → 工具列表）
function onToolBack() {
  // 未保存内容先拦截确认
  if (toolsDirty.value) {
    pendingSwitch = { type: 'tool-back' };
    saveConfirmVisible.value = true;
    return;
  }
  leaveToolToOrigin();
}

function leaveToolToOrigin() {
  if (toolOrigin.type === 'chat' && toolOrigin.pageId != null) {
    // 回到打开工具前的会话（走 onSelectConversation，保证已读标记/滚动等状态一致）
    onSelectConversation({ type: toolOrigin.pageType, id: toolOrigin.pageId });
  } else {
    currentTool.value = 'list';
  }
  toolOrigin = { type: 'list' };
}

// 未保存拦截弹窗：保存后离开
async function onSaveConfirmSave() {
  saveConfirmVisible.value = false;
  // 按当前打开的工具调用对应保存
  if (currentTool.value === 'image') await imageToolRef.value?.save();
  else if (currentTool.value === 'markdown') await markdownToolRef.value?.save();
  else if (currentTool.value === 'math') await mathToolRef.value?.save();
  else if (currentTool.value === 'graph_editor') await graphToolRef.value?.save();
  // 保存成功后 dirty=false → emit 更新 toolsDirty=false；失败/取消则留在页面
  if (!toolsDirty.value && pendingSwitch) {
    const t = pendingSwitch.type;
    pendingSwitch = null;
    if (t === 'tool-back') leaveToolToOrigin();
    else switchPage(t);
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
    // 丢弃未保存内容：清除 dirty 标记，否则 switchPage 会再次命中未保存拦截，
    // 弹窗关闭后立刻重开，表现为"不保存"无法点击/点了没反应
    toolsDirty.value = false;
    if (t === 'tool-back') leaveToolToOrigin();
    else switchPage(t);
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

// 转发弹窗确认：优先发送"待发送图片"（图片编辑器 → 选择接收方），否则走普通转发
async function onForwardConfirm({ type, targetId, msgContent }) {
  if (imageSendPending.value) {
    const msgObj = imageSendPending.value;
    const label = msgObj.name || '图片';
    imageSendPending.value = null;
    forwardModalVisible.value = false;
    const r = await sendChatMessage({ type, targetId, msgObj });
    if (r.success) {
      if (inputFooterRef.value) inputFooterRef.value.errorMessage = '';
      const { tokenInfo } = applyChatToStore(r, type, targetId);
      if (inputFooterRef.value) inputFooterRef.value.tokenInfo = tokenInfo;
      alert('已发送到' + (type === 'group' ? (store.groups?.[targetId]?.name || '群聊') : (store.users?.[targetId]?.nickname || store.users?.[targetId]?.realname || '对方')));
    } else {
      const msg = r.err?.message || '发送失败';
      if (inputFooterRef.value) inputFooterRef.value.errorMessage = msg;
      alert('发送失败：' + msg);
    }
    return;
  }
  await doForward({ type, targetId, msgContent });
}

function closeForwardModal() {
  forwardModalVisible.value = false;
  imageSendPending.value = null;
}

// 图片编辑器"发送"：立即弹出接收方选择；压缩在后台进行（结果就绪后更新待发数据）
async function onImageToolSend({ data, base64, mime, name } = {}) {
  // 兼容两种字段名：文件消息约定用 data，图片编辑器 flatten() 内部用 base64
  const imgData = data || base64;
  if (!imgData) return;
  const finalName = (name || 'image').replace(/\.[^.]+$/, mime === 'image/jpeg' ? '.jpg' : '.png');
  imageSendPending.value = {
    type: 'file',
    name: finalName,
    size: Math.round(imgData.length * 3 / 4),
    data: imgData,
    mime: mime || 'image/png'
  };
  forwardModalVisible.value = true;
  nextTick(() => forwardModalRef.value?.focus?.());
  // 后台压缩（成功则替换为更小体积；失败保留原图，不影响发送）
  try {
    if (mime && !/^image\/gif$/i.test(mime)) {
      const r = await compressBase64Image(imgData, mime);
      if (r && r.data && imageSendPending.value) {
        imageSendPending.value.data = r.data;
        imageSendPending.value.mime = 'image/jpeg';
        imageSendPending.value.size = Math.round(r.data.length * 3 / 4);
      }
    }
  } catch {}
}

// 预览"编辑"：把预览图片载入图片编辑器（data:/blob: 均可）
async function onPreviewEdit() {
  const src = previewData.src || '';
  if (!src || (!src.startsWith('data:') && !src.startsWith('blob:'))) {
    alert('无法编辑该图片（仅支持本地图片）');
    return;
  }
  let data = '', mime = 'image/png';
  try {
    if (src.startsWith('data:')) {
      const m = src.match(/^data:([^;,]+);base64,(.*)$/);
      if (!m) { alert('无法编辑该图片'); return; }
      mime = m[1] || 'image/png';
      data = m[2];
    } else {
      const blob = await (await fetch(src)).blob();
      mime = blob.type || 'image/png';
      data = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result || '').split(',')[1] || '');
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
    }
  } catch { alert('无法编辑该图片'); return; }
  previewData.show = false;
  // 进入图片编辑工具并载入图片；记住来源会话，工具内返回时回到对应消息界面
  toolOrigin = { type: 'chat', pageType: pageType.value || 'chat', pageId: pageId.value };
  pageType.value = 'tools';
  pageId.value = null;
  currentTool.value = 'image';
  if (inputFooterRef.value) { inputFooterRef.value.mentionVisible = false; inputFooterRef.value.emojiVisible = false; }
  closeSearch();
  await nextTick();
  await nextTick();
  imageToolRef.value?.imageOpen?.(data, mime, previewData.title || '图片');
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
      store.favorites.push(makeFavorite(msg, pageType.value, pageId.value));
    }
  }
  messageListRef.value?.exitMultiSelect();
}

function batchDelete() {
  if (!confirm(`确定删除 ${store.selectedMsgIds.length} 条消息？`)) return;
  for (const msgId of [...store.selectedMsgIds]) {
    deleteMsg(msgId);
  }
  messageListRef.value?.exitMultiSelect();
}

// --- 全部已读 ---
function markAllRead() {
  for (const user of Object.values(store.users)) { user.unread = 0; }
  for (const group of Object.values(store.groups)) { group.unread = 0; group.mentioned = false; } // 同步清除 @ 提醒
  updateBadgeCount();
}

// --- 未读计数 badge ---
function updateBadgeCount() {
  let total = 0;
  for (const u of Object.values(store.users)) { if (!isUserHiddenBySetting(u)) total += (u.unread || 0); }
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
}

function toggleMute() {
  const { type, id } = targetMenu;
  targetMenu.show = false;
  const key = getConvoKey(type, id);
  if (!store.mutedConvos) store.mutedConvos = {};
  store.mutedConvos[key] = !store.mutedConvos[key];
  if (!store.mutedConvos[key]) delete store.mutedConvos[key];
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

// 收藏 → 跳转原消息：先确保目标会话的消息已从 SQLite 懒加载，再走全局跨会话跳转通路。
// 原消息已被删除时，jumpToMessage 定位不到，届时由消息列表自身给出"未找到"反馈。
async function onFavJump(data) {
  if (!data || !data.convoType || data.convoId == null) return;
  try { await ensureConvoMessages(data.convoType, Number(data.convoId)); } catch {}
  onSearchJump(data);
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
  targetMenu.show = false;
}

// --- 群组操作 ---
async function postGroup(body) {
  return await (await safeFetch('/chat/group', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
}

// 微小间隔防抖
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// 带重试的群操作：每轮尝试前调 onStart 刷新进度（含首次），结束调 onEnd；失败自动重试最多 2 次
async function postGroupWithRetry(body, onStart, onEnd) {
  let lastResult = { success: false, err: { message: '操作失败' } };
  for (let attempt = 0; attempt < 3; attempt++) {
    onStart?.(); // 每轮尝试前刷新进度（首次 + 重试）
    if (attempt > 0) await wait(600); // 重试前退避
    try {
      lastResult = await postGroup(body);
      if (lastResult.success) break;
    } catch {
      lastResult = { success: false, err: { message: '网络异常，请重试' } };
    }
  }
  onEnd?.();
  return lastResult;
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
}

async function deleteGroupFromMenu() {
  const gid = targetMenu.id;
  targetMenu.show = false;
  const group = store.groups[gid];
  if (!group || !group.exited) return;
  if (group.message_ids) { for (const mid of group.message_ids) delete store.messages[mid]; }
  delete store.groups[gid];
  if (pageId.value == gid && (pageType.value === 'group' || pageType.value === 'chat')) pageId.value = null;
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
    }
    return;
  }
  if (action.type === 'dissolve') {
    const group = store.groups[gid];
    if (group) {
      const members = group.users.filter(u => String(u.user_id) !== String(store.self.uid));
      // 解散群聊：逐个踢出成员，加间隔 + 进度 + 重试
      if (members.length > 0) {
        groupActionProgress.show = true;
        groupActionProgress.total = members.length;
      }
      for (let i = 0; i < members.length; i++) {
        const m = members[i];
        groupActionProgress.current = i + 1;
        groupActionProgress.label = `解散群聊：移除成员 ${i + 1}/${members.length}`;
        await postGroupWithRetry({ type: 'del_member', group_id: gid, target_id: m.user_id }, null, null);
        if (i < members.length - 1) await wait(300);
      }
    }
    groupActionProgress.show = false;
    action = { ...action, type: 'leave' };
  }
  // 支持批量选人：targetIds 数组优先，否则回退单 targetId
  const targets = (action.targetIds && action.targetIds.length)
    ? action.targetIds.map(String)
    : [action.targetId];
  if (action.type === 'give_owner' && targets.length > 1) { alert('转让群主只能选择一名成员'); return; }
  if (targets.length === 0) { alert('请选择成员'); return; }
  let failed = false;
  // 批量选人：循环开始前显示进度条，全部结束才隐藏（避免每条间闪烁）
  if (targets.length > 1) {
    groupActionProgress.show = true;
    groupActionProgress.total = targets.length;
  }
  for (let i = 0; i < targets.length; i++) {
    const tid = targets[i];
    const body = { type: action.type, group_id: gid, target_id: tid, title: action.title };
    if (action.type === 'mute_member' || action.type === 'mute_group') {
      body.mute = Math.floor(Date.now() / 1000 + action.muteMinutes * 60);
    }
    if (targets.length > 1) {
      groupActionProgress.current = i + 1;
      groupActionProgress.label = `操作进度 ${i + 1}/${targets.length}`;
    }
    const done = await postGroupWithRetry(
      body,
      () => {
        if (targets.length > 1) {
          groupActionProgress.current = i + 1;
          groupActionProgress.label = `操作进度 ${i + 1}/${targets.length}`;
        }
      },
      () => {} // show 由循环统一控制
    ).catch(() => ({ success: false }));
    if (!done.success) {
      failed = true;
      const msg = done.err?.message || '操作失败';
      if (targets.length === 1) { alert(msg); groupActionProgress.show = false; return; }
    }
    if (i < targets.length - 1) await wait(300); // 相邻两条间微小间隔，防连续请求网络问题
  }
  groupActionProgress.show = false;
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
// 编号严格跟随 NavBar 主导航顺序：消息 / 发现 / 工具 / 设置；收藏与关于排在其后
const DEFAULT_SHORTCUTS = { sendMessage: 'enter', search: 'ctrl+f', switchToChat: 'ctrl+1', switchToDiscover: 'ctrl+2', switchToTools: 'ctrl+3', switchToSettings: 'ctrl+4', switchToFavorites: 'ctrl+5', switchToAbout: 'ctrl+6', newConversation: 'ctrl+n' };
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
  if (matchShortcut(e, getShortcutValue('switchToDiscover'))) { e.preventDefault(); switchPage('discover'); return true; }
  if (matchShortcut(e, getShortcutValue('switchToTools'))) { e.preventDefault(); switchPage('tools'); return true; }
  if (matchShortcut(e, getShortcutValue('switchToSettings'))) { e.preventDefault(); switchPage('settings'); return true; }
  if (matchShortcut(e, getShortcutValue('switchToFavorites'))) { e.preventDefault(); switchPage('favorites'); return true; }
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
    // 从服务器重新拉取（爬取模式：拉取 100 条 + 继续翻页取尽历史）
    const result = await (await safeFetch('/chat/info')).json();
    if (result.success) await update(result);
    await updateMessagesData(100, true);
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
let unsubscribeFlush = null;
let unsubscribeAndroidBack = null;

// Android 系统返回键：进入会话→回列表；其它页→回聊天；聊天列表→退出应用
function onAndroidBack() {
  if (pageId.value != null) { onBackFromChat(); return; }
  if (navPageType.value !== 'chat') { switchPage('chat'); return; }
  window.api.androidExit?.();
}

// 通知冷却（聚合）：同一会话 5 秒内只通知一次
const notifCooldown = {};
const notifPendingCount = {};

async function update(result) {
  if (!infoLoopRunning) return;
  // token 限制（滑动窗口恢复周期/容量）：/chat/info limit { time_limit, count_limit, ... }
  if (result.limit && typeof result.limit === 'object') store.tokenLimit = result.limit;
  // 完整承载 OJ 档案（发现页与访问上报需要 grade_class / graduate_year / school_short 等）；
  // 先展开再覆盖，保持既有键语义：uid = 内部数字 id，username = 登录名。
  // 注意 OJ 的字段命名陷阱：user.username 是【学号】，user.uid 才是登录名 —— 别被名字带偏。
  Object.assign(store.self, {
    ...result.user,
    uid: result.user.id,
    username: result.user.uid,
    student_no: result.user.username,
    nickname: result.user.nickname,
    realname: result.user.real_name,
    school: result.user.school,
    seat: result.user.seat
  });
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
}

async function fetchMessages(type, end, take = 10, allowPage = false) {
  if (!infoLoopRunning) return;
  try {
    const endSec = Math.floor(end / 1000);
    const r = await (await safeFetch(`/chat/chat?type=${type}&end_time=${endSec}&take=${take}`)).json();
    if (!r.success || !r.chats || !r.chats.length) return;
    let hasNew = false; // 本轮是否插入了至少一条新消息
    for (const c of r.chats) {
      if (!infoLoopRunning) return;
      end = Math.min(end, c.send_time * 1000 - 1);
      if (type === 'user' && c.sender_id === store.self.uid) continue;
      const t = type === 'group' ? store.groups[c.receiver_id] : type === 'send_user' ? store.users[c.receiver_id] : store.users[c.sender_id];
      if (!t) continue;
      const isCurrentPage = (pageType.value === (type === 'group' ? 'group' : 'user') || (isChatPage.value && pageId.value)) && pageId.value === (type === 'group' ? c.receiver_id : (type === 'send_user' ? c.receiver_id : c.sender_id));
      if (isCurrentPage) t.unread = 0;
      if (t.message_ids.includes(c.id) || (store.deletedMsgIds && store.deletedMsgIds.includes(c.id))) {
        // 旧消息：不重复处理，仅跳过
        // 自愈：id 已在会话消息列表、但内容缺失（本地未及落库 / 历史持久化丢失），
        // 从服务器返回补回内容，否则该消息重启后永远无法显示；由快照统一落库
        if (!store.messages[c.id] && !(store.deletedMsgIds && store.deletedMsgIds.includes(c.id))) {
          store.messages[c.id] = { id: c.id, sender: c.sender_id, send_time: c.send_time, content: c.content };
          markMsgDirty(type === 'group' ? 'group' : 'user', type === 'group' ? c.receiver_id : (type === 'send_user' ? c.receiver_id : c.sender_id));
        }
      } else {
        const msgContent = c.content;
        store.messages[c.id] = { id: c.id, sender: c.sender_id, send_time: c.send_time, content: msgContent };
        t.message_ids.push(c.id);
        const persistKind = type === 'group' ? 'group' : 'user';
        const persistCid = type === 'group' ? c.receiver_id : (type === 'send_user' ? c.receiver_id : c.sender_id);
        markMsgDirty(persistKind, persistCid);
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
        }
        if (c.sender_id !== store.self.uid && !isCurrentPage) t.unread = (t.unread || 0) + 1;
        if (type === 'group' && c.sender_id !== store.self.uid) {
          try { const msgObj = JSON.parse(msgContent); if (msgObj.mentions && (msgObj.mentions.includes(store.self.uid) || msgObj.mentions.includes('all'))) t.mentioned = true; } catch {}
        }
        hasNew = true; // 至少遇到一条新消息
      }
    }
    updateBadgeCount();
    // 重大修复：#12 首次爬取只取到约 100 条的问题。
    // 结束条件：仅当整批消息全部是旧消息（hasNew=false）才停止；
    // 只要本批还有新消息（哪怕夹杂旧消息）就继续往前翻页，直到取尽历史。
    // 仅爬取模式（allowPage=true）才翻页，且翻页固定取 100 条；普通轮询不翻页（保持轻量）
    if (hasNew && allowPage) {
      await fetchMessages(type, end, 100, true);
    }
  } catch (e) { console.error(e); }
}

async function updateMessagesData(take = 10, allowPage = false) {
  await fetchMessages('user', Date.now(), take, allowPage);
  await fetchMessages('send_user', Date.now(), take, allowPage);
  await fetchMessages('group', Date.now(), take, allowPage);
}

// ===== SQLite 存储：唯一快照保存通道 =====
// 一切持久化收敛为 saveAll()：会话元数据 + 偏好 + 脏区消息，单事务原子写。
// 触发点只有两个：① 10s 定时器 ② 退出/登出前。无散落 flush/即时入库。
let savingNow = false

/** 全量快照落盘（唯一保存入口，自动互斥防重入） */
async function saveAll() {
  const uid = store.self.uid
  if (!uid || savingNow) return
  savingNow = true
  try {
    // 会话元数据（JSON 深拷贝，防 Vue Proxy 无法克隆）
    const convos = []
    for (const [id, u] of Object.entries(store.users || {})) {
      if (u && u.uid != null) convos.push({ kind: 'user', cid: Number(id), meta: JSON.parse(JSON.stringify(u)) })
    }
    for (const [id, g] of Object.entries(store.groups || {})) {
      if (g && g.gid != null) convos.push({ kind: 'group', cid: Number(id), meta: JSON.parse(JSON.stringify(g)) })
    }
    // 脏区消息：仅上传有变化的会话，按会话原子替换
    const dirtyKeys = takeDirtyMsgKeys()
    const messages = {}
    if (dirtyKeys) {
      for (const key of dirtyKeys) {
        const [kind, cid] = key.split(':')
        const target = kind === 'group' ? store.groups[cid] : store.users[cid]
        if (!target || !Array.isArray(target.message_ids)) continue
        const list = []
        for (const mid of target.message_ids) {
          const m = store.messages[mid]
          // 深拷贝：store 为 Vue reactive（Proxy），直接传 IPC 会 "An object could not be cloned"
          if (m) list.push(JSON.parse(JSON.stringify(m)))
        }
        if (list.length) messages[key] = list
      }
    }
    // 偏好
    const prefs = JSON.parse(JSON.stringify({
      drafts: store.drafts || {},
      favorites: store.favorites || [],
      mutedConvos: store.mutedConvos || {},
      hiddenConvos: store.hiddenConvos || {},
      deletedMsgIds: store.deletedMsgIds || [],
      stickers: store.stickers || []
    }))
    await window.api.storeSaveAll(uid, { convos, messages, prefs })
  } catch {} finally {
    savingNow = false
  }
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

/** 退出/登出前的最终保存（唯一第二入口，定时器之外的兜底） */
async function flushData() {
  await saveAll()
  // 等待 SQLite 落盘完成，避免清空 store 后丢失
  await new Promise(r => setTimeout(r, 300))
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
      if (d.favorites) store.favorites = normalizeFavorites(d.favorites)
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

async function logout(toLogin = false, clearCred = false) {
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
  // #3：仅"退出登录"清除保存的账号密码；"重新登录"保留（用户只需重输密码登录）
  if (clearCred) {
    s.keepLogin = false;
    s.loginUsername = '';
    s.loginPassword = '';
  }
  await window.api.saveSetting(s);
  // #2：退出登录清除持久化登录标记；重新登录时保留（本地仍认为登录过）
  try {
    if (clearCred) localStorage.removeItem('7fa4_logined');
  } catch {}
  Object.assign(store, { self: { uid: null, username: null, nickname: null, realname: null }, users: {}, groups: {}, messages: {}, stickers: [], drafts: {}, favorites: [], mutedConvos: {}, hiddenConvos: {} });
  store.logined = false;
  store.netError = false;
  store.online = navigator.onLine;
  // toLogin=true：重新登录 → 回登录页（guestMode=false）；否则退出登录 → 回游客主界面（guestMode=true）
  store.guestMode = !toLogin;
}

async function startInfoLoop() {
  if (!store.logined) return;
  if (infoLoopRunning) return; // 互斥：防止重复调用导致多个并发轮询循环（疯狂连续获取、不守间隔）
  infoLoopRunning = true;
  let failCount = 0;
  // 首次进入：onMounted 里的 update(initialInfo) 因 infoLoopRunning 未置真，会被 update 自身的
  // `if (!infoLoopRunning) return` 守卫跳过，此时 store.users/groups 为空。若直接全量爬取，
  // fetchMessages 会因 `if (!t) continue`（t 取不到会话）把历史全部丢弃，只剩轮询的 10 条。
  // 因此置真后先 /chat/info 填充会话，再执行 100 条 + 翻页爬取历史。
  try {
    const r = await (await safeFetch('/chat/info')).json();
    if (!infoLoopRunning) return;
    if (r.success) { await update(r); failCount = 0; store.netError = false; store.online = true; }
    else { failCount++; store.netError = true; }
  } catch { failCount++; store.netError = true; }
  try { await updateMessagesData(100, true); } catch {}
  // 首次历史爬取（无论成败）结束：隐藏"正在加载消息…"提示，进入常规轮询
  store.initializing = false;
  while (infoLoopRunning && store.logined) {
    try { const result = await (await safeFetch('/chat/info')).json(); if (!infoLoopRunning) break; if (result.success) { await update(result); failCount = 0; store.netError = false; store.online = true; } else { failCount++; store.netError = true; } } catch { failCount++; store.netError = true; }
    if (!infoLoopRunning) break;
    if (failCount >= 3) {
      // 连续失败（如无法访问 jx）：退避到 10s，避免高频空转；保持"未连接"横幅直到恢复
      store.online = false;
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
  // 拦截 Ctrl/Cmd+R 与 F5 刷新（渲染层兜底；主进程 before-input-event 已拦）
  if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R'))) {
    e.preventDefault();
    return;
  }
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

// --- 新用户引导：引导层派发的动作（打开会话 / 切换页面） ---
function onOnboardingAction(e) {
  const d = e.detail || {}
  if (d.action === 'openUser' && d.id) onSelectConversation({ type: 'user', id: Number(d.id) })
  else if (d.action === 'switch' && d.page) switchPage(d.page)
}

// --- 生命周期 ---
onMounted(async () => {
  document.addEventListener('onboarding-action', onOnboardingAction);
  store.initializing = true;
  setting.value = await window.api.loadSetting();
  store.setting = setting.value;
  if (setting.value.fontSize) applyFontSize(setting.value.fontSize);
  store.online = navigator.onLine;
  try { version.value = await window.api.getVersion(); } catch {}
  // 非 Electron（网页端/安卓端）静默检查更新：安卓端 APK 没有自动更新通道，
  // 不做启动检查用户就永远不知道有新版本。放游客 return 之前，游客也要能收到提醒。
  checkAppUpdate();
  const root = document.documentElement;
  if (setting.value.theme && setting.value.theme !== 'default' && setting.value.theme !== 'custom') root.classList.add(`theme-${setting.value.theme}`);
  if (setting.value.theme === 'custom' && setting.value.customVars) { for (const [k, v] of Object.entries(setting.value.customVars)) root.style.setProperty(k, v); }
  autoSaveTimer = setInterval(async () => { await saveAll(); }, 10000);
  unsubscribeNotifClick = window.api.onNotifClick((data) => { if (data.chatType && data.targetId) { pageType.value = data.chatType; pageId.value = Number(data.targetId); } });
  // 网络状态监听
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  window.addEventListener('focus', onWindowFocus);
  window.addEventListener('resize', updateLayoutMode);
  updateLayoutMode();
  // Android 系统返回键（仅 Web/Android 适配层提供该 API）
  if (window.api.onAndroidBack) unsubscribeAndroidBack = window.api.onAndroidBack(onAndroidBack);
  // 窗口关闭前落盘：主进程拦截 close 后通知 → 立即保存（convo 30s / pref 1.5s 节流数据也能保存）→ 确认关闭
  // 必须在游客 return 之前注册：任何模式（含游客）关窗都要应答，避免主进程 flushPending 等待超时
  unsubscribeFlush = window.api.onAppFlushBeforeClose(async () => {
    try {
      await flushData();
    } catch (e) {
      console.error('[flush] 退出落盘失败:', e);
    } finally {
      // 无论是否成功，都通知主进程放行关闭，避免窗口卡在 flushPending
      window.api.appFlushDone();
    }
  });
  // 未登录（游客模式）：仅加载本地偏好设置与主题，跳过网络初始化，
  // 不拉取 /chat/info、不进入轮询；聊天/收藏入口由 NavBar 隐藏。登录后由登录门控触发重新挂载。
  if (!store.logined) {
    store.online = true;
    store.netError = false;
    store.initializing = false;
    return;
  }
  try {
    const initialInfo = await (await safeFetch('/chat/info')).json();
    if (initialInfo.success) Object.assign(store.self, { uid: initialInfo.user.id, username: initialInfo.user.uid, nickname: initialInfo.user.nickname, realname: initialInfo.user.real_name });
    await loadData();
    if (initialInfo.success) await update(initialInfo);
    else store.netError = true; // /chat/info 失败（网络断/会话失效）→ 未连接横幅，但本地历史仍可读
    updateBadgeCount();
    nextTick(() => { messageListRef.value?.scrollToBottomInstant(); });
  } finally {
    // 加载提示的收尾移入 startInfoLoop：首次历史爬取完成后再隐藏，
    // 否则会在爬取仍在进行时提前消失（"提示闪一下就没了，消息还在加载"）。
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
  if (downTicker) clearInterval(downTicker);
  document.removeEventListener('keydown', onDocKeydown);
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('onboarding-action', onOnboardingAction);
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
  window.removeEventListener('focus', onWindowFocus);
  window.removeEventListener('resize', updateLayoutMode);
  if (unsubscribeNotifClick) unsubscribeNotifClick();
  if (unsubscribeUploadProgress) unsubscribeUploadProgress();
  if (unsubscribeFlush) unsubscribeFlush();
  if (unsubscribeAndroidBack) unsubscribeAndroidBack();
});
</script>
