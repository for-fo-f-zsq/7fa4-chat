<template>
  <ToolWorkspaceShell flush :narrow="isNarrow" class="graph-tool">
    <template #header>
      <GraphHeader
        v-model:directed="model.directed.value"
        :saved-name="model.savedName.value"
        :saved-path="model.savedPath.value"
        :dirty="model.dirty.value"
        :side-open="sideOpen"
        :is-narrow="isNarrow"
        @toggle-sidebar="sideOpen = !sideOpen"
        @open-file="openFile"
        @save="save"
        @export-img="exportImg"
      />
    </template>

    <div class="graph-tool-body" :class="{ 'sidebar-collapsed': !sideOpen && !isNarrow }">
      <ToolSideDrawer
        v-model:open="sideOpen"
        :narrow="isNarrow"
        side="left"
        :width="320"
        :narrow-width="288"
        open-label="展开配置侧栏"
        close-label="收起配置侧栏"
      >
        <GraphSidebar
          :input-text="model.inputText.value"
          :weights-text="model.weightsText.value"
          v-model:offset="model.offset.value"
          v-model:rand-mode="model.randMode.value"
          v-model:rand-n="model.randN.value"
          v-model:rand-m="model.randM.value"
          v-model:rand-weighted="model.randWeighted.value"
          v-model:repulsion="layout.repulsion.value"
          v-model:stiffness="layout.stiffness.value"
          v-model:rest-length="layout.restLength.value"
          v-model:damping="layout.damping.value"
          v-model:dt="layout.dt.value"
          v-model:auto-center="layout.autoCenter.value"
          :physics-stats="layout.physicsStats"
          :selected-edge="selectedEdge"
          v-model:highlight="model.highlight.value"
          v-model:algo-src="model.algoSrc.value"
          v-model:algo-sink="model.algoSink.value"
          :info="model.info.value"
          :analysis="model.analysis.value"
          @input-text="model.onInputText"
          @input-weights="model.onInputWeights"
          @load-example="model.loadExample"
          @clear-input="model.clearInput"
          @random-graph="model.randomGraph"
          @force-change="layout.onForceChange"
          @reset-physics="layout.resetPhysics"
          @center-com="layout.centerViewOnCom"
          @update-edge-physics="onUpdateEdgePhysics"
        />
      </ToolSideDrawer>

      <div class="graph-canvas-col">
        <GraphCanvas
          :hint="hint"
          :set-wrap-ref="(el) => { canvas.wrapRef.value = el }"
          :set-canvas-ref="(el) => { canvas.canvasRef.value = el }"
          v-model:mode="mode"
          :locked="layout.locked.value"
          :tree-mode="layout.treeMode.value"
          :inline-edit="inter.inlineEdit.value"
          :view="layout.view"
          :edges="model.edges"
          :by-id="model.byId"
          @mousedown="inter.onMouseDown"
          @mousemove="inter.onMouseMove"
          @mouseup="inter.onMouseUp"
          @mouseleave="inter.onMouseLeave"
          @dblclick="inter.onDoubleClick"
          @toggle-lock="layout.toggleLock"
          @restart-layout="layout.restartLayout"
          @toggle-tree-mode="layout.toggleTreeMode"
          @zoom-in="layout.zoomIn"
          @zoom-out="layout.zoomOut"
          @fit-view="layout.fitView"
          @commit-inline-edit="inter.commitInlineEdit"
          @cancel-inline-edit="inter.cancelInlineEdit"
        />
      </div>
    </div>
  </ToolWorkspaceShell>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useNarrow } from '../../../composables/useNarrow.js'
import { useDialog } from '../../../composables/useDialog.js'
import { useToast } from '../../../composables/useToast.js'
import ToolWorkspaceShell from '../shared/ToolWorkspaceShell.vue'
import ToolSideDrawer from '../shared/ToolSideDrawer.vue'
import GraphHeader from './components/GraphHeader.vue'
import GraphSidebar from './components/GraphSidebar.vue'
import GraphCanvas from './components/GraphCanvas.vue'
import { GRAPH_HINTS } from './graphConstants.js'
import { useGraphModel } from './composables/useGraphModel.js'
import { useGraphLayout } from './composables/useGraphLayout.js'
import { useGraphInteraction } from './composables/useGraphInteraction.js'
import { useGraphCanvas } from './composables/useGraphCanvas.js'

