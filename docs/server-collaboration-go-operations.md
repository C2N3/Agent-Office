# Go Server Operations Notes

이 문서는 [server-collaboration-go-runtime.md](server-collaboration-go-runtime.md)의 운영 보조 문서다. Go 중앙 서버의 backpressure, shutdown, protocol compatibility, 테스트 기준을 정의한다.

## Backpressure

Backpressure 기본값:

- dashboard client send queue: 256 events
- worker send queue: 1024 messages
- task output batch flush: 100 lines 또는 250ms
- audit writer queue: 4096 events

Queue overflow 정책:

- dashboard client는 disconnect한다.
- worker command queue overflow는 worker를 unhealthy로 표시한다.
- audit overflow는 error log를 남기고 mutating request를 실패시키는 편이 안전하다.
- task output overflow는 task를 failed로 만들지 말고 output chunk를 dropped marker와 함께 기록한다.

## Graceful Shutdown

Shutdown 순서:

1. signal 수신 후 root context cancel
2. HTTP server graceful shutdown 시작
3. 새 worker/dashboard connection 거부
4. scheduler stop
5. worker에게 `server.shutdown` notice 전송
6. terminal broker가 open terminal close command 전송
7. audit writer flush
8. DB close

강제 종료 deadline은 10-30초 사이로 둔다.

## Protocol Versioning

모든 worker message는 `protocolVersion`을 포함한다.

서버는 다음 값을 가진다.

- `MinWorkerProtocol`
- `CurrentWorkerProtocol`
- `DeprecatedWorkerProtocol`

Worker가 낮은 version이면 연결을 거부하고 dashboard에 upgrade required 상태로 표시한다.

## Worker Health

Worker health는 heartbeat와 command delivery 결과를 함께 본다.

상태:

- `online`: heartbeat 정상, command queue 정상
- `degraded`: heartbeat는 정상이나 command queue 지연 또는 최근 send 실패 있음
- `offline`: heartbeat timeout
- `revoked`: token 또는 worker registration 비활성화

처리 기준:

- `offline` 전환 시 running task를 `stale`로 바꾼다.
- `degraded` worker에는 새 interactive terminal을 배정하지 않는다.
- `revoked` worker의 WebSocket은 즉시 close한다.

## Observability

필수 metrics:

- online worker count
- dashboard client count
- task state count
- worker heartbeat latency
- scheduler assignment latency
- terminal session count
- dropped realtime event count
- DB transaction duration

필수 structured log 필드:

- `request_id`
- `user_id`
- `worker_id`
- `task_id`
- `terminal_id`
- `project_id`
- `protocol_version`

## Security Defaults

기본 설정:

- 모든 mutating HTTP API는 auth required
- worker WebSocket은 worker token required
- terminal input은 별도 permission required
- CORS는 explicit allowlist
- audit log는 append-only

Secret 처리:

- provider auth token은 server DB에 저장하지 않는다.
- raw terminal input은 audit log에 저장하지 않는다.
- task prompt는 DB에 저장되므로 project permission으로 보호한다.

## 테스트 전략

단위 테스트:

- scheduler worker selection
- permission checks
- protocol validation
- store transaction compare-and-swap
- terminal broker routing

통합 테스트:

- in-memory HTTP server + fake worker WebSocket
- task create -> assign -> output -> completed
- worker disconnect -> running task stale
- dashboard SSE receives agent/task events

부하 테스트:

- 100 workers heartbeat
- 1,000 dashboard SSE clients
- high-volume task output stream
- slow client disconnect behavior

## Local Development

권장 dev command:

```bash
go run ./cmd/agent-office-server --config ./server.dev.toml
```

권장 fake worker:

```bash
go run ./cmd/fake-worker --server ws://localhost:3000/api/workers/connect
```

Fake worker는 다음을 지원해야 한다.

- heartbeat interval 조정
- capability set 지정
- task output volume 지정
- forced disconnect
- terminal echo mode

