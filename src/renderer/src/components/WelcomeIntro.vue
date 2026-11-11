<template>
  <!-- 根节点就是 .welcome-overlay 本身（固定全屏），进场淡入交给 App.vue 的
       <Transition name="overlay" appear>，组件内部不再套一层 Transition ——
       否则组件根是 Transition 而外层又是一个 Transition，外层拿不到单一元素根。 -->
  <div class="welcome-overlay">
    <UiButton class="welcome-skip" variant="text" size="sm" @click="finish(false)">跳过</UiButton>

    <div class="welcome-body">
      <Transition name="fade-left" mode="out-in">
        <section :key="page" class="welcome-page">
          <!-- 最后一页：让用户自己选择是否进入新手教程 -->
          <template v-if="isLast">
            <div class="welcome-icon welcome-icon--final">
              <i class="fas fa-flag-checkered"></i>
            </div>
            <h1>准备好了</h1>
            <p class="welcome-desc">
              要不要跟着新手教程走一遍？大约 1 分钟，会带你看登录、加好友、发消息、建群和工具箱。
            </p>
            <p class="welcome-hint">以后也可以在「设置 → 关于」里重新打开教程。</p>
          </template>
          <template v-else>
            <div class="welcome-icon" :class="{ 'welcome-icon--app': page === 0 }">
              <img v-if="page === 0" :src="iconUrl" alt="7FA4 Chat" class="welcome-logo" />
              <i v-else :class="'fas ' + pages[page].icon"></i>
            </div>
            <h1>{{ pages[page].title }}</h1>
            <p class="welcome-desc">{{ pages[page].desc }}</p>
            <ul class="welcome-points">
              <li v-for="point in pages[page].points" :key="point">{{ point }}</li>
            </ul>
          </template>
        </section>
      </Transition>
    </div>

    <div class="welcome-nav">
      <div class="welcome-dots">
        <span
          v-for="(p, i) in pages.length + 1"
          :key="i"
          class="welcome-dot"
          :class="{ active: page === i }"
        ></span>
      </div>
      <div class="welcome-actions">
        <template v-if="isLast">
          <UiButton variant="secondary" size="lg" @click="finish(false)">跳过教程</UiButton>
          <UiButton variant="primary" size="lg" icon="fas fa-graduation-cap" @click="finish(true)">
            进入新手教程
          </UiButton>
        </template>
        <template v-else>
          <UiButton v-if="page > 0" variant="secondary" size="md" icon="fas fa-chevron-left" @click="page--">
            上一步
          </UiButton>
          <UiButton variant="primary" size="md" @click="page++">
            下一步<template #trailing><i class="fas fa-chevron-right"></i></template>
          </UiButton>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
// 首次打开应用时的全屏介绍：数页功能介绍 → 最后一页由用户选择「进入新手教程 / 跳过教程」。
// 只在桌面端首次启动出现（App.vue 用 localStorage 'welcome-seen' 判定），网页版不展示。
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { assetUrl } from '../platform/asset-base.js'
import { UiButton } from '@/ui'

const emit = defineEmits(['finish'])

const iconUrl = assetUrl('icon.png')

const pages = [
  {
    icon: 'fa-comments',
    title: '欢迎使用 7FA4 Chat',
    desc: '连接 OJ 的桌面聊天客户端。用 OJ 账号直接登录，和同学实时聊天。',
    points: ['账号沿用 OJ，不需要另外注册', '群聊、私信、@提醒一站搞定']
  },
  {
    icon: 'fa-bolt',
    title: '消息即时同步',
    desc: '只拉有新消息的会话，空闲时几乎不发请求，快且省流量。',
    points: ['表情、图片、文件、投票都能发', '断线会自动重连，不打断浏览']
  },
  {
    icon: 'fa-pen-nib',
    title: 'Markdown 双栏编辑',
    desc: '左边写、右边实时预览：公式、代码块、表格和洛谷扩展语法都支持。',
    points: ['Enter 发送，Ctrl+Enter / Shift+Enter 换行', '消息支持长文可展开收起']
  },
  {
    icon: 'fa-palette',
    title: '主题与外观',
    desc: '六套内置主题，也可以自定义配色；机器吃力时切到「性能」档即可关闭动效。',
    points: ['雾蓝 / 暖沙 / 鼠尾草 / 暗夜 / 石墨 / 高对比', '字号、圆角、密度都可以调']
  },
  {
    icon: 'fa-toolbox',
    title: '内置工具箱',
    desc: 'Graph Editor、计算器、Markdown 工具、计时器，用到时一键下载，不占安装包。',
    points: ['工具与聊天窗口互不干扰', '按需远程加载，用完随时切换回会话']
  }
]

const page = ref(0)
const isLast = computed(() => page.value === pages.length)

function finish(tutorial) {
  emit('finish', { tutorial })
}

// 键盘：← → 翻页，Enter 下一步，Esc 跳过（最后一页 Esc 视为跳过教程）
function onKeydown(e) {
  if (e.key === 'ArrowRight' || e.key === 'Enter') {
    e.preventDefault()
    if (isLast.value) finish(false)
    else page.value++
  } else if (e.key === 'ArrowLeft') {
    if (page.value > 0) page.value--
  } else if (e.key === 'Escape') {
    finish(false)
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped src="../css/welcome-intro.css"></style>
