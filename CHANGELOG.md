# Changelog

All notable changes to AgentOS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Observability and JSONL execution trace logger with secret redaction.
- Crash continuation, session replay, and resume support.
- Provider streaming tool call parity across OpenAI, Anthropic, and LM Studio.
- First-class Ollama and LM Studio local provider adapters with doctor diagnostics.
- Verified workflow memory store with content deduplication and prompt hints.
- Enhanced RepoMap ranking signals with BM25, graph centrality, test affinity, and recency.
- Self-review post-verification inspection loop.
- Parallel read-only exploration with speculative analysis.
- Advisory lightweight planning mode with auto-triggers on refactors and verification failures.
- Comprehensive security hardening matrix (paths, commands, prompt injection, and secrets).
- Performance benchmarking command and budget check (`agent bench --check`).
- Package dry run validation for release assets and distribution bundles.

## [1.0.0] - 2026-10-02

### Added
- Initial AgentOS autonomous coding assistant CLI release.
- Headless execution loop with verification gates.
- Fixture-based evaluation harness with baseline comparison.
