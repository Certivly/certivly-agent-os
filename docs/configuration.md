# AgentOS Configuration Guide

AgentOS is configured via `agentos.config.json` located at the root of your workspace or specified via the `--config` flag.

## Schema Overview

```json
{
  "activeProvider": "lmstudio",
  "activeModel": "local-model",
  "permissionMode": "manual",
  "runtime": {
    "logLevel": "info",
    "sessionDir": ".agentos/sessions"
  },
  "agent": {
    "selfReview": false,
    "parallelExploration": false,
    "planningMode": "auto"
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
      "command": "echo 'starting verification'",
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
    "lmstudio": {
      "baseUrl": "http://localhost:1234/v1",
      "model": "qwen2.5-coder"
    }
  }
}
```

## Permission Modes

Configure `permissionMode` to regulate tool execution authority:
- `plan`: Read-only exploration. All file edits and shell commands are blocked.
- `manual`: Requires explicit operator approval for every edit and command.
- `acceptEdits`: Automatically approves file modifications while requiring approval for commands.
- `auto`: Automatically approves edits and low-risk commands (e.g. test runners, status checks).

## Lifecycle Hooks

Lifecycle hooks allow workspace operators to execute external scripts at critical lifecycle stages:

| Hook Point | Description | Injected Environment Variables |
| :--- | :--- | :--- |
| `before_tool` | Dispatched prior to running any tool call | `TOOL_NAME`, `TOOL_ARGS_JSON` |
| `after_edit` | Dispatched immediately after a file is edited or created | `EDITED_FILE`, `WORKSPACE_ROOT` |
| `before_verify` | Dispatched immediately before verification test runner executes | `VERIFY_COMMANDS` |
| `after_verify` | Dispatched immediately after verification test runner completes | `VERIFY_STATUS`, `VERIFY_OUTPUT` |

### Hook Properties

- `command` (string, required): Shell command or script to execute. Variable references such as `$TOOL_NAME` or `${EDITED_FILE}` are expanded automatically.
- `timeoutMs` (number, default: 5000): Maximum execution time before the hook process is terminated.
- `blocking` (boolean, default: true): When true, a non-zero exit code aborts the stage with an error returned to the agent loop. When false, failures are logged without aborting execution.

## Supported Providers

AgentOS supports multiple model providers via standard configurations and environment variables:

| Provider | Config Key | Default Base URL | Environment Variable | Default Model |
| :--- | :--- | :--- | :--- | :--- |
| **OpenAI** | `openai` | `https://api.openai.com/v1` | `OPENAI_API_KEY` | `gpt-4o` |
| **Anthropic** | `anthropic` | `https://api.anthropic.com` | `ANTHROPIC_API_KEY` | `claude-3-5-sonnet-20241022` |
| **Google Gemini** | `gemini` | `https://generativelanguage.googleapis.com/v1beta/openai` | `GEMINI_API_KEY` | `gemini-2.0-flash` |
| **DeepSeek** | `deepseek` | `https://api.deepseek.com` | `DEEPSEEK_API_KEY` | `deepseek-chat` |
| **LM Studio** | `lmstudio` | `http://localhost:1234/v1` | N/A | `local-model` |
| **Ollama** | `ollama` | `http://localhost:11434` | N/A | `llama3.1` |

