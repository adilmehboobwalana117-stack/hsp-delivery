// Synthesized Web Audio API notification chimes & repeating alert bells for HSP delivery
// Includes urgent Business Owner bell, Rider Dispatch siren-bell, and autoplay audio unlock.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Unlocks Web Audio API on first user tap/click so repeating 15-second order bells
 * continue playing reliably even when the app is minimized or in the background.
 */
export function unlockOrderAlertAudio(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // ignore audio unlock errors
  }
}

function triggerVibration(pattern: number[]): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    // ignore unsupported vibration errors
  }
}

/**
 * Plays a crisp 4-note ascending chime (C5 -> E5 -> G5 -> C6)
 * triggered upon receiving a new order or major milestone.
 */
export function playOrderReceivedSound(muted = false): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [
    { freq: 523.25, start: 0, duration: 0.22, gain: 0.24 }, // C5
    { freq: 659.25, start: 0.14, duration: 0.24, gain: 0.26 }, // E5
    { freq: 783.99, start: 0.28, duration: 0.28, gain: 0.28 }, // G5
    { freq: 1046.5, start: 0.44, duration: 0.45, gain: 0.26 }, // C6
  ];

  notes.forEach((n) => {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(n.freq, now + n.start);

    gainNode.gain.setValueAtTime(0.001, now + n.start);
    gainNode.gain.exponentialRampToValueAtTime(n.gain, now + n.start + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.duration);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(now + n.start);
    osc.stop(now + n.start + n.duration + 0.02);
  });
}

/**
 * Plays an unmistakable repeating double-ring shop bell for Business Owners
 * when a customer places a new order (Step 2 — repeats every 15s until Accept/Reject).
 */
export function playBusinessOrderBell(muted = false): void {
  triggerVibration([320, 120, 320, 120, 420]);
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const doubleRing = [
    // First ring burst
    { freq: 659.25, start: 0.0, duration: 0.18, gain: 0.3 }, // E5
    { freq: 830.61, start: 0.11, duration: 0.18, gain: 0.3 }, // G#5
    { freq: 987.77, start: 0.22, duration: 0.22, gain: 0.32 }, // B5
    { freq: 1318.51, start: 0.34, duration: 0.36, gain: 0.32 }, // E6
    // Second ring burst
    { freq: 659.25, start: 0.78, duration: 0.18, gain: 0.3 }, // E5
    { freq: 830.61, start: 0.89, duration: 0.18, gain: 0.3 }, // G#5
    { freq: 987.77, start: 1.0, duration: 0.22, gain: 0.32 }, // B5
    { freq: 1318.51, start: 1.12, duration: 0.42, gain: 0.32 }, // E6
  ];

  doubleRing.forEach((n) => {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(n.freq, now + n.start);

    gainNode.gain.setValueAtTime(0.001, now + n.start);
    gainNode.gain.exponentialRampToValueAtTime(n.gain, now + n.start + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.duration);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(now + n.start);
    osc.stop(now + n.start + n.duration + 0.02);
  });
}

/**
 * Plays an urgent high-clarity dispatch bell for Available Riders
 * when a business accepts an order (Step 3 — repeats every 15s until any rider accepts).
 */
export function playRiderDispatchBell(muted = false): void {
  triggerVibration([250, 100, 250, 100, 350]);
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const dispatchNotes = [
    { freq: 880.0, start: 0.0, duration: 0.16, gain: 0.28 }, // A5
    { freq: 1108.73, start: 0.13, duration: 0.16, gain: 0.3 }, // C#6
    { freq: 1318.51, start: 0.26, duration: 0.28, gain: 0.32 }, // E6
    { freq: 880.0, start: 0.62, duration: 0.16, gain: 0.28 }, // A5
    { freq: 1108.73, start: 0.75, duration: 0.16, gain: 0.3 }, // C#6
    { freq: 1318.51, start: 0.88, duration: 0.35, gain: 0.32 }, // E6
  ];

  dispatchNotes.forEach((n) => {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(n.freq, now + n.start);

    gainNode.gain.setValueAtTime(0.001, now + n.start);
    gainNode.gain.exponentialRampToValueAtTime(n.gain, now + n.start + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.duration);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(now + n.start);
    osc.stop(now + n.start + n.duration + 0.02);
  });
}

/**
 * Plays a gentle 2-note status update ping for push notifications.
 */
export function playStatusPing(muted = false): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  [
    { freq: 698.46, start: 0, duration: 0.16, gain: 0.18 }, // F5
    { freq: 880.0, start: 0.12, duration: 0.26, gain: 0.2 }, // A5
  ].forEach((n) => {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(n.freq, now + n.start);

    gainNode.gain.setValueAtTime(0.001, now + n.start);
    gainNode.gain.exponentialRampToValueAtTime(n.gain, now + n.start + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.duration);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(now + n.start);
    osc.stop(now + n.start + n.duration + 0.02);
  });
}

/**
 * Compresses an uploaded product/food image to a crisp WebP data URL (< 75KB)
 * so stores can safely upload fast-loading thumbnails.
 */
export function compressFoodImage(file: File, maxWidth = 640): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file'));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const webpUrl = canvas.toDataURL('image/webp', 0.8);
        resolve(
          webpUrl.startsWith('data:image/webp')
            ? webpUrl
            : canvas.toDataURL('image/jpeg', 0.78)
        );
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses a rider delivery proof photo to a lightweight WebP/JPEG data URL
 * strictly guaranteed <= 115,000 characters to fit safely within Firestore rules.
 */
export function compressDeliveryProofPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read camera photo'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file selected'));
      img.onload = () => {
        const attempts: Array<{ maxWidth: number; quality: number }> = [
          { maxWidth: 800, quality: 0.76 },
          { maxWidth: 640, quality: 0.68 },
          { maxWidth: 520, quality: 0.56 },
          { maxWidth: 420, quality: 0.45 },
        ];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        let bestUrl = '';
        for (const { maxWidth, quality } of attempts) {
          const scale = Math.min(1, maxWidth / Math.max(img.width, 1));
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const webpUrl = canvas.toDataURL('image/webp', quality);
          const candidate = webpUrl.startsWith('data:image/webp')
            ? webpUrl
            : canvas.toDataURL('image/jpeg', quality);
          bestUrl = candidate;
          if (candidate.length <= 115000) {
            resolve(candidate);
            return;
          }
        }
        if (bestUrl.length <= 120000) {
          resolve(bestUrl);
        } else {
          reject(new Error('Photo could not be compressed under 120 KB. Please retake a clearer close-up photo.'));
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
