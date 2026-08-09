<template>
  <div class="announcement-overlay">
    <div class="announcement-card">
      <!-- 页 1：欢迎 -->
      <div v-if="page === 0" class="announcement-page announcement-welcome">
        <div class="announcement-logo">
          <img src="/icon.png" alt="7FA4 Chat" class="announcement-logo-img" />
        </div>
        <p class="announcement-sub">全新版本发布</p>
        <h1>V3.3.3</h1>
        <div class="announcement-decor"></div>
      </div>
      <!-- 页 2：本次更新 -->
      <div v-else-if="page === 1" class="announcement-page">
        <h2><i class="fas fa-star"></i> 本次更新</h2>
        <ul class="announcement-list">
          <li>本地数据存储重构，更安全更稳定</li>
          <li>@提及逻辑重构，多人提醒更准确</li>
          <li>GeoGebra 数学画板完整版，画圆等全功能</li>
          <li>窄长窗口单列布局，体验更好</li>
          <li>多项界面优化与问题修复</li>
        </ul>
      </div>
      <!-- 页 3：更新日志 -->
      <div v-else-if="page === 2" class="announcement-page">
        <h2><i class="fas fa-file-alt"></i> 更新日志</h2>
        <div class="announcement-changelog">
          <div v-if="changelogLoading" class="changelog-loading"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>
          <div v-else-if="changelogError" class="changelog-error"><i class="fas fa-times-circle"></i> {{ changelogError }}</div>
          <div v-else-if="changelogHtml" class="changelog-body" v-html="changelogHtml"></div>
          <div v-else class="changelog-empty">暂无更新日志</div>
        </div>
      </div>
      <!-- 页 4：欢迎赞赏 -->
      <div v-else-if="page === 3" class="announcement-page announcement-thanks">
        <h2><i class="fas fa-heart"></i> 喜欢这个应用吗？</h2>
        <p>由 for_fo_f 独立开发维护，你的每一份赞赏都是持续更新的动力</p>
        <img :src="DONATE_URL" alt="赞赏码" class="announcement-donate" @click="donateZoom = true" />
        <p class="announcement-donate-tip">点击二维码可放大</p>
        <p class="announcement-sign">for_fo_f</p>
      </div>
      <!-- 页 5：生日快乐 -->
      <div v-else class="announcement-page announcement-birthday">
        <div class="announcement-birthday-cake">🎂</div>
        <h2>祝 for_fo_f 生日快乐</h2>
        <p class="announcement-easter-egg">祝 FMQ 生日快乐</p>
      </div>

      <div class="announcement-nav">
        <button v-if="page > 0" class="announcement-btn" @click="page--"><i class="fas fa-chevron-left"></i> 上一页</button>
        <div class="announcement-dots">
          <span v-for="i in 5" :key="i" class="announcement-dot" :class="{ active: page === i - 1 }"></span>
        </div>
        <button v-if="page < 4" class="announcement-btn announcement-btn-primary" @click="page++">下一页 <i class="fas fa-chevron-right"></i></button>
        <button v-else class="announcement-btn announcement-btn-primary" @click="$emit('close')">开始使用 <i class="fas fa-check"></i></button>
      </div>
    </div>

    <!-- 二维码放大 -->
    <div v-if="donateZoom" class="announcement-zoom-overlay" @click="donateZoom = false">
      <img :src="DONATE_URL" alt="赞赏码" class="announcement-zoom-img" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const DONATE_URL = 'https://chat.forfof.cloud/assets/donate-qr.jpg'
const page = ref(0)
const donateZoom = ref(false)
const changelogLoading = ref(false)
const changelogError = ref('')
const changelogHtml = ref('')

// 进入第 3 页时加载官方更新日志
watch(page, (p) => {
  if (p === 2 && !changelogHtml.value && !changelogLoading.value) fetchChangelog()
})
async function fetchChangelog() {
  changelogLoading.value = true
  changelogError.value = ''
  try {
    const result = await window.api.fetchChangelog()
    if (result.success) changelogHtml.value = result.html
    else changelogError.value = result.error || '获取失败'
  } catch (e) { changelogError.value = e.message || '获取失败' }
  changelogLoading.value = false
}
</script>
