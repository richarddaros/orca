import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  classifyConflicts,
  finishMerge,
  forkTestFiles,
  formatUpstreamChanges,
  main,
  parseForkSyncArgs,
  patchHash,
  readPatchedDependencies,
  reapplyForkBlock,
  refreshLockfileHashes,
  rehashLockfile,
  resolveAutomatically,
  syncBranchName,
  toolchainProblems,
  unmergedPaths
} from './fork-sync.mjs'
import { gitOk, runGit, useGitSandbox, writeTree } from './fork-sync-git-fixture.mjs'

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

  it('lists upstream commits without linking their PR numbers to fork issues', () => {
    expect(formatUpstreamChanges('abc123 fix(pty): close fds (#27769)\n\n')).toEqual([
      '- `abc123` fix(pty): close fds (`#27769`)'
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

describe('fork sync against real git', () => {
  const PATCH = 'config/patches/node-pty@1.1.0.patch'
  const BASE_PATCH = 'one\ntwo\nthree\nfour\nfive\n'
  const BLOCK = `${START}\n\n# Fork\n\n${END}\n`
  const { sandbox } = useGitSandbox()

  function lockWith(hash, extra = '') {
    return `lockfileVersion: '9.0'\n\npatchedDependencies:\n  node-pty@1.1.0: ${hash}\n\nimporters:\n  .:\n    dependencies:\n      node-pty:\n        version: 1.1.0(patch_hash=${hash})\n${extra}`
  }

  // Builds base → fork and base → upstream histories, then starts the fork's merge of upstream.
  function mergeInProgress(box, { fork, upstream }) {
    const repo = join(box.dir, 'repo')
    gitOk(box, box.dir, 'init', '-q', repo)
    writeTree(repo, {
      'pnpm-workspace.yaml': `patchedDependencies:\n  node-pty@1.1.0: ${PATCH}\n`,
      [PATCH]: BASE_PATCH,
      'pnpm-lock.yaml': lockWith(patchHash(BASE_PATCH)),
      'AGENTS.md': '# Upstream\n',
      'package.json': '{ "name": "fixture" }\n',
      'src/app.ts': 'export const value = 1\n'
    })
    gitOk(box, repo, 'add', '-A')
    gitOk(box, repo, 'commit', '-q', '-m', 'base')
    gitOk(box, repo, 'switch', '-q', '-c', 'chore/sync-upstream-20261023')
    writeTree(repo, fork)
    gitOk(box, repo, 'add', '-A')
    gitOk(box, repo, 'commit', '-q', '-m', 'fork')
    gitOk(box, repo, 'switch', '-q', 'main')
    writeTree(repo, upstream)
    gitOk(box, repo, 'add', '-A')
    gitOk(box, repo, 'commit', '-q', '-m', 'upstream')
    gitOk(box, repo, 'switch', '-q', 'chore/sync-upstream-20261023')
    expect(runGit(box, repo, 'merge', '--no-ff', '--no-commit', 'main').status).not.toBe(0)
    return repo
  }

  it('resolves the lockfile and AGENTS.md conflicts of an upstream merge', () => {
    const box = sandbox()
    const forkPatch = BASE_PATCH.replace('five', 'five fork')
    const upstreamPatch = BASE_PATCH.replace('one', 'one upstream')
    const repo = mergeInProgress(box, {
      fork: {
        [PATCH]: forkPatch,
        'pnpm-lock.yaml': lockWith(patchHash(forkPatch)),
        'AGENTS.md': `# Upstream\n\n${BLOCK}`
      },
      upstream: {
        [PATCH]: upstreamPatch,
        'pnpm-lock.yaml': lockWith(patchHash(upstreamPatch), '  upstream-only: {}\n'),
        'AGENTS.md': '# Upstream v2\n'
      }
    })
    expect(unmergedPaths(repo).toSorted()).toEqual(['AGENTS.md', 'pnpm-lock.yaml'])

    expect(resolveAutomatically(repo, classifyConflicts(unmergedPaths(repo)))).toEqual([])

    expect(unmergedPaths(repo)).toEqual([])
    const mergedPatch = readFileSync(join(repo, PATCH), 'utf8')
    expect(mergedPatch).toBe('one upstream\ntwo\nthree\nfour\nfive fork\n')
    expect(readFileSync(join(repo, 'pnpm-lock.yaml'), 'utf8')).toBe(
      lockWith(patchHash(mergedPatch), '  upstream-only: {}\n')
    )
    expect(readFileSync(join(repo, 'AGENTS.md'), 'utf8')).toBe(`# Upstream v2\n\n${BLOCK}`)
  })

  it('stops and lists a code conflict before installing anything', () => {
    const box = sandbox()
    const repo = mergeInProgress(box, {
      fork: { 'src/app.ts': 'export const value = 2\n' },
      upstream: { 'src/app.ts': 'export const value = 3\n' }
    })

    expect(finishMerge(repo)).toEqual(['src/app.ts'])
    expect(gitOk(box, repo, 'rev-parse', '-q', '--verify', 'MERGE_HEAD')).not.toBe('')
  })

  it('rehashes the lockfile again once a conflicting patch is resolved by hand', () => {
    const box = sandbox()
    const forkPatch = BASE_PATCH.replace('three', 'three fork')
    const upstreamPatch = BASE_PATCH.replace('three', 'three upstream')
    const repo = mergeInProgress(box, {
      fork: { [PATCH]: forkPatch, 'pnpm-lock.yaml': lockWith(patchHash(forkPatch)) },
      upstream: { [PATCH]: upstreamPatch, 'pnpm-lock.yaml': lockWith(patchHash(upstreamPatch)) }
    })
    expect(resolveAutomatically(repo, classifyConflicts(unmergedPaths(repo)))).toEqual([PATCH])

    const resolved = BASE_PATCH.replace('three', 'three upstream and fork')
    writeTree(repo, { [PATCH]: resolved })
    gitOk(box, repo, 'add', '--', PATCH)

    expect(refreshLockfileHashes(repo)).toBe(true)
    expect(readFileSync(join(repo, 'pnpm-lock.yaml'), 'utf8')).toBe(lockWith(patchHash(resolved)))
    expect(unmergedPaths(repo)).toEqual([])
  })

  it('rehashes inside finishMerge before it installs and commits', () => {
    const box = sandbox()
    const forkPatch = BASE_PATCH.replace('three', 'three fork')
    const upstreamPatch = BASE_PATCH.replace('three', 'three upstream')
    const repo = mergeInProgress(box, {
      fork: { [PATCH]: forkPatch, 'pnpm-lock.yaml': lockWith(patchHash(forkPatch)) },
      upstream: { [PATCH]: upstreamPatch, 'pnpm-lock.yaml': lockWith(patchHash(upstreamPatch)) }
    })
    expect(finishMerge(repo)).toEqual([PATCH])
    const resolved = BASE_PATCH.replace('three', 'three upstream and fork')
    writeTree(repo, { [PATCH]: resolved })
    gitOk(box, repo, 'add', '--', PATCH)

    // The fixture has no npm_execpath, so the install step throws after the rehash.
    expect(() => finishMerge(repo)).toThrow('Run this through pnpm')
    expect(readFileSync(join(repo, 'pnpm-lock.yaml'), 'utf8')).toBe(lockWith(patchHash(resolved)))
  })

  it('exits 2 naming the files when --continue still finds conflicts', () => {
    const box = sandbox()
    const repo = mergeInProgress(box, {
      fork: { 'src/app.ts': 'export const value = 2\n' },
      upstream: { 'src/app.ts': 'export const value = 3\n' }
    })
    const errors = []
    vi.spyOn(console, 'error').mockImplementation((...parts) => errors.push(parts.join(' ')))
    const previous = process.exitCode
    try {
      main(['sync', '--continue'], repo)
      expect(process.exitCode).toBe(2)
    } finally {
      process.exitCode = previous
    }
    expect(errors.join('\n')).toContain('  src/app.ts')
  })

  it('leaves an AGENTS.md that the fork deleted for a person', () => {
    const box = sandbox()
    const repo = mergeInProgress(box, {
      fork: { 'AGENTS.md': null },
      upstream: { 'AGENTS.md': '# Upstream v2\n' }
    })

    expect(resolveAutomatically(repo, classifyConflicts(unmergedPaths(repo)))).toEqual([
      'AGENTS.md'
    ])
  })

  it('leaves an AGENTS.md that upstream deleted for a person', () => {
    const box = sandbox()
    const repo = mergeInProgress(box, {
      fork: { 'AGENTS.md': `# Upstream\n\n${BLOCK}` },
      upstream: { 'AGENTS.md': null }
    })

    expect(resolveAutomatically(repo, classifyConflicts(unmergedPaths(repo)))).toEqual([
      'AGENTS.md'
    ])
  })

  it('refuses --continue outside a sync branch before touching anything', () => {
    const box = sandbox()
    const repo = join(box.dir, 'line')
    gitOk(box, box.dir, 'init', '-q', '-b', 'feat/agent-hub-poc', repo)
    writeTree(repo, { 'a.txt': 'one\n' })
    gitOk(box, repo, 'add', '-A')
    gitOk(box, repo, 'commit', '-q', '-m', 'one')
    const head = gitOk(box, repo, 'rev-parse', 'HEAD')

    expect(() => main(['sync', '--continue'], repo)).toThrow('--continue runs inside')
    expect(gitOk(box, repo, 'rev-parse', 'HEAD')).toBe(head)
  })
})
