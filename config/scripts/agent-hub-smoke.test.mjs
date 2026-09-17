import { describe, expect, it } from 'vitest'
import {
  buildHubProbePlan,
  parseSmokeArgs,
  runHubSmoke,
  runProbe,
  scrubProbeEnvironment
} from './agent-hub-smoke.mjs'

describe('agent hub smoke', () => {
  it('routes the three engines through explicit keyless commands', () => {
    const probes = buildHubProbePlan({
      repoRoot: '/repo',
      environment: {
        PATH: '/bin',
        ORCA_HUB_OPENCODE_BIN: 'custom-opencode',
        ORCA_HUB_DSH_BIN: 'pnpm',
        ORCA_HUB_DSH_ARGS: '["dsh","--version"]'
      }
    })

    expect(probes.map(({ engine }) => engine)).toEqual(['orca', 'opencode', 'deepseek-harness'])
    expect(probes[0].args).toEqual(['/repo/out/cli/index.js', '--help'])
    expect(probes[1].command).toBe('custom-opencode')
    expect(probes[2]).toMatchObject({ command: 'pnpm', args: ['dsh', '--version'] })
    expect(probes.every((probe) => probe.env.ORCA_HUB_DSH_ARGS === undefined)).toBe(true)
  })

  it('does not forward credential-shaped variables', () => {
    const safe = scrubProbeEnvironment({
      PATH: '/bin',
      DEEPSEEK_API_KEY: 'redacted',
      GH_TOKEN: 'redacted',
      HOME: '/tmp/home'
    })

    expect(safe).toEqual({ PATH: '/bin', HOME: '/tmp/home' })
  })

  it('emits an explicit failed route when a child fails', async () => {
    const events = []
    const result = await runHubSmoke({
      runId: 'run-test',
      probes: [{ engine: 'opencode' }],
      runProbe: async () => ({
        engine: 'opencode',
        status: 'failed',
        category: 'exit-error',
        exitCode: 1,
        signal: null,
        timedOut: false,
        durationMs: 2
      }),
      emit: (event) => events.push(event)
    })

    expect(result).toMatchObject({ runId: 'run-test', status: 'failed' })
    expect(events.map(({ event }) => event)).toEqual([
      'hub.run.started',
      'hub.engine.started',
      'hub.engine.completed',
      'hub.run.completed'
    ])
    expect(events.at(-1)).toMatchObject({ status: 'failed', failedEngines: ['opencode'] })
  })

  it('rejects invalid CLI selections', () => {
    expect(() => parseSmokeArgs(['--engine', 'unknown'])).toThrow('--engine must be one of')
    expect(() => parseSmokeArgs(['--timeout-ms', '999'])).toThrow('--timeout-ms must be')
  })

  it('classifies a spawn failure without selecting a fallback engine', async () => {
    const result = await runProbe(
      {
        engine: 'opencode',
        command: 'missing-opencode',
        args: [],
        cwd: process.cwd(),
        env: {}
      },
      {
        spawnProcess: () => {
          throw new Error('spawn failed')
        }
      }
    )

    expect(result).toMatchObject({
      engine: 'opencode',
      status: 'failed',
      category: 'spawn-error',
      exitCode: null,
      timedOut: false
    })
  })

  it('classifies real child exit and timeout without exposing output', async () => {
    const failed = await runProbe({
      engine: 'opencode',
      command: process.execPath,
      args: ['-e', 'process.exit(7)'],
      cwd: process.cwd(),
      env: {}
    })
    expect(failed).toMatchObject({ status: 'failed', category: 'exit-error', exitCode: 7 })

    const timedOut = await runProbe(
      {
        engine: 'deepseek-harness',
        command: process.execPath,
        args: ['-e', 'setTimeout(() => {}, 10000)'],
        cwd: process.cwd(),
        env: {}
      },
      { timeoutMs: 1000 }
    )
    expect(timedOut).toMatchObject({ status: 'failed', category: 'timeout', timedOut: true })
  })
})
