/**
 * Keyless capability smoke for the Orca agent hub proposal.
 *
 * The probe plan is deliberately separate from the production PTY and relay
 * paths. It verifies that the three selected runtimes can be reached without
 * sending a prompt, reading model output, or forwarding credential-shaped
 * environment variables. A non-zero exit, timeout, or spawn failure is an
 * explicit failed event; there is no fallback to another engine.
 *
 * Usage:
 *   pnpm run smoke:agent-hub
 *   ORCA_HUB_DSH_BIN=pnpm ORCA_HUB_DSH_ARGS='["dsh","--version"]' pnpm run smoke:agent-hub
 */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'

export const HUB_ENGINES = ['orca', 'opencode', 'deepseek-harness']
const DEFAULT_TIMEOUT_MS = 10_000
const SECRET_ENV_NAME = /(key|token|secret|password|credential|private)/i

/**
 * Remove credential-shaped variables before a keyless probe starts.
 *
 * @param {NodeJS.ProcessEnv} environment - environment to filter
 * @returns {NodeJS.ProcessEnv} a copy safe for a capability-only child
 */
export function scrubProbeEnvironment(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(([name, value]) => {
      return value !== undefined && !SECRET_ENV_NAME.test(name) && !name.startsWith('ORCA_HUB_')
    })
  )
}

