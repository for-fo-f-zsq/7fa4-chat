<template>
  <div class="app motion-fade-in">
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
    <!-- 服务端明确拒绝（如被禁止使用聊天）：原样展示后端文案，不要伪装成断网 -->
    <UiBanner
      v-if="store.logined && serverNotice && !serverNoticeMuted"
      class="network-banner"
      variant="danger"
      closable
      @close="serverNoticeMuted = true"
    >
      <template #icon><i class="fas fa-comment-slash" aria-hidden="true"></i></template>
      {{ serverNotice }}
    </UiBanner>
    <!-- 网络/登录状态横幅：UiBanner（danger=连接断开 / warning=未登录），位于 app-body 外，全宽横条 -->
    <UiBanner
      v-if="store.logined && store.netError && !netBannerMuted"
      class="network-banner"
      variant="danger"
      closable
      @close="netBannerMuted = true"
    >
      <template #icon><i class="fas fa-wifi" aria-hidden="true"></i></template>
      未连接<template v-if="netDownText">，已断线 {{ netDownText }}</template>，正在尝试重新连接…
      <template #action>
        <UiButton class="banner-login-btn" variant="ghost" size="sm" @click="onUserAction('relogin')">重新登录</UiButton>
      </template>
    </UiBanner>
    <UiBanner
      v-if="!store.logined && !guestBannerMuted"
      class="network-banner"
      variant="warning"
      closable
      @close="guestBannerMuted = true"
    >
      <template #icon><i class="fas fa-user-lock" aria-hidden="true"></i></template>
      您还未登录，聊天暂不可用。
      <template #action>
        <UiButton class="banner-login-btn" variant="ghost" size="sm" @click="gotoLogin">去登录</UiButton>
      </template>
    </UiBanner>
    <div class="app-body" :class="{ narrow: isNarrowLayout }">
    <NavBar
      v-if="showNavBar"
      :pageType="navPageType"
      :users="store.users"
      :groups="store.groups"
      :loggedIn="store.logined"
      :self="store.self"
      :narrow="isNarrowLayout"
      @switch="switchPage"
      @user-action="onUserAction"
    />
    <!-- 页级舞台：所有页级分支统一由 motion.css 的 <Transition name="page" mode="out-in">
         控制进出场（enter 260ms / leave 120ms + 4px 位移，reduced-motion 自动归零），进入/退出成对。
         key 按「页类别」切分：聊天页内部 user/group 会话切换不重挂载舞台，交内层 chat-main Transition。 -->
    <Transition name="page" mode="out-in">
    <div class="page-stage" :key="pageStageKey">
    <ConversationList
      ref="conversationListRef"
      v-if="isChatPage && !(isNarrowLayout && pageId)"
      :pageType="pageType"
      :pageId="pageId"
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
      :initial-query="addFriendInitialQuery"
      @confirm="addfriend"
      @viewUser="openuserinfo"
    />
    <!-- 会话内容：按 pageType:pageId 成对淡入淡出（页类别内切换会话，不重挂载舞台） -->
    <Transition name="fade" mode="out-in" appear @enter="onChatMainEnter">
    <div class="chat-main" v-if="isChatPage && pageId" :key="chatKey">
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
      <UiBanner v-if="watchWarnText" class="chat-watch-warn" variant="warning" :description="watchWarnText" />
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
        :expandedMsgs="expandedMsgs"
        :visibleCount="visibleCount"
        :canLoadOlder="canLoadOlder"
        @sendPat="sendPat"
        @openGroupActionMenu="openGroupActionMenu"
        @scrollToTop="onMessageAreaScrollToTop"
        @startReply="startReply"
        @openUserInfo="openuserinfo"
        @forward="startForward"
        @batchForward="batchForward"
        @openPreview="onOpenPreview"
        @vote="onPollVote"
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
      />
    </div>
    </Transition>
    <!-- 工具入口页（仅列表）；各工具在外层独立渲染：返回时按打开来源回到工具列表或对应会话 -->
    <!-- 网页版不提供工具列表：工具依赖本地文件系统/原生能力，浏览器里跑不了 -->
    <ToolsView
      v-if="!isWeb && pageType==='tools' && currentTool==='list'"
      @open-tool="onOpenTool"
    />
    <!-- 工具全部来自远端清单（iframe 嵌入）。客户端不再内置任何工具页：
         同一份源码既编进工具包（tools/<id>/src/main.js 直接 import src/renderer/src/views/tools/*），
         又内置进主包，会导致「改了 src 但用户点开的是下载包」的错配，故只保留远端这一条路径。
         返回按钮 / 工具内 closeTool 都回到工具列表。 -->
    <ToolHost
      v-else-if="!isWeb && pageType==='tools' && currentTool && currentTool.remote"
      :tool="currentTool"
      class="ide-host"
      @back="onToolBack"
      @send-image="onImageToolSend"
    />
    <SettingsPanel
      v-if="pageType==='settings'"
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
      :version="version"
      @back="backToChatList"
    />
    <UpdatePanel
      v-if="pageType==='update'"
      :version="version"
      @back="backToChatList"
    />
    <DonatePanel
      v-if="pageType==='donate'"
      @back="backToChatList"
    />
    </div><!-- /.page-stage -->
    </Transition>
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
    @dissolvegroup="dissolveGroupFromMenu"
    @togglehidden="toggleHiddenConvo"
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
    :showEdit="false"
    @close="previewData.show = false"
    @copy="onPreviewCopy"
    @forward="onPreviewForward"
    @download="onPreviewDownload"
  />
</template>

<style scoped src="../css/chat-view.css"></style>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { store } from '../store.js';
import { safeFetch, gettime2, getUsername, parseContent, parseMsgContent, applyChatToStore, ingestMessage, clearPendingVotes, sendChatMessage, displayName, getGradeColor, getGradeLabel, getAvatarInitial, startRanklistFetch, stopRanklistFetch, shouldNotify, getNotifContent, playNotificationSound, getConvoKey, applyFontSize, compressImage, compressBase64Image, markMsgDirty, takeDirtyMsgKeys, isUserHiddenBySetting, makeVoteContent, isWebBrowser } from '../utils.js';

import { UiBanner, UiButton } from '../ui';

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
import GroupModal from '../components/GroupModal.vue';
import ThemeModal from '../components/ThemeModal.vue';
import ShortcutModal from '../components/ShortcutModal.vue';
import InputModal from '../components/InputModal.vue';
import AddFriendModal from '../components/AddFriendModal.vue';
import GroupActionMenu from '../components/GroupActionMenu.vue';
import SearchPanel from '../components/SearchPanel.vue';
import ToolsView from './ToolsView.vue';
import ToolHost from '../components/ToolHost.vue';
import { useWindowControls } from '../composables/useWindowControls.js';
import { useMuteConfirm } from '../composables/useMuteConfirm.js';
import { useCurrentMessages } from '../composables/useCurrentMessages.js';
import { NARROW_ASPECT, THEMES } from '../composables/constants.js';

// 全局样式统一由 src/main.js 引入 ./css/index.css，组件内不再 import 任何全局 css。

// --- 页面状态 ---
const pageType = ref('chat');
const pageId = ref(null);
// 网页版（纯浏览器）：没有本地消息库，也不做首屏全量爬取。
// 列表顺序与「有新消息」由 target-times 探针驱动，只有点开的会话才真正拉消息。
const isWeb = isWebBrowser();
// 网页版 /chat/info（~51KB）降频：探针只能回显已知 id，新好友/新群还得靠它发现，60 秒一次
//（≈3MB/h；桌面端是每 2 轮 ≈ 90MB/h）。不要调太快，51KB 是探针 542B 的一百倍。
const WEB_INFO_EVERY_MS = 60 * 1000;
let lastInfoAt = 0;
const currentTool = ref('list');
// 工具打开来源：'list'=从工具列表进入（返回回列表）；chat 会话=记住来源会话（返回回到对应消息界面）
let toolOrigin = { type: 'list' };
const isChatPage = computed(() => pageType.value === 'chat' || pageType.value === 'user' || pageType.value === 'group');
const navPageType = computed(() => isChatPage.value ? 'chat' : pageType.value);
// 窄模式导航栏：仅消息对象列表（chat/user/group 且未打开具体详情）与工具列表（未进入工具详情）显示，其余页/详情态隐藏
// 非窄（桌面宽窗）模式：导航栏恒显示，不因进入会话/工具详情隐藏（窄模式专属行为）
// 设置页是 TabBar 一级入口（底栏有常驻图标），窄模式同样保留导航栏；既有一级入口即无需返回按钮
const showNavBar = computed(() => {
  if (!isNarrowLayout.value) return true
  if (isChatPage.value && pageId.value) return false
  if (navPageType.value === 'tools') return currentTool.value === 'list'
  if (navPageType.value === 'settings') return true
  return navPageType.value === 'chat'
})

// 页级过渡 key：按「页类别」切分 —— 聊天页（user/group/chat）共用 'chat'，
// 使会话切换不重挂载 page-stage；工具页再按工具 id 细分，让工具列表↔工具详情也走同一次进出场。
const pageStageKey = computed(() => {
  if (isChatPage.value) return 'chat';
  if (pageType.value === 'tools') {
    const tool = currentTool.value;
    if (typeof tool === 'string') return 'tools:' + tool;
    return 'tools:remote-' + (tool?.id ?? tool?.name ?? 'unknown');
  }
  return pageType.value;
});
// 会话内容 key：pageType 参与，避免 user/group 同号 pageId 被误判为同一会话。
const chatKey = computed(() => `${pageType.value}:${pageId.value}`);

watch(() => store.logined, (logged) => {
  if (!logged && isChatPage.value) {
    pageType.value = 'about';
    pageId.value = null;
  }
}, { immediate: true });

// 返回登录页（游客模式"去登录"）：桌面端退出游客回登录界面；网页版交给 OJ 的 /login
// 注意：模板里 @click="gotoLogin" 会把 MouseEvent 当第一个实参传进来，所以这里不能带形参
function gotoLogin() {
  if (isWeb) {
    // 网页版没有自带登录表单：跳 OJ 登录页，登录成功后由 ?url= 原路返回当前子路径。
    // 注意必须排在 `if (store.logined) return` 之前：网页版启动时 store.logined 恒为 true
    // （登录态由 OJ cookie 决定），否则会话失效时永远跳不过去。
    const here = location.pathname + location.search;
    location.href = '/login?url=' + encodeURIComponent(here);
    return;
  }
  if (store.logined) return;
  store.guestMode = false;
  store.logined = false;
}

// --- 网页版：点开才拉（懒加载） ---
// 桌面端靠本地 SQLite 缓存历史，网页端没有；进入会话时向服务端要最近 30 条，
// 上滑时再以「内存里最早一条」为时间上界往前翻。列表顺序/未读提示不依赖这些消息。
// reactive：MessageList 的「还有没有更早的」提示与加载闸门要跟着它变，
// 普通 Set 改了不算依赖，会一直显示/一直不消失。
const webExhausted = reactive(new Set()); // 该会话已翻到最早（或服务端明确没更多）
// 上翻的单飞锁：同一个会话同一时刻只允许一个「取更早 30 条」在飞
const webLoadingOlder = new Set();

function webTarget(kind, id) {
  return kind === 'group' ? store.groups[id] : store.users[id];
}

/** 把探针记下的最后消息时间回填到会话对象（网页版没有本地消息可算 _sortTime） */
function applyLastSendTimesToList() {
  for (const [key, sec] of lastSendTimes) {
    const t = webTarget(key.startsWith('g:') ? 'group' : 'user', Number(key.slice(2)));
    // 取较大值：排行榜等外部刷新可能把 lastSendTime 覆盖成空，这里只补不回退
    if (t && sec > (t.lastSendTime || 0)) t.lastSendTime = sec;
  }
}

