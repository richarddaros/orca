# Orca fork sync

`richarddaros/orca` is a fork of `stablyai/orca`. This runbook keeps it current
and keeps the fork's own work in one line.

## Branch model

| Branch                       | Role                                                                        | Who moves it                                                    |
| ---------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `main`                       | Exact mirror of upstream `main`. Never carries fork commits.                | Only `gh repo sync richarddaros/orca --branch main`.            |
| `feat/agent-hub-poc`         | The fork's line: every fork branch, merge, sync and `rd/v*` tag lands here. | Pull requests and the fast-forward push of `fork:sync --merge`. |
| `chore/sync-upstream-<date>` | One upstream merge, reviewed as a pull request.                             | `fork:sync`.                                                    |

`main` is protected with `lock_branch`, `enforce_admins` and `allow_fork_syncing`,
with force pushes and deletion disabled. A push to it is rejected with
`GH006 ... Cannot change this locked branch`, even from the owner's credentials,
while the GitHub "Sync fork" action and `gh repo sync` still fast-forward it. To
inspect or restore the setting:

```bash
gh api repos/richarddaros/orca/branches/main/protection
gh api -X PUT repos/richarddaros/orca/branches/main/protection --input protection.json
```

where `protection.json` sets `required_status_checks`, `required_pull_request_reviews`
and `restrictions` to `null`, `enforce_admins`, `lock_branch` and
`allow_fork_syncing` to `true`, and `allow_force_pushes` and `allow_deletions` to
`false`.

## Commands

Run them with Node 24 and the pnpm pinned in `package.json`. `corepack pnpm`
downloads the pinned version without replacing the global one; a different pnpm
rewrites `pnpm-lock.yaml` with an `@pnpm/exe` entry that must not be committed.

```bash
corepack pnpm fork:status               # mirror lag, missing upstream commits, local checkout lag
corepack pnpm fork:sync                 # sync main, merge it in a new worktree, gate, push, open the PR
corepack pnpm fork:sync --merge         # same, then fast-forward feat/agent-hub-poc to the sync commit
corepack pnpm fork:update-local         # fast-forward this checkout and reinstall
```

`fork:sync` never touches the checkout it runs from. It creates the sync worktree
at `<main checkout>-sync/chore-sync-upstream-<date>` and merges there, so a
running Orca dev keeps working until `fork:update-local` runs in its checkout.

Two conflicts resolve themselves:

- `pnpm-lock.yaml`: upstream's lockfile, with only the hashes of patches the
  fork changed (`patch_hash` is the sha256 of the patch file) replaced.
  `pnpm install --frozen-lockfile` then proves the result.
- `AGENTS.md`: upstream's file plus the block between the
  `<!-- fork:richarddaros/orca:start -->` and `:end -->` markers.

Any other conflict stops the run with the list of files. Resolve them in the sync
worktree, keeping upstream behavior and re-applying the fork change, then run
`corepack pnpm fork:sync --continue [--merge]` there.

The gates before the push are `pnpm install --frozen-lockfile`, `pnpm tc`,
`pnpm test:agent-hub`, `pnpm test:fork-sync` and every fork-changed `*.test.*`
under `src/` with two workers. The pull request body lists every file that still
differs from upstream; it should hold only fork files.

## Keeping the local Orca current

1. `corepack pnpm fork:sync --merge` from any checkout of the repo.
2. In the checkout that runs Orca dev, at a moment the app can restart:
   `corepack pnpm fork:update-local`.
3. Restart Orca dev with `corepack pnpm dev`.

Upstream lands about 150 to 300 commits a day, so syncing every one or two days
keeps conflicts small.

## Versions

Tag fork releases on `feat/agent-hub-poc` with annotated tags named
`rd/v<upstream version>-<n>`, for example `rd/v1.4.219-1`. Do not use `v*`,
which collides with upstream tags, or `mobile-*-v*`, which upstream release
workflows match. GitHub Actions is disabled on the fork, so pushed tags start no
workflow.

## Recovery

- The sync worktree is disposable: `git worktree remove <path>` and
  `git branch -D chore/sync-upstream-<date>` undo an unpublished sync.
- A merged sync is one merge commit on `feat/agent-hub-poc`; revert it with
  `git revert -m 1 <sha>` on a branch and a pull request. Never reset or
  force-push the line.
- `fork:update-local` only fast-forwards. If the new build misbehaves,
  `git switch --detach ORIG_HEAD` and `corepack pnpm install --frozen-lockfile`
  run the previous commit; `git switch feat/agent-hub-poc` returns to the line.
