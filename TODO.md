# TODO

This file tracks client-side work that is planned, discovered, blocked, or completed.

## Rules

- Add a checkbox item when a new client task is needed and is not already tracked here.
- Check an item as done when the work is completed and verified.
- Keep each item concrete enough that another agent can tell what "done" means.
- Prefer linking or naming the package, command, route, component, or document affected by the task.
- Do not remove completed items unless the project explicitly decides to archive them elsewhere.

## Open

- [ ] Add full Gemini session visualization support by implementing Gemini session ingestion/monitoring, transcript statistics, recovery metadata, and provider registry/catalog capability updates comparable to Claude and Codex.
- [ ] Add a local SQLite persistence layer at `~/.agent-office/app.db` for structured runtime data, including a small migration bootstrap that creates the schema on startup and imports existing JSON/TXT state the first time the database is present.
- [ ] Migrate `src/main/registry/index.ts` from `~/.agent-office/agent-registry.json` to SQLite by splitting persistent agent records from session history, preserving archived agent visibility, current session pointers, workspace metadata, and existing sanitization/normalization on load.
- [ ] Move nickname persistence from `src/main/nicknameStore.ts` into the same SQLite layer so nicknames live next to agent/session data instead of `~/.agent-office/nicknames.json`, while preserving rekey behavior when a session ID changes.
- [ ] Migrate `src/main/orchestrator/taskStore.ts` from `~/.agent-office/task-queue.json` to SQLite with explicit columns or join tables for task status, priority, dependency edges, child tasks, provider fallback attempts, workspace settings, and output metadata used by the orchestrator.
- [ ] Migrate `src/main/orchestrator/teamStore.ts` from `~/.agent-office/teams.json` to SQLite and model team-to-agent and team-to-task relationships explicitly so active/completed team queries no longer depend on loading the full JSON blob into memory.
- [ ] Move `src/heatmap/persistence.ts` from JSON persistence to SQLite tables for day stats, per-model aggregates, tracked projects, and scanner file offsets so larger history windows and filtered dashboard queries do not depend on rewriting a single persistence file.
- [ ] Keep short-lived recovery state in `src/main/sessionPersistence.ts` file-based unless a later change proves restart recovery needs transactional writes or historical inspection; if it is revisited, document why it should join the SQLite store instead of remaining an ephemeral `state.json`.
- [ ] Keep simple preferences such as `src/main/uiState.ts`, `src/main/terminalProfileService.ts`, and `src/main/centralWorker/config.ts` file-based for now, and document that they are intentionally excluded from the first SQLite migration because they are tiny settings/secret files rather than query-heavy application data.
- [ ] Leave generated/static asset manifests such as `public/shared/avatars.json` and `public/shared/sprite-frames.json` file-based, and document that they are build/runtime asset inputs rather than application records that benefit from relational storage.
- [ ] Add migration and regression coverage for the SQLite cutover, including startup import from existing `agent-registry.json`, `nicknames.json`, `task-queue.json`, `teams.json`, and heatmap persistence files, plus restart/recovery checks that confirm the dashboard still renders existing agents, tasks, teams, and heatmap history after upgrading.

## Done

- [x] Make Host start from just the server URL by auto-enabling the public room and storing the owner secret, and add localhost invite deep-links that auto-join Guest mode from the URL fragment.
- [x] Rework the Remote tab so mode pills are draft-only, each mode is confirmed through a clear primary action (`Use Local Only`, `Start Host`, `Join as Guest`), and the worker token field explains when host authentication is actually required.
- [x] Add an explicit server mode selector for agent character visibility and sharing: Local Only shows only this client's agent characters, Host shares this client's server for others, and Guest connects to an existing host.
- [x] In Host mode, generate and store an owner-only secret plus a guest invite secret, expose a copyable invite link that includes the guest secret, support guest secret rotation, and treat tunnel URL refresh as a connectivity update rather than authentication.
- [x] Keep local-only agent character creation/update working through the Electron IPC and `~/.agent-office/agent-registry.json` path when no central server sync is enabled.
- [x] Add an optional central-server-backed agent character sync mode that creates, updates, deletes, and subscribes to agent registry changes through the configured central server while preserving the local-only mode.
- [x] Reconcile local and central agent character state on startup, including conflict rules for name, role, workspace, provider, and avatar changes.
- [x] Ensure newly created dashboard agents are assigned to the current floor before agent card filtering runs.
- [x] Load dashboard avatar cards from the live character catalog so newly added character files appear without hardcoded list edits.
- [x] Fix the Remote tab so it renders one selected mode sheet at a time and keeps `remoteMode` updates from clearing the saved central server URL.
- [x] Move Cloudflare quick tunnel controls into a dev-only sidebar tab so Host/Guest product modes stay separate from local development tooling.
- [x] Add main-process central worker WebSocket connector for worker heartbeat and registered agent character sync.
- [x] Move server collaboration roadmap ownership to the server repository and remove duplicate client-side roadmap docs.
- [x] Auto-detect and symlink existing dependency folders such as `node_modules` when creating managed worktrees.
- [x] Add dashboard force-terminate support for active agent sessions.
