<template>
  <div class="input-footer" :class="{ sending: sending, disabled: inputDisabled, 'drag-over': inputDragOver }" v-if="pageType === 'group' || (pageType === 'user' && targetUser)"
    @dragover.prevent="onInputDragOver"
    @dragleave="onInputDragLeave"
    @drop.prevent="onInputDrop">
    <div class="reply-bar" v-if="replyTo">
      <i class="fas fa-quote-left reply-bar-icon"></i>
      <span class="reply-bar-text">{{ replyTo.content }}</span>
      <button class="reply-bar-close" @click="replyTo = null"><i class="fas fa-times"></i></button>
    </div>
    <div class="pending-files-bar" v-if="pendingFiles.length">
      <div class="pending-file-item" v-for="(pf, idx) in pendingFiles" :key="idx" @click="previewPendingFile(pf)">
        <div class="pending-file-thumb" v-if="pf.isImage">
          <img :src="pf.thumbUrl" />
        </div>
        <div class="pending-file-icon" v-else>
          <i class="fas fa-file"></i>
        </div>
        <div class="pending-file-info">
          <span class="pending-file-name">{{ pf.name }}</span>
          <span class="pending-file-size">{{ formatFileSize(pf.size) }}</span>
        </div>
        <button class="pending-file-remove" @click.stop="removePendingFile(idx)"><i class="fas fa-times"></i></button>
      </div>
    </div>
    <div class="input-row">
      <div class="input-split">
        <div class="input-split-left" :style="splitLeftWidth ? { width: splitLeftWidth + 'px', flex: 'none' } : {}">
          <div class="textarea-wrap">
            <div class="input-editor" ref="inputEl" :contenteditable="sending || inputDisabled ? 'false' : 'true'" :data-placeholder="sendPlaceholder" @keydown="onInputKeydown" @input="onInputChange" @paste="onPaste" @compositionend="onCompositionEnd" @scroll="syncPreviewFromInput"></div>
            <div class="mention-popup" v-if="mentionVisible" :style="mentionPopupStyle">
              <div class="mention-item mention-all-item" :class="{ active: mentionIndex === 0 }" @click="applyMentionAll" v-if="pageType === 'group'">
                <i class="fas fa-users"></i> 所有人
              </div>
              <div class="mention-item" v-for="(m, idx) in mentionCandidates" :key="m.uid" :class="{ active: (idx + (pageType === 'group' ? 1 : 0)) === mentionIndex }" @click="applyMention(m)">
                <i class="fas fa-user"></i> {{ displayName(m) }}
              </div>
            </div>
          </div>
        </div>
        <div class="input-split-divider" @mousedown="onSplitDragStart"></div>
        <div class="input-split-right">
          <div class="input-preview-label">预览</div>
          <div class="input-preview-content" ref="inputPreviewRef" v-if="inputText.trim()" v-html="renderMdPreview()" @scroll="syncInputFromPreview"></div>
          <div class="input-preview-empty" v-else>输入内容后在此预览</div>
        </div>
      </div>
      <button id="send" @click="sendMessage" :disabled="sending || inputDisabled">发送</button>
    </div>
    <div class="counter-line">
      <div class="input-actions">
        <button id="emoji_btn" @click.stop="toggleEmoji" :disabled="sending || inputDisabled"><i class="fas fa-smile"></i></button>
        <button id="file_btn" @click="sendFileMessage" :disabled="sending || inputDisabled"><i class="fas fa-paperclip"></i></button>
        <button class="favorites-btn" title="从收藏中选择发送" @click="favoritesVisible = !favoritesVisible"><i class="fas fa-star"></i></button>
      </div>
      <span class="error" v-if="errorMessage">{{ errorMessage }}</span>
      <span class="token-info" :class="{ 'token-info-warn': tokenInfo && tokenInfo.remain <= 2 }" v-if="tokenInfo">
        剩余 {{ tokenInfo.remain }} / {{ tokenInfo.total }} token
        <span class="token-tip-icon" title="token 恢复倒计时" @mouseenter="onTokenHover(true)" @mouseleave="onTokenHover(false)">
          <i class="fas fa-question-circle"></i>
        </span>
        <span class="token-tooltip" v-if="tokenTipVisible">
          <template v-if="tokenRecovery.length">
            <div v-for="(r, i) in tokenRecovery" :key="i" class="token-tooltip-row">
              <span class="token-tooltip-time">{{ fmtLeft(r.left) }}</span>
              <span>{{ i === 0 ? '+1 token' : '再 +1 token' }}</span>
            </div>
          </template>
          <div v-else class="token-tooltip-row">全部 token 可用</div>
        </span>
      </span>
      <div class="favorites-picker" v-if="favoritesVisible">
        <div class="favorites-picker-title">选择收藏消息发送</div>
        <div class="favorites-picker-list">
          <div v-if="!store.favorites.length" class="favorites-picker-empty">暂无收藏</div>
          <div v-for="(fav, idx) in store.favorites" :key="idx" class="favorites-picker-item" @click="sendFavorite(fav)">
            {{ previewFavorite(fav) }}
          </div>
        </div>
      </div>
    </div>
    <EmojiPicker
      v-if="emojiVisible"
      :visible="emojiVisible"
      :stickers="store.stickers"
      @select="onEmojiSelect"
      @selectSticker="onStickerSelect"
      @addSticker="addSticker"
      @removeSticker="removeSticker"
    />
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch, onUnmounted } from 'vue';
import { store } from '../store.js';
import { displayName, parseMsgContent, renderMarkdown, renderMarkdownPreview, applyChatToStore, sendChatMessage, getConvoKey, formatSize, compressImage, compressBase64Image, extractMentions, isSingleEmoji } from '../utils.js';
import EmojiPicker from './EmojiPicker.vue';
import { QUANCODE, qqfaceUrl } from '../qqface-data.js';
import '../css/input-footer.css';

