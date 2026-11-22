import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  BellRing,
  Bike,
  Building2,
  Camera,
  CheckCircle2,
  Clock,
  Compass,
  Loader2,
  Lock,
  MapPin,
  MessageCircle,
  Navigation,
  Pause,
  Phone,
  Play,
  RefreshCw,
  Route,
  ShieldCheck,
  Store,
  Trash2,
  User,
  Wallet,
} from 'lucide-react';
import { DeliveryRates, Order, OrderStatus, Restaurant, Rider } from '../types';
import { formatPkr } from '../data/pakistanData';
import {
  calculateRiderDeliveryEarningPkr,
  calculateRoadDistanceKm,
  formatRiderRateSummary,
  resolveDeliveryRates,
} from '../utils/pricing';
import { compressDeliveryProofPhoto } from '../utils/sound';
import { LiveTrackingMap, RouteMetrics } from './DeliveryMap';
import { RiderEarningsTab } from './RiderEarningsTab';

interface RiderNavigationViewProps {
  orders: Order[];
  riders: Rider[];
  restaurants: Restaurant[];
  deliveryRates?: DeliveryRates;
  selectedOrderId?: string | null;
  lockedRiderId?: string | null;
  riderBellCountdown?: number | null;
  onAcceptOrder: (orderId: string, rider: Rider) => Promise<void>;
  onUpdateRiderLocation: (orderId: string, lat: number, lng: number, etaMin: number) => Promise<void>;
  onUpdateOrderDistance?: (orderId: string, distanceKm: number) => Promise<void>;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  onCompleteDeliveryWithProof?: (
    orderId: string,
    proof?: { photoDataUrl: string; capturedAt: string }
  ) => Promise<void>;
  onMarkPaidToOffice: (orderId: string) => Promise<void>;
  onMarkWhatsAppAmountAlreadyPaid?: (orderId: string) => Promise<void>;
}

