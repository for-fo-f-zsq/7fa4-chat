import { onMounted, ref } from 'vue'
import { store } from '../../store.js'
import { showAlert, showConfirm } from '../useDialog.js'
import { showToast } from '../useToast.js'

/**
 * 设置面板的数据备份、恢复与缓存清理逻辑。
 * @param {() => object|undefined} getSetting
 * @param {(patch: object) => void} onSettingChange
 * @param {boolean} isWeb
 */
export function useDataBackup(getSetting, onSettingChange, isWeb) {
  const cacheSize = ref(null)

  async function loadCacheSize() {
    try {
      const r = await window.api.getCacheSize()
      if (r.success) cacheSize.value = r.size
    } catch {
      /* ignore */
    }
  }

  async function clearCache() {
    const uid = store.self.uid
    if (!uid) {
      showToast('请先登录账号后再清理缓存', 'warning')
      return
    }
    const ok = await showConfirm({
      title: '清理本地缓存',
      message: '确定要清理缓存吗？这将删除所有本地聊天数据并从服务器重新拉取。',
      confirmText: '清理',
      danger: true,
    })
    if (!ok) return
    try {
      const r = await window.api.clearCache(uid)
      if (r && r.success) {
        cacheSize.value = 0
        onSettingChange({ _clearCache: true })
        showToast('缓存已清理', 'success')
      } else {
        showToast(`清理缓存失败：${r?.error || '未知错误'}`, 'error')
      }
    } catch (e) {
      showToast(`清理缓存失败：${e?.message || '未知错误'}`, 'error')
    }
  }

  async function exportData() {
    try {
      const uid = store.self.uid
      if (!uid) {
        showToast('未登录，无法备份', 'warning')
        return
      }
      const r = await window.api.storeExportAll(uid)
      if (!r.success) {
        showAlert({ title: '备份失败', message: r.error || '存储不可用' })
        return
      }
      const prefs = { ...(r.prefs && typeof r.prefs === 'object' ? r.prefs : {}) }
      const data = JSON.stringify({
        kind: 'full',
        version: 1,
        users: r.users,
        groups: r.groups,
        messages: r.messages,
        prefs,
        setting: { ...(getSetting() || {}) },
      })
      const saveR = await window.api.exportData(data)
      if (saveR.success) {
        showAlert({ title: '备份成功', message: `已保存至：${saveR.path}` })
      }
    } catch (e) {
      showAlert({ title: '备份失败', message: e.message })
    }
  }

  async function importData() {
    try {
      const uid = store.self.uid
      if (!uid) {
        showToast('未登录，无法恢复', 'warning')
        return
      }
      const r = await window.api.importData()
      if (!r.success || !r.data) return
      const loaded = JSON.parse(r.data)
      const isPlainObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v)
      if (!isPlainObj(loaded)) {
        showAlert({ title: '恢复失败', message: '备份文件格式无效' })
        return
      }
      if (loaded.kind != null && loaded.kind !== 'full') {
        showAlert({ title: '恢复失败', message: '备份类型不匹配（请选择全量聊天备份文件）' })
        return
      }
      if (loaded.version != null && (!Number.isInteger(loaded.version) || loaded.version > 1)) {
        showAlert({ title: '恢复失败', message: `不支持的备份版本：${loaded.version}` })
        return
      }
      if (
        (loaded.users != null && !isPlainObj(loaded.users)) ||
        (loaded.groups != null && !isPlainObj(loaded.groups)) ||
        (loaded.messages != null && !isPlainObj(loaded.messages)) ||
        (loaded.prefs != null && !isPlainObj(loaded.prefs)) ||
        (loaded.setting != null && !isPlainObj(loaded.setting))
      ) {
        showAlert({ title: '恢复失败', message: '备份数据结构异常，已取消导入' })
        return
      }
      const ok = await showConfirm({
        title: '导入备份数据',
        message: '导入备份将合并/覆盖当前本地聊天记录与设置，是否继续？',
        confirmText: '导入',
        danger: true,
      })
      if (!ok) return
      // 先写盘校验成功再覆写内存状态，避免持久化失败导致内存与磁盘不一致
      const imp = await window.api.storeImportAll(uid, loaded)
      if (!imp.success) {
        showAlert({ title: '恢复警告', message: `写入本地存储失败（${imp.error || ''}）` })
        return
      }
      const incomingMsgs = loaded.messages ? Object.keys(loaded.messages).length : 0
      if (incomingMsgs > 0 && imp.messages === 0) {
        showAlert({ title: '恢复失败', message: '备份中的消息未能关联到任何会话，未覆盖当前数据' })
        return
      }
      if (loaded.users) store.users = loaded.users
      if (loaded.groups) store.groups = loaded.groups
      if (loaded.messages) store.messages = loaded.messages
      if (loaded.prefs) {
        const CORE = ['users', 'groups', 'messages', 'self', 'setting']
        for (const [k, v] of Object.entries(loaded.prefs)) {
          if (!CORE.includes(k) && k in store) store[k] = v
        }
      }
      if (loaded.setting) {
        onSettingChange(loaded.setting)
      }
      showToast('恢复成功', 'success')
    } catch (e) {
      showAlert({ title: '恢复失败', message: e.message })
    }
  }

  onMounted(() => {
    if (!isWeb) loadCacheSize()
  })

  return {
    cacheSize,
    clearCache,
    exportData,
    importData,
  }
}
