import i18n from '@/i18n';

const TZ = 'Asia/Ho_Chi_Minh';

const locale = () => (i18n.language === 'en' ? 'en-GB' : 'vi-VN');

export function clock(ms: number, seconds = false): string {
  return new Intl.DateTimeFormat(locale(), {
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
    hour12: false,
    timeZone: TZ,
  }).format(ms);
}

export function num(x: number, digits = 0): string {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(x);
}

export function km(m: number): string {
  return `${num(m / 1000, 1)} km`;
}

/** "3 phút trước" style, relative to the simulated clock. */
export function ago(ms: number, now: number): string {
  const min = Math.max(0, Math.round((now - ms) / 60_000));
  if (min < 1) return i18n.t('time.justNow');
  if (min < 60) return i18n.t('time.minAgo', { n: min });
  return i18n.t('time.hAgo', { n: Math.floor(min / 60), m: min % 60 });
}

export function minutesLeft(until: number | null, now: number): number | null {
  return until === null ? null : Math.max(0, Math.ceil((until - now) / 60_000));
}
