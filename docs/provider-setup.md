# Provider Setup Guide

AgentOS supports both industry-leading cloud AI providers and local, privacy-first open models.

---

## 1. Cloud Providers

### Anthropic

Set your API key via environment variable or the CLI credential manager:

```bash
# Using CLI auth manager (recommended)
agentos auth set anthropic --key sk-ant-...

# Or via shell environment variable
export ANTHROPIC_API_KEY="sk-ant-..."
```

Supported models:
- `claude-3-5-sonnet-20241022` (Recommended default for production coding)
- `claude-3-5-haiku-20241022` (High-speed, lightweight edits)
- `claude-3-opus-20240229` (Complex architectural synthesis)

Run a task with Anthropic:

```bash
agentos "add unit tests for payment webhook" --model claude-3-5-sonnet
```

---

### OpenAI

Set your OpenAI API key:

```bash
# Using CLI auth manager
agentos auth set openai --key sk-...

# Or via shell environment variable
export OPENAI_API_KEY="sk-..."
```

Supported models:
- `gpt-4o` (Versatile flagship reasoning)
- `gpt-4o-mini` (Fast & cost-effective)
- `o1`, `o3-mini` (Deep reasoning & mathematical analysis)

Run a task with OpenAI:

```bash
agentos "fix race condition in queue processor" --model gpt-4o
```

---

### Google Gemini

Set your Google Gemini API key:

```bash
# Using CLI auth manager
agentos auth set gemini --key AIza...

# Or via shell environment variable
export GEMINI_API_KEY="AIza..."
```

Supported models:
- `gemini-2.0-flash` (Ultra-low latency with strong code generation)
- `gemini-1.5-pro` (Extended context window reasoning)

Run with Gemini:

```bash
agentos "refactor api client to use native fetch" --model gemini-2.0-flash
```

---

### DeepSeek

Set your DeepSeek API key:

```bash
# Using CLI auth manager
agentos auth set deepseek --key sk-...

# Or via shell environment variable
export DEEPSEEK_API_KEY="sk-..."
```

Supported models:
- `deepseek-chat` (DeepSeek-V3 general reasoning)
- `deepseek-reasoner` (DeepSeek-R1 chain-of-thought model)

Run with DeepSeek:

```bash
agentos "optimize SQL query joins in analytics service" --model deepseek-chat
```

---

## 2. Local Privacy-First Models

AgentOS includes first-class support for local inference servers with zero telemetry.

### Ollama

1. Install [Ollama](https://ollama.com) and pull a coding model:
   ```bash
   ollama run qwen2.5-coder:7b
   ```

2. By default, Ollama listens at `http://localhost:11434`.

3. Verify connection:
   ```bash
   agentos doctor providers
   ```

4. Execute via Ollama:
   ```bash
   agentos "fix null pointer exception" --model ollama:qwen2.5-coder:7b
   ```

---

### LM Studio

1. Download and launch [LM Studio](https://lmstudio.ai).
2. Load a tool-compatible model (e.g., `Qwen2.5-Coder-7B-Instruct` or `Llama-3.1-8B-Instruct`).
3. Start the local server (default endpoint: `http://localhost:1234/v1`).
4. Validate connectivity with the diagnostic probe:
   ```bash
   agentos doctor providers --probe
   ```
5. Run AgentOS pointing to LM Studio:
   ```bash
   agentos "refactor helper functions" --model lmstudio:local-model
   ```

---

## 3. Diagnostic Commands

Use `agentos doctor` and `agentos models` to verify connectivity and runtime readiness:

```bash
# List all catalog models and see active selection
agentos models list

# Test provider API connectivity
agentos models test deepseek-chat

# Probe all configured providers for live response
agentos doctor providers --probe
```

---

## 4. Common Errors & Resolutions

| Error | Root Cause | Solution |
| :--- | :--- | :--- |
| `Missing API Key` | Key not configured in environment or config | Run `agentos auth set <provider> --key sk-...` or export environment variable. |
| `Connection refused: localhost:1234` | LM Studio local server not running | Open LM Studio -> Local Server tab -> Click "Start Server". |
| `Connection refused: localhost:11434` | Ollama daemon is stopped | Run `ollama serve` or launch the Ollama desktop app. |
| `Model does not support tools` | Local model weights lack tool calling tokens | Use tool-compatible weights such as `qwen2.5-coder` or `llama-3.1`. |
| `Rate limit exceeded (429)` | Cloud provider quota reached | Switch to another provider with `agentos models set <model>` or fall back to local models. |
