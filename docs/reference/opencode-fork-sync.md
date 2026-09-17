# OpenCode fork sync and local installation

This runbook keeps the personal OpenCode fork based on the upstream `dev`
branch while preserving the local fork changes. It is intentionally explicit
about fetch, merge, build, installation, and smoke evidence.

## Safe sequence

Run from the OpenCode checkout and inspect all linked worktrees before changing
history:

```bash
git status --short --branch
git worktree list --porcelain
git fetch --prune origin
git fetch --prune fork
git rev-list --left-right --count origin/dev...HEAD
```

If the worktree is clean and the merge simulation has no conflicts, merge the
fresh upstream tip into the work branch. Do not reset or discard the fork
commits:

```bash
git merge-tree --write-tree origin/dev HEAD
git merge --no-ff origin/dev -m "chore(sync): atualizar base do upstream"
```

OpenCode uses Bun. Reinstall from the lockfile, run the root lint, typecheck
the affected packages, build the single CLI artifact, and smoke the generated
version:

```bash
bun install --frozen-lockfile
bun run lint
bun --cwd packages/session-ui typecheck
bun --cwd packages/opencode typecheck
bun --cwd packages/opencode run script/build.ts --single
packages/opencode/dist/opencode-linux-x64/bin/opencode --version
```

The exact generated artifact is installed only after the build succeeds. Keep
the previous binary as a rollback copy and verify the installed SHA and
version afterward. The install wrapper may dispatch interactive invocations
to a separate attach helper; a version probe exercises the generated binary
directly.

## Lint interpretation

The root `bun run lint` is currently an error gate with a large warning
baseline from the upstream tree. The verified post-sync baseline on 2026-08-29
was 4,926 warnings and 0 errors from 3,320 files and 130 rules. The largest
categories were `no-unsafe-type-assertion` (1,970), `consistent-return` (897),
`no-unnecessary-type-assertion` (696), and `no-unused-vars` (424).

Do not silence those categories globally or rewrite unrelated upstream files to
make the count look smaller. Fix warnings in touched code with a narrow
justification, and use the machine-readable report to distinguish a new error
from inherited warning debt.

## Publication boundary

Publishing `host-guardrails` or its fast-forward `dev` ref to the personal
`fork` is separate from the local installation. Before pushing, verify the
active GitHub account and the exact remote ref, then run the repository's
pre-push checks. Never force-push or push a generated artifact as a substitute
for source history.
