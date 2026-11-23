<template>
  <PanelShell title="设置" icon="fas fa-cog" :scrollable="false">
    <div class="settings-layout">
      <aside class="settings-nav" role="tablist" aria-label="设置分类" @keydown="onCategoryKeydown">
        <button
          v-for="cat in categories"
          :id="`settings-tab-${cat.key}`"
          :key="cat.key"
          ref="tabRefs"
          type="button"
          role="tab"
          class="settings-nav-item"
          :class="{ 'is-active': activeCategory === cat.key }"
          :aria-selected="activeCategory === cat.key"
          :aria-controls="`settings-panel-${cat.key}`"
          :tabindex="activeCategory === cat.key ? 0 : -1"
          @click="selectCategory(cat.key)"
        >
          <i :class="cat.icon" class="settings-nav-icon" aria-hidden="true"></i>
          <span class="settings-nav-label">{{ cat.label }}</span>
        </button>
      </aside>

      <div
        :id="`settings-panel-${activeCategory}`"
        ref="contentRef"
        class="settings-content"
        role="tabpanel"
        :aria-labelledby="`settings-tab-${activeCategory}`"
      >
        <template v-if="activeCategory === 'appearance'">
          <section class="p-panel-section">
            <h3 class="p-panel-section__title">交互与显示</h3>
            <SettingRow
              label="特效"
              description="界面动效强度：性能（无粒子与鼠标渐变）/ 效率（无粒子）/ 精美（全部效果）"
            >
              <UiDropdown
                class="settings-select"
                :model-value="effectValue"
                :options="effectOptions"
                aria-label="特效强度"
                @update:model-value="selectEffect"
              />
            </SettingRow>

            <SettingRow
              label="字体大小"
              description="聊天与界面文字的字号（12–20 px），调整后立即生效"
            >
              <div class="slider-wrap">
                <UiSlider
                  class="settings-slider"
                  :model-value="setting.fontSize || 14"
                  :min="12"
                  :max="20"
                  :step="1"
                  :show-value="false"
                  size="sm"
                  aria-label="字体大小"
                  @update:model-value="onFontSizeChange"
                />
                <span class="slider-value u-tabular-nums">{{ setting.fontSize || 14 }}px</span>
              </div>
            </SettingRow>

            <SettingRow
              label="快捷键"
              description="自定义页面切换与常用操作的键盘快捷键"
              clickable
              @activate="emit('openShortcutModal')"
            >
              <div class="settings-entry-right">
                <span class="settings-entry-hint">自定义</span>
                <i class="fas fa-chevron-right settings-arrow" aria-hidden="true"></i>
              </div>
            </SettingRow>
          </section>

          <section class="p-panel-section settings-grade-section">
            <div class="settings-grade-header">
              <div>
                <h3 class="p-panel-section__title settings-theme-title">年级颜色</h3>
                <p class="settings-section-desc">自定义聊天消息与好友列表中各年级名称牌与标识的颜色</p>
              </div>
              <UiButton
                variant="secondary"
                size="sm"
                icon="fas fa-rotate-left"
                @click="resetGradeColors"
              >
                重置默认
              </UiButton>
            </div>

            <div class="grade-color-grid">
              <div v-for="k in COLOR_KEYS" :key="k" class="grade-card">
                <div class="grade-card-top">
                  <span class="grade-preview-name" :style="{ color: getGradeColorValue(k) }">
                    {{ GRADE_LABELS[k] || k }}
                  </span>
                  <label class="grade-picker-wrap" :title="`选择「${GRADE_LABELS[k] || k}」颜色`">
                    <span class="grade-color-chip" :style="{ background: getGradeColorValue(k) }"></span>
                    <input
                      type="color"
                      :value="getGradeColorValue(k)"
                      :aria-label="`选择${GRADE_LABELS[k] || k}颜色`"
                      @input="onGradeColorChange(k, $event.target.value)"
                    />
                  </label>
                </div>
                <UiInput
                  :model-value="getGradeColorValue(k)"
                  class="grade-hex-input u-tabular-nums"
                  size="sm"
                  monospace
                  :aria-label="`${GRADE_LABELS[k] || k}颜色十六进制值`"
                  @update:model-value="onGradeColorHexChange(k, $event)"
                />
              </div>
            </div>
          </section>

          <section class="p-panel-section settings-theme-section" :class="{ 'is-wide': themeTab === 'custom' }">
            <div class="settings-theme-header">
              <h3 class="p-panel-section__title settings-theme-title">主题</h3>
              <div class="theme-current" :title="currentThemeLabel">
                <UiBadge dot :color="currentThemeColor" :title="currentThemeLabel" />
                <span>{{ currentThemeLabel }}</span>
              </div>
            </div>

            <UiTabs v-model="themeTab" :items="themeTabs" variant="pill" size="sm" class="theme-tabs">
              <ThemePresetGrid
                v-if="themeTab === 'preset'"
                :themes="THEMES"
                :current-theme="currentTheme"
                :vars-of="themeVarsOf"
                :is-dark-theme="isDarkTheme"
                @select="selectTheme"
                @preview="previewTheme"
                @restore="restoreTheme"
              />
              <ThemeCustomEditor
                v-else
                :custom-vars="customVars"
                :selected-preset-base="selectedPresetBase"
                :is-custom-dark="isCustomDark"
                :dirty="hasUnsavedChanges"
                @export="exportTheme"
                @import-text="importThemeText"
                @reset-custom="resetCustom"
                @apply="applyCustom"
                @load-preset="loadPresetIntoCustom"
                @update-var="updateCustomVar"
              />
            </UiTabs>
          </section>
        </template>

        <template v-else-if="activeCategory === 'notifications'">
          <section class="p-panel-section">
            <h3 class="p-panel-section__title">系统通知</h3>
            <p class="settings-section-desc">窗口未聚焦或退到后台时，通过操作系统原生通知提醒新消息。</p>

            <SettingRow
              label="新消息提醒"
              description="窗口未聚焦或最小化时发送系统原生通知；网页端需开启浏览器通知权限"
            >
              <UiSwitch
                :model-value="setting.notifDesktop !== false"
                aria-label="新消息提醒"
                @update:model-value="onSettingChange('notifDesktop', $event)"
              />
            </SettingRow>

            <SettingRow
              label="隐藏消息内容"
              description="系统通知里只显示「收到一条新消息」，不显示消息正文；仍会显示会话名与发送者，便于判断是谁在找你"
            >
              <UiSwitch
                :model-value="!!setting.notifPrivacy"
                aria-label="隐藏消息内容"
                @update:model-value="onSettingChange('notifPrivacy', $event)"
              />
            </SettingRow>

            <SettingRow
              label="发送测试通知"
              description="立刻发送一条系统测试通知并播放提示音，用来确认系统通知权限与音量是否合适"
              clickable
              @activate="onSendTestNotification"
            >
              <UiButton
                size="sm"
                variant="secondary"
                icon="fas fa-paper-plane"
                :loading="testNotifBusy"
                aria-label="发送测试通知"
                @click.stop="onSendTestNotification"
              >
                发送测试
              </UiButton>
            </SettingRow>
          </section>

          <section class="p-panel-section">
            <h3 class="p-panel-section__title">站点通知</h3>
            <p class="settings-section-desc">
              自动轮询 OJ 站点未读通知。收到未读通知时将在屏幕右下角强制置顶弹出，不设定时自动关闭，可分别手动点击「确认」或「已读」。
            </p>

            <SettingRow
              label="右下角强制通知"
              description="站点通知功能始终开启，不可关闭"
            >
              <UiBadge size="sm" variant="brand">不可关闭</UiBadge>
            </SettingRow>

            <SettingRow
              label="发送测试通知"
              description="立即在屏幕右下角弹出一条测试站点通知，用于验证强提示弹窗与「确认」/「已读」交互"
              clickable
              @activate="onSendSiteTestNotice"
            >
              <UiButton
                size="sm"
                variant="secondary"
                icon="fas fa-bell"
                aria-label="发送测试通知"
                @click.stop="onSendSiteTestNotice"
              >
                发送测试通知
              </UiButton>
            </SettingRow>
          </section>

          <section class="p-panel-section">
            <h3 class="p-panel-section__title">声音与提醒</h3>
            <p class="settings-section-desc">用什么方式提示我，以及哪些消息值得打扰。</p>

            <SettingRow label="提示音" description="收到新消息时播放提示音（系统静音时听不到）">
              <UiSwitch
                :model-value="setting.notifSound !== false"
                aria-label="提示音"
                @update:model-value="onSettingChange('notifSound', $event)"
              />
            </SettingRow>

            <SettingRow label="提示音量" description="拖动即可试听当前音量（0–100）">
              <div class="slider-wrap">
                <UiSlider
                  class="settings-slider"
                  :model-value="setting.notifSoundVolume ?? 60"
                  :min="0"
                  :max="100"
                  :step="5"
                  :show-value="false"
                  size="sm"
                  :disabled="setting.notifSound === false"
                  aria-label="提示音量"
                  @update:model-value="onNotifVolumeChange"
                />
                <span class="slider-value u-tabular-nums">{{ setting.notifSoundVolume ?? 60 }}%</span>
              </div>
            </SettingRow>

            <SettingRow
              label="仅提醒提及我的"
              description="私聊照常提醒；群聊只在 @我 或 @全体成员 时提醒"
            >
              <UiSwitch
                :model-value="!!setting.notifMentionOnly"
                aria-label="仅提醒提及我的"
                @update:model-value="onSettingChange('notifMentionOnly', $event)"
              />
            </SettingRow>

            <SettingRow
              v-if="isElectron"
              label="未读角标"
              description="任务栏 / 托盘图标上显示未读消息总数"
            >
              <UiSwitch
                :model-value="setting.notifBadge !== false"
                aria-label="未读角标"
                @update:model-value="onSettingChange('notifBadge', $event)"
              />
            </SettingRow>
          </section>

          <section class="p-panel-section">
            <h3 class="p-panel-section__title">免打扰</h3>
            <p class="settings-section-desc">
              免打扰优先于以上所有提醒；单个会话的「消息免打扰」始终生效，开启后只计数、不提醒。
            </p>

            <SettingRow label="免打扰" description="开启后不再弹出任何新消息通知（消息照常接收，只是不提醒）">
              <UiSwitch
                :model-value="!!setting.dndEnabled"
                aria-label="免打扰"
                @update:model-value="onSettingChange('dndEnabled', $event)"
              />
            </SettingRow>

            <SettingRow label="定时免打扰" description="每天按下面的时段自动进入免打扰，其余时间正常提醒">
              <UiSwitch
                :model-value="!!setting.dndSchedule"
                aria-label="定时免打扰"
                @update:model-value="onSettingChange('dndSchedule', $event)"
              />
            </SettingRow>

            <SettingRow label="免打扰时段">
              <div class="settings-time-range">
                <UiInput
                  class="settings-time-input"
                  type="time"
                  size="sm"
                  :model-value="setting.dndStart ?? '22:00'"
                  placeholder="22:00"
                  :disabled="!setting.dndSchedule"
                  aria-label="免打扰开始时间"
                  @update:model-value="onSettingChange('dndStart', $event)"
                />
                <span class="settings-time-range__sep" aria-hidden="true">至</span>
                <UiInput
                  class="settings-time-input"
                  type="time"
                  size="sm"
                  :model-value="setting.dndEnd ?? '07:00'"
                  placeholder="07:00"
                  :disabled="!setting.dndSchedule"
                  aria-label="免打扰结束时间"
                  @update:model-value="onSettingChange('dndEnd', $event)"
                />
                <span class="settings-inline-hint">跨零点自动识别</span>
              </div>
            </SettingRow>
          </section>
        </template>

        <template v-else-if="activeCategory === 'messaging'">
          <section class="p-panel-section settings-status-section">
            <div class="settings-status-head">
              <div class="settings-status-title-wrap">
                <span class="settings-status-dot" :class="`is-${connSummary.tone}`" aria-hidden="true"></span>
                <div>
                  <h3 class="p-panel-section__title settings-theme-title">连接状态</h3>
                  <p class="settings-status-headline">{{ connSummary.headline }}</p>
                </div>
              </div>
              <UiButton
                size="sm"
                variant="secondary"
                icon="fas fa-rotate"
                :loading="reconnectBusy"
                :disabled="!isLoggedIn"
                @click="onReconnectClick"
              >
                立即重连 / 刷新
              </UiButton>
            </div>

            <div class="settings-status-grid">
              <div class="settings-status-tile">
                <span class="settings-status-tile-label">登录会话</span>
                <span class="settings-status-tile-val" :class="`is-${sessionTile.tone}`">{{ sessionTile.text }}</span>
              </div>
              <div class="settings-status-tile">
                <span class="settings-status-tile-label">服务器连接</span>
                <span class="settings-status-tile-val" :class="`is-${serverTile.tone}`">{{ serverTile.text }}</span>
              </div>
              <div class="settings-status-tile">
                <span class="settings-status-tile-label">接口延迟</span>
                <span class="settings-status-tile-val u-tabular-nums">{{ latencyText }}</span>
              </div>
              <div class="settings-status-tile">
                <span class="settings-status-tile-label">最近同步</span>
                <span class="settings-status-tile-val u-tabular-nums">{{ lastSyncText }}</span>
              </div>
            </div>

            <div v-if="cooldownText || conn.lastError || conn.failCount > 0" class="settings-status-alerts">
              <div v-if="cooldownText" class="settings-status-alert is-warning">
                <i class="fas fa-clock" aria-hidden="true"></i>
                <span>{{ cooldownText }}</span>
              </div>
              <div v-if="conn.lastError || conn.failCount > 0" class="settings-status-alert is-danger">
                <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
                <span>
                  <template v-if="conn.failCount > 0">连续失败 {{ conn.failCount }} 次</template>
                  <template v-if="conn.failCount > 0 && conn.lastError"> · </template>
                  <template v-if="conn.lastError">{{ conn.lastError }}</template>
                </span>
              </div>
            </div>

            <div class="settings-status-history">
              <div class="settings-status-history-head">
                <span class="settings-status-history-title">最近 24 小时状态（按小时 · 可用率）</span>
                <span class="settings-status-history-meta u-tabular-nums">{{ statusUptimeSummary }}</span>
              </div>
              <div class="settings-status-bars-wrap" @mouseleave="clearHoveredSlot">
                <div
                  v-if="hoveredSlotInfo"
                  class="settings-status-tooltip"
                  :class="hoveredSlotAlignClass"
                  :style="{ '--tip-left': hoveredSlotLeft }"
                  role="tooltip"
                >
                  <span class="settings-status-tooltip-dot" :class="`is-${hoveredSlotInfo.tone}`" aria-hidden="true"></span>
                  <span class="settings-status-tooltip-text u-tabular-nums">{{ hoveredSlotInfo.tooltip }}</span>
                </div>
                <div class="settings-status-bars" role="img" :aria-label="statusUptimeSummary">
                  <button
                    v-for="(slot, idx) in statusHourlySlots"
                    :key="slot.hourTs"
                    type="button"
                    class="settings-status-bar"
                    :class="[`is-${slot.tone}`, slot.gradeClass || '', { 'is-hovered': hoveredHourTs === slot.hourTs }]"
                    :aria-label="slot.tooltip"
                    @mouseenter="onHoverSlot(slot.hourTs, idx)"
                    @focus="onHoverSlot(slot.hourTs, idx)"
                    @blur="onBlurSlot(slot.hourTs)"
                  >
                    <span class="settings-status-bar-fill"></span>
                  </button>
                </div>
              </div>
              <div class="settings-status-axis">
                <span>{{ statusAxisStart }}</span>
                <span class="settings-status-legend">
                  <i class="is-success" aria-hidden="true"></i>正常≥99%
                  <i class="is-warning" aria-hidden="true"></i>波动
                  <i class="is-danger" aria-hidden="true"></i>异常
                  <i class="is-empty" aria-hidden="true"></i>未运行
                </span>
                <span>当前</span>
              </div>

              <div v-if="statusRecentEvents.length" class="settings-status-events">
                <div
                  v-for="(evt, idx) in statusRecentEvents"
                  :key="`${evt.ts}-${idx}`"
                  class="settings-status-event"
                >
                  <span class="settings-status-event-dot" :class="`is-${evt.tone}`" aria-hidden="true"></span>
                  <span class="settings-status-event-time u-tabular-nums">{{ evt.timeText }}</span>
                  <span class="settings-status-event-title">{{ evt.title }}</span>
                  <span v-if="evt.detail" class="settings-status-event-detail">{{ evt.detail }}</span>
                </div>
              </div>
            </div>
          </section>

          <section class="p-panel-section">
            <h3 class="p-panel-section__title">消息与网络</h3>
            <p class="settings-section-desc">连到哪台服务器、多久拉取一次消息，以及会话列表里保留哪些好友。</p>

            <SettingRow
              v-if="!isWeb"
              label="API 地址"
              description="选择连接的服务器：jx.7fa4.cn 为默认站点，in.7fa4.cn 为校内备用入口"
            >
              <UiDropdown
                class="settings-select"
                :model-value="apiUrlValue"
                :options="apiUrlOptions"
                aria-label="API 地址"
                @update:model-value="selectApiUrl"
              />
            </SettingRow>

            <SettingRow
              label="轮询间隔"
              description="多久向服务器拉取一次新消息（1.0–10.0 秒）；越短越及时，也越耗流量与电量"
            >
              <div class="slider-wrap">
                <UiSlider
                  class="settings-slider"
                  :model-value="setting.pollInterval || 1000"
                  :min="1000"
                  :max="10000"
                  :step="100"
                  :show-value="false"
                  size="sm"
                  aria-label="轮询间隔"
                  @update:model-value="onPollChange"
                />
                <span class="slider-value u-tabular-nums">{{ formatPoll(setting.pollInterval || 1000) }}</span>
              </div>
            </SettingRow>

            <SettingRow
              label="隐藏非双向好友"
              description="开启后，会话列表只保留互相关注的好友（单向关注的关系将隐藏，数据不会被删除）"
            >
              <UiSwitch
                :model-value="setting.hideNonMutual === true"
                aria-label="隐藏非双向好友"
                @update:model-value="onSettingChange('hideNonMutual', $event)"
              />
            </SettingRow>
          </section>
        </template>

        <template v-else-if="activeCategory === 'account'">
          <section class="p-panel-section settings-account-section">
            <div class="settings-account-header">
              <h3 class="p-panel-section__title settings-theme-title">账号与安全</h3>
              <UiBadge v-if="isLoggedIn" variant="success" size="sm">已登录</UiBadge>
              <UiBadge v-else variant="neutral" size="sm">游客模式</UiBadge>
            </div>

            <div class="settings-account-card">
              <div class="settings-account-profile">
                <UiAvatar
                  class="settings-account-avatar"
                  :size="52"
                  shape="rounded"
                  :color="isLoggedIn ? avatarTint(selfUid) : ''"
                  :name="isLoggedIn ? (selfDisplayName || '未登录') : '未登录'"
                >
                  <span v-if="isLoggedIn && selfInitial" class="settings-account-initial">{{ selfInitial }}</span>
                  <i v-else class="fas fa-user settings-account-fallback" aria-hidden="true"></i>
                </UiAvatar>

                <div class="settings-account-identity">
                  <div class="settings-account-name-row">
                    <span
                      class="settings-account-name"
                      :style="selfGradeColor ? { color: selfGradeColor } : undefined"
                    >
                      {{ isLoggedIn ? (selfDisplayName || '已登录用户') : '未登录账号' }}
                    </span>
                    <UiBadge
                      v-if="selfGradeLabel"
                      size="sm"
                      :pill="false"
                      :color="selfGradeColor"
                    >
                      {{ selfGradeLabel }}
                    </UiBadge>
                  </div>

                  <p v-if="!isLoggedIn" class="settings-account-guest-hint">
                    当前处于游客浏览模式，登录后可使用消息收发与同步功能
                  </p>

                  <div v-else-if="accountMetaItems.length" class="settings-account-meta">
                    <div v-for="item in accountMetaItems" :key="item.key" class="settings-account-meta-item">
                      <span class="settings-account-meta-key">{{ item.key }}</span>
                      <span
                        class="settings-account-meta-val"
                        :class="{ mono: item.mono, 'u-tabular-nums': item.mono }"
                      >
                        {{ item.value }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="settings-account-actions">
                <template v-if="isLoggedIn">
                  <UiButton
                    variant="secondary"
                    size="sm"
                    icon="fas fa-sync-alt"
                    :disabled="accountActionBusy"
                    title="退出当前会话并前往登录页切换或重新登录账号"
                    @click="onAccountAction('relogin')"
                  >
                    重新登录
                  </UiButton>
                  <UiButton
                    variant="danger"
                    size="sm"
                    icon="fas fa-sign-out-alt"
                    :disabled="accountActionBusy"
                    title="退出登录并清除本机保存的自动登录凭据"
                    @click="onAccountAction('logout')"
                  >
                    退出登录
                  </UiButton>
                </template>
                <UiButton
                  v-else
                  variant="primary"
                  size="sm"
                  icon="fas fa-sign-in-alt"
                  :disabled="accountActionBusy"
                  @click="onAccountAction('login')"
                >
                  去登录
                </UiButton>
              </div>
            </div>
          </section>

          <section class="p-panel-section">
            <h3 class="p-panel-section__title">登录与凭据</h3>
            <p class="settings-section-desc">登录状态只保存在本机；关闭「保持登录」会清除已保存的凭据。</p>

            <SettingRow
              label="保持登录"
              description="在本机保存登录凭据以便下次自动登录；关闭会清除已保存的账号与密码，之后需要重新登录"
            >
              <UiSwitch
                :model-value="!!setting.keepLogin"
                :disabled="!setting.keepLogin"
                aria-label="保持登录"
                @update:model-value="onKeepLoginChange"
              />
            </SettingRow>
          </section>
        </template>

        <template v-else-if="activeCategory === 'desktop' && isElectron">
          <section class="p-panel-section">
            <h3 class="p-panel-section__title">窗口与更新</h3>
            <p class="settings-section-desc">开机启动、关闭窗口后是否留在托盘，以及新版本如何获取。</p>

            <SettingRow
              v-if="isElectron"
              label="开机自启动"
              description="登录系统后自动启动 7FA4 Chat（若开启「保持后台运行」，将静默启动到系统托盘）"
            >
              <UiSwitch
                :model-value="setting.launchAtStartup !== false"
                aria-label="开机自启动"
                @update:model-value="onSettingChange('launchAtStartup', $event)"
              />
            </SettingRow>

            <SettingRow
              v-if="isElectron"
              label="保持后台运行"
              description="关闭主窗口后隐藏到系统托盘并继续接收消息；需要彻底退出时用托盘菜单的「退出」"
            >
              <UiSwitch
                :model-value="setting.minimizeToTray !== false"
                aria-label="保持后台运行"
                @update:model-value="onSettingChange('minimizeToTray', $event)"
              />
            </SettingRow>

            <SettingRow
              v-if="isElectron"
              label="自动更新"
              description="启动后自动检查并下载新版本"
            >
              <UiSwitch
                :model-value="setting.autoUpdate !== false"
                aria-label="自动更新"
                @update:model-value="onSettingChange('autoUpdate', $event)"
              />
            </SettingRow>
          </section>
        </template>

        <template v-else-if="activeCategory === 'storage' && !isWeb">
          <section class="p-panel-section">
            <h3 class="p-panel-section__title">数据与存储</h3>
            <SettingRow
              label="备份聊天数据"
              description="把本机的聊天记录、群与设置全部导出为一个文件"
              clickable
              @activate="exportData"
            >
              <div class="settings-entry-right">
                <span class="settings-entry-hint">导出到文件</span>
                <i class="fas fa-download settings-arrow" aria-hidden="true"></i>
              </div>
            </SettingRow>

            <SettingRow
              label="恢复聊天数据"
              description="从备份文件恢复聊天记录与设置；会写入并覆盖本机对应数据"
              clickable
              @activate="importData"
            >
              <div class="settings-entry-right">
                <span class="settings-entry-hint">从文件导入</span>
                <i class="fas fa-upload settings-arrow" aria-hidden="true"></i>
              </div>
            </SettingRow>

            <SettingRow
              v-if="cacheSize !== null"
              label="缓存管理"
              description="本机聊天数据的占用空间；点击清理会删除本地缓存并从服务器重新拉取"
              clickable
              @activate="clearCache"
            >
              <div class="settings-entry-right">
                <span class="settings-entry-hint u-tabular-nums">{{ formatSize(cacheSize) }} · 点击清理</span>
                <i class="fas fa-trash settings-arrow" aria-hidden="true"></i>
              </div>
            </SettingRow>
          </section>
        </template>
      </div>
    </div>
  </PanelShell>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { UiAvatar, UiBadge, UiButton, UiDropdown, UiInput, UiSlider, UiSwitch, UiTabs } from '@/ui'
import { getConnHourlySnapshot, store } from '@/store.js'
import { THEMES } from '@/composables/constants.js'
import {
  applyFontSize,
  avatarTint,
  COLOR_KEYS,
  formatSize,
  getGradeColor,
  getGradeLabel,
  GRADE_LABELS,
  isWebBrowser,
  localGradeColorKey,
} from '@/utils.js'
import { previewNotificationSound, sendTestNotification } from '@/utils/notify.js'
import { sendTestSiteNotice } from '@/composables/chat/useNotices.js'
import { useDataBackup } from '@/composables/modals/useDataBackup.js'
import { useThemeEditor } from '@/composables/modals/useThemeEditor.js'
import PanelShell from '@/components/common/PanelShell.vue'
import SettingRow from '@/components/common/SettingRow.vue'
import ThemePresetGrid from '@/components/modals/theme/ThemePresetGrid.vue'
import ThemeCustomEditor from '@/components/modals/theme/ThemeCustomEditor.vue'

const props = defineProps({
  self: { type: Object, default: () => ({}) },
  loggedIn: { type: Boolean, default: false },
  setting: Object,
  connStatus: { type: Object, default: null },
})

const emit = defineEmits(['userAction', 'settingChange', 'openShortcutModal', 'reconnect'])

const isElectron = !window.__7FA4_WEB__
const isWeb = isWebBrowser()

const isLoggedIn = computed(() => Boolean(props.loggedIn))
const selfUid = computed(() => props.self?.uid ?? '')
const selfUname = computed(() => props.self?.username || '')
const selfRealName = computed(() => props.self?.realname || '')
const selfSchool = computed(() => props.self?.school || '')
const selfSeat = computed(() => props.self?.seat || '')
const selfDisplayName = computed(
  () => props.self?.nickname || props.self?.realname || props.self?.username || (selfUid.value !== '' ? `UID ${selfUid.value}` : '')
)
const selfInitial = computed(() => {
  const n = selfDisplayName.value
  return n ? n.charAt(0).toUpperCase() : ''
})
const selfGradeLabel = computed(() => {
  if (!isLoggedIn.value || !selfUid.value) return ''
  const key = localGradeColorKey(selfUid.value)
  if (!key || key === 'uk') return ''
  return getGradeLabel(selfUid.value) || ''
})
const selfGradeColor = computed(() => {
  if (!isLoggedIn.value || !selfUid.value) return ''
  return getGradeColor(selfUid.value) || ''
})
const accountMetaItems = computed(() => {
  if (!isLoggedIn.value) return []
  const items = []
  if (selfUid.value !== '') items.push({ key: 'UID', value: String(selfUid.value), mono: true })
  if (selfUname.value) items.push({ key: '用户名', value: `@${selfUname.value}` })
  if (selfRealName.value && selfRealName.value !== selfDisplayName.value) {
    items.push({ key: '真名', value: selfRealName.value })
  }
  if (selfSchool.value) items.push({ key: '学校', value: selfSchool.value })
  if (selfSeat.value) items.push({ key: '座位', value: selfSeat.value })
  return items
})

const accountActionBusy = ref(false)
function onAccountAction(kind) {
  if (accountActionBusy.value) return
  accountActionBusy.value = true
  emit('userAction', kind)
  setTimeout(() => {
    accountActionBusy.value = false
  }, 800)
}

// 分类按「看界面 / 通知 / 网络 / 账号 / 桌面能力 / 数据」拆分：
// 旧版把账号卡片、通知、托盘、更新全塞在「消息与账号」里，找任何一项都要通读整页。
const categories = computed(() => {
  const list = [
    { key: 'appearance', label: '外观与主题', icon: 'fas fa-palette' },
    { key: 'notifications', label: '通知与提醒', icon: 'fas fa-bell' },
    { key: 'messaging', label: '消息与网络', icon: 'fas fa-comments' },
    { key: 'account', label: '账号与安全', icon: 'fas fa-user-shield' },
  ]
  if (isElectron) {
    list.push({ key: 'desktop', label: '桌面与系统', icon: 'fas fa-desktop' })
  }
  if (!isWeb) {
    list.push({ key: 'storage', label: '数据与存储', icon: 'fas fa-database' })
  }
  return list
})

const activeCategory = ref('appearance')
const contentRef = ref(null)
const tabRefs = ref([])

const themeTab = ref('preset')
const themeTabs = [
  { key: 'preset', label: '预设主题' },
  { key: 'custom', label: '自定义主题' },
]

const {
  customVars,
  selectedPresetBase,
  isCustomDark,
  hasUnsavedChanges,
  themeVarsOf,
  isDarkTheme,
  initVars,
  loadPresetIntoCustom,
  updateCustomVar,
  selectTheme,
  previewTheme,
  restoreTheme,
  applyCustom,
  resetCustom,
  exportTheme,
  importThemeText,
  getGradeColorValue,
  onGradeColorChange,
  onGradeColorHexChange,
  resetGradeColors,
} = useThemeEditor(
  () => props.setting,
  (patch) => emit('settingChange', patch)
)

function selectCategory(key) {
  if (activeCategory.value === key) return
  restoreTheme()
  activeCategory.value = key
  nextTick(() => {
    if (contentRef.value) contentRef.value.scrollTop = 0
  })
}

function onCategoryKeydown(e) {
  const list = categories.value
  const idx = list.findIndex((c) => c.key === activeCategory.value)
  if (idx < 0) return
  let nextIdx = -1
  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') nextIdx = (idx + 1) % list.length
  else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') nextIdx = (idx - 1 + list.length) % list.length
  else if (e.key === 'Home') nextIdx = 0
  else if (e.key === 'End') nextIdx = list.length - 1
  if (nextIdx < 0) return
  e.preventDefault()
  selectCategory(list[nextIdx].key)
  nextTick(() => {
    tabRefs.value[nextIdx]?.focus()
  })
}

watch(themeTab, (next) => {
  if (next !== 'preset') restoreTheme()
})

onMounted(() => {
  initVars()
})

onBeforeUnmount(() => {
  restoreTheme()
})

const { cacheSize, clearCache, exportData, importData } = useDataBackup(
  () => props.setting,
  (patch) => emit('settingChange', patch),
  isWeb
)

const apiUrlOptions = [
  { value: 'https://jx.7fa4.cn', label: 'jx.7fa4.cn', color: '#E67E22' },
  { value: 'https://in.7fa4.cn', label: 'in.7fa4.cn', color: '#12B7F5' },
]

const effectOptions = [
  { value: 'performance', label: '性能', desc: '无粒子和鼠标渐变', icon: 'fas fa-bolt' },
  { value: 'efficiency', label: '效率', desc: '无粒子效果', icon: 'fas fa-feather' },
  { value: 'fancy', label: '精美', desc: '全部效果', icon: 'fas fa-magic' },
]

// ---------- 连接状态展示（#6 含历史状态与变更日志） ----------
const LATENCY_REFRESH_MS = 10 * 1000
const conn = computed(() => props.connStatus || store.connStatus || {})
const nowMs = ref(Date.now())
const slowNowMs = ref(Date.now())
const displayLatencyMs = ref(null)
let lastLatencySyncAt = 0
let statusClockTimer = null
let statusSlowTimer = null

function syncLatencyDisplay(force = false) {
  const raw = Number(conn.value.latencyMs)
  if (!Number.isFinite(raw) || raw < 0) return
  const now = Date.now()
  if (force || displayLatencyMs.value === null || now - lastLatencySyncAt >= LATENCY_REFRESH_MS) {
    displayLatencyMs.value = raw
    lastLatencySyncAt = now
  }
}

watch(
  () => conn.value.latencyMs,
  () => {
    if (displayLatencyMs.value === null) syncLatencyDisplay(true)
  },
  { immediate: true }
)

watch(
  () => conn.value.state,
  () => {
    slowNowMs.value = Date.now()
  }
)

onMounted(() => {
  syncLatencyDisplay(true)
  statusClockTimer = setInterval(() => {
    nowMs.value = Date.now()
  }, 1000)
  statusSlowTimer = setInterval(() => {
    slowNowMs.value = Date.now()
    syncLatencyDisplay(true)
  }, LATENCY_REFRESH_MS)
})

onBeforeUnmount(() => {
  if (statusClockTimer) {
    clearInterval(statusClockTimer)
    statusClockTimer = null
  }
  if (statusSlowTimer) {
    clearInterval(statusSlowTimer)
    statusSlowTimer = null
  }
})

const connSummary = computed(() => {
  if (!isLoggedIn.value) {
    return { tone: 'neutral', headline: '游客模式（未登录消息同步）' }
  }
  const st = conn.value.state
  if (st === 'ok') return { tone: 'success', headline: '所有服务运行正常' }
  if (st === 'connecting') return { tone: 'brand', headline: '正在建立连接...' }
  if (st === 'reconnecting') return { tone: 'warning', headline: '连接波动，正在尝试重连' }
  if (st === 'rejected') return { tone: 'danger', headline: '会话已失效或请求被拒绝' }
  if (st === 'offline' || conn.value.online === false || store.online === false) {
    return { tone: 'danger', headline: '网络连接已断开' }
  }
  if (store.netError) return { tone: 'warning', headline: '服务器响应异常' }
  return { tone: 'success', headline: '连接就绪' }
})

const sessionTile = computed(() => {
  if (!isLoggedIn.value) return { tone: 'neutral', text: '未登录' }
  if (conn.value.sessionValid === true) return { tone: 'success', text: '有效' }
  if (conn.value.sessionValid === false) return { tone: 'danger', text: '已失效' }
  return { tone: 'neutral', text: '待确认' }
})

const serverTile = computed(() => {
  if (conn.value.online === false || store.online === false) return { tone: 'danger', text: '网络离线' }
  if (conn.value.apiReachable === true) return { tone: 'success', text: '可达' }
  if (conn.value.apiReachable === false) return { tone: 'danger', text: '不可达' }
  return { tone: 'neutral', text: store.online ? '在线' : '离线' }
})

const latencyText = computed(() => {
  const ms = Number(displayLatencyMs.value)
  if (!Number.isFinite(ms) || ms < 0) return '—'
  return `${Math.round(ms)} ms`
})

function normalizeTsMs(raw) {
  const n = Number(raw) || 0
  if (!n) return 0
  return n < 1e12 ? n * 1000 : n
}

const lastSyncText = computed(() => {
  const ts = Math.max(normalizeTsMs(conn.value.lastSyncAt), normalizeTsMs(conn.value.lastInfoAt))
  if (!ts) return '尚未同步'
  const d = new Date(ts)
  const pad = (x) => String(x).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  const diffSec = Math.max(0, Math.floor((nowMs.value - ts) / 1000))
  if (diffSec < 10) return `${hm} · 刚刚`
  if (diffSec < 60) return `${hm} · ${diffSec}s 前`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${hm} · ${diffMin} 分钟前`
  return hm
})

const cooldownText = computed(() => {
  const until = normalizeTsMs(conn.value.retryCooldownUntil)
  if (!until || until <= nowMs.value) return ''
  const leftSec = Math.ceil((until - nowMs.value) / 1000)
  const m = Math.floor(leftSec / 60)
  const s = leftSec % 60
  const span = m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`
  return `静默重试冷却中（剩余 ${span}），点击「立即重连 / 刷新」可跳过等待`
})

const STATUS_HOURS = 24
function formatClockTime(rawTs) {
  const ts = normalizeTsMs(rawTs)
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (x) => String(x).padStart(2, '0')
  const now = new Date(nowMs.value)
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  return sameDay ? hm : `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
}

function formatHourRange(hourTs) {
  const d0 = new Date(hourTs)
  const d1 = new Date(hourTs + 3600 * 1000)
  const pad = (x) => String(x).padStart(2, '0')
  return `${pad(d0.getMonth() + 1)}-${pad(d0.getDate())} ${pad(d0.getHours())}:00–${pad(d1.getHours())}:00`
}

function formatDurationShort(ms) {
  const sec = Math.max(0, Math.round(ms / 1000))
  if (sec < 60) return `${sec} 秒`
  const min = Math.floor(sec / 60)
  const remSec = sec % 60
  if (min < 60) return remSec > 0 ? `${min} 分 ${remSec} 秒` : `${min} 分钟`
  const h = Math.floor(min / 60)
  const remMin = min % 60
  return remMin > 0 ? `${h} 小时 ${remMin} 分` : `${h} 小时`
}

function stateToneAndLabel(st) {
  if (st === 'ok') return { tone: 'success', label: '正常' }
  if (st === 'connecting') return { tone: 'brand', label: '连接中' }
  if (st === 'reconnecting') return { tone: 'warning', label: '重连中' }
  if (st === 'rejected') return { tone: 'danger', label: '会话拒绝' }
  if (st === 'offline') return { tone: 'danger', label: '离线' }
  return { tone: 'neutral', label: '未记录' }
}

const statusHourlySlots = computed(() => {
  const buckets = getConnHourlySnapshot(STATUS_HOURS, slowNowMs.value)
  return buckets.map((b) => {
    const range = formatHourRange(b.hourTs)
    if (b.totalMs <= 0) {
      return {
        hourTs: b.hourTs,
        tone: 'empty',
        tooltip: `${range} · 无运行记录`,
      }
    }
    const pct = b.uptimePct ?? 0
    const pctText = pct >= 99.95 ? '100%' : `${pct.toFixed(1)}%`
    let tone = 'success'
    let gradeClass = ''
    if (pct >= 99.95) {
      tone = 'success'
    } else if (pct >= 80) {
      tone = 'success'
      gradeClass = pct >= 90 ? 'is-green-1' : 'is-green-2'
    } else {
      tone = 'danger'
      // 0–80% 按每 10% 分 8 档：70–80% 为很浅红 (is-red-1) → 0–10% 为深红 (is-red-8)
      const redTier = Math.min(8, Math.max(1, 8 - Math.floor(Math.max(0, pct) / 10)))
      gradeClass = `is-red-${redTier}`
    }

    const parts = [`正常 ${formatDurationShort(b.okMs)}`]
    if (b.degradedMs >= 1000) parts.push(`波动 ${formatDurationShort(b.degradedMs)}`)
    if (b.downMs >= 1000) parts.push(`断线 ${formatDurationShort(b.downMs)}`)
    const lat = b.avgLatencyMs != null ? ` · 均延 ${b.avgLatencyMs} ms` : ''
    return {
      hourTs: b.hourTs,
      tone,
      gradeClass,
      tooltip: `${range} · 可用率 ${pctText}（${parts.join(' / ')}）${lat}`,
    }
  })
})

const hoveredHourTs = ref(null)
const hoveredSlotIdx = ref(-1)

function onHoverSlot(hourTs, idx) {
  hoveredHourTs.value = hourTs
  hoveredSlotIdx.value = idx
}

function onBlurSlot(hourTs) {
  if (hoveredHourTs.value === hourTs) clearHoveredSlot()
}

function clearHoveredSlot() {
  hoveredHourTs.value = null
  hoveredSlotIdx.value = -1
}

const hoveredSlotInfo = computed(() => {
  if (hoveredHourTs.value == null) return null
  return statusHourlySlots.value.find((s) => s.hourTs === hoveredHourTs.value) || null
})

const hoveredSlotLeft = computed(() => {
  const idx = hoveredSlotIdx.value
  if (idx < 0) return '50%'
  return `${((idx + 0.5) / STATUS_HOURS) * 100}%`
})

const hoveredSlotAlignClass = computed(() => {
  const idx = hoveredSlotIdx.value
  if (idx >= 0 && idx <= 4) return 'is-align-left'
  if (idx >= STATUS_HOURS - 5) return 'is-align-right'
  return ''
})

const statusUptimeSummary = computed(() => {
  const buckets = getConnHourlySnapshot(STATUS_HOURS, slowNowMs.value)
  let okMs = 0
  let totalMs = 0
  for (const b of buckets) {
    okMs += b.okMs
    totalMs += b.totalMs
  }
  if (totalMs <= 0) return isLoggedIn.value ? '刚开始统计…' : '未登录'
  const pct = Math.min(100, (okMs / totalMs) * 100)
  const pctText = pct >= 99.95 ? '100%' : `${pct.toFixed(1)}%`
  return `可用率 ${pctText} · 已监测 ${formatDurationShort(totalMs)}`
})

const statusAxisStart = computed(() => {
  const buckets = getConnHourlySnapshot(STATUS_HOURS, slowNowMs.value)
  if (!buckets.length) return '24 小时前'
  const d = new Date(buckets[0].hourTs)
  const pad = (x) => String(x).padStart(2, '0')
  return `${pad(d.getHours())}:00`
})

const statusRecentEvents = computed(() => {
  const events = Array.isArray(conn.value.events) ? conn.value.events : []
  return events.slice(0, 6).map((evt) => {
    const info = stateToneAndLabel(evt.state)
    return {
      ts: evt.ts,
      tone: info.tone,
      timeText: formatClockTime(evt.ts),
      title: evt.title || info.label,
      detail: evt.detail || '',
    }
  })
})

const reconnectBusy = ref(false)
function onReconnectClick() {
  if (reconnectBusy.value || !isLoggedIn.value) return
  reconnectBusy.value = true
  emit('reconnect')
  setTimeout(() => {
    reconnectBusy.value = false
    slowNowMs.value = Date.now()
    syncLatencyDisplay(true)
  }, 800)
}

const currentTheme = computed(() => props.setting?.theme || 'default')
const currentThemeLabel = computed(() => {
  if (currentTheme.value === 'custom') return '自定义（Custom）'
  return THEMES.find((t) => t.value === currentTheme.value)?.label || '雾蓝（Default）'
})
const currentThemeColor = computed(() => {
  if (currentTheme.value === 'custom') return 'var(--brand-fill)'
  return THEMES.find((t) => t.value === currentTheme.value)?.color || 'var(--brand-fill)'
})

const apiUrlValue = computed(() =>
  (props.setting?.apiUrl || 'https://jx.7fa4.cn').replace(/^http:\/\//, 'https://')
)
const effectValue = computed(() => props.setting?.effectLevel || 'fancy')

function selectApiUrl(value) {
  emit('settingChange', { apiUrl: value })
}

function selectEffect(value) {
  emit('settingChange', { effectLevel: value })
}

function onSettingChange(key, value) {
  emit('settingChange', { [key]: value })
}

function onPollChange(val) {
  emit('settingChange', { pollInterval: Number(val) })
}

function onFontSizeChange(val) {
  const size = Number(val)
  emit('settingChange', { fontSize: size })
  applyFontSize(size)
}

function formatPoll(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

function onKeepLoginChange(checked) {
  if (!checked) emit('settingChange', { keepLogin: false, loginUsername: '', loginPassword: '' })
}

// ---------- 通知与提醒 ----------

// 提示音/测试通知由 utils/notify.js 提供；helper 内部已负责 toast 与播放，面板只负责触发。
const testNotifBusy = ref(false)
async function onSendTestNotification() {
  if (testNotifBusy.value) return
  testNotifBusy.value = true
  try {
    await sendTestNotification(props.setting || {})
  } catch {
    // helper 自己会反馈结果，这里只兜底，避免未处理的 Promise 拒绝
  } finally {
    testNotifBusy.value = false
  }
}

function onSendSiteTestNotice() {
  sendTestSiteNotice()
}

// 拖动滑块会连发 update，节流到 200ms 一次：既不叠成噪音，又能边拖边听到音量
let lastPreviewAt = 0
function onNotifVolumeChange(val) {
  const volume = Number(val) || 0
  emit('settingChange', { notifSoundVolume: volume })
  const now = Date.now()
  if (now - lastPreviewAt < 200) return
  lastPreviewAt = now
  // 试听与 notifSound 开关无关：用户此刻就想听见改完的音量
  previewNotificationSound(volume)
}
</script>

<style src="../../css/components/theme-modal.css"></style>
<style scoped src="../../css/components/settings-panel.css"></style>
