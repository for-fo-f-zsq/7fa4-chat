<template>
  <!-- 保留 .donate-view 根类名以兼容 Onboarding 引导定位契约 -->
  <PanelShell class="donate-view" title="赞助" icon="fas fa-heart" :backable="true" @back="emit('back')">
    <div class="donate-grid">
      <UiCard class="donate-qr-card" size="lg">
        <template #header><i class="fas fa-heart donate-card-icon" aria-hidden="true"></i>扫码支持</template>
        <p class="donate-desc">
          7FA4 Chat 由 for_fo_f 独立开发维护，没有任何商业团队与广告，你的每一份赞赏都是持续更新的动力。
        </p>
        <DonateQrBox :src="donateSrc" :qr-error="qrError" @error="onQrImgError" />
      </UiCard>

      <UiCard class="donate-sponsor-card" size="lg">
        <template #header><i class="fas fa-users donate-card-icon" aria-hidden="true"></i>赞助者</template>
        <SponsorTable :sponsors="sponsors" />
      </UiCard>
    </div>
  </PanelShell>
</template>

<script setup>
import { onMounted } from 'vue'
import { UiCard } from '@/ui'
import { useDonateQr } from '@/composables/modals/useDonateQr.js'
import DonateQrBox from '@/components/common/DonateQrBox.vue'
import PanelShell from '@/components/common/PanelShell.vue'
import SponsorTable from '@/components/common/SponsorTable.vue'

const emit = defineEmits(['back'])
const { donateSrc, qrError, sponsors, onQrImgError, loadSponsors } = useDonateQr()

onMounted(() => {
  loadSponsors()
})
</script>

<style scoped src="../../css/components/donate-panel.css"></style>
