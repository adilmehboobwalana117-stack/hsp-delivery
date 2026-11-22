import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Banknote,
  BellRing,
  Bike,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Headphones,
  Lock,
  MapPin,
  Phone,
  Play,
  Printer,
  RotateCcw,
  Star,
  XCircle,
} from 'lucide-react';
import { CancellationPolicies, Order, OrderStatus } from '../types';
import { formatPkr } from '../data/pakistanData';
import { downloadOrderReceipt, triggerPrintWithTitle } from '../utils/exportPrint';
import { CUSTOMER_CANCEL_REASONS, resolveCancellationPolicies } from '../utils/policies';
import { LiveTrackingMap, RouteMetrics } from './DeliveryMap';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const ORDER_STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'placed', label: 'Order Placed (Alerting Store)' },
  { key: 'confirmed', label: 'Store Accepted · Alerting Riders' },
  { key: 'preparing', label: 'Preparing & Packing Order' },
  { key: 'picked_up', label: 'Rider Picked Up (Live GPS Unlocked)' },
  { key: 'on_the_way', label: 'Rider On the Way' },
  { key: 'delivered', label: 'Delivered' },
];

const DRIVER_COMPLIMENT_TAGS = [
  'Fast Delivery',
  'Polite Rider',
  'Hot Food',
  'Accurate Pin Drop',
  'Smooth COD Change',
];

interface LiveTrackingViewProps {
  orders: Order[];
  selectedOrderId: string | null;
  canAdvanceStatus?: boolean;
  cancellationPolicies?: CancellationPolicies;
  onSelectOrder: (id: string) => void;
  onAdvanceOrderStatus: (order: Order) => Promise<void>;
  onRateDriver: (orderId: string, rating: number, review: string, tags: string[]) => Promise<void>;
  onCancelOrder?: (orderId: string, reason?: string) => Promise<void>;
  onOpenPolicy?: () => void;
  onOpenSupport?: () => void;
  onReorder?: (order: Order) => void;
}

