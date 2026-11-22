import React, { useMemo, useState } from 'react';
import {
  Camera,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  ImagePlus,
  Link2,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { CancellationPolicies, CityConfig, DeliveryRates, LatLng, Order } from '../types';
import { formatPkr } from '../data/pakistanData';
import { resolveCancellationPolicies } from '../utils/policies';
import {
  calculateCustomerDeliveryFeePkr,
  calculateRiderDeliveryEarningPkr,
  calculateRoadDistanceKm,
  formatCustomerRateSummary,
  resolveDeliveryRates,
} from '../utils/pricing';
import { compressFoodImage } from '../utils/sound';
import { formatWhatsAppUrl } from '../utils/hash';
import { PinPickerMap } from './DeliveryMap';

export interface WhatsAppOrderSubmitPayload {
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  distanceKm: number;
  deliveryFeePkr: number;
  riderEarningPkr: number;
  whatsappItemNote: string;
  whatsappItemPhoto?: string;
}

interface WhatsAppOrderModalProps {
  open: boolean;
  selectedCity: CityConfig;
  whatsappNumber: string;
  defaultCustomerName: string;
  deliveryRates?: DeliveryRates;
  cancellationPolicies?: CancellationPolicies;
  onOpenPolicy?: () => void;
  onClose: () => void;
  onSubmitWhatsAppOrder: (
    payload: WhatsAppOrderSubmitPayload
  ) => Promise<{ order: Order; orderLink: string }>;
  onTrackOrder: (orderId: string) => void;
}

export function WhatsAppOrderModal({
  open,
  selectedCity,
  whatsappNumber,
  defaultCustomerName,
  deliveryRates,
  cancellationPolicies,
  onOpenPolicy,
  onClose,
  onSubmitWhatsAppOrder,
  onTrackOrder,
}: WhatsAppOrderModalProps) {
  const rates = resolveDeliveryRates(deliveryRates);
  const policy = resolveCancellationPolicies(cancellationPolicies);
  const [customerName, setCustomerName] = useState(
    defaultCustomerName && defaultCustomerName !== 'Guest Customer' ? defaultCustomerName : ''
  );
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [itemNote, setItemNote] = useState('');
  const [itemPhoto, setItemPhoto] = useState<string>('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [pinnedLocation, setPinnedLocation] = useState<LatLng>(selectedCity.center);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [createdResult, setCreatedResult] = useState<{
    order: Order;
    orderLink: string;
    whatsappUrl: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const distanceKm = useMemo(
    () => calculateRoadDistanceKm(selectedCity.center, pinnedLocation),
    [selectedCity.center, pinnedLocation]
  );

  const deliveryFeePkr = useMemo(
    () => calculateCustomerDeliveryFeePkr(distanceKm, rates),
    [distanceKm, rates]
  );

  const riderEarningPkr = useMemo(
    () => calculateRiderDeliveryEarningPkr(distanceKm, rates),
    [distanceKm, rates]
  );

  const etaMin = useMemo(
    () => Math.max(15, Math.round(12 + distanceKm * 3.5)),
    [distanceKm]
  );

  if (!open) return null;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    setPhotoUploading(true);
    try {
      let compressed = await compressFoodImage(file, 540);
      // Enforce Firestore document field size limit (< 115,000 chars)
      if (compressed.length > 110000) {
        compressed = await compressFoodImage(file, 360);
      }
      if (compressed.length > 115000) {
        setErrorMsg('Image is too large even after compression. Please pick a smaller photo.');
        return;
      }
      setItemPhoto(compressed);
    } catch {
      setErrorMsg('Could not read the selected photo. Please try a JPG, PNG, or WebP image.');
    } finally {
      setPhotoUploading(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanName = (customerName.trim() || defaultCustomerName || 'WhatsApp Customer').slice(
      0,
      100
    );
    const cleanPhone = customerPhone.trim();
    const cleanAddress = deliveryAddress.trim();
    const cleanNote = itemNote.trim();

    if (!itemPhoto && cleanNote.length < 3) {
      setErrorMsg('Please attach a photo of your item or write an order note.');
      return;
    }
    if (cleanAddress.length < 3) {
      setErrorMsg('Please enter your delivery address.');
      return;
    }
    if (cleanPhone.replace(/\D/g, '').length < 10) {
      setErrorMsg('Please enter a valid mobile number (e.g. 0300-1234567).');
      return;
    }

    setSubmitting(true);
    try {
      const { order, orderLink } = await onSubmitWhatsAppOrder({
        customerName: cleanName,
        customerPhone: cleanPhone,
        deliveryAddress: cleanAddress,
        deliveryLat: pinnedLocation.lat,
        deliveryLng: pinnedLocation.lng,
        distanceKm,
        deliveryFeePkr,
        riderEarningPkr,
        whatsappItemNote: cleanNote || 'Custom item order (see attached item photo)',
        whatsappItemPhoto: itemPhoto || undefined,
      });

      const mapsPinLink = `https://www.google.com/maps?q=${pinnedLocation.lat},${pinnedLocation.lng}`;
      const waMessage = [
        `Assalam-o-Alaikum HSP delivery Admin!`,
        `New WhatsApp Custom Order (${order.orderCode})`,
        ``,
        `Order Confirmation Link:`,
        `${orderLink}`,
        ``,
        `City: ${selectedCity.name}`,
        `Customer: ${cleanName}`,
        `Mobile: ${cleanPhone}`,
        `Address: ${cleanAddress}`,
        `Pinned Location: ${mapsPinLink}`,
        `Distance Checked: ${distanceKm.toFixed(1)} km`,
        `Delivery Charges: ${formatPkr(deliveryFeePkr)}`,
        `Item Note: ${cleanNote || 'See attached photo in order link'}`,
        itemPhoto ? `Item Photo: Attached inside order link above` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const whatsappUrl = formatWhatsAppUrl(whatsappNumber, waMessage);
      setCreatedResult({ order, orderLink, whatsappUrl });
    } catch {
      setErrorMsg('Could not create your WhatsApp order right now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyOrderLink = async () => {
    if (!createdResult) return;
    try {
      await navigator.clipboard.writeText(createdResult.orderLink);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback ignored
    }
  };

  const handleResetAndClose = () => {
    setCreatedResult(null);
    setErrorMsg('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto no-print">
      <div className="w-full max-w-2xl bg-[#0B0B10] border border-emerald-500/40 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-[#0F1B14] via-[#101318] to-[#0B0B10] border-b border-emerald-500/30 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-zinc-950 flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/25">
              <MessageCircle className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-emerald-400">
                WhatsApp Custom Order · {selectedCity.name}
              </p>
              <h2 className="text-base sm:text-lg font-display font-extrabold text-white truncate">
                {createdResult
                  ? `Order Link Ready · ${createdResult.order.orderCode}`
                  : 'Attach Photo, Pin Location & Send to Admin'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetAndClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
            aria-label="Close WhatsApp order modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 sm:p-6 space-y-5">
          {createdResult ? (
            <div className="space-y-5">
              <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/40 space-y-3">
                <div className="flex items-center gap-2.5 text-emerald-300">
                  <CheckCircle2 className="w-6 h-6 shrink-0" />
                  <div>
                    <p className="text-sm font-extrabold text-white">
                      WhatsApp Order Created ({createdResult.order.orderCode})
                    </p>
                    <p className="text-xs font-semibold text-emerald-200/90">
                      Tap the green button below to send this order link directly to HSP Admin on WhatsApp for confirmation &amp; rider dispatch.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 text-xs">
                  <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800">
                    <p className="text-zinc-400 font-bold">Distance Checked</p>
                    <p className="font-mono-tabular font-extrabold text-white mt-0.5">
                      {(createdResult.order.distanceKm ?? distanceKm).toFixed(1)} km
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800">
                    <p className="text-zinc-400 font-bold">Delivery Charges</p>
                    <p className="font-mono-tabular font-extrabold text-yellow-400 mt-0.5">
                      {formatPkr(createdResult.order.deliveryFeePkr)}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 col-span-2 sm:col-span-1">
                    <p className="text-zinc-400 font-bold">Admin WhatsApp</p>
                    <p className="font-mono-tabular font-extrabold text-emerald-300 mt-0.5">
                      {whatsappNumber}
                    </p>
                  </div>
                </div>
              </div>

              {/* Generated Order Link */}
              <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-yellow-400 inline-flex items-center gap-1.5">
                    <Link2 className="w-4 h-4" />
                    Generated Order Link for Admin
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyOrderLink}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-amber-400 hover:text-yellow-300 transition-colors"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Link
                      </>
                    )}
                  </button>
                </div>
                <p className="text-xs font-mono-tabular text-zinc-300 break-all bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                  {createdResult.orderLink}
                </p>
              </div>

              {createdResult.order.whatsappItemPhoto && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                  <img
                    src={createdResult.order.whatsappItemPhoto}
                    alt="Attached item"
                    className="w-16 h-16 rounded-lg object-cover border border-zinc-700 shrink-0"
                  />
                  <div className="text-xs space-y-0.5 min-w-0">
                    <p className="font-extrabold text-white">Item Photo Attached to Order</p>
                    <p className="text-zinc-400 truncate">
                      {createdResult.order.whatsappItemNote}
                    </p>
                  </div>
                </div>
              )}

              {/* Primary WhatsApp Send CTA */}
              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href={createdResult.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-h-[50px] px-5 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-sm font-extrabold inline-flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all"
                >
                  <MessageCircle className="w-5 h-5 stroke-[2.5]" />
                  Send Order Link on WhatsApp to Admin
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const id = createdResult.order.id;
                    handleResetAndClose();
                    onTrackOrder(id);
                  }}
                  className="min-h-[50px] px-5 py-3 rounded-xl bg-zinc-900 border border-amber-500/40 text-yellow-300 text-xs font-extrabold hover:bg-amber-500/15 transition-colors whitespace-nowrap"
                >
                  Track Order Status
                </button>
              </div>

              <p className="text-[11px] font-semibold text-zinc-400 text-center">
                Once Admin opens your link and confirms the order, all available riders in {selectedCity.name} will be notified immediately.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* 1. Attach Item Photo & Note */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-5 space-y-2">
                  <label className="text-xs font-extrabold text-zinc-200 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-yellow-400" />
                    Attach Item Photo
                  </label>
                  {itemPhoto ? (
                    <div className="relative rounded-xl overflow-hidden border border-emerald-500/40 bg-zinc-900">
                      <img
                        src={itemPhoto}
                        alt="Selected item preview"
                        className="w-full h-36 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setItemPhoto('')}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/80 text-rose-300 hover:text-white border border-rose-500/40"
                        aria-label="Remove item photo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/75 text-[10px] font-bold text-emerald-300">
                        Photo Attached
                      </span>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-2 h-36 rounded-xl border border-dashed border-amber-500/45 bg-zinc-900/70 hover:bg-zinc-900 hover:border-yellow-400 cursor-pointer transition-colors px-3 text-center">
                      <ImagePlus className="w-6 h-6 text-yellow-400" />
                      <span className="text-xs font-extrabold text-white">
                        {photoUploading ? 'Compressing Photo...' : 'Upload or Capture Photo'}
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        Product photo, medicine prescription, or shop list
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                <div className="md:col-span-7 space-y-2">
                  <label className="text-xs font-extrabold text-zinc-200 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-yellow-400" />
                    Order Note (Item Details, Shop &amp; Quantity)
                  </label>
                  <textarea
                    rows={5}
                    maxLength={500}
                    value={itemNote}
                    onChange={(e) => setItemNote(e.target.value)}
                    placeholder={`Write item details, shop name in ${selectedCity.name}, quantity, or instructions...`}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-xs sm:text-sm font-medium text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400 resize-none"
                  />
                  <div className="text-right text-[10px] font-mono-tabular text-zinc-500">
                    {itemNote.length}/500
                  </div>
                </div>
              </div>

              {/* 2. Pin Current Location on Map + Automatic Delivery Fee Check */}
              <div className="space-y-3 pt-2 border-t border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-extrabold text-zinc-200 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-yellow-400" />
                    Pin Your Current Location (Checks Delivery Charges)
                  </label>
                  <span className="text-xs font-mono-tabular font-extrabold text-yellow-400">
                    {distanceKm.toFixed(1)} km · Delivery: {formatPkr(deliveryFeePkr)}
                  </span>
                </div>

                <PinPickerMap
                  center={selectedCity.center}
                  pinnedLocation={pinnedLocation}
                  onPinChange={setPinnedLocation}
                  heightClass="h-52"
                />

                {/* Live Checked Location & Delivery Charges Summary */}
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/35 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Navigation className="w-4 h-4 text-yellow-400 shrink-0" />
                    <div className="text-xs">
                      <p className="font-extrabold text-white">
                        Location Checked · {distanceKm.toFixed(1)} km from {selectedCity.name} Hub
                      </p>
                      <p className="text-[11px] font-semibold text-zinc-300">
                        {formatCustomerRateSummary(rates)} · Est. {etaMin} mins
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                      Delivery Charges
                    </p>
                    <p className="text-lg font-mono-tabular font-extrabold text-yellow-400">
                      {formatPkr(deliveryFeePkr)}
                    </p>
                  </div>
                </div>
              </div>

              {/* 3. Customer Name, Mobile Number & Full Delivery Address */}
              <div className="space-y-3 pt-2 border-t border-zinc-800">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-zinc-200 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-yellow-400" />
                      Your Name
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Full name"
                      maxLength={100}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-xs sm:text-sm font-semibold text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-zinc-200 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-yellow-400" />
                      Mobile Number *
                    </label>
                    <input
                      type="tel"
                      required
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="0300-1234567"
                      maxLength={30}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-xs sm:text-sm font-mono-tabular font-semibold text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-zinc-200">
                    Delivery Address *
                  </label>
                  <input
                    type="text"
                    required
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder={`House / Shop #, Street, Sector / Mohalla in ${selectedCity.name}`}
                    maxLength={300}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-xs sm:text-sm font-semibold text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
                  />
                  {selectedCity.popularAreas.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] font-semibold text-zinc-500">Quick fill:</span>
                      {selectedCity.popularAreas.slice(0, 5).map((area) => (
                        <button
                          key={area}
                          type="button"
                          onClick={() => setDeliveryAddress(`${area}, ${selectedCity.name}`)}
                          className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] font-semibold text-zinc-300 hover:border-amber-400 hover:text-yellow-300 transition-colors"
                        >
                          {area}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* WhatsApp Order Cancellation Policy Notice */}
              <div className="p-3 rounded-xl bg-zinc-950 border border-amber-500/25 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="font-medium text-zinc-300">
                  <strong className="text-amber-300">Cancellation Policy:</strong> Free cancellation before Admin confirmation &amp; rider dispatch.
                  {policy.customerLateCancelFeePkr > 0
                    ? ` Late cancellations may incur up to ${formatPkr(policy.customerLateCancelFeePkr)}.`
                    : ''}
                </span>
                {onOpenPolicy && (
                  <button
                    type="button"
                    onClick={onOpenPolicy}
                    className="font-extrabold text-yellow-400 hover:underline shrink-0"
                  >
                    Read Policy
                  </button>
                )}
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs font-bold text-rose-300">
                  {errorMsg}
                </div>
              )}

              {/* Submit */}
              <div className="pt-1 flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className="text-[11px] font-semibold text-zinc-400">
                  Generates an order link sent directly to Admin WhatsApp ({whatsappNumber}) for confirmation.
                </p>
                <button
                  type="submit"
                  disabled={submitting || photoUploading}
                  className="w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 text-sm font-extrabold inline-flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all whitespace-nowrap shrink-0"
                >
                  <MessageCircle className="w-5 h-5 stroke-[2.5]" />
                  {submitting
                    ? 'Creating Order Link...'
                    : `Create Order Link · ${formatPkr(deliveryFeePkr)}`}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
