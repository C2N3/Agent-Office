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

## Practical Rule For Agents

- Before changing scripts, build flow, or test loading, read this file first.
- Assume the production contract is `dist/`-based unless the task explicitly says to redesign the runtime model.