function isCurrentConvo(kind, id) {
  return pageId.value != null && Number(pageId.value) === Number(id) && pageType.value === kind;
}

/** 某会话内存里最早一条消息的秒级时间（0 = 还没有任何消息） */
function oldestKnownSec(kind, id) {
  const t = webTarget(kind, id);
  if (!t || !Array.isArray(t.message_ids)) return 0;
  let min = 0;
  for (const mid of t.message_ids) {
    const m = store.messages[mid];
    const sec = m && (m.send_time || m.time);
    if (sec && (!min || sec < min)) min = sec;
  }
  return min;
}

/** 打开会话：只拉最近 30 条（群 1 个视图，私聊 user + send_user 两个视图） */
async function loadConversationLite(kind, id) {
  const end = Date.now();
  if (kind === 'group') { await fetchMessages('group', end, 30, false, id); return; }
  await fetchMessages('user', end, 30, false, id);
  await fetchMessages('send_user', end, 30, false, id);
}

/** 上滑加载更早的 30 条；返回是否还可能有更早的消息 */
async function loadOlderLite(kind, id) {
  const key = (kind === 'group' ? 'g:' : 'u:') + id;
  if (webExhausted.has(key)) return false;
  const oldest = oldestKnownSec(kind, id);
  if (!oldest) { webExhausted.add(key); return false; }
  const end = oldest * 1000;
  const results = kind === 'group'
    ? [await fetchMessages('group', end, 30, false, id)]
    : [await fetchMessages('user', end, 30, false, id), await fetchMessages('send_user', end, 30, false, id)];
  // 请求失败（null）不能当成「取完了」，否则一次网络抖动就再也翻不了历史
  if (results.some(r => r === null)) return true;
  const got = results.some(r => r && r.inserted);
  if (!got) webExhausted.add(key);
  return got;
}

// --- 顶部状态横幅的「本次忽略」 ---
// 两条横幅都只忽略本次、不落盘：重启自动恢复，状态变化也会复位。
// 连接失败条尤其不能永久隐藏 —— 静默失败会让用户误以为"没人发消息"，实际是消息根本没收到。
const netBannerMuted = ref(false);   // 未连接横幅
// 服务端明确拒绝（封禁/禁言）时的横幅文案：与「未连接」区分开，避免把禁言显示成断网
const serverNotice = ref('');
const serverNoticeMuted = ref(false);
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
const searchVisible = ref(false);
const listWidth = ref(260);
// 用户点过「展开」的消息 id → true。命名与语义看 MessageList.vue 的 expandableIds / expandedMsgs 注释。
const expandedMsgs = reactive({});
const visibleCount = ref(20);
// 网页版「还能不能往上翻」的唯一判定：由服务端游标状态（webExhausted）决定，
// 不能拿内存条数去减 visibleCount —— 内存里只有已加载片段，减出来永远是「没有更早的」。
// 桌面端返回 null，让 MessageList 按本地库/内存自己判断。
const canLoadOlder = computed(() => {
  if (!isWeb) return null;
  if (pageId.value == null) return false;
  const prefix = pageType.value === 'group' ? 'g:' : 'u:';
  return !webExhausted.has(prefix + pageId.value);
});
const setting = ref({});
const version = ref('');
const showCreateGroupModal = ref(false);
const showAddFriendModal = ref(false);
// 添加好友弹窗的预填词：仅「新手引导 → 打开与我的对话」目标用户还不是好友时写入 UID，
// 弹窗关闭后清空，避免下次手动点「+」时被上一次的引导值带偏。
const addFriendInitialQuery = ref('');
watch(showAddFriendModal, (v) => { if (!v) addFriendInitialQuery.value = ''; });
const allThemes = THEMES.map((t) => t.value);
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
const previewData = reactive({ show: false, type: '', title: '', src: '', text: '', rawContent: '', showActions: false, mediaData: '', mediaMime: '' });