export function RiderNavigationView({
  orders,
  riders,
  restaurants,
  deliveryRates,
  selectedOrderId: externalSelectedOrderId,
  lockedRiderId,
  riderBellCountdown = null,
  onAcceptOrder,
  onUpdateRiderLocation,
  onUpdateOrderDistance,
  onUpdateOrderStatus,
  onCompleteDeliveryWithProof,
  onMarkPaidToOffice,
  onMarkWhatsAppAmountAlreadyPaid,
}: RiderNavigationViewProps) {
  const rates = resolveDeliveryRates(deliveryRates);
  const [riderSubTab, setRiderSubTab] = useState<'dispatch' | 'earnings'>('dispatch');
  const [settlingOrderId, setSettlingOrderId] = useState<string | null>(null);
  const [markingWaPaidOrderId, setMarkingWaPaidOrderId] = useState<string | null>(null);
  const [proofDraft, setProofDraft] = useState<{ photoDataUrl: string; capturedAt: string } | null>(
    null
  );
  const [compressingProof, setCompressingProof] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const [completingDelivery, setCompletingDelivery] = useState(false);
  const proofInputRef = useRef<HTMLInputElement | null>(null);

  // Step 3: Only orders already accepted by the Business Owner (confirmed / preparing) broadcast to riders
  const unassignedOrders = useMemo(
    () =>
      orders.filter(
        (o) => !o.riderId && (o.status === 'confirmed' || o.status === 'preparing')
      ),
    [orders]
  );

  const acceptedDeliveries = useMemo(
    () =>
      orders.filter((o) => {
        if (!o.riderId || o.status === 'delivered' || o.status === 'cancelled') return false;
        if (lockedRiderId && o.riderId !== lockedRiderId) return false;
        return true;
      }),
    [orders, lockedRiderId]
  );

  const availableRiders = useMemo(
    () => riders.filter((r) => r.status === 'available'),
    [riders]
  );

  const [selectedOrderId, setSelectedOrderId] = useState<string>(
    externalSelectedOrderId || acceptedDeliveries[0]?.id || ''
  );
  const [actingRiderId, setActingRiderId] = useState<string>(
    lockedRiderId || availableRiders[0]?.id || riders[0]?.id || ''
  );
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [travelMode, setTravelMode] = useState<'TWO_WHEELER' | 'DRIVING'>('TWO_WHEELER');
  const [routeMetrics, setRouteMetrics] = useState<RouteMetrics | null>(null);
  const [gpsActive, setGpsActive] = useState(false);

  useEffect(() => {
    if (lockedRiderId) {
      setActingRiderId(lockedRiderId);
    }
  }, [lockedRiderId]);

  const activeRider =
    riders.find((r) => r.id === (lockedRiderId || actingRiderId)) ||
    availableRiders[0] ||
    riders[0] ||
    null;

  const onlinePaidOrders = useMemo(
    () =>
      orders.filter((o) => {
        const isOnlinePaid = o.paymentMethod !== 'COD' || o.paymentStatus === 'paid';
        if (!isOnlinePaid || o.status === 'cancelled') return false;
        if (lockedRiderId) return o.riderId === lockedRiderId;
        return !activeRider || !o.riderId || o.riderId === activeRider.id;
      }),
    [orders, lockedRiderId, activeRider]
  );

  // Completed WhatsApp orders for this rider (Step 5: Amount Already Paid option applies ONLY to WhatsApp orders)
  const completedWhatsAppOrders = useMemo(
    () =>
      orders.filter((o) => {
        if (o.orderSource !== 'whatsapp' || o.status !== 'delivered') return false;
        if (lockedRiderId) return o.riderId === lockedRiderId;
        return !activeRider || o.riderId === activeRider.id;
      }),
    [orders, lockedRiderId, activeRider]
  );

  // Only Cash on Delivery orders that aren't already paid online or marked already paid on WhatsApp add to rider cash-in-hand
  const riderCashSummary = useMemo(() => {
    const codOrders = acceptedDeliveries.filter(
      (o) =>
        o.paymentMethod === 'COD' &&
        o.paymentStatus !== 'paid' &&
        !o.whatsappAmountAlreadyPaid
    );
    const prepaidOrders = acceptedDeliveries.filter(
      (o) =>
        o.paymentMethod !== 'COD' ||
        o.paymentStatus === 'paid' ||
        Boolean(o.whatsappAmountAlreadyPaid)
    );
    return {
      cashToCollectPkr: codOrders.reduce((sum, o) => sum + o.totalPkr, 0),
      codCount: codOrders.length,
      prepaidCount: prepaidOrders.length,
    };
  }, [acceptedDeliveries]);

  const handleMarkOfficeSettled = async (orderId: string) => {
    setSettlingOrderId(orderId);
    try {
      await onMarkPaidToOffice(orderId);
    } finally {
      setSettlingOrderId(null);
    }
  };

  const handleMarkWaAlreadyPaid = async (orderId: string) => {
    if (!onMarkWhatsAppAmountAlreadyPaid) return;
    setMarkingWaPaidOrderId(orderId);
    try {
      await onMarkWhatsAppAmountAlreadyPaid(orderId);
    } finally {
      setMarkingWaPaidOrderId(null);
    }
  };

  useEffect(() => {
    if (
      externalSelectedOrderId &&
      externalSelectedOrderId !== selectedOrderId &&
      acceptedDeliveries.some((o) => o.id === externalSelectedOrderId)
    ) {
      setSelectedOrderId(externalSelectedOrderId);
      setRiderSubTab('dispatch');
    }
  }, [externalSelectedOrderId, selectedOrderId, acceptedDeliveries]);

  const currentJob =
    acceptedDeliveries.find((o) => o.id === selectedOrderId) || acceptedDeliveries[0] || null;

  const isPhotoProofRequired = Boolean(
    currentJob &&
      (currentJob.orderSource === 'whatsapp' ||
        currentJob.paymentMethod !== 'COD' ||
        currentJob.paymentStatus === 'paid' ||
        Boolean(currentJob.whatsappAmountAlreadyPaid))
  );

  // Reset captured proof draft whenever rider switches to a different active delivery
  useEffect(() => {
    setProofDraft(null);
    setProofError(null);
    setCompressingProof(false);
    if (proofInputRef.current) {
      proofInputRef.current.value = '';
    }
  }, [currentJob?.id]);

  const handleSelectProofFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProofError('Please choose a valid photo from your camera or gallery.');
      return;
    }
    setCompressingProof(true);
    setProofError(null);
    try {
      const photoDataUrl = await compressDeliveryProofPhoto(file);
      setProofDraft({
        photoDataUrl,
        capturedAt: new Date().toISOString(),
      });
    } catch (err) {
      setProofError(
        err instanceof Error ? err.message : 'Could not process the photo. Please retake.'
      );
    } finally {
      setCompressingProof(false);
    }
  };

  const handleConfirmDelivered = async () => {
    if (!currentJob || completingDelivery || compressingProof) return;
    if (isPhotoProofRequired && !proofDraft) {
      setProofError('A delivery photo is required before completing this prepaid or WhatsApp order.');
      return;
    }
    setCompletingDelivery(true);
    setProofError(null);
    setGpsActive(false);
    try {
      if (onCompleteDeliveryWithProof) {
        await onCompleteDeliveryWithProof(currentJob.id, proofDraft ?? undefined);
      } else {
        await onUpdateOrderStatus(currentJob.id, 'delivered');
      }
      setProofDraft(null);
    } catch (err) {
      setProofError(
        err instanceof Error
          ? err.message
          : 'Failed to upload delivery proof. Please try again.'
      );
    } finally {
      setCompletingDelivery(false);
    }
  };

  const getPickupAddress = (ord: Order) => {
    const rest = restaurants.find((r) => r.id === ord.restaurantId);
    return rest ? `${rest.address}` : `${ord.restaurantName}, ${ord.city}`;
  };

  const getStoreLiveCoords = (ord: Order) => {
    const rest = restaurants.find((r) => r.id === ord.restaurantId);
    if (rest && Number.isFinite(rest.lat) && Number.isFinite(rest.lng)) {
      return { lat: rest.lat, lng: rest.lng };
    }
    return { lat: ord.restaurantLat, lng: ord.restaurantLng };
  };

  const getOrderDistanceKm = (ord: Order) => {
    if (typeof ord.distanceKm === 'number' && ord.distanceKm > 0) {
      return Number(ord.distanceKm.toFixed(1));
    }
    return calculateRoadDistanceKm(
      { lat: ord.restaurantLat, lng: ord.restaurantLng },
      { lat: ord.deliveryLat, lng: ord.deliveryLng }
    );
  };

  // Sync exact computed pickup-to-drop-off route distance when live Google Maps route resolves
  const handleRouteComputed = (metrics: RouteMetrics) => {
    setRouteMetrics(metrics);
    if (
      currentJob &&
      onUpdateOrderDistance &&
      Number.isFinite(metrics.distanceKm) &&
      metrics.distanceKm > 0
    ) {
      const rounded = Number(metrics.distanceKm.toFixed(1));
      const existing = typeof currentJob.distanceKm === 'number' ? currentJob.distanceKm : 0;
      if (Math.abs(rounded - existing) >= 0.2) {
        void onUpdateOrderDistance(currentJob.id, rounded);
      }
    }
  };

  // Step 6: Live GPS broadcaster (uses real device Geolocation watchPosition when available,
  // with smooth route-progression fallback for indoor/desktop testing)
  useEffect(() => {
    if (!gpsActive || !currentJob) return;

    let watchId: number | null = null;
    let receivedRealGps = false;

    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      try {
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            receivedRealGps = true;
            const lat = Number(pos.coords.latitude.toFixed(6));
            const lng = Number(pos.coords.longitude.toFixed(6));
            const distDeg = Math.hypot(
              currentJob.deliveryLat - lat,
              currentJob.deliveryLng - lng
            );
            const nextEta = Math.max(1, Math.round(distDeg * 220));
            onUpdateRiderLocation(currentJob.id, lat, lng, nextEta);
          },
          () => {
            // Fall back to route vector progression below if GPS permission is denied
          },
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
        );
      } catch {
        // ignore geolocation errors
      }
    }

    const interval = setInterval(() => {
      if (receivedRealGps) return;
      const currLat = currentJob.riderLat ?? currentJob.restaurantLat;
      const currLng = currentJob.riderLng ?? currentJob.restaurantLng;
      const nextLat = currLat + (currentJob.deliveryLat - currLat) * 0.22;
      const nextLng = currLng + (currentJob.deliveryLng - currLng) * 0.22;
      const distRemaining = Math.hypot(
        currentJob.deliveryLat - nextLat,
        currentJob.deliveryLng - nextLng
      );
      const nextEta = Math.max(1, Math.round(distRemaining * 220));
      onUpdateRiderLocation(currentJob.id, nextLat, nextLng, nextEta);

      if (distRemaining < 0.0012) {
        setGpsActive(false);
      }
    }, 3500);

    return () => {
      clearInterval(interval);
      if (watchId !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [gpsActive, currentJob, onUpdateRiderLocation]);

  const handleAcceptBroadcast = async (ord: Order) => {
    const chosenRider =
      riders.find((r) => r.id === (lockedRiderId || actingRiderId)) ||
      availableRiders.find((r) => r.city === ord.city) ||
      availableRiders[0] ||
      riders[0];
    if (!chosenRider) return;
    setAcceptingId(ord.id);
    try {
      await onAcceptOrder(ord.id, chosenRider);
      setSelectedOrderId(ord.id);
    } finally {
      setAcceptingId(null);
    }
  };

  const riderPos = currentJob
    ? {
        lat: currentJob.riderLat ?? currentJob.restaurantLat,
        lng: currentJob.riderLng ?? currentJob.restaurantLng,
      }
    : null;

  return (
    <div className="space-y-6 pb-24">
      {/* Top Bar: Rider Interface Sub-Tabs + Active Rider Selector + Vehicle Mode */}
      <div className="flex flex-col gap-4 bg-[#0E0E14] border border-amber-500/30 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-yellow-400">
              Live Rider Dispatch · {availableRiders.length} Riders Available
            </p>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white mt-0.5">
              {riderSubTab === 'earnings'
                ? 'Rider Wallet, Delivery Pay & Tips'
                : 'Rider Route Optimization & Order Broadcasts'}
            </h1>
            <p className="text-sm font-semibold text-zinc-400 mt-1">
              {riderSubTab === 'earnings'
                ? `Earn ${formatRiderRateSummary(rates)}, plus 100% of customer tips in your wallet.`
                : 'New orders broadcast to available riders. Accept an order to unlock full drop-off & customer details.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {lockedRiderId && activeRider ? (
              <div className="px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-400/40 text-xs font-extrabold text-yellow-300">
                {activeRider.name} · ID {activeRider.loginId || 'Verified'}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-zinc-400">Current Rider:</label>
                <select
                  value={actingRiderId}
                  onChange={(e) => setActingRiderId(e.target.value)}
                  className="px-3 py-2 text-xs font-extrabold rounded-xl bg-zinc-900 border border-amber-500/35 text-yellow-300 focus:outline-none focus:border-amber-400"
                >
                  {riders.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.city} · {r.vehiclePlate})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {riderSubTab === 'dispatch' && (
              <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setTravelMode('TWO_WHEELER')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all ${
                    travelMode === 'TWO_WHEELER'
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 shadow-sm'
                      : 'text-zinc-400 hover:text-amber-300'
                  }`}
                >
                  Motorbike
                </button>
                <button
                  type="button"
                  onClick={() => setTravelMode('DRIVING')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all ${
                    travelMode === 'DRIVING'
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 shadow-sm'
                      : 'text-zinc-400 hover:text-amber-300'
                  }`}
                >
                  Car / Van
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Rider Sub-Navigation Tabs */}
        <div className="flex items-center gap-2 pt-3 border-t border-zinc-800">
          <button
            type="button"
            onClick={() => setRiderSubTab('dispatch')}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-2 transition-all ${
              riderSubTab === 'dispatch'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 shadow-md shadow-amber-500/20'
                : 'bg-zinc-900 text-zinc-300 border border-zinc-800 hover:border-amber-400/50 hover:text-yellow-300'
            }`}
          >
            <Navigation className="w-4 h-4 stroke-[2.5]" />
            Dispatch &amp; Route Nav
            {unassignedOrders.length > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono-tabular font-extrabold ${
                  riderSubTab === 'dispatch'
                    ? 'bg-zinc-950 text-yellow-400'
                    : 'bg-yellow-400 text-zinc-950'
                }`}
              >
                {unassignedOrders.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setRiderSubTab('earnings')}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-2 transition-all ${
              riderSubTab === 'earnings'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 shadow-md shadow-amber-500/20'
                : 'bg-zinc-900 text-zinc-300 border border-zinc-800 hover:border-amber-400/50 hover:text-yellow-300'
            }`}
          >
            <Wallet className="w-4 h-4 stroke-[2.5]" />
            Wallet &amp; Earnings
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/35 font-bold text-yellow-300 font-mono-tabular">
              Cash to Collect (COD Only): {formatPkr(riderCashSummary.cashToCollectPkr)}
            </span>
            {riderCashSummary.prepaidCount > 0 && (
              <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/35 font-bold text-emerald-300">
                {riderCashSummary.prepaidCount} Online Paid · Rs. 0 Cash
              </span>
            )}
          </div>
        </div>
      </div>

      {riderSubTab === 'earnings' && activeRider ? (
        <RiderEarningsTab
          rider={activeRider}
          orders={orders}
          deliveryRates={rates}
          onMarkPaidToOffice={handleMarkOfficeSettled}
          onMarkWhatsAppAmountAlreadyPaid={handleMarkWaAlreadyPaid}
        />
      ) : (
        <>
          {/* Incoming Rider Broadcast Queue */}
          {unassignedOrders.length > 0 && (
            <section className="bg-[#0E0E14] border border-amber-500/35 rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-400 text-zinc-950 flex items-center justify-center shrink-0">
                    <BellRing className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-white">
                      Incoming Order Broadcasts ({unassignedOrders.length})
                    </h2>
                    <p className="text-xs font-bold text-amber-400">
                      Store accepted · Ringing every 15s for all {Math.max(1, availableRiders.length)} available riders
                      {riderBellCountdown !== null ? ` · Next bell in ${riderBellCountdown}s` : ''}
                    </p>
                  </div>
                </div>

                {!lockedRiderId && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-zinc-400">Accepting as:</label>
                    <select
                      value={actingRiderId}
                      onChange={(e) => setActingRiderId(e.target.value)}
                      className="px-3 py-2 text-xs font-extrabold rounded-xl bg-zinc-900 border border-amber-500/35 text-yellow-300 focus:outline-none focus:border-amber-400"
                    >
                      {(availableRiders.length > 0 ? availableRiders : riders).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.city} · {r.vehiclePlate})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {unassignedOrders.map((ord) => {
                  const itemCount = ord.items.reduce((s, i) => s + i.quantity, 0);
                  const orderDistKm = getOrderDistanceKm(ord);
                  const tripPay =
                    ord.riderEarningPkr ?? calculateRiderDeliveryEarningPkr(orderDistKm, rates);
                  return (
                    <div
                      key={ord.id}
                      className="p-4 sm:p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 hover:border-amber-400/50 transition-colors space-y-3.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono-tabular text-sm font-extrabold text-yellow-400">
                          {ord.orderCode} · {itemCount} {itemCount === 1 ? 'item' : 'items'} ·{' '}
                          <span className="text-white">{orderDistKm.toFixed(1)} km</span>
                        </span>
                        <span className="font-mono-tabular text-xs font-extrabold text-emerald-400">
                          Wallet +{formatPkr(tripPay + (ord.tipPkr || 0))}
                        </span>
                      </div>

                      <div className="space-y-2 text-xs">
                        {ord.orderSource === 'whatsapp' && (
                          <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-emerald-400">
                            <MessageCircle className="w-3.5 h-3.5" />
                            WhatsApp Custom Order · Admin Confirmed
                          </div>
                        )}
                        <div className="flex items-start gap-2">
                          <Store className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-zinc-400 font-bold">Store / Business</p>
                            <p className="text-sm font-extrabold text-white">{ord.restaurantName}</p>
                          </div>
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <p className="text-zinc-400 font-bold">Store Pickup Location</p>
                              <p className="text-xs font-bold text-zinc-200">{getPickupAddress(ord)}</p>
                              {(() => {
                                const sc = getStoreLiveCoords(ord);
                                return (
                                  <p className="text-[10px] font-mono-tabular text-zinc-400 mt-0.5">
                                    Store GPS: {sc.lat.toFixed(4)}, {sc.lng.toFixed(4)}
                                  </p>
                                );
                              })()}
                            </div>
                          </div>
                          {(() => {
                            const sc = getStoreLiveCoords(ord);
                            return (
                              <a
                                href={`https://www.google.com/maps/dir/?api=1&destination=${sc.lat},${sc.lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-400/40 text-[11px] font-extrabold text-yellow-300 hover:bg-amber-500/25 inline-flex items-center gap-1 shrink-0 transition-colors"
                              >
                                <Compass className="w-3.5 h-3.5" />
                                Store Map
                              </a>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] font-bold text-zinc-400 pt-2 border-t border-zinc-800">
                        <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        Drop-off address &amp; customer phone unlock immediately after acceptance
                      </div>

                      <button
                        type="button"
                        disabled={acceptingId === ord.id}
                        onClick={() => handleAcceptBroadcast(ord)}
                        className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 disabled:opacity-50 inline-flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all"
                      >
                        <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                        {acceptingId === ord.id ? 'Accepting Order...' : 'Accept Order & Unlock Details'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Accepted Active Deliveries */}
          {!currentJob || !riderPos ? (
            <div className="p-12 bg-[#0E0E14] border border-zinc-800 rounded-2xl text-center space-y-2.5 shadow-xl">
              <Bike className="w-9 h-9 text-yellow-400 mx-auto" />
              <h2 className="text-lg font-extrabold text-white">No Accepted Active Deliveries</h2>
              <p className="text-sm font-semibold text-zinc-400">
                Accept an incoming order broadcast above to start navigation and earn delivery pay.
              </p>
            </div>
          ) : (
            <>
              {/* Job Switcher */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {acceptedDeliveries.map((job) => {
                  const isOnlinePaid =
                    job.paymentMethod !== 'COD' || job.paymentStatus === 'paid';
                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => {
                        setSelectedOrderId(job.id);
                        setGpsActive(false);
                      }}
                      className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 border transition-all ${
                        job.id === currentJob.id
                          ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 border-yellow-300 font-extrabold shadow-md'
                          : 'bg-[#0E0E14] text-zinc-300 border-zinc-800 hover:border-amber-400/50'
                      }`}
                    >
                      <span className="font-mono-tabular font-extrabold">{job.orderCode}</span>
                      <span className="mx-1.5 opacity-60">·</span>
                      <span className="font-mono-tabular">{getOrderDistanceKm(job).toFixed(1)} km</span>
                      <span className="mx-1.5 opacity-60">·</span>
                      <span className="font-mono-tabular">
                        {isOnlinePaid ? 'Online Paid (Rs. 0 Cash)' : `COD ${formatPkr(job.totalPkr)}`}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Quick One-Tap Call Customer & Active Job Strip (Instant Mobile Access Without Scrolling) */}
              {currentJob.customerPhone && (
                <div className="p-3.5 sm:p-4 rounded-2xl bg-[#0E0E14] border border-emerald-500/40 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
                      <Phone className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-400">
                        Active Customer Contact · #{currentJob.orderCode}
                      </p>
                      <p className="text-sm font-extrabold text-white truncate">
                        {currentJob.customerName}{' '}
                        <span className="font-mono-tabular text-xs font-bold text-amber-300 ml-1.5">
                          {currentJob.customerPhone}
                        </span>
                      </p>
                    </div>
                  </div>
                  <a
                    href={`tel:${currentJob.customerPhone.replace(/[^+\d]/g, '')}`}
                    className="btn-tactile btn-shimmer btn-call-pulse min-h-[48px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 text-zinc-950 text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 shrink-0 whitespace-nowrap"
                    aria-label={`One-tap call customer ${currentJob.customerName} at ${currentJob.customerPhone}`}
                  >
                    <Phone className="w-4 h-4 stroke-[2.6]" />
                    One-Tap Call Customer
                  </a>
                </div>
              )}

              {/* Split Navigation Workspace */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-8 space-y-4">
                  <LiveTrackingMap
                    restaurantPos={getStoreLiveCoords(currentJob)}
                    restaurantName={currentJob.restaurantName}
                    customerPos={{ lat: currentJob.deliveryLat, lng: currentJob.deliveryLng }}
                    riderPos={riderPos}
                    travelMode={travelMode}
                    heightClass="h-[380px] lg:h-[460px]"
                    onRouteComputed={handleRouteComputed}
                  />

                  {/* Turn-by-Turn Optimized Route Steps */}
                  <div className="p-5 bg-[#0E0E14] border border-zinc-800 rounded-2xl space-y-3 shadow-xl">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                        <Route className="w-4 h-4 text-yellow-400" />
                        Optimized Turn-by-Turn Directions
                      </h2>
                      <span className="text-xs font-mono-tabular font-bold text-yellow-400">
                        {(routeMetrics?.distanceKm ?? getOrderDistanceKm(currentJob)).toFixed(1)} km ·{' '}
                        {routeMetrics?.durationMin ?? currentJob.etaMinutes ?? 12} mins
                      </span>
                    </div>
                    <ol className="space-y-2 text-xs font-semibold text-zinc-300">
                      {(routeMetrics?.steps || [
                        'Head out from pickup store onto main boulevard',
                        'Follow shortest traffic-aware corridor toward customer sector',
                        'Turn onto residential street and verify doorstep pin',
                      ]).map((step, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-900 border border-zinc-800"
                        >
                          <span className="w-5 h-5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 font-mono-tabular font-extrabold text-[11px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="leading-relaxed">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>

                {/* Right: Full Accepted Order Dossier */}
                <div className="lg:col-span-4 space-y-4">
                  <div className="p-5 bg-[#0E0E14] border border-amber-500/30 rounded-2xl space-y-4 shadow-xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-extrabold uppercase tracking-wider text-yellow-400">
                          Accepted Order Details
                        </p>
                        <span className="text-sm font-mono-tabular font-extrabold text-white">
                          {currentJob.orderCode}
                        </span>
                      </div>
                      <span className="text-xs font-extrabold text-amber-300 capitalize">
                        {currentJob.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    {/* Assigned Rider & Single-Order Distance (Pickup → Drop-off) */}
                    <div className="text-xs font-bold text-zinc-400 pb-3 border-b border-zinc-800 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span>
                          Rider: <span className="text-white">{currentJob.riderName}</span>
                        </span>
                        <span className="font-mono-tabular text-emerald-400">
                          +
                          {formatPkr(
                            (currentJob.riderEarningPkr ??
                              calculateRiderDeliveryEarningPkr(getOrderDistanceKm(currentJob), rates)) +
                              (currentJob.tipPkr || 0)
                          )}{' '}
                          wallet
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="inline-flex items-center gap-1.5 text-zinc-400">
                          <Route className="w-3.5 h-3.5 text-yellow-400" />
                          Order Distance (Pickup → Drop-off)
                        </span>
                        <span className="font-mono-tabular font-extrabold text-yellow-300">
                          {(routeMetrics?.distanceKm ?? getOrderDistanceKm(currentJob)).toFixed(1)} km
                        </span>
                      </div>
                    </div>

                    {/* Pickup Location with Live Store GPS Navigation */}
                    {(() => {
                      const storeCoords = getStoreLiveCoords(currentJob);
                      return (
                        <div className="space-y-2 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1 min-w-0">
                              <p className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                                <Store className="w-3.5 h-3.5 text-yellow-400" />
                                Store Pickup Live Location
                              </p>
                              <p className="font-extrabold text-white">{currentJob.restaurantName}</p>
                              <p className="text-xs font-semibold text-zinc-400">
                                {getPickupAddress(currentJob)}
                              </p>
                              <p className="text-[11px] font-mono-tabular text-amber-300/90">
                                Store GPS: {storeCoords.lat.toFixed(5)}, {storeCoords.lng.toFixed(5)}
                              </p>
                            </div>
                          </div>
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${storeCoords.lat},${storeCoords.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-400/45 text-yellow-300 text-xs font-extrabold hover:bg-amber-500/25 inline-flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Compass className="w-4 h-4 text-yellow-400" />
                            Get Store Live Location (Google Maps)
                          </a>
                        </div>
                      );
                    })()}

                    {/* Drop-off Location */}
                    <div className="space-y-1 text-sm pt-2 border-t border-zinc-800">
                      <p className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-400" />
                        Drop-off Location
                      </p>
                      <p className="text-xs font-bold text-white leading-relaxed">
                        {currentJob.deliveryAddress}
                      </p>
                      <p className="text-[11px] font-mono-tabular text-zinc-400">
                        GPS: {currentJob.deliveryLat.toFixed(4)}, {currentJob.deliveryLng.toFixed(4)}
                      </p>
                      {currentJob.deliveryNotes && (
                        <p className="text-xs font-bold text-amber-300 mt-1">
                          Note: {currentJob.deliveryNotes}
                        </p>
                      )}
                    </div>

                    {/* Customer Information & One-Tap Call Customer (Native Mobile tel: Protocol) */}
                    <div className="space-y-3 text-sm pt-2 border-t border-zinc-800">
                      <p className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-yellow-400" />
                        Customer Information
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-extrabold text-white truncate">
                            {currentJob.customerName}
                          </p>
                          <p className="text-xs font-mono-tabular font-bold text-amber-300">
                            {currentJob.customerPhone}
                          </p>
                        </div>
                      </div>
                      {currentJob.customerPhone && (
                        <a
                          href={`tel:${currentJob.customerPhone.replace(/[^+\d]/g, '')}`}
                          className="btn-tactile btn-shimmer btn-call-pulse w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 text-zinc-950 text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-lg"
                          aria-label={`One-tap call customer ${currentJob.customerName}`}
                        >
                          <Phone className="w-4 h-4 stroke-[2.6]" />
                          One-Tap Call Customer ({currentJob.customerPhone})
                        </a>
                      )}
                    </div>

                    {/* WhatsApp Custom Order Photo & Note (WhatsApp orders only) */}
                    {currentJob.orderSource === 'whatsapp' && (
                      <div className="pt-2 border-t border-emerald-500/30 space-y-2">
                        <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                          <MessageCircle className="w-3.5 h-3.5" />
                          WhatsApp Custom Order Details
                        </p>
                        {currentJob.whatsappItemPhoto && (
                          <img
                            src={currentJob.whatsappItemPhoto}
                            alt="WhatsApp order item"
                            className="w-full h-36 object-cover rounded-xl border border-emerald-500/35"
                          />
                        )}
                        {currentJob.whatsappItemNote && (
                          <p className="text-xs font-semibold text-zinc-200 bg-zinc-900 p-2.5 rounded-xl border border-zinc-800">
                            {currentJob.whatsappItemNote}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Order Items Summary */}
                    <div className="pt-2 border-t border-zinc-800 space-y-1">
                      <p className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-400">
                        Order Items
                      </p>
                      <ul className="text-xs font-semibold text-zinc-300 space-y-1">
                        {currentJob.items.map((item, idx) => (
                          <li key={idx} className="flex justify-between gap-2">
                            <span>
                              {item.quantity}× {item.name}
                            </span>
                            <span className="font-mono-tabular font-bold text-zinc-200">
                              {formatPkr(item.pricePkr * item.quantity)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* COD Collection Callout (Online Paid or WhatsApp Already Paid = Rs. 0 Rider Cash) */}
                    {(() => {
                      const isWaPaid =
                        currentJob.orderSource === 'whatsapp' &&
                        Boolean(currentJob.whatsappAmountAlreadyPaid);
                      const isOnlinePaid =
                        isWaPaid ||
                        currentJob.paymentMethod !== 'COD' ||
                        currentJob.paymentStatus === 'paid';
                      return (
                        <div
                          className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
                            isOnlinePaid
                              ? 'bg-emerald-500/10 border-emerald-500/35'
                              : 'bg-amber-500/10 border-amber-500/35'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Banknote
                              className={`w-5 h-5 shrink-0 ${
                                isOnlinePaid ? 'text-emerald-400' : 'text-yellow-400'
                              }`}
                            />
                            <div>
                              <p
                                className={`text-xs font-extrabold ${
                                  isOnlinePaid ? 'text-emerald-300' : 'text-yellow-300'
                                }`}
                              >
                                {isWaPaid
                                  ? 'Amount Already Paid (WhatsApp Order)'
                                  : isOnlinePaid
                                    ? `Already Paid Online (${currentJob.paymentMethod})`
                                    : 'Collect Cash (COD)'}
                              </p>
                              <p className="text-[11px] font-semibold text-zinc-300">
                                {isOnlinePaid
                                  ? `Do not collect cash · Normal delivery pay credited to wallet (Bill: ${formatPkr(currentJob.totalPkr)})`
                                  : 'Collect exact PKR at doorstep'}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`font-mono-tabular font-extrabold text-base shrink-0 ${
                              isOnlinePaid ? 'text-emerald-300' : 'text-yellow-400'
                            }`}
                          >
                            {isOnlinePaid ? 'Rs. 0 Cash' : formatPkr(currentJob.totalPkr)}
                          </span>
                        </div>
                      );
                    })()}

                    {/* GPS Live Broadcast Toggle */}
                    <button
                      type="button"
                      onClick={() => setGpsActive((v) => !v)}
                      className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-extrabold inline-flex items-center justify-center gap-2 transition-all ${
                        gpsActive
                          ? 'bg-amber-400 text-zinc-950 hover:bg-yellow-300'
                          : 'bg-zinc-900 border border-amber-500/40 text-amber-300 hover:bg-amber-500/15'
                      }`}
                    >
                      {gpsActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      {gpsActive ? 'Pause Live GPS Movement' : 'Start Live GPS Navigation'}
                    </button>

                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${currentJob.deliveryLat},${currentJob.deliveryLng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-bold hover:border-amber-400 hover:text-yellow-300 inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Compass className="w-4 h-4 text-yellow-400" />
                      Navigate to Customer Drop-off (Google Maps)
                    </a>

                    {/* Delivery Action Buttons */}
                    <div className="pt-3 border-t border-zinc-800 space-y-2.5">
                      {(currentJob.paymentMethod !== 'COD' ||
                        currentJob.paymentStatus === 'paid') && (
                        currentJob.officeSettled ? (
                          <div className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-extrabold flex items-center justify-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4" />
                            Paid to Office Confirmed
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={settlingOrderId === currentJob.id}
                            onClick={() => handleMarkOfficeSettled(currentJob.id)}
                            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-500 text-zinc-950 text-xs font-extrabold hover:bg-emerald-400 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 shadow-md transition-colors"
                          >
                            <Building2 className="w-4 h-4 stroke-[2.3]" />
                            {settlingOrderId === currentJob.id
                              ? 'Updating Office Status...'
                              : 'Paid to Office (Customer Paid Online)'}
                          </button>
                        )
                      )}
                      {(currentJob.status === 'confirmed' || currentJob.status === 'preparing') && (
                        <button
                          type="button"
                          onClick={async () => {
                            await onUpdateOrderStatus(currentJob.id, 'picked_up');
                            setGpsActive(true);
                          }}
                          className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 inline-flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition-all"
                        >
                          <Navigation className="w-4 h-4 stroke-[2.5]" />
                          Confirm Order Picked Up &amp; Share Live Location
                        </button>
                      )}
                      {currentJob.status === 'picked_up' && (
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateOrderStatus(currentJob.id, 'on_the_way');
                            setGpsActive(true);
                          }}
                          className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-500/15 text-yellow-300 border border-amber-500/40 text-xs font-extrabold hover:bg-amber-500/25 inline-flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Navigation className="w-4 h-4" />
                          Mark On the Way to Customer
                        </button>
                      )}
                      {/* Delivery Photo Proof Capture (Mandatory for Prepaid / WhatsApp, Optional for COD — Photo & Timestamp Only) */}
                      <div
                        className={`rounded-xl border p-3.5 space-y-3 ${
                          isPhotoProofRequired
                            ? 'bg-amber-500/10 border-amber-500/40'
                            : 'bg-zinc-900/80 border-zinc-800'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Camera
                              className={`w-4 h-4 ${
                                isPhotoProofRequired ? 'text-amber-400' : 'text-zinc-300'
                              }`}
                            />
                            <span className="text-xs font-extrabold text-white">
                              Delivery Photo Proof
                            </span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider ${
                              isPhotoProofRequired
                                ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                                : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                            }`}
                          >
                            {isPhotoProofRequired
                              ? 'Required (Prepaid / WhatsApp)'
                              : 'Optional (COD)'}
                          </span>
                        </div>

                        <p className="text-[11px] font-semibold text-zinc-400 leading-relaxed">
                          {isPhotoProofRequired
                            ? 'Snap or upload a photo of the delivered order. Saved with exact timestamp for Admin verification only.'
                            : 'Optionally snap a drop-off photo with timestamp for Admin verification only.'}
                        </p>

                        <input
                          ref={proofInputRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handleSelectProofFile}
                          className="hidden"
                        />

                        {compressingProof ? (
                          <div className="flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950/70 py-5 text-xs font-bold text-amber-300">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Compressing photo for fast upload...
                          </div>
                        ) : proofDraft ? (
                          <div className="space-y-2.5">
                            <div className="relative overflow-hidden rounded-xl border border-emerald-500/40 bg-zinc-950">
                              <img
                                src={proofDraft.photoDataUrl}
                                alt="Captured delivery proof preview"
                                className="w-full max-h-48 object-cover"
                              />
                              <div className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-lg bg-black/80 px-2.5 py-1 text-[10px] font-bold text-emerald-300 backdrop-blur-sm">
                                <Clock className="w-3 h-3" />
                                {new Date(proofDraft.capturedAt).toLocaleString('en-PK', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </div>
                              <div className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-lg bg-emerald-500/90 px-2 py-0.5 text-[10px] font-extrabold text-zinc-950">
                                <ShieldCheck className="w-3 h-3" />
                                Ready
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={completingDelivery}
                                onClick={() => proofInputRef.current?.click()}
                                className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-bold hover:border-amber-400 hover:text-yellow-300 inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Retake Photo
                              </button>
                              <button
                                type="button"
                                disabled={completingDelivery}
                                onClick={() => {
                                  setProofDraft(null);
                                  setProofError(null);
                                }}
                                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-rose-300 text-xs font-bold hover:border-rose-400 inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Remove
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={completingDelivery}
                            onClick={() => proofInputRef.current?.click()}
                            className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${
                              isPhotoProofRequired
                                ? 'bg-amber-500/20 border-amber-400/60 text-yellow-300 hover:bg-amber-500/30'
                                : 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:border-amber-400 hover:text-yellow-300'
                            }`}
                          >
                            <Camera className="w-4 h-4" />
                            Snap / Upload Delivery Photo
                          </button>
                        )}

                        {proofError && (
                          <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-[11px] font-bold text-rose-200">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" />
                            <span>{proofError}</span>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={
                          completingDelivery ||
                          compressingProof ||
                          (isPhotoProofRequired && !proofDraft)
                        }
                        onClick={handleConfirmDelivered}
                        className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-sm font-extrabold hover:brightness-105 disabled:opacity-45 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all"
                      >
                        {completingDelivery ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Saving Delivery Proof...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            {currentJob.paymentMethod === 'COD' &&
                            !currentJob.whatsappAmountAlreadyPaid
                              ? 'Confirm Delivered & Cash Collected'
                              : 'Confirm Order Delivered'}
                          </>
                        )}
                      </button>
                      {isPhotoProofRequired && !proofDraft && (
                        <p className="text-center text-[11px] font-bold text-amber-300">
                          Snap or upload a delivery photo to complete this prepaid/WhatsApp order.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Step 5 & 6: Completed WhatsApp Orders — "Amount Already Paid" Option (Strictly for WhatsApp Orders Only) */}
          {completedWhatsAppOrders.length > 0 && (
            <section className="bg-[#0E0E14] border border-emerald-500/40 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-white">
                      Completed WhatsApp Orders — Payment Option ({completedWhatsAppOrders.length})
                    </h2>
                    <p className="text-xs font-semibold text-zinc-400">
                      For completed WhatsApp orders only: select Amount Already Paid if the customer already paid. Your normal delivery fee stays added to your wallet.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {completedWhatsAppOrders.map((ord) => {
                  const waDistKm = getOrderDistanceKm(ord);
                  const walletPay =
                    ord.riderEarningPkr ??
                    calculateRiderDeliveryEarningPkr(waDistKm, rates);
                  return (
                    <div
                      key={ord.id}
                      className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {ord.whatsappItemPhoto && (
                          <img
                            src={ord.whatsappItemPhoto}
                            alt="WhatsApp order item"
                            className="w-12 h-12 rounded-xl object-cover border border-zinc-700 shrink-0"
                          />
                        )}
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2 text-xs font-extrabold">
                            <span className="font-mono-tabular text-yellow-400">{ord.orderCode}</span>
                            <span className="font-mono-tabular text-zinc-300">{waDistKm.toFixed(1)} km</span>
                            <span className="text-emerald-400">WhatsApp Delivered</span>
                          </div>
                          <p className="text-xs font-bold text-zinc-200 truncate">
                            {ord.customerName} · {ord.deliveryAddress}
                          </p>
                          <p className="text-[11px] font-mono-tabular font-bold text-amber-300">
                            Wallet Credited: +{formatPkr(walletPay)} (Normal Delivery Rate)
                          </p>
                        </div>
                      </div>

                      {ord.whatsappAmountAlreadyPaid ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs font-extrabold text-emerald-300 shrink-0">
                          <CheckCircle2 className="w-4 h-4" />
                          Amount Already Paid ✓
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={markingWaPaidOrderId === ord.id}
                          onClick={() => handleMarkWaAlreadyPaid(ord.id)}
                          className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-extrabold disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0 shadow-md transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                          {markingWaPaidOrderId === ord.id ? 'Saving...' : 'Amount Already Paid'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Online-Paid Orders — Paid to Office Settlement Section */}
          {onlinePaidOrders.length > 0 && (
            <section className="bg-[#0E0E14] border border-emerald-500/30 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-white">
                      Online-Paid Orders — Office Settlement ({onlinePaidOrders.length})
                    </h2>
                    <p className="text-xs font-semibold text-zinc-400">
                      When a customer has already paid online, tap Paid to Office to mark settlement complete.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {onlinePaidOrders.map((ord) => (
                  <div
                    key={ord.id}
                    className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 text-xs font-extrabold">
                        <span className="font-mono-tabular text-yellow-400">{ord.orderCode}</span>
                        <span className="text-emerald-400">{ord.paymentMethod} Paid</span>
                        <span className="text-zinc-500">·</span>
                        <span className="font-mono-tabular text-white">{formatPkr(ord.totalPkr)}</span>
                      </div>
                      <p className="text-xs font-bold text-zinc-200 truncate">
                        {ord.restaurantName} → {ord.customerName}
                      </p>
                      <p className="text-[11px] text-zinc-400 capitalize">
                        Status: {ord.status.replace(/_/g, ' ')}
                      </p>
                    </div>

                    {ord.officeSettled ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs font-extrabold text-emerald-300 shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                        Paid to Office ✓
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={settlingOrderId === ord.id}
                        onClick={() => handleMarkOfficeSettled(ord.id)}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0 transition-all"
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        {settlingOrderId === ord.id ? 'Saving...' : 'Paid to Office'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
