import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import glossaryJson from "../locales/glossary.json";
import { useAuthGate } from "../auth/AuthGateProvider";
import { getFirebaseDatabaseApi, isFirebaseAuthConfigured, setFirebasePreferredLanguage } from "../lib/firebase";
import { setFormattingLocale, type FormatterLocaleState } from "../lib/format";
import type { DigitSystem, LocaleDictionary, LocalePreference, UiLanguage } from "./types";

const LANGUAGE_STORAGE_KEY = "n50.locale.language";
const DIGIT_STORAGE_KEY = "n50.locale.digits";
const DEFAULT_LANGUAGE: UiLanguage = "en";
const DEFAULT_DIGITS: DigitSystem = "latn";

const localeModules = import.meta.glob("../locales/*/*.json");

function buildLocale(language: UiLanguage, digits: DigitSystem) {
  return `${language}-IN-u-nu-${digits}`;
}

function readStoredPreference(): LocalePreference {
  if (typeof window === "undefined") {
    return { language: DEFAULT_LANGUAGE, digits: DEFAULT_DIGITS };
  }

  const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  const storedDigits = window.localStorage.getItem(DIGIT_STORAGE_KEY);
  return {
    language: storedLanguage === "hi" || storedLanguage === "mr" ? storedLanguage : DEFAULT_LANGUAGE,
    digits: storedDigits === "deva" ? "deva" : DEFAULT_DIGITS
  };
}

function getNestedValue(source: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>((acc, part) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[part];
  }, source);
}

