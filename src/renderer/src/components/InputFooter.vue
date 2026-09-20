<template>
  <div class="input-footer" :class="{ sending: sending, disabled: inputDisabled, 'drag-over': inputDragOver, 'emoji-open': emojiVisible }" v-if="pageType === 'group' || (pageType === 'user' && targetUser)"
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

    <!-- 输入区：与「工具 → Markdown」同一版式 —— 左源码、右预览，中间可拖拽分隔条。
         左侧是原生 textarea（源码为唯一真源，中文输入法与撤销栈与普通文本框一致），
         右侧走 renderMarkdownPreview，与消息气泡同一个渲染器，表情/公式/代码高亮一并保留。
         滚动是双向跟随：拖任一侧，另一侧按比例对齐。 -->
    <div class="input-row">
    <div class="input-split" :class="{ 'collapse-left': collapseSide === 'left', 'collapse-right': collapseSide === 'right' }">
      <div class="input-split-left" v-show="collapseSide !== 'left'" :style="splitLeftWidth && !collapseSide ? { width: splitLeftWidth + 'px', flex: 'none' } : {}">
        <div class="textarea-wrap">
            <textarea
              class="input-editor"
              ref="inputEl"
              v-model="inputText"
              spellcheck="false"
              :disabled="sending || inputDisabled"
              :placeholder="sendPlaceholder"
              @keydown="onInputKeydown"
              @input="onInputChange"
              @paste="onPaste"
              @scroll="syncPreviewFromInput"
            ></textarea>
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
        <div class="input-split-divider" title="拖动调整双栏宽度，拖到边缘继续拖可隐藏该侧" @mousedown="onSplitDragStart"></div>
        <div class="input-split-right" v-show="collapseSide !== 'right'">
          <div class="input-preview-label">预览</div>
          <div
            class="input-preview-content luogu-md"
            ref="inputPreviewRef"
            v-if="inputText.trim()"
            v-html="renderMdPreview()"
            @scroll="syncInputFromPreview"
          ></div>
          <div class="input-preview-empty" v-else>输入内容后在此预览</div>
        </div>
      </div>
      <button id="send" @click="sendMessage" :disabled="sending || inputDisabled">发送</button>
    </div>
    <div class="counter-line">
      <div class="input-actions">
        <div class="fmt-toggle" title="消息格式：纯文本原样显示，Markdown 支持渲染">
          <button :class="{ active: msgFmt === 'txt' }" @click="msgFmt = 'txt'">纯文本</button>
          <button :class="{ active: msgFmt === 'md' }" @click="msgFmt = 'md'">MD</button>
        </div>
        <button id="emoji_btn" @click.stop="toggleEmoji" :disabled="sending || inputDisabled"><i class="fas fa-smile"></i></button>
        <button id="file_btn" @click="sendFileMessage" :disabled="sending || inputDisabled"><i class="fas fa-paperclip"></i></button>
        <button class="favorites-btn" title="从收藏中选择发送" @click="toggleFavorites"><i class="fas fa-star"></i></button>
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
    </div>
    <!-- 收藏选择面板（与表情面板同形态：嵌入输入区上方、可拖拽调高） -->
    <div class="favpick" v-if="favoritesVisible" ref="favpickEl" :style="favpickStyleObj">
      <div class="favpick-drag" title="上下拖动调整高度" @mousedown.prevent="onFavDragStart"><i></i></div>
      <div class="favpick-head">
        <span class="favpick-title"><i class="fas fa-star"></i>从收藏中选择</span>
        <span class="favpick-count" v-if="store.favorites.length">{{ store.favorites.length }}</span>
      </div>
      <div class="favpick-search">
        <i class="fas fa-search"></i>
        <input v-model="favQuery" placeholder="搜索收藏…" />
      </div>
      <div class="favpick-list">
        <div v-if="!favFiltered.length" class="favpick-empty">
          <i class="far fa-star"></i>
          <p>{{ store.favorites.length ? '没有匹配的收藏' : '还没有收藏' }}</p>
          <p class="favpick-empty-sub">在聊天中右键消息即可收藏</p>
        </div>
        <button v-for="fav in favFiltered" :key="fav.id" class="favpick-item" @click="sendFavorite(fav)">
          <span class="favpick-icon" :class="FAV_KIND_META[favKind(fav)].cls"><i :class="FAV_KIND_META[favKind(fav)].icon"></i></span>
          <span class="favpick-main">
            <span class="favpick-kind">{{ FAV_KIND_META[favKind(fav)].name }}</span>
            <span class="favpick-preview">{{ clipPreview(fav) }}</span>
          </span>
          <span class="favpick-time">{{ favTime(fav) }}</span>
        </button>
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
      @previewSticker="previewSticker"
    />
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue';
import { store } from '../store.js';
import { displayName, parseMsgContent, renderMarkdownPreview, applyChatToStore, sendChatMessage, getConvoKey, formatSize, compressImage, compressBase64Image, extractMentions, isSingleEmoji, esc } from '../utils.js';
import EmojiPicker from './EmojiPicker.vue';
import { QUANCODE, qqfaceUrl, qqfaceShortCode } from '../qqface-data.js';
import { createScrollSync } from '../markdown/scroll-sync.js';
import '../css/input-footer.css';

