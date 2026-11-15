<template>
  <UiModal
    :open="open"
    size="md"
    @update:open="(v) => !v && close()"
  >
    <template #title>
      <span class="poll-compose-title"><i class="fas fa-poll"></i> 发起投票</span>
    </template>

    <div class="poll-compose-body">
      <label class="poll-field">
        <span class="poll-field-label">问题</span>
        <UiInput
          v-model="pollForm.content"
          :maxlength="POLL_MAX_Q_LEN"
          placeholder="想让大家选什么？"
          :autofocus="true"
          @keydown="onFieldEnter"
        />
      </label>

      <div class="poll-field">
        <span class="poll-field-label">
          选项<span class="poll-field-hint">{{ pollForm.allowCustom ? '（可不设，投票者自拟）' : '（2–' + POLL_MAX_OPTS + ' 项）' }}</span>
        </span>
        <div class="poll-opt-list">
          <div class="poll-opt-row" v-for="(_, i) in pollForm.opts" :key="i">
            <span class="poll-opt-idx">{{ i + 1 }}</span>
            <UiInput
              v-model="pollForm.opts[i]"
              :maxlength="POLL_MAX_OPT_LEN"
              :placeholder="'选项 ' + (i + 1)"
              @keydown="onFieldEnter"
            />
            <UiIconButton
              v-if="pollForm.opts.length > 2 || pollForm.allowCustom"
              class="poll-opt-del"
              icon="fas fa-times"
              size="sm"
              aria-label="删除该项"
              title="删除该项"
              @click="pollRemoveOption(i)"
            />
          </div>
        </div>
        <div class="poll-opt-empty" v-if="!pollForm.opts.length">
          <i class="fas fa-pen"></i> 未设选项：投票者只能自己填写答案
        </div>
        <UiButton
          v-if="pollForm.opts.length < POLL_MAX_OPTS"
          variant="ghost"
          size="sm"
          icon="fas fa-plus"
          class="poll-opt-add"
          @click="pollAddOption"
        >添加选项</UiButton>
      </div>

      <div class="poll-field poll-field-row">
        <UiCheckbox v-model="pollForm.multi" label="多选" />
        <div class="poll-check poll-check-until">
          <UiCheckbox v-model="pollUntilOn" label="截止时间" />
          <UiInput
            class="poll-input-dt"
            type="datetime-local"
            size="sm"
            v-model="pollForm.untilText"
            :disabled="!pollUntilOn"
          />
        </div>
      </div>

      <div class="poll-field poll-field-row">
        <div class="poll-check poll-check-max" v-if="pollForm.multi">
          <span>最多选</span>
          <UiInput
            class="poll-input-num"
            type="number"
            size="sm"
            :modelValue="pollForm.maxSelect ? String(pollForm.maxSelect) : ''"
            placeholder="不限"
            @update:modelValue="(v) => { pollForm.maxSelect = Number(v) || 0 }"
          />
          <span>项</span>
        </div>
        <UiCheckbox
          v-model="pollForm.allowCustom"
          title="开启后，投票者除内置选项外还能自己填写一个选项"
          label="开放题（可自拟选项）"
        />
      </div>

      <div class="poll-modal-err" v-if="pollError">{{ pollError }}</div>
    </div>

    <template #footer>
      <UiButton variant="secondary" size="sm" @click="close">取消</UiButton>
      <UiButton variant="primary" size="sm" :loading="submitting" :disabled="sending || submitting" @click="submitPoll">发起</UiButton>
    </template>
  </UiModal>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { UiModal, UiInput, UiCheckbox, UiButton, UiIconButton } from '@/ui'
import {
  applyChatToStore,
  sendChatMessage,
  makePollContent,
  POLL_MAX_OPTS,
  POLL_MAX_OPT_LEN,
  POLL_MAX_Q_LEN,
} from '../../utils.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  pageType: { type: String, required: true },
  pageId: { type: [Number, String], default: null },
  sending: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'sent', 'update:sending'])

function makeEmptyPollForm() {
  return { content: '', opts: ['', ''], multi: false, maxSelect: 0, allowCustom: false, untilText: '' }
}

const pollForm = ref(makeEmptyPollForm())
const pollError = ref('')
const pollUntilOn = ref(false)
const submitting = ref(false)

watch(() => props.open, (v) => {
  if (v) {
    pollForm.value = makeEmptyPollForm()
    pollError.value = ''
    pollUntilOn.value = false
  }
})

function close() {
  pollError.value = ''
  emit('close')
}

function onFieldEnter(e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    pollAddOption()
  }
}

function pollAddOption() {
  if (pollForm.value.opts.length >= POLL_MAX_OPTS) return
  pollForm.value.opts.push('')
  nextTick(() => {
    const inputs = document.querySelectorAll('.poll-opt-row input')
    inputs[inputs.length - 1]?.focus()
  })
}

function pollRemoveOption(i) {
  const min = pollForm.value.allowCustom ? 0 : 2
  if (pollForm.value.opts.length <= min) return
  pollForm.value.opts.splice(i, 1)
}

function untilToEpoch(text) {
  if (!text) return 0
  const t = new Date(text).getTime()
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0
}

async function submitPoll() {
  const q = String(pollForm.value.content || '').trim()
  const opts = pollForm.value.opts.map((o) => String(o || '').trim()).filter(Boolean)
  if (!q) { pollError.value = '请填写问题'; return }
  if (opts.length < 2 && !pollForm.value.allowCustom) {
    pollError.value = '至少需要 2 个选项（开放题可以不设选项）'
    return
  }
  const until = pollUntilOn.value ? untilToEpoch(pollForm.value.untilText) : 0
  if (pollUntilOn.value && !until) { pollError.value = '截止时间无效'; return }
  if (until && until <= Math.floor(Date.now() / 1000)) {
    pollError.value = '截止时间必须晚于当前时间'
    return
  }
  let maxSelect = 0
  if (pollForm.value.multi) {
    maxSelect = Math.floor(Number(pollForm.value.maxSelect) || 0)
    if (!Number.isFinite(maxSelect) || maxSelect < 0) maxSelect = 0
    if (maxSelect > opts.length) maxSelect = opts.length
  }

  pollError.value = ''
  submitting.value = true
  emit('update:sending', true)
  try {
    const msgObj = JSON.parse(makePollContent({
      content: q,
      opts,
      multi: pollForm.value.multi,
      until,
      maxSelect,
      allowCustom: !!pollForm.value.allowCustom,
    }))
    const r = await sendChatMessage({ type: props.pageType, targetId: props.pageId, msgObj })
    if (!r.success) {
      pollError.value = r.err?.message || '发起失败'
    } else {
      const { tokenInfo } = applyChatToStore(r, props.pageType, props.pageId)
      emit('sent', tokenInfo)
      close()
    }
  } catch {
    pollError.value = '发起失败'
  } finally {
    submitting.value = false
    emit('update:sending', false)
  }
}
</script>
