/**
 * HeatmapScanner Tests
 * JSONL 스캔, 일별 집계, 증분 스캔, 영속화 테스트
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const HeatmapScanner = require('../src/heatmapScanner');

// 테스트용 임시 디렉토리
let tmpDir;
let projectsDir;
let persistDir;

// fs.existsSync, readFileSync 등 원본 보존
const originalHomedir = os.homedir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heatmap-test-'));
  projectsDir = path.join(tmpDir, '.claude', 'projects', 'test-project');
  persistDir = path.join(tmpDir, '.pixel-agent-desk');
  fs.mkdirSync(projectsDir, { recursive: true });

  // homedir를 tmpDir로 모킹
  os.homedir = () => tmpDir;
});

afterEach(() => {
  os.homedir = originalHomedir;
  // 임시 디렉토리 정리
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * 테스트용 JSONL 라인 생성 헬퍼
 */
function makeUserLine(timestamp, sessionId = 'sess-1') {
  return JSON.stringify({
    type: 'user',
    timestamp,
    sessionId,
    message: { role: 'user', content: 'hello' },
  });
}

function makeAssistantLine(timestamp, sessionId = 'sess-1', opts = {}) {
  const {
    model = 'claude-sonnet-4-6',
    inputTokens = 1000,
    outputTokens = 200,
    toolUseCount = 0,
  } = opts;

  const content = [];
  content.push({ type: 'text', text: 'response' });
  for (let i = 0; i < toolUseCount; i++) {
    content.push({ type: 'tool_use', id: `tool-${i}`, name: 'Bash', input: {} });
  }

  return JSON.stringify({
    type: 'assistant',
    timestamp,
    sessionId,
    message: {
      role: 'assistant',
      model,
      content,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
  });
}

describe('HeatmapScanner', () => {
  test('constructor initializes empty state', () => {
    const scanner = new HeatmapScanner();
    const stats = scanner.getDailyStats();
    expect(stats.days).toEqual({});
    expect(stats.lastScan).toBe(0);
  });

  describe('scanAll', () => {
    test('scans JSONL files and aggregates daily stats', async () => {
      const lines = [
        makeUserLine('2026-03-05T10:00:00Z'),
        makeAssistantLine('2026-03-05T10:00:05Z', 'sess-1', { toolUseCount: 2 }),
        makeUserLine('2026-03-05T11:00:00Z', 'sess-2'),
        makeAssistantLine('2026-03-05T11:00:05Z', 'sess-2', { toolUseCount: 1 }),
      ].join('\n') + '\n';

      fs.writeFileSync(path.join(projectsDir, 'transcript.jsonl'), lines);

      const scanner = new HeatmapScanner();
      await scanner.scanAll();

      const stats = scanner.getDailyStats();
      const day = stats.days['2026-03-05'];

      expect(day).toBeDefined();
      expect(day.sessions).toBe(2);
      expect(day.userMessages).toBe(2);
      expect(day.assistantMessages).toBe(2);
      expect(day.toolUses).toBe(3);
      expect(day.inputTokens).toBe(2000);
      expect(day.outputTokens).toBe(400);
      expect(day.estimatedCost).toBeGreaterThan(0);
    });

    test('handles empty projects directory', async () => {
      const scanner = new HeatmapScanner();
      await scanner.scanAll();
      expect(Object.keys(scanner.getDailyStats().days)).toHaveLength(0);
    });

    test('handles non-existent projects directory', async () => {
      // 임시로 .claude 디렉토리 삭제
      fs.rmSync(path.join(tmpDir, '.claude'), { recursive: true, force: true });

      const scanner = new HeatmapScanner();
      await scanner.scanAll();
      expect(Object.keys(scanner.getDailyStats().days)).toHaveLength(0);
    });

    test('skips sidechain entries', async () => {
      const lines = [
        makeUserLine('2026-03-05T10:00:00Z'),
        JSON.stringify({
          type: 'user',
          timestamp: '2026-03-05T10:01:00Z',
          sessionId: 'sess-1',
          isSidechain: true,
          message: { role: 'user', content: 'compacted' },
        }),
      ].join('\n') + '\n';

      fs.writeFileSync(path.join(projectsDir, 'transcript.jsonl'), lines);

      const scanner = new HeatmapScanner();
      await scanner.scanAll();

      const day = scanner.getDailyStats().days['2026-03-05'];
      expect(day.userMessages).toBe(1);
    });

    test('aggregates across multiple dates', async () => {
      const lines = [
        makeUserLine('2026-03-04T10:00:00Z'),
        makeAssistantLine('2026-03-04T10:00:05Z'),
        makeUserLine('2026-03-05T10:00:00Z'),
        makeAssistantLine('2026-03-05T10:00:05Z'),
      ].join('\n') + '\n';

      fs.writeFileSync(path.join(projectsDir, 'transcript.jsonl'), lines);

      const scanner = new HeatmapScanner();
      await scanner.scanAll();

      const stats = scanner.getDailyStats();
      expect(stats.days['2026-03-04']).toBeDefined();
      expect(stats.days['2026-03-05']).toBeDefined();
      expect(stats.days['2026-03-04'].sessions).toBe(1);
      expect(stats.days['2026-03-05'].sessions).toBe(1);
    });
  });

  describe('incremental scan', () => {
    test('only reads new bytes on second scan', async () => {
      const lines1 = [
        makeUserLine('2026-03-05T10:00:00Z'),
        makeAssistantLine('2026-03-05T10:00:05Z', 'sess-1', { toolUseCount: 1 }),
      ].join('\n') + '\n';

      const filePath = path.join(projectsDir, 'transcript.jsonl');
      fs.writeFileSync(filePath, lines1);

      const scanner = new HeatmapScanner();
      await scanner.scanAll();

      expect(scanner.getDailyStats().days['2026-03-05'].toolUses).toBe(1);

      // 파일에 추가 기록
      const lines2 = [
        makeAssistantLine('2026-03-05T12:00:00Z', 'sess-1', { toolUseCount: 3 }),
      ].join('\n') + '\n';
      fs.appendFileSync(filePath, lines2);

      await scanner.scanAll();

      // 기존 + 새로운 도구 사용이 합산되어야 함
      expect(scanner.getDailyStats().days['2026-03-05'].toolUses).toBe(4);
    });

    test('skips file if unchanged', async () => {
      const lines = [
        makeUserLine('2026-03-05T10:00:00Z'),
      ].join('\n') + '\n';

      fs.writeFileSync(path.join(projectsDir, 'transcript.jsonl'), lines);

      const scanner = new HeatmapScanner();
      await scanner.scanAll();
      const firstScan = scanner.lastScan;

      // 같은 파일 다시 스캔 → 엔트리 수 변경 없어야 함
      await scanner.scanAll();
      expect(scanner.getDailyStats().days['2026-03-05'].userMessages).toBe(1);
    });
  });

  describe('getRange', () => {
    test('returns only days in range', async () => {
      const lines = [
        makeUserLine('2026-03-01T10:00:00Z'),
        makeUserLine('2026-03-03T10:00:00Z'),
        makeUserLine('2026-03-05T10:00:00Z'),
      ].join('\n') + '\n';

      fs.writeFileSync(path.join(projectsDir, 'transcript.jsonl'), lines);

      const scanner = new HeatmapScanner();
      await scanner.scanAll();

      const range = scanner.getRange('2026-03-02', '2026-03-04');
      expect(Object.keys(range)).toEqual(['2026-03-03']);
    });
  });

  describe('persistence', () => {
    test('saves and restores data', async () => {
      const lines = [
        makeUserLine('2026-03-05T10:00:00Z'),
        makeAssistantLine('2026-03-05T10:00:05Z', 'sess-1', { toolUseCount: 2 }),
      ].join('\n') + '\n';

      fs.writeFileSync(path.join(projectsDir, 'transcript.jsonl'), lines);

      const scanner1 = new HeatmapScanner();
      await scanner1.scanAll();

      // 영속화 확인
      const persistFile = path.join(tmpDir, '.pixel-agent-desk', 'heatmap.json');
      expect(fs.existsSync(persistFile)).toBe(true);

      // 새 인스턴스로 복원
      const scanner2 = new HeatmapScanner();
      const stats = scanner2.getDailyStats();
      expect(stats.days['2026-03-05']).toBeDefined();
      expect(stats.days['2026-03-05'].toolUses).toBe(2);
    });

    test('serialization excludes internal Set fields', async () => {
      const lines = [
        makeUserLine('2026-03-05T10:00:00Z'),
      ].join('\n') + '\n';

      fs.writeFileSync(path.join(projectsDir, 'transcript.jsonl'), lines);

      const scanner = new HeatmapScanner();
      await scanner.scanAll();

      const persistFile = path.join(tmpDir, '.pixel-agent-desk', 'heatmap.json');
      const data = JSON.parse(fs.readFileSync(persistFile, 'utf-8'));

      // _sessions, _projects Set은 직렬화에서 제외
      expect(data.days['2026-03-05']._sessions).toBeUndefined();
      expect(data.days['2026-03-05']._projects).toBeUndefined();
    });
  });

  describe('cost calculation', () => {
    test('uses model-specific pricing', async () => {
      const lines = [
        makeAssistantLine('2026-03-05T10:00:00Z', 'sess-1', {
          model: 'claude-opus-4-6',
          inputTokens: 1000,
          outputTokens: 100,
        }),
      ].join('\n') + '\n';

      fs.writeFileSync(path.join(projectsDir, 'transcript.jsonl'), lines);

      const scanner = new HeatmapScanner();
      await scanner.scanAll();

      const day = scanner.getDailyStats().days['2026-03-05'];
      // opus-4-6: input=15/1M, output=75/1M
      // 1000 * 15/1M + 100 * 75/1M = 0.015 + 0.0075 = 0.0225
      expect(day.estimatedCost).toBeCloseTo(0.0225, 4);
    });
  });

  describe('start and stop', () => {
    test('start and stop manage interval', () => {
      jest.useFakeTimers();
      const scanner = new HeatmapScanner();

      scanner.start(60_000);
      expect(scanner.scanInterval).not.toBeNull();

      scanner.stop();
      expect(scanner.scanInterval).toBeNull();

      jest.useRealTimers();
    });
  });

  describe('malformed data handling', () => {
    test('skips invalid JSON lines', async () => {
      const lines = [
        'not-valid-json',
        makeUserLine('2026-03-05T10:00:00Z'),
        '{broken',
      ].join('\n') + '\n';

      fs.writeFileSync(path.join(projectsDir, 'transcript.jsonl'), lines);

      const scanner = new HeatmapScanner();
      await scanner.scanAll();

      expect(scanner.getDailyStats().days['2026-03-05'].userMessages).toBe(1);
    });

    test('skips entries without timestamp', async () => {
      const lines = [
        JSON.stringify({ type: 'user', message: { role: 'user', content: 'no ts' } }),
        makeUserLine('2026-03-05T10:00:00Z'),
      ].join('\n') + '\n';

      fs.writeFileSync(path.join(projectsDir, 'transcript.jsonl'), lines);

      const scanner = new HeatmapScanner();
      await scanner.scanAll();

      expect(scanner.getDailyStats().days['2026-03-05'].userMessages).toBe(1);
    });
  });
});
