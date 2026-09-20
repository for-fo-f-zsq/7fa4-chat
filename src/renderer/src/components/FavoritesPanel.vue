<template>
  <div class="favorites-panel">
    <div class="favorites-header">
      <BackButton title="返回消息列表" @back="emit('back')" />
      <h2>收藏</h2>
      <span class="fav-count" v-if="favorites.length">{{ displayList.length }} / {{ favorites.length }}</span>
      <div class="fav-header-spacer"></div>
      <span
        class="fav-tool-btn"
        :class="{ active: multiMode }"
        :title="multiMode ? '退出批量管理' : '批量管理'"
        @click="toggleMulti"
      ><i :class="multiMode ? 'fas fa-times' : 'fas fa-check-double'"></i></span>
    </div>

    <div class="fav-toolbar">
      <div class="fav-search-wrap">
        <i class="fas fa-search fav-search-icon"></i>
        <input class="fav-search-input" v-model="query" placeholder="搜索收藏内容、备注或标签…" />
        <span v-if="query" class="fav-search-clear" title="清空" @click="query = ''"><i class="fas fa-times"></i></span>
      </div>
      <div class="fav-sort-group">
        <span class="fav-sort-btn" :class="{ active: sortMode === 'time' }" @click="sortMode = 'time'">按时间</span>
        <span class="fav-sort-btn" :class="{ active: sortMode === 'pinned' }" @click="sortMode = 'pinned'">置顶优先</span>
      </div>
    </div>

    <div class="fav-tagbar" v-if="favorites.length">
      <span class="fav-tag-chip" :class="{ active: activeTag === '' }" @click="activeTag = ''">全部 {{ favorites.length }}</span>
      <span class="fav-tag-chip" :class="{ active: activeTag === '__none__' }" @click="activeTag = '__none__'">未分类 {{ untaggedCount }}</span>
      <span
        v-for="t in tagStats"
        :key="t.name"
        class="fav-tag-chip"
        :class="{ active: activeTag === t.name }"
        @click="activeTag = t.name"
      >{{ t.name }} {{ t.count }}</span>
    </div>

    <div class="favorites-list" v-if="displayList.length">
      <div
        v-for="fav in displayList"
        :key="fav.id"
        class="fav-item"
        :class="{ 'is-pinned': fav.pinned, 'is-selected': selectedIds.includes(fav.id) }"
        @click="onItemClick(fav)"
        @contextmenu.prevent="onFavCtx($event, fav)"
      >
        <div class="fav-item-head">
          <i v-if="fav.pinned" class="fas fa-thumbtack fav-pin-icon" title="已置顶"></i>
          <div class="fav-item-content" v-html="renderPreview(fav)"></div>
        </div>
        <div class="fav-item-note" v-if="fav.note"><i class="fas fa-pen"></i> {{ fav.note }}</div>
        <div class="fav-item-tags" v-if="fav.tags && fav.tags.length">
          <span v-for="t in fav.tags" :key="t" class="fav-mini-tag">{{ t }}</span>
        </div>
        <div class="fav-item-meta">
          <span>{{ formatMeta(fav) }}</span>
          <div class="fav-item-actions">
            <span class="fav-action-btn" title="复制" @click.stop="emit('copy', fav)"><i class="fas fa-copy"></i></span>
            <span class="fav-action-btn" title="转发" @click.stop="emit('forward', fav)"><i class="fas fa-share"></i></span>
            <span v-if="canDownload(fav)" class="fav-action-btn" title="下载" @click.stop="emit('download', fav)"><i class="fas fa-download"></i></span>
            <span class="fav-action-btn" title="跳转原消息" @click.stop="jumpToSource(fav)"><i class="fas fa-location-arrow"></i></span>
            <span class="fav-action-btn" title="编辑标签 / 备注" @click.stop="openEdit(fav)"><i class="fas fa-tag"></i></span>
            <span class="fav-action-btn" :title="fav.pinned ? '取消置顶' : '置顶'" @click.stop="togglePin(fav)"><i class="fas fa-thumbtack"></i></span>
            <span class="fav-item-delete" title="删除" @click.stop="removeFav(fav)"><i class="fas fa-trash"></i></span>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="fav-empty">
      <template v-if="!favorites.length">暂无收藏消息</template>
      <template v-else>没有匹配的收藏</template>
    </div>

    <!-- 批量操作栏 -->
    <div class="fav-batch-bar" v-if="multiMode">
      <span class="fav-batch-info">已选 {{ selectedIds.length }} 项</span>
      <span class="fav-batch-btn" @click="toggleSelectAll">{{ allSelected ? '取消全选' : '全选' }}</span>
      <span class="fav-batch-btn" :class="{ disabled: !selectedIds.length }" @click="batchTag">批量打标签</span>
      <span class="fav-batch-btn danger" :class="{ disabled: !selectedIds.length }" @click="batchDelete">删除所选</span>
    </div>

    <!-- 编辑浮层（标签 / 备注） -->
    <div class="fav-edit-mask" v-if="editing" @click.self="closeEdit">
      <div class="fav-edit-box">
        <div class="fav-edit-head">
          <h3>{{ editing.isBatch ? `批量打标签（${editing.ids.length} 项）` : '编辑收藏' }}</h3>
          <button class="fav-edit-close" @click="closeEdit"><i class="fas fa-times"></i></button>
        </div>
        <div class="fav-edit-field">
          <label>标签</label>
          <div class="fav-edit-taglist">
            <span v-for="t in editTags" :key="t" class="fav-tag-chip">{{ t }}<i class="fas fa-times" @click="removeEditTag(t)"></i></span>
            <input
              class="fav-edit-taginput"
              v-model="editTagInput"
              :placeholder="editTags.length >= 20 ? '已达上限' : '输入后回车添加'"
              :disabled="editTags.length >= 20"
              @keydown.enter.prevent="addEditTag"
            />
          </div>
        </div>
        <div class="fav-edit-field" v-if="!editing.isBatch">
          <label>备注</label>
          <textarea class="fav-edit-note" v-model="editNote" rows="3" maxlength="500" placeholder="写点备注…"></textarea>
        </div>
        <div class="fav-edit-note-tip" v-else>批量操作只修改标签，不会覆盖各项已有备注。</div>
        <div class="fav-edit-actions">
          <button class="fav-btn" @click="closeEdit">取消</button>
          <button class="fav-btn primary" @click="saveEdit">保存</button>
        </div>
      </div>
    </div>

    <ContextMenu
      v-if="favCtx.show"
      :visible="favCtx.show"
      :x="favCtx.x"
      :y="favCtx.y"
      :items="favCtxItems"
      extra-class="fav-ctx"
      @select="onCtxSelect"
      @close="favCtx.show = false"
    />
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { store } from '../store.js';
import { gettime2, displayName, parseMsgContent, highlightKeyword } from '../utils.js';
import ContextMenu from './ContextMenu.vue';
import BackButton from './BackButton.vue';

