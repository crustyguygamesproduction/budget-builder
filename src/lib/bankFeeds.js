export const BANK_FEED_PROVIDER = {
  key: "gocardless_bank_account_data",
  name: "GoCardless Bank Account Data",
  shortName: "GoCardless",
  purpose: "Account information, balances, and transaction sync",
  why: "Best fit for a UK-first paid tier because it is account-data focused and has historically been one of the lowest-cost options for early products.",
  fallbackProviders: ["Plaid", "TrueLayer", "Yapily"],
};

export function getBankFeedReadiness(subscriptionStatus, bankConnections = []) {
  const activeConnections = bankConnections.filter((connection) =>
    ["active", "linked", "syncing"].includes(String(connection.status || "").toLowerCase())
  );
  const expiringSoon = bankConnections.filter((connection) => {
    if (!connection.consent_expires_at) return false;
    const expiresAt = new Date(connection.consent_expires_at);
    if (Number.isNaN(expiresAt.getTime())) return false;
    const days = Math.ceil((expiresAt.getTime() - Date.now()) / 86400000);
    return days >= 0 && days <= 14;
  });

  if (!subscriptionStatus?.isPremium) {
    return {
      provider: BANK_FEED_PROVIDER,
      status: "premium_locked",
      headline: "Live bank feeds belong in Premium",
      body: "Manual uploads can stay free. Paid users should get automatic UK bank sync, fresher AI, and a forecast calendar.",
      activeCount: activeConnections.length,
      expiringSoonCount: expiringSoon.length,
    };
  }

  if (activeConnections.length > 0) {
    return {
      provider: BANK_FEED_PROVIDER,
      status: expiringSoon.length > 0 ? "needs_reconsent" : "active",
      headline: expiringSoon.length > 0 ? "Bank consent needs renewing soon" : "Live bank feed is connected",
      body: expiringSoon.length > 0
        ? "At least one connected bank consent is close to expiry. Renewing it keeps the paid experience feeling automatic."
        : "Transactions and balances can be refreshed from connected accounts once the provider worker is wired.",
      activeCount: activeConnections.length,
      expiringSoonCount: expiringSoon.length,
    };
  }

  return {
    provider: BANK_FEED_PROVIDER,
    status: "ready_to_connect",
    headline: "Premium bank sync is ready to wire",
    body: "Use GoCardless Bank Account Data first, then keep Plaid or TrueLayer as fallbacks if coverage or support becomes the bottleneck.",
    activeCount: 0,
    expiringSoonCount: 0,
  };
}

