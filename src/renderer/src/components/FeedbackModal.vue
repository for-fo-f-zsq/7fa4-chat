<template>
  <UiModal :open="open" title="意见反馈" size="md" @close="close">
    <div class="fb" @paste="onPaste">
      <p class="fb-lead">遇到问题或想要新功能，写在这里就行。截图可选（支持直接粘贴），最多 {{ MAX_SHOTS }} 张。</p>

      <div class="fb-field">
        <div class="fb-label">
          <span>反馈内容</span>
          <span class="fb-count" :class="{ over: content.length > MAX_CONTENT }">{{ content.length }}/{{ MAX_CONTENT }}</span>
        </div>
        <UiTextarea
          v-model="content"
          size="md"
          :rows="7"
          :maxlength="MAX_CONTENT"
          placeholder="描述你遇到的问题：做了什么、期望什么、实际发生了什么。能复现的步骤越具体越好。"
          @update:model-value="error = ''"
        />
      </div>

      <div class="fb-field">
        <div class="fb-label">
          <span>平台</span>
          <span class="fb-hint">已自动识别，可修改</span>
        </div>
        <div class="fb-platforms">
          <button
            v-for="p in PLATFORMS"
            :key="p.value"
            type="button"
            class="fb-chip"
            :class="{ on: platform === p.value }"
            @click="platform = p.value"
          >{{ p.label }}</button>
        </div>
      </div>

      <div class="fb-field">
        <div class="fb-label">
          <span>截图</span>
          <span class="fb-hint">可选，单张 ≤ 3MB</span>
        </div>
        <div class="fb-shots">
          <div v-for="(shot, i) in shots" :key="i" class="fb-shot">
            <img :src="shot.data" :alt="'截图 ' + (i + 1)" />
            <button type="button" class="fb-shot-del" title="移除" @click="shots.splice(i, 1)">×</button>
          </div>
          <button v-if="shots.length < MAX_SHOTS" type="button" class="fb-shot-add" @click="pickFiles">
            <i class="fas fa-plus"></i><span>添加</span>
          </button>
        </div>
        <input ref="fileEl" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden @change="onFiles" />
      </div>

      <div class="fb-field">
        <div class="fb-label">
          <span>联系方式</span>
          <span class="fb-hint">可选，方便回复你</span>
        </div>
        <UiInput v-model="contact" size="md" :maxlength="120" placeholder="OJ 用户名 / 邮箱 / QQ，任选其一" />
      </div>

      <UiBanner v-if="error" variant="danger" :description="error" />
      <p v-if="done" class="fb-done"><i class="fas fa-circle-check"></i> 已提交，编号 <code>{{ doneId }}</code></p>
    </div>

    <template #footer>
      <UiButton variant="text" size="md" @click="close">取消</UiButton>
      <UiButton variant="primary" size="md" :disabled="sending || !content.trim()" @click="submit">
        {{ sending ? '提交中…' : '提交反馈' }}
      </UiButton>
    </template>
  </UiModal>
</template>

<script setup>
// 意见反馈：桌面端直接向官网后端 POST /api/feedback（同源不需要 cookie），截图以 base64 内嵌。
// 网页版由 NavBar 直接开 /feedback 页面，不走这个弹窗。
import { ref, watch } from 'vue'
import { store } from '../store.js'
import { feedbackApiUrl } from '../utils.js'
import { UiBanner, UiButton, UiInput, UiModal, UiTextarea } from '@/ui'

const MAX_CONTENT = 4000
const MAX_SHOTS = 3
const MAX_SHOT_BYTES = 3 * 1024 * 1024
const PLATFORMS = [
  { value: 'windows', label: 'Windows' },
  { value: 'linux', label: 'Linux' },
  { value: 'macos', label: 'macOS' },
  { value: 'android', label: 'Android' },
  { value: 'web', label: '网页版' },
  { value: 'unknown', label: '其它' }
]

const props = defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['close'])

const content = ref('')
const contact = ref('')
const platform = ref('unknown')
const shots = ref([])
const error = ref('')
const sending = ref(false)
const done = ref(false)
const doneId = ref('')
const fileEl = ref(null)

// 打开时按真实平台预填；若上次尚未提交成功则保留已填草稿，避免误触遮罩关闭后丢失内容
watch(() => props.open, async (v) => {
  if (!v) return
  if (done.value) {
    content.value = ''
    shots.value = []
    done.value = false
    doneId.value = ''
  }
  error.value = ''
  sending.value = false
  if (!contact.value.trim() && store.self?.uid) {
    contact.value = store.self.username
      ? `${store.self.username} (UID ${store.self.uid})`
      : `UID ${store.self.uid}`
  }
  if (platform.value === 'unknown') {
    try { platform.value = (await window.api.getPlatform()) || 'unknown' } catch { platform.value = 'unknown' }
  }
})

function close() {
  emit('close')
}

function pickFiles() {
  if (fileEl.value) {
    fileEl.value.value = ''
    fileEl.value.click()
  }
}

function addImageFiles(fileList) {
  const files = Array.from(fileList || [])
  const room = MAX_SHOTS - shots.value.length
  if (room <= 0 && files.length > 0) {
    error.value = `最多只能添加 ${MAX_SHOTS} 张截图`
    return
  }
  error.value = ''
  for (const f of files.slice(0, room)) {
    if (!/^image\//.test(f.type)) { error.value = '只能上传图片'; continue }
    if (f.size > MAX_SHOT_BYTES) { error.value = '单张截图不能超过 3MB'; continue }
    const reader = new FileReader()
    reader.onload = () => {
      shots.value.push({ type: f.type, data: String(reader.result), name: f.name || 'screenshot.png' })
    }
    reader.readAsDataURL(f)
  }
}

function onFiles(e) {
  addImageFiles(e.target.files)
}

function onPaste(e) {
  const items = Array.from(e.clipboardData?.items || [])
  const imgFiles = items
    .filter((item) => item.kind === 'file' && /^image\//.test(item.type))
    .map((item) => item.getAsFile())
    .filter(Boolean)
  if (!imgFiles.length) return
  e.preventDefault()
  addImageFiles(imgFiles)
}

async function submit() {
  const text = content.value.trim()
  if (!text) { error.value = '先写点内容吧'; return }
  if (text.length > MAX_CONTENT) { error.value = `内容超出 ${MAX_CONTENT} 字`; return }

  sending.value = true
  error.value = ''
  let version = ''
  try { version = String(await window.api.getVersion()) } catch {}
  try {
    const res = await fetch(feedbackApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: text,
        platform: platform.value,
        contact: contact.value.trim(),
        version,
        page: 'app',
        screenshots: shots.value.map((s) => ({ type: s.type, data: s.data, name: s.name }))
      })
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.ok) {
      done.value = true
      doneId.value = data.id || '—'
      setTimeout(() => emit('close'), 1400)
    } else {
      error.value = data.error || `提交失败（HTTP ${res.status}）`
    }
  } catch (e) {
    error.value = '网络错误，检查一下连接后重试'
  } finally {
    sending.value = false
  }
}
</script>

<style scoped src="../css/feedback-modal.css"></style>
