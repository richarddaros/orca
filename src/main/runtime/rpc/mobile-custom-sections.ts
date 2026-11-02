/**
 * Fork-owned (richarddaros/orca): serves the desktop's user-named sidebar sections to this host's own phone.
 * The projection is `shared/custom-sidebar-sections/mobile-section-projection.ts`; this reads the stored
 * sections for the one client that may see them.
 */
import {
  projectCustomSectionsOntoCatalog,
  projectCustomSectionsOntoPs
} from '../../../shared/custom-sidebar-sections/mobile-section-projection'
import type { MobileProjectSectionsResult } from '../../../shared/mobile-project-sections-contract'
import type { RuntimeWorktreePsResult } from '../../../shared/runtime-worktree-contracts'
import type { RpcContext } from './core'
import { isHostOwnPhone } from './host-own-phone'

export type SectionsContext = Pick<RpcContext, 'clientKind' | 'pairedDeviceParentId'> & {
  runtime: {
    requireStore(): { getUI?: () => { customSidebarSections?: unknown } }
  }
}

/** Only this host's own phone sees the sections; delegated phones, paired desktops and web clients keep their own view. */
export function storedSectionsFor(context: SectionsContext): unknown {
  if (!isHostOwnPhone(context)) {
    return undefined
  }
  return context.runtime.requireStore().getUI?.().customSidebarSections
}

export function projectWorktreePsCustomSections<T extends RuntimeWorktreePsResult>(
  result: T,
  context: SectionsContext
): T {
  return projectCustomSectionsOntoPs(result, storedSectionsFor(context))
}

export function projectProjectSectionsCustomSections(
  result: MobileProjectSectionsResult,
  context: SectionsContext
): MobileProjectSectionsResult {
  return projectCustomSectionsOntoCatalog(result, storedSectionsFor(context))
}
