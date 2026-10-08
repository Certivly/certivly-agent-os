# AgentOS Evaluation Harness

This directory contains benchmark fixture tasks for evaluating agent coding performance.

## Structure

```text
evals/
├── README.md
└── tasks/
    └── <task-id>/
        ├── repo/          # Initial workspace files given to the agent
        ├── prompt.md      # User prompt given to the agent
        ├── verify.ts      # Test/verification script (or verify.sh) executed after agent finishes
        └── meta.json      # Metadata defining task attributes
```

## `meta.json` Schema

```json
{
  "id": "bug-off-by-one",
  "difficulty": "easy",
  "tags": ["bugfix", "typescript"],
  "language": "typescript"
}
```

## Running Evaluations

Run evaluations from the CLI:

```bash
agentos eval --task all --model <provider:model>
agentos eval --task <id> --model <provider:model>
agentos eval -t smoke --profile gemini-flash
```

### Recording Baseline Runs

When running with a valid provider API key, save a timestamped baseline:

```bash
GEMINI_API_KEY=<key> bun run agentos eval -t all --profile gemini-flash --output evals/baselines/gemini-flash-$(date +%Y%m%d).jsonl
```

### Regression Checking

Compare candidate results against a recorded baseline:

```bash
bun run agentos eval compare \
  --base evals/baselines/gemini-flash-<date>.jsonl \
  --candidate evals/results/gemini-flash-latest.jsonl
```
