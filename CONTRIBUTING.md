# Contributing to AgentOS

Thank you for your interest in contributing to **AgentOS**! We welcome bug reports, feature requests, documentation improvements, evaluation benchmarks, and code contributions from the community.

---

## 1. Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for everyone. Please be respectful, constructive, and collaborative in all discussions and pull requests.

---

## 2. Development Setup

### Prerequisites

- **[Bun](https://bun.sh)**: v1.1.0 or higher
- **Git**: v2.30 or higher
- **Node.js**: v18+ (optional, Bun is the primary runtime)
- **TypeScript**: v5.0+

### Clone & Install

```bash
# Clone the repository
git clone https://github.com/syednajamabbas/agent-os.git
cd agent-os

# Install dependencies across all workspace packages
bun install

# Build the CLI application
bun run build
```

### Linking the CLI Locally

To run `agentos` globally from your current source tree:

```bash
bun link
```

Now you can invoke `agentos` directly from any terminal.

---

## 3. Monorepo Organization

AgentOS is organized as a Bun workspace monorepo:

| Directory | Scope |
| :--- | :--- |
| `apps/cli` | Commander-based CLI, Ink interactive terminal UI, commands, and REPL. |
| `apps/desktop` | Electron + React 19 desktop application with visual diffs and key vault. |
| `packages/agent-runtime` | Core `AgentLoop`, `AgentRuntime`, `LightweightPlanner`, `ProjectVerifier`, `SubagentRegistry`, and `TeamCoordinator`. |
| `packages/providers` | Unified LLM adapters (Anthropic, OpenAI, Gemini, DeepSeek, Ollama, LM Studio, FakeScripted). |
| `packages/tools` | System & workspace tools, command policy engine, SSRF-safe web reader, terminal multiplexer. |
| `packages/sandbox` | Isolated Git worktrees, process lifecycle, environment variable sanitization, shadow snapshots. |
| `packages/patch-engine` | Unified diff generation, SHA-256 pre-image conflict validation, atomic rollback. |
| `packages/repository` | Source code intelligence, Tree-sitter AST parsing, `RepoMap` ranking, graph centrality. |
| `packages/runtime-audit` | Dependency graph inspection, reachability verification, boundary import checks. |
| `packages/shared` | Common utilities, JSON logger, logging event bus, base error classes. |
| `packages/config` | Hierarchical configuration management, workspace trust manager. |
| `packages/sessions` | SQLite session persistence, turn tracking, run history. |
| `packages/events` | Append-only event store and typed event definitions. |
| `packages/metrics` | Telemetry metrics registry, counters, and timers. |
| `evals/` | Deterministic benchmark tasks, fixture repositories, and evaluation runner. |
| `archive/` | Quarantined legacy and experimental packages kept for historical reference. |

---

## 4. Running Tests & Quality Gates

AgentOS enforces strict quality gates before any pull request can be merged.

### Run Unit & Integration Tests

```bash
bun test
```

### Validate TypeScript Types

```bash
bunx tsc --noEmit
```

### Check Documentation Links & Snippets

```bash
bun run scripts/check-docs.ts
```

### Execute the Full Release Gate

The release gate runs typechecking, the entire test suite, the CLI build, and the evaluation smoke test:

```bash
bun run gate
```

All 4 steps must pass with zero failures.

---

## 5. Architectural Principles for Pull Requests

When proposing changes, adhere to the following principles:

1. **Truthful Verification Over Blind Generation**:
   Never bypass test execution or write directly to user workspaces before verification succeeds.
2. **Deterministic & Isolated**:
   Filesystem modifications must occur inside `packages/sandbox` Git worktrees until confirmed.
3. **No Secret Leaks**:
   Ensure all telemetry and log traces redact API keys, tokens, and credentials.
4. **Preserve Compatibility**:
   Multi-harness instruction parsing (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, etc.) must remain backward-compatible.
5. **No Dead Code**:
   Do not introduce unused packages or circular dependencies. Verify with `agentos doctor runtime`.

---

## 6. Submitting a Pull Request

1. **Fork** the repository and create a feature branch (`git checkout -b feat/my-improvement`).
2. Make your changes with clear, descriptive commit messages following Conventional Commits (e.g., `feat:`, `fix:`, `docs:`, `test:`).
3. Add unit tests for any new logic or tool.
4. Run the release gate: `bun run gate`.
5. Push to your fork and submit a Pull Request against `main`.
6. Explain the rationale, design decisions, and include test output in your PR description.

---

## 7. Reporting Issues

Please open an issue on GitHub with:
- A descriptive title.
- Clear reproduction steps.
- Your OS, Bun version, and model provider configuration.
- Expected behavior vs. actual behavior.

For security-sensitive issues, please refer to [SECURITY.md](SECURITY.md).

