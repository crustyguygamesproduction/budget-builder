import {
  formatCurrency,
  getMeaningfulCategory,
  isInternalTransferLike,
  normalizeText,
  parseAppDate,
  toIsoDate,
} from "./finance";
import { getBillBaseName } from "./moneyUnderstandingGuards";

const INCOME_WORDS = /\b(salary|payroll|wage|wages|paye|universal credit|child benefit|benefit|pension|maintenance|regular income)\b/;
const REFUND_WORDS = /\b(refund|reversal|cashback|repayment|reimburse|reimbursement|returned|chargeback)\b/;
const PASS_THROUGH_WORDS = /\b(work.?pass|pass.?through|expenses?|resale|client money|float)\b/;
const SAVINGS_INVESTMENT_WORDS = /\b(savings?|isa|investment|investing|vanguard|trading 212|freetrade|pension|crypto|coinbase|binance|chip|moneybox)\b/;
const FLEXIBLE_CATEGORY_WORDS = /\b(grocer|food|takeaway|restaurant|shopping|entertainment|transport|fuel|petrol|cash|gaming|clothes|personal|spending|travel|coffee|pub|bar)\b/;
const SHARED_BILL_WORDS = /\b(rent|house|flat|bills?|electric|electricity|gas|energy|water|council|tax|broadband|internet|wifi|phone|share|half|split|contribution)\b/;
const SHARED_CONTRIBUTION_WORDS = /\b(shared rent contribution|shared bill contribution|rent contribution|bill contribution)\b/;

