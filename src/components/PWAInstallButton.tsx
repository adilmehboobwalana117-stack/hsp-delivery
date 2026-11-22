import React, { useState } from 'react';
import { Check, Copy, Download, Share2, Smartphone, UserCheck, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  onInstalledRolePrompt?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  onInstalledRolePrompt,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (isInstalled) {
    return null;
  }

  const appUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/?download=1` : '';

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      setCopiedLink(false);
    }
  };

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) {
        onInstalledRolePrompt?.();
      }
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 shadow-[0_4px_18px_rgba(245,158,11,0.3)] transition-all whitespace-nowrap shrink-0"
      >
        <Download className="w-3.5 h-3.5 stroke-[2.5]" />
        Download App
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 no-print">
          <div className="w-full max-w-md rounded-2xl bg-[#0E0E14] border border-amber-500/35 p-6 shadow-2xl space-y-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-400 text-zinc-950 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Install HSP delivery App
                  </h3>
                  <p className="text-xs font-medium text-zinc-400">
                    Download directly from this link — choose your role after install
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="text-zinc-400 hover:text-amber-300 p-1"
                aria-label="Close install guide"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2 text-xs text-zinc-300">
                <p className="font-bold text-amber-300">On iPhone / iPad (Safari):</p>
                <p>1. Tap the <strong>Share</strong> icon in Safari&apos;s bottom toolbar.</p>
                <p>2. Scroll down and tap <strong>Add to Home Screen</strong>.</p>
                <p>3. Tap <strong>Add</strong> — then choose Customer, Rider, Staff, or Business Owner.</p>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2 text-xs text-zinc-300">
                <p className="font-bold text-amber-300">On Android / Chrome / Edge:</p>
                <p>1. Open this link in Chrome or Edge on your phone or PC.</p>
                <p>2. Tap the browser menu (<strong>⋮</strong>) or the install icon in the address bar.</p>
                <p>3. Tap <strong>Install App</strong> — then pick Customer, Rider, Staff, or Business Owner.</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Share2 className="w-3.5 h-3.5 text-amber-400" />
                Direct App Download Link
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={appUrl}
                  className="flex-1 px-3 py-2 text-xs font-mono-tabular rounded-xl bg-zinc-900 border border-zinc-700 text-amber-200"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 inline-flex items-center gap-1.5 shrink-0"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedLink ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {onInstalledRolePrompt && (
                <button
                  type="button"
                  onClick={() => {
                    setShowGuide(false);
                    onInstalledRolePrompt();
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 inline-flex items-center justify-center gap-1.5 transition-all"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  Select My Role
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-bold hover:border-amber-500/40 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
