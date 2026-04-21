import { useSyncExternalStore } from 'react';
import type { RemoteMode } from '../remoteMode.js';
import type { RemoteViewState } from './types.js';

function createInitialState(): RemoteViewState {
  return {
    config: null,
    copiedInvite: false,
    guestInviteDraft: '',
    lastConsumedGuestInviteHref: '',
    lastIssuedGuestSecret: '',
    remoteActionError: '',
    roomAccess: null,
    selectedRemoteMode: null,
    serverUrlDraft: '',
    snapshot: null,
    statusDetailsExpanded: false,
  };
}

const listeners = new Set<() => void>();
let state = createInitialState();

export function getRemoteViewState(): RemoteViewState {
  return state;
}

export function subscribeRemoteViewState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function updateRemoteViewState(patch: Partial<RemoteViewState> | ((current: RemoteViewState) => Partial<RemoteViewState>)): void {
  const nextPatch = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...nextPatch };
  listeners.forEach((listener) => listener());
}

export function resetRemoteViewState(): void {
  state = createInitialState();
  listeners.forEach((listener) => listener());
}

export function useRemoteViewState(): RemoteViewState {
  return useSyncExternalStore(subscribeRemoteViewState, getRemoteViewState, getRemoteViewState);
}

export function setSelectedRemoteMode(selectedRemoteMode: RemoteMode | null): void {
  updateRemoteViewState({ selectedRemoteMode });
}
