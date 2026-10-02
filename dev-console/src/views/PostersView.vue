<script setup>
/**
 * 海报审核
 * ------------------------------------------------------------
 * 四个页签：待审 / 已通过 / 已拒绝 / 全部。
 * 动作：通过、下架(reject)、置顶/取消置顶、彻底删除。
 * 已通过页签支持拖拽调序（传完整 id 顺序给服务端，幂等）。
 *
 * 接口：/api/admin/posters、/api/admin/posters/review（旧路径，与客户端同源数据）
 */
import { ref, computed, onMounted, onBeforeUnmount, inject } from 'vue'
import { legacyApi } from '@/lib/legacy-api.js'
import { can, registerPoller, unregisterPoller, markSynced } from '@/lib/store.js'
import { relTime, fmtBytes, errText, toast } from '@/lib/util.js'
import BaseModal from '@/components/BaseModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import TableSkeleton from '@/components/TableSkeleton.vue'

const confirm = inject('confirm')
const setBadge = inject('setBadge')

const TABS = [
  { key: 'pending', label: '待审' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' },
  { key: 'all', label: '全部' },
]

const tab = ref('pending')
const items = ref([])
const counts = ref({})
const loading = ref(true)
const busyId = ref(0)
const loadError = ref('')

const preview = ref(null) // 当前预览的海报
const canManage = computed(() => can('content.manage'))

async function load(silent) {
  if (!silent) loading.value = true
  try {
    const r = await legacyApi.adminPosters(tab.value)
    items.value = r.items
    counts.value = r.counts || {}
    Object.assign(counts.value, {
      // 服务端 counts 可能只含部分状态，用列表结果兜底
      [tab.value]: r.items.length,
    })
    setBadge('posters', counts.value.pending || 0)
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

onMounted(() => {
  load(false)
  registerPoller('posters', refresh)
})
onBeforeUnmount(() => unregisterPoller('posters'))

function switchTab(k) {
  if (tab.value === k) return
  tab.value = k
  load(false)
}

const tabCount = (k) => (k === 'all' ? counts.value.all || totalAll() : counts.value[k] || 0)
function totalAll() {
  return (counts.value.pending || 0) + (counts.value.approved || 0) + (counts.value.rejected || 0)
}

async function act(poster, action, confirmOpts) {
  if (!canManage.value) return toast.error('没有内容管理权限')
  if (confirmOpts) {
    const okay = await confirm.ask(
      Object.assign({ title: '确认操作', message: '', danger: action === 'delete' }, confirmOpts)
    )
    if (!okay) return
  }
  busyId.value = poster.id
  try {
    await legacyApi.reviewPoster(poster.id, action)
    const msg = {
      approve: '已通过',
      reject: '已下架',
      pin: '已置顶',
      unpin: '已取消置顶',
      delete: '已彻底删除',
    }[action] || '操作完成'
    toast.ok(msg)
    if (preview.value && preview.value.id === poster.id) {
      if (action === 'delete') preview.value = null
      else if (action === 'pin') preview.value.pinned = true
      else if (action === 'unpin') preview.value.pinned = false
      else if (action === 'approve') preview.value.status = 'approved'
      else if (action === 'reject') preview.value.status = 'rejected'
    }
    await load(true)
  } catch (e) {
    toast.error('操作失败：' + errText(e))
  } finally {
    busyId.value = 0
  }
}

// ---------- 拖拽调序（仅已通过页签） ----------
const dragId = ref(0)
const dragOverId = ref(0)

function onDragStart(p, e) {
  if (!canManage.value) return
  dragId.value = p.id
  try {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(p.id))
  } catch {}
}

function onDragOver(p) {
  if (!dragId.value || p.id === dragId.value) return
  dragOverId.value = p.id
}

async function onDrop(target) {
  const from = dragId.value
  dragId.value = 0
  dragOverId.value = 0
  if (!from || from === target.id) return
  const list = items.value.slice()
  const fi = list.findIndex((x) => x.id === from)
  const ti = list.findIndex((x) => x.id === target.id)
  if (fi < 0 || ti < 0) return
  const [moved] = list.splice(fi, 1)
  list.splice(ti, 0, moved)
  const before = items.value
  items.value = list
  try {
    await legacyApi.reorderPosters(list.map((x) => x.id))
    toast.ok('顺序已保存')
  } catch (e) {
    items.value = before // 回滚
    toast.error('保存顺序失败：' + errText(e))
  }
}

async function resetOrder() {
  if (!canManage.value) return
  const okay = await confirm.ask({
    title: '重置排序',
    message: '将清空所有手动排序，恢复为「置顶优先 + 通过时间」的默认顺序。',
    danger: false,
    confirmText: '重置',
  })
  if (!okay) return
  try {
    await legacyApi.resetPosterOrder()
    toast.ok('已恢复默认顺序')
    await load(true)
  } catch (e) {
    toast.error('重置失败：' + errText(e))
  }
}

const draggable = computed(() => tab.value === 'approved' && canManage.value)
</script>

<template>
  <div class="col" style="gap: 16px">
    <!-- 工具条 -->
    <div class="card">
      <div class="toolbar">
        <div class="tabs">
          <button
            v-for="t in TABS"
            :key="t.key"
            class="tab"
            :class="{ 'tab--active': tab === t.key }"
            @click="switchTab(t.key)"
          >
            {{ t.label }}<span class="tab__count">{{ tabCount(t.key) }}</span>
          </button>
        </div>
        <div class="grow" />
        <button v-if="draggable" class="btn btn--sm" @click="resetOrder">
          <i class="fa-solid fa-arrow-rotate-left" />
          <span>恢复默认排序</span>
        </button>
      </div>
    </div>

    <!-- 内容 -->
    <div class="card">
      <div v-if="draggable" class="hint">
        提示：可直接拖拽卡片调整展示顺序，松手即保存。
      </div>

      <TableSkeleton v-if="loading" :rows="5" :cols="4" />

      <EmptyState
        v-else-if="loadError"
        icon="fa-triangle-exclamation"
        title="加载失败"
        :sub="loadError"
      >
        <button class="btn btn--sm" @click="load(false)"><i class="fa-solid fa-arrow-rotate-right" /><span>重试</span></button>
      </EmptyState>

      <EmptyState
        v-else-if="!items.length"
        icon="fa-image"
        :title="tab === 'pending' ? '没有待审海报' : '这个分类下暂无海报'"
        :sub="tab === 'pending' ? '客户端投稿后会出现在这里' : ''"
      />

      <div v-else class="grid">
        <article
          v-for="p in items"
          :key="p.id"
          class="poster"
          :class="{ 'poster--dragging': dragId === p.id, 'poster--over': dragOverId === p.id }"
          :draggable="draggable"
          @dragstart="onDragStart(p, $event)"
          @dragover.prevent="onDragOver(p)"
          @dragleave="dragOverId = dragOverId === p.id ? 0 : dragOverId"
          @drop.prevent="onDrop(p)"
          @dragend="dragId = 0; dragOverId = 0"
        >
          <div class="poster__thumb" @click="preview = p">
            <img :src="p.url" :alt="'海报 ' + p.id" loading="lazy" />
            <span v-if="p.pinned" class="poster__pin" title="已置顶"><i class="fa-solid fa-thumbtack" /></span>
            <span class="poster__status" :class="'poster__status--' + p.status">
              {{ p.status === 'pending' ? '待审' : p.status === 'approved' ? '已通过' : '已拒绝' }}
            </span>
          </div>

          <div class="poster__meta">
            <div class="row row--between" style="gap: 8px">
              <span class="poster__author truncate" :title="p.author || ('uid ' + p.uid)">
                {{ p.author || ('uid ' + p.uid) }}
              </span>
              <span class="muted nowrap" style="font-size: 11.5px">{{ relTime(p.created_at) }}</span>
            </div>
            <div class="poster__sub muted">
              #{{ p.id }} · {{ p.w }}×{{ p.h }} · {{ fmtBytes(p.size) }}
            </div>
          </div>

          <div v-if="canManage" class="poster__actions">
            <template v-if="p.status === 'pending'">
              <button class="btn btn--sm btn--primary" :disabled="busyId === p.id" @click="act(p, 'approve')">
                <i class="fa-solid fa-check" />
                <span>通过</span>
              </button>
              <button class="btn btn--sm" :disabled="busyId === p.id" @click="act(p, 'reject')">
                <i class="fa-solid fa-xmark" />
                <span>拒绝</span>
              </button>
            </template>
            <template v-else-if="p.status === 'approved'">
              <button class="btn btn--sm" :disabled="busyId === p.id" @click="act(p, p.pinned ? 'unpin' : 'pin')">
                <i class="fa-solid fa-thumbtack" />
                <span>{{ p.pinned ? '取消置顶' : '置顶' }}</span>
              </button>
              <button class="btn btn--sm" :disabled="busyId === p.id" @click="act(p, 'reject', { title: '下架海报', message: '下架后该海报不再公开展示，可在「已拒绝」页签重新通过。', danger: false, confirmText: '下架' })">
                <i class="fa-solid fa-arrow-down" />
                <span>下架</span>
              </button>
            </template>
            <template v-else>
              <button class="btn btn--sm btn--primary" :disabled="busyId === p.id" @click="act(p, 'approve')">
                <i class="fa-solid fa-rotate-right" />
                <span>重新通过</span>
              </button>
            </template>
            <button
              class="btn btn--sm btn--ghost"
              style="color: var(--danger)"
              :disabled="busyId === p.id"
              title="彻底删除"
              @click="act(p, 'delete', { title: '彻底删除', message: '将永久删除图片文件与记录，且 id 不会复用。此操作不可撤销。', danger: true, confirmText: '彻底删除' })"
            >
              删除
            </button>
          </div>
        </article>
      </div>
    </div>

    <!-- 预览 -->
    <BaseModal v-if="preview" :title="'海报 #' + preview.id" width="720px" @close="preview = null">
      <img :src="preview.url" :alt="'海报 ' + preview.id" class="preview-img" />
      <div class="col" style="gap: 6px; font-size: 13px">
        <div class="row"><span class="muted" style="width: 76px">投稿人</span><span>{{ preview.author || ('uid ' + preview.uid) }}</span></div>
        <div class="row"><span class="muted" style="width: 76px">尺寸</span><span class="mono">{{ preview.w }} × {{ preview.h }} · {{ fmtBytes(preview.size) }}</span></div>
        <div class="row"><span class="muted" style="width: 76px">投稿时间</span><span>{{ relTime(preview.created_at) }}</span></div>
        <div class="row"><span class="muted" style="width: 76px">状态</span>
          <span class="badge" :class="preview.status === 'approved' ? 'badge--ok' : preview.status === 'pending' ? 'badge--warn' : 'badge--danger'">
            {{ preview.status === 'approved' ? '已通过' : preview.status === 'pending' ? '待审' : '已拒绝' }}
          </span>
          <span v-if="preview.pinned" class="badge badge--accent">已置顶</span>
        </div>
      </div>
      <template #foot>
        <button class="btn" @click="preview = null">关闭</button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 12px; padding: 12px 16px; flex-wrap: wrap; }
.hint {
  padding: 8px 16px;
  font-size: 12.5px;
  color: var(--text-3);
  background: var(--bg-sunken);
  border-bottom: 1px solid var(--border);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(222px, 1fr));
  gap: 14px;
  padding: 16px;
}

