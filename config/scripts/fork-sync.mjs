/**
 * Keeps the richarddaros/orca fork current with stablyai/orca.
 *
 * `main` mirrors upstream and is locked on GitHub, so only `gh repo sync` moves
 * it. `feat/agent-hub-poc` is the fork's own line and receives upstream through
 * a `--no-ff` merge made in a dedicated worktree: the checkout running Orca dev
 * only changes when `update-local` runs there.
 *
 * Usage (Node 24 and the pnpm pinned in package.json):
 *   corepack pnpm fork:status
 *   corepack pnpm fork:sync [--merge]
 *   corepack pnpm fork:sync --continue [--merge]   (inside the sync worktree, after resolving conflicts)
 *   corepack pnpm fork:update-local
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

export const FORK_REPO = 'richarddaros/orca'
export const FORK_ACCOUNT = 'richarddaros'
export const UPSTREAM_REPO = 'stablyai/orca'
export const FORK_LINE = 'feat/agent-hub-poc'
export const SYNC_BRANCH_PREFIX = 'chore/sync-upstream-'
export const LOCKFILE = 'pnpm-lock.yaml'
export const FORK_BLOCK_FILES = ['AGENTS.md']
const FORK_BLOCK =
  /<!-- fork:richarddaros\/orca:start -->[\s\S]*?<!-- fork:richarddaros\/orca:end -->\n?/
const SYNC_COMMIT_MESSAGE = 'chore(sync): sincronizar feat/agent-hub-poc com main do upstream'
const USAGE = 'usage: fork-sync.mjs status | sync [--merge] [--continue] | update-local'

/**
 * @param {string[]} argv - arguments after the script path
 * @returns {{ command: 'status' | 'sync' | 'update-local', merge: boolean, resume: boolean }}
 */
export function parseForkSyncArgs(argv) {
  const [command, ...flags] = argv
  if (command !== 'status' && command !== 'sync' && command !== 'update-local') {
    throw new Error(USAGE)
  }
  const allowed = command === 'sync' ? ['--merge', '--continue'] : []
  const unknown = flags.find((flag) => !allowed.includes(flag))
  if (unknown !== undefined) {
    throw new Error(`unknown flag ${unknown}\n${USAGE}`)
  }
  return { command, merge: flags.includes('--merge'), resume: flags.includes('--continue') }
}

/**
 * @param {Date} date - local day the sync starts
 * @param {Set<string>} taken - local and remote branch names already in use
 * @returns {string} first free `chore/sync-upstream-<YYYYMMDD>[-n]` name
 */
export function syncBranchName(date, taken) {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('')
  const base = `${SYNC_BRANCH_PREFIX}${stamp}`
  if (!taken.has(base)) {
    return base
  }
  let suffix = 2
  while (taken.has(`${base}-${suffix}`)) {
    suffix += 1
  }
  return `${base}-${suffix}`
}

/**
 * Reads the top-level `patchedDependencies:` map shared by pnpm-workspace.yaml
 * (key → patch file) and pnpm-lock.yaml (key → patch hash).
 *
 * @param {string} yamlText - file contents
 * @returns {Map<string, string>} dependency key → value
 */
export function readPatchedDependencies(yamlText) {
  const lines = yamlText.split(/\r?\n/)
  const start = lines.indexOf('patchedDependencies:')
  const entries = new Map()
  if (start === -1) {
    return entries
  }
  for (const line of lines.slice(start + 1)) {
    if (line.length > 0 && !line.startsWith(' ')) {
      break
    }
    const match = /^\s+'?(.+?)'?:\s+(\S+)\s*$/.exec(line)
    if (match !== null && !line.trimStart().startsWith('#')) {
      entries.set(match[1], match[2])
    }
  }
  return entries
}

/**
 * pnpm's patch hash is the sha256 of the patch file (verified against the lockfile).
 *
 * @param {string} patchText - patch file contents
 * @returns {string} hex digest
 */
export function patchHash(patchText) {
  return createHash('sha256').update(patchText.replace(/\r\n/g, '\n')).digest('hex')
}

/**
 * Upstream's lockfile is the base; only the hashes of patches the fork changed move.
 *
 * @param {string} lockText - upstream pnpm-lock.yaml
 * @param {Map<string, string>} currentHashes - dependency key → hash of the merged patch file
 * @returns {string} lockfile matching the merged patches
 */
export function rehashLockfile(lockText, currentHashes) {
  let text = lockText
  for (const [key, lockedHash] of readPatchedDependencies(lockText)) {
    const current = currentHashes.get(key)
    if (current !== undefined && current !== lockedHash) {
      text = text.replaceAll(lockedHash, current)
    }
  }
  return text
}