export function buildAppMoneyModel({
  moneyUnderstanding,
  accounts = [],
  goals = [],
  debts = [],
  investments = [],
} = {}) {
  const transactions = moneyUnderstanding?.transactions || [];
  const billStreams = moneyUnderstanding?.billStreams || [];
  const calendarBills = getCalendarBillItems(moneyUnderstanding?.recurringEvents || [], billStreams);
  const upcomingBills = getUpcomingBills(calendarBills);
  const monthWindow = getRecentMonthWindow(transactions, 3);
  const monthCount = Math.max(monthWindow.monthKeys.length, 1);
  const windowTransactions = transactions.filter((transaction) =>
    transactionInWindow(transaction, monthWindow)
  );

  const grossMonthlyBillTotal = calendarBills.reduce(
    (sum, stream) => sum + Math.abs(Number(stream.amount || 0)),
    0
  );
  const preliminaryIncomeTransactions = getIncomeTransactions(windowTransactions);
  const sharedBillContributions = getSharedBillContributions({
    transactions: windowTransactions,
    calendarBills,
    monthWindow,
  });
  const contributionSourceIds = new Set(
    [...sharedBillContributions.confirmed, ...sharedBillContributions.needsChecking].flatMap((contribution) => contribution.sourceIds || [])
  );
  const incomeTransactions = preliminaryIncomeTransactions.filter(
    (transaction) => !contributionSourceIds.has(getTransactionSourceId(transaction))
  );
  const incomeTotal = sumAmounts(incomeTransactions);
  const incomeConfidence = getIncomeConfidence(incomeTransactions, monthWindow.monthKeys);
  const incomeProfile = getIncomeProfile(incomeTransactions, incomeConfidence, monthCount);
  const monthlyIncome = incomeProfile.monthlyEstimate || (incomeTransactions.length ? incomeTotal / monthCount : 0);
  const upcomingIncome = getUpcomingIncome(incomeTransactions, incomeConfidence);

  const monthlySharedContributionTotal = sharedBillContributions.confirmed.reduce(
    (sum, contribution) => sum + Math.abs(Number(contribution.appliedMonthlyAmount || contribution.monthlyAmount || 0)),
    0
  );
  const monthlyBillBurdenTotal = Math.max(grossMonthlyBillTotal - monthlySharedContributionTotal, 0);
  const billMatchKeys = getBillMatchKeys(billStreams);
  const flexibleTransactions = getFlexibleTransactions(windowTransactions, billStreams, billMatchKeys);
  const flexibleSpendingTotal = flexibleTransactions.reduce(
    (sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)),
    0
  );
  const monthlyFlexibleSpending = flexibleSpendingTotal / monthCount;
  const flexibleSpendingConfidence = getFlexibleConfidence(flexibleTransactions, monthWindow.monthKeys);

  const safeMonthlySaving =
    incomeConfidence === "low"
      ? 0
      : Math.max(monthlyIncome - monthlyBillBurdenTotal - monthlyFlexibleSpending * 1.05, 0);
  const stretchMonthlySaving =
    incomeConfidence === "low"
      ? 0
      : Math.max(monthlyIncome - monthlyBillBurdenTotal - monthlyFlexibleSpending * 0.85, 0);
  const visibleCash = getVisibleCash(accounts);
  const affordabilityTone = getAffordabilityTone({
    visibleCash,
    monthlyIncome,
    monthlyBillTotal: monthlyBillBurdenTotal,
    grossMonthlyBillTotal,
    monthlySharedContributionTotal,
    monthlyFlexibleSpending,
    safeMonthlySaving,
    incomeConfidence,
  });

  const sharedContributionChecks = buildSharedContributionChecks(sharedBillContributions.needsChecking);
  const checksWaiting = [...(moneyUnderstanding?.checks || []), ...sharedContributionChecks];
  const dataFreshness = getModelFreshness(transactions);
  const confidenceWarnings = getConfidenceWarnings({
    dataFreshness,
    checksWaiting,
    incomeConfidence,
    flexibleSpendingConfidence,
    visibleCash,
    sharedBillContributions,
  });

  return {
    source: moneyUnderstanding?.source || "money-understanding",
    transactions,
    bills: billStreams,
    calendarBills,
    billStreams,
    recurringEvents: moneyUnderstanding?.recurringEvents || [],
    upcomingBills,
    monthlyBillTotal: roundMoney(monthlyBillBurdenTotal),
    grossMonthlyBillTotal: roundMoney(grossMonthlyBillTotal),
    monthlyBillBurdenTotal: roundMoney(monthlyBillBurdenTotal),
    monthlyScheduledOutgoingsTotal: roundMoney(monthlyBillBurdenTotal),
    monthlySharedContributionTotal: roundMoney(monthlySharedContributionTotal),
    fixedCommitments: billStreams,
    sharedBillContributions,
    income: {
      transactions: incomeTransactions,
      monthlyEstimate: roundMoney(monthlyIncome),
      confidence: incomeConfidence,
      label: incomeConfidence === "low" ? "Income is not clear yet" : `About ${formatCurrency(monthlyIncome)}/month`,
      payCycleSummary: incomeProfile.payCycleSummary,
      nextPay: upcomingIncome.items?.[0] || null,
      upcoming30Days: upcomingIncome,
      excludedSharedContributions: sharedBillContributions.confirmed,
    },
    upcomingIncome,
    flexibleSpending: {
      transactions: flexibleTransactions,
      monthlyEstimate: roundMoney(monthlyFlexibleSpending),
      confidence: flexibleSpendingConfidence,
      label: flexibleSpendingConfidence === "low" ? "Needs checking" : formatCurrency(monthlyFlexibleSpending),
      planningLabel: getFlexiblePlanningLabel(monthlyFlexibleSpending, monthlyIncome, flexibleSpendingConfidence),
      isUsefulForPlanning: isFlexibleSpendingUseful(monthlyFlexibleSpending, monthlyIncome, flexibleSpendingConfidence),
      topCategories: getTopFlexibleCategories(flexibleTransactions),
    },
    savingsCapacity: {
      safeMonthlyAmount: roundMoney(safeMonthlySaving),
      stretchMonthlyAmount: roundMoney(stretchMonthlySaving),
      status: affordabilityTone.status,
      label: affordabilityTone.label,
      body: affordabilityTone.body,
    },
    cashPosition: visibleCash,
    dataFreshness,
    confidenceWarnings,
    checksWaiting,
    nextBestActions: getNextBestActions({
      goals,
      debts,
      investments,
      checksWaiting,
      dataFreshness,
      incomeConfidence,
      billStreams,
      safeMonthlySaving,
      sharedBillContributions,
    }),
    aiContext: {
      monthly_income_estimate: roundMoney(monthlyIncome),
      monthly_income_label: incomeConfidence === "low" ? "Income is not clear yet" : `About ${formatCurrency(monthlyIncome)}/month`,
      income_pay_cycle_summary: incomeProfile.payCycleSummary,
      income_confidence: incomeConfidence,
      expected_income_next_30_days: upcomingIncome,
      monthly_bills_from_calendar: roundMoney(grossMonthlyBillTotal),
      monthly_shared_bill_contributions: roundMoney(monthlySharedContributionTotal),
      monthly_bill_burden_after_contributions: roundMoney(monthlyBillBurdenTotal),
      monthly_outgoings_to_cover: roundMoney(monthlyBillBurdenTotal),
      shared_bill_contributions: sharedBillContributions.confirmed,
      possible_shared_bill_contributions_to_check: sharedBillContributions.needsChecking,
      monthly_flexible_spending_estimate: roundMoney(monthlyFlexibleSpending),
      monthly_flexible_spending_planning_label: getFlexiblePlanningLabel(monthlyFlexibleSpending, monthlyIncome, flexibleSpendingConfidence),
      flexible_spending_confidence: flexibleSpendingConfidence,
      safe_monthly_saving_amount: roundMoney(safeMonthlySaving),
      stretch_monthly_saving_amount: roundMoney(stretchMonthlySaving),
      current_cash: visibleCash.hasKnownBalance ? visibleCash.amount : null,
      cash_basis: visibleCash.hasKnownBalance ? "account balance" : "not supplied",
      upcoming_bills: upcomingBills.slice(0, 12),
      checks_waiting: checksWaiting.slice(0, 12),
      warnings: confidenceWarnings,
    },
    period: {
      label: monthWindow.label,
      monthCount,
      startDate: monthWindow.startDate,
      endDate: monthWindow.endDate,
    },
  };
}

export function buildGoalPlanFromMoneyModel(goal, appMoneyModel) {
  const target = Number(goal?.target_amount || 0);
  const current = Number(goal?.current_amount || 0);
  const amountLeft = Math.max(target - current, 0);
  const targetMonths = getMonthsUntil(goal?.target_date);
  const requiredMonthly = amountLeft > 0 && targetMonths ? amountLeft / targetMonths : 0;
  const safeMonthly = Number(appMoneyModel?.savingsCapacity?.safeMonthlyAmount || 0);
  const stretchMonthly = Number(appMoneyModel?.savingsCapacity?.stretchMonthlyAmount || 0);
  const fastestMonths = amountLeft > 0 && safeMonthly > 0 ? Math.ceil(amountLeft / safeMonthly) : null;
  const status = getGoalStatus({
    amountLeft,
    requiredMonthly,
    targetMonths,
    safeMonthly,
    stretchMonthly,
    appMoneyModel,
  });

  return {
    target,
    current,
    amountLeft,
    progressPercent: target > 0 ? Math.min((current / target) * 100, 100) : 0,
    targetMonths,
    requiredMonthly: roundMoney(requiredMonthly),
    fastestMonths,
    status,
  };
}

