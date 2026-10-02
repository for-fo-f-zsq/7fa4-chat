<script setup>
/**
 * 审计日志
 * ------------------------------------------------------------
 * 数据：GET /api/v1/audit?actor&action&result&since&until&limit&offset
 * 服务端最多保留 5000 条、按时间倒序。
 * 支持按动作/执行人/结果筛选，翻页在服务端完成。
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api } from '@/lib/api.js'
import { registerPoller, unregisterPoller, markSynced } from '@/lib/store.js'
import { relTime, fmtTimeFull, errText } from '@/lib/util.js'
import EmptyState from '@/components/EmptyState.vue'
import TableSkeleton from '@/components/TableSkeleton.vue'

const PAGE = 100

const items = ref([])
const total = ref(0)
const loading = ref(true)
const loadError = ref('')
const offset = ref(0)

const fActor = ref('')
const fAction = ref('')
const fResult = ref('')

const detail = ref(null)

const ACTIONS = [
  { v: '', label: '全部动作' },
  { v: 'auth', label: '认证' },
  { v: 'poster', label: '海报' },
  { v: 'feedback', label: '反馈' },
  { v: 'account', label: '账户' },
  { v: 'config', label: '配置' },
]

async function load(silent) {
  if (!silent) loading.value = true
  try {
    const r = await api.getAudit({
      actor: fActor.value.trim() || undefined,
      action: fAction.value || undefined,
      result: fResult.value || undefined,
      limit: PAGE,
      offset: offset.value,
    })
    items.value = (r && r.items) || []
    total.value = (r && r.total) || 0
    loadError.value = ''
  } catch (e) {
    if (!silent) loadError.value = errText(e)
  } finally {
    loading.value = false
  }
}

async function refresh() {
  await load(true)
  markSynced()
}

onMounted(async () => {
  await load(false)
  registerPoller('audit', refresh)
})
onBeforeUnmount(() => unregisterPoller('audit'))

function applyFilters() {
  offset.value = 0
  load(false)
}
function clearFilters() {
  fActor.value = ''
  fAction.value = ''
  fResult.value = ''
  applyFilters()
}

const hasFilter = computed(() => !!(fActor.value.trim() || fAction.value || fResult.value))

const page = computed(() => Math.floor(offset.value / PAGE) + 1)
const pages = computed(() => Math.max(1, Math.ceil(total.value / PAGE)))

function prev() {
  if (offset.value <= 0) return
  offset.value = Math.max(0, offset.value - PAGE)
  load(false)
}
function next() {
  if (offset.value + PAGE >= total.value) return
  offset.value += PAGE
  load(false)
}

function resultBadge(r) {
  return r === 'ok' ? 'badge--ok' : r === 'failed' ? 'badge--danger' : 'badge--muted'
}
function resultLabel(r) {
  return r === 'ok' ? '成功' : r === 'failed' ? '失败' : r || '—'
}
</script>

<template>
  <div class="col" style="gap: 16px">
    <div class="card">
      <div class="toolbar">
        <input v-model="fActor" class="input" style="width: 150px" placeholder="执行人" @keydown.enter="applyFilters" />
        <select v-model="fAction" class="select" style="width: 140px">
          <option v-for="a in ACTIONS" :key="a.v" :value="a.v">{{ a.label }}</option>
        </select>
        <select v-model="fResult" class="select" style="width: 120px">
          <option value="">全部结果</option>
          <option value="ok">成功</option>
          <option value="failed">失败</option>
        </select>
        <button class="btn btn--sm" :disabled="loading" @click="applyFilters">筛选</button>
        <button v-if="hasFilter" class="btn btn--ghost btn--sm" @click="clearFilters">清除</button>
        <div class="grow" />
        <span class="badge badge--accent">共 {{ total }} 条</span>
      </div>
    </div>

    <div class="card">
      <TableSkeleton v-if="loading" :rows="8" :cols="5" />

      <EmptyState v-else-if="loadError" icon="fa-triangle-exclamation" title="加载失败" :sub="loadError">
        <button class="btn btn--sm" @click="load(false)"><i class="fa-solid fa-arrow-rotate-right" /><span>重试</span></button>
      </EmptyState>

      <EmptyState
        v-else-if="!items.length"
        icon="fa-scroll"
        :title="hasFilter ? '没有匹配的记录' : '暂无审计记录'"
        :sub="hasFilter ? '换个筛选条件试试' : '管理动作发生后会自动记录在这里'"
      />

      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th style="width: 160px">时间</th>
              <th style="width: 130px">操作</th>
              <th style="width: 110px">结果</th>
              <th style="width: 110px">执行人</th>
              <th>对象</th>
              <th style="width: 120px">来源 IP</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in items" :key="a.id" style="cursor: pointer" @click="detail = a">
              <td class="muted nowrap" :title="a.at_text">{{ relTime(a.at) }}</td>
              <td>
                <span class="badge badge--muted">{{ a.action_label || a.action }}</span>
              </td>
              <td>
                <span class="badge" :class="resultBadge(a.result)">{{ resultLabel(a.result) }}</span>
              </td>
              <td class="mono truncate" style="max-width: 110px">{{ a.actor }}</td>
              <td class="truncate" style="max-width: 320px" :title="a.target">{{ a.target || '—' }}</td>
              <td class="mono muted" style="font-size: 11.5px">{{ a.ip || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="!loading && total > PAGE" class="pager">
        <span>第 {{ page }} / {{ pages }} 页</span>
        <button class="btn btn--sm" :disabled="offset <= 0" @click="prev">上一页</button>
        <button class="btn btn--sm" :disabled="offset + PAGE >= total" @click="next">下一页</button>
      </div>
    </div>

    <!-- 详情 -->
    <div v-if="detail" class="scrim" @click.self="detail = null">
      <div class="modal" style="max-width: 560px">
        <div class="modal__head">
          <h3 class="modal__title">审计详情</h3>
          <button class="btn btn--ghost btn--icon btn--sm" aria-label="关闭" @click="detail = null">
            <i class="fa-solid fa-xmark" />
          </button>
        </div>
        <div class="modal__body">
          <div class="kv"><span class="kv__k">操作</span><span>{{ detail.action_label || detail.action }} <span class="mono muted">({{ detail.action }})</span></span></div>
          <div class="kv"><span class="kv__k">结果</span><span class="badge" :class="resultBadge(detail.result)">{{ resultLabel(detail.result) }}</span></div>
          <div class="kv"><span class="kv__k">执行人</span><span class="mono">{{ detail.actor }}</span></div>
          <div class="kv"><span class="kv__k">对象</span><span class="mono" style="word-break: break-all">{{ detail.target || '—' }}</span></div>
          <div class="kv"><span class="kv__k">时间</span><span>{{ fmtTimeFull(detail.at) }}</span></div>
          <div class="kv"><span class="kv__k">来源 IP</span><span class="mono">{{ detail.ip || '—' }}</span></div>
          <div v-if="detail.detail" class="kv" style="align-items: flex-start">
            <span class="kv__k">详情</span>
            <span class="mono" style="word-break: break-all; font-size: 12px">{{ detail.detail }}</span>
          </div>
          <div class="kv"><span class="kv__k">记录 ID</span><span class="mono muted" style="font-size: 11.5px">{{ detail.id }}</span></div>
        </div>
        <div class="modal__foot">
          <button class="btn btn--primary" @click="detail = null">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 8px; padding: 12px 16px; flex-wrap: wrap; }
.kv { display: flex; gap: 14px; font-size: 13px; }
.kv__k { width: 72px; flex: none; color: var(--text-3); font-size: 12.5px; }
</style>
