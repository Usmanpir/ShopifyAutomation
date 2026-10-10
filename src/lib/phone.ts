/**
 * Phone normalization to E.164 without the "+" (the format WhatsApp Cloud API uses).
 * The default country calling code is configurable per call (store setting).
 */
export function normalizePhone(raw: string | null | undefined, defaultCountryCode = "92"): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = defaultCountryCode + digits.slice(1);
  else if (!digits.startsWith(defaultCountryCode) && digits.length <= 10) digits = defaultCountryCode + digits;
  digits = digits.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/** Pakistani mobile numbers: 92 3XX XXXXXXX. Other countries pass basic E.164 length validation. */
export function isLikelyValidMobile(normalized: string | null): boolean {
  if (!normalized) return false;
  if (normalized.startsWith("92")) return /^923\d{9}$/.test(normalized);
  return normalized.length >= 10 && normalized.length <= 15;
}

export function formatPhoneDisplay(normalized: string | null | undefined): string {
  if (!normalized) return "—";
  if (/^923\d{9}$/.test(normalized)) {
    return `+92 ${normalized.slice(2, 5)} ${normalized.slice(5)}`;
  }
  return `+${normalized}`;
}
