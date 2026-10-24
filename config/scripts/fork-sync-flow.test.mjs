import { chmodSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { delimiter, join, sep } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { main, updateLocal } from './fork-sync.mjs'
import {
  gitOk,
  installFakePnpm,
  readLog,
  useGitSandbox,
  writeTree
} from './fork-sync-git-fixture.mjs'

describe('fork sync flows against real git', () => {
  const { sandbox } = useGitSandbox()

  describe('update-local', () => {
    function lineClone(box) {
      const origin = join(box.dir, 'origin.git')
      gitOk(box, box.dir, 'init', '-q', '--bare', origin)
      const upstream = join(box.dir, 'upstream')
      gitOk(box, box.dir, 'init', '-q', upstream)
      writeTree(upstream, { 'a.txt': 'one\n' })
      gitOk(box, upstream, 'add', '-A')
      gitOk(box, upstream, 'commit', '-q', '-m', 'one')
      gitOk(box, upstream, 'push', '-q', origin, 'HEAD:refs/heads/feat/agent-hub-poc')
      const local = join(box.dir, 'local')
      gitOk(box, box.dir, 'clone', '-q', '-b', 'feat/agent-hub-poc', origin, local)
      const advance = (text) => {
        writeTree(upstream, { 'a.txt': text })
        gitOk(box, upstream, 'commit', '-q', '-am', text.trim())
        gitOk(box, upstream, 'push', '-q', origin, 'HEAD:refs/heads/feat/agent-hub-poc')
      }
      return { local, advance }
    }

    it('reports a checkout that already matches the line', () => {
      const { local } = lineClone(sandbox())
      expect(updateLocal(local)).toBeUndefined()
    })

    it('refuses tracked changes', () => {
      const box = sandbox()
      const { local, advance } = lineClone(box)
      advance('two\n')
      writeTree(local, { 'a.txt': 'edited\n' })
      const head = gitOk(box, local, 'rev-parse', 'HEAD')

      expect(() => updateLocal(local)).toThrow('Tracked changes block the update')
      expect(gitOk(box, local, 'rev-parse', 'HEAD')).toBe(head)
    })

    it('refuses a checkout on another branch', () => {
      const box = sandbox()
      const { local } = lineClone(box)
      gitOk(box, local, 'switch', '-q', '-c', 'other')

      expect(() => updateLocal(local)).toThrow('update-local runs on feat/agent-hub-poc')
    })

    it('reinstalls with the frozen lockfile after the fast-forward', () => {
      const box = sandbox()
      const { local, advance } = lineClone(box)
      advance('two\n')
      const pnpmCalls = installFakePnpm(box)
      vi.spyOn(console, 'log').mockImplementation(() => {})

      updateLocal(local)

      expect(pnpmCalls()).toEqual([['install', '--frozen-lockfile']])
      expect(gitOk(box, local, 'rev-parse', 'HEAD')).toBe(
        gitOk(box, local, 'rev-parse', 'origin/feat/agent-hub-poc')
      )
    })

    it('only fast-forwards, then reinstalls', () => {
      const box = sandbox()
      const { local, advance } = lineClone(box)
      advance('two\n')

      // The pnpm step throws here because the fixture runs without npm_execpath.
      expect(() => updateLocal(local)).toThrow('Run this through pnpm')
      expect(gitOk(box, local, 'rev-parse', 'HEAD')).toBe(
        gitOk(box, local, 'rev-parse', 'origin/feat/agent-hub-poc')
      )

      gitOk(box, local, 'commit', '-q', '--allow-empty', '-m', 'local only')
      advance('three\n')
      const head = gitOk(box, local, 'rev-parse', 'HEAD')
      expect(() => updateLocal(local)).toThrow()
      expect(gitOk(box, local, 'rev-parse', 'HEAD')).toBe(head)
    })
  })

  // POSIX only: the fake gh is a shebang script.
  describe.skipIf(process.platform === 'win32')('sync end to end with fake gh and pnpm', () => {
    const TOKEN = 'fixture-sentinel-not-a-token'

    function forkNetwork(box) {
      const origin = join(box.dir, 'origin.git')
      gitOk(box, box.dir, 'init', '-q', '--bare', origin)
      const upstream = join(box.dir, 'upstream')
      gitOk(box, box.dir, 'init', '-q', upstream)
      const lines = ['one', 'two', 'three', 'four', 'five', 'six'].join('\n')
      writeTree(upstream, {
        'package.json': '{ "name": "fixture" }\n',
        'pnpm-workspace.yaml': 'packages: []\n',
        'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
        'src/shared.ts': `${lines}\n`
      })
      gitOk(box, upstream, 'add', '-A')
      gitOk(box, upstream, 'commit', '-q', '-m', 'base')
      gitOk(
        box,
        upstream,
        'push',
        '-q',
        origin,
        'HEAD:refs/heads/main',
        'HEAD:refs/heads/feat/agent-hub-poc'
      )
      const local = join(box.dir, 'local')
      gitOk(box, box.dir, 'clone', '-q', '-b', 'feat/agent-hub-poc', origin, local)
      writeTree(local, { 'src/shared.ts': `${lines.replace('one', 'one fork')}\n` })
      gitOk(box, local, 'commit', '-q', '-am', 'fork change')
      gitOk(box, local, 'push', '-q', 'origin', 'feat/agent-hub-poc')
      writeTree(upstream, { 'src/other.ts': 'export {}\n' })
      gitOk(box, upstream, 'add', '-A')
      gitOk(box, upstream, 'commit', '-q', '-m', 'upstream elsewhere')
      writeTree(upstream, { 'src/shared.ts': `${lines.replace('six', 'six upstream')}\n` })
      gitOk(box, upstream, 'commit', '-q', '-am', 'upstream touches the fork file (#123)')

      const bin = join(box.dir, 'bin')
      mkdirSync(bin)
      const ghLog = join(box.dir, 'gh.jsonl')
      const prFile = join(box.dir, 'pr-url')
      writeFileSync(
        join(bin, 'gh'),
        `#!${process.execPath}
const { appendFileSync, existsSync, readFileSync, writeFileSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
const args = process.argv.slice(2)
const stdin = args.includes('--body-file') ? readFileSync(0, 'utf8') : ''
appendFileSync(${JSON.stringify(ghLog)}, JSON.stringify({ args, token: process.env.GH_TOKEN ?? null, stdin }) + '\\n')
const [group, action] = args
if (group === 'auth' && action === 'token') process.stdout.write(${JSON.stringify(TOKEN)} + '\\n')
else if (group === 'repo' && action === 'sync') process.exit(spawnSync('git', ['push', '-q', ${JSON.stringify(origin)}, 'HEAD:refs/heads/main'], { cwd: ${JSON.stringify(upstream)}, stdio: 'inherit' }).status ?? 1)
else if (group === 'pr' && action === 'list') process.stdout.write(existsSync(${JSON.stringify(prFile)}) ? readFileSync(${JSON.stringify(prFile)}, 'utf8') : '')
else if (group === 'pr' && action === 'create') { writeFileSync(${JSON.stringify(prFile)}, 'https://github.com/richarddaros/orca/pull/99'); process.stdout.write('https://github.com/richarddaros/orca/pull/99\\n') }
else if (group === 'pr' && action === 'edit') {}
else process.exit(3)
`
      )
      chmodSync(join(bin, 'gh'), 0o755)
      process.env.PATH = `${bin}${delimiter}${process.env.PATH}`
      const pnpmCalls = installFakePnpm(box)
      return {
        origin,
        local,
        upstreamHead: gitOk(box, upstream, 'rev-parse', 'HEAD'),
        ghCalls: () => readLog(ghLog),
        pnpmCalls
      }
    }

    function syncWorktree(box, local) {
      return gitOk(box, local, 'worktree', 'list', '--porcelain')
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.slice('worktree '.length))
        .find((path) => path.includes(`${sep}local-sync${sep}`))
    }

    function captureOutput() {
      const lines = []
      const keep = (...parts) => lines.push(parts.join(' '))
      vi.spyOn(console, 'log').mockImplementation(keep)
      vi.spyOn(console, 'error').mockImplementation(keep)
      return lines
    }

    it('merges in a dedicated worktree, gates, opens the PR and fast-forwards the line', () => {
      const box = sandbox()
      const net = forkNetwork(box)
      const output = captureOutput()
      const callerHead = gitOk(box, net.local, 'rev-parse', 'HEAD')
      const lineBefore = gitOk(box, net.origin, 'rev-parse', 'feat/agent-hub-poc')

      main(['sync', '--merge'], net.local)

      expect(gitOk(box, net.local, 'rev-parse', 'HEAD')).toBe(callerHead)
      expect(gitOk(box, net.local, 'branch', '--show-current')).toBe('feat/agent-hub-poc')
      expect(gitOk(box, net.local, 'status', '--porcelain')).toBe('')
      const worktree = syncWorktree(box, net.local)
      const branch = gitOk(box, worktree, 'branch', '--show-current')
      expect(branch).toMatch(/^chore\/sync-upstream-\d{8}$/)
      // realpath: macOS tmpdir is a symlink, and git reports the resolved path.
      expect(worktree).toBe(join(realpathSync(box.dir), 'local-sync', branch.replaceAll('/', '-')))
      const synced = gitOk(box, net.origin, 'rev-parse', 'feat/agent-hub-poc')
      expect(synced).toBe(gitOk(box, worktree, 'rev-parse', 'HEAD'))
      expect(gitOk(box, worktree, 'rev-parse', 'HEAD^1', 'HEAD^2').split('\n')).toEqual([
        lineBefore,
        net.upstreamHead
      ])

      expect(net.pnpmCalls()).toEqual([
        ['install', '--frozen-lockfile'],
        ['install', '--frozen-lockfile'],
        ['tc'],
        ['test:agent-hub'],
        ['test:fork-sync']
      ])
      const calls = net.ghCalls()
      expect(calls.map(({ args }) => args.slice(0, 2).join(' '))).toEqual([
        'auth token',
        'repo sync',
        'auth token',
        'pr list',
        'pr create'
      ])
      const body = calls.at(-1).stdin
      expect(body).toContain('(2 commits do upstream)')
      expect(body).toContain('- `src/shared.ts`')
      expect(body).toContain('upstream touches the fork file (`#123`)')

      for (const call of calls) {
        expect(call.args.join(' ')).not.toContain(TOKEN)
        expect(call.stdin).not.toContain(TOKEN)
      }
      expect(calls.filter(({ token }) => token === TOKEN).map(({ args }) => args[0])).toEqual([
        'repo',
        'pr',
        'pr'
      ])
      expect(net.pnpmCalls().flat().join(' ')).not.toContain(TOKEN)
      expect(output.join('\n')).not.toContain(TOKEN)
    })

    it('keeps the upstream list after a fix commit and never force-pushes the line', () => {
      const box = sandbox()
      const net = forkNetwork(box)
      captureOutput()
      main(['sync'], net.local)
      const worktree = syncWorktree(box, net.local)
      expect(gitOk(box, net.origin, 'rev-parse', 'feat/agent-hub-poc')).not.toBe(
        gitOk(box, worktree, 'rev-parse', 'HEAD')
      )

      const gatesBefore = net.pnpmCalls().length
      writeTree(worktree, { 'src/new-module.ts': 'export {}\n' })
      expect(() => main(['sync', '--continue'], worktree)).toThrow('Commit or discard')
      writeTree(worktree, {
        'src/new-module.ts': null,
        'src/other.ts': 'export const fixed = true\n'
      })
      expect(() => main(['sync', '--continue'], worktree)).toThrow('Commit or discard')
      expect(net.pnpmCalls()).toHaveLength(gatesBefore)
      gitOk(box, worktree, 'commit', '-q', '-am', 'fix after the merge')

      main(['sync', '--continue'], worktree)
      const edit = net.ghCalls().at(-1)
      expect(edit.args.slice(0, 2)).toEqual(['pr', 'edit'])
      expect(edit.stdin).toContain('(2 commits do upstream)')
      expect(edit.stdin).toContain('upstream touches the fork file (`#123`)')

      const other = join(box.dir, 'other')
      gitOk(box, box.dir, 'clone', '-q', '-b', 'feat/agent-hub-poc', net.origin, other)
      gitOk(box, other, 'commit', '-q', '--allow-empty', '-m', 'line moved meanwhile')
      gitOk(box, other, 'push', '-q', 'origin', 'feat/agent-hub-poc')
      const moved = gitOk(box, other, 'rev-parse', 'HEAD')

      expect(() => main(['sync', '--continue', '--merge'], worktree)).toThrow()
      expect(gitOk(box, net.origin, 'rev-parse', 'feat/agent-hub-poc')).toBe(moved)

      // The documented recovery: merge the moved line, then publish again.
      gitOk(box, worktree, 'fetch', '-q', 'origin')
      gitOk(
        box,
        worktree,
        'merge',
        '-q',
        '--no-ff',
        '-m',
        'merge the line',
        'origin/feat/agent-hub-poc'
      )
      main(['sync', '--continue', '--merge'], worktree)
      expect(gitOk(box, net.origin, 'rev-parse', 'feat/agent-hub-poc')).toBe(
        gitOk(box, worktree, 'rev-parse', 'HEAD')
      )
      const body = net.ghCalls().at(-1).stdin
      expect(body).toContain('(2 commits do upstream)')
      expect(body).toContain('- `src/shared.ts`')
      expect(body).not.toContain('line moved meanwhile')
    })
  })
})
