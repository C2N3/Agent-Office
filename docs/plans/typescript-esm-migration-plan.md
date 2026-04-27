# Runtime ESM Migration Plan

## Goal

Convert the client app to native ESM end to end, including Electron main/preload code, dashboard server runtime code, tests, and packaging.

The migration should end with:

- TypeScript source using static `import`/`export` by default
- Node/Electron runtime entrypoints loading as ESM
- Jest and build tooling configured for the final module model
- runtime paths expressed without CommonJS-only globals such as `__dirname`
- optional/native dependency loading handled intentionally through ESM-compatible boundaries
- `dist/` remaining the production runtime output, but no longer depending on CommonJS as the long-term module contract

## Current Phase Goal

The current phase is a preparation phase: move TypeScript source toward static `import`/`export` modules while preserving the current runtime deployment contract:

- keep `dist/` as the production runtime output
- keep CommonJS emit for Node/Electron runtime entrypoints
- do not add `"type": "module"` to `package.json` during this phase
- do not convert Electron main/preload/dashboard runtime to native ESM yet
- keep existing Jest/CommonJS tests and runtime callers working

This reduces the amount of code that must change during the later runtime ESM cutover.

## Why Do This First

Static TypeScript imports make the codebase easier to analyze and refactor before taking on the higher-risk Electron runtime module-system migration.

Expected benefits:

- stronger typecheck coverage for imported symbols
- better IDE rename and file-move support
- clearer dead-code and unused-export detection
- more visible circular dependencies
- fewer ad hoc CommonJS interop patterns
- easier runtime ESM cutover because fewer modules still depend on CommonJS syntax

The main tradeoff is that source modules and runtime modules remain different for now: source code looks ESM-like, but emitted `dist/` code is still CommonJS. Any public module shape change must be verified against the emitted output.

## Non-Goals

- Do not convert the whole app to native ESM during the preparation phases.
- Do not change Electron startup, packaging, or `electron-builder` behavior during a source-only cleanup slice.
- Do not rewrite React dashboard, overlay, canvas, sprite, pathfinding, or render-loop ownership while doing module cleanup.
- Do not replace dynamic optional/native dependency loading when the dynamic load is intentional.

These are non-goals for individual preparation slices, not for the overall plan. The final phases explicitly cover runtime ESM, Electron startup, Jest, and packaging.

## Current Runtime Constraints To Retire

The app currently depends on CommonJS runtime behavior in several places. The preparation phases should reduce these dependencies; the runtime cutover phases should remove or isolate them.

- `package.json` points Electron at `dist/src/main.js`.
- `npm start` depends on `npm run build:dist`.
- Jest loads source TypeScript through the existing transform and many tests still use `require(...)`.
- Electron preload, HTML, and asset paths are resolved from emitted `dist/` locations.
- Some runtime dependencies are optional, native, or platform-specific and should not be statically loaded at app startup.

Final ESM migration must replace these constraints with explicit ESM-compatible patterns, not ignore them.

## Migration Principles

- Prefer small feature slices over broad mechanical rewrites.
- Keep each slice limited to related modules and their direct callers.
- After changing public exports, verify the emitted CommonJS `require(...)` shape.
- Preserve existing default CommonJS public APIs unless all callers are updated in the same slice.
- Keep dynamic `require(...)` when it represents a real lazy, optional, native, or platform-specific load.
- Treat `__dirname` path logic as a runtime contract, not a formatting problem.
- Commit each verified slice separately.
- When a CommonJS boundary cannot be removed safely yet, label why it remains and which final ESM phase owns it.

## Safe Conversion Pattern

Good candidates:

- leaf utility modules with named exports
- internal helpers already consumed through destructured `require(...)`
- modules whose callers are tests and nearby source files only
- modules without `__dirname`, native dependency loading, or late runtime loading

Typical conversion:

```ts
import fs from 'fs';
import { someHelper } from './helper';

export function doWork() {
  return someHelper(fs.existsSync);
}
```

Then verify that CommonJS emit still exposes the expected shape:

```bash
npm run build:dist
node -e "console.log(require('./dist/src/path/to/module.js'))"
```

## Compatibility Rules

When a module currently supports:

```js
const Thing = require('../src/thing');
```

do not casually replace it with only:

```ts
export class Thing {}
```

