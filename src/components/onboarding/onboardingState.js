export const ONBOARDING_DONE_KEY = "moneyhub-onboarding-complete";
export const ONBOARDING_REPLAY_EVENT = "moneyhub:onboarding-replay";

function getOnboardingKey(userId) {
  return userId ? `${ONBOARDING_DONE_KEY}:${userId}` : ONBOARDING_DONE_KEY;
}

export function hasCompletedOnboarding(userId) {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(getOnboardingKey(userId)) === "true";
}

export function completeOnboarding(userId) {
  if (typeof window === "undefined") return;
  localStorage.setItem(getOnboardingKey(userId), "true");
}

export function replayOnboarding(userId) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(getOnboardingKey(userId));
  window.dispatchEvent(new CustomEvent(ONBOARDING_REPLAY_EVENT));
}