/**
 * @param {string} upstreamText - upstream version of the file
 * @param {string} forkText - fork version carrying the marked block
 * @returns {string | undefined} upstream text with the fork block appended, or undefined without a block
 */
export function reapplyForkBlock(upstreamText, forkText) {
  const block = FORK_BLOCK.exec(forkText)?.[0]
  if (block === undefined) {
    return undefined
  }
  const base = upstreamText.replace(FORK_BLOCK, '').replace(/\n*$/, '\n')
  return `${base}\n${block.endsWith('\n') ? block : `${block}\n`}`
}

/**
 * @param {string[]} paths - unmerged paths reported by git
 * @returns {{ lockfile: boolean, forkBlocks: string[], manual: string[] }} resolution plan
 */
export function classifyConflicts(paths) {
  return {
    lockfile: paths.includes(LOCKFILE),
    forkBlocks: paths.filter((path) => FORK_BLOCK_FILES.includes(path)),
    manual: paths.filter((path) => path !== LOCKFILE && !FORK_BLOCK_FILES.includes(path))
  }
}

/**
 * @param {string[]} forkFiles - paths that differ between upstream and the fork line
 * @returns {string[]} the fork's vitest files under src/ that the sync must keep green
 */
export function forkTestFiles(forkFiles) {
  return forkFiles.filter((path) => path.startsWith('src/') && /\.test\.(ts|tsx|mjs)$/.test(path))
}

/**
 * @param {{ nodeVersion: string, userAgent: string | undefined, packageJson: { engines?: { node?: string }, packageManager?: string } }} input
 * @returns {string[]} toolchain problems; empty when the run matches the repo's pins
 */
export function toolchainProblems({ nodeVersion, userAgent, packageJson }) {
  const problems = []
  const wantedNode = packageJson.engines?.node
  if (wantedNode !== undefined && /^\d+$/.test(wantedNode)) {
    if (nodeVersion.split('.')[0] !== wantedNode) {
      problems.push(`Node ${nodeVersion} is running; the repo pins Node ${wantedNode}.`)
    }
  }
  const wantedPnpm = /^pnpm@([^+]+)/.exec(packageJson.packageManager ?? '')?.[1]
  const runningPnpm = /\bpnpm\/(\S+)/.exec(userAgent ?? '')?.[1]
  if (wantedPnpm !== undefined && runningPnpm !== wantedPnpm) {
    problems.push(
      `pnpm ${runningPnpm ?? '(none)'} is running; the repo pins pnpm ${wantedPnpm}. Run it as \`corepack pnpm ...\`.`
    )
  }
  return problems
}

function run(
  command,
  args,
  { cwd, env = process.env, allowFailure = false, inherit = false, raw = false, input } = {}
) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    input,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe']
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      `${command} ${args.join(' ')} exited ${result.status}\n${result.stderr ?? ''}`.trim()
    )
  }
  const stdout = result.stdout ?? ''
  return { status: result.status, stdout: raw ? stdout : stdout.trim() }
}

const git = (cwd, args, options = {}) => run('git', args, { cwd, ...options }).stdout

function pnpm(cwd, args) {
  // Why npm_execpath: re-entering the pnpm that launched this script keeps the pinned version.
  const execPath = process.env.npm_execpath
  if (execPath === undefined) {
    throw new Error('Run this through pnpm: `corepack pnpm fork:<command>`.')
  }
  const viaNode = /\.[cm]?js$/.test(execPath)
  console.log(`\n$ pnpm ${args.join(' ')}`)
  run(viaNode ? process.execPath : execPath, viaNode ? [execPath, ...args] : args, {
    cwd,
    inherit: true
  })
}

function githubEnv() {
  // Why per process: `gh auth switch` would change the account other sessions share.
  const token = run('gh', ['auth', 'token', '--user', FORK_ACCOUNT]).stdout
  if (token.length === 0) {
    throw new Error(`gh has no token for ${FORK_ACCOUNT}; run \`gh auth login\` for that account.`)
  }
  return { ...process.env, GH_TOKEN: token }
}

function assertToolchain(root) {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const problems = toolchainProblems({
    nodeVersion: process.versions.node,
    userAgent: process.env.npm_config_user_agent,
    packageJson
  })
  if (problems.length > 0) {
    throw new Error(problems.join('\n'))
  }
}

