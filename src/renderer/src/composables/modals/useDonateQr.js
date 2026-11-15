import { computed, ref } from 'vue'
import { gitlabRawUrl, officialSiteUrl } from '../../utils.js'

/**
 * 赞赏码加载（官网优先，失败回退 GitLab 仓库）、放大开关与赞助者名单拉取。
 */
export function useDonateQr() {
  const useFallbackQr = ref(false)
  const donateSrc = computed(() =>
    useFallbackQr.value ? gitlabRawUrl('assets/donate-qr.jpg') : `${officialSiteUrl()}donate-qr.jpg`,
  )
  const donateZoom = ref(false)
  const qrError = ref(false)
  const sponsors = ref([])

  function onQrImgError() {
    if (!useFallbackQr.value) {
      useFallbackQr.value = true
      return
    }
    qrError.value = true
  }

  async function loadSponsors() {
    try {
      const r = await window.api.fetchSponsors()
      if (r && r.success && Array.isArray(r.list)) sponsors.value = r.list
    } catch {
      /* ignore */
    }
  }

  return {
    donateSrc,
    donateZoom,
    qrError,
    sponsors,
    onQrImgError,
    loadSponsors,
  }
}
