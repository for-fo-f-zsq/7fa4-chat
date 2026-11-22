<template>
  <!-- 投票卡片：由 MessageList 在检测到 **poll 发起消息**时渲染，替代默认气泡。
       数据来自「poll 消息自带的 votes 字段」的客户端聚合，无服务端参与。
       ⚠️ 2026-10-06 起投票回复（vote）不再单独成消息、也不单独渲染（票并进 poll）。
       ⚠️ 本组件只负责展示与交互，聚合逻辑全部在 utils.js 的 aggregatePoll（可单测）。 -->
  <div class="poll-card" :class="{ 'poll-card--own': own }">
    <div class="poll-head">
      <i class="fas fa-square-poll-vertical poll-head-icon"></i>
      <UiBadge variant="brand" size="sm">投票</UiBadge>
      <UiBadge v-if="poll.multi" variant="neutral" size="sm">多选</UiBadge>
      <UiBadge v-if="limitTag" variant="neutral" size="sm">{{ limitTag }}</UiBadge>
      <UiBadge v-if="result.allowCustom" variant="neutral" size="sm">开放题</UiBadge>
      <UiBadge v-if="isExpired" variant="warning" size="sm">已截止</UiBadge>
    </div>

    <div class="poll-q">{{ poll.q }}</div>

    <div class="poll-opts">
      <div
        v-for="row in optionRows"
        :key="row.key"
        class="poll-opt"
        :class="{
          'poll-opt--picked': row.picked,
          'poll-opt--extra': row.custom,
          'poll-opt--disabled': !interactive || (row.custom && !row.authorUid),
          'poll-opt--clickable': interactive && (!row.custom || !!row.authorUid),
        }"
        :title="votersTitle(row.voters)"
        @click.stop="onRowClick(row)"
      >
        <!-- 结果条：宽度按占比，外观由 UiProgress 提供 -->
        <UiProgress class="poll-opt-progress" size="xs" :value="row.pct" />
        <span
          class="poll-opt-check"
          :class="{
            'poll-opt-check--custom': row.custom,
            'poll-opt-check--on': row.picked,
          }"
        >
          <i v-if="row.picked" class="fas fa-check"></i>
          <i v-else-if="row.custom" class="fas fa-pen"></i>
        </span>
        <span class="poll-opt-label">{{ row.label }}</span>
        <span class="poll-opt-meta">
          <b>{{ row.count }}</b> 票 ·
          <span class="poll-opt-pct">{{ row.pct.toFixed(0) }}%</span>
        </span>
      </div>

      <!-- 开放题：自拟输入行（仅「开放题 + 仍可投票」时出现） -->
      <UiInput
        v-if="showCustomInput"
        class="poll-custom"
        size="sm"
        prefixIcon="fas fa-pen"
        v-model="customDraft"
        :maxlength="POLL_MAX_OPT_LEN"
        :placeholder="poll.multi ? '也可以自己填一个选项…' : '或者自己填一个选项…'"
        @click.stop
      />
    </div>

    <div class="poll-hint" v-if="limitHint"><i class="fas fa-circle-info"></i> {{ limitHint }}</div>

    <!-- 合法性检测：被判定作废的投票人（云端仍是明文消息，仅靠客户端甄别） -->
    <div class="poll-invalid" v-if="invalidVoters.length">
      <i class="fas fa-triangle-exclamation"></i>
      <span>以下投票无效：{{ invalidText }}</span>
    </div>

    <div class="poll-foot">
      <span class="poll-foot-total">共 {{ result.total }} 票</span>
      <span v-if="poll.until && !isExpired" class="poll-foot-until">
        {{ untilText }} 截止
      </span>
      <span v-if="isExpired" class="poll-foot-until">已截止，仅可查看结果</span>
      <template v-if="!isExpired && !readonly">
        <!-- ⚠️ 点选项只切换勾选，点了右下角「确认投票」才真正提交（2026-10-02 改） -->
        <span class="poll-foot-dirty" v-if="dirty && !voted">已选 {{ selCount }} 项</span>
        <span class="poll-foot-voting" v-if="voting"><i class="fas fa-spinner motion-spin"></i> 提交中…</span>
        <!-- 已投票：只显示结果，不可再改票（用户明确要求） -->
        <span class="poll-foot-done" v-else-if="voted"><i class="fas fa-check"></i> 已投票</span>
        <UiButton
          v-else
          type="button"
          class="poll-submit"
          variant="primary"
          size="sm"
          :disabled="!canSubmit"
          :title="submitTitle"
          @click.stop="submit"
        >{{ submitLabel }}</UiButton>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { POLL_INVALID_TEXT, POLL_MAX_OPT_LEN } from '../../utils.js'
