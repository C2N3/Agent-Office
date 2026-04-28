import { getLocale } from './index';

type DateTimeInput = number | string | Date;

function toDate(value: DateTimeInput): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDateTime(value: DateTimeInput, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(getLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
  }).format(toDate(value));
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(getLocale(), options).format(value);
}

export function formatList(values: string[], options?: Intl.ListFormatOptions): string {
  return new Intl.ListFormat(getLocale(), {
    style: 'long',
    type: 'conjunction',
    ...options,
  }).format(values);
}

export function formatRelativeTime(value: DateTimeInput, base: DateTimeInput = Date.now()): string {
  const targetTime = toDate(value).getTime();
  const baseTime = toDate(base).getTime();
  const diffSeconds = Math.round((targetTime - baseTime) / 1000);
  const divisions: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
    ['second', 1],
  ];
  const formatter = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' });
  for (const [unit, seconds] of divisions) {
    if (Math.abs(diffSeconds) >= seconds || unit === 'second') {
      return formatter.format(Math.round(diffSeconds / seconds), unit);
    }
  }
  return formatter.format(0, 'second');
}
