<script setup>
/**
 * 意见反馈
 * ------------------------------------------------------------
 * 数据：GET /api/feedback → { list: [...] }（服务端倒序）
 * 动作：删除（DELETE /api/feedback?id=）
 * 支持：按内容/用户搜索、按客户端平台筛选、查看内嵌截图。
 *
 * 注：旧接口没有「已解决」标记，所以这里不造假状态，只做真实的删除与浏览。
 */
import { ref, computed, onMounted, onBeforeUnmount, inject } from 'vue'
import { legacyApi } from '@/lib/legacy-api.js'
import { can, registerPoller, unregisterPoller, markSynced } from '@/lib/store.js'
import { relTime, fmtTime, errText, toast } from '@/lib/util.js'
import BaseModal from '@/components/BaseModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import TableSkeleton from '@/components/TableSkeleton.vue'

const confirm = inject('confirm')
const setBadge = inject('setBadge')

const list = ref([])
const loading = ref(true)
const loadError = ref('')
const busyId = ref(0)

const q = ref('')
const platform = ref('')
const detail = ref(null)

const canManage = computed(() => can('content.manage'))

async function load(silent) {
  if (!silent) loading.value = true
  try {
    list.value = await legacyApi.listFeedback()
    setBadge('feedback', 0)
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
  registerPoller('feedback', refresh)
})
onBeforeUnmount(() => unregisterPoller('feedback'))

const platforms = computed(() => {
  const s = new Set()
  for (const f of list.value) if (f.client?.platform) s.add(f.client.platform)
  return [...s].sort()
})

const filtered = computed(() => {
  const kw = q.value.trim().toLowerCase()
  return list.value.filter((f) => {
    if (platform.value && (f.client?.platform || '') !== platform.value) return false
    if (!kw) return true
    return (
      f.content.toLowerCase().includes(kw) ||
      (f.user || '').toLowerCase().includes(kw) ||
      String(f.uid || '').includes(kw)
    )
  })
})

const withImage = computed(() => list.value.filter((f) => f.image).length)

async function remove(f) {
  if (!canManage.value) return toast.error('没有内容管理权限')
  const okay = await confirm.ask({
    title: '删除反馈',
    message: `将永久删除这条反馈${f.image ? '（含附带截图）' : ''}，不可恢复。`,
    danger: true,
    confirmText: '删除',
  })
  if (!okay) return
  busyId.value = f.id
  try {
    await legacyApi.removeFeedback(f.id)
    list.value = list.value.filter((x) => x.id !== f.id)
    if (detail.value && detail.value.id === f.id) detail.value = null
    toast.ok('已删除')
  } catch (e) {
    toast.error('删除失败：' + errText(e))
  } finally {
    busyId.value = 0
  }
}
</script>

<template>
  <div class="col" style="gap: 16px">
    <!-- 统计 + 筛选 -->
    <div class="card">
      <div class="toolbar">
        <div class="filters">
          <input v-model="q" class="input" style="width: 240px" placeholder="搜索内容 / 用户 / uid" />
          <select v-model="platform" class="select" style="width: 150px">
            <option value="">全部平台</option>
            <option v-for="p in platforms" :key="p" :value="p">{{ p }}</option>
          </select>
        </div>
        <div class="grow" />
        <span class="badge badge--accent">共 {{ list.length }} 条</span>
        <span v-if="withImage" class="badge">带截图 {{ withImage }}</span>
        <span v-if="q || platform" class="badge badge--muted">命中 {{ filtered.length }}</span>
      </div>
    </div>

    <div class="card">
      <TableSkeleton v-if="loading" :rows="6" :cols="3" />

      <EmptyState v-else-if="loadError" icon="fa-triangle-exclamation" title="加载失败" :sub="loadError">
        <button class="btn btn--sm" @click="load(false)"><i class="fa-solid fa-arrow-rotate-right" /><span>重试</span></button>
      </EmptyState>

      <EmptyState
        v-else-if="!filtered.length"
        icon="fa-comment-dots"
        :title="list.length ? '没有匹配的反馈' : '暂无反馈'"
        :sub="list.length ? '换个关键词试试' : '客户端提交的反馈会出现在这里'"
      />

      <div v-else class="col" style="gap: 0">
        <article v-for="f in filtered" :key="f.id" class="fb">
          <div class="fb__head">
            <div class="row" style="gap: 8px; min-width: 0">
              <span class="fb__user truncate">{{ f.user || ('uid ' + f.uid) }}</span>
              <span v-if="f.uid" class="muted mono" style="font-size: 11.5px">#{{ f.uid }}</span>
              <span v-if="f.client?.platform" class="badge badge--muted">{{ f.client.platform }}</span>
              <span v-if="f.client?.version" class="badge badge--muted">v{{ f.client.version }}</span>
              <span v-if="f.image" class="badge badge--accent">含截图</span>
            </div>
            <div class="row" style="gap: 8px; flex: none">
              <span class="muted nowrap" style="font-size: 11.5px" :title="fmtTime(f.create_time)">
                {{ relTime(f.create_time) }}
              </span>
              <button v-if="canManage" class="btn btn--ghost btn--sm" style="color: var(--danger)"
                :disabled="busyId === f.id" @click="remove(f)">删除</button>
            </div>
          </div>
          <p class="fb__content">{{ f.content }}</p>
          <button v-if="f.image" class="fb__thumb" @click="detail = f">
            <img :src="f.image" alt="反馈截图" loading="lazy" />
            <span class="fb__thumb-mask">点击查看大图</span>
          </button>
        </article>
      </div>
    </div>

    <BaseModal v-if="detail" :title="'反馈截图 · ' + (detail.user || 'uid ' + detail.uid)" width="760px" @close="detail = null">
      <img :src="detail.image" alt="反馈截图" class="shot" />
      <p class="muted" style="font-size: 12.5px; white-space: pre-wrap">{{ detail.content }}</p>
      <template #foot>
        <a class="btn" :href="detail.image" download="feedback.png">下载图片</a>
        <button class="btn btn--primary" @click="detail = null">关闭</button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 10px; padding: 12px 16px; flex-wrap: wrap; }
.filters { display: flex; gap: 8px; flex-wrap: wrap; }

.fb { padding: 14px 16px; border-bottom: 1px solid var(--border); }
.fb:last-child { border-bottom: none; }
.fb__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 7px; }
.fb__user { font-size: 13px; font-weight: 620; max-width: 200px; }
.fb__content {
  font-size: 13.5px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text);
}
.fb__thumb {
  position: relative;
  display: block;
  margin-top: 10px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
  background: var(--bg-sunken);
  cursor: zoom-in;
  max-width: 300px;
}
.fb__thumb img { display: block; width: 100%; max-height: 190px; object-fit: cover; }
.fb__thumb-mask {
  position: absolute;
  inset: auto 0 0 0;
  padding: 5px;
  font-size: 11px;
  text-align: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  opacity: 0;
  transition: opacity var(--t-fast);
}
.fb__thumb:hover .fb__thumb-mask { opacity: 1; }

.shot { width: 100%; max-height: 60vh; object-fit: contain; border-radius: var(--r-md); background: var(--bg-sunken); }
</style>
