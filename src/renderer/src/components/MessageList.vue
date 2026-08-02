<template>
  <div class="multi-select-bar" v-if="store.multiSelectMode">
    <span class="msb-info">已选 {{ store.selectedMsgIds.length }} 条</span>
    <div class="msb-actions">
      <button class="msb-btn" @click="$emit('batchForward')" :disabled="!store.selectedMsgIds.length"><i class="fas fa-share"></i> 批量转发</button>
      <button class="msb-btn" @click="$emit('batchFavorite')" :disabled="!store.selectedMsgIds.length"><i class="fas fa-bookmark"></i> 批量收藏</button>
      <button class="msb-btn" @click="$emit('batchDelete')" :disabled="!store.selectedMsgIds.length"><i class="fas fa-trash"></i> 批量删除</button>
      <button class="msb-btn" @click="exitMultiSelect"><i class="fas fa-times"></i> 退出多选</button>
    </div>
  </div>
  <div class="message-area" ref="messageAreaEl" @scroll="onScroll" @click="onMessageAreaClick">
    <div class="load-more-hint-row" v-if="hasOlderMessages && !loadingMore">
      <span class="load-more-hint-text"><i class="fas fa-chevron-up"></i> 向上滚动加载更多</span>
    </div>
    <div class="load-more-spinner" v-if="loadingMore"><i class="fas fa-spinner"></i> 加载中...</div>
    <template v-if="!visibleMessages.length && !hasOlderMessages">
      <div class="msg-skeleton"><div class="skeleton-avatar"></div><div class="skeleton-bubble"></div></div>
      <div class="msg-skeleton right"><div class="skeleton-avatar"></div><div class="skeleton-bubble"></div></div>
      <div class="msg-skeleton"><div class="skeleton-avatar"></div><div class="skeleton-bubble"></div></div>
    </template>
    <template v-for="item in messagesWithSeparators" :key="item.type === 'separator' ? 'sep_' + item.timestamp : item.data.id">
      <div v-if="item.type === 'separator'" class="msg-date-separator">{{ item.label }}</div>
      <div
        v-else
        class="msg-row"
        :class="[item.data.sender == selfUid ? 'right' : 'left', { 'multi-select-active': store.multiSelectMode }]"
        :data-msg-id="item.data.id"
      >
        <div class="msg-checkbox" v-if="store.multiSelectMode && !isPatMsg(item.data)" :class="{ checked: store.selectedMsgIds.includes(item.data.id) }" @click.stop="toggleMsgSelect(item.data.id)">
          <i v-if="store.selectedMsgIds.includes(item.data.id)" class="fas fa-check"></i>
        </div>
        <template v-if="item.data.sender != selfUid">
          <div class="msg-avatar"
            @dblclick="$emit('sendPat', item.data.sender)"
            @contextmenu.prevent="pageType=='group'&&$emit('openGroupActionMenu', $event, item.data.sender)">
            <div class="avatar-placeholder-sm">{{ getAvatarInitial(item.data.sender) }}</div>
          </div>
          <div class="bubble-wrap">
            <div class="bubble-header">
              <span class="name"
              :style="{ color: getGradeColor(item.data.sender) }"
              :title="getGradeLabel(item.data.sender)"
              @dblclick="$emit('sendPat', item.data.sender)"
              @contextmenu.prevent="pageType=='group'&&$emit('openGroupActionMenu', $event, item.data.sender)">{{ displayName(msgSenderUser(item.data)) }}</span>
              <span class="time">{{ gettime2(item.data.send_time) }}</span>
            </div>
            <div class="bubble" :class="{ collapsed: collapsedMsgs[item.data.id] }"
              @contextmenu.prevent="onMsgMenu($event, item.data)"><div class="bubble-content" v-html="renderContent(item.data.content, item.data.sender)"></div></div>
            <div class="expand-btn" v-if="collapsedMsgs[item.data.id]" @click="openMsgPreview(item.data)">查看更多</div>
          </div>
        </template>
        <template v-else>
          <div class="msg-avatar">
            <div class="avatar-placeholder-sm">{{ getAvatarInitial(selfUid) }}</div>
          </div>
          <div class="bubble-wrap bubble-wrap-self">
            <div class="bubble-header">
              <span v-if="item.data.status === 'failed'" class="msg-status-icon failed" @click.stop="$emit('resend', item.data.id)" title="发送失败，点击重发"><i class="fas fa-exclamation-circle"></i></span>
              <span v-else-if="item.data.status === 'pending'" class="msg-status-icon" title="发送中"><i class="fas fa-clock"></i></span>
              <span class="time">{{ gettime2(item.data.send_time) }}</span>
            </div>
            <div class="bubble" :class="{ collapsed: collapsedMsgs[item.data.id] }"
              @contextmenu.prevent="onMsgMenu($event, item.data)"><div class="bubble-content" v-html="renderContent(item.data.content, item.data.sender)"></div></div>
            <div class="expand-btn" v-if="collapsedMsgs[item.data.id]" @click="openMsgPreview(item.data)">查看更多</div>
          </div>
        </template>
      </div>
    </template>
    <button class="scroll-to-bottom-btn" v-if="!isAtBottom" @click="scrollToBottom" title="滚动到底部"><i class="fas fa-chevron-down"></i></button>
  </div>
  <MsgMenu
    v-if="msgCtx.show"
    :x="msgCtx.x"
    :y="msgCtx.y"
    :canDownload="msgCtx.canDownload"
    :canCollect="msgCtx.canCollect"
    :canFavorite="msgCtx.canFavorite"
    :canDelete="msgCtx.canDelete"
    :canResend="msgCtx.canResend"
    :isOwn="msgCtx.isOwn"
    :isFailed="msgCtx.isFailed"
    @copy="copyMsg"
    @forward="startForward"
    @download="downloadMsg"
    @reply="$emit('startReply', store.messages[msgCtx.msgId]); msgCtx.show = false"
    @collect="collectMsg"
    @delete="deleteMsg"
    @favorite="favoriteMsg"
    @resend="resendMsg"
    @multiselect="enterMultiSelect"
  />
