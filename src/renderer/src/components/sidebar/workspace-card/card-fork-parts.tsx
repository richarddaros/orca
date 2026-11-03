import type { WorktreeCardController } from '../use-worktree-card-controller'
import { WorktreeCardFolderLabel } from '../worktree-card-folder-label'
import { cardElement } from './card-template-compiler'

type Card = WorktreeCardController
const part = cardElement<Card>

/** Fork (richarddaros/orca): card elements the upstream template does not name. */
export const CARD_FORK_PARTS = {
  // Why shrink-0 beside the title: the title truncates first; a folder squeezed to its icon would spill over the title.
  WorktreeFolder: part(['besideTitle'], (props, _children, { worktree }) => (
    <WorktreeCardFolderLabel
      path={worktree.path}
      className={props.besideTitle === true ? 'max-w-24 shrink-0' : undefined}
    />
  ))
}
