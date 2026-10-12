# Security Policy

AgentOS takes the security, privacy, and integrity of your codebases and execution environments seriously. This document outlines our vulnerability reporting policy, security model, and containment guarantees.

---

## Supported Versions

Security updates and critical patches are actively supported on the following versions:

| Version | Supported          |
| :------ | :----------------- |
| `1.0.x` | :white_check_mark: |
| `< 1.0` | :x:                |

---

## Reporting a Vulnerability

If you discover a security vulnerability in AgentOS, **please do not open a public issue.** Instead, responsibly disclose it to the core maintainers:

- **Email**: Syed Najam Abbas (`dumbdevs@gmail.com`)
- **Subject**: `[SECURITY VULNERABILITY] AgentOS - <Brief Description>`
- **GitHub**: Submit a confidential report via GitHub Security Advisories if available.

### What to Include

To help us triage and resolve the issue quickly, please provide:
1. A clear description of the vulnerability and its potential impact.
2. Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
3. The affected component(s) (e.g., `packages/tools`, `packages/sandbox`, `packages/providers`).
4. Details of the operating system, shell, and Bun version used.

We will acknowledge receipt of your report within 48 hours, provide an assessment, and coordinate a fix and advisory prior to public disclosure.

---

## Security Model & Sandboxing Guarantees

AgentOS incorporates defense-in-depth principles designed for safe local execution:

1. **Isolated Worktree Sandboxes**:
   All filesystem writes and tool mutations take place within an isolated Git worktree (`packages/sandbox`). Live user workspaces remain untouched until automated verification passes and changes are reviewed or approved.

2. **Filesystem Traversal Defenses**:
   Path resolution (`packages/tools/src/workspace.ts`) strictly confines operations to the active workspace. Traversal attempts (`../`), URL schemes (`file://`, `data:`), UNC network shares, and internal `.git/` metadata access are blocked immediately.

3. **Command Security Matrix**:
   `packages/tools/src/policy.ts` validates all shell invocations against a 40+ rule safety policy. Destructive operations (`rm -rf`, `git push --force`, `git reset --hard`) and encoded execution wrappers (`powershell -enc`, `base64 | sh`) are blocked or require interactive operator confirmation.

4. **SSRF-Safe Web Reader**:
   Network fetching tools (`read_url`) reject loopback addresses (`127.0.0.1`), RFC 1918 private subnets, and cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`) across all redirect hops.

5. **Secret Redaction**:
   Execution traces recorded to `.agentos/traces/` automatically mask and redact provider API keys, GitHub tokens, AWS credentials, and private keys.

For detailed security mechanics, see [docs/safety.md](docs/safety.md).
