<script setup>
/**
 * 管理员账户
 * ------------------------------------------------------------
 * 仅超级管理员可见（后端 requireSuper 二次校验）。
 * 功能：新建、改角色、启用/停用、改显示名与备注、重置密码、删除。
 *
 * 关键约束（后端强制，前端提前提示）：
 *  - 不能删除/停用最后一个启用的超级管理员（防自锁）
 *  - 用户名 3–32 位，仅字母数字与 _ . -
 *  - 登录用户名不允许修改
 */
import { ref, computed, onMounted, onBeforeUnmount, inject } from 'vue'
import { api } from '@/lib/api.js'
import { session, registerPoller, unregisterPoller, markSynced } from '@/lib/store.js'
import { relTime, fmtTime, roleLabel, statusLabel, errText, toast } from '@/lib/util.js'
import BaseModal from '@/components/BaseModal.vue'
import DropdownMenu from '@/components/DropdownMenu.vue'
import EmptyState from '@/components/EmptyState.vue'
import TableSkeleton from '@/components/TableSkeleton.vue'

const confirm = inject('confirm')

const accounts = ref([])
const loading = ref(true)
const loadError = ref('')

// 新建弹窗
const createOpen = ref(false)
const createForm = ref({ username: '', password: '', role: 'ops', display_name: '', note: '' })
const createBusy = ref(false)
const createError = ref('')

// 重置密码弹窗
const pwTarget = ref(null)
const pwValue = ref('')
const pwBusy = ref(false)
const pwError = ref('')

// 编辑弹窗
const editTarget = ref(null)
const editForm = ref({ role: 'ops', status: 'active', display_name: '', note: '' })
const editBusy = ref(false)
const editError = ref('')

const myName = computed(() => session.user?.username)

async function load(silent) {
  if (!silent) loading.value = true
  try {
    const r = await api.listAccounts()
    accounts.value = (r && r.accounts) || []
    loadError.value = ''
  } catch (e) {
    if (!silent) loadError.value = errText(e)
  } finally {
    loading.value = false
  }
}

async function refresh() {
  await load(true)
  markSynced()
}

onMounted(async () => {
  await load(false)
  registerPoller('accounts', refresh)
})
onBeforeUnmount(() => unregisterPoller('accounts'))

const activeSupers = computed(
  () => accounts.value.filter((a) => a.role === 'super' && a.status === 'active').length
)

function isLastSuper(a) {
  return a.role === 'super' && a.status === 'active' && activeSupers.value <= 1
}

// ---------- 新建 ----------
function openCreate() {
  createForm.value = { username: '', password: '', role: 'ops', display_name: '', note: '' }
  createError.value = ''
  createOpen.value = true
}

function genPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const arr = new Uint32Array(18)
  crypto.getRandomValues(arr)
  return [...arr].map((n) => chars[n % chars.length]).join('')
}

async function submitCreate() {
  createError.value = ''
  const f = createForm.value
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(f.username.trim())) {
    createError.value = '用户名需为 3–32 位的字母、数字或 _ . -'
    return
  }
  if ((f.password || '').length < 8) {
    createError.value = '密码至少 8 位'
    return
  }
  createBusy.value = true
  try {
    await api.createAccount({
      username: f.username.trim(),
      password: f.password,
      role: f.role,
      display_name: f.display_name.trim(),
      note: f.note.trim(),
    })
    toast.ok('账户已创建')
    createOpen.value = false
    await load(true)
  } catch (e) {
    createError.value = e.code === 'CONFLICT' ? '该用户名已存在' : errText(e)
  } finally {
    createBusy.value = false
  }
}

// ---------- 编辑 ----------
function openEdit(a) {
  editTarget.value = a
  editForm.value = {
    role: a.role,
    status: a.status,
    display_name: a.display_name || '',
    note: a.note || '',
  }
  editError.value = ''
}

async function submitEdit() {
  const a = editTarget.value
  if (!a) return
  editError.value = ''
  editBusy.value = true
  try {
    await api.updateAccount(a.username, {
      role: editForm.value.role,
      status: editForm.value.status,
      display_name: editForm.value.display_name.trim(),
      note: editForm.value.note.trim(),
    })
    toast.ok('已保存')
    editTarget.value = null
    await load(true)
  } catch (e) {
    editError.value =
      e.code === 'LAST_SUPER'
        ? '不能停用或降级最后一个启用的超级管理员'
        : errText(e)
  } finally {
    editBusy.value = false
  }
}

// ---------- 快捷动作 ----------
async function toggleStatus(a) {
  if (a.username === myName.value) return toast.error('不能停用自己的账户')
  if (a.status === 'active' && isLastSuper(a)) {
    return toast.error('这是最后一个启用的超级管理员，不能停用')
  }
  try {
    await api.updateAccount(a.username, { status: a.status === 'active' ? 'disabled' : 'active' })
    toast.ok(a.status === 'active' ? '已停用' : '已启用')
    await load(true)
  } catch (e) {
    toast.error(errText(e))
  }
}

