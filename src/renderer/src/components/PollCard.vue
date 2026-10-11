<template>
  <!-- 投票卡片：由 MessageList 在检测到 **poll 发起消息**时渲染，替代默认气泡。
       数据来自「poll 消息自带的 votes 字段」的客户端聚合，无服务端参与。
       ⚠️ 2026-10-06 起投票回复（vote）不再单独成消息、也不单独渲染（票并进 poll）。
       ⚠️ 本组件只负责展示与交互，聚合逻辑全部在 utils.js 的 aggregatePoll（可单测）。 -->
  <div class="poll-card" :class="{ 'poll-card--own': own }">
    <div class="poll-head">
      <i class="fas fa-square-poll-vertical poll-head-icon"></i>
      <span class="poll-tag">投票</span>
      <span v-if="poll.multi" class="poll-tag poll-tag--multi">多选</span>
      <span v-if="limitTag" class="poll-tag poll-tag--limit">{{ limitTag }}</span>
      <span v-if="result.allowCustom" class="poll-tag poll-tag--open">开放题</span>
      <span v-if="result.expired" class="poll-tag poll-tag--expired">已截止</span>
    </div>

    <div class="poll-q">{{ poll.q }}</div>

    <div class="poll-opts">
      <div
        v-for="(opt, i) in poll.opts"
        :key="i"
        class="poll-opt"
        :class="{
          'poll-opt--picked': picked(i),
          'poll-opt--disabled': !interactive,
          'poll-opt--clickable': interactive,
        }"
        :title="votersTitle(i)"
        @click.stop="toggle(i)"
      >
        <!-- 结果条：宽度按占比，`min-width` 保证 0 票也有一条可见的底 -->
        <span class="poll-opt-bar" :style="{ width: pct(i) }"></span>
        <span class="poll-opt-check" :class="{ 'poll-opt-check--on': picked(i) }">
          <i v-if="picked(i)" class="fas fa-check"></i>
        </span>
        <span class="poll-opt-label">{{ opt }}</span>
        <span class="poll-opt-meta">
          <b>{{ result.counts[i] }}</b> 票 ·
          <span class="poll-opt-pct">{{ Number(pct(i).replace('%', '')).toFixed(0) }}%</span>
        </span>
      </div>

      <!-- 开放题：他人自拟的选项（来自聚合结果，按文本分组；仅展示，不可点选） -->
      <div
        v-for="(o, j) in extraOptions"
        :key="'x' + j"
        class="poll-opt poll-opt--extra"
        :class="{ 'poll-opt--picked': isMyCustom(o.label) }"
        :title="extraVotersTitle(j)"
      >
        <span class="poll-opt-bar" :style="{ width: pctOf(o.count) }"></span>
        <span class="poll-opt-check poll-opt-check--custom" :class="{ 'poll-opt-check--on': isMyCustom(o.label) }">
          <i v-if="isMyCustom(o.label)" class="fas fa-check"></i>
          <i v-else class="fas fa-pen"></i>
        </span>
        <span class="poll-opt-label">{{ o.label }}</span>
        <span class="poll-opt-meta">
          <b>{{ o.count }}</b> 票 ·
          <span class="poll-opt-pct">{{ Number(pctOf(o.count).replace('%', '')).toFixed(0) }}%</span>
        </span>
      </div>

      <!-- 开放题：自拟输入行（仅「开放题 + 仍可投票」时出现） -->
      <div v-if="showCustomInput" class="poll-custom">
        <i class="fas fa-pen poll-custom-icon"></i>
        <input
          class="poll-custom-input"
          v-model="customDraft"
          :maxlength="POLL_MAX_OPT_LEN"
          :placeholder="poll.multi ? '也可以自己填一个选项…' : '或者自己填一个选项…'"
          @click.stop
        />
      </div>
    </div>

    <div class="poll-hint" v-if="limitHint"><i class="fas fa-circle-info"></i> {{ limitHint }}</div>

    <!-- 合法性检测：被判定作废的投票人（云端仍是明文消息，仅靠客户端甄别） -->
    <div class="poll-invalid" v-if="invalidVoters.length">
      <i class="fas fa-triangle-exclamation"></i>
      <span>以下投票无效：{{ invalidText }}</span>
    </div>

    <div class="poll-foot">
      <span class="poll-foot-total">共 {{ result.total }} 票</span>
      <span v-if="poll.until && !result.expired" class="poll-foot-until">
        {{ untilText }} 截止
      </span>
      <span v-if="result.expired" class="poll-foot-until">已截止，仅可查看结果</span>
      <template v-if="!result.expired && !readonly">
        <!-- ⚠️ 点选项只切换勾选，点了右下角「确认投票」才真正提交（2026-10-02 改） -->
        <span class="poll-foot-dirty" v-if="dirty && !voted">已选 {{ selCount }} 项</span>
        <span class="poll-foot-voting" v-if="voting"><i class="fas fa-spinner"></i> 提交中…</span>
        <!-- 已投票：只显示结果，不可再改票（用户明确要求） -->
        <span class="poll-foot-done" v-else-if="voted"><i class="fas fa-check"></i> 已投票</span>
        <button
          v-else
          type="button"
          class="poll-submit"
          :disabled="!canSubmit"
          :title="submitTitle"
          @click.stop="submit"
        >{{ submitLabel }}</button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { POLL_INVALID_TEXT, POLL_MAX_OPT_LEN } from '../utils.js'