const props = defineProps({
  pageType: { type: String, required: true },
  pageId: { type: [Number, String], default: null },
  targetUser: { type: Object, default: null },
  targetGroup: { type: Object, default: null },
  inputDisabled: { type: Boolean, default: false }
});

const emit = defineEmits(['openPreview']);

const inputText = ref('');
const inputEl = ref(null);

// ===== QQ 表情：contenteditable 富文本编辑支持 =====
// 序列化：DOM 节点 → 发送文本（img.qqface 还原为 /code）
function serializeEditorFromFragment(frag) {
  let out = '';
  const walk = (node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) out += child.textContent.replace(/\u200B/g, '');
      else if (child.nodeName === 'BR') out += '\n';
      else if (child.nodeName === 'IMG' && child.classList.contains('qqface')) out += child.dataset.code || '';
      else if (child.nodeName === 'DIV' || child.nodeName === 'P') walk(child);
      else walk(child);
    });
  };
  walk(frag);
  return out;
}

function serializeEditor() {
  const el = inputEl.value;
  if (!el) return '';
  return serializeEditorFromFragment(el);
}

// 计算光标在序列化文本中的字符偏移
function getCaretSerializedOffset() {
  const el = inputEl.value;
  if (!el) return 0;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return serializeEditor().length;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.endContainer)) return serializeEditor().length;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.endContainer, range.endOffset);
  return serializeEditorFromFragment(pre.cloneContents()).length;
}

// 把光标设到序列化文本的第 offset 字符处
function setCaretBySerializedOffset(offset) {
  const el = inputEl.value;
  if (!el) return;
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let acc = 0;
  let placed = false;
  const walk = (node) => {
    if (placed) return;
    for (const child of node.childNodes) {
      if (placed) return;
      if (child.nodeType === Node.TEXT_NODE) {
        const len = child.textContent.replace(/\u200B/g, '').length;
        if (acc + len >= offset) { range.setStart(child, Math.min(offset - acc, child.textContent.length)); range.collapse(true); placed = true; return; }
        acc += len;
      } else if (child.nodeName === 'BR') {
        if (acc >= offset) { range.setStartBefore(child); range.collapse(true); placed = true; return; }
        acc += 1;
      } else if (child.nodeName === 'IMG' && child.classList.contains('qqface')) {
        const len = (child.dataset.code || '').length;
        if (acc + len >= offset) { range.setStartAfter(child); range.collapse(true); placed = true; return; }
        acc += len;
      } else if (child.nodeName === 'DIV' || child.nodeName === 'P') {
        walk(child);
        if (placed) return;
      } else {
        walk(child);
        if (placed) return;
      }
    }
  };
  walk(el);
  if (!placed) { range.selectNodeContents(el); range.collapse(false); }
  sel.removeAllRanges();
  sel.addRange(range);
}

