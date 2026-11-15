import { store } from '@/store.js'

export const DEV_UID = 991
export const MSG_WINDOW = 60
export const FREE_HOLD = 9000

export function byText(sel, text) {
  return [...document.querySelectorAll(sel)].find((e) => (e.textContent || '').includes(text)) || null
}

function plusBtn() {
  const btns = document.querySelectorAll('.list-header-actions .inputModal-btn')
  return btns[btns.length - 1] || null
}

function ask(action, payload) {
  window.dispatchEvent(new CustomEvent('onboarding-action', { detail: { action, ...payload } }))
}

export function createOnboardingSteps(baseline) {
  return [
    {
      id: 'login',
      type: 'guide',
      icon: 'fa-sign-in-alt',
      title: '登录你的 OJ 账号',
      text: '在这里输入校内 OJ 的用户名和密码。登录后会自动保持登录态，下次打开不用再输。',
      resolve: () =>
        document.querySelector('.login-root .ui-btn') ||
        byText('.nav-user-menu-item', '登录') ||
        document.querySelector('.banner-login-btn'),
      done: () => !!store.logined,
    },
    {
      id: 'addfriend',
      type: 'guide',
      icon: 'fa-user-plus',
      title: '加我为好友（UID 991）',
      text: '点会话列表右上角「+」→ 添加好友，搜索 991 —— 那就是我（开发者）。使用中遇到任何问题都可以直接找我。',
      resolve: () =>
        document.querySelector('.addfriend-input') ||
        byText('.new-convo-item', '添加好友') ||
        plusBtn(),
      done: () => store.users[DEV_UID]?.watchee === true,
    },
    {
      id: 'sendmsg',
      type: 'guide',
      icon: 'fa-comment-dots',
      title: '发一条消息',
      text: '打开任意会话（找我也可以，点下面的按钮直接开），随便发点什么。Enter 发送、Ctrl+Enter 换行；左边写 Markdown，右边实时预览。',
      resolve: () => document.querySelector('.input-editor') || document.querySelector('.list-section'),
      actionLabel: '打开与我的对话',
      action: () => ask('openUser', { id: DEV_UID }),
      done: () => {
        const now = Date.now() / 1000
        for (const id of Object.keys(store.messages || {})) {
          const m = store.messages[id]
          if (!m || m.sender !== store.self.uid) continue
          const t = Number(m.send_time)
          if (t ? now - t <= MSG_WINDOW : !baseline.msgs.has(Number(id))) return true
        }
        return false
      },
    },
    {
      id: 'group',
      type: 'guide',
      icon: 'fa-users',
      title: '新建一个群聊',
      text: '点「+」→ 创建群聊，填个群名就行。建好后点头顶群名可以改群名、加成员、设管理员。',
      resolve: () =>
        document.querySelector('.inputModal-input') ||
        byText('.new-convo-item', '创建群聊') ||
        plusBtn(),
      done: () => !!byText('.inputModal-popup-inner h4', '新建群聊'),
    },
    {
      id: 'graph',
      type: 'free',
      icon: 'fa-project-diagram',
      title: '玩一下 Graph Editor',
      text: '工具箱 → Graph Editor：点空白处建点、拖点之间连边，再试试工具栏的力导向布局和算法高亮。这一整片都可以随便点。',
      resolve: () =>
        document.querySelector('.graph-tool') ||
        byText('.tool-card', 'Graph Editor') ||
        byText('.nav-icon', '工具'),
      actionLabel: '打开工具箱',
      action: () => ask('switch', { page: 'tools' }),
    },
    {
      id: 'theme',
      type: 'free',
      icon: 'fa-palette',
      title: '挑一个喜欢的主题',
      text: '点头像 → 设置 → 主题：6 套预设配色还能自定义，点开就能实时预览，整个界面马上换新感觉。',
      resolve: () =>
        document.querySelector('.ui-modal') ||
        document.querySelector('.theme-row') ||
        byText('.nav-user-menu-item', '设置') ||
        document.querySelector('.nav-user'),
      actionLabel: '打开设置',
      action: () => ask('switch', { page: 'settings' }),
    },
    {
      id: 'donate',
      type: 'free',
      icon: 'fa-heart',
      title: '赞助支持一下',
      text: '点头像 → 赞助。项目由我一个人独立开发维护、没有广告也没有团队，你的每一份支持都是持续更新的动力。',
      resolve: () =>
        document.querySelector('.donate-view') ||
        byText('.nav-user-menu-item', '赞助') ||
        document.querySelector('.nav-user'),
      actionLabel: '打开赞助页',
      action: () => ask('switch', { page: 'donate' }),
    },
  ]
}