const props = defineProps({
  /** parsePoll() 的返回值:{ q, opts, multi, until, maxSelect, allowCustom, ... } */
  poll: { type: Object, required: true },
  /** aggregatePoll() 的返回值:{ counts, total, myPick, expired, multi, extraOptions, invalidVoters, myCustom, ... } */
  result: { type: Object, required: true },
  /** 是否是自己的发言（仅用于视觉区分，不影响交互） */
  own: { type: Boolean, default: false },
  /** 是否禁止投票（如已退出会话 / 非群聊成员） */
  readonly: { type: Boolean, default: false },
  /** 提交中（防连点） */
  voting: { type: Boolean, default: false },
  /** uid → 显示名 的解析函数（悬浮提示 / 无效投票人展示）；由父层注入，不传则退化为 uid */
  nameOf: { type: Function, default: null },
})

const emit = defineEmits(['vote'])

// 本地乐观选择：点选项立刻反馈，提交成功后由 props.result.myPick 归一
const localPick = ref([])
/** 服务端已确认的选择（来自聚合结果） */
const committed = ref([])
/** 自拟选项（开放题）：本地乐观值 / 已确认值 / 输入框草稿 */
const localCustom = ref('')
const committedCustom = ref('')
const customDraft = ref('')
/** 触达限选数时的瞬时提示（不打断操作，仅提示） */
const limitHint = ref('')

/** 两个下标数组是否等价（顺序无关） */
const samePick = (a, b) =>
  a.length === b.length && a.every((x) => b.includes(x))

watch(
  () => props.result.myPick,
  (v) => {
    const next = Array.isArray(v) ? [...v] : []
    const nextCustom = props.result.myCustom == null ? '' : String(props.result.myCustom).trim()
    // ⚠️⚠️ 内容未变（只是引用变了）必须直接返回，绝不能动 localPick / localCustom。
    //   `result` 来自 MessageList 的 `pollMap` computed —— 会话里任何消息变动
    //   （轮询刷新 / 收到新消息 / 别人投票）都会重算聚合，产出一个**新的 myPick 数组**，
    //   引用必变、内容可能一模一样。deep watch 照样触发 → 若在这里无条件
    //   `localPick = [...committed]`，用户刚勾的选项会被瞬间冲掉
    //   （用户报障：「投票选了之后一秒就没了」，秒数与 onPollVote 的 1.2s 兜底复位吻合）。
    //   ⚠️ 自拟文本同理：只比内容，草稿没提交前不能被刷新冲掉。
    if (samePick(next, committed.value) && String(committedCustom.value || '') === nextCustom) return
    committed.value = next
    committedCustom.value = nextCustom
    // 提交中不覆盖：否则父层回写延迟会把用户刚点的选择冲掉
    if (!props.voting) {
      localPick.value = [...next]
      localCustom.value = nextCustom
      customDraft.value = nextCustom
    }
  },
  { immediate: true, deep: true }
)

/** 草稿 → 本地自拟值（裁长度、去首尾空格）；输入即清掉旧的限选提示 */
watch(customDraft, (v) => {
  localCustom.value = String(v == null ? '' : v).trim().slice(0, POLL_MAX_OPT_LEN)
  limitHint.value = ''
})

