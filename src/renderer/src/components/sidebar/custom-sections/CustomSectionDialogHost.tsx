import React, { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { PINNED_CUSTOM_SECTION_ID } from '../../../../../shared/custom-sidebar-sections/custom-sidebar-sections-state'
import { ProjectGroupNameDialog } from '../ProjectGroupNameDialog'
import { getCustomSectionDisplayName } from './custom-section-display-name'

/** Fork (richarddaros/orca): the create, rename and delete dialogs for user sidebar sections. */
export function CustomSectionDialogHost(): React.JSX.Element {
  const dialog = useAppStore((s) => s.customSectionDialog)
  const setDialog = useAppStore((s) => s.setCustomSectionDialog)
  const createSection = useAppStore((s) => s.createCustomSection)
  const renameSection = useAppStore((s) => s.renameCustomSection)
  const deleteSection = useAppStore((s) => s.deleteCustomSection)
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setDialog(null)
      }
    },
    [setDialog]
  )
  const handleSubmitName = useCallback(
    async (name: string) => {
      if (dialog?.mode === 'create') {
        await createSection(name, dialog.firstMember)
      } else if (dialog?.mode === 'rename') {
        // Why: typing Pinned's default label back stores '' so it follows the app language again.
        const isPinnedDefault =
          dialog.sectionId === PINNED_CUSTOM_SECTION_ID &&
          name === getCustomSectionDisplayName({ id: dialog.sectionId, name: '', members: [] })
        await renameSection(dialog.sectionId, isPinnedDefault ? '' : name)
      }
    },
    [createSection, dialog, renameSection]
  )
  const isRename = dialog?.mode === 'rename'

  return (
    <>
      <ProjectGroupNameDialog
        open={dialog?.mode === 'create' || isRename}
        title={
          isRename
            ? translate('customSections.renameTitle', 'Rename section')
            : translate('customSections.newSection', 'New section')
        }
        description={translate(
          'customSections.nameDescription',
          'Workspaces stay in the order you choose; agent activity never reorders a section.'
        )}
        initialName={isRename ? dialog.currentName : ''}
        nameLabel={translate('customSections.nameLabel', 'Section name')}
        confirmLabel={
          isRename
            ? translate('customSections.save', 'Save')
            : translate('customSections.create', 'Create')
        }
        onOpenChange={handleOpenChange}
        onSubmit={handleSubmitName}
      />
      <Dialog open={dialog?.mode === 'delete'} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {translate('customSections.deleteTitle', 'Delete section "{{name}}"?', {
                name: dialog?.mode === 'delete' ? dialog.name : ''
              })}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'customSections.deleteDescription',
                'Its workspaces return to the normal list. No workspace is deleted.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setDialog(null)}>
              {translate('customSections.cancel', 'Cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                if (dialog?.mode === 'delete') {
                  void deleteSection(dialog.sectionId)
                }
                setDialog(null)
              }}
            >
              {translate('customSections.delete', 'Delete section')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