That changes the public CommonJS shape. Either update all callers/tests to named access:

```js
const { Thing } = require('../src/thing');
```

or leave the module for a dedicated compatibility slice.

Avoid mixing:

```ts
export { Thing };
module.exports = Thing;
```

unless a compatibility boundary is deliberately documented and the emitted `dist` shape is verified.

## Boundaries To Preserve During Preparation

### Native or Optional Dependencies

Keep dynamic loading where startup or packaging behavior depends on it during source-only cleanup:

- `node-pty`
- `cloudflared`
- `tree-kill` fallback loading
- platform-specific terminal launch/focus behavior when tests rely on runtime property lookup

Namespace imports can be useful when tests spy on module properties:

```ts
import * as childProcess from 'child_process';

childProcess.spawn(...);
```

In the final ESM phases, each remaining dynamic CommonJS load should move to one of these patterns:

- ESM `import()` when asynchronous lazy loading is acceptable
- Node `createRequire(import.meta.url)` when a CommonJS-only or native package must be loaded from ESM
- a small `.cjs` compatibility bridge when package behavior cannot be expressed cleanly from ESM

### Runtime Paths

Be conservative around `__dirname` and emitted `dist` path contracts:

- Electron preload paths
- HTML file loading
- asset manifest loading
- script paths such as platform helper scripts
- dashboard server runtime paths

Only convert these files after explicitly documenting the path before and after emit.

In the final ESM phases, these paths should migrate to `import.meta.url` helpers, for example:

```ts
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```

Prefer a shared helper once repeated path conversion becomes visible.

### Dynamic Late Loading

Some `require(...)` calls intentionally avoid early initialization or break cycles. These should be analyzed before conversion, especially in:

- dashboard server startup
- window manager startup
- event processor internals
- bootstrap modules

## Phased Plan

### Phase 1: Named Leaf Modules

Convert leaf modules where callers already use named destructuring and no runtime path contract is involved.

Validation:

- focused Jest test, or `npm run typecheck`
- `npm run build:dist` if export shape changed
- emitted `require(...)` shape check for public modules

### Phase 2: Main-Process Service Slices

Convert related service groups:

- workspace manager and IPC
- registry helpers
- session parsing/recovery utilities
- provider event processors
- hook/Codex event servers
- recovery IPC helpers

Validation:

- focused service tests
- `npm run typecheck`
- `npm run build:dist`
- emitted shape check

### Phase 3: Runtime Boundary Slices

Handle modules with Electron or path contracts one group at a time:

- `main/ipc/window.ts`
- `main/ipc/registry.ts`
- `main/bootstrap/*`
- `main/windowing/index.ts`
- dashboard server handlers

Before editing, record:

- which paths are resolved from source
- what the emitted `dist` path becomes
- whether a caller uses default or named CommonJS shape
- whether the module participates in startup order or late loading

Validation:

```bash
npm run build:dist
npm run typecheck
npm test -- --runInBand
timeout 25s npm start
```

### Phase 4: Compatibility Boundaries

Decide what to do with public default CommonJS modules such as:

- `src/agentManager.ts`
- `src/sessionScanner.ts`

Options:

- keep them as intentional CommonJS public boundaries
- update all tests/callers to named access in one slice
- add temporary compatibility exports with an explicit TODO and emitted shape test

### Phase 5: Runtime ESM Design

After most source files use static modules, design the native runtime ESM cutover.

#### Phase 5 Runtime ESM Design

This phase is documentation-only until the design is reviewed. It must not add `"type": "module"`, switch Electron/Node runtime loading, or change Jest/build/package behavior by itself.

##### Package And Module Strategy

Selected strategy for the next implementation phase: use an explicit `.mjs` / `.cjs` split first, and defer package-wide `"type": "module"` until after the packaged Electron runtime is proven.

- Keep `package.json` without `"type": "module"` during the next implementation phase.
- Move native ESM runtime entrypoints and directly-owned runtime modules to emitted `.mjs` files through `.mts` source files or an equivalent dedicated ESM emit path.
- Keep CommonJS-only tooling, config, and compatibility bridges as `.cjs`.
- Keep `dist/` as the production runtime output. Do not introduce a source-runtime path that bypasses `dist/`.
- Defer package-wide `"type": "module"` because it would immediately reclassify root `.js` scripts/configs, copied runtime `.js` files, Jest config, and Electron packaging assumptions in one broad change.

