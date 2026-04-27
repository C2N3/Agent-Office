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

Decisions required:

- `package.json` `"type": "module"` versus `.mjs`/`.cjs` split
- TypeScript emit settings
- Electron main/preload loading
- Jest transform and mocks
- `__dirname` to `import.meta.url`
- optional/native dependency loading through `createRequire()` or dynamic `import()`
- electron-builder packaging verification

Deliverable:

- a short design note or checklist in this document that names the selected module strategy and every required config/file change

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

As of the latest source-only scan, the remaining TypeScript CommonJS syntax is no longer a good fit for small leaf-module cleanup. The remaining entries are owned by dedicated compatibility or runtime-boundary slices:

- `src/agentManager.ts` and `src/sessionScanner.ts`: default CommonJS public API compatibility.
- `src/main/ipc/window.ts`, `src/dashboardServer/constants.ts`, and `src/main/bootstrap/avatars.ts`: `__dirname` path contracts for assets, logs, scripts, or runtime roots.
- `src/sessionend_hook.ts`: top-level imports are converted; the remaining `__dirname` hook log path is a runtime path contract for a later native ESM path helper slice.
- `src/officeLayout.ts`: top-level imports and named exports are converted; the remaining `__dirname` asset-layout default folder is a runtime path contract for a later native ESM path helper slice.
- `src/main/bootstrap/runtime.ts`: top-level imports and named exports are converted; remaining CommonJS syntax is intentional lazy Windows `child_process` loading around the existing startup log `__dirname` contract.
- `src/main/livenessChecker.ts`: top-level imports and named exports are converted; remaining CommonJS syntax is intentional late `child_process` loading around the existing `__dirname` script-path contract.
- `src/main/windowing/core.ts` and `src/main/windowing/secondary/windows.ts`: top-level imports and named exports are converted; preload/html `__dirname` paths and dashboard server late loading remain runtime contracts.
- `src/main/bootstrap/windows.ts`: Electron window/bootstrap late runtime loading.
- `src/main/terminalManager.ts`: top-level imports and named export are converted; remaining CommonJS syntax is intentional lazy/platform-specific loading for `node-pty`, `child_process`, and the Windows `.cmd` shim `path` helper.
- `src/main/tunnelManager.ts`, `src/main/sessionTermination.ts`, and `src/dashboardServer/tunnelHandlers.ts`: optional/native or platform-specific dependency loading (`cloudflared`, `tree-kill`).
- `src/dashboardServer/apiHandlers.ts`: office layout helpers now use static imports; remaining dashboard API path behavior depends on the `officeLayout` runtime path contract.
- `src/dashboardServer/index.ts`: dashboard startup/runtime boundary.

## Suggested Follow-Up Prompt

```text
Continue TypeScript import/export cleanup and runtime-boundary preparation on `refactor/esm` until there are no more safely separable slices in this phase.

Operating rules:
1. Read `AGENTS.md` first and follow the repo rules.
2. Read `docs/plans/typescript-esm-migration-plan.md`, especially Current Phase Goal, Boundaries To Preserve, Stop Conditions, Source-Only Cleanup Status, and Validation Matrix.
3. Check `git status --short --branch` before editing. Do not revert changes you did not make.
4. Rescan `src/**/*.ts` for:
   - `require(...)`
   - `module.exports`
   - `exports.*`
   - `__dirname`
   - `__filename`
5. Preserve the current dist-based CommonJS runtime contract unless you explicitly stop and document a native runtime ESM cutover plan:
   - do not add `"type": "module"`
   - do not switch Electron/Node runtime to native ESM
   - do not make broad Jest transform, packaging, bootstrap, or build-config changes

Current state:
- Recent completed cleanup commits include:
  - `2c2cac6` `refactor: convert hook helper scripts to TS imports`
  - `e3fd284` `refactor: convert window IPC registrations to TS exports`
  - `1a53920` `docs: record remaining ESM migration stop set`
- Source-only leaf cleanup is mostly exhausted. Remaining work is compatibility/runtime-boundary work; still keep CommonJS emit for this phase.

Work strategy:
1. Group remaining scan results into small, independently verifiable slices.
2. Prefer slices that can preserve emitted CommonJS shape and avoid startup/path redesign:
   - named CommonJS object exports that can become TS named exports with identical `require()` shape
   - modules whose `__dirname` can be left untouched while import/export syntax is cleaned
   - compatibility wrappers where all source/tests can keep their current `require()` behavior
3. For each slice, before editing, write a short risk note covering:
   - export shape before/after
   - emitted CommonJS `require()` shape to preserve
   - runtime/path/startup-order risk
   - optional/native dependency risk
   - validation commands
4. Implement the slice, validate it, update this plan if the remaining boundary list changes, and commit the slice.
5. Do not stop after one slice. After each successful commit, rescan and continue with the next safely separable slice.

High-priority candidate slices to evaluate first:
- `src/main/livenessChecker.ts`: likely named object export, but has `__dirname` script path and child_process late requires; only convert if path and late-loading contracts remain unchanged and emitted shape is verified.
- `src/main/bootstrap/runtime.ts`: named object export, but owns log-path/bootstrap behavior; only convert if `__dirname` contract remains unchanged and full runtime validation is run.
- `src/main/terminalManager.ts`: named object export, but contains `node-pty` and platform-specific late requires; only clean static non-native imports if dynamic optional/native loads remain untouched, otherwise stop.
- `src/officeLayout.ts`: public named object export plus `__dirname` asset contract; only convert in a dedicated path-contract slice with emitted shape checks.

Keep these as dedicated compatibility/runtime slices; do not casually fold them into unrelated cleanup:
- `src/agentManager.ts`
- `src/sessionScanner.ts`
- `node-pty`
- `cloudflared`
- `tree-kill`
- Electron preload/window path contracts
- asset/html/script `__dirname` path contracts
- dashboard/window/bootstrap late runtime `require(...)` that may preserve startup order or avoid cycles

Validation requirements:
- If public export shape changes or a CommonJS `module.exports` object becomes TS exports:
  - `npm run build:dist`
  - `node -e "console.log(require('./dist/src/path/to/module.js'))"`
- If runtime boundary, Electron startup/path/bootstrap, dashboard startup, preload/windowing, or asset path contract is touched:
  - `npm run build:dist`
  - relevant dist `require()` shape checks
  - `npm run typecheck`
  - `npm test -- --runInBand`
  - `timeout 25s npm start`
- For narrow internal cleanup with no runtime boundary and no export shape change, use focused tests and/or `npm run typecheck`, but escalate if any boundary risk appears.

Stop only when every remaining scan result requires one of these larger changes:
- native runtime ESM conversion
- Electron startup/packaging redesign
- broad Jest transform changes
- default CommonJS public API migration
- unresolved circular dependency initialization risk
- optional/native dependency loading redesign
- runtime path contract redesign

Final response must include:
- completed commit list
- files changed in each commit
- validation commands and results
- exact remaining scan results and why each is a stop condition
- a concrete next-session prompt that can continue from the new state
```
