# Contributing to Agent-Office

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

```bash
git clone https://github.com/C2N3/Agent-Office.git
cd Agent-Office
npm install
npm start
```

`npm start` and `npm run dashboard` build the current TypeScript runtime into `dist/` before they run. `npm run dev` watches `src/`, `public/`, HTML/CSS, and tsconfig files, rebuilds `dist/` when needed, and restarts Electron automatically. If you need to refresh the emitted runtime manually, use `npm run build:dist`.

### Running Tests

```bash
npm run typecheck       # Run tsgo in no-emit mode
npm test -- --runInBand # Run the Jest suite serially
```

Additional commands:

```bash
npm run test:coverage   # Run with coverage report
npm run test:watch      # Watch mode for development
```

## How to Contribute

### Reporting Bugs

- Open an issue on [GitHub Issues](https://github.com/C2N3/Agent-Office/issues)
- Include your OS, Node.js version, and Electron version
- Describe the steps to reproduce the bug
- Include any relevant error messages or logs

### Suggesting Features

- Open a GitHub issue with the `enhancement` label
- Describe the use case and expected behavior

### Submitting Code

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Add tests for new functionality
5. Run the full test suite: `npm test`
6. Commit with a clear message: `git commit -m "Add my feature"`
7. Push and open a Pull Request

## Code Guidelines

- **TypeScript-first runtime** — runtime modules now live in `src/**/*.ts` and emit to `dist/`
- **Intentional JS exception** — keep `src/install.js` in JavaScript unless bootstrap strategy changes in a dedicated follow-up refactor
- **No frameworks** — keep the current Electron, vanilla DOM/canvas, and small HTTP server approach
- **Tests** — use Jest 30; place test files in `__tests__/` and prefer source TypeScript entrypoints over `dist/` runtime imports
- **Keep it simple** — avoid abstractions until they're clearly needed

## Architecture Rules

These constraints exist by design. Do not change them:

- **IPC channel names** must remain stable (renderer relies on them)
- **Hook schema** must keep `additionalProperties: true` (future-proofing for new Claude Code fields)
- **Avatar file list** is defined in `public/shared/avatars.json` and `public/shared/sprite-frames.json` (single source of truth) — do not duplicate in individual modules
- **Agent lifecycle** is PID-based only — do not add manual dismiss or timer-based removal

## Art Assets

The pixel art assets in `public/characters/` and `public/office/` are under a [separate restrictive license](LICENSE-ASSETS). Do not modify, redistribute, or include them in other projects.

If you need to test with custom sprites, create your own in a separate directory.

## Questions?

Open an issue or start a discussion on the GitHub repository.
