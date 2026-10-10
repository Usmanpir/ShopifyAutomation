/**
 * Money helpers. Amounts are integer minor units (e.g. paisa). Currency and
 * locale come from the store, never hard-coded at call sites.
 */
export type MoneyFormatOptions = {
  currency: string;
  locale?: string;
  compact?: boolean;
  /** Show minor units (e.g. "Rs 4,250.50"). Defaults to false for whole-unit currencies display. */
  showMinor?: boolean;
};

const SYMBOL_OVERRIDES: Record<string, string> = {
  PKR: "Rs.",
  INR: "₹",
};

export function toMajor(minor: number): number {
  return minor / 100;
}

export function toMinor(major: number): number {
  return Math.round(major * 100);
}

export function formatMoney(minor: number | null | undefined, opts: MoneyFormatOptions): string {
  const value = toMajor(minor ?? 0);
  const locale = opts.locale ?? "en-US";
  const symbol = SYMBOL_OVERRIDES[opts.currency];

  if (opts.compact) {
    const n = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
    return symbol ? `${symbol} ${n}` : `${opts.currency} ${n}`;
  }

  const fractionDigits = opts.showMinor ? 2 : 0;
  if (symbol) {
    const n = new Intl.NumberFormat(locale, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
    return `${symbol} ${n}`;
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: opts.currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatNumber(value: number | null | undefined, locale = "en-US", compact = false): string {
  return new Intl.NumberFormat(locale, compact ? { notation: "compact", maximumFractionDigits: 1 } : {}).format(value ?? 0);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  return `${(value ?? 0).toFixed(digits)}%`;
}

export function percentChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}
