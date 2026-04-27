import React, {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';
import {
  getLocale,
  setLocale,
  subscribeLocale,
  t,
  type SupportedLocale,
  type TranslationKey,
} from './index.js';

type I18nContextValue = {
  locale: SupportedLocale;
  setLocale: typeof setLocale;
  t: typeof t;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function useLocaleSnapshot(): SupportedLocale {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale);
}

function useI18nValue(): I18nContextValue {
  const locale = useLocaleSnapshot();
  return useMemo(() => ({ locale, setLocale, t }), [locale]);
}

export function I18nProvider({ children }: { children: ReactNode }): ReactElement {
  const value = useI18nValue();
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  const fallback = useI18nValue();
  return context || fallback;
}

export type { TranslationKey };
