import React from 'react'
import { Folder } from 'lucide-react'
import { getDirectoryName } from './worktree-card-model'

/** Fork (richarddaros/orca): a git worktree card names its checkout folder under the title. */
export function WorktreeCardFolderLabel({ path }: { path: string }): React.JSX.Element {
  return (
    // Why shrink-3: flex weighs shrink by base width, so the folder gives up room faster than the branch but both truncate.
    <span
      className="flex min-w-0 shrink-3 items-center gap-1 text-2xs leading-none text-muted-foreground"
      title={path}
      data-worktree-card-folder=""
    >
      <Folder className="size-3 shrink-0" aria-hidden />
      <span className="min-w-0 truncate font-mono">{getDirectoryName(path)}</span>
    </span>
  )
}