const props = defineProps({
  pageType: { type: String, required: true },
  pageId: { type: [Number, String], default: null },
  targetUser: { type: Object, default: null },
  targetGroup: { type: Object, default: null },
  inputDisabled: { type: Boolean, default: false }
});

const emit = defineEmits(['openPreview']);

const sendShortcut = computed(() => store.setting?.shortcuts?.sendMessage || 'enter');

const sendPlaceholder = computed(() => {
  const sc = sendShortcut.value.toLowerCase();
  if (sc === 'ctrl+enter') return '输入消息... (Ctrl+Enter发送)';
  if (sc === 'shift+enter') return '输入消息... (Shift+Enter发送)';
  return '输入消息... (Enter发送, Ctrl+Enter换行)';
});

// ===== 输入区：左源码 + 右预览 =====
// inputText（Markdown 源码）是唯一真源：左侧 textarea 直接编辑它，右侧是它的渲染视图。
// 渲染走 renderMarkdownPreview —— 与消息气泡同一个渲染器，表情/公式/代码高亮全部一致。
const inputText = ref('');
const inputEl = ref(null);
const inputPreviewRef = ref(null);
/** 左侧栏宽度；0 表示用 flex 默认比例（两栏对半） */
const splitLeftWidth = ref(0);

/** 消息格式：'md' = Markdown 渲染（默认，历史消息均按此）；'txt' = 纯文本原样显示 */
const msgFmt = ref('md');

function renderMdPreview() {
  // 纯文本模式：预览也是原样文本（转义 + 保留换行），不做 Markdown / 表情渲染
  if (msgFmt.value === 'txt') {
    return inputText.value ? '<div class="plain-msg">' + esc(inputText.value) + '</div>' : '';
  }
  return renderMarkdownPreview(inputText.value);
}

// ---------- 双向跟随滚动 ----------
// 与「工具 → Markdown」同一套实现（上游编辑器算法移植，见 markdown/scroll-sync.js）：
// rAF 合并 + 位置回声检测（WeakMap 记程序化 scrollTop，1.5px 容差）+
// [data-src-line] 行锚点二分插值。视口顶部所在源码行驱动对侧，不再用高度比例。
const scrollSync = createScrollSync({
  getTextarea: () => inputEl.value,
  getPreview: () => inputPreviewRef.value,
})

function syncPreviewFromInput() {
  scrollSync.sync('editor')
}

function syncInputFromPreview() {
  scrollSync.sync('preview')
}

