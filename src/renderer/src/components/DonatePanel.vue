<template>
  <div class="donate-view">
    <div class="donate-view-header">
      <BackButton title="返回消息列表" @back="emit('back')" />
      <h2>赞助</h2>
    </div>

    <div class="donate-grid">
      <!-- 赞赏码卡片 -->
      <UiCard class="donate-qr-card" size="lg">
        <template #header><i class="fas fa-heart donate-card-icon" aria-hidden="true"></i>扫码支持</template>
        <p class="donate-desc">7FA4 Chat 由 for_fo_f 独立开发维护，没有任何商业团队与广告，你的每一份赞赏都是持续更新的动力。</p>
        <div class="donate-qr-wrap">
          <img v-if="!qrError" :src="DONATE_URL" alt="赞赏码" class="donate-qr-img" title="点击放大" @click="donateZoom = true" @error="qrError = true">
          <p v-if="qrError" class="donate-qr-tip">赞赏码加载失败，请稍后刷新重试</p>
          <p v-else class="donate-qr-tip">微信扫码赞赏 · 点击可放大</p>
        </div>
      </UiCard>

      <!-- 赞助者列表卡片 -->
      <UiCard class="donate-sponsor-card" size="lg">
        <template #header><i class="fas fa-users donate-card-icon" aria-hidden="true"></i>赞助者</template>
        <table v-if="sponsors.length" class="sponsor-table">
          <thead><tr><th>#</th><th>昵称</th><th>金额</th></tr></thead>
          <tbody>
            <tr v-for="(sp, idx) in sponsors" :key="idx">
              <td class="sponsor-idx">{{ idx + 1 }}</td>
              <td class="sponsor-name">{{ sp.name }}</td>
              <td class="sponsor-amount">{{ sp.amount }}</td>
            </tr>
          </tbody>
        </table>
        <UiEmptyState v-else size="sm" icon="fa-heart" title="暂无赞助记录" description="期待你成为第一位支持者" />
      </UiCard>
    </div>

    <!-- 赞赏码放大弹层（图片加载失败时不再提供放大） -->
    <UiModal :open="donateZoom && !qrError" size="lg" @close="donateZoom = false">
      <img :src="DONATE_URL" alt="赞赏码" class="donate-zoom-img" @click="donateZoom = false">
    </UiModal>
  </div>
</template>

<script setup>
// 用法：<DonatePanel @back="view='chat'" />

import { ref, computed, onMounted } from 'vue'
import { gitlabRawUrl } from '../utils.js'
import BackButton from './BackButton.vue'
import { UiCard, UiEmptyState, UiModal } from '@/ui'

const emit = defineEmits(['back'])

// 赞赏码：托管在 GitLab 仓库（assets/donate-qr.jpg）
const DONATE_URL = computed(() => gitlabRawUrl('assets/donate-qr.jpg'))
const donateZoom = ref(false)
const qrError = ref(false) // 图片加载失败时优雅降级：隐藏图片与放大层，只留一行提示
const sponsors = ref([])

async function loadSponsors() {
  try {
    const r = await window.api.fetchSponsors()
    if (r && r.success && Array.isArray(r.list)) sponsors.value = r.list
  } catch {}
}

onMounted(() => {
  loadSponsors()
})
</script>

<style scoped src="../css/donate-panel.css"></style>
