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

## Current Boundary

### Good React candidates

These areas are stateful UI composition work and currently pay the normal imperative-DOM cost of manual rendering, listener wiring, and cross-module state updates.

- `public/dashboard/app.ts`
- `public/dashboard/agentViews.ts`
- `public/dashboard/activityViews.ts`
- `public/dashboard/remoteView.ts`
- `public/dashboard/modalMarkup.ts`
- `public/dashboard/modals/*`
- `public/dashboard/terminal/ui.ts`
- `public/dashboard/terminal/profiles.ts`
- `public/dashboard/agentCard/markup.ts`
- `public/dashboard/connectionStatus.ts`
- `public/dashboard/agentPanelEvents.ts`
- `public/dashboard/office.ts`
- `public/uiTooltip.ts`
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

- `public/office/officeRenderer.ts`
- `public/office/officeRendererEffects.ts`
- `public/office/officeSprite.ts`
- `public/office/officePathfinder.ts`
- `public/office/officeLayers.ts`
- `public/office/officeCoords.ts`
- `public/office/officeConfig.ts`
- `public/office/character/*`
- `public/office/renderer/camera.ts`
- `public/office/floorManager.ts`
- `src/renderer/animationManager.ts`
- `src/renderer/agentGridResize.ts`

Why:

- they manage canvas drawing, sprite frames, timing, and movement
- they depend on explicit update order and render-loop behavior
- React would add an extra coordination layer without replacing the hard part

### Mixed boundary areas

These files should stay as adapters between React UI and the imperative runtime.

- `public/office/officeInit.ts`
- `public/office/index.ts`
- `public/dashboard/shared.ts`
- `public/dashboard/serverConnection.ts`
- `public/dashboard/centralAgents/*`
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

- floor tabs and floor manager UI from `public/dashboard/app.ts`
- remote mode panel from `public/dashboard/remoteView.ts`
- modal rendering from `public/dashboard/modalMarkup.ts` and `public/dashboard/modals/*`
- connection badges and simple status widgets

Expected benefit:

- less manual `innerHTML` management
- less event rebinding after rerender
- more local state per feature

### Phase 2: Agent list and dashboard cards

Move list/card composition into React while keeping data subscription outside or in a thin container.

Primary candidates:

- `public/dashboard/agentViews.ts`
- `public/dashboard/agentCard/markup.ts`
- pieces of `public/dashboard/app.ts` that orchestrate visible panel state

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

Do not rewrite `public/office/officeRenderer.ts` or related runtime modules into React components.

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

## Suggested First Task

Start with the dashboard remote/settings surface, because it is DOM-heavy, stateful, and largely independent from the office render loop.

The first migration slice should include:

- `public/dashboard/remoteView.ts`
- its render helpers under `public/dashboard/remoteView/*`
- any minimal host container needed from `public/dashboard/app.ts`

This gives the project a real React foothold without forcing the office runtime to move.
