## Session Discipline

Use the available Graphify, Karpathy, and Superpowers workflow before changing this project.

## Graphify Pre-Change Gate

This project has a Graphify knowledge graph in `graphify-out/`.

Before any code, docs, config, migration, formatter, codegen, or file edit:
- Read `graphify-out/GRAPH_REPORT.md`.
- Consult `graphify-out/graph.json` directly or through `graphify query`, `graphify path`, or `graphify explain` when tracing architecture, dependencies, or cross-module behavior.
- If `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json`, or `graphify-out/graph.html` is missing or stale, run Graphify first.
- If Graphify cannot run, stop and report the blocker unless the user explicitly overrides the gate.

After changes:
- Run `graphify update .` when code files changed, or rerun the curated Graphify corpus workflow when docs or rule files changed.
- If the graph cannot be updated, state the exact reason and the command that should be run next.
