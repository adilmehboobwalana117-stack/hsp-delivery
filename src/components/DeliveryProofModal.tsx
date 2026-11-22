import React from 'react';
import {
  Camera,
  Clock,
  Download,
  Loader2,
  MapPin,
  ShieldCheck,
  Store,
  Truck,
  User,
  X,
  AlertCircle,
} from 'lucide-react';
import { DeliveryProofRecord, Order } from '../types';

interface DeliveryProofModalProps {
  order: Order;
  proof: DeliveryProofRecord | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry?: () => void;
}

const formatCaptureTimestamp = (iso?: string): string => {
  if (!iso) return 'Timestamp unavailable';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const DeliveryProofModal: React.FC<DeliveryProofModalProps> = ({
  order,
  proof,
  loading,
  error,
  onClose,
  onRetry,
}) => {
  const handleDownload = () => {
    if (!proof?.photoDataUrl) return;
    const isWebp = proof.photoDataUrl.startsWith('data:image/webp');
    const ext = isWebp ? 'webp' : 'jpg';
    const link = document.createElement('a');
    link.href = proof.photoDataUrl;
    link.download = `delivery-proof-${order.orderCode || order.id}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const capturedAt = proof?.capturedAt || order.deliveryProofCapturedAt;
  const isPrepaidOrWhatsApp =
    order.orderSource === 'whatsapp' ||
    order.paymentMethod !== 'COD' ||
    Boolean(order.whatsappAmountAlreadyPaid);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Delivery proof for order ${order.orderCode}`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin Verification Only
              </span>
              <span className="rounded-lg bg-slate-200/80 px-2 py-0.5 font-mono text-xs font-bold text-slate-800">
                #{order.orderCode}
              </span>
              <span
                className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                  isPrepaidOrWhatsApp
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-sky-100 text-sky-800'
                }`}
              >
                {order.orderSource === 'whatsapp'
                  ? 'WhatsApp Order'
                  : order.paymentMethod}
              </span>
            </div>
            <h2 className="mt-1.5 text-base font-extrabold text-slate-900">
              Delivery Photo Proof
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close delivery proof modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Photo Stage */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
            {loading ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 p-8 text-slate-300">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                <p className="text-sm font-semibold">
                  Loading encrypted admin delivery proof...
                </p>
              </div>
            ) : error ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 p-8 text-center">
                <AlertCircle className="h-9 w-9 text-rose-400" />
                <p className="max-w-sm text-sm font-semibold text-white">
                  {error}
                </p>
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="rounded-xl bg-white/15 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-white/25"
                  >
                    Retry Loading Photo
                  </button>
                )}
              </div>
            ) : proof?.photoDataUrl ? (
              <div className="relative flex items-center justify-center bg-slate-950">
                <img
                  src={proof.photoDataUrl}
                  alt={`Delivery proof for order ${order.orderCode}`}
                  className="max-h-[440px] w-full object-contain"
                />
                <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-950/80 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm">
                  <Clock className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{formatCaptureTimestamp(capturedAt)}</span>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 p-8 text-center text-slate-400">
                <Camera className="h-9 w-9 text-slate-500" />
                <p className="text-sm font-semibold text-slate-200">
                  No delivery photo record found for this order.
                </p>
              </div>
            )}
          </div>

          {/* Metadata Summary */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <Clock className="h-3.5 w-3.5 text-emerald-600" />
                Captured Timestamp
              </div>
              <p className="mt-1 text-sm font-bold text-slate-900">
                {formatCaptureTimestamp(capturedAt)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <Truck className="h-3.5 w-3.5 text-emerald-600" />
                Delivered By Rider
              </div>
              <p className="mt-1 text-sm font-bold text-slate-900">
                {proof?.riderName || order.riderName || 'Assigned Rider'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <Store className="h-3.5 w-3.5 text-slate-500" />
                Business &amp; Total
              </div>
              <p className="mt-1 text-sm font-bold text-slate-900">
                {order.restaurantName} · Rs. {order.totalPkr.toLocaleString()}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <User className="h-3.5 w-3.5 text-slate-500" />
                Customer
              </div>
              <p className="mt-1 text-sm font-bold text-slate-900">
                {order.customerName} ({order.customerPhone})
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <MapPin className="h-3.5 w-3.5 text-rose-500" />
              Drop-off Address
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-700">
              {order.deliveryAddress}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-3.5">
          <p className="text-[11px] font-medium text-slate-500">
            Restricted to HSP Admin verification — hidden from customers and business owners.
          </p>
          <div className="flex items-center gap-2">
            {proof?.photoDataUrl && (
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700"
              >
                <Download className="h-3.5 w-3.5" />
                Download Photo
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
