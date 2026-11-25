<template>
  <div
    class="msg-row"
    :class="[
      isSelf ? 'right' : 'left',
      {
        'multi-select-active': multiSelectMode,
        'motion-message-in': isSelf,
        'bubble-media-only': mediaFlags.mediaOnly,
        'bubble-file-only': mediaFlags.fileOnly,
        'bubble-has-image-msg': mediaFlags.hasImageMsg,
        'bubble-has-pat': mediaFlags.hasPat,
      },
    ]"
    :data-msg-id="msg.id"
  >
    <UiCheckbox
      v-if="multiSelectMode && !isPat"
      class="msg-checkbox-wrap"
      :modelValue="selected"
      aria-label="选择消息"
      @update:modelValue="$emit('toggleSelect', msg.id)"
      @click.stop
    />

    <div
      class="msg-avatar"
      @click.stop="!isSelf && $emit('avatarClick', msg.sender)"
      @dblclick="!isSelf && $emit('avatarDblClick', msg.sender)"
      @contextmenu.prevent="!isSelf && pageType === 'group' && $emit('groupMenu', $event, msg.sender)"
    >
      <UiAvatar :name="avatarInitial" :color="avatarBg" :size="36" shape="rounded" />
    </div>

    <div class="bubble-wrap" :class="{ 'bubble-wrap-self': isSelf }">
      <div class="bubble-header">
        <span
          v-if="!isSelf"
          class="name"
          :style="{ color: gradeColor }"
          :title="gradeLabel"
          @click.stop="$emit('avatarClick', msg.sender)"
          @dblclick="$emit('avatarDblClick', msg.sender)"
          @contextmenu.prevent="pageType === 'group' && $emit('groupMenu', $event, msg.sender)"
        >{{ senderName }}</span>
        <span class="time">{{ timeText }}</span>
      </div>

      <div
        class="bubble"
        :class="{ collapsed: clamped }"
        @contextmenu.prevent="$emit('contextMenu', $event, msg)"
      >
        <PollCard
          v-if="poll"
          :poll="poll.def"
          :result="poll.result"
          :own="isSelf"
          :voting="voting"
          :name-of="pollVoterName"
          @vote="(pick, custom, customPick) => $emit('vote', msg, pick, custom, customPick)"
        />
        <!-- v-memo：多选勾选 / voting / 其它 prop 变化导致本组件重渲染时，跳过这块
             （可能上千节点）v-html 子树的 patch，省掉逐节点 diff。
             deps 带上 !!poll 是便宜的防御性维度（本分支内它恒为 false，见 @render 汇报）；
             投票卡 ↔ 正文切换的正确性由 Vue 的「重新挂载分支」路径保证，已用探针验证：
             切到投票卡再切回、切回后再换内容，都正常显示。 -->
        <div
          v-else
          v-memo="[displayHtml, !!poll]"
          ref="contentEl"
          class="bubble-content luogu-md"
          v-html="displayHtml"
          @dragstart="onBubbleDragStart"
        ></div>
      </div>

      <button
        v-if="expandable"
        type="button"
        class="expand-btn"
        :aria-expanded="expanded ? 'true' : 'false'"
        @click.stop="$emit('toggleExpand', msg)"
      >{{ expanded ? '收起' : '展开' }}</button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { UiAvatar, UiCheckbox } from '@/ui'
import { handleFileDragStart, decorateCodeBlocks } from '../../composables/chat/useMessageActions.js'
import PollCard from './PollCard.vue'

defineOptions({ name: 'MessageBubble' })

function onBubbleDragStart(e) {
  if (handleFileDragStart(e)) {
    e.stopPropagation()
  }
}

const props = defineProps({
  msg: { type: Object, required: true },
  pageType: { type: String, required: true },
  isSelf: { type: Boolean, default: false },
  multiSelectMode: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  isPat: { type: Boolean, default: false },
  avatarInitial: { type: String, default: '' },
  avatarBg: { type: String, default: '' },
  senderName: { type: String, default: '' },
  gradeColor: { type: String, default: '' },
  gradeLabel: { type: String, default: '' },
  timeText: { type: String, default: '' },
  poll: { type: Object, default: null },
  voting: { type: Boolean, default: false },
  pollVoterName: { type: Function, required: true },
  renderedHtml: { type: String, default: '' },
  clamped: { type: Boolean, default: false },
  expandable: { type: Boolean, default: false },
  expanded: { type: Boolean, default: false },
})

