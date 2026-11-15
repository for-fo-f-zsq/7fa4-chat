<template>
  <UiModal
    v-if="linkOpen"
    :open="linkOpen"
    title="插入链接"
    size="sm"
    :teleport="false"
    modal-class="mdm-dialog"
    @update:open="$emit('update:linkOpen', $event)"
  >
    <div class="p-form-stack">
      <UiInput v-model="linkText" label="链接标题" placeholder="例如：帮助文档" />
      <UiInput v-model="linkUrl" label="链接 URL" placeholder="https://" />
    </div>
    <template #footer>
      <div class="p-modal-footer mdm-footer">
        <UiButton size="sm" variant="secondary" @click="$emit('update:linkOpen', false)">取消</UiButton>
        <UiButton size="sm" variant="primary" @click="confirmLink">插入</UiButton>
      </div>
    </template>
  </UiModal>

  <UiModal
    v-if="imageOpen"
    :open="imageOpen"
    title="插入图片"
    size="sm"
    :teleport="false"
    modal-class="mdm-dialog"
    @update:open="$emit('update:imageOpen', $event)"
  >
    <div class="p-form-stack">
      <UiInput v-model="imageAlt" label="图片描述 (Alt)" placeholder="例如：架构示意图" />
      <UiInput v-model="imageUrl" label="图片 URL" placeholder="https://" />
    </div>
    <template #footer>
      <div class="p-modal-footer mdm-footer">
        <UiButton size="sm" variant="secondary" @click="$emit('update:imageOpen', false)">取消</UiButton>
        <UiButton size="sm" variant="primary" @click="confirmImage">插入</UiButton>
      </div>
    </template>
  </UiModal>

  <UiModal
    v-if="codeOpen"
    :open="codeOpen"
    title="插入代码块"
    size="sm"
    :teleport="false"
    modal-class="mdm-dialog"
    @update:open="$emit('update:codeOpen', $event)"
  >
    <div class="p-form-stack">
      <label class="mdm-field">
        <span>编程语言</span>
        <UiDropdown v-model="codeLang" :options="codeLangOptions" size="sm" aria-label="编程语言" />
      </label>
      <UiCheckbox v-model="codeLineNumbers" label="显示行号" />
      <UiInput v-model="codeLines" label="高亮行（可选，如 5-6 或 3,5,8-10）" placeholder="例如：5-6" />
    </div>
    <template #footer>
      <div class="p-modal-footer mdm-footer">
        <UiButton size="sm" variant="secondary" @click="$emit('update:codeOpen', false)">取消</UiButton>
        <UiButton size="sm" variant="primary" @click="confirmCode">插入</UiButton>
      </div>
    </template>
  </UiModal>

  <UiModal
    v-if="calloutOpen"
    :open="calloutOpen"
    title="插入折叠框"
    size="sm"
    :teleport="false"
    modal-class="mdm-dialog"
    @update:open="$emit('update:calloutOpen', $event)"
  >
    <div class="p-form-stack">
      <label class="mdm-field">
        <span>类型</span>
        <UiDropdown v-model="calloutType" :options="calloutOptions" size="sm" aria-label="折叠框类型" />
      </label>
      <UiInput v-model="calloutTitle" label="标题（支持 LaTeX，如 $\mathcal{O}(n\log n)$）" placeholder="折叠框标题" />
      <UiCheckbox v-model="calloutDefaultOpen" label="默认展开" />
    </div>
    <template #footer>
      <div class="p-modal-footer mdm-footer">
        <UiButton size="sm" variant="secondary" @click="$emit('update:calloutOpen', false)">取消</UiButton>
        <UiButton size="sm" variant="primary" @click="confirmCallout">插入</UiButton>
      </div>
    </template>
  </UiModal>

  <UiModal
    v-if="epigraphOpen"
    :open="epigraphOpen"
    title="插入引言"
    size="sm"
    :teleport="false"
    modal-class="mdm-dialog"
    @update:open="$emit('update:epigraphOpen', $event)"
  >
    <div class="p-form-stack">
      <UiInput v-model="epigraphAuthor" label="落款 / 作者" placeholder="例如：高德纳" />
      <UiTextarea v-model="epigraphContent" label="引言内容" :rows="3" placeholder="过早的优化是万恶之源。" />
    </div>
    <template #footer>
      <div class="p-modal-footer mdm-footer">
        <UiButton size="sm" variant="secondary" @click="$emit('update:epigraphOpen', false)">取消</UiButton>
        <UiButton size="sm" variant="primary" @click="confirmEpigraph">插入</UiButton>
      </div>
    </template>
  </UiModal>

  <UiModal
    v-if="bilibiliOpen"
    :open="bilibiliOpen"
    title="插入 Bilibili 视频"
    size="sm"
    :teleport="false"
    modal-class="mdm-dialog"
    @update:open="$emit('update:bilibiliOpen', $event)"
  >
    <div class="p-form-stack">
      <UiInput v-model="bilibiliId" label="BV 号 / AV 号" placeholder="例如：BV1GJ411x7h7 或 av53851218" />
      <p class="mdm-hint">支持带参数的链接，如 BV1bv411p7U5?page=4&amp;t=82</p>
    </div>
    <template #footer>
      <div class="p-modal-footer mdm-footer">
        <UiButton size="sm" variant="secondary" @click="$emit('update:bilibiliOpen', false)">取消</UiButton>
        <UiButton size="sm" variant="primary" @click="confirmBilibili">插入</UiButton>
      </div>
    </template>
  </UiModal>
