export function buildGoalSuggestions({
  hasData,
  monthlyBills,
  transferSavings,
  latestMonthName,
  subscriptionCount,
}) {
  const safeMonthlyBills = Number(monthlyBills || 0);
  const safeTransferSavings = Number(transferSavings || 0);
  const suggestions = [];

  suggestions.push({
    key: "safety-buffer",
    name: "Emergency buffer",
    label: "Safety buffer",
    target: Math.max(Math.ceil((safeMonthlyBills * 3) / 100) * 100, 1500),
    current: 0,
    headline: safeMonthlyBills > 0
      ? "Build a buffer from your real bills"
      : "Start with a simple starter buffer",
    body: safeMonthlyBills > 0
      ? `Based on visible bills, a three-month buffer is the most sensible first goal.`
      : "Until more statement history is loaded, this is a cautious starter target rather than a precise recommendation.",
    prompt: safeMonthlyBills > 0
      ? `Build me a realistic emergency buffer plan from my latest money data. Use ${latestMonthName || "my latest visible month"} and a monthly bills estimate of ${safeMonthlyBills.toFixed(2)}.`
      : "Help me choose a realistic starter emergency fund target from my current money data.",
  });

  if (safeTransferSavings > 0) {
    suggestions.push({
      key: "protect-savings",
      name: "Protect existing savings",
      label: "Savings habit",
      target: Math.max(Math.ceil((safeTransferSavings * 2) / 100) * 100, safeTransferSavings + 500),
      current: safeTransferSavings,
      headline: "You already have transfer-style saving activity",
      body: "This turns money you already appear to move aside into a visible target instead of a vague habit.",
      prompt: `I appear to have ${safeTransferSavings.toFixed(2)} of transfer-style saving activity. Turn that into a simple goal and next steps.`,
    });
  }

  if (subscriptionCount > 0) {
    suggestions.push({
      key: "subscription-cleanup",
      name: "Subscription cleanup",
      label: "Quick win",
      target: Math.max(subscriptionCount * 10 * 12, 120),
      current: 0,
      headline: "Use subscriptions as a quick win goal",
      body: "Canceling one or two weak recurring charges can create progress without needing heroic budgeting.",
      prompt: "Review my subscription-style payments and turn the easiest cuts into a simple savings goal.",
    });
  }

  if (!hasData) {
    return suggestions.slice(0, 1);
  }

  return suggestions.slice(0, 3);
}
