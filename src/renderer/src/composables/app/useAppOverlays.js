import { onUnmounted, ref } from 'vue'
import { compareVersion } from '../../utils.js'

const WELCOME_KEY = 'welcome-seen'
const ONBOARDING_KEY = 'onboarding-seen'
const SEEN_VERSION_KEY = 'announcement-seen-version'

/**
 * 应用级覆盖层编排：首次欢迎介绍、新手指引、版本公告、意见反馈弹窗。
 * @param {boolean} isWeb
 */
export function useAppOverlays(isWeb) {
  const showWelcome = ref(false)
  const showOnboarding = ref(false)
  const showAnnouncement = ref(false)
  const showFeedback = ref(false)
  const announcementPending = ref(false)

  try {
    if (!isWeb && localStorage.getItem(WELCOME_KEY) !== '1') showWelcome.value = true
  } catch {
    /* ignore */
  }

  function finishWelcome({ tutorial }) {
    showWelcome.value = false
    try {
      localStorage.setItem(WELCOME_KEY, '1')
    } catch {
      /* ignore */
    }
    if (tutorial) showOnboarding.value = true
    else if (announcementPending.value) showAnnouncement.value = true
  }

  function closeOnboarding() {
    showOnboarding.value = false
    try {
      localStorage.setItem(ONBOARDING_KEY, '1')
    } catch {
      /* ignore */
    }
    if (announcementPending.value) showAnnouncement.value = true
  }

  async function checkAnnouncement() {
    try {
      const v = await window.api.getVersion()
      const seen = localStorage.getItem(SEEN_VERSION_KEY) || ''
      if (!seen) {
        localStorage.setItem(SEEN_VERSION_KEY, v)
        return
      }
      if (compareVersion(v, seen) > 0) {
        if (showWelcome.value || showOnboarding.value) announcementPending.value = true
        else showAnnouncement.value = true
      }
    } catch {
      /* ignore */
    }
  }

  async function closeAnnouncement() {
    showAnnouncement.value = false
    try {
      localStorage.setItem(SEEN_VERSION_KEY, await window.api.getVersion())
    } catch {
      /* ignore */
    }
  }

  const onOpenAnnouncement = () => {
    showAnnouncement.value = true
  }
  const onOpenOnboarding = () => {
    showOnboarding.value = true
  }
  const onOpenFeedback = () => {
    showFeedback.value = true
  }

  window.addEventListener('open-announcement', onOpenAnnouncement)
  window.addEventListener('open-onboarding', onOpenOnboarding)
  window.addEventListener('open-feedback', onOpenFeedback)

  onUnmounted(() => {
    window.removeEventListener('open-announcement', onOpenAnnouncement)
    window.removeEventListener('open-onboarding', onOpenOnboarding)
    window.removeEventListener('open-feedback', onOpenFeedback)
  })

  checkAnnouncement()

  return {
    showWelcome,
    showOnboarding,
    showAnnouncement,
    showFeedback,
    finishWelcome,
    closeOnboarding,
    closeAnnouncement,
  }
}
