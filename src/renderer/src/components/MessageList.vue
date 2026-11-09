<template>
  <Transition name="fade-down">
  <div class="multi-select-bar" v-if="store.multiSelectMode">
    <span class="msb-info">已选 {{ store.selectedMsgIds.length }} 条</span>
    <div class="msb-actions">
      <UiButton class="msb-btn" size="sm" variant="secondary" icon="fas fa-share" :disabled="!store.selectedMsgIds.length" @click="$emit('batchForward')">批量转发</UiButton>
      <UiButton class="msb-btn" size="sm" variant="ghost" icon="fas fa-times" @click="exitMultiSelect">退出多选</UiButton>
    </div>
  </div>
  </Transition>
  <div class="message-list-shell">
  <div class="message-area" ref="messageAreaEl" @scroll="onScroll" @click="onMessageAreaClick">
    <div class="load-more-hint-row" v-if="hasOlderMessages && !loadingMore">
      <span class="load-more-hint-text"><i class="fas fa-chevron-up"></i> 向上滚动加载更多</span>
    </div>
    <div class="load-more-spinner" v-if="loadingMore"><i class="fas fa-spinner motion-spin"></i> 加载中...</div>
    <template v-if="!visibleMessages.length && !hasOlderMessages">
      <div class="msg-skeleton motion-pulse"><UiSkeleton variant="circle" class="skeleton-avatar" :animated="false" /><UiSkeleton variant="rect" class="skeleton-bubble" :animated="false" /></div>
      <div class="msg-skeleton right motion-pulse"><UiSkeleton variant="circle" class="skeleton-avatar" :animated="false" /><UiSkeleton variant="rect" class="skeleton-bubble" :animated="false" /></div>
      <div class="msg-skeleton motion-pulse"><UiSkeleton variant="circle" class="skeleton-avatar" :animated="false" /><UiSkeleton variant="rect" class="skeleton-bubble" :animated="false" /></div>
    </template>
    <template v-for="item in messagesWithSeparators" :key="item.type === 'separator' ? 'sep_' + item.timestamp : item.data.id">
      <div v-if="item.type === 'separator'" class="msg-date-separator">{{ item.label }}</div>
      <div
        v-else
        class="msg-row"
        :class="[item.data.sender == selfUid ? 'right' : 'left', { 'multi-select-active': store.multiSelectMode, 'motion-message-in': item.data.sender == selfUid }]"
        :data-msg-id="item.data.id"
      >
        <div class="msg-checkbox" v-if="store.multiSelectMode && !isPatMsg(item.data)" :class="{ checked: store.selectedMsgIds.includes(item.data.id) }" @click.stop="toggleMsgSelect(item.data.id)">
          <i v-if="store.selectedMsgIds.includes(item.data.id)" class="fas fa-check"></i>
        </div>
        <template v-if="item.data.sender != selfUid">
          <div class="msg-avatar"
            @click.stop="onAvatarSingleClick(item.data.sender)"
            @dblclick="onAvatarDoubleClick(item.data.sender)"
            @contextmenu.prevent="pageType=='group'&&$emit('openGroupActionMenu', $event, item.data.sender)">
            <div class="avatar-placeholder-sm" :style="{ background: avatarTint(item.data.sender) }">{{ getAvatarInitial(item.data.sender) }}</div>
          </div>
          <div class="bubble-wrap">
            <div class="bubble-header">
              <span class="name"
              :style="{ color: getGradeColor(item.data.sender) }"
              :title="getGradeLabel(item.data.sender)"
              @click.stop="onAvatarSingleClick(item.data.sender)"
              @dblclick="onAvatarDoubleClick(item.data.sender)"
              @contextmenu.prevent="pageType=='group'&&$emit('openGroupActionMenu', $event, item.data.sender)">{{ displayName(msgSenderUser(item.data)) }}</span>
              <span class="time">{{ gettime2(item.data.send_time) }}</span>
            </div>
            <div class="bubble" :class="{ collapsed: isClamped(item.data) }"
              @contextmenu.prevent="onMsgMenu($event, item.data)">
              <!-- 投票：可交互卡片替代气泡 -->
              <PollCard
                v-if="pollOf(item.data)"
                :poll="pollOf(item.data).def"
                :result="pollOf(item.data).result"
                :own="false"
                :voting="votingPollId === String(item.data.id)"
                :name-of="pollVoterName"
                @vote="(pick, custom) => onPollVote(item.data, pick, custom)"
              />
              <div v-else class="bubble-content luogu-md" v-html="renderContent(item.data.content, item.data.sender)"></div>
            </div>
            <!-- 展开/收起：只有「超过收起高度且不会被切到图」的消息才出现，点一下原地切换，不再跳弹窗 -->
            <button
              v-if="isExpandable(item.data)"
              type="button"
              class="expand-btn"
              :aria-expanded="isExpanded(item.data) ? 'true' : 'false'"
              @click.stop="toggleExpand(item.data)"
            >{{ isExpanded(item.data) ? '收起' : '展开' }}</button>
          </div>
        </template>
        <template v-else>
          <div class="msg-avatar">
            <div class="avatar-placeholder-sm" :style="{ background: avatarTint(selfUid) }">{{ getAvatarInitial(selfUid) }}</div>
          </div>
          <div class="bubble-wrap bubble-wrap-self">
            <div class="bubble-header">
              <span class="time">{{ gettime2(item.data.send_time) }}</span>
            </div>
            <div class="bubble" :class="{ collapsed: isClamped(item.data) }"
              @contextmenu.prevent="onMsgMenu($event, item.data)">
              <PollCard
                v-if="pollOf(item.data)"
                :poll="pollOf(item.data).def"
                :result="pollOf(item.data).result"
                :own="true"
                :voting="votingPollId === String(item.data.id)"
                :name-of="pollVoterName"
                @vote="(pick, custom) => onPollVote(item.data, pick, custom)"
              />
              <div v-else class="bubble-content luogu-md" v-html="renderContent(item.data.content, item.data.sender)"></div>
            </div>
            <button
              v-if="isExpandable(item.data)"
              type="button"
              class="expand-btn"
              :aria-expanded="isExpanded(item.data) ? 'true' : 'false'"
              @click.stop="toggleExpand(item.data)"
            >{{ isExpanded(item.data) ? '收起' : '展开' }}</button>
          </div>
        </template>
      </div>
    </template>
  </div>
  <Transition name="fade">
    <UiIconButton class="scroll-to-bottom-btn" v-if="!isAtBottom" icon="fas fa-chevron-down" aria-label="滚动到底部" title="滚动到底部" round @click="scrollToBottom" />
  </Transition>
  </div>
  <MsgMenu
    v-if="msgCtx.show"
    :x="msgCtx.x"
    :y="msgCtx.y"
    :canDownload="msgCtx.canDownload"
    :canCollect="msgCtx.canCollect"
    :isOwn="msgCtx.isOwn"
    @copy="copyMsg"
    @forward="startForward"
    @download="downloadMsg"
    @reply="$emit('startReply', store.messages[msgCtx.msgId]); msgCtx.show = false"
    @collect="collectMsg"
    @multiselect="enterMultiSelect"
  />
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUpdated, onUnmounted, watch, nextTick } from 'vue';
import { store } from '../store.js';
import { gettime2, parseContent, parseMsgContent, displayName, getGradeColor, getGradeLabel, getAvatarInitial, formatDateSeparator, isSameDay, renderMarkdown, compressBase64Image, parsePoll, aggregatePoll, avatarTint, isTextLikeContent, esc } from '../utils.js';
import MsgMenu from './MsgMenu.vue';
import PollCard from './PollCard.vue';
import { useCurrentMessages } from '../composables/useCurrentMessages.js';
import { scrollToY, waitForMotion, motionDuration } from '../utils/motion.js';
import { UiButton, UiIconButton, UiSkeleton } from '../ui/index.js';