function escHtmlForEditor(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 把序列化文本渲染为 DOM（#1：输入框不渲染表情，纯文本显示 /code，\n → br）
// 表情渲染仅发生在"发送后/预览"（见 utils.renderMarkdown / renderMarkdownPreview）
function renderSerializedToHtml(text) {
  let html = '';
  const re = /(\n)/g;
  let last = 0; let m;
  while ((m = re.exec(text))) {
    if (m.index > last) html += escHtmlForEditor(text.slice(last, m.index));
    html += '<br>';
    last = re.lastIndex;
  }
  if (last < text.length) html += escHtmlForEditor(text.slice(last));
  return html;
}

function renderEditor(text, caretOffset) {
  const el = inputEl.value;
  if (!el) return;
  el.innerHTML = renderSerializedToHtml(text);
  setCaretBySerializedOffset(caretOffset);
  autoResizeTextarea();
}

// 找序列化偏移对应的 DOM 位置（用于局部替换）
function domPosFromSerializedOffset(offset) {
  const el = inputEl.value;
  if (!el) return null;
  let acc = 0;
  let result = null;
  const walk = (node) => {
    if (result) return;
    for (const child of node.childNodes) {
      if (result) return;
      if (child.nodeType === Node.TEXT_NODE) {
        const len = child.textContent.replace(/\u200B/g, '').length;
        if (acc + len >= offset) { result = { node: child, offset: offset - acc }; return; }
        acc += len;
      } else if (child.nodeName === 'BR') {
        if (acc >= offset) { result = { node: child, offset: 0 }; return; }
        acc += 1;
      } else if (child.nodeName === 'IMG' && child.classList.contains('qqface')) {
        const len = (child.dataset.code || '').length;
        if (acc + len >= offset) { result = { node: child, offset: 0 }; return; }
        acc += len;
      } else if (child.nodeName === 'DIV' || child.nodeName === 'P') {
        walk(child);
        if (result) return;
      } else {
        walk(child);
        if (result) return;
      }
    }
  };
  walk(el);
  return result;
}

const sending = ref(false);
const errorMessage = ref('');
const tokenInfo = ref(null);
// ---- token 恢复（滑动窗口）：每条消息发送后 recoverySeconds 秒恢复该条 token ----
const TOKEN_SENDS_KEY = 'token_sends';
const tokenTipVisible = ref(false);
const tokenRecovery = ref([]); // 未恢复的发送记录：[{ time, left(秒) }] 按发送时间排序
let tokenTipTimer = null;

function loadTokenSends() {
  try { return JSON.parse(localStorage.getItem(TOKEN_SENDS_KEY) || '[]') } catch { return [] }
}

function recordTokenSend() {
  const arr = loadTokenSends();
  arr.push({ time: Date.now() });
  if (arr.length > 50) arr.splice(0, arr.length - 50);
  try { localStorage.setItem(TOKEN_SENDS_KEY, JSON.stringify(arr)) } catch {}
}

function refreshRecovery() {
  const sec = (tokenInfo.value && tokenInfo.value.recoverySeconds) || store.tokenLimit?.time_limit || 2400;
  const now = Date.now();
  const pending = loadTokenSends()
    .map(s => ({ time: s.time, left: Math.max(0, (s.time + sec * 1000 - now) / 1000) }))
    .filter(s => s.left > 0)
    .sort((a, b) => a.time - b.time);
  tokenRecovery.value = pending;
}

function onTokenHover(show) {
  tokenTipVisible.value = show;
  clearInterval(tokenTipTimer);
  if (show) {
    refreshRecovery();
    tokenTipTimer = setInterval(refreshRecovery, 1000);
  }
}

function fmtLeft(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
}

// token 数量变化：remain 减少 = 发送消耗 → 记录发送时间（滑动窗口恢复起点）；
// 同时用服务器 limit 校准 total 与恢复周期
watch(tokenInfo, (v, old) => {
  if (!v) return;
  if (store.tokenLimit?.count_limit) v.total = store.tokenLimit.count_limit;
  if (!v.recoverySeconds) v.recoverySeconds = store.tokenLimit?.time_limit || 2400;
  if (old && old.remain != null && v.remain < old.remain) recordTokenSend();
});

onUnmounted(() => {
  clearInterval(tokenTipTimer);
});
const replyTo = ref(null);
const emojiVisible = ref(false);
const mentionVisible = ref(false);
const mentionIndex = ref(0);
const mentionQuery = ref('');
const inputDragOver = ref(false);
const splitLeftWidth = ref(0); // 0 表示使用默认 flex 比例
const pendingFiles = ref([]); // 待发送文件列表 [{ name, size, data, mime, isImage, thumbUrl }]

const sendShortcut = computed(() => store.setting?.shortcuts?.sendMessage || 'enter');

const sendPlaceholder = computed(() => {
  const sc = sendShortcut.value.toLowerCase();
  if (sc === 'ctrl+enter') return '输入消息... (Ctrl+Enter发送)';
  if (sc === 'shift+enter') return '输入消息... (Shift+Enter发送)';
  return '输入消息... (Enter发送, Ctrl+Enter换行)';
});

// --- 草稿保存/恢复 ---
const convoKey = computed(() => getConvoKey(props.pageType, props.pageId));
let lastConvoKey = null;
watch(convoKey, (newKey) => {
  if (lastConvoKey) {
    // 保存文字草稿
    if (inputText.value.trim()) store.drafts[lastConvoKey] = inputText.value;
    else delete store.drafts[lastConvoKey];
    // 保存待发送文件草稿
    if (pendingFiles.value.length) {
      store.drafts[lastConvoKey + '_files'] = JSON.parse(JSON.stringify(pendingFiles.value));
      // 仅有文件没有文字时，用文件名作为草稿显示
      if (!inputText.value.trim()) {
        const names = pendingFiles.value.map(f => f.name).join(', ');
        store.drafts[lastConvoKey] = '📄 ' + names;
      }
    } else {
      delete store.drafts[lastConvoKey + '_files'];
      // 如果草稿只是文件名标记且已无文件，清除
      if (store.drafts[lastConvoKey] && store.drafts[lastConvoKey].startsWith('📄 ')) delete store.drafts[lastConvoKey];
    }
  }
  // 恢复草稿内容
  const draftText = store.drafts?.[newKey] || '';
  const isFileDraft = draftText.startsWith('📄 ');
  if (isFileDraft) {
    inputText.value = '';
    if (inputEl.value) inputEl.value.innerHTML = '';
  } else {
    inputText.value = draftText;
    renderEditor(draftText, draftText.length);
  }
  // 恢复待发送文件
  const savedFiles = store.drafts?.[newKey + '_files'];
  pendingFiles.value = Array.isArray(savedFiles) ? savedFiles : [];
  // 打开会话时删除草稿（已恢复到输入区，不再在列表显示）
  delete store.drafts[newKey];
  delete store.drafts[newKey + '_files'];
  lastConvoKey = newKey;
  nextTick(() => autoResizeTextarea());
});

// --- 发送消息 ---
// （@提及解析已移至 utils.extractMentions：发送时从文本按昵称反查 uid，与拍一拍同模式）

// --- 收藏选择发送 ---
const favoritesVisible = ref(false);

// 点击收藏弹窗/按钮以外的区域时关闭
function onFavoritesDocClick(e) {
  if (!favoritesVisible.value) return
  const el = e.target
  if (el && !el.closest('.favorites-picker') && !el.closest('.favorites-btn')) {
    favoritesVisible.value = false
  }
}
document.addEventListener('click', onFavoritesDocClick)
onUnmounted(() => document.removeEventListener('click', onFavoritesDocClick))

function previewFavorite(fav) {
  const obj = parseMsgContent(fav.content);
  if (!obj) {
    const s = (fav.content || '').replace(/\s+/g, ' ').trim();
    return s.length > 40 ? s.slice(0, 40) + '…' : s;
  }
  if (obj.type === 'text') {
    const s = (obj.content || '').replace(/\s+/g, ' ').trim();
    return s.length > 40 ? s.slice(0, 40) + '…' : s;
  }
  if (obj.type === 'emoji') return obj.content || '表情';
  if (obj.type === 'file') return '📄 ' + (obj.name || '文件');
  if (obj.type === 'sticker') return '🖼️ ' + (obj.name || '表情');
  return '消息';
}

// 从收藏中选一条发送到当前会话（按收藏内容类型重建消息）
async function sendFavorite(fav) {
  const obj = parseMsgContent(fav.content);
  if (!obj) { errorMessage.value = '收藏内容无效'; return; }
  let msgObj = null;
  if (obj.type === 'text') msgObj = { type: 'text', content: obj.content || '' };
  else if (obj.type === 'emoji') msgObj = { type: 'emoji', content: obj.content || '' };
  else if (obj.type === 'file') msgObj = { type: 'file', name: obj.name, size: obj.size, data: obj.data, mime: obj.mime };
  else if (obj.type === 'sticker') msgObj = { type: 'sticker', data: obj.data, mime: obj.mime, name: obj.name };
  else { errorMessage.value = '该类型收藏不支持发送'; return; }
  favoritesVisible.value = false;
  try {
    const r = await sendChatMessage({ type: props.pageType, targetId: props.pageId, msgObj });
    if (!r.success) {
      errorMessage.value = r.err?.message || '发送失败';
    } else {
      errorMessage.value = '';
      const { tokenInfo: info } = applyChatToStore(r, props.pageType, props.pageId);
      tokenInfo.value = info;
    }
  } catch {
    errorMessage.value = '发送失败';
  }
}

async function sendMessage() {
  inputText.value = serializeEditor();
  const hasText = inputText.value.trim().length > 0;
  const hasFiles = pendingFiles.value.length > 0;
  if (!hasText && !hasFiles) {
    errorMessage.value = '不能发送空消息';
    return;
  }
  sending.value = true;
  try {
    // 发送待发送文件（文件消息不再附带文字，图片/文件与文字分开发送）
    for (const pf of pendingFiles.value) {
      const msgObj = { type: 'file', name: pf.name, size: pf.size, data: pf.data, mime: pf.mime };
      const r = await sendChatMessage({ type: props.pageType, targetId: props.pageId, msgObj });
      if (!r.success) {
        errorMessage.value = r.err?.message || '发送失败';
        sending.value = false;
        return;
      }
      const { tokenInfo: info } = applyChatToStore(r, props.pageType, props.pageId);
      tokenInfo.value = info;
    }
    // 文字单独发送（不与文件合并成一条消息）；仅单个 emoji 时发为 emoji 消息（微信风格放大），多个表情按普通文本 content 发送
    if (hasText) {
      const trimmed = inputText.value.trim()
      const singleEmojiMsg = isSingleEmoji(trimmed) || !!QUANCODE.get(trimmed.toLowerCase())
      const msgObj = singleEmojiMsg
        ? { type: 'emoji', content: trimmed }
        : { type: 'text', content: inputText.value };
      if (replyTo.value) {
        msgObj.reply_to = replyTo.value.id;
        msgObj.reply_content = replyTo.value.content;
      }
      if (props.pageType === 'group') {
        const mentions = extractMentions(inputText.value);
        if (mentions.length) msgObj.mentions = mentions;
      }
      const r = await sendChatMessage({ type: props.pageType, targetId: props.pageId, msgObj });
      if (!r.success) {
        errorMessage.value = r.err?.message || '发送失败';
        sending.value = false;
        return;
      }
      const { tokenInfo: info } = applyChatToStore(r, props.pageType, props.pageId);
      tokenInfo.value = info;
    }
    errorMessage.value = '';
    inputText.value = '';
    if (inputEl.value) inputEl.value.innerHTML = '';
    replyTo.value = null;
    pendingFiles.value = [];
    delete store.drafts[convoKey.value];
    delete store.drafts[convoKey.value + '_files'];
  } catch {
    errorMessage.value = '发送失败';
  }
  sending.value = false;
  nextTick(() => autoResizeTextarea());
}

async function sendFileMessage() {
  if (sending.value) return;
  sending.value = true;
  try {
    const sel = await window.api.selectFile();
    if (!sel.success) { sending.value = false; return; }
    // 如果是图片，压缩
    let data = sel.data;
    let size = sel.size;
    let mime = sel.mime;
    if (mime?.startsWith('image/')) {
      const result = await compressBase64Image(data, mime);
      if (result) { data = result.data; size = result.size; }
      mime = 'image/jpeg'; // 压缩后统一为 JPEG
    }
    addPendingFile(sel.name, size, data, mime);
  } catch {
    errorMessage.value = '发送失败';
  }
  sending.value = false;
}

// --- 粘贴：图片直接发送；文本强制纯文本（剥 HTML 样式）；表情粘贴源码（/code） ---
async function onPaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;
  // 取剪贴板文本（text/plain 优先，text/html 剥标签）
  let text = e.clipboardData.getData('text/plain');
  if (!text) {
    const html = e.clipboardData.getData('text/html');
    if (html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      text = (doc.body ? doc.body.innerText : '') || '';
    }
  }
  // 表情粘贴（剪贴板同时含文本+图片，文本为 /code 表情码）：插入源码，不发送图片
  const codeText = (text || '').trim();
  if (codeText && /^\/[\p{L}\p{N}_]+$/u.test(codeText) && QUANCODE.has(codeText.toLowerCase())) {
    e.preventDefault();
    insertPastedText(codeText);
    return;
  }
  // 普通图片：阻止默认粘贴（避免文字同时被插入），压缩后发送
  let imgItem = null;
  for (const item of items) {
    if (item.type.startsWith('image/')) { imgItem = item; break; }
  }
  if (imgItem) {
    e.preventDefault();
    const file = imgItem.getAsFile();
    if (!file) return;
    sending.value = true;
    try {
      const result = await compressImage(file);
      if (!result) { sending.value = false; return; }
      addPendingFile(`pasted_${Date.now()}.png`, result.size, result.data, 'image/jpeg');
    } catch {
      errorMessage.value = '粘贴图片发送失败';
    }
    sending.value = false;
    return;
  }
  // 无图片：阻止默认富文本粘贴，仅插入纯文本
  e.preventDefault();
  if (!text) return;
  insertPastedText(text);
}