function getRecentMonthWindow(transactions, preferredMonths) {
  const dates = transactions
    .map((transaction) => parseAppDate(transaction.transaction_date))
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (!dates.length) {
    return { start: null, end: null, startDate: "", endDate: "", monthKeys: [], label: "No statement history yet" };
  }

  const end = dates[dates.length - 1];
  const start = new Date(end.getFullYear(), end.getMonth() - (preferredMonths - 1), 1);
  const monthKeys = [...new Set(dates
    .filter((date) => date >= start && date <= end)
    .map((date) => monthKey(date)))];

  return {
    start,
    end,
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
    monthKeys,
    label: `${start.toLocaleDateString("en-GB", { month: "short" })} to ${end.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`,
  };
}

function transactionInWindow(transaction, window) {
  const date = parseAppDate(transaction.transaction_date);
  if (!date || !window.start || !window.end) return false;
  return date >= window.start && date <= window.end;
}

function getIncomeTransactions(transactions) {
  const recurringIncomeKeys = recurringKeys(
    transactions.filter((transaction) => Number(transaction.amount || 0) > 0 && Math.abs(Number(transaction.amount || 0)) >= 300)
  );

  return transactions.filter((transaction) => {
    const amount = Number(transaction.amount || 0);
    if (amount <= 0) return false;
    if (isInternalTransferLike(transaction)) return false;

    const text = normalizeText(`${transaction.description || ""} ${getMeaningfulCategory(transaction)}`);
    if (REFUND_WORDS.test(text) || PASS_THROUGH_WORDS.test(text)) return false;
    if (INCOME_WORDS.test(text)) return true;

    return amount >= 300 && recurringIncomeKeys.has(transactionKey(transaction));
  });
}

function getSharedBillContributions({ transactions = [], calendarBills = [] }) {
  const recurringContributionKeys = recurringKeys(
    transactions.filter((transaction) => Number(transaction.amount || 0) > 0 && Math.abs(Number(transaction.amount || 0)) >= 100),
    contributionKey
  );
  const groups = transactions.reduce((map, transaction) => {
    if (!isPossibleSharedBillContribution(transaction, recurringContributionKeys)) return map;
    const key = contributionKey(transaction);
    const date = parseAppDate(transaction.transaction_date);
    if (!key || !date) return map;
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: cleanContributionName(transaction),
        amounts: [],
        dates: [],
        monthKeys: new Set(),
        sourceIds: [],
        examples: [],
        confirmedByRule: false,
        hasSharedBillText: false,
      });
    }
    const group = map.get(key);
    const text = normalizeText(`${transaction.description || ""} ${getMeaningfulCategory(transaction)} ${transaction._smart_category || ""}`);
    group.amounts.push(Math.abs(Number(transaction.amount || 0)));
    group.dates.push(date);
    group.monthKeys.add(monthKey(date));
    group.sourceIds.push(getTransactionSourceId(transaction));
    if (group.examples.length < 3) group.examples.push(transaction.description || group.name);
    if (isConfirmedSharedContribution(transaction)) group.confirmedByRule = true;
    if (SHARED_BILL_WORDS.test(text)) group.hasSharedBillText = true;
    return map;
  }, new Map());

  const candidates = [...groups.values()].map((group) => {
    const monthlyAmount = usualAmount(group.amounts);
    const day = likelyContributionDay(group.dates);
    const match = getBestContributionBillMatch({ monthlyAmount, day, calendarBills });
    const confidence = getContributionConfidence({ group, match });
    return {
      key: `shared-contribution:${group.key}`,
      name: group.name,
      monthlyAmount: roundMoney(monthlyAmount),
      day,
      sourceIds: [...new Set(group.sourceIds)],
      sourceMonths: group.monthKeys.size,
      examples: group.examples,
      matchedBillKey: match?.bill?.key || null,
      matchedBillName: match?.bill?.name || null,
      matchedBillAmount: match?.bill?.amount || null,
      ratioToBill: match?.ratio || null,
      dayDistance: match?.dayDistance ?? null,
      confidence,
      label: match?.bill?.name
        ? `${group.name} towards ${match.bill.name}`
        : `${group.name} contribution`,
      helper: match?.bill?.name
        ? `${formatCurrency(monthlyAmount)} looks like a regular contribution towards ${match.bill.name}.`
        : `${formatCurrency(monthlyAmount)} looks like a regular contribution, but the matching bill is not clear yet.`,
    };
  }).filter((candidate) => candidate.monthlyAmount > 0);

  const confirmed = candidates
    .map(applySharedBillContributionCap)
    .filter((candidate) => candidate.confidence === "high" && candidate.matchedBillName && candidate.appliedMonthlyAmount > 0)
    .sort((a, b) => b.appliedMonthlyAmount - a.appliedMonthlyAmount);
  const needsChecking = candidates
    .map(applySharedBillContributionCap)
    .filter((candidate) => !confirmed.some((item) => item.key === candidate.key))
    .filter((candidate) => candidate.confidence !== "low")
    .slice(0, 5);

  return {
    confirmed,
    needsChecking,
    monthlyTotal: roundMoney(confirmed.reduce((sum, item) => sum + Number(item.appliedMonthlyAmount || item.monthlyAmount || 0), 0)),
    label: confirmed.length
      ? `${formatCurrency(confirmed.reduce((sum, item) => sum + Number(item.appliedMonthlyAmount || item.monthlyAmount || 0), 0))} shared bill contribution${confirmed.length === 1 ? "" : "s"}`
      : "No shared bill contributions found",
  };
}

