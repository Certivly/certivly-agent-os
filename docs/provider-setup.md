# Provider Setup Guide

AgentOS supports both cloud-hosted AI providers and local, privacy-first open models.

---

## 1. Cloud Providers

### OpenAI

Set your API key via environment variable:

```bash
export OPENAI_API_KEY="sk-..."
```

Supported models:
- `gpt-4o` (recommended for production coding)
- `gpt-4o-mini` (fast & cost-effective)
- `o1`, `o3-mini` (high-reasoning tasks)

Run a task with OpenAI:

```bash
agent run "Fix bug in src/auth.ts" --model gpt-4o
```

---

### Anthropic

Set your Anthropic API key:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Supported models:
- `claude-3-5-sonnet-20241022` (state-of-the-art coding)
- `claude-3-5-haiku-20241022` (speed & lightweight edits)

Run with Anthropic:

```bash
agent run "Add unit tests for payment webhook" --model claude-3-5-sonnet
```

---

## 2. Local Models

AgentOS includes first-class support for local inference servers with zero telemetry.

### LM Studio

1. Download and start [LM Studio](https://lmstudio.ai/).
2. Load a model with tool-calling capabilities (e.g., `Qwen2.5-Coder-7B-Instruct` or `Llama-3.1-8B-Instruct`).
3. Start the local server (default endpoint: `http://localhost:1234/v1`).
4. Validate connectivity with the diagnostic probe:

```bash
agent doctor providers
```

5. Run AgentOS pointing to LM Studio:

```bash
agent run "Refactor helper functions" --model lmstudio:qwen2.5-coder-7b
```

---

### Ollama

1. Install [Ollama](https://ollama.com/) and pull a coding model:

```bash
ollama run qwen2.5-coder:7b
```

2. By default, Ollama listens at `http://localhost:11434`.
3. Verify connection:

```bash
agent doctor providers
```

4. Execute via Ollama:

```bash
agent run "Fix null pointer exception" --model ollama:qwen2.5-coder:7b
```

---

## 3. Diagnostic Commands

Use `agent doctor` to check provider connectivity and runtime configuration:

```bash
# Check all configured providers
agent doctor providers

# Check system runtime environment
agent doctor runtime
```

---

## 4. Common Errors & Solutions

| Error | Root Cause | Solution |
| :--- | :--- | :--- |
| `Missing API Key` | Environment variable not exported in current shell | Run `export OPENAI_API_KEY="..."` or set in `.env`. |
| `Connection refused: localhost:1234` | LM Studio local server is not active | Open LM Studio -> Local Server tab -> Click "Start Server". |
| `Connection refused: localhost:11434` | Ollama daemon is stopped | Run `ollama serve` or launch Ollama desktop app. |
| `Model does not support tools` | Local model weights do not implement tool calling tokens | Use tool-compatible models such as `qwen2.5-coder` or `mistral-nemo`. |
| `Rate limit exceeded (429)` | Cloud provider quota reached | Switch to another provider or use local model fallback. |
