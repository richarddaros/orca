import type { ChildProcess } from 'node:child_process'
import type { ProcessSpec } from './process-spec'
import { signalProcessTree } from './process-tree-termination'

/** POSIX: signal the child's own process group once the root exits, reaping what it abandoned. */
export function attachProcessGroupReaper(child: ChildProcess, spec: ProcessSpec): ChildProcess {
  if (spec.reapProcessGroupOnExit && process.platform !== 'win32') {
    child.once('exit', () => {
      // Why: a CLI can exit cleanly yet leave descendants it failed to stop (agy abandons
      // MCP servers after a 100 ms close) alive in its group, one more per run.
      void signalProcessTree(child, 'SIGTERM').catch(() => false)
    })
  }
  return child
}