function isPossibleSharedBillContribution(transaction, recurringContributionKeys) {
  const amount = Number(transaction.amount || 0);
  if (amount <= 0 || amount < 100) return false;
  if (isInternalTransferLike(transaction)) return false;
  const text = normalizeText(`${transaction.description || ""} ${getMeaningfulCategory(transaction)}`);
  if (isConfirmedSharedContribution(transaction)) return true;
  if (INCOME_WORDS.test(text) || REFUND_WORDS.test(text) || PASS_THROUGH_WORDS.test(text)) return false;
  if (SAVINGS_INVESTMENT_WORDS.test(text)) return false;
  if (amount > 1800 && !SHARED_BILL_WORDS.test(text)) return false;
  return recurringContributionKeys.has(contributionKey(transaction)) || SHARED_BILL_WORDS.test(text) || amount <= 1800;
}

function getBestContributionBillMatch({ monthlyAmount, day, calendarBills }) {
  const matches = (calendarBills || [])
    .map((bill) => {
      const billAmount = Math.abs(Number(bill.amount || 0));
      if (!billAmount || monthlyAmount >= billAmount * 0.95) return null;
      const ratio = monthlyAmount / billAmount;
      const ratioScore = Math.max(0, 1 - Math.abs(ratio - 0.5) / 0.35);
      const distance = dayDistance(day, Number(bill.day || 1));
      const dateScore = Math.max(0, 1 - distance / 14);
      const billText = normalizeText(`${bill.name || ""} ${bill.kind || ""}`);
      const billTypeScore = /rent|mortgage|energy|water|broadband|phone|council|insurance|bill/.test(billText) ? 0.25 : 0;
      const score = ratioScore * 0.55 + dateScore * 0.25 + billTypeScore;
      return {
        bill,
        ratio: roundMoney(ratio),
        dayDistance: distance,
        score,
      };
    })
    .filter(Boolean)
    .filter((match) => match.ratio >= 0.25 && match.ratio <= 0.8)
    .sort((a, b) => b.score - a.score);

  return matches[0] || null;
}

function applySharedBillContributionCap(candidate) {
  const billAmount = Math.abs(Number(candidate.matchedBillAmount || 0));
  const monthlyAmount = Math.abs(Number(candidate.monthlyAmount || 0));
  if (!billAmount || !monthlyAmount) return { ...candidate, appliedMonthlyAmount: monthlyAmount };
  const ratio = monthlyAmount / billAmount;
  const looksLikeHalfShare = Math.abs(ratio - 0.5) <= 0.15;
  if (looksLikeHalfShare) {
    const appliedMonthlyAmount = roundMoney(billAmount * 0.5);
    const ignoredExtra = Math.max(monthlyAmount - appliedMonthlyAmount, 0);
    return {
      ...candidate,
      appliedMonthlyAmount,
      ignoredExtra: roundMoney(ignoredExtra),
      helper: ignoredExtra > 10
        ? `${formatCurrency(appliedMonthlyAmount)} looks like the regular shared bill amount. The extra ${formatCurrency(ignoredExtra)} is variable, so Money Hub will not rely on it.`
        : candidate.helper,
    };
  }
  if (ratio > 0.65) {
    return {
      ...candidate,
      confidence: "needs_checking",
      appliedMonthlyAmount: 0,
      ignoredExtra: monthlyAmount,
      helper: `${formatCurrency(monthlyAmount)} may include extra top-ups, so confirm this before Money Hub relies on it.`,
    };
  }
  return { ...candidate, appliedMonthlyAmount: monthlyAmount };
}

function getContributionConfidence({ group, match }) {
  if (group.confirmedByRule && match) return "high";
  if (!match) return group.monthKeys.size >= 2 ? "needs_checking" : "low";
  const enoughHistory = group.monthKeys.size >= 2;
  const closeHalf = Math.abs((match.ratio || 0) - 0.5) <= 0.12;
  const likelyHalfWithSmallBillsTopUp = (match.ratio || 0) > 0.5 && (match.ratio || 0) <= 0.63;
  const nearBillDay = Number(match.dayDistance ?? 99) <= 10;
  if (group.hasSharedBillText && closeHalf && nearBillDay) return "high";
  if (enoughHistory && closeHalf && nearBillDay) return "high";
  if (enoughHistory && likelyHalfWithSmallBillsTopUp && nearBillDay) return "high";
  if (enoughHistory && (closeHalf || likelyHalfWithSmallBillsTopUp) && match.score >= 0.3) return "needs_checking";
  if (enoughHistory && closeHalf && match.score >= 0.55) return "medium";
  if (closeHalf && nearBillDay) return "needs_checking";
  if (enoughHistory && match.score >= 0.4) return "needs_checking";
  return "low";
}

function isConfirmedSharedContribution(transaction) {
  if (!transaction?._smart_rule_applied) return false;
  const text = normalizeText(`${getMeaningfulCategory(transaction)} ${transaction._smart_category || ""}`);
  return SHARED_CONTRIBUTION_WORDS.test(text);
}

function buildSharedContributionChecks(candidates = []) {
  return (candidates || []).map((candidate) => ({
    key: candidate.key,
    label: candidate.name || "shared bill money",
    matchText: candidate.name,
    amount: Number(candidate.monthlyAmount || 0),
    direction: "incoming",
    count: candidate.sourceIds?.length || candidate.sourceMonths || 1,
    monthCount: candidate.sourceMonths || 1,
    sampleDescription: candidate.examples?.[0] || candidate.name,
    question: candidate.matchedBillName
      ? `Is ${candidate.name} money towards ${candidate.matchedBillName}?`
      : `Is ${candidate.name} shared bill money?`,
    helper: candidate.matchedBillName
      ? `This may reduce your share of ${candidate.matchedBillName}. Confirm it so Money Hub does not overstate your bills.`
      : "Confirm this before Money Hub relies on it for your budget.",
    sharedContribution: true,
    matchedBillName: candidate.matchedBillName,
  }));
}

