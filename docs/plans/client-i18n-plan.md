# Client Internationalization Plan

## Goal

Add multilingual UI support to the client while keeping the current Electron, Vite, React, and `dist/` runtime contracts intact.

The first supported locales should be:

- `en-US`
- `ko-KR`

The migration should end with:

- user-facing client strings resolved through a shared translation layer
- locale selection persisted per local client install
- dashboard, task chat, PiP, overlay, and remote pages using the same locale contract
- date, time, count, and list formatting handled through locale-aware helpers
- tests that catch missing keys and common interpolation mistakes
- no server-side language coupling unless an API response is explicitly user-facing text

## Current State

The client does not yet have a central i18n system. User-facing text is currently embedded across several surfaces:

- React dashboard modules under `src/client/dashboard/**`
- task chat React modules under `src/client/taskChat/**`
- static browser entrypoints under `src/browser/*.html`
- imperative DOM rendering in dashboard and remote page scripts
- `alert(...)`, `confirm(...)`, `title`, `placeholder`, and empty-state text in client-side code

There are also already mixed-language surfaces. For example, `src/browser/remote.html` contains Korean UI labels, while dashboard and task chat strings are mostly English. The migration should normalize this through locale files instead of preserving hardcoded per-page language choices.

## Non-Goals

- Do not translate provider names, model IDs, file paths, branch names, task IDs, session IDs, command output, or logs.
- Do not translate source-controlled documentation as part of the first runtime i18n pass.
- Do not change the Electron startup model, build output location, or packaging configuration.
- Do not introduce backend locale negotiation for local-only UI state in the first pass.
- Do not rewrite dashboard layout, overlay rendering, task orchestration, or remote transport while moving strings.
- Do not localize generated provider/CLI output unless a later product decision defines a separate output translation feature.

## Locale Model

Use a small explicit locale set:

```ts
export const SUPPORTED_LOCALES = ['en-US', 'ko-KR'] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];
export const DEFAULT_LOCALE: SupportedLocale = 'en-US';
```

Locale resolution order:

1. persisted user preference
2. browser or Electron renderer language when it matches a supported locale or language prefix
3. `DEFAULT_LOCALE`

Persist the selected locale in local client state. For the first pass, `localStorage` is enough for renderer-only surfaces. If the setting needs to apply before renderer boot or across Electron windows more consistently, move it into the existing UI state path later.

## Translation Resource Shape

Keep translation resources as TypeScript modules at first:

- `src/client/i18n/locales/en-US.ts`
- `src/client/i18n/locales/ko-KR.ts`

Suggested shape:

```ts
export const enUS = {
  common: {
    close: 'Close',
    cancel: 'Cancel',
    remove: 'Remove',
  },
  taskChat: {
    ready: 'Ready',
    taskRunning: 'Task running...',
  },
} as const;
```

Use `en-US` as the base key source. The Korean locale should satisfy the same key shape at typecheck time.

Avoid a large external i18n dependency unless plural rules, rich message formatting, or extraction tooling become a real blocker. The current app can start with a thin typed helper around resource lookup and `Intl`.

## Runtime API

Add a small renderer-side i18n module:

- `src/client/i18n/index.ts`
- `src/client/i18n/format.ts`
- `src/client/i18n/storage.ts`

Minimum API:

```ts
t('taskChat.ready')
t('dashboard.clearAgents.confirm', { count })
formatDateTime(timestamp)
formatRelativeTime(timestamp)
formatNumber(count)
getLocale()
setLocale(locale)
subscribeLocale(listener)
```

Interpolation should be explicit and escaped by the rendering layer. Do not build HTML by interpolating translated strings into `innerHTML` unless the existing code already sanitizes every dynamic value and the translation is plain text.

For React surfaces, add a small hook/context:

```ts
const { t, locale, setLocale } = useI18n();
```

For imperative DOM and static HTML scripts, import the shared module or expose a narrow global only where the page cannot participate in the bundled React entrypoint yet.

## Formatting Rules

Use `Intl` for locale-sensitive values:

- dates and times: `Intl.DateTimeFormat`
- relative status ages: `Intl.RelativeTimeFormat`
- counts and totals: `Intl.NumberFormat`
- list labels if needed: `Intl.ListFormat`

Do not use locale text for stable comparisons or protocol values. Status comparisons should keep using internal enum/string values such as `working`, `paused`, `failed`, or `succeeded`; only the displayed labels should be translated.

## UX Requirements