const props = defineProps({
  pageType: { type: String, required: true },
  pageId: { type: [Number, String], default: null },
  selfUid: { type: Number, default: null },
  expandedMsgs: { type: Object, required: true },
  visibleCount: { type: Number, required: true }
});

const emit = defineEmits([
  'sendPat',
  'openGroupActionMenu',
  'scrollToTop',
  'startReply',
  'openUserInfo',
  'forward',
  'batchForward',
  'openPreview',
  'vote'
]);

const messageAreaEl = ref(null);
const loadingMore = ref(false);
const isAtBottom = ref(true);
// 到底判定阈值（唯一来源；原 onScroll 60 / doScrollToBottom 10 两套已统一）
const AT_BOTTOM_THRESHOLD = 60;

const targetUser = computed(() => store.users?.[props.pageId] || null);
const targetGroup = computed(() => store.groups?.[props.pageId] || null);

const _allMessages = useCurrentMessages(() => props.pageType, () => props.pageId).currentMessages;

const currentMessages = _allMessages;

const hasOlderMessages = computed(() => currentMessages.value.length > props.visibleCount);

const visibleMessages = computed(() => {
  const all = currentMessages.value;
  if (all.length <= props.visibleCount) return all;
  return all.slice(all.length - props.visibleCount);
});

