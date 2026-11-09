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
                <li>网页版上线：浏览器打开 jx.7fa4.cn:8888/7fa4-chat/web 就能聊天，账号沿用 OJ 登录</li>
                <li>网页版按会话懒加载：列表只探时间戳，点开才拉消息，上翻按需补历史，首屏更快、流量更省</li>
                <li>默认主题主色加深、底色转中性蓝灰，按钮图标与 @提醒更清楚</li>
                <li>姓名库按最新 OJ 数据重建，年级显示更准；文件卡片固定宽度</li>
                <li>下载与官网入口统一指向官网，侧栏、更新面板、关于面板都能直达</li>
                <li>修复性能档全白、纯文本换行被吞、上翻被弹回底部、列表丢标记、私信投票无反应等问题</li>
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
        <img :src="DONATE_URL" alt="赞赏码" class="announcement-zoom-img" @click="donateZoom = false" />
      </UiModal>
    </div>
  </Transition>
</template>

<script setup>
// 用法：<Announcement :visible="showAnnouncement" @close="showAnnouncement = false" />
// 组件常驻（不再由父级 v-if 卸载）：根节点 overlay 的 v-if="visible" 让 <Transition name="overlay"> 的 leave 真正执行。

import { ref, computed, watch, onMounted } from 'vue'
import { gitlabRawUrl } from '../utils.js'
import { assetUrl } from '../platform/asset-base.js'
import { renderChangelogMarkdown } from '../changelog-md.js'
import { UiBanner, UiButton, UiCard, UiEmptyState, UiModal, UiSpinner } from '@/ui'

const iconUrl = assetUrl('icon.png')

const DONATE_URL = computed(() => gitlabRawUrl('assets/donate-qr.jpg'))
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
