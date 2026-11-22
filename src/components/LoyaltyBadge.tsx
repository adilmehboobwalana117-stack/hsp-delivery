import { Award } from 'lucide-react';
import { LoyaltyTierInfo } from '../utils/loyalty';

interface LoyaltyBadgeProps {
  tier: LoyaltyTierInfo;
  completedOrders: number;
  size?: 'sm' | 'md';
}

export function LoyaltyBadge({ tier, completedOrders, size = 'sm' }: LoyaltyBadgeProps) {
  return (
    <span
      title={`${tier.label} Member · ${completedOrders} completed order${completedOrders === 1 ? '' : 's'} · ${tier.perk}`}
      className={`inline-flex items-center gap-1 rounded-md border font-extrabold tracking-wide whitespace-nowrap shrink-0 ${
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      } ${tier.badgeClass}`}
    >
      <Award className={`${size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} ${tier.iconClass}`} />
      {tier.label}
    </span>
  );
}