// 日期分组：在跨日消息间插入分隔线。
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
  isAtBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_THRESHOLD;
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
  try {
    return parseContent(msg, senderId);
  } catch (e) {
    // 单条消息渲染失败不能拖垮整个会话：content 来自服务端且字段类型不受控
    // （`{"type":"file","name":123}`、`mentions:["*"]` 之类都能让解析函数抛错），
    // 而 v-html 的渲染函数一抛错，Vue 会中断这一整块 patch —— 表现就是该会话白屏，
    // 且每次重渲染都再抛一次，进多少回都一样。这里降级成纯文本兜底。
    console.error('[render] 消息渲染失败，已降级为纯文本：', e);
    const raw = String(msg.content == null ? '' : msg.content);
    const text = raw.length > 500 ? raw.slice(0, 500) + '…' : raw;
    return '<div class="unknown-msg">' + esc(text || '[消息渲染失败]') + '</div>';
  }
}

// ========== 投票 ==========
const votingPollId = ref(null);

/** 会话内全部投票发起消息的解析+聚合结果（键 msg.id）；必须是 computed（模板访问三次，且数据源=poll 自带 votes） */
const pollMap = computed(() => {
  const map = new Map();
  const selfUid = props.selfUid;
  for (const msg of currentMessages.value || []) {
    if (!msg) continue;
    const def = parsePoll(parseMsgContent(msg.content));
    if (!def) continue;
    map.set(String(msg.id), { def, result: aggregatePoll(def, msg.id, selfUid) });
  }
  return map;
});

/** 若这条消息是投票发起，返回 { def, result }；否则 null */
function pollOf(msg) {
  if (!msg) return null;
  return pollMap.value.get(String(msg.id)) || null;
}

function msgSenderUser(msg) {
  return store.users?.[msg.sender] || { uid: msg.sender };
}

/** uid → 显示名（供投票选项悬浮提示）；votes 的键是字符串 uid，store.users 是数字键，这里归一 */
function pollVoterName(uid) {
  const u = store.users?.[Number(uid)] || store.users?.[uid];
  if (!u) return String(uid);
  return displayName(u) || String(uid);
}

/**
 * 用户点了投票卡片右下角「确认投票」→ 交给父级（ChatView）发送一条 vote 回复消息。
 * pick 为选中项下标数组；空数组 = 取消投票（聚合时不会计入任何选项）。
 */
function onPollVote(pollMsg, pick, custom) {
  if (!pollMsg) return;
  const id = String(pollMsg.id);
  votingPollId.value = id;
  // ⚠️ PollCard 现在会带第二个参数（自拟选项，开放题）；单选/普通票传空串。
  emit('vote', { poll: id, pick: Array.isArray(pick) ? pick : [], custom: String(custom == null ? '' : custom).trim() });
  // 乐观解锁：父级提交很快，1.2s 兜底复位（防父级异常时按钮永久锁死）
  setTimeout(() => { if (votingPollId.value === id) votingPollId.value = null; }, 1200);
}

// 单击头像/名字 → 打开用户信息；双击 → 拍一拍（与微信一致）
// 单击延迟 250ms 判定，双击时清除计时器只触发拍一拍
let avatarClickTimer = null;
function onAvatarSingleClick(uid) {
  clearTimeout(avatarClickTimer);
  avatarClickTimer = setTimeout(() => {
    avatarClickTimer = null;
    if (uid != null) emit('openUserInfo', Number(uid));
  }, 250);
}
function onAvatarDoubleClick(uid) {
  clearTimeout(avatarClickTimer);
  avatarClickTimer = null;
  if (uid != null) emit('sendPat', Number(uid));
}
onUnmounted(() => {
  if (avatarClickTimer) clearTimeout(avatarClickTimer);
  messageAreaEl.value?.removeEventListener('load', onMessageAreaLoad, true);
});

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

// ===== 长消息展开 / 收起 =====
// 设计见 tmp/design/msg-expand-collapse.md。两个概念必须分开：
//   expandableIds —— 系统测量结果：这条消息「能不能收」。纯内部状态，不进 store。
//   expandedMsgs  —— 用户点击产物：这条消息「现在是展开的吗」。由 ChatView 持有，
//                    切会话时清空（沿用原 collapsedMsgs 的位置与清理时机）。
// 系统只判断能不能收，绝不主动收起用户内容 —— 显示与否完全交给用户。
const CLAMP_LINES = 13;      // 收起后保留的整行数（与 CSS 的 --msg-clamp-lines 同源）
const BUBBLE_PAD_Y = 20;     // .bubble 的上下 padding 之和（10px × 2），见 message-list.css
// 未经测量就直接按「能收起」渲染的字符数门槛（乐观渲染，见 isExpandable 注释）。
// 取值依据：13 行 × 每行约 40 个中文字符 ≈ 520 字符，这里给 1.6 倍余量，
// 保证「短消息被误判成可收起」的概率极低，而超大消息首帧就能收起、不会跳。
const OPTIMISTIC_CHARS = 800;
const expandableIds = ref(new Set());
// 测量结果版本号：measureExpandableOnce 改了结论就 +1，让 isExpandable 所在的模板重算。
// 没有它的话，乐观判定为「可收起」的行在测量确认「其实不长」之后不会自动展开。
const measureTick = ref(0);

