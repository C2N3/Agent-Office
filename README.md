# Agent-Office

[![CI](https://github.com/C2N3/Agent-Office/actions/workflows/test.yml/badge.svg)](https://github.com/C2N3/Agent-Office/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-32+-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)

> Standalone Electron app that visualizes Claude Code and Codex CLI sessions as animated pixel avatars in real time, with Gemini available for launched tasks.

Korean README: [README.ko.md](README.ko.md)

## Features

- **Pixel avatars** for each agent session with state-based animation
- **Virtual office** with animated characters moving across a 2D pixel-art workspace
- **Agent desk dashboard** at `http://localhost:3000` for live monitoring and controls
- **Activity heatmap** with GitHub-style daily session history
- **Transcript-based token and cost statistics** for Claude and Codex sessions
- **Terminal focus** to bring the matching terminal window to the front
- **Managed Workspaces** with `git worktree` creation, copy/symlink setup, and cleanup actions
- **Force session termination** for stopping a stuck or mis-prompted agent session from the dashboard
- **PiP mode** so the office can stay visible while you work
- **Automatic recovery** after app restarts
- **Provider catalog** for Claude, Codex, and Gemini task/runtime selection
- **Codex session support** through both `exec --json` forwarding and `~/.codex/sessions` scanning
- **Claude sub-agent and team support**

## Requirements

- **Node.js** 24+
- **Claude Code CLI** with hooks enabled, **Codex CLI** with session files / `exec --json`, or **Gemini CLI** for task execution
- **OS:** Windows, macOS, or Linux

## Quick Start

```bash
git clone https://github.com/C2N3/Agent-Office.git
cd Agent-Office
npm install
npm start
```

`npm install` automatically registers the Claude hook in `~/.claude/settings.json`. Codex does not use that hook registration path and instead relies on session files or the `exec --json` forwarder. Gemini is available as a provider for launched tasks when the CLI is installed.

## Runtime Model

- Production runtime output lives in `dist/`
- `npm start` and `npm run dashboard` automatically run `npm run build:dist` first
- `npm run dev` watches `src/`, `public/`, HTML/CSS, and tsconfig files, rebuilds `dist/`, and restarts Electron
- If you run a `node dist/...` entrypoint directly, build once first with `npm run build:dist`
- TypeScript uses the TypeScript 7 preview toolchain through `tsgo`, not plain `tsc`

## Providers

Agent-Office uses a provider registry for runtime behavior and a dashboard provider catalog for UI behavior. Keep those in sync when adding or changing providers:

- `src/main/providers/registry.ts` for CLI commands, resume commands, liveness, transcript support, and recovery capabilities
- `public/dashboard/providerCatalog.ts` for dashboard labels, model options, and terminal boot commands

Enable providers with `PIXEL_AGENT_PROVIDERS`:

```bash
PIXEL_AGENT_PROVIDERS=all npm start
PIXEL_AGENT_PROVIDERS=claude,codex,gemini npm start
```

The default runtime always enables Claude. Codex is also enabled automatically when Codex session roots are detected.

## Codex

Enable the Codex adapter explicitly:

```bash
PIXEL_AGENT_PROVIDERS=claude,codex npm start
```

Forward `codex exec --json` output into the app:

```bash
codex exec --json "summarize this repo" | node dist/src/codex-forward.js
```

Notes:

- Codex supports recovery, session scanning, heatmaps, and conversation history paths
- Claude-only hook metadata such as some sub-agent and team events still comes from the Claude hook path
- Gemini supports launched task provider selection, but does not currently provide transcript statistics
- The Codex forwarder posts to `http://127.0.0.1:47822/codex-event` by default
- Override the Codex event port with `PIXEL_AGENT_CODEX_PORT`

## Scripts

Run these from the client project directory.

| Script                      | Underlying command                                                                                        | Description                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `npm run postinstall`       | `node src/install.js`                                                                                     | Register the Claude hook; runs automatically after `npm install`               |
| `npm run rebuild`           | `electron-rebuild -f -w node-pty`                                                                         | Rebuild the native `node-pty` module for Electron                              |
| `npm run build:dist`        | `node scripts/build-types.js`                                                                             | Build the TypeScript runtime into `dist/`                                      |
| `npm run build:dist:watch`  | `node scripts/build-types.js --watch`                                                                     | Watch source, public, HTML/CSS, and tsconfig files and rebuild `dist/`         |
| `npm run build:types`       | `npm run build:dist`                                                                                      | Alias for the `dist/` TypeScript build                                         |
| `npm run prestart`          | `npm run build:dist`                                                                                      | Build `dist/`; runs automatically before `npm start`                           |
| `npm start`                 | `node scripts/run-electron.js`                                                                            | Launch the Electron app after `prestart` builds `dist/`                        |
| `npm run dev`               | `node scripts/dev-runtime.js`                                                                             | Rebuild on source changes and restart Electron automatically                   |
| `npm run typecheck`         | `node node_modules/@typescript/native-preview/bin/tsgo.js -p tsconfig.json --noEmit`                      | Run a no-emit TypeScript check with `tsgo`                                     |
| `npm test`                  | `jest`                                                                                                    | Run Jest tests against source TypeScript                                       |
| `npm run test:coverage`     | `jest --coverage`                                                                                         | Run Jest with coverage output                                                  |
| `npm run test:watch`        | `jest --watch`                                                                                            | Run Jest in watch mode                                                         |
| `npm run predashboard`      | `npm run build:dist`                                                                                      | Build `dist/`; runs automatically before `npm run dashboard`                   |
| `npm run dashboard`         | `node dist/src/dashboardServer/index.js`                                                                  | Run the dashboard server directly after `predashboard` builds `dist/`          |
| `npm run lint`              | `eslint src/`                                                                                             | Lint source files                                                              |
| `npm run lint:fix`          | `eslint src/ --fix`                                                                                       | Lint source files and apply automatic fixes                                    |
| `npm run format`            | `prettier --write "src/**/*.{js,ts}" "__tests__/**/*.js" "scripts/**/*.js" "*.js"`                        | Format source, tests, scripts, and root JavaScript files                       |
| `npm run format:check`      | `prettier --check "src/**/*.{js,ts}" "__tests__/**/*.js" "scripts/**/*.js" "*.js"`                        | Check formatting without writing changes                                       |
| `npm run dist`              | `electron-builder`                                                                                        | Package the app with Electron Builder                                          |
| `npm run dist:win`          | `npm run build:dist && electron-builder --win --publish never`                                            | Build `dist/` and create a Windows package without publishing                  |
| `npm run dist:mac`          | `npm run build:dist && electron-builder --mac --publish never`                                            | Build `dist/` and create a macOS package without publishing                    |
| `npm run dist:mac:unsigned` | `npm run build:dist && electron-builder --mac --publish never -c.mac.identity=null -c.mac.notarize=false` | Build `dist/` and create an unsigned, non-notarized macOS package              |
| `npm run dist:mac:signed`   | `node scripts/dist-mac-signed.js`                                                                         | Rebuild, verify, sign, notarize, and create a macOS DMG when credentials exist |
| `npm run dist:linux`        | `npm run build:dist && electron-builder --linux --publish never`                                          | Build `dist/` and create a Linux package without publishing                    |

## Managed Workspaces

The dashboard `+ New` flow now starts from a single `Workspace Path` input and auto-decides how to register it.

- non-git folders are registered directly
- git folders are also registered directly when no other active agent is using the same repository
- if the same repository is already in use, Agent-Office creates a managed `git worktree` instead

Advanced options let you override the strategy and configure worktree-specific settings when needed:

- branch name, base branch, and start point
- custom worktree parent directory
- copied setup files such as `.env.local`
- symlinked large directories such as `node_modules`; existing dependency folders are detected and linked by default
- bootstrap commands such as `npm install`

Workspace agents also expose lifecycle actions in the dashboard:

- `Stop` force-terminates the active session/process and returns the agent to offline state
- `Merge` merges back to the base branch, removes the worktree and branch, then archives the agent
- `Remove` deletes the worktree and branch without merging, then archives the agent

Safety rules:

- active sessions block merge/remove
- dirty worktrees block merge/remove
- failed merges attempt `git merge --abort` automatically

## Remote Access

The dashboard Remote tab includes a Central Server card. Edit `Server URL` there to point the local proxy at a different central server. Entering only a port such as `47824` expands to `http://127.0.0.1:47824`.

The saved value is stored in `~/.agent-office/central-server-url.txt`. `AO_CENTRAL_SERVER_URL` is still supported as the startup fallback when no saved value exists.

The same tab now includes an explicit mode selector with `Local Only`, `Host`, and `Guest`. Picking a pill only changes the draft selection. The mode changes when you press the primary action for that sheet: `Use Local Only`, `Start Host`, or `Join as Guest`.

- `Local Only` keeps the central server URL on disk, but leaves the worker bridge and character sync off.
- `Host` uses the server URL, opens the host session, enables the public room, and stores the owner secret automatically.
- `Guest` accepts an invite link, stores the guest room secret locally, and then turns on the worker bridge and character sync through that room secret. Opening an invite link on a machine that already has Agent-Office running at `http://localhost:3000` can join automatically from the URL fragment.

The selected mode is stored in `~/.agent-office/central-remote-mode.txt`. Room secrets are stored in `~/.agent-office/central-room-secret.txt`.

When Guest mode is active without a stored room secret, the worker bridge and character sync stay off until an invite is joined. When Guest mode is active with a stored secret, the worker bridge uses that room secret instead of the worker token. The Remote tab and central agent mirror keep using polling fallback in Guest mode because the central event stream is not relied on there.

The sidebar also exposes a separate `Cloudflare` tab. That tab keeps the quick-tunnel controls available without mixing them into the Host/Guest product UI.

## macOS Release

This repository includes a signed macOS release path.

```bash
npm install
npm run dist:mac:signed
```

`npm run dist:mac:signed` must be run on macOS and executes:

- `npm run rebuild`
- `npm run build:dist`
- `npm run typecheck`
- `npm test -- --runInBand`
- notarized macOS DMG packaging into `release/`

For notarization, provide one of these credential sets:

- App Store Connect API key
  - `APPLE_API_KEY` or `APPLE_API_KEY_BASE64`
  - `APPLE_API_KEY_ID`
  - `APPLE_API_ISSUER`
- Apple ID fallback
  - `APPLE_ID`
  - `APPLE_APP_SPECIFIC_PASSWORD`
  - `APPLE_TEAM_ID`

For code signing, provide one of:

- `CSC_LINK` and `CSC_KEY_PASSWORD`
- `CSC_NAME` if the Developer ID Application certificate is already installed in the macOS keychain

GitHub Actions tag releases currently build Windows artifacts and an unsigned macOS DMG. Use `npm run dist:mac:signed` locally when signing and notarization are required.

## Troubleshooting

**No avatars appear**

- For Claude, confirm `~/.claude/settings.json` contains the Agent-Office hook
- For Codex, confirm session files appear under `~/.codex/sessions` or use `codex exec --json ... | node dist/src/codex-forward.js`
- For Gemini, confirm the Gemini CLI is installed and on `PATH`, then enable it with `PIXEL_AGENT_PROVIDERS=all` or `PIXEL_AGENT_PROVIDERS=claude,codex,gemini`
- A `404` response from `curl http://localhost:47821/hook` is normal and confirms the hook server is listening

**Ghost avatars remain**

- This is usually a temporary PID-detection or session-file cleanup delay, especially on Windows
- Restarting the app resets in-memory session state

**Dashboard does not open**

- Confirm port `3000` is available

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

- **Source code:** [MIT License](LICENSE)
- **Art assets** (`public/characters/`, `public/office/`): [Custom restrictive license](LICENSE-ASSETS)
