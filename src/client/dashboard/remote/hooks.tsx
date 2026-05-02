import { useMemo } from 'react';
import { createRemoteViewActions } from './actions';
import { deriveRemoteViewModel } from './model';
import { useRemoteViewState } from './store';

export function useRemoteViewModel() {
  const state = useRemoteViewState();
  return deriveRemoteViewModel(state);
}

export function useRemoteViewActions() {
  return useMemo(() => createRemoteViewActions(), []);
}