/**
 * 截止时间到点自愈。
 * ⚠️ `result.expired` 由父层 `pollMap` computed 算出，而它只在消息变动时重算 ——
 *    页面静置时**没有事件驱动它刷新**。于是「开着聊天窗口跨过截止时刻」时，
 *    卡片还显示成可投票，点了还真能发出去（投票无服务端校验，`until` 纯前端约束）。
 *    这里按本地时钟补判一次，并到点后停表。
 */
const nowTick = ref(Date.now())
let untilTimer = null
const expiredNow = computed(() => {
  const u = Number(props.poll.until) || 0
  return !!u && nowTick.value / 1000 > u
})
function syncUntilTimer() {
  if (untilTimer) { clearInterval(untilTimer); untilTimer = null }
  const u = Number(props.poll.until) || 0
  if (!u || expiredNow.value) return // 没设截止时间 / 已过期 → 不用跑表
  untilTimer = setInterval(() => {
    nowTick.value = Date.now()
    if (expiredNow.value && untilTimer) { clearInterval(untilTimer); untilTimer = null }
  }, 1000)
}
onMounted(syncUntilTimer)
onUnmounted(() => { if (untilTimer) clearInterval(untilTimer) })

const locked = computed(() => props.readonly || props.result.expired || expiredNow.value || props.voting)
/** 与已提交状态有差异 = 有未提交的改动（内置勾选 或 自拟文本 任一变了都算） */
const dirty = computed(() => {
  const a = [...localPick.value].sort().join(',')
  const b = [...committed.value].sort().join(',')
  if (a !== b) return true
  return String(localCustom.value || '').trim() !== String(committedCustom.value || '').trim()
})
/** 已投票（一次性、不可改票，卡片只读）；⚠️ 纯自拟票内置 myPick 为空，须把自拟也算进已投 */
const voted = computed(() => committed.value.length > 0 || !!String(committedCustom.value || '').trim())
/** 选项区能否点击：未投票 且 未截止 且 非只读 且 非提交中 */
const interactive = computed(() => !locked.value && !voted.value)

/** 多选上限（0 = 不限）；聚合结果优先，否则回退到 poll 定义 */
const maxSel = computed(() => {
  if (!props.poll.multi) return 0
  return (Number(props.result.maxSelect) || 0) || (Number(props.poll.maxSelect) || 0)
})
const limitTag = computed(() => (maxSel.value > 0 ? `最多选 ${maxSel.value} 项` : ''))
/** 已选数量 = 内置勾选 + 自拟（自拟最多占 1 项） */
const selCount = computed(() =>
  localPick.value.length + (String(localCustom.value || '').trim() ? 1 : 0))
const overLimit = computed(() => maxSel.value > 0 && selCount.value > maxSel.value)

/** 可提交 = 有改动 **且** 至少选了一项（勾选或自拟）**且** 未超限选数。
 *  ⚠️ 为什么要分开：把已选的项取消勾选会让 dirty 为 true，但空选是**撤票**语义
 *     （见 submit 的空选守卫），若只按 dirty 亮按钮，用户会看到「可点但点了没反应」。 */
const canSubmit = computed(() => dirty.value && selCount.value > 0 && !overLimit.value)
const submitLabel = computed(() => {
  if (!selCount.value) return '至少选一项'
  if (overLimit.value) return `最多选 ${maxSel.value} 项`
  return '确认投票'
})
const submitTitle = computed(() => {
  if (!selCount.value) return '请先勾选选项或填写自拟选项'
  if (overLimit.value) return `多选最多只能选 ${maxSel.value} 项`
  return '提交投票'
})

/** 开放题：自拟输入行的显示条件 */
const showCustomInput = computed(() => !!props.result.allowCustom && interactive.value)

/** 聚合产出的「他人自拟选项」与「无效投票人」（老父层可能不传，兜底空数组） */
const extraOptions = computed(() => props.result.extraOptions || [])
const invalidVoters = computed(() => props.result.invalidVoters || [])
const invalidText = computed(() =>
  invalidVoters.value
    .map((v) => {
      const who = props.nameOf ? props.nameOf(v.uid) : String(v.uid)
      const why = POLL_INVALID_TEXT[v.reason] || '不合规'
      return `${who}（${why}）`
    })
    .join('、'))

function picked(i) {
  return localPick.value.includes(i)
}

