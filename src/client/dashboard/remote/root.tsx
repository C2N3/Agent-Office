import React, { type ReactElement } from 'react';
import { RemotePanel } from '../react/remotePanel.js';
import { useRemoteViewActions, useRemoteViewModel } from './hooks.js';

export function RemoteViewRoot(): ReactElement {
  const model = useRemoteViewModel();
  const actions = useRemoteViewActions();

  return <RemotePanel {...model} {...actions} />;
}
