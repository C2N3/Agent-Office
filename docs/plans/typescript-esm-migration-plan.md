# Runtime ESM Cutover Plan

## Intent Change

This plan previously favored a conservative ESM migration with compatibility bridges and small verified slices. The current `refactor/esm` branch is now treated as an experimental cutover branch: temporary breakage is acceptable if it lets the project move to the final native ESM shape faster.

The migration should no longer preserve CommonJS compatibility bridges just to keep old caller shapes working. Instead, update callers, tests, scripts, and runtime entrypoints together so the application runtime uses native ESM end to end.

## Target End State

- TypeScript source uses static `import` / `export` by default.
- TypeScript source relative imports are extensionless; the build rewrites emitted `dist/src` relative imports to Node ESM `.js` / `.mjs` specifiers.
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

- Package-wide `"type": "module"` is enabled, and `dist/**/*.js` is the native ESM production runtime output.
- Source-level CommonJS cleanup is effectively complete for application runtime `src/**/*.ts` and `src/**/*.tsx`.
- `package.json` currently points Electron at `dist/src/main.js`.
- `npm run dashboard` currently runs `dist/src/dashboardServer/entrypoint.js`.
- `src/agentManager.cts`, `src/sessionScanner.cts`, and the old `src/main.mts` wrapper have been removed.
- CommonJS scripts/configs that run under Node are explicitly named `.cjs`.
- Jest remains a CommonJS test runner through `jest.config.cjs`, but its transform now handles TS/TSX/JS test files with `import.meta.url`, dynamic `import(...)`, import attributes, extensionless ESM specifiers, and hoisted `jest.mock(...)` calls.
- Native/CommonJS-sensitive dependencies (`node-pty`, `cloudflared`, `tree-kill`) are loaded only through `createRequire(import.meta.url)` boundaries.
- Application modules that are imported at test module scope now use ESM `import` syntax instead of test-side `require(...)`; remaining test-side `require(...)` calls are concentrated in Node/tooling boundaries or reset-module/mock-isolation cases.

## Cutover Status

Completed in this branch:

- Added package-wide `"type": "module"`.
- Migrated runtime TypeScript relative imports to extensionless source specifiers; `scripts/build-types.cjs` preserves emitted `.js`/`.mjs` runtime paths for Node ESM.
- Removed application compatibility bridges `src/agentManager.cts` and `src/sessionScanner.cts`.
- Removed wrapper entrypoint `src/main.mts`; Electron now targets `dist/src/main.js`.
- Renamed CommonJS tooling/config boundaries to `.cjs`, including build/dev/electron/Jest/ESLint scripts and install-time scripts.
- Converted dashboard runtime and tunnel manager lookups away from CommonJS compatibility fallback loaders.
- Removed the `src/main/runtimeLoaders.ts` CommonJS compatibility wrapper for Node built-ins; runtime code now imports `child_process` and `path` directly through native ESM.
- Converted 50+ application-module test imports from `require(...)` to ESM `import` declarations while keeping Jest itself on the `.cjs` tooling boundary.
- Removed the stale `dist/src/agentManager.cjs` and `dist/src/sessionScanner.cjs` compatibility bridge outputs and added build cleanup so they do not reappear.
- Removed the remaining `AgentManager.AgentManager` and `SessionScanner.SessionScanner` constructor self-alias compatibility shapes; tests now assert the native named ESM export shape for those modules.
- Kept Electron preload outputs as native ESM `.js`/`.mjs`; no preload `.cjs` exception is currently required.
- Verified emitted native ESM imports for `dist/src/agentManager.js` and `dist/src/sessionScanner.js`.
- Verified `npm run build:dist`, emitted native ESM import checks, `npm run typecheck`, `npm test -- --runInBand`, `timeout 25s npm start`, and dashboard server response from `dist/src/dashboardServer/entrypoint.js`.
- Packaged asar startup now skips development-time `avatars.json` writes instead of attempting to mutate files inside `app.asar`.

Package validation status:

- Linux `.deb` metadata is now scoped through `build.linux.maintainer` instead of changing npm package authorship.
- `npm run dist:linux` builds `release/Agent-Office-0.1.3.AppImage` and `release/agent-office_0.1.3_amd64.deb` on WSL2 after stale `dist` bridge cleanup.
- `release/linux-unpacked/agent-office --no-sandbox` starts the packaged main process, opens the main/overlay windows, starts the dashboard server, and keeps native dependency package contents available in `app.asar`/`app.asar.unpacked`.
- `release/Agent-Office-0.1.3.AppImage --appimage-extract-and-run --no-sandbox` reaches packaged main/dashboard startup on WSL2; the timeout-triggered shutdown can still emit a GPU process fatal after resources are cleaned up.
- Windows packaging on WSL2 reaches `release/win-unpacked/Agent-Office.exe` but fails at the NSIS installer step because `wine` is not installed/available.
- macOS packaging remains unverified until a macOS toolchain is available.
- Full interactive packaged UI/preload/API smoke remains pending until a GUI-capable manual pass is available.

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

