# Server Collaboration Roadmap

Agent-Office를 로컬 Electron 앱에서 여러 사용자의 agent가 함께 보이는 서버형 협업 시스템으로 확장하기 위한 최상위 로드맵이다.

현재 앱에는 `src/dashboardServer/` 기반 HTTP/SSE 대시보드가 이미 있다. 하지만 agent 실행, terminal, git worktree, session recovery, provider 연동은 `src/main.ts`에서 만들어지는 로컬 Electron main process 객체에 강하게 결합되어 있다. 따라서 목표는 단순히 `npm run dashboard`를 외부에 노출하는 것이 아니라, **중앙 서버와 로컬 worker를 분리**하는 것이다.

세부 API, worker protocol, data model 초안은 [docs/server-collaboration-implementation.md](docs/server-collaboration-implementation.md)를 함께 본다. 중앙 서버를 Go로 작성할 때의 goroutine 설계는 [docs/server-collaboration-go-runtime.md](docs/server-collaboration-go-runtime.md)를 따른다.

## 목표

- 여러 사용자가 같은 Agent-Office 서버에 접속해 각자의 agent 상태를 함께 본다.
- Claude/Codex/Gemini CLI, provider 인증, local files, git worktree는 각 사용자 머신에 남긴다.
- 중앙 서버는 auth, team, project, task queue, state aggregation, audit, dashboard API를 담당한다.
- 로컬 worker는 CLI 실행, PTY terminal, git worktree, session scan, transcript access를 담당한다.
- 기존 Electron local mode는 유지하고, server-connected mode를 점진적으로 추가한다.

## 비목표

- 중앙 서버가 모든 repository 파일을 복사하거나 직접 수정하지 않는다.
- 중앙 서버가 사용자 provider API key나 CLI 인증 정보를 보관하지 않는다.
- 서버가 무제한 shell command를 임의 worker에서 실행할 수 있게 만들지 않는다.
- 첫 단계부터 SaaS급 multi-tenant 운영을 목표로 하지 않는다. 초기 목표는 self-hosted team server다.

## 현재 결합 지점

- `src/dashboardServer/`: HTTP API, static dashboard, SSE, WebSocket upgrade를 제공한다.
- `public/dashboard/`: `EventSource('/api/events')`, `fetch('/api/agents')` 등 일부 서버형 접근을 이미 사용한다.
- `src/dashboardPreload.ts`: dashboard의 많은 동작을 Electron IPC `window.dashboardAPI`로 제공한다.
- `src/main.ts`: `AgentManager`, `TerminalManager`, `Orchestrator`, `TeamCoordinator`, scanner들을 생성하고 연결한다.
- `src/main/terminalManager.ts`: `node-pty`로 현재 머신의 shell을 만든다.
- `src/main/orchestrator/processManager.ts`: `child_process.spawn()`으로 headless task를 현재 머신에서 실행한다.
- `src/main/registry/`, `src/main/orchestrator/taskStore.ts`, `src/main/orchestrator/teamStore.ts`: `~/.agent-office/*.json` 로컬 파일에 상태를 저장한다.
- `src/main/workspace/`: 로컬 git repository와 worktree를 직접 조작한다.

핵심 결론: `dashboardServer`는 서버 표면을 갖고 있지만, 현재 상태와 실행 권한은 Electron process 내부 객체와 로컬 filesystem에 있다.

## 목표 아키텍처

```text
Browser Dashboard
  |
  | HTTPS + SSE/WebSocket
  v
Central Server
  - auth, users, teams, projects
  - task queue and scheduler
  - agent state aggregation
  - audit log
  - dashboard API
  - terminal relay broker
  |
  | outbound WebSocket per worker
  v
Local Worker
  - Claude/Codex/Gemini CLI
  - node-pty / child_process
  - git worktree
  - local session files
  - local provider auth
```

중앙 서버는 “무엇을 해야 하는지”를 관리하고, worker는 “내 머신에서 어떻게 실행할지”를 관리한다.

## 실행 모드

### Local Mode

현재 앱과 같은 기본 모드다. Electron이 dashboard server를 시작하고, 로컬 JSON store와 로컬 terminal/task 실행을 사용한다. 기존 `npm start`, `npm run dashboard`, `npm run dev` 계약을 유지한다.

### Connected Mode

Electron 또는 headless worker가 중앙 서버에 연결한다. worker는 agent event, task output, heartbeat를 서버로 보내고, 서버가 내려준 task assignment를 실행한다.

