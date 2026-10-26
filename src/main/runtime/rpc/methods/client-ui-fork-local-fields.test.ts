import '../unused-default-rpc-methods.test-fixture'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { getDefaultUIState } from '../../../../shared/constants'
import { FORK_LOCAL_UI_FIELDS } from '../../../../shared/custom-sidebar-sections/custom-sidebar-sections-state'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { RpcDispatcher } from '../dispatcher'
import { CLIENT_UI_METHODS } from './client-ui'

const UiGetReply = z.object({ result: z.object({ ui: z.record(z.string(), z.unknown()) }) })

const sample = { version: 1, sections: [{ id: 'mcf', name: 'MCF', members: ['local|wt'] }] }

function dispatcherFor(stored: Record<string, unknown>) {
  const ui = { ...getDefaultUIState(), ...stored }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the UI methods read only these runtime members.
  const runtime = {
    getRuntimeId: () => 'test-runtime',
    getUIState: vi.fn(() => ui),
    updateUIState: vi.fn(() => ui)
  } as unknown as OrcaRuntimeService
  return { runtime, dispatcher: new RpcDispatcher({ runtime, methods: CLIENT_UI_METHODS }) }
}

// Fork (richarddaros/orca): user sidebar sections name this desktop's workspaces, so they never cross the RPC.
describe.each(FORK_LOCAL_UI_FIELDS.map((field) => [field] as const))(
  'fork-local UI field %s',
  (field) => {
    it('is never persisted from a paired client', async () => {
      const { runtime, dispatcher } = dispatcherFor({})
      const response = await dispatcher.dispatch({
        id: 'req-1',
        authToken: 'tok',
        method: 'ui.set',
        params: { sidebarWidth: 280, [field]: sample }
      })
      // Why: the field is outside the strict wire schema, so the payload is refused or stripped, never stored.
      const calls = vi.mocked(runtime.updateUIState).mock.calls
      expect(calls.length > 0 || z.object({ ok: z.boolean() }).parse(response).ok === false).toBe(
        true
      )
      for (const [updates] of calls) {
        expect(Object.keys(updates)).not.toContain(field)
      }
    })

    it('is never returned to a paired client', async () => {
      const { dispatcher } = dispatcherFor({ [field]: sample })
      const response = await dispatcher.dispatch({
        id: 'req-1',
        authToken: 'tok',
        method: 'ui.get'
      })
      const { ui } = UiGetReply.parse(response).result
      expect(Object.keys(ui)).not.toContain(field)
    })
  }
)
