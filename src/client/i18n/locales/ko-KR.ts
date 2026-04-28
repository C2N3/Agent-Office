import type { TranslationResource } from './en-US';

export const koKR = {
  common: {
    cancel: '취소',
    close: '닫기',
    create: '생성',
    delete: '삭제',
  },
  dashboard: {
    connection: {
      disconnected: '연결 끊김',
      gatewayOnline: '게이트웨이 온라인',
      restoreWebsocket: '네트워크 연결이 끊겼습니다. 웹소켓 연결을 복구하는 중입니다...',
    },
    floor: {
      add: '층 추가',
      agentCount: '에이전트 {count}개',
      confirmDelete: '"{name}" 층을 삭제할까요? 이 층의 에이전트 배정이 해제됩니다.',
      current: '현재',
      exampleName: '예: 엔지니어링',
      manager: '층 관리자',
      manage: '층 관리',
      new: '새 층',
    },
    language: {
      label: '언어',
    },
    sidebar: {
      access: '접근',
      cloudflare: 'Cloudflare',
      main: '메인',
      overview: '개요',
      remote: '원격',
      terminal: '터미널',
    },
  },
  terminal: {
    closeTab: '닫기',
    defaultBadge: '기본',
    defaultProfile: '기본 프로필',
    emptyHint: '에이전트를 클릭해 터미널을 여세요.',
    emptyTitle: '열린 터미널 없음',
    new: '새 터미널',
    newWithProfile: '새 터미널 ({profile})',
    noProfiles: '이 기기에서 셸 프로필을 찾지 못했습니다.',
    openDefault: '기본 터미널 열기',
    openWith: '다음으로 열기',
    oneOffHint: '이 셸로 일회성 터미널을 엽니다',
    profileHelp: '이 탭에 사용할 셸을 선택하거나 기본 프로필을 바꾸세요.',
    setDefaultHint: '새 터미널 버튼을 누를 때 사용합니다',
  },
} as const satisfies TranslationResource;
