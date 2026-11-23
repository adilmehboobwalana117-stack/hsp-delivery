import { AppSettings, CancellationPolicies } from '../types';

export const DEFAULT_CANCELLATION_POLICIES: CancellationPolicies = {
  customerFreeCancelBeforeAccept: true,
  customerLateCancelFeePkr: 50,
  customerRefundWindowHours: 24,
  customerPolicyRules: [
    '1. Free Cancellation Before Store Accepts: Customers can cancel any order for free with zero charges while the order is in "Order Placed" status (before the business owner accepts it).',
    '2. After Store Acceptance / Preparation: Once the business owner accepts or starts preparing your order, self-cancellation is locked to prevent food/item waste. Contact HSP Support immediately for emergency changes; a cancellation fee may apply.',
    '3. After Rider Pickup: Orders that have already been picked up by an HSP rider cannot be cancelled. Refusing delivery at the doorstep on COD orders may lead to COD restrictions on the account.',
    '4. Prepaid Refunds (JazzCash / EasyPaisa / Card): Approved cancellations or store rejections on prepaid orders are refunded in full to the original payment method within the stated refund window.',
    '5. WhatsApp Orders: Custom WhatsApp orders can be cancelled free of charge before Admin confirmation and rider dispatch.',
  ].join('\n'),
  businessResponseSlaMinutes: 5,
  businessMaxMonthlyCancellations: 3,
  businessCancelPenaltyPkr: 150,
  businessPolicyRules: [
    '1. Timely Order Response: Business owners must accept or reject incoming orders within the response window so customers are not kept waiting.',
    '2. Mandatory Rejection Reason: If an item is unavailable or the store is busy, the owner must select or write a clear rejection reason — this reason is sent directly to the customer.',
    '3. Keep Menu & Store Hours Updated: Frequently rejecting orders due to out-of-stock items or closed hours violates partner standards. Mark unavailable items offline immediately.',
    '4. Post-Acceptance Cancellation Restriction: Once an order is accepted, businesses should not cancel unless there is a genuine emergency and strictly before rider pickup. Unjustified cancellations after acceptance may incur a partner penalty deducted from monthly payouts.',
    '5. Monthly Threshold & Account Review: Exceeding the monthly cancellation/rejection allowance may result in reduced marketplace visibility or temporary store pause pending Admin review.',
  ].join('\n'),
};

export const CUSTOMER_CANCEL_REASONS: string[] = [
  'Changed my mind',
  'Ordered by mistake',
  'Wrong delivery address or pin',
  'Need to modify items',
  'Store taking too long to respond',
];

export const BUSINESS_EMERGENCY_CANCEL_REASONS: string[] = [
  'Key ingredient / item suddenly ran out',
  'Kitchen / store equipment emergency',
  'Unable to prepare within safe quality standards',
  'Store forced to close unexpectedly',
];

export function resolveCancellationPolicies(
  settings?: Partial<AppSettings> | null
): CancellationPolicies {
  const num = (val: unknown, fallback: number, min: number, max: number) => {
    const n = Number(val);
    if (!Number.isFinite(n) || n < min || n > max) return fallback;
    return Math.round(n);
  };

  const customerRules =
    typeof settings?.customerPolicyRules === 'string' &&
    settings.customerPolicyRules.trim().length >= 10
      ? settings.customerPolicyRules.trim()
      : DEFAULT_CANCELLATION_POLICIES.customerPolicyRules;

  const businessRules =
    typeof settings?.businessPolicyRules === 'string' &&
    settings.businessPolicyRules.trim().length >= 10
      ? settings.businessPolicyRules.trim()
      : DEFAULT_CANCELLATION_POLICIES.businessPolicyRules;

  return {
    customerFreeCancelBeforeAccept:
      typeof settings?.customerFreeCancelBeforeAccept === 'boolean'
        ? settings.customerFreeCancelBeforeAccept
        : DEFAULT_CANCELLATION_POLICIES.customerFreeCancelBeforeAccept,
    customerLateCancelFeePkr: num(
      settings?.customerLateCancelFeePkr,
      DEFAULT_CANCELLATION_POLICIES.customerLateCancelFeePkr,
      0,
      5000
    ),
    customerRefundWindowHours: num(
      settings?.customerRefundWindowHours,
      DEFAULT_CANCELLATION_POLICIES.customerRefundWindowHours,
      1,
      168
    ),
    customerPolicyRules: customerRules,
    businessResponseSlaMinutes: num(
      settings?.businessResponseSlaMinutes,
      DEFAULT_CANCELLATION_POLICIES.businessResponseSlaMinutes,
      1,
      60
    ),
    businessMaxMonthlyCancellations: num(
      settings?.businessMaxMonthlyCancellations,
      DEFAULT_CANCELLATION_POLICIES.businessMaxMonthlyCancellations,
      1,
      50
    ),
    businessCancelPenaltyPkr: num(
      settings?.businessCancelPenaltyPkr,
      DEFAULT_CANCELLATION_POLICIES.businessCancelPenaltyPkr,
      0,
      10000
    ),
    businessPolicyRules: businessRules,
  };
}

export function splitPolicyLines(rulesText: string): string[] {
  return rulesText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function isValidAndroidPackageName(pkg: string): boolean {
  return /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i.test(pkg.trim());
}

export function isValidSha256Fingerprint(fp: string): boolean {
  return /^([0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$/.test(fp.trim());
}

export function buildAssetLinksJson(packageName: string, sha256Fingerprint: string): string {
  const pkg = packageName.trim() || 'hspdeliverypk.com';
  const fp =
    sha256Fingerprint.trim().toUpperCase() ||
    '00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00';
  return JSON.stringify(
    [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: pkg,
          sha256_cert_fingerprints: [fp],
        },
      },
    ],
    null,
    2
  );
}
