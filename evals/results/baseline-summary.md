# Evaluation Baseline Summary

- **Generated**: 2026-10-02
- **Model**: `fake:scripted`
- **Total Tasks**: 5
- **Passed**: 5 / 5 (100.0%)
- **Total Wall Time**: 0.73s
- **Total Tokens**: 682 in / 127 out (809 total)

## Task Breakdown

| Task ID | Status | Turns | Tool Calls | Tokens (In/Out) | Wall Time | Files Changed |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `py-wrong-regex` | PASS | 2 | write_file:1 | 158 / 22 | 0.23s | `validator.py` |
| `ts-add-function` | PASS | 2 | write_file:1 | 151 / 27 | 0.13s | `src/string-utils.ts` |
| `ts-null-handling` | PASS | 2 | write_file:1 | 146 / 26 | 0.13s | `src/user.ts` |
| `ts-off-by-one` | PASS | 2 | edit_file:1 | 119 / 27 | 0.13s | `src/array-slice.ts` |
| `ts-wrong-comparison` | PASS | 2 | edit_file:1 | 108 / 25 | 0.12s | `src/compare.ts` |

## Regression Policy Reference

This baseline represents the 100% pass reference for CI and regression detection.
Future feature additions must compare against `baseline.jsonl` using:
```bash
agent eval compare --base evals/results/baseline.jsonl --candidate <candidate.jsonl>
```