- Keep package-wide `"type": "module"` so emitted `dist/**/*.js` files load as native ESM without a parallel `.mjs` tree.
- Maintain `tsconfig.emit.json` and related build flow so application runtime output remains native ESM.
- Keep `dist/` as the production runtime output.
- Keep `.cts` application bridge emission out of the build.
- Keep CommonJS-only scripts/configs explicitly named `.cjs`.

Files likely involved:

- `package.json`
- `tsconfig.json`
- `tsconfig.emit.json`
- `scripts/build-types.cjs` or its renamed/converted equivalent
- `scripts/run-electron.cjs`
- `scripts/dev-runtime.cjs`
- `jest.config.cjs`
- `eslint.config.cjs`

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
import { AgentManager } from './agentManager';
import { SessionScanner } from './sessionScanner';
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
Runtime ESM cutover 작업을 가능한 한 한 세션 안에서 많이 진행해줘.

이 브랜치는 실험용 `refactor/esm` 브랜치라서 일시적으로 깨져도 괜찮아. 안전한 작은 slice 중심으로 멈추지 말고, 같은 cutover 목표에 속하고 복구 가능한 변경이라면 계속 이어서 진행해줘. CommonJS compatibility bridge를 유지하려고 작업을 쪼개지 말고, caller/test/script를 최종 native ESM 형태로 같이 옮겨줘.

작업 기준:
1. `client/AGENTS.md`를 먼저 읽고 repo 규칙을 지켜줘.
2. `client/docs/plans/typescript-esm-migration-plan.md`를 읽고 Runtime ESM Cutover Plan의 목표와 risk gates를 확인해줘.
3. `client/`에서 `git status --short --branch`를 확인하고, 내가 만든 변경은 절대 되돌리지 마.
4. 시작 전에 source/runtime 파일에서 `require(...)`, `module.exports`, `exports.*`, `__dirname`, `__filename`을 다시 스캔해줘.
5. `dist/`는 production runtime output으로 유지해줘.
6. package-wide `"type": "module"`이 가장 빠르고 깨끗한 경로면 추가해도 돼.
7. `"type": "module"`로 인해 깨지는 CommonJS scripts/configs는 같은 흐름에서 `.cjs`로 rename하거나 ESM으로 변환해줘.
8. `src/agentManager.cts`, `src/sessionScanner.cts` 같은 application compatibility bridge는 제거하고, caller/test를 named ESM import 형태로 옮겨줘.
9. Electron main/preload, dashboard server, dashboard/Electron interop, Jest/build scripts를 최종 module model에 맞게 계속 정리해줘.
10. `node-pty`, `cloudflared`, `tree-kill`처럼 native/CommonJS-only/package-resolution-sensitive dependency는 static import로 무리하게 바꾸지 말고 `createRequire(import.meta.url)` 같은 명시적 runtime boundary로 남겨도 돼.
11. Electron preload는 native ESM을 우선하되, Electron sandbox/contextIsolation 때문에 특정 preload가 안 되면 그 preload만 `.cjs` 예외로 남기고 이유를 문서화해줘.
12. build/test/runtime config를 건드렸으면 반드시 아래 순서로 검증해줘.
    - `npm run build:dist`
    - emitted `agentManager` / `sessionScanner` native ESM import check
    - `npm run typecheck`
    - `npm test -- --runInBand`
    - `timeout 25s npm start`
    - `npm run dashboard`
13. packaging metadata, native dependency inclusion, Electron preload path가 바뀌면 현재 플랫폼의 relevant `npm run dist:<target>` 검증까지 진행해줘.
14. 한 단계만 하고 멈추지 말고, 같은 cutover 목표 안에서 다음 변경이 이어서 가능하면 계속 진행해줘.
15. 더 이상 한 세션에서 진행하기 어려운 blocker가 생기면, 정확히 어떤 파일/런타임 경계가 막혔는지와 남은 최소 예외가 무엇인지 정리하고 멈춰줘.
16. 변경이 끝나면 `TODO.md`에 추적할 항목이 필요한지 확인하고, 필요한 경우에만 구체적인 TODO를 추가하거나 갱신해줘.
17. 마지막에는 완료한 커밋 목록, 변경 파일, 제거한 bridge, 남은 CommonJS 예외와 이유, 검증 결과, 미검증 package target, 다음 작업 프롬프트를 정리해줘.

우선순위:
1. package/build model을 native ESM cutover에 맞추기
2. application compatibility bridge 제거
3. Electron main/preload/dashboard runtime을 native ESM으로 정리
4. Jest/config/scripts를 최종 module model로 정리
5. runtime smoke와 packaging proof까지 가능한 범위에서 진행
```
