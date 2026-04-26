# Client Project Goals

The Agent-Office client should keep the local-first agent office experience while adding an optional server-synced collaboration mode.

## Product Goal

Users should be able to create and manage agent characters on a single machine without running a central server. That local-only flow should keep using the Electron app, local dashboard server, local agent registry, and `~/.agent-office/agent-registry.json`.

Users should also be able to connect the client to a central server and opt into server-backed agent character state. In that mode, creating, editing, archiving, deleting, or changing an agent character avatar should be reflected on other clients connected to the same server.

Local-only mode and server-backed mode are both first-class modes. Server sync must not remove the ability to work offline or use Agent-Office as a personal local tool.

## Client Implementation Direction

- Preserve the current Electron IPC agent creation and update flow for local-only mode.
- Add an explicit configuration path for server-backed agent character sync instead of silently replacing local registry behavior.
- Route create, update, archive/delete, avatar change, and realtime subscription behavior through the configured central server only when server sync is enabled.
- Keep local dashboard rendering compatible with both local registry records and server-owned agent records.
- Reconcile local and central state on startup with clear conflict rules for name, role, workspace, provider, and avatar changes.
- Continue to support local agent recovery and local session history when the central server is unavailable.
- Prefer stable avatar identifiers or server-provided avatar metadata over index-only assumptions for server-synced agents.

## Success Criteria

- With no central server configured, a user can create an agent character, restart the app, and still see that character locally.
- With central sync enabled, creating an agent character on one client causes other connected clients to display the same character through server events.
- Updating an agent character's name, role, provider, archive state, or avatar in server-backed mode updates other connected dashboards without manual refresh.
- If the central server is unavailable, local-only use remains understandable and functional.
