function createLocalStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: jest.fn((key) => values.get(key) || null),
    setItem: jest.fn((key, value) => {
      values.set(key, value);
    }),
  };
}

describe('client i18n', () => {
  beforeEach(() => {
    jest.resetModules();
    delete global.navigator;
    global.localStorage = createLocalStorage();
  });

  afterEach(() => {
    delete global.localStorage;
    delete global.navigator;
  });

  test('normalizes supported locales and language prefixes', () => {
    const { DEFAULT_LOCALE, normalizeLocale } = require('../src/client/i18n/index.ts');

    expect(normalizeLocale('ko-KR')).toBe('ko-KR');
    expect(normalizeLocale('ko')).toBe('ko-KR');
    expect(normalizeLocale('en_US')).toBe('en-US');
    expect(normalizeLocale('fr-FR')).toBeNull();
    expect(DEFAULT_LOCALE).toBe('en-US');
  });

  test('resolves persisted locale before browser language', () => {
    global.localStorage = createLocalStorage({ 'agent-office-locale': 'ko-KR' });
    global.navigator = { languages: ['en-US'] };

    const { getLocale } = require('../src/client/i18n/index.ts');

    expect(getLocale()).toBe('ko-KR');
  });

  test('falls back from browser language to default locale', () => {
    global.navigator = { languages: ['fr-FR'] };

    const { getLocale } = require('../src/client/i18n/index.ts');

    expect(getLocale()).toBe('en-US');
  });

  test('keeps translation key parity between base and Korean resources', () => {
    const {
      enUS,
      getTranslationKeys,
      koKR,
    } = require('../src/client/i18n/index.ts');

    expect(getTranslationKeys(koKR)).toEqual(getTranslationKeys(enUS));
  });

  test('translates and interpolates explicit params', () => {
    const { setLocale, t } = require('../src/client/i18n/index.ts');

    expect(t('dashboard.floor.confirmDelete', { name: 'Lab' })).toBe(
      'Delete "Lab"? Agents on this floor will be unassigned.',
    );

    setLocale('ko-KR');

    expect(t('dashboard.floor.agentCount', { count: 3 })).toBe('에이전트 3개');
  });

  test('notifies subscribers and persists locale changes', () => {
    const {
      getLocale,
      setLocale,
      subscribeLocale,
    } = require('../src/client/i18n/index.ts');
    const listener = jest.fn();
    const unsubscribe = subscribeLocale(listener);

    setLocale('ko');

    expect(getLocale()).toBe('ko-KR');
    expect(listener).toHaveBeenCalledWith('ko-KR');
    expect(global.localStorage.setItem).toHaveBeenCalledWith('agent-office-locale', 'ko-KR');

    unsubscribe();
    setLocale('en-US');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('formats numbers, lists, and relative time with the active locale', () => {
    const { setLocale } = require('../src/client/i18n/index.ts');
    const {
      formatList,
      formatNumber,
      formatRelativeTime,
    } = require('../src/client/i18n/format.ts');

    setLocale('en-US');
    expect(formatNumber(1234)).toBe('1,234');
    expect(formatList(['Alpha', 'Beta'])).toBe('Alpha and Beta');
    expect(formatRelativeTime(Date.UTC(2026, 0, 1, 0, 1), Date.UTC(2026, 0, 1, 0, 0))).toBe('in 1 minute');

    setLocale('ko-KR');
    expect(formatNumber(1234)).toBe('1,234');
    expect(formatRelativeTime(Date.UTC(2026, 0, 1, 0, 1), Date.UTC(2026, 0, 1, 0, 0))).toContain('1분');
  });
});
