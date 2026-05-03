export const COACH_GENERATED_CHECKS_KEY = "moneyhub-coach-generated-checks";

export function readCoachGeneratedChecks() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(COACH_GENERATED_CHECKS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean).filter(isUsefulCoachGeneratedCheck);
  } catch {
    return [];
  }
}

export function mergeCoachGeneratedChecks(items = []) {
  if (typeof window === "undefined" || !Array.isArray(items) || items.length === 0) return [];

  const existing = readCoachGeneratedChecks();
  const merged = new Map();

  [...items, ...existing].filter(isUsefulCoachGeneratedCheck).forEach((item) => {
    const key = item?.key || `${item?.matchText || item?.label || "coach-check"}-${item?.amount || 0}`;
    if (!key || merged.has(key)) return;
    merged.set(key, {
      ...item,
      key,
      source: item?.source || "coach",
      createdAt: item?.createdAt || new Date().toISOString(),
    });
  });

  const next = [...merged.values()].slice(0, 20);
  localStorage.setItem(COACH_GENERATED_CHECKS_KEY, JSON.stringify(next));
  return next;
}

function isUsefulCoachGeneratedCheck(item) {
  const text = `${item?.label || ""} ${item?.matchText || ""} ${item?.sampleDescription || ""}`.toLowerCase();
  return !/\b(rewards?|cashback|interest|refunds?|salary|wages?|payroll|paye|bonus|regular income|employment income|main income|weekly pay|monthly pay|benefits?|income hub|buffer|savings pot|cash pot|round ups?|roundups?)\b/.test(text);
}
