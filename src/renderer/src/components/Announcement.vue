<template>
  <div class="announcement-overlay">
    <div class="announcement-card">
      <!-- 页 1：欢迎 -->
      <div v-if="page === 0" class="announcement-page announcement-welcome">
        <div class="announcement-logo">
          <img src="/icon.png" alt="7FA4 Chat" class="announcement-logo-img" />
        </div>
        <p class="announcement-sub">全新版本发布</p>
        <h1>{{ appVersion ? 'V' + appVersion : '' }}</h1>
        <div class="announcement-decor"></div>
      </div>
      <!-- 页 2：本次更新 -->
      <div v-else-if="page === 1" class="announcement-page">
        <h2><i class="fas fa-star"></i> 本次更新</h2>
        <ul class="announcement-list">
          <li>新增「工具中心」：6 个工具改为独立在线包，可下载、更新、卸载，离线可用，支持自定义图标</li>
          <li>工具清单自动刷新：进入工具页、窗口重新聚焦或每 10 分钟后台重拉，失败自动重试</li>
          <li>会话右键新增「不显示 / 取消不显示」：隐藏后不在列表显示，搜索时仍可找到并恢复</li>
          <li>登录新增提示「本节课你不该在教室」</li>
          <li>不再依赖自建后端：更新检查、更新日志、赞助名单改读 GitLab，意见反馈跳转 GitLab Issues</li>
          <li>聊天代码块外观重写：半透明底色、圆角外框、复制按钮触屏常显</li>
          <li>发布流程调整：GitLab 仅保留最新版安装包与 Release，历史版本归档到 GitHub Releases</li>
          <li>修复新手引导中「打开与我的对话」等按钮无法跳转的问题</li>
          <li>下线「发现」页、原题机、海报墙、访问统计、网页端、收藏、截图与消息删除等功能</li>
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
        <img v-if="!qrError" :src="DONATE_URL" alt="赞赏码" class="announcement-donate" @error="qrError = true" @click="donateZoom = true" />
        <p v-else class="announcement-donate-tip">赞赏码加载失败，请稍后刷新重试</p>
        <p v-if="!qrError" class="announcement-donate-tip">点击二维码可放大</p>
        <!-- #18 赞助者列表（表格） -->
        <div class="announcement-sponsors" v-if="sponsorList.length">
          <div class="announcement-sponsor-title">感谢以下赞助者</div>
          <table class="announcement-sponsor-table">
            <thead><tr><th>#</th><th>昵称</th><th>金额</th></tr></thead>
            <tbody>
              <tr v-for="(sp, idx) in sponsorList" :key="idx">
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
        <button class="announcement-btn" @click="$emit('close')"><i class="fas fa-times"></i> 跳过</button>
        <div class="announcement-dots">
          <span v-for="i in 4" :key="i" class="announcement-dot" :class="{ active: page === i - 1 }"></span>
        </div>
        <div class="announcement-nav-right">
          <button v-if="page > 0" class="announcement-btn" @click="page--"><i class="fas fa-chevron-left"></i> 上一页</button>
          <button v-if="page < 3" class="announcement-btn announcement-btn-primary" @click="page++">下一页 <i class="fas fa-chevron-right"></i></button>
          <button v-else class="announcement-btn announcement-btn-primary" @click="$emit('close')">开始使用 <i class="fas fa-check"></i></button>
        </div>
      </div>
    </div>

    <!-- 二维码放大 -->
    <div v-if="donateZoom && !qrError" class="announcement-zoom-overlay" @click="donateZoom = false">
      <img :src="DONATE_URL" alt="赞赏码" class="announcement-zoom-img" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { gitlabRawUrl } from '../utils.js'
import { renderChangelogMarkdown } from '../changelog-md.js'

const DONATE_URL = computed(() => gitlabRawUrl('assets/donate-qr.jpg'))
const appVersion = ref('')
onMounted(async () => {
  try {
    const v = await window.api?.getVersion?.()
    if (v) appVersion.value = String(v).replace(/^v/i, '')
  } catch {}
})
const page = ref(0)
const donateZoom = ref(false)
const qrError = ref(false)
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

// 进入第 3 页（更新日志）时加载官方更新日志
watch(page, (p) => {
  if (p === 2 && !changelogHtml.value && !changelogLoading.value) fetchChangelog()
})
async function fetchChangelog() {
  changelogLoading.value = true
  changelogError.value = ''
  try {
    const result = await window.api.fetchChangelog()
    if (result.success) changelogHtml.value = renderChangelogMarkdown(result.markdown)
    else changelogError.value = result.error || '获取失败'
  } catch (e) { changelogError.value = e.message || '获取失败' }
  changelogLoading.value = false
}
</script>
