import React from 'react'
import { Folder } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getDirectoryName } from './worktree-card-model'

/** Fork (richarddaros/orca): a git worktree card names its checkout folder, under the title or beside it in the new card style. */
export function WorktreeCardFolderLabel({
  path,
  className
}: {
  path: string
  className?: string
}): React.JSX.Element {
  return (
    // Why shrink-3: flex weighs shrink by base width, so the folder gives up room faster than the branch but both truncate.
    <span
      className={cn(
        'flex min-w-0 shrink-3 items-center gap-1 text-2xs leading-none text-muted-foreground',
        className
      )}
      title={path}
      data-worktree-card-folder=""
    >
      {/* Why filled yellow: the owner spots the checkout name by its yellow folder among grey card text; the name stays muted.
          Why the status token: it already holds the theme pair (darker yellow on white, brighter on dark) and the design gate bans raw palette colors. */}
      <Folder className="size-3 shrink-0 fill-status-warning text-status-warning" aria-hidden />
      <span className="min-w-0 truncate font-mono">{getDirectoryName(path)}</span>
    </span>
  )
}
