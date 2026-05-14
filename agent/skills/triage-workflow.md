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

Start with the assessment flow already defined in the system prompt.

1. Clarify the reported problem and affected website behavior.
2. Use `search_repository` first to gather related issues, pull requests, code
   matches, and file excerpts.
3. If an existing GitHub issue or pull request appears relevant, use `get_issue`
   or `get_pull_request` to inspect it before drawing conclusions.
4. Identify the likely affected area, relevant files, similar past work, and any
   uncertainty.
5. Return the assessment to the user before making any changes.

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

Do not edit files, clone the repo, commit, push, open a PR, close issues, or make
other durable changes during triage.

Proceed only when the user explicitly asks for code updates, remediation, branch
work, or PR creation. If the request is ambiguous, ask for confirmation.

## Phase 3 — Code Remediation Flow

When the user requests code updates:

1. Load and follow the `git-workflow` skill.
2. Use the sandbox and `git` for repository clone/edit/test/commit/push work.
3. Check repository state before changes with non-interactive commands.
4. Create a case-scoped branch name, such as:
   - `fix/<short-case-slug>`
   - `chore/<short-case-slug>`
   - `feat/<short-case-slug>`
5. Apply the smallest safe fix that addresses the assessed behavior.
6. Validate with the most relevant available checks.
7. Commit using a clear conventional commit message.
8. Push the branch.
9. Use `create_pull_request` after the branch is pushed.

Never claim validation passed unless raw command output confirms it.

## Phase 4 — Issue / PR Updates

Use Octokit-backed tools for GitHub API operations:

- `create_issue` when the case needs a new tracked issue.
- `get_issue` before relying on existing issue state.
- `update_issue` when the user asks to change issue metadata or status.
- `create_pull_request` after pushing a remediation branch.
- `get_pull_request` before relying on existing PR state.
- `update_pull_request` when the user asks to change PR title, body, state, base,
  or maintainer-modification settings.

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