/**
 * 收起高度：按「整行」算，不用魔法数字。
 * 1.6 是 .bubble-content 的 line-height，与 CSS 的 calc(1.6em * var(--msg-clamp-lines) + 20px)
 * 严格对应 —— 两边必须同时改，否则收口会切在半行字上。
 */
function clampPx(bubble) {
  const fs = parseFloat(getComputedStyle(bubble).fontSize) || 14;
  return 1.6 * fs * CLAMP_LINES + BUBBLE_PAD_Y;
}

/**
 * 媒体消息：整条就是图片/表情/文件/投票，自身已限高，不需要展开按钮。
 * 注意 .chat-image 不带 data-image-msg 也在此判断范围内 —— 那是「图文混排」里的插图。
 */
function isMediaRow(row) {
  return !!row.querySelector(
    '.chat-image[data-image-msg="1"], .sticker-msg, .emoji-msg, .file-msg, .poll-card, video, iframe'
  );
}

/**
 * 收起线（气泡顶部往下 clampPx）如果正好穿过某张图，收起就会把图从中间切开，
 * 露出半张图 —— 比不收更难看。这种消息保留完整显示、不给按钮。
 */
function foldLineCutsImage(row, bubble) {
  const line = bubble.getBoundingClientRect().top + clampPx(bubble);
  return Array.from(row.querySelectorAll('.chat-image')).some((img) => {
    const r = img.getBoundingClientRect();
    return r.top < line && r.bottom > line;
  });
}

/**
 * 能否收起。
 * 只有「文本类」消息才有这个概念：图片 / 贴纸 / 文件 / 表情 / 拍了拍 / 投票本身就是定高的一块，
 * 内容再长也不是被截断的文字。这条必须放在最前面 —— 否则图片消息会先按「内容很长」乐观
 * 闪出一次展开按钮，等测量确认是媒体行再收回，用户看到的就是「打开瞬间按钮闪一下」。
 */
function isExpandable(msg) {
  if (!msg) return false;
  if (!isTextLikeContent(msg.content)) return false;
  if (pollOf(msg)) return false;
  measureTick.value;   // 订阅测量结果：测量完成后要重算，否则会一直停在乐观判定上
  if (expandableIds.value.has(msg.id)) return true;
  if (measuredMsgIds.has(msg.id)) return false;
  // 还没测出结论时的乐观判定 —— 这段是关键，别删：
  // 37KB 这类大消息渲染要 1-2 秒，等测量出来才算「可收起」的话，用户会先看到完整长文，
  // 然后整条突然被压缩、滚动位置被掀到底部（scrollHeight 骤减后 scrollTop 被夹到最底）。
  // 所以内容明显很长的消息首帧就按收起渲染；测量若确认「其实不长 / 收起线会切图」，
  // 再自动展开回去（那种情况只会多露内容，不会把用户甩到底部）。
  return String(msg.content || '').length > OPTIMISTIC_CHARS;
}

/** 用户是否已展开（只有能收的消息才有意义） */
function isExpanded(msg) {
  if (!msg) return false;
  return !!props.expandedMsgs[msg.id];
}

/** 收起态 = 能收 + 用户没展开 */
function isClamped(msg) {
  return isExpandable(msg) && !isExpanded(msg);
}

let measureRaf = 0;
let debugRound = 0;
// 每条消息「第一次被看到」的时刻。测量必须等它渲染完（字体、公式、代码高亮、表格列宽、
// 图片解码都会继续改变高度），所以：首见后 SETTLE_MS 内得出的高度只写结果、不锁定，
// 之后还要「连续两轮高度一致」才允许锁定。只测一次就锁死，是 37KB 大消息
// 「被默认展开且没有按钮」的成因（第一次量到的高度偏小 → 判成不需要收起 → 永久记住）。
const firstSeenAt = new Map();
const SETTLE_MS = 1200;
// 上一轮量到的自然高度，用于判断「连续两轮一致」
const lastHeights = new Map();
const measuredMsgIds = new Set();
// 结算期到期后再自动复核一次：没有新的 DOM 变化时 onUpdated 不会再触发，
// 只靠它会让「首轮测早了」的行永远停在错误结论上。
let settleTimer = 0;
const RETRY_MS = 300;          // 复核节流
const MAX_WAIT_MS = 15000;     // 兜底：超过这个时长还锁不住的行（比如懒加载图始终不加载）不再重试
let lockedCount = -1;          // 上一轮已锁定行数，用于判断要不要通知模板重算

