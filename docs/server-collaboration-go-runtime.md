# Go Server Runtime Design

이 문서는 Agent-Office 중앙 서버를 Go로 작성한다고 가정한 runtime core 설계다. 운영 정책, backpressure, graceful shutdown, 테스트 전략은 [server-collaboration-go-operations.md](server-collaboration-go-operations.md)를 함께 본다.

## Runtime 원칙

- 모든 장기 실행 작업은 `context.Context`로 종료된다.
- WebSocket connection마다 read pump와 write pump를 분리한다.
- shared map은 직접 노출하지 않고 owner goroutine 또는 mutex가 있는 registry 타입으로 감싼다.
- DB transaction은 request handler나 coordinator command 단위로 짧게 끝낸다.
- channel은 bounded로 둔다. 느린 dashboard나 worker 하나가 서버 전체를 막으면 안 된다.
- terminal input과 task assignment는 권한 확인 후 command channel로만 worker에 전달한다.

## 추천 패키지 구조

```text
cmd/agent-office-server/main.go
internal/config/
internal/httpapi/
internal/auth/
internal/store/
internal/domain/
internal/realtime/
internal/workers/
internal/scheduler/
internal/terminal/
internal/audit/
internal/protocol/
internal/logging/
```

패키지 책임:

- `httpapi`: REST handler, SSE endpoint, dashboard WebSocket endpoint
- `workers`: worker WebSocket accept, worker session lifecycle, worker registry
- `scheduler`: ready task polling, worker capability matching, task assignment
- `terminal`: terminal session broker, dashboard-to-worker relay
- `realtime`: dashboard broadcast hub
- `store`: SQLite/Postgres repository interfaces and implementations
- `protocol`: worker/dashboard message structs, validation, version checks
- `audit`: mutating action 기록

## Top-Level Goroutine Tree

```text
main
  runHTTPServer
    request goroutines from net/http
  realtime.Hub.Run
  workers.Registry.Run
  scheduler.Run
  terminal.Broker.Run
  audit.Writer.Run
  signal watcher
```

`main`은 `context.WithCancel`을 만들고, signal을 받으면 cancel 후 HTTP graceful shutdown을 시작한다.

## Core Types

```go
type App struct {
    Store     store.Store
    Hub       *realtime.Hub
    Workers   *workers.Registry
    Scheduler *scheduler.Scheduler
    Terminals *terminal.Broker
    Audit     *audit.Writer
    Clock     clock.Clock
}
```

`App`은 dependency container다. handler는 `App`의 domain service를 호출하고, domain service는 store와 coordinator command를 사용한다.

## Realtime Hub

Dashboard SSE/WebSocket broadcast는 `realtime.Hub`가 담당한다.

```go
type Event struct {
    Type string
    Data json.RawMessage
}

type Hub struct {
    register   chan *Client
    unregister chan *Client
    publish    chan Event
    clients    map[*Client]struct{}
}
```

운영 규칙:

- `Hub.Run(ctx)` 하나만 `clients` map을 소유한다.
- `publish` channel은 bounded로 둔다.
- 느린 client의 send queue가 꽉 차면 client를 끊는다.
- HTTP handler는 `Hub.Publish(ctx, event)`처럼 timeout 있는 helper를 사용한다.

## Worker Registry

Worker connection은 `workers.Registry`가 소유한다.

```go
type Registry struct {
    register   chan *Session
    unregister chan string
    commands   chan Command
    sessions   map[string]*Session
}

type Session struct {
    WorkerID string
    UserID   string
    Caps     CapabilitySet
    Send     chan protocol.ServerMessage
    Done     chan struct{}
}
```

WebSocket당 goroutine:

- `readPump`: worker message를 읽어 registry/domain service로 전달한다.
- `writePump`: `Session.Send`에서 message를 읽어 WebSocket에 쓴다.
- `heartbeatLoop`: pong deadline 또는 application heartbeat timeout을 관리한다.

Worker에서 들어오는 event 처리:

```text
worker websocket readPump
  -> validate protocol version
  -> normalize message
  -> store update
  -> realtime publish
  -> scheduler notify
```

서버에서 worker로 나가는 command 처리:

```text
HTTP/task/scheduler command
  -> permission/capability check
  -> Registry.Send(workerID, message)
  -> worker writePump
```

## Scheduler

Scheduler는 task assignment만 담당한다. task 실행은 worker가 담당한다.

```go
type Scheduler struct {
    Store   store.TaskStore
    Workers WorkerLookup
    Wake    chan struct{}
}
```

Loop:

```text
for {
  wait for ticker or Wake
  load ready tasks
  load online workers snapshot
  choose worker by project, capability, load
  mark task assigned in DB transaction
  send task.assign to worker
}
```

중요한 race 처리:

- DB transaction에서 `ready -> assigned` compare-and-swap을 한다.
- worker send 실패 시 task를 `ready` 또는 `stale`로 되돌린다.
- worker heartbeat가 만료되면 running task를 `stale`로 전환한다.

## Terminal Broker

Terminal broker는 dashboard session과 worker terminal을 연결한다.

```go
type Broker struct {
    open     chan OpenRequest
    input    chan InputRequest
    resize   chan ResizeRequest
    close    chan CloseRequest
    sessions map[string]*TerminalSession
}
```

Flow:

```text
dashboard POST /api/terminal-sessions
  -> permission check
  -> Broker.Open
  -> workers.Registry.Send(workerID, terminal.open)
  -> worker returns terminal.opened
  -> dashboard WebSocket subscribes terminalId
```

Terminal output:

```text
worker terminal.output
  -> Broker.RouteOutput
  -> dashboard terminal WebSocket client send queue
```

정책:

- `terminal.input`은 `operator` 이상 또는 별도 `terminal:write` permission이 필요하다.
- session별 idle timeout과 max lifetime을 둔다.
- dashboard가 끊겨도 worker terminal을 즉시 죽일지, 일정 시간 유지할지는 server config로 둔다.

## HTTP Handler Pattern

Handler는 request parsing과 response formatting에 집중한다.

```go
func (h *Handler) CreateTask(w http.ResponseWriter, r *http.Request) {
    user := auth.RequireUser(r.Context())
    input := decodeCreateTask(r)
    task, err := h.Tasks.Create(r.Context(), user, input)
    if err != nil {
        writeError(w, err)
        return
    }
    writeJSON(w, http.StatusCreated, task)
}
```

Domain service 책임:

- permission check
- validation
- DB transaction
- audit append
- realtime publish
- scheduler wake

## Store 설계

초기 server store는 SQLite로 충분하다.

권장 interface:

```go
type Store interface {
    Agents() AgentStore
    Tasks() TaskStore
    Workers() WorkerStore
    Audit() AuditStore
    WithTx(ctx context.Context, fn func(Tx) error) error
}
```

SQLite 운영 기준:

- WAL mode 사용
- write transaction은 짧게 유지
- task output은 append-only table에 저장
- 대용량 transcript 원문은 DB에 바로 넣지 않고 worker-local 또는 object storage reference로 둔다.

## 첫 Go 구현 단위

첫 Go PR은 다음 범위가 적당하다.

- `cmd/agent-office-server/main.go`
- `internal/config`
- `internal/protocol`
- `internal/realtime` hub
- `internal/workers` registry with fake auth
- `GET /api/health`
- `GET /api/workers`
- worker WebSocket `worker.hello` + `worker.heartbeat`

이 범위는 task 실행과 terminal relay를 아직 건드리지 않는다. 서버 process, goroutine lifecycle, WebSocket registry의 기본 형태를 먼저 검증한다.