export function LiveTrackingView({
  orders,
  selectedOrderId,
  canAdvanceStatus = false,
  cancellationPolicies,
  onSelectOrder,
  onAdvanceOrderStatus,
  onRateDriver,
  onCancelOrder,
  onOpenPolicy,
  onOpenSupport,
  onReorder,
}: LiveTrackingViewProps) {
  const policy = resolveCancellationPolicies(cancellationPolicies);
  const [routeMetrics, setRouteMetrics] = useState<RouteMetrics | null>(null);
  const [driverStars, setDriverStars] = useState(5);
  const [driverReview, setDriverReview] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>(['Fast Delivery', 'Polite Rider']);
  const [savingRating, setSavingRating] = useState(false);
  const [confirmCancelOrderId, setConfirmCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<string>(CUSTOMER_CANCEL_REASONS[0]);
  const [cancellingOrder, setCancellingOrder] = useState(false);

  const activeOrder = useMemo(() => {
    if (selectedOrderId) {
      const found = orders.find((o) => o.id === selectedOrderId);
      if (found) return found;
    }
    return orders[0] || null;
  }, [orders, selectedOrderId]);

  if (!activeOrder) {
    return (
      <div className="p-12 bg-[#0E0E14] border border-amber-500/25 rounded-2xl text-center space-y-2 shadow-xl">
        <h2 className="text-lg font-bold text-white">No Active Deliveries</h2>
        <p className="text-sm font-medium text-zinc-400">
          Place an order from Shop &amp; Order to track live status and rider GPS after pickup.
        </p>
      </div>
    );
  }

  const isRejected = activeOrder.status === 'cancelled';
  const canSeeRiderLocation =
    activeOrder.status === 'picked_up' ||
    activeOrder.status === 'on_the_way' ||
    activeOrder.status === 'delivered';

  const currentStepIndex = isRejected
    ? -1
    : Math.max(
        0,
        ORDER_STEPS.findIndex((s) => s.key === activeOrder.status)
      );

  const riderPos = {
    lat: activeOrder.riderLat ?? activeOrder.restaurantLat,
    lng: activeOrder.riderLng ?? activeOrder.restaurantLng,
  };

  // Calculate live GPS distance, ETA, and completion percentage from rider coords (unlocked after pickup)
  const totalDirectKm = haversineKm(
    activeOrder.restaurantLat,
    activeOrder.restaurantLng,
    activeOrder.deliveryLat,
    activeOrder.deliveryLng
  );
  const remainingDirectKm = haversineKm(
    canSeeRiderLocation ? riderPos.lat : activeOrder.restaurantLat,
    canSeeRiderLocation ? riderPos.lng : activeOrder.restaurantLng,
    activeOrder.deliveryLat,
    activeOrder.deliveryLng
  );
  const isDelivered = activeOrder.status === 'delivered';
  const roadRemainingKm = isDelivered ? 0 : Math.max(0.1, remainingDirectKm * 1.25);
  const computedGpsEtaMin = isDelivered
    ? 0
    : Math.max(1, Math.round((roadRemainingKm / 26) * 60));
  const progressPct = isDelivered
    ? 100
    : !canSeeRiderLocation
      ? 0
      : totalDirectKm > 0.05
        ? Math.min(
            98,
            Math.max(10, Math.round(((totalDirectKm - remainingDirectKm) / totalDirectKm) * 100))
          )
        : 18;

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleRatingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRating(true);
    try {
      await onRateDriver(activeOrder.id, driverStars, driverReview.trim(), selectedTags);
      setDriverReview('');
    } finally {
      setSavingRating(false);
    }
  };

  return (
    <div className="space-y-6 pb-28">
      {/* Order Selector Strip */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {orders.map((ord) => (
          <button
            key={ord.id}
            type="button"
            onClick={() => onSelectOrder(ord.id)}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap shrink-0 border transition-all ${
              ord.id === activeOrder.id
                ? ord.status === 'cancelled'
                  ? 'bg-rose-500 text-white border-rose-300 shadow-sm'
                  : 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 border-yellow-300 shadow-sm shadow-amber-500/20'
                : 'bg-[#0E0E14] text-zinc-300 border-zinc-800 hover:border-amber-400/50 hover:text-yellow-300'
            }`}
          >
            <span className="font-mono-tabular">{ord.orderCode}</span>
            <span className="mx-1.5 opacity-60">·</span>
            <span>{ord.restaurantName}</span>
            {ord.status === 'cancelled' && (
              <span className="ml-1.5">
                ({ord.cancelledBy === 'customer' ? 'Cancelled' : 'Rejected'})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Cancellation / Business Rejection Banner (Distinguishes Customer Cancel vs Store Rejection) */}
      {isRejected && (
        <div className="p-5 sm:p-6 rounded-2xl bg-rose-500/15 border border-rose-500/50 shadow-xl space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 text-rose-300">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h2 className="text-base font-extrabold text-white">
                {activeOrder.cancelledBy === 'customer'
                  ? `Order ${activeOrder.orderCode} Cancelled by Customer`
                  : activeOrder.cancelledBy === 'admin'
                    ? `Order ${activeOrder.orderCode} Cancelled by HSP Operations`
                    : `Order ${activeOrder.orderCode} Was Rejected by ${activeOrder.restaurantName}`}
              </h2>
            </div>
            {onOpenPolicy && (
              <button
                type="button"
                onClick={onOpenPolicy}
                className="text-xs font-extrabold text-yellow-300 hover:text-yellow-200 underline underline-offset-2"
              >
                View Cancellation Policy
              </button>
            )}
          </div>
          <p className="text-sm font-bold text-rose-200">
            {activeOrder.cancelledBy === 'customer'
              ? 'Cancellation Reason: '
              : activeOrder.cancelledBy === 'admin'
                ? 'Operations Note: '
                : 'Reason from Business Owner: '}
            <span className="text-white">
              {activeOrder.cancellationReason ||
                activeOrder.rejectionReason ||
                (activeOrder.cancelledBy === 'customer'
                  ? 'Cancelled before store acceptance (zero fee).'
                  : 'The store could not fulfill this order right now.')}
            </span>
          </p>
          <p className="text-xs font-medium text-zinc-300">
            {activeOrder.paymentMethod !== 'COD'
              ? `Because this order was paid via ${activeOrder.paymentMethod}, a full refund of ${formatPkr(activeOrder.totalPkr)} is processed within ${policy.customerRefundWindowHours} hours under our cancellation policy.`
              : `No cash charges apply. You can place a fresh order with another live store in ${activeOrder.city} from Shop & Order.`}
          </p>
        </div>
      )}

      {/* Main Split: Live Map + Status Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Live Google Map */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl overflow-hidden border border-amber-500/30 shadow-xl bg-[#0E0E14]">
            <LiveTrackingMap
              restaurantPos={{ lat: activeOrder.restaurantLat, lng: activeOrder.restaurantLng }}
              restaurantName={activeOrder.restaurantName}
              customerPos={{ lat: activeOrder.deliveryLat, lng: activeOrder.deliveryLng }}
              riderPos={riderPos}
              showRiderLocation={canSeeRiderLocation}
              travelMode="DRIVING"
              onRouteComputed={setRouteMetrics}
            />

            {/* Step 6: Clear Map Status Caption */}
            <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-950/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              {isRejected ? (
                <span className="font-bold text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Order cancelled · Store &amp; drop-off pins shown for reference
                </span>
              ) : canSeeRiderLocation ? (
                <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <Bike className="w-4 h-4" />
                  Live Rider GPS Active · Showing real-time rider location to your doorstep
                </span>
              ) : (
                <span className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Store &amp; drop-off pins shown · Live rider location unlocks after order pickup
                </span>
              )}
              <span className="font-mono-tabular text-zinc-400">
                {canSeeRiderLocation
                  ? `${roadRemainingKm.toFixed(1)} km away`
                  : `${(activeOrder.distanceKm ?? totalDirectKm * 1.25).toFixed(1)} km total route`}
              </span>
            </div>
          </div>

          {/* Live Telemetry Summary Row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 bg-[#0E0E14] border border-zinc-800 rounded-2xl shadow-lg">
              <p className="text-xs font-semibold text-zinc-400">Estimated Arrival</p>
              <p className="text-xl font-bold font-mono-tabular text-white mt-1">
                {isRejected
                  ? activeOrder.cancelledBy === 'customer'
                    ? 'Cancelled'
                    : 'Rejected'
                  : isDelivered
                    ? 'Arrived'
                    : canSeeRiderLocation
                      ? `${routeMetrics?.durationMin ?? computedGpsEtaMin} min`
                      : `~${activeOrder.etaMinutes ?? computedGpsEtaMin} min`}
              </p>
            </div>
            <div className="p-4 bg-[#0E0E14] border border-zinc-800 rounded-2xl shadow-lg">
              <p className="text-xs font-semibold text-zinc-400">Route Distance</p>
              <p className="text-xl font-bold font-mono-tabular text-white mt-1">
                {(routeMetrics?.distanceKm ?? roadRemainingKm).toFixed(1)} km
              </p>
            </div>
            <div className="p-4 bg-amber-500/10 border border-amber-500/35 rounded-2xl shadow-lg">
              <p className="text-xs font-semibold text-amber-300">
                {activeOrder.paymentMethod === 'COD'
                  ? 'Cash to Pay'
                  : `Paid (${activeOrder.paymentMethod})`}
              </p>
              <p className="text-xl font-bold font-mono-tabular text-yellow-400 mt-1">
                {formatPkr(activeOrder.totalPkr)}
              </p>
            </div>
          </div>
        </div>

        {/* Right: Order Progress, Rider Card & Driver Rating */}
        <div className="lg:col-span-5 space-y-5">
          {/* Status Timeline Card */}
          <div className="p-6 bg-[#0E0E14] border border-amber-500/30 rounded-2xl space-y-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-mono-tabular font-bold text-yellow-400">
                  {activeOrder.orderCode} · {activeOrder.city}
                </p>
                <h2 className="text-lg font-bold text-white mt-0.5">
                  {activeOrder.restaurantName}
                </h2>
              </div>
              <div className="flex items-center gap-2 shrink-0 no-print">
                <button
                  type="button"
                  onClick={() => triggerPrintWithTitle(`HSP-delivery-Receipt-${activeOrder.orderCode}`)}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-bold hover:border-amber-400 hover:text-yellow-300 transition-colors"
                  title="Print Order Receipt"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </button>
                <button
                  type="button"
                  onClick={() => downloadOrderReceipt(activeOrder)}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-bold hover:border-amber-400 hover:text-yellow-300 transition-colors"
                  title="Download Receipt"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
                {canAdvanceStatus &&
                  activeOrder.status !== 'delivered' &&
                  activeOrder.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => onAdvanceOrderStatus(activeOrder)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 transition-all shadow-sm"
                    >
                      <Play className="w-3.5 h-3.5 fill-zinc-950" />
                      Next Step
                    </button>
                  )}
              </div>
            </div>

            {/* Stage Banner or Live GPS Progress Bar (Step 6: Unlocked only after pickup) */}
            {isRejected ? (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/35 space-y-1.5">
                <p className="text-xs font-extrabold text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  {activeOrder.cancelledBy === 'customer'
                    ? 'Cancelled by Customer (No Charge)'
                    : activeOrder.cancelledBy === 'admin'
                      ? 'Cancelled by HSP Operations'
                      : 'Rejected / Cancelled by Business Owner'}
                </p>
                <p className="text-xs font-semibold text-white">
                  {activeOrder.cancellationReason ||
                    activeOrder.rejectionReason ||
                    'Order cancelled.'}
                </p>
              </div>
            ) : !canSeeRiderLocation ? (
              <div className="p-4 rounded-xl bg-zinc-900/90 border border-amber-500/30 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-yellow-300 flex items-center gap-1.5">
                    {activeOrder.status === 'placed' ? (
                      <BellRing className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Lock className="w-4 h-4 text-amber-400" />
                    )}
                    {activeOrder.status === 'placed'
                      ? 'Waiting for Store Owner Response'
                      : !activeOrder.riderId
                        ? 'Store Accepted · Alerting All Available Riders'
                        : 'Rider Assigned · Heading to Store for Pickup'}
                  </span>
                </div>
                <p className="text-xs font-medium text-zinc-300 leading-relaxed">
                  {activeOrder.status === 'placed'
                    ? `${activeOrder.restaurantName} is receiving an alert bell every 15 seconds until they accept or respond.`
                    : !activeOrder.riderId
                      ? 'All available HSP riders are receiving a dispatch bell every 15 seconds until a rider accepts your order.'
                      : `${activeOrder.riderName} accepted your order and is picking it up from ${activeOrder.restaurantName}. Live rider GPS will unlock as soon as pickup is confirmed.`}
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-zinc-900/90 border border-emerald-500/35 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <Bike className="w-4 h-4 text-yellow-400" />
                    Live Rider GPS Location Unlocked
                  </span>
                  <span className="font-mono-tabular text-xs font-bold text-yellow-400">
                    {isDelivered
                      ? 'Arrived · 100%'
                      : `${computedGpsEtaMin} min ETA · ${progressPct}%`}
                  </span>
                </div>

                <div
                  className="relative h-2.5 w-full rounded-full bg-zinc-800 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={progressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Live rider GPS delivery progress"
                >
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-yellow-300"
                    initial={false}
                    animate={{ width: `${progressPct}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] font-mono-tabular text-zinc-400">
                  <span>
                    {isDelivered
                      ? '0.00 km remaining'
                      : `${roadRemainingKm.toFixed(2)} km to destination`}
                  </span>
                  <span>
                    Rider {riderPos.lat.toFixed(4)}, {riderPos.lng.toFixed(4)} → Drop{' '}
                    {activeOrder.deliveryLat.toFixed(4)}, {activeOrder.deliveryLng.toFixed(4)}
                  </span>
                </div>
              </div>
            )}

            {/* Animated Order Status Progress Steps */}
            {!isRejected && (
              <ol className="relative space-y-2.5">
                {ORDER_STEPS.map((step, idx) => {
                  const completed = idx < currentStepIndex;
                  const isCurrent = idx === currentStepIndex;
                  const isDoneAll = isCurrent && activeOrder.status === 'delivered';

                  return (
                    <motion.li
                      key={step.key}
                      layout
                      animate={{
                        backgroundColor: isCurrent
                          ? isDoneAll
                            ? 'rgba(16, 185, 129, 0.12)'
                            : 'rgba(245, 158, 11, 0.12)'
                          : 'rgba(14, 14, 20, 0)',
                        borderColor: isCurrent
                          ? isDoneAll
                            ? 'rgba(16, 185, 129, 0.45)'
                            : 'rgba(250, 204, 21, 0.45)'
                          : 'rgba(255, 255, 255, 0)',
                      }}
                      transition={{ duration: 0.35, ease: 'easeOut' }}
                      className="flex items-center justify-between gap-3 px-2.5 py-2 rounded-xl border"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative flex items-center justify-center w-7 h-7 shrink-0">
                          {isCurrent && !isDoneAll && (
                            <motion.span
                              key={`pulse-${activeOrder.id}-${step.key}`}
                              className="absolute inset-0 rounded-full bg-yellow-400/40"
                              initial={{ scale: 0.85, opacity: 0.85 }}
                              animate={{
                                scale: [1, 1.7, 1],
                                opacity: [0.8, 0, 0.8],
                              }}
                              transition={{
                                duration: 1.8,
                                repeat: Infinity,
                                ease: 'easeInOut',
                              }}
                            />
                          )}

                          <motion.div
                            key={`dot-${activeOrder.id}-${step.key}-${isCurrent ? 'active' : completed ? 'done' : 'todo'}`}
                            initial={isCurrent ? { scale: 0.7 } : false}
                            animate={
                              isCurrent && !isDoneAll
                                ? { scale: [1, 1.1, 1] }
                                : { scale: 1 }
                            }
                            transition={
                              isCurrent && !isDoneAll
                                ? {
                                    scale: {
                                      duration: 1.8,
                                      repeat: Infinity,
                                      ease: 'easeInOut',
                                    },
                                  }
                                : { type: 'spring', stiffness: 320, damping: 22 }
                            }
                            className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold transition-colors duration-300 ${
                              isDoneAll
                                ? 'bg-emerald-500 text-zinc-950 shadow-sm shadow-emerald-500/30'
                                : isCurrent
                                  ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 shadow-sm shadow-amber-500/40'
                                  : completed
                                    ? 'bg-emerald-500 text-zinc-950'
                                    : 'bg-zinc-900 text-zinc-500 border border-zinc-700'
                            }`}
                          >
                            {completed || isDoneAll ? (
                              <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.8]" />
                            ) : (
                              idx + 1
                            )}
                          </motion.div>
                        </div>

                        <span
                          className={`text-sm transition-colors duration-300 ${
                            isDoneAll
                              ? 'font-bold text-emerald-400'
                              : isCurrent
                                ? 'font-bold text-yellow-300'
                                : completed
                                  ? 'font-semibold text-white'
                                  : 'font-medium text-zinc-500'
                          }`}
                        >
                          {step.label}
                        </span>
                      </div>

                      {isCurrent && (
                        <motion.span
                          initial={{ opacity: 0, x: 6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3 }}
                          className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            isDoneAll
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-amber-500/20 text-yellow-300'
                          }`}
                        >
                          {isDoneAll ? 'Complete' : 'Active'}
                        </motion.span>
                      )}
                    </motion.li>
                  );
                })}
              </ol>
            )}

            {/* Delivery Address, Items, Distance Fee, Tip & Payment */}
            <div className="pt-4 border-t border-zinc-800 space-y-2.5 text-xs text-zinc-300">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                <span className="font-medium text-zinc-200">{activeOrder.deliveryAddress}</span>
              </div>
              <div className="flex items-center gap-2">
                <Banknote className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-medium">
                  {activeOrder.paymentMethod === 'COD'
                    ? 'Cash on Delivery — Pay rider in PKR upon arrival'
                    : `Paid via ${activeOrder.paymentMethod} (${activeOrder.paymentRef || 'Verified'})`}
                </span>
              </div>
              <div className="pt-2 border-t border-zinc-800 space-y-1">
                {activeOrder.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs font-semibold text-zinc-300">
                    <span>{item.quantity}× {item.name}</span>
                    <span className="font-mono-tabular">{formatPkr(item.pricePkr * item.quantity)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-400 pt-1">
                  <span>
                    Delivery Fee ({(activeOrder.distanceKm ?? 3).toFixed(1)} km)
                  </span>
                  <span className="font-mono-tabular text-amber-300">
                    {formatPkr(activeOrder.deliveryFeePkr)}
                  </span>
                </div>
                {(activeOrder.tipPkr ?? 0) > 0 && (
                  <div className="flex items-center justify-between text-xs font-semibold text-emerald-400">
                    <span>Rider Tip</span>
                    <span className="font-mono-tabular">+{formatPkr(activeOrder.tipPkr || 0)}</span>
                  </div>
                )}
              </div>

              {/* Customer Cancellation Policy & Self-Cancel Controls */}
              <div className="pt-3 border-t border-zinc-800 space-y-2.5 no-print">
                {activeOrder.status === 'placed' &&
                  policy.customerFreeCancelBeforeAccept &&
                  onCancelOrder && (
                    confirmCancelOrderId === activeOrder.id ? (
                      <div className="p-3.5 rounded-xl bg-rose-500/12 border border-rose-500/40 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-extrabold text-rose-200">
                            Free Cancellation · Order {activeOrder.orderCode}
                          </p>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                            Rs. 0 Fee
                          </span>
                        </div>
                        <p className="text-[11px] font-medium text-zinc-300">
                          Select a reason below. Because {activeOrder.restaurantName} has not accepted
                          yet, you will not be charged.
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {CUSTOMER_CANCEL_REASONS.map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setCancelReason(preset)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                                cancelReason === preset
                                  ? 'bg-rose-500 text-white border-rose-300'
                                  : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:border-rose-400'
                              }`}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          maxLength={240}
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="Or write your cancellation reason..."
                          className="w-full px-3 py-2 text-xs font-semibold rounded-lg bg-zinc-950 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-rose-400"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={cancellingOrder}
                            onClick={async () => {
                              setCancellingOrder(true);
                              try {
                                await onCancelOrder(
                                  activeOrder.id,
                                  cancelReason.trim() || 'Cancelled by customer before store accepted'
                                );
                                setConfirmCancelOrderId(null);
                              } finally {
                                setCancellingOrder(false);
                              }
                            }}
                            className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-extrabold disabled:opacity-50"
                          >
                            {cancellingOrder ? 'Cancelling...' : 'Confirm Free Cancellation'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmCancelOrderId(null)}
                            className="px-3 py-1.5 min-h-[38px] rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-bold hover:text-white"
                          >
                            Keep Order
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setCancelReason(CUSTOMER_CANCEL_REASONS[0]);
                          setConfirmCancelOrderId(activeOrder.id);
                        }}
                        className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/35 text-rose-300 text-xs font-extrabold hover:bg-rose-500/20 inline-flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        Cancel Order Free (Before Store Accepts)
                      </button>
                    )
                  )}

                {/* Policy Status Banner once order is accepted / preparing / picked up */}
                {activeOrder.status !== 'placed' &&
                  activeOrder.status !== 'delivered' &&
                  activeOrder.status !== 'cancelled' && (
                    <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-extrabold text-amber-300 inline-flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5" />
                          Cancellation Window Closed
                        </span>
                        {onOpenPolicy && (
                          <button
                            type="button"
                            onClick={onOpenPolicy}
                            className="text-[11px] font-bold text-yellow-400 hover:underline"
                          >
                            View Policy
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] font-medium text-zinc-400 leading-relaxed">
                        {canSeeRiderLocation
                          ? 'Your order has been picked up by the rider and cannot be cancelled.'
                          : `The store has already accepted your order. Contact HSP Support for urgent changes${
                              policy.customerLateCancelFeePkr > 0
                                ? ` (late cancellation fee up to ${formatPkr(policy.customerLateCancelFeePkr)} may apply)`
                                : ''
                            }.`}
                      </p>
                    </div>
                  )}

                <div className="flex flex-wrap items-center gap-2">
                  {onOpenPolicy && (
                    <button
                      type="button"
                      onClick={onOpenPolicy}
                      className="min-h-[40px] px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-bold hover:border-amber-400 hover:text-yellow-300 inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-400" />
                      Cancellation Policy
                    </button>
                  )}
                  {onOpenSupport && (
                    <button
                      type="button"
                      onClick={onOpenSupport}
                      className="flex-1 min-h-[40px] px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-bold hover:border-amber-400 hover:text-yellow-300 inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Headphones className="w-3.5 h-3.5 text-yellow-400" />
                      Need Help with This Order?
                    </button>
                  )}
                  {activeOrder.status === 'delivered' &&
                    activeOrder.orderSource !== 'whatsapp' &&
                    onReorder && (
                      <button
                        type="button"
                        onClick={() => onReorder(activeOrder)}
                        className="flex-1 min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-400/45 text-yellow-300 text-xs font-extrabold hover:bg-amber-500/25 inline-flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Order Again
                      </button>
                    )}
                </div>
              </div>
            </div>
          </div>

          {/* Assigned Rider Card (Shown once a rider accepts in Step 4) */}
          {!isRejected && (
            <div className="p-5 bg-[#0E0E14] border border-amber-500/25 rounded-2xl flex items-center justify-between gap-4 shadow-xl">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/35 text-yellow-400 flex items-center justify-center shrink-0">
                  <Bike className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-zinc-400">Assigned HSP Rider</p>
                  {activeOrder.riderId && activeOrder.riderName ? (
                    <>
                      <p className="text-sm font-bold text-white truncate">
                        {activeOrder.riderName}
                      </p>
                      <p className="text-xs font-mono-tabular text-amber-400">
                        {activeOrder.riderPhone || 'Rider contact active'}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-zinc-200">
                        {activeOrder.status === 'placed'
                          ? 'Awaiting Store Acceptance'
                          : 'Notifying Available Riders...'}
                      </p>
                      <p className="text-xs text-zinc-400">
                        Rider name &amp; phone appear as soon as a rider accepts
                      </p>
                    </>
                  )}
                </div>
              </div>
              {activeOrder.riderId && activeOrder.riderPhone && (
                <a
                  href={`tel:${activeOrder.riderPhone.replace(/\s+/g, '')}`}
                  className="min-w-[44px] min-h-[44px] rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 flex items-center justify-center hover:brightness-105 transition-all shrink-0 shadow-sm"
                  aria-label="Call rider"
                >
                  <Phone className="w-4 h-4 stroke-[2.5]" />
                </a>
              )}
            </div>
          )}

          {/* Driver Rating System (Only when rider assigned / delivered) */}
          {!isRejected && activeOrder.riderId && (
            <div className="p-6 bg-[#0E0E14] border border-zinc-800 rounded-2xl space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">Rate Your Rider</h3>
                <Clock className="w-4 h-4 text-amber-400" />
              </div>

              {activeOrder.driverRating ? (
                <div className="space-y-2 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <div className="flex items-center gap-1.5 text-sm font-bold text-emerald-400">
                    <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    <span className="font-mono-tabular">{activeOrder.driverRating.toFixed(1)} / 5.0</span>
                    <span className="font-semibold text-emerald-300">· Rating submitted</span>
                  </div>
                  {activeOrder.driverReview && (
                    <p className="text-xs font-medium text-zinc-200">{activeOrder.driverReview}</p>
                  )}
                  {activeOrder.driverTags && activeOrder.driverTags.length > 0 && (
                    <p className="text-xs font-semibold text-emerald-400">
                      {activeOrder.driverTags.join(' · ')}
                    </p>
                  )}
                </div>
              ) : (
                <form onSubmit={handleRatingSubmit} className="space-y-3.5">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setDriverStars(star)}
                        className="p-1.5 rounded-lg hover:bg-zinc-900"
                      >
                        <Star
                          className={`w-6 h-6 ${
                            star <= driverStars ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-600'
                          }`}
                        />
                      </button>
                    ))}
                    <span className="ml-2 text-xs font-mono-tabular font-bold text-amber-300">
                      {driverStars}.0 stars
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {DRIVER_COMPLIMENT_TAGS.map((tag) => {
                      const active = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            active
                              ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 border-yellow-300 font-extrabold'
                              : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-amber-400/60'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>

                  <textarea
                    rows={2}
                    value={driverReview}
                    onChange={(e) => setDriverReview(e.target.value)}
                    placeholder="Optional feedback for your rider..."
                    className="w-full px-3 py-2 text-sm font-medium rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
                  />

                  <button
                    type="submit"
                    disabled={savingRating}
                    className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-sm font-extrabold hover:brightness-105 disabled:opacity-50 transition-all shadow-sm"
                  >
                    {savingRating ? 'Saving Rating...' : 'Submit Driver Rating'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
