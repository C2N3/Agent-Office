# Pixel Agent Desk — UI/UX 디자인 개선 계획서

> **작성일:** 2026-03-06
> **대상 파일:** `dashboard.html`, `index.html`, `styles.css`, `src/office/*`, `src/renderer/*`
> **미적 방향:** **Retro-Futuristic Terminal** — 픽셀 아트 캐릭터의 정체성을 살리면서, CRT 모니터 + 사이버펑크 터미널의 감성을 입힌 프리미엄 다크 UI

---

## 0. 현재 진단 요약

### 잘 된 점
- 상태 색상 시스템이 3개 뷰(아바타/대시보드/오피스)에 걸쳐 일관적
- 펄스·셰이크·페이드 애니메이션 품질이 높음
- 키보드 내비게이션, ARIA 라벨 등 접근성 기초가 잘 잡혀 있음
- CSS 변수 기반 토큰 시스템 구축됨

### 개선이 필요한 점

| 영역 | 현재 상태 | 문제점 |
|------|----------|--------|
| **타이포그래피** | 시스템 폰트 (`-apple-system, Segoe UI…`) | 개성 없음. 픽셀 아트 앱인데 타이포에 레트로 감성 전무 |
| **색상 깊이** | 플랫 다크 (`#0f172a` → `#1e293b`) | 단조로운 2톤 구성. 그라데이션·텍스처·빛 효과 없음 |
| **대시보드 레이아웃** | 고정 280px 사이드바 + 1fr 그리드 | 제네릭한 어드민 패널 느낌. 앱 정체성 부재 |
| **카드 컴포넌트** | 기본 border + hover 효과만 | 상태별 시각적 차이가 3px 상단선 하나. 정보 밀도 낮음 |
| **헤더** | 제목 + 연결 상태 점 | 브랜딩 부재. 로고 없음. 기능 버튼 없음 |
| **사이드바 네비** | 텍스트 + 이모지 아이콘 | 이모지가 시각적 통일성 해침. 아이콘 시스템 없음 |
| **빈 상태** | 큰 이모지 + 텍스트 | 앱 정체성과 관계없는 범용 디자인 |
| **모션** | 개별 애니메이션은 좋으나 오케스트레이션 없음 | 페이지 진입, 탭 전환, 데이터 로드 시 연출 부재 |
| **아바타 렌더러** | 투명 배경 + 말풍선 | 시각적 맥락(바닥면, 깊이감) 부족 |

---

## 1. 타이포그래피 개편

### 현재
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
```
→ 완전히 제네릭. 픽셀 아트 앱이라는 정체성 전달 불가.

### 개선안

**Display (제목·숫자):** `"Press Start 2P"` 또는 `"Silkscreen"` (Google Fonts)
- 8bit/픽셀 아트 감성의 비트맵 스타일 디스플레이 폰트
- 대시보드 헤더 타이틀, stat-value 숫자, 빈 상태 타이틀에 적용

**Body (본문):** `"JetBrains Mono"` (Google Fonts)
- 모노스페이스지만 가독성 뛰어남. 터미널 감성 + 코딩 도구 컨텍스트에 부합
- 사이드바, 카드 본문, 라벨, 피드 텍스트에 적용

**UI (버튼·배지):** `"Pretendard Variable"` 유지
- 한글 가독성 최우선 영역은 기존 선택 유지
- 네비게이션 라벨, 버튼 텍스트, 한글 UI 문구

**구현 우선순위:** `@import` 추가 + CSS 변수 `--font-display`, `--font-body`, `--font-ui` 정의

```css
:root {
  --font-display: 'Press Start 2P', 'Silkscreen', monospace;
  --font-body: 'JetBrains Mono', 'Fira Code', monospace;
  --font-ui: 'Pretendard Variable', -apple-system, sans-serif;
}
```

### 적용 포인트
| 위치 | 현재 | 변경 |
|------|------|------|
| 대시보드 `header-title` | `1.25rem, 600` | `--font-display`, `0.9rem`, 800 (비트맵 폰트는 작게 써야 선명) |
| `stat-value` | `2rem, 700` | `--font-display`, `1.5rem` |
| `.agent-name` (대시보드) | 시스템 폰트 | `--font-body` |
| `.live-feed-item` | 시스템 폰트 | `--font-body`, `0.75rem` |
| 모든 `monospace` 지정 | `Consolas, Courier New` | `--font-body` |

---

## 2. 색상 & 테마 심화

### 현재 문제
- `#0f172a` → `#1e293b` → `#334155` 3단계 슬레이트만으로 구성
- 카드와 배경의 대비가 약해 계층감 부족
- 상태 색상은 좋지만 "빛"이 없음 (글로우, 그라데이션 미사용)

