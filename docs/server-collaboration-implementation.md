# Server Collaboration Implementation Notes

이 문서는 [../SERVER_COLLABORATION_ROADMAP.md](../SERVER_COLLABORATION_ROADMAP.md)의 보조 문서다. 최상위 로드맵에서 결정한 방향을 구현할 때 필요한 API, protocol, data model 초안을 더 구체화한다.

중앙 서버를 Go로 작성할 때의 goroutine, channel, context 설계는 [server-collaboration-go-runtime.md](server-collaboration-go-runtime.md)를 따른다.

## 권장 HTTP API

초기에는 dashboard가 읽기 중심으로 동작하게 하고, 이후 mutating API를 권한 체크와 함께 확장한다.

읽기 API:

- `GET /api/health`
- `GET /api/agents`
- `GET /api/agents/:id`
- `GET /api/agents/:id/history`
- `GET /api/tasks`
- `GET /api/tasks/:id`
- `GET /api/tasks/:id/report`
- `GET /api/teams`
- `GET /api/teams/:id`
- `GET /api/workers`
- `GET /api/workers/:id`
- `GET /api/projects`
- `GET /api/audit-events`

쓰기 API:

- `POST /api/tasks`
- `POST /api/tasks/:id/cancel`
- `POST /api/tasks/:id/retry`
- `POST /api/teams`
- `POST /api/workers/:id/revoke`
- `POST /api/projects`
- `POST /api/terminal-sessions`
- `POST /api/terminal-sessions/:id/input`
- `POST /api/terminal-sessions/:id/resize`
- `DELETE /api/terminal-sessions/:id`

Streaming channel:

- dashboard SSE: agent/task/team 상태 broadcast
- dashboard WebSocket: terminal relay, future bidirectional UI command
- worker WebSocket: heartbeat, agent event, task assignment, output streaming

## Worker Protocol

연결은 worker outbound WebSocket만 허용한다. 중앙 서버가 worker 머신에 직접 inbound 접속하지 않는다.

초기 lifecycle:

1. worker가 token으로 서버에 연결한다.
2. worker가 `worker.hello`를 보낸다.
3. server가 protocol version과 accepted capability를 응답한다.
4. worker가 주기적으로 `worker.heartbeat`를 보낸다.
5. worker가 agent 상태와 task output을 event로 전송한다.
6. server가 task나 terminal command를 worker에 보낸다.

초기 메시지:

```json
{ "type": "worker.hello", "workerId": "w_...", "userId": "u_...", "protocolVersion": 1, "capabilities": [] }
{ "type": "worker.heartbeat", "workerId": "w_...", "runningTasks": 2, "timestamp": 1710000000000 }
{ "type": "agent.upsert", "workerId": "w_...", "agent": {} }
{ "type": "agent.remove", "workerId": "w_...", "agentId": "a_..." }
{ "type": "task.assign", "taskId": "t_...", "agentId": "a_...", "prompt": "..." }
{ "type": "task.output", "taskId": "t_...", "stream": "stdout", "text": "..." }
{ "type": "task.completed", "taskId": "t_...", "exitCode": 0 }
{ "type": "task.failed", "taskId": "t_...", "error": "..." }
```

권장 capability:

- `provider:claude`
- `provider:codex`
- `provider:gemini`
- `terminal:pty`
- `task:headless`
- `workspace:git-worktree`
- `session:resume`
- `transcript:local-summary`

## Terminal Relay

interactive terminal은 강한 권한이므로 task output과 분리한다.

메시지 초안:

```json
{ "type": "terminal.open", "terminalId": "term_...", "cwdRef": "project-root" }
{ "type": "terminal.input", "terminalId": "term_...", "data": "npm test\r" }
{ "type": "terminal.output", "terminalId": "term_...", "data": "..." }
{ "type": "terminal.resize", "terminalId": "term_...", "cols": 120, "rows": 30 }
{ "type": "terminal.exit", "terminalId": "term_...", "exitCode": 0 }
```

정책:

- 기본값은 read-only task log다.
- terminal input은 별도 permission이 필요하다.
- raw input 전체를 audit log에 저장하지 않는다. command metadata만 남긴다.
- terminal session은 idle timeout과 max lifetime을 가진다.

## Data Model

### Worker

- `id`
- `userId`
- `displayName`
- `hostname`
- `platform`
- `capabilities`
- `status`
- `lastSeenAt`
- `protocolVersion`

### Agent

- `id`
- `workerId`
- `registryId`
- `displayName`
- `provider`
- `model`
- `status`
- `projectId`
- `sessionId`
- `runtimeSessionId`
- `resumeSessionId`
- `avatarIndex`
- `lastActivityAt`

### Task

- `id`
- `projectId`
- `agentId`
- `assignedWorkerId`
- `title`
- `prompt`
- `provider`
- `model`
- `status`
- `priority`
- `createdBy`
- `createdAt`
- `startedAt`
- `completedAt`
- `errorMessage`

### WorkspaceRef

- `id`
- `projectId`
- `workerId`
- `agentId`
- `repositoryRemote`
- `branchName`
- `baseBranch`
- `mode`
- `status`
- `localPathRef`

`localPathRef`는 worker 내부에서만 해석 가능한 값이어야 한다. 중앙 서버가 worker filesystem path를 직접 신뢰하거나 조작하지 않는다.

## Store Adapter

초기 adapter:

- `JsonAgentStore`, `JsonTaskStore`, `JsonTeamStore`: Local Mode용
- `SqliteAgentStore`, `SqliteTaskStore`, `SqliteTeamStore`: Server Mode용

인터페이스는 domain operation 중심이어야 한다.

- `listAgents(filter)`
- `getAgent(id)`
- `upsertAgent(agent)`
- `appendAgentEvent(event)`
- `createTask(input)`
- `assignTask(taskId, workerId)`
- `appendTaskOutput(taskId, output)`
- `completeTask(taskId, result)`

## Scheduler

Task 배정 우선순위:

1. 사용자가 명시한 worker
2. project를 이미 checkout한 worker
3. 필요한 provider capability가 있는 worker
4. running task 수가 낮은 worker
5. 최근 heartbeat가 정상인 worker

Task 상태:

- `ready`
- `assigned`
- `running`
- `succeeded`
- `failed`
- `cancelled`
- `stale`

## Audit Event

필수 event:

- login/logout
- worker registration/revoke
- task create/cancel/retry
- terminal open/input/close
- workspace merge/reject/remove
- agent registry create/update/archive/delete

Audit record 필드:

- `id`
- `actorUserId`
- `action`
- `targetType`
- `targetId`
- `workerId`
- `projectId`
- `timestamp`
- `metadata`

## 첫 구현 PR 상세

첫 PR은 process 실행, storage, workspace를 건드리지 않는다.

파일 후보:

- `public/dashboard/client/types.ts`
- `public/dashboard/client/electron.ts`
- `public/dashboard/client/http.ts`
- `public/dashboard/shared.ts`
- `public/dashboard/agentViews.ts`
- `public/dashboard/terminal/index.ts`

검증:

- Electron dashboard에서 기존 기능 유지
- 일반 브라우저에서 `/api/agents` 초기 조회
- 일반 브라우저에서 `/api/events` agent/task output 구독
- Electron IPC 없는 환경에서 terminal/workspace 버튼 unavailable 처리
