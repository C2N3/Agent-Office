export const SUPPORTED_LOCALES = ['en-US', 'ko-KR'] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];
export const DEFAULT_LOCALE: SupportedLocale = 'en-US';

const LOCALE_STORAGE_KEY = 'agent-office-locale';

function getBrowserLanguages(): string[] {
  const nav = globalThis.navigator;
  if (!nav) return [];
  if (Array.isArray(nav.languages) && nav.languages.length > 0) {
    return [...nav.languages];
  }
  return nav.language ? [nav.language] : [];
}

function readStorage(): Storage | null {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function normalizeLocale(value: string | null | undefined): SupportedLocale | null {
  if (!value) return null;
  const normalized = value.replace('_', '-').toLowerCase();
  const exact = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === normalized);
  if (exact) return exact;
  const language = normalized.split('-')[0];
  return SUPPORTED_LOCALES.find((locale) => locale.toLowerCase().startsWith(`${language}-`)) || null;
}

export function getPersistedLocale(): SupportedLocale | null {
  const storage = readStorage();
  return normalizeLocale(storage?.getItem(LOCALE_STORAGE_KEY));
}

export function persistLocale(locale: SupportedLocale): void {
  const storage = readStorage();
  storage?.setItem(LOCALE_STORAGE_KEY, locale);
}

export function resolveInitialLocale(): SupportedLocale {
  const persisted = getPersistedLocale();
  if (persisted) return persisted;
  for (const language of getBrowserLanguages()) {
    const locale = normalizeLocale(language);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}