### 개선안: CRT 터미널 테마

```css
:root {
  /* ── 배경 계층 ── */
  --color-bg-deep: #080c16;        /* 가장 깊은 배경 (새로 추가) */
  --color-bg: #0d1117;             /* 기본 배경 (GitHub Dark 톤으로 조정) */
  --color-surface: #161b22;        /* 카드/패널 (기존 --color-card 대체) */
  --color-surface-raised: #1c2333; /* 호버/활성 카드 */
  --color-border: #30363d;         /* 테두리 (기존과 유사) */
  --color-border-active: #58a6ff;  /* 활성 테두리 (새로 추가) */

  /* ── 텍스트 ── */
  --color-text: #e6edf3;           /* 밝은 텍스트 (약간 푸른빛) */
  --color-text-muted: #7d8590;     /* 보조 텍스트 */
  --color-text-accent: #58a6ff;    /* 강조 텍스트 (링크 등) */

  /* ── 글로우 시스템 (새로 추가) ── */
  --glow-working: 0 0 20px rgba(249, 115, 22, 0.3);
  --glow-thinking: 0 0 20px rgba(139, 92, 246, 0.3);
  --glow-done: 0 0 20px rgba(34, 197, 94, 0.3);
  --glow-error: 0 0 20px rgba(239, 68, 68, 0.3);
}
```

### 배경 텍스처 추가
```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background:
    /* 스캔라인 효과 (CRT 모니터 감성) */
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0, 0, 0, 0.03) 2px,
      rgba(0, 0, 0, 0.03) 4px
    ),
    /* 미세한 노이즈 그레인 */
    url("data:image/svg+xml,...");  /* SVG noise pattern */
  pointer-events: none;
  z-index: 9999;
  opacity: 0.4;
}
```

### 카드 글로우 효과
```css
.agent-card.state-working {
  box-shadow: var(--glow-working);
  border-color: rgba(249, 115, 22, 0.4);
}

.agent-card.state-thinking {
  box-shadow: var(--glow-thinking);
  border-color: rgba(139, 92, 246, 0.4);
}
```

---

## 3. 대시보드 레이아웃 리디자인

### 3.1 헤더 개편

**현재:** 텍스트 타이틀 + 이모지 + 연결 점
**개선:**

```
┌──────────────────────────────────────────────────────────────┐
│  ▓▓  PIXEL AGENT DESK          [🔴 3 Active] [⚡ SSE ●]  ⚙  │
│  ▓▓  v1.0 — AI Agent Monitor    연결됨 · 47821 포트          │
└──────────────────────────────────────────────────────────────┘
```

- 왼쪽: 픽셀 아트 로고 (16x16 또는 32x32 favicon 스타일) + 비트맵 폰트 제목
- 중앙: 빠른 상태 요약 칩 (Active 수, 총 토큰 등)
- 오른쪽: 연결 상태 (SSE 아이콘 + 텍스트) + 설정 기어
- 높이: `56px` → `52px`로 컴팩트하게

### 3.2 사이드바 리디자인

**현재 문제:**
- 이모지 아이콘 (🏢📊👥💰📅)이 크기·정렬 불일치
- 네비 항목 간 시각적 구분 약함
- Live Feed가 사이드바 하단에 단조롭게 배치

**개선안:**

```
┌─────────────────────┐
│  NAVIGATION         │
│  ─────────────────  │
│  ◆ Office        ← │ ← 활성 시 왼쪽 액센트 바 (4px, 파란색)
│  ◇ Overview         │
│  ◇ Agents           │
│  ◇ Tokens           │
│  ◇ Activity         │
│                     │
│  ─────────────────  │
│  LIVE FEED          │
│  ┌─────────────┐   │
│  │ ● 14:32:01  │   │ ← 상태 색상 좌측 점 + 모노스페이스 시간
│  │   Agent-0    │   │
│  │   Working    │   │
│  └─────────────┘   │
│  ┌─────────────┐   │
│  │ ● 14:31:58  │   │
│  │   Agent-1    │   │
│  │   Thinking   │   │
│  └─────────────┘   │
└─────────────────────┘
```

