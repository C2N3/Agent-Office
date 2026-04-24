# Remote Invite UX Plan

## Purpose

Make the Host invite flow match the user's intent:

- `Start Hosting` prepares the client to act as the room owner
- `Create Invite Link` always creates a usable guest invite or returns a clear authorization error
- `Rotate Invite` invalidates the previous guest invite and produces a new link

The UI should not have a "success but no link" state after a user asks to create an invite.

## Progress

- [x] Forward `POST /api/server/room-access/invite` through the dashboard proxy to `/api/room-access/invite`.
- [x] Make Host invite creation use `/api/server/room-access/invite` by default.
- [x] Keep the legacy `enable -> guest-secret/rotate` path only for `404` or `405` invite responses.
- [x] Treat a successful invite response without `guestSecret` as a user-visible server contract error.
- [x] Keep storing `ownerSecret` when invite responses include it.
- [x] Surface a clear owner-access error for already-claimed host servers that this client cannot control.
- [x] Update README and README.ko Host/Guest sections for the final invite contract and owner-secret recovery guidance.

## Result

The Remote invite UX plan is implemented on the client side.

Verified with:

- `npm run build:dist`
- `npm run typecheck`
- `npm test -- --runInBand`

## Current Behavior

The client currently calls:

1. `POST /api/server/room-access/enable`
2. if `guestSecret` is missing, `POST /api/server/room-access/guest-secret/rotate`

This is compatible with the current server, but it spreads one user action across two lower-level API concepts. It also makes error handling harder to explain when the room is already claimed and the local client does not have the owner secret.

## Target UX Contract

Use a dedicated server endpoint for invite creation once available:

```text
POST /api/server/room-access/invite
```

The dashboard proxy should forward that route to:

```text
POST /api/room-access/invite
```

The Remote tab should treat the endpoint contract as:

- success means the response contains a non-empty `guestSecret`
- missing `guestSecret` is a server contract error
- `401` means the current client does not have owner access to this host server
- `403` means the current credential is a guest or otherwise not allowed to create invites
- network and proxy failures should remain distinct from owner-access failures where possible

## Flow Changes

### Start Hosting

`Start Hosting` should:

- save the selected host server URL
- enable or claim host mode as needed
- store the returned `ownerSecret` when the server returns one
- verify host access when the mode was already host
- optionally create the first invite by calling the dedicated invite endpoint after owner access is established

### Create Invite Link

`Create Invite Link` should:

- call `/api/server/room-access/invite`
- store any first-claim `ownerSecret` returned by the server
- set `lastIssuedGuestSecret` from the returned `guestSecret`
- show an explicit error if `guestSecret` is empty

### Rotate Invite

`Rotate Invite` can either:

- call the same invite endpoint, if the user-facing meaning is "make a new usable invite"
- or keep calling `/guest-secret/rotate`, if the UI wants to expose a lower-level rotation action

Prefer the invite endpoint for both buttons unless there is a clear product reason to distinguish them.

### Lost Owner Secret

When the host server is already claimed and this client has no owner secret, the UI should not retry indefinitely or imply that creating a link succeeded.

Show a clear message such as:

```text
This server is already hosted by another owner credential. To create invites, open Agent Office on the host machine or restore the owner secret.
```

Keep the worker bridge off or disconnected in Host mode when no owner room secret is configured.

## Compatibility

Keep the current `enable` plus `guest-secret/rotate` fallback only as a temporary compatibility path for older servers that do not implement `/room-access/invite`.

Suggested behavior:

1. Try `/api/server/room-access/invite`.
2. If the server returns `404` or `405`, fall back to the current `enable` then rotate sequence.
3. For all other failures, show the normal error instead of falling back.

Remove the fallback after the supported server baseline includes the invite endpoint.

## Implementation Steps

1. Add `/api/server/room-access/invite` to `src/dashboardServer/centralServerProxy.ts`.
2. Replace `createHostInvite()` internals with the dedicated invite endpoint and a narrow legacy fallback.
3. Treat a successful response without `guestSecret` as a user-visible error.
4. Keep storing `ownerSecret` when the response includes it.
5. Update Remote view tests for the default invite endpoint path, legacy fallback, missing-secret error, and owner-auth failure.
6. Update `README.md` and `README.ko.md` Host/Guest sections to describe create invite, rotate invite, and owner-secret recovery expectations.

## Acceptance Criteria

- `Create Invite Link` creates a visible invite link from one primary API call on supported servers.
- Reopening an existing room still creates a fresh guest link.
- Owner-auth failures produce a clear message instead of a blank invite result.
- Guest credentials cannot create host invites.
- The standard client verification still passes:
  - `npm run build:dist`
  - `npm run typecheck`
  - `npm test -- --runInBand`
