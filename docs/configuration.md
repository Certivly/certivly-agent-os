# AgentOS Configuration Guide

AgentOS provides a flexible, hierarchical configuration system. Configuration is loaded from workspace-specific files (`agentos.config.json` at repository root) or fallback user-level configuration (`~/.agentos/config.json`).

---

## 1. Schema Overview

```json
{
  "activeProvider": "anthropic",
  "activeModel": "claude-3-5-sonnet",
  "permissionMode": "manual",
  "runtime": {
    "logLevel": "info",
    "sessionDir": ".agentos/sessions",
    "traceDir": ".agentos/traces"
  },
  "agent": {
    "selfReview": true,
    "parallelExploration": false,
    "planningMode": "auto",
    "maxRepairTurns": 3
  },
  "desktop": {
    "port": 3456,
    "host": "127.0.0.1",
    "openBrowser": true
  },
  "hooks": {
    "before_tool": {
      "command": "echo 'tool: $TOOL_NAME'",
      "timeoutMs": 5000,
      "blocking": true
    },
    "after_edit": {
      "command": "echo 'edited: $EDITED_FILE'",
      "timeoutMs": 10000,
      "blocking": true
    },
    "before_verify": {
      "command": "echo 'starting verification tests'",
      "timeoutMs": 3000,
      "blocking": false
    },
    "after_verify": {
      "command": "echo 'verification result: $VERIFY_STATUS'",
      "timeoutMs": 5000,
      "blocking": false
    }
  },
  "providers": {
    "anthropic": {
      "apiKey": "sk-ant-...",
      "defaultModel": "claude-3-5-sonnet-20241022"
    },
    "openai": {
      "apiKey": "sk-...",
      "defaultModel": "gpt-4o"
    },
    "gemini": {
      "apiKey": "AIza...",
      "defaultModel": "gemini-2.0-flash"
    },
    "deepseek": {
      "apiKey": "sk-...",
      "defaultModel": "deepseek-chat"
    },
    "ollama": {
      "baseUrl": "http://localhost:11434",
      "defaultModel": "qwen2.5-coder:7b"
    },
    "lmstudio": {
      "baseUrl": "http://localhost:1234/v1",
      "defaultModel": "local-model"
    }
  }
}
```

---

## 2. Permission Modes

Configure `permissionMode` to regulate tool execution authority:

| Mode | Description | File Modifications | System Commands |
| :--- | :--- | :--- | :--- |
| `plan` | Read-only architectural exploration | Blocked | Blocked |
| `manual` | Interactive developer supervision (Default) | Requires Approval | Requires Approval |
| `acceptEdits` | Streamlined editing flow | Auto-Applied in Sandbox | Requires Approval |
| `auto` | Unattended automated execution / CI | Auto-Applied in Sandbox | Low-risk auto-approved; destructive blocked |

---

## 3. Lifecycle Hooks

Lifecycle hooks execute user-defined shell scripts at key stages of the agent loop:

| Hook Point | Description | Injected Environment Variables |
| :--- | :--- | :--- |
| `before_tool` | Dispatched prior to running any tool call | `TOOL_NAME`, `TOOL_ARGS_JSON` |
| `after_edit` | Dispatched immediately after a file is edited or created | `EDITED_FILE`, `WORKSPACE_ROOT` |
| `before_verify` | Dispatched immediately before verification tests execute | `VERIFY_COMMANDS` |
| `after_verify` | Dispatched immediately after verification tests complete | `VERIFY_STATUS`, `VERIFY_OUTPUT` |

### Hook Configuration Properties

- `command` (string, required): Shell command or script to execute. Variable references (`$TOOL_NAME`, `${EDITED_FILE}`) are expanded automatically.
- `timeoutMs` (number, default: 5000): Maximum execution time before the hook process is terminated.
- `blocking` (boolean, default: true): When true, a non-zero exit code halts execution. When false, failures are logged without stopping execution.

---

## 4. Supported Providers & Environment Variables

Credentials can be configured via `agentos auth set <provider> --key <key>` or shell environment variables:

| Provider | Config Key | Default Base URL | Environment Variable | Default Model |
| :--- | :--- | :--- | :--- | :--- |
| **Anthropic** | `anthropic` | `https://api.anthropic.com` | `ANTHROPIC_API_KEY` | `claude-3-5-sonnet-20241022` |
| **OpenAI** | `openai` | `https://api.openai.com/v1` | `OPENAI_API_KEY` | `gpt-4o` |
| **Google Gemini** | `gemini` | `https://generativelanguage.googleapis.com/v1beta/openai` | `GEMINI_API_KEY` | `gemini-2.0-flash` |
| **DeepSeek** | `deepseek` | `https://api.deepseek.com` | `DEEPSEEK_API_KEY` | `deepseek-chat` |
| **Ollama** | `ollama` | `http://localhost:11434` | N/A | `qwen2.5-coder:7b` |
| **LM Studio** | `lmstudio` | `http://localhost:1234/v1` | N/A | `local-model` |

---

## 5. Configuration Management via CLI

Inspect and manage configuration directly through the CLI:

```bash
# View active configuration values
agentos config get activeModel
agentos config get activeProvider

# Set configuration values
agentos config set activeModel claude-3-5-sonnet
agentos config set permissionMode auto

# Manage credentials securely
agentos auth status
agentos auth set anthropic --key sk-ant-...
agentos auth logout anthropic
```
