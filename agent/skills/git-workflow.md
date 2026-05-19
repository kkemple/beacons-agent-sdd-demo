---
name: git-workflow
description: >
  Reference for git operations in the sandbox. Covers branching, conflict
  resolution, and non-interactive execution.
---

# Git Workflow

## Tool Mapping

| Operation | Tool |
| --- | --- |
| Clone / fetch | `git_clone` |
| Check state | `git_status` |
| View changes | `git_diff` |
| Read files | `read_file` |
| Write files | `write_file` |
| Commit | `git_commit` |
| Push | `git_push` |
| Branch, merge, other | `bash` |
| Open PR | `github_create_pull_request` |

## Non-Interactive Execution

All operations run headless. Always use non-interactive flags:

- Commits: `git_commit` handles `-m` automatically.
- Rebase continue: `bash` with `GIT_EDITOR=true git rebase --continue`.
- Merge: `bash` with `git merge --no-edit <branch>`.

## Conflict Resolution

1. `bash`: `git diff --name-only --diff-filter=U` to find conflicts.
2. `read_file` each conflicted file.
3. `write_file` the resolution.
4. `bash`: `git add <files>` to mark resolved.

Report conflicts to the user rather than guessing at resolution.
