import React from 'react'
import { ListPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { isPairedWebClientWindow } from '@/lib/desktop-window-chrome'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { CustomSectionDialogHost } from './CustomSectionDialogHost'
import { useShownCustomSidebarSections } from './use-shown-custom-sidebar-sections'

/**
 * Fork (richarddaros/orca): the "New section" header button and its dialogs.
 * The slot keeps its width in Activity view so the other header controls never shift.
 */
export function CustomSectionHeaderSlot({
  agentsViewActive,
  preserveWorkspaceBoardOpen
}: {
  agentsViewActive: boolean
  preserveWorkspaceBoardOpen: boolean
}): React.JSX.Element | null {
  const setDialog = useAppStore((s) => s.setCustomSectionDialog)
  const ready = useShownCustomSidebarSections() !== null
  if (isPairedWebClientWindow()) {
    return null
  }
  const label = translate('customSections.newSection', 'New section')
  return (
    <div className="flex size-6 shrink-0 items-center">
      {agentsViewActive || !ready ? null : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex text-muted-foreground">
              <Button
                variant="ghost"
                size="icon-xs"
                type="button"
                aria-label={label}
                data-workspace-board-preserve-open={preserveWorkspaceBoardOpen ? '' : undefined}
                onClick={() => setDialog({ mode: 'create' })}
              >
                <ListPlus className="size-3.5" strokeWidth={2.25} />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {label}
          </TooltipContent>
        </Tooltip>
      )}
      <CustomSectionDialogHost />
    </div>
  )
}