async function changeRole(a, role) {
  if (a.role === role) return
  if (a.username === myName.value && role !== 'super') {
    return toast.error('不能降级自己的账户')
  }
  try {
    await api.updateAccount(a.username, { role })
    toast.ok('角色已更新为' + roleLabel(role))
    await load(true)
  } catch (e) {
    toast.error(e.code === 'LAST_SUPER' ? '不能降级最后一个启用的超级管理员' : errText(e))
  }
}

async function remove(a) {
  if (a.username === myName.value) return toast.error('不能删除自己正在使用的账户')
  if (isLastSuper(a)) return toast.error('这是最后一个启用的超级管理员，不能删除')
  const okay = await confirm.ask({
    title: '删除账户',
    message: `将删除账户「${a.username}」(${roleLabel(a.role)})。删除后该账户立即无法登录，且不可恢复。`,
    danger: true,
    confirmText: '删除账户',
  })
  if (!okay) return
  try {
    await api.removeAccount(a.username)
    toast.ok('已删除')
    await load(true)
  } catch (e) {
    toast.error(errText(e))
  }
}

// ---------- 重置密码 ----------
function openPw(a) {
  pwTarget.value = a
  pwValue.value = ''
  pwError.value = ''
}

async function submitPw() {
  if ((pwValue.value || '').length < 8) {
    pwError.value = '密码至少 8 位'
    return
  }
  pwBusy.value = true
  pwError.value = ''
  try {
    await api.setAccountPassword(pwTarget.value.username, pwValue.value)
    toast.ok('密码已重置')
    pwTarget.value = null
    await load(true)
  } catch (e) {
    pwError.value = errText(e)
  } finally {
    pwBusy.value = false
  }
}
</script>