function measureExpandableOnce() {
  measureRaf = 0;
  const area = messageAreaEl.value;
  if (!area) return;
  // 临时诊断：控制台执行 localStorage.setItem('debug_expand','1') 后刷新，
  // 即可看到每一行的判定过程；测完 localStorage.removeItem('debug_expand') 恢复安静。
  const DBG = (() => { try { return localStorage.getItem('debug_expand') === '1' } catch (e) { return false } })();
  const now = performance.now();
  const next = new Set(expandableIds.value);
  const rows = area.querySelectorAll('.msg-row');
  if (DBG) console.log('[expand] 第 ' + (++debugRound) + ' 轮测量，共 ' + rows.length +
    ' 行，已锁定 ' + measuredMsgIds.size);
  for (const row of rows) {
    const id = Number(row.dataset.msgId);
    // 消息 id 必须是数字：拿不到 id 的行会被整轮跳过，且不会有任何可见症状
    // （表现就是「这条消息没有展开按钮」）。诊断时把它打出来，避免这种静默失败。
    if (!id) {
      if (DBG) console.log('[expand] 跳过一行：data-msg-id=' + row.dataset.msgId + ' 不是有效数字');
      continue;
    }
    if (measuredMsgIds.has(id)) continue;
    const bubble = row.querySelector('.bubble');
    if (!bubble) {
      if (DBG) console.log('[expand] ' + id + ' 跳过：行内没有 .bubble');
      continue;
    }
    if (!firstSeenAt.has(id)) firstSeenAt.set(id, now);
    const settled = now - firstSeenAt.get(id) >= SETTLE_MS;
    if (isMediaRow(row)) {
      if (settled) measuredMsgIds.add(id);
      continue;
    }
    // 有图还没解码完：高度还不可信，本轮先不判定（load 事件会再次调度）。
    // 但结算期过后不能一直等 —— 懒加载 / 加载失败的图（表情图、外链图）可能永远不 complete，
    // 一直等下去这行就永远没有结论，用户看到的就是「默认展开且没有按钮」。
    // 所以：结算期后照常测量，图片高度由 .chat-image 的 max-height 兜住，不会失控。
    const pendingImgs = Array.from(row.querySelectorAll('img')).filter((img) => !img.complete);
    if (pendingImgs.length && !settled) {
      if (DBG) console.log('[expand] ' + id + ' 跳过：' + pendingImgs.length + ' 张图未解码完（结算期内，等下轮）');
      continue;
    }
    const scrollH = bubble.scrollHeight;
    const limit = clampPx(bubble);
    const cut = foldLineCutsImage(row, bubble);
    const expandable = !cut && scrollH > limit + 1;
    if (expandable) next.add(id); else next.delete(id);
    // 高度稳定（与上一轮相同）且已过结算期，才允许锁定 —— 否则下一轮继续复核。
    // 还有图没解码完时先不锁（图加载完高度会再变），但最多等到 MAX_WAIT_MS，
    // 免得一张永远加载不出来的图让这一行永远没有结论。
    const stable = lastHeights.get(id) === scrollH;
    lastHeights.set(id, scrollH);
    // 已经等够 MAX_WAIT_MS 还不稳定（超大 Markdown 的公式/高亮/字体可能一直在二三十秒里缓慢收缩），
    // 也必须结案：不结案就会一直重测、永远没有结论 —— 用户看到的就是「没有展开按钮」。
    // 结案时用当前这一轮的高度下判断，之后不再改。
    const giveUp = now - firstSeenAt.get(id) >= MAX_WAIT_MS;
    if ((settled && stable) || giveUp) measuredMsgIds.add(id);
    if (DBG) {
      console.log('[expand] ' + id + ' ' + (expandable ? '可收起' : '不需要收起') +
        ' scrollH=' + scrollH + ' 阈值=' + Math.round(limit) +
        ' 稳定=' + stable + ' 锁定=' + measuredMsgIds.has(id) +
        (pendingImgs.length ? ' 未解码图=' + pendingImgs.length : '') +
        (cut ? ' （收起线穿图）' : ''));
    }
  }
  // 只有集合真变了才写回，避免每轮测量都触发一次模板重渲染。
  // 必须比「内容」而不是比 size：一条从可收变不可收、另一条反过来时 size 不变，比 size 会漏更新。
  const prev = expandableIds.value;
  let changed = next.size !== prev.size;
  if (!changed) {
    for (const id of next) { if (!prev.has(id)) { changed = true; break; } }
  }
  if (changed) expandableIds.value = next;
  // 本轮有新行结案（或结论变化）时通知模板：乐观判定为「可收起」的行要靠这个重算回真实结论。
  if (changed || measuredMsgIds.size !== lockedCount) {
    lockedCount = measuredMsgIds.size;
    measureTick.value++;
  }
  if (DBG) {
    console.log('[expand] 本轮结论：可收起=[' + Array.from(next).join(',') + '] 锁定 ' +
      measuredMsgIds.size + '/' + rows.length);
  }
}