defineEmits([
  'toggleSelect',
  'avatarClick',
  'avatarDblClick',
  'groupMenu',
  'contextMenu',
  'vote',
  'toggleExpand',
])

/* ==========================================================================
 * 1) 渲染结果稳定化（避免「内容没变、却整段重建 DOM」）
 * --------------------------------------------------------------------------
 * 上游 markdown/index.js 的 postProcess() 每次渲染都会给标题 / 脚注 id 换一个
 * 新的 `rNN-` 序号前缀（同页多实例唯一性所需）。utils/message.js 的 parseContent
 * 缓存（300 条 FIFO）命中时串是稳定的，但历史消息一多（滚动加载、来回切会话）
 * 就会被挤出去；重新解析后同一条含标题/脚注的消息会拿到「只差 id 前缀」的新串。
 *
 * 直接把新串交给 v-html，浏览器会整段销毁重建 innerHTML：上千个节点重新创建 +
 * 重新解析 HTML + 其中 <img> 重新解码（图片会闪）。而两串视觉上完全等价。
 *
 * 因此这里做**每实例**（不是模块级 Map，所以不会和 ThemePreviewStage 之类
 * 同 id 的 mock 消息串味）的记忆化：
 *   · 快速路径：串完全相同 → 直接返回（日常滚动是字符串恒等比较）；
 *   · 归一化后相同 **且消息内容严格同一** → 沿用上一次的串（id 前缀差异被吸收）；
 *   · 归一化只处理 `id="…"` / `href="#…"` 这两个**受控位置**，不再对整串做
 *     `\br\d+-` 全局替换 —— 正文里恰好出现 `r12-` 这样的文字时不会被误伤，
 *     也就不会出现「内容变了却返回旧 HTML」。
 * 消息内容一变（投票合并、补同步覆盖）就无条件采用新串。
 * ========================================================================== */
