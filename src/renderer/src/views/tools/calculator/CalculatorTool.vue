<template>
  <ToolWorkspaceShell flush :narrow="isNarrow">
    <template #header>
      <CalcHeader
        :mode="mode"
        :angle-unit="angleUnit"
        :history-open="historyOpen"
        :narrow="isNarrow"
        @update:mode="switchMode"
        @update:angle-unit="angleUnit = $event"
        @toggle-history="toggleHistory"
      />
    </template>

    <div class="calc-body" :class="{ narrow: isNarrow }">
      <div class="calc-main">
        <!-- 表达式与计算结果显示卡片 -->
        <CalcDisplay
          v-model:expr-text="exprText"
          v-model:mod-preset="modPreset"
          v-model:mod-custom="modCustom"
          :result-text="resultText"
          :last-expr="lastExpr"
          :has-error="hasError"
          :mode="mode"
          :mod-label="modLabel"
          :ans="ans"
          @evaluate="evaluateExpr"
          @clear="clearExpr"
          @insert-ans="insertAtCursor('Ans')"
          @copy-result="onCopyResult"
          @copy-expr="onCopyExpr"
          @set-ref="setInputRef"
        />

        <!-- 分类科学函数选项卡 -->
        <CalcFuncTabs
          :narrow="isNarrow"
          @press-func="pressFunc"
        />

        <!-- 主数字键盘 + 内存操作栏 -->
        <CalcKeypad
          :narrow="isNarrow"
          :memory="memory"
          :has-memory="hasMemory"
          @press-key="pressKey"
          @press-memory="pressMemory"
        />
      </div>

      <!-- 可折叠历史抽屉 -->
      <ToolSideDrawer
        v-if="!isNarrow ? historyOpen : true"
        v-model:open="historyOpen"
        :narrow="isNarrow"
        side="right"
        :width="280"
        :narrow-width="260"
        open-label="展开历史"
        close-label="收起历史"
      >
        <CalcHistoryDrawer
          :history="history"
          @pick="onPickHistory"
          @insert-ans="insertAtCursor"
          @copy-expr="copyText"
          @copy-result="copyText"
          @remove="removeHistory"
          @clear="clearHistory"
          @close="historyOpen = false"
        />
      </ToolSideDrawer>
    </div>
  </ToolWorkspaceShell>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useNarrow } from '../../../composables/useNarrow.js'
import ToolWorkspaceShell from '../shared/ToolWorkspaceShell.vue'
import ToolSideDrawer from '../shared/ToolSideDrawer.vue'
import CalcHeader from './components/CalcHeader.vue'
import CalcDisplay from './components/CalcDisplay.vue'
import CalcFuncTabs from './components/CalcFuncTabs.vue'
import CalcKeypad from './components/CalcKeypad.vue'
import CalcHistoryDrawer from './components/CalcHistoryDrawer.vue'
import { useCalculatorHistory } from './composables/useCalculatorHistory.js'
import { useCalculatorState } from './composables/useCalculatorState.js'
import * as ce from './calcEngine.js'

defineEmits(['back'])

const { isNarrow } = useNarrow()
const historyOpen = ref(false)

const {
  history,
  addHistory,
  removeHistory,
  clearHistory,
  copyText
} = useCalculatorHistory()

const {
  exprText,
  resultText,
  rawResult,
  lastExpr,
  hasError,
  mode,
  modPreset,
  modCustom,
  modLabel,
  angleUnit,
  memory,
  hasMemory,
  ans,
  setInputRef,
  switchMode,
  clearExpr,
  insertAtCursor,
  evaluateExpr,
  pressKey,
  pressFunc,
  pressMemory
} = useCalculatorState({
  onHistoryAdd: addHistory,
  copyText
})

function toggleHistory() {
  historyOpen.value = !historyOpen.value
}

function onPickHistory(expr) {
  exprText.value = expr
}

function onCopyResult() {
  let valToCopy = ''
  if (rawResult.value != null) {
    if (ce.isFrac(rawResult.value)) {
      valToCopy = ce.fmtFrac(rawResult.value)
    } else {
      valToCopy = String(rawResult.value)
    }
  } else {
    valToCopy = resultText.value
  }
  copyText(valToCopy)
}

function onCopyExpr() {
  copyText(exprText.value)
}

function onKeyDown(e) {
  // Ctrl+H or Cmd+H to toggle history
  if ((e.ctrlKey || e.metaKey) && (e.key === 'h' || e.key === 'H')) {
    e.preventDefault()
    toggleHistory()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<style scoped src="./calc-tool.css"></style>
