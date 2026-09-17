# Agent hub smoke

`config/scripts/agent-hub-smoke.mjs` is a keyless capability probe for the
proposed Orca hub. It validates reachability of the built Orca CLI, OpenCode,
and DeepSeek Harness without sending a model prompt or forwarding
credential-shaped environment variables.

## Run

Build the Orca CLI first:

```bash
pnpm run build:cli
pnpm run smoke:agent-hub
```

The default routes are:

| Engine | Command | Capability checked |
| --- | --- | --- |
| `orca` | current Node + `out/cli/index.js --help` | built CLI entrypoint responds |
| `opencode` | `opencode --version` | installed OpenCode binary responds |
| `deepseek-harness` | `dsh --version` | installed DSH launcher responds |

The local DSH checkout is not installed globally. To probe the checked-out
runtime without changing `PATH`, use its package launcher explicitly:

```bash
ORCA_HUB_DSH_BIN=pnpm \
ORCA_HUB_DSH_ARGS='["--dir","/path/to/deepseek-harness","dsh","--version"]' \
pnpm run smoke:agent-hub
```

Use `--engine opencode` or `--engine deepseek-harness` to isolate one route.
`--timeout-ms` accepts 1,000–60,000 milliseconds. Overrides are argv arrays in
JSON so arguments are never interpreted through a shell.

## Evidence and limits

The process emits versioned NDJSON events with `runId`, engine, status, exit
category, exit code, signal, timeout, and duration. It intentionally omits
command output, stderr, cwd, environment, prompts, and model responses. These
events are a diagnostic POC stream, not a new PostHog event and not a promise
that the provider authenticated or completed a task.

`spawn-error`, `exit-error`, and `timeout` fail the selected run. There is no
silent engine fallback. The child is started with argv arrays and no shell, and
its stdout/stderr are discarded because this probe only establishes process
reachability.

This is not yet the production orchestration adapter. Production execution
must bind an engine to Orca's existing Run/Task/Dispatch lifecycle, PTY or
non-interactive subprocess ownership, worktree/SSH authority, permission
policy, cancellation, and existing telemetry consent/redaction paths.
