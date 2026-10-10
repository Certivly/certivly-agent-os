# Plan 07: Browser DevTools Verification Subagent

**Document:** `plans/v2/07-browser-devtool-agent.md`  
**Date:** 2026-10-09  
**Status:** Implementation Specification  
**Benchmark Source:** Freebuff (`agents/browser-use/`)

---

## 1. Problem Statement & Motivation

Modern software engineering is heavily web-centric (React, Next.js, Vue, Vite, Tailwind). An agent editing web files can pass unit tests (e.g. `bun test`) while completely breaking the application:
- Uncaught client-side runtime errors in browser JavaScript.
- Broken responsive CSS layout or invisible elements.
- Silent API CORS errors or failed network requests.
- Form inputs that fail to trigger validation handlers.

Currently, AgentOS has no way to see what the user actually sees in the browser.

---

## 2. Freebuff Architecture Pattern (`browser-use/`)

Freebuff introduces a specialized **Browser DevTools Agent**:
1. **Chrome DevTools Protocol (CDP) Integration**:
   - Launches headless Chrome or connects to an existing Chromium instance via CDP.
2. **Interactive UI Verification**:
   - Navigates to local development URLs (e.g. `http://localhost:3000`, `http://localhost:5173`).
   - Clicks buttons, fills forms, scrolls, and tests responsive viewport sizes.
3. **Telemetry & Error Extraction**:
   - Captures all `console.error`, `console.warn`, and unhandled promise rejections.
   - Monitors failed network requests (HTTP 4xx, 5xx).
   - Captures visual screenshots saved to disk for human or multimodal model review.
4. **Structured Assessment Output**:
   - Returns step-by-step verification results (`passed`, `details`), console errors, and page screenshots.

---

## 3. AgentOS Engineering Specification

### 3.1. Subsystem Architecture: `packages/agent-runtime/src/verification/BrowserVerifierSubagent.ts`

```typescript
export interface BrowserVerificationTask {
  targetUrl: string;
  instructions: string;
  viewport?: { width: number; height: number };
  captureScreenshots?: boolean;
}

export interface BrowserVerificationResult {
  status: 'passed' | 'failed' | 'inconclusive';
  summary: string;
  consoleErrors: Array<{ type: string; text: string; location?: string }>;
  failedNetworkRequests: Array<{ url: string; status: number }>;
  screenshotPaths: string[];
  stepResults: Array<{ name: string; passed: boolean; details?: string }>;
}

export class BrowserVerifierSubagent {
  constructor(
    private model: Model,
    private screenshotsDir?: string
  ) {}

  public async verify(task: BrowserVerificationTask): Promise<BrowserVerificationResult>;
}
```

### 3.2. Dedicated Tool: `verify_web_ui`

```json
{
  "name": "verify_web_ui",
  "description": "Launch headless browser to navigate to a local web server, test UI interactions, capture screenshots, and inspect console errors.",
  "parameters": {
    "type": "object",
    "properties": {
      "url": { "type": "string", "description": "URL to navigate to (e.g. http://localhost:5173)" },
      "task": { "type": "string", "description": "Verification steps to perform and elements to validate" }
    },
    "required": ["url", "task"]
  }
}
```

---

## 4. Integration into ProjectVerifier Pipeline

In `packages/agent-runtime/src/verification/ProjectVerifier.ts`:
- Detect if project is a web project (presence of `vite.config.ts`, `next.config.js`, `index.html`, etc.).
- When `verificationMode: 'e2e'` or when user asks to *"verify in browser"*:
  1. Boot dev server via `TerminalSessionManager` (Plan 03).
  2. Wait for port to become active.
  3. Invoke `BrowserVerifierSubagent`.
  4. Collect console errors and attach them directly to verification failure feedback for self-repair.

---

## 5. Verification & Acceptance Criteria
- [ ] Connects to local headless Chrome via Puppeteer / CDP.
- [ ] Navigates to local URL, executes click/fill operations, and reports outcomes.
- [ ] Accurately traps uncaught JavaScript errors from the browser console.
- [ ] Saves full-page screenshots to `.agentos/screenshots/` and includes them in review summaries.
- [ ] Degrades gracefully with clear error message if Chrome is not installed on host.