.poster {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
  background: var(--bg-elev);
  transition: box-shadow var(--t-fast), border-color var(--t-fast), opacity var(--t-fast);
}
.poster[draggable='true'] { cursor: grab; }
.poster[draggable='true']:active { cursor: grabbing; }
.poster:hover { box-shadow: var(--shadow-md); }
.poster--dragging { opacity: 0.4; }
.poster--over { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }

.poster__thumb {
  position: relative;
  aspect-ratio: 4 / 3;
  background: var(--bg-sunken);
  cursor: zoom-in;
  overflow: hidden;
}
.poster__thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }

.poster__pin {
  position: absolute;
  top: 7px; left: 7px;
  width: 24px; height: 24px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--accent);
  font-size: 12px;
  box-shadow: var(--shadow-sm);
}
.poster__status {
  position: absolute;
  top: 7px; right: 7px;
  padding: 2px 7px;
  border-radius: var(--r-full);
  font-size: 11px;
  font-weight: 650;
  backdrop-filter: blur(4px);
}
.poster__status--pending { background: var(--warn-soft); color: var(--warn); }
.poster__status--approved { background: var(--ok-soft); color: var(--ok); }
.poster__status--rejected { background: var(--danger-soft); color: var(--danger); }

.poster__meta { padding: 10px 12px 6px; display: flex; flex-direction: column; gap: 3px; }
.poster__author { font-size: 13px; font-weight: 600; }
.poster__sub { font-size: 11.5px; }

.poster__actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px 12px 12px;
}

.preview-img {
  width: 100%;
  max-height: 46vh;
  object-fit: contain;
  border-radius: var(--r-md);
  background: var(--bg-sunken);
}
</style>