function dayDistance(a, b) {
  const direct = Math.abs(Number(a || 1) - Number(b || 1));
  return Math.min(direct, 31 - direct);
}

function likelyContributionDay(dates = []) {
  const days = dates.map((date) => date.getDate()).filter(Boolean).sort((a, b) => a - b);
  if (!days.length) return 1;
  const counts = days.reduce((map, day) => map.set(day, (map.get(day) || 0) + 1), new Map());
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  if (ranked[0]?.[1] > 1) return ranked[0][0];
  return days[Math.floor(days.length / 2)];
}

function cleanContributionName(transaction) {
  const provider = getBillBaseName(transaction._real_merchant_name || transaction.description || "Contribution");
  return provider ? provider.split(" ").slice(0, 4).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") : "Shared bill contribution";
}

function getTransactionSourceId(transaction) {
  return String(transaction.id || `${transaction.transaction_date || ""}:${transaction.description || ""}:${transaction.amount || ""}`);
}

function getUpcomingIncome(incomeTransactions = [], incomeConfidence = "low") {
  if (incomeConfidence === "low" || !incomeTransactions.length) {
    return {
      amount: 0,
      count: 0,
      items: [],
      confidence: "low",
      label: "Income not clear yet",
      helper: "Upload more history or confirm income before Money Hub predicts money coming in.",
      periodLabel: "next 30 days",
    };
  }

  const groups = groupIncomeTransactions(incomeTransactions);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizonDays = 30;
  const items = [...groups.values()]
    .filter((group) => group.monthKeys.size >= 1)
    .flatMap((group) => forecastIncomeGroup(group, today, horizonDays))
    .filter((item) => item.amount > 0 && item.daysAway <= horizonDays)
    .sort((a, b) => a.daysAway - b.daysAway || b.amount - a.amount);

  const amount = roundMoney(items.reduce((sum, item) => sum + item.amount, 0));
  const cadenceSummary = summariseIncomeCadences(items);
  return {
    amount,
    count: items.length,
    items,
    confidence: items.length ? incomeConfidence : "low",
    label: items.length ? formatCurrency(amount) : "No expected income found",
    periodLabel: "next 30 days",
    helper: items.length
      ? `${formatCurrency(amount)} expected over the next 30 days${cadenceSummary ? ` from ${cadenceSummary}` : ""}. Dates can move if pay lands late.`
      : "Income history exists, but the next date is not clear yet.",
  };
}

function getIncomeProfile(incomeTransactions = [], incomeConfidence = "low", monthCount = 1) {
  if (incomeConfidence === "low" || !incomeTransactions.length) {
    return { monthlyEstimate: 0, payCycleSummary: "Income not clear yet", groups: [] };
  }

  const groups = groupIncomeTransactions(incomeTransactions);
  const profiledGroups = [...groups.values()].map((group) => {
    const sortedDates = group.dates.slice().sort((a, b) => a - b);
    const cadence = detectIncomeCadence(sortedDates);
    const usual = roundMoney(usualAmount(group.amounts));
    const monthlyEquivalent = cadence.confidence === "low"
      ? group.amounts.reduce((sum, amount) => sum + amount, 0) / Math.max(monthCount, 1)
      : usual * (365.25 / 12 / cadence.days);
    return {
      ...group,
      usualAmount: usual,
      cadence,
      monthlyEquivalent: roundMoney(monthlyEquivalent),
    };
  }).filter((group) => group.monthlyEquivalent > 0);

  const monthlyEstimate = roundMoney(profiledGroups.reduce((sum, group) => sum + group.monthlyEquivalent, 0));
  return {
    monthlyEstimate,
    payCycleSummary: summariseIncomeProfile(profiledGroups),
    groups: profiledGroups,
  };
}

function groupIncomeTransactions(incomeTransactions = []) {
  return incomeTransactions.reduce((map, transaction) => {
    const amount = Math.abs(Number(transaction.amount || 0));
    const date = parseAppDate(transaction.transaction_date);
    if (!amount || !date) return map;
    const key = incomeProviderKey(transaction);
    if (!key) return map;
    if (!map.has(key)) {
      map.set(key, { key, name: cleanIncomeName(transaction), amounts: [], dates: [], monthKeys: new Set() });
    }
    const group = map.get(key);
    group.amounts.push(amount);
    group.dates.push(date);
    group.monthKeys.add(monthKey(date));
    return map;
  }, new Map());
}

function summariseIncomeProfile(groups = []) {
  if (!groups.length) return "Income not clear yet";
  const best = groups.slice().sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent)[0];
  if (!best) return "Income not clear yet";
  const cadenceLabel = best.cadence?.label || "regular income";
  if (best.cadence?.days === 7) return `About ${formatCurrency(best.usualAmount)}/week from ${best.name}`;
  if (best.cadence?.days === 14) return `About ${formatCurrency(best.usualAmount)} every 2 weeks from ${best.name}`;
  if (best.cadence?.days >= 26 && best.cadence?.days <= 35) return `About ${formatCurrency(best.usualAmount)}/month from ${best.name}`;
  return `Regular money from ${best.name} (${cadenceLabel})`;
}

function incomeProviderKey(transaction) {
  const provider = getBillBaseName(transaction._real_merchant_name || transaction.description || "");
  return provider ? `income:${provider}` : "";
}

