# Agent-Office

[![CI](https://github.com/Mgpixelart/agent-office/actions/workflows/test.yml/badge.svg)](https://github.com/Mgpixelart/agent-office/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-32+-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)

> Real-time pixel avatar visualization for Claude Code CLI and Codex CLI sessions.

Agent-Office is a standalone Electron app that listens to [Claude Code](https://docs.anthropic.com/en/docs/claude-code) hook events and can also ingest [Codex](https://developers.openai.com/codex/) `exec --json` streams. It renders each agent session as an animated pixel character with a virtual office, activity heatmaps, and token usage analytics.

![Demo](docs/demo.gif)

| | | |
|---|---|---|
| ![](docs/screenshot-1.png) | ![](docs/screenshot-2.png) | ![](docs/screenshot-4.png) |
| ![](docs/screenshot-5.png) | | |

## Highlights

- **Pixel Avatars** — Each agent session gets a unique sprite character with state-driven animations
- **Virtual Office** — 2D pixel art office where characters walk between desks
- **Agent Desk Dashboard** — Web-based monitoring panel with real-time stats (http://localhost:3000)
- **Activity Heatmap** — GitHub-style contribution grid showing daily agent session frequency
- **Token Analytics** — Per-session and aggregate token usage, cost estimates, model breakdowns
- **Terminal Focus** — Click any avatar to bring its terminal window to the foreground
- **PiP Mode** — Always-on-top floating window so your pixel office stays visible while you work
- **Auto Recovery** — Running sessions are automatically restored on app restart
- **Sub-agents & Teams** — Full support for Claude Code sub-agents and team mode
- **Codex MVP Input** — Optional `codex exec --json` forwarding path via local event ingestion

## Requirements

- **Node.js** 20 or later
- **Claude Code CLI** installed and configured for hook-based monitoring
- **Codex CLI** optional for `exec --json` ingestion
- **OS:** Windows, macOS, or Linux

## Quick Start

```bash
git clone https://github.com/Mgpixelart/agent-office.git
cd agent-office
npm install
npm start
```

> `npm install` also auto-registers the required Claude Code hooks in `~/.claude/settings.json`.

## Codex MVP

Enable the Codex adapter at runtime:

```bash
PIXEL_AGENT_PROVIDERS=claude,codex npm start
```

Forward a `codex exec --json` run into the app:

```bash
codex exec --json "summarize this repo" | node src/codex-forward.js
```

Notes:
- The current Codex path is an MVP for live session state only.
- Claude-only features such as hook auto-registration, PID recovery, and transcript scanning remain on the Claude adapter.
- The Codex forwarder posts to `http://127.0.0.1:47822/codex-event` by default. Override with `PIXEL_AGENT_CODEX_PORT` if needed.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Launch the Electron app |
| `npm run dev` | Development mode (DevTools enabled) |
| `npm test` | Run tests |

## Troubleshooting

**Avatars don't appear**
- Check that hooks are registered in `~/.claude/settings.json`
- Verify the hook server is up: `curl http://localhost:47821/hook` should return 404

**Ghost avatars persist**
- Usually a PID detection issue on Windows — clears within 30 seconds automatically
- Restarting the app clears all state

**Dashboard won't load**
- Make sure port 3000 is free

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

- **Source code:** [MIT License](LICENSE)
- **Art assets** (`public/characters/`, `public/office/`): [Custom restrictive license](LICENSE-ASSETS) — not for redistribution or modification
