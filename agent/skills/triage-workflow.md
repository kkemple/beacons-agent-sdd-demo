---
name: triage-workflow
description: >
  End-to-end support-case triage flow for the demo repository. Use for every
  incoming remediation case: assess current state, report findings, wait for
  approval, optionally apply code changes through the git workflow, and return a
  structured outcome report.
---

# Triage Workflow

Use this workflow for every support case in `kkemple/beacons-website-sdd-demo`.

The goal is to keep triage separate from remediation: first assess and report the
state, then only make code changes when the user explicitly asks for and approves
them.

## Phase 1 — Assess State

1. Clarify the reported problem and affected website behavior.
2. Use `github_search_repository` first to gather related issues, pull requests,
   code matches, and file excerpts.
3. If an existing GitHub issue or pull request appears relevant, use
   `github_get_issue` or `github_get_pull_request` to inspect it before drawing
   conclusions.
4. If `github_search_repository` does not surface sufficient context (no relevant
   issues, PRs, or code matches), clone the repository using `git_clone` and
   investigate the source directly:
   - Use `bash` with `find` or `grep` to locate relevant files.
   - Use `read_file` to inspect the suspected affected code.
   - This is read-only investigation — no edits, branches, or commits during assessment.
5. Identify the likely affected area, relevant files, similar past work, and any
   uncertainty.
6. Return the assessment to the user before making any changes.

### Assessment Response Format

Use a light table structure:

| Area | Finding |
| --- | --- |
| Reported behavior | Brief restatement of the case in product/user terms. |
| Likely affected area | Components, routes, files, or systems implicated by search results. |
| Existing GitHub context | Related issues/PRs, with numbers and URLs when available. |
| Evidence | Specific search results, file excerpts, or raw observations that support the assessment. |
| Confidence | High / Medium / Low, with one short reason. |
| Proposed next step | No-code recommendation, investigation step, or code remediation plan. |

End the assessment with an explicit question, for example:

> Would you like me to proceed with code updates for this remediation plan?

## Phase 2 — Wait for User Direction

Do not edit files, commit, push, open a PR, close issues, or make other durable
changes during triage. Cloning and reading files for investigation is permitted.

Proceed only when the user explicitly asks for code updates, remediation, branch
work, or PR creation. If the request is ambiguous, ask for confirmation.

## Phase 3 — Code Remediation Flow

When the user requests code updates:

1. Load and follow the `git-workflow` skill.
2. Use `git_clone` to ensure the repository is available in the sandbox.
3. Use `git_status` to check repository state before making changes.
4. Use `bash` to create a case-scoped branch:
   - `fix/<short-case-slug>`
   - `chore/<short-case-slug>`
   - `feat/<short-case-slug>`
5. Use `read_file` to inspect affected files, `write_file` to apply the smallest safe fix.
6. Use `bash` to validate with the most relevant available checks.
7. Use `git_diff` to review changes before committing.
8. Use `git_commit` with a clear conventional commit message.
9. Use `git_push` to push the branch.
10. Use `github_create_pull_request` after the branch is pushed. Save the returned
    `number` from the response.
11. Poll `github_get_preview_url` with the PR number from step 10 until it returns
    a successful preview URL. Retry every 10–15 seconds for up to 2 minutes. Do
    not respond to the user until the preview URL is available.
12. Once the preview URL is ready, deliver the final report (Phase 5) with the
    preview link so the user can evaluate the fix visually.

Do not send intermediary status updates during steps 1–11. The user should receive
a single response containing the complete remediation report with the preview URL.

If any sandbox tool fails, report the error output and ask the user how to proceed
rather than retrying silently.

Never claim validation passed unless raw command output confirms it.

## Phase 4 — Issue / PR Updates

Use GitHub tools for API operations:

- `github_create_issue` when the case needs a new tracked issue.
- `github_get_issue` before relying on existing issue state.
- `github_update_issue` when the user asks to change issue metadata or status.
- `github_create_pull_request` after pushing a remediation branch.
- `github_get_pull_request` before relying on existing PR state.
- `github_update_pull_request` when the user asks to change PR title, body, state,
  base, or maintainer-modification settings.
- `github_merge_pull_request` when the user asks to merge a PR (squash by default, deletes head branch).

Require explicit approval before mutating GitHub state.

## Phase 5 — Final User Report

After remediation work, return a concise structured report. Use a light table and
include links where available.

### Remediation Report Format

| Area | Result |
| --- | --- |
| Summary | One or two sentences describing what changed and why. |
| Branch | Branch name and pushed status. |
| Pull request | PR number and URL, or explain why no PR was opened. |
| Preview | Vercel preview deployment URL, or note if deployment is pending/failed. |
| Files changed | Bullet list or compact comma-separated list of touched files. |
| Validation | Exact checks run and whether each passed, failed, or was skipped. |
| Remaining risks | Known uncertainty, edge cases, or unverified behavior. |
| Manual follow-up | Any user/product/reviewer action still needed. |

If no code changes were made, use this shorter report:

| Area | Result |
| --- | --- |
| Outcome | What was assessed or decided. |
| GitHub updates | Any issues/PRs created or updated. |
| Next step | Recommended user action or approval request. |

## Reporting Rules

- Base all findings on observed tool output.
- Include GitHub issue and PR numbers with URLs when available.
- Keep tables compact; prefer short rows over long prose.
- Separate facts from recommendations.
- State uncertainty plainly instead of overclaiming.
