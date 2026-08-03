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
      <div class="input-actions">
        <button id="emoji_btn" @click.stop="toggleEmoji" :disabled="sending || inputDisabled"><i class="fas fa-smile"></i></button>
        <button id="file_btn" @click="sendFileMessage" :disabled="sending || inputDisabled"><i class="fas fa-paperclip"></i></button>
      </div>
      <div class="input-split">
        <div class="input-split-left" :style="splitLeftWidth ? { width: splitLeftWidth + 'px', flex: 'none' } : {}">
          <div class="textarea-wrap">
            <textarea v-model="inputText" :placeholder="sendPlaceholder" @keydown="onInputKeydown" @input="onInputChange" @paste="onPaste" :disabled="sending || inputDisabled" ref="inputEl"></textarea>
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
          <div class="input-preview-content" v-if="inputText.trim()" v-html="renderMdPreview()"></div>
          <div class="input-preview-empty" v-else>输入内容后在此预览</div>
        </div>
      </div>
      <button id="send" @click="sendMessage" :disabled="sending || inputDisabled">发送</button>
    </div>
    <div class="counter-line">
      <span class="error" v-if="errorMessage">{{ errorMessage }}</span>
      <span class="token-info" v-if="tokenInfo">剩余 {{ tokenInfo.remain }} / {{ tokenInfo.total }} token</span>
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
import { ref, computed, nextTick, watch } from 'vue';
import { store } from '../store.js';
import { displayName, parseMsgContent, renderMarkdown, applyChatToStore, sendChatMessage, getConvoKey, formatSize, compressImage, compressBase64Image } from '../utils.js';
import EmojiPicker from './EmojiPicker.vue';
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
const sending = ref(false);
const errorMessage = ref('');
const tokenInfo = ref(null);
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
  inputText.value = isFileDraft ? '' : draftText;
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
function extractMentions(text) {
  const uids = new Set();
  if (text.includes('@所有人')) uids.add('all');
  const re = /@(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const uid = Number(m[1]);
    if (store.users[uid]) uids.add(uid);
  }
  return [...uids];
}

async function sendMessage() {
  const hasText = inputText.value.trim().length > 0;
  const hasFiles = pendingFiles.value.length > 0;
  if (!hasText && !hasFiles) {
    errorMessage.value = '不能发送空消息';
    return;
  }
  sending.value = true;
  try {
    // 发送待发送文件
    for (const pf of pendingFiles.value) {
      const msgObj = { type: 'file', name: pf.name, size: pf.size, data: pf.data, mime: pf.mime };
      if (hasText) {
        msgObj.content = inputText.value.trim();
        if (replyTo.value) {
          msgObj.reply_to = replyTo.value.id;
          msgObj.reply_content = replyTo.value.content;
        }
        if (props.pageType === 'group') {
          const mentions = extractMentions(inputText.value);
          if (mentions.length) msgObj.mentions = mentions;
        }
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
    // 如果只有文字没有文件，发送纯文本消息
    if (hasText && !hasFiles) {
      const msgObj = { type: 'text', content: inputText.value };
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

// --- 粘贴图片发送 ---
async function onPaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
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
  }
}

// --- Markdown 预览 ---
function renderMdPreview() {
  return renderMarkdown(inputText.value);
}

async function onEmojiSelect(emoji) {
  const msgObj = { type: 'emoji', content: emoji };
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
}

function onInputChange() {
  autoResizeTextarea();
  const text = inputText.value;
  const pos = inputEl.value?.selectionStart || text.length;
  const before = text.slice(0, pos);
  const atMatch = before.match(/@([^\s@]*)$/);
  if (atMatch && props.pageType === 'group') {
    mentionQuery.value = atMatch[1];
    mentionVisible.value = true;
    mentionIndex.value = 0;
    nextTick(updateMentionPosition);
  } else {
    mentionVisible.value = false;
  }
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
  const el = inputEl.value;
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  inputText.value = inputText.value.substring(0, start) + '\n' + inputText.value.substring(end);
  nextTick(() => { el.selectionStart = el.selectionEnd = start + 1; });
}

function selectMentionByIndex(idx) {
  const candidate = mentionAllCandidates.value[idx];
  if (!candidate) return;
  if (candidate._isAll) applyMentionAll();
  else applyMention(candidate);
}

function applyMention(user) {
  const text = inputText.value;
  const pos = inputEl.value?.selectionStart || text.length;
  const before = text.slice(0, pos);
  const after = text.slice(pos);
  const replaced = before.replace(/@([^\s@]*)$/, '@' + (user.nickname || `User_${user.uid}`) + ' ');
  inputText.value = replaced + after;
  mentionVisible.value = false;
  nextTick(() => {
    const newPos = replaced.length;
    inputEl.value?.setSelectionRange(newPos, newPos);
    inputEl.value?.focus();
    autoResizeTextarea();
  });
}

function applyMentionAll() {
  const text = inputText.value;
  const pos = inputEl.value?.selectionStart || text.length;
  const before = text.slice(0, pos);
  const after = text.slice(pos);
  const replaced = before.replace(/@([^\s@]*)$/, '@所有人 ');
  inputText.value = replaced + after;
  mentionVisible.value = false;
  nextTick(() => {
    const newPos = replaced.length;
    inputEl.value?.setSelectionRange(newPos, newPos);
    inputEl.value?.focus();
    autoResizeTextarea();
  });
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
