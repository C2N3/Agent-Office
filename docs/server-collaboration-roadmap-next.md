# Server Collaboration Roadmap, Next Layer

이 문서는 [../SERVER_COLLABORATION_ROADMAP.md](../SERVER_COLLABORATION_ROADMAP.md)의 다음 단계 문서다.  
목표는 단순한 원격 dashboard가 아니라, **내 agent와 친구의 agent가 같은 프로젝트를 등록하고, 같은 작업 맥락 위에서 서로 대화할 수 있는 server-backed collaboration system**을 만드는 것이다.

현재의 implementation notes는 [server-collaboration-implementation.md](server-collaboration-implementation.md), [server-collaboration-go-runtime.md](server-collaboration-go-runtime.md), [server-collaboration-go-operations.md](server-collaboration-go-operations.md)에 이미 나뉘어 있다.  
이 문서는 그 위에 얹히는 product/architecture roadmap이다.

## Goal

- 여러 사용자가 같은 server에 접속한다.
- 각 사용자는 자기 agent를 등록할 수 있다.
- 친구의 agent도 같은 server에 등록할 수 있다.
- 여러 agent가 같은 project를 공유하고, task, output, notes, discussion을 같은 맥락으로 본다.
- provider CLI, local files, git worktree, terminal은 가능하면 각 worker machine에 남긴다.
- server는 auth, project membership, shared state, event distribution, audit, coordination을 담당한다.

## What The Server Owns

Server가 가져야 하는 것은 실행 그 자체보다 **coordination state**다.

- user, team, project, membership
- agent registry
- task queue and assignment
- shared timeline and discussion thread
- audit log
- presence and health
- workspace references and worker claims

Server가 가지지 않아야 하는 것은 기본적으로 다음이다.

- provider secret
- raw repository contents
- unrestricted shell control
- opaque local filesystem path ownership

## Open Shape Of The System

아직 정하지 않은 핵심 질문이 있다.

### 1. One Server Per Project vs Room-Based Isolation

두 방향 모두 가능하다.

**Option A: project server**

- 프로젝트마다 독립된 server를 둔다.
- 권한 경계가 분명하다.
- project-specific state가 단순하다.
- 운영 단위가 명확하지만, 여러 project를 같이 보기에는 번거롭다.

**Option B: shared server with rooms**

- 하나의 server 안에서 project room을 나눈다.
- user, team, project, room, agent, worker를 한 registry에서 관리한다.
- cross-project collaboration이나 조직 단위 운영에 유리하다.
- 권한 모델과 isolation 규칙이 더 중요해진다.

현재 추천은 **shared server + room/project isolation** 쪽이다.  
이유는 같은 인프라 안에서 project 단위와 팀 단위 협업을 모두 수용하기 쉽기 때문이다.  
다만 이건 구현 초기에 고정할 필요가 없고, data model이 room/project boundary를 명시적으로 담는 쪽이 우선이다.

### 2. What Counts As An Agent

등록된 agent는 다음 둘을 분리해서 생각해야 한다.

- **registry identity**: 사용자가 관리하는 persistent agent record
- **runtime session**: 실제 provider process, task execution, subagent session, reconnectable run

이 구분이 없으면, agent 목록이 곧 session 목록이 되어 협업과 추적이 섞인다.

### 3. Conversation Model

같은 project 안의 agent들이 “서로 이야기한다”는 것은, 실제로는 다음을 뜻한다.

- shared timeline 에 event가 쌓인다.
- agent output, task result, note, mention, decision이 같은 stream에 들어간다.
- 특정 agent나 room을 target으로 하는 reply를 만들 수 있다.
- 필요하면 provider가 그 timeline을 읽고 다음 행동을 결정한다.

즉, chat UI를 먼저 만들기보다 **project event log + threaded discussion**를 먼저 고정하는 편이 낫다.

## Control Plane And Data Plane

이 시스템은 control plane과 data plane으로 나누는 게 맞다.

### Control Plane

Server-side control plane이 담당하는 것:

- user authentication
- team/project membership
- agent registration and revocation
- task assignment
- room membership
- permissions
- audit and policy
- scheduler decisions

### Data Plane

Worker-side data plane이 담당하는 것:

- provider CLI execution
- terminal I/O
- headless task execution
- git worktree operation
- transcript collection
- local session scan

이 구분이 있어야 server가 커져도 local machine의 실행 책임이 흐려지지 않는다.

## Provider And Session Implications

여러 agent가 같은 project를 공유하면 provider/session 설계도 달라진다.

- Claude, Codex, Gemini는 모두 서로 다른 session transcript와 tool/event 표현을 가진다.
- `main session`, `subagent session`, `task session`, `resume session`을 구분해야 한다.
- provider별 subagent 표현이 다르므로, UI는 provider-specific label이 아니라 **normalized session type**을 보여줘야 한다.
- Codex의 내부 subagent처럼 server가 직접 생성하지 않은 session도, 별도 runtime session으로 수집될 수 있어야 한다.

여기서 중요한 점은, server가 provider semantics를 완전히 소유하지 않는다는 것이다.  
server는 provider event를 정규화하되, 원본 의미를 잃지 않게 보관해야 한다.

## Security And Multi-User Concerns

이 목표는 결국 multi-user system이다. 따라서 초기에 다음을 못 박아야 한다.