async function loadLanguageCatalog(language: UiLanguage): Promise<Record<string, LocaleDictionary>> {
  const entries = Object.entries(localeModules).filter(([path]) => path.includes(`/locales/${language}/`));
  const catalog: Record<string, LocaleDictionary> = {};
  await Promise.all(
    entries.map(async ([path, loader]) => {
      const match = path.match(/\/locales\/[^/]+\/([^/]+)\.json$/);
      if (!match) return;
      const namespace = match[1];
      const mod = (await loader()) as { default?: LocaleDictionary };
      catalog[namespace] = mod.default ?? {};
    })
  );
  return catalog;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const glossaryTerms = Array.isArray((glossaryJson as { terms?: unknown[] }).terms)
  ? ((glossaryJson as { terms?: unknown[] }).terms ?? []).filter((item): item is string => typeof item === "string")
  : [];
const glossaryPattern = new RegExp(
  [...glossaryTerms.map(escapeRegex), "\\b[A-Z][A-Z0-9]{2,}\\b"].join("|"),
  "g"
);

function withGlossaryProtection(source: string, translated: string) {
  const sourceTerms = source.match(glossaryPattern) ?? [];
  if (!sourceTerms.length) return translated;

  return sourceTerms.reduce((text, term) => {
    if (text.includes(term)) return text;
    return text.replace(new RegExp(escapeRegex(term), "g"), term);
  }, translated);
}

type LocaleContextValue = {
  language: UiLanguage;
  digits: DigitSystem;
  locale: string;
  dictionaries: Record<string, LocaleDictionary>;
  ready: boolean;
  setLanguage: (language: UiLanguage) => void;
  setDigits: (digits: DigitSystem) => void;
  t: (key: string, fallback?: string, values?: Record<string, string | number>) => string;
  translateText: (value: string) => string;
  formatState: FormatterLocaleState;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { user, authReady } = useAuthGate();
  const initialPreference = useMemo(() => readStoredPreference(), []);
  const [language, setLanguageState] = useState<UiLanguage>(initialPreference.language);
  const [digits, setDigitsState] = useState<DigitSystem>(initialPreference.digits);
  const [dictionaries, setDictionaries] = useState<Record<string, LocaleDictionary>>({});
  const [ready, setReady] = useState(false);
  const remoteHydratedRef = useRef<string | null>(null);

  const locale = useMemo(() => buildLocale(language, digits), [language, digits]);
  const formatState = useMemo<FormatterLocaleState>(
    () => ({ locale, language, digits, timeZone: "Asia/Kolkata" }),
    [digits, language, locale]
  );

  useEffect(() => {
    let active = true;
    setReady(false);
    void loadLanguageCatalog(language)
      .then((catalog) => {
        if (!active) return;
        setDictionaries(catalog);
        setReady(true);
      })
      .catch(() => {
        if (!active) return;
        setDictionaries({});
        setReady(true);
      });

    return () => {
      active = false;
    };
  }, [language]);

  useEffect(() => {
    setFormattingLocale(formatState);
    if (typeof document === "undefined") return;
    document.documentElement.lang = language;
    document.documentElement.dataset.uiLanguage = language;
    document.documentElement.dataset.digitSystem = digits;
  }, [digits, formatState, language]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    window.localStorage.setItem(DIGIT_STORAGE_KEY, digits);
  }, [digits, language]);

  useEffect(() => {
    if (!isFirebaseAuthConfigured()) return;
    void setFirebasePreferredLanguage(language).catch(() => undefined);
  }, [language]);

  useEffect(() => {
    if (!isFirebaseAuthConfigured()) return;
    if (!authReady || !user?.uid) return;
    if (remoteHydratedRef.current === user.uid) return;

    let cancelled = false;
    void (async () => {
      try {
        const { db, get, ref, set } = await getFirebaseDatabaseApi();
        const prefRef = ref(db, `profiles/${user.uid}/preferences/locale`);
        const snapshot = await get(prefRef);
        if (cancelled) return;

        const localLanguageStored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
        const localDigitsStored = window.localStorage.getItem(DIGIT_STORAGE_KEY);
        const remote = snapshot.exists() ? (snapshot.val() as Partial<LocalePreference> & { updatedAt?: number }) : null;

        if (remote?.language && remote?.digits && !localLanguageStored && !localDigitsStored) {
          setLanguageState(remote.language === "hi" || remote.language === "mr" ? remote.language : DEFAULT_LANGUAGE);
          setDigitsState(remote.digits === "deva" ? "deva" : DEFAULT_DIGITS);
        } else {
          await set(prefRef, {
            language,
            digits,
            updatedAt: Date.now()
          });
        }

        remoteHydratedRef.current = user.uid;
      } catch {
        remoteHydratedRef.current = user.uid;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, digits, language, user?.uid]);

  useEffect(() => {
    if (!isFirebaseAuthConfigured()) return;
    if (!authReady || !user?.uid) return;
    void (async () => {
      try {
        const { db, ref, set } = await getFirebaseDatabaseApi();
        await set(ref(db, `profiles/${user.uid}/preferences/locale`), {
          language,
          digits,
          updatedAt: Date.now()
        });
      } catch {
        // Best effort sync.
      }
    })();
  }, [authReady, digits, language, user?.uid]);

  const t = useCallback(
    (key: string, fallback?: string, values?: Record<string, string | number>) => {
      const namespaces = Object.keys(dictionaries);
      let resolved: unknown;

      for (const namespace of namespaces) {
        resolved = getNestedValue(dictionaries[namespace] as Record<string, unknown>, key);
        if (typeof resolved === "string") break;
      }

      let text = (typeof resolved === "string" ? resolved : fallback ?? key) as string;
      if (values) {
        for (const [name, value] of Object.entries(values)) {
          text = text.replaceAll(`{{${name}}}`, String(value));
        }
      }
      return text;
    },
    [dictionaries]
  );

  const translateText = useCallback(
    (value: string) => {
      if (!value || language === "en") return value;

      let translated = value;
      for (const namespace of Object.keys(dictionaries)) {
        const literals = getNestedValue(dictionaries[namespace] as Record<string, unknown>, "literals");
        if (!literals || typeof literals !== "object") continue;
        const match = (literals as Record<string, unknown>)[value];
        if (typeof match === "string") {
          translated = match;
          break;
        }
      }

      return withGlossaryProtection(value, translated);
    },
    [dictionaries, language]
  );

  const value = useMemo<LocaleContextValue>(
    () => ({
      language,
      digits,
      locale,
      dictionaries,
      ready,
      setLanguage: setLanguageState,
      setDigits: setDigitsState,
      t,
      translateText,
      formatState
    }),
    [digits, dictionaries, formatState, language, locale, ready, t, translateText]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used inside LocaleProvider");
  }
  return context;
}

export function useI18n() {
  const locale = useLocale();
  return {
    ...locale,
    tr: locale.translateText
  };
}