Add a language selector in a durable client UI location, preferably the dashboard settings/control area rather than each page individually.

Expected behavior:

- changing language updates visible React UI without a full restart
- secondary windows use the persisted language on open
- overlay and PiP labels use the persisted language when rendered
- unsupported browser languages fall back predictably to English
- remote page labels use the same supported locale list, even if the remote transport remains unchanged

## Migration Principles

- Convert one surface at a time.
- Keep translation keys semantic, not copied from English text.
- Prefer colocated key groups by product area: `dashboard`, `agentCard`, `taskChat`, `remote`, `terminal`.
- Keep internal data and API payloads language-neutral.
- When touching a module, move all nearby user-facing strings in the same surface slice.
- Preserve accessibility text: `title`, `aria-label`, placeholders, empty states, confirmation prompts, and error messages need translation too.
- Avoid translating logs, test names, CSS classes, and developer diagnostics unless they are shown directly to users.

## Phased Plan

### Phase 1: Foundation

Add the typed translation resources, locale resolver, persistence helper, formatting helpers, and tests.

Validation:

- `npm run typecheck`
- focused Jest tests for locale fallback, key parity, interpolation, and formatting helpers

### Phase 2: Dashboard Shell

Migrate the main dashboard shell and durable controls:

- sidebar and view labels
- floor tabs and panel labels
- connection status text
- language selector
- shared buttons and empty states that appear on first load

Validation:

- focused dashboard React tests where available
- manual check in `npm run dev` for `en-US` and `ko-KR`

### Phase 3: Agent, Terminal, and Remote Panels

Migrate dashboard feature panels:

- agent cards and actions
- create/edit agent modal text
- avatar picker modal text
- terminal panel controls and profile actions
- remote/cloudflare panel status and actions

Validation:

- existing dashboard tests such as terminal chrome, Cloudflare view, and server connection tests
- visual smoke check for long Korean labels in dense panels

### Phase 4: Task Chat

Migrate `src/client/taskChat/**`:

- header status
- clear/close/send/apply/remove actions
- placeholders
- task completion/failure/cancellation status messages
- workspace unavailable and API error fallback text

Validation:

- task chat render tests if added in this slice
- manual check that active-task disabling and error display still work

### Phase 5: Static Browser Pages

Migrate static HTML and imperative scripts:

- `src/browser/remote.html`
- `src/browser/pip.html`
- `src/browser/overlay.html`
- document titles where appropriate

Prefer moving large inline script translation tables into bundled TypeScript modules when the page already has or can safely gain a client entrypoint. If a page must stay static temporarily, keep the translation table small and mark it as a temporary bridge.

Validation:

- manual smoke test for each page
- confirm buttons, tooltips, placeholders, and empty states switch locale

### Phase 6: Coverage and Cleanup

Add a missing-string guard and clean up legacy hardcoded strings.

Suggested checks:

- a Jest test that asserts every non-base locale satisfies the base locale key shape
- an `rg`-based audit documented in the PR or plan notes for common UI string patterns
- optional lint rule or script if hardcoded UI strings keep recurring

Validation:

- `npm run typecheck`
- `npm test -- --runInBand`
- `npm run build:dist`

## Test Strategy

Unit tests should cover:

- supported locale normalization
- fallback from unknown locale to `DEFAULT_LOCALE`
- translation key parity between `en-US` and `ko-KR`
- interpolation for count/name/status values
- `Intl` helper behavior with stable assertions

UI tests should focus on:

- language selector persistence
- representative dashboard labels changing after locale switch
- task chat placeholders and button labels
- remote page empty states

Avoid snapshot-heavy tests for entire translated pages. They tend to make copy updates noisy. Prefer targeted text assertions around stable controls and states.

## Risks

- Hardcoded strings are spread across React, imperative DOM code, and static HTML, so a single mechanical conversion pass is likely to miss strings.
- Korean labels can be longer or wrap differently in compact dashboard controls.
- Static HTML pages may not share the same bundling path as React surfaces.
- Some existing strings are also status/protocol values; translating those directly would break logic.
- Browser locale detection and Electron window startup order may differ across dashboard, PiP, overlay, and task chat windows.

## Open Questions

- Should `ko-KR` or `en-US` be the default for new installs?
- Should the language selector live in the dashboard only, or also appear on the remote page before authentication?
- Should locale preference eventually sync through the central server, or remain local-only?
- Should user-facing server/API error codes become structured keys instead of plain strings?