// 在光标处插入纯文本（contenteditable 重渲染）
function insertPastedText(text) {
  const caret = getCaretSerializedOffset();
  const before = inputText.value.slice(0, caret);
  const after = inputText.value.slice(caret);
  inputText.value = before + text + after;
  renderEditor(inputText.value, caret + text.length);
  onInputChange();
}

// --- Markdown 预览（全量渲染 + 块内插值定位，同步滚动） ---
function renderMdPreview() {
  return renderMarkdownPreview(inputText.value);
}

const inputPreviewRef = ref(null);
let inputScrollSyncing = false;
let inputScrollSyncTimer = null;
let inputPendingLine = null;
let inputRafPending = false;

function lockInputScroll() {
  inputScrollSyncing = true;
  clearTimeout(inputScrollSyncTimer);
  inputScrollSyncTimer = setTimeout(() => { inputScrollSyncing = false }, 120);
}

function taLineHeight() {
  const ta = inputEl.value;
  if (!ta) return 22;
  const lh = parseFloat(getComputedStyle(ta).lineHeight);
  return Number.isFinite(lh) && lh > 0 ? lh : 22;
}

// 元素在滚动容器内的可视偏移（getBoundingClientRect 差值，不依赖 offsetParent）
function elOffsetIn(el, container) {
  return el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
}

