<template>
  <div class="favorites-panel">
    <div class="favorites-header">
      <h2>收藏</h2>
    </div>
    <div class="favorites-list" v-if="favorites.length">
      <div
        v-for="(fav, idx) in favorites"
        :key="idx"
        class="fav-item"
        @click="onPreview(fav)"
        @contextmenu.prevent="onFavCtx($event, fav, idx)"
      >
        <div class="fav-item-content">{{ previewText(fav) }}</div>
        <div class="fav-item-meta">
          <span>{{ formatMeta(fav) }}</span>
          <div class="fav-item-actions">
            <span class="fav-action-btn" title="复制" @click.stop="onCopy(fav)"><i class="fas fa-copy"></i></span>
            <span class="fav-action-btn" title="转发" @click.stop="onForward(fav)"><i class="fas fa-share"></i></span>
            <span v-if="canDownload(fav)" class="fav-action-btn" title="下载" @click.stop="onDownload(fav)"><i class="fas fa-download"></i></span>
            <span class="fav-item-delete" @click.stop="removeFav(idx)"><i class="fas fa-trash"></i></span>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="fav-empty">暂无收藏消息</div>
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
import { computed, reactive } from 'vue';
import { store } from '../store.js';
import { gettime2, displayName, parseMsgContent } from '../utils.js';
import ContextMenu from './ContextMenu.vue';

const emit = defineEmits(['preview', 'forward', 'copy', 'download']);

const favorites = computed(() => store.favorites || []);

const favCtx = reactive({ show: false, x: 0, y: 0, fav: null, idx: -1 });

function previewText(fav) {
  const obj = parseMsgContent(fav.content);
  if (!obj) return (fav.content || '').slice(0, 60);
  if (obj.type === 'text') return (obj.content || '').slice(0, 60);
  if (obj.type === 'file') return '📄 ' + (obj.name || '');
  if (obj.type === 'sticker') return '🖼️ ' + (obj.name || '表情');
  if (obj.type === 'emoji') return obj.content || '';
  return (fav.content || '').slice(0, 60);
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

function onPreview(fav) {
  emit('preview', fav);
}

function removeFav(idx) {
  store.favorites.splice(idx, 1);
}

function onCopy(fav) {
  emit('copy', fav);
}

function onForward(fav) {
  emit('forward', fav);
}

function onDownload(fav) {
  emit('download', fav);
}

// --- 右键菜单 ---
const favCtxItems = computed(() => {
  const items = [
    { value: 'copy', label: '复制', icon: 'fas fa-copy' },
    { value: 'forward', label: '转发', icon: 'fas fa-share' }
  ];
  if (favCtx.fav && canDownload(favCtx.fav)) {
    items.push({ value: 'download', label: '下载', icon: 'fas fa-download' });
  }
  items.push({ value: 'delete', label: '删除', icon: 'fas fa-trash' });
  return items;
});

function onFavCtx(e, fav, idx) {
  favCtx.show = false;
  favCtx.x = e.clientX;
  favCtx.y = e.clientY;
  favCtx.fav = fav;
  favCtx.idx = idx;
  setTimeout(() => favCtx.show = true, 1);
}

function onCtxSelect(value) {
  favCtx.show = false;
  if (!favCtx.fav) return;
  if (value === 'copy') onCopy(favCtx.fav);
  else if (value === 'forward') onForward(favCtx.fav);
  else if (value === 'download') onDownload(favCtx.fav);
  else if (value === 'delete') removeFav(favCtx.idx);
}
</script>
