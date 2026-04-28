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

> Agent-Office에서 시작한 task의 CLI 세션에만 캐릭터가 반응합니다. 외부 터미널이나 앱 내장 터미널에서 직접 실행한 `claude`/`codex`/`gemini`는 오피스에 표시되지 않습니다. `npm install`은 예전 버전이 `~/.claude/settings.json`에 써 두었던 Agent-Office 훅 항목을 정리하고, 이후의 감지는 orchestrator가 직접 띄우는 세션만을 대상으로 합니다.
>
> 현재 프로덕션 런타임 산출물은 `dist/` 기준입니다. `npm start`와 `npm run dashboard`는 실행 전에 자동으로 `npm run build:dist`를 호출합니다. `npm run dev`는 `index`/`dashboard`/`pip`/`overlay`에는 Vite를 붙이고, `src/`, `assets/`, 브라우저 shell HTML/CSS, tsconfig 변경 중 브라우저 바깥 변경에 대해서만 `dist/`를 다시 빌드한 뒤 Electron을 자동 재시작합니다. `node dist/...` 경로를 직접 실행할 때는 먼저 `npm run build:dist`를 한 번 돌려 두세요.
>
> 브라우저 shell HTML/CSS는 `src/browser/`에 두고, 브라우저 작성 코드는 `src/client/`와 `src/renderer/`에 둡니다. Electron main process, dashboard server, preload 코드는 기존처럼 `dist/` + `tsgo` 경로를 유지합니다.

## Providers

Agent-Office는 런타임 동작에는 provider registry를, 대시보드 UI에는 provider catalog를 사용합니다. provider를 추가하거나 동작을 바꿀 때는 두 위치를 함께 확인하세요.

- `src/main/providers/registry.ts`: CLI command, resume command, liveness, transcript support, recovery capability
- `src/client/dashboard/providerCatalog.ts`: 대시보드 label, model option, terminal boot command

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

| 스크립트                    | 실제 명령                                                                                                 | 설명                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `npm run postinstall`       | `node src/install.cjs`                                                                                     | 이전 Agent-Office Claude hook을 정리합니다. `npm install` 후 자동으로 실행됩니다 |
| `npm run rebuild`           | `electron-rebuild -f -w node-pty`                                                                         | Electron용 native `node-pty` 모듈을 다시 빌드합니다                          |
| `npm run build:dist`        | `node scripts/build-types.cjs`                                                                             | TypeScript 런타임을 `dist/`로 빌드합니다                                     |
| `npm run build:dist:watch`  | `node scripts/build-types.cjs --watch`                                                                     | source, assets, 브라우저 shell HTML/CSS, tsconfig 변경을 감시하며 `dist/`를 다시 빌드합니다 |
| `npm run build:types`       | `npm run build:dist`                                                                                      | `dist/` TypeScript 빌드의 alias입니다                                        |
| `npm run prestart`          | `npm run build:dist`                                                                                      | `dist/`를 빌드합니다. `npm start` 전에 자동으로 실행됩니다                   |
| `npm start`                 | `node scripts/run-electron.cjs`                                                                            | `prestart`가 `dist/`를 빌드한 뒤 Electron 앱을 실행합니다                    |
| `npm run dev`               | `node scripts/dev-runtime.cjs`                                                                             | index, dashboard, pip, overlay에는 Vite를 띄우고 브라우저 바깥 변경 시 `dist/`를 다시 빌드한 뒤 Electron을 자동 재시작합니다 |
| `npm run typecheck`         | `node node_modules/@typescript/native-preview/bin/tsgo.js -p tsconfig.json --noEmit && node node_modules/@typescript/native-preview/bin/tsgo.js -p tsconfig.client.json --noEmit` | 런타임과 Vite client 설정 둘 다 `tsgo`로 no-emit TypeScript 검사를 실행합니다 |
| `npm test`                  | `jest`                                                                                                    | source TypeScript 기준으로 Jest 테스트를 실행합니다                          |
| `npm run test:coverage`     | `jest --coverage`                                                                                         | coverage 출력과 함께 Jest를 실행합니다                                       |
| `npm run test:watch`        | `jest --watch`                                                                                            | watch mode로 Jest를 실행합니다                                               |
| `npm run predashboard`      | `npm run build:dist`                                                                                      | `dist/`를 빌드합니다. `npm run dashboard` 전에 자동으로 실행됩니다           |
| `npm run dashboard`         | `node dist/src/dashboardServer/index.js`                                                                  | `predashboard`가 `dist/`를 빌드한 뒤 대시보드 서버를 직접 실행합니다         |
| `npm run lint`              | `eslint src/`                                                                                             | source 파일을 lint합니다                                                     |
| `npm run lint:fix`          | `eslint src/ --fix`                                                                                       | source 파일을 lint하고 자동 수정합니다                                       |
| `npm run format`            | `prettier --write "src/**/*.{js,ts}" "__tests__/**/*.js" "scripts/**/*.js" "*.js"`                        | source, test, script, root JavaScript 파일을 format합니다                    |
| `npm run format:check`      | `prettier --check "src/**/*.{js,ts}" "__tests__/**/*.js" "scripts/**/*.js" "*.js"`                        | 파일을 쓰지 않고 formatting 상태를 확인합니다                                |
| `npm run dist`              | `electron-builder`                                                                                        | Electron Builder로 앱을 패키징합니다                                         |
| `npm run dist:win`          | `npm run build:dist && electron-builder --win --publish never`                                            | `dist/`를 빌드하고 publish 없이 Windows 패키지를 만듭니다                    |
| `npm run dist:mac`          | `npm run build:dist && electron-builder --mac --publish never`                                            | `dist/`를 빌드하고 publish 없이 macOS 패키지를 만듭니다                      |
| `npm run dist:mac:unsigned` | `npm run build:dist && electron-builder --mac --publish never -c.mac.identity=null -c.mac.notarize=false` | `dist/`를 빌드하고 unsigned, non-notarized macOS 패키지를 만듭니다           |
| `npm run dist:mac:signed`   | `node scripts/dist-mac-signed.cjs`                                                                         | 인증 정보가 있을 때 rebuild, verify, sign, notarize 후 macOS DMG를 만듭니다  |
| `npm run dist:linux`        | `npm run build:dist && electron-builder --linux --publish never`                                          | `dist/`를 빌드하고 publish 없이 Linux 패키지를 만듭니다                      |

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