import { UiBadge, UiButton, UiInput, UiProgress } from '@/ui'
import { useNowSeconds } from '../../composables/useNowSeconds.js'

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
/** 他人自拟选项（按创建者 UID）：本地乐观值 / 已确认值 */
const localCustomPick = ref([])
const committedCustomPick = ref([])
/** 触达限选数时的瞬时提示（不打断操作，仅提示） */
const limitHint = ref('')

/** 两个数组是否等价（顺序无关） */
const samePick = (a, b) =>
  a.length === b.length && a.every((x) => b.includes(x))

watch(
  () => props.result,
  (res) => {
    const next = Array.isArray(res?.myPick) ? [...res.myPick] : []
    const nextCustom = res?.myCustom == null ? '' : String(res.myCustom).trim()
    const nextCustomPick = Array.isArray(res?.myCustomPick) ? res.myCustomPick.map(String) : []
    // ⚠️⚠️ 内容未变（只是引用变了）必须直接返回，绝不能动 localPick / localCustom / localCustomPick。
    if (
      samePick(next, committed.value) &&
      String(committedCustom.value || '') === nextCustom &&
      samePick(nextCustomPick, committedCustomPick.value)
    ) return
    committed.value = next
    committedCustom.value = nextCustom
    committedCustomPick.value = nextCustomPick
    // 提交中不覆盖：否则父层回写延迟会把用户刚点的选择冲掉
    if (!props.voting) {
      localPick.value = [...next]
      localCustom.value = nextCustom
      customDraft.value = nextCustom
      localCustomPick.value = [...nextCustomPick]
    }
  },
  { immediate: true, deep: true }
)

/** 草稿 → 本地自拟值（裁长度、去首尾空格）；单选互斥清空已有勾选；输入即清掉旧的限选提示 */
watch(customDraft, (v) => {
  const next = String(v == null ? '' : v).trim().slice(0, POLL_MAX_OPT_LEN)
  localCustom.value = next
  limitHint.value = ''
  if (!props.poll.multi && next) {
    localPick.value = []
    localCustomPick.value = []
  }
})

/**
 * 截止时间到点自愈。
 * ⚠️ `result.expired` 由父层 `pollMap` computed 算出，而它只在消息变动时重算 ——
 *    页面静置时**没有事件驱动它刷新**。于是「开着聊天窗口跨过截止时刻」时，
 *    卡片还显示成可投票，点了还真能发出去（投票无服务端校验，`until` 纯前端约束）。
 *    这里按本地时钟补判一次，并到点后停表。
 */
const nowSeconds = useNowSeconds()
const expiredNow = computed(() => {
  const u = Number(props.poll.until) || 0
  return !!u && nowSeconds.value > u
})
const isExpired = computed(() => !!(props.result.expired || expiredNow.value))

const locked = computed(() => props.readonly || isExpired.value || props.voting)
/** 与已提交状态有差异 = 有未提交的改动（内置勾选 / 他人自拟勾选 / 自拟文本 任一变了都算） */
const dirty = computed(() => {
  const a = [...localPick.value].sort().join(',')
  const b = [...committed.value].sort().join(',')
  if (a !== b) return true
  const ca = [...localCustomPick.value].sort().join(',')
  const cb = [...committedCustomPick.value].sort().join(',')
  if (ca !== cb) return true
  return String(localCustom.value || '').trim() !== String(committedCustom.value || '').trim()
})
/** 已投票（一次性、不可改票，卡片只读）；⚠️ 纯自拟票或他人自拟票内置 myPick 为空，须一并算进已投 */
const voted = computed(() =>
  committed.value.length > 0 ||
  !!String(committedCustom.value || '').trim() ||
  committedCustomPick.value.length > 0
)
/** 选项区能否点击：未投票 且 未截止 且 非只读 且 非提交中 */
const interactive = computed(() => !locked.value && !voted.value)