function parseCommandArgs(environment, variable, fallback) {
  const raw = environment[variable]
  if (raw === undefined) {
    return fallback
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${variable} must contain a JSON array of strings`)
  }
  if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === 'string')) {
    throw new Error(`${variable} must contain a JSON array of strings`)
  }
  return parsed
}

function commandSpec(environment, variable, fallbackCommand, fallbackArgs) {
  const command = environment[`${variable}_BIN`] ?? fallbackCommand
  if (command.length === 0) {
    throw new Error(`${variable}_BIN must not be empty`)
  }
  return {
    command,
    args: parseCommandArgs(environment, `${variable}_ARGS`, fallbackArgs)
  }
}

/**
 * Build the explicit routing table used by the smoke. The Orca entry points
 * to the built CLI, while OpenCode and DSH use their public command surfaces.
 *
 * @param {{ repoRoot?: string, environment?: NodeJS.ProcessEnv }} options - probe inputs
 * @returns {Array<{ engine: string, command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv }>}
 *   sanitized process specifications
 */
export function buildHubProbePlan({
  repoRoot = resolve(import.meta.dirname, '../..'),
  environment = process.env
} = {}) {
  const env = scrubProbeEnvironment(environment)
  const orca =
    environment.ORCA_HUB_ORCA_BIN === undefined
      ? { command: process.execPath, args: [join(repoRoot, 'out', 'cli', 'index.js'), '--help'] }
      : commandSpec(environment, 'ORCA_HUB_ORCA', 'orca', ['--help'])
  const opencode = commandSpec(environment, 'ORCA_HUB_OPENCODE', 'opencode', ['--version'])
  const dsh = commandSpec(environment, 'ORCA_HUB_DSH', 'dsh', ['--version'])
  return [
    { engine: 'orca', ...orca, cwd: repoRoot, env },
    { engine: 'opencode', ...opencode, cwd: repoRoot, env },
    { engine: 'deepseek-harness', ...dsh, cwd: repoRoot, env }
  ]
}

/**
 * Parse the small CLI owned by this smoke. Unknown flags fail loudly so a
 * typo cannot accidentally run all probes.
 *
 * @param {readonly string[]} argv - arguments after the script path
 * @returns {{ engine: string, timeoutMs: number }} selected probe options
 */
export function parseSmokeArgs(argv) {
  let engine = 'all'
  let timeoutMs = DEFAULT_TIMEOUT_MS
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') {
      return { engine: 'help', timeoutMs }
    }
    if (argument === '--engine') {
      engine = argv[++index]
      if (!HUB_ENGINES.includes(engine)) {
        throw new Error(`--engine must be one of: all, ${HUB_ENGINES.join(', ')}`)
      }
      continue
    }
    if (argument === '--timeout-ms') {
      timeoutMs = Number(argv[++index])
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
        throw new Error('--timeout-ms must be an integer between 1000 and 60000')
      }
      continue
    }
    throw new Error(`unknown argument: ${argument}`)
  }
  return { engine, timeoutMs }
}

/**
 * Run one no-output child and return only bounded process facts.
 *
 * @param {{ engine: string, command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv }} probe - process spec
 * @param {{ timeoutMs?: number, spawnProcess?: typeof spawn }} options - process controls
 * @returns {Promise<{ engine: string, status: string, category: string, exitCode: number | null, signal: string | null, timedOut: boolean, durationMs: number }>}
 *   sanitized result
 */
export function runProbe(probe, { timeoutMs = DEFAULT_TIMEOUT_MS, spawnProcess = spawn } = {}) {
  const startedAt = Date.now()
  return new Promise((resolveResult) => {
    let child
    try {
      child = spawnProcess(probe.command, probe.args, {
        cwd: probe.cwd,
        env: probe.env,
        stdio: ['ignore', 'ignore', 'ignore'],
        shell: false,
        windowsHide: true
      })
    } catch {
      resolveResult({
        engine: probe.engine,
        status: 'failed',
        category: 'spawn-error',
        exitCode: null,
        signal: null,
        timedOut: false,
        durationMs: Date.now() - startedAt
      })
      return
    }

    let timedOut = false
    let settled = false
    let timer
    const finish = (exitCode, signal, category) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      resolveResult({
        engine: probe.engine,
        status: category === 'success' ? 'succeeded' : 'failed',
        category,
        exitCode,
        signal,
        timedOut,
        durationMs: Date.now() - startedAt
      })
    }
    child.once('error', () => finish(null, null, 'spawn-error'))
    child.once('close', (exitCode, signal) => {
      const category = timedOut ? 'timeout' : exitCode === 0 ? 'success' : 'exit-error'
      finish(exitCode, signal, category)
    })
    timer = setTimeout(() => {
      timedOut = true
      if (!child.kill()) {
        finish(null, null, 'timeout')
      }
    }, timeoutMs)
  })
}

/**
 * Execute the selected route in order and emit a sanitized NDJSON event stream.
 *
 * @param {{ probes: Array<object>, engine?: string, timeoutMs?: number, runId?: string, runProbe?: Function, emit?: Function }} options - smoke execution
 * @returns {Promise<{ runId: string, status: string, results: Array<object> }>}
 *   aggregate result
 */
export async function runHubSmoke({
  probes,
  engine = 'all',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  runId = randomUUID(),
  runProbe: execute = runProbe,
  emit = emitEvent
} = {}) {
  const selected = engine === 'all' ? probes : probes.filter((probe) => probe.engine === engine)
  if (selected.length === 0) {
    throw new Error(`no probe configured for engine: ${engine}`)
  }
  emit({ event: 'hub.run.started', runId, engines: selected.map((probe) => probe.engine) })
  const results = []
  for (const probe of selected) {
    emit({ event: 'hub.engine.started', runId, engine: probe.engine, mode: 'keyless-probe' })
    const result = await execute(probe, { timeoutMs })
    results.push(result)
    emit({ event: 'hub.engine.completed', runId, ...result })
  }
  const status = results.every((result) => result.status === 'succeeded') ? 'succeeded' : 'failed'
  emit({
    event: 'hub.run.completed',
    runId,
    status,
    failedEngines: results
      .filter((result) => result.status === 'failed')
      .map((result) => result.engine)
  })
  return { runId, status, results }
}

function emitEvent(payload) {
  process.stdout.write(
    `${JSON.stringify({ type: 'orca_agent_hub_event', schemaVersion: 1, ...payload })}\n`
  )
}

function printHelp() {
  process.stdout.write(
    `${[
      'Usage: pnpm run smoke:agent-hub [--engine <name>] [--timeout-ms <ms>]',
      '',
      `Engines: all, ${HUB_ENGINES.join(', ')}`,
      'Environment overrides: ORCA_HUB_<ORCA|OPENCODE|DSH>_BIN and _ARGS (JSON string array)',
      'The command performs keyless --help/--version probes only.'
    ].join('\n')}\n`
  )
}

async function main() {
  try {
    const options = parseSmokeArgs(process.argv.slice(2))
    if (options.engine === 'help') {
      printHelp()
      return
    }
    const result = await runHubSmoke({ ...options, probes: buildHubProbePlan() })
    if (result.status !== 'succeeded') {
      process.exitCode = 1
    }
  } catch (error) {
    process.stderr.write(
      `agent-hub-smoke: ${error instanceof Error ? error.message : 'invalid invocation'}\n`
    )
    process.exitCode = 1
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  await main()
}
