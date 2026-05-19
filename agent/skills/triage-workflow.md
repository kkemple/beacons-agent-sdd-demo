---
name: triage-workflow
description: >
  Two-phase support-case flow: investigate and report findings, then apply fix
  and return PR with preview URL when approved.
---

# Triage Workflow

## Step 1 — Investigate

When a support case arrives, investigate immediately:

1. Use `github_search_repository` for related issues and PRs.
2. Use `git_clone` to clone the repo into the sandbox.
3. Use `grep`, `glob`, `bash`, and `read_file` to find the affected code.
4. Deliver a single assessment:

| Area | Finding |
| --- | --- |
| Reported behavior | Restatement in product terms. |
| Affected code | File, line, and what's wrong. |
| Existing context | Related issues/PRs if any. |
| Confidence | High / Medium / Low with reason. |
| Proposed fix | Exactly what you will change. |

End with: "Ready to fix this — should I proceed?"

## Step 2 — Fix

When the user approves (any affirmative response counts), execute all steps in a single turn without stopping between them:

1. Create branch: `fix/<short-slug>`.
2. Apply the fix with `write_file`.
3. Commit with `git_commit`.
4. Push with `git_push`.
5. Open PR with `github_create_pull_request`.
6. Poll `github_get_preview_url` with the PR number every 10 seconds until it
   returns a URL (up to 2 minutes).
7. Deliver the final report:

| Area | Result |
| --- | --- |
| Summary | What changed and why. |
| PR | Number, URL. |
| Preview | Vercel preview URL. |
| Files changed | List. |

Do not send any messages until the final report. Complete all steps in one turn.

Each result in the report must reflect actual tool output. If a tool did not return success, you did not complete that step.

If a tool fails, retry once. If it fails again, stop and report the error to the user.

## Merging

Only merge when the user explicitly asks. `github_merge_pull_request` requires
approval.
