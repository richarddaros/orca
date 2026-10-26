import { translate } from '@/i18n/i18n'
import {
  PINNED_CUSTOM_SECTION_ID,
  type CustomSidebarSection
} from '../../../../../shared/custom-sidebar-sections/custom-sidebar-sections-state'

/** Pinned keeps the app's own "Pinned" label until the user names it. */
export function getCustomSectionDisplayName(section: CustomSidebarSection): string {
  if (section.name) {
    return section.name
  }
  return section.id === PINNED_CUSTOM_SECTION_ID
    ? translate('auto.components.sidebar.worktree.list.groups.4aeefc5996', 'Pinned')
    : ''
}
