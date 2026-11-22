<template>
  <UiModal
    :open="open"
    title="拍照"
    size="md"
    @update:open="(v) => !v && handleClose()"
  >
    <div class="camera-modal-body">
      <div v-if="cameraOptions.length > 1 && !capturedDataUrl" class="camera-toolbar">
        <span class="camera-toolbar-label">摄像头</span>
        <UiDropdown
          class="camera-device-select"
          size="sm"
          :model-value="selectedDeviceId"
          :options="cameraOptions"
          aria-label="选择摄像头"
          @update:model-value="onSelectDevice"
        />
      </div>

      <div class="camera-stage">
        <div v-if="error" class="camera-error-box">
          <UiBanner variant="danger" :description="error" />
          <UiButton variant="secondary" size="sm" icon="fas fa-rotate-right" @click="startCamera()">
            重试开启摄像头
          </UiButton>
        </div>

        <template v-else>
          <img
            v-if="capturedDataUrl"
            :src="capturedDataUrl"
            alt="拍照预览"
            class="camera-preview-img"
          />
          <video
            v-show="!capturedDataUrl"
            ref="videoEl"
            class="camera-video"
            autoplay
            playsinline
            muted
          ></video>
          <div v-if="starting && !capturedDataUrl" class="camera-loading">
            <i class="fas fa-spinner motion-spin" aria-hidden="true"></i>
            <span>正在开启摄像头...</span>
          </div>
        </template>
      </div>
    </div>

    <template #footer>
      <UiButton variant="secondary" size="sm" @click="handleClose">取消</UiButton>
      <template v-if="capturedDataUrl">
        <UiButton variant="secondary" size="sm" icon="fas fa-rotate-left" @click="retakePhoto">
          重拍
        </UiButton>
        <UiButton variant="primary" size="sm" icon="fas fa-check" @click="confirmCapture">
          确认附带
        </UiButton>
      </template>
      <UiButton
        v-else
        variant="primary"
        size="sm"
        icon="fas fa-camera"
        :disabled="!streamReady || starting || !!error"
        @click="capturePhoto"
      >
        拍照
      </UiButton>
    </template>
  </UiModal>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { UiBanner, UiButton, UiDropdown, UiModal } from '@/ui'

const props = defineProps({
  open: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'capture'])

const videoEl = ref(null)
const devices = ref([])
const selectedDeviceId = ref('')
const capturedDataUrl = ref('')
const starting = ref(false)
const streamReady = ref(false)
const error = ref('')

let mediaStream = null
let requestSeq = 0

const cameraOptions = computed(() =>
  devices.value.map((d, idx) => ({
    value: d.deviceId,
    label: d.label || `摄像头 ${idx + 1}`,
  })),
)

function stopStream() {
  streamReady.value = false
  if (mediaStream) {
    for (const track of mediaStream.getTracks()) {
      try { track.stop() } catch {}
    }
    mediaStream = null
  }
  if (videoEl.value) {
    try { videoEl.value.srcObject = null } catch {}
  }
}

async function refreshDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return
  try {
    const list = await navigator.mediaDevices.enumerateDevices()
    const cams = list.filter((d) => d.kind === 'videoinput')
    devices.value = cams
    if (!selectedDeviceId.value && cams.length) {
      const activeTrack = mediaStream?.getVideoTracks?.()[0]
      const activeId = activeTrack?.getSettings?.()?.deviceId
      selectedDeviceId.value = activeId || cams[0].deviceId
    }
  } catch {}
}

function formatCameraError(err) {
  const name = err?.name || ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return '摄像头权限被拒绝，请在系统或浏览器设置中允许访问摄像头'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return '未检测到可用的摄像头设备'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return '摄像头正被其他应用占用，请关闭占用程序后重试'
  }
  return err?.message ? `无法打开摄像头：${err.message}` : '无法打开摄像头'
}

async function startCamera(deviceId = selectedDeviceId.value) {
  const seq = ++requestSeq
  stopStream()
  error.value = ''
  starting.value = true

  if (!navigator.mediaDevices?.getUserMedia) {
    starting.value = false
    error.value = '当前环境不支持摄像头取景，请使用「文件」选择图片'
    return
  }

  try {
    const constraints = {
      video: deviceId ? { deviceId: { exact: deviceId } } : true,
      audio: false,
    }
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    if (!props.open || seq !== requestSeq) {
      for (const track of stream.getTracks()) {
        try { track.stop() } catch {}
      }
      return
    }
    mediaStream = stream
    await refreshDevices()
    await nextTick()
    if (!props.open || seq !== requestSeq) {
      stopStream()
      return
    }
    const video = videoEl.value
    if (video) {
      try { video.srcObject = stream } catch {}
      try { Promise.resolve(video.play?.()).catch(() => {}) } catch {}
    }
    streamReady.value = true
  } catch (err) {
    if (seq === requestSeq) {
      error.value = formatCameraError(err)
    }
  } finally {
    if (seq === requestSeq) {
      starting.value = false
    }
  }
}

function onSelectDevice(deviceId) {
  if (!deviceId || deviceId === selectedDeviceId.value) return
  selectedDeviceId.value = deviceId
  startCamera(deviceId)
}

function capturePhoto() {
  const video = videoEl.value
  if (!video || !streamReady.value) return
  const w = video.videoWidth || 640
  const h = video.videoHeight || 480
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.drawImage(video, 0, 0, w, h)
  capturedDataUrl.value = canvas.toDataURL('image/jpeg', 0.92)
}

function retakePhoto() {
  capturedDataUrl.value = ''
  if (!mediaStream) {
    startCamera()
  } else {
    nextTick(() => {
      try { videoEl.value?.play?.() } catch {}
    })
  }
}

function confirmCapture() {
  if (!capturedDataUrl.value) return
  const b64 = capturedDataUrl.value.split(',')[1] || ''
  if (!b64) return
  const size = Math.floor((b64.length * 3) / 4)
  const name = `photo_${Date.now()}.jpg`
  stopStream()
  capturedDataUrl.value = ''
  emit('capture', { name, data: b64, mime: 'image/jpeg', size })
}

function handleClose() {
  requestSeq++
  stopStream()
  capturedDataUrl.value = ''
  error.value = ''
  emit('close')
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      capturedDataUrl.value = ''
      error.value = ''
      startCamera()
    } else {
      requestSeq++
      stopStream()
      capturedDataUrl.value = ''
      error.value = ''
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  requestSeq++
  stopStream()
})
</script>

<style scoped>
.camera-modal-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.camera-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.camera-toolbar-label {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--fg-muted);
}

.camera-device-select {
  width: 240px;
  max-width: 70%;
}

.camera-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  max-height: 420px;
  overflow: hidden;
  border-radius: var(--radius-xl);
  background: var(--surface-2);
  border: var(--border-width) solid var(--line-hairline);
}

.camera-video,
.camera-preview-img {
  width: 100%;
  max-height: 420px;
  object-fit: contain;
  display: block;
}

.camera-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--fg-muted);
  font-size: var(--text-sm);
  background: var(--surface-2);
}

.camera-error-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  width: 100%;
}
</style>
