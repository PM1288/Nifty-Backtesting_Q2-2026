export type UiLanguage = "en" | "hi" | "mr";
export type DigitSystem = "latn" | "deva";

export type LocalePreference = {
  language: UiLanguage;
  digits: DigitSystem;
};

export type LocaleDictionary = {
  [key: string]: string | LocaleDictionary;
};
