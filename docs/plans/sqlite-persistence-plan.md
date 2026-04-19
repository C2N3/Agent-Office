# SQLite Persistence Migration Plan

## Goal

Move the client's structured local runtime data from scattered JSON files into a single SQLite database at `~/.agent-office/app.db` without changing the local-first runtime model.

The migration should reduce full-file rewrites, make task/team/agent queries more explicit, and give the client a single place for future structured persistence. It should not pull build assets, generated manifests, or tiny preference files into SQLite unless there is a concrete operational benefit.

## Current Persistence Inventory

### Strong SQLite candidates

- `src/main/registry/index.ts`
  - Current file: `~/.agent-office/agent-registry.json`
  - Stores agent records, archive state, current session pointers, workspace metadata, provider/model, and session history.
- `src/main/nicknameStore.ts`
  - Current file: `~/.agent-office/nicknames.json`
  - Stores session ID to nickname mappings.
- `src/main/orchestrator/taskStore.ts`
  - Current file: `~/.agent-office/task-queue.json`
  - Stores orchestrator tasks, dependency links, workspace settings, provider fallback state, and task output metadata.
- `src/main/orchestrator/teamStore.ts`
  - Current file: `~/.agent-office/teams.json`
  - Stores team state plus agent/task relationships.
- `src/heatmap/persistence.ts`
  - Current file: scanner-specific heatmap persistence file under `~/.agent-office`
  - Stores daily aggregates, per-model totals, project sets, and scanner file offsets.

### File-based for the first cut

- `src/main/sessionPersistence.ts`
  - `state.json` is short-lived restart recovery state and does not yet need relational queries.
- `src/main/uiState.ts`
  - `ui-state.json` is tiny preference state.
- `src/main/terminalProfileService.ts`
  - `terminal-preferences.json` is a single preference object.
- `src/main/centralWorker/config.ts`
  - Stores tiny config values and sensitive tokens/secrets where a DB does not materially improve the design.
- `public/shared/avatars.json`
  - Generated asset manifest written from files on disk at startup.
- `public/shared/sprite-frames.json`
  - Static render metadata consumed as a build/runtime asset.

## Migration Principles

- Keep the local-first storage location under `~/.agent-office`.
- Avoid a big-bang rewrite that changes every persistence call site at once.
- Keep the migration idempotent so the app can restart mid-upgrade and continue safely.
- Treat existing JSON files as migration inputs, not permanent dual-write sources.
- Keep recovery behavior stable during the first migration; do not redesign provider recovery and SQLite in the same step.
- Preserve current normalization rules in the new persistence path instead of silently relaxing them.

## Proposed Database Layout

Use a single SQLite database file:

- `~/.agent-office/app.db`

Add a small bootstrap layer responsible for:

- opening the database
- enabling WAL mode
- creating the schema if missing
- tracking schema version and one-time imports
- exposing transaction helpers to store modules

Suggested metadata tables:

- `schema_migrations`
- `data_imports`

Suggested application tables:

- `agents`
- `agent_sessions`
- `agent_nicknames`
- `tasks`
- `task_dependencies`
- `task_children`
- `task_fallback_providers`
- `teams`
- `team_members`
- `team_subtasks`
- `heatmap_days`
- `heatmap_day_models`
- `heatmap_day_projects`
- `heatmap_file_offsets`

## Table Intent

### `agents`

One row per persistent dashboard agent.

Suggested columns:

- `id`
- `name`
- `role`
- `project_path`
- `avatar_index`
- `enabled`
- `archived`
- `created_at`
- `last_active_at`
- `archived_at`
- `current_session_id`
- `current_runtime_session_id`
- `current_resume_session_id`
- `provider`
- `model`
- `workspace_json`

Notes:

- Keep `workspace` as JSON in the first cut unless it starts needing indexed queries.
- Preserve the current sanitize/normalize behavior from `src/main/registry/shared.ts` and `src/main/registry/index.ts`.

### `agent_sessions`

One row per historical session entry linked to an agent.

Suggested columns:

- `id`
- `agent_id`
- `session_id`
- `runtime_session_id`
- `resume_session_id`
- `transcript_path`
- `started_at`
- `ended_at`
- `provider`
- `project_path`
- `metadata_json`

Notes:

- This splits historical session data away from the main `agents` row and removes the need to rewrite one large JSON object whenever session history changes.

### `agent_nicknames`

Store nicknames by session ID.

Suggested columns:

- `session_id`
- `nickname`
- `updated_at`

Notes:

- Preserve rekey behavior when a session ID changes.
- Keep this separate from `agents` because the current source of truth is session-based, not agent-based.

### `tasks`

One row per orchestrator task.

Suggested columns:

- `id`
- `title`
- `prompt`
- `provider`
- `execution_environment`
- `model`
- `max_turns`
- `parent_task_id`
- `repository_path`
- `branch_name`
- `base_branch`
- `workspace_parent`
- `copy_paths_json`
- `symlink_paths_json`
- `bootstrap_command`
- `agent_registry_id`
- `priority`
- `status`
- `current_provider`
- `attempt`
- `max_attempts`
- `terminal_id`
- `workspace_path`
- `exit_code`
- `error_message`
- `last_output`
- `output_path`
- `auto_merge_on_success`
- `delete_branch_on_merge`
- `created_at`
- `updated_at`
- `started_at`
- `completed_at`

Notes:

- Keep array-like fields as JSON in the first pass unless a query really needs to index them.
- Move relationship-style data into separate tables when it already behaves relationally.

### `task_dependencies`

Store `task_id -> depends_on_task_id` edges.

### `task_children`

Store `parent_task_id -> child_task_id` edges when explicit child tracking still needs to exist separate from `tasks.parent_task_id`.

Notes:

