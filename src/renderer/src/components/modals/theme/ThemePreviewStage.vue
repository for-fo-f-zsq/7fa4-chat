<template>
  <div ref="stageHostRef" class="tpv-root">
    <div class="tpv-meta-bar">
      <span class="tpv-meta-title">实时视觉参考（真实 HTML · 不可交互）</span>
      <div class="tpv-badges">
        <span class="tpv-pill">{{ isDark ? '深色基底' : '浅色基底' }}</span>
        <span class="tpv-pill" :class="dirty ? 'is-dirty' : 'is-synced'">
          {{ dirty ? '预览未应用' : '已同步全局' }}
        </span>
      </div>
    </div>

    <div class="tpv-stack">
      <section v-for="card in previewCards" :key="card.id" class="tpv-card">
        <header class="tpv-card-bar">
          <span class="tpv-card-label">
            <i :class="card.icon" aria-hidden="true"></i>
            <span>{{ card.title }}</span>
          </span>
        </header>

        <div class="tpv-viewport" :style="{ height: `${scaledHeight}px` }">
          <div
            class="tpv-scale-layer tpv-frozen"
            :style="[stageStyle, { transform: `scale(${scale})` }]"
            inert
            aria-hidden="true"
          >
            <div class="app no-mouse-gradient">
              <div class="title-bar">
                <div class="title-bar-drag u-drag-region">
                  <span class="title-bar-title">7FA4 Chat</span>
                </div>
                <div class="title-bar-controls u-no-drag">
                  <button type="button" class="title-btn title-minimize" tabindex="-1">
                    <i class="fas fa-minus" aria-hidden="true"></i>
                  </button>
                  <button type="button" class="title-btn title-maximize" tabindex="-1">
                    <i class="fas fa-square" aria-hidden="true"></i>
                  </button>
                  <button type="button" class="title-btn title-close" tabindex="-1">
                    <i class="fas fa-times" aria-hidden="true"></i>
                  </button>
                </div>
              </div>

              <div class="app-body">
                <NavBar
                  :pageType="card.navType"
                  :users="mockNavUsers"
                  :groups="mockNavGroups"
                  :loggedIn="true"
                  :self="mockSelf"
                />

                <!-- 页面参考 1：真实聊天主界面 -->
                <div v-if="card.scene === 'chat'" class="page-stage">
                  <div class="list-section" style="width: 248px">
                    <div class="list-header">
                      <h2 class="page-title"><i class="fas fa-comment-dots"></i> 消息</h2>
                      <div class="list-header-actions">
                        <UiIconButton class="inputModal-btn" icon="fas fa-check-double" size="sm" aria-label="全部已读" />
                        <UiIconButton class="inputModal-btn" icon="fas fa-plus" size="sm" aria-label="新建会话" />
                      </div>
                    </div>
                    <div class="list-search">
                      <UiSearchInput model-value="" placeholder="搜索联系人或群聊..." size="sm" />
                    </div>
                    <div class="list-scroll">
                      <div class="list-inner">
                        <div
                          v-for="conv in mockConversations"
                          :key="conv.key"
                          class="conversation-item"
                          :class="{ active: conv.active, unread: conv.unread > 0 }"
                        >
                          <UiAvatar
                            class="conv-avatar"
                            shape="rounded"
                            :size="40"
                            :color="conv.avatarBg"
                            :name="conv.name"
                          />
                          <div class="conv-info">
                            <div class="conv-name" :style="conv.nameColor ? { color: conv.nameColor } : undefined">
                              {{ conv.name }}
                            </div>
                            <div class="conv-last">
                              <span v-if="conv.draft" class="conv-draft-tag">[草稿]</span>
                              <span v-if="conv.mentioned" class="conv-mention">[有人@你]</span>
                              {{ conv.preview }}
                            </div>
                          </div>
                          <div class="conv-meta">
                            <span class="conv-time u-tabular-nums">{{ conv.time }}</span>
                            <div v-if="conv.muted || conv.unread > 0" class="conv-meta-badges">
                              <i v-if="conv.muted" class="fas fa-bell-slash conv-muted-icon" aria-hidden="true"></i>
                              <UiBadge
                                v-if="conv.unread > 0"
                                class="conv-unread-badge"
                                size="sm"
                                :count="conv.unread"
                                :variant="conv.muted ? 'neutral' : undefined"
                                :color="conv.muted ? '' : 'var(--brand-fill)'"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="list-resize-bar"></div>

                  <div class="chat-main">
                    <ChatHeader pageType="group" :pageId="1001" :targetGroup="mockTargetGroup" />

                    <div class="message-list-shell">
                      <div class="message-area">
                        <MessageDateDivider label="今天" />
                        <MessageBubble
                          v-for="m in chatMessages"
                          :key="m.msg.id"
                          :msg="m.msg"
                          pageType="group"
                          :isSelf="m.isSelf"
                          :avatarInitial="m.avatarInitial"
                          :avatarBg="m.avatarBg"
                          :senderName="m.senderName"
                          :gradeColor="m.gradeColor"
                          :gradeLabel="m.gradeLabel"
                          :timeText="m.timeText"
                          :pollVoterName="noopVoterName"
                          :renderedHtml="m.renderedHtml"
                        />
                      </div>
                    </div>

                    <div class="input-footer">
                      <div class="composer-card">
                        <div class="input-split preview-collapsed">
                          <div class="input-split-left">
                            <div class="textarea-wrap">
                              <textarea
                                class="input-editor"
                                rows="1"
                                readonly
                                placeholder="输入消息... (Enter 发送，Ctrl+Enter 换行)"
                              ></textarea>
                            </div>
                          </div>
                        </div>
                        <div class="counter-line">
                          <div class="input-actions">
                            <UiSegmented class="fmt-toggle" model-value="md" size="sm" :items="fmtItems" />
                            <span class="composer-actions-sep" aria-hidden="true"></span>
                            <UiIconButton class="preview-btn" icon="fas fa-eye" size="sm" variant="ghost" />
                            <UiIconButton class="emoji-btn" icon="fas fa-smile" size="sm" variant="ghost" />
                            <UiIconButton class="camera-btn" icon="fas fa-camera" size="sm" variant="ghost" />
                            <UiIconButton class="more-btn" icon="fas fa-ellipsis-h" size="sm" variant="ghost" />
                          </div>
                          <div class="composer-right">
                            <span class="token-info">剩余 8 / 10 token</span>
                            <UiButton class="send-btn" variant="primary" size="sm" pill icon="fas fa-paper-plane">
                              发送
                            </UiButton>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 页面参考 2：真实关于页面 -->
                <div v-else class="page-stage">
                  <AboutPanel version="4.0.0" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  UiAvatar,
  UiBadge,
  UiButton,
  UiIconButton,
  UiSearchInput,
  UiSegmented,
} from '@/ui'
import { parseContent } from '@/utils.js'
import NavBar from '@/components/common/NavBar.vue'
import AboutPanel from '@/components/panels/AboutPanel.vue'
import ChatHeader from '@/components/chat/ChatHeader.vue'
import MessageBubble from '@/components/chat/MessageBubble.vue'
import MessageDateDivider from '@/components/chat/MessageDateDivider.vue'

