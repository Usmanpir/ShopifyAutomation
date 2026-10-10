import { formatMoney, formatNumber } from "@/lib/money";

/** Store-aware formatters. Works in server and client components (no hooks). */
export function makeFormatter(store: { currency: string; locale: string; timezone: string }) {
  const dtf = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(store.locale, { timeZone: store.timezone, ...opts });
  const short = dtf({ day: "numeric", month: "short" });
  const medium = dtf({ day: "numeric", month: "short", year: "numeric" });
  const dateTime = dtf({ day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const time = dtf({ hour: "numeric", minute: "2-digit" });
  const wrap = (f: Intl.DateTimeFormat) => (d: string | Date | null | undefined) => (d ? f.format(new Date(d)) : "—");
  return {
    money: (minor: number | null | undefined, opts: { compact?: boolean } = {}) =>
      formatMoney(minor, { currency: store.currency, locale: store.locale, compact: opts.compact }),
    number: (n: number | null | undefined, compact = false) => formatNumber(n, store.locale, compact),
    date: wrap(medium),
    dateShort: wrap(short),
    dateTime: wrap(dateTime),
    time: wrap(time),
    currencySymbol: store.currency === "PKR" ? "Rs." : store.currency,
  };
}

export type Formatter = ReturnType<typeof makeFormatter>;