<template>
  <div class="col" style="gap: 16px">
    <div class="card">
      <div class="toolbar">
        <div>
          <div class="card__title" style="font-size: 14px">管理员账户</div>
          <div class="card__sub">共 {{ accounts.length }} 个 · 启用的超管 {{ activeSupers }} 个</div>
        </div>
        <div class="grow" />
        <button class="btn btn--primary btn--sm" @click="openCreate">
          <i class="fa-solid fa-plus" />
          <span>新建账户</span>
        </button>
      </div>
    </div>

    <div class="card">
      <TableSkeleton v-if="loading" :rows="4" :cols="5" />
      <EmptyState v-else-if="loadError" icon="fa-triangle-exclamation" title="加载失败" :sub="loadError">
        <button class="btn btn--sm" @click="load(false)"><i class="fa-solid fa-arrow-rotate-right" /><span>重试</span></button>
      </EmptyState>
      <EmptyState v-else-if="!accounts.length" icon="fa-user-shield" title="还没有管理员账户">
        <button class="btn btn--primary btn--sm" @click="openCreate">
          <i class="fa-solid fa-plus" />
          <span>创建第一个</span>
        </button>
      </EmptyState>
      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>用户名</th>
              <th>角色</th>
              <th>状态</th>
              <th>显示名</th>
              <th>最近登录</th>
              <th style="text-align: right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in accounts" :key="a.username">
              <td>
                <div class="row" style="gap: 6px">
                  <span class="mono" style="font-weight: 600">{{ a.username }}</span>
                  <span v-if="a.username === myName" class="badge badge--accent">我</span>
                </div>
                <div v-if="a.note" class="muted truncate" style="font-size: 11.5px; max-width: 220px" :title="a.note">{{ a.note }}</div>
              </td>
              <td>
                <span class="badge" :class="a.role === 'super' ? 'badge--accent' : 'badge--muted'">
                  {{ roleLabel(a.role) }}
                </span>
              </td>
              <td>
                <span class="badge" :class="a.status === 'active' ? 'badge--ok' : 'badge--danger'">
                  {{ statusLabel(a.status) }}
                </span>
              </td>
              <td class="muted">{{ a.display_name || '—' }}</td>
              <td class="muted nowrap" :title="fmtTime(a.last_login_at)">{{ relTime(a.last_login_at) }}</td>
              <td>
                <div class="table__actions">
                  <button class="btn btn--sm" @click="openEdit(a)">
                    <i class="fa-solid fa-pen-to-square" />
                    <span>编辑</span>
                  </button>
                  <button class="btn btn--sm" @click="openPw(a)">
                    <i class="fa-solid fa-key" />
                    <span>改密码</span>
                  </button>
                  <DropdownMenu label="更多">
                    <button class="menu-item" @click="toggleStatus(a)">
                      {{ a.status === 'active' ? '停用账户' : '启用账户' }}
                    </button>
                    <button class="menu-item" :disabled="a.role === 'super'" @click="changeRole(a, 'super')">
                      设为超级管理员
                    </button>
                    <button class="menu-item" :disabled="a.role === 'ops'" @click="changeRole(a, 'ops')">
                      设为运营
                    </button>
                    <div class="menu-sep" />
                    <button class="menu-item menu-item--danger" @click="remove(a)">
                      <i class="fa-solid fa-trash-can" />
                      <span>删除账户</span>
                    </button>
                  </DropdownMenu>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 新建 -->
    <BaseModal v-if="createOpen" title="新建管理员账户" :busy="createBusy" @close="createOpen = false">
      <div class="field">
        <label class="field__label">用户名</label>
        <input v-model="createForm.username" class="input mono" placeholder="3–32 位，字母/数字/_.-" spellcheck="false" :disabled="createBusy" />
        <span class="field__hint">用于登录，创建后不可修改。</span>
      </div>
      <div class="field">
        <label class="field__label">初始密码</label>
        <div class="row" style="gap: 8px">
          <input v-model="createForm.password" class="input mono grow" placeholder="至少 8 位" spellcheck="false" :disabled="createBusy" />
          <button class="btn btn--sm" type="button" :disabled="createBusy" @click="createForm.password = genPassword()"><i class="fa-solid fa-arrow-rotate-right" /><span>随机</span></button>
        </div>
        <span class="field__hint">请通过安全渠道转交给使用人，并提醒其尽快修改。</span>
      </div>
      <div class="field">
        <label class="field__label">角色</label>
        <select v-model="createForm.role" class="select" :disabled="createBusy">
          <option value="ops">运营 —— 可审核内容、查看审计</option>
          <option value="super">超级管理员 —— 另可管理账户与系统配置</option>
        </select>
      </div>
      <div class="field">
        <label class="field__label">显示名（可选）</label>
        <input v-model="createForm.display_name" class="input" placeholder="如：张三" :disabled="createBusy" />
      </div>
      <div class="field">
        <label class="field__label">备注（可选）</label>
        <input v-model="createForm.note" class="input" placeholder="如：负责海报审核" :disabled="createBusy" />
      </div>
      <p v-if="createError" class="field__error">{{ createError }}</p>
      <template #foot>
        <button class="btn" :disabled="createBusy" @click="createOpen = false">取消</button>
        <button class="btn btn--primary" :disabled="createBusy" @click="submitCreate">
          <span v-if="createBusy" class="spinner" />
          <span>创建</span>
        </button>
      </template>
    </BaseModal>

    <!-- 编辑 -->
    <BaseModal v-if="editTarget" :title="'编辑账户 · ' + editTarget.username" :busy="editBusy" @close="editTarget = null">
      <div class="field">
        <label class="field__label">角色</label>
        <select v-model="editForm.role" class="select" :disabled="editBusy">
          <option value="ops">运营</option>
          <option value="super">超级管理员</option>
        </select>
      </div>
      <div class="field">
        <label class="field__label">状态</label>
        <select v-model="editForm.status" class="select" :disabled="editBusy">
          <option value="active">启用</option>
          <option value="disabled">停用</option>
        </select>
        <span class="field__hint">停用后该账户立即无法登录（已登录的会话也会失效）。</span>
      </div>
      <div class="field">
        <label class="field__label">显示名</label>
        <input v-model="editForm.display_name" class="input" :disabled="editBusy" />
      </div>
      <div class="field">
        <label class="field__label">备注</label>
        <input v-model="editForm.note" class="input" :disabled="editBusy" />
      </div>
      <p v-if="editError" class="field__error">{{ editError }}</p>
      <template #foot>
        <button class="btn" :disabled="editBusy" @click="editTarget = null">取消</button>
        <button class="btn btn--primary" :disabled="editBusy" @click="submitEdit">
          <span v-if="editBusy" class="spinner" />
          <span>保存</span>
        </button>
      </template>
    </BaseModal>

    <!-- 重置密码 -->
    <BaseModal v-if="pwTarget" :title="'重置密码 · ' + pwTarget.username" :busy="pwBusy" @close="pwTarget = null">
      <div class="field">
        <label class="field__label">新密码</label>
        <div class="row" style="gap: 8px">
          <input v-model="pwValue" class="input mono grow" placeholder="至少 8 位" spellcheck="false" :disabled="pwBusy" />
          <button class="btn btn--sm" type="button" :disabled="pwBusy" @click="pwValue = genPassword()"><i class="fa-solid fa-arrow-rotate-right" /><span>随机</span></button>
        </div>
        <span class="field__hint">重置后该账户的已有登录会话不会被强制下线，但下次登录需用新密码。</span>
      </div>
      <p v-if="pwError" class="field__error">{{ pwError }}</p>
      <template #foot>
        <button class="btn" :disabled="pwBusy" @click="pwTarget = null">取消</button>
        <button class="btn btn--primary" :disabled="pwBusy" @click="submitPw">
          <span v-if="pwBusy" class="spinner" />
          <span>确认重置</span>
        </button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 12px; padding: 14px 16px; flex-wrap: wrap; }
.menu-sep { height: 1px; background: var(--border); margin: 4px 6px; }
.menu-item:disabled { opacity: 0.4; cursor: not-allowed; }
.menu-item--danger { color: var(--danger); }
</style>