// --- computed ---
const targetUser = computed(() => store.users?.[pageId.value] || null);
const targetGroup = computed(() => store.groups?.[pageId.value] || null);
// 单方面关注关系的提示栏（仅私信会话；群聊 pageId 可能与某用户 uid 相同，必须限定 pageType）
const watchWarnText = computed(() => {
  if (pageType.value !== 'user') return ''
  const u = targetUser.value
  if (!u) return ''
  // 注意：接收消息与关注关系无关（后端只在「发送」时校验 can_send_chat，要求对方关注我）。
  // 原来这里对「我未关注对方、对方关注我」提示「无法接收对方消息」是错的 —— 那种状态
  // 恰恰是可以正常互发的，提示会让人误以为会话坏了。只保留真正会拦住发送的那一种。
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
// 页级切换走 motion.css 的 page 预设（enter 260ms / leave 120ms + 4px，reduced-motion 归零）：page-stage 承担；
// 会话切换走 fade（enter 180ms / leave 120ms）：chat-main 承担；进出场均成对。
// JS 不再手写 opacity 状态机 + 定时器；需要等“切换完成后再定位”的场景（搜索跳转）用 @enter 钩子事件驱动。

// 登录后恢复本地数据：uid 就绪即触发 loadData()
// 根因修复：onMounted 时若 /chat/info 失败（uid 未设置），loadData 会 return 跳过，
// 之后轮询 update() 虽会设置 uid，但 loadData 不会再被调用 → 本地数据永不恢复 → 消息全从服务器重拉
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
  // 游客模式：聊天不可用，拦截导航
  if (!store.logined && type === 'chat') return;
  // “工具”入口：点击时进入工具列表；已在工具页（可能正打开某个工具）则回到列表
  if (type === 'tools') {
    // 网页版不提供工具列表（工具依赖本地文件系统，浏览器里跑不了）
    if (isWeb) return;
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

// 从头像菜单子页（设置/关于/更新/赞助）返回消息列表
function backToChatList() {
  // 未登录（游客）无消息列表可回：桌面端回到游客可用的工具列表（网页版没有工具，直接去登录）；
  // 登录用户则回到消息列表。
  if (!store.logined) { if (isWeb) { gotoLogin(); return; } switchPage('tools'); return; }
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
    Object.keys(expandedMsgs).forEach(k => delete expandedMsgs[k]);
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
    // 网页版没有本地库：点开才向服务端要该会话最近的消息
    if (isWeb) {
      webExhausted.delete((type === 'group' ? 'g:' : 'u:') + id);
      loadConversationLite(type, id);
    }
  };
  // 切换动作立即执行：淡出/淡入由 chat-main 的 <Transition name="fade"> leave/enter 成对完成；
  // 新会话首帧滚动定位在 chat-main 的 @enter 钩子里做（见 onChatMainEnter），JS 不再手写 opacity 定时器。
  doSwitch();
}

// chat-main 每次进入（打开会话 / 切换会话 / 从工具返回会话）后定位消息列表：
// 默认滚到底部；若此次切换来自全局搜索，则改为定位到目标消息（见 onSearchJump 的 pendingJumpMsgId）。
let pendingJumpMsgId = null;
function onChatMainEnter() {
  messageListRef.value?.scrollToBottomInstant();
  if (pendingJumpMsgId != null) {
    const msgId = pendingJumpMsgId;
    pendingJumpMsgId = null;
    messageListRef.value?.jumpToMessage(msgId);
  }
}

function onNewConversationFromList(type) {
  if (type === 'group') showCreateGroupModal.value = true;
}

// --- 消息列表事件 ---
function onMessageAreaScrollToTop(height, loadAll) {
  if (isWeb) {
    // 网页版：内存里的消息只是已加载片段，上滑一律向服务端再要 30 条更早的。
    // 三条硬规则（否则表现就是「有时跳回底部、有时再也翻不动」）：
    //   ① 单飞：同一会话同时只能有一个上翻请求在飞。并发两个会以同一个「最旧时间」为游标
    //      拿到同一页，后到的那份一条都没新增 → 被误判成「历史取完了」→ 从此再也翻不动。
    //   ② 先取数、再一次性放窗口（见下），避免「先冒出被挡住的几条、30 条到货后再顶一次」。
    //   ③ 还原用锚点消息，不用 scrollHeight 差值：请求期间轮询可能追加新消息，
    //      差值法会把这段增量也算进去，一次就把视口甩到底部。
    if (loadAll) { visibleCount.value = currentMessagesLength.value; return; }
    const kind = pageType.value === 'group' ? 'group' : 'user';
    const key = (kind === 'group' ? 'g:' : 'u:') + pageId.value;
    if (webExhausted.has(key)) { visibleCount.value = currentMessagesLength.value; return; }
    if (webLoadingOlder.has(key)) return; // ① 已有请求在飞
    webLoadingOlder.add(key);
    const forPage = pageId.value; // 请求期间用户可能切走：回包只能作用在原会话上
    const el = messageListRef.value?.messageAreaEl;
    // 锚点 = 视口里第一条消息（含它相对视口顶部的偏移），DOM 更新后按它还原
    const anchor = el ? (() => {
      const areaTop = el.getBoundingClientRect().top;
      for (const row of el.querySelectorAll('.msg-row')) {
        const r = row.getBoundingClientRect();
        if (r.bottom > areaTop + 1) return { id: row.getAttribute('data-msg-id'), top: r.top - areaTop };
      }
      return null;
    })() : null;
    loadOlderLite(kind, forPage).then(() => {
      webLoadingOlder.delete(key);
      // 请求期间切走了会话：回包只留在 store 里，别去撑新会话的窗口、更别动它的滚动位置
      if (pageId.value !== forPage) return;
      visibleCount.value = currentMessagesLength.value; // ② 一次性放出
      if (!el || !anchor) return;
      nextTick(() => {
        const row = el.querySelector('[data-msg-id="' + anchor.id + '"]');
        if (!row) return;
        const delta = (row.getBoundingClientRect().top - el.getBoundingClientRect().top) - anchor.top;
        el.scrollTop = Math.max(0, el.scrollTop + delta); // ③ 锚点还原
      });
    }, () => { webLoadingOlder.delete(key); });
    return;
  }
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
// 跨会话时页面切换由 <Transition> 的 leave→enter 驱动，定位动作挂到 chat-main 的 @enter 钩子
// （pendingJumpMsgId），不再用 setTimeout 猜过渡时长；同一会话内跳转直接定位。
function onSearchJump(data) {
  if (typeof data === 'object' && data.convoType) {
    if (`${data.convoType}:${data.convoId}` === chatKey.value) {
      jumpToMessage(data.msgId);
      return;
    }
    pageType.value = data.convoType;
    pageId.value = data.convoId;
    pendingJumpMsgId = data.msgId;
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

/**
 * 转发前清洗 content。
 * 投票的「票」不是独立消息，而是记在发起消息 content 里的本地聚合结果（votes / voteMeta / invalid，
 * 见 utils.js 的 makePollContent / 投票合并逻辑）。原样转发等于把 A 群谁投了什么都抄进 B 群：
 * 新投票一出现就显示「已经有人投过」，票数也全错。转发只应保留题面与选项。
 */
function stripPollVotes(content) {
  if (!content || typeof content !== 'string' || content.trim()[0] !== '{') return content;
  try {
    const obj = JSON.parse(content);
    if (!obj || obj.type !== 'poll') return content;
    delete obj.votes;
    delete obj.voteMeta;
    delete obj.invalid;
    delete obj.custom;
    return JSON.stringify(obj);
  } catch {
    return content;
  }
}

async function forwardToTarget(type, targetId, msgContent) {
  if (!type || !targetId || !msgContent) return;
  const payload = stripPollVotes(msgContent);
  try {
    const r = await (await safeFetch('/chat/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, target_id: targetId, content: payload })
    })).json();
    if (!r.success) {
      // 服务端的失败原因（禁言 / 次数上限 / 消息过长）是能读的，直接透出比「转发失败」有用
      if (inputFooterRef.value) inputFooterRef.value.errorMessage = r.err?.message || '转发失败';
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

/**
 * 用户对某个投票选项投票 → 发一条 vote 回复消息。
 * ⚠️ 群聊与私信都必须能投：投票就是一条普通消息，聚合完全在客户端做（见 utils.aggregatePoll），
 *    「投票只用于群聊」是过时的假设 —— 私信里投票卡片照样渲染、选项照样能勾，
 *    只有这里被 `pageType !== 'group'` 一刀切掉，表现是点「确认投票」毫无反应、也没有任何报错
 *    （用户报障：「私信的投票好像无法回复」）。
 * ⚠️ 同一人重复投票：直接再发一条 vote 即可；客户端聚合按「uid + 选项」去重，
 *    因此「改票」表现为旧选项不再被他计入（无需撤回旧消息）。
 */
async function onPollVote({ poll, pick, custom }) {
  // 能点到投票卡片就一定是会话页（MessageList 只在 isChatPage && pageId 时渲染），
  // pageType 在这里天然是 'user' 或 'group'，不必再校验，直接当消息类型发。
  if (inputFooterRef.value?.sending) return;
  inputFooterRef.value.sending = true;
  // 会话标识要在 await 之前定住：请求期间用户可能已经切走，回复只能落到发起的那个会话
  const type = pageType.value;
  const targetId = pageId.value;
  // 开放题（自拟选项）会带 custom；普通投票为空串 → makeVoteContent 不写该字段
  const msgObj = JSON.parse(makeVoteContent(poll, pick, custom));
  try {
    const r = await sendChatMessage({ type, targetId, msgObj });
    if (r.success) {
      // 请求期间可能已切走会话（组件卸载、ref 置空），await 之后都要重新确认
      if (inputFooterRef.value) inputFooterRef.value.errorMessage = '';
      const { tokenInfo } = applyChatToStore(r, type, targetId);
      if (inputFooterRef.value) inputFooterRef.value.tokenInfo = tokenInfo;
    } else {
      if (inputFooterRef.value) inputFooterRef.value.errorMessage = r.err?.message || '投票失败';
    }
  } catch {
    if (inputFooterRef.value) inputFooterRef.value.errorMessage = '投票失败';
  }
  if (inputFooterRef.value) inputFooterRef.value.sending = false;
}

// --- 批量操作 ---
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

// --- 不显示 / 免打扰 ---
// 「不显示」只从会话列表隐藏，聊天数据与消息全部保留；搜索时仍可找到并右键恢复显示。
function toggleHiddenConvo() {
  const { type, id } = targetMenu;
  targetMenu.show = false;
  const key = getConvoKey(type, id);
  if (!store.hiddenConvos) store.hiddenConvos = {};
  if (store.hiddenConvos[key]) delete store.hiddenConvos[key];
  else store.hiddenConvos[key] = true;
  saveAll();
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
/** 复制消息内容（文本 / 表情 / 文件 / 自定义表情），供消息预览底部栏复用 */
async function copyMsgContent(content) {
  const obj = parseMsgContent(content);
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
      else text = content;
    } else {
      text = content;
    }
    await window.api.clipboardWriteText(text);
  }
}

/** 下载消息内嵌的文件 / 图片，供消息预览底部栏复用 */
function downloadMsgContent(content) {
  const obj = parseMsgContent(content);
  if (obj && (obj.type === 'file' || obj.type === 'sticker') && obj.data) {
    window.api.downloadFile(obj.data, obj.name || 'download', obj.mime);
  }
}

function onPreviewCopy() {
  const content = previewData.rawContent;
  if (!content) return;
  copyMsgContent(content);
}

function onPreviewForward() {
  const content = previewData.rawContent;
  if (!content) return;
  previewData.show = false;
  startForward(content);
}

async function onPreviewDownload() {
  // 图片预览：底部栏下载按钮走这里。优先用消息透传的原始 base64（src 多为 blob: URL，
  // 直接 a[download] 只会得到临时对象地址，落盘会失败）；无原始数据时回落到 data: URL 解析，
  // 再不行就由渲染进程 fetch 回字节（blob: 与本地页面同源，可直接取到）。
  if (previewData.type === 'image') {
    let data = previewData.mediaData || '';
    let mime = previewData.mediaMime || '';
    const src = previewData.src || '';
    if (!data && src.startsWith('data:')) {
      const m = src.match(/^data:([^;,]+);base64,(.*)$/);
      if (m) { mime = m[1]; data = m[2]; }
    }
    if (!data && src) {
      // blob:（会话图片）/ http(s)：渲染进程取回再转 base64。http 远程图可能被 CORS 拦，
      // 但会话里的图片基本都是 blob: 或 data:，覆盖到即可。
      try {
        const res = await fetch(src, { credentials: 'omit' });
        if (res.ok) {
          const blob = await res.blob();
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let bin = '';
          const CHUNK = 0x8000;
          for (let i = 0; i < bytes.length; i += CHUNK) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
          }
          data = btoa(bin);
          mime = mime || blob.type || 'image/png';
        }
      } catch { /* 取不到就走下面的提示 */ }
    }
    if (!data) { alert('该图片无法下载（缺少原始数据）'); return; }
    const name = /\.(png|jpe?g|gif|webp|bmp|ico)$/i.test(previewData.title || '')
      ? previewData.title
      : `${previewData.title || '图片'}.${(mime.split('/')[1] || 'png').replace('jpeg', 'jpg')}`;
    window.api.downloadFile(data, name, mime || 'image/png');
    return;
  }
  const content = previewData.rawContent;
  if (!content) return;
  downloadMsgContent(content);
}

function onOpenPreview(data) {
  previewData.type = data.type;
  previewData.title = data.title;
  previewData.src = data.src;
  previewData.text = data.text;
  previewData.rawContent = '';
  previewData.showActions = false;
  previewData.mediaData = data.mediaData || '';
  previewData.mediaMime = data.mediaMime || '';
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
  nextTick(() => groupaction.show = true);
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
  nextTick(() => targetMenu.show = true);
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
      // 「退出并屏蔽」在后端就是 leave（modules/chat.js）：但群主在群里还有别人时后端会拒绝，
      // 以前这里是空 catch + 无条件标记成功 —— 结果是「已屏蔽」却仍在群里，而探针又把
      // exited 的群排除掉，这个群就再也收不到消息、也没有任何提示。必须看返回值。
      let r;
      try {
        r = await postGroup({ type: 'leave', group_id: gid, target_id: 0 });
      } catch (e) {
        alert('退出并屏蔽失败：' + (e && e.message ? e.message : '网络异常'));
        return;
      }
      if (!r || !r.success) {
        alert((r && r.err && r.err.message) || '退出并屏蔽失败，请稍后重试');
        return;
      }
      group.exited = true;
      group.blocked = true;
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
  // 只发后端真正实现的 9 种 type（modules/chat.js:200-347 没有 else 兜底：未知 type 会
  // 静默返回 success，前端会以为操作成功，实际什么都没发生）。
  const GROUP_ACTIONS = [
    'setup', 'leave', 'give_owner', 'add_member', 'del_member',
    'add_administrator', 'del_administrator', 'mute_member', 'mute_group', 'set_title',
  ];
  if (!GROUP_ACTIONS.includes(action.type)) {
    console.warn('[group] 未知的群操作，已拦截：', action.type);
    alert('不支持的操作：' + action.type);
    return;
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
// 编号严格跟随 NavBar 主导航顺序：消息 / 工具 / 设置；关于排在其后
const DEFAULT_SHORTCUTS = { sendMessage: 'enter', search: 'ctrl+f', switchToChat: 'ctrl+1', switchToTools: 'ctrl+2', switchToSettings: 'ctrl+3', switchToAbout: 'ctrl+4', newConversation: 'ctrl+n' };
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
  if (!isWeb && matchShortcut(e, getShortcutValue('switchToTools'))) { e.preventDefault(); switchPage('tools'); return true; }
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
    store.mutedConvos = {};
    store.hiddenConvos = {};
    // 从服务器重新拉取（爬取模式：拉取 100 条 + 继续翻页取尽历史）
    const result = await (await safeFetch('/chat/info')).json();
    if (result.success) await update(result);
    store.fetchNewCount = 0;
    // 网页版不首爬历史：重连后只重新探一次基线，列表顺序随之刷新
    if (isWeb) { try { await probeTargetTimes(true); } catch {} applyLastSendTimesToList(); }
    else await updateMessagesData(100, true);
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
  // 完整承载 OJ 档案（含 grade_class / graduate_year / school_short 等字段）；
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
      return [f.id, { uid: f.id, realname: f.real_name, username: f.username, nickname: f.nickname, grade: f.grade, grade_class: f.grade_class, seat: f.seat, watchee: f.watchee === true, watcher: f.watcher === true, note: old ? old.note : '', message_ids: old ? old.message_ids : [], unread: old ? old.unread : 0, pinned: old ? old.pinned : false, lastSendTime: old ? old.lastSendTime : 0, _fetchedAt: old ? old._fetchedAt : undefined }];
    }));
  const hiddenUsers = Object.fromEntries(Object.entries(store.users).filter(([, u]) => u.show === false && !friendsMap[u.uid]));
  store.users = { ...friendsMap, ...hiddenUsers };
  const newGroupIds = new Set(result.groups.map(g => g.id));
  const newGroups = Object.fromEntries(result.groups.map(g => {
    const old = store.groups[g.id];
    return [g.id, { gid: g.id, name: g.title, mute: g.mute, users: g.users.map(({ user_id, type, mute }) => ({ user_id, type, mute })), message_ids: old ? old.message_ids : [], unread: old ? old.unread : 0, pinned: old ? old.pinned : false, mentioned: old ? old.mentioned : false, exited: false, blocked: old ? old.blocked : false, lastSendTime: old ? old.lastSendTime : 0 }];
  }));
  for (const [gid, oldGroup] of Object.entries(store.groups)) { if (!newGroupIds.has(Number(gid))) { oldGroup.exited = true; newGroups[gid] = oldGroup; } }
  for (const [gid, newGroup] of Object.entries(newGroups)) {
    // 之前「已屏蔽」的群每次 /chat/info 刷新都补一次 leave（空 catch，失败也静默）。
    // 失败时要撤销屏蔽标记：否则列表显示「已屏蔽」、探针又排除该群，但人其实还在群里，
    // 消息和 @ 全都收不到。真正的退群成功由 submitGroupAction 处理，这里只做自愈重试。
    if (newGroup.blocked && !newGroup.exited) {
      try {
        const r = await postGroup({ type: 'leave', group_id: Number(gid), target_id: 0 });
        if (r && r.success) newGroup.exited = true;
        else newGroup.blocked = false;
      } catch { newGroup.blocked = false; }
    }
  }
  store.groups = newGroups;
}

/**
 * 拉取一段消息并入库。
 * - allowPage=true：历史爬取模式，整批都是新消息就继续往前翻页（首次进入 / 冷启动用）
 * - targetId 非空：只拉这一个会话（定向增量）。此时返回值告诉调用方「是否已接上」和
 *   「本页最旧的秒」，由调用方决定要不要继续往前翻 —— 轮询路径不在这里翻页。
 */
async function fetchMessages(type, end, take = 10, allowPage = false, targetId = null, depth = 0) {
  if (!infoLoopRunning) return null;
  try {
    // 服务端（modules/chat.js）的过滤条件是 `send_time < end_time`：**严格开区间**，
    // 而 chat.send_time 是「秒级整数」列。所以必须 +1 秒：
    // 消息在服务器秒 T 落地 → 探针在 [T, T+1) 内就看到新时间戳 → 若这里传 floor(now)=T，
    // 服务端会把 send_time=T 的那条挡在外面 → 拿回空列表 → 误判「已追上」→ 基线推到 T
    // → 之后每轮都 sec <= prev，永久跳过。症状就是「target-times 明明更新了，消息却不出现」。
    const endSec = Math.floor(end / 1000) + 1;
    const targetQuery = targetId == null ? '' : `&target_id=${targetId}`;
    const r = await (await safeFetch(`/chat/chat?type=${type}&end_time=${endSec}&take=${take}${targetQuery}`)).json();
    // 服务端返回 success:false（限流、临时错误）不能当作「没有新消息」：
    // 以前这里直接返回 caughtUp:true，调用方会以为已追上、把探针基线推到新时间戳，
    // 结果这批消息就被永久跳过 —— 症状正是「target-times 明明变了，对话里却不再出现新消息」。
    if (!r.success) return null;
    if (!r.chats || !r.chats.length) return { inserted: false, caughtUp: true, oldestSendTime: null, maxSendTime: 0, count: 0 };
    let hasNew = false; // 本轮是否插入了至少一条新消息
    let oldestSendTime = null; // 本页最旧一条的 send_time（秒），供游标翻页用
    let maxSendTime = 0; // 本页最新一条的 send_time（秒）：调用方用它判断「真的看到这条了」
    for (const c of r.chats) {
      if (!infoLoopRunning) return null;
      if (oldestSendTime === null || c.send_time < oldestSendTime) oldestSendTime = c.send_time;
      if (c.send_time > maxSendTime) maxSendTime = c.send_time;
      // 下一页的上界：本页最旧那一秒。**不能减 1 毫秒** —— 服务端是 `send_time < end_time` 严格开区间，
      // floor((T*1000-1)/1000)+1 = T，下一页会把整秒 T 的消息全挡掉；而 take 一旦在秒 T 这一批里截断，
      // 剩下那些同秒消息就永久丢失（历史中间出现缺口）。
      end = Math.min(end, c.send_time * 1000);
      const t = type === 'group' ? store.groups[c.receiver_id] : type === 'send_user' ? store.users[c.receiver_id] : store.users[c.sender_id];
      if (!t) continue;
      // ⚠️「已接上」的判定不能只看「本页出现过已知消息」：翻页游标按秒前进时会重复取到
      // 上一页最旧那条（它是已知的），于是第 2 页就误判「接上了」而停下 —— 一次探针间隔里
      // 新增超过一页的消息就会留下缺口，而调用方又把基线推到最新时间戳，缺口永远补不回来。
      // 现在改成「本页是否带来了新消息」（见下方 caughtUp = !hasNew），一页全是旧消息才算取尽。
      const known = t.message_ids.includes(c.id);
      if (type === 'user' && c.sender_id === store.self.uid) continue;
      const isCurrentPage = (pageType.value === (type === 'group' ? 'group' : 'user') || (isChatPage.value && pageId.value)) && pageId.value === (type === 'group' ? c.receiver_id : (type === 'send_user' ? c.receiver_id : c.sender_id));
      // 正在看这个会话：未读与 @ 提醒都该即时归零。
      // 放在 fetchMessages 而不是只依赖 onSelectConversation，是为了覆盖「点通知直接跳进来」
      // 这类不经过选择事件的进入路径 —— 否则头部会一直挂着 [有人@你]，得退出重进才消。
      if (isCurrentPage) { t.unread = 0; if (type === 'group') t.mentioned = false; }
      if (known) {
        // 旧消息：不重复处理，仅跳过
        // 自愈：id 已在会话消息列表、但内容缺失（本地未及落库 / 历史持久化丢失），
        // 从服务器返回补回内容，否则该消息重启后永远无法显示；由快照统一落库
        // ⚠️ 走入库闸门：message_ids 里若残留旧 vote 消息（脏数据/重新拉回），也必须合并进 poll 而非复活成独立消息
        if (!store.messages[c.id]) {
          // 普通消息：补回内容；投票消息：票并进 poll 消息 —— 两者都需落库
          ingestMessage(t, c);
          markMsgDirty(type === 'group' ? 'group' : 'user', type === 'group' ? c.receiver_id : (type === 'send_user' ? c.receiver_id : c.sender_id));
        }
      } else {
        const msgContent = c.content;
        // ⭐ 入库闸门：投票回复合并进 poll 消息、不单独落库（不计未读/不占 20 条）
        const ing = ingestMessage(t, c);
        if (store.initializing && ing.kind !== 'vote') store.fetchNewCount++;
        const persistKind = type === 'group' ? 'group' : 'user';
        const persistCid = type === 'group' ? c.receiver_id : (type === 'send_user' ? c.receiver_id : c.sender_id);
        markMsgDirty(persistKind, persistCid);
        // 投票回复：既不通知、也不计未读、也不置 @ 提醒——它只是「票」，不是一条消息
        if (ing.kind === 'vote') continue;
        // 通知/铃声是「锦上添花」的一步：任何异常都不能影响消息入库与拉取流程。
        // （之前 JSON.parse 在裸文本 content 上抛错，把整批 fetchMessages 打断，
        //   连首爬都中断，表现就是「有新消息却一直不出现」。）
        try {
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
              // 线上可能混入「纯文本 content」（网页版/其它客户端发的历史消息就是裸字符串），
              // 直接 JSON.parse 会抛 SyntaxError，把整轮 fetchMessages 打断 ——
              // 结果既没弹通知、也把这条消息当成「拉取失败」反复重试。这里按文本兜底。
              const msg = parseMsgContent(msgContent) || { type: 'text', content: String(msgContent || '') };
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
        } catch (e) { console.error('[notify] 通知失败（不影响消息拉取）：', e); }
        if (c.sender_id !== store.self.uid && !isCurrentPage) t.unread = (t.unread || 0) + 1;
        // @ 提醒同理：正停留在这个群聊里就不要再标记「有人@你」——消息就在眼前，
        // 标了反而要退出重进才消失（此前这里漏了 !isCurrentPage）。
        if (type === 'group' && c.sender_id !== store.self.uid && !isCurrentPage) {
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
    // depth 上限：游标是「秒」，同一秒里消息数超过 take 时下一页可能原地返回同一批，
    // 有 depth 兜底就不会无限递归（正常历史几百页也到不了 200）。
    if (hasNew && allowPage && depth < 200) {
      await fetchMessages(type, end, 100, true, targetId, depth + 1);
    } else if (hasNew && allowPage) {
      console.warn('[chat] 历史翻页达到上限，可能是同一秒内消息数超过单页容量：', type, targetId);
    }
    // 返回 caughtUp = 「本页没有带来任何新消息」＝再往前都是本地已有的历史，可以停。
    // 不能把它定义成「本页出现过已知消息」：翻页游标按秒重叠时，第 2 页必然含上一页最旧
    // 那条（已知），那样每轮最多只补一页，单轮新增超过一页就永久缺口（见上面 for 里的注释）。
    // count = 本页返回条数：调用方要区分「整页塞满」和「已经到底了」，
    // 同一秒里的消息多到超出一页时，只能靠放大 take 把这一秒盖全（时间游标分不开）。
    return { inserted: hasNew, caughtUp: !hasNew, oldestSendTime, maxSendTime, count: r.chats.length };
  } catch (e) { console.error(e); return null; }
}

/** 全量拉一轮三个视图。返回 false 表示至少有一个视图没拉成功（首爬失败要重来）。 */
async function updateMessagesData(take = 10, allowPage = false) {
  const a = await fetchMessages('user', Date.now(), take, allowPage);
  const b = await fetchMessages('send_user', Date.now(), take, allowPage);
  const c = await fetchMessages('group', Date.now(), take, allowPage);
  return !!a && !!b && !!c;
}

// ===== 轮询：target-times 探针 + 定向增量拉取 =====
// 常规轮询不再把「每个会话最近 10 条」全量重下（含 base64 图片，一条就 74~90 KB），改成：
//   1) GET /chat/target-times  ← 542 B，只返回「会话 → 最后一条消息的时间戳」
//   2) 只有时间戳变大的会话，才按 target_id 定向拉几条
// 注意 target-times 必须带 id、且只回显被请求的 id，所以 /chat/info 仍然保留（降频），
// 它是「有哪些会话」的唯一来源 —— 新好友/新群只能由它发现。
// /chat/info 是全量会话快照（51 KB），只用来兜底发现「新加的好友 / 新群」——
// 探针只回显已知 id，发现不了新对象。每 2 轮拉一次（用户定：宁可贵一点也要快）。
const INFO_EVERY_ROUNDS = 2;
const TOKEN_EVERY_ROUNDS = 1; // token 查询只有 60 B，每轮查
const INCR_TAKE_START = 5; // 起手 5 条：同一秒可能有多条消息，take=1/2 容易漏，5 是实测折中
const INCR_TAKE_MAX = 16;
const INCR_MAX_PAGES = 4; // 单轮最多往前翻 4 页；还没接上就记进 backfillKeys，下一轮继续
// 「还有更旧的新消息没拉完」的会话 key 集合。
// 判定口径（用户定的）：只有「这一页里没有任何未出现过的消息」才算接上；
// 只要还有没出现的消息，就必须继续往前翻 —— 单轮页数用完就留到下一轮，
// 绝不能因为「本轮页数到顶」或「时间戳没变」就把这段缺口当成已同步。
const backfillKeys = new Set();

// 各会话「最后一条消息的时间戳」（秒），key = 'g:<gid>' / 'u:<uid>'。
// 探针靠它判断谁有新消息；只在内存里，冷启动首爬会重新建立基线。
const lastSendTimes = new Map();
// 同一秒内的补查记录：key → 已经为这个秒补查过一次。
// 服务端 MAX(send_time) 只有整秒精度，同一秒里的第二条消息不会让探针的数字变大，
// 只靠 `sec > prev` 永远发现不了。对每个基线只补查一次（多 1 个 take=2 的请求），
// 避免「时间戳不变」的会话每轮都多打一次请求。
const sameSecondRechecked = new Map();
const TARGET_TIMES_BATCH = 200; // 好友/群很多时按批问，避免 URL 过长被服务端截断

/**
 * 这个用户算不算「会话对象」。
 * store.users 里不止会话：ranklist 后台爬取会把全校学生的资料也塞进来（show:false），
 * 那些人既不是好友也没有消息，问探针纯属浪费 —— 早先没过滤，直接导致一轮发出 6 个
 * target-times 请求（按 200 个 id 分批）。只保留「好友关系」或「已有消息」的用户。
 */
function isConversationUser(u) {
  if (!u || u.uid == null) return false;
  return u.watchee === true || u.watcher === true || (u.message_ids && u.message_ids.length > 0);
}

/** 把当前已知的群/好友 id 按批切开（探针只认被请求的 id） */
function targetTimesBatches() {
  const gids = [];
  for (const g of Object.values(store.groups || {})) if (g && !g.exited && g.gid != null) gids.push(g.gid);
  const uids = [];
  for (const u of Object.values(store.users || {})) if (isConversationUser(u)) uids.push(u.uid);
  const batches = [];
  for (let i = 0; i < Math.max(gids.length, uids.length, 1); i += TARGET_TIMES_BATCH) {
    batches.push({
      group_ids: gids.slice(i, i + TARGET_TIMES_BATCH).join(','),
      user_ids: uids.slice(i, i + TARGET_TIMES_BATCH).join(','),
    });
  }
  return batches;
}

/**
 * 问一次探针，返回「有新消息」的会话列表。
 * seed=true 只记录基线、不产生待拉取项（冷启动用，避免把历史当成新消息再拉一遍）。
 * 返回 null 表示这次请求失败（调用方据此做退避计数）。
 */
/**
 * 登录态失效：服务端把请求重定向到登录页，返回的是 HTML 而不是 JSON。
 * 以前这种响应会被当成「网络异常」→ 一直显示「未连接，正在尝试重新连接…」，
 * 用户永远等不到恢复（cookie 已经没了，重试多少次都没用）。这里直接告诉他重新登录。
 */
function noteSessionExpired() {
  if (serverNotice.value) return;
  serverNotice.value = '登录状态已失效，请重新登录';
  serverNoticeMuted.value = false;
  store.netError = false;
}

/**
 * 服务端「明确拒绝」类响应（封禁/禁言）要原样告诉用户。
 * 以前所有失败一律当网络故障处理，于是后端返回的
 * 「你被禁止使用聊天功能直到…」被压成「未连接，正在尝试重新连接…」，
 * 用户完全不知道是自己被禁言了，只看到聊天一直不动。
 */
/**
 * 登录态失效的统一收口。桌面端以前只挂一句提示、然后从启动序列里 `return`，
 * `store.initializing` 永远停在 true —— 遮罩「正在加载消息…」盖住整个界面，
 * 用户重开应用（cookie 早在退出期间过期）就只能看到这个死界面，点哪都没反应。
 * 正确做法：停止轮询、收起加载遮罩、清掉「已登录」标记，直接回登录页
 * （LoginView 会用 keepLogin 存下的账号密码预填，点一下就能重新登录）。
 */
function handleSessionExpired() {
  noteSessionExpired();
  if (isWeb) { gotoLogin(); return; }
  infoLoopRunning = false;
  stopRanklistFetch();
  store.initializing = false;
  store.netError = false;
  store.logined = false;
  store.guestMode = false; // App.vue 的 LoginView 条件是 !logined && !guestMode
  try { localStorage.removeItem('7fa4_logined'); } catch {}
}

function noteServerFailure(r) {
  if (!r || r.success) return false;
  const msg = (r.err && r.err.message) || '';
  if (!msg) return false;
  if (/禁止使用聊天|被禁言|已被封禁/.test(msg)) {
    serverNotice.value = msg;
    return true;
  }
  return false;
}

async function probeTargetTimes(seed = false) {
  const batches = targetTimesBatches();
  if (!batches.length || (!batches[0].group_ids && !batches[0].user_ids)) return [];
  const changes = [];
  const collect = (map, prefix, kind) => {
    for (const [rawId, rawSec] of Object.entries(map || {})) {
      const id = Number(rawId);
      const sec = Number(rawSec) || 0;
      if (!id || !sec) continue;
      const key = prefix + id;
      const prev = lastSendTimes.get(key) || 0;
      // 服务器偶发回退（时钟/主从）：保持旧基线，别当成新消息。
      if (sec < prev) continue;
      if (sec === prev) {
        // 时间戳没变大，但可能是「同一秒里的第二条消息」——MAX(send_time) 精度只有秒。
        // 每个基线补查一次；补查也走定向拉取，靠 id 去重，不会重复插入。
        if (seed || prev === 0 || sameSecondRechecked.get(key) === sec) continue;
        sameSecondRechecked.set(key, sec);
        changes.push({ kind, id, fresh: false, key, sec, sameSecond: true });
        continue;
      }
      if (seed) {
        lastSendTimes.set(key, sec);
        // 建基线时顺手把「同秒补查」也标记成已完成：紧接着的首次爬取（take=100）已经把
        // 这一秒的消息全拉回来了，不需要开轮询后再对每个会话补查一次 ——
        // 否则一启动就是「所有有过消息的会话各拉一遍」，几十个会话 ≈ 上百个请求。
        sameSecondRechecked.set(key, sec);
        continue;
      }
      // 注意：这里**不能**先更新 lastSendTimes —— 基线要等真正拉取成功后再推进
      // （见调用方）。否则一次网络失败/服务端延迟就会把这段时间的新消息永久跳过，
      // 表现就是「target-times 明明变了，但对话里一直不出现新消息」。
      // prev=0 说明这是个「之前从未有过消息」的会话（新好友发的第一条），
      // 本地一条历史都没有，得按首次爬取整段拉回来，不能只拉增量。
      changes.push({ kind, id, fresh: prev === 0, key, sec });
    }
  };
  for (const batch of batches) {
    const qs = new URLSearchParams({ group_ids: batch.group_ids, user_ids: batch.user_ids, scope: '' }).toString();
    let r;
    try {
      const res = await safeFetch('/chat/target-times?' + qs);
      r = await res.json();
      // safeFetch 遇到 HTML 响应（登录失效被重定向到登录页）时，_html 标记在解析出的 body 上
      if (r && r._html) { handleSessionExpired(); return null; }
    } catch {
      return null;
    }
    if (!r || !r.success) {
      noteServerFailure(r);
      return null;
    }
    collect(r.groups, 'g:', 'group');
    collect(r.users, 'u:', 'user');
  }
  return changes;
}

/**
 * 定向增量拉取一个会话。take 从小到大倍增，靠「本页出现本地已有消息」判断已接上；
 * 整页都是新消息才继续往前翻。
 * 返回 { ok, maxSeen }：maxSeen = 本页见到的最新 send_time（秒），调用方据此决定基线能不能推进
 * —— 服务端可能还没把「探针看到的那条」吐出来（秒级边界 / 主从延迟），没见到就不能推进。
 */
async function pullOne(type, targetId, fresh) {
  if (fresh) {
    // 新会话：本地没有历史，按首次爬取的做法整段拉（100 条 + 翻页）
    const r = await fetchMessages(type, Date.now(), 100, true, targetId);
    return { ok: !!r, maxSeen: r ? r.maxSendTime : 0, done: true };
  }
  let end = Date.now();
  let take = INCR_TAKE_START;
  let maxSeen = 0;
  for (let page = 0; page < INCR_MAX_PAGES; page++) {
    const res = await fetchMessages(type, end, take, false, targetId);
    if (!res) return { ok: false, maxSeen, done: false }; // 请求失败：让调用方保留旧基线、下一轮重试
    if (res.maxSendTime > maxSeen) maxSeen = res.maxSendTime;
    // caughtUp = 这一页里没有一条未出现过的消息。只有这种情况才算真的接上了；
    // 「本页出现过已知消息」不算（翻页游标按秒重叠，第 2 页必然含上一页最旧那条）。
    if (res.caughtUp || res.oldestSendTime === null) return { ok: true, maxSeen, done: true };
    // 往前翻的游标 = 本页最旧那一秒。fetchMessages 内部会 +1（服务端 `send_time < end_time`
    // 是开区间），所以传 `oldest * 1000` 实际查的是 `send_time <= oldest`：同一秒里
    // 剩下的消息仍会被取到。**不能传 (oldest + 1) * 1000** —— 那等于把上界又抬高 1 秒，
    // 第 2 页必然命中上一页最旧那条已知消息，误判「接上了」而停，单轮新增超过一页就丢消息。
    const nextEnd = res.oldestSendTime * 1000;
    if (nextEnd >= end) {
      // 整页都落在同一秒里：时间游标已经分不开了，只能把 take 放大到能把这一秒盖全。
      // 盖不全就记成「没接上」，交给下一轮继续补 —— 绝不能在这里假装已经同步完。
      if (res.count >= take && take < 100) {
        take = Math.min(take * 4, 100);
        page--; // 同一个时间窗口重试，不占页数
        continue;
      }
      return { ok: true, maxSeen, done: res.count < take };
    }
    end = nextEnd;
    take = Math.min(take * 2, INCR_TAKE_MAX);
  }
  // 页数用完了但还没接上：这一轮先到这里，把会话记下来，下一轮继续往前补。
  return { ok: true, maxSeen, done: false };
}

/** 拉一个会话的新消息：群只有 group 一个视图；私聊要 user（对方发的）+ send_user（自己发的） */
async function pullConversation(kind, id, fresh) {
  if (kind === 'group') return pullOne('group', id, fresh);
  const a = await pullOne('user', id, fresh);
  const b = await pullOne('send_user', id, fresh);
  return { ok: a.ok && b.ok, maxSeen: Math.max(a.maxSeen, b.maxSeen), done: a.done && b.done };
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
    // 偏好（三端都存：网页版只存这一份到 localStorage，会话/消息一律不落盘）
    const prefs = JSON.parse(JSON.stringify({
      drafts: store.drafts || {},
      mutedConvos: store.mutedConvos || {},
      hiddenConvos: store.hiddenConvos || {},
      stickers: store.stickers || []
    }))
    // 网页版（纯浏览器）：没有本地会话/消息缓存，刷新页面等于像 OJ /chat 一样全量重拉。
    // 存下上一轮的本地索引会把「有消息的会话」挤到无消息区（旧索引没有 target-times 时间戳），
    // 所以这里只交偏好设置。
    if (isWeb) {
      await window.api.storeSaveAll(uid, { prefs })
      return
    }
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
    await window.api.storeSaveAll(uid, { convos, messages, prefs })
  } catch {} finally {
    savingNow = false
  }
}

/** 已把本地缓存的消息 id 补回 message_ids 索引的会话（本次运行每会话一次） */
const idsHydrated = new Set()

/** 懒加载：进入会话时从 SQLite 补拉历史消息到内存，并把这些消息的 id 补回 message_ids 索引 */
async function ensureConvoMessages(kind, cid) {
  // 网页版没有本地库：进入会话时按需向服务端拉（loadConversationLite），无需补索引
  if (isWeb) return
  const uid = store.self.uid
  if (!uid || cid == null) return
  const target = kind === 'group' ? store.groups[cid] : store.users[cid]
  if (!target || !Array.isArray(target.message_ids)) return
  const key = kind + ':' + cid
  const firstTime = !idsHydrated.has(key)
  // 非首次且内容都齐了 → 不必再查库
  if (!firstTime && !target.message_ids.some(mid => !store.messages[mid])) return
  try {
    const r = await window.api.storeLoadMessages(uid, kind, Number(cid), 1000)
    if (!r.success || !Array.isArray(r.data)) return
    for (const m of r.data) {
      if (m && m.id != null && !store.messages[m.id]) store.messages[m.id] = m
    }
    // ⚠️ 列表是按 message_ids 渲染的（useCurrentMessages），索引比本地缓存短时老消息永远看不到；
    //    上滑只会增大 visibleCount，不会回查本地库。因此进入会话必须把库里的 id 补回索引。
    //    （用户 2026-10-11 报障：本地存了 2500 条，打开群聊只看得到约 100 条）
    if (firstTime) {
      let added = 0
      for (const m of r.data) {
        const mid = m && m.id
        if (mid == null) continue
        if (target.message_ids.indexOf(mid) === -1) { target.message_ids.push(mid); added++ }
      }
      idsHydrated.add(key)
      if (added) markMsgDirty(kind === 'group' ? 'group' : 'user', Number(cid))
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
  // 网页版：没有任何本地会话/消息缓存，只把偏好设置（草稿/静音/隐藏/表情收藏）读回来。
  // 列表、消息全部由本轮网络的 /chat/info + /chat/target-times 决定（刷新 = 像 OJ /chat 一样重来）。
  if (isWeb) {
    try {
      const pr = await window.api.storeLoadPrefs(uid)
      if (pr && pr.success && pr.data) {
        const d = pr.data
        if (d.drafts) store.drafts = d.drafts
        if (d.mutedConvos) store.mutedConvos = d.mutedConvos
        if (d.hiddenConvos) store.hiddenConvos = d.hiddenConvos
        if (d.stickers) store.stickers = d.stickers
      }
    } catch {}
    return
  }
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
        if (!msg || msg.id == null || store.messages[msg.id]) continue
        store.messages[msg.id] = msg
      }
    }
    if (cr && cr.success) {
      if (cr.users) store.users = { ...store.users, ...cr.users }
      if (cr.groups) store.groups = { ...store.groups, ...cr.groups }
    }
    if (pr && pr.success && pr.data) {
      const d = pr.data
      if (d.drafts) store.drafts = d.drafts
      if (d.mutedConvos) store.mutedConvos = d.mutedConvos
      if (d.hiddenConvos) store.hiddenConvos = d.hiddenConvos
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
  lastSendTimes.clear(); // 探针基线属于当前账号，换账号必须清掉
  sameSecondRechecked.clear();
  backfillKeys.clear(); // 未补完的缺口也属于当前账号
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
  // 无论哪种退出，服务端会话都已经销毁（上面 POST /logout + 清了 cookie），本地绝不能再
  // 留「已登录」标记。原来的注释以为「重新登录」可以保留标记，但那样下次启动会直接进入
  // 聊天界面、所有请求都因没有 cookie 失败，只能看到一个空的破界面 —— 必须一并清掉，
  // 让下次启动老老实实回登录页（keepLogin 的账号密码仍在，重新登录不用重输）。
  try {
    localStorage.removeItem('7fa4_logined');
  } catch {}
  Object.assign(store, { self: { uid: null, username: null, nickname: null, realname: null }, users: {}, groups: {}, messages: {}, stickers: [], drafts: {}, mutedConvos: {}, hiddenConvos: {} });
  clearPendingVotes(); // 清空待落地投票缓冲，避免串到下一个账号
  store.logined = false;
  store.netError = false;
  store.online = navigator.onLine;
  // toLogin=true：重新登录 → 回登录页（guestMode=false）；否则退出登录 → 回游客主界面（guestMode=true）
  store.guestMode = !toLogin;
  // 网页版没有本地登录页：cookie 已销毁，直接整页回 OJ 登录页
  if (isWeb) location.href = '/login';
}

async function startInfoLoop() {
  if (!store.logined) return;
  if (infoLoopRunning) return; // 互斥：防止重复调用导致多个并发轮询循环（疯狂连续获取、不守间隔）
  infoLoopRunning = true;
  let failCount = 0;

  // ① 启动：先 /chat/info 填充会话集合
  // 首次进入：onMounted 里的 update(initialInfo) 因 infoLoopRunning 未置真，会被 update 自身的
  // `if (!infoLoopRunning) return` 守卫跳过，此时 store.users/groups 为空。若直接全量爬取，
  // fetchMessages 会因 `if (!t) continue`（t 取不到会话）把历史全部丢弃，只剩轮询的 10 条。
  // 因此置真后先 /chat/info 填充会话，再执行 100 条 + 翻页爬取历史（网页版跳过这一步）。
  try {
    const res = await safeFetch('/chat/info');
    const r = await res.json();
    if (r && r._html) { handleSessionExpired(); return; }
    if (!infoLoopRunning) return;
    if (r.success) { await update(r); failCount = 0; store.netError = false; store.online = true; }
    else { failCount++; store.netError = true; }
  } catch { failCount++; store.netError = true; }
  lastInfoAt = Date.now();
  // 先把「各会话最后消息时间」记成基线：必须排在首爬之前，
  // 否则首爬结束到记基线之间到达的消息会被当成基线、再也不会被拉取。
  // 记完基线再爬，这段时间来的消息既在爬取结果里、下一轮探针又会看到新时间戳（拉到已知 id 就停）。
  try { await probeTargetTimes(true); } catch {}
  // 探针里可能已判定「登录失效」并收口（这时 logined / infoLoopRunning 都已复位）：
  // 绝不能继续往下首爬历史、启动后台 ranklist —— 那只会拿没有 cookie 的会话空转。
  if (!infoLoopRunning || !store.logined) return;
  store.fetchNewCount = 0;
  if (isWeb) {
    // 网页版：不首爬历史（那正是「全量爬取」）。列表顺序由探针时间戳决定，点开会话才拉消息。
    applyLastSendTimesToList();
    store.initializing = false;
    startRanklistFetch();
  } else {
    let initialOk = false;
    try { initialOk = await updateMessagesData(100, true); } catch {}
    // 首爬没成功就别信上面记的基线：那些「刚好在这段时间到达」的消息会被当成基线永久跳过。
    // 清空基线后下一轮探针会把有消息的会话全部当作「未接上」重新拉一遍（幂等，靠 id 去重）。
    if (!initialOk) { console.warn('[poll] 首爬未完成，清空探针基线并重试'); lastSendTimes.clear(); }
    // 首次历史爬取（无论成败）结束：隐藏"正在加载消息…"提示，进入常规轮询
    store.initializing = false;
    // ranklist 与聊天无关，放在首爬之后、后台慢慢爬，不占首屏时间
    startRanklistFetch();
  }

  // ② 常规轮询：探针 → 定向增量拉取（详见上面「轮询：target-times 探针」一节）
  let round = 0;
  while (infoLoopRunning && store.logined) {
    round++;
    try {
      // 探针（542 B）：只问「谁有新消息」，命中的会话才发定向请求
      const changes = await probeTargetTimes();
      // 网页版：排行榜等外部刷新可能把 lastSendTime 覆盖成空，每轮用探针基线补一次
      if (isWeb) applyLastSendTimesToList();
      if (changes === null) {
        // 服务端明确说「你得被禁止使用聊天」时，这不是网络故障：别弹「未连接/重连中」，
        // 也别退避重试得像是网断了 —— 展示原话，轮询继续（禁言到期会自动恢复）。
        if (serverNotice.value) {
          failCount = 0;
          store.netError = false;
        } else {
          failCount++;
          store.netError = true;
        }
      } else {
        failCount = 0;
        store.netError = false;
        store.online = true;
        for (const c of changes) {
          if (!infoLoopRunning) break;
          if (isWeb) {
            // 网页版：只推进「列表顺序用的最后消息时间」，不替没打开的会话拉消息（省流量）。
            // 当前打开的会话才真正拉一条增量。基线推进规则与桌面端一致（见到该秒才算接上）。
            const t = webTarget(c.kind, c.id);
            if (t) t.lastSendTime = c.sec;
            lastSendTimes.set(c.key, c.sec);
            if (!isCurrentConvo(c.kind, c.id)) continue;
            try {
              const pulled = await pullConversation(c.kind, c.id, c.fresh);
              if (pulled.ok && !pulled.done) backfillKeys.add(c.key);
            } catch (e) { console.error(e); }
            continue;
          }
          try {
            const pulled = await pullConversation(c.kind, c.id, c.fresh);
            // 拉成功、且确实见到了「探针报的这个时间戳」才推进基线：失败就留在旧值，
            // 下一轮自动重试。只判 ok 不判 maxSeen 是不够的 —— 请求成功但服务端还没
            // 把那条消息吐出来时（秒级边界），推了基线就永久补不回来了。
            // 这里千万不能清 sameSecondRechecked 的标记：它的语义是「这个秒已经补查过」。
            // 清掉的话下一轮 `sec === prev` 又成立、标记又没了 → 每个会话每秒都被重拉一次，
            // 空闲状态下就是每分钟上千个请求（用户报的「没有新消息也一通猛抓」）。
            if (pulled.ok && pulled.maxSeen >= c.sec) lastSendTimes.set(c.key, c.sec);
            // 没接上（单轮页数用完、但还有更旧的新消息）：记下来，下一轮继续往前补，
            // 不能因为基线已经推到最新就把这段缺口当成已同步。
            if (pulled.ok && !pulled.done) backfillKeys.add(c.key);
          } catch (e) { console.error(e); }
        }
        // 注意：这里**不要**再「每轮把当前打开的会话直接拉一次」。
        // 探针的 MAX(send_time) 只有整秒精度，同一秒的第二条消息靠上面 sameSecondRechecked
        // 补查一次即可；每轮都拉会让空闲状态下每秒固定多出 1~2 个请求（私聊两个视图），
        // 而收益只是「同一秒的第三条以后能早 1 秒看到」，不值得。
        // 上一轮没补完的缺口：每轮各补一页，直到「本页没有任何未出现过的消息」为止。
        // 这里不依赖探针时间戳（它可能早就不变了），否则缺口会永远留在那里。
        if (!isWeb && infoLoopRunning && backfillKeys.size) {
          let budget = 3; // 每轮最多补 3 个会话，避免一次拉太多把带宽打满
          for (const key of Array.from(backfillKeys)) {
            if (!infoLoopRunning || budget-- <= 0) break;
            const kind = key.startsWith('g:') ? 'group' : 'user';
            const id = Number(key.slice(2));
            if (!id) { backfillKeys.delete(key); continue; }
            try {
              const pulled = await pullConversation(kind, id, false);
              if (!pulled.ok || pulled.done) backfillKeys.delete(key);
              else if (pulled.maxSeen > (lastSendTimes.get(key) || 0)) lastSendTimes.set(key, pulled.maxSeen);
            } catch (e) { console.error(e); }
          }
        }
      }
      if (!infoLoopRunning) break;
      if (failCount >= 3) {
        // 连续失败（如无法访问 jx）：退避到 10s，避免高频空转；保持"未连接"横幅直到恢复
        store.online = false;
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }
      // 会话集合兜底：新好友 / 新群只能由 /chat/info 发现（探针只回显已知 id）。
      // 网页版没有本地缓存可依赖，但 51KB 的 /chat/info 也没必要每 2 轮拉一次 → 5 分钟一次。
      if (isWeb ? (Date.now() - lastInfoAt >= WEB_INFO_EVERY_MS) : (round % INFO_EVERY_ROUNDS === 0)) {
        lastInfoAt = Date.now();
        try {
          const res = await safeFetch('/chat/info');
          const result = await res.json();
          if (result && result._html) { handleSessionExpired(); return; }
          else if (infoLoopRunning && result.success) {
            await update(result);
            if (isWeb) applyLastSendTimesToList();
          }
        } catch {}
        if (!infoLoopRunning) break;
      }
      // token 余额：60 B，每轮查
      if (round === 1 || round % TOKEN_EVERY_ROUNDS === 0) {
        try {
          const tr = await (await safeFetch('/chat/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'none' }) })).json();
          if (tr.success && tr.remain_token_count !== undefined) {
            if (inputFooterRef.value) inputFooterRef.value.tokenInfo = { remain: tr.remain_token_count, total: tr.remain_token_count + tr.used_token_count };
          }
        } catch {}
      }
    } catch (e) {
      // 单轮抛错绝不能杀死整个轮询：这里以前是裸露的循环体，任何一处异常
      // （例如热更新中途拿到的半成品模块、字段缺失）都会让 while 直接退出，
      // 表现就是「target-times 还在跳，但再也不发 /chat/chat、新消息永远不出现」。
      console.error('[poll] 本轮出错，2s 后继续：', e);
      failCount++;
    }
    await new Promise(r => setTimeout(r, setting.value.pollInterval || 1000));
  }
}

// --- 全局事件 ---
function onDocKeydown(e) {
  // 拦截 Ctrl/Cmd+R 与 F5 刷新（渲染层兜底；主进程 before-input-event 已拦）
  // 网页版不能拦：浏览器刷新是用户的正常操作（桌面端有主进程兜底，网页端没有）
  if (!isWeb && (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')))) {
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
// Onboarding.vue 的 ask() 在 window 上 dispatchEvent，这里必须监听 window：
// window 是 document 的父级，事件不会向子节点传播，监听 document 收不到（此前 4 个按钮全部失效的原因）。
function onOnboardingAction(e) {
  const d = e.detail || {}
  if (d.action === 'openUser' && d.id) openUserFromOnboarding(Number(d.id))
  else if (d.action === 'switch' && d.page) switchPage(d.page)
}

// 「打开与我的对话」兜底：目标用户（DEV_UID=991）不在会话列表里、或游客态时不能点了没反应。
function openUserFromOnboarding(uid) {
  // 游客/未登录：聊天不可用，直接引导去登录（与顶部「去登录」横幅同一入口，不新增依赖）
  if (!store.logined) { gotoLogin(); return }
  // 已是好友（在会话列表里）：照常打开会话
  if (store.users?.[uid]) { onSelectConversation({ type: 'user', id: uid }); return }
  // 已登录但还没加好友：打开「添加好友」弹窗并预填 UID，用户点「直接添加」即可关注
  addFriendInitialQuery.value = String(uid);
  showAddFriendModal.value = true;
}

// --- 生命周期 ---
onMounted(async () => {
  window.addEventListener('onboarding-action', onOnboardingAction);
  store.initializing = true;
  setting.value = await window.api.loadSetting();
  store.setting = setting.value;
  if (setting.value.fontSize) applyFontSize(setting.value.fontSize);
  store.online = navigator.onLine;
  try { version.value = await window.api.getVersion(); } catch {}
  // 更新检查已移到根组件 App.vue（initUpdateCheck）：网页版用的是 overrides 版 ChatView，
  // 检查写在这里网页端就查不到；根组件三端都跑，位置也更早（登录页/游客全覆盖）。
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
  // 不拉取 /chat/info、不进入轮询；聊天入口由 NavBar 隐藏。登录后由登录门控触发重新挂载。
  if (!store.logined) {
    store.online = true;
    store.netError = false;
    store.initializing = false;
    return;
  }
  try {
    const infoRes = await safeFetch('/chat/info');
    const initialInfo = await infoRes.json();
    // 网页版：cookie 失效时 OJ 会直接回登录页 HTML（不是 302），这里整页跳登录
    if (initialInfo && initialInfo._html) { handleSessionExpired(); return; }
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
  window.removeEventListener('onboarding-action', onOnboardingAction);
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