/** 这条自拟选项是否就是我提交的那条 */
function isMyCustom(label) {
  const mine = String(committedCustom.value || '').trim()
  return !!mine && mine === String(label).trim()
}

/** 只改本地勾选，不发消息 */
function toggle(i) {
  if (!interactive.value) return
  if (props.poll.multi) {
    if (picked(i)) {
      localPick.value = localPick.value.filter((x) => x !== i)
      limitHint.value = ''
      return
    }
    const max = maxSel.value
    const cur = localPick.value.length + (String(localCustom.value || '').trim() ? 1 : 0)
    // 限选数：到顶就不再放行，给一条瞬时提示（不改任何已选项）
    if (max > 0 && cur >= max) { limitHint.value = `最多只能选 ${max} 项`; return }
    localPick.value = [...localPick.value, i]
    limitHint.value = ''
  } else {
    // 单选：再点已选项 = 取消选择；选了内置项就丢弃自拟（单选互斥）
    localPick.value = picked(i) ? [] : [i]
    if (localPick.value.length) { localCustom.value = ''; customDraft.value = '' }
    limitHint.value = ''
  }
}

/** 点「确认投票」才提交。已投票 / 截止 / 只读 / 提交中一律拒绝。 */
function submit() {
  if (locked.value || voted.value) return
  if (!dirty.value) return
  if (overLimit.value) { limitHint.value = `多选最多只能选 ${maxSel.value} 项`; return }
  const custom = String(localCustom.value || '').trim()
  if (!localPick.value.length && !custom) return // 一个都没选 = 撤票，不发空 vote
  emit('vote', [...localPick.value], custom)
}

/** 该选项占已投票总数的百分比；⚠️ 分母用 result.total（已含自拟票），与自拟行口径一致 */
function pct(i) {
  const t = props.result.total
  if (!t) return '0%'
  return ((props.result.counts[i] || 0) / t * 100).toFixed(1) + '%'
}
/** 同上，但直接吃票数（自拟选项行用） */
function pctOf(count) {
  const t = props.result.total
  if (!t) return '0%'
  return ((Number(count) || 0) / t * 100).toFixed(1) + '%'
}

/** 选项悬浮提示：列出选了这项的人（result.voters[i]）；用原生 title，无投票人时返回空避免空 tooltip */
function votersTitle(i) {
  const uids = props.result.voters?.[i] || []
  if (!uids.length) return ''
  const names = uids.map((uid) => (props.nameOf ? props.nameOf(uid) : String(uid)))
  return '投票人：' + names.join('、')
}

/** 自拟选项行的悬浮提示（同样的口径） */
function extraVotersTitle(j) {
  const uids = (extraOptions.value[j] && extraOptions.value[j].voters) || []
  if (!uids.length) return ''
  const names = uids.map((uid) => (props.nameOf ? props.nameOf(uid) : String(uid)))
  return '投票人：' + names.join('、')
}