function aheadBehind(root, range) {
  const [ahead, behind] = git(root, ['rev-list', '--left-right', '--count', range]).split(/\s+/)
  return { ahead: Number(ahead), behind: Number(behind) }
}

export function unmergedPaths(root) {
  const output = git(root, ['diff', '--name-only', '--diff-filter=U'])
  return output.length === 0 ? [] : output.split('\n')
}

function mainWorktreePath(root) {
  const first = git(root, ['worktree', 'list', '--porcelain']).split('\n')[0]
  return first.replace(/^worktree /, '')
}

function status(root) {
  git(root, ['fetch', '--prune', 'origin'])
  const upstreamMain = git(root, [
    'ls-remote',
    `https://github.com/${UPSTREAM_REPO}.git`,
    'refs/heads/main'
  ]).split(/\s+/)[0]
  const forkMain = git(root, ['rev-parse', 'origin/main'])
  const line = aheadBehind(root, `origin/${FORK_LINE}...origin/main`)
  const branch = git(root, ['branch', '--show-current'])
  console.log(`upstream ${UPSTREAM_REPO} main: ${upstreamMain}`)
  console.log(
    `fork main:                   ${forkMain}${forkMain === upstreamMain ? ' (mirror current)' : ' (mirror behind: fork:sync)'}`
  )
  console.log(
    `${FORK_LINE}: ${line.ahead} fork commits, ${line.behind} upstream commits missing${line.behind > 0 ? ' (fork:sync)' : ''}`
  )
  if (branch === FORK_LINE) {
    const local = aheadBehind(root, `HEAD...origin/${FORK_LINE}`)
    console.log(
      `this checkout: ${local.behind} commits behind origin/${FORK_LINE}${local.behind > 0 ? ' (fork:update-local)' : ''}`
    )
  }
}

/**
 * Rewrites the lockfile's patch hashes to match the patch files on disk.
 *
 * @param {string} worktree - checkout whose patch files are resolved
 * @returns {boolean} whether pnpm-lock.yaml changed
 */
export function refreshLockfileHashes(worktree) {
  const workspace = readFileSync(join(worktree, 'pnpm-workspace.yaml'), 'utf8')
  const hashes = new Map()
  for (const [key, file] of readPatchedDependencies(workspace)) {
    const path = join(worktree, file)
    if (existsSync(path)) {
      hashes.set(key, patchHash(readFileSync(path, 'utf8')))
    }
  }
  const lockPath = join(worktree, LOCKFILE)
  const locked = readFileSync(lockPath, 'utf8')
  const rehashed = rehashLockfile(locked, hashes)
  if (rehashed === locked) {
    return false
  }
  writeFileSync(lockPath, rehashed)
  git(worktree, ['add', '--', LOCKFILE])
  return true
}

/**
 * @param {string} worktree - checkout with a merge in progress
 * @param {{ lockfile: boolean, forkBlocks: string[], manual: string[] }} plan - from classifyConflicts
 * @returns {string[]} conflicts left for a person
 */
export function resolveAutomatically(worktree, plan) {
  if (plan.lockfile) {
    git(worktree, ['checkout', '--theirs', '--', LOCKFILE])
    refreshLockfileHashes(worktree)
    git(worktree, ['add', '--', LOCKFILE])
  }
  for (const file of plan.forkBlocks) {
    // Why allowFailure: a modify/delete conflict has no stage for one side.
    const stage = (n) =>
      run('git', ['show', `:${n}:${file}`], { cwd: worktree, allowFailure: true, raw: true })
    const ours = stage(2)
    const theirs = stage(3)
    const merged =
      ours.status === 0 && theirs.status === 0
        ? reapplyForkBlock(theirs.stdout, ours.stdout)
        : undefined
    if (merged === undefined) {
      plan.manual.push(file)
      continue
    }
    writeFileSync(join(worktree, file), merged)
    git(worktree, ['add', '--', file])
  }
  return plan.manual
}

/**
 * @param {string} logText - `git log --format='%h %s'` of upstream commits that touched fork files
 * @returns {string[]} Markdown list; issue refs become code so they never link to fork issues
 */
export function formatUpstreamChanges(logText) {
  return logText
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, ...subject] = line.split(' ')
      return `- \`${sha}\` ${subject.join(' ').replace(/#(\d+)/g, '`#$1`')}`
    })
}

