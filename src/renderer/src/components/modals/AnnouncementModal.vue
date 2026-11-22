<template>
  <UiModal :open="visible" size="lg" :show-close="false" aria-label="版本公告" @close="emit('close')">
    <Transition name="fade-left" mode="out-in">
      <div v-if="page === 0" key="welcome" class="announcement-page announcement-welcome">
        <div class="announcement-welcome-inner">
          <div class="announcement-badge">
            <i class="fas fa-star" aria-hidden="true"></i>
            <span>体验完善 · 强提示与分析增强</span>
          </div>

          <div class="announcement-logo-stage">
            <span class="announcement-aura" aria-hidden="true"></span>
            <div class="announcement-logo">
              <img :src="iconUrl" alt="7FA4 Chat" class="announcement-logo-img" />
            </div>
          </div>

          <h1 class="announcement-version u-tabular-nums">V{{ appVersion || '4.0.1' }}</h1>
          <p class="announcement-tagline">站点强制通知、点权图论算法、分时段可用率监控与消息轮询全面加固</p>

          <div class="announcement-pillars motion-stagger">
            <div v-for="pillar in PILLARS" :key="pillar.label" class="announcement-pillar">
              <i :class="pillar.icon" aria-hidden="true"></i>
              <div class="announcement-pillar-text">
                <strong>{{ pillar.label }}</strong>
                <span>{{ pillar.sub }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="page === 1" key="update" class="announcement-page announcement-page--highlights">
        <div class="announcement-head">
          <h2><i class="fas fa-star" aria-hidden="true"></i> 本次更新亮点</h2>
          <p class="announcement-head-sub">从界面原语、表情系统到内置工具箱的全面重制</p>
        </div>

        <div class="announcement-scroll">
          <div class="announcement-grid motion-stagger">
            <article v-for="(item, idx) in HIGHLIGHTS" :key="idx" class="announcement-card">
              <div class="announcement-card-icon">
                <i :class="item.icon" aria-hidden="true"></i>
              </div>
              <div class="announcement-card-body">
                <div class="announcement-card-top">
                  <span class="announcement-card-tag">{{ item.tag }}</span>
                  <h3>{{ item.title }}</h3>
                </div>
                <p>{{ item.desc }}</p>
              </div>
            </article>
          </div>
        </div>
      </div>

      <div v-else-if="page === 2" key="changelog" class="announcement-page announcement-page--changelog">
        <div class="announcement-head">
          <h2><i class="fas fa-file-alt" aria-hidden="true"></i> 完整更新日志</h2>
          <p class="announcement-head-sub">V{{ appVersion || '4.0.1' }} 及历代版本变更详情</p>
        </div>
        <div class="announcement-changelog">
          <ChangelogViewer :auto-load="true" :prefer-local="true" :fallback-markdown="bundledChangelog" />
        </div>
      </div>

      <div v-else-if="page === 3" key="thanks" class="announcement-page announcement-thanks">
        <div class="announcement-head">
          <h2><i class="fas fa-heart" aria-hidden="true"></i> 喜欢这个全新的开始吗？</h2>
          <p class="announcement-head-sub">由 for_fo_f 独立开发维护，你的每一份赞赏与反馈都是持续打磨的动力</p>
        </div>

        <div class="announcement-thanks-grid" :class="{ 'is-solo': !sponsors.length }">
          <div class="announcement-donate-card">
            <DonateQrBox :src="donateSrc" :qr-error="qrError" compact @error="onQrImgError" />
            <p class="announcement-sign">— for_fo_f · 2026 —</p>
          </div>

          <div v-if="sponsors.length" class="announcement-sponsors">
            <div class="announcement-sponsor-head">
              <span class="announcement-sponsor-title">感谢以下赞助者</span>
              <span class="announcement-sponsor-count u-tabular-nums">{{ sponsors.length }} 人</span>
            </div>
            <div class="announcement-sponsor-scroll">
              <SponsorTable :sponsors="sponsors" :show-empty="false" />
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <template #footer>
      <div class="p-modal-footer p-modal-footer--between">
        <UiButton variant="text" size="sm" icon="fas fa-times" @click="emit('close')">跳过</UiButton>
        <StepDots :count="4" :current="page" centered />
        <div class="announcement-nav-right">
          <UiButton v-if="page > 0" variant="secondary" size="sm" icon="fas fa-chevron-left" @click="page--">上一页</UiButton>
          <UiButton v-if="page < 3" variant="primary" size="sm" @click="page++">
            下一页<template #trailing><i class="fas fa-chevron-right"></i></template>
          </UiButton>
          <UiButton v-else variant="primary" size="sm" @click="emit('close')">
            开启 V{{ appVersion || '4.0.1' }}<template #trailing><i class="fas fa-check"></i></template>
          </UiButton>
        </div>
      </div>
    </template>
  </UiModal>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import bundledChangelog from '../../../../../CHANGELOG?raw'
import { UiButton, UiModal } from '@/ui'
import { assetUrl } from '@/platform/asset-base.js'
import { useDonateQr } from '@/composables/modals/useDonateQr.js'
import ChangelogViewer from '@/components/common/ChangelogViewer.vue'
import DonateQrBox from '@/components/common/DonateQrBox.vue'
import SponsorTable from '@/components/common/SponsorTable.vue'
import StepDots from '@/components/common/StepDots.vue'

const PILLARS = [
  { icon: 'fas fa-bell', label: '站点强制通知', sub: '屏幕右下角强置顶 · 确认/已读' },
  { icon: 'fas fa-project-diagram', label: '点权图论算法', sub: '树形独立集 · DAG 最长权路' },
  { icon: 'fas fa-heartbeat', label: '分时段连接监控', sub: '72 小时可用率 · 即时悬浮明细' },
  { icon: 'fas fa-shield-alt', label: '同步与持久化加固', sub: '基线修复 · 主题实时适配' },
]

const HIGHLIGHTS = [
  {
    icon: 'fas fa-bell',
    tag: '站点通知',
    title: '屏幕右下角强制置顶通知弹窗',
    desc: '每轮自动拉取 OJ 系统通知，桌面端以无边框屏幕右下角 screen-saver 级置顶窗弹出并跟随当前浅/深主题，支持分别「确认」或「已读」关闭与设置页测试。',
  },
  {
    icon: 'fas fa-project-diagram',
    tag: '图论工具',
    title: '新增点权图论分析与稳定侧栏',
    desc: '扩展树形 DP 最大点权独立集、子树点权和、DAG 最长权路与 Tarjan 缩点路径及加权重心统计，锁定分析面板高度彻底消除左侧栏滚动抖动。',
  },
  {
    icon: 'fas fa-chart-bar',
    tag: '连接状态',
    title: '72 小时分时段可用率统计',
    desc: '持久化记录各小时在线/异常/离线时长与可用率，悬停时段条即时查看明细且不再闪烁，接口延迟节流为 10 秒刷新。',
  },
  {
    icon: 'fas fa-sync-alt',
    tag: '消息同步',
    title: '修复重复轮询与初始全量同步',
    desc: '补齐桌面端首次同步的 target-times 基线播种，彻底消除空闲状态下重复请求 /chat/chat；升级全库同步与 SQLite FULL/TRUNCATE 退出落盘。',
  },
  {
    icon: 'fas fa-window-restore',
    tag: '工具与交互',
    title: '图片预览互通与导航栏精修',
    desc: '恢复图片预览「用图片编辑器打开」跨窗编辑后回传发送；默认开启开机自启动，「关于」移至侧栏第 4 项（Ctrl+4）并修复 Windows 开发态图标。',
  },
  {
    icon: 'fas fa-rocket',
    tag: '发布工程',
    title: '官网自动部署自愈与包校验加固',
    desc: '优化服务器自动构建检测与 GitLab 发布上传顺序，降低网页端升级遗漏或上传竞争风险。',
  },
]

const props = defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const iconUrl = assetUrl('icon.png')
const appVersion = ref('')
const page = ref(0)

const { donateSrc, qrError, sponsors, onQrImgError, loadSponsors } = useDonateQr()

onMounted(async () => {
  try {
    const v = await window.api?.getVersion?.()
    if (v) appVersion.value = String(v).replace(/^v/i, '')
  } catch {
    /* ignore */
  }
})

watch(
  () => props.visible,
  (v) => {
    if (v) {
      page.value = 0
      loadSponsors()
    }
  },
  { immediate: true }
)
</script>

<style scoped src="../../css/components/announcement-modal.css"></style>