const DESIGN_WIDTH = 960
const DESIGN_HEIGHT = 600

const props = defineProps({
  customVars: { type: Object, required: true },
  isDark: { type: Boolean, default: false },
  dirty: { type: Boolean, default: false },
})

const stageHostRef = ref(null)
const hostWidth = ref(520)
let ro = null

const scale = computed(() => Math.min(1, Math.max(0.28, (hostWidth.value - 2) / DESIGN_WIDTH)))
const scaledHeight = computed(() => Math.max(170, Math.round(DESIGN_HEIGHT * scale.value)))

onMounted(() => {
  if (!stageHostRef.value) return
  const update = () => {
    if (stageHostRef.value) hostWidth.value = stageHostRef.value.clientWidth || 520
  }
  update()
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(update)
    ro.observe(stageHostRef.value)
  }
})

onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
})

const previewCards = [
  {
    id: 'chat',
    title: '页面参考 1 · 聊天主界面',
    icon: 'fas fa-comments',
    scene: 'chat',
    navType: 'chat',
  },
  {
    id: 'about',
    title: '页面参考 2 · 关于',
    icon: 'fas fa-circle-info',
    scene: 'about',
    navType: 'about',
  },
]

const fmtItems = [
  { value: 'txt', label: '文本' },
  { value: 'md', label: 'MD' },
]