const emit = defineEmits(['preview', 'forward', 'copy', 'download', 'jump', 'back']);

// 结构版本：v2 起新增 tags / note / pinned。读取时兜底，写入时补齐，
// 旧客户端读到多余字段会忽略，因此新旧版本双向兼容。
const SCHEMA = 2;

const favorites = computed(() => (store.favorites || []).map(normalize));

const query = ref('');
const activeTag = ref('');
const sortMode = ref('time');
const multiMode = ref(false);
const selectedIds = ref([]);

/** 单条收藏归一化（不写回 store，避免轮询期间频繁改动响应式数据） */
function normalize(f) {
  if (!f || f.schema === SCHEMA) return f;
  return {
    ...f,
    tags: Array.isArray(f.tags) ? f.tags : [],
    note: typeof f.note === 'string' ? f.note : '',
    pinned: f.pinned === true,
    schema: SCHEMA
  };
}

/** 写操作：定位真实对象并补默认字段（后续 saveAll 自然落盘） */
function mutate(fav) {
  const raw = (store.favorites || []).find((f) => f.id === fav.id);
  if (!raw) return null;
  if (!Array.isArray(raw.tags)) raw.tags = [];
  if (typeof raw.note !== 'string') raw.note = '';
  if (raw.pinned !== true) raw.pinned = false;
  raw.schema = SCHEMA;
  return raw;
}

