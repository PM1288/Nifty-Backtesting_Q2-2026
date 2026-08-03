#!/usr/bin/env node

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((arg) => {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    return match ? [[match[1], match[2]]] : [];
  })
);

const HELP = `
Usage:
  node scripts/generate-utm.mjs --base_url=https://example.com/path --utm_source=youtube --utm_medium=video --utm_campaign=launch

Supported params:
  base_url
  utm_source
  utm_medium
  utm_campaign
  utm_content
  utm_term
  utm_id
  utm_source_platform

Examples:
  node scripts/generate-utm.mjs --base_url=https://m.nifty50today.co.in/n50/ --utm_source=youtube --utm_medium=video_description --utm_campaign=weekly_market_story
  node scripts/generate-utm.mjs --base_url=https://m.nifty50today.co.in/n50/ --utm_source=reddit --utm_medium=post --utm_campaign=nifty_launch --utm_content=india_investments
`;

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, "_")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

if (!args.base_url) {
  console.log(HELP.trim());
  process.exit(0);
}

const url = new URL(args.base_url);
const utmKeys = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
  "utm_source_platform"
];

for (const key of utmKeys) {
  const value = typeof args[key] === "string" ? slugify(args[key]) : "";
  if (value) {
    url.searchParams.set(key, value);
  }
}

console.log(url.toString());
