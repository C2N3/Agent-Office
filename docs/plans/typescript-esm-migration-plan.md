# Runtime ESM Cutover Plan

## Intent Change

This plan previously favored a conservative ESM migration with compatibility bridges and small verified slices. The current `refactor/esm` branch is now treated as an experimental cutover branch: temporary breakage is acceptable if it lets the project move to the final native ESM shape faster.

The migration should no longer preserve CommonJS compatibility bridges just to keep old caller shapes working. Instead, update callers, tests, scripts, and runtime entrypoints together so the application runtime uses native ESM end to end.

## Target End State

- TypeScript source uses static `import` / `export` by default.
- Electron main, preload, dashboard server, and owned Node runtime modules load as native ESM.
- `dist/` remains the production runtime output.
- Runtime paths use `import.meta.url` helpers instead of `__dirname` or `__filename`.
- Jest, build scripts, and npm scripts understand the final module model.
- Temporary application compatibility bridges such as `.cts` files are removed.
- CommonJS remains only where it is a real boundary:
  - Node-run config or tooling files that are deliberately renamed to `.cjs`
  - native or CommonJS-only packages loaded through `createRequire(import.meta.url)`
  - an Electron preload `.cjs` exception only if Electron cannot reliably load that preload as ESM

## Current Baseline

- Source-level CommonJS cleanup is effectively complete for `src/**/*.ts`, `src/**/*.tsx`, and `src/**/*.mts`.
- `package.json` currently points Electron at `dist/src/main.mjs`.
- `npm run dashboard` currently runs `dist/src/dashboardServer/entrypoint.mjs`.
- `src/agentManager.cts` and `src/sessionScanner.cts` are compatibility bridges and should be removed during the cutover.
- Jest is still CommonJS-oriented through `jest.config.js` and the existing transform.
- Several scripts/configs are still CommonJS and must be converted or renamed before package-wide `"type": "module"` is safe.

## Cutover Strategy

Perform the next implementation as one coordinated cutover rather than a sequence of compatibility-preserving slices.

### 1. Preflight

- Read `AGENTS.md`.
- Check `git status --short --branch` and preserve any existing user changes.
- Rescan source/runtime files for:
  - `require(...)`
  - `module.exports`
  - `exports.*`
  - `__dirname`
  - `__filename`
- Record which files are intentionally already in progress before editing.

### 2. Package And Build Model

- Decide whether to add package-wide `"type": "module"`. Prefer doing so if it makes emitted `dist/**/*.js` files load as native ESM without a parallel `.mjs` tree.
- Update `tsconfig.emit.json` and related build flow so application runtime output is native ESM.
- Keep `dist/` as the production runtime output.
- Remove `.cts` application bridge emission from the build once callers are migrated.
- Rename CommonJS-only scripts/configs to `.cjs` or convert them to ESM before adding `"type": "module"`.

Files likely involved:

- `package.json`
- `tsconfig.json`
- `tsconfig.emit.json`
- `scripts/build-types.js` or its renamed/converted equivalent
- `scripts/run-electron.js`
- `scripts/dev-runtime.js`
- `jest.config.js`
- `eslint.config.js`

### 3. Runtime Application Modules

- Convert owned runtime modules to the final ESM shape.
- Remove ESM wrapper entrypoints if direct ESM runtime modules make them redundant.
- Replace application-level late CommonJS loaders with ESM imports or `await import(...)` where startup order requires laziness.
- Keep lazy loading only when it preserves real runtime behavior, not old CommonJS API compatibility.

Priority areas:

- Electron main entrypoint and startup modules
- Electron preload files and window path resolution
- Dashboard server entrypoint and server modules
- Dashboard/Electron interop loaders
- `agentManager.ts` and `sessionScanner.ts`
- runtime path helpers and call sites

### 4. Remove Compatibility Bridges

- Delete `src/agentManager.cts`.
- Delete `src/sessionScanner.cts`.
- Update all source and tests that expect:

```js
const AgentManager = require('./agentManager')
const SessionScanner = require('./sessionScanner')
```

to use the final ESM/named export shape instead:

```ts
import { AgentManager } from './agentManager.js';
import { SessionScanner } from './sessionScanner.js';
```

Verification checks should use native ESM imports from emitted `dist`:

```bash
node -e "import('./dist/src/agentManager.js').then((m) => console.log(typeof m.AgentManager))"
node -e "import('./dist/src/sessionScanner.js').then((m) => console.log(typeof m.SessionScanner))"
```

### 5. Native And Optional Dependencies