// 源码行 line → 预览滚动位置：找包含 line 的块，按行号比例在块内插值
function locatePreviewLine(line) {
  const pv = inputPreviewRef.value;
  if (!pv) return null;
  const blocks = pv.querySelectorAll('[data-line]');
  if (!blocks.length) return null;
  let cur = null;
  for (const b of blocks) {
    if (Number(b.dataset.line) <= line) cur = b;
    else break;
  }
  if (!cur) return Math.round(elOffsetIn(blocks[0], pv));
  const curStart = Number(cur.dataset.line);
  let top = elOffsetIn(cur, pv);
  let next = null;
  for (const b of blocks) {
    if (Number(b.dataset.line) > curStart) { next = b; break }
  }
  if (next) {
    const nextTop = elOffsetIn(next, pv);
    const height = Math.max(nextTop - top, 1);
    const span = Math.max(Number(next.dataset.line) - curStart, 1);
    const ratio = Math.min(Math.max((line - curStart) / span, 0), 0.99);
    top += height * ratio;
  }
  return Math.round(top);
}

// 预览顶部 → 对应源码行（locatePreviewLine 的逆运算）
function previewVisibleLine() {
  const pv = inputPreviewRef.value;
  if (!pv) return null;
  const blocks = pv.querySelectorAll('[data-line]');
  if (!blocks.length) return null;
  let best = null;
  for (const b of blocks) {
    if (elOffsetIn(b, pv) <= pv.scrollTop + 8) best = b;
    else break;
  }
  if (!best) return 1;
  const curStart = Number(best.dataset.line);
  const top = elOffsetIn(best, pv);
  let line = curStart;
  let next = null;
  for (const b of blocks) {
    if (Number(b.dataset.line) > curStart) { next = b; break }
  }
  if (next) {
    const nextTop = elOffsetIn(next, pv);
    const height = Math.max(nextTop - top, 1);
    const span = Math.max(Number(next.dataset.line) - curStart, 1);
    const ratio = Math.min(Math.max((pv.scrollTop - top) / height, 0), 0.99);
    line = curStart + Math.round(ratio * span);
  }
  return line;
}

