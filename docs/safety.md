# Safety & Security Architecture

AgentOS is built with defense-in-depth security principles to protect developer source code, prevent accidental data loss, isolate untrusted outputs, and redact sensitive credentials.

---

## 1. Granular Permission Modes

AgentOS supports four permission levels:

1. **`plan`**:
   - The agent may only view files, inspect directories, grep code, and read symbols.
   - All filesystem writes, edits, and external shell executions are rejected immediately.
2. **`manual` (Default)**:
   - Changes are strictly isolated in a sandboxed Git worktree (`packages/sandbox`).
   - The user's active workspace files remain pristine until verification succeeds and changes are explicitly approved in the diff review prompt.
   - Requires operator confirmation for every file modification and command.
3. **`acceptEdits`**:
   - Automatically approves file modifications while requiring explicit confirmation for shell commands.
4. **`auto`**:
   - Unattended automation mode (ideal for CI/CD runners).
   - Automatically applies verified file edits and safe inspection commands (`git status`, `git diff`, `bun test`, `tsc`), while blocking destructive commands.

---

## 2. Interactive Approvals

High-impact actions prompt for explicit developer confirmation via terminal UI (`ApprovalView`) or the Desktop App:

- **Destructive Command Warnings**: Operations such as `rm -rf`, `git reset --hard`, `git push --force`.
- **Network Invocations**: Commands attempting outbound connections via `curl`, `wget`, or remote script execution (`sh -c`).
- **External Dependencies**: Automated execution of `npm install` or package additions.
- **Large Multi-File Diffs**: Diffs modifying more than 10 files or altering critical build configuration.

---

## 3. Command Security Matrix

The command policy engine in `packages/tools/src/policy.ts` categorizes and filters shell commands against 40+ security rules:

| Command Type | Policy | Behavior |
| :--- | :--- | :--- |
| **Verification & Inspection** (`git status`, `git log`, `npm test`, `bun test`, `tsc`) | Allowed | Executes automatically in sandbox |
| **Destructive Git** (`git push --force`, `git clean -fdx`, `git reset --hard`) | Blocked / Needs Approval | Generates high-risk warning prompt |
| **Network Download** (`curl http://...`, `wget ...`, `nc ...`) | Needs Approval | Warns user of potential external data transfer |
| **Encoded Shell Execution** (`powershell -enc ...`, `base64 -d \| sh`) | Blocked | Blocked immediately as suspicious evasion |
| **Workspace Escapes** (`cd .. && rm ...`) | Blocked | Executed only with working directory locked to sandbox |

---

## 4. Path Traversal & Filesystem Containment

The `WorkspaceManager` (`packages/tools/src/workspace.ts`) enforces rigid filesystem containment:

- Rejects relative traversals (`../`).
- Rejects dangerous URI schemes (`file://`, `data:`).
- Rejects Windows device paths (`\\.\`, `\\?\`, `CON`, `PRN`, `NUL`).
- Rejects UNC network shares (`\\server\share`).
- Blocks direct modifications to `.git/` repository internal metadata.

---

## 5. SSRF-Safe Web Reader

The `read_url` tool strictly blocks Server-Side Request Forgery:
- **Loopback addresses**: `127.0.0.0/8`, `localhost`, `::1`
- **Private RFC 1918 subnets**: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- **Link-local & cloud metadata**: `169.254.169.254`, `metadata.google.internal`
- Re-evaluates target IPs across all redirect hops to prevent open-redirect bypasses.

---

## 6. Automated Secret Redaction

AgentOS automatically strips credentials, API keys, and sensitive tokens from run traces and terminal outputs before writing to `.agentos/traces/`:

- **Pattern Matching**:
  - OpenAI / Anthropic keys (`sk-...`, `sk-ant-...`)
  - Google Gemini keys (`AIza...`)
  - GitHub Personal Access Tokens (`ghp_...`, `gho_...`)
  - AWS access keys and bearer tokens
  - Private keys (`-----BEGIN RSA PRIVATE KEY-----`)
- **Key-Based Redaction**:
  - Payload keys named `password`, `token`, `secret`, `authorization`, `credentials` are replaced with `[REDACTED]`.