function previewText(fav) {
  const obj = parseMsgContent(fav.content);
  if (!obj) return (fav.content || '').slice(0, 120);
  if (obj.type === 'text') return (obj.content || '').slice(0, 120);
  if (obj.type === 'file') return '📄 ' + (obj.name || '');
  if (obj.type === 'sticker') return '🖼️ ' + (obj.name || '表情');
  if (obj.type === 'emoji') return obj.content || '';
  return (fav.content || '').slice(0, 120);
}

function renderPreview(fav) {
  // highlightKeyword 内部已做 HTML 转义，不要再 esc（会双重转义）
  return highlightKeyword(previewText(fav), query.value.trim());
}

function formatMeta(fav) {
  const sender = store.users?.[fav.sender];
  const name = sender ? displayName(sender) : `User_${fav.sender}`;
  return `${name} · ${gettime2(fav.send_time)}`;
}

function canDownload(fav) {
  const obj = parseMsgContent(fav.content);
  return obj && (obj.type === 'file' || obj.type === 'sticker') && obj.data;
}

const timeOf = (f) => f.savedAt || f.send_time || 0;

const tagStats = computed(() => {
  const m = new Map();
  for (const f of favorites.value) {
    for (const t of f.tags || []) m.set(t, (m.get(t) || 0) + 1);
  }
  return [...m.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
});

const untaggedCount = computed(() => favorites.value.filter((f) => !f.tags || !f.tags.length).length);

const displayList = computed(() => {
  let list = favorites.value.slice();
  if (activeTag.value === '__none__') {
    list = list.filter((f) => !f.tags || !f.tags.length);
  } else if (activeTag.value) {
    list = list.filter((f) => (f.tags || []).includes(activeTag.value));
  }
  const q = query.value.trim().toLowerCase();
  if (q) {
    list = list.filter((f) => {
      const hay = [previewText(f), f.note || '', (f.tags || []).join(' ')].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }
  if (sortMode.value === 'pinned') {
    list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || timeOf(b) - timeOf(a));
  } else {
    list.sort((a, b) => timeOf(b) - timeOf(a));
  }
  return list;
});

// --- 单条操作 ---
function removeFav(fav) {
  const i = (store.favorites || []).findIndex((f) => f.id === fav.id);
  if (i >= 0) store.favorites.splice(i, 1);
  selectedIds.value = selectedIds.value.filter((id) => id !== fav.id);
}

function togglePin(fav) {
  const raw = mutate(fav);
  if (raw) raw.pinned = !(fav.pinned === true);
}

function jumpToSource(fav) {
  if (fav.fromType == null || fav.fromId == null) {
    alert('这条收藏没有来源会话信息（可能是旧版本收藏）');
    return;
  }
  emit('jump', { msgId: fav.id, convoType: fav.fromType, convoId: Number(fav.fromId) });
}

function exportMarkdown(fav) {
  const obj = parseMsgContent(fav.content);
  let body = '';
  if (obj && obj.type === 'text') body = obj.content;
  else if (obj && obj.type === 'file') body = `[文件] ${obj.name || ''}`;
  else if (obj && (obj.type === 'sticker' || obj.type === 'emoji')) body = `[图片] ${obj.name || ''}`;
  else body = fav.content || '';
  const sender = store.users?.[fav.sender];
  const name = sender ? displayName(sender) : `User_${fav.sender}`;
  const lines = ['> ' + body.split('\n').join('\n> '), '', `— ${name} · ${gettime2(fav.send_time)}`];
  if (fav.note) lines.unshift('**备注**：' + fav.note, '');
  window.api.clipboardWriteText(lines.join('\n'));
}

// --- 批量 ---
const allSelected = computed(() => displayList.value.length > 0 && selectedIds.value.length === displayList.value.length);

function toggleMulti() {
  multiMode.value = !multiMode.value;
  if (!multiMode.value) selectedIds.value = [];
}

function toggleSelectAll() {
  selectedIds.value = allSelected.value ? [] : displayList.value.map((f) => f.id);
}

function onItemClick(fav) {
  if (multiMode.value) {
    const i = selectedIds.value.indexOf(fav.id);
    if (i >= 0) selectedIds.value.splice(i, 1);
    else selectedIds.value.push(fav.id);
    return;
  }
  emit('preview', fav);
}

function batchDelete() {
  if (!selectedIds.value.length) return;
  if (!confirm(`确定删除选中的 ${selectedIds.value.length} 条收藏？`)) return;
  const set = new Set(selectedIds.value);
  for (let i = store.favorites.length - 1; i >= 0; i--) {
    if (set.has(store.favorites[i].id)) store.favorites.splice(i, 1);
  }
  selectedIds.value = [];
  multiMode.value = false;
}

// --- 编辑浮层 ---
const editing = ref(null); // { ids: number[], isBatch: boolean }
const editTags = ref([]);
const editNote = ref('');
const editTagInput = ref('');

function openEdit(fav) {
  editing.value = { ids: [fav.id], isBatch: false };
  editTags.value = [...(fav.tags || [])];
  editNote.value = fav.note || '';
  editTagInput.value = '';
}

function batchTag() {
  if (!selectedIds.value.length) return;
  editing.value = { ids: [...selectedIds.value], isBatch: true };
  editTags.value = [];
  editNote.value = '';
  editTagInput.value = '';
}

function addEditTag() {
  const t = editTagInput.value.trim();
  if (!t || editTags.value.length >= 20) return;
  if (!editTags.value.includes(t)) editTags.value.push(t);
  editTagInput.value = '';
}

function removeEditTag(t) {
  editTags.value = editTags.value.filter((x) => x !== t);
}

function closeEdit() {
  editing.value = null;
}

function saveEdit() {
  if (!editing.value) return;
  const tags = editTags.value.map((t) => t.trim()).filter(Boolean).slice(0, 20);
  for (const id of editing.value.ids) {
    const found = (store.favorites || []).find((f) => f.id === id);
    if (!found) continue;
    const raw = mutate(found);
    if (!raw) continue;
    raw.tags = [...tags];
    if (!editing.value.isBatch) raw.note = editNote.value.trim().slice(0, 500);
  }
  if (editing.value.isBatch) {
    selectedIds.value = [];
    multiMode.value = false;
  }
  editing.value = null;
}

// --- 右键菜单 ---
const favCtx = reactive({ show: false, x: 0, y: 0, fav: null });

const favCtxItems = computed(() => {
  const items = [
    { value: 'preview', label: '查看', icon: 'fas fa-eye' },
    { value: 'copy', label: '复制', icon: 'fas fa-copy' },
    { value: 'forward', label: '转发', icon: 'fas fa-share' }
  ];
  if (favCtx.fav && canDownload(favCtx.fav)) {
    items.push({ value: 'download', label: '下载', icon: 'fas fa-download' });
  }
  items.push(
    { value: 'jump', label: '跳转原消息', icon: 'fas fa-location-arrow' },
    { value: 'edit', label: '编辑标签 / 备注', icon: 'fas fa-tag' },
    { value: 'pin', label: favCtx.fav && favCtx.fav.pinned ? '取消置顶' : '置顶', icon: 'fas fa-thumbtack' },
    { value: 'markdown', label: '复制为 Markdown', icon: 'fab fa-markdown' },
    { value: 'delete', label: '删除', icon: 'fas fa-trash' }
  );
  return items;
});

function onFavCtx(e, fav) {
  favCtx.show = false;
  favCtx.x = e.clientX;
  favCtx.y = e.clientY;
  favCtx.fav = fav;
  setTimeout(() => (favCtx.show = true), 1);
}

function onCtxSelect(value) {
  favCtx.show = false;
  const fav = favCtx.fav;
  if (!fav) return;
  if (value === 'preview') emit('preview', fav);
  else if (value === 'copy') emit('copy', fav);
  else if (value === 'forward') emit('forward', fav);
  else if (value === 'download') emit('download', fav);
  else if (value === 'jump') jumpToSource(fav);
  else if (value === 'edit') openEdit(fav);
  else if (value === 'pin') togglePin(fav);
  else if (value === 'markdown') exportMarkdown(fav);
  else if (value === 'delete') removeFav(fav);
}
</script>