function syncRatioToPreview() {
  const ta = inputEl.value;
  const pv = inputPreviewRef.value;
  if (!ta || !pv || inputScrollSyncing) return;
  const maxScroll = ta.scrollHeight - ta.clientHeight;
  const ratio = maxScroll > 1 ? ta.scrollTop / maxScroll : 0;
  const pvMax = pv.scrollHeight - pv.clientHeight;
  lockInputScroll();
  pv.scrollTop = ratio * pvMax;
}

function syncPreviewFromInput() {
  syncRatioToPreview();
}

function syncInputFromPreview() {
  const ta = inputEl.value;
  const pv = inputPreviewRef.value;
  if (!ta || !pv || inputScrollSyncing) return;
  const pvMax = pv.scrollHeight - pv.clientHeight;
  const ratio = pvMax > 1 ? pv.scrollTop / pvMax : 0;
  const maxScroll = ta.scrollHeight - ta.clientHeight;
  lockInputScroll();
  ta.scrollTop = ratio * maxScroll;
}

// 内容变化：预览按滚动比例同步（contenteditable 无行号，用比例对齐）
watch(inputText, () => {
  nextTick(() => {
    const ta = inputEl.value;
    const pv = inputPreviewRef.value;
    if (!ta || !pv || inputScrollSyncing) return;
    const maxScroll = ta.scrollHeight - ta.clientHeight;
    const ratio = maxScroll > 1 ? ta.scrollTop / maxScroll : 0;
    const pvMax = pv.scrollHeight - pv.clientHeight;
    pv.scrollTop = ratio * pvMax;
  });
});

// 判断文本是否为「单个」emoji —— 已移至 utils.isSingleEmoji（渲染端共用，防 API 伪造）

// 微信风格：点击表情仅在输入框光标位置插入，不直接发送
function onEmojiSelect(face) {
  const caret = getCaretSerializedOffset()
  const text = inputText.value
  const code = face.code
  const newText = text.slice(0, caret) + code + text.slice(caret)
  inputText.value = newText
  renderEditor(newText, caret + code.length)
  nextTick(() => inputEl.value?.focus())
}