- 이모지 → SVG 인라인 아이콘 또는 단색 픽셀 아이콘으로 교체
- 활성 네비: 왼쪽 `4px` 수직 바 (기존 우측 → 좌측으로 변경)
- 네비 항목에 마우스 오버 시 배경에 미세한 그라데이션 스윕
- Live Feed 아이템: 카드화 + 상태 색상 좌측 도트 + 타임스탬프 강조

### 3.3 메인 콘텐츠 영역

**탭 전환 트랜지션 추가:**
```css
/* 현재: 즉시 display:none ↔ display:block */
/* 개선: 크로스페이드 + 슬라이드 */
.main-content, .office-view {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.view-entering {
  animation: viewEnter 0.3s ease-out;
}

@keyframes viewEnter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

---

## 4. 대시보드 컴포넌트 개선

### 4.1 Stat Cards (개요 탭)

**현재:** 플랫 카드 + 아이콘·라벨·숫자
**개선:**

```
┌─────────────────────────┐
│  Active Agents          │
│                         │
│  ██████ 3              │ ← 비트맵 폰트 큰 숫자 + 미니 바 그래프
│  ▲ 2 from yesterday    │ ← 변화량 표시 (초록 위/빨강 아래)
│  ·························│ ← 하단에 미니 스파크라인 (최근 24시간)
└─────────────────────────┘
```

- 숫자에 `--font-display` 적용 (비트맵 감성)
- 카드 호버 시 `box-shadow: var(--glow-*)` + `border-color` 전환
- 배경에 미세한 대각선 해치 패턴 또는 도트 매트릭스 패턴
- 아이콘: 이모지 → 모노크롬 픽셀 아이콘 (8x8 또는 16x16 수준)

### 4.2 Agent Cards (에이전트 탭)

**현재:** 3px 상단 컬러 바 + 텍스트 정보
**개선:**

```
┌──────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │ ← 상단 컬러 바 (3px → 2px, 더 날카롭게)
│                                      │
│  [avatar_sprite]  Agent-0            │ ← 48x64 픽셀 아바타 미리보기 추가!
│                   Main               │
│                   ● Working          │ ← 상태 dot + 텍스트 (기존 배지 → 인라인)
│                                      │
│  ─── Current Activity ─────────────  │
│  🔧 Bash: npm test                   │ ← 현재 도구 + 명령어 (모노스페이스)
│                                      │
│  Project   my-project                │
│  Model     claude-opus-4-6              │
│  Duration  00:12:34                  │
│                                      │
│  ─────────────────────────────────── │
│  ↗ 12.4K tokens    $0.42            │ ← 푸터: 토큰 + 비용
└──────────────────────────────────────┘
```

핵심 변경:
- **아바타 미리보기** — 카드 좌측에 스프라이트 시트에서 추출한 48x64 캐릭터 렌더
- **상태 글로우** — Working 카드는 오렌지 글로우, Thinking은 바이올렛 글로우
- **현재 활동 섹션** — 도구명+입력을 별도 섹션으로 분리, 모노스페이스 강조
- **카드 간 간격** — `16px` → `12px` (정보 밀도 증가)

### 4.3 히트맵 (활동 기록 탭)

**현재:** GitHub 잔디 스타일 (파란색 계열)
**개선:**

- 색상을 앱 테마에 맞춰 **시안-블루 계열**로 변경:
  ```css
  .heatmap-cell.level-0 { background: #0d1117; }          /* 배경과 동일 */
  .heatmap-cell.level-1 { background: #0e4429; }          /* 어두운 초록 */
  .heatmap-cell.level-2 { background: #006d32; }          /* 중간 초록 */
  .heatmap-cell.level-3 { background: #26a641; }          /* 밝은 초록 */
  .heatmap-cell.level-4 { background: #39d353; }          /* 최고 밝기 */
  ```
  → GitHub과 동일한 초록 계열을 채택하되, 배경색만 앱에 맞춤
  → 또는 앱 고유의 **오렌지→시안 그라데이션** 채택 (Working 색상에서 시작)

- 셀 호버 시 `scale(1.3)` + 글로우 이펙트
- 요약 카드에 스파크라인 미니차트 추가 (최근 7일 트렌드)

### 4.4 토큰 차트 (토큰 탭)

**현재:** 수평 바 차트 (그라데이션 파란색)
**개선:**
- 바 위에 마우스 오버 시 디테일 툴팁 표시
- 바 배경에 미세한 그리드 라인 (10%, 25%, 50%, 75%, 100%)
- 숫자에 카운트업 애니메이션 (처음 로드 시)
- 비용 합계를 상단에 크게 표시 (`--font-display`)

---

## 5. 아바타 렌더러 (index.html) 개선

### 5.1 시각적 맥락 추가

**현재:** 투명 배경 위에 캐릭터 + 말풍선만 떠 있음
**개선:**

```
          ┌─ Thinking... ─┐
          │   . . .        │
          └───────┬────────┘
                  │
              ┌───┴───┐
              │ avatar │
              │ sprite │
              └───┬───┘
          ░░░░░░░░░░░░░░░░  ← 그림자/리플렉션 (CSS filter)
```

- 캐릭터 아래에 **바닥 그림자** 추가 (`filter: drop-shadow` 또는 별도 div)
- 그림자는 투명→불투명 그라데이션 타원 (픽셀아트 스타일에 맞게 단순한 형태)

### 5.2 말풍선 개선

**현재:** 흰색 배경 + 얇은 테두리
**개선:**

- 배경: `rgba(255, 255, 255, 0.97)` → `rgba(255, 255, 255, 0.93)` + `backdrop-filter: blur(4px)`
- Working 상태 말풍선: 미세한 오렌지 그라데이션 배경
  ```css
  .agent-bubble.is-working {
    background: linear-gradient(135deg,
      rgba(255, 255, 255, 0.95),
      rgba(249, 115, 22, 0.08)
    );
  }
  ```
- 상태 전환 시 말풍선 텍스트에 `fadeIn` 트랜지션 (현재: 즉시 변경)
- **타이핑 효과** — Thinking 상태의 "..." 도트를 타자기처럼 한 글자씩 타이핑

### 5.3 에이전트 카드 (멀티 모드) 개선

**현재:** 90px 카드, 최소한의 정보
**개선:**

- 카드 폭: `90px` → `96px` (8의 배수, 픽셀 그리드 정렬)
- 호버 시 카드에 미세한 배경 글로우 (상태 색상 기반)
- 이름 배지: 둥근 pill → 각진 태그 (픽셀 아트 톤에 맞게)
- 타이머 폰트: `--font-body` (JetBrains Mono) 적용으로 숫자 정렬
- 오프라인 카드: grayscale + 바운스 없음 (현재도 구현됨, OK)

### 5.4 컨텍스트 메뉴 개선

**현재:** 다크글래스 + 기본 호버
**개선:**
- 메뉴 아이템에 좌측 아이콘을 **모노크롬 픽셀 스타일**로 교체
- 단축키 뱃지: 현재 `rgba(255,255,255,0.08)` → `rgba(88,166,255,0.15)` 약간 파란빛
- 위험 항목(Close Agent)에 호버 시 레드 글로우

---

## 6. 오피스 뷰 개선

### 6.1 랩탑 애니메이션

**현재:** 상태 변경 시 즉시 open↔close 전환
**개선:**
- 열림/닫힘 시 2프레임 전환 애니메이션 (open→half→close)
- 활성 랩탑 화면에 미세한 스크린 글로우 이펙트 (canvas glow)

### 6.2 캐릭터 이펙트

**현재:** 걷기·앉기·댄스 애니메이션만
**개선:**
- Working 상태: 머리 위에 기어/코드 파티클 이펙트 (1-2px 픽셀 입자)
- Thinking 상태: "..." 말풍선 내부에 깜빡이는 커서
- Done 상태: 짧은 반짝임 이펙트 (별 파티클 3-4개, 0.5초)
- Help 상태: 느낌표(!) 위아래로 바운스

### 6.3 환경 이펙트

- 캔버스 상단에 미세한 **앰비언트 라이트** 그라데이션 (천장 조명 시뮬레이션)
- 시간대별 조명 변화 (실제 시간 연동은 옵션, 기본은 밝은 오피스 조명)

---

## 7. 모션 디자인 시스템

### 7.1 페이지 진입 오케스트레이션

**현재:** 개별 `fadeIn 0.3s` 뿐
**개선:** 대시보드 탭 진입 시 스태거드 리빌

```
t=0ms    헤더 fade-in
t=50ms   사이드바 slide-in (왼쪽에서)
t=100ms  Stat Card 1 pop-in
t=150ms  Stat Card 2 pop-in
t=200ms  Stat Card 3 pop-in
t=300ms  Agent Cards stagger (각 50ms 간격)
```

구현:
```css
.stat-card:nth-child(1) { animation-delay: 100ms; }
.stat-card:nth-child(2) { animation-delay: 150ms; }
.stat-card:nth-child(3) { animation-delay: 200ms; }
/* ... */

@keyframes popIn {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
```

### 7.2 숫자 카운트업

Stat 카드의 숫자가 처음 표시될 때 `0 → target` 카운트업:
```javascript
function countUp(el, target, duration = 600) {
  const start = performance.now();
  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
    el.textContent = Math.floor(target * eased).toLocaleString();
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
```

### 7.3 Live Feed 애니메이션

**현재:** `slideIn` (왼쪽에서 페이드)
**개선:**
- 새 아이템 진입 시 기존 아이템들이 아래로 밀려남 (`translateY` 트랜지션)
- 새 아이템에 0.5초간 하이라이트 배경 (`rgba(88,166,255,0.1)`)

### 7.4 탭 전환

**현재:** `display: none` ↔ `display: block` (즉시 전환)
**개선:**
- 퇴장: `opacity 1→0` + `translateY(0→-4px)` (150ms)
- 진입: `opacity 0→1` + `translateY(4px→0)` (200ms)

---

## 8. 빈 상태 & 에러 상태 리디자인

### 8.1 빈 상태 (No Agents)

**현재:**
```
🤖
에이전트 없음
Claude CLI를 시작하면 여기에 표시됩니다
```

**개선:**
```
   ┌─────────────────────────┐
   │                         │
   │     (pixel art idle     │   ← 대기 중인 캐릭터 애니메이션 (앉아서 노트북 클릭)
   │      character anim)    │
   │                         │
   │   NO AGENTS ONLINE      │   ← --font-display (비트맵)
   │                         │
   │   Claude CLI를 시작하면  │   ← --font-ui (Pretendard)
   │   에이전트가 나타납니다   │
   │                         │
   │   [ 시작 가이드 보기 ]   │   ← 선택적 액션 버튼
   └─────────────────────────┘
```

- 캐릭터 스프라이트를 활용한 유휴 애니메이션
- 비트맵 폰트 제목으로 앱 정체성 강화

### 8.2 에러 토스트 다크 모드 통합

**현재:** 라이트 배경 (흰색) — 다크 UI와 부조화
**개선:**
- 기본 배경을 다크로 변경: `rgba(22, 27, 34, 0.98)`
- 심각도 색상: 좌측 바 유지하되, 아이콘 배경에도 동일 색상 원형 적용
- 닫기 버튼: `×` → 픽셀 스타일 `X`

---

## 9. 마이크로인터랙션 추가

| 상호작용 | 현재 | 개선 |
|----------|------|------|
| 카드 호버 | `translateY(-2px)` + shadow | + 상태 색상 글로우 + 테두리 밝기 증가 |
| 네비 클릭 | 즉시 활성 | 잉크 리플 효과 (material ripple) |
| 연결 상태 변경 | 점 색상만 변경 | 점이 커졌다 줄어드는 pop + 텍스트 fade |
| 에이전트 상태 전환 | 말풍선 테두리색만 변경 | 0.1초 스케일 pop (1→1.05→1) + 색상 전환 |
| 터미널 포커스 버튼 클릭 | 색상 반전 | + 원형 ripple 이펙트 |
| Poke (캐릭터 클릭) | 테두리 플래시 | + 캐릭터 점프 (`translateY(-6px)` bounce) |

---

## 10. 구현 우선순위 & 난이도

### Phase A: 기초 토큰 (난이도: 낮음, 영향: 높음) ⭐ 최우선

| # | 작업 | 파일 | 예상 규모 |
|---|------|------|----------|
| A1 | 폰트 시스템 도입 (CSS 변수 + @import) | `dashboard.html`, `styles.css` | ~30줄 |
| A2 | 색상 토큰 리팩토링 (글로우, 계층 추가) | `dashboard.html`, `styles.css` | ~50줄 |
| A3 | 카드 글로우 효과 (상태별 box-shadow) | `dashboard.html` | ~20줄 |

### Phase B: 컴포넌트 품질 (난이도: 중, 영향: 높음)

| # | 작업 | 파일 | 예상 규모 |
|---|------|------|----------|
| B1 | 사이드바 아이콘 교체 (이모지 → SVG/CSS) | `dashboard.html` | ~60줄 |
| B2 | 에이전트 카드에 아바타 미리보기 추가 | `dashboard.html` + JS | ~80줄 |
| B3 | Stat 카드 숫자 카운트업 애니메이션 | `dashboard.html` JS | ~30줄 |
| B4 | 탭 전환 크로스페이드 트랜지션 | `dashboard.html` CSS+JS | ~40줄 |
| B5 | 말풍선 상태별 배경 그라데이션 | `styles.css` | ~20줄 |

### Phase C: 모션 & 분위기 (난이도: 중, 영향: 중)

| # | 작업 | 파일 | 예상 규모 |
|---|------|------|----------|
| C1 | 페이지 진입 스태거드 애니메이션 | `dashboard.html` CSS | ~40줄 |
| C2 | 빈 상태 리디자인 (캐릭터 아이들 anim) | `dashboard.html` | ~60줄 |
| C3 | CRT 스캔라인 배경 텍스처 | `dashboard.html` CSS | ~15줄 |
| C4 | 에러 토스트 다크 모드 통합 | `styles.css` | ~20줄 |
| C5 | 아바타 렌더러 바닥 그림자 | `styles.css` | ~10줄 |

### Phase D: 오피스 & 폴리시 (난이도: 높음, 영향: 중)

| # | 작업 | 파일 | 예상 규모 |
|---|------|------|----------|
| D1 | 오피스 캐릭터 상태 파티클 이펙트 | `office-renderer.js` | ~100줄 |
| D2 | 랩탑 열림/닫힘 전환 애니메이션 | `office-character.js` | ~40줄 |
| D3 | 히트맵 셀 호버 글로우 + 스파크라인 | `dashboard.html` | ~60줄 |
| D4 | 카드 폭 96px 정렬 + 타이머 모노스페이스 | `styles.css`, `agentCard.js` | ~15줄 |

---

## 11. 참고 무드보드

**핵심 키워드:** `Pixel Art` + `Terminal` + `CRT Monitor` + `Cyberpunk Dashboard`

영감을 줄 레퍼런스:
- **Hyper Terminal** — 터미널 앱의 시각적 품질
- **Warp.dev** — 모던 터미널 UI의 정보 밀도
- **GitHub Contribution Graph** — 히트맵 시각 언어
- **Aseprite** — 픽셀 아트 도구의 UI 톤 (어두운 배경, 밝은 강조)
- **Cool Retro Term** — CRT 효과, 스캔라인, 인광 글로우

---

## 12. 제약사항 & 주의점

1. **성능** — CRT 스캔라인 오버레이는 `pointer-events: none` + `will-change: opacity` 필수. GPU 합성 보장.
2. **폰트 로딩** — Google Fonts `@import`는 FOUC(Flash of Unstyled Content) 유발 가능. `<link rel="preload">` 사용 권장.
3. **아바타 동기화** — 대시보드 카드에 아바타 미리보기 추가 시 `AVATAR_FILES` 배열 의존. `office-config.js`와 동기화 유지 필수 (CLAUDE.md 규칙).
4. **Electron CSP** — `index.html`의 `Content-Security-Policy`에 Google Fonts CDN 추가 필요 (`font-src https://fonts.gstatic.com`).
5. **기존 애니메이션과 충돌 방지** — 새 애니메이션 추가 시 기존 `bubble-pulse-*`, `agent-enter`, `agent-exit` 등과 키프레임명 충돌 없도록 네이밍 규칙 준수 (예: `ds-` 접두사).
6. **오피스 Canvas 렌더링** — 오피스 이펙트는 `requestAnimationFrame` 루프 내에서만 그려야 함. DOM 접근 금지.
