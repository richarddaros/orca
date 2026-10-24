import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, vi } from 'vitest'

/**
 * Git fixtures for the fork-sync tests: throwaway repos under the OS temp dir whose
 * git, for both the fixture and the code under test, never reads ~/.gitconfig.
 */
export function useGitSandbox() {
  const dirs = []
  const ENV_KEYS = ['npm_execpath', 'PATH', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM']
  let savedEnv

  beforeEach(() => {
    savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))
    // Why: an accidental pnpm call must throw instead of installing into a fixture.
    delete process.env.npm_execpath
  })

  afterEach(() => {
    vi.restoreAllMocks()
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = savedEnv[key]
      }
    }
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  function sandbox() {
    const dir = mkdtempSync(join(tmpdir(), 'fork-sync-'))
    dirs.push(dir)
    const config = join(dir, 'gitconfig')
    writeFileSync(
      config,
      '[user]\n\tname = Fork Test\n\temail = fork-test@example.com\n[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n'
    )
    // Why process.env too: the code under test runs git with it, and must not read ~/.gitconfig.
    process.env.GIT_CONFIG_GLOBAL = config
    process.env.GIT_CONFIG_NOSYSTEM = '1'
    return { dir, env: { ...process.env } }
  }

  return { sandbox }
}

export function runGit(box, cwd, ...args) {
  return spawnSync('git', args, { cwd, env: box.env, encoding: 'utf8' })
}

export function gitOk(box, cwd, ...args) {
  const result = runGit(box, cwd, ...args)
  expect(result.status, `git ${args.join(' ')}\n${result.stderr}`).toBe(0)
  return result.stdout.trim()
}

export function writeTree(repo, files) {
  for (const [path, text] of Object.entries(files)) {
    if (text === null) {
      rmSync(join(repo, path))
      continue
    }
    mkdirSync(join(repo, path, '..'), { recursive: true })
    writeFileSync(join(repo, path), text)
  }
}

export function readLog(path) {
  return existsSync(path)
    ? readFileSync(path, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : []
}

// A pnpm stand-in reached through npm_execpath that only records its arguments.
export function installFakePnpm(box) {
  const log = join(box.dir, 'pnpm.jsonl')
  const script = join(box.dir, 'fake-pnpm.cjs')
  writeFileSync(
    script,
    `require('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n')\n`
  )
  process.env.npm_execpath = script
  return () => readLog(log)
}