대시보드 Remote 탭에는 세 가지 모드가 있습니다.

- `Local Only`는 중앙 서버 주소만 유지하고 worker bridge와 character sync는 끕니다.
- `Host`는 설정한 host server에서 이 office를 공유하고 guest invite link를 만듭니다.
- `Guest`는 host가 보낸 invite link로 기존 office에 들어갑니다.

모드 pill을 누르는 것만으로는 저장되지 않습니다. 각 시트의 primary action인 `Switch to Local Only`, `Start Hosting`, `Join Host`를 눌러야 실제 모드가 바뀝니다.

Host 모드에서는 `Host server`만 서버 주소를 다룹니다. 전체 URL을 넣어도 되고 `47824`처럼 포트만 넣어도 됩니다. 포트는 `http://127.0.0.1:47824`로 저장됩니다. 처음 설정할 때는 `Start Hosting`을 누르고, 다른 서버로 옮길 때만 `Update Server`를 사용합니다.

Guest 공유는 `Guest invite` 영역에서 관리합니다.

- `Create Invite Link`는 guest 입장을 열고 첫 invite link를 만듭니다.
- `New Invite Link`는 이전 guest link를 무효화하고 새 link를 만듭니다.
- `Stop Sharing`은 Host 모드와 서버 주소는 유지한 채 guest 입장을 막습니다.

`Create Invite Link`와 `New Invite Link`는 현재 host server의 owner secret이 있어야 동작합니다. 서버가 이미 다른 owner credential로 claim되었고 이 기기에서 owner access를 잃은 상태라면, Remote 탭은 빈 invite 상태 대신 복구 안내 오류를 보여줍니다. 이 경우 host machine에서 Agent Office를 다시 열거나 owner secret을 복구한 뒤 invite를 다시 만들어야 합니다. 저장된 owner secret이나 worker token이 없는 Host 모드에서는 access가 복구될 때까지 worker bridge와 character sync도 꺼진 상태를 유지합니다.

저장된 서버 URL은 `~/.agent-office/central-server-url.txt`에 유지됩니다. 저장된 값이 없을 때는 기존처럼 `AO_CENTRAL_SERVER_URL`을 시작 시 fallback으로 사용할 수 있습니다. 선택한 모드는 `~/.agent-office/central-remote-mode.txt`에 저장되고, room secret은 `~/.agent-office/central-room-secret.txt`에 저장됩니다.

Guest 모드에서 저장된 room secret이 없으면 invite를 join하기 전까지 worker bridge와 character sync는 꺼진 상태를 유지합니다. room secret이 저장된 Guest 모드에서는 worker token 대신 그 room secret으로 연결합니다. Agent-Office가 `http://localhost:3000`에서 열려 있으면 invite link를 여는 것만으로 자동 join할 수 있습니다.

사이드바에는 별도의 `Cloudflare` 탭이 있습니다. 이 탭은 quick tunnel 제어를 Host/Guest 제품 UI와 분리해서 제공합니다.

### Host 서버 연결

