# React UI Boundary Plan

## Goal

Define a pragmatic boundary for introducing React into the client without rewriting the pixel-office rendering core that already behaves like a small game/runtime.

This plan is intentionally about scope control first:

- move DOM-heavy dashboard UI work toward React
- keep canvas/render-loop/office simulation code imperative
- avoid a full-framework rewrite that mixes UI migration with rendering redesign

## Recommendation

Use React for the dashboard and other DOM-composed UI surfaces.

Do not migrate the office renderer core to React. If React is introduced around the office, limit it to shell controls and surrounding panels, not the sprite/pathfinding/render loop itself.

## Recent Progress

The current branch has already landed a few of the high-value dashboard slices:

- the dashboard now mounts from a single React root
- the remote view is React-owned while its polling/data layer stays imperative
- the heatmap and archive surfaces now render from React components instead of `innerHTML`
- dashboard runtime bootstrapping is split from the React root mount so the imperative setup is easier to follow
- modal launch wiring now goes through a typed registry instead of ad hoc `globalThis.open*Modal` handlers
- the terminal PowerShell-policy banner and profile launcher menu now render from React-owned state while the xterm host stays imperative
- the assign task modal now owns open/close, provider/model selection, validation, and submit state in React while the `/api/tasks` request payload stays in a small helper
- the team formation modal now owns open/close, member selection, and submit state in React while the `/api/teams` request stays in a small imperative call
- the task report, team report, and conversation viewer modals now own open/close, loading, action, and navigation state in React while report/history fetches stay behind small callbacks
- nickname editing now owns edit/draft/save/cancel state in React agent card components while nickname persistence stays behind a small dashboard action
- the create-agent modal now owns open/close, provider selection, form/error, workspace browse/inspection, and submit state in React while workspace registration calls stay behind dashboard API adapters
- the Cloudflare tunnel tab now owns status, actions, copy feedback, and polling in React while tunnel fetch/start/stop calls stay in a small adapter
- the central-server connection surface now uses the React Remote tab/status views; `serverConnection.ts` only owns config fetch/save and SSE refresh notifications instead of replacing an `innerHTML` card

That leaves the remaining work focused on shrinking the imperative DOM surface area around modals, auxiliary dashboard panels, overlay cards, and office-side adapters rather than proving the boundary from scratch.

## Current Status

This plan is partially implemented.

Completed or mostly completed:

- single dashboard React root
- React-owned dashboard shell, sidebar, office shell, floor tabs, and agent list/card surface
- React-owned remote mode view with imperative polling/data adapter
- React-owned heatmap and archive views with imperative fetch/refresh adapters
- React-owned modal shells and typed modal registry
- React-owned assign task, team formation, avatar picker, create-agent, task report, team report, and conversation viewer modal behavior with imperative API calls kept behind small submit/update functions
- React-owned nickname edit behavior on dashboard agent cards with persistence kept behind a small action
- React-owned terminal tab/profile/banner chrome while xterm hosts stay imperative
- React-owned Cloudflare and central-server connection panels with imperative fetch/action/SSE adapters
- React-owned PiP and Overlay dashboard control events with window-state subscription kept in an adapter
- React-owned overlay toolbar and context menu shell
- office canvas renderer, sprite animation, pathfinding, and movement left imperative

Still remaining:

- move any remaining React-rendered dashboard control events away from follow-up `getElementById(...).addEventListener(...)` wiring
- continue the overlay card/grid shell migration while keeping animation and resize runtime code imperative
- refine the office-side adapter so React supplies host elements and the runtime owns setup/update/teardown explicitly

## Current Boundary

### Good React candidates

These areas are stateful UI composition work and currently pay the normal imperative-DOM cost of manual rendering, listener wiring, and cross-module state updates.

- `src/client/dashboard/app.ts`
- `src/client/dashboard/agentViews.ts`
- `src/client/dashboard/activityViews.ts`
- `src/client/dashboard/remote/polling.ts`
- `src/client/dashboard/modalMarkup.ts`
- `src/client/dashboard/modals/*`
- `src/client/dashboard/terminal/ui.ts`
- `src/client/dashboard/terminal/profiles.ts`
- `src/client/dashboard/agentCard/markup.ts`
- `src/client/dashboard/connectionStatus.ts`
- `src/client/dashboard/agentPanelEvents.ts`
- `src/client/dashboard/office.ts`
- `src/shared/uiTooltip.ts`
- `src/renderer/init.ts`
- `src/renderer/agentGrid.ts`
- `src/renderer/agentCard.ts`
- `src/renderer/uiComponents.ts`

Why:

- they create and replace DOM nodes directly
- they wire UI events by hand
- they coordinate multiple visible states at once
- they already behave like component trees without component tooling

### Keep imperative for now

These areas are rendering/runtime infrastructure, not typical form/list/modal UI.

