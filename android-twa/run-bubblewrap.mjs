#!/usr/bin/env node
/**
 * HSP delivery — Bulletproof Bubblewrap Android .AAB & .APK Runner
 *
 * 1. Serves local PNG icons over 127.0.0.1 with strict `Content-Type: image/png`
 *    and omits remote `webManifestUrl` during `bubblewrap update` & `bubblewrap build`
 *    so Bubblewrap NEVER fails with `invalid Content-Type "text/html"` or
 *    `Unexpected token '<', "<!doctype "... is not valid JSON`.
 * 2. Auto-detects and repairs Android SDK / JDK paths for both GitHub Actions and
 *    local Windows/macOS/Linux PCs:
 *    - Links `<sdkPath>/cmdline-tools/latest/bin` to `<sdkPath>/bin` so Bubblewrap's
 *      `AndroidSdkTools.validatePath` accepts modern Android Studio & CI SDK layouts.
 *    - Repairs or resets broken `~/.bubblewrap/config.json` paths so Bubblewrap never
 *      crashes with `ERROR The provided androidSdk isn't correct.`.
 * 3. Sanitizes XML-unsafe `&` characters in Android string values and patches
 *    Bubblewrap's generated Gradle/Manifest files for AGP 8.9+ compatibility
 *    (replaces deprecated `jcenter()` with `mavenCentral()` and removes deprecated
 *    `package="..."` from `app/src/main/AndroidManifest.xml`).
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(__dirname, 'twa-manifest.json');
const updateOnly = process.argv.includes('--update-only');

function sanitizeAndroidString(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/\s*&\s*/g, ' and ').replace(/\u2014/g, '-');
}

function patchGeneratedAndroidProject(projectDir) {
  const rootGradlePath = path.join(projectDir, 'build.gradle');
  if (fs.existsSync(rootGradlePath)) {
    const content = fs.readFileSync(rootGradlePath, 'utf8');
    const updated = content.replace(/jcenter\(\)/g, 'mavenCentral()');
    if (updated !== content) {
      fs.writeFileSync(rootGradlePath, updated);
      console.log('[HSP Builder] Patched build.gradle: replaced deprecated jcenter() with mavenCentral()');
    }
  }

  const androidManifestPath = path.join(projectDir, 'app', 'src', 'main', 'AndroidManifest.xml');
  if (fs.existsSync(androidManifestPath)) {
    const content = fs.readFileSync(androidManifestPath, 'utf8');
    // AGP 8+ fails if <manifest ... package="..."> is present alongside namespace in app/build.gradle
    const updated = content
      .replace(/(<manifest\b[^>]*?)\s+package="[^"]*"/, '$1')
      .replace(/android:name="Application"/g, 'android:name=".Application"')
      .replace(/android:name="LauncherActivity"/g, 'android:name=".LauncherActivity"');
    if (updated !== content) {
      fs.writeFileSync(androidManifestPath, updated);
      console.log('[HSP Builder] Patched AndroidManifest.xml: AGP 8+ namespace & class references');
    }
  }

  const gradlePropsPath = path.join(projectDir, 'gradle.properties');
  if (fs.existsSync(gradlePropsPath)) {
    let props = fs.readFileSync(gradlePropsPath, 'utf8');
    if (!props.includes('android.suppressUnsupportedCompileSdk=')) {
      props = props.trimEnd() + '\nandroid.suppressUnsupportedCompileSdk=36\n';
      fs.writeFileSync(gradlePropsPath, props);
      console.log('[HSP Builder] Patched gradle.properties: added android.suppressUnsupportedCompileSdk=36');
    }
  }

  const appGradlePath = path.join(projectDir, 'app', 'build.gradle');
  if (fs.existsSync(appGradlePath)) {
    let content = fs.readFileSync(appGradlePath, 'utf8');
    const original = content;
    if (!content.includes('buildFeatures')) {
      content = content.replace(
        /namespace\s+"[^"]+"/,
        (match) => `${match}\n    buildFeatures {\n        resValues = true\n    }`
      );
    }
    if (!content.includes('signingConfigs')) {
      content = content.replace(
        /buildTypes\s*\{\s*release\s*\{\s*minifyEnabled\s+true\s*\}\s*\}/m,
        `signingConfigs {
        release {
            if (System.getenv('HSP_STORE_PASS')) {
                storeFile file('../hsp-delivery-release.keystore')
                storePassword System.getenv('HSP_STORE_PASS')
                keyAlias 'hspdelivery'
                keyPassword System.getenv('HSP_KEY_PASS') ?: System.getenv('HSP_STORE_PASS')
            }
        }
    }
    buildTypes {
        release {
            if (System.getenv('HSP_STORE_PASS')) {
                signingConfig signingConfigs.release
            }
            minifyEnabled false
        }
    }`
      );
    } else {
      content = content.replace(/minifyEnabled\s+true/g, 'minifyEnabled false');
    }
    if (content !== original) {
      fs.writeFileSync(appGradlePath, content);
      console.log('[HSP Builder] Patched app/build.gradle: enabled resValues, native release signing & AGP 8+ compatibility');
    }
  }
}

