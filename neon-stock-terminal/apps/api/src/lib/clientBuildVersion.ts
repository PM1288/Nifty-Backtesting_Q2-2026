export function extractClientBuildVersion(indexHtml: string): string | null {
  const scripts = [...indexHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)];
  const entry = scripts
    .map((match) => match[1])
    .find((source) => /(?:^|\/)assets\/index-[^/]+\.js(?:\?.*)?$/i.test(source));
  if (!entry) return null;
  return entry.split("/").pop()?.split("?")[0] ?? null;
}
