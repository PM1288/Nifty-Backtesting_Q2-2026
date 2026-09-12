export type ScalperV2SemanticLevel = { price: number; label: string; priority: number; color: string };

/** Merge coincident labels before they reach the native right price axis. */
export function mergeScalperV2Levels(levels: ScalperV2SemanticLevel[], tolerance = 0.05) {
  const groups: ScalperV2SemanticLevel[][] = [];
  for (const level of [...levels].sort((a, b) => b.priority - a.priority || a.price - b.price)) {
    const existing = groups.find((group) => Math.abs(group[0].price - level.price) <= tolerance);
    if (existing) existing.push(level); else groups.push([level]);
  }
  return groups.map((group) => ({
    price: group[0].price,
    title: [...new Set(group.sort((a, b) => b.priority - a.priority).map((level) => level.label))].join(" · "),
    color: group[0].color,
    priority: Math.max(...group.map((level) => level.priority)),
  }));
}
