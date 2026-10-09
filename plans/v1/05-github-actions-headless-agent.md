# Plan 05: Headless CI/CD, Automated PR Review, and Issue Resolution

**Status:** Proposed Architecture  
**Inspired By:** OpenCode GitHub Agent (`/opencode`), Qwen Code Headless Workflows  
**Target Packages:** `apps/cli`, `.github/workflows`, `packages/agent-runtime`  
**Strict Directives:** Planning only — zero production code modifications.

---

## 1. Motivation & Problem Statement

Currently, AgentOS is executed solely as an interactive local terminal tool. In contrast, modern coding agents (such as **OpenCode** and **Qwen Code**) operate seamlessly across both local development environments and remote CI/CD pipelines:
1. **Automated Pull Request Code Review**: The agent runs automatically on opened PRs, running verification builds, analyzing the diff with `ReviewSubagent`, and posting high-signal review comments.
2. **Issue-to-PR Autonomous Resolution**: A maintainer comments `/agentos fix` on a bug report; the agent checks out a branch, reproduces the bug, develops a fix, verifies tests pass, and opens a pull request with the complete solution.
3. **Headless Execution Mode**: Allows scripts, orchestrators, and webhooks to execute AgentOS without requiring an interactive TTY.

---

## 2. Architecture & CI/CD Pipeline

```mermaid
flowchart TD
    GH[GitHub Issue / Pull Request] --> Event[GitHub Actions Webhook Event]
    Event --> AuthCheck{Maintainer Permission Check}
    AuthCheck -->|Authorized| Runner[GitHub Actions Runner (Ubuntu)]
    AuthCheck -->|Unauthorized| Deny[Reject Execution]
    
    Runner --> Setup[Setup Bun + Checkout Code]
    Setup --> Headless[agentos run --headless]
    
    subgraph AgentOS Headless Run
        Headless --> FP[File Picker Agent]
        FP --> Planner[Lightweight Planner]
        Planner --> Editor[Editor Loop]
        Editor --> Verifier[bun test / build]
        Verifier --> Reviewer[Review Subagent]
    end
    
    Reviewer -->|PR Review Workflow| Comment[Post Structured PR Review Comment]
    Reviewer -->|Issue Fix Workflow| Branch[Create Branch & Open Pull Request]
```

---

## 3. Headless CLI Engine Specification

Extend `apps/cli` to support non-interactive automation:

```bash
agentos run \
  --headless \
  --goal "Fix failing unit test in packages/providers/tests/openrouter.test.ts" \
  --permission-mode auto \
  --format json \
  --auto-commit \
  --output-file ./agent-run-summary.json
```

### Headless CLI Flag Specifications:
- `--headless`: Disables React/Ink interactive terminal UI; streams structured logs to `stdout`/`stderr`.
- `--goal <string>`: The prompt or task description.
- `--permission-mode auto`: Automatically approves tool calls that pass `ToolPolicy` and `PermissionGuard` sandbox boundaries.
- `--format json | text`: Controls the output format. In `json` mode, emits a machine-readable `RunSummary` object.
- `--auto-commit`: Automatically creates a git commit on the active branch if verification succeeds with exit code 0.
- `--max-turns <n>`: Caps the maximum turns allowed in CI (default: 15).
- `--max-wall-time <ms>`: Hard timeout for CI step (default: 300,000ms = 5 minutes).

### Exit Codes:
- `0`: Task completed successfully, verification passed (exit 0), review approved.
- `1`: Task failed or verification commands returned non-zero.
- `2`: Policy violation, unauthorized command attempt, or execution timeout.

---

## 4. GitHub Actions Workflows

### 4.1. Automated PR Code Review (`.github/workflows/agentos-review.yml`)

Runs on every incoming Pull Request to provide instant code review:

```yaml
name: AgentOS Pull Request Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Set up Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install Dependencies
        run: bun install

      - name: Run AgentOS Reviewer
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          git diff origin/${{ github.base_ref }}...HEAD > pr.diff
          bun run apps/cli/src/index.ts review \
            --diff pr.diff \
            --post-github-comment \
            --pr-number ${{ github.event.pull_request.number }}
```

### 4.2. Automated Issue Resolver (`.github/workflows/agentos-fix.yml`)

Triggered when a repository collaborator comments `/agentos fix` on an issue:

```yaml
name: AgentOS Issue Resolver

on:
  issue_comment:
    types: [created]

jobs:
  resolve-issue:
    if: startsWith(github.event.comment.body, '/agentos fix')
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write

    steps:
      - name: Verify Collaborator Permissions
        uses: actions/github-script@v7
        with:
          script: |
            const author = context.payload.comment.user.login;
            const repo = context.repo;
            const res = await github.rest.repos.getCollaboratorPermissionLevel({
              ...repo,
              username: author,
            });
            const perm = res.data.permission;
            if (!['admin', 'write'].includes(perm)) {
              core.setFailed(`User @${author} does not have write access to trigger AgentOS`);
            }

      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Set up Bun
        uses: oven-sh/setup-bun@v2

      - name: Install Dependencies
        run: bun install

      - name: Execute Autonomous Fix
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          BRANCH_NAME="agentos/fix-issue-${{ github.event.issue.number }}"
          git checkout -b $BRANCH_NAME
          
          bun run apps/cli/src/index.ts run \
            --headless \
            --goal "${{ github.event.issue.title }}: ${{ github.event.issue.body }}" \
            --permission-mode auto \
            --auto-commit
            
          git push origin $BRANCH_NAME
          gh pr create \
            --title "fix: resolve #${{ github.event.issue.number }} via AgentOS" \
            --body "Automated fix generated and verified by AgentOS for #${{ github.event.issue.number }}." \
            --head $BRANCH_NAME
```

---

## 5. Security & Prompt Injection Defenses in CI

Executing autonomous agents in GitHub Actions requires rigorous security boundaries:
1. **Collaborator Authorization Gate**: Workflow fails immediately if the user who triggered the comment does not have `write` or `admin` permissions on the repository.
2. **Untrusted Data Isolation**: Issue titles and PR comments are treated as untrusted data. Base prompt instruction enforces that user instructions cannot override repository safety rules or execute external network exfiltration.
3. **Secret Masking**: Provider API keys (`ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`) and `GITHUB_TOKEN` are masked from all console outputs and artifact logs.

---

## 6. Implementation Roadmap (Post-Approval)

| Step | Target File | Description |
| :--- | :--- | :--- |
| 5.1 | `apps/cli/src/cli/headless.ts` | Implement headless execution runner and JSON summary emitter |
| 5.2 | `apps/cli/src/index.ts` | Wire `--headless`, `--goal`, `--auto-commit` command-line flags |
| 5.3 | `packages/agent-runtime/src/loop/ReviewSubagent.ts` | Add GitHub PR comment formatting utility |
| 5.4 | `.github/workflows/agentos-review.yml` | Add automated PR code review workflow |
| 5.5 | `.github/workflows/agentos-fix.yml` | Add `/agentos fix` issue resolver workflow |
| 5.6 | `apps/cli/tests/headless-runner.test.ts` | Add unit tests for headless execution exit codes and JSON outputs |