function forecastIncomeGroup(group, today, horizonDays) {
  const sortedDates = group.dates.slice().sort((a, b) => a - b);
  const cadence = detectIncomeCadence(sortedDates);
  const amount = roundMoney(usualAmount(group.amounts));
  if (!amount || !cadence.days) return [];

  let next = new Date(sortedDates[sortedDates.length - 1]);
  next.setHours(0, 0, 0, 0);
  let safety = 0;

  while (next < today && safety < 20) {
    next = addCalendarDays(next, cadence.days);
    safety += 1;
  }

  const forecast = [];
  while (safety < 40) {
    const daysAway = Math.round((next - today) / 86400000);
    if (daysAway > horizonDays) break;
    if (daysAway >= 0) {
      forecast.push({
        key: `${group.key}:${toIsoDate(next)}`,
        providerKey: group.key,
        name: group.name,
        amount,
        date: toIsoDate(next),
        daysAway,
        cadence: cadence.label,
        confidence: cadence.confidence,
      });
    }
    next = addCalendarDays(next, cadence.days);
    safety += 1;
  }

  return forecast;
}

function detectIncomeCadence(dates = []) {
  if (dates.length < 2) {
    return { days: 30, label: "monthly income", confidence: "low" };
  }
  const gaps = [];
  for (let index = 1; index < dates.length; index += 1) {
    const gap = Math.round((dates[index] - dates[index - 1]) / 86400000);
    if (gap >= 5 && gap <= 45) gaps.push(gap);
  }
  if (!gaps.length) return { days: 30, label: "monthly income", confidence: "low" };
  const median = gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  if (median >= 5 && median <= 9) return { days: 7, label: "weekly income", confidence: "high" };
  if (median >= 12 && median <= 16) return { days: 14, label: "fortnightly income", confidence: "medium" };
  if (median >= 26 && median <= 35) return { days: 30, label: "monthly income", confidence: "medium" };
  return { days: Math.max(7, Math.min(median, 30)), label: "regular income", confidence: "low" };
}

function addCalendarDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + Number(days || 0));
  next.setHours(0, 0, 0, 0);
  return next;
}

function summariseIncomeCadences(items = []) {
  const cadences = [...new Set(items.map((item) => item.cadence).filter(Boolean))];
  if (!cadences.length) return "regular income";
  return cadences.slice(0, 2).join(" and ");
}

function cleanIncomeName(transaction) {
  const provider = getBillBaseName(transaction._real_merchant_name || transaction.description || "Income")
    .replace(/\b(wage|wages|salary|payroll|paye|regular income)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return provider ? provider.split(" ").slice(0, 4).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") : "Income";
}

function usualAmount(values = []) {
  const safe = values.map(Number).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!safe.length) return 0;
  const clusters = [];
  safe.forEach((amount) => {
    const cluster = clusters.find((item) => Math.abs(item.average - amount) <= Math.max(10, item.average * 0.12));
    if (cluster) {
      cluster.values.push(amount);
      cluster.average = cluster.values.reduce((sum, value) => sum + value, 0) / cluster.values.length;
    } else {
      clusters.push({ values: [amount], average: amount });
    }
  });
  return clusters.sort((a, b) => b.values.length - a.values.length || b.average - a.average)[0]?.average || safe[Math.floor(safe.length / 2)];
}

function getFlexibleTransactions(transactions, billStreams, billMatchKeys) {
  return transactions.filter((transaction) => {
    const amount = Number(transaction.amount || 0);
    if (amount >= 0) return false;
    if (isInternalTransferLike(transaction)) return false;
    if (isBillTransaction(transaction, billStreams, billMatchKeys)) return false;

    const text = normalizeText(`${transaction.description || ""} ${getMeaningfulCategory(transaction)}`);
    if (PASS_THROUGH_WORDS.test(text) || REFUND_WORDS.test(text)) return false;
    if (SAVINGS_INVESTMENT_WORDS.test(text)) return false;
    return true;
  });
}

function isBillTransaction(transaction, billStreams, billMatchKeys) {
  const amount = Math.abs(Number(transaction.amount || 0));
  const provider = getBillBaseName(transaction._real_merchant_name || transaction.description || "");
  const category = normalizeText(getMeaningfulCategory(transaction));
  const matchesCalendarBill = billStreams.some((stream) => {
    const streamProvider = getBillBaseName(stream.name || "");
    const sameProvider = provider && streamProvider && (provider === streamProvider || provider.includes(streamProvider) || streamProvider.includes(provider));
    const closeAmount = Math.abs(amount - Math.abs(Number(stream.amount || 0))) <= Math.max(3, amount * 0.14);
    return sameProvider && closeAmount && billMatchKeys.has(`${streamProvider}:${Math.round(Math.abs(Number(stream.amount || 0)))}`);
  });
  if (matchesCalendarBill) return true;

  if (billStreams.length === 0 && /rent|mortgage/.test(category)) return true;
  return false;
}

function getBillMatchKeys(billStreams) {
  return new Set((billStreams || []).map((stream) => {
    const provider = getBillBaseName(stream.name || "");
    return `${provider}:${Math.round(Math.abs(Number(stream.amount || 0)))}`;
  }));
}

function getIncomeConfidence(incomeTransactions, monthKeys) {
  if (!incomeTransactions.length) return "low";
  const incomeMonths = new Set(incomeTransactions.map((transaction) => {
    const date = parseAppDate(transaction.transaction_date);
    return date ? monthKey(date) : "";
  }).filter(Boolean));
  if (monthKeys.length >= 3 && incomeMonths.size >= 2) return "high";
  if (incomeMonths.size >= 1) return "medium";
  return "low";
}

function getFlexibleConfidence(flexibleTransactions, monthKeys) {
  if (!monthKeys.length) return "low";
  if (monthKeys.length >= 3 && flexibleTransactions.length >= 8) return "high";
  if (flexibleTransactions.length >= 3) return "medium";
  return "low";
}

function recurringKeys(transactions, keyFn = transactionKey) {
  const groups = transactions.reduce((map, transaction) => {
    const key = keyFn(transaction);
    const date = parseAppDate(transaction.transaction_date);
    if (!key || !date) return map;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(monthKey(date));
    return map;
  }, new Map());

  return new Set([...groups.entries()].filter(([, months]) => months.size >= 2).map(([key]) => key));
}