function startSync(root) {
  run('gh', ['repo', 'sync', FORK_REPO, '--branch', 'main'], { env: githubEnv() })
  git(root, ['fetch', '--prune', 'origin'])
  const { behind } = aheadBehind(root, `origin/${FORK_LINE}...origin/main`)
  if (behind === 0) {
    console.log(`${FORK_LINE} already carries upstream main.`)
    return undefined
  }
  const taken = new Set(
    git(root, [
      'for-each-ref',
      '--format=%(refname:lstrip=2)',
      `refs/heads/${SYNC_BRANCH_PREFIX}*`,
      `refs/remotes/origin/${SYNC_BRANCH_PREFIX}*`
    ])
      .split('\n')
      .map((name) => name.replace(/^origin\//, ''))
  )
  const branch = syncBranchName(new Date(), taken)
  const main = mainWorktreePath(root)
  const worktree = join(dirname(main), `${basename(main)}-sync`, branch.replaceAll('/', '-'))
  if (existsSync(worktree)) {
    throw new Error(`${worktree} already exists; finish or remove that sync first.`)
  }
  git(root, ['worktree', 'add', '--no-track', '-b', branch, worktree, `origin/${FORK_LINE}`])
  console.log(`Merging ${behind} upstream commits in ${worktree}`)
  git(worktree, ['merge', '--no-ff', '--no-commit', 'origin/main'], { allowFailure: true })
  return worktree
}

function mergeInProgress(worktree) {
  return (
    run('git', ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { cwd: worktree, allowFailure: true })
      .status === 0
  )
}

function assertSyncBranch(root) {
  const branch = git(root, ['branch', '--show-current'])
  if (!branch.startsWith(SYNC_BRANCH_PREFIX)) {
    throw new Error(
      `--continue runs inside a ${SYNC_BRANCH_PREFIX}* worktree, not ${branch || 'a detached HEAD'}.`
    )
  }
}

/**
 * @param {string} worktree - sync worktree with the merge in progress or already committed
 * @returns {string[]} conflicts left for a person; empty once the merge is committed
 */
export function finishMerge(worktree) {
  const merging = mergeInProgress(worktree)
  // Why: the automatic resolutions assume upstream is the side being merged in.
  if (
    merging &&
    run('git', ['merge-base', '--is-ancestor', 'MERGE_HEAD', 'origin/main'], {
      cwd: worktree,
      allowFailure: true
    }).status !== 0
  ) {
    throw new Error(
      'The merge in progress is not upstream (a merge of the line?); resolve and commit it by hand, then run --continue.'
    )
  }
  const manual = resolveAutomatically(worktree, classifyConflicts(unmergedPaths(worktree)))
  if (manual.length > 0 || !merging) {
    return manual
  }
  // Why here too: a patch resolved by hand after the first run changes its hash.
  refreshLockfileHashes(worktree)
  // Why before the commit: the pre-commit hook runs lint-staged from node_modules.
  pnpm(worktree, ['install', '--frozen-lockfile'])
  git(worktree, ['commit', '-m', SYNC_COMMIT_MESSAGE], { inherit: true })
  return []
}

function publish(worktree, { merge }) {
  const branch = git(worktree, ['branch', '--show-current'])
  const dirty = git(worktree, ['status', '--porcelain'])
  if (dirty.length > 0) {
    throw new Error(
      `Commit or discard these changes first; the gates must test what gets pushed:\n${dirty}`
    )
  }
  // Why the merge, not HEAD: fixes or a merge of the line committed after it must not hide what upstream brought.
  const syncMerge = git(worktree, [
    'rev-list',
    '--merges',
    '--first-parent',
    `origin/${FORK_LINE}..HEAD`
  ])
    .split('\n')
    .filter(Boolean)
    .find(
      (sha) =>
        run('git', ['merge-base', '--is-ancestor', `${sha}^2`, 'origin/main'], {
          cwd: worktree,
          allowFailure: true
        }).status === 0
    )
  if (syncMerge === undefined) {
    throw new Error(
      `HEAD holds no upstream merge on top of origin/${FORK_LINE}; finish it before --continue.`
    )
  }
  const forkFiles = git(worktree, ['diff', '--name-only', `${syncMerge}^2`, 'HEAD'])
    .split('\n')
    .filter(Boolean)
  pnpm(worktree, ['install', '--frozen-lockfile'])
  pnpm(worktree, ['tc'])
  pnpm(worktree, ['test:agent-hub'])
  pnpm(worktree, ['test:fork-sync'])
  const tests = forkTestFiles(forkFiles)
  if (tests.length > 0) {
    pnpm(worktree, ['test', ...tests, '--maxWorkers=2'])
  }
  const upstreamRange = `${syncMerge}^1..${syncMerge}^2`
  const upstreamCount = Number(git(worktree, ['rev-list', '--count', upstreamRange]))
  const watched = forkFiles.filter((path) => path !== LOCKFILE)
  const upstreamChanges =
    watched.length === 0
      ? []
      : formatUpstreamChanges(
          git(worktree, ['log', '--format=%h %s', upstreamRange, '--', ...watched])
        )
  git(worktree, ['push', '-u', 'origin', branch], { inherit: true })
  const env = githubEnv()
  const body = [
    `Merge \`--no-ff\` de \`origin/main\` (${upstreamCount} commits do upstream) em \`${FORK_LINE}\`, feito por \`fork:sync\`.`,
    '',
    'Gates: `pnpm install --frozen-lockfile`, `pnpm tc`, `pnpm test:agent-hub`, `pnpm test:fork-sync` e os testes do fork.',
    '',
    'Arquivos que diferem do upstream depois do merge:',
    ...forkFiles.map((path) => `- \`${path}\``),
    '',
    'Commits do upstream que tocaram esses arquivos (revalide a reaplicação do fork):',
    ...(upstreamChanges.length > 0 ? upstreamChanges : ['- nenhum'])
  ].join('\n')
  const existing = run(
    'gh',
    [
      'pr',
      'list',
      '--repo',
      FORK_REPO,
      '--head',
      branch,
      '--state',
      'open',
      '--json',
      'url',
      '--jq',
      '.[0].url // ""'
    ],
    { env }
  ).stdout
  // Why stdin: a long body in argv can pass Windows' command-line limit.
  if (existing.length > 0) {
    run('gh', ['pr', 'edit', existing, '--repo', FORK_REPO, '--body-file', '-'], {
      env,
      input: body
    })
  }
  const url =
    existing.length > 0
      ? existing
      : run(
          'gh',
          [
            'pr',
            'create',
            '--repo',
            FORK_REPO,
            '--base',
            FORK_LINE,
            '--head',
            branch,
            '--title',
            `${SYNC_COMMIT_MESSAGE} (${upstreamCount} commits)`,
            '--body-file',
            '-'
          ],
          { env, input: body }
        ).stdout
  console.log(`PR: ${url}`)
  if (merge) {
    // Why a fast-forward push: GitHub marks the PR merged without adding its own merge commit.
    git(worktree, ['push', 'origin', `HEAD:refs/heads/${FORK_LINE}`], { inherit: true })
    console.log(
      `${FORK_LINE} now carries upstream; run \`corepack pnpm fork:update-local\` in the Orca checkout.`
    )
  }
}

export function updateLocal(root) {
  const branch = git(root, ['branch', '--show-current'])
  if (branch !== FORK_LINE) {
    throw new Error(
      `update-local runs on ${FORK_LINE}; this checkout is on ${branch || 'a detached HEAD'}.`
    )
  }
  const dirty = git(root, ['status', '--porcelain', '--untracked-files=no'])
  if (dirty.length > 0) {
    throw new Error(
      `Tracked changes block the update:\n${dirty}\nA lone pnpm-lock.yaml change is usually the @pnpm/exe entry an unpinned pnpm writes; inspect it with \`git diff\` before restoring it.`
    )
  }
  git(root, ['fetch', '--prune', 'origin'])
  const { behind } = aheadBehind(root, `HEAD...origin/${FORK_LINE}`)
  if (behind === 0) {
    console.log(`This checkout already matches origin/${FORK_LINE}.`)
    return
  }
  console.log(`Fast-forwarding ${behind} commits; a running Orca dev reloads while files change.`)
  git(root, ['merge', '--ff-only', `origin/${FORK_LINE}`], { inherit: true })
  pnpm(root, ['install', '--frozen-lockfile'])
  console.log('Done. Restart Orca dev (`corepack pnpm dev`) to run the updated build.')
}

export function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const options = parseForkSyncArgs(argv)
  const root = git(cwd, ['rev-parse', '--show-toplevel'])
  if (options.command === 'status') {
    status(root)
    return
  }
  if (options.resume) {
    assertSyncBranch(root)
  }
  assertToolchain(root)
  if (options.command === 'update-local') {
    updateLocal(root)
    return
  }
  const worktree = options.resume ? root : startSync(root)
  if (worktree === undefined) {
    return
  }
  const manual = finishMerge(worktree)
  if (manual.length > 0) {
    console.error(
      `\nResolve these conflicts in ${worktree}, \`git add\` them, then run \`corepack pnpm fork:sync --continue\` there:`
    )
    for (const path of manual) {
      console.error(`  ${path}`)
    }
    process.exitCode = 2
    return
  }
  publish(worktree, options)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