function scheduleMeasureExpandable() {
  if (measureRaf) return;
  // rAF 里再 nextTick：确保 DOM 已更新且仍在绘制前，避免「先铺满再收起」的跳动
  measureRaf = requestAnimationFrame(() => nextTick(measureExpandableOnce));
  scheduleSettleRecheck();
}

/**
 * 复核调度：结算期（SETTLE_MS）到了之后必须再量一次。
 * onUpdated 只在 DOM 变化时触发 —— 一条已经在页面上的大消息，等它彻底渲染完
 * 可能再也没有 DOM 变化，不主动复核的话「首轮测早了」的错误结论就会一直挂着。
 * 节流 300ms、最长重试 15 秒，避免给不加载的图死循环。
 */
function scheduleSettleRecheck() {
  if (settleTimer) return;
  settleTimer = setTimeout(() => {
    settleTimer = 0;
    const area = messageAreaEl.value;
    if (!area) return;
    const now = performance.now();
    let pending = false;
    for (const row of area.querySelectorAll('.msg-row')) {
      const id = Number(row.dataset.msgId);
      if (!id || measuredMsgIds.has(id)) continue;
      const seen = firstSeenAt.get(id);
      // 多给 1 秒：MAX_WAIT_MS 到点那次测量要能跑（它负责给「图永远加载不完」的行结案）
      if (seen === undefined || now - seen > MAX_WAIT_MS + 1000) continue;
      pending = true;
      break;
    }
    if (!pending) return;
    measureExpandableOnce();
    scheduleSettleRecheck();
  }, RETRY_MS);
}

/**
 * 展开 / 收起 + 滚动锚定。
 * 不做锚定的话：展开后按钮可能被推到视口外（用户失去「收起」入口），
 * 收起后视口可能停在被砍掉的中间位置（用户看到的是半截）。两种都只滚必要的距离。
 */
function toggleExpand(msg) {
  if (!msg) return;
  const area = messageAreaEl.value;
  const id = msg.id;
  const wasExpanded = isExpanded(msg);
  const btn = area && area.querySelector(`.msg-row[data-msg-id="${id}"] .expand-btn`);

  if (wasExpanded) delete props.expandedMsgs[id];
  else props.expandedMsgs[id] = true;

  nextTick(() => {
    if (!area) return;
    const areaRect = area.getBoundingClientRect();
    if (!wasExpanded) {
      // 刚展开：气泡变高，按钮可能跑到视口下方 —— 只补差值
      const br = btn && btn.getBoundingClientRect();
      if (br && br.bottom > areaRect.bottom) {
        area.scrollTop += br.bottom - areaRect.bottom + 8;
      }
    } else {
      // 刚收起：气泡顶部若已滚出视口上方，视口会停在被砍掉的中间 —— 拉回来
      const bubble = area.querySelector(`.msg-row[data-msg-id="${id}"] .bubble`);
      const bubRect = bubble && bubble.getBoundingClientRect();
      if (bubRect && bubRect.top < areaRect.top) {
        area.scrollTop += bubRect.top - areaRect.top - 8;
      }
    }
  });
}

// 图片解码完成会派发 load（不冒泡，用捕获监听），解码后高度才可信，重新调度一次测量
function onMessageAreaLoad() {
  scheduleMeasureExpandable();
}

// 容器尺寸变化（窗口缩放、侧栏折叠、字号设置）会让已经测过的结论失效，全部重测
let areaResizeObserver = null;
function resetMeasure() {
  measuredMsgIds.clear();
  firstSeenAt.clear();
  lastHeights.clear();
  expandableIds.value = new Set();
  scheduleMeasureExpandable();
}

onMounted(() => {
  scheduleMeasureExpandable();
  messageAreaEl.value?.addEventListener('load', onMessageAreaLoad, true);
  if (messageAreaEl.value && typeof ResizeObserver !== 'undefined') {
    let lastW = 0;
    areaResizeObserver = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w === lastW) return;   // 只关心宽度变化：高度变化是我们自己展开/收起造成的，重测会死循环
      lastW = w;
      resetMeasure();
    });
    areaResizeObserver.observe(messageAreaEl.value);
  }
});

