import { defineMethod } from '../core'
import { projectProjectSectionsCustomSections } from '../mobile-custom-sections'
import { MOBILE_PROJECT_SECTIONS_METHOD } from '../../../../shared/mobile-project-sections-contract'
import { ORCA_SIDEBAR_INPUTS_IS_MAIN } from '../../../../shared/sidebar-inputs-switch'
import { readMobileProjectSections } from '../../mobile-project-sections-snapshot'
import { requireSwitchedOn } from '../../sidebar-inputs/require-switched-on'
import { readSidebarProjectCatalog } from '../../sidebar-inputs/sidebar-project-catalog'

export const MOBILE_PROJECT_SECTIONS_METHODS = [
  defineMethod({
    name: MOBILE_PROJECT_SECTIONS_METHOD,
    permission: 'workspace',
    params: null,
    // Switch point: for a page that predates the feed's projectCatalog domain, main's own catalog.
    // Fork: this host's own phone also gets a stand-in repo per user sidebar section (mobile-custom-sections.ts).
    handler: (_params, context) =>
      projectProjectSectionsCustomSections(
        ORCA_SIDEBAR_INPUTS_IS_MAIN
          ? {
              catalog: readSidebarProjectCatalog(
                context.runtime.requireStore(),
                requireSwitchedOn(context.runtime.pairedServerRows).catalogs()
              )
            }
          : readMobileProjectSections(),
        context
      )
  })
]
