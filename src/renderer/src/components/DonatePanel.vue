<template>
  <div class="donate-view">
    <div class="donate-view-header">
      <h2>赞助</h2>
    </div>

    <div class="donate-grid">
      <!-- 赞赏码卡片 -->
      <div class="donate-card donate-qr-card">
        <div class="donate-card-title"><i class="fas fa-heart"></i>扫码支持</div>
        <p class="donate-desc">7FA4 Chat 由 for_fo_f 独立开发维护，没有任何商业团队与广告，你的每一份赞赏都是持续更新的动力。</p>
        <div class="donate-qr-wrap">
          <img :src="DONATE_URL" alt="赞赏码" class="donate-qr-img" @click="donateZoom = true" title="点击放大">
          <p class="donate-qr-tip">微信扫码赞赏 · 点击可放大</p>
        </div>
      </div>

      <!-- 赞助者列表卡片 -->
      <div class="donate-card donate-sponsor-card">
        <div class="donate-card-title"><i class="fas fa-users"></i>赞助者</div>
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
        <div v-else class="donate-empty">暂无赞助记录，期待你成为第一位支持者</div>
      </div>
    </div>

    <!-- 赞赏码放大弹层 -->
    <div v-if="donateZoom" class="donate-zoom-overlay" @click="donateZoom = false">
      <img :src="DONATE_URL" alt="赞赏码" class="donate-zoom-img">
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

// 赞赏码（托管在 chat.forfof.cloud/assets/donate-qr.jpg）
const DONATE_URL = 'https://chat.forfof.cloud/assets/donate-qr.jpg'
const donateZoom = ref(false)
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