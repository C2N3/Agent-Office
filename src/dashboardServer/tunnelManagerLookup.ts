import { tunnelManager } from '../main/tunnelManager.js';

type TunnelManagerModule = typeof import('../main/tunnelManager.js');

function loadTunnelManagerModule(): TunnelManagerModule {
  return { tunnelManager } as TunnelManagerModule;
}

export function loadMainTunnelManager(): any {
  return loadTunnelManagerModule().tunnelManager;
}
