import React, { useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Crosshair,
  FileText,
  Gift,
  MapPin,
  Minus,
  Navigation,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import {
  CancellationPolicies,
  CityConfig,
  DeliveryRates,
  LatLng,
  OrderItem,
  PaymentMethod,
  Restaurant,
} from '../types';
import { formatPkr } from '../data/pakistanData';
import { LoyaltyTierInfo } from '../utils/loyalty';
import { resolveCancellationPolicies } from '../utils/policies';
import {
  calculateCustomerDeliveryFeePkr,
  calculateRiderDeliveryEarningPkr,
  calculateRoadDistanceKm,
  resolveDeliveryRates,
} from '../utils/pricing';
import { PinPickerMap } from './DeliveryMap';
import { FoodImage } from './FoodImage';
import { LoyaltyBadge } from './LoyaltyBadge';

interface CheckoutDrawerProps {
  open: boolean;
  onClose: () => void;
  restaurant: Restaurant | null;
  items: OrderItem[];
  cityConfig: CityConfig;
  defaultCustomerName: string;
  loyaltyTier: LoyaltyTierInfo;
  completedOrdersCount: number;
  deliveryRates?: DeliveryRates;
  cancellationPolicies?: CancellationPolicies;
  onOpenPolicy?: () => void;
  onUpdateQty: (menuItemId: string, delta: number) => void;
  onClearCart: () => void;
  onPlaceOrder: (payload: {
    customerName: string;
    customerPhone: string;
    deliveryAddress: string;
    deliveryNotes: string;
    deliveryLat: number;
    deliveryLng: number;
    distanceKm: number;
    deliveryFeePkr: number;
    tipPkr: number;
    riderEarningPkr: number;
    paymentMethod: PaymentMethod;
    paymentRef?: string;
  }) => Promise<void>;
}

const TIP_PRESETS = [0, 50, 100, 200];

export function CheckoutDrawer({
  open,
  onClose,
  restaurant,
  items,
  cityConfig,
  defaultCustomerName,
  loyaltyTier,
  completedOrdersCount,
  deliveryRates,
  cancellationPolicies,
  onOpenPolicy,
  onUpdateQty,
  onClearCart,
  onPlaceOrder,
}: CheckoutDrawerProps) {
  const rates = resolveDeliveryRates(deliveryRates);
  const policy = resolveCancellationPolicies(cancellationPolicies);
  const [customerName, setCustomerName] = useState(defaultCustomerName || 'Ali Raza');
  const [customerPhone, setCustomerPhone] = useState('+92 300 1234567');
  const [deliveryAddress, setDeliveryAddress] = useState(
    `House 18-A, ${cityConfig.popularAreas[0]}, ${cityConfig.name}`
  );
  const [deliveryNotes, setDeliveryNotes] = useState('Call at main gate upon arrival');
  const [pinnedLocation, setPinnedLocation] = useState<LatLng>({
    lat: cityConfig.center.lat + 0.008,
    lng: cityConfig.center.lng + 0.007,
  });
  const [locationPinned, setLocationPinned] = useState(false);
  const [locatingGps, setLocatingGps] = useState(false);
  const [gpsStatusMsg, setGpsStatusMsg] = useState<string | null>(null);

  const [tipPkr, setTipPkr] = useState<number>(0);
  const [customTip, setCustomTip] = useState<string>('');

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const [walletNumber, setWalletNumber] = useState('03001234567');
  const [cardLast4, setCardLast4] = useState('4242');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const distanceKm = useMemo(() => {
    if (!restaurant) return 2.0;
    return calculateRoadDistanceKm(
      { lat: restaurant.lat, lng: restaurant.lng },
      pinnedLocation
    );
  }, [restaurant, pinnedLocation]);

  if (!open || !restaurant) return null;

  const subtotal = items.reduce((sum, item) => sum + item.pricePkr * item.quantity, 0);
  const deliveryFee = calculateCustomerDeliveryFeePkr(distanceKm, rates);
  const riderEarningPkr = calculateRiderDeliveryEarningPkr(distanceKm, rates);
  const safeTip = Math.max(0, Math.round(tipPkr || 0));
  const total = subtotal + deliveryFee + safeTip;

  const handlePinChange = (coords: LatLng) => {
    setPinnedLocation(coords);
    setLocationPinned(true);
    setError(null);
    setGpsStatusMsg(
      `Location pinned (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`
    );
  };

  const handlePinCurrentGps = () => {
    setError(null);
    if (!navigator.geolocation) {
      setLocationPinned(true);
      setGpsStatusMsg('GPS unavailable in browser — using tapped map pin.');
      return;
    }
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingGps(false);
        const coords = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        };
        setPinnedLocation(coords);
        setLocationPinned(true);
        setGpsStatusMsg(
          `Current GPS pinned (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`
        );
      },
      () => {
        setLocatingGps(false);
        setLocationPinned(true);
        setGpsStatusMsg(
          'GPS permission denied — tap anywhere on the map to adjust your exact doorstep pin.'
        );
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (items.length === 0) {
      setError('Your cart is empty.');
      return;
    }
    if (!locationPinned) {
      setError(
        'Please pin your current location using GPS or tap on the map so we can calculate exact delivery distance.'
      );
      return;
    }
    if (!customerName.trim() || !customerPhone.trim() || !deliveryAddress.trim()) {
      setError('Please enter your name, phone number, and delivery address.');
      return;
    }
    if (
      (paymentMethod === 'JAZZCASH' || paymentMethod === 'EASYPAISA') &&
      walletNumber.replace(/\D/g, '').length < 11
    ) {
      setError('Enter a valid 11-digit Pakistani mobile wallet number (03XXXXXXXXX).');
      return;
    }

    setSubmitting(true);
    try {
      const paymentRef =
        paymentMethod === 'COD'
          ? undefined
          : paymentMethod === 'JAZZCASH'
            ? `JC-${Date.now().toString().slice(-8)}`
            : paymentMethod === 'EASYPAISA'
              ? `EP-${Date.now().toString().slice(-8)}`
              : `CARD-${cardLast4}-${Date.now().toString().slice(-4)}`;

      await onPlaceOrder({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        deliveryAddress: deliveryAddress.trim(),
        deliveryNotes: deliveryNotes.trim(),
        deliveryLat: pinnedLocation.lat,
        deliveryLng: pinnedLocation.lng,
        distanceKm,
        deliveryFeePkr: deliveryFee,
        tipPkr: safeTip,
        riderEarningPkr,
        paymentMethod,
        paymentRef,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to place order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-xl bg-[#0B0B10] border-l border-amber-500/30 h-full flex flex-col shadow-2xl text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-extrabold text-white">Checkout · {restaurant.name}</h2>
            <p className="text-xs font-bold text-amber-400">
              {cityConfig.name} · Distance: {distanceKm.toFixed(1)} km · Est. {restaurant.deliveryTimeMin} mins
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-900 hover:text-amber-300 transition-colors"
            aria-label="Close checkout"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Cart Items */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-white">Order Items ({items.length})</h3>
              <button
                type="button"
                onClick={onClearCart}
                className="text-xs font-bold text-zinc-400 hover:text-rose-400 inline-flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            </div>
            <div className="divide-y divide-zinc-800 border border-amber-500/25 rounded-2xl overflow-hidden bg-[#12121A]">
              {items.map((item) => (
                <div key={item.menuItemId} className="flex items-center gap-3 p-3.5">
                  <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-zinc-900 border border-zinc-800">
                    <FoodImage src={item.imageUrl} alt={item.name} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-extrabold text-white truncate">{item.name}</p>
                    <p className="text-xs font-mono-tabular text-amber-400">
                      {formatPkr(item.pricePkr)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onUpdateQty(item.menuItemId, -1)}
                      className="w-8 h-8 rounded-lg border border-zinc-700 bg-zinc-900 flex items-center justify-center text-zinc-200 hover:border-amber-400"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm font-mono-tabular font-extrabold text-white">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => onUpdateQty(item.menuItemId, 1)}
                      className="w-8 h-8 rounded-lg border border-zinc-700 bg-zinc-900 flex items-center justify-center text-zinc-200 hover:border-amber-400"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Mandatory Current Location Pin + Distance Pricing Info */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-yellow-400" />
                  1. Pin Current Location (Required)
                </h3>
                <p className="text-[11px] font-semibold text-zinc-400">
                  Rs. {rates.customerBaseFeePkr} up to {rates.customerBaseKm} km · +Rs. {rates.customerExtraPerKmPkr}/km beyond {rates.customerBaseKm} km
                </p>
              </div>
              <button
                type="button"
                onClick={handlePinCurrentGps}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold transition-all ${
                  locationPinned
                    ? 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-300'
                    : 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 shadow-sm'
                }`}
              >
                <Crosshair className={`w-3.5 h-3.5 ${locatingGps ? 'animate-spin' : ''}`} />
                {locatingGps
                  ? 'Detecting GPS...'
                  : locationPinned
                    ? 'Location Pinned ✓'
                    : 'Pin My Current Location'}
              </button>
            </div>

            {gpsStatusMsg && (
              <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-semibold text-amber-200 flex items-center justify-between gap-2">
                <span>{gpsStatusMsg}</span>
                <span className="font-mono-tabular font-extrabold text-yellow-300 shrink-0">
                  {distanceKm.toFixed(1)} km
                </span>
              </div>
            )}

            <PinPickerMap
              center={cityConfig.center}
              pinnedLocation={pinnedLocation}
              onPinChange={handlePinChange}
              heightClass="h-52"
            />

            {!locationPinned && (
              <button
                type="button"
                onClick={() => handlePinChange(pinnedLocation)}
                className="w-full py-2 rounded-xl bg-zinc-900 border border-amber-500/40 text-amber-300 text-xs font-bold hover:bg-amber-500/15 inline-flex items-center justify-center gap-1.5"
              >
                <Navigation className="w-3.5 h-3.5" />
                Confirm Selected Pin on Map ({distanceKm.toFixed(1)} km · {formatPkr(deliveryFee)})
              </button>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-bold text-zinc-400">Full Name</label>
                  <LoyaltyBadge tier={loyaltyTier} completedOrders={completedOrdersCount} />
                </div>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-bold rounded-xl bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-amber-400"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1">
                  Mobile Number (PK)
                </label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular rounded-xl bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-amber-400"
                  placeholder="+92 300 1234567"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">
                Street / House Address
              </label>
              <input
                type="text"
                required
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm font-bold rounded-xl bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-amber-400"
                placeholder="House #, Street #, Area"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">
                Rider Instructions (Optional)
              </label>
              <input
                type="text"
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm font-semibold rounded-xl bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-amber-400"
                placeholder="Landmark, floor, or gate instructions"
              />
            </div>
          </section>

          {/* Payment Method */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-white">2. Payment Method</h3>
              <span className="text-xs text-yellow-400 font-bold inline-flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Verified Gateway
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setPaymentMethod('COD')}
                className={`text-left p-3.5 rounded-xl border transition-all ${
                  paymentMethod === 'COD'
                    ? 'border-yellow-400 bg-amber-500/15 ring-1 ring-yellow-400/60'
                    : 'border-zinc-800 hover:border-amber-500/40 bg-[#12121A]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Banknote className="w-5 h-5 text-yellow-400" />
                  <span className="text-[11px] font-extrabold text-amber-300">Recommended</span>
                </div>
                <p className="text-sm font-extrabold text-white">Cash on Delivery</p>
                <p className="text-xs font-semibold text-zinc-400">Pay cash in PKR at doorstep</p>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('JAZZCASH')}
                className={`text-left p-3.5 rounded-xl border transition-all ${
                  paymentMethod === 'JAZZCASH'
                    ? 'border-yellow-400 bg-amber-500/15 ring-1 ring-yellow-400/60'
                    : 'border-zinc-800 hover:border-amber-500/40 bg-[#12121A]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Smartphone className="w-5 h-5 text-amber-400" />
                  <span className="text-[11px] font-bold text-zinc-400">Instant MPIN</span>
                </div>
                <p className="text-sm font-extrabold text-white">JazzCash</p>
                <p className="text-xs font-semibold text-zinc-400">Pakistan Mobile Wallet</p>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('EASYPAISA')}
                className={`text-left p-3.5 rounded-xl border transition-all ${
                  paymentMethod === 'EASYPAISA'
                    ? 'border-yellow-400 bg-amber-500/15 ring-1 ring-yellow-400/60'
                    : 'border-zinc-800 hover:border-amber-500/40 bg-[#12121A]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Smartphone className="w-5 h-5 text-emerald-400" />
                  <span className="text-[11px] font-bold text-zinc-400">Instant OTP</span>
                </div>
                <p className="text-sm font-extrabold text-white">EasyPaisa</p>
                <p className="text-xs font-semibold text-zinc-400">Telenor Mobile Account</p>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('CARD')}
                className={`text-left p-3.5 rounded-xl border transition-all ${
                  paymentMethod === 'CARD'
                    ? 'border-yellow-400 bg-amber-500/15 ring-1 ring-yellow-400/60'
                    : 'border-zinc-800 hover:border-amber-500/40 bg-[#12121A]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <CreditCard className="w-5 h-5 text-amber-400" />
                  <span className="text-[11px] font-bold text-zinc-400">3DS Secure</span>
                </div>
                <p className="text-sm font-extrabold text-white">Debit / Credit Card</p>
                <p className="text-xs font-semibold text-zinc-400">Visa, Mastercard &amp; PayPak</p>
              </button>
            </div>

            {(paymentMethod === 'JAZZCASH' || paymentMethod === 'EASYPAISA') && (
              <div className="p-3.5 rounded-xl bg-[#12121A] border border-zinc-800 space-y-2">
                <label className="block text-xs font-bold text-zinc-400">
                  {paymentMethod === 'JAZZCASH' ? 'JazzCash' : 'EasyPaisa'} Mobile Account Number
                </label>
                <input
                  type="tel"
                  value={walletNumber}
                  onChange={(e) => setWalletNumber(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-zinc-900 text-white rounded-lg border border-zinc-700 focus:outline-none focus:border-amber-400"
                  placeholder="03001234567"
                />
              </div>
            )}

            {paymentMethod === 'CARD' && (
              <div className="p-3.5 rounded-xl bg-[#12121A] border border-zinc-800 space-y-2">
                <label className="block text-xs font-bold text-zinc-400">
                  Card Ending Digits (Test Mode · PCI Tokenized)
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={cardLast4}
                  onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-zinc-900 text-white rounded-lg border border-zinc-700 focus:outline-none focus:border-amber-400"
                  placeholder="4242"
                />
              </div>
            )}
          </section>

          {/* Rider Tip Selector + Detailed Bill Summary */}
          <section className="p-4 rounded-2xl bg-[#12121A] border border-amber-500/30 space-y-4 text-sm">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-yellow-300 inline-flex items-center gap-1.5">
                  <Gift className="w-3.5 h-3.5 text-yellow-400" />
                  Add Tip for Rider (100% to Rider)
                </span>
                {safeTip > 0 && (
                  <span className="text-xs font-mono-tabular font-bold text-emerald-400">
                    +{formatPkr(safeTip)}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-5 gap-2">
                {TIP_PRESETS.map((preset) => {
                  const active = customTip === '' && tipPkr === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setCustomTip('');
                        setTipPkr(preset);
                      }}
                      className={`py-2 rounded-xl text-xs font-mono-tabular font-extrabold border transition-all ${
                        active
                          ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 border-yellow-300'
                          : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-amber-400/60'
                      }`}
                    >
                      {preset === 0 ? 'No Tip' : `Rs.${preset}`}
                    </button>
                  );
                })}
                <input
                  type="number"
                  min={0}
                  max={10000}
                  value={customTip}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomTip(val);
                    setTipPkr(Math.max(0, Math.round(Number(val) || 0)));
                  }}
                  placeholder="Custom"
                  className="px-2 py-2 text-xs font-mono-tabular font-bold rounded-xl bg-zinc-900 border border-zinc-700 text-yellow-300 placeholder:text-zinc-500 focus:outline-none focus:border-amber-400 text-center"
                />
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-zinc-800">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal</span>
                <span className="font-mono-tabular text-zinc-200">{formatPkr(subtotal)}</span>
              </div>
              <div className="flex justify-between items-start text-zinc-400">
                <div>
                  <span>Delivery Charges ({distanceKm.toFixed(1)} km)</span>
                  <p className="text-[11px] text-zinc-500">
                    {distanceKm <= rates.customerBaseKm
                      ? `Base rate within ${rates.customerBaseKm} km (Rs. ${rates.customerBaseFeePkr})`
                      : `Rs. ${rates.customerBaseFeePkr} base + Rs. ${rates.customerExtraPerKmPkr}/km × ${(distanceKm - rates.customerBaseKm).toFixed(1)} km`}
                  </p>
                </div>
                <span className="font-mono-tabular text-amber-300">{formatPkr(deliveryFee)}</span>
              </div>
              {safeTip > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Rider Tip</span>
                  <span className="font-mono-tabular">+{formatPkr(safeTip)}</span>
                </div>
              )}
              <div className="pt-2.5 border-t border-amber-500/25 flex justify-between font-extrabold text-white text-base">
                <span>Total Payable ({paymentMethod})</span>
                <span className="font-mono-tabular text-yellow-400">{formatPkr(total)}</span>
              </div>
            </div>
          </section>

          {/* Customer Order Cancellation Policy Notice */}
          <section className="p-3.5 rounded-2xl bg-zinc-950/90 border border-amber-500/25 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-amber-300 inline-flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-yellow-400" />
                Order Cancellation Policy
              </span>
              {onOpenPolicy && (
                <button
                  type="button"
                  onClick={onOpenPolicy}
                  className="text-[11px] font-extrabold text-yellow-400 hover:text-yellow-300 underline underline-offset-2"
                >
                  Read Full Policy
                </button>
              )}
            </div>
            <p className="text-[11px] font-medium text-zinc-300 leading-relaxed">
              {policy.customerFreeCancelBeforeAccept
                ? 'Free cancellation is available anytime before the store accepts your order.'
                : 'Cancellations require HSP Support review.'}{' '}
              Once the store starts preparing or a rider picks up, self-cancellation is locked
              {policy.customerLateCancelFeePkr > 0
                ? ` (emergency cancellation fee up to ${formatPkr(policy.customerLateCancelFeePkr)})`
                : ''}
              . Prepaid cancellations are refunded within{' '}
              <span className="font-bold text-white">{policy.customerRefundWindowHours} hours</span>.
            </p>
          </section>

          {error && (
            <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-200 text-xs font-bold">
              {error}
            </div>
          )}
        </form>

        {/* Sticky Gold CTA */}
        <div className="p-4 border-t border-zinc-800 bg-[#0B0B10]">
          <button
            type="button"
            disabled={submitting || items.length === 0}
            onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
            className="w-full min-h-[50px] px-5 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-400 text-zinc-950 font-extrabold text-sm hover:brightness-105 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-[0_8px_30px_rgba(245,158,11,0.3)]"
          >
            <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
            {submitting
              ? 'Placing Order...'
              : `Confirm ${paymentMethod === 'COD' ? 'Cash on Delivery' : paymentMethod} Order · ${formatPkr(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