### Server Mode

중앙 서버만 실행한다. Electron 없이 HTTP/WebSocket API와 dashboard static asset을 제공한다. 직접 CLI를 실행하지 않고 연결된 worker에게 위임한다.

## 단계별 로드맵

### Phase 0. 현재 동작 고정

목표: 서버형 전환 전에 local runtime 회귀를 막는다.

작업:

- Local Mode에서 유지해야 하는 동작을 정리한다.
- Electron IPC 전용 기능과 HTTP API가 이미 있는 기능을 분류한다.
- `AgentManager`, `Orchestrator`, `TerminalManager`, `WorkspaceManager` 책임을 문서화한다.
- `/api/*` endpoint의 성공/실패 응답 형태를 테스트로 고정한다.

완료 기준:

- `npm run build:dist`
- `npm run typecheck`
- `npm test -- --runInBand`
- 기존 `npm start`와 `npm run dashboard` 사용법 유지

### Phase 1. Dashboard API Client 분리

목표: dashboard UI가 Electron IPC에 직접 묶이지 않게 한다.

작업:

- `public/dashboard`에 `DashboardClient` 인터페이스를 둔다.
- `ElectronDashboardClient`는 현재 `window.dashboardAPI`를 감싼다.
- `HttpDashboardClient`는 `fetch`, `EventSource`, WebSocket으로 서버 API를 호출한다.
- `getDashboardAPI()` 호출을 client abstraction으로 점진 교체한다.
- Electron에서만 가능한 기능은 UI에서 명확히 unavailable 상태로 표시한다.

초기 분리 대상:

- agent list 조회
- agent event 구독
- task 생성/조회/report 조회
- team 생성/조회/report 조회
- archived agent 조회
- heatmap 조회

나중 분리 대상:

- PTY terminal 생성
- directory picker
- local workspace inspect/create/merge/remove
- session resume

완료 기준:

- Electron dashboard는 기존대로 동작한다.
- 일반 브라우저에서 view-only dashboard와 task output 구독이 동작한다.
- Electron IPC가 없는 환경에서 버튼이 조용히 실패하지 않는다.

### Phase 2. Central Server Entry Point 추가

목표: Electron 없이 서버만 실행할 수 있게 한다.

작업:

- `src/server/` 아래에 central server bootstrap을 추가한다.
- `dashboardServer`가 Electron 객체 주입 없이도 시작되도록 dependency boundary를 명시한다.
- `PORT`, CORS allowlist, auth dev mode를 환경 변수로 설정한다.
- static asset serving과 API routing을 windowing 코드에서 독립시킨다.

완료 기준:

- `npm run build:dist` 후 `node dist/src/server/index.js`로 dashboard server가 뜬다.
- worker 없이도 health endpoint와 static dashboard가 동작한다.
- 기존 `npm run dashboard` 계약을 깨지 않는다.

### Phase 3. 중앙 Store 도입

목표: 여러 worker와 dashboard client가 같은 상태를 공유한다.

작업:

- `AgentRegistry`, `TaskStore`, `TeamStore` 뒤에 storage adapter를 둔다.
- Local Mode는 JSON adapter를 계속 사용한다.
- Server Mode는 DB adapter를 사용한다.
- 초기 DB는 SQLite를 권장한다. 이후 Postgres adapter를 추가할 수 있게 query boundary를 좁게 둔다.

완료 기준:

- JSON store와 DB store를 같은 테스트 suite로 검증한다.
- Local Mode는 기존 JSON 파일과 호환된다.
- Server Mode는 DB store로 agent/task/team 상태를 유지한다.

### Phase 4. Worker Protocol 추가

목표: 로컬 실행 기능을 중앙 서버에서 안전하게 위임한다.

작업:

- worker가 중앙 서버로 outbound WebSocket을 연다.
- worker가 `hello`, `heartbeat`, `agent.upsert`, `task.output`, `task.completed`를 보낸다.
- server가 `task.assign`, `task.cancel`, `terminal.open` 같은 command를 worker에 보낸다.
- worker capability를 `provider:*`, `terminal:pty`, `task:headless`, `workspace:git-worktree` 같은 문자열로 표현한다.

완료 기준:

- worker 2개가 같은 서버에 연결되어 dashboard에 함께 표시된다.
- task가 특정 worker 또는 capability 조건으로 배정된다.
- worker 연결이 끊기면 해당 worker의 agent가 `offline` 또는 `disconnected`가 된다.

### Phase 5. Task Queue와 실행 위임

