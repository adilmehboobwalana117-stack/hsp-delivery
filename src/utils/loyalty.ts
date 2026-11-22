export type LoyaltyTierId = 'bronze' | 'silver' | 'gold';

export interface LoyaltyTierInfo {
  id: LoyaltyTierId;
  label: string;
  minOrders: number;
  nextTierLabel: string | null;
  nextTierTarget: number | null;
  ordersToNext: number;
  progressPct: number;
  perk: string;
  badgeClass: string;
  iconClass: string;
}

export function getLoyaltyTier(completedOrders: number): LoyaltyTierInfo {
  const count = Math.max(0, Math.floor(completedOrders));

  if (count >= 6) {
    return {
      id: 'gold',
      label: 'Gold',
      minOrders: 6,
      nextTierLabel: null,
      nextTierTarget: null,
      ordersToNext: 0,
      progressPct: 100,
      perk: 'Priority Hasilpur Dispatch & VIP Gold Perks',
      badgeClass: 'bg-amber-500/20 border-yellow-400/60 text-yellow-300',
      iconClass: 'text-yellow-300',
    };
  }

  if (count >= 3) {
    const ordersToNext = 6 - count;
    const progressPct = Math.round(((count - 3) / 3) * 100);
    return {
      id: 'silver',
      label: 'Silver',
      minOrders: 3,
      nextTierLabel: 'Gold',
      nextTierTarget: 6,
      ordersToNext,
      progressPct: Math.max(15, progressPct),
      perk: 'Priority Rider Dispatch & Special Deals',
      badgeClass: 'bg-zinc-800 border-zinc-600 text-zinc-200',
      iconClass: 'text-zinc-300',
    };
  }

  const ordersToNext = 3 - count;
  const progressPct = Math.round((count / 3) * 100);
  return {
    id: 'bronze',
    label: 'Bronze',
    minOrders: 0,
    nextTierLabel: 'Silver',
    nextTierTarget: 3,
    ordersToNext,
    progressPct: Math.max(12, progressPct),
    perk: 'Earn Tier Progress on Every Completed Order',
    badgeClass: 'bg-amber-950/60 border-amber-600/50 text-amber-300',
    iconClass: 'text-amber-400',
  };
}
