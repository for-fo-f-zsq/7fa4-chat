<template>
  <!-- 上传海报：只填图片，不填任何文字字段。选图后先在本地压缩到海报档位再上传，
       提交后进入服务端待审队列，必须由管理员在 /dev 通过才会公开。 -->
  <div class="pu-mask" @click.self="close">
    <div class="pu-box">
      <div class="pu-head">
        <h3>上传海报</h3>
        <button class="pu-close" title="关闭" @click="close"><i class="fas fa-times"></i></button>
      </div>

      <p class="pu-desc">上传后需管理员审核，<b>通过后才会</b>出现在开屏与海报墙。</p>

      <div class="pu-stage">
        <img v-if="previewSrc" :src="previewSrc" class="pu-preview" alt="海报预览" draggable="false" />
        <div v-else class="pu-placeholder">
          <i class="fas fa-image"></i>
          <span>选择一张图片</span>
        </div>
      </div>

      <div class="pu-meta" v-if="metaText">{{ metaText }}</div>

      <div class="pu-status" v-if="status" :class="statusType">{{ status }}</div>

      <div class="pu-actions">
        <button class="pu-pick" :disabled="busy" @click="pick">
          <i class="fas fa-folder-open"></i> {{ previewSrc ? '换一张' : '选择图片' }}
        </button>
        <button class="pu-submit" :disabled="!canSubmit" @click="submit">
          {{ busy ? '处理中…' : '提交审核' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { compressBase64Image } from '../utils.js'

const props = defineProps({
  uid: { type: [Number, String], default: 0 }
})
const emit = defineEmits(['close'])

// 海报压缩档位：最长边 1600、base64 上限 900KB（≈675KB 二进制）。
// 取"开屏全屏清晰度"与"海报墙加载体量"的折中，远低于服务端 2MB 上限；
// 与聊天图片用的默认档位（1920 / 100KB）分开，避免海报被压得过模糊。
const POSTER_MAX_DIM = 1600
const POSTER_MAX_B64 = 900000

const previewSrc = ref('')
const payload = ref(null) // { data, size, width, height }
const busy = ref(false)
const status = ref('')
const statusType = ref('') // 'ok' | 'err'

const canSubmit = computed(() => !!payload.value && !busy.value)

const metaText = computed(() => {
  const p = payload.value
  if (!p) return ''
  const kb = p.size >= 1048576
    ? (p.size / 1048576).toFixed(2) + ' MB'
    : Math.max(1, Math.round(p.size / 1024)) + ' KB'
  return `${p.width || 0} × ${p.height || 0} · ${kb}`
})

function close() {
  if (busy.value) return
  emit('close')
}

async function pick() {
  if (busy.value) return
  status.value = ''
  statusType.value = ''
  let r = null
  try { r = await window.api?.selectImage?.() } catch {}
  if (!r || !r.success) {
    if (r && r.canceled) return
    statusType.value = 'err'
    status.value = (r && r.error) || '选择图片失败'
    return
  }
  if (!/^image\//.test(String(r.mime || ''))) {
    statusType.value = 'err'
    status.value = '请选择图片文件'
    return
  }
  busy.value = true
  status.value = '正在压缩…'
  try {
    const c = await compressBase64Image(r.data, r.mime, { maxDim: POSTER_MAX_DIM, maxB64: POSTER_MAX_B64 })
    // 极端情况下 compressBase64Image 会原样返回字符串（历史行为），这里兜底
    if (!c || typeof c === 'string' || !c.data) {
      statusType.value = 'err'
      status.value = '图片处理失败，请换一张'
      return
    }
    payload.value = {
      data: c.data,
      size: c.size || Math.round(c.data.length * 3 / 4),
      width: c.width,
      height: c.height
    }
    previewSrc.value = 'data:image/jpeg;base64,' + c.data
    status.value = ''
  } catch (e) {
    statusType.value = 'err'
    status.value = '图片处理失败：' + (e.message || e)
  } finally {
    busy.value = false
  }
}

async function submit() {
  if (!canSubmit.value) return
  const uid = Number(props.uid)
  if (!uid) {
    statusType.value = 'err'
    status.value = '请先登录后再上传'
    return
  }
  busy.value = true
  statusType.value = ''
  status.value = '提交中…'
  try {
    const r = await window.api?.submitPoster?.({
      uid,
      mime: 'image/jpeg',
      data: payload.value.data,
      w: payload.value.width || 0,
      h: payload.value.height || 0
    })
    if (r && r.success) {
      statusType.value = 'ok'
      status.value = '已提交，等待管理员审核通过后展示'
      payload.value = null
      previewSrc.value = ''
    } else {
      statusType.value = 'err'
      status.value = (r && r.error) || '提交失败'
    }
  } catch (e) {
    statusType.value = 'err'
    status.value = e.message || '提交失败'
  } finally {
    busy.value = false
  }
}
</script>
