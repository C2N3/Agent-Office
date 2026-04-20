import { fetchCentralServerConfig, fetchCentralServerSnapshot } from '../serverConnection.js';
import type { RoomAccessStatus } from './render.js';

export type RemoteViewRenderState = {
  config: Awaited<ReturnType<typeof fetchCentralServerConfig>>;
  roomAccess: RoomAccessStatus | null;
  snapshot: Awaited<ReturnType<typeof fetchCentralServerSnapshot>>;
};