Remote Host/Guest 모드를 쓰려면 guest가 실제로 접근할 수 있는 host server URL이 필요합니다. Dashboard > `Remote` > `Host` > `Host server`에는 접속 방식에 따라 다음 주소를 넣습니다.

| 상황 | Host server 값 |
| --- | --- |
| 같은 컴퓨터에서만 테스트 | `http://127.0.0.1:47823` |
| 같은 Wi-Fi/LAN의 친구 접속 | `http://<호스트-local-ip>:47823` |
| 인터넷을 통한 접속 | 터널 도구가 제공한 public HTTPS URL |

LAN에서 접속하게 하려면 host 컴퓨터의 local IP를 사용합니다. macOS Wi-Fi 예시는 다음과 같습니다.

```bash
ipconfig getifaddr en0
```

예를 들어 IP가 `192.168.0.23`이면 같은 네트워크의 guest는 다음 주소를 사용합니다.

```text
http://192.168.0.23:47823
```

client에는 `0.0.0.0`을 넣지 마세요. `0.0.0.0`은 서버가 listen할 때만 쓰는 주소입니다. 접속하는 client는 `127.0.0.1`, LAN IP 주소, 또는 public tunnel URL을 사용해야 합니다.

인터넷으로 접속하게 하려면 Cloudflare Tunnel, ngrok, localtunnel 같은 도구가 제공한 public HTTPS URL을 사용합니다. tunnel 도구가 host server와 같은 컴퓨터에서 실행된다면 target은 `http://127.0.0.1:47823`이면 됩니다. tunnel 도구가 다른 컴퓨터에서 실행된다면 target은 `http://192.168.0.23:47823` 같은 host 컴퓨터의 LAN 주소여야 합니다.

접근 가능한 서버 URL이 준비되면 client에서 다음 순서로 host를 시작합니다.

1. Dashboard > `Remote`를 엽니다.
2. `Host`를 선택합니다.
3. `Host server`에 URL을 입력합니다.
4. `Start Hosting`을 누릅니다.
5. `Create Invite Link`를 누릅니다.
6. 생성된 invite link를 guest에게 보냅니다.

invite는 `Host server`에 guest가 실제로 접근 가능한 주소를 넣은 뒤 만들어야 합니다. `127.0.0.1`로 만든 invite를 다른 컴퓨터에 보내면 guest client가 guest 자신의 localhost로 접속하려고 하므로 실패합니다.

guest는 Dashboard > `Remote` > `Guest`에서 invite link를 붙여넣고 `Join Host`를 누르면 됩니다. 대시보드가 이미 `http://localhost:3000`에서 실행 중이면 invite link를 여는 것만으로 자동 join될 수도 있습니다.

invite link에는 중앙 서버 주소와 guest secret이 함께 들어갑니다.

```text
http://localhost:3000/#aoGuestSecret=...&aoBaseUrl=...
```

`aoBaseUrl`은 Agent Office Server URL입니다. `aoGuestSecret`은 guest가 room에 들어갈 수 있게 하는 secret입니다. `Create Invite Link`는 guest 입장을 열고 현재 guest secret을 만듭니다. `New Invite Link`는 guest secret을 새로 만들고 이전 invite를 무효화하므로, invite link는 들어와도 되는 사람에게만 공유하세요.

## 문제 해결

**아바타가 나타나지 않음**

- 캐릭터는 Agent-Office에서 시작한 task의 CLI 세션에만 나타납니다. 외부 터미널이나 앱 내장 터미널에서 직접 실행한 세션은 의도적으로 무시됩니다.
- 캐릭터를 보려면 대시보드에서 task(Assign Task / Team Formation)를 제출하거나 Agent 패널에서 agent를 provisioning 하세요.
- 해당 provider CLI가 설치되어 `PATH`에서 실행 가능한지 확인한 뒤 `PIXEL_AGENT_PROVIDERS=all` 또는 `PIXEL_AGENT_PROVIDERS=claude,codex,gemini`로 활성화하세요.
- Claude hook 서버가 살아 있는지 확인하려면 `curl http://localhost:47821/hook` 응답이 404면 정상입니다.

**유령 아바타가 남아 있음**

- 보통 Windows에서 PID 감지 또는 session file 정리 지연일 때 발생하며, 일반적으로 30초 안에 자동 정리됩니다
- 앱을 재시작하면 상태가 모두 초기화됩니다

**대시보드가 열리지 않음**

- 3000번 포트가 비어 있는지 확인하세요

## 기여

기여 가이드는 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요.

## 라이선스

- **소스 코드:** [MIT License](LICENSE)
- **아트 에셋** (`assets/characters/`, `assets/office/`): [Custom restrictive license](LICENSE-ASSETS) — 재배포 및 수정 불가