onUnmounted(() => {
  if (areaResizeObserver) { areaResizeObserver.disconnect(); areaResizeObserver = null; }
  if (settleTimer) { clearTimeout(settleTimer); settleTimer = 0; }
  const area = messageAreaEl.value;
  if (area) area.removeEventListener('load', onMessageAreaLoad, true);
});

watch(() => [props.pageType, props.pageId], () => { resetMeasure(); });

onUpdated(() => {
  scheduleMeasureExpandable();
  injectCodeCopyButtons();
});

let lastMsgCount = 0;
// 初值必须是「当前会话 id」而不是 null：null 会让挂载后的第一批数据（懒加载补历史 / 首轮轮询）
// 被当成「切换了会话」，走 pageChanged 分支无条件瞬移到底部，把用户的滚动位置直接覆盖掉
// —— 表现就是「打开会话后往上翻，约 2s 又被弹回最下面」。
let lastPageId = props.pageId;
// 首批数据是否还没到位（挂载时列表还是空的，enter 钩子里的 scrollToBottomInstant 量的是空列表）
let pendingInitialPosition = true;
let scrollTimer = null;
// 统一走 utils/motion.js：默认 slow(260ms)+standard，reduced-motion / fx-lite 瞬时定位
function smoothScrollTo(el, targetTop, duration) {
  if (targetTop <= el.scrollTop) return;
  scrollToY(el, targetTop, { duration: duration ?? motionDuration('slow') });
}

