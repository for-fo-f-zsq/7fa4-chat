<template>
  <!-- 海报墙：发现页「推荐」视图中的区块。数据来自服务端已审核通过的海报（公开接口只返回图片地址与尺寸）。
       区块始终渲染 —— 空池时也要露出上传入口，否则第一张海报无从投起。 -->
  <div class="disc-section poster-wall">
    <div class="disc-head">
      <div class="disc-title">海报墙 <em v-if="items.length">{{ items.length }}</em></div>
      <span class="disc-more-link poster-wall-upload" title="上传海报（需管理员审核）" @click="uploadVisible = true">
        <i class="fas fa-cloud-upload-alt"></i> 上传海报
      </span>
    </div>

    <div v-if="loading" class="disc-tip">正在获取海报…</div>
    <div v-else-if="error" class="disc-tip">
      {{ error }}
      <span class="disc-retry" @click="load">重试</span>
    </div>
    <div v-else-if="!items.length" class="disc-none">暂无海报，来投第一张（需管理员审核通过后展示）</div>

    <div v-else class="poster-grid">
      <div
        v-for="p in items"
        :key="p.id"
        class="poster-card"
        :class="{ 'is-pinned': p.pinned }"
        :title="p.pinned ? '查看海报（置顶）' : '查看海报'"
        @click="preview(p)"
      >
        <img class="poster-thumb" :src="p.url" :alt="'海报 ' + p.id" loading="lazy" draggable="false" />
        <!-- 置顶角标：服务端已把置顶项排在最前，角标用于说明「为何它排最前」 -->
        <span v-if="p.pinned" class="poster-pin"><i class="fas fa-thumbtack"></i>置顶</span>
      </div>
    </div>

    <div v-if="truncated" class="disc-tip">仅显示最近 {{ MAX_SHOW }} 张</div>

    <PosterUploadModal v-if="uploadVisible" :uid="uid" @close="uploadVisible = false" />
    <ContentPreviewModal
      v-if="previewUrl"
      type="image"
      :src="previewUrl"
      :show-edit="false"
      @close="previewUrl = ''"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import PosterUploadModal from './PosterUploadModal.vue'
import ContentPreviewModal from './ContentPreviewModal.vue'

const props = defineProps({
  uid: { type: [Number, String], default: 0 },
  // 父级（发现页）递增此值即可强制重新拉取 —— 页头的「刷新推荐」按钮应当刷新整页可见内容
  refreshTick: { type: Number, default: 0 }
})

// 一次最多展示的条数：避免海报积累后一次性拉几十张大图（缩略图方案暂未做，先用懒加载 + 截断兜底）
const MAX_SHOW = 30

const items = ref([])
const loading = ref(false)
const error = ref('')
const previewUrl = ref('')
const uploadVisible = ref(false)

const truncated = computed(() => items.value.length >= MAX_SHOW)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const fn = window.api?.fetchPosters
    if (typeof fn !== 'function') {
      items.value = []
      error.value = '当前平台不支持海报'
      return
    }
    const r = await fn()
    if (r && r.success) {
      items.value = (r.items || []).slice(0, MAX_SHOW)
    } else {
      items.value = []
      error.value = (r && r.error) || '海报获取失败'
    }
  } catch (e) {
    items.value = []
    error.value = e.message || '海报获取失败'
  } finally {
    loading.value = false
  }
}

function preview(p) {
  if (p && p.url) previewUrl.value = p.url
}

onMounted(load)
// 多账号切换：uid 变化后重新拉取（与推荐列表同策略，避免停留在上一个账号的结果）
watch(
  () => props.uid,
  (v, old) => {
    if (v !== old) load()
  }
)
// 发现页「刷新推荐」按钮：点击后父级递增 refreshTick，海报墙一并重新拉取
watch(
  () => props.refreshTick,
  (v, old) => {
    if (v !== old) load()
  }
)
</script>