- Before implementing this table, verify whether `parent_task_id` plus dependency edges already cover the current read/write behavior.
- Avoid storing the same relationship in two places unless the orchestrator truly depends on both views.

### `task_fallback_providers`

Store ordered fallback providers for each task.

Suggested columns:

- `task_id`
- `sort_order`
- `provider`

### `teams`

One row per coordinated team.

Suggested columns:

- `id`
- `name`
- `goal`
- `repository_path`
- `base_branch`
- `integration_branch`
- `leader_agent_id`
- `planning_task_id`
- `status`
- `created_at`
- `updated_at`
- `completed_at`
- `error_message`

### `team_members`

Store `team_id -> agent_id` rows.

### `team_subtasks`

Store `team_id -> task_id` rows.

### `heatmap_days`

One row per calendar day.

Suggested columns:

- `day`
- `session_count`
- `message_count`
- `estimated_cost`
- `by_provider_json`
- `updated_at`

### `heatmap_day_models`

Store per-day per-model aggregates.

Suggested columns:

- `day`
- `model`
- `session_count`
- `message_count`
- `estimated_cost`

### `heatmap_day_projects`

Store distinct project paths or identifiers seen on a day.

### `heatmap_file_offsets`

Store scanner checkpoint data by source file.

Suggested columns:

- `source_path`
- `offset`
- `updated_at`

## Implementation Phases

### Phase 1: Database bootstrap

Deliverables:

- Add a small persistence module under `src/main` for opening `app.db`.
- Create schema/version bootstrap.
- Add one-time import bookkeeping so each legacy file is only imported once.
- Decide and lock the SQLite library choice before touching store code.

Exit criteria:

- App starts with no database and creates `app.db`.
- App restarts cleanly with existing schema.

### Phase 2: Agent registry and nicknames

Deliverables:

- Move `AgentRegistry` persistence from JSON to SQLite.
- Move `NicknameStore` persistence into SQLite.
- Import `agent-registry.json` and `nicknames.json` into the new tables.
- Keep in-memory APIs stable for callers.

Exit criteria:

- Existing agents still appear after upgrade.
- Archived agents remain archived.
- Nicknames survive restart and session rekey.

### Phase 3: Task and team stores

Deliverables:

- Move `TaskStore` and `TeamStore` persistence into SQLite.
- Import `task-queue.json` and `teams.json`.
- Verify dependency, parent/child, and team membership behavior against the current orchestrator code.

Exit criteria:

- Existing queued/running/completed tasks survive upgrade.
- Team dashboards still show the expected membership and subtask state.

### Phase 4: Heatmap persistence

Deliverables:

- Replace JSON persistence in `src/heatmap/persistence.ts`.
- Import prior daily aggregates and scanner offsets.
- Keep scanner logic behavior stable while changing only the backing store.

Exit criteria:

- Existing heatmap history survives upgrade.
- Incremental scans resume from prior offsets.

### Phase 5: Cleanup and cutover hardening

Deliverables:

- Stop relying on legacy files after successful import.
- Decide whether legacy files should be deleted, renamed, or left as backup snapshots.
- Add upgrade notes for local debugging and support.

Exit criteria:

- A migrated install no longer needs legacy JSON files for steady-state runtime.

## Out of Scope for the First Migration

- Replacing asset manifests or sprite metadata with database rows.
- Moving secrets from flat files into SQLite.
- Redesigning session recovery semantics in `src/main/sessionPersistence.ts`.
- Remote/server persistence changes outside the local client runtime.
- Broad refactors of orchestrator behavior that are unrelated to the storage backend.

## Migration Mechanics

Suggested import behavior:

1. Start database bootstrap.
2. Check `data_imports` for each legacy source.
3. If a source has not been imported and the legacy file exists, read it once and import in a transaction.
4. Record the import result in `data_imports`.
5. Switch the live store implementation to SQLite reads/writes.
6. Leave the legacy file untouched during the first successful release unless cleanup is explicitly implemented later.

Rules:

- Import should be safe to rerun after a crash.
- Invalid legacy rows should be skipped with debug logging rather than aborting the whole import.
- The app should not dual-write to JSON and SQLite indefinitely.

## Validation Plan

Add targeted tests around:

- schema bootstrap on empty state
- import from `agent-registry.json`
- import from `nicknames.json`
- import from `task-queue.json`
- import from `teams.json`
- import from heatmap persistence
- restart after a successful import
- archived agent visibility after upgrade
- task dependency queries after upgrade
- team membership/subtask queries after upgrade
- heatmap incremental scan checkpoints after upgrade

Manual verification checklist:

- start the app with populated legacy files and no `app.db`
- confirm agents, nicknames, tasks, teams, and heatmap data render after startup
- restart the app and confirm data still loads from SQLite
- create or update an agent, task, and team after migration and confirm the new state persists

Project validation commands once implementation begins:

- `npm run build:dist`
- `npm run typecheck`
- `npm test -- --runInBand`

## Risks and Decisions To Resolve

- SQLite library choice:
  - choose the library before store work starts so the API surface is stable
  - account for Electron packaging and native module implications
- Session history modeling:
  - confirm whether `sessionHistory` should stay partially JSON-backed or be fully normalized
- Task relationship modeling:
  - confirm whether `childTaskIds` needs its own table or can be derived
- Heatmap schema shape:
  - decide how much denormalization is worth keeping for fast dashboard reads
- Legacy file retention:
  - decide whether to leave backups in place after import or rename them with a migrated suffix

## Completion Criteria

This plan is complete when:

- structured runtime stores use `~/.agent-office/app.db`
- legacy JSON imports are automatic and idempotent
- task/team/agent/heatmap state still survives restart
- excluded file-based settings remain intentionally file-based
- the related items in `TODO.md` can be checked off with clear verification
