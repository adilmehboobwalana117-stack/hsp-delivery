import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, Download, FileText, Printer, ShieldCheck, Smartphone, Store } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { triggerPrintWithTitle } from '../utils/exportPrint';
import { PolicyModalTab } from './CancellationPolicyModal';

interface QRDownloadFooterProps {
  onOpenRoleSetup: () => void;
  onOpenPolicy?: (tab: PolicyModalTab) => void;
}

const FALLBACK_SHARE_URL =
  'https://ais-pre-jjyvyo7m4unbdm4dz4upjq-756142993760.asia-southeast1.run.app/?download=1';

export function QRDownloadFooter({ onOpenRoleSetup, onOpenPolicy }: QRDownloadFooterProps) {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [copied, setCopied] = useState(false);

  const downloadUrl =
    typeof window !== 'undefined' && window.location.origin
      ? `${window.location.origin}/?download=1`
      : FALLBACK_SHARE_URL;

  const handleDirectDownload = async () => {
    if (isInstallable) {
      const ok = await install();
      if (ok) {
        onOpenRoleSetup();
        return;
      }
    }
    onOpenRoleSetup();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(downloadUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <footer className="max-w-7xl w-full mx-auto px-4 sm:px-6 pb-24 lg:pb-10 pt-2 space-y-3">
      <div className="rounded-2xl bg-[#0D0D14] border border-amber-500/25 p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-5 shadow-xl print-card">
        <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
          <div className="p-2.5 rounded-2xl bg-white border-2 border-amber-400 shadow-md shrink-0">
            <QRCodeSVG
              value={downloadUrl}
              size={104}
              bgColor="#ffffff"
              fgColor="#09090b"
              level="M"
            />
          </div>

          <div className="space-y-1.5 max-w-lg">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-yellow-400 inline-flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5" />
              Direct QR App Download
            </p>
            <h3 className="text-base sm:text-lg font-display font-extrabold text-white">
              Scan QR to Download HSP delivery
            </h3>
            <p className="text-xs font-medium text-zinc-400 leading-relaxed">
              Scan with any phone camera to open &amp; install directly. Choose{' '}
              <span className="text-amber-300 font-semibold">Customer</span>,{' '}
              <span className="text-amber-300 font-semibold">Rider</span>,{' '}
              <span className="text-amber-300 font-semibold">Staff / Manager</span>, or{' '}
              <span className="text-amber-300 font-semibold">Business Owner</span>.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 shrink-0 no-print">
          {!isInstalled && (
            <button
              type="button"
              onClick={handleDirectDownload}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 transition-all shadow-sm"
            >
              <Download className="w-3.5 h-3.5 stroke-[2.5]" />
              Download App
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-bold hover:border-amber-400/60 hover:text-amber-200 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
            {copied ? 'Link Copied' : 'Copy Link'}
          </button>
          <button
            type="button"
            onClick={() => triggerPrintWithTitle('HSP-delivery-QR-Download-Poster')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-bold hover:border-amber-400/60 hover:text-amber-200 transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-amber-400" />
            Print QR
          </button>
        </div>
      </div>

      {/* Platform Policies Strip (Customer Cancellation, Business Owner Policy & Privacy) */}
      {onOpenPolicy && (
        <div className="rounded-xl bg-[#0B0B11] border border-zinc-800/90 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs no-print">
          <span className="text-[11px] font-semibold text-zinc-500">
            HSP delivery · Platform Policies &amp; Compliance
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenPolicy('customer')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-amber-400/60 hover:text-yellow-300 font-bold text-[11px] transition-colors"
            >
              <FileText className="w-3 h-3 text-amber-400" />
              Customer Cancellation Policy
            </button>
            <button
              type="button"
              onClick={() => onOpenPolicy('business')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-amber-400/60 hover:text-yellow-300 font-bold text-[11px] transition-colors"
            >
              <Store className="w-3 h-3 text-amber-400" />
              Business Owner Policy
            </button>
            <button
              type="button"
              onClick={() => onOpenPolicy('privacy')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-amber-400/60 hover:text-yellow-300 font-bold text-[11px] transition-colors"
            >
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Privacy Policy
            </button>
          </div>
        </div>
      )}
    </footer>
  );
}
