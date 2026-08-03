# Glossary Rules

This file defines the rules for protecting finance and market vocabulary during UI translation.

## Principle

The app translates UI copy, not market vocabulary.

Anything that acts like a finance token, exchange token, indicator abbreviation, or ticker symbol should remain in English unless there is an explicit product decision to localize it.

## Protected categories

These must remain in English:

- indicators:
  - `RSI`
  - `MACD`
  - `WILLR`
  - `IV`
  - `PCR`
- options terms:
  - `CE`
  - `PE`
- index/exchange labels:
  - `NIFTY 50`
  - `BANKNIFTY`
  - `INDIA VIX`
- stock symbols:
  - `HDFCBANK`
  - `RELIANCE`
  - `SBIN`
- raw exchange or market abbreviations
- uppercase symbol-like IDs

## Current protection mechanism

The implemented logic lives in:

- [LocaleProvider.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/i18n/LocaleProvider.tsx)
- [glossary.json](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/locales/glossary.json)

The current pipeline is:

1. Load glossary terms from `locales/glossary.json`.
2. Build a regex from those terms.
3. Also protect uppercase ticker-like tokens using:
   - `\\b[A-Z][A-Z0-9]{2,}\\b`
4. Translate literal text only when a safe dictionary match exists.
5. Re-apply glossary protection to the translated result.

This gives two layers of safety:

- explicit glossary terms
- generic uppercase-token preservation

## Dictionary rules

Do not translate protected tokens inside dictionary files.

Good:

- `Current RSI reading`
- `PE dominance`
- `NIFTY 50 breadth`

Bad:

- translating `RSI`
- translating `PE`
- transliterating ticker symbols

## Literal translation rules

The locale JSON files currently use a `literals` section for direct phrase translation.

That is acceptable for:

- helper text
- table headers
- chart titles
- warnings
- empty states
- educational descriptions

It is not acceptable to use `literals` to replace protected finance tokens.

## Adding a new glossary term

Add the term to:

- [glossary.json](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/locales/glossary.json)

Use the exact canonical spelling used in the UI.

Add a term when:

- it appears in translated copy
- it must remain English
- it is meaningful to market users as a fixed finance token

Examples worth protecting:

- `VWAP`
- `OI`
- `ATM`
- `OTM`
- `ITM`
- `DTE`

Only add terms that are truly cross-page vocabulary. Do not put normal prose into the glossary.

## When translation is allowed

Translate:

- page titles
- subtitles
- helper text
- axis titles
- legend labels
- table headers
- warnings
- empty states
- educational explanations

Do not translate:

- protected glossary items
- stock symbols
- raw market abbreviations
- exchange tokens
- machine identifiers

## QA checklist

Whenever a page is localized:

- confirm glossary terms remain English
- confirm ticker symbols remain unchanged
- confirm tooltips do not accidentally localize raw symbols
- confirm translated text does not reintroduce protected-term corruption

If a translation looks awkward, prefer leaving the finance token in English and localizing the surrounding explanation.
