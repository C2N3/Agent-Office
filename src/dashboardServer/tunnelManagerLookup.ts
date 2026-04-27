import { tunnelManager } from '../main/tunnelManager';

type TunnelManagerModule = typeof import('../main/tunnelManager');

function loadTunnelManagerModule(): TunnelManagerModule {
  return { tunnelManager } as TunnelManagerModule;
}

export function loadMainTunnelManager(): any {
  return loadTunnelManagerModule().tunnelManager;
}