const RENDER_ID_RE = /(\sid=")r\d{1,7}-/g
const RENDER_HREF_RE = /(\shref="#)r\d{1,7}-/g

function normalizeRenderUids(html) {
  return html.replace(RENDER_ID_RE, '$1').replace(RENDER_HREF_RE, '$1')
}

let appliedHtml = ''
let appliedRawContent = ''
let appliedNorm = ''

const displayHtml = computed(() => {
  const html = props.renderedHtml || ''
  if (!html) return ''
  if (html === appliedHtml) return appliedHtml
  const rawContent = props.msg ? props.msg.content : ''
  if (appliedHtml && rawContent === appliedRawContent) {
    if (!appliedNorm) appliedNorm = normalizeRenderUids(appliedHtml)
    if (normalizeRenderUids(html) === appliedNorm) return appliedHtml
  }
  appliedHtml = html
  appliedRawContent = rawContent
  appliedNorm = ''
  return html
})

/* ==========================================================================
 * 2) 媒体语义类：替代 message-list.css 里的祖先级 :has()
 * --------------------------------------------------------------------------
 * 原先「纯媒体气泡去底色/去内边距」靠 `.msg-row:has(:is(.chat-image…)) .bubble`
 * 这类选择器表达。:has() 的代价落在**每一次样式重算**上（浏览器要对每行的整棵
 * 子树做匹配），几百行同时在屏时这笔钱每一帧都要付。这里在内容落地后只查一次
 * DOM，把结果写成行级类名，样式表就可以退化成普通类选择器。
 *
 * 判断口径与原来的 :has() 逐条对齐（不多不少）：
 *   mediaOnly   ← :is(.chat-image[data-image-msg="1"], .sticker-msg, .emoji-msg)
 *   fileOnly    ← .file-msg 且没有 .file-text-content
 *   hasImageMsg ← .chat-image[data-image-msg="1"]（气泡最大宽度用）
 *   hasPat      ← .pat-msg
 * 每次内容变化只跑一次 querySelector，且这些查询都发生在 post flush（DOM 就绪），
 * 不会引入额外强制布局。
 * ========================================================================== */
const mediaFlags = reactive({ mediaOnly: false, fileOnly: false, hasImageMsg: false, hasPat: false })

function syncMediaFlags(el) {
  if (!el || typeof el.querySelector !== 'function') return
  const mediaOnly = !!el.querySelector('.chat-image[data-image-msg="1"], .sticker-msg, .emoji-msg')
  const hasFile = !!el.querySelector('.file-msg')
  const fileOnly = hasFile && !el.querySelector('.file-text-content')
  const hasImageMsg = !!el.querySelector('.chat-image[data-image-msg="1"]')
  const hasPat = !!el.querySelector('.pat-msg')
  if (mediaFlags.mediaOnly !== mediaOnly) mediaFlags.mediaOnly = mediaOnly
  if (mediaFlags.fileOnly !== fileOnly) mediaFlags.fileOnly = fileOnly
  if (mediaFlags.hasImageMsg !== hasImageMsg) mediaFlags.hasImageMsg = hasImageMsg
  if (mediaFlags.hasPat !== hasPat) mediaFlags.hasPat = hasPat
}

/* ==========================================================================
 * 3) 图片 / 表情：懒加载 + 异步解码 + 独占块图片尺寸占位
 * --------------------------------------------------------------------------
 * v-html 里的 <img> 由解析器生成，没有 loading/decoding。DOM 落地后一次性
 * （每个节点只处理一次）补上：
 *   - loading="lazy"     离屏图片不参与首次布局 / 解码 / 绘制；
 *   - decoding="async"   解码不阻塞主线程（滚动卡顿很大一部分来自同步解码）；
 *   - .md-img-pending    只加给**独占块**且未声明 width/height 的图片：内容是
 *                        从 0 高度长出来的，先占 48px 再去掉，比完全不留占位少跳一次。
 *                        行内小图（alt 徽标、非 qqface 小表情）不加，否则图到位时
 *                        反而会「缩回去」，比改动前更跳。
 *   - 22px 的 QQ 表情是固定尺寸行内图，只加 async 解码、不做懒加载（避免滚到时一片空白）。
 * 代码块复制按钮也在同一个钩子里按「这一条气泡」注入（见 useMessageActions.js
 * decorateCodeBlocks 注释：从 onUpdated 全列表扫描改成渲染侧按气泡一次）。
 * ========================================================================== */
const contentEl = ref(null)

/** 图片是否独占一个块（父节点里除了它没有别的实质内容） */
function isStandaloneImage(img) {
  const parent = img.parentElement
  if (!parent) return false
  // 解析器给 Markdown 图片包了 .luogu-img-wrapper（display:inline-block），
  // 它本身就是为「独立成块」准备的容器。
  if (parent.classList && parent.classList.contains('luogu-img-wrapper')) return true
  if (parent.querySelectorAll('img').length !== 1) return false
  // 父节点里除图片外还有文字 → 行内图，不预留
  const text = (parent.textContent || '').replace(/\s+/g, '')
  return text.length === 0
}

function decorateBubbleContent() {
  const root = contentEl.value
  if (!root || !root.querySelectorAll) return
  syncMediaFlags(root)
  decorateCodeBlocks(root)
  const imgs = root.querySelectorAll('img')
  for (const img of imgs) {
    if (img.dataset.mdDeco === '1') continue
    img.dataset.mdDeco = '1'
    img.setAttribute('decoding', 'async')
    if (img.classList.contains('qqface')) continue
    if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy')
    const sized = img.hasAttribute('width') || img.hasAttribute('height')
    if (sized || img.complete || !isStandaloneImage(img)) continue
    img.classList.add('md-img-pending')
    const done = () => {
      img.classList.remove('md-img-pending')
      img.removeEventListener('load', done)
      img.removeEventListener('error', done)
    }
    img.addEventListener('load', done, { once: true })
    img.addEventListener('error', done, { once: true })
  }
}

onMounted(decorateBubbleContent)
watch(displayHtml, decorateBubbleContent, { flush: 'post' })
</script>
