# Agent-Office

[![CI](https://github.com/C2N3/Agent-Office/actions/workflows/test.yml/badge.svg)](https://github.com/C2N3/Agent-Office/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-32+-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)

> Standalone Electron app that visualizes Claude Code CLI and Codex CLI sessions as animated pixel avatars in real time.

Korean README: [README.ko.md](README.ko.md)

Agent-Office receives [Claude Code](https://docs.anthropic.com/en/docs/claude-code) hook events and can also ingest [Codex](https://developers.openai.com/codex/) `exec --json` streams. It renders each agent session as an animated pixel character and provides a virtual office view, activity heatmaps, token usage analysis, and a browser-based dashboard.

![Demo](docs/demo.gif)

|                            |                            |                            |
| -------------------------- | -------------------------- | -------------------------- |
| ![](docs/screenshot-1.png) | ![](docs/screenshot-2.png) | ![](docs/screenshot-4.png) |
| ![](docs/screenshot-5.png) |                            |                            |

## Features

- **Pixel avatars** for each agent session with state-based animation
- **Virtual office** with animated characters moving across a 2D pixel-art workspace
- **Agent desk dashboard** at `http://localhost:3000` for live monitoring and controls
- **Activity heatmap** with GitHub-style daily session history
- **Token analytics** with per-session totals, model breakdowns, and estimated cost
- **Terminal focus** to bring the matching terminal window to the front
- **Managed Workspaces** with `git worktree` creation, copy/symlink setup, and cleanup actions
- **PiP mode** so the office can stay visible while you work
- **Automatic recovery** after app restarts
- **Codex session support** through both `exec --json` forwarding and `~/.codex/sessions` scanning
- **Claude sub-agent and team support**

## Requirements

- **Node.js** 20+
- **Claude Code CLI** with hooks enabled, or **Codex CLI** with session files / `exec --json`
- **OS:** Windows, macOS, or Linux

## Quick Start

```bash
git clone https://github.com/C2N3/Agent-Office.git
cd Agent-Office
npm install
npm start
```

`npm install` automatically registers the Claude hook in `~/.claude/settings.json`. Codex does not use that hook registration path and instead relies on session files or the `exec --json` forwarder.

## Runtime Model

- Production runtime output lives in `dist/`
- `npm start` and `npm run dashboard` automatically run `npm run build:dist` first
- `npm run dev` watches `src/`, `public/`, HTML/CSS, and tsconfig files, rebuilds `dist/`, and restarts Electron
- If you run a `node dist/...` entrypoint directly, build once first with `npm run build:dist`
- TypeScript uses the TypeScript 7 preview toolchain through `tsgo`, not plain `tsc`

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
- The Codex forwarder posts to `http://127.0.0.1:47822/codex-event` by default
- Override the Codex event port with `PIXEL_AGENT_CODEX_PORT`

## Scripts

| Command                    | Description                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `npm run build:dist`       | Build the TypeScript runtime into `dist/`                                            |
| `npm run build:dist:watch` | Watch `src/`, `public/`, and tsconfig files and rebuild `dist/`                      |
| `npm run typecheck`        | Run `tsgo --noEmit`                                                                  |
| `npm start`                | Launch the Electron app                                                              |
| `npm run dev`              | Rebuild on source changes and restart Electron automatically                         |
| `npm run dashboard`        | Run the dashboard server directly                                                    |
| `npm test -- --runInBand`  | Run the baseline Jest verification flow against source TypeScript                    |
| `npm run dist:mac:signed`  | Rebuild, verify, and create a signed/notarized macOS DMG when signing credentials exist |

## Managed Workspaces

The dashboard `+ New` flow supports two creation modes:

- `Existing Path` to register an already existing project directory
- `Git Worktree` to create a new worktree and connect it to Agent-Office immediately

`Git Worktree` mode can:

- create or reuse a branch
- choose a custom worktree parent directory
- copy setup files such as `.env.local`
- symlink large directories such as `node_modules`
- open the embedded terminal immediately
- queue a bootstrap command such as `npm install`

Workspace agents also expose lifecycle actions in the dashboard:

- `Merge` merges back to the base branch, removes the worktree and branch, then archives the agent
- `Remove` deletes the worktree and branch without merging, then archives the agent

Safety rules:

- active sessions block merge/remove
- dirty worktrees block merge/remove
- failed merges attempt `git merge --abort` automatically

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

GitHub Actions release signing/notarization uses these repository secrets:

- `APPLE_DEVELOPER_ID_APPLICATION_CERT_BASE64`
- `APPLE_DEVELOPER_ID_APPLICATION_CERT_PASSWORD`
- `APPLE_API_KEY_BASE64`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

## Troubleshooting

**No avatars appear**

- For Claude, confirm `~/.claude/settings.json` contains the Agent-Office hook
- For Codex, confirm session files appear under `~/.codex/sessions` or use `codex exec --json ... | node dist/src/codex-forward.js`
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