const untilText = computed(() => {
  const u = props.poll.until
  if (!u) return ''
  const d = new Date(u * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
})
</script>

<style scoped>
.poll-card {
  /* 宽度跟随内容（投票题目本身有长度，不需要人为下限），只设上限防长题目撑太宽。
     ⚠️ 不要在这里加 min-width：气泡是 width:fit-content，百分比解析不出（形同虚设），
     固定像素又会在窄容器（预览侧栏挤压）溢出 —— 两条路都踩过（2026-10-02）。 */
  max-width: 340px;
  padding: 12px 14px 10px;
  border-radius: var(--radius);
  background: var(--bg-group-detail);
  border: 1px solid var(--border-light);
  font-size: 13.5px;
  /* ⚠️ 必须显式给出文字颜色：本卡片不在 `.bubble-content` 内，而全局 `body` 只设了背景、
     没有设置 `color`（base.css），于是 `.poll-q` / `.poll-opt-label` 会继承浏览器默认的
     黑色 —— 浅色主题下看不出问题，深色主题下卡片底是深色、文字仍是黑色 → 完全看不清
     （用户 2026-10-10 报障）。这里统一按主题取色，子元素继续继承即可。 */
  color: var(--text-primary);
}
.poll-card--own { border-color: color-mix(in srgb, var(--accent) 40%, var(--border-light)); }

.poll-head { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
.poll-head-icon { color: var(--accent); font-size: 13px; }
.poll-tag {
  font-size: 11px; padding: 1px 6px; border-radius: 999px;
  background: var(--accent-light); color: var(--accent);
}
.poll-tag--multi { background: var(--bg-input); color: var(--text-secondary); }
.poll-tag--limit { background: var(--bg-input); color: var(--text-secondary); }
.poll-tag--open { background: var(--bg-input); color: var(--text-secondary); }
.poll-tag--expired { background: var(--bg-input); color: var(--text-secondary); }

.poll-q { font-weight: 600; line-height: 1.45; margin-bottom: 10px; word-break: break-word; }

.poll-opts { display: flex; flex-direction: column; gap: 7px; }
.poll-opt {
  position: relative;
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px;
  border-radius: var(--radius);
  background: var(--bg-input);
  border: 1px solid transparent;
  overflow: hidden;
  min-height: 34px;
}
.poll-opt--clickable { cursor: pointer; }
.poll-opt--clickable:hover { border-color: var(--border-light); }
.poll-opt--picked { border-color: var(--accent); }
.poll-opt--disabled { cursor: default; }
/* 自拟选项行：虚线边框 + 轻微区分，一眼看出「这是别人写的」 */
.poll-opt--extra { border-style: dashed; border-color: var(--border-light); }

/* 结果条：绝对定位铺满，z-index 低于文字 */
.poll-opt-bar {
  position: absolute; left: 0; top: 0; bottom: 0;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  transition: width 0.25s ease;
  z-index: 0;
}
.poll-opt--picked .poll-opt-bar { background: color-mix(in srgb, var(--accent) 28%, transparent); }

.poll-opt-check {
  position: relative; z-index: 1; flex: none;
  width: 16px; height: 16px; border-radius: 4px;
  border: 1.5px solid var(--border-light);
  display: grid; place-items: center;
  font-size: 9px; color: var(--text-on-accent);
}
.poll-opt--picked .poll-opt-check { background: var(--accent); border-color: var(--accent); }
/* 自拟行未选中时显示一支笔（区别于内置选项的「空方框」） */
.poll-opt-check--custom:not(.poll-opt-check--on) { color: var(--text-secondary); }

.poll-opt-label { position: relative; z-index: 1; flex: 1; min-width: 0; word-break: break-word; }
.poll-opt-meta {
  position: relative; z-index: 1; flex: none;
  font-size: 12px; color: var(--text-secondary); font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.poll-opt-meta b { color: var(--text-primary); }

/* 开放题：自拟输入行 */
.poll-custom {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 10px;
  border-radius: var(--radius);
  background: var(--bg-input);
  border: 1px dashed var(--border-light);
}
.poll-custom-icon { flex: none; font-size: 11px; color: var(--text-secondary); }
.poll-custom-input {
  flex: 1; min-width: 0;
  border: none; outline: none; background: transparent;
  font-size: 13px; font-family: inherit; color: var(--text-primary);
}
.poll-custom-input::placeholder { color: var(--text-secondary); }

/* 限选提示：瞬时、不干扰布局 */
.poll-hint {
  display: flex; align-items: center; gap: 5px;
  margin-top: 7px; font-size: 11.5px; color: var(--warning);
}

/* 无效投票人告警 */
.poll-invalid {
  display: flex; align-items: flex-start; gap: 6px;
  margin-top: 8px; padding: 6px 9px;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  color: var(--danger);
  font-size: 11.5px; line-height: 1.5;
  word-break: break-word;
}
.poll-invalid i { margin-top: 2px; flex: none; }

.poll-foot {
  display: flex; align-items: center; gap: 10px;
  margin-top: 9px; font-size: 11.5px; color: var(--text-secondary);
}
.poll-foot-until { margin-left: auto; }
.poll-foot-voting { margin-left: auto; color: var(--accent); }
.poll-foot-dirty { margin-left: auto; color: var(--accent); font-size: 11.5px; }
.poll-foot-done { margin-left: auto; color: var(--accent); font-size: 11.5px; }
.poll-submit {
  flex: none;
  margin-left: auto;
  padding: 3px 12px;
  border-radius: var(--radius);
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--text-on-accent);
  font-size: 11.5px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}
.poll-submit:disabled {
  border-color: var(--border-light);
  background: var(--bg-input);
  color: var(--text-secondary);
  cursor: default;
}
.poll-submit:not(:disabled):hover { filter: brightness(1.08); }
</style>