function transactionKey(transaction) {
  const provider = getBillBaseName(transaction._real_merchant_name || transaction.description || "");
  const amountBand = Math.round(Math.abs(Number(transaction.amount || 0)) / 10) * 10;
  return provider ? `${provider}:${amountBand}` : "";
}

function contributionKey(transaction) {
  const provider = getBillBaseName(transaction._real_merchant_name || transaction.description || "");
  return provider ? `contribution:${provider}` : "";
}

function getVisibleCash(accounts) {
  const balanceFields = ["available_balance", "current_balance", "balance", "available", "current"];
  const balances = accounts
    .map((account) => {
      for (const field of balanceFields) {
        const value = account?.[field];
        if (value === null || value === undefined || value === "") continue;
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
      return null;
    })
    .filter((value) => value !== null);
  const amount = balances.reduce((sum, value) => sum + Number(value || 0), 0);
  const hasKnownBalance = balances.length > 0;

  return {
    hasKnownBalance,
    hasBalance: hasKnownBalance,
    amount: roundMoney(amount),
    total: roundMoney(amount),
    label: hasKnownBalance ? formatCurrency(amount) : "No current balance yet",
  };
}

function getModelFreshness(transactions) {
  const dates = transactions.map((transaction) => parseAppDate(transaction.transaction_date)).filter(Boolean).sort((a, b) => a - b);
  if (!dates.length) return { hasData: false, needsUpload: true, latestDate: "", latestMonthLabel: "", historyMonths: 0 };
  const latest = dates[dates.length - 1];
  const daysOld = Math.max(Math.round((new Date() - latest) / 86400000), 0);
  const historyMonths = new Set(dates.map(monthKey)).size;
  return {
    hasData: true,
    needsUpload: daysOld > 45,
    latestDate: toIsoDate(latest),
    latestMonthLabel: latest.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    daysOld,
    historyMonths,
  };
}

function getConfidenceWarnings({ dataFreshness, checksWaiting, incomeConfidence, flexibleSpendingConfidence, visibleCash, sharedBillContributions }) {
  const warnings = [];
  if (!dataFreshness.hasData) warnings.push("Upload a statement so Money Hub can build your plan.");
  if (dataFreshness.needsUpload && dataFreshness.hasData) warnings.push("Add your latest statement before trusting today's spending room.");
  if (checksWaiting.length > 0) warnings.push("Answer Checks so bills, transfers and spending do not get mixed up.");
  if (sharedBillContributions?.needsChecking?.length > 0) warnings.push("Check possible shared bill contributions so your real bill share is right.");
  if (incomeConfidence === "low") warnings.push("Income is not clear yet.");
  if (flexibleSpendingConfidence === "low") warnings.push("Usual spending needs more history.");
  if (!visibleCash.hasKnownBalance) warnings.push("Current cash is not supplied, so safe-to-spend stays conservative.");
  return warnings;
}

function getAffordabilityTone({ visibleCash, monthlyIncome, monthlyBillTotal, grossMonthlyBillTotal, monthlySharedContributionTotal, monthlyFlexibleSpending, safeMonthlySaving, incomeConfidence }) {
  if (incomeConfidence === "low") {
    return {
      status: "needs_data",
      label: "Needs better data",
      body: "I would not set automatic saving yet because your income is not clear enough.",
    };
  }
  if (monthlyIncome < monthlyBillTotal) {
    return {
      status: "not_safe",
      label: "Not safe yet",
      body: monthlySharedContributionTotal > 0
        ? `Your bills are ${formatCurrency(grossMonthlyBillTotal)}, with ${formatCurrency(monthlySharedContributionTotal)} regular contributions reducing your share. The remaining share still needs checking against income.`
        : "Your Calendar bills are higher than clear income, so the plan needs checking before saving more.",
    };
  }
  if (monthlyBillTotal > 0 && visibleCash.hasKnownBalance && visibleCash.amount <= monthlyBillTotal * 0.5) {
    return {
      status: "tight",
      label: "Tight",
      body: monthlySharedContributionTotal > 0
        ? `Your share after regular contributions is about ${formatCurrency(monthlyBillTotal)}, but visible cash still looks tight.`
        : "Your visible cash looks tight against bills due, so keep saving conservative.",
    };
  }
  if (safeMonthlySaving <= 0 && monthlyFlexibleSpending > 0) {
    return {
      status: "tight",
      label: "Tight",
      body: "Bills and usual spending are using the clear income right now.",
    };
  }
  return {
    status: "ok",
    label: safeMonthlySaving > 0 ? `${formatCurrency(safeMonthlySaving)} safe amount` : "No safe amount yet",
    body: monthlySharedContributionTotal > 0
      ? `This protects your share of Calendar bills after ${formatCurrency(monthlySharedContributionTotal)} of regular shared bill contributions.`
      : safeMonthlySaving > 0
      ? "This protects Calendar bills before treating anything as saveable."
      : "There may be room later, but this data does not show a safe automatic amount yet.",
  };
}

function isFlexibleSpendingUseful(monthlyFlexibleSpending, monthlyIncome, confidence) {
  if (confidence === "low") return false;
  if (!monthlyFlexibleSpending) return false;
  if (monthlyIncome > 0 && monthlyFlexibleSpending > monthlyIncome * 1.25) return false;
  return true;
}

function getFlexiblePlanningLabel(monthlyFlexibleSpending, monthlyIncome, confidence) {
  if (!isFlexibleSpendingUseful(monthlyFlexibleSpending, monthlyIncome, confidence)) {
    return "Spending needs checking";
  }
  return `About ${formatCurrency(monthlyFlexibleSpending)}/month`;
}

function getTopFlexibleCategories(transactions) {
  const totals = transactions.reduce((groups, transaction) => {
    const category = getMeaningfulCategory(transaction) || "Spending";
    const text = normalizeText(category);
    const display = FLEXIBLE_CATEGORY_WORDS.test(text) ? category : category || "Spending";
    groups[display] = (groups[display] || 0) + Math.abs(Number(transaction.amount || 0));
    return groups;
  }, {});

  return Object.entries(totals)
    .map(([category, total]) => ({ category, total: roundMoney(total) }))
    .filter((item) => !["income", "internal transfer", "bill", "subscription"].includes(normalizeText(item.category)))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
}

function getUpcomingBills(billStreams) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (billStreams || [])
    .map((stream) => {
      const day = Math.max(1, Math.min(Number(stream.day || 1), 28));
      let date = new Date(today.getFullYear(), today.getMonth(), day);
      if (date < today) date = new Date(today.getFullYear(), today.getMonth() + 1, day);
      return {
        ...stream,
        date: toIsoDate(date),
        daysAway: Math.max(Math.round((date - today) / 86400000), 0),
      };
    })
    .sort((a, b) => a.daysAway - b.daysAway || b.amount - a.amount);
}

