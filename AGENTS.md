# Checks

- **Gate**: `pnpm check:changed` runs format, lint, typecheck, the tests that import your changes, and the ratchets your paths select, and prints only failures. Run it once when you are done editing (and again after a rebase or fix), then push. A pass is cached, so don't rerun it "to be sure", and don't also run `pnpm tc`, `pnpm lint`, or the full suite. Never `--no-verify`.
- **While iterating**: run only what you touched: `pnpm test <file.test.ts> --maxWorkers=2`, `pnpm tc:node|tc:web|tc:cli`, `pnpm exec oxlint <files>`, `pnpm exec oxfmt --write <files>`. Transitive tests and the full suite are CI's job ([details](.github/CONTRIBUTING.md#targeting-local-tests)).
- Run checks in the foreground with `timeout 900`. Don't background them and poll with `sleep`.
- Stacked PRs: `ORCA_CODE_QUALITY_BASE=<ref>` or `--base=<ref>`; `--base=HEAD` covers only uncommitted edits.
- CI: `gh pr checks --watch` or `gh run watch <id> --compact --exit-status` (no polling). Read failures with `gh run view <id> --log-failed`; for long logs, filter with `grep -nE "error|FAIL|✗"` instead of tailing.

# Repo Rules

- Ensure main is always releasable
- Never break the CI. If it's broken, merge fixes.
- **Tests are the exception.** Prove a change by running it (app via CDP screenshot, CLI, script), not by committing a test. Commit one only for logic where a silent regression is costly: parsers/codecs/round-trips, security boundaries (escaping, path traversal, auth, crypto), persistence/migrations/data loss, concurrency or state-machine invariants, cross-platform paths. It must call real code with minimal mocks, hardcode its expectations, and fail if the fix is reverted; prefer one invariant over many examples. Never test UI behavior ("button does X"), wiring/IPC glue, mock calls, copy, constants, or timing. Critical user flows belong in the golden E2E journeys (`tests/e2e/golden-journeys`), not unit tests. Delete low-value tests you touch instead of updating them. Perf contracts: `*.performance.test.*` only ([rules](./docs/agents-md-refs/test-antipatterns.md#perf-contracts)); more in [anti-patterns](./docs/agents-md-refs/test-antipatterns.md).

# Design System

All UI work — layout, color, typography, spacing, component selection, UX behavior — must follow [`docs/STYLEGUIDE.md`](./docs/STYLEGUIDE.md). Use the tokens defined in `src/renderer/src/assets/main.css` (the canonical source) and the shadcn primitives in `src/renderer/src/components/ui/`. Don't invent new color values, font sizes, or shadow tiers when a documented one already covers the role.

# Electron UI Validation

- Always run tests and agent-launched apps in the background with `ORCA_BACKGROUND_LAUNCH=1`.
- Never steal monitor focus or reveal test windows: no `show()`, `showInactive()`, `bringToFront()`, `app.focus()`, or OS activation. Use CDP screenshots of hidden renderers.
- Keep native-focus and visible-window tests paused on the user's desktop; run them on an isolated display or CI.
- Rebuild modified launch-policy code before running an app (stale build wrappers are not safe).
- Use the `$electron` skill and Playwright CDP for rendered Orca UI checks. Do not use computer-use for Orca UI validation.
- Rendered UI E2E checks need an explicit, reproducible viewport and state.
- Screenshot presentational components without Electron: `pnpm fixtures:shot <id>` ([fixtures](docs/agents-md-refs/component-fixtures.md)).

# Code Style

## Reuse Before Reimplementing

Before writing new logic at any scale extend or generalize it instead of building a parallel version.

## Avoid Comments

- Only use when code does not describe
- BE CONCISE. 1 LINE if possible (why not how)

## File and Module Naming

Never use vague names like `helpers`, `utils`, `common`, `misc`, or `shared-stuff` for files, folders, or modules. They carry zero info and tend to become dumping grounds. Name files after what they _actually_ contain — prefer the concrete domain concept (e.g. `tab-group-state.ts`, `terminal-orphan-cleanup.ts`) over the generic role (`tabs-helpers.ts`, `terminal-utils.ts`). If you find yourself reaching for `helpers`, the file probably has more than one responsibility and should be split, or there's a better name hiding in the code that describes what the functions operate on.

# First Class Citizens

Every change must consider these areas:

1. Cross-Platform Support (mac/linux/windows)
   - Guard platform-specific behavior at runtime; use platform-aware shortcuts, paths, and existing process wrappers. Before changing platform-specific code, processes, shells, shortcuts, paths, or native modules, read [`docs/agents-md-refs/cross-platform-support.md`](./docs/agents-md-refs/cross-platform-support.md).
2. Remote hosts
   - Features should work locally and on remote hosts
3. Mobile
4. Folder Workspaces
   - Don't assume every workspace is a git worktree.

# Footguns

## Git / GitHub

If changing code around `git`, `gh`, source-control, or review behavior read [`docs/agents-md-refs/git-workflow.md`](./docs/agents-md-refs/git-workflow.md).

<!-- fork:richarddaros/orca:start -->

# Fork Sync (`richarddaros/orca`)

This repository is a fork of `stablyai/orca`. `feat/agent-hub-poc` is the fork's own line: every fork branch, merge and `rd/v*` tag lands there, and it must carry every upstream change. Runbook: [`docs/reference/orca-fork-sync.md`](./docs/reference/orca-fork-sync.md).

- The fork's `main` mirrors upstream and is locked on GitHub (`lock_branch`, `enforce_admins`, `allow_fork_syncing`); only `gh repo sync richarddaros/orca --branch main` moves it.
- Before starting or resuming work, run `corepack pnpm fork:status`. If `feat/agent-hub-poc` is behind `main`, run `corepack pnpm fork:sync --merge` (or merge the open sync PR) first.
- Fork-specific work goes on `feat/<slug>` or `fix/<slug>` cut from `origin/feat/agent-hub-poc`, with a PR opened by `GH_TOKEN="$(gh auth token --user richarddaros)" gh pr create --repo richarddaros/orca --base feat/agent-hub-poc`; the active `gh` account may be another one.
- Never rebase, reset or force-push `feat/agent-hub-poc`, and never use `git pull`. Syncs are `--no-ff` merges of `origin/main` on `chore/sync-upstream-<YYYYMMDD>`, through a PR merged only with a merge commit or `fork:sync --merge`, never squash or rebase.
- Resolve conflicts by keeping upstream behavior and re-applying the fork change. After the merge, `git diff origin/main...HEAD` lists only fork files.
- If the pre-commit hook rejects a file that only upstream changed (identical to `origin/main`), merge the last upstream commit that passes instead of `origin/main` (runbook, "Hook de pre-commit"); never `--no-verify`, never edit the upstream file, and list the commits left out in the sync PR.
- The sync PR names every upstream commit that touched a fork file (`fork:sync` lists them), so each re-applied change can be rechecked.
- Keep this section between its `fork:` markers: `fork:sync` re-applies it over upstream's `AGENTS.md`.
- Fork-only docs under `docs/reference/` need their own `.gitignore` allow-list entry.
- Fixes that are not fork-specific go on a branch cut from the upstream commit already on the line, `git merge-base origin/main origin/feat/agent-hub-poc`, so they can also be offered upstream.

<!-- fork:richarddaros/orca:end -->