Do not statically import dependencies whose current lazy loading protects startup, packaging, or platform-specific behavior.

Use `createRequire(import.meta.url)` for:

- `node-pty`
- `cloudflared`
- `tree-kill`
- any package that proves CommonJS-only or native-resolution-sensitive under Electron packaging

These are runtime boundaries, not compatibility bridges. Keep them small, named, and tested.

### 6. Jest And Tests

- Convert Jest config and transforms to the chosen final module model.
- If keeping Jest config CommonJS is lower risk, rename it to `jest.config.cjs`.
- Convert tests away from CommonJS `require(...)` when they are testing application modules.
- Remove tests that exist only to verify `.cts` compatibility bridge shapes.
- Preserve mocks for Electron, `child_process`, native packages, and platform-specific branches.

### 7. Electron Preload Handling

- Prefer native ESM preload files.
- Verify each window that owns a preload:
  - main window
  - dashboard
  - overlay
  - PiP
  - task chat
- Check `contextBridge` exposure and `webPreferences.preload` paths from emitted `dist`.
- If Electron cannot load a specific preload as ESM without changing sandbox/context-isolation behavior, keep only that preload as a documented `.cjs` exception.

### 8. Packaging Proof

Run the normal runtime validation first, then package on the current platform.

Required runtime validation:

```bash
npm run build:dist
npm run typecheck
npm test -- --runInBand
timeout 25s npm start
npm run dashboard
```

Platform package validation:

```bash
npm run dist:win
npm run dist:mac:unsigned
npm run dist:linux
```

Use the package target for the platform being worked on. A full cross-platform proof can be deferred, but the plan update must say which targets remain unverified.

Packaged smoke checklist:

- App launches from packaged artifact.
- Main window loads.
- Dashboard server starts once and binds the expected port.
- Dashboard, overlay, PiP, and task chat preload APIs work.
- Terminal creation works with `node-pty`.
- Tunnel setup resolves `cloudflared`.
- Session termination can use `tree-kill` fallback behavior.
- Asset paths resolve avatars, manifests, office layout defaults, helper scripts, and hook logs.

## Risk Gates

The following are allowed in this experimental cutover, but must be mentioned in the implementation summary:

- adding package-wide `"type": "module"`
- renaming scripts/configs from `.js` to `.cjs`
- changing Jest transform/runtime behavior
- removing `agentManager.ts` / `sessionScanner.ts` default CommonJS constructor compatibility
- replacing late application `require(...)` calls
- changing Electron preload file extensions or preload loading paths
- changing electron-builder file inclusion

Hard stop only if a feature cannot be made to work and the remaining exception cannot be scoped to a real runtime boundary. In that case, document the smallest exception and why it is required.

## Suggested Follow-Up Prompt

```text
Implement the Runtime ESM Cutover Plan on `refactor/esm`.

This is an experimental branch, so temporary breakage is acceptable. Do not preserve CommonJS compatibility bridges just to keep old caller shapes working. Update callers/tests/scripts to the final native ESM shape instead.

Operating rules:
1. Read `client/AGENTS.md`.
2. Read `client/docs/plans/typescript-esm-migration-plan.md`.
3. Check `git status --short --branch` from `client/` and do not revert user changes.
4. Rescan source/runtime files for `require(...)`, `module.exports`, `exports.*`, `__dirname`, and `__filename`.
5. Keep `dist/` as the production runtime output.

Cutover goals:
- Add package-wide `"type": "module"` if it is the cleanest route.
- Convert or rename CommonJS scripts/configs before they are reclassified.
- Make emitted application runtime modules native ESM.
- Remove `src/agentManager.cts` and `src/sessionScanner.cts`.
- Migrate callers/tests to named ESM imports.
- Keep `createRequire(import.meta.url)` only for real native/CommonJS package boundaries such as `node-pty`, `cloudflared`, and `tree-kill`.
- Prefer native ESM Electron preloads; keep a `.cjs` preload only if Electron requires it.
- Update Jest config/transforms/tests for the final module model.

Validation:
- `npm run build:dist`
- native ESM import checks for emitted `agentManager` and `sessionScanner`
- `npm run typecheck`
- `npm test -- --runInBand`
- `timeout 25s npm start`
- `npm run dashboard`
- relevant `npm run dist:<target>` package command if packaging metadata or native dependency inclusion changes

Final response must include:
- files changed
- bridges removed
- CommonJS exceptions that remain and why
- validation commands and results
- package targets verified or explicitly left unverified
```
