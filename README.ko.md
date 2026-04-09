# Agent-Office

[![CI](https://github.com/Mgpixelart/agent-office/actions/workflows/test.yml/badge.svg)](https://github.com/Mgpixelart/agent-office/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-32+-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)

> Claude Code CLI와 Codex CLI 세션을 실시간 픽셀 아바타로 시각화하는 앱입니다.

영문 README: [README.md](README.md)

Agent-Office는 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) hook 이벤트를 수신하고, [Codex](https://developers.openai.com/codex/)의 `exec --json` 스트림도 받아들일 수 있는 독립형 Electron 앱입니다. 각 에이전트 세션을 애니메이션 픽셀 캐릭터로 렌더링하고, 가상 오피스 화면, 활동 히트맵, 토큰 사용량 분석 기능을 제공합니다.

![Demo](docs/demo.gif)

| | | |
|---|---|---|
| ![](docs/screenshot-1.png) | ![](docs/screenshot-2.png) | ![](docs/screenshot-4.png) |
| ![](docs/screenshot-5.png) | | |

## 주요 기능

- **픽셀 아바타** — 각 에이전트 세션에 고유한 스프라이트 캐릭터와 상태 기반 애니메이션을 부여합니다
- **가상 오피스** — 캐릭터가 책상 사이를 이동하는 2D 픽셀 아트 오피스를 제공합니다
- **에이전트 데스크 대시보드** — 실시간 통계를 볼 수 있는 웹 기반 모니터링 패널을 제공합니다 (`http://localhost:3000`)
- **활동 히트맵** — 일별 에이전트 세션 빈도를 GitHub 스타일 그리드로 표시합니다
- **토큰 분석** — 세션별 및 누적 토큰 사용량, 비용 추정치, 모델별 내역을 제공합니다
- **터미널 포커스** — 아바타를 클릭하면 해당 터미널 창을 전면으로 가져옵니다
- **Managed Workspaces** — 대시보드에서 `git worktree` 기반 작업공간을 생성하고, copy/symlink/bootstrap 설정을 함께 적용할 수 있습니다
- **PiP 모드** — 작업 중에도 픽셀 오피스를 항상 보이게 유지하는 플로팅 창을 제공합니다
- **자동 복구** — 앱을 재시작해도 실행 중 세션을 자동으로 복원합니다
- **Codex 세션 지원** — `exec --json` forwarder와 `~/.codex/sessions` 스캔을 모두 지원합니다
- **서브에이전트 및 팀 지원** — Claude Code의 sub-agent와 team mode를 지원합니다

## 요구 사항

- **Node.js** 20 이상
- Hook 기반 모니터링이 설정된 **Claude Code CLI** 또는 session file/`exec --json`를 사용할 **Codex CLI**
- **운영체제:** Windows, macOS, Linux

## 빠른 시작

```bash
git clone https://github.com/Mgpixelart/agent-office.git
cd agent-office
npm install
npm start
```

> `npm install`을 실행하면 필요한 Claude Code hook이 `~/.claude/settings.json`에 자동 등록됩니다. Codex는 hook 등록이 아니라 session file/`exec --json` 경로를 사용합니다.

## Codex

런타임에 Codex 어댑터를 활성화합니다:

```bash
PIXEL_AGENT_PROVIDERS=claude,codex npm start
```

`codex exec --json` 실행 결과를 앱으로 전달합니다:

```bash
codex exec --json "summarize this repo" | node dist/src/codex-forward.js
```

참고:
- `Codex`도 자동 복구, 세션 스캔, 히트맵, 대화 히스토리 경로를 지원합니다.
- `Claude`의 sub-agent/team hook 이벤트처럼 원본 이벤트가 따로 있는 기능은 여전히 Claude 경로에만 있습니다.
- Codex forwarder는 기본적으로 `http://127.0.0.1:47822/codex-event`로 전송합니다. 필요하면 `PIXEL_AGENT_CODEX_PORT`로 변경할 수 있습니다.

## 스크립트

| 명령어 | 설명 |
|---------|-------------|
| `npm start` | Electron 앱을 실행합니다 |
| `npm run dev` | 개발 모드로 실행합니다 (DevTools 활성화) |
| `npm test` | 테스트를 실행합니다 |

## Managed Workspaces

대시보드의 `+ New` 버튼은 이제 두 가지 생성 모드를 제공합니다.

- `Existing Path` — 이미 존재하는 프로젝트 폴더를 registered agent로 등록합니다
- `Git Worktree` — 소스 저장소에서 새 worktree를 만들고, Agent-Office에 바로 연결합니다

`Git Worktree` 모드에서는 다음을 한 번에 처리할 수 있습니다.

- branch 이름 자동 생성 또는 직접 지정
- worktree 부모 디렉터리 지정
- `.env.local` 같은 설정 파일 복사
- `node_modules` 같은 무거운 폴더 symlink
- 생성 직후 임베디드 터미널 자동 오픈
- `npm install` 같은 bootstrap 명령 자동 전송

생성된 workspace agent에는 대시보드에서 바로 실행할 수 있는 lifecycle 액션도 붙습니다.

- `Merge` — base branch로 merge 후 worktree와 branch를 정리하고 agent를 archive
- `Remove` — merge 없이 clean worktree와 branch를 제거하고 agent를 archive

안전 장치:

- 활성 세션이 연결된 workspace는 merge/remove 할 수 없습니다
- worktree에 uncommitted change가 있으면 merge/remove가 거부됩니다
- merge 실패 시 `git merge --abort`로 자동 복구를 시도합니다

## 문제 해결

**아바타가 나타나지 않음**
- Claude를 쓰는 경우 `~/.claude/settings.json`에 hook이 등록되어 있는지 확인하세요
- Codex를 쓰는 경우 `~/.codex/sessions` 아래에 세션 파일이 생성되는지, 또는 `codex exec --json ... | node dist/src/codex-forward.js` 경로를 사용 중인지 확인하세요
- Claude hook 서버가 살아 있는지 확인하려면 `curl http://localhost:47821/hook` 응답이 404면 정상입니다

**유령 아바타가 남아 있음**
- 보통 Windows에서 PID 감지 또는 session file 정리 지연일 때 발생하며, 일반적으로 30초 안에 자동 정리됩니다
- 앱을 재시작하면 상태가 모두 초기화됩니다

**대시보드가 열리지 않음**
- 3000번 포트가 비어 있는지 확인하세요

## 기여

기여 가이드는 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요.

## 라이선스

- **소스 코드:** [MIT License](LICENSE)
- **아트 에셋** (`public/characters/`, `public/office/`): [Custom restrictive license](LICENSE-ASSETS) — 재배포 및 수정 불가
