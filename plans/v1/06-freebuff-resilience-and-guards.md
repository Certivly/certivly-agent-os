# Plan 06: Freebuff-Inspired Resilience, Truncated Write Guards & Mechanical Compaction

**Directory:** `plans/v1/`  
**Date:** 2026-10-09  
**Status:** Implementation Ready  
**Benchmarked Competitor:** Freebuff / Codebuff (`CodebuffAI/freebuff`)

---

## 1. Executive Summary

A deep audit of the Freebuff codebase reveals five critical resilience mechanisms that prevent the most devastating failure modes seen in real-world AI coding agents:
1. **Truncated Write Guard (`TruncatedWriteGuard`)**: Detecting mid-generation cut-offs (output token limits / connection drops) and refusing to mutate files, preventing silent codebase corruption.
2. **Cut-off Rewrite Guard**: Refusing whole-file replacements that are under 60% of original file size and leave open brackets.
3. **Deterministic Mechanical Compaction (`MechanicalCompactionEngine`)**: Zero-token context condensation that formats historical turns into `<conversation_summary>`, eliminating expensive and lossy LLM summarization.
4. **Active Working Set Retention**: Preserving the newest unedited file reads verbatim in the prompt during compaction, while replacing older reads with lightweight outline stubs.
5. **Progressive Edit Thrashing Intervention**: Tracking repeated rejected edits and injecting a recovery nudge at 3 attempts, with an automated circuit-breaker stop at 6 attempts.

---

## 2. Technical Architecture & Invariants

### 2.1 Truncated Write Guard
```
Tool Call Received (Raw JSON Text)
        │
        ▼
Is JSON closed? ─── YES ───► Proceed to Content Safety Check
        │
        NO (Truncated prefix: unclosed { [ " )
        │
        ▼
Is tool mutating (write_file, edit_file, apply_patch)?
        ├── YES ──► REFUSE IMMEDIATELY. "Nothing was written to disk. Re-issue smaller edit."
        └── NO  ──► Generic malformed argument error
```

### 2.2 Cut-Off Rewrite Guard (`detectTruncatedRewrite`)
Before applying `write_file` to an existing file:
1. File must have >= 30 lines.
2. New content length < 60% of old content length.
3. Net unclosed brackets `netOpenBrackets(newContent) > netOpenBrackets(oldContent)`.
If all three conditions match, refuse the rewrite with a clear error:
`"Refused cut-off rewrite: new content is under 60% of original file and leaves open brackets."`

### 2.3 Deterministic Mechanical Context Compaction
Instead of spending 50,000+ tokens on an LLM summarization pass:
1. **Mechanical Extraction**:
   - User inputs retained verbatim (up to token budget).
   - Tool executions condensed to: `[Tool] <name>(<args_summary>) -> <status_code/summary>`.
   - Files read and files modified tracked in structured lists.
2. **Active Working Set Retention**:
   - Collect all files read in the session.
   - Filter out files that were subsequently modified.
   - For the top most recent unedited files (up to working set budget), keep their full contents.
   - For older files, replace with 1-line outline stubs: `[File Outline] path/to/file.ts (140 lines)`.
3. **Zero Token Cost**: Executed purely in Node.js/Bun code with zero LLM API calls.

### 2.4 Progressive Edit Loop Circuit Breaker
Track trailing consecutive identical rejected edits:
- **Threshold 3 (Recovery Nudge)**:
  `[RECOVERY INTERVENTION] You have repeatedly sent the same file edit, and every attempt was rejected with the same result. Sending it again will not change anything. Read the file to see its current content, make a different edit, or explain the blocker to the user and end your turn.`
- **Threshold 6 (Hard Circuit Breaker)**:
  Throws `EditLoopError` and halts the turn immediately, preventing token and credit burn.

---

## 3. Package Structure & Deliverables

| Module | Location | Purpose |
| :--- | :--- | :--- |
| `TruncatedWriteGuard` | `packages/tools/src/guards/TruncatedWriteGuard.ts` | Refuses incomplete JSON and unbalanced <60% rewrites |
| `MechanicalCompactionEngine` | `packages/agent-runtime/src/compaction/MechanicalCompactionEngine.ts` | Zero-token historical condensation + working set retention |
| `EditLoopGuard` | `packages/agent-runtime/src/loop/EditLoopGuard.ts` | Multi-stage progressive repetition detector |
| `WorkspaceTrustManager` | `packages/config/src/trust.ts` | Workspace trust store for local custom tools |
