export const ONBOARDING_DONE_KEY = "moneyhub-onboarding-complete";
export const ONBOARDING_REPLAY_EVENT = "moneyhub:onboarding-replay";

export function hasCompletedOnboarding() {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(ONBOARDING_DONE_KEY) === "true";
}

export function completeOnboarding() {
  if (typeof window === "undefined") return;
  localStorage.setItem(ONBOARDING_DONE_KEY, "true");
}

export function replayOnboarding() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ONBOARDING_DONE_KEY);
  window.dispatchEvent(new CustomEvent(ONBOARDING_REPLAY_EVENT));
}
