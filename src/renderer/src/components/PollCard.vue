<template>
  <!-- 投票卡片：由 MessageList 在检测到 poll / vote 消息时渲染，替代默认气泡。
       数据完全来自「发起消息 + 会话内的 vote 回复」的客户端聚合，无服务端参与。
       ⚠️ 本组件只负责展示与交互，聚合逻辑全部在 utils.js 的 aggregatePoll（可单测）。 -->
  <div class="poll-card" :class="{ 'poll-card--own': own }">
    <div class="poll-head">
      <i class="fas fa-square-poll-vertical poll-head-icon"></i>
      <span class="poll-tag">投票</span>
      <span v-if="poll.multi" class="poll-tag poll-tag--multi">多选</span>
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
    </div>

    <div class="poll-foot">
      <span class="poll-foot-total">共 {{ result.total }} 票</span>
      <span v-if="poll.until && !result.expired" class="poll-foot-until">
        {{ untilText }} 截止
      </span>
      <span v-if="result.expired" class="poll-foot-until">已截止，仅可查看结果</span>
      <template v-if="!result.expired && !readonly">
        <!-- ⚠️ 点选项只切换勾选，点了右下角「确认投票」才真正提交（2026-10-02 改） -->
        <span class="poll-foot-dirty" v-if="dirty && !voted">已选 {{ localPick.length }} 项</span>
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

const props = defineProps({
  /** parsePoll() 的返回值:{ q, opts, multi, until } */
  poll: { type: Object, required: true },
  /** aggregatePoll() 的返回值:{ counts, total, myPick, expired, multi } */
  result: { type: Object, required: true },
  /** 是否是自己的发言（仅用于视觉区分，不影响交互） */
  own: { type: Boolean, default: false },
  /** 是否禁止投票（如已退出会话 / 非群聊成员） */
  readonly: { type: Boolean, default: false },
  /** 提交中（防连点） */
  voting: { type: Boolean, default: false },
})

const emit = defineEmits(['vote'])

// 本地乐观选择：点选项立刻反馈，提交成功后由 props.result.myPick 归一
const localPick = ref([])
/** 服务端已确认的选择（来自聚合结果） */
const committed = ref([])
/** 两个下标数组是否等价（顺序无关） */
const samePick = (a, b) =>
  a.length === b.length && a.every((x) => b.includes(x))

watch(
  () => props.result.myPick,
  (v) => {
    const next = Array.isArray(v) ? [...v] : []
    // ⚠️⚠️ 内容未变（只是引用变了）必须直接返回，绝不能动 localPick。
    //   `result` 来自 MessageList 的 `pollMap` computed —— 会话里任何消息变动
    //   （轮询刷新 / 收到新消息 / 别人投票）都会重算聚合，产出一个**新的 myPick 数组**，
    //   引用必变、内容可能一模一样。deep watch 照样触发 → 若在这里无条件
    //   `localPick = [...committed]`，用户刚勾的选项会被瞬间冲掉
    //   （用户报障：「投票选了之后一秒就没了」，秒数与 onPollVote 的 1.2s 兜底复位吻合）。
    if (samePick(next, committed.value)) return
    committed.value = next
    // 提交中不覆盖：否则父层回写延迟会把用户刚点的选择冲掉
    if (!props.voting) localPick.value = [...next]
  },
  { immediate: true, deep: true }
)

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
/** 与已提交状态有差异 = 有未提交的改动 */
const dirty = computed(() => {
  const a = [...localPick.value].sort().join(',')
  const b = [...committed.value].sort().join(',')
  return a !== b
})
/** 已投票（一次性，不可改票）。
 *  ⚠️ 2026-10-02 用户明确要求「已投票 选项无法交互」且「不能改票」——
 *     投过之后卡片就是只读的，不提供任何改票入口。 */
const voted = computed(() => committed.value.length > 0)
/** 选项区能否点击：未投票 且 未截止 且 非只读 且 非提交中 */
const interactive = computed(() => !locked.value && !voted.value)
/** 可提交 = 有改动 **且** 至少选了一项。
 *  ⚠️ 为什么要分开：把已选的项取消勾选会让 dirty 为 true，但空选是**撤票**语义
 *     （见 submit 的空选守卫），若只按 dirty 亮按钮，用户会看到「可点但点了没反应」。 */
const canSubmit = computed(() => dirty.value && localPick.value.length > 0)
const submitLabel = computed(() => (localPick.value.length ? '确认投票' : '至少选一项'))
const submitTitle = computed(() => (localPick.value.length ? '提交投票' : '请先勾选选项'))

function picked(i) {
  return localPick.value.includes(i)
}

/** 只改本地勾选，不发消息 */
function toggle(i) {
  if (!interactive.value) return
  if (props.poll.multi) {
    localPick.value = picked(i) ? localPick.value.filter((x) => x !== i) : [...localPick.value, i]
  } else {
    // 单选：再点已选项 = 取消选择
    localPick.value = picked(i) ? [] : [i]
  }
}

/** 点「确认投票」才提交。已投票 / 截止 / 只读 / 提交中一律拒绝。 */
function submit() {
  if (locked.value || voted.value) return
  if (!dirty.value) return
  if (!localPick.value.length) return // 一个都没选 = 撤票，不发空 vote
  emit('vote', [...localPick.value])
}

/** 该选项占「已投票总数」的百分比（无人投票时为 0） */
function pct(i) {
  const t = props.result.total
  if (!t) return '0%'
  return ((props.result.counts[i] || 0) / t * 100).toFixed(1) + '%'
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
}
.poll-card--own { border-color: color-mix(in srgb, var(--accent) 40%, var(--border-light)); }

.poll-head { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.poll-head-icon { color: var(--accent); font-size: 13px; }
.poll-tag {
  font-size: 11px; padding: 1px 6px; border-radius: 999px;
  background: var(--accent-light); color: var(--accent);
}
.poll-tag--multi { background: var(--bg-input); color: var(--text-secondary); }
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

.poll-opt-label { position: relative; z-index: 1; flex: 1; min-width: 0; word-break: break-word; }
.poll-opt-meta {
  position: relative; z-index: 1; flex: none;
  font-size: 12px; color: var(--text-secondary); font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.poll-opt-meta b { color: var(--text-primary); }

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