</template>

<script setup>
import { ref } from 'vue'
import { UiButton, UiCheckbox, UiDropdown, UiInput, UiModal, UiTextarea } from '@/ui'

const codeLangOptions = ['cpp', 'c', 'python', 'java', 'pascal', 'rust', 'go', 'plain'].map((v) => ({ value: v, label: v }))
const calloutOptions = [
  { value: 'info', label: 'info 提示' },
  { value: 'success', label: 'success 成功' },
  { value: 'warning', label: 'warning 警告' },
  { value: 'error', label: 'error 错误' }
]

defineProps({
  linkOpen: { type: Boolean, default: false },
  imageOpen: { type: Boolean, default: false },
  codeOpen: { type: Boolean, default: false },
  calloutOpen: { type: Boolean, default: false },
  epigraphOpen: { type: Boolean, default: false },
  bilibiliOpen: { type: Boolean, default: false }
})

const emit = defineEmits([
  'update:linkOpen',
  'update:imageOpen',
  'update:codeOpen',
  'update:calloutOpen',
  'update:epigraphOpen',
  'update:bilibiliOpen',
  'insert',
  'insertCallout',
  'insertEpigraph',
  'insertBilibili'
])

const linkText = ref('')
const linkUrl = ref('')
const imageAlt = ref('')
const imageUrl = ref('')
const codeLang = ref('cpp')
const codeLineNumbers = ref(true)
const codeLines = ref('')
const calloutType = ref('info')
const calloutTitle = ref('')
const calloutDefaultOpen = ref(false)
const epigraphAuthor = ref('')
const epigraphContent = ref('')
const bilibiliId = ref('')

function confirmLink() {
  const text = linkText.value.trim() || '链接'
  const url = linkUrl.value.trim() || 'https://'
  emit('insert', `[${text}](${url})`)
  emit('update:linkOpen', false)
  linkText.value = ''
  linkUrl.value = ''
}

function confirmImage() {
  const alt = imageAlt.value.trim() || '图片'
  const url = imageUrl.value.trim()
  if (!url) return
  emit('insert', `![${alt}](${url})`)
  emit('update:imageOpen', false)
  imageAlt.value = ''
  imageUrl.value = ''
}

function confirmCode() {
  let args = codeLang.value
  if (codeLineNumbers.value) args += ' line-numbers'
  const lines = codeLines.value.trim()
  if (lines) args += ` lines=${lines}`
  emit('insert', `\n\n\`\`\`${args}\n// 在此编写代码\n\`\`\`\n\n`)
  emit('update:codeOpen', false)
  codeLines.value = ''
}

function confirmCallout() {
  emit('insertCallout', {
    type: calloutType.value,
    title: calloutTitle.value.trim(),
    isOpen: calloutDefaultOpen.value
  })
  emit('update:calloutOpen', false)
  calloutTitle.value = ''
}

function confirmEpigraph() {
  emit('insertEpigraph', {
    author: epigraphAuthor.value.trim(),
    text: epigraphContent.value.trim()
  })
  emit('update:epigraphOpen', false)
  epigraphAuthor.value = ''
  epigraphContent.value = ''
}

function confirmBilibili() {
  const id = bilibiliId.value.trim()
  if (!id) return
  emit('insertBilibili', id)
  emit('update:bilibiliOpen', false)
  bilibiliId.value = ''
}
</script>

<style scoped>
.mdm-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.mdm-field > span {
  font-size: var(--text-sm);
  color: var(--fg-muted);
}

.mdm-hint {
  font-size: var(--text-xs);
  color: var(--fg-placeholder);
  margin: 0;
}
</style>
