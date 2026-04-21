# TODO

This file tracks client-side work that is planned, discovered, blocked, or completed.

## Rules

- Add a checkbox item when a new client task is needed and is not already tracked here.
- Check an item as done when the work is completed and verified.
- Keep each item concrete enough that another agent can tell what "done" means.
- Prefer linking or naming the package, command, route, component, or document affected by the task.
- Do not remove completed items unless the project explicitly decides to archive them elsewhere.

## Open

- [x] Land the initial React UI boundary milestones in `docs/plans/react-ui-boundary-plan.md`: single dashboard React root, React-owned remote/heatmap/archive/agent-card surfaces, and imperative office renderer preservation.
- [x] Rebuild the dashboard as a single React app root, move React-owned UI toward hooks/components, and add SCSS module support for React surfaces.
- [ ] Execute the client UI runtime boundary direction in `docs/plans/client-ui-runtime-boundary.md` by keeping Vite limited to browser entries, moving React-rendered control events into React ownership, and keeping office canvas/runtime code imperative TypeScript.
- [ ] Migrate the remaining create-agent and nickname-edit modal behavior in `src/client/dashboard/modals/*` from ID-based DOM binding toward React-owned component state and handlers.
- [ ] Move the Cloudflare and central-server connection panels out of `innerHTML` rendering into React-owned dashboard views.
- [ ] Continue overlay shell migration by moving `src/renderer/agentCard.ts` and `src/renderer/agentGrid.ts` DOM composition toward React-owned shell components while keeping animation and resize runtime code imperative.
- [ ] Refine the office canvas adapter around `src/client/dashboard/office.ts` and `src/client/office/officeInit.ts` so React supplies host elements and the runtime exposes setup/update/teardown entrypoints.
- [ ] Add full Gemini session visualization support by implementing Gemini session ingestion/monitoring, transcript statistics, recovery metadata, and provider registry/catalog capability updates comparable to Claude and Codex.
- [ ] Execute the SQLite persistence migration plan in `docs/plans/sqlite-persistence-plan.md`.
- [ ] Complete Phase 1 of `docs/plans/sqlite-persistence-plan.md`.
- [ ] Complete Phase 2 of `docs/plans/sqlite-persistence-plan.md`.
- [ ] Complete Phase 3 of `docs/plans/sqlite-persistence-plan.md`.
- [ ] Complete Phase 4 of `docs/plans/sqlite-persistence-plan.md`.
- [ ] Complete Phase 5 of `docs/plans/sqlite-persistence-plan.md`.

## Done

- [x] Move the task report and team report modals from `src/client/dashboard/modals/taskReport.ts` and `src/client/dashboard/modals/teamReport.ts` DOM binding into React-owned state and handlers.
- [x] Move the conversation viewer from `src/client/dashboard/modals/conversationViewer.ts` dynamic DOM creation into React-owned state and handlers.
- [x] Move the assign task modal from `src/client/dashboard/modals/assignTask.ts` DOM binding into React-owned state and handlers in `src/client/dashboard/react/assignTaskModal/`.
- [x] Move the team formation modal from `src/client/dashboard/modals/teamFormation.ts` DOM binding into React-owned state and handlers in `src/client/dashboard/react/teamFormationModal.tsx`.
- [x] Move the avatar picker modal from `src/client/dashboard/modals/avatarPicker.ts` DOM binding into React-owned state and handlers in `src/client/dashboard/react/avatarPickerModal.tsx`.
- [x] Move dashboard PiP and Overlay button ownership from DOM event binding in `src/client/dashboard/app/windowControls.ts` to React-rendered handlers in `src/client/dashboard/root/officeView.tsx`.
- [x] Fix the overlay renderer so shared avatar/sprite JSON stays bundled as browser code, preload avatar loading uses `assets/shared/avatars.json`, and the overlay page no longer pulls Pretendard from jsdelivr.
- [x] Replace ad hoc dashboard modal globals with a typed modal registry and move the terminal PowerShell-policy banner/profile launcher surfaces into React-owned state.
- [x] Move the dashboard heatmap/archive surfaces into React-owned views and split the dashboard runtime bootstrap out of the React root mount.
- [x] Split browser-authored UI into `src/client` and `src/renderer`, move static assets to `assets/`, and run `index`/`dashboard`/`pip`/`overlay` through Vite while keeping the Electron main process, dashboard server, and preloads on the `dist` + `tsgo` runtime path.
- [x] Make the sidebar `Cloudflare` tab available in production builds instead of hiding it behind the dashboard dev-mode gate.
- [x] Make Host worker connections prefer the stored owner room secret over any legacy worker token so public Host mode connects after `Start Host` without exposing token UI.
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
