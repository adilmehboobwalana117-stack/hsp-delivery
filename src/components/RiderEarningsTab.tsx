import { useMemo, useState } from 'react';
import {
  Banknote,
  Calendar,
  CheckCircle2,
  Coins,
  Download,
  Gift,
  MapPin,
  Printer,
  Receipt,
  Route,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DeliveryRates, Order, Rider, RiderEarningEntry } from '../types';
import { formatPkr, getSeedRiderMonthlyEarnings } from '../data/pakistanData';
import {
  calculateRiderDeliveryEarningPkr,
  calculateRoadDistanceKm,
  formatRiderRateSummary,
  resolveDeliveryRates,
} from '../utils/pricing';
import { downloadCsv, triggerPrintWithTitle } from '../utils/exportPrint';

interface RiderEarningsTabProps {
  rider: Rider;
  orders: Order[];
  deliveryRates?: DeliveryRates;
  onMarkPaidToOffice?: (orderId: string) => Promise<void>;
  onMarkWhatsAppAmountAlreadyPaid?: (orderId: string) => Promise<void>;
}

type EarningsFilter = 'all' | 'tipped' | 'cod' | 'prepaid';

export function RiderEarningsTab({
  rider,
  orders,
  deliveryRates,
  onMarkPaidToOffice,
  onMarkWhatsAppAmountAlreadyPaid,
}: RiderEarningsTabProps) {
  const rates = useMemo(() => resolveDeliveryRates(deliveryRates), [deliveryRates]);
  const [filter, setFilter] = useState<EarningsFilter>('all');
  const [reportMode, setReportMode] = useState<'monthly' | 'daily'>('monthly');
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    new Date().toISOString().slice(0, 7)
  );

  const now = new Date();
  const periodLabel = useMemo(() => {
    if (reportMode === 'daily') {
      const dt = new Date(`${selectedDate}T00:00:00`);
      return Number.isNaN(dt.getTime())
        ? selectedDate
        : dt.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    const dt = new Date(`${selectedMonth}-01T00:00:00`);
    return Number.isNaN(dt.getTime())
      ? selectedMonth
      : dt.toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });
  }, [reportMode, selectedDate, selectedMonth]);

  // Combine live delivered orders for this rider + seeded history, filtered by Daily or Monthly report period
  const monthlyEntries = useMemo<RiderEarningEntry[]>(() => {
    const seedEntries = getSeedRiderMonthlyEarnings().filter(
      (e) => e.riderId === rider.id
    );

    const liveDelivered: RiderEarningEntry[] = orders
      .filter((o) => o.status === 'delivered' && o.riderId === rider.id)
      .map((o) => {
        const resolvedDistanceKm =
          typeof o.distanceKm === 'number' && o.distanceKm > 0
            ? Number(o.distanceKm.toFixed(1))
            : calculateRoadDistanceKm(
                { lat: o.restaurantLat, lng: o.restaurantLng },
                { lat: o.deliveryLat, lng: o.deliveryLng }
              );
        const riderPay =
          typeof o.riderEarningPkr === 'number'
            ? o.riderEarningPkr
            : calculateRiderDeliveryEarningPkr(resolvedDistanceKm, rates);
        return {
          id: `live-${o.id}`,
          orderCode: o.orderCode,
          riderId: rider.id,
          restaurantName: o.restaurantName,
          dropoffArea: o.deliveryAddress,
          city: o.city,
          deliveryFeePkr: riderPay,
          tipPkr: o.tipPkr ?? 0,
          paymentMethod: o.paymentMethod,
          completedAt: o.updatedAt || o.createdAt,
          distanceKm: resolvedDistanceKm,
          source: 'live',
        };
      });

    // Deduplicate by orderCode (prefer live order record)
    const seenCodes = new Set(liveDelivered.map((e) => e.orderCode));
    const merged = [
      ...liveDelivered,
      ...seedEntries
        .filter((e) => !seenCodes.has(e.orderCode))
        .map((e) => ({
          ...e,
          distanceKm: typeof e.distanceKm === 'number' && e.distanceKm > 0 ? Number(e.distanceKm.toFixed(1)) : 3.0,
        })),
    ].filter((entry) => {
      const iso = (entry.completedAt || '').slice(0, reportMode === 'daily' ? 10 : 7);
      return reportMode === 'daily' ? iso === selectedDate : iso === selectedMonth;
    });

    return merged.sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
  }, [orders, rider.id, reportMode, selectedDate, selectedMonth, rates]);

  const ownerAdjustmentPkr = reportMode === 'monthly' ? rider.walletBonusPkr || 0 : 0;

  const summary = useMemo(() => {
    const totalDeliveryFees = monthlyEntries.reduce((s, e) => s + e.deliveryFeePkr, 0);
    const totalTips = monthlyEntries.reduce((s, e) => s + e.tipPkr, 0);
    const grandTotal = totalDeliveryFees + totalTips + ownerAdjustmentPkr;
    const deliveriesCount = monthlyEntries.length;
    const totalDistanceKm = Number(
      monthlyEntries.reduce((s, e) => s + (e.distanceKm ?? 0), 0).toFixed(1)
    );
    const avgDistanceKm =
      deliveriesCount > 0 ? Number((totalDistanceKm / deliveriesCount).toFixed(1)) : 0;
    const tippedCount = monthlyEntries.filter((e) => e.tipPkr > 0).length;
    const avgPerDelivery =
      deliveriesCount > 0 ? Math.round((totalDeliveryFees + totalTips) / deliveriesCount) : 0;
    const tripsTotal = totalDeliveryFees + totalTips;
    const feeSharePct = tripsTotal > 0 ? Math.round((totalDeliveryFees / tripsTotal) * 100) : 0;
    const tipSharePct = tripsTotal > 0 ? 100 - feeSharePct : 0;

    // Only COD orders that aren't marked already paid on WhatsApp contribute to rider cash collection amount
    const codCashCollectedPkr = orders
      .filter((o) => {
        if (
          o.riderId !== rider.id ||
          o.status !== 'delivered' ||
          o.paymentMethod !== 'COD' ||
          o.whatsappAmountAlreadyPaid
        ) {
          return false;
        }
        const iso = (o.updatedAt || o.createdAt || '').slice(
          0,
          reportMode === 'daily' ? 10 : 7
        );
        return reportMode === 'daily' ? iso === selectedDate : iso === selectedMonth;
      })
      .reduce((s, o) => s + o.totalPkr, 0);
    const onlinePrepaidCount = monthlyEntries.filter((e) => {
      const matched = orders.find((o) => o.orderCode === e.orderCode);
      return e.paymentMethod !== 'COD' || Boolean(matched?.whatsappAmountAlreadyPaid);
    }).length;

    return {
      totalDeliveryFees,
      totalTips,
      grandTotal,
      deliveriesCount,
      totalDistanceKm,
      avgDistanceKm,
      tippedCount,
      avgPerDelivery,
      feeSharePct,
      tipSharePct,
      codCashCollectedPkr,
      onlinePrepaidCount,
    };
  }, [monthlyEntries, ownerAdjustmentPkr, orders, rider.id, reportMode, selectedDate, selectedMonth]);

  // Weekly breakdown (Weeks 1 - 4 of current month)
  const weeklyChartData = useMemo(() => {
    const buckets = [
      { week: 'Week 1', deliveryFees: 0, tips: 0, deliveries: 0 },
      { week: 'Week 2', deliveryFees: 0, tips: 0, deliveries: 0 },
      { week: 'Week 3', deliveryFees: 0, tips: 0, deliveries: 0 },
      { week: 'Week 4', deliveryFees: 0, tips: 0, deliveries: 0 },
    ];

    monthlyEntries.forEach((entry) => {
      const day = new Date(entry.completedAt).getDate();
      const idx = Math.min(3, Math.floor((day - 1) / 7));
      buckets[idx].deliveryFees += entry.deliveryFeePkr;
      buckets[idx].tips += entry.tipPkr;
      buckets[idx].deliveries += 1;
    });

    return buckets;
  }, [monthlyEntries]);

  const filteredEntries = useMemo(() => {
    return monthlyEntries.filter((e) => {
      if (filter === 'tipped') return e.tipPkr > 0;
      if (filter === 'cod') return e.paymentMethod === 'COD';
      if (filter === 'prepaid') return e.paymentMethod !== 'COD';
      return true;
    });
  }, [monthlyEntries, filter]);

  const filteredTotals = useMemo(() => {
    const fees = filteredEntries.reduce((s, e) => s + e.deliveryFeePkr, 0);
    const tips = filteredEntries.reduce((s, e) => s + e.tipPkr, 0);
    const distanceKm = Number(
      filteredEntries.reduce((s, e) => s + (e.distanceKm ?? 0), 0).toFixed(1)
    );
    return { fees, tips, total: fees + tips, distanceKm };
  }, [filteredEntries]);

  const handleDownloadStatementCsv = () => {
    const periodKey = reportMode === 'daily' ? selectedDate : selectedMonth;
    const rows: Array<Array<string | number>> = filteredEntries.map((entry) => [
      entry.orderCode,
      entry.completedAt,
      entry.restaurantName,
      entry.dropoffArea,
      entry.city,
      (entry.distanceKm ?? 0).toFixed(1),
      entry.paymentMethod,
      entry.deliveryFeePkr,
      entry.tipPkr,
      entry.deliveryFeePkr + entry.tipPkr,
    ]);
    rows.push([
      'TOTAL',
      periodLabel,
      `${filteredEntries.length} delivered orders`,
      `Avg ${
        filteredEntries.length > 0
          ? (filteredTotals.distanceKm / filteredEntries.length).toFixed(1)
          : '0.0'
      } km/order`,
      rider.city,
      filteredTotals.distanceKm.toFixed(1),
      'ALL',
      filteredTotals.fees,
      filteredTotals.tips,
      filteredTotals.total,
    ]);
    downloadCsv(
      `hsp-rider-${reportMode}-report-${rider.name.toLowerCase().replace(/\s+/g, '-')}-${periodKey}.csv`,
      [
        'Order Code',
        'Date',
        'Store / Business',
        'Dropoff Area',
        'City',
        'Distance (km)',
        'Method',
        'Rider Delivery Pay (PKR)',
        'Customer Tip (PKR)',
        'Total Trip Earning (PKR)',
      ],
      rows
    );
  };

  return (
    <div className="space-y-6">
      {/* Rider Profile & Daily/Monthly Report Banner */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#0E0E14] border border-amber-500/35 shadow-xl space-y-4 print-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-400 text-zinc-950 flex items-center justify-center shadow-lg shadow-amber-500/25 shrink-0">
              <Wallet className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-yellow-400">
                  Rider {reportMode === 'daily' ? 'Daily' : 'Monthly'} Payout Report
                </span>
                {rider.loginId && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/35 font-mono-tabular text-[10px] font-extrabold text-amber-300">
                    ID: {rider.loginId}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                  <Calendar className="w-3.5 h-3.5" />
                  {periodLabel}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold text-white mt-0.5">
                {rider.name}{' '}
                <span className="text-sm font-bold text-amber-400">
                  ({rider.city} · {rider.vehiclePlate})
                </span>
              </h2>
              <p className="text-xs font-semibold text-zinc-400 mt-0.5">
                Rate: {formatRiderRateSummary(rates)} + 100% of customer tips
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-5">
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Total KM ({reportMode === 'daily' ? 'Day' : 'Month'})
                </p>
                <p className="text-base font-extrabold text-yellow-400 font-mono-tabular">
                  {summary.totalDistanceKm.toFixed(1)} km
                </p>
              </div>
              <div className="h-8 w-px bg-zinc-800" />
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Rider Rating
                </p>
                <p className="text-base font-extrabold text-yellow-400 inline-flex items-center gap-1 font-mono-tabular">
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  {rider.rating.toFixed(1)}
                </p>
              </div>
              <div className="h-8 w-px bg-zinc-800" />
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Avg / Trip
                </p>
                <p className="text-base font-extrabold text-white font-mono-tabular">
                  {formatPkr(summary.avgPerDelivery)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 no-print">
              <button
                type="button"
                onClick={() =>
                  triggerPrintWithTitle(`HSP-Rider-${reportMode}-Report-${rider.name}-${periodLabel}`)
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-amber-400 hover:text-yellow-300 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                Print {reportMode === 'daily' ? 'Daily' : 'Monthly'} Report
              </button>
              <button
                type="button"
                onClick={handleDownloadStatementCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 transition-all shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                Download CSV
              </button>
            </div>
          </div>
        </div>

        {/* Daily / Monthly Period Filter Bar */}
        <div className="pt-3 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-900 border border-zinc-800">
            <button
              type="button"
              onClick={() => setReportMode('daily')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                reportMode === 'daily'
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950'
                  : 'text-zinc-300 hover:text-yellow-300'
              }`}
            >
              Daily Report
            </button>
            <button
              type="button"
              onClick={() => setReportMode('monthly')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                reportMode === 'monthly'
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950'
                  : 'text-zinc-300 hover:text-yellow-300'
              }`}
            >
              Monthly Report
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-yellow-400" />
            {reportMode === 'daily' ? (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-1.5 text-xs font-mono-tabular font-bold bg-zinc-950 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
              />
            ) : (
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-1.5 text-xs font-mono-tabular font-bold bg-zinc-950 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
              />
            )}
          </div>
        </div>
      </div>

      {/* 5 KPI Cards (Includes Daily/Monthly Total KM Traveled) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-5 rounded-2xl bg-[#0E0E14] border border-amber-500/35 shadow-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-yellow-400">
              {reportMode === 'daily' ? 'Daily Payable' : 'Monthly Payable'}
            </span>
            <Banknote className="w-5 h-5 text-yellow-400" />
          </div>
          <p className="text-2xl font-extrabold text-white font-mono-tabular">
            {formatPkr(summary.grandTotal)}
          </p>
          <p className="text-xs font-semibold text-zinc-400">
            {periodLabel}{ownerAdjustmentPkr !== 0 ? ` (${ownerAdjustmentPkr > 0 ? '+' : ''}${formatPkr(ownerAdjustmentPkr)} adj.)` : ''}
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[#0E0E14] border border-amber-500/40 shadow-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-yellow-400">
              Total KM Traveled
            </span>
            <Route className="w-5 h-5 text-yellow-400" />
          </div>
          <p className="text-2xl font-extrabold text-yellow-300 font-mono-tabular">
            {summary.totalDistanceKm.toFixed(1)} km
          </p>
          <p className="text-xs font-semibold text-zinc-400 font-mono-tabular">
            Avg {summary.avgDistanceKm.toFixed(1)} km / delivered order
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[#0E0E14] border border-zinc-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
              Delivery Earnings
            </span>
            <Coins className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-2xl font-extrabold text-white font-mono-tabular">
            {formatPkr(summary.totalDeliveryFees)}
          </p>
          <p className="text-xs font-semibold text-amber-300 font-mono-tabular">
            {summary.feeSharePct}% of trip earnings
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[#0E0E14] border border-emerald-500/30 shadow-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-400">
              Customer Tips
            </span>
            <Gift className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-400 font-mono-tabular">
            {formatPkr(summary.totalTips)}
          </p>
          <p className="text-xs font-semibold text-zinc-400">
            {summary.tipSharePct}% share · {summary.tippedCount} tipped orders
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[#0E0E14] border border-zinc-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
              Completed Trips
            </span>
            <TrendingUp className="w-5 h-5 text-yellow-400" />
          </div>
          <p className="text-2xl font-extrabold text-white font-mono-tabular">
            {summary.deliveriesCount}
          </p>
          <p className="text-xs font-semibold text-zinc-400">
            Base Monthly Salary: {formatPkr(rider.monthlySalaryPkr || 25000)}
          </p>
        </div>
      </div>

      {ownerAdjustmentPkr !== 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-400/35 flex items-center justify-between gap-3 text-xs">
          <span className="inline-flex items-center gap-2 font-bold text-amber-200">
            <Sparkles className="w-4 h-4 text-yellow-400" />
            App Owner Wallet Adjustment / Bonus applied to your account
          </span>
          <span className="font-mono-tabular font-extrabold text-yellow-300 text-sm">
            {ownerAdjustmentPkr > 0 ? `+${formatPkr(ownerAdjustmentPkr)}` : formatPkr(ownerAdjustmentPkr)}
          </span>
        </div>
      )}

      {/* Cash-in-Hand Rule Notice: Online Paid Orders Excluded from Rider Cash */}
      <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="font-bold text-emerald-300">
          Rider Cash-in-Hand (COD Orders Only):{' '}
          <strong className="font-mono-tabular text-white">
            {formatPkr(summary.codCashCollectedPkr)}
          </strong>
        </span>
        <span className="font-semibold text-zinc-300">
          {summary.onlinePrepaidCount} online-paid orders excluded from rider cash (Rs. 0 cash collected)
        </span>
      </div>

      {/* Earnings Split Bar + Weekly Recharts Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 p-5 sm:p-6 rounded-2xl bg-[#0E0E14] border border-zinc-800 shadow-xl flex flex-col justify-between space-y-5">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-400">
              Payout Composition
            </p>
            <h3 className="text-base font-extrabold text-white mt-0.5">
              Delivery Pay vs. Customer Tips
            </h3>
            <p className="text-xs font-semibold text-zinc-400 mt-1">
              {formatRiderRateSummary(rates)}, plus 100% of customer tips.
            </p>
          </div>

          <div className="space-y-4">
            <div className="h-4 w-full rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden flex">
              <div
                style={{ width: `${summary.feeSharePct}%` }}
                className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-500"
                title={`Delivery Pay: ${summary.feeSharePct}%`}
              />
              <div
                style={{ width: `${summary.tipSharePct}%` }}
                className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-500"
                title={`Tips: ${summary.tipSharePct}%`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                  Delivery Pay
                </div>
                <p className="text-lg font-extrabold text-white font-mono-tabular mt-1">
                  {formatPkr(summary.totalDeliveryFees)}
                </p>
                <p className="text-[11px] font-bold text-amber-400 font-mono-tabular">
                  {summary.feeSharePct}% of trip total
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-emerald-500/25">
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  Customer Tips
                </div>
                <p className="text-lg font-extrabold text-emerald-400 font-mono-tabular mt-1">
                  {formatPkr(summary.totalTips)}
                </p>
                <p className="text-[11px] font-bold text-emerald-400 font-mono-tabular">
                  {summary.tipSharePct}% of trip total
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 p-5 sm:p-6 rounded-2xl bg-[#0E0E14] border border-zinc-800 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-400">
                Weekly Breakdown · {periodLabel}
              </p>
              <h3 className="text-base font-extrabold text-white mt-0.5">
                Delivery Pay &amp; Tips Earned by Week
              </h3>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold">
              <span className="inline-flex items-center gap-1.5 text-yellow-400">
                <span className="w-2.5 h-2.5 rounded-sm bg-yellow-400" />
                Delivery Pay
              </span>
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
                Tips
              </span>
            </div>
          </div>

          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyChartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="week"
                  tick={{ fill: '#a1a1aa', fontSize: 12, fontWeight: 700 }}
                  axisLine={{ stroke: '#3f3f46' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#a1a1aa', fontSize: 11, fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `Rs.${v}`}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(250, 204, 21, 0.08)' }}
                  contentStyle={{
                    backgroundColor: '#0B0B10',
                    border: '1px solid rgba(250, 204, 21, 0.4)',
                    borderRadius: '12px',
                    color: '#fafafa',
                    fontSize: '12px',
                    fontWeight: 700,
                  }}
                  formatter={(value: unknown, name: unknown) => [
                    formatPkr(Number(value) || 0),
                    name === 'deliveryFees' ? 'Delivery Pay' : 'Customer Tips',
                  ]}
                />
                <Bar
                  dataKey="deliveryFees"
                  stackId="earnings"
                  fill="#FACC15"
                  radius={[0, 0, 4, 4]}
                  maxBarSize={44}
                />
                <Bar
                  dataKey="tips"
                  stackId="earnings"
                  fill="#34D399"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={44}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Itemized Monthly Payout Ledger */}
      <section className="rounded-2xl bg-[#0E0E14] border border-zinc-800 shadow-xl overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/35 text-yellow-400 flex items-center justify-center shrink-0">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                Itemized Delivery, Distance (KM) &amp; Tip Breakdown ({filteredEntries.length})
              </h3>
              <p className="text-xs font-semibold text-zinc-400">
                Every delivered order by {rider.name} ({periodLabel}) · Total:{' '}
                <span className="font-mono-tabular font-extrabold text-yellow-300">
                  {filteredTotals.distanceKm.toFixed(1)} km
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl no-print">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'tipped', label: 'With Tips' },
                { id: 'cod', label: 'COD' },
                { id: 'prepaid', label: 'Prepaid' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                  filter === tab.id
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 shadow-sm'
                    : 'text-zinc-400 hover:text-amber-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Wallet className="w-8 h-8 text-yellow-400/70 mx-auto" />
            <p className="text-sm font-extrabold text-white">
              No completed deliveries match this filter yet
            </p>
            <p className="text-xs font-semibold text-zinc-400">
              Complete a delivery in the Dispatch &amp; Nav tab to see distance (km) and earnings credit to your wallet live.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] font-extrabold uppercase tracking-wider text-zinc-400 bg-zinc-900/60">
                  <th className="py-3.5 px-5">Order &amp; Date</th>
                  <th className="py-3.5 px-4">Pickup &amp; Drop-off</th>
                  <th className="py-3.5 px-4">Payment</th>
                  <th className="py-3.5 px-4 text-right">Distance (km)</th>
                  <th className="py-3.5 px-4 text-right">Delivery Pay</th>
                  <th className="py-3.5 px-4 text-right">Tip</th>
                  <th className="py-3.5 px-5 text-right">Total Earned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80 text-xs">
                {filteredEntries.map((entry) => {
                  const totalEarned = entry.deliveryFeePkr + entry.tipPkr;
                  const formattedDate = new Date(entry.completedAt).toLocaleDateString('en-PK', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <tr key={entry.id} className="hover:bg-zinc-900/50 transition-colors">
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <p className="font-mono-tabular font-extrabold text-yellow-400">
                          {entry.orderCode}
                          {entry.source === 'live' && (
                            <span className="ml-2 text-[10px] font-extrabold uppercase text-emerald-400">
                              Live
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] font-semibold text-zinc-500 mt-0.5">
                          {formattedDate}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 min-w-[220px]">
                        <p className="font-extrabold text-white inline-flex items-center gap-1.5">
                          <Store className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          {entry.restaurantName}
                        </p>
                        <p className="text-[11px] font-semibold text-zinc-400 mt-0.5 inline-flex items-center gap-1.5">
                          <MapPin className="w-3 h-3 text-zinc-500 shrink-0" />
                          {entry.dropoffArea}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          {(() => {
                            const matchedOrder = orders.find((o) => o.orderCode === entry.orderCode);
                            const isWaOrder = matchedOrder?.orderSource === 'whatsapp';
                            return (
                              <>
                                <span className="font-mono-tabular text-[11px] font-extrabold text-zinc-300">
                                  {isWaOrder ? 'WhatsApp · ' : ''}
                                  {entry.paymentMethod}
                                  {entry.paymentMethod !== 'COD' || matchedOrder?.whatsappAmountAlreadyPaid
                                    ? ' (Rs. 0 Cash)'
                                    : ''}
                                </span>
                                {isWaOrder && matchedOrder && (
                                  matchedOrder.whatsappAmountAlreadyPaid ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-400">
                                      <CheckCircle2 className="w-3 h-3" />
                                      Amount Already Paid ✓
                                    </span>
                                  ) : onMarkWhatsAppAmountAlreadyPaid ? (
                                    <button
                                      type="button"
                                      onClick={() => onMarkWhatsAppAmountAlreadyPaid(matchedOrder.id)}
                                      className="w-fit px-2 py-1 rounded-md bg-emerald-500/20 border border-emerald-400/50 text-[10px] font-extrabold text-emerald-300 hover:bg-emerald-500 hover:text-zinc-950 transition-colors no-print"
                                    >
                                      Amount Already Paid
                                    </button>
                                  ) : null
                                )}
                                {entry.paymentMethod !== 'COD' && matchedOrder && (
                                  matchedOrder.officeSettled ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-400">
                                      <CheckCircle2 className="w-3 h-3" />
                                      Paid to Office
                                    </span>
                                  ) : onMarkPaidToOffice ? (
                                    <button
                                      type="button"
                                      onClick={() => onMarkPaidToOffice(matchedOrder.id)}
                                      className="w-fit px-2 py-1 rounded-md bg-amber-500/20 border border-amber-400/50 text-[10px] font-extrabold text-yellow-300 hover:bg-amber-500 hover:text-zinc-950 transition-colors no-print"
                                    >
                                      Paid to Office
                                    </button>
                                  ) : null
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono-tabular font-extrabold text-yellow-300">
                        {(entry.distanceKm ?? 0).toFixed(1)} km
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono-tabular font-bold text-amber-300">
                        {formatPkr(entry.deliveryFeePkr)}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono-tabular font-extrabold">
                        {entry.tipPkr > 0 ? (
                          <span className="text-emerald-400">+{formatPkr(entry.tipPkr)}</span>
                        ) : (
                          <span className="text-zinc-500">Rs. 0</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap font-mono-tabular font-extrabold text-white">
                        {formatPkr(totalEarned)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-amber-500/35 bg-amber-500/10 text-xs font-extrabold">
                  <td colSpan={3} className="py-4 px-5 text-yellow-300 uppercase tracking-wider">
                    {reportMode === 'daily' ? 'Daily' : 'Monthly'} Filtered Total ({filteredEntries.length}{' '}
                    {filteredEntries.length === 1 ? 'delivery' : 'deliveries'})
                  </td>
                  <td className="py-4 px-4 text-right font-mono-tabular text-yellow-300 whitespace-nowrap">
                    {filteredTotals.distanceKm.toFixed(1)} km
                  </td>
                  <td className="py-4 px-4 text-right font-mono-tabular text-amber-300 whitespace-nowrap">
                    {formatPkr(filteredTotals.fees)}
                  </td>
                  <td className="py-4 px-4 text-right font-mono-tabular text-emerald-400 whitespace-nowrap">
                    {formatPkr(filteredTotals.tips)}
                  </td>
                  <td className="py-4 px-5 text-right font-mono-tabular text-yellow-400 text-sm whitespace-nowrap">
                    {formatPkr(filteredTotals.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