Stop condition: if the `.mjs` split requires renaming a large cross-section of unrelated modules only to satisfy extension rules, stop and reassess whether a later package-wide `"type": "module"` cutover is lower risk.

##### TypeScript Emit Strategy

Target strategy:

- Keep the current `tsconfig.emit.json` CommonJS-compatible output until the first runtime ESM slice is ready to switch an entrypoint.
- Add a dedicated ESM emit configuration only when implementation starts, rather than mutating the existing emit config in place.
- Emit native ESM for runtime ESM slices with Node-compatible resolution and explicit runtime extensions.
- Preserve `dist/src/main.js` and `dist/src/dashboardServer/index.js` until the corresponding entrypoint slice intentionally changes `package.json` or npm scripts.
- Verify every public CommonJS compatibility bridge from emitted `dist/`, not from source.

Likely implementation shape:

- `tsconfig.emit.json` remains the current CommonJS runtime emit during compatibility work.
- A later `tsconfig.emit.esm.json` or file-extension-based `.mts` slice emits `.mjs` runtime files.
- ESM source imports must use runtime-correct `.js` / `.mjs` specifiers according to the chosen emit path.

Stop condition: do not alter `scripts/build-types.js`, Vite output, copied assets, and runtime TypeScript emit in the same commit unless the prior slice has already proven the emitted ESM entrypoint shape.

##### Electron Main And Preload Strategy

Target strategy:

- Convert the Electron main entrypoint only after path helpers and native dependency bridges exist.
- Point `package.json` `main` from `dist/src/main.js` to the emitted ESM main file only in the Electron runtime slice.
- Replace `require.main === module` style checks with an ESM-safe entrypoint helper where needed.
- Treat preload scripts as a separate sub-slice from main-process startup.
- Prefer keeping preload compatibility wrappers as `.cjs` until Electron preload ESM behavior is verified in development and packaged builds.
- If a preload is converted to native ESM, verify `contextBridge` exposure, `BrowserWindow` `webPreferences.preload`, and packaged path resolution in the same slice.

Validation for the main-process slice:

```bash
npm run build:dist
npm run typecheck
npm test -- --runInBand
timeout 25s npm start
```

Additional validation for each preload slice:

- Open the window that owns the preload.
- Verify the exposed preload API used by that window.
- Verify the emitted preload path exists under `dist/`.

Stop condition: if Electron cannot load a preload as ESM without changing sandbox/context-isolation behavior, keep that preload as an intentional `.cjs` boundary and document it before continuing.

##### Dashboard Server Runtime Strategy

Target strategy:

- Convert dashboard server startup after Electron main can load ESM.
- Replace the `require.main === module` guard in `src/dashboardServer/index.ts` with an ESM entrypoint check based on `import.meta.url` and `process.argv[1]`.
- Change `npm run dashboard` only in the dashboard runtime slice, from `node dist/src/dashboardServer/index.js` to the emitted ESM dashboard entrypoint.
- Convert late dashboard imports from Electron bootstrap/windowing to dynamic `import()` unless they must stay synchronous for startup ordering.
- Keep dashboard server state in existing context modules; do not redesign the server lifecycle while migrating modules.

Validation:

```bash
npm run build:dist
npm run typecheck
npm test -- --runInBand
npm run dashboard
```

Stop condition: if dynamic dashboard imports change startup order, singleton state, or port binding behavior, stop and split the server lifecycle change into a separate design task.

##### Jest Transform And Runtime Strategy

Target strategy:

- Defer broad Jest ESM runtime changes until after Electron and dashboard emitted ESM entrypoints are proven.
- Keep `jest.config.js` CommonJS initially; if package-wide `"type": "module"` is later adopted, rename it to `jest.config.cjs`.
- Keep `scripts/jest-ts-transform.js` and `scripts/jest-ts-transform/helpers.js` CommonJS unless the test runtime itself is intentionally converted.
- Add ESM test coverage in a focused slice for the new path helper, ESM entrypoint guard, and compatibility bridges.
- Convert tests that assert default CommonJS public APIs only when the matching `.cjs` compatibility bridge exists or callers have been intentionally migrated.

