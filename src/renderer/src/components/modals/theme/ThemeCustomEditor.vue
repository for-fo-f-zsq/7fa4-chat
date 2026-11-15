<template>
  <div class="custom-panel">
    <div class="tm-actions">
      <UiButton variant="secondary" size="sm" icon="fas fa-download" @click="emit('export')">导出主题</UiButton>
      <UiButton variant="secondary" size="sm" icon="fas fa-upload" @click="triggerImport">导入主题</UiButton>
      <input ref="importInput" type="file" accept=".json" hidden @change="onFileChange" />
      <UiButton variant="secondary" size="sm" icon="fas fa-rotate-left" @click="emit('resetCustom')">重置默认</UiButton>
      <span class="tm-actions-gap"></span>
      <UiButton variant="primary" size="sm" icon="fas fa-check" @click="emit('apply')">
        {{ dirty ? '应用更改' : '应用主题' }}
      </UiButton>
    </div>

    <div class="tm-preset-bar">
      <span class="tm-preset-bar-label">基于预设调色：</span>
      <button
        v-for="t in THEMES"
        :key="t.value"
        type="button"
        class="tm-base-chip"
        :class="{ 'is-active': selectedPresetBase === t.value }"
        @click="emit('loadPreset', t.value)"
      >
        <span class="tm-base-dot" :style="{ background: t.color }"></span>
        <span>{{ shortThemeLabel(t.label) }}</span>
      </button>
    </div>

    <div class="tm-cols">
      <div class="tm-editor-slot">
        <div class="tm-pane tm-pane--editor">
          <div class="tm-editor-head">
            <div class="tm-pane-title">自定义配色变量</div>
            <div class="tm-filter-row">
              <UiInput
                v-model="query"
                class="tm-search"
                size="sm"
                placeholder="筛选变量…"
                aria-label="筛选主题变量"
              />
              <UiDropdown
                v-model="activeGroup"
                class="tm-group-select"
                :options="groupOptions"
                aria-label="按分组筛选"
              />
            </div>
          </div>

          <div class="tm-pane-scroll">
            <template v-for="group in filteredGroups" :key="group.label">
              <div class="tm-group-title">{{ group.label }}</div>
              <div v-for="v in group.vars" :key="v.name" class="tm-var" :title="v.name">
                <label class="tm-swatch-pick" :title="`调色盘 (${customVars[v.name] || '默认'})`">
                  <span class="tm-swatch-fill" :style="{ background: customVars[v.name] || 'transparent' }"></span>
                  <input
                    type="color"
                    class="tm-color-native"
                    aria-label="选择颜色"
                    :value="toHexColor(customVars[v.name])"
                    @input="onPickColor(v.name, $event.target.value)"
                  />
                </label>
                <span class="tm-var-meta">
                  <span class="tm-var-name">{{ v.label }}</span>
                  <span class="tm-var-key">{{ v.name }}</span>
                </span>
                <UiInput
                  :model-value="customVars[v.name] || ''"
                  class="tm-hex u-tabular-nums"
                  size="sm"
                  monospace
                  aria-label="颜色值"
                  @update:model-value="emit('updateVar', v.name, $event)"
                />
              </div>
            </template>
            <div v-if="filteredGroups.length === 0" class="tm-empty-filter">
              没有匹配的配色变量
            </div>
          </div>
        </div>
      </div>

      <div class="tm-preview-col">
        <ThemePreviewStage
          :custom-vars="customVars"
          :is-dark="isCustomDark"
          :dirty="dirty"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { UiButton, UiDropdown, UiInput } from '@/ui'
import { THEMES } from '@/composables/constants.js'
import { mergePickedHex, toHexColor, varGroups } from '@/composables/modals/useThemeEditor.js'
import ThemePreviewStage from './ThemePreviewStage.vue'

const props = defineProps({
  customVars: { type: Object, required: true },
  selectedPresetBase: { type: String, default: '' },
  isCustomDark: { type: Boolean, default: false },
  dirty: { type: Boolean, default: false },
})

const emit = defineEmits([
  'export',
  'importText',
  'resetCustom',
  'apply',
  'loadPreset',
  'updateVar',
])

const importInput = ref(null)
const query = ref('')
const activeGroup = ref('all')

const groupOptions = computed(() => [
  { value: 'all', label: '全部分组' },
  ...varGroups.map((g) => ({ value: g.label, label: g.label })),
])

const filteredGroups = computed(() => {
  const q = query.value.trim().toLowerCase()
  return varGroups
    .filter((g) => activeGroup.value === 'all' || g.label === activeGroup.value)
    .map((g) => ({
      ...g,
      vars: q
        ? g.vars.filter(
            (v) => v.label.toLowerCase().includes(q) || v.name.toLowerCase().includes(q)
          )
        : g.vars,
    }))
    .filter((g) => g.vars.length > 0)
})

function shortThemeLabel(label) {
  return String(label || '').replace(/（.*）/, '')
}

function onPickColor(name, newHex) {
  emit('updateVar', name, mergePickedHex(props.customVars[name], newHex))
}

function triggerImport() {
  if (importInput.value) {
    importInput.value.value = ''
    importInput.value.click()
  }
}

function onFileChange(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => emit('importText', reader.result)
  reader.readAsText(file)
}
</script>
