# 📋 PRD: Pixel Agent Desk v2

## 목표
Claude CLI 사용 중인 세션을 픽셀 캐릭터로 시각화하고 세션의 생명주기(시작/종료)를 안정적으로 관리

## 핵심 기능
1. **Hook 기반 실시간 이벤트 수신**: Claude CLI의 Hook 시스템을 통해 모든 이벤트를 실시간 수신 (TeammateIdle 등 최신 훅 포함)
2. **에이전트 타입 시각화**: Main(기본), Sub(서브에이전트), Team(에이전트 팀)을 배출색과 태그로 명확히 구분
3. **상태 및 프로젝트 시각화**: Working/Done/Waiting 상태 애니메이션 + 에어로젝트별 자동 그룹화(정렬)
4. **정교한 프로세스 관리**: PID 기반 3초 주기 생사 확인 및 앱 시작 시 100% 세션 복구
5. **인터랙티브 터미널 포커스**: 캐릭터 클릭 시 해당 Claude 세션이 실행 중인 터미널 창을 OS 레벨에서 포커스

## 상태 정의
| 상태 | 조건 | 애니메이션 |
|------|------|-----------|
| Waiting | 세션 시작 / 사용자 입력 대기 상태 | 앉아 있는 포즈 (frame 32) |
| Working | `UserPromptSubmit` / `PreToolUse` 이벤트 | 일하는 포즈 (frames 1-4) |
| Done | `Stop` / `TaskCompleted` / 2.5초 Idle 감지 | 춤추는 포즈 (frames 20-27) |
| Help | `PermissionRequest` / `Notification` 등 상호작용 필요 | 도움 요청 포즈 |
| Error | `PostToolUseFailure` 이벤트 | 경고 포즈 (frames 0, 31 Blink) |

## 에이전트 생명주기

### 이벤트 기반 상태 전환
1. **SessionStart**: 새 에이전트 생성 + `Waiting` 상태
2. **UserPromptSubmit**: 사용자가 입력을 제출하는 즉시 `Working` 상태로 전환
3. **Stop / TaskCompleted**: Claude 응답 완료 시 즉시 `Done` 상태로 전환
4. **PostToolUse + 2.5s Timer**: 응답 완료 훅 누락 시 2.5초 뒤 자동 `Done` 전환
5. **PermissionRequest / Notification**: 사용자의 선택이나 확인이 필요한 `Help` 상태
6. **SessionEnd / Process Dead**: 세션 종료 혹은 프로세스 종료 감지 시 에이전트 제거

### 초기화 탐색 자동 무시
- 첫 `PreToolUse` 이벤트는 세션 초기화(cwd 탐색 등)로 간주하여 무시
- 두 번째부터 사용자 요청에 의한 실제 도구 사용으로 처리

### 정교한 프로세스 관리
1. **PID 기반 실시간 감시**: `process.kill(pid, 0)`을 통해 3초마다 프로세스 생존 확인
2. **부활 시스템 (Recovery)**: 앱 시작 시 살아있는 Claude PID를 조회하여 기존 세션 즉시 복구
3. **터미널 포커싱**: 캐릭터 클릭 시 해당 Claude 세션이 실행 중인 터미널 창을 최상단으로 포커스

## 아키텍처
```
┌─────────────────────────────────────────────┐
│              Claude CLI                     │
│  ┌───────────────────────────────────────┐  │
│  │         Hook Events (All Types)       │  │
│  └───────────────────┬───────────────────┘  │
└──────────────────────┼──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│               hook.js                       │
│    (stdin → HTTP POST localhost:47821)      │
└──────────────────────┼──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│    main.js (HTTP Hook Server + IPC)         │
│  ┌──────────────┐  ┌──────────────────┐    │
│  │ AgentManager │◄─┤  Event Handlers  │    │
│  └──────┬───────┘  └──────────────────┘    │
│         │                                  │
│         └──────────────┐                   │
│                        ▼                   │
│                   [IPC Bridge]              │
└────────────────────────┼───────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────┐
│            renderer.js / UI                 │
│  ┌──────────────┐  ┌──────────────┐        │
│  │ Multi-Agent  │  │ 0-Agent Idle │        │
│  │ (Cards Grid) │  │ (Wait Pose)  │        │
│  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────┘
```

## 파일 구조
- `main.js`: Electron 메인 프로세스, HTTP 훅 서버(Port 47821), 자동 훅 등록
- `hook.js`: 범용 훅 스크립트 (Claude CLI → HTTP 서버)
- `sessionend_hook.js`: 세션 종료 시 JSONL에 SessionEnd 기록
- `agentManager.js`: 에이전트 객체 관리 및 상태 변경 이벤트 발행
- `renderer.js`: UI 렌더링 및 애니메이션
- `preload.js`: IPC 통신 브릿지
- `utils.js`: 유틸리티 함수

## 구현 현황
- ✅ 실시간 훅 서버 (TeammateIdle, Subagent 등 전체 지원)
- ✅ PID 기반 정교한 생사 확인 (3초 간격)
- ✅ 앱 시작 시 기존 세션 자동 복구 (Real PID 매칭)
- ✅ 터미널 창 포커싱 (캐릭터 클릭 시 팝업)
- ✅ 에이전트 타입 구분 (Main: 핑크/Sub: 보라/Team: 파랑)
- ✅ 프로젝트별 자동 그룹화 및 정렬
- ✅ 자동 훅 등록 및 설정 관리

## 향후 과제
없음 (현재 Hook-Only 아키텍처로 완전히 구현됨)

## 실행 방법
```bash
# 1. 의존성 설치
npm install

# 2. 앱 실행 (앱 실행 시 ~/.claude/settings.json에 훅이 자동 등록됨)
npm start

# 3. Claude CLI 실행
claude
```

## 테스트 방법
1. 터미널에서 `claude` 실행 → 아바타 등장 확인 (SessionStart Hook)
2. 대화 진행 → `Working` 애니메이션 확인 (PreToolUse Hook)
3. 응답 완료 → `Done` 애니메이션 확인 (TaskCompleted Hook)
4. 권한 필요한 작업 요청 → `Help` 상태 확인 (PermissionRequest Hook)
5. 복잡한 태스크 요청 → 서브에이전트 등장 확인 (SubagentStart Hook)
6. 30분 대기 → 자동 제거 확인 (비활성 타임아웃)