Stop condition: do not combine native Jest ESM configuration, test rewrites, and Electron runtime ESM loading in one commit.

##### `__dirname` And `__filename` Replacement

Target strategy:

- Add a small ESM path helper before converting path-heavy runtime modules.
- Replace each `__dirname` or `__filename` contract only inside the slice that owns its runtime path.
- Verify before/after emitted paths for preload scripts, HTML files, assets, PowerShell/helper scripts, hook logs, and dashboard runtime roots.

Required helper behavior:

- `moduleFilename(import.meta.url)` returns the file path equivalent of CommonJS `__filename`.
- `moduleDirname(import.meta.url)` returns the directory equivalent of CommonJS `__dirname`.
- `resolveFromModule(import.meta.url, ...segments)` is allowed if it reduces repeated path logic.

Owned path-contract slices:

- Electron preload and HTML paths: `src/main/windowing/core.ts`, `src/main/windowing/secondary/windows.ts`.
- Asset paths: `src/main/ipc/window.ts`, `src/main/bootstrap/avatars.ts`, `src/officeLayout.ts`.
- Script paths and logs: `src/main/livenessChecker.ts`, `src/main/bootstrap/runtime.ts`, `src/sessionend_hook.ts`.
- Dashboard runtime root: `src/dashboardServer/constants.ts`.

Stop condition: if a path depends on whether code is running from source, emitted `dist`, or a packaged `app.asar`, document the current and target path first and verify it under `npm start` before touching the next path contract.

##### Optional And Native Dependency Strategy

Target strategy:

- Use `createRequire(import.meta.url)` for CommonJS-only, native, or package-resolution-sensitive dependencies.
- Use dynamic `import()` only when asynchronous loading is acceptable and package interop is verified.
- Keep lazy loading where it currently avoids startup cost, optional dependency failures, platform-only behavior, or test initialization side effects.

Dependency decisions:

- `node-pty`: use `createRequire(import.meta.url)` behind the existing lazy terminal loading boundary. Do not statically import it at app startup.
- `cloudflared`: use `createRequire(import.meta.url)` in the tunnel manager so package-specific `bin` resolution stays synchronous and packaging-visible.
- `tree-kill`: use `createRequire(import.meta.url)` or a tiny `.cjs` bridge if default interop is ambiguous. Preserve existing fallback behavior.
- Late `child_process` loads: prefer normal ESM imports only when tests and platform branches do not rely on late property lookup; otherwise isolate with a small lazy helper.

Validation:

- Terminal creation with `node-pty`.
- Tunnel binary resolution with `cloudflared`.
- Session termination fallback with `tree-kill`.
- Packaged build includes required native/package files.

Stop condition: if a dependency behaves differently under unpackaged and packaged runtime, stop after documenting the exact package path and electron-builder inclusion requirement.

##### `agentManager.ts` And `sessionScanner.ts` Compatibility Strategy

Target strategy:

- Preserve the current default CommonJS public API until all callers are intentionally migrated.
- Convert the implementation to native ESM class exports only in a dedicated compatibility slice.
- Provide `.cjs` bridge files if existing callers must keep `const AgentManager = require(...)` or `const SessionScanner = require(...)`.
- Verify both default constructor access and named property access from emitted `dist`.

Required emitted compatibility checks:

```bash
node -e "const AgentManager = require('./dist/src/agentManager.cjs'); console.log(typeof AgentManager, AgentManager === AgentManager.AgentManager)"
node -e "const SessionScanner = require('./dist/src/sessionScanner.cjs'); console.log(typeof SessionScanner, SessionScanner === SessionScanner.SessionScanner)"
```

Stop condition: do not remove default CommonJS constructor compatibility unless every source, test, and external runtime caller has been migrated in the same reviewed slice.

##### Scripts That Stay CommonJS

Keep these scripts/configs CommonJS during the next runtime implementation phase:

- `scripts/build-types.js`
- `scripts/dev-runtime.js`
- `scripts/dev-runtime/file-change.js`
- `scripts/run-electron.js`
- `scripts/dist-mac-signed.js`
- `scripts/jest-ts-transform.js`
- `scripts/jest-ts-transform/helpers.js`
- `scripts/renderer-dev/client-script.js`
- `scripts/vite-dev-server.js`
- `scripts/watch-utils.js`
- `jest.config.js`
- `eslint.config.js`