const mockSelf = { uid: 9001, username: 'demo', realname: '我', nickname: '我' }
const mockNavUsers = { 2002: { unread: 3 } }
const mockNavGroups = { 1001: { unread: 0 } }
const mockTargetGroup = { id: 1001, name: '算法竞赛交流群', exited: false, blocked: false, mentioned: true }

const mockConversations = [
  {
    key: 'group:1001',
    name: '算法竞赛交流群',
    avatarBg: 'var(--avatar-tint-1)',
    preview: '林知夏: 记得判边界',
    mentioned: true,
    unread: 0,
    time: '14:22',
    active: true,
  },
  {
    key: 'user:2002',
    name: '林知夏',
    nameColor: '#3FA45B',
    avatarBg: 'var(--avatar-tint-2)',
    preview: '晚上一起打一场模拟赛吗？',
    unread: 3,
    time: '13:50',
  },
  {
    key: 'group:1002',
    name: '题解分享通知群',
    avatarBg: 'var(--avatar-tint-4)',
    preview: '新题目 T3 题解已更新',
    unread: 12,
    muted: true,
    time: '11:08',
  },
  {
    key: 'user:2003',
    name: '陈墨',
    nameColor: '#4B7AE8',
    avatarBg: 'var(--avatar-tint-3)',
    draft: true,
    preview: '复杂度证明写好了…',
    unread: 0,
    time: '昨天',
  },
]

const chatMessages = [
  {
    msg: { id: 1, sender: 2002, send_time: 1794666060 },
    isSelf: false,
    avatarInitial: '夏',
    avatarBg: 'var(--avatar-tint-2)',
    senderName: '林知夏',
    gradeColor: '#3FA45B',
    gradeLabel: '高一',
    timeText: '14:21',
    renderedHtml: parseContent('`solve()` 记得判空数组边界，详细看 [题解 A](https://jx.7fa4.cn) @我', 2002),
  },
  {
    msg: { id: 2, sender: 9001, send_time: 1794666120 },
    isSelf: true,
    avatarInitial: '我',
    avatarBg: 'var(--avatar-tint-6)',
    senderName: '我',
    gradeColor: '',
    gradeLabel: '',
    timeText: '14:22',
    renderedHtml: parseContent('> solve() 记得判空数组边界\n\n收到，已经加上 `if (n == 0) return;` 了！', 9001),
  },
]

function noopVoterName() {
  return ''
}