function getCalendarBillItems(recurringEvents = [], billStreams = []) {
  const source = recurringEvents.length
    ? recurringEvents.map((event) => ({
        key: event.key,
        name: event.title || event.name,
        amount: Math.abs(Number(event.amount || 0)),
        day: event.day,
        kind: event.kind,
      }))
    : billStreams;

  return (source || []).reduce((list, item) => {
    const normal = {
      ...item,
      name: item.name || "Bill",
      amount: Math.abs(Number(item.amount || 0)),
      day: Number(item.day || 1),
    };
    if (!normal.amount) return list;
    const provider = getBillBaseName(normal.name);
    const matchIndex = list.findIndex((existing) => {
      const existingProvider = getBillBaseName(existing.name);
      const sameKey = existing.key && normal.key && existing.key === normal.key;
      const sameProvider = provider && existingProvider && provider === existingProvider;
      const closeAmount = Math.abs(existing.amount - normal.amount) <= Math.max(3, normal.amount * 0.12);
      const closeDay = dayDistance(existing.day, normal.day) <= 3;
      const sameHousingPayment =
        /rent|mortgage|landlord|letting/.test(normalizeText(`${normal.name} ${normal.kind} ${existing.name} ${existing.kind}`)) &&
        closeAmount &&
        closeDay;
      return sameKey || (sameProvider && closeAmount) || sameHousingPayment;
    });
    if (matchIndex >= 0) return list;
    return [...list, normal];
  }, []);
}

function getNextBestActions({ goals, debts, investments, checksWaiting, dataFreshness, incomeConfidence, billStreams, safeMonthlySaving, sharedBillContributions }) {
  const actions = [];
  if (checksWaiting.length > 0) actions.push({ key: "checks", label: "Answer Checks", target: "confidence" });
  if (sharedBillContributions?.needsChecking?.length > 0) actions.push({ key: "shared-bills", label: "Check shared bill money", target: "coach" });
  if (billStreams.length === 0 && dataFreshness.hasData) actions.push({ key: "calendar", label: "Check Calendar bills", target: "calendar" });
  if (dataFreshness.needsUpload) actions.push({ key: "upload", label: "Add latest statement", target: "upload" });
  if (!goals.length) actions.push({ key: "goal", label: "Add a simple goal", target: "goals" });
  if (incomeConfidence !== "low" && safeMonthlySaving > 0) actions.push({ key: "coach", label: "Ask AI for a plan", target: "coach" });
  if (debts.length > 0 && safeMonthlySaving > 0) actions.push({ key: "debt", label: "Check debt repayments", target: "debts" });
  if (investments.length > 0 && safeMonthlySaving <= 0) actions.push({ key: "invest", label: "Review investing", target: "investments" });
  return actions.slice(0, 5);
}

function getGoalStatus({ amountLeft, requiredMonthly, targetMonths, safeMonthly, stretchMonthly, appMoneyModel }) {
  if (!amountLeft) return { label: "Done", tone: "good", body: "This goal is already covered." };
  if (appMoneyModel?.income?.confidence === "low") {
    return { label: "Needs better data", tone: "warn", body: "Money Hub needs clearer income before this goal plan is reliable." };
  }
  if (!targetMonths) {
    return safeMonthly > 0
      ? { label: "Plan ready", tone: "good", body: `A safe amount looks like ${formatCurrency(safeMonthly)} a month.` }
      : { label: "Not safe yet", tone: "bad", body: "There is no safe monthly saving amount visible yet." };
  }
  if (requiredMonthly <= safeMonthly) {
    return { label: "On track", tone: "good", body: `The target needs ${formatCurrency(requiredMonthly)} a month, which fits the safe amount.` };
  }
  if (requiredMonthly <= stretchMonthly) {
    return { label: "Tight", tone: "warn", body: `This could work at ${formatCurrency(requiredMonthly)} a month, but only with less usual spending.` };
  }
  return { label: "Not realistic yet", tone: "bad", body: "The target needs more each month than the current safe plan shows." };
}

function getMonthsUntil(dateString) {
  if (!dateString) return null;
  const target = parseAppDate(dateString);
  if (!target) return null;
  const today = new Date();
  const monthDiff = (target.getFullYear() - today.getFullYear()) * 12 + target.getMonth() - today.getMonth();
  return Math.max(monthDiff + 1, 1);
}

function monthKey(date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}`;
}

function sumAmounts(transactions) {
  return transactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
