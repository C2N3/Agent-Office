import React, { type ReactElement, useEffect } from 'react';
import { RemotePanel } from '../react/remotePanel';
import { useRemoteViewActions, useRemoteViewModel } from './hooks';

type RemotePollingModule = typeof import('./polling');

let pollingModulePromise: Promise<RemotePollingModule> | null = null;

function loadRemotePolling(): Promise<RemotePollingModule> {
  pollingModulePromise ??= import('./polling');
  return pollingModulePromise;
}

export function RemoteViewRoot({ active }: { active: boolean }): ReactElement {
  const model = useRemoteViewModel();
  const actions = useRemoteViewActions();

  useEffect(() => {
    if (!active) return;

    let canceled = false;
    void loadRemotePolling().then((module) => {
      if (canceled) return;
      void module.renderRemoteView();
      module.startRemoteViewPolling();
    });

    return () => {
      canceled = true;
      void loadRemotePolling().then((module) => module.stopRemoteViewPolling());
    };
  }, [active]);

  return <RemotePanel {...model} {...actions} />;
}
