# Safety & Security Architecture

AgentOS is built with defense-in-depth security principles to protect developer source code, prevent accidental data loss, isolate untrusted outputs, and redact secrets.

---

## 1. Permission Levels

AgentOS supports three granular permission modes:

1. **`read-only`**:
   - The agent may only view files, inspect directories, grep code, and read symbols.
   - All filesystem writes, edits, and external shell executions are rejected immediately.
2. **`workspace-write` (Default)**:
   - Changes are strictly isolated in a sandboxed Git worktree (`packages/sandbox`).
   - The user's active workspace files remain pristine until verification succeeds and changes are reviewed.
   - Non-destructive commands (`git diff`, `bun test`, `tsc`) execute automatically in the sandbox.
3. **`full-access`**:
   - Unrestricted command execution and workspace writes. Intended only for headless CI or containerized runner environments.

---

## 2. Interactive Approvals

High-impact actions prompt for explicit developer confirmation via terminal UI (`ApprovalView`):

- **Destructive Command Warnings**: Operations such as `rm -rf`, `git reset --hard`, `git push --force`.
- **Network Invocations**: Commands attempting outbound connections via `curl`, `wget`, or remote script execution (`sh -c`).
- **External Dependencies**: Automated execution of `npm install` or package additions.
- **Large Multi-File Diffs**: Diffs modifying more than 10 files or altering critical build configuration.

---

## 3. Command Security Matrix

The command policy engine in `packages/tools/src/policy.ts` categorizes and filters shell commands:

| Command Type | Policy | Behavior |
| :--- | :--- | :--- |
| **Verification & Inspection** (`git status`, `git log`, `npm test`, `bun test`, `tsc`) | Allowed | Executes automatically in sandbox |
| **Destructive Git** (`git push --force`, `git clean -fdx`, `git reset --hard`) | Blocked / Needs Approval | Generates high-risk warning prompt |
| **Network Download** (`curl http://...`, `wget ...`, `nc ...`) | Needs Approval | Warns user of potential external data transfer |
| **Encoded Shell Execution** (`powershell -enc ...`, `base64 -d \| sh`) | Blocked | Blocked immediately as suspicious evasion |
| **Workspace Escapes** (`cd .. && rm ...`) | Blocked | Executed only with working directory locked to sandbox |

---

## 4. Path Traversal & Filesystem Containment

The `WorkspaceManager` enforces rigid filesystem containment:

- Rejects relative traversals (`../`).
- Rejects URI schemes (`file://`, `data:`).
- Rejects Windows device paths (`\\.\`, `\\?\`, `CON`, `NUL`).
- Rejects UNC network shares (`\\server\share`).
- Blocks direct modifications to `.git/` repository internals.

---

## 5. Secret Redaction Engine

AgentOS automatically strips credentials, API keys, and sensitive tokens from run traces and terminal outputs before writing to `.agentos/traces/`:

- **Pattern Matching**:
  - OpenAI / Anthropic keys (`sk-...`, `sk-ant-...`)
  - GitHub Personal Access Tokens (`ghp_...`, `gho_...`)
  - AWS access keys and bearer tokens
  - Private keys (`-----BEGIN RSA PRIVATE KEY-----`)
- **Key-Based Redaction**:
  - Keys named `password`, `token`, `secret`, `authorization`, `credentials` are replaced with `[REDACTED]`.