async function onStickerSelect(sticker) {
  const msgObj = { type: 'sticker', data: sticker.data, mime: sticker.mime, name: sticker.name };
  try {
    const r = await sendChatMessage({ type: props.pageType, targetId: props.pageId, msgObj });
    if (!r.success) {
      errorMessage.value = r.err?.message || '发送失败';
    } else {
      errorMessage.value = '';
      const { tokenInfo: info } = applyChatToStore(r, props.pageType, props.pageId);
      tokenInfo.value = info;
    }
  } catch {
    errorMessage.value = '发送失败';
  }
}

async function addSticker() {
  if (sending.value) return;
  sending.value = true;
  try {
    const sel = await window.api.selectImage();
    if (!sel.success) { sending.value = false; return; }
    store.stickers.push({ name: sel.name, data: sel.data, mime: sel.mime });
  } catch {
    errorMessage.value = '添加表情失败';
  }
  sending.value = false;
}

async function removeSticker(index) {
  store.stickers.splice(index, 1);
}

function startReply(msg) {
  let summary = '';
  const obj = parseMsgContent(msg.content);
  if (obj) {
    if (obj.type === 'file') {
      summary = '📄 ' + (obj.name || '');
      if (obj.content) summary += ': ' + obj.content;
    } else if (obj.type === 'sticker') {
      summary = '🖼️ ' + (obj.name || '表情');
    } else {
      summary = obj.content || '';
    }
  } else {
    summary = msg.content;
  }
  replyTo.value = { id: msg.id, content: summary.slice(0, 80) };
  nextTick(() => inputEl.value?.focus());
}

function toggleEmoji() {
  emojiVisible.value = !emojiVisible.value;
}

// --- @提及 ---
const mentionCandidates = computed(() => {
  const q = mentionQuery.value.toLowerCase();
  let candidates = [];
  if (props.pageType === 'group' && props.targetGroup) {
    candidates = props.targetGroup.users
      .map(u => store.users[u.user_id] || { uid: u.user_id })
      .filter(Boolean);
  } else {
    candidates = [];
  }
  if (!q) return candidates;
  return candidates.filter(u => {
    const name = (u.nickname || u.username || '').toLowerCase();
    const uid = String(u.uid);
    return name.includes(q) || uid.includes(q);
  });
});

const mentionAllCandidates = computed(() => {
  const all = props.pageType === 'group' ? [{ uid: 'all', nickname: '所有人', _isAll: true }] : [];
  return [...all, ...mentionCandidates.value];
});

const mentionPopupStyle = ref({ display: 'none' });

function updateMentionPosition() {
  const el = inputEl.value;
  if (!el) { mentionPopupStyle.value = { display: 'none' }; return; }
  const rect = el.getBoundingClientRect();
  mentionPopupStyle.value = {
    left: rect.left + 'px',
    bottom: (window.innerHeight - rect.top + 4) + 'px',
    width: Math.max(rect.width, 160) + 'px'
  };
}

function autoResizeTextarea() {
  const el = inputEl.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  // #13 编译器式滚动：光标跟随——内容超高出现滚动条后，确保光标始终可见
  scrollCaretIntoView(el);
}

// 把输入框滚动到光标处（编译器式光标跟随）
function scrollCaretIntoView(el) {
  if (!el) return;
  // 仅当有滚动溢出时才调整（无/低内容时不必要）
  if (el.scrollHeight <= el.clientHeight + 1) return;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.endContainer)) return;
  const rect = range.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const relTop = rect.top - elRect.top;
  const relBottom = rect.bottom - elRect.top;
  // 光标在可视区外时滚动到可见（保留 8px 边距）
  if (relTop < el.scrollTop + 8) {
    el.scrollTop = relTop - 8;
  } else if (relBottom > el.scrollTop + el.clientHeight - 8) {
    el.scrollTop = relBottom - el.clientHeight + 8;
  }
}

function onInputChange(e) {
  inputText.value = serializeEditor();
  autoResizeTextarea();
  const caret = getCaretSerializedOffset();
  const before = inputText.value.slice(0, caret);
  const atMatch = before.match(/@([^\s@]*)$/);
  if (atMatch && props.pageType === 'group') {
    mentionQuery.value = atMatch[1];
    mentionVisible.value = true;
    mentionIndex.value = 0;
    nextTick(updateMentionPosition);
  } else {
    mentionVisible.value = false;
  }
  // #1 输入框不实时渲染表情：发送/预览时才由 markdown 渲染
}

function onCompositionEnd() {
  onInputChange();
}