</template>

<script setup>
import { ref, reactive, computed, onUpdated, watch, nextTick } from 'vue';
import { store } from '../store.js';
import { gettime2, parseContent, parseMsgContent, displayName, getGradeColor, getGradeLabel, getAvatarInitial, formatDateSeparator, isSameDay } from '../utils.js';
import MsgMenu from './MsgMenu.vue';
import { useCurrentMessages } from '../composables/useCurrentMessages.js';
import '../css/message-list.css';


const props = defineProps({
  pageType: { type: String, required: true },
  pageId: { type: [Number, String], default: null },
  selfUid: { type: Number, default: null },
  collapsedMsgs: { type: Object, required: true },
  visibleCount: { type: Number, required: true }
});

const emit = defineEmits([
  'sendPat',
  'openGroupActionMenu',
  'scrollToTop',
  'startReply',
  'openUserInfo',
  'forward',
  'delete',
  'favorite',
  'resend',
  'batchForward',
  'batchDelete',
  'batchFavorite',
  'openPreview'
]);

const messageAreaEl = ref(null);
const loadingMore = ref(false);
const isAtBottom = ref(true);

const targetUser = computed(() => store.users?.[props.pageId] || null);
const targetGroup = computed(() => store.groups?.[props.pageId] || null);

const currentMessages = useCurrentMessages(() => props.pageType, () => props.pageId).currentMessages;

const hasOlderMessages = computed(() => currentMessages.value.length > props.visibleCount);

const visibleMessages = computed(() => {
  const all = currentMessages.value;
  if (all.length <= props.visibleCount) return all;
  return all.slice(all.length - props.visibleCount);
});

// 日期分组：在跨日消息间插入分隔线
const messagesWithSeparators = computed(() => {
  const all = visibleMessages.value;
  const result = [];
  let lastDate = null;
  for (const msg of all) {
    if (!isSameDay(msg.send_time, lastDate)) {
      result.push({ type: 'separator', timestamp: msg.send_time, label: formatDateSeparator(msg.send_time) });
      lastDate = msg.send_time;
    }
    result.push({ type: 'msg', data: msg });
  }
  return result;
});

