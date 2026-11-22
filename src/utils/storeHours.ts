import { Restaurant } from '../types';

const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeHHMM(val?: string): val is string {
  return typeof val === 'string' && HHMM_REGEX.test(val.trim());
}

export function formatTime12h(hhmm?: string): string {
  if (!isValidTimeHHMM(hhmm)) return '';
  const [hStr, mStr] = hhmm.trim().split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatTimeRange(open?: string, close?: string): string | null {
  if (!isValidTimeHHMM(open) || !isValidTimeHHMM(close)) return null;
  return `${formatTime12h(open)} – ${formatTime12h(close)}`;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Checks whether the current local time falls inside [open, close].
 * Supports overnight schedules (e.g. 18:00 – 02:00).
 * Returns null if open or close is missing/invalid.
 */
export function isWithinTimeWindow(
  open?: string,
  close?: string,
  now: Date = new Date()
): boolean | null {
  if (!isValidTimeHHMM(open) || !isValidTimeHHMM(close)) return null;
  const openMin = toMinutes(open);
  const closeMin = toMinutes(close);
  if (openMin === closeMin) return true; // 24-hour window
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (openMin < closeMin) {
    return nowMin >= openMin && nowMin < closeMin;
  }
  // Overnight window (e.g., 18:00 to 02:00)
  return nowMin >= openMin || nowMin < closeMin;
}

export interface StoreScheduleStatus {
  businessRange: string | null;
  deliveryRange: string | null;
  isBusinessOpenNow: boolean;
  isDeliveryOpenNow: boolean;
}

export function getStoreScheduleStatus(
  rest: Pick<
    Restaurant,
    'isOpen' | 'businessOpenTime' | 'businessCloseTime' | 'deliveryOpenTime' | 'deliveryCloseTime'
  >,
  now: Date = new Date()
): StoreScheduleStatus {
  const businessRange = formatTimeRange(rest.businessOpenTime, rest.businessCloseTime);
  const deliveryRange = formatTimeRange(rest.deliveryOpenTime, rest.deliveryCloseTime);

  const bizWindow = isWithinTimeWindow(rest.businessOpenTime, rest.businessCloseTime, now);
  const delWindow = isWithinTimeWindow(rest.deliveryOpenTime, rest.deliveryCloseTime, now);

  const isBusinessOpenNow = rest.isOpen !== false && (bizWindow === null ? true : bizWindow);
  const isDeliveryOpenNow =
    rest.isOpen !== false && (delWindow === null ? isBusinessOpenNow : delWindow);

  return {
    businessRange,
    deliveryRange,
    isBusinessOpenNow,
    isDeliveryOpenNow,
  };
}