목표: 중앙 task queue를 worker 실행으로 연결한다.

작업:

- server가 task를 생성하고 `ready` 상태로 저장한다.
- scheduler가 worker capability, project access, current load를 보고 task를 배정한다.
- worker가 task를 실행하고 output/event를 streaming한다.
- cancel/retry/pause/resume 명령을 worker protocol로 연결한다.

완료 기준:

- 한 사용자가 만든 task를 다른 사용자 worker가 실행할 수 있다.
- output이 dashboard task log에 실시간 표시된다.
- worker crash 후 task가 failed/stale 상태로 정리된다.

### Phase 6. Terminal Relay

목표: 브라우저에서 원격 worker terminal을 볼 수 있게 한다.

작업:

- server에 terminal session broker를 둔다.
- dashboard는 `terminal.open`을 server로 요청한다.
- server는 해당 worker로 `terminal.open` command를 보낸다.
- worker는 `node-pty`를 만들고 input/output/resize/exit를 relay한다.

완료 기준:

- 브라우저 dashboard에서 remote worker terminal을 열 수 있다.
- input, resize, output streaming이 동작한다.
- 권한 없는 사용자는 terminal을 열거나 입력할 수 없다.

### Phase 7. Workspace와 Git 협업 모델

목표: 여러 worker의 작업 결과를 안전하게 합친다.

작업:

- 중앙 서버는 repository 파일을 직접 소유하지 않는다.
- `repositoryPath` 대신 `projectId`, `repoRemote`, `branchName`, `workerId` 중심으로 모델링한다.
- worker local path는 worker 내부 상태로 둔다.
- 결과 공유는 git remote branch 또는 PR을 통해 한다.
- merge는 `worker-local merge`와 `remote PR merge` 두 경로를 지원한다.

완료 기준:

- 서로 다른 worker가 같은 repository의 다른 branch를 작업할 수 있다.
- dashboard에서 branch, report, diff summary를 볼 수 있다.
- merge 권한과 충돌 상태가 명확히 표시된다.

### Phase 8. Auth, 권한, Audit

목표: 여러 사람이 쓰는 서버에서 안전하게 운영한다.

최소 role:

- `viewer`: agent 상태와 task output 조회
- `operator`: task 생성, cancel, retry
- `maintainer`: workspace merge/reject, agent 등록 수정
- `admin`: user, worker, project, server config 관리

완료 기준:

- 모든 mutating API가 user identity와 permission check를 가진다.
- audit log로 누가 어떤 worker/agent/task에 영향을 줬는지 추적할 수 있다.
- worker token 유출 시 해당 worker만 revoke할 수 있다.

## Migration Strategy

1. 현재 local behavior를 테스트로 고정한다.
2. dashboard client abstraction을 도입한다.
3. HTTP로 이미 가능한 기능부터 일반 브라우저에서 사용하게 한다.
4. server entrypoint를 추가한다.
5. store adapter를 분리한다.
6. worker WebSocket을 추가하되 초기에는 view-only event forwarding만 한다.
7. task assignment를 worker protocol로 이동한다.
8. terminal relay를 추가한다.
9. workspace/git 동작을 project/worker 기반으로 재모델링한다.
10. auth, permission, audit을 기본값으로 켠다.

## 주요 리스크

- 로컬 경로: Windows, WSL, macOS, Linux path가 섞인다. 중앙 서버는 절대경로를 식별자로 삼지 않는다.
- Secret 노출: provider auth는 worker에 남긴다. 서버는 provider token을 저장하지 않는다.
- Terminal 권한: read-only output과 interactive input 권한을 분리한다.
- 동시 merge: git remote branch 또는 PR 중심 모델을 사용한다.
- Protocol 호환성: 모든 worker message에 `protocolVersion`을 포함한다.

## 첫 구현 단위 제안

가장 안전한 첫 PR 범위:

- `public/dashboard`에 `DashboardClient` 인터페이스 추가
- 기존 `window.dashboardAPI`를 감싸는 `ElectronDashboardClient` 추가
- `/api/agents`, `/api/events`, `/api/tasks`, `/api/teams`를 쓰는 `HttpDashboardClient` 추가
- agent list와 task output 구독만 client abstraction으로 교체
- 일반 브라우저에서 view-only dashboard가 동작하도록 정리

이 작업은 process 실행, storage, workspace를 건드리지 않는다. 서버형 전환의 방향성을 만들면서 회귀 위험을 낮게 유지할 수 있다.
