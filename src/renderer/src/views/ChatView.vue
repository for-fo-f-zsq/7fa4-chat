<template>
  <div class="app motion-fade-in">
    <WindowTitleBar title="7FA4 Chat" />

    <ChatBannerStack
      :logined="store.logined"
      :net-error="store.netError"
      :net-down-text="netDownText"
      v-model:net-banner-muted="netBannerMuted"
      :server-notice="serverNotice"
      v-model:server-notice-muted="serverNoticeMuted"
      v-model:guest-banner-muted="guestBannerMuted"
      @relogin="onUserAction('relogin')"
      @goto-login="gotoLogin"
    />

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
            @Targetmenu="openTargetMenu"
            @dropFile="onDropFile"
            @markAllRead="markAllRead"
            @newConversation="onNewConversationFromList"
          />
          <div class="list-resize-bar" v-if="isChatPage && !isNarrowLayout" @mousedown="startListResize"></div>

          <Transition name="fade" mode="out-in" appear @enter="onChatMainEnter">
            <div class="chat-main" v-if="isChatPage && pageId" :key="chatKey">
              <ChatHeader
                :pageType="pageType"
                :pageId="pageId"
                :targetUser="targetUser"
                :targetGroup="targetGroup"
                @back="onBackFromChat"
                @openUserInfo="openUserInfo"
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
                @openUserInfo="openUserInfo"
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

          <ToolsView v-if="!isWeb && pageType === 'tools' && currentTool === 'list'" @open-tool="onOpenTool" />
          <ToolHost
            v-else-if="!isWeb && pageType === 'tools' && currentTool && currentTool.remote"
            :tool="currentTool"
            class="ide-host"
            @back="onToolBack"
            @send-image="onImageToolSend"
          />
          <SettingsPanel
            v-if="pageType === 'settings'"
            :self="store.self"
            :logged-in="store.logined"
            :setting="setting"
            :conn-status="store.connStatus"
            @reconnect="reconnect?.()"
            @user-action="onUserAction"
            @settingChange="onSettingChange"
            @openShortcutModal="shortcutModal = true"
          />
          <AboutPanel v-if="pageType === 'about'" :version="version" @back="backToChatList" />
          <UpdatePanel v-if="pageType === 'update'" :version="version" @back="backToChatList" />
          <DonatePanel v-if="pageType === 'donate'" @back="backToChatList" />
        </div>
      </Transition>
    </div>
  </div>

  <NoticePopup v-if="!hasDesktopNoticeWindow" :narrow="isNarrowLayout" />

  <ChatModalHost
    ref="modalHostRef"
    :pageId="pageId"
    :setting="setting"
    :state="modalState"
    :groupActionProgress="groupActionProgress"
    v-model:muteModalVisible="muteModalVisible"
    :forwardModalVisible="forwardModalVisible"
    :forwardMsgContent="forwardMsgContent"
    :imageSendPending="imageSendPending"
    :previewData="previewData"
    @createGroup="createGroup"
    @addfriend="addfriend"
    @openUserInfo="openUserInfo"
    @openGroupSettings="openGroupSettings"
    @targetMenuAction="onTargetMenuAction"
    @submitGroupAction="submitGroupAction"
    @selectConversation="onSelectConversation"
    @settingChange="onSettingChange"
    @groupAction="onGroupAction"
    @muteMinutesConfirm="onMuteMinutesConfirm"
    @closeForwardModal="closeForwardModal"
    @forwardConfirm="onForwardConfirm"
    @previewCopy="onPreviewCopy"
    @previewForward="onPreviewForward"
    @previewDownload="onPreviewDownload"
    @previewEdit="onPreviewEdit"
    @previewStep="onPreviewStep"
  />
</template>

<style scoped src="../css/components/chat-view.css"></style>

<script setup>
import { onBeforeUnmount, ref } from 'vue'
import { store } from '../store.js'
import { UiBanner } from '../ui'

import WindowTitleBar from '../components/common/WindowTitleBar.vue'
import NavBar from '../components/common/NavBar.vue'
import ToolHost from '../components/common/ToolHost.vue'
import ChatBannerStack from '../components/chat/ChatBannerStack.vue'
import ChatModalHost from '../components/chat/ChatModalHost.vue'
import NoticePopup from '../components/modals/NoticePopup.vue'
import ConversationList from '../components/chat/ConversationList.vue'
import ChatHeader from '../components/chat/ChatHeader.vue'
import MessageList from '../components/chat/MessageList.vue'
import InputFooter from '../components/chat/InputFooter.vue'
import SearchPanel from '../components/chat/SearchPanel.vue'
import SettingsPanel from '../components/panels/SettingsPanel.vue'
import AboutPanel from '../components/panels/AboutPanel.vue'
import UpdatePanel from '../components/panels/UpdatePanel.vue'
import DonatePanel from '../components/panels/DonatePanel.vue'
import ToolsView from './ToolsView.vue'
import { useChatWorkspace } from '../composables/chat/useChatWorkspace.js'
import { bindDesktopSiteNoticeBridge, hasDesktopSiteNoticeWindow } from '../composables/chat/useNotices.js'

const messageListRef = ref(null)
const inputFooterRef = ref(null)
const conversationListRef = ref(null)
const searchPanelRef = ref(null)
const modalHostRef = ref(null)

const {
  isWeb, allThemes, setting, version, isNarrowLayout, listWidth, startListResize,
  currentMessages, canLoadOlder, markAllRead, banners, nav, modals, groupActions, chatActions,
  onSettingChange, startReply, onNewConversationFromList, onUserAction, onTargetMenuAction,
  reconnect,
} = useChatWorkspace({
  messageListRef,
  inputFooterRef,
  conversationListRef,
  searchPanelRef,
  modalHostRef,
})

const { netBannerMuted, serverNotice, serverNoticeMuted, guestBannerMuted, netDownText, gotoLogin } = banners
const {
  pageType, pageId, currentTool, searchVisible, expandedMsgs, visibleCount,
  isChatPage, navPageType, showNavBar, pageStageKey, chatKey,
  targetUser, targetGroup, watchWarnText, inputDisabled,
  closeSearch, toggleSearch, switchPage, backToChatList, onBackFromChat,
  onOpenTool, onToolBack, onSelectConversation, onChatMainEnter,
  onMessageAreaScrollToTop, onSearchJump,
} = nav
const { modalState, shortcutModal, openUserInfo, openGroupSettings, openGroupActionMenu, openTargetMenu } = modals
const { groupActionProgress, muteModalVisible, onMuteMinutesConfirm, submitGroupAction, onGroupAction, createGroup, addfriend } = groupActions
const {
  forwardModalVisible, forwardMsgContent, imageSendPending, previewData,
  startForward, onForwardConfirm, closeForwardModal, onImageToolSend, onDropFile,
  sendPat, onPollVote, batchForward, onOpenPreview, onPreviewStep, onPreviewCopy, onPreviewForward, onPreviewDownload, onPreviewEdit,
} = chatActions

const hasDesktopNoticeWindow = hasDesktopSiteNoticeWindow()
const stopDesktopSiteNoticeBridge = hasDesktopNoticeWindow ? bindDesktopSiteNoticeBridge() : () => {}
onBeforeUnmount(() => {
  stopDesktopSiteNoticeBridge()
})
</script>