- project membership 없는 user는 project state를 볼 수 없다.
- worker token은 user token과 분리한다.
- terminal input은 별도 permission이 필요하다.
- provider credential은 server DB에 저장하지 않는다.
- audit log는 append-only로 유지한다.
- room/project boundary는 UI가 아니라 authorization layer에서도 enforced 되어야 한다.
- agent mention이나 shared discussion은 읽기 권한과 쓰기 권한을 분리해야 한다.

추가로, 친구의 agent를 같은 프로젝트에 넣는 순간 책임 경계도 생긴다.

- 누가 task를 assign할 수 있는가
- 누가 shared discussion에 write할 수 있는가
- 누가 worker/terminal/workspace를 볼 수 있는가
- 어떤 action이 audit 대상인가

## Roadmap Phases

### Phase 0. Vocabulary And Boundaries

목표: 지금 쓰는 local 용어를 server 용어로 정리한다.

- agent, worker, session, task, project, room, team의 정의를 고정한다.
- registry identity와 runtime session을 분리한다.
- project event log와 task log를 구분한다.
- current local mode와 future server mode가 같은 개념을 다른 방식으로 저장할 수 있게 한다.

완료 기준:

- docs에서 같은 단어가 같은 뜻으로 쓰인다.
- implementation notes와 충돌하지 않는 data model 초안이 나온다.

### Phase 1. Shared Registry

목표: 여러 user와 agent를 하나의 server에서 등록할 수 있게 한다.

- user/team/project/membership registry를 만든다.
- agent registry를 project scope와 연결한다.
- worker identity와 agent identity를 분리한다.
- invite, revoke, archive 흐름을 정의한다.

완료 기준:

- 한 server에 여러 user가 등록된다.
- 한 project에 여러 agent가 보인다.
- 권한이 없으면 registry를 볼 수 없다.

### Phase 2. Shared Project Timeline

목표: agent들이 같은 project에 대해 같은 사실 집합을 보게 한다.

- task, output, note, decision, mention을 하나의 timeline에 보관한다.
- thread 또는 room 개념을 넣어 토론 범위를 나눈다.
- provider output과 human note를 같은 시각적 흐름으로 본다.

완료 기준:

- 두 agent가 같은 project timeline을 읽는다.
- 한 agent의 결과가 다른 agent의 후속 task 입력으로 이어진다.

### Phase 3. Discussion And Coordination

목표: 같은 project에서 agent들이 서로 상호작용할 수 있게 한다.

- agent-to-agent reply
- human-to-agent reply
- mention-based notification
- decision markers
- unresolved question tracking

이 단계에서 중요한 것은 “대화”를 chat bubble로만 보지 않는 것이다.  
실제로는 project issue, timeline note, task comment, agent reply가 같은 coordination loop 안에 들어가야 한다.

### Phase 4. Worker Execution And Session Normalization

목표: 여러 provider session을 server가 한 모델로 보여주게 한다.

- provider별 session event를 normalize한다.
- `main`, `sub`, `task`, `resume`를 server-side type으로 정리한다.
- Codex 내부 subagent도 별도 runtime session으로 표현할 수 있게 한다.
- task execution과 discussion session을 분리하되, project context는 공유한다.

완료 기준:

- provider가 달라도 session list가 일관되게 보인다.
- subagent가 별도 runtime session으로 나타날 수 있다.

### Phase 5. Collaboration Hardening

목표: multi-user 운영에서 깨지기 쉬운 부분을 막는다.

- audit coverage 확장
- permission matrix 정리
- room/project archive 정책
- stale worker cleanup
- reconnect and recovery flow
- notification throttling

완료 기준:

- disconnect와 recovery가 예측 가능하다.
- 권한 없는 행동이 server-side에서 거부된다.
- audit를 보고 누가 무엇을 했는지 추적할 수 있다.

## Near-Term Implementation Steps

당장 구현 순서로는 다음이 현실적이다.

1. `SERVER_COLLABORATION_ROADMAP.md`와 이 문서의 용어를 맞춘다.
2. `project`, `room`, `membership`, `agent registry`, `timeline event`의 최소 data model을 적는다.
3. provider/session normalization 규칙을 정한다.
4. agent list와 project timeline을 먼저 server read API로 노출한다.
5. write path는 task create, note create, membership invite 순서로 좁게 연다.
6. 그 다음에 agent-to-agent reply와 worker assignment를 붙인다.

## Decision Log To Keep Open

다음 항목은 구현 전에 다시 결정해야 한다.

- project server vs shared server + rooms
- room의 기본 단위가 team인지 project인지
- thread reply와 agent mention의 저장 형태
- human note와 agent output의 동일 timeline 여부
- cross-project search를 1차 기능으로 볼지 여부
- provider transcript의 보관 기간과 redaction 정책

## Success Criteria

이 로드맵이 제대로 가면 다음이 가능해야 한다.

- 내 agent와 친구의 agent가 같은 server에 등록된다.
- 같은 project에 붙은 agent들이 서로의 context를 본다.
- provider 차이에도 session과 task 표현이 무너지지 않는다.
- local execution 책임은 worker에 남고, server는 coordination만 한다.
- 권한과 audit가 먼저 있고, 기능은 그 위에 올라간다.

이 문서의 범위는 여기까지다.  
세부 API와 runtime 설계는 기존 implementation / Go runtime / operations 문서가 계속 담당한다.
