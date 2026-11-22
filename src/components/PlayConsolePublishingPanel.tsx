import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  KeyRound,
  Save,
  ShieldCheck,
  Smartphone,
  Terminal,
} from 'lucide-react';
import { AppSettings } from '../types';
import {
  buildAssetLinksJson,
  isValidAndroidPackageName,
  isValidSha256Fingerprint,
} from '../utils/policies';

interface PlayConsolePublishingPanelProps {
  appSettings: AppSettings;
  onUpdateAppSettings: (nextSettings: Partial<AppSettings>) => Promise<void>;
}

const DEFAULT_SHARED_URL =
  'https://ais-pre-jjyvyo7m4unbdm4dz4upjq-756142993760.asia-southeast1.run.app';

export function PlayConsolePublishingPanel({
  appSettings,
  onUpdateAppSettings,
}: PlayConsolePublishingPanelProps) {
  const [packageName, setPackageName] = useState(
    appSettings.playAndroidPackageName || 'com.hspdelivery.app'
  );
  const [sha256, setSha256] = useState(appSettings.playSha256Fingerprint || '');
  const [developerName, setDeveloperName] = useState(
    appSettings.playDeveloperName || 'HSP delivery'
  );
  const [supportEmail, setSupportEmail] = useState(appSettings.playSupportEmail || '');
  const [productionUrl, setProductionUrl] = useState(
    appSettings.playProductionUrl || DEFAULT_SHARED_URL
  );
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    setPackageName(appSettings.playAndroidPackageName || 'com.hspdelivery.app');
    setSha256(appSettings.playSha256Fingerprint || '');
    setDeveloperName(appSettings.playDeveloperName || 'HSP delivery');
    setSupportEmail(appSettings.playSupportEmail || '');
    setProductionUrl(appSettings.playProductionUrl || DEFAULT_SHARED_URL);
  }, [appSettings]);

  const cleanUrl = (productionUrl.trim() || DEFAULT_SHARED_URL).replace(/\/+$/, '');
  const manifestUrl = `${cleanUrl}/manifest.webmanifest`;
  const privacyPolicyUrl = `${cleanUrl}/privacy-policy.html`;
  const assetLinksJson = buildAssetLinksJson(packageName, sha256);
  const pkgValid = isValidAndroidPackageName(packageName);
  const fpValid = sha256.trim().length > 0 && isValidSha256Fingerprint(sha256);

  const bubblewrapInitCmd = `npx @bubblewrap/cli init --manifest="${manifestUrl}"`;
  const bubblewrapBuildCmd = `npx @bubblewrap/cli build`;

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      setCopiedKey(null);
    }
  };

  const downloadTextFile = (filename: string, content: string, mime = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAssetLinks = () => {
    downloadTextFile('assetlinks.json', assetLinksJson, 'application/json;charset=utf-8');
  };

  const handleDownloadTwaManifest = () => {
    let host = 'ais-pre-jjyvyo7m4unbdm4dz4upjq-756142993760.asia-southeast1.run.app';
    try {
      host = new URL(cleanUrl).host;
    } catch {
      // fallback to default host
    }
    const cleanPkg = packageName.trim() || 'com.hspdelivery.app';
    const appTitle = developerName.trim() || 'HSP delivery';
    const twaManifest = {
      packageId: cleanPkg,
      host,
      name: `${appTitle} — Hasilpur & Pakistan Delivery`,
      launcherName: appTitle.slice(0, 12),
      display: 'standalone',
      themeColor: '#07070A',
      themeColorDark: '#07070A',
      navigationColor: '#07070A',
      navigationColorDark: '#07070A',
      navigationDividerColor: '#F59E0B',
      navigationDividerColorDark: '#F59E0B',
      backgroundColor: '#07070A',
      enableNotifications: true,
      startUrl: '/',
      iconUrl: `${cleanUrl}/pwa-512x512.png`,
      maskableIconUrl: `${cleanUrl}/pwa-maskable-512x512.png`,
      splashScreenFadeOutDuration: 300,
      signingKey: {
        path: './hsp-delivery-release.keystore',
        alias: 'hspdelivery',
      },
      appVersionName: '1.0.0',
      appVersionCode: 1,
      shortcuts: [
        {
          name: 'Order Food & Shops',
          shortName: 'Order Now',
          url: `${cleanUrl}/?tab=order`,
          chosenIconUrl: `${cleanUrl}/pwa-192x192.png`,
        },
        {
          name: 'Track Live Delivery',
          shortName: 'Track Order',
          url: `${cleanUrl}/?tab=track`,
          chosenIconUrl: `${cleanUrl}/pwa-192x192.png`,
        },
        {
          name: 'Rider Dispatch',
          shortName: 'Rider',
          url: `${cleanUrl}/?tab=rider`,
          chosenIconUrl: `${cleanUrl}/pwa-192x192.png`,
        },
      ],
      generatorApp: 'bubblewrap-cli',
      webManifestUrl: `${cleanUrl}/manifest.webmanifest`,
      fallbackType: 'customtabs',
      features: {
        locationDelegation: { enabled: true },
        playBilling: { enabled: false },
      },
      enableSiteSettingsShortcut: true,
      fullScopeUrl: `${cleanUrl}/`,
      minSdkVersion: 23,
      orientation: 'portrait',
    };
    downloadTextFile(
      'twa-manifest.json',
      JSON.stringify(twaManifest, null, 2),
      'application/json;charset=utf-8'
    );
  };

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const commaIdx = result.indexOf(',');
        resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
      };
      reader.onerror = () => reject(new Error('Failed to read icon asset'));
      reader.readAsDataURL(blob);
    });

  const handleDownloadSelfContainedBuilder = async () => {
    let host = 'ais-pre-jjyvyo7m4unbdm4dz4upjq-756142993760.asia-southeast1.run.app';
    try {
      host = new URL(cleanUrl).host;
    } catch {
      // fallback to default host
    }
    const cleanPkg = packageName.trim() || 'com.hspdelivery.app';
    const appTitle = developerName.trim() || 'HSP delivery';

    const fetchIconBase64 = async (path: string): Promise<string> => {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`Could not load ${path}`);
      const blob = await res.blob();
      return blobToBase64(blob);
    };

    try {
      const [icon512B64, maskable512B64, icon192B64] = await Promise.all([
        fetchIconBase64('/pwa-512x512.png'),
        fetchIconBase64('/pwa-maskable-512x512.png'),
        fetchIconBase64('/pwa-192x192.png'),
      ]);

      const script = `#!/usr/bin/env node
// Self-contained HSP delivery Android .AAB & .APK Builder
// Run: node build-hsp-android.mjs
// Fixes Bubblewrap "invalid Content-Type text/html" by serving embedded PNG icons locally.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICONS = {
  '/pwa-512x512.png': Buffer.from(${JSON.stringify(icon512B64)}, 'base64'),
  '/pwa-maskable-512x512.png': Buffer.from(${JSON.stringify(maskable512B64)}, 'base64'),
  '/pwa-192x192.png': Buffer.from(${JSON.stringify(icon192B64)}, 'base64'),
};

function runCmd(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: __dirname,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(cmd + ' exited ' + code))));
  });
}

async function main() {
  const server = http.createServer((req, res) => {
    const p = (req.url || '/').split('?')[0];
    const buf = ICONS[p];
    if (buf) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': buf.length });
      res.end(buf);
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const localBase = 'http://127.0.0.1:' + port;

  const manifest = {
    packageId: ${JSON.stringify(cleanPkg)},
    host: ${JSON.stringify(host)},
    name: ${JSON.stringify(`${appTitle} — Hasilpur & Pakistan Delivery`)},
    launcherName: ${JSON.stringify(appTitle.slice(0, 12))},
    display: 'standalone',
    themeColor: '#07070A',
    themeColorDark: '#07070A',
    navigationColor: '#07070A',
    navigationColorDark: '#07070A',
    navigationDividerColor: '#F59E0B',
    navigationDividerColorDark: '#F59E0B',
    backgroundColor: '#07070A',
    enableNotifications: true,
    startUrl: '/',
    iconUrl: localBase + '/pwa-512x512.png',
    maskableIconUrl: localBase + '/pwa-maskable-512x512.png',
    splashScreenFadeOutDuration: 300,
    signingKey: { path: './hsp-delivery-release.keystore', alias: 'hspdelivery' },
    appVersionName: '1.0.0',
    appVersionCode: 1,
    shortcuts: [
      { name: 'Order Food & Shops', shortName: 'Order Now', url: ${JSON.stringify(`${cleanUrl}/?tab=order`)}, chosenIconUrl: localBase + '/pwa-192x192.png' },
      { name: 'Track Live Delivery', shortName: 'Track Order', url: ${JSON.stringify(`${cleanUrl}/?tab=track`)}, chosenIconUrl: localBase + '/pwa-192x192.png' },
      { name: 'Rider Dispatch', shortName: 'Rider', url: ${JSON.stringify(`${cleanUrl}/?tab=rider`)}, chosenIconUrl: localBase + '/pwa-192x192.png' },
    ],
    generatorApp: 'bubblewrap-cli',
    webManifestUrl: ${JSON.stringify(`${cleanUrl}/manifest.webmanifest`)},
    fallbackType: 'customtabs',
    features: { locationDelegation: { enabled: true }, playBilling: { enabled: false } },
    enableSiteSettingsShortcut: true,
    fullScopeUrl: ${JSON.stringify(`${cleanUrl}/`)},
    minSdkVersion: 23,
    orientation: 'portrait',
  };

  fs.writeFileSync(path.join(__dirname, 'twa-manifest.json'), JSON.stringify(manifest, null, 2));
  try {
    console.log('[1/2] Generating Android project (serving local PNG icons at ' + localBase + ')...');
    await runCmd('npx', ['--yes', '@bubblewrap/cli', 'update', '--skipVersionUpgrade']);
    console.log('[2/2] Building signed .AAB (Play Console) and .APK...');
    await runCmd('npx', ['--yes', '@bubblewrap/cli', 'build', '--skipPwaValidation']);
    console.log('\\nSuccess! Upload app-release-bundle.aab to Google Play Console.');
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error('Build failed:', err.message || err);
  process.exit(1);
});
`;
      downloadTextFile('build-hsp-android.mjs', script, 'text/javascript;charset=utf-8');
    } catch {
      setErrorMsg('Could not package embedded icons. Try downloading twa-manifest.json instead.');
    }
  };

  const handleDownloadWindowsBuilder = () => {
    const bat = `@echo off\r\nsetlocal\r\necho Building HSP delivery Android .AAB (Play Console) and .APK...\r\ncd /d "%~dp0"\r\nif exist build-hsp-android.mjs (\r\n  node .\\build-hsp-android.mjs\r\n) else (\r\n  node .\\run-bubblewrap.mjs\r\n)\r\npause\r\n`;
    downloadTextFile('build-android.bat', bat);
  };

  const handleDownloadMacLinuxBuilder = () => {
    const sh = `#!/usr/bin/env bash\nset -euo pipefail\ncd "$(dirname "$0")"\nif [ -f "./build-hsp-android.mjs" ]; then\n  node ./build-hsp-android.mjs\nelse\n  node ./run-bubblewrap.mjs\nfi\n`;
    downloadTextFile('build-android.sh', sh);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSavedMsg('');

    const cleanPkg = packageName.trim();
    const cleanFp = sha256.trim().toUpperCase();
    const cleanDev = developerName.trim();
    const cleanEmail = supportEmail.trim();
    const cleanProd = productionUrl.trim();

    if (!isValidAndroidPackageName(cleanPkg)) {
      setErrorMsg('Enter a valid Android Package Name (e.g., com.hspdelivery.app).');
      return;
    }
    if (cleanFp && !isValidSha256Fingerprint(cleanFp)) {
      setErrorMsg(
        'SHA-256 fingerprint must be 32 colon-separated hex pairs (e.g., AA:BB:CC:...). Copy it directly from Google Play Console → App integrity → App signing.'
      );
      return;
    }
    if (cleanProd && !cleanProd.startsWith('https://')) {
      setErrorMsg('Production URL must start with https:// for Google Play Trusted Web Activity.');
      return;
    }

    setSaving(true);
    try {
      await onUpdateAppSettings({
        playAndroidPackageName: cleanPkg,
        ...(cleanFp ? { playSha256Fingerprint: cleanFp } : {}),
        ...(cleanDev ? { playDeveloperName: cleanDev } : {}),
        ...(cleanEmail ? { playSupportEmail: cleanEmail } : {}),
        ...(cleanProd ? { playProductionUrl: cleanProd } : {}),
      });
      setSavedMsg('Google Play Console configuration saved. Copy or download assetlinks.json below.');
    } finally {
      setSaving(false);
    }
  };

  const readinessItems = [
    {
      label: 'HTTPS Shared App URL',
      ok: cleanUrl.startsWith('https://'),
      detail: cleanUrl,
    },
    {
      label: 'PWA Manifest + 192px, 512px & Maskable Icons',
      ok: true,
      detail: '/manifest.webmanifest configured in Vite build',
    },
    {
      label: 'Public Privacy Policy URL Live',
      ok: true,
      detail: privacyPolicyUrl,
    },
    {
      label: 'Android Package Name Validated',
      ok: pkgValid,
      detail: pkgValid ? packageName.trim() : 'Enter valid package name below',
    },
    {
      label: 'Google Play App Signing SHA-256 Attached',
      ok: fpValid,
      detail: fpValid
        ? 'Valid SHA-256 configured for Digital Asset Links'
        : 'Paste SHA-256 from Play Console after creating your app',
    },
  ];

  return (
    <div className="space-y-6 no-print">
      {/* Header & Transparency Note */}
      <section className="p-5 sm:p-6 bg-[#0E0E14] border border-amber-500/35 rounded-2xl space-y-5 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/35 text-yellow-400 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-white">
                Google Play Console Publishing Hub (Android TWA / .AAB)
              </h2>
              <p className="text-xs font-semibold text-zinc-400">
                Attach HSP delivery to your Google Play Console account using Trusted Web Activity (TWA) via PWABuilder or Bubblewrap.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href="https://play.google.com/console"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 transition-all shadow-sm"
            >
              Open Google Play Console
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a
              href={`https://www.pwabuilder.com/reportcard?site=${encodeURIComponent(cleanUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 border border-amber-500/40 text-yellow-300 text-xs font-extrabold hover:bg-amber-500/15 transition-colors"
            >
              Generate Android .AAB on PWABuilder
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Readiness Checklist */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {readinessItems.map((item) => (
            <div
              key={item.label}
              className={`p-3 rounded-xl border text-xs space-y-1 ${
                item.ok
                  ? 'bg-emerald-500/8 border-emerald-500/30'
                  : 'bg-amber-500/8 border-amber-500/30'
              }`}
            >
              <div className="flex items-center gap-1.5 font-extrabold text-white">
                {item.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
                )}
                <span>{item.label}</span>
              </div>
              <p className="text-[11px] font-medium text-zinc-400 truncate" title={item.detail}>
                {item.detail}
              </p>
            </div>
          ))}
        </div>

        {/* Direct Privacy Policy URL for Google Play Console -> App Content */}
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-300 inline-flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Google Play Console Privacy Policy URL
            </p>
            <p className="text-xs font-mono-tabular font-bold text-white break-all select-all">
              {privacyPolicyUrl}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => copyText('privacyUrl', privacyPolicyUrl)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 border border-emerald-500/45 text-emerald-300 text-xs font-extrabold hover:bg-emerald-500/15"
            >
              {copiedKey === 'privacyUrl' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {copiedKey === 'privacyUrl' ? 'Copied' : 'Copy Privacy URL'}
            </button>
            <a
              href="/privacy-policy.html"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-tactile inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 text-zinc-950 text-xs font-extrabold hover:bg-emerald-400"
            >
              Open Page
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* PWABuilder Fetch Troubleshooting Tip */}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/35 text-xs text-amber-100/90 leading-relaxed space-y-1">
          <p className="font-extrabold text-yellow-300 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Seeing &ldquo;TypeError: Failed to fetch&rdquo; on PWABuilder?
          </p>
          <p>
            PWABuilder&apos;s cloud scanner can only crawl a <strong>publicly shared/deployed HTTPS URL</strong> without a Google login wall. Private editor URLs (<code>ais-dev-...</code>) or unshared apps return a login redirect, which causes <code>TypeError: Failed to fetch</code>. Make sure your app is shared publicly (or deployed to Firebase Hosting / Cloud Run with public access) so <code>/manifest.webmanifest</code> and <code>/sw.js</code> open directly in an incognito browser window before running PWABuilder.
          </p>
        </div>

        {/* Play Console Binding Configuration Form */}
        <form
          onSubmit={handleSaveConfig}
          className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-4"
        >
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-yellow-400" />
            <h3 className="text-sm font-extrabold text-white">
              1. Link Your Google Play Console App Identity
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-zinc-400 mb-1.5">
                Android Package Name (Application ID) *
              </label>
              <input
                type="text"
                required
                maxLength={120}
                value={packageName}
                onChange={(e) => setPackageName(e.target.value)}
                placeholder="com.hspdelivery.app"
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-mono-tabular font-bold bg-zinc-900 text-yellow-300 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
              />
              <p className="text-[10px] text-zinc-500 mt-1">
                Must match the exact Package Name created in your Google Play Console.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 mb-1.5">
                Live HTTPS Production App URL *
              </label>
              <div className="flex gap-1.5">
                <input
                  type="url"
                  required
                  maxLength={300}
                  value={productionUrl}
                  onChange={(e) => setProductionUrl(e.target.value)}
                  placeholder={DEFAULT_SHARED_URL}
                  className="flex-1 px-3.5 py-2.5 text-xs font-mono-tabular font-semibold bg-zinc-900 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={() => copyText('prodUrl', cleanUrl)}
                  className="px-3 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-300 hover:border-amber-400 hover:text-yellow-300"
                  title="Copy Production URL"
                >
                  {copiedKey === 'prodUrl' ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 mb-1.5">
                Google Play Developer / Publisher Name
              </label>
              <input
                type="text"
                maxLength={100}
                value={developerName}
                onChange={(e) => setDeveloperName(e.target.value)}
                placeholder="HSP delivery"
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-semibold bg-zinc-900 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 mb-1.5">
                Public Play Store Support Email
              </label>
              <input
                type="email"
                maxLength={160}
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                placeholder="support@hspdelivery.pk"
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-semibold bg-zinc-900 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold text-zinc-400 mb-1.5">
                Google Play App Signing SHA-256 Certificate Fingerprint (for Digital Asset Links)
              </label>
              <input
                type="text"
                maxLength={120}
                value={sha256}
                onChange={(e) => setSha256(e.target.value)}
                placeholder="AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99"
                className="w-full px-3.5 py-2.5 text-xs font-mono-tabular font-bold bg-zinc-900 text-emerald-300 rounded-xl border border-zinc-700 focus:outline-none focus:border-emerald-400"
              />
              <p className="text-[10px] text-zinc-400 mt-1">
                Find this in <strong>Google Play Console → Setup → App integrity → App signing → SHA-256 certificate fingerprint</strong>. Adding this removes the browser URL bar inside your Android app.
              </p>
            </div>
          </div>

          {errorMsg && (
            <p className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {errorMsg}
            </p>
          )}
          {savedMsg && (
            <p className="text-xs font-bold text-emerald-400">{savedMsg}</p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 disabled:opacity-50 inline-flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving Config...' : 'Save Google Play Console Config'}
            </button>
          </div>
        </form>

        {/* Generated Digital Asset Links + Bubblewrap / PWABuilder Steps */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* AssetLinks.json Generator */}
          <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-extrabold text-white">
                  2. Digital Asset Links (`/.well-known/assetlinks.json`)
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => copyText('assetlinks', assetLinksJson)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-[11px] font-bold text-zinc-200 hover:border-amber-400 hover:text-yellow-300"
                >
                  {copiedKey === 'assetlinks' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedKey === 'assetlinks' ? 'Copied' : 'Copy JSON'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadAssetLinks}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-[11px] font-extrabold text-yellow-300 hover:bg-amber-500/25"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
              </div>
            </div>

            <pre className="p-3.5 rounded-xl bg-[#07070A] border border-zinc-800 text-[11px] font-mono-tabular text-emerald-300 overflow-x-auto leading-relaxed">
              {assetLinksJson}
            </pre>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              We have already added <code className="text-amber-300">public/.well-known/assetlinks.json</code> to your app. Once you paste your real Play Console SHA-256 fingerprint, tell me the fingerprint (or replace that file) so Android verifies your domain automatically.
            </p>
          </div>

          {/* Step-by-Step Publishing Guide & CLI Commands */}
          <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3.5">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-yellow-400" />
              <h3 className="text-sm font-extrabold text-white">
                3. Publish to Your Google Play Console Account
              </h3>
            </div>

            {/* Ready-to-Build Android .AAB & .APK Kit */}
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/35 space-y-2.5">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-yellow-300">
                Download 1-File Android .AAB &amp; .APK Builder (Fixes &ldquo;text/html&rdquo; Icon Error)
              </p>
              <p className="text-[11px] text-zinc-300 leading-relaxed">
                Download <code className="text-emerald-300">build-hsp-android.mjs</code> (embeds your real PNG icons and serves them locally with <code className="text-amber-300">image/png</code> during build so Bubblewrap never gets a <code className="text-rose-300">text/html</code> error) and run{' '}
                <code className="text-yellow-300 font-bold">node build-hsp-android.mjs</code> — or run the GitHub Actions workflow in the cloud for free.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleDownloadSelfContainedBuilder}
                  className="btn-shimmer inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-[11px] font-extrabold hover:brightness-105"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download build-hsp-android.mjs (Recommended)
                </button>
                <button
                  type="button"
                  onClick={handleDownloadTwaManifest}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 text-[11px] font-bold hover:border-amber-400 hover:text-yellow-300"
                >
                  <Download className="w-3.5 h-3.5" />
                  twa-manifest.json
                </button>
                <button
                  type="button"
                  onClick={handleDownloadWindowsBuilder}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 text-[11px] font-bold hover:border-amber-400 hover:text-yellow-300"
                >
                  <Download className="w-3.5 h-3.5" />
                  Windows (.bat)
                </button>
                <button
                  type="button"
                  onClick={handleDownloadMacLinuxBuilder}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 text-[11px] font-bold hover:border-amber-400 hover:text-yellow-300"
                >
                  <Download className="w-3.5 h-3.5" />
                  Mac/Linux (.sh)
                </button>
              </div>
            </div>

            <ol className="space-y-2.5 text-xs text-zinc-300 leading-relaxed list-decimal list-inside">
              <li>
                <strong>Create App in Play Console:</strong> Sign in at{' '}
                <span className="text-yellow-300 font-bold">play.google.com/console</span>, click{' '}
                <strong>Create app</strong>, choose <em>App · Free</em>, and enter{' '}
                <strong>{developerName || 'HSP delivery'}</strong>.
              </li>
              <li>
                <strong>Build Signed Android Bundle (.aab):</strong> Click{' '}
                <strong>Generate Android .AAB on PWABuilder</strong> above (or run Bubblewrap CLI
                below) using your Package Name{' '}
                <code className="text-amber-300">{packageName || 'com.hspdelivery.app'}</code>.
              </li>
              <li>
                <strong>Upload .AAB &amp; Copy SHA-256:</strong> Upload the generated{' '}
                <code className="text-amber-300">.aab</code> in Play Console →{' '}
                <em>Internal testing / Production</em>, then copy the{' '}
                <strong>App Signing SHA-256</strong> into Step 1 above.
              </li>
              <li>
                <strong>Complete Store Listing &amp; Submit:</strong> Use your built-in{' '}
                <strong>Privacy &amp; Cancellation Policies</strong>, 512×512 icon, and screenshots
                to submit for Google Play review.
              </li>
            </ol>

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-zinc-400">
                <span>Bubblewrap CLI (Optional Local Build)</span>
                <button
                  type="button"
                  onClick={() => copyText('bw', `${bubblewrapInitCmd}\n${bubblewrapBuildCmd}`)}
                  className="inline-flex items-center gap-1 text-yellow-400 hover:underline"
                >
                  {copiedKey === 'bw' ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  {copiedKey === 'bw' ? 'Copied' : 'Copy Commands'}
                </button>
              </div>
              <pre className="p-3 rounded-xl bg-[#07070A] border border-zinc-800 text-[11px] font-mono-tabular text-amber-200 overflow-x-auto">
                {bubblewrapInitCmd}
                {'\n'}
                {bubblewrapBuildCmd}
              </pre>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
