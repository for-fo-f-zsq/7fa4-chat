<template>
  <Transition name="overlay" appear>
    <div v-if="visible" class="announcement-overlay">
        <UiCard class="announcement-card motion-pop-in" size="lg">
          <Transition name="fade-left" mode="out-in">
            <!-- 页 1：欢迎 -->
            <div v-if="page === 0" key="welcome" class="announcement-page announcement-welcome">
              <div class="announcement-logo">
                <img :src="iconUrl" alt="7FA4 Chat" class="announcement-logo-img" />
              </div>
              <p class="announcement-sub">全新版本发布</p>
              <h1>{{ appVersion ? 'V' + appVersion : '' }}</h1>
              <div class="announcement-decor"></div>
            </div>
            <!-- 页 2：本次更新 -->
            <div v-else-if="page === 1" key="update" class="announcement-page">
              <h2><i class="fas fa-star"></i> 本次更新</h2>
              <ul class="announcement-list">
                <li>全新官网上线（jx.7fa4.cn:8888/7fa4-chat/）：聚合多平台安装包下载、更新日志、常见问题与赞助名单</li>
                <li>内置意见反馈系统：应用内直接提交问题或建议（支持粘贴最多 3 张截图），无需另外跳转登录 GitLab</li>
                <li>桌面端新增首次启动欢迎介绍，最后一页可自主选择进入功能教程或直接开始使用</li>
                <li>顶部状态横幅改为居中悬浮胶囊，出现或关闭时不再挤压会话列表与聊天区</li>
                <li>图片与表情发送压缩对齐 OJ 后端（1280px + 消息体自适应降质），解决大图「消息过长」发送失败</li>
                <li>修复网页版上滑历史只能翻一页或被弹回底部、以及断线或会话失效时卡在加载遮罩的问题</li>
              </ul>
            </div>
            <!-- 页 3：更新日志 -->
            <div v-else-if="page === 2" key="changelog" class="announcement-page">
              <h2><i class="fas fa-file-alt"></i> 更新日志</h2>
              <div class="announcement-changelog">
                <div v-if="changelogLoading" class="changelog-loading">
                  <UiSpinner size="sm" label="加载更新日志中" /> 加载中...
                </div>
                <UiBanner v-else-if="changelogError" variant="danger" :description="changelogError" />
                <div v-else-if="changelogHtml" class="changelog-body" v-html="changelogHtml"></div>
                <UiEmptyState v-else size="sm" icon="fa-inbox" title="暂无更新日志" />
              </div>
            </div>
            <!-- 页 4：欢迎赞赏 -->
            <div v-else-if="page === 3" key="thanks" class="announcement-page announcement-thanks">
              <h2><i class="fas fa-heart"></i> 喜欢这个应用吗？</h2>
              <p>由 for_fo_f 独立开发维护，你的每一份赞赏都是持续更新的动力</p>
              <img v-if="!qrError" :src="donateSrc" alt="赞赏码" class="announcement-donate" @error="onQrImgError" @click="donateZoom = true" />
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
          </Transition>
          <div class="announcement-nav">
            <UiButton variant="text" size="sm" icon="fas fa-times" @click="$emit('close')">跳过</UiButton>
            <div class="announcement-dots">
              <span v-for="i in 4" :key="i" class="announcement-dot" :class="{ active: page === i - 1 }"></span>
            </div>
            <div class="announcement-nav-right">
              <UiButton v-if="page > 0" variant="secondary" size="sm" icon="fas fa-chevron-left" @click="page--">上一页</UiButton>
              <UiButton v-if="page < 3" variant="primary" size="sm" @click="page++">
                下一页<template #trailing><i class="fas fa-chevron-right"></i></template>
              </UiButton>
              <UiButton v-else variant="primary" size="sm" @click="$emit('close')">
                开始使用<template #trailing><i class="fas fa-check"></i></template>
              </UiButton>
            </div>
          </div>
        </UiCard>

      <!-- 二维码放大 -->
      <UiModal :open="donateZoom && !qrError" size="lg" @close="donateZoom = false">
        <img :src="donateSrc" alt="赞赏码" class="announcement-zoom-img" @click="donateZoom = false" />
      </UiModal>
    </div>
  </Transition>
</template>

<script setup>
// 用法：<Announcement :visible="showAnnouncement" @close="showAnnouncement = false" />
// 组件常驻（不再由父级 v-if 卸载）：根节点 overlay 的 v-if="visible" 让 <Transition name="overlay"> 的 leave 真正执行。

import { ref, computed, watch, onMounted } from 'vue'
import { gitlabRawUrl, officialSiteUrl } from '../utils.js'
import { assetUrl } from '../platform/asset-base.js'
import { renderChangelogMarkdown } from '../changelog-md.js'
import { UiBanner, UiButton, UiCard, UiEmptyState, UiModal, UiSpinner } from '@/ui'

const iconUrl = assetUrl('icon.png')

const useFallbackQr = ref(false)
const donateSrc = computed(() => (
  useFallbackQr.value ? gitlabRawUrl('assets/donate-qr.jpg') : `${officialSiteUrl()}donate-qr.jpg`
))
function onQrImgError() {
  if (!useFallbackQr.value) {
    useFallbackQr.value = true
    return
  }
  qrError.value = true
}
const props = defineProps({
  visible: { type: Boolean, default: false },
})
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
// 常驻组件：首次真正打开公告时再拉赞助者列表，避免启动期无谓 IPC
watch(() => props.visible, (v) => {
  if (v && !sponsorList.value.length) loadSponsors()
}, { immediate: true })

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

<style scoped src="../css/announcement.css"></style>
