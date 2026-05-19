---
name: git-workflow
description: >
  Git workflow using sandbox tools for branching, PRs, and conflict resolution.
  Use when the user asks about git strategy, branch management, PR workflow, or
  needs git operations in the sandbox environment.
---

# Git Workflow

Help with Git operations and workflow strategy using sandbox tools.

## Important: Tool-Based Execution

All git and file operations MUST use the sandbox tools. Never attempt direct git
access or shell execution outside of the provided tools.

| Operation | Tool |
| --- | --- |
| Clone / fetch | `git_clone` |
| Check state | `git_status` |
| View changes | `git_diff` |
| Read files | `read_file` |
| Write files | `write_file` |
| Commit | `git_commit` |
| Push | `git_push` |
| Branch, merge, other git ops | `bash` |
| Open PR | `github_create_pull_request` |

## Execution Flow

When performing Git operations, follow this sequence:

1. **Clone**: Use `git_clone` to ensure the repository is available in the sandbox.
2. **Assess**: Use `git_status` to check current branch and working tree state.
3. **Branch**: Use `bash` to create or switch branches (e.g., `git checkout -b fix/case-slug`).
4. **Edit**: Use `read_file` to inspect files, `write_file` to apply changes.
5. **Verify**: Use `bash` to run validation or tests. Use `git_diff` to review changes.
6. **Commit**: Use `git_commit` with a conventional commit message.
7. **Push**: Use `git_push` to push the branch to the remote.
8. **PR**: Use `github_create_pull_request` to open the pull request after push.
9. **Report**: Return a concise summary of the changes to the user.

## Error Recovery

If an operation fails due to conflicts, use `bash` to inspect
conflicted files (`git diff --name-only --diff-filter=U`). Stop the execution loop
immediately, report the conflicted files, and ask the user if they want you to
attempt automatic resolution or if they will resolve them manually.

## Branch Strategy

Use `git_status` and `bash` (with `git branch -a`) to inspect current state.

Recommend strategy based on project context:

- **Solo**: `main` + short-lived feature branches
- **Team**: `main` + `develop` + `feature/*` / `fix/*` branches

## PR Workflow

1. Use `git_diff` with `target: "main"` and `stat_only: true` to review what changed.
2. Draft a clear title and description.
3. Use `github_create_pull_request` after push with title, body, head branch, and base branch.
4. Always include the full PR URL in any summary or status update.

## Conflict Resolution

1. Use `bash` with `git diff --name-only --diff-filter=U` to find conflicted files.
2. Use `read_file` to read each conflicted file.
3. Understand both sides of the conflict.
4. Use `write_file` to resolve with minimal changes, preserving intent from both sides.
5. Use `bash` with `git add <files>` to mark as resolved.

## Non-Interactive Execution

All operations run in a headless sandbox. Always use non-interactive flags:

- Commits: use `git_commit` tool (handles `-m` flag automatically).
- Rebase continue: use `bash` with `GIT_EDITOR=true git rebase --continue`.
- Merge: use `bash` with `git merge --no-edit <branch>`.

Never attempt interactive operations. If the user requests one (like `git rebase -i`),
explain that it cannot run in the sandbox and provide the command they should run locally.
