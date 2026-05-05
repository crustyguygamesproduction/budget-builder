export const ONBOARDING_DONE_KEY = "moneyhub-onboarding-complete";
export const PAGE_GUIDE_DONE_KEY = "moneyhub-page-guide-complete-v2";
export const ONBOARDING_REPLAY_EVENT = "moneyhub:onboarding-replay";

function getOnboardingKey(userId) {
  return userId ? `${ONBOARDING_DONE_KEY}:${userId}` : ONBOARDING_DONE_KEY;
}

function getPageGuideKey(userId, page) {
  const owner = userId || "guest";
  return `${PAGE_GUIDE_DONE_KEY}:${owner}:${page}`;
}

export function hasCompletedOnboarding(userId) {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(getOnboardingKey(userId)) === "true";
}

export function completeOnboarding(userId) {
  if (typeof window === "undefined") return;
  localStorage.setItem(getOnboardingKey(userId), "true");
}

export function hasCompletedPageGuide(userId, page) {
  if (typeof window === "undefined" || !page) return true;
  return localStorage.getItem(getPageGuideKey(userId, page)) === "true";
}

export function completePageGuide(userId, page) {
  if (typeof window === "undefined" || !page) return;
  localStorage.setItem(getPageGuideKey(userId, page), "true");
}

export function replayOnboarding(userId) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(getOnboardingKey(userId));
  const prefix = `${PAGE_GUIDE_DONE_KEY}:${userId || "guest"}:`;
  Object.keys(localStorage)
    .filter((key) => key.startsWith(prefix))
    .forEach((key) => localStorage.removeItem(key));
  window.dispatchEvent(new CustomEvent(ONBOARDING_REPLAY_EVENT));
}
