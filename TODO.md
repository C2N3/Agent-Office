# TODO

This file tracks client-side work that is planned, discovered, blocked, or completed.

## Rules

- Add a checkbox item when a new client task is needed and is not already tracked here.
- Check an item as done when the work is completed and verified.
- Keep each item concrete enough that another agent can tell what "done" means.
- Prefer linking or naming the package, command, route, component, or document affected by the task.
- Do not remove completed items unless the project explicitly decides to archive them elsewhere.

## Open

- [ ] Keep local-only agent character creation/update working through the Electron IPC and `~/.agent-office/agent-registry.json` path when no central server sync is enabled.
- [x] Add an optional central-server-backed agent character sync mode that creates, updates, deletes, and subscribes to agent registry changes through the configured central server while preserving the local-only mode.
- [ ] Reconcile local and central agent character state on startup, including conflict rules for name, role, workspace, provider, and avatar changes.
- [ ] Add full Gemini session visualization support by implementing Gemini session ingestion/monitoring, transcript statistics, recovery metadata, and provider registry/catalog capability updates comparable to Claude and Codex.
- [x] Ensure newly created dashboard agents are assigned to the current floor before agent card filtering runs.
- [x] Load dashboard avatar cards from the live character catalog so newly added character files appear without hardcoded list edits.

## Done

- [x] Move server collaboration roadmap ownership to the server repository and remove duplicate client-side roadmap docs.
- [x] Auto-detect and symlink existing dependency folders such as `node_modules` when creating managed worktrees.
- [x] Add dashboard force-terminate support for active agent sessions.