// 内容变化：预览 DOM 被 v-html 整体重建，锚点缓存必须失效后再按左侧位置对齐。
// 预览被拖拽收起（display:none）时测量全是 0，不能让引擎按它给 textarea 写尾部 padding。
// 表情框打开时输入区只有一排高，滚动对齐无意义，且会算出上百 px 的尾部 padding。
watch(inputText, () => {
  nextTick(() => {
    const ta = inputEl.value
    const pv = inputPreviewRef.value
    if (ta && (!pv || collapseSide.value === 'right')) {
      // 还原引擎写入的内联尾部 padding
      ta.style.paddingBottom = ''
      return
    }
    if (!ta || !pv) return
    scrollSync.invalidate()
    scrollSync.syncEditorTailPadding()
    scrollSync.sync('editor')
  })
})
onUnmounted(() => scrollSync.destroy())

// ---------- 光标与插入 ----------
function caretOffset() {
  const ta = inputEl.value;
  if (!ta) return inputText.value.length;
  return ta.selectionStart ?? ta.value.length;
}

/** 在光标处插入文本（替换当前选区），插入后光标落在插入内容之后 */
function insertAtCaret(text, caretDelta) {
  const ta = inputEl.value;
  if (!ta) {
    inputText.value += text;
    return;
  }
  const start = ta.selectionStart ?? ta.value.length;
  const end = ta.selectionEnd ?? start;
  ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
  const caret = start + (caretDelta === undefined ? text.length : caretDelta);
  ta.selectionStart = ta.selectionEnd = caret;
  inputText.value = ta.value;
  nextTick(() => ta.focus());
}

function onInputChange() {
  const before = inputText.value.slice(0, caretOffset());
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

// 键位：@提及导航优先，其次发送快捷键家族。
// 发送快捷键为 Enter 时，Ctrl+Enter 保持"换行"语义（textarea 原生行为）。
function onInputKeydown(e) {
  if (mentionVisible.value && mentionAllCandidates.value.length) {
    const n = mentionAllCandidates.value.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      mentionIndex.value = (mentionIndex.value + 1) % n;
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      mentionIndex.value = (mentionIndex.value - 1 + n) % n;
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
    const plain = !e.shiftKey && !e.ctrlKey && !e.altKey;
    if (sc === 'enter' && plain) { e.preventDefault(); sendMessage(); return; }
    if (sc === 'enter' && e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); insertAtCaret('\n'); return; }
    if (sc === 'ctrl+enter' && e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); sendMessage(); return; }
    if (sc === 'shift+enter' && e.shiftKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); sendMessage(); return; }
  }
}

const sending = ref(false);
const errorMessage = ref('');
const tokenInfo = ref(null);
// ---- token 恢复（滑动窗口）：每条消息发送后 recoverySeconds 秒恢复该条 token ----
// 恢复时刻从消息数据统计：自己发送的消息（store.messages 中 sender=自己）消耗 1 token，
// 该 token 在 send_time + 恢复周期 时恢复。不落 localStorage（多端一致、重启后仍准确）。
const tokenTipVisible = ref(false);
const tokenRecovery = ref([]); // 未恢复的发送记录：[{ time, left(秒) }] 按发送时间排序
let tokenTipTimer = null;

