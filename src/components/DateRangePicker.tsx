import { Calendar } from 'lucide-react';

export interface DateRangeValue {
  startDate: string;
  endDate: string;
}

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (next: DateRangeValue) => void;
  className?: string;
}

function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateRangeLabel(startDate: string, endDate: string): string {
  const s = new Date(`${startDate}T00:00:00`);
  const e = new Date(`${endDate}T00:00:00`);
  const sText = Number.isNaN(s.getTime())
    ? startDate
    : s.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
  const eText = Number.isNaN(e.getTime())
    ? endDate
    : e.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
  return startDate === endDate ? sText : `${sText} – ${eText}`;
}

export function DateRangePicker({
  startDate,
  endDate,
  onChange,
  className = '',
}: DateRangePickerProps) {
  const today = new Date();
  const todayIso = toIsoDate(today);

  const daysAgoIso = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return toIsoDate(d);
  };

  const monthStartIso = toIsoDate(new Date(today.getFullYear(), today.getMonth(), 1));

  const presets: Array<{ label: string; start: string; end: string }> = [
    { label: 'Today', start: todayIso, end: todayIso },
    { label: 'Last 7d', start: daysAgoIso(6), end: todayIso },
    { label: 'This Month', start: monthStartIso, end: todayIso },
    { label: 'Last 30d', start: daysAgoIso(29), end: todayIso },
  ];

  const handleStartChange = (nextStart: string) => {
    if (!nextStart) return;
    if (endDate && nextStart > endDate) {
      onChange({ startDate: nextStart, endDate: nextStart });
    } else {
      onChange({ startDate: nextStart, endDate: endDate || nextStart });
    }
  };

  const handleEndChange = (nextEnd: string) => {
    if (!nextEnd) return;
    if (startDate && nextEnd < startDate) {
      onChange({ startDate: nextEnd, endDate: nextEnd });
    } else {
      onChange({ startDate: startDate || nextEnd, endDate: nextEnd });
    }
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-2 p-1.5 rounded-xl bg-zinc-950 border border-amber-500/35 ${className}`}
    >
      <div className="flex items-center gap-1.5 pl-1.5">
        <Calendar className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
        <label className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
          From
        </label>
        <input
          type="date"
          value={startDate}
          max={endDate || undefined}
          onChange={(e) => handleStartChange(e.target.value)}
          aria-label="Start date"
          className="px-2 py-1 text-xs font-mono-tabular font-bold bg-zinc-900 text-white rounded-lg border border-zinc-700 focus:outline-none focus:border-amber-400"
        />
      </div>

      <span className="text-xs font-bold text-zinc-500">→</span>

      <div className="flex items-center gap-1.5">
        <label className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
          To
        </label>
        <input
          type="date"
          value={endDate}
          min={startDate || undefined}
          onChange={(e) => handleEndChange(e.target.value)}
          aria-label="End date"
          className="px-2 py-1 text-xs font-mono-tabular font-bold bg-zinc-900 text-white rounded-lg border border-zinc-700 focus:outline-none focus:border-amber-400"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1 pl-1 border-l border-zinc-800">
        {presets.map((preset) => {
          const isActive = startDate === preset.start && endDate === preset.end;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange({ startDate: preset.start, endDate: preset.end })}
              className={`px-2 py-1 rounded-lg text-[11px] font-extrabold transition-colors ${
                isActive
                  ? 'bg-amber-500/20 text-yellow-300 border border-amber-400/50'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
