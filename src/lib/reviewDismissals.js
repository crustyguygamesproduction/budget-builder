export const REVIEW_DISMISSED_CHECKS_KEY = "moneyhub-dismissed-confidence-checks";
const LEGACY_REVIEW_DISMISSED_RULE_CHECKS_KEY = "moneyhub-dismissed-rule-checks";
export const REVIEW_DISMISSALS_CHANGED_EVENT = "moneyhub-review-dismissals-changed";

export function readDismissedReviewCheckKeys() {
  if (typeof window === "undefined") return [];
  try {
    const current = parseDismissedKeys(localStorage.getItem(REVIEW_DISMISSED_CHECKS_KEY));
    const legacy = parseDismissedKeys(localStorage.getItem(LEGACY_REVIEW_DISMISSED_RULE_CHECKS_KEY));
    return [...new Set([...current, ...legacy])];
  } catch {
    return [];
  }
}

export function saveDismissedReviewCheckKeys(keys = []) {
  if (typeof window === "undefined") return [];
  const next = [...new Set((keys || []).filter(Boolean).map(String))];
  localStorage.setItem(REVIEW_DISMISSED_CHECKS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(REVIEW_DISMISSALS_CHANGED_EVENT, { detail: { keys: next } }));
  return next;
}

export function dismissReviewCheckKey(key) {
  if (!key) return readDismissedReviewCheckKeys();
  return saveDismissedReviewCheckKeys([...readDismissedReviewCheckKeys(), key]);
}

export function isReviewCheckDismissed(candidate, dismissedKeys = readDismissedReviewCheckKeys()) {
  if (!candidate?.key) return false;
  return dismissedKeys.map(String).includes(String(candidate.key));
}

function parseDismissedKeys(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}
