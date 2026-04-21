# Client UI Runtime Boundary

## Purpose

Record the improvement direction for the current Electron, Vite, React, and canvas split.

This document complements `docs/plans/react-ui-boundary-plan.md`. The React boundary plan explains the migration history. This document states the target ownership model for future client-side work.

## Current Assessment

The current structure is a sound fit for the app:

- Electron main process, preload scripts, and the dashboard server stay on the `dist/` plus `tsgo` runtime path.
- Vite is used as a browser-entry bundler for multi-page client entries such as `dashboard.html`, `index.html`, `overlay.html`, and `pip.html`.
- React owns tree-shaped DOM UI where panels, cards, tabs, controls, and modal chrome benefit from component state.
- The office canvas, sprite drawing, pathfinding, camera, movement, and render loop stay imperative.

The main improvement area is not replacing more code with React by default. It is making ownership boundaries explicit so React-rendered DOM and imperative runtime code do not both manage the same elements.

## Target Boundary

### Vite Owns Browser Entries

Use Vite for browser-authored UI entries and assets. Keep the production contract based on `dist/`.

Do not move Electron main-process code, preload scripts, or the dashboard server into Vite unless the task is an explicit runtime redesign.

### React Owns DOM Composition

New dashboard and overlay UI should be React-owned when it is normal DOM composition:

- panels and sidebars
- tabs, filters, and toolbar controls
- agent cards and lists
- modal shells and form controls
- status banners and badges

Prefer React event handlers for controls rendered by React. Avoid adding new `getElementById(...).addEventListener(...)` wiring for React-rendered buttons and inputs.

### Imperative TypeScript Owns Canvas Runtime

Keep these areas framework-free and imperative:

- office canvas bootstrapping
- sprite animation ticks
- pathfinding
- drag, pan, zoom, and camera behavior
- seat, floor, and character placement rules
- renderer lifecycle and draw passes

Use TypeScript modules for new runtime code. Do not add new plain JavaScript source files for canvas work; `src/install.js` is the intentional source-side JavaScript exception.

### Adapters Stay Thin

React components may call named adapter APIs such as `initOffice`, `switchOfficeFloor`, `officeOnAgentCreated`, and Electron preload APIs.

React components should not reach into sprite, pathfinding, renderer, or character internals. Runtime modules should not depend on React.

## Improvement Direction

1. Shrink same-DOM dual ownership.

   When a React component renders a control, move the click/change/keyboard behavior into React props or a small hook instead of binding it later through document queries.

2. Convert legacy UI surfaces by feature slice.

   Prioritize DOM-heavy code that still uses `innerHTML`, manual element creation, or repeated listener rebinding. Good candidates include remaining modals, Cloudflare/server connection panels, and overlay shell controls.

3. Keep canvas as an imperative island.

   React should provide the canvas host and surrounding controls. The office runtime should own render-loop state, simulation state, image loading, camera math, and drawing order.

4. Make adapters explicit.

   Prefer adapter functions that receive the host element, current options, and callbacks over modules that discover React-rendered nodes by global IDs. Add teardown paths when adapters install listeners, `ResizeObserver`, timers, or animation loops.

   Current office status: the dashboard office click/drag adapter exposes setup, host-update, and teardown entrypoints, and `officeInit.ts` exposes setup/update/teardown aliases over the existing renderer lifecycle. `OfficeView` supplies the canvas and popover hosts through React refs, while the office renderer, sprite/pathfinding logic, and render loop remain imperative.

   Current overlay status: the React-owned Agent Desk button owns its Ctrl/Cmd+D shortcut handling instead of being rediscovered and clicked from the legacy keyboard adapter. The React-owned `agent-grid` host owns agent-card context menu opening and Tab/Enter/Arrow navigation through host-scoped adapters instead of document-level DOM queries, and the React context menu owns its Escape close behavior.

5. Reduce mutable state hazards.

   Dashboard state can remain a module-level store with `useSyncExternalStore`, but state changes should flow through named functions that call `notifyDashboardStore`. Avoid direct `state.*` writes in new React-facing code.

6. Split oversized runtime files when touched.

   The repository limit is 300 lines for source files agents need to edit. If future work changes oversized canvas/runtime files, split them by role instead of adding more behavior to the same file.

## Suggested Order

1. Move event ownership for React-rendered dashboard controls into React handlers.
2. Migrate remaining modal and panel markup away from `innerHTML` feature by feature.
3. Keep future office canvas adapter changes behind the existing setup/update/teardown lifecycle while React supplies host elements.
4. Continue overlay shell migration while leaving animation and resize runtime code imperative.

## Acceptance Criteria

For each migrated slice:

- One visible UI surface has one clear owner: React DOM or imperative runtime.
- Canvas rendering, pathfinding, sprite animation, and movement code have no React dependency.
- Adapter modules expose named setup/update/teardown entrypoints where they install runtime behavior.
- The standard client/runtime verification still passes:
  - `npm run build:dist`
  - `npm run typecheck`
  - `npm test -- --runInBand`