function doScrollToBottom(pageChanged) {
  if (scrollTimer) clearTimeout(scrollTimer);
  const tryScroll = (attempt) => {
    nextTick(() => {
      if (messageAreaEl.value) {
        const el = messageAreaEl.value;
        if (pageChanged) {
          // 切换会话：直接定位到底部，不播放"从上往下"的滚动动画
          el.scrollTop = el.scrollHeight;
          return;
        }
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_THRESHOLD;
        if (!atBottom || attempt === 0) {
          smoothScrollTo(el, el.scrollHeight);
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
  const grew = msgs.length > lastMsgCount;
  // 自动滚动：只有「插入前就在底部」才跟随滚到最新，上翻看历史时保持不动；例外：自己刚发的总滚到底
  if (pageChanged) {
    doScrollToBottom(true);
  } else if (grew) {
    const wasAtBottom = isAtBottom.value;
    const last = msgs[msgs.length - 1];
    const mineJustSent = !!(last && props.selfUid != null && Number(last.sender) === Number(props.selfUid));
    // 首批数据到达（打开会话时列表还是空的）：用户没动过滚动条就瞬时落底，
    // 避免「先停在顶部、再动画滑下来」。用户已经开始上翻则一律不打断。
    if (pendingInitialPosition && wasAtBottom) doScrollToBottom(true);
    else if (wasAtBottom || mineJustSent) doScrollToBottom(false);
  }
  if (grew) pendingInitialPosition = false;
  lastMsgCount = msgs.length;
});

watch(() => props.pageId, () => {
  doScrollToBottom(true);
});

function scrollToBottom() {
  nextTick(() => {
    if (messageAreaEl.value) {
      smoothScrollTo(messageAreaEl.value, messageAreaEl.value.scrollHeight);
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
  // 目标消息可能正收着：先展开，否则跳过去只能看到被截断的前 13 行
  if (expandableIds.value.has(msgId)) props.expandedMsgs[msgId] = true;
  const idx = currentMessages.value.findIndex(m => m.id === msgId);
  if (idx >= 0 && idx < currentMessages.value.length - props.visibleCount) {
    emit('scrollToTop', 0, true);
  }
  nextTick(() => {
    const el = messageAreaEl.value?.querySelector(`[data-msg-id="${msgId}"]`);
    if (el) {
      const area = messageAreaEl.value;
      if (area) {
        const areaRect = area.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        // 居中定位：等价于 scrollIntoView({block:'center'})，但走统一滚动 API
        const centerTop = elRect.top - areaRect.top + area.scrollTop - area.clientHeight / 2 + elRect.height / 2;
        scrollToY(area, Math.max(0, centerTop), { duration: motionDuration('slow') });
      }
      el.classList.add('motion-highlight');
      waitForMotion(el, { timeout: motionDuration('hold') + 200 }).then(() => el.classList.remove('motion-highlight'));
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
const msgCtx = reactive({ show: false, x: 0, y: 0, msgId: null, msgContent: '', canDownload: false, canCollect: false, isOwn: false });

function onMsgMenu(e, msg) {
  e.preventDefault();
  const obj = parseMsgContent(msg.content);
  if (obj && obj.type === 'pat') return;
  const isFile = obj && obj.type === 'file';
  const isSticker = obj && obj.type === 'sticker';
  const isImage = isFile && /^image\//.test(obj.mime || '');
  const isOwn = msg.sender == props.selfUid;
  msgCtx.show = false;
  msgCtx.x = e.clientX;
  msgCtx.y = e.clientY;
  msgCtx.msgId = msg.id;
  msgCtx.msgContent = msg.content;
  msgCtx.canDownload = isFile || isSticker;
  msgCtx.canCollect = isSticker || isImage;
  msgCtx.isOwn = isOwn;
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
        // 压缩后添加表情：GIF 保留动画不压缩，其余压缩到 ≤100KB，避免"表情超100KB"
        let data = obj.data;
        let mime = obj.mime;
        if (!/^image\/gif$/i.test(mime)) {
          const r = await compressBase64Image(data, mime);
          if (r) { data = r.data; mime = 'image/jpeg'; }
        }
        store.stickers.push({ name: obj.name || '表情', data, mime });
      }
    }
  }
  msgCtx.show = false;
}

function startForward() {
  emit('forward', msgCtx.msgContent);
  msgCtx.show = false;
}

// --- 预览 ---
// 长消息不再走「消息详情」弹窗：原地展开即可看全文（见 toggleExpand）。
// openPreview 只服务图片 / 文件 / PDF 自己的预览通道。

function openPreview(obj) {
  if (obj.type === 'image') {
    const src = obj.data && obj.mime ? `data:${obj.mime};base64,${obj.data}` : (obj.src || '');
    // data/mime 一并透传：预览弹层底部栏的「下载」需要原始 base64 才能落盘（src 可能是 blob: URL，无法直接保存）
    emit('openPreview', {
      type: 'image',
      title: obj.name || '图片预览',
      src: src,
      text: '',
      mediaData: obj.data || '',
      mediaMime: obj.mime || ''
    });
    } else if (obj.type === 'file' && obj.data) {
    const isImage = /^image\//.test(obj.mime || '');
    if (isImage) {
      emit('openPreview', {
        type: 'image',
        title: obj.name || '图片预览',
        src: `data:${obj.mime};base64,${obj.data}`,
        text: '',
        mediaData: obj.data,
        mediaMime: obj.mime || ''
      });
    } else if (/\.pdf$/i.test(obj.name || '')) {
      // PDF：内嵌 iframe 预览（Chromium 内置 PDF 查看器）
      emit('openPreview', {
        type: 'pdf',
        title: obj.name || 'PDF 预览',
        src: `data:application/pdf;base64,${obj.data}`,
        text: '',
        mediaData: obj.data,
        mediaMime: 'application/pdf'
      });
    } else if (/\.(txt|md|json|js|ts|css|html|xml|csv|log|py|java|c|cpp|h|sh|bat|yaml|yml|ini|cfg|conf|toml)$/i.test(obj.name || '')) {
      try {
        // atob 返回 Latin-1 二进制字符串，直接当文本会中文乱码（mojibake）；须按 UTF-8 解码
        const binary = atob(obj.data);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        const decoded = new TextDecoder('utf-8').decode(bytes);
        const isMd = /\.md$/i.test(obj.name || '');
        emit('openPreview', {
          type: isMd ? 'html' : 'text',
          title: obj.name || '文本预览',
          src: '',
          // markdown 文件渲染为 HTML（支持公式/代码块），其余按纯文本
          text: isMd ? renderMarkdown(decoded) : decoded
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
  const patUserEl = e.target.closest('.pat-user');
  if (patUserEl) {
    const uid = patUserEl.dataset.uid;
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
    const base64Data = fileEl.dataset.fileB64;
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
    const mime = imgEl.dataset.mime;
    openPreview({ type: 'image', src, name: '图片', data: src.startsWith('blob:') ? '' : imgEl.dataset.media, mime });
    return;
  }
  const stickerEl = e.target.closest('.sticker-msg img');
  if (stickerEl) {
    e.preventDefault();
    e.stopPropagation();
    const src = stickerEl.src;
    const mime = stickerEl.dataset.mime;
    openPreview({ type: 'image', src, name: '表情', data: src.startsWith('blob:') ? '' : stickerEl.dataset.media, mime });
    return;
  }
}

defineExpose({ messageAreaEl, scrollToBottom, scrollToBottomInstant, jumpToMessage, msgCtx, exitMultiSelect });
</script>

<style scoped src="../css/message-list.css"></style>