function onScroll() {
  const el = messageAreaEl.value;
  if (!el) return;
  isAtBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  // 向上加载更多：滚动位置修正回顶部附近（scrollTop > 0）后立即隐藏加载指示，避免固定延时闪烁
  if (loadingMore.value && el.scrollTop > 0) {
    loadingMore.value = false;
  }
  if (el.scrollTop === 0 && hasOlderMessages.value && !loadingMore.value) {
    const height = el.scrollHeight;
    loadingMore.value = true;
    emit('scrollToTop', height);
  }
}

// 加载完成（visibleCount 增加）或没有更早消息时，兜底隐藏加载指示
watch(() => props.visibleCount, () => {
  loadingMore.value = false;
});
watch(hasOlderMessages, () => {
  if (!hasOlderMessages.value) loadingMore.value = false;
});

function renderContent(msg, senderId) {
  if (!msg) return '';
  return parseContent(msg, senderId);
}

function msgSenderUser(msg) {
  return store.users?.[msg.sender] || { uid: msg.sender };
}

// 代码块复制按钮注入
function injectCodeCopyButtons() {
  if (!messageAreaEl.value) return;
  const pres = messageAreaEl.value.querySelectorAll('pre:not(.code-copy-injected)');
  for (const pre of pres) {
    pre.classList.add('code-copy-injected');
    const wrap = document.createElement('div');
    wrap.className = 'code-block-wrap';
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);
    const btn = document.createElement('button');
    btn.className = 'code-copy-btn';
    btn.innerHTML = '<i class="fas fa-copy"></i> 复制';
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const code = pre.querySelector('code');
      const text = code ? code.textContent : pre.textContent;
      await window.api.clipboardWriteText(text);
      btn.innerHTML = '<i class="fas fa-check"></i> 已复制';
      setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> 复制'; }, 1500);
    });
    wrap.appendChild(btn);
  }
}

onUpdated(() => {
  if (!messageAreaEl.value) return;
  const rows = messageAreaEl.value.querySelectorAll('.msg-row');
  for (const row of rows) {
    const id = Number(row.dataset.msgId);
    if (!id || props.collapsedMsgs[id]) continue;
    const bubble = row.querySelector('.bubble');
    if (bubble && bubble.scrollHeight > 320) {
      props.collapsedMsgs[id] = true;
    }
  }
  injectCodeCopyButtons();
});

let lastMsgCount = 0;
let lastPageId = null;
let scrollTimer = null;
let scrollAnim = null;

function smoothScrollTo(el, targetTop, duration = 600) {
  if (scrollAnim) cancelAnimationFrame(scrollAnim);
  const startTop = el.scrollTop;
  const distance = targetTop - startTop;
  if (distance <= 0) return;
  const startTime = performance.now();
  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // easeOutCubic
    const ease = 1 - Math.pow(1 - progress, 3);
    el.scrollTop = startTop + distance * ease;
    if (progress < 1) {
      scrollAnim = requestAnimationFrame(step);
    } else {
      scrollAnim = null;
    }
  }
  scrollAnim = requestAnimationFrame(step);
}

function doScrollToBottom(pageChanged) {
  if (scrollTimer) clearTimeout(scrollTimer);
  if (scrollAnim) cancelAnimationFrame(scrollAnim);
  const tryScroll = (attempt) => {
    nextTick(() => {
      if (messageAreaEl.value) {
        const el = messageAreaEl.value;
        if (pageChanged) {
          // 切换会话：直接定位到底部，不播放"从上往下"的滚动动画
          el.scrollTop = el.scrollHeight;
          return;
        }
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
        if (!atBottom || attempt === 0) {
          smoothScrollTo(el, el.scrollHeight, 600);
        }
        if (attempt < 3 && !atBottom) {
          scrollTimer = setTimeout(() => tryScroll(attempt + 1), 80);
        }
      }
    });
  };
  scrollTimer = setTimeout(() => tryScroll(0), pageChanged ? 30 : 10);
}

watch(currentMessages, (msgs) => {
  const pageChanged = props.pageId !== lastPageId;
  lastPageId = props.pageId;
  if (pageChanged || msgs.length > lastMsgCount) {
    doScrollToBottom(pageChanged);
  }
  lastMsgCount = msgs.length;
});

