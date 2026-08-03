import type { DigitSystem, UiLanguage } from "../i18n/types";

const DEFAULT_LOCALE = "en-IN-u-nu-latn";
const IST_TIMEZONE = "Asia/Kolkata";
const EM_DASH = "—";

type CompactType = "number" | "currency";

export type FormatterLocaleState = {
  locale: string;
  language: UiLanguage;
  digits: DigitSystem;
  timeZone?: string;
};

let formatterState: FormatterLocaleState = {
  locale: DEFAULT_LOCALE,
  language: "en",
  digits: "latn",
  timeZone: IST_TIMEZONE
};

function isFiniteNumber(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

function normalizeLocale(locale?: string) {
  return locale?.trim() ? locale : formatterState.locale;
}

function normalizeTimeZone(timeZone?: string) {
  return timeZone?.trim() ? timeZone : formatterState.timeZone ?? IST_TIMEZONE;
}

export function setFormattingLocale(nextState: FormatterLocaleState) {
  formatterState = {
    ...formatterState,
    ...nextState,
    locale: normalizeLocale(nextState.locale),
    timeZone: normalizeTimeZone(nextState.timeZone)
  };
}

export function getFormattingLocale() {
  return formatterState;
}

export function buildAppLocale(language: UiLanguage, digits: DigitSystem) {
  return `${language}-IN-u-nu-${digits}`;
}

export function formatNumber(
  value: number | null | undefined,
  options: Intl.NumberFormatOptions = {},
  locale?: string
): string {
  if (!isFiniteNumber(value)) return EM_DASH;
  return new Intl.NumberFormat(normalizeLocale(locale), options).format(value);
}

export function formatWholeNumber(
  value: number | null | undefined,
  locale?: string
): string {
  return formatNumber(value, { maximumFractionDigits: 0 }, locale);
}

export function formatDecimal(
  value: number | null | undefined,
  digits = 2,
  locale?: string
): string {
  return formatNumber(value, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }, locale);
}

export function formatCompactIN(
  value: number | null | undefined,
  type: CompactType = "number",
  options: Intl.NumberFormatOptions = {},
  locale?: string
): string {
  if (!isFiniteNumber(value)) return EM_DASH;

  const baseOptions: Intl.NumberFormatOptions =
    type === "currency"
      ? {
          style: "currency",
          currency: "INR",
          notation: "compact",
          maximumFractionDigits: 1
        }
      : {
          notation: "compact",
          maximumFractionDigits: 1
        };

  return new Intl.NumberFormat(normalizeLocale(locale), {
    ...baseOptions,
    ...options
  }).format(value);
}

export function formatCompactNumber(
  value: number | null | undefined,
  options: Intl.NumberFormatOptions = {},
  locale?: string
) {
  return formatCompactIN(value, "number", options, locale);
}

export function formatCurrencyINR(
  value: number | null | undefined,
  compact = false,
  options: Intl.NumberFormatOptions = {},
  locale?: string
): string {
  if (!isFiniteNumber(value)) return EM_DASH;
  if (compact) {
    return formatCompactIN(value, "currency", options, locale);
  }

  return new Intl.NumberFormat(normalizeLocale(locale), {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    ...options
  }).format(value);
}

export function formatCompactCurrency(
  value: number | null | undefined,
  options: Intl.NumberFormatOptions = {},
  locale?: string
) {
  return formatCompactIN(value, "currency", options, locale);
}

export function formatPercent(
  value: number | null | undefined,
  decimals = 2,
  signed = true,
  locale?: string
): string {
  if (!isFiniteNumber(value)) return EM_DASH;
  const sign = signed ? (value > 0 ? "+" : value < 0 ? "-" : "") : "";
  return `${sign}${formatNumber(Math.abs(value), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }, locale)}%`;
}

export function formatSignedNumber(
  value: number | null | undefined,
  digits = 2,
  locale?: string
): string {
  if (!isFiniteNumber(value)) return EM_DASH;
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatDecimal(Math.abs(value), digits, locale)}`;
}

export function formatDurationDays(
  value: number | null | undefined,
  digits = 1,
  locale?: string
): string {
  if (!isFiniteNumber(value)) return EM_DASH;
  return `${digits === 0 ? formatWholeNumber(value, locale) : formatDecimal(value, digits, locale)}d`;
}

export function formatDateTime(
  value: string | number | Date | null | undefined,
  options: { includeTime?: boolean; timeZone?: string; locale?: string } = {}
): string {
  if (value == null) return EM_DASH;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);

  const locale = normalizeLocale(options.locale);
  const timeZone = normalizeTimeZone(options.timeZone);
  const datePart = new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(parsed);

  if (!options.includeTime) return datePart;

  const timePart = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(parsed);

  return `${datePart}, ${timePart} IST`;
}

export function formatTime(
  value: string | number | Date | null | undefined,
  options: { locale?: string; timeZone?: string; hour12?: boolean } = {}
) {
  if (value == null) return EM_DASH;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);

  return new Intl.DateTimeFormat(normalizeLocale(options.locale), {
    timeZone: normalizeTimeZone(options.timeZone),
    hour: "2-digit",
    minute: "2-digit",
    hour12: options.hour12 ?? false
  }).format(parsed);
}

export function formatNumberIN(value: number | null | undefined, options: Intl.NumberFormatOptions = {}): string {
  return formatNumber(value, options);
}

export function formatDateIST(
  value: string | number | Date | null | undefined,
  options: { includeTime?: boolean; timeZone?: string; locale?: string } = {}
): string {
  return formatDateTime(value, options);
}

export function fmtNumber(n: number, options: Intl.NumberFormatOptions = {}): string {
  return formatNumber(n, options);
}

export function fmtWholeNumber(n: number): string {
  return formatWholeNumber(n);
}

export function fmtPrice(n: number): string {
  return formatDecimal(n, 2);
}

export function fmtChange(n: number): string {
  return formatSignedNumber(n, 2);
}

export function fmtPct(n: number): string {
  return formatPercent(n, 2, true);
}

export function fmtDecimal(n: number, digits = 2): string {
  return formatDecimal(n, digits);
}

export function arrow(n: number): string {
  if (n > 0) return "▲";
  if (n < 0) return "▼";
  return "•";
}
