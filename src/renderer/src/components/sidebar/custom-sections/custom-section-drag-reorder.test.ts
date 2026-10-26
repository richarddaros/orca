import { describe, expect, it } from 'vitest'
import { resolveShownSectionKeys } from './custom-section-drag-reorder'

describe('resolveShownSectionKeys', () => {
  it("prefers the section's own member when a twin on another host is shown elsewhere", () => {
    const shown = [
      { id: 'a', executionHostId: 'local' as const },
      { id: 'b', executionHostId: 'local' as const },
      { id: 'a', executionHostId: 'ssh:box' as const }
    ]
    expect(resolveShownSectionKeys(['b', 'a'], shown, new Set(['ssh:box|a', 'local|b']))).toEqual([
      'local|b',
      'ssh:box|a'
    ])
  })

  it('maps each repeated id to a different shown row and drops ids that are not shown', () => {
    const shown = [
      { id: 'a', executionHostId: 'local' as const },
      { id: 'a', executionHostId: 'ssh:box' as const }
    ]
    expect(resolveShownSectionKeys(['a', 'gone', 'a'], shown, new Set())).toEqual([
      'local|a',
      'ssh:box|a'
    ])
  })
})
