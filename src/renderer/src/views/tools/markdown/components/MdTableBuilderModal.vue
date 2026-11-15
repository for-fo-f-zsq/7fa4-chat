<template>
  <UiModal
    v-if="open"
    :open="open"
    title="表格生成器"
    size="md"
    :teleport="false"
    modal-class="mdm-dialog"
    @update:open="$emit('update:open', $event)"
  >
    <div class="mdm-table-body">
      <div class="mdm-table-actions">
        <UiButton size="sm" variant="secondary" icon="fas fa-plus" @click="addTableRow">加一行</UiButton>
        <UiButton size="sm" variant="secondary" icon="fas fa-plus" @click="addTableCol">加一列</UiButton>
        <UiButton size="sm" variant="ghost" icon="fas fa-minus" :disabled="tableGrid.length <= 1" @click="removeTableRow">减一行</UiButton>
        <UiButton size="sm" variant="ghost" icon="fas fa-minus" :disabled="tableGrid[0] && tableGrid[0].length <= 1" @click="removeTableCol">减一列</UiButton>
        <UiCheckbox v-model="tableTuack" label="Tuack 竞赛风格" />
      </div>
      <p class="mdm-hint">单元格填 <code>^</code> 向上合并、<code>&lt;</code> 向左合并。</p>
      <div class="mdm-table-wrap">
        <table class="mdm-grid">
          <tr v-for="(row, r) in tableGrid" :key="r">
            <template v-if="r === 0">
              <th v-for="(cell, c) in row" :key="'h' + c">
                <input v-model="cell.text" />
              </th>
            </template>
            <template v-else>
              <td v-for="(cell, c) in row" :key="c">
                <input v-model="cell.text" />
                <span class="mdm-merge">
                  <button type="button" title="向上合并" @click="cell.text = '^'">^</button>
                  <button type="button" title="向左合并" @click="cell.text = '<'">&lt;</button>
                </span>
              </td>
            </template>
          </tr>
        </table>
      </div>
    </div>
    <template #footer>
      <div class="p-modal-footer mdm-footer">
        <UiButton size="sm" variant="secondary" @click="$emit('update:open', false)">取消</UiButton>
        <UiButton size="sm" variant="primary" @click="confirmTable">生成并插入</UiButton>
      </div>
    </template>
  </UiModal>
</template>

<script setup>
import { ref, watch } from 'vue'
import { UiButton, UiCheckbox, UiModal } from '@/ui'

const props = defineProps({
  open: { type: Boolean, default: false },
  rows: { type: Number, default: 3 },
  cols: { type: Number, default: 4 }
})

const emit = defineEmits(['update:open', 'insert'])

const tableTuack = ref(false)
const tableGrid = ref([])

function initGrid(rows = props.rows, cols = props.cols) {
  const grid = []
  for (let r = 0; r < rows; r++) {
    const row = []
    for (let c = 0; c < cols; c++) {
      row.push({ text: r === 0 ? `标题 ${c + 1}` : `数据 ${r},${c + 1}` })
    }
    grid.push(row)
  }
  tableGrid.value = grid
}

watch(() => props.open, (isOpen) => {
  if (isOpen) initGrid(props.rows, props.cols)
})

function addTableRow() {
  const cols = tableGrid.value[0] ? tableGrid.value[0].length : 3
  const r = tableGrid.value.length
  const row = []
  for (let c = 0; c < cols; c++) row.push({ text: `数据 ${r},${c + 1}` })
  tableGrid.value.push(row)
}

function addTableCol() {
  const c = tableGrid.value[0] ? tableGrid.value[0].length : 0
  for (let r = 0; r < tableGrid.value.length; r++) {
    tableGrid.value[r].push({ text: r === 0 ? `标题 ${c + 1}` : `数据 ${r},${c + 1}` })
  }
}

function removeTableRow() {
  if (tableGrid.value.length > 1) {
    tableGrid.value.pop()
  }
}

function removeTableCol() {
  if (tableGrid.value[0] && tableGrid.value[0].length > 1) {
    for (const row of tableGrid.value) {
      row.pop()
    }
  }
}

function confirmTable() {
  const grid = tableGrid.value
  if (!grid.length) return
  let md = ''
  if (tableTuack.value) md += '::cute-table{tuack}\n\n'
  const header = grid[0]
  md += '| ' + header.map((cell) => cell.text || ' ').join(' | ') + ' |\n'
  md += '| ' + header.map(() => ':-:').join(' | ') + ' |\n'
  for (let r = 1; r < grid.length; r++) {
    md += '| ' + grid[r].map((cell) => cell.text || ' ').join(' | ') + ' |\n'
  }
  emit('insert', '\n\n' + md + '\n')
  emit('update:open', false)
}
</script>

<style scoped>
.mdm-table-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.mdm-table-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.mdm-hint {
  font-size: var(--text-xs);
  color: var(--fg-placeholder);
  margin: 0;
}

.mdm-hint code {
  background: var(--surface-code-inline);
  padding: 1px 5px;
  border-radius: var(--radius-xs);
  font-size: var(--text-xs);
}

.mdm-table-wrap {
  border: var(--border-width) solid var(--line-hairline);
  border-radius: var(--radius-base);
  overflow: auto;
  max-height: 300px;
}

.mdm-grid {
  border-collapse: collapse;
  width: 100%;
}

.mdm-grid th,
.mdm-grid td {
  border: var(--border-width) solid var(--line-hairline);
  padding: var(--space-1);
  position: relative;
}

.mdm-grid th {
  background: var(--surface-table-head);
}

.mdm-grid input {
  width: 100%;
  border: 1px solid transparent;
  outline: none;
  background: transparent;
  color: var(--fg);
  font-size: var(--text-sm);
  padding: 4px var(--space-2);
  border-radius: var(--radius-xs);
  transition:
    background-color var(--motion-dur-fast) var(--motion-ease-standard),
    border-color var(--motion-dur-fast) var(--motion-ease-standard),
    box-shadow var(--motion-dur-fast) var(--motion-ease-standard);
}

.mdm-grid input:hover {
  background: var(--surface-hover);
}

.mdm-grid input:focus {
  background: var(--surface-0);
  border-color: var(--brand);
  box-shadow: 0 0 0 1px var(--brand);
}

.mdm-merge {
  position: absolute;
  right: 2px;
  bottom: 2px;
  display: flex;
  gap: 2px;
}

.mdm-merge button {
  width: 16px;
  height: 16px;
  border: var(--border-width) solid var(--line-hairline);
  border-radius: var(--radius-xs);
  background: var(--surface-2);
  color: var(--fg-muted);
  font-size: var(--text-2xs);
  line-height: 1;
  cursor: pointer;
  padding: 0;
  transition:
    color var(--motion-dur-fast) var(--motion-ease-standard),
    border-color var(--motion-dur-fast) var(--motion-ease-standard),
    transform var(--motion-dur-fast) var(--motion-ease-out-expo);
}

.mdm-merge button:focus-visible {
  outline: 2px solid transparent;
  box-shadow: var(--focus-ring);
}

@media (hover: hover) {
  .mdm-merge button:hover {
    color: var(--brand);
    border-color: var(--brand-line);
  }
}

.mdm-merge button:active {
  transform: scale(var(--press-scale));
}
</style>