function refreshRecovery() {
  const sec = (tokenInfo.value && tokenInfo.value.recoverySeconds) || store.tokenLimit?.time_limit || 2400;
  const now = Date.now();
  const uid = store.self && store.self.uid;
  const pending = [];
  if (uid != null) {
    for (const m of Object.values(store.messages)) {
      if (!m || m.sender != uid) continue; // 只统计自己发出去的消息
      const t = Number(m.send_time) * 1000;
      if (!t || now - t > sec * 1000) continue; // 已在窗口外，视为已恢复
      pending.push({ time: t, left: Math.max(0, (t + sec * 1000 - now) / 1000) });
    }
    pending.sort((a, b) => a.time - b.time);
    if (pending.length > 50) pending.length = 50; // 仅展示最近 50 条，避免长 tooltip
  }
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

// token 数量变化：用服务器 limit 校准 total 与恢复周期；
// 恢复倒计时不依赖"remain 下降时记录发送"，而是直接由消息数据统计（refreshRecovery）
watch(tokenInfo, (v) => {
  if (!v) return;
  if (store.tokenLimit?.count_limit) v.total = store.tokenLimit.count_limit;
  if (!v.recoverySeconds) v.recoverySeconds = store.tokenLimit?.time_limit || 2400;
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
const pendingFiles = ref([]); // 待发送文件列表 [{ name, size, data, mime, isImage, thumbUrl }]

// --- 草稿保存/恢复 ---
// InputFooter 不随会话重建（ChatView 只改 pageId 这个 prop），草稿全靠这个 watcher：
//   immediate 必须开 —— 否则①首次打开会话不恢复草稿（要切走再切回来才恢复），
//   ②首个会话切走时 lastConvoKey 还是 null，那份草稿永远不会被保存。
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
}, { immediate: true });

// --- 发送消息 ---
// （@提及解析已移至 utils.extractMentions：发送时从文本按昵称反查 uid，与拍一拍同模式）

// --- 收藏选择发送 ---
const favoritesVisible = ref(false);

// 拖拽调整高度（与表情面板同款交互，独立持久化）
const FAV_DRAG_MIN = 160;
const FAV_DRAG_MAX = 480;
const FAV_DRAG_KEY = '7fa4_favpick_h';
const favpickEl = ref(null);
const favpickHeight = ref(null);
let favDragState = null;
const favpickStyleObj = () => (favpickHeight.value
  ? { height: favpickHeight.value + 'px', maxHeight: FAV_DRAG_MAX + 'px', flex: 'none' }
  : {});

function restoreFavpickHeight() {
  try {
    const v = parseInt(localStorage.getItem(FAV_DRAG_KEY) || '', 10);
    if (Number.isFinite(v) && v >= FAV_DRAG_MIN && v <= FAV_DRAG_MAX) favpickHeight.value = v;
  } catch {}
}
function onFavDragStart(e) {
  const el = favpickEl.value;
  if (!el) return;
  favDragState = { startH: el.offsetHeight, startY: e.clientY };
  document.addEventListener('mousemove', onFavDragMove);
  document.addEventListener('mouseup', onFavDragEnd);
  document.body.style.cursor = 'ns-resize';
  document.body.style.userSelect = 'none';
}
function onFavDragMove(e) {
  if (!favDragState) return;
  const h = Math.round(Math.max(FAV_DRAG_MIN, Math.min(FAV_DRAG_MAX, favDragState.startH + (favDragState.startY - e.clientY))));
  favpickHeight.value = h;
  try { localStorage.setItem(FAV_DRAG_KEY, String(h)) } catch {}
}
function onFavDragEnd() {
  favDragState = null;
  document.removeEventListener('mousemove', onFavDragMove);
  document.removeEventListener('mouseup', onFavDragEnd);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}
onMounted(() => restoreFavpickHeight());
onUnmounted(() => onFavDragEnd());

// 点击收藏面板/按钮以外的区域时关闭
function onFavoritesDocClick(e) {
  if (!favoritesVisible.value) return
  const el = e.target
  if (el && !el.closest('.favpick') && !el.closest('.favorites-btn')) {
    favoritesVisible.value = false
  }
}
document.addEventListener('click', onFavoritesDocClick)
onUnmounted(() => document.removeEventListener('click', onFavoritesDocClick))

// 收藏选择面板：类型判定 / 预览 / 搜索过滤 / 排序
const favQuery = ref('');
const FAV_KIND_META = {
  text: { name: '文本', icon: 'fas fa-font', cls: 't-text' },
  file: { name: '文件', icon: 'fas fa-file', cls: 't-file' },
  sticker: { name: '图片', icon: 'fas fa-image', cls: 't-sticker' },
  emoji: { name: '表情', icon: 'far fa-smile', cls: 't-emoji' },
};
function favKind(fav) {
  const obj = parseMsgContent(fav.content);
  if (!obj) return 'text';
  if (obj.type === 'emoji') return 'emoji';
  if (obj.type === 'file') return 'file';
  if (obj.type === 'sticker') return 'sticker';
  return 'text';
}
function favPreviewText(fav) {
  const obj = parseMsgContent(fav.content);
  if (!obj) return (fav.content || '').replace(/\s+/g, ' ').trim();
  if (obj.type === 'text') return (obj.content || '').replace(/\s+/g, ' ').trim();
  if (obj.type === 'emoji') return obj.content || '表情';
  if (obj.type === 'file') return obj.name || '文件';
  if (obj.type === 'sticker') return obj.name || '图片';
  return '消息';
}
function clipPreview(fav) {
  const s = favPreviewText(fav);
  return s.length > 46 ? s.slice(0, 46) + '…' : s;
}
function favTime(fav) {
  let t = Number(fav.savedAt || fav.send_time || 0);
  if (t && t < 1e12) t *= 1000; // send_time 是秒级（savedAt 是毫秒），统一到毫秒
  if (!t) return '';
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
const favFiltered = computed(() => {
  // 最近收藏的排前，再按关键词过滤（匹配预览文本或类型名）
  const list = (store.favorites || []).slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  const q = favQuery.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter((f) => (favPreviewText(f) + ' ' + FAV_KIND_META[favKind(f)].name).toLowerCase().includes(q));
});

// 从收藏中选一条发送到当前会话（按收藏内容类型重建消息）
async function sendFavorite(fav) {
  const obj = parseMsgContent(fav.content);
  if (!obj) { errorMessage.value = '收藏内容无效'; return; }
  let msgObj = null;
  if (obj.type === 'text') msgObj = { type: 'text', content: obj.content || '', fmt: obj.fmt || 'md' };
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
  // 末尾空行只是键入习惯，发送前统一去掉
  const text = inputText.value.replace(/\n+$/, '');
  const hasText = text.trim().length > 0;
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
    // 文字单独发送（不与文件合并成一条消息）；仅 md 模式下单个 emoji 时发为 emoji 消息
    // （微信风格放大），纯文本模式一切按字面发送
    if (hasText) {
      const trimmed = text.trim()
      const singleEmojiMsg = msgFmt.value === 'md' && (isSingleEmoji(trimmed) || !!QUANCODE.get(trimmed.toLowerCase()))
      const msgObj = singleEmojiMsg
        ? { type: 'emoji', content: trimmed }
        : { type: 'text', content: text, fmt: msgFmt.value };
      if (replyTo.value) {
        msgObj.reply_to = replyTo.value.id;
        msgObj.reply_content = replyTo.value.content;
      }
      if (props.pageType === 'group') {
        const mentions = extractMentions(text);
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

// --- 粘贴：图片转成待发送文件；文本走 textarea 默认行为（纯文本，保留撤销栈） ---
async function onPaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;
  const codeText = (e.clipboardData.getData('text/plain') || '').trim();
  // 表情粘贴：剪贴板同时含文本与图片，其中文本是 /code 表情码——放行默认粘贴即可得到源码
  if (codeText && /^\/[\p{L}\p{N}_]+$/u.test(codeText) && QUANCODE.has(codeText.toLowerCase())) return;
  let imgItem = null;
  for (const item of items) {
    if (item.type.startsWith('image/')) { imgItem = item; break; }
  }
  if (!imgItem) return;
  // 普通图片：阻止默认粘贴，压缩后进待发送列表
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

function selectMentionByIndex(idx) {
  const candidate = mentionAllCandidates.value[idx];
  if (!candidate) return;
  if (candidate._isAll) applyMentionAll();
  else applyMention(candidate);
}

// 把光标前那段 "@查询串" 换成 "@uid "（或 "@所有人 "）
function replaceMentionQuery(replacement) {
  const before = inputText.value.slice(0, caretOffset());
  const m = before.match(/@([^\s@]*)$/);
  if (!m) { mentionVisible.value = false; return; }
  const start = before.length - m[0].length;
  const ta = inputEl.value;
  if (ta) {
    ta.setSelectionRange(start, before.length);
    insertAtCaret(replacement);
  } else {
    inputText.value = inputText.value.slice(0, start) + replacement + inputText.value.slice(before.length);
  }
  mentionVisible.value = false;
  nextTick(() => inputEl.value?.focus());
}

function applyMention(user) {
  replaceMentionQuery('@' + user.uid + ' ');
}

function applyMentionAll() {
  replaceMentionQuery('@所有人 ');
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

// 判断文本是否为「单个」emoji —— 已移至 utils.isSingleEmoji（渲染端共用，防 API 伪造）

// 微信风格：点击表情仅插入到光标处，不直接发送
// 默认插入最短快捷码（/jy 而非 /惊讶 /jingya）；表情码后补一个空格：
// 渲染端用 /code(?=\s|$) 判定，连点多个表情时需空格分隔才能逐个识别
function onEmojiSelect(face) {
  const code = qqfaceShortCode(face)
  insertAtCaret(code + ' ')
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

// 右键放大预览自定义表情（走 ContentPreviewModal 的可缩放图片预览）
function previewSticker(sticker) {
  if (!sticker || !sticker.data) return
  const src = sticker.mime ? `data:${sticker.mime};base64,${sticker.data}` : ''
  emit('openPreview', { type: 'image', title: sticker.name || '表情', src, text: '' })
}

async function addSticker() {
  if (sending.value) return;
  sending.value = true;
  try {
    const sel = await window.api.selectImage();
    if (!sel.success) { sending.value = false; return; }
    // 压缩：GIF 保留动画不压缩；其余图片压缩到 ≤100KB，避免"收藏表情超100KB"
    let data = sel.data;
    let mime = sel.mime;
    if (sel.mime && !/^image\/gif$/i.test(sel.mime)) {
      const result = await compressBase64Image(data, mime);
      if (result) { data = result.data; mime = 'image/jpeg'; }
    }
    store.stickers.push({ name: sel.name, data, mime });
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
  nextTick(() => focus());
}

function toggleEmoji() {
  emojiVisible.value = !emojiVisible.value;
  if (emojiVisible.value) favoritesVisible.value = false; // 与收藏面板互斥
}

function toggleFavorites() {
  favoritesVisible.value = !favoritesVisible.value;
  if (favoritesVisible.value) emojiVisible.value = false; // 与表情面板互斥
}

function focus() {
  inputEl.value?.focus();
}

// --- 双栏宽度拖拽 ---
// 拖到边缘再继续拖 SNAP 像素 → 收起该侧（左极限隐藏输入栏、右极限隐藏预览）；
// 收起后分隔条贴边保留，往回拖过 SNAP 即恢复。
const collapseSide = ref('');
function onSplitDragStart(e) {
  e.preventDefault();
  const splitEl = e.currentTarget.parentElement;
  if (!splitEl) return;
  const splitRect = splitEl.getBoundingClientRect();
  const W = splitRect.width;
  const SNAP = 56;
  const onMove = (ev) => {
    const x = ev.clientX - splitRect.left;
    if (W > 2 * SNAP && x < SNAP) { collapseSide.value = 'left'; return; }
    if (W > 2 * SNAP && x > W - SNAP) { collapseSide.value = 'right'; return; }
    if (collapseSide.value) collapseSide.value = '';
    splitLeftWidth.value = Math.max(120, Math.min(W - 120, x));
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

// --- 待发送文件管理 ---
function isImageFile(name) {
  return /\.(jpg|jpeg|png|gif|bmp|webp|ico)$/i.test(name || '');
}

function addPendingFile(name, size, data, mime) {
  const isImage = isImageFile(name);
  const thumbUrl = isImage && data && mime ? `data:${mime};base64,${data}` : '';
  pendingFiles.value.push({ name, size, data, mime, isImage, thumbUrl });
  nextTick(() => focus());
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

defineExpose({ inputEl, focus, mentionVisible, emojiVisible, replyTo, sending, errorMessage, tokenInfo, startReply, pendingFiles });
</script>
