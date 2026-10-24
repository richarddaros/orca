import { describe, expect, it } from 'vitest'
import {
  classifyConflicts,
  forkTestFiles,
  parseForkSyncArgs,
  patchHash,
  readPatchedDependencies,
  reapplyForkBlock,
  rehashLockfile,
  syncBranchName,
  toolchainProblems
} from './fork-sync.mjs'

const START = '<!-- fork:richarddaros/orca:start -->'
const END = '<!-- fork:richarddaros/orca:end -->'

describe('fork sync', () => {
  it('accepts only the documented commands and flags', () => {
    expect(parseForkSyncArgs(['sync', '--continue', '--merge'])).toEqual({
      command: 'sync',
      merge: true,
      resume: true
    })
    expect(parseForkSyncArgs(['status'])).toEqual({
      command: 'status',
      merge: false,
      resume: false
    })
    expect(() => parseForkSyncArgs(['update-local', '--merge'])).toThrow('unknown flag --merge')
    expect(() => parseForkSyncArgs(['pull'])).toThrow('usage')
  })

  it('names the sync branch after the local day and skips names in use', () => {
    const day = new Date(2026, 9, 3, 23, 30)
    expect(syncBranchName(day, new Set())).toBe('chore/sync-upstream-20261003')
    expect(
      syncBranchName(
        day,
        new Set(['chore/sync-upstream-20261003', 'chore/sync-upstream-20261003-2'])
      )
    ).toBe('chore/sync-upstream-20261003-3')
  })

  it('moves only the hashes of patches that changed, keeping upstream entries', () => {
    const lock = [
      'patchedDependencies:',
      "  '@xterm/xterm@6.1.0': aaa",
      '  node-pty@1.1.0: bbb',
      '',
      'importers:',
      '      node-pty:',
      '        version: 1.1.0(patch_hash=bbb)',
      '  node-pty@1.1.0(patch_hash=bbb):'
    ].join('\n')
    const rehashed = rehashLockfile(
      lock,
      new Map([
        ['@xterm/xterm@6.1.0', 'aaa'],
        ['node-pty@1.1.0', 'ccc']
      ])
    )
    expect(rehashed).not.toContain('bbb')
    expect(rehashed.match(/ccc/g)).toHaveLength(3)
    expect(rehashed).toContain("'@xterm/xterm@6.1.0': aaa")
  })

  it('reads patch files from the workspace map and hashes them like pnpm', () => {
    const workspace = [
      'packages:',
      '  - src/packages/*',
      'patchedDependencies:',
      '  # comment',
      "  '@xterm/addon-image@0.10.0': config/patches/@xterm__addon-image@0.10.0.patch",
      '  node-pty@1.1.0: config/patches/node-pty@1.1.0.patch',
      'onlyBuiltDependencies:',
      '  - electron'
    ].join('\n')
    expect([...readPatchedDependencies(workspace)]).toEqual([
      ['@xterm/addon-image@0.10.0', 'config/patches/@xterm__addon-image@0.10.0.patch'],
      ['node-pty@1.1.0', 'config/patches/node-pty@1.1.0.patch']
    ])
    expect(patchHash('a\r\nb\n')).toBe(patchHash('a\nb\n'))
  })

  it('re-applies the marked fork block over the upstream file', () => {
    const block = `${START}\n# Fork\n- rule\n${END}\n`
    const ours = `# Old upstream\n\n${block}`
    const theirs = '# New upstream\n\nText\n\n\n'
    expect(reapplyForkBlock(theirs, ours)).toBe(`# New upstream\n\nText\n\n${block}`)
    expect(reapplyForkBlock(`${theirs}${block}`, ours)).toBe(`# New upstream\n\nText\n\n${block}`)
    expect(reapplyForkBlock(theirs, '# no block\n')).toBeUndefined()
  })

  it('leaves only code conflicts for a person to resolve', () => {
    expect(
      classifyConflicts(['pnpm-lock.yaml', 'AGENTS.md', 'src/renderer/src/web/main.tsx'])
    ).toEqual({
      lockfile: true,
      forkBlocks: ['AGENTS.md'],
      manual: ['src/renderer/src/web/main.tsx']
    })
  })

  it('keeps the fork vitest files under src as sync gates', () => {
    expect(
      forkTestFiles([
        'config/scripts/fork-sync.test.mjs',
        'src/main/daemon/node-pty-fd-leak.test.ts',
        'src/renderer/src/lib/react-dev-performance-measure-trim.test.ts',
        'src/renderer/src/main.tsx'
      ])
    ).toEqual([
      'src/main/daemon/node-pty-fd-leak.test.ts',
      'src/renderer/src/lib/react-dev-performance-measure-trim.test.ts'
    ])
  })

  it('reports a run outside the pinned Node and pnpm', () => {
    const packageJson = { engines: { node: '24' }, packageManager: 'pnpm@12.14.0+sha512.abc' }
    expect(
      toolchainProblems({
        nodeVersion: '24.20.0',
        userAgent: 'pnpm/12.14.0 npm/? node/v24.20.0 linux x64',
        packageJson
      })
    ).toEqual([])
    const problems = toolchainProblems({
      nodeVersion: '22.21.1',
      userAgent: 'pnpm/12.8.1 npm/? node/v22.21.1 linux x64',
      packageJson
    })
    expect(problems).toHaveLength(2)
    expect(problems[1]).toContain('corepack pnpm')
  })
})
