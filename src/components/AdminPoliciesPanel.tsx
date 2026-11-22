import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Eye,
  FileText,
  RotateCcw,
  Save,
  ShieldAlert,
  Store,
  UserCheck,
} from 'lucide-react';
import { AppSettings, Order } from '../types';
import { formatPkr } from '../data/pakistanData';
import {
  DEFAULT_CANCELLATION_POLICIES,
  resolveCancellationPolicies,
} from '../utils/policies';
import { PolicyModalTab } from './CancellationPolicyModal';

interface AdminPoliciesPanelProps {
  appSettings: AppSettings;
  orders: Order[];
  onUpdateAppSettings: (nextSettings: Partial<AppSettings>) => Promise<void>;
  onOpenPolicyPreview?: (tab: PolicyModalTab) => void;
}

export function AdminPoliciesPanel({
  appSettings,
  orders,
  onUpdateAppSettings,
  onOpenPolicyPreview,
}: AdminPoliciesPanelProps) {
  const livePolicy = resolveCancellationPolicies(appSettings);

  const [custFreeCancel, setCustFreeCancel] = useState<boolean>(
    livePolicy.customerFreeCancelBeforeAccept
  );
  const [custLateFee, setCustLateFee] = useState<string>(
    String(livePolicy.customerLateCancelFeePkr)
  );
  const [custRefundHrs, setCustRefundHrs] = useState<string>(
    String(livePolicy.customerRefundWindowHours)
  );
  const [custRules, setCustRules] = useState<string>(livePolicy.customerPolicyRules);

  const [bizSlaMin, setBizSlaMin] = useState<string>(
    String(livePolicy.businessResponseSlaMinutes)
  );
  const [bizMaxMonthly, setBizMaxMonthly] = useState<string>(
    String(livePolicy.businessMaxMonthlyCancellations)
  );
  const [bizPenalty, setBizPenalty] = useState<string>(
    String(livePolicy.businessCancelPenaltyPkr)
  );
  const [bizRules, setBizRules] = useState<string>(livePolicy.businessPolicyRules);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [savedNotice, setSavedNotice] = useState('');

  useEffect(() => {
    const resolved = resolveCancellationPolicies(appSettings);
    setCustFreeCancel(resolved.customerFreeCancelBeforeAccept);
    setCustLateFee(String(resolved.customerLateCancelFeePkr));
    setCustRefundHrs(String(resolved.customerRefundWindowHours));
    setCustRules(resolved.customerPolicyRules);
    setBizSlaMin(String(resolved.businessResponseSlaMinutes));
    setBizMaxMonthly(String(resolved.businessMaxMonthlyCancellations));
    setBizPenalty(String(resolved.businessCancelPenaltyPkr));
    setBizRules(resolved.businessPolicyRules);
  }, [appSettings]);

  const cancelledOrders = orders.filter((o) => o.status === 'cancelled');
  const customerCancelledCount = cancelledOrders.filter(
    (o) => o.cancelledBy === 'customer'
  ).length;
  const businessCancelledCount = cancelledOrders.filter(
    (o) =>
      o.cancelledBy === 'business' ||
      (o.cancelledBy !== 'customer' && o.cancelledBy !== 'admin')
  ).length;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSavedNotice('');

    const lateFeeNum = Math.round(Number(custLateFee));
    const refundHrsNum = Math.round(Number(custRefundHrs));
    const slaNum = Math.round(Number(bizSlaMin));
    const maxMonthlyNum = Math.round(Number(bizMaxMonthly));
    const penaltyNum = Math.round(Number(bizPenalty));

    if (!Number.isFinite(lateFeeNum) || lateFeeNum < 0 || lateFeeNum > 5000) {
      setErrorMsg('Customer late cancellation fee must be between Rs. 0 and Rs. 5,000.');
      return;
    }
    if (!Number.isFinite(refundHrsNum) || refundHrsNum < 1 || refundHrsNum > 168) {
      setErrorMsg('Prepaid refund window must be between 1 and 168 hours.');
      return;
    }
    if (!Number.isFinite(slaNum) || slaNum < 1 || slaNum > 60) {
      setErrorMsg('Business response SLA must be between 1 and 60 minutes.');
      return;
    }
    if (!Number.isFinite(maxMonthlyNum) || maxMonthlyNum < 1 || maxMonthlyNum > 50) {
      setErrorMsg('Business max monthly cancellations must be between 1 and 50.');
      return;
    }
    if (!Number.isFinite(penaltyNum) || penaltyNum < 0 || penaltyNum > 10000) {
      setErrorMsg('Business post-acceptance cancellation penalty must be between Rs. 0 and Rs. 10,000.');
      return;
    }
    if (custRules.trim().length < 10 || custRules.trim().length > 4000) {
      setErrorMsg('Customer policy rules must be between 10 and 4,000 characters.');
      return;
    }
    if (bizRules.trim().length < 10 || bizRules.trim().length > 4000) {
      setErrorMsg('Business Owner policy rules must be between 10 and 4,000 characters.');
      return;
    }

    setSaving(true);
    try {
      await onUpdateAppSettings({
        customerFreeCancelBeforeAccept: custFreeCancel,
        customerLateCancelFeePkr: lateFeeNum,
        customerRefundWindowHours: refundHrsNum,
        customerPolicyRules: custRules.trim(),
        businessResponseSlaMinutes: slaNum,
        businessMaxMonthlyCancellations: maxMonthlyNum,
        businessCancelPenaltyPkr: penaltyNum,
        businessPolicyRules: bizRules.trim(),
      });
      setSavedNotice('Customer & Business Owner cancellation policies saved live across the app.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    setErrorMsg('');
    setSavedNotice('');
    setSaving(true);
    try {
      await onUpdateAppSettings({ ...DEFAULT_CANCELLATION_POLICIES });
      setSavedNotice('Restored default Customer & Business Owner cancellation policies.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 no-print">
      {/* Header & Cancellation Stats */}
      <section className="p-5 sm:p-6 bg-[#0E0E14] border border-amber-500/35 rounded-2xl space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/35 text-yellow-400 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-white">
                Order Cancellation Policies (Customers &amp; Business Owners)
              </h2>
              <p className="text-xs font-semibold text-zinc-400">
                Configure rules, fees, refund timelines, and partner SLAs. Updates sync instantly to Checkout, Order Tracking, Store Registration, and Business Portal.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onOpenPolicyPreview && (
              <button
                type="button"
                onClick={() => onOpenPolicyPreview('customer')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 border border-amber-500/40 text-xs font-bold text-yellow-300 hover:bg-amber-500/15 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                Preview Live Modal
              </button>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={handleResetDefaults}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-bold text-zinc-300 hover:border-amber-400 hover:text-yellow-300 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Defaults
            </button>
          </div>
        </div>

        {/* Live Cancellation Overview KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
            <p className="text-zinc-400 font-semibold">Total Cancelled Orders</p>
            <p className="text-xl font-mono-tabular font-extrabold text-white mt-1">
              {cancelledOrders.length}
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-amber-500/25">
            <p className="text-amber-300 font-semibold">Cancelled by Customers</p>
            <p className="text-xl font-mono-tabular font-extrabold text-yellow-300 mt-1">
              {customerCancelledCount}
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-rose-500/25">
            <p className="text-rose-300 font-semibold">Rejected / Cancelled by Stores</p>
            <p className="text-xl font-mono-tabular font-extrabold text-rose-400 mt-1">
              {businessCancelledCount}
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-5 pt-2">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* 1. Customer Order Cancellation Policy Card */}
            <div className="p-5 rounded-2xl bg-zinc-950 border border-amber-500/30 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-yellow-400" />
                  <h3 className="text-sm font-extrabold text-white">
                    Customer Cancellation Policy
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-emerald-400">
                  Shown in Checkout &amp; Track
                </span>
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={custFreeCancel}
                  onChange={(e) => setCustFreeCancel(e.target.checked)}
                  className="accent-yellow-400 w-4 h-4 mt-0.5 shrink-0"
                />
                <span className="text-xs font-semibold text-zinc-200 leading-relaxed">
                  Allow customers to cancel orders free of charge while status is{' '}
                  <strong className="text-yellow-300">Order Placed</strong> (before store accepts).
                </span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1.5">
                    Late Cancellation Fee (PKR)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    step={10}
                    required
                    value={custLateFee}
                    onChange={(e) => setCustLateFee(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm font-mono-tabular font-bold bg-zinc-900 text-yellow-300 rounded-xl border border-amber-500/40 focus:outline-none focus:border-amber-400"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Max fee for support-approved cancel after acceptance ({formatPkr(Number(custLateFee) || 0)})
                  </p>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1.5">
                    Prepaid Refund Window (Hours)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    step={1}
                    required
                    value={custRefundHrs}
                    onChange={(e) => setCustRefundHrs(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm font-mono-tabular font-bold bg-zinc-900 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">
                    JazzCash / EasyPaisa / Card refund SLA
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-400 mb-1.5">
                  Customer Policy Rules (one rule per line)
                </label>
                <textarea
                  rows={8}
                  maxLength={4000}
                  required
                  value={custRules}
                  onChange={(e) => setCustRules(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-medium leading-relaxed bg-zinc-900 text-zinc-100 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* 2. Business Owner Cancellation & Rejection Policy Card */}
            <div className="p-5 rounded-2xl bg-zinc-950 border border-rose-500/30 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Store className="w-5 h-5 text-amber-400" />
                  <h3 className="text-sm font-extrabold text-white">
                    Business Owner Policy
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-amber-300">
                  Shown in Store Portal &amp; Sign-up
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1.5">
                    Response SLA (Min)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    step={1}
                    required
                    value={bizSlaMin}
                    onChange={(e) => setBizSlaMin(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm font-mono-tabular font-bold bg-zinc-900 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1.5">
                    Max / Month Limit
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    step={1}
                    required
                    value={bizMaxMonthly}
                    onChange={(e) => setBizMaxMonthly(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm font-mono-tabular font-bold bg-zinc-900 text-amber-300 rounded-xl border border-amber-500/40 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1.5">
                    Post-Accept Penalty
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    step={10}
                    required
                    value={bizPenalty}
                    onChange={(e) => setBizPenalty(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm font-mono-tabular font-bold bg-zinc-900 text-rose-300 rounded-xl border border-rose-500/40 focus:outline-none focus:border-rose-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-400 mb-1.5">
                  Business Owner Cancellation &amp; Rejection Rules (one rule per line)
                </label>
                <textarea
                  rows={8}
                  maxLength={4000}
                  required
                  value={bizRules}
                  onChange={(e) => setBizRules(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-medium leading-relaxed bg-zinc-900 text-zinc-100 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] font-semibold text-rose-200 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>
                  Stores automatically see their live monthly cancellation counter against the{' '}
                  <strong>{bizMaxMonthly}/month</strong> allowance and must acknowledge this policy
                  when registering or cancelling an accepted order.
                </span>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs font-bold text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {errorMsg}
            </div>
          )}
          {savedNotice && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs font-bold text-emerald-300">
              {savedNotice}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 disabled:opacity-50 inline-flex items-center gap-2 shadow-md shadow-amber-500/20"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving Policies...' : 'Save Customer & Business Owner Policies'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