If a later package-wide `"type": "module"` cutover is approved, rename the Node-run CommonJS files to `.cjs` in a tooling-only slice before adding `"type": "module"`.

##### Packaging Verification Sequence

Use this sequence when an implementation slice changes runtime module loading, Electron entrypoints, preloads, native dependency loading, or packaging metadata:

```bash
npm run build:dist
npm run typecheck
npm test -- --runInBand
timeout 25s npm start
npm run dashboard
```

Then run the platform package target on the platform being used:

```bash
npm run dist:win
npm run dist:mac:unsigned
npm run dist:linux
```

Packaged verification checklist:

- App launches from packaged artifact.
- Main window loads `index.html`.
- Dashboard, overlay, PiP, and task chat windows load their preload APIs.
- Dashboard server starts once and binds the expected port.
- Terminal creation works with `node-pty`.
- Tunnel setup can resolve `cloudflared`.
- Session termination can call `tree-kill` fallback behavior.
- Asset paths resolve avatars, shared manifests, office layout defaults, helper scripts, and hook logs.

##### Ordered Migration Slices For The Next Implementation Phase

1. Path helper and entrypoint guard design slice.
   - Add ESM-safe helpers only where they can be tested without changing runtime module loading.
   - Validation: focused helper tests, `npm run typecheck`, `git diff --check`.
   - Stop if helper use requires immediate package or Electron entrypoint changes.

2. Compatibility bridge slice for `agentManager.ts` and `sessionScanner.ts`.
   - Preserve default CommonJS constructor behavior while preparing ESM implementation exports.
   - Validation: `npm run build:dist`, emitted compatibility checks, focused Jest tests, `npm run typecheck`.
   - Stop if default constructor and named property access cannot both be preserved.

3. Optional/native dependency bridge slice.
   - Isolate `node-pty`, `cloudflared`, and `tree-kill` behind `createRequire(import.meta.url)`-compatible helpers or `.cjs` bridges.
   - Validation: focused tests or smoke scripts for each loader, `npm run build:dist`, `npm run typecheck`.
   - Stop if packaged dependency resolution changes.

4. Runtime path-contract slice.
   - Convert `__dirname` / `__filename` users in small groups: assets, helper scripts/logs, dashboard constants, then window preload/html paths.
   - Validation: before/after emitted path checks, `npm run build:dist`, `npm run typecheck`, focused tests where available.
   - Stop if any path has source/dist/packaged ambiguity.

5. Electron main ESM entrypoint slice.
   - Introduce the emitted `.mjs` main entrypoint and switch `package.json` `main` only in this slice.
   - Validation: `npm run build:dist`, `npm run typecheck`, `npm test -- --runInBand`, `timeout 25s npm start`.
   - Stop if Electron startup, menu/window creation, or preload loading changes behavior.

6. Dashboard server ESM entrypoint slice.
   - Convert dashboard direct execution and Electron late imports to the selected ESM pattern.
   - Validation: `npm run build:dist`, `npm run typecheck`, `npm test -- --runInBand`, `npm run dashboard`, `timeout 25s npm start`.
   - Stop if server singleton state or startup order changes.

7. Preload/window ESM evaluation slice.
   - Convert one preload/window path at a time only after Electron main and dashboard ESM are stable.
   - Validation: window-specific smoke checks, full startup smoke, and packaged-path inspection.
   - Stop and keep `.cjs` wrappers if Electron preload ESM behavior is not reliable.

8. Tooling and Jest ESM slice.
   - Update Jest only after runtime ESM is stable.
   - Validation: `npm run typecheck`, `npm test -- --runInBand`.
   - Stop if mocks or transform behavior require a broad unrelated test rewrite.

9. Packaging proof slice.
   - Run the relevant `dist:<target>` package command and inspect packaged runtime paths.
   - Validation: package target plus packaged app smoke checks.
   - Stop if electron-builder file inclusion needs native dependency or asar-unpack redesign.

##### Phase 5 Stop Conditions

Stop implementation and update this plan before continuing if any slice requires:

- adding package-wide `"type": "module"`
- switching all scripts/configs from `.js` to `.cjs`/ESM at once
- changing Electron sandbox, context isolation, preload API shape, or BrowserWindow ownership
- changing Vite/browser asset output while changing Node/Electron runtime modules
- redesigning dashboard server lifecycle, singleton state, or port ownership
- broad Jest transform changes before runtime ESM entrypoints are proven
- removing default CommonJS compatibility for `agentManager.ts` or `sessionScanner.ts`
- statically importing `node-pty`, `cloudflared`, or `tree-kill` at app startup
- changing electron-builder file inclusion without packaged verification

### Phase 6: Test And Tooling ESM Cutover

Move the test and build tooling to the selected ESM strategy.

Likely work:

- update TypeScript emit configuration
- update Jest transform/runtime settings
- update tests that still use default CommonJS `require(...)`
- preserve mocking behavior for `child_process`, Electron, native packages, and platform-specific code
- decide whether scripts remain CommonJS or move to ESM

Validation:

```bash
npm run typecheck
npm test -- --runInBand
```

### Phase 7: Electron Runtime ESM Cutover

Convert runtime entrypoints and path contracts.

Likely work:

- update Electron main entry loading
- convert preload and dashboard server runtime modules
- replace `__dirname`/`__filename` contracts with `import.meta.url` equivalents
- replace remaining runtime `require(...)` with static imports, dynamic `import()`, `createRequire()`, or `.cjs` bridges
- verify `node-pty`, `cloudflared`, and `tree-kill` behavior under packaging

Validation:

```bash
npm run build:dist
npm run typecheck
npm test -- --runInBand
timeout 25s npm start
```

### Phase 8: Packaging Verification

Verify the ESM runtime under packaged builds.

Validation targets:

- `npm run dist:win` on Windows
- `npm run dist:mac:unsigned` or signed mac build on macOS
- `npm run dist:linux` on Linux
- app startup
- preload APIs
- dashboard server
- terminal creation
- provider recovery/resume flows
- optional/native dependencies

## Validation Matrix

Use the narrowest sufficient validation for each slice, then escalate when runtime contracts are touched.

- Leaf utility only: focused tests or `npm run typecheck`
- Public export shape changed: `npm run build:dist` plus emitted `require(...)` check
- IPC/service behavior changed: focused tests plus `npm run typecheck`
- Electron startup/path/bootstrap changed:

```bash
npm run build:dist
npm run typecheck
npm test -- --runInBand
timeout 25s npm start
```

- Runtime module strategy changed:

```bash
npm run build:dist
npm run typecheck
npm test -- --runInBand
timeout 25s npm start
```

- Packaging/module type changed:

```bash
npm run build:dist
npm run typecheck
npm test -- --runInBand
timeout 25s npm start
npm run dist:<target>
```

## Stop Conditions

During preparation phases, stop implementation and document remaining work when the next change requires one of these:

- native runtime ESM conversion
- broad Jest transform changes
- Electron startup or packaging redesign
- large default CommonJS public API migration
- unresolved circular dependency initialization risk
- optional/native dependency loading redesign
- runtime path contract redesign

Those are not reasons to abandon the overall goal. They are boundaries where the work should move from source-level cleanup into a dedicated runtime ESM phase with its own validation plan.

### Source-Only Cleanup Status

As of the latest source-only scan after `ecb5634`, the remaining TypeScript CommonJS syntax and CommonJS-only path globals are no longer a good fit for small import/export cleanup. The remaining entries are owned by dedicated runtime-boundary slices:

- `src/main/ipc/window.ts`, `src/dashboardServer/constants.ts`, and `src/main/bootstrap/avatars.ts`: `__dirname` path contracts for assets, logs, scripts, or runtime roots.
- `src/sessionend_hook.ts`: top-level imports are converted; the remaining `__dirname` hook log path is a runtime path contract for a later native ESM path helper slice.
- `src/officeLayout.ts`: top-level imports and named exports are converted; the remaining `__dirname` asset-layout default folder is a runtime path contract for a later native ESM path helper slice.
- `src/main/bootstrap/runtime.ts`: top-level imports and named exports are converted; remaining CommonJS syntax is intentional lazy Windows `child_process` loading around the existing startup log `__dirname` contract.
- `src/main/livenessChecker.ts`: top-level imports and named exports are converted; remaining CommonJS syntax is intentional late `child_process` loading around the existing `__dirname` script-path contract.
- `src/main/windowing/core.ts` and `src/main/windowing/secondary/windows.ts`: top-level imports and named exports are converted; preload/html `__dirname` paths and dashboard server late loading remain runtime contracts.
- `src/main/bootstrap/windows.ts`: top-level window manager import is converted; remaining dashboard auth/server requires are intentional late runtime loading.
- `src/main/terminalManager.ts`: top-level imports and named export are converted; remaining CommonJS syntax is intentional lazy/platform-specific loading for `node-pty`, `child_process`, and the Windows `.cmd` shim `path` helper.
- `src/main/tunnelManager.ts`, `src/main/sessionTermination.ts`, and `src/dashboardServer/tunnelHandlers.ts`: optional/native or platform-specific dependency loading (`cloudflared`, `tree-kill`).
- `src/dashboardServer/index.ts`: SIGINT client cleanup now uses the static context import; the remaining CommonJS entrypoint guard is a dashboard startup/runtime boundary.

### Compatibility Slice Notes

#### Path Helper And ESM Entrypoint Guard

- Added `src/runtime/module.ts` as the reviewed helper boundary for later native ESM runtime slices.
- Helper exports: `moduleFilename(import.meta.url)`, `moduleDirname(import.meta.url)`, `resolveFromModule(import.meta.url, ...segments)`, and `isDirectEntrypoint(import.meta.url, process.argv[1])`.
- Runtime/startup/path risk: this slice adds helpers and tests only. It does not replace existing `__dirname` / `__filename` contracts, change Electron or dashboard entrypoints, add package-wide `"type": "module"`, or alter build/Jest/package behavior.
- Emitted `dist` shape: `require('./dist/src/runtime/module.js')` exposes named helper functions as CommonJS properties.
- Validation commands: focused Jest test for `runtimeModule.test.js`; `npm run typecheck`; `npm run build:dist`; emitted `require()` shape check; `git diff --check`.
- Completed in the first Phase 5 implementation slice. The next path-contract slice can consume these helpers one runtime-owner group at a time.

#### Optional And Native Dependency Bridge

- Added `src/main/nativeDependencies.ts` as the bridge for package-resolution-sensitive native/optional dependencies.
- Bridge exports: `loadNodePty(packageRequire)`, `loadCloudflaredPackageBin(packageRequire)`, and `loadTreeKill(packageRequire)`.
- Current CommonJS runtime callers pass their ambient `require` into the bridge, preserving lazy loading, existing Jest mocks, startup behavior, and fallback behavior.
- Future native ESM callers can pass `createRequire(import.meta.url)` into the same bridge without statically importing `node-pty`, `cloudflared`, or `tree-kill`.
- Runtime/startup/path risk: this slice does not change package metadata, electron-builder inclusion, startup ordering, or path contracts. `node-pty` remains loaded inside terminal creation; `cloudflared` remains resolved during tunnel lookup; `tree-kill` keeps the existing fallback to `process.kill`.
- Validation commands: focused Jest tests for the bridge, terminal creation, and agent session termination; `npm run typecheck`; `npm run build:dist`; emitted bridge shape check; package-specific `require(...)` scan; `git diff --check`.
- Completed in the second Phase 5 implementation slice. Remaining package-adjacent validation is deferred to the packaging proof slice because this did not change packaged file inclusion.

#### `agentManager.ts` / `sessionScanner.ts` Default CommonJS API

- Current CommonJS/export shape: tests and compatibility callers can use `const AgentManager = require('../src/agentManager')` and `const SessionScanner = require('../src/sessionScanner')`; both modules also expose `.AgentManager` / `.SessionScanner` on the required constructor.
- Emitted `dist` shape to preserve: `require('./dist/src/agentManager.js')` and `require('./dist/src/sessionScanner.js')` must return constructable classes, and the corresponding named property must point at the same class object.
- Runtime/startup/path risk: this slice does not change startup order, Electron paths, optional/native loading, or `__dirname` path contracts. `src/main.ts` keeps static named imports. The boundary files use a narrow `module['exports']` compatibility assignment because direct TypeScript `export =` preserves the emitted shape but is not supported by the current Jest transform; broad Jest transform changes stay out of scope for this phase.
- Validation commands: `npm run build:dist`; emitted shape checks for both modules; `npm run typecheck`; focused Jest tests for `agentManager` and `sessionScanner`.
- Completed in `ecb5634`. The remaining compatibility assignment is intentional default CommonJS API preservation until the native runtime ESM compatibility-bridge phase.

