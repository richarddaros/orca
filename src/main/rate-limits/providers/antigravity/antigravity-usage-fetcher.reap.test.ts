import { afterEach, describe, expect, it, vi } from 'vitest'
import type { runProcess } from '@orca/process-host'
import { ANTIGRAVITY_USAGE_ARGS, ANTIGRAVITY_VERSION_ARGS } from './antigravity-usage-command'
import {
  fetchAntigravityRateLimits,
  resetAntigravityUsageSupportForTests
} from './antigravity-usage-fetcher'

// Fork (richarddaros/orca): agy abandons the MCP servers it fails to close, and the quota probe runs every poll, so
// the usage read must ask the process host to reap the child's process group. The version probe never needs it.
afterEach(() => {
  resetAntigravityUsageSupportForTests()
})

type ProcessResult = Awaited<ReturnType<typeof runProcess>>

function processResult(stdout: string): ProcessResult {
  return {
    code: 0,
    signal: null,
    stdout,
    stderr: '',
    timedOut: false
  }
}

describe('Antigravity quota probe process group', () => {
  it('reaps the process group on the usage read and not on the version probe', async () => {
    const runCommand = vi.fn<typeof runProcess>(async (spec) =>
      processResult(spec.args?.join(' ') === ANTIGRAVITY_VERSION_ARGS.join(' ') ? '99.0.0' : '')
    )

    await fetchAntigravityRateLimits({
      runCommand,
      resolveCommand: async () => '/usr/local/bin/agy',
      resolveEnvironment: async () => ({ PATH: '/usr/local/bin' }),
      platform: 'linux'
    })

    const [versionSpec, usageSpec] = runCommand.mock.calls.map(([spec]) => spec)
    expect(runCommand).toHaveBeenCalledTimes(2)
    expect(versionSpec?.args).toEqual(ANTIGRAVITY_VERSION_ARGS)
    expect(versionSpec?.reapProcessGroupOnExit).toBeUndefined()
    expect(usageSpec?.args).toEqual(ANTIGRAVITY_USAGE_ARGS)
    expect(usageSpec?.reapProcessGroupOnExit).toBe(true)
  })
})
