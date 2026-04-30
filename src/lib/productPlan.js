export const PLAN_KEYS = {
  free: "free",
  premium: "premium",
};

export const FREE_FEATURES = [
  "Manual statement uploads",
  "Basic spending categories",
  "Simple Today read",
  "Limited AI money checks",
];

export const PREMIUM_FEATURES = [
  "Live UK bank feeds",
  "Smarter AI coach context",
  "Debt payoff tracking",
  "Investment tracking",
  "Forecast calendar and bill reminders",
  "Subscription leak checks",
  "Viewer mode for family or partners",
];

export const PREMIUM_SELLING_POINTS = [
  {
    label: "Live bank feeds",
    headline: "No more chasing statements",
    body: "Paid users should connect UK current accounts so Today, Calendar, debts, and AI stay fresh automatically.",
  },
  {
    label: "Smarter AI",
    headline: "Advice gets more personal",
    body: "Premium context includes recurring bills, debt pace, investments, stale-data checks, and upcoming cash pressure.",
  },
  {
    label: "Money calendar",
    headline: "Upcoming bills become visible",
    body: "The calendar can move from history-only to forecast mode once live bank feeds and recurring payments are available.",
  },
];

export function getSubscriptionStatus(profile) {
  const plan = profile?.plan === PLAN_KEYS.premium ? PLAN_KEYS.premium : PLAN_KEYS.free;
  const status = String(profile?.status || (plan === PLAN_KEYS.premium ? "active" : "free"));
  const isPremium = plan === PLAN_KEYS.premium && !["cancelled", "canceled", "past_due"].includes(status);

  return {
    plan,
    status,
    isPremium,
    label: isPremium ? "Premium" : "Free",
    cta: isPremium ? "Manage plan" : "Upgrade",
  };
}

export function getPremiumFeatureSummary(status) {
  if (status?.isPremium) {
    return {
      headline: "Premium mode is ready for live money reads",
      body: "This account can use richer AI, bank-feed setup, debt tracking, investment tracking, and the stronger calendar path.",
    };
  }

  return {
    headline: "Premium should sell less admin and smarter warnings",
    body: "Keep uploads free. Charge for automatic bank sync, sharper AI context, debts, investments, calendar forecasts, and family viewer mode.",
  };
}

export function canUsePremiumFeature(status, featureKey) {
  if (status?.isPremium) return true;
  return ["manual_upload", "basic_today", "basic_ai"].includes(featureKey);
}

