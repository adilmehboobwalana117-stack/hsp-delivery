import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  ShieldCheck,
  Store,
  UserCheck,
  X,
} from 'lucide-react';
import { CancellationPolicies } from '../types';
import { formatPkr } from '../data/pakistanData';
import { resolveCancellationPolicies, splitPolicyLines } from '../utils/policies';

export type PolicyModalTab = 'customer' | 'business' | 'privacy';

interface CancellationPolicyModalProps {
  open: boolean;
  initialTab?: PolicyModalTab;
  policies?: CancellationPolicies;
  whatsappNumber?: string;
  supportEmail?: string;
  onClose: () => void;
}

export function CancellationPolicyModal({
  open,
  initialTab = 'customer',
  policies,
  whatsappNumber = '+92 300 7741209',
  supportEmail,
  onClose,
}: CancellationPolicyModalProps) {
  const [activeTab, setActiveTab] = useState<PolicyModalTab>(initialTab);
  const [copiedPrivacyUrl, setCopiedPrivacyUrl] = useState(false);

  const privacyPolicyUrl =
    typeof window !== 'undefined' && window.location.origin
      ? `${window.location.origin}/privacy-policy.html`
      : 'https://ais-pre-jjyvyo7m4unbdm4dz4upjq-756142993760.asia-southeast1.run.app/privacy-policy.html';

  const handleCopyPrivacyUrl = async () => {
    try {
      await navigator.clipboard.writeText(privacyPolicyUrl);
      setCopiedPrivacyUrl(true);
      window.setTimeout(() => setCopiedPrivacyUrl(false), 2000);
    } catch {
      setCopiedPrivacyUrl(false);
    }
  };

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  if (!open) return null;

  const resolved = resolveCancellationPolicies(policies);
  const customerLines = splitPolicyLines(resolved.customerPolicyRules);
  const businessLines = splitPolicyLines(resolved.businessPolicyRules);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-label="HSP delivery Order Cancellation & Platform Policies"
    >
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl bg-[#0E0E14] border border-amber-500/40 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-950/90 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/35 text-yellow-400 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-white truncate">
                Order Cancellation &amp; Platform Policies
              </h2>
              <p className="text-xs font-semibold text-zinc-400">
                HSP delivery · Clear rules for Customers &amp; Business Partners
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-white hover:border-amber-400 transition-colors"
            aria-label="Close policies"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Policy Audience Tabs */}
        <div className="px-5 pt-3 pb-2 bg-zinc-950/60 border-b border-zinc-800 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('customer')}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-all inline-flex items-center gap-1.5 ${
              activeTab === 'customer'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 border-yellow-300 shadow-sm'
                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-amber-400/60'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Customer Cancellation Policy
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('business')}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-all inline-flex items-center gap-1.5 ${
              activeTab === 'business'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 border-yellow-300 shadow-sm'
                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-amber-400/60'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            Business Owner Policy
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-all inline-flex items-center gap-1.5 ${
              activeTab === 'privacy'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 border-yellow-300 shadow-sm'
                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-amber-400/60'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Privacy &amp; Data
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {activeTab === 'customer' && (
            <>
              {/* Key Customer Policy Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/35">
                  <p className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">
                    Before Store Accepts
                  </p>
                  <p className="text-sm font-extrabold text-white mt-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    {resolved.customerFreeCancelBeforeAccept
                      ? '100% Free Cancel'
                      : 'Requires Support'}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/35">
                  <p className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                    After Confirmation
                  </p>
                  <p className="text-sm font-extrabold text-white mt-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
                    {resolved.customerLateCancelFeePkr > 0
                      ? `Up to ${formatPkr(resolved.customerLateCancelFeePkr)} Fee`
                      : 'Support Approval Only'}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-700">
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                    Prepaid Refund SLA
                  </p>
                  <p className="text-sm font-extrabold text-white mt-1 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-yellow-400 shrink-0" />
                    Within {resolved.customerRefundWindowHours} Hours
                  </p>
                </div>
              </div>

              {/* Detailed Rules */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-yellow-400">
                  Customer Order Cancellation Rules
                </h3>
                <ul className="space-y-2.5">
                  {customerLines.map((line, idx) => (
                    <li
                      key={idx}
                      className="text-xs sm:text-sm font-medium text-zinc-200 leading-relaxed flex items-start gap-2.5"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {activeTab === 'business' && (
            <>
              {/* Key Business Policy Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/35">
                  <p className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                    Response Time SLA
                  </p>
                  <p className="text-sm font-extrabold text-white mt-1 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-yellow-400 shrink-0" />
                    Within {resolved.businessResponseSlaMinutes} Minutes
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-700">
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                    Monthly Allowance
                  </p>
                  <p className="text-sm font-extrabold text-white mt-1 flex items-center gap-1.5">
                    <Store className="w-4 h-4 text-amber-400 shrink-0" />
                    Max {resolved.businessMaxMonthlyCancellations} / Month
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/35">
                  <p className="text-[11px] font-bold text-rose-300 uppercase tracking-wider">
                    Post-Accept Penalty
                  </p>
                  <p className="text-sm font-extrabold text-white mt-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    {resolved.businessCancelPenaltyPkr > 0
                      ? `${formatPkr(resolved.businessCancelPenaltyPkr)} / Order`
                      : 'Account Warning'}
                  </p>
                </div>
              </div>

              {/* Detailed Rules */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-yellow-400">
                  Business Owner Rejection &amp; Cancellation Policy
                </h3>
                <ul className="space-y-2.5">
                  {businessLines.map((line, idx) => (
                    <li
                      key={idx}
                      className="text-xs sm:text-sm font-medium text-zinc-200 leading-relaxed flex items-start gap-2.5"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {activeTab === 'privacy' && (
            <div className="space-y-4">
              {/* Public Privacy Policy URL Card (Google Play Console Ready) */}
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/35 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-300 inline-flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Public Privacy Policy URL (Google Play Ready)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyPrivacyUrl}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-emerald-500/40 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/15"
                    >
                      {copiedPrivacyUrl ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedPrivacyUrl ? 'URL Copied' : 'Copy URL'}
                    </button>
                    <a
                      href="/privacy-policy.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-tactile inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-zinc-950 text-[11px] font-extrabold hover:bg-emerald-400"
                    >
                      Open Page
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
                <p className="font-mono-tabular text-xs font-semibold text-emerald-200 bg-zinc-950/90 border border-emerald-500/25 rounded-lg px-3 py-2 break-all select-all">
                  {privacyPolicyUrl}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3 text-xs sm:text-sm text-zinc-200 leading-relaxed">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-yellow-400">
                  HSP delivery Privacy &amp; Data Protection Policy
                </h3>
                <p>
                  HSP delivery collects only the information necessary to fulfill your delivery
                  orders, including your name, mobile number, delivery address, GPS pin coordinates
                  (to calculate distance charges and route riders), and order history.
                </p>
                <p>
                  <strong>Customer Privacy Protection:</strong> Customer mobile numbers are hidden
                  from store owners and shared strictly with the assigned HSP rider (for one-tap
                  delivery calls) and operations team for delivery coordination.
                </p>
                <p>
                  <strong>Delivery Photo Proof Isolation:</strong> Photos captured by riders at
                  drop-off are stored in an Admin-only verification record and are never visible to
                  customers, other riders, or business owners.
                </p>
                <p>
                  <strong>Location Data:</strong> Precise location is requested only when pinning a
                  delivery address, registering a store location, or tracking an active delivery
                  after rider pickup.
                </p>
                <p>
                  <strong>Support &amp; Data Deletion Requests:</strong> For refunds, cancellations,
                  or account/data deletion requests, contact HSP Support on WhatsApp at{' '}
                  <span className="font-mono-tabular font-bold text-yellow-300">
                    {whatsappNumber}
                  </span>
                  {supportEmail ? (
                    <>
                      {' '}
                      or email{' '}
                      <span className="font-bold text-yellow-300">{supportEmail}</span>
                    </>
                  ) : null}
                  .
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-zinc-800 bg-zinc-950/90 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-zinc-400 font-semibold">
            Questions? WhatsApp Support:{' '}
            <span className="font-mono-tabular text-yellow-300 font-bold">{whatsappNumber}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 font-extrabold text-xs hover:brightness-105 transition-all"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