// 在缩略舞台根节点重绑语义令牌，确保局部预览实时响应自定义 CSS 变量变更而不污染全局 :root。
const stageStyle = computed(() => {
  const vars = {}
  for (const [k, v] of Object.entries(props.customVars)) {
    if (v) vars[k] = v
  }
  const onStatus = props.isDark ? '#FFFFFF' : '#000000'
  return {
    ...vars,
    '--surface-0': 'var(--bg-app, #FFFFFF)',
    '--surface-1': 'var(--bg-sidebar, #F5F6F8)',
    '--surface-2': 'var(--bg-input, #F3F4F6)',
    '--surface-3': 'var(--border-row, #E8EAEE)',
    '--surface-raised': 'var(--bg-group-detail, var(--bg-app, #FFFFFF))',
    '--surface-card': 'var(--bg-settings-info, var(--bg-app, #FFFFFF))',
    '--surface-hover': 'var(--bg-conversation-hover, #F0F2F5)',
    '--surface-active': 'var(--bg-conversation-active, #E5E8EC)',
    '--surface-press': 'var(--bg-conversation-press, #D8DBE0)',
    '--surface-field-focus': 'var(--bg-input-focus, #ECEEF1)',
    '--surface-scrim': 'var(--bg-modal-overlay, rgba(0, 0, 0, 0.45))',
    '--surface-table-head': 'var(--bg-table-header, #F8F9FA)',
    '--surface-code': 'var(--bg-code-block, rgba(0, 0, 0, 0.05))',
    '--surface-code-inline': 'var(--bg-code-inline, rgba(0, 0, 0, 0.06))',
    '--fg': 'var(--text-primary, #1A1A2E)',
    '--fg-muted': 'var(--text-secondary, #7C7E8A)',
    '--fg-subtle': 'var(--text-secondary, #7C7E8A)',
    '--fg-placeholder': 'var(--text-placeholder, #888888)',
    '--fg-link': 'var(--text-link, #4A7AB5)',
    '--fg-sidebar': 'var(--text-sidebar, #5A5C66)',
    '--fg-danger': 'var(--text-error, #FA5151)',
    '--fg-blockquote': 'var(--text-blockquote, #666666)',
    '--fg-unread': 'var(--text-unread-badge, #FA5151)',
    '--brand': 'var(--text-link, var(--accent, #3C8CE7))',
    '--brand-fill': 'var(--accent, #3C8CE7)',
    '--brand-fill-hover': 'var(--accent-hover, #2E78D0)',
    '--brand-fill-active': 'var(--accent-active, #2566B8)',
    '--brand-soft': 'var(--accent-light, rgba(60, 140, 231, 0.14))',
    '--brand-line': 'var(--accent-outline, rgba(60, 140, 231, 0.34))',
    '--on-brand': 'var(--text-on-accent, #FFFFFF)',
    '--line': 'var(--border-light, #E2E4E8)',
    '--line-subtle': 'var(--border-row, #ECEEF1)',
    '--line-hairline': 'var(--border-row, #ECEEF1)',
    '--line-strong': 'var(--border-table, #E2E4E8)',
    '--grad-start': 'var(--bg-app, #FFFFFF)',
    '--grad-end': 'var(--bg-gradient-end, #EEF2F7)',
    '--gradient-app': 'linear-gradient(180deg, var(--grad-start), var(--grad-end))',
    '--gradient-panel': 'linear-gradient(160deg, var(--grad-start), var(--grad-end))',
    '--elev-1': 'var(--shadow-card, 0 1px 2px rgba(15, 23, 42, 0.04))',
    '--elev-2': 'var(--shadow-card-hover, 0 4px 16px rgba(15, 23, 42, 0.08))',
    '--elev-3': 'var(--shadow-modal, 0 12px 32px rgba(15, 23, 42, 0.14))',
    '--on-danger': onStatus,
    '--on-success': onStatus,
    '--on-warning': onStatus,
    '--on-notice': onStatus,
  }
})
</script>

<style scoped src="../../../css/components/chat-view.css"></style>
<style scoped src="../../../css/components/window-title-bar.css"></style>
<style scoped>
.tpv-root {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.tpv-meta-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.tpv-meta-title {
  color: var(--fg-muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
}

.tpv-badges {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tpv-pill {
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--fg-muted);
  font-size: 11px;
}

.tpv-pill.is-dirty {
  background: var(--status-warning-soft);
  color: var(--status-warning-ink);
}

.tpv-pill.is-synced {
  background: var(--status-success-soft);
  color: var(--status-success-ink);
}

.tpv-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.tpv-card {
  overflow: hidden;
  background: var(--surface-0);
  border: var(--border-width) solid var(--line-hairline);
  border-radius: var(--radius-xl);
}

.tpv-card-bar {
  display: flex;
  align-items: center;
  padding: 6px var(--space-3);
  background: var(--surface-1);
  border-bottom: var(--border-width) solid var(--line-subtle);
}

.tpv-card-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--fg-muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
}

.tpv-card-label i {
  color: var(--brand);
}

.tpv-viewport {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: var(--surface-2);
}

.tpv-scale-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 960px;
  height: 600px;
  transform-origin: top left;
}

/* 预览容器内完全禁用指针与选区交互，仅保留真实 HTML/CSS 视觉参考 */
.tpv-frozen,
.tpv-frozen * {
  pointer-events: none !important;
  user-select: none !important;
}
</style>
