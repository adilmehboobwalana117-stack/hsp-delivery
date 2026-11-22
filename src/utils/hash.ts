export async function hashEmailForPass(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return '';
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(normalized);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return normalized;
}

export function formatWhatsAppUrl(phoneNumber: string, message: string): string {
  let digits = (phoneNumber || '+923007741209').replace(/\D/g, '');
  if (digits.startsWith('03') && digits.length === 11) {
    digits = `92${digits.slice(1)}`;
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (!digits) {
    digits = '923007741209';
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
