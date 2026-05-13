---
name: github-code-remediation
description: "Use GitHub safely for code-remediation cases: fetch context, branch per case, patch minimally, validate, and gate writes/PRs behind approval."
---

# GitHub Code Remediation

Use this skill when a Slack case needs repository investigation or a code fix in GitHub.

## Safety Rules

- Never reveal, log, summarize, or echo GitHub tokens or environment variables.
- Treat repository writes as approval-gated: branch creation, commits, pull requests, labels, comments, and deployment-triggering changes require explicit human approval.
- Prefer read-only GitHub inspection until the issue is understood.
- Work on a branch per case. Never push directly to the default branch.
- Keep patches small and tied to the reported behavior.
- Validate before proposing a PR. If validation is impossible, state exactly what is missing.

## Case Loop

1. Normalize the Slack case into: reporter, thread, repository, branch/base, affected behavior, reproduction details, expected result, and urgency.
2. Fetch GitHub context: issue/PR if provided, repository metadata, target branch, relevant files, recent commits, and CI status when available.
3. Reproduce or minimize the issue using the narrowest available command.
4. Plan the fix in terms of observable behavior and touched files.
5. Apply the smallest patch in an isolated workspace or branch.
6. Run targeted validation first; broaden only when necessary.
7. Report back with: changed files, validation results, branch/PR status, and any manual follow-up.

## GitHub Defaults

- Repository comes from the case if specified; otherwise from project configuration.
- Base branch should be explicit. If unknown, inspect repository metadata before assuming.
- Branch names should be stable and case-scoped, for example `case/<slack-thread-or-issue>-short-summary`.
- PR titles should describe the user-visible fix, not internal implementation details.

## Output Shape

When reporting to Slack, use concise progress updates:

- `Investigating <area>`
- `Found likely cause in <file>`
- `Patched <behavior>`
- `Validation passed: <command>`
- `Needs approval: <branch/PR/deploy action>`