const emit = defineEmits(['back'])

const { isNarrow } = useNarrow()
const dialog = useDialog()
const toast = useToast()

const sideOpen = ref(true)
watch(isNarrow, (n) => {
  if (n) sideOpen.value = false
  else sideOpen.value = true
}, { immediate: true })

const mode = ref('select')
const hint = ref(GRAPH_HINTS.select || GRAPH_HINTS.edit)
watch(mode, (m) => { hint.value = GRAPH_HINTS[m] || '' })

const canvas = useGraphCanvas({
  getModel: () => model,
  getLayout: () => layout,
  getInter: () => inter,
  dialog,
  toast,
  onReady: ({ w, h }) => {
    layout.view.x = w / 2
    layout.view.y = h / 2
    model.setSuppressDirty(true)
    model.loadExample()
    model.setSuppressDirty(false)
    model.markClean()
  }
})

const model = useGraphModel({
  dialog,
  toast,
  getCanvasSize: canvas.getCanvasSize,
  onResetLayout: () => {
    layout.clearTreeState()
    layout.stopLayout()
  },
  onInvalidate: canvas.invalidate,
  onRequestDraw: canvas.requestDraw,
  onAfterParseLayout: (preserveOnlyNew) => {
    if (!preserveOnlyNew) layout.placeCircle()
    layout.fitView()
    layout.runLayout()
  },
  onResetView: (x, y, s) => {
    layout.view.x = x
    layout.view.y = y
    layout.view.scale = s
  },
  onClearInteraction: (target) => inter.clearForTarget(target),
  onSyncView: (v) => {
    if (v && Number.isFinite(Number(v.scale))) {
      layout.view.x = Number(v.x) || 0
      layout.view.y = Number(v.y) || 0
      layout.view.scale = Math.max(0.15, Math.min(5, Number(v.scale) || 1))
    } else {
      layout.fitView()
    }
  }
})

const layout = useGraphLayout({
  nodes: model.nodes,
  edges: model.edges,
  byId: model.byId,
  getCanvasSize: canvas.getCanvasSize,
  getDragNode: () => inter.interaction.dragNode,
  markDirty: model.markDirty,
  invalidate: canvas.invalidate,
  requestDraw: canvas.requestDraw,
  drawNow: canvas.draw,
  onClearInteraction: () => { inter.interaction.edgeStart = null },
  onHintChange: (h) => { hint.value = h },
  defaultHint: () => GRAPH_HINTS[mode.value] || ''
})

const save = () => model.save(layout.view)
const openFile = () => model.openFile()
const exportImg = () => canvas.exportImg()

const inter = useGraphInteraction({
  mode,
  nodes: model.nodes,
  edges: model.edges,
  byId: model.byId,
  view: layout.view,
  treeMode: layout.treeMode,
  locked: layout.locked,
  dirty: model.dirty,
  getCanvasEl: () => canvas.canvasRef.value,
  addNodeAt: model.addNodeAt,
  addEdge: model.addEdge,
  deleteNode: model.deleteNode,
  deleteEdge: model.deleteEdge,
  updateNodeWeight: model.updateNodeWeight,
  updateEdgeWeight: model.updateEdgeWeight,
  updateEdgePhysics: model.updateEdgePhysics,
  treeLayout: layout.treeLayout,
  fitView: layout.fitView,
  stopLayout: layout.stopLayout,
  runLayout: layout.runLayout,
  zoomAt: layout.zoomAt,
  markDirty: model.markDirty,
  invalidate: canvas.invalidate,
  requestDraw: canvas.requestDraw,
  onTreeFinish: (h) => { hint.value = h },
  onSave: save,
  toast
})

const selectedEdge = computed(() => {
  const s = inter.interaction.selected
  return s && s.type === 'edge' ? s : null
})

function onUpdateEdgePhysics(edge, patch) {
  model.updateEdgePhysics(edge, patch)
  layout.onForceChange()
}

watch([model.highlight, model.directed, model.algoSrc, model.algoSink], canvas.markHlDirty)
watch(model.offset, () => model.parseInput(true, true))

defineExpose({ save, openFile })
</script>

<style scoped src="./graph-tool.css"></style>
