import { enUS, type TranslationResource } from './locales/en-US.js';
import { koKR } from './locales/ko-KR.js';
import {
  DEFAULT_LOCALE,
  normalizeLocale,
  persistLocale,
  resolveInitialLocale,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from './storage.js';

export {
  DEFAULT_LOCALE,
  normalizeLocale,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from './storage.js';

type TranslationValue = string | number | boolean | null | undefined;
type TranslationParams = Record<string, TranslationValue>;
type DotJoin<Prefix extends string, Key extends string> = `${Prefix}.${Key}`;
type LeafPaths<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends Record<string, unknown>
      ? DotJoin<K, LeafPaths<T[K]>>
      : never;
}[keyof T & string];

export type TranslationKey = LeafPaths<TranslationResource>;

const resources: Record<SupportedLocale, TranslationResource> = {
  'en-US': enUS,
  'ko-KR': koKR,
};

const listeners = new Set<(locale: SupportedLocale) => void>();
let currentLocale = resolveInitialLocale();

function lookup(resource: TranslationResource, key: TranslationKey): string | null {
  let cursor: unknown = resource;
  for (const part of key.split('.')) {
    if (!cursor || typeof cursor !== 'object' || !(part in cursor)) return null;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return typeof cursor === 'string' ? cursor : null;
}

function interpolate(template: string, params: TranslationParams | undefined): string {
  if (!params) return template;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) => (
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name] ?? '') : match
  ));
}

export function t(key: TranslationKey, params?: TranslationParams): string {
  const translated = lookup(resources[currentLocale], key) || lookup(resources[DEFAULT_LOCALE], key) || key;
  return interpolate(translated, params);
}

export function getLocale(): SupportedLocale {
  return currentLocale;
}

export function setLocale(nextLocale: SupportedLocale | string): SupportedLocale {
  const normalized = normalizeLocale(nextLocale) || DEFAULT_LOCALE;
  if (normalized === currentLocale) return currentLocale;
  currentLocale = normalized;
  persistLocale(currentLocale);
  for (const listener of listeners) {
    listener(currentLocale);
  }
  return currentLocale;
}

export function subscribeLocale(listener: (locale: SupportedLocale) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTranslationKeys(resource: TranslationResource = enUS): string[] {
  const keys: string[] = [];
  const visit = (prefix: string, value: Record<string, unknown>) => {
    for (const [key, child] of Object.entries(value)) {
      const nextKey = prefix ? `${prefix}.${key}` : key;
      if (typeof child === 'string') {
        keys.push(nextKey);
      } else if (child && typeof child === 'object') {
        visit(nextKey, child as Record<string, unknown>);
      }
    }
  };
  visit('', resource as unknown as Record<string, unknown>);
  return keys.sort();
}

export { enUS, koKR };
