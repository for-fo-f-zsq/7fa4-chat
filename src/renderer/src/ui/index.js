// 原语统一出口：import { UiButton } from '@/ui'（或 app.use(Ui) 全局注册）
import UiAvatar from './UiAvatar/UiAvatar.vue'
import UiBadge from './UiBadge/UiBadge.vue'
import UiBanner from './UiBanner/UiBanner.vue'
import UiButton from './UiButton/UiButton.vue'
import UiCard from './UiCard/UiCard.vue'
import UiCheckbox from './UiCheckbox/UiCheckbox.vue'
import UiDropdown from './UiDropdown/UiDropdown.vue'
import UiEmptyState from './UiEmptyState/UiEmptyState.vue'
import UiIconButton from './UiIconButton/UiIconButton.vue'
import UiInput from './UiInput/UiInput.vue'
import UiMenu from './UiMenu/UiMenu.vue'
import UiModal from './UiModal/UiModal.vue'
import UiPopover from './UiPopover/UiPopover.vue'
import UiProgress from './UiProgress/UiProgress.vue'
import UiSearchInput from './UiSearchInput/UiSearchInput.vue'
import UiSegmented from './UiSegmented/UiSegmented.vue'
import UiSkeleton from './UiSkeleton/UiSkeleton.vue'
import UiSpinner from './UiSpinner/UiSpinner.vue'
import UiSwitch from './UiSwitch/UiSwitch.vue'
import UiTabs from './UiTabs/UiTabs.vue'
import UiTextarea from './UiTextarea/UiTextarea.vue'
import UiTooltip from './UiTooltip/UiTooltip.vue'

export {
  UiAvatar,
  UiBadge,
  UiBanner,
  UiButton,
  UiCard,
  UiCheckbox,
  UiDropdown,
  UiEmptyState,
  UiIconButton,
  UiInput,
  UiMenu,
  UiModal,
  UiPopover,
  UiProgress,
  UiSearchInput,
  UiSegmented,
  UiSkeleton,
  UiSpinner,
  UiSwitch,
  UiTabs,
  UiTextarea,
  UiTooltip,
}

const components = {
  UiAvatar,
  UiBadge,
  UiBanner,
  UiButton,
  UiCard,
  UiCheckbox,
  UiDropdown,
  UiEmptyState,
  UiIconButton,
  UiInput,
  UiMenu,
  UiModal,
  UiPopover,
  UiProgress,
  UiSearchInput,
  UiSegmented,
  UiSkeleton,
  UiSpinner,
  UiSwitch,
  UiTabs,
  UiTextarea,
  UiTooltip,
}

export const Ui = {
  install(app) {
    for (const [name, component] of Object.entries(components)) app.component(name, component)
  },
}

export default Ui
