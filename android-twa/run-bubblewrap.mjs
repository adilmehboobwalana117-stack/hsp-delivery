#!/usr/bin/env node
/**
 * HSP delivery — Bulletproof Bubblewrap Android .AAB & .APK Runner
 *
 * Serves local PNG icons over 127.0.0.1 with strict `Content-Type: image/png`
 * and omits remote `webManifestUrl` during `bubblewrap update` & `bubblewrap build`
 * so Bubblewrap NEVER fails with `invalid Content-Type "text/html"` or
 * `Unexpected token '<', "<!doctype "... is not valid JSON` when the remote host
 * sits behind an auth proxy or interstitial page.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(__dirname, 'twa-manifest.json');
const updateOnly = process.argv.includes('--update-only');

function resolveIconBuffer(filename) {
  const candidates = [
    path.join(__dirname, 'icons', filename),
    path.resolve(__dirname, '..', 'public', filename),
    path.resolve(__dirname, '..', 'dist', filename),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }
  }
  throw new Error(`Missing PNG icon "${filename}". Expected in android-twa/icons/ or public/.`);
}

function runCommand(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function main() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`twa-manifest.json not found at ${manifestPath}`);
  }

  const icons = {
    '/pwa-512x512.png': resolveIconBuffer('pwa-512x512.png'),
    '/pwa-maskable-512x512.png': resolveIconBuffer('pwa-maskable-512x512.png'),
    '/pwa-192x192.png': resolveIconBuffer('pwa-192x192.png'),
  };

  // Start local strict image/png server on an ephemeral localhost port
  const server = http.createServer((req, res) => {
    const reqPath = (req.url || '/').split('?')[0];
    const buf = icons[reqPath];
    if (buf) {
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': buf.length,
        'Cache-Control': 'no-cache',
      });
      res.end(buf);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 4173;
  const localBase = `http://127.0.0.1:${port}`;
  console.log(`[HSP Builder] Serving verified PNG icons locally at ${localBase}`);

  const originalManifestText = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(originalManifestText);

  // Point Bubblewrap icon fetches to local strict image/png server while preserving live app host/URLs.
  // Also omit webManifestUrl during update/build so Bubblewrap never fetches HTML from an auth-gated URL.
  delete manifest.webManifestUrl;
  manifest.iconUrl = `${localBase}/pwa-512x512.png`;
  manifest.maskableIconUrl = `${localBase}/pwa-maskable-512x512.png`;
  if (Array.isArray(manifest.shortcuts)) {
    manifest.shortcuts = manifest.shortcuts.map((shortcut) => ({
      ...shortcut,
      chosenIconUrl: `${localBase}/pwa-192x192.png`,
    }));
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  try {
    console.log('[1/2] Updating Android Gradle project from twa-manifest.json...');
    await runCommand(
      'npx',
      ['--yes', '@bubblewrap/cli', 'update', '--skipVersionUpgrade'],
      __dirname
    );

    if (!updateOnly) {
      console.log('[2/2] Building signed Android App Bundle (.aab) and APK (.apk)...');
      await runCommand(
        'npx',
        ['--yes', '@bubblewrap/cli', 'build', '--skipPwaValidation'],
        __dirname
      );

      console.log('\n[HSP Builder] Build complete!');
      console.log('  - Play Console Bundle: android-twa/app-release-bundle.aab');
      console.log('  - Direct Test APK:     android-twa/app-release-signed.apk');
    }
  } finally {
    // Restore original manifest URLs and stop local icon server
    fs.writeFileSync(manifestPath, originalManifestText);
    server.close();
  }
}

main().catch((err) => {
  console.error('\n[HSP Builder ERROR]', err instanceof Error ? err.message : err);
  process.exit(1);
});