watch(() => props.pageId, () => {
  doScrollToBottom(true);
});

function scrollToBottom() {
  nextTick(() => {
    if (messageAreaEl.value) {
      smoothScrollTo(messageAreaEl.value, messageAreaEl.value.scrollHeight, 600);
    }
  });
}

function scrollToBottomInstant() {
  nextTick(() => {
    if (messageAreaEl.value) {
      messageAreaEl.value.scrollTop = messageAreaEl.value.scrollHeight;
    }
  });
}

function jumpToMessage(msgId) {
  const item = props.pageType === 'user' ? targetUser.value : targetGroup.value;
  if (!item) return;
  const idx = currentMessages.value.findIndex(m => m.id === msgId);
  if (idx >= 0 && idx < currentMessages.value.length - props.visibleCount) {
    emit('scrollToTop', 0, true);
  }
  nextTick(() => {
    const el = messageAreaEl.value?.querySelector(`[data-msg-id="${msgId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('msg-highlight');
      setTimeout(() => el.classList.remove('msg-highlight'), 1500);
    }
  });
}

// --- 多选模式 ---
function enterMultiSelect() {
  msgCtx.show = false;
  store.multiSelectMode = true;
  store.selectedMsgIds = [];
}

function exitMultiSelect() {
  store.multiSelectMode = false;
  store.selectedMsgIds = [];
}

function toggleMsgSelect(msgId) {
  const idx = store.selectedMsgIds.indexOf(msgId);
  if (idx >= 0) store.selectedMsgIds.splice(idx, 1);
  else store.selectedMsgIds.push(msgId);
}

function isPatMsg(msg) {
  const obj = parseMsgContent(msg.content);
  return obj && obj.type === 'pat';
}

// --- 消息右键菜单 ---
const msgCtx = reactive({ show: false, x: 0, y: 0, msgId: null, msgContent: '', canDownload: false, canCollect: false, canFavorite: false, canDelete: false, canResend: false, isOwn: false, isFailed: false });

function onMsgMenu(e, msg) {
  e.preventDefault();
  const obj = parseMsgContent(msg.content);
  if (obj && obj.type === 'pat') return;
  const isFile = obj && obj.type === 'file';
  const isSticker = obj && obj.type === 'sticker';
  const isImage = isFile && /^image\//.test(obj.mime || '');
  const isOwn = msg.sender == props.selfUid;
  const isFailed = msg.status === 'failed';
  msgCtx.show = false;
  msgCtx.x = e.clientX;
  msgCtx.y = e.clientY;
  msgCtx.msgId = msg.id;
  msgCtx.msgContent = msg.content;
  msgCtx.canDownload = isFile || isSticker;
  msgCtx.canCollect = isSticker || isImage;
  msgCtx.canFavorite = !!(obj && obj.type !== 'pat');
  msgCtx.canDelete = true;
  msgCtx.canResend = isOwn && isFailed;
  msgCtx.isOwn = isOwn;
  msgCtx.isFailed = isFailed;
  setTimeout(() => msgCtx.show = true, 1);
}

async function copyMsg() {
  const content = msgCtx.msgContent;
  const obj = parseMsgContent(content);
  msgCtx.show = false;
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

function downloadMsg() {
  const obj = parseMsgContent(msgCtx.msgContent);
  if (obj && (obj.type === 'file' || obj.type === 'sticker') && obj.data) {
    window.api.downloadFile(obj.data, obj.name || 'download', obj.mime);
  }
  msgCtx.show = false;
}

async function collectMsg() {
  const obj = parseMsgContent(msgCtx.msgContent);
  if (obj && obj.data && obj.mime) {
    const isSticker = obj.type === 'sticker';
    const isImage = obj.type === 'file' && /^image\//.test(obj.mime);
    if ((isSticker || isImage) && obj.data) {
      if (!store.stickers.some(s => s.name === obj.name)) {
        store.stickers.push({ name: obj.name || '表情', data: obj.data, mime: obj.mime });
      }
    }
  }
  msgCtx.show = false;
}

function startForward() {
  emit('forward', msgCtx.msgContent);
  msgCtx.show = false;
}

// --- 删除/收藏/重发 ---
function deleteMsg() {
  const msgId = msgCtx.msgId;
  msgCtx.show = false;
  emit('delete', msgId);
}

function favoriteMsg() {
  const msgId = msgCtx.msgId;
  const msg = store.messages[msgId];
  msgCtx.show = false;
  if (!msg) return;
  if (!store.favorites.some(f => f.id === msgId)) {
    store.favorites.push({
      id: msgId,
      content: msg.content,
      sender: msg.sender,
      send_time: msg.send_time,
      fromType: props.pageType,
      fromId: props.pageId,
      savedAt: Date.now()
    });
  }
}

function resendMsg() {
  const msgId = msgCtx.msgId;
  msgCtx.show = false;
  emit('resend', msgId);
}

// --- 预览 ---
function openMsgPreview(msg) {
  emit('openPreview', {
    type: 'html',
    title: '消息详情',
    src: '',
    text: parseContent(msg.content)
  });
}

function openPreview(obj) {
  if (obj.type === 'image') {
    const src = obj.data && obj.mime ? `data:${obj.mime};base64,${obj.data}` : (obj.src || '');
    emit('openPreview', {
      type: 'image',
      title: obj.name || '图片预览',
      src: src,
      text: ''
    });
  } else if (obj.type === 'file' && obj.data) {
    const isImage = /^image\//.test(obj.mime || '');
    if (isImage) {
      emit('openPreview', {
        type: 'image',
        title: obj.name || '图片预览',
        src: `data:${obj.mime};base64,${obj.data}`,
        text: ''
      });
    } else if (/\.(txt|md|json|js|ts|css|html|xml|csv|log|py|java|c|cpp|h|sh|bat|yaml|yml|ini|cfg|conf|toml)$/i.test(obj.name || '')) {
      try {
        const decoded = atob(obj.data);
        emit('openPreview', {
          type: 'text',
          title: obj.name || '文本预览',
          src: '',
          text: decoded
        });
      } catch {
        emit('openPreview', { type: 'error', title: '', src: '', text: '' });
      }
    } else {
      window.api.downloadFile(obj.data, obj.name || 'download', obj.mime);
      return;
    }
  } else {
    emit('openPreview', { type: 'error', title: '', src: '', text: '' });
  }
}

// --- 消息区域点击事件 ---
function onMessageAreaClick(e) {
  if (store.multiSelectMode) {
    const row = e.target.closest('.msg-row');
    if (row) {
      const msgId = Number(row.dataset.msgId);
      const msg = store.messages[msgId];
      if (msgId && msg && !isPatMsg(msg)) toggleMsgSelect(msgId);
    }
    return;
  }
  const a = e.target.closest('a[href]');
  if (a) {
    e.preventDefault();
    e.stopPropagation();
    window.api.openExternal(a.href);
    return;
  }
  const mentionEl = e.target.closest('.mention-tag');
  if (mentionEl) {
    const uid = mentionEl.dataset.uid;
    if (uid === 'all') return;
    if (uid) emit('openUserInfo', Number(uid));
    return;
  }
  const replyEl = e.target.closest('.reply-quote');
  if (replyEl) {
    const msgId = Number(replyEl.dataset.replyId);
    if (msgId) jumpToMessage(msgId);
    return;
  }
  const fileEl = e.target.closest('.file-msg');
  if (fileEl) {
    e.preventDefault();
    e.stopPropagation();
    const base64Data = fileEl.dataset.base64;
    const name = fileEl.dataset.name;
    const mime = fileEl.dataset.mime;
    openPreview({ type: 'file', data: base64Data, name, mime });
    return;
  }
  const imgEl = e.target.closest('.chat-image');
  if (imgEl) {
    e.preventDefault();
    e.stopPropagation();
    const src = imgEl.src;
    const base64Data = imgEl.dataset.base64;
    const mime = imgEl.dataset.mime;
    openPreview({ type: 'image', src, name: '图片', data: base64Data, mime });
    return;
  }
}

defineExpose({ messageAreaEl, scrollToBottom, scrollToBottomInstant, jumpToMessage, msgCtx, exitMultiSelect });
</script>
