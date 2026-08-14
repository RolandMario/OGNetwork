# Agent guidance for admin-dashboard

This document imports the shared agent rules in AGENTS.md and records recent changes relevant to assistant tooling and runtime.

- Imported rules: see `admin-dashboard/AGENTS.md` (Next.js-specific agent rules).
- Runtime model: switched from `claude-haiku-4.5` to `gpt-5-mini`. Update any agent prompts or expectations accordingly.
- Tooling change: the `tool_search_tool` is no longer available. Do not call that tool; update any automation that referenced it.

Keep AGENTS.md as the authoritative source for framework-specific guidance.