function onInputKeydown(e) {
  if (mentionVisible.value && mentionAllCandidates.value.length) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      mentionIndex.value = (mentionIndex.value + 1) % mentionAllCandidates.value.length;
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      mentionIndex.value = (mentionIndex.value - 1 + mentionAllCandidates.value.length) % mentionAllCandidates.value.length;
      return;
    }
    if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      selectMentionByIndex(mentionIndex.value);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      mentionVisible.value = false;
      return;
    }
  }
  if (e.key === 'Enter') {
    const sc = sendShortcut.value.toLowerCase();
    const isEnter = sc === 'enter';
    const isCtrlEnter = sc === 'ctrl+enter';
    const isShiftEnter = sc === 'shift+enter';
    if (isEnter && !e.shiftKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); sendMessage(); }
    else if (isEnter && e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); insertNewline(); }
    else if (isCtrlEnter && e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); sendMessage(); }
    else if (isShiftEnter && e.shiftKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); sendMessage(); }
  }
}

function insertNewline() {
  const caret = getCaretSerializedOffset();
  const text = inputText.value;
  const newText = text.slice(0, caret) + '\n' + text.slice(caret);
  inputText.value = newText;
  renderEditor(newText, caret + 1);
  nextTick(() => inputEl.value?.focus());
}

function selectMentionByIndex(idx) {
  const candidate = mentionAllCandidates.value[idx];
  if (!candidate) return;
  if (candidate._isAll) applyMentionAll();
  else applyMention(candidate);
}

function applyMention(user) {
  const caret = getCaretSerializedOffset();
  const text = inputText.value;
  const before = text.slice(0, caret);
  const after = text.slice(caret);
  const replaced = before.replace(/@([^\s@]*)$/, '@' + user.uid + ' ');
  const newText = replaced + after;
  inputText.value = newText;
  renderEditor(newText, replaced.length);
  mentionVisible.value = false;
  nextTick(() => inputEl.value?.focus());
}

function applyMentionAll() {
  const caret = getCaretSerializedOffset();
  const text = inputText.value;
  const before = text.slice(0, caret);
  const after = text.slice(caret);
  const replaced = before.replace(/@([^\s@]*)$/, '@所有人 ');
  const newText = replaced + after;
  inputText.value = newText;
  renderEditor(newText, replaced.length);
  mentionVisible.value = false;
  nextTick(() => inputEl.value?.focus());
}

// --- 拖拽（仅保留系统文件拖入） ---
function onInputDragOver(e) {
  if (e.dataTransfer?.types?.includes('Files')) {
    e.dataTransfer.dropEffect = 'copy';
    inputDragOver.value = true;
  }
}

function onInputDragLeave() {
  inputDragOver.value = false;
}

async function onInputDrop(e) {
  inputDragOver.value = false;

  // 仅保留系统文件拖入（dropFile）
  if (e.dataTransfer?.files?.length > 0) {
    const file = e.dataTransfer.files[0];
    await sendDroppedFile(file);
  }
}

async function sendDroppedFile(file) {
  if (sending.value) return;
  sending.value = true;
  try {
    const result = await compressImage(file);
    if (!result) { sending.value = false; return; }
    const mime = file.type?.startsWith('image/') ? 'image/jpeg' : (file.type || 'application/octet-stream');
    addPendingFile(file.name || 'unnamed_file', result.size, result.data, mime);
  } catch (e) {
    console.error('[sendDroppedFile] 上传失败:', e);
    errorMessage.value = '上传失败: ' + (e.message || String(e));
  }
  sending.value = false;
}

// --- 分割线拖动 ---
function onSplitDragStart(e) {
  e.preventDefault();
  const splitEl = e.currentTarget.parentElement;
  if (!splitEl) return;
  const splitRect = splitEl.getBoundingClientRect();
  const onMove = (ev) => {
    let newWidth = ev.clientX - splitRect.left;
    const minW = 120;
    const maxW = splitRect.width - 120;
    newWidth = Math.max(minW, Math.min(maxW, newWidth));
    splitLeftWidth.value = newWidth;
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function focus() {
  inputEl.value?.focus();
}

// --- 待发送文件管理 ---
function isImageFile(name) {
  return /\.(jpg|jpeg|png|gif|bmp|webp|ico)$/i.test(name || '');
}

function addPendingFile(name, size, data, mime) {
  const isImage = isImageFile(name);
  const thumbUrl = isImage && data && mime ? `data:${mime};base64,${data}` : '';
  pendingFiles.value.push({ name, size, data, mime, isImage, thumbUrl });
  nextTick(() => inputEl.value?.focus());
}

function removePendingFile(idx) {
  pendingFiles.value.splice(idx, 1);
}

function formatFileSize(bytes) {
  return formatSize(bytes);
}

function previewPendingFile(pf) {
  if (pf.isImage) {
    emit('openPreview', { type: 'image', title: pf.name, src: pf.thumbUrl, text: '' });
  } else {
    // 非图片文件，尝试下载保存
    if (pf.data) {
      window.api.downloadFile(pf.data, pf.name, pf.mime);
    }
  }
}

defineExpose({ inputEl, focus, autoResizeTextarea, mentionVisible, emojiVisible, replyTo, sending, errorMessage, tokenInfo, startReply, pendingFiles });
</script>
