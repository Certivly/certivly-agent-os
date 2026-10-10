# Plan 05: External Repository Librarian Subagent

**Document:** `plans/v2/05-external-repo-librarian.md`  
**Date:** 2026-10-09  
**Status:** Implementation Specification  
**Benchmark Source:** Freebuff (`agents/librarian/`)

---

## 1. Problem Statement & Motivation

When software engineers develop features, they constantly reference external open-source codebases:
- *"How does Tailwind implement plugin extraction?"*
- *"What exact types does `@modelcontextprotocol/sdk` expose for tools?"*
- *"Check how OpenCode handles token bounds in tool outputs."*

Currently, an agent without external repo access either hallucinates outdated API signatures, or forces the user to manually clone the repository into their workspace, risking git contamination, dependency clashes, and cluttered project roots.

---

## 2. Freebuff Architecture Pattern (`librarian/`)

Freebuff provides a dedicated **Librarian Subagent**:
1. **Isolated Shallow Clone**: Clones the requested repository with `--depth 1 --single-branch` into an ephemeral scratch location (`~/.agentos/clones/<owner>-<repo>-<id>/`).
2. **Read-Only Code Intelligence**:
   - Inspects `package.json` / `Cargo.toml` / `pyproject.toml` entry points.
   - Traces exported symbols, types, and architecture patterns.
   - Uses `rg` (ripgrep) and `find` to pinpoint relevant source files.
3. **Structured Knowledge Extraction**:
   - Returns a structured payload:
     ```json
     {
       "answer": "Detailed technical explanation...",
       "relevantFiles": ["/tmp/clones/repo/src/engine.ts"],
       "codeSnippets": [ ... ],
       "cloneDir": "/tmp/clones/repo"
     }
     ```
4. **Workspace Protection Guarantees**:
   - The clone is strictly isolated outside the user's project root.
   - Zero files are copied into the user's workspace without explicit permission.
   - Automatic cleanup deletes cloned artifacts after session termination.

---

## 3. AgentOS Engineering Specification

### 3.1. Subsystem Architecture: `packages/agent-runtime/src/exploration/LibrarianSubagent.ts`

```typescript
export interface LibrarianQuery {
  repoUrl: string;                  // GitHub or Git repository URL
  question: string;                 // Technical query or feature investigation
  branchOrTag?: string;             // Optional branch, tag, or commit hash
}

export interface LibrarianResult {
  answer: string;
  relevantFiles: Array<{ path: string; summary: string }>;
  codeSnippets: Array<{ path: string; lines: string; code: string }>;
  cloneDir: string;
}

export class LibrarianSubagent {
  constructor(
    private model: Model,
    private scratchRoot?: string
  ) {}

  public async investigate(query: LibrarianQuery): Promise<LibrarianResult>;
  public async cleanup(cloneDir: string): Promise<void>;
}
```

### 3.2. Dedicated Tool: `inspect_external_repo`

We expose a first-class tool to AgentOS:
```json
{
  "name": "inspect_external_repo",
  "description": "Shallow-clone an external GitHub repository into an isolated sandbox to inspect its architecture, code patterns, APIs, and types.",
  "parameters": {
    "type": "object",
    "properties": {
      "repoUrl": { "type": "string", "description": "GitHub repo URL (e.g. https://github.com/owner/repo)" },
      "question": { "type": "string", "description": "Specific technical question or API to investigate" }
    },
    "required": ["repoUrl", "question"]
  }
}
```

---

## 4. Security & Isolation Controls

1. **Network & Protocol Whitelist**: Only `https://github.com/` and safe git URLs are permitted; local filesystem paths and arbitrary protocols (`file://`, `ssh://`) are strictly rejected to prevent privilege escalation.
2. **Depth & Size Limits**:
   - Clone flag: `git clone --depth 1 --no-tags --single-branch`.
   - Max repo download size: 100 MB.
   - Max execution time: 45 seconds.
3. **Workspace Airgap**: The destination folder is guaranteed outside the workspace root (`path.resolve(cloneDir)` must not start with `workspaceRoot`).

---

## 5. Verification & Acceptance Criteria
- [ ] Successfully shallow-clones an external repository and extracts architectural answers without polluting user workspace.
- [ ] Rejects invalid or dangerous repository URLs.
- [ ] Ephemeral clone directories are cleaned up reliably on finish or error.
- [ ] Orchestrator can invoke `inspect_external_repo` during planning to verify library signatures before writing code.
