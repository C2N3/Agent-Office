import { useMemo } from 'react';
import { createRemoteViewActions } from './actions.js';
import { deriveRemoteViewModel } from './model.js';
import { useRemoteViewState } from './store.js';

export function useRemoteViewModel() {
  const state = useRemoteViewState();
  return deriveRemoteViewModel(state);
}

export function useRemoteViewActions() {
  return useMemo(() => createRemoteViewActions(), []);
}
