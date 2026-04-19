export type CentralConnectionMode = 'local' | 'sync' | 'worker' | 'worker-sync';

type CentralConnectionFlags = { workerEnabled?: boolean; agentSyncEnabled?: boolean; };
type CentralConnectionModeMeta = {
  label: string;
  title: string;
  description: string;
  usesWorkerToken: boolean;
};

export const CENTRAL_CONNECTION_MODES: CentralConnectionMode[] = ['local', 'sync', 'worker', 'worker-sync'];

const MODE_META: Record<CentralConnectionMode, CentralConnectionModeMeta> = {
  local: {
    label: '로컬',
    title: '이 PC에서만 사용',
    description: '중앙 서버 주소는 유지하지만 이 PC를 워커로 연결하지 않고 캐릭터도 서버에 동기화하지 않습니다.',
    usesWorkerToken: false,
  },
  sync: {
    label: '캐릭터 동기화',
    title: '캐릭터만 동기화',
    description: '등록된 에이전트 캐릭터를 중앙 서버와 동기화합니다. 작업 실행용 워커 연결은 만들지 않습니다.',
    usesWorkerToken: false,
  },
  worker: {
    label: '워커 연결',
    title: '이 PC를 워커로 연결',
    description: '이 PC를 중앙 서버의 워커로 연결합니다. 작업 실행과 상태 보고에 사용하며 캐릭터 변경은 로컬에만 남습니다.',
    usesWorkerToken: true,
  },
  'worker-sync': {
    label: '워커 + 동기화',
    title: '워커와 캐릭터 함께 연결',
    description: '이 PC를 워커로 연결하고 캐릭터도 중앙 서버와 동기화합니다. 워커 연결 중에는 앱 커넥터가 로컬 변경을 중앙 서버로 반영합니다.',
    usesWorkerToken: true,
  },
};

export function connectionModeFromConfig(config?: CentralConnectionFlags | null): CentralConnectionMode {
  if (config?.workerEnabled && config?.agentSyncEnabled) return 'worker-sync';
  if (config?.workerEnabled) return 'worker';
  if (config?.agentSyncEnabled) return 'sync';
  return 'local';
}

export function configFromConnectionMode(mode: CentralConnectionMode): { workerEnabled: boolean; agentSyncEnabled: boolean } {
  switch (mode) {
    case 'sync':
      return { workerEnabled: false, agentSyncEnabled: true };
    case 'worker':
      return { workerEnabled: true, agentSyncEnabled: false };
    case 'worker-sync':
      return { workerEnabled: true, agentSyncEnabled: true };
    default:
      return { workerEnabled: false, agentSyncEnabled: false };
  }
}

export function getConnectionModeMeta(mode: CentralConnectionMode): CentralConnectionModeMeta {
  return MODE_META[mode];
}