function findCmdlineToolsBin(sdkPath) {
  const latestBin = path.join(sdkPath, 'cmdline-tools', 'latest', 'bin');
  if (fs.existsSync(latestBin)) return latestBin;

  const cmdlineRoot = path.join(sdkPath, 'cmdline-tools');
  if (fs.existsSync(cmdlineRoot)) {
    for (const entry of fs.readdirSync(cmdlineRoot)) {
      const candidate = path.join(cmdlineRoot, entry, 'bin');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function isValidBubblewrapSdk(sdkPath) {
  if (!sdkPath || !fs.existsSync(sdkPath)) return false;
  if (fs.existsSync(path.join(sdkPath, 'tools')) || fs.existsSync(path.join(sdkPath, 'bin'))) {
    return true;
  }
  const cmdlineBin = findCmdlineToolsBin(sdkPath);
  if (cmdlineBin) {
    const binDir = path.join(sdkPath, 'bin');
    try {
      fs.symlinkSync(cmdlineBin, binDir, process.platform === 'win32' ? 'junction' : 'dir');
      console.log(`[HSP Builder] Linked ${binDir} -> ${cmdlineBin} for Bubblewrap SDK validation`);
      return true;
    } catch (err) {
      console.warn(
        `[HSP Builder] Warning: Could not link ${binDir} -> ${cmdlineBin}: ${
          err instanceof Error ? err.message : err
        }`
      );
    }
  }
  return false;
}

function findValidJdkPath(existingJdkPath) {
  const home = os.homedir();
  const candidates = [existingJdkPath, process.env.JAVA_HOME];

  const bwJdkRoot = path.join(home, '.bubblewrap', 'jdk');
  if (fs.existsSync(bwJdkRoot)) {
    for (const entry of fs.readdirSync(bwJdkRoot)) {
      candidates.push(path.join(bwJdkRoot, entry));
      candidates.push(path.join(bwJdkRoot, entry, 'Contents', 'Home'));
    }
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(path.join(candidate, 'bin'))) {
      return candidate;
    }
  }
  return '';
}

function ensureBubblewrapSdkCompat() {
  const home = os.homedir();
  const bwDir = path.join(home, '.bubblewrap');
  const bwConfigPath = path.join(bwDir, 'config.json');

  let config = {};
  const hadConfig = fs.existsSync(bwConfigPath);
  if (hadConfig) {
    try {
      config = JSON.parse(fs.readFileSync(bwConfigPath, 'utf8'));
    } catch {
      config = {};
    }
  }

  const sdkCandidates = [
    config.androidSdkPath,
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(bwDir, 'android_sdk'),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : '',
    path.join(home, 'Library', 'Android', 'sdk'),
    path.join(home, 'Android', 'Sdk'),
    '/usr/local/lib/android/sdk',
  ].filter(Boolean);

  let resolvedSdk = '';
  for (const candidate of sdkCandidates) {
    if (isValidBubblewrapSdk(candidate)) {
      resolvedSdk = candidate;
      break;
    }
  }

  const resolvedJdk = findValidJdkPath(config.jdkPath);

  if (resolvedSdk) {
    if (
      !hadConfig ||
      config.androidSdkPath !== resolvedSdk ||
      (resolvedJdk && config.jdkPath !== resolvedJdk)
    ) {
      fs.mkdirSync(bwDir, { recursive: true });
      const nextConfig = {
        ...config,
        ...(resolvedJdk ? { jdkPath: resolvedJdk } : {}),
        androidSdkPath: resolvedSdk,
      };
      fs.writeFileSync(bwConfigPath, JSON.stringify(nextConfig, null, 2));
      console.log(`[HSP Builder] Configured Bubblewrap Android SDK at ${resolvedSdk}`);
    }
  } else if (hadConfig && config.androidSdkPath) {
    const backupPath = `${bwConfigPath}.bak`;
    try {
      fs.copyFileSync(bwConfigPath, backupPath);
      fs.unlinkSync(bwConfigPath);
      console.log(
        `[HSP Builder] Reset invalid Android SDK config (backed up to ${backupPath}) so Bubblewrap can auto-install a valid SDK.`
      );
    } catch {
      // Ignore cleanup failure
    }
  }
}

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

  ensureBubblewrapSdkCompat();

  const icons = {
    '/pwa-512x512.png': resolveIconBuffer('pwa-512x512.png'),
    '/pwa-maskable-512x512.png': resolveIconBuffer('pwa-maskable-512x512.png'),
    '/pwa-192x192.png': resolveIconBuffer('pwa-192x192.png'),
  };

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

  delete manifest.webManifestUrl;
  manifest.name = sanitizeAndroidString(manifest.name);
  manifest.launcherName = sanitizeAndroidString(manifest.launcherName);
  manifest.appVersion = manifest.appVersion || manifest.appVersionName || '1.0.0';
  manifest.appVersionName = manifest.appVersionName || manifest.appVersion || '1.0.0';
  manifest.iconUrl = `${localBase}/pwa-512x512.png`;
  manifest.maskableIconUrl = `${localBase}/pwa-maskable-512x512.png`;
  if (Array.isArray(manifest.shortcuts)) {
    manifest.shortcuts = manifest.shortcuts.map((shortcut) => ({
      ...shortcut,
      name: sanitizeAndroidString(shortcut.name),
      shortName: sanitizeAndroidString(shortcut.shortName),
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

    patchGeneratedAndroidProject(__dirname);

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
    fs.writeFileSync(manifestPath, originalManifestText);
    server.close();
  }
}

main().catch((err) => {
  console.error('\n[HSP Builder ERROR]', err instanceof Error ? err.message : err);
  process.exit(1);
});
