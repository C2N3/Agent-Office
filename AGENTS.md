# AGENTS

Repository-wide instructions for agents working in this project.

## Execution Model

- The real runtime output is `dist/`.
- `npm start` runs the Electron app and depends on `npm run build:dist` through `prestart`.
- `npm run dashboard` runs `node dist/src/dashboardServer/index.js` and depends on `npm run build:dist` through `predashboard`.
- If you run a `node dist/...` entrypoint directly, build first with `npm run build:dist`.
- `npm run dev` is the development loop. It watches `src/`, `public/`, HTML/CSS, and tsconfig files, rebuilds `dist/` when needed, and restarts Electron automatically.

## TypeScript 7 / `tsgo`

- This project uses TypeScript 7 preview through `@typescript/native-preview`.
- Use `tsgo`, not plain `tsc`, for TypeScript build and typecheck flows.
- `npm run typecheck` already uses `tsgo --noEmit`.
- `npm run build:dist` and `npm run build:dist:watch` go through `scripts/build-types.js`, which invokes `node node_modules/@typescript/native-preview/bin/tsgo.js -p tsconfig.emit.json`.
- Do not replace these flows with `tsc` unless the task is an explicit compiler/tooling migration.

## Testing

- Jest runs against source TypeScript, not prebuilt `dist/` output.
- The baseline verification command is `npm test -- --runInBand`.
- For changes that touch runtime, build, or test configuration, use this verification sequence:
  - `npm run build:dist`
  - `npm run typecheck`
  - `npm test -- --runInBand`

## Intentional Exception

- `src/install.js` is the intentional source-side JavaScript exception.
- Do not migrate or redesign `src/install.js` in routine cleanup work.

## File Organization

- If a file you are working on grows beyond 300 lines, split it into smaller modules.
- The 300-line rule targets source, styles, and scripts that agents need to read and edit. Generated output, lockfiles, binary media, and test fixtures may be larger when splitting them would not reduce agent context.
- When modularizing, create a directory for the related files and move the split modules into it.
- Do not repeat the directory name as a redundant filename prefix for files inside that directory.
- Prefer feature directories with role-named files over broad sibling names. For example, use `src/main/providers/codex/events.ts` instead of `src/main/codexEvents.ts`, and `src/main/liveness/agents.ts` instead of `src/main/livenessAgents.ts`.
- Prefer modules that are understandable from a small, local context. A task should usually be explainable by reading a few nearby files, not a long dependency chain.
- Keep abstractions thin and explainable. If an abstraction hides important behavior, add a short nearby note or module-level comment that states where the real work happens.
- Use specific, role-revealing names for files, functions, and exports. Avoid generic names like `process`, `handle`, or `manager` when the behavior can be named directly.
- Keep short documentation close to the code it explains: entrypoints, orchestration flows, and modules with non-obvious dependencies should include concise local context.
- Avoid over-splitting. Each extracted module should be a self-contained chunk with one clear responsibility and enough context to support retrieval and review.

## Provider Abstraction

- Any feature that starts, resumes, monitors, scans, displays, prices, or recovers a CLI provider must go through the provider abstraction instead of hardcoding Claude, Codex, Gemini, or provider-specific defaults inline.
- Main-process provider behavior belongs in `src/main/providers/registry.ts`: provider IDs, labels, CLI command names, resume commands, process matching rules, liveness support, transcript support, and recovery capabilities.
- Dashboard provider UI behavior belongs in `public/dashboard/providerCatalog.ts`: provider IDs, labels, model options, and terminal boot commands.
- When adding a provider or changing provider behavior, update the relevant registry/catalog first, then wire feature code to consume it. Do not add new `provider === 'claude' ? ... : ...` branches unless the branch is implementing a provider-specific adapter or processor behind the abstraction.
- If a provider does not support a capability, represent that explicitly in the registry/catalog and let callers no-op or return a clear unsupported result. Do not fall back to Claude behavior for an unknown or unsupported provider.

## Practical Rule For Agents

- Before changing scripts, build flow, or test loading, read this file first.
- Assume the production contract is `dist/`-based unless the task explicitly says to redesign the runtime model.