## Suggested Follow-Up Prompt

```text
Implement the reviewed Phase 5 Runtime ESM Design plan on `refactor/esm` in the smallest safe slice. Do not add package-wide `"type": "module"` unless the reviewed plan has been updated to approve that cutover.

Operating rules:
1. Read `AGENTS.md` first and follow the repo rules.
2. Read `docs/plans/typescript-esm-migration-plan.md`, especially Phase 5 Runtime ESM Design, Validation Matrix, Stop Conditions, and Source-Only Cleanup Status.
3. Check `git status --short --branch` before editing. Do not revert changes you did not make.
4. Rescan `src/**/*.ts` for:
   - `require(...)`
   - `module.exports`
   - `exports.*`
   - `__dirname`
   - `__filename`
5. Keep `dist/` as the production runtime output and preserve compatibility boundaries that the selected slice does not own.

Current state:
- Source-level import/export cleanup is effectively complete.
- Remaining scan results are compatibility/runtime boundaries:
  - default CommonJS public APIs: `src/agentManager.ts`, `src/sessionScanner.ts`
  - optional/native loading: `node-pty`, `cloudflared`, `tree-kill`
  - late dashboard/window/bootstrap runtime `require(...)`
  - Electron preload/window/html/asset/script `__dirname` path contracts
- Preserve dist-based CommonJS runtime output until the selected implementation slice intentionally changes an entrypoint.
- Do not make broad Jest, packaging, bootstrap, or build-config changes.

Start with the first reviewed slice that is still valid after the rescan:
1. Path helper and ESM entrypoint guard design slice.
2. Compatibility bridge slice for `agentManager.ts` and `sessionScanner.ts`.
3. Optional/native dependency bridge slice for `node-pty`, `cloudflared`, and `tree-kill`.
4. Runtime path-contract slice for `__dirname` / `__filename`.
5. Electron main ESM entrypoint slice.
6. Dashboard server ESM entrypoint slice.
7. Preload/window ESM evaluation slice.
8. Tooling and Jest ESM slice.
9. Packaging proof slice.

For the chosen slice, write a short risk note before editing:
- files owned by the slice
- export shape before/after
- emitted `dist` runtime shape to preserve or intentionally change
- startup/path/native dependency risk
- exact validation commands

Keep these as dedicated compatibility/runtime boundaries; do not fold them into unrelated work:
- `src/agentManager.ts`
- `src/sessionScanner.ts`
- `node-pty`
- `cloudflared`
- `tree-kill`
- Electron preload/window path contracts
- asset/html/script `__dirname` path contracts
- dashboard/window/bootstrap late runtime `require(...)` that may preserve startup order or avoid cycles

Validation requirements:
- Documentation-only or plan updates:
  - `git diff --check`
- If public export shape changes or a CommonJS compatibility bridge changes:
  - `npm run build:dist`
  - emitted `node -e "require(...)"` shape checks from `dist`
  - focused Jest tests
  - `npm run typecheck`
- If runtime boundary, Electron startup/path/bootstrap, dashboard startup, preload/windowing, or asset path contract is touched:
  - `npm run build:dist`
  - relevant dist `require()` shape checks
  - `npm run typecheck`
  - `npm test -- --runInBand`
  - `timeout 25s npm start`
- If native dependencies or packaging metadata are touched:
  - add the relevant platform package command from the Phase 5 Packaging Verification Sequence

Stop and update the plan if the chosen slice requires:
- adding package-wide `"type": "module"`
- changing Electron sandbox/context-isolation/preload API shape
- broad Jest transform changes before runtime ESM entrypoints are proven
- removing default CommonJS compatibility for `agentManager.ts` or `sessionScanner.ts`
- statically importing `node-pty`, `cloudflared`, or `tree-kill` at startup
- changing electron-builder file inclusion without packaged verification

Final response must include:
- completed commit list
- files changed in each commit
- validation commands and results
- exact remaining scan results and why each is a stop condition
- a concrete next-session prompt that can continue from the new state
```