/** 多选上限（0 = 不限）；聚合结果优先，否则回退到 poll 定义 */
const maxSel = computed(() => {
  if (!props.poll.multi) return 0
  return (Number(props.result.maxSelect) || 0) || (Number(props.poll.maxSelect) || 0)
})
const limitTag = computed(() => (maxSel.value > 0 ? `最多选 ${maxSel.value} 项` : ''))
/** 已选数量 = 内置勾选 + 他人自拟勾选 + 自拟文本（自拟文本最多占 1 项） */
const selCount = computed(() =>
  localPick.value.length +
  localCustomPick.value.length +
  (String(localCustom.value || '').trim() ? 1 : 0))
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
    // 限选数：到顶就不再放行，给一条瞬时提示（不改任何已选项）
    if (max > 0 && selCount.value >= max) { limitHint.value = `最多只能选 ${max} 项`; return }
    localPick.value = [...localPick.value, i]
    limitHint.value = ''
  } else {
    // 单选：再点已选项 = 取消选择；选了内置项就丢弃自拟与他人自拟（单选互斥）
    localPick.value = picked(i) ? [] : [i]
    if (localPick.value.length) {
      localCustom.value = ''
      customDraft.value = ''
      localCustomPick.value = []
    }
    limitHint.value = ''
  }
}

/** 点选他人自拟选项行 */
function toggleCustomOption(authorUid) {
  if (!interactive.value || !authorUid) return
  const key = String(authorUid)
  if (props.poll.multi) {
    if (localCustomPick.value.includes(key)) {
      localCustomPick.value = localCustomPick.value.filter((x) => x !== key)
      limitHint.value = ''
      return
    }
    const max = maxSel.value
    if (max > 0 && selCount.value >= max) { limitHint.value = `最多只能选 ${max} 项`; return }
    localCustomPick.value = [...localCustomPick.value, key]
    limitHint.value = ''
  } else {
    localCustomPick.value = localCustomPick.value.includes(key) ? [] : [key]
    if (localCustomPick.value.length) {
      localPick.value = []
      localCustom.value = ''
      customDraft.value = ''
    }
    limitHint.value = ''
  }
}

function onRowClick(row) {
  if (!interactive.value) return
  if (row.custom) toggleCustomOption(row.authorUid)
  else toggle(row.index)
}

/** 点「确认投票」才提交。已投票 / 截止 / 只读 / 提交中一律拒绝。 */
function submit() {
  if (locked.value || voted.value) return
  if (!dirty.value) return
  if (overLimit.value) { limitHint.value = `多选最多只能选 ${maxSel.value} 项`; return }
  const custom = String(localCustom.value || '').trim()
  if (!localPick.value.length && !custom && !localCustomPick.value.length) return // 一个都没选 = 撤票，不发空 vote
  emit('vote', [...localPick.value], custom, [...localCustomPick.value])
}

/** 选项占已投票总数的 0-100 数值；⚠️ 分母用 result.total（已含自拟票） */
function pctOfCount(count) {
  const t = props.result.total
  if (!t) return 0
  return Math.round(((Number(count) || 0) / t) * 1000) / 10
}

/** 统一内置选项与他人自拟选项行的数据结构，避免模板重复渲染两套列表 */
const optionRows = computed(() => {
  const builtin = (props.poll.opts || []).map((opt, i) => {
    const count = props.result.counts[i] || 0
    return {
      key: `opt-${i}`,
      index: i,
      label: opt,
      count,
      pct: pctOfCount(count),
      voters: props.result.voters?.[i] || [],
      picked: picked(i),
      custom: false,
    }
  })
  const extra = extraOptions.value.map((o, j) => {
    const authorUid = o.authorUid != null ? String(o.authorUid).trim() : ''
    const pickedByMe = !!(
      o.mine ||
      isMyCustom(o.label) ||
      (authorUid && localCustomPick.value.includes(authorUid))
    )
    return {
      key: authorUid ? `extra-${authorUid}` : `extra-${j}`,
      index: -1,
      authorUid,
      label: o.label,
      count: Number(o.count) || 0,
      pct: pctOfCount(o.count),
      voters: o.voters || [],
      picked: pickedByMe,
      custom: true,
    }
  })
  return [...builtin, ...extra]
})

/** 选项悬浮提示：列出投票人；无投票人时返回空避免空 tooltip */
function votersTitle(uids) {
  if (!uids || !uids.length) return ''
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

<style scoped src="../../css/components/poll-card.css"></style>

