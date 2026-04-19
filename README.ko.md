# Agent-Office

[![CI](https://github.com/C2N3/Agent-Office/actions/workflows/test.yml/badge.svg)](https://github.com/C2N3/Agent-Office/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-32+-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)

> Claude Code와 Codex CLI 세션을 실시간 픽셀 아바타로 시각화하고, Gemini는 실행 task provider로 사용할 수 있는 앱입니다.

영문 README: [README.md](README.md)

## 주요 기능

- **픽셀 아바타** — 각 에이전트 세션에 고유한 스프라이트 캐릭터와 상태 기반 애니메이션을 부여합니다
- **가상 오피스** — 캐릭터가 책상 사이를 이동하는 2D 픽셀 아트 오피스를 제공합니다
- **에이전트 데스크 대시보드** — 실시간 통계를 볼 수 있는 웹 기반 모니터링 패널을 제공합니다 (`http://localhost:3000`)
- **활동 히트맵** — 일별 에이전트 세션 빈도를 GitHub 스타일 그리드로 표시합니다
- **Transcript 기반 토큰/비용 통계** — Claude와 Codex 세션의 토큰 사용량과 비용 추정치를 제공합니다
- **터미널 포커스** — 아바타를 클릭하면 해당 터미널 창을 전면으로 가져옵니다
- **Managed Workspaces** — 대시보드에서 `git worktree` 기반 작업공간을 생성하고, copy/symlink/bootstrap 설정을 함께 적용할 수 있습니다
- **강제 세션 종료** — 잘못 프롬프팅했거나 멈춘 agent 세션을 대시보드에서 종료할 수 있습니다
- **PiP 모드** — 작업 중에도 픽셀 오피스를 항상 보이게 유지하는 플로팅 창을 제공합니다
- **자동 복구** — 앱을 재시작해도 실행 중 세션을 자동으로 복원합니다
- **Provider catalog** — Claude, Codex, Gemini task/runtime 선택을 제공합니다
- **Codex 세션 지원** — `exec --json` forwarder와 `~/.codex/sessions` 스캔을 모두 지원합니다
- **서브에이전트 및 팀 지원** — Claude Code의 sub-agent와 team mode를 지원합니다

## 요구 사항

- **Node.js** 24 이상
- Hook 기반 모니터링이 설정된 **Claude Code CLI**, session file/`exec --json`를 사용할 **Codex CLI**, 또는 task 실행용 **Gemini CLI**
- **운영체제:** Windows, macOS, Linux

## 빠른 시작

```bash
git clone https://github.com/C2N3/Agent-Office.git
cd Agent-Office
npm install
npm start
```

> `npm install`을 실행하면 필요한 Claude Code hook이 `~/.claude/settings.json`에 자동 등록됩니다. Codex는 hook 등록이 아니라 session file/`exec --json` 경로를 사용합니다. Gemini는 CLI가 설치되어 있으면 실행 task provider로 사용할 수 있습니다.
>
> 현재 프로덕션 런타임 산출물은 `dist/` 기준입니다. `npm start`와 `npm run dashboard`는 실행 전에 자동으로 `npm run build:dist`를 호출합니다. `npm run dev`는 source 변경을 감지해 `dist/`를 다시 빌드한 뒤 Electron을 자동 재시작합니다. `node dist/...` 경로를 직접 실행할 때는 먼저 `npm run build:dist`를 한 번 돌려 두세요.

## Providers

Agent-Office는 런타임 동작에는 provider registry를, 대시보드 UI에는 provider catalog를 사용합니다. provider를 추가하거나 동작을 바꿀 때는 두 위치를 함께 확인하세요.

- `src/main/providers/registry.ts`: CLI command, resume command, liveness, transcript support, recovery capability
- `public/dashboard/providerCatalog.ts`: 대시보드 label, model option, terminal boot command

`PIXEL_AGENT_PROVIDERS`로 provider를 활성화합니다:

```bash
PIXEL_AGENT_PROVIDERS=all npm start
PIXEL_AGENT_PROVIDERS=claude,codex,gemini npm start
```

기본 런타임은 항상 Claude를 활성화합니다. Codex session root가 감지되면 Codex도 자동으로 활성화합니다.

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
- `Gemini`는 실행 task provider 선택을 지원하지만 현재 transcript 통계는 제공하지 않습니다.
- Codex forwarder는 기본적으로 `http://127.0.0.1:47822/codex-event`로 전송합니다. 필요하면 `PIXEL_AGENT_CODEX_PORT`로 변경할 수 있습니다.

## 스크립트

클라이언트 프로젝트 디렉터리에서 실행합니다.

| 스크립트                   | 실제 명령                                                                                                    | 설명                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `npm run postinstall`      | `node src/install.js`                                                                                        | Claude hook을 등록합니다. `npm install` 후 자동으로 실행됩니다             |
| `npm run rebuild`          | `electron-rebuild -f -w node-pty`                                                                            | Electron용 native `node-pty` 모듈을 다시 빌드합니다                        |
| `npm run build:dist`       | `node scripts/build-types.js`                                                                                | TypeScript 런타임을 `dist/`로 빌드합니다                                   |
| `npm run build:dist:watch` | `node scripts/build-types.js --watch`                                                                        | source, public, HTML/CSS, tsconfig 변경을 감시하며 `dist/`를 다시 빌드합니다 |
| `npm run build:types`      | `npm run build:dist`                                                                                         | `dist/` TypeScript 빌드의 alias입니다                                      |
| `npm run prestart`         | `npm run build:dist`                                                                                         | `dist/`를 빌드합니다. `npm start` 전에 자동으로 실행됩니다                 |
| `npm start`                | `node scripts/run-electron.js`                                                                               | `prestart`가 `dist/`를 빌드한 뒤 Electron 앱을 실행합니다                  |
| `npm run dev`              | `node scripts/dev-runtime.js`                                                                                | source 변경 시 `dist/`를 다시 빌드하고 Electron을 자동 재시작합니다        |
| `npm run typecheck`        | `node node_modules/@typescript/native-preview/bin/tsgo.js -p tsconfig.json --noEmit`                         | `tsgo`로 no-emit TypeScript 검사를 실행합니다                              |
| `npm test`                 | `jest`                                                                                                       | source TypeScript 기준으로 Jest 테스트를 실행합니다                        |
| `npm run test:coverage`    | `jest --coverage`                                                                                            | coverage 출력과 함께 Jest를 실행합니다                                     |
| `npm run test:watch`       | `jest --watch`                                                                                               | watch mode로 Jest를 실행합니다                                             |
| `npm run predashboard`     | `npm run build:dist`                                                                                         | `dist/`를 빌드합니다. `npm run dashboard` 전에 자동으로 실행됩니다         |
| `npm run dashboard`        | `node dist/src/dashboardServer/index.js`                                                                     | `predashboard`가 `dist/`를 빌드한 뒤 대시보드 서버를 직접 실행합니다       |
| `npm run lint`             | `eslint src/`                                                                                                | source 파일을 lint합니다                                                   |
| `npm run lint:fix`         | `eslint src/ --fix`                                                                                          | source 파일을 lint하고 자동 수정합니다                                     |
| `npm run format`           | `prettier --write "src/**/*.{js,ts}" "__tests__/**/*.js" "scripts/**/*.js" "*.js"`                           | source, test, script, root JavaScript 파일을 format합니다                  |
| `npm run format:check`     | `prettier --check "src/**/*.{js,ts}" "__tests__/**/*.js" "scripts/**/*.js" "*.js"`                           | 파일을 쓰지 않고 formatting 상태를 확인합니다                              |
| `npm run dist`             | `electron-builder`                                                                                           | Electron Builder로 앱을 패키징합니다                                       |
| `npm run dist:win`         | `npm run build:dist && electron-builder --win --publish never`                                                | `dist/`를 빌드하고 publish 없이 Windows 패키지를 만듭니다                 |
| `npm run dist:mac`         | `npm run build:dist && electron-builder --mac --publish never`                                                | `dist/`를 빌드하고 publish 없이 macOS 패키지를 만듭니다                   |
| `npm run dist:mac:unsigned` | `npm run build:dist && electron-builder --mac --publish never -c.mac.identity=null -c.mac.notarize=false`    | `dist/`를 빌드하고 unsigned, non-notarized macOS 패키지를 만듭니다        |
| `npm run dist:mac:signed`  | `node scripts/dist-mac-signed.js`                                                                            | 인증 정보가 있을 때 rebuild, verify, sign, notarize 후 macOS DMG를 만듭니다 |
| `npm run dist:linux`       | `npm run build:dist && electron-builder --linux --publish never`                                              | `dist/`를 빌드하고 publish 없이 Linux 패키지를 만듭니다                   |

## macOS 정식 배포

이 레포는 이제 macOS 서명/노타라이즈 배포 경로를 포함합니다.

로컬에서 서명된 DMG를 한 번에 만들려면:

```bash
npm install
npm run dist:mac:signed
```

`npm run dist:mac:signed`는 다음을 순서대로 실행합니다.

- `npm run rebuild`
- `npm run build:dist`
- `npm run typecheck`
- `npm test -- --runInBand`
- notarized macOS DMG 빌드

결과물은 `release/` 아래에 생성됩니다.

로컬 노타라이즈 인증 정보는 다음 둘 중 하나가 필요합니다.

- App Store Connect API key 방식
  - `APPLE_API_KEY` 또는 `APPLE_API_KEY_BASE64`
  - `APPLE_API_KEY_ID`
  - `APPLE_API_ISSUER`
- Apple ID fallback 방식
  - `APPLE_ID`
  - `APPLE_APP_SPECIFIC_PASSWORD`
  - `APPLE_TEAM_ID`

코드 서명은 다음 둘 중 하나가 필요합니다.

- `CSC_LINK` + `CSC_KEY_PASSWORD`
- 또는 macOS keychain에 설치된 인증서를 가리키는 `CSC_NAME`

GitHub Actions tag release는 현재 Windows artifact와 unsigned macOS DMG를 빌드합니다. 서명과 노타라이즈가 필요하면 로컬에서 `npm run dist:mac:signed`를 사용하세요.

## Managed Workspaces

대시보드의 `+ New` 버튼은 이제 `Workspace Path` 하나를 기준으로 자동으로 등록 방식을 결정합니다.

- Git이 아닌 폴더는 그대로 등록합니다
- Git 저장소라도 같은 repository를 쓰는 활성 agent가 없으면 입력한 경로를 그대로 등록합니다
- 같은 repository를 이미 다른 agent가 사용 중이면 관리형 `git worktree`를 새로 만듭니다

필요하면 고급 옵션에서 전략을 직접 바꾸고, worktree 전용 설정도 조정할 수 있습니다.

- branch 이름, base branch, start point
- worktree 부모 디렉터리 지정
- `.env.local` 같은 설정 파일 복사
- `node_modules` 같은 무거운 폴더 symlink. 기존 dependency 폴더는 기본으로 감지되어 링크됩니다
- `npm install` 같은 bootstrap 명령 자동 전송

생성된 workspace agent에는 대시보드에서 바로 실행할 수 있는 lifecycle 액션도 붙습니다.

- `Stop` — 활성 세션/프로세스를 강제로 종료하고 agent를 offline 상태로 되돌림
- `Merge` — base branch로 merge 후 worktree와 branch를 정리하고 agent를 archive
- `Remove` — merge 없이 clean worktree와 branch를 제거하고 agent를 archive

안전 장치:

- 활성 세션이 연결된 workspace는 merge/remove 할 수 없습니다
- worktree에 uncommitted change가 있으면 merge/remove가 거부됩니다
- merge 실패 시 `git merge --abort`로 자동 복구를 시도합니다

## 원격 접속

대시보드 Remote 탭의 Central Server 카드에서 `Server URL`을 수정할 수 있습니다. 포트만 입력하면 자동으로 로컬 주소로 변환됩니다. 예를 들어 `47824`는 `http://127.0.0.1:47824`로 저장됩니다.

저장된 값은 `~/.agent-office/central-server-url.txt`에 유지됩니다. 저장된 값이 없을 때는 기존처럼 `AO_CENTRAL_SERVER_URL`을 시작 시 fallback으로 사용할 수 있습니다.

`Connect this PC as a central worker`를 켜면 이 client가 중앙 서버 worker 목록에 표시됩니다. 카드에는 안정적인 worker ID, 현재 연결 상태, worker token 설정 여부가 표시됩니다. 저장된 worker token은 다시 보여주지 않으며, 새 token을 설정하거나 교체할 때만 비어 있지 않은 값을 입력하면 됩니다.

같은 카드의 `Sync agent characters through this server`를 켜면 등록된 대시보드 agent와 아바타/archive 변경이 설정된 중앙 서버로 동기화됩니다. worker 연결이 켜져 있을 때는 main process worker connector가 local-to-central agent 업데이트를 담당하고, browser dashboard는 중앙 agent를 받아와 표시하는 역할을 유지합니다. 꺼져 있을 때는 agent character 생성과 수정이 기존처럼 `~/.agent-office/agent-registry.json`에만 남습니다.

## 문제 해결

**아바타가 나타나지 않음**

- Claude를 쓰는 경우 `~/.claude/settings.json`에 hook이 등록되어 있는지 확인하세요
- Codex를 쓰는 경우 `~/.codex/sessions` 아래에 세션 파일이 생성되는지, 또는 `codex exec --json ... | node dist/src/codex-forward.js` 경로를 사용 중인지 확인하세요
- Gemini를 쓰는 경우 Gemini CLI가 설치되어 있고 `PATH`에서 실행 가능한지 확인한 뒤 `PIXEL_AGENT_PROVIDERS=all` 또는 `PIXEL_AGENT_PROVIDERS=claude,codex,gemini`로 활성화하세요
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
