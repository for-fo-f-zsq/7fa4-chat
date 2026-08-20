<template>
  <div class="announcement-overlay">
    <div class="announcement-card">
      <!-- 页 1：欢迎 -->
      <div v-if="page === 0" class="announcement-page announcement-welcome">
        <div class="announcement-logo">
          <img src="/icon.png" alt="7FA4 Chat" class="announcement-logo-img" />
        </div>
        <p class="announcement-sub">全新版本发布</p>
        <h1>V3.4.1</h1>
        <div class="announcement-decor"></div>
      </div>
      <!-- 页 2：本次更新 -->
      <div v-else-if="page === 1" class="announcement-page">
        <h2><i class="fas fa-star"></i> 本次更新</h2>
        <ul class="announcement-list">
          <li>头像菜单重构：个人信息、收藏、设置、关于、版本公告、意见反馈统一收纳</li>
          <li>登录状态本地持久化，重启应用不退出；重新登录保留密码</li>
          <li>新增意见反馈功能，应用内直接提交建议与 Bug</li>
          <li>关于页与公告新增赞助者表格</li>
          <li>图片编辑新增就地文字工具，所见即所得</li>
          <li>Markdown 编辑器新增富文本工具栏</li>
          <li>表情渲染重构，输入框不再提前渲染</li>
          <li>消息拉取策略优化，历史消息获取更完整</li>
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
        <!-- #18 赞助者列表（表格） -->
        <div class="announcement-sponsors" v-if="sponsorList.length">
          <div class="announcement-sponsor-title">感谢以下赞助者</div>
          <table class="announcement-sponsor-table">
            <thead><tr><th>#</th><th>昵称</th><th>金额</th></tr></thead>
            <tbody>
              <tr v-for="(sp, idx) in sponsorList" :key="sp.name">
                <td class="idx">{{ idx + 1 }}</td>
                <td>{{ sp.name }}</td>
                <td class="amt">{{ sp.amount }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="announcement-sign">for_fo_f</p>
      </div>
      <div class="announcement-nav">
        <button v-if="page > 0" class="announcement-btn" @click="page--"><i class="fas fa-chevron-left"></i> 上一页</button>
        <div class="announcement-dots">
          <span v-for="i in 4" :key="i" class="announcement-dot" :class="{ active: page === i - 1 }"></span>
        </div>
        <button v-if="page < 3" class="announcement-btn announcement-btn-primary" @click="page++">下一页 <i class="fas fa-chevron-right"></i></button>
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
// #18 赞助者
const sponsorList = ref([])
async function loadSponsors() {
  try {
    const r = await window.api.fetchSponsors()
    if (r && r.success && Array.isArray(r.list)) sponsorList.value = r.list
  } catch {}
}
loadSponsors()

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