- `src/client/office/officeRenderer.ts`
- `src/client/office/officeRendererEffects.ts`
- `src/client/office/officeSprite.ts`
- `src/client/office/officePathfinder.ts`
- `src/client/office/officeLayers.ts`
- `src/client/office/officeCoords.ts`
- `src/client/office/officeConfig.ts`
- `src/client/office/character/*`
- `src/client/office/renderer/camera.ts`
- `src/client/office/floorManager.ts`
- `src/renderer/animationManager.ts`
- `src/renderer/agentGridResize.ts`

Why:

- they manage canvas drawing, sprite frames, timing, and movement
- they depend on explicit update order and render-loop behavior
- React would add an extra coordination layer without replacing the hard part

### Mixed boundary areas

These files should stay as adapters between React UI and the imperative runtime.

- `src/client/dashboard/runtime/bootstrap.ts`
- `src/client/office/officeInit.ts`
- `src/client/office/index.ts`
- `src/client/dashboard/shared.ts`
- `src/client/dashboard/serverConnection.ts`
- `src/client/dashboard/centralAgents/*`
- `src/preload.ts`
- `src/dashboardPreload.ts`

Role of these files:

- fetch or subscribe to data
- normalize state crossing process/runtime boundaries
- call into the office renderer or Electron APIs
- keep framework-specific code from leaking into runtime modules

## Target Architecture

### 1. React owns DOM composition

React should render:

- dashboard panels
- modals
- filters and tabs
- remote mode controls
- agent list cards
- terminal chrome and status badges
- overlay toolbar and context actions

### 2. Imperative modules own rendering/runtime

Imperative modules should keep owning:

- office canvas bootstrapping
- sprite animation ticks
- pathfinding
- drag/movement behavior
- seat/floor placement rules
- renderer lifecycle

### 3. Thin adapter seam between them

React components should call small adapter functions such as:

- `initOffice(...)`
- `switchOfficeFloor(...)`
- `officeOnAgentCreated(...)`
- `officeOnAgentUpdated(...)`
- Electron preload APIs

React components should not reach deep into sprite, pathfinding, or renderer internals.

## Migration Order

### Phase 1: Dashboard shell

Move the highest-churn DOM UI into React first:

- floor tabs and floor manager UI from `src/client/dashboard/app.ts`
- remote mode panel from `src/client/dashboard/remote/polling.ts`
- modal rendering from `src/client/dashboard/modalMarkup.ts` and `src/client/dashboard/modals/*`
- connection badges and simple status widgets

Expected benefit:

- less manual `innerHTML` management
- less event rebinding after rerender
- more local state per feature

### Phase 2: Agent list and dashboard cards

Move list/card composition into React while keeping data subscription outside or in a thin container.

Primary candidates:

- `src/client/dashboard/agentViews.ts`
- `src/client/dashboard/agentCard/markup.ts`
- pieces of `src/client/dashboard/app.ts` that orchestrate visible panel state

Expected benefit:

- easier card variants
- clearer conditional rendering for provider/status/archive state
- simpler selection/focus behavior

### Phase 3: Overlay renderer UI shell

Migrate only the DOM shell around the existing overlay renderer:

- `src/renderer/uiComponents.ts`
- card/bubble/timer/focus button composition from `src/renderer/agentCard.ts`
- grid container state from `src/renderer/agentGrid.ts`

Keep:

- animation scheduling
- sprite frame drawing
- resize calculations that are tightly coupled to rendering

Expected benefit:

- less direct DOM mutation in the overlay
- easier composition of toolbars, menus, labels, and badges

### Phase 4: Optional office-side React shell

Only if needed, add React around the office view for surrounding controls:

- floor picker chrome
- office-side filters
- side panels or inspector surfaces

Do not rewrite `src/client/office/officeRenderer.ts` or related runtime modules into React components.

## Non-Goals

- rewriting the office renderer as React canvas components
- moving pathfinding/state simulation into React state
- combining the migration with a redesign of Electron preload contracts
- replacing every existing module before proving value on one dashboard slice

## Guardrails

- keep React state close to each UI surface; do not create a large global store unless repeated cross-panel state makes it necessary
- preserve existing runtime entrypoints and preload APIs during the first cut
- keep office renderer integration behind explicit adapter calls
- prefer feature-by-feature migration over a big shared abstraction pass
- validate each migrated slice with the existing `build:dist`, `typecheck`, and Jest workflow

## Suggested Next Tasks

Continue with small ownership cleanup slices rather than a broad rewrite.

Recommended order:

1. Move any remaining React-rendered dashboard control events away from follow-up DOM queries.
2. Continue overlay card/grid shell migration while leaving animation scheduling and resize calculations imperative.
3. Refine office-side adapters under `src/client/dashboard/office.ts` and `src/client/office/*` so runtime listeners and render-loop lifecycle have clear setup/update/teardown boundaries.

That keeps the rendering engines imperative while continuing to narrow the leftover ownership split at the shell/adapter layer.
