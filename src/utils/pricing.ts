import { AppSettings, DeliveryRates, LatLng } from '../types';

export const DEFAULT_DELIVERY_RATES: DeliveryRates = {
  customerBaseKm: 3,
  customerBaseFeePkr: 80,
  customerExtraPerKmPkr: 20,
  riderBaseKm: 3,
  riderBasePayPkr: 50,
  riderExtraPerKmPkr: 15,
};

function sanitizeKm(val: unknown, fallback: number): number {
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0.5 || num > 50) return fallback;
  return Number(num.toFixed(1));
}

function sanitizePkr(val: unknown, fallback: number, max: number): number {
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0 || num > max) return fallback;
  return Math.round(num);
}

/**
 * Resolves live Admin-configured delivery rates from AppSettings with safe defaults.
 */
export function resolveDeliveryRates(
  settings?: Partial<AppSettings | DeliveryRates> | null
): DeliveryRates {
  if (!settings) return DEFAULT_DELIVERY_RATES;
  return {
    customerBaseKm: sanitizeKm(settings.customerBaseKm, DEFAULT_DELIVERY_RATES.customerBaseKm),
    customerBaseFeePkr: sanitizePkr(
      settings.customerBaseFeePkr,
      DEFAULT_DELIVERY_RATES.customerBaseFeePkr,
      50000
    ),
    customerExtraPerKmPkr: sanitizePkr(
      settings.customerExtraPerKmPkr,
      DEFAULT_DELIVERY_RATES.customerExtraPerKmPkr,
      10000
    ),
    riderBaseKm: sanitizeKm(settings.riderBaseKm, DEFAULT_DELIVERY_RATES.riderBaseKm),
    riderBasePayPkr: sanitizePkr(
      settings.riderBasePayPkr,
      DEFAULT_DELIVERY_RATES.riderBasePayPkr,
      50000
    ),
    riderExtraPerKmPkr: sanitizePkr(
      settings.riderExtraPerKmPkr,
      DEFAULT_DELIVERY_RATES.riderExtraPerKmPkr,
      10000
    ),
  };
}

/**
 * Great-circle Haversine distance in kilometers between two GPS coordinates.
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Estimates urban road distance (km) between a store/restaurant and customer drop-off pin.
 */
export function calculateRoadDistanceKm(origin: LatLng, destination: LatLng): number {
  const direct = haversineDistanceKm(origin.lat, origin.lng, destination.lat, destination.lng);
  return Math.max(0.5, Number((direct * 1.2).toFixed(1)));
}

/**
 * Customer Delivery Charge Policy (PKR, Admin-configurable):
 * Default: Rs. 80 within 3 km + Rs. 20 per additional km.
 */
export function calculateCustomerDeliveryFeePkr(
  distanceKm: number,
  rates?: Partial<DeliveryRates> | null
): number {
  const r = resolveDeliveryRates(rates);
  const safeDist = Math.max(0, Number.isFinite(distanceKm) ? distanceKm : 0);
  if (safeDist <= r.customerBaseKm) return r.customerBaseFeePkr;
  return Math.round(r.customerBaseFeePkr + (safeDist - r.customerBaseKm) * r.customerExtraPerKmPkr);
}

/**
 * Rider Delivery Wallet Earning Policy (PKR, Admin-configurable):
 * Default: Rs. 50 within 3 km + Rs. 15 per additional km.
 */
export function calculateRiderDeliveryEarningPkr(
  distanceKm: number,
  rates?: Partial<DeliveryRates> | null
): number {
  const r = resolveDeliveryRates(rates);
  const safeDist = Math.max(0, Number.isFinite(distanceKm) ? distanceKm : 0);
  if (safeDist <= r.riderBaseKm) return r.riderBasePayPkr;
  return Math.round(r.riderBasePayPkr + (safeDist - r.riderBaseKm) * r.riderExtraPerKmPkr);
}

export function formatCustomerRateSummary(rates?: Partial<DeliveryRates> | null): string {
  const r = resolveDeliveryRates(rates);
  return `Rs. ${r.customerBaseFeePkr} within ${r.customerBaseKm} km (+Rs. ${r.customerExtraPerKmPkr}/km)`;
}

export function formatRiderRateSummary(rates?: Partial<DeliveryRates> | null): string {
  const r = resolveDeliveryRates(rates);
  return `Rs. ${r.riderBasePayPkr} up to ${r.riderBaseKm} km + Rs. ${r.riderExtraPerKmPkr}/km beyond ${r.riderBaseKm} km`;
}
