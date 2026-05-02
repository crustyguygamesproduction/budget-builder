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
  const upcomingBills = moneyUnderstanding?.summary?.upcomingBills || getUpcomingBills(billStreams);
  const monthWindow = getRecentMonthWindow(transactions, 3);
  const monthCount = Math.max(monthWindow.monthKeys.length, 1);
  const windowTransactions = transactions.filter((transaction) =>
    transactionInWindow(transaction, monthWindow)
  );

  const incomeTransactions = getIncomeTransactions(windowTransactions);
  const incomeTotal = sumAmounts(incomeTransactions);
  const monthlyIncome = incomeTransactions.length ? incomeTotal / monthCount : 0;
  const incomeConfidence = getIncomeConfidence(incomeTransactions, monthWindow.monthKeys);
  const upcomingIncome = getUpcomingIncome(incomeTransactions, incomeConfidence);

  const monthlyBillTotal = calendarBills.reduce(
    (sum, stream) => sum + Math.abs(Number(stream.amount || 0)),
    0
  );
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
      : Math.max(monthlyIncome - monthlyBillTotal - monthlyFlexibleSpending * 1.05, 0);
  const stretchMonthlySaving =
    incomeConfidence === "low"
      ? 0
      : Math.max(monthlyIncome - monthlyBillTotal - monthlyFlexibleSpending * 0.85, 0);
  const visibleCash = getVisibleCash(accounts);
  const affordabilityTone = getAffordabilityTone({
    visibleCash,
    monthlyIncome,
    monthlyBillTotal,
    monthlyFlexibleSpending,
    safeMonthlySaving,
    incomeConfidence,
  });

  const checksWaiting = moneyUnderstanding?.checks || [];
  const dataFreshness = getModelFreshness(transactions);
  const confidenceWarnings = getConfidenceWarnings({
    dataFreshness,
    checksWaiting,
    incomeConfidence,
    flexibleSpendingConfidence,
    visibleCash,
  });

  return {
    source: moneyUnderstanding?.source || "money-understanding",
    transactions,
    bills: billStreams,
    calendarBills,
    billStreams,
    recurringEvents: moneyUnderstanding?.recurringEvents || [],
    upcomingBills,
    monthlyBillTotal,
    fixedCommitments: billStreams,
    income: {
      transactions: incomeTransactions,
      monthlyEstimate: roundMoney(monthlyIncome),
      confidence: incomeConfidence,
      label: incomeConfidence === "low" ? "Income is not clear yet" : formatCurrency(monthlyIncome),
      upcoming30Days: upcomingIncome,
    },
    upcomingIncome,
    flexibleSpending: {
      transactions: flexibleTransactions,
      monthlyEstimate: roundMoney(monthlyFlexibleSpending),
      confidence: flexibleSpendingConfidence,
      label: flexibleSpendingConfidence === "low" ? "Needs checking" : formatCurrency(monthlyFlexibleSpending),
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
    }),
    aiContext: {
      monthly_income_estimate: roundMoney(monthlyIncome),
      income_confidence: incomeConfidence,
      expected_income_next_30_days: upcomingIncome,
      monthly_bills_from_calendar: roundMoney(monthlyBillTotal),
      monthly_flexible_spending_estimate: roundMoney(monthlyFlexibleSpending),
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

function getUpcomingIncome(incomeTransactions = [], incomeConfidence = "low") {
  if (incomeConfidence === "low" || !incomeTransactions.length) {
    return {
      amount: 0,
      count: 0,
      items: [],
      confidence: "low",
      label: "Income not clear yet",
      helper: "Upload more history or confirm income before Money Hub predicts money coming in.",
    };
  }

  const groups = incomeTransactions.reduce((map, transaction) => {
    const amount = Math.abs(Number(transaction.amount || 0));
    const date = parseAppDate(transaction.transaction_date);
    if (!amount || !date) return map;
    const key = transactionKey(transaction);
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const items = [...groups.values()]
    .filter((group) => group.monthKeys.size >= 2 || incomeConfidence === "high")
    .map((group) => {
      const day = likelyDay(group.dates);
      const date = nextDateForDay(day, today);
      return {
        key: group.key,
        name: group.name,
        amount: roundMoney(usualAmount(group.amounts)),
        day,
        date: toIsoDate(date),
        daysAway: Math.max(Math.round((date - today) / 86400000), 0),
        confidence: group.monthKeys.size >= 2 ? "high" : "medium",
      };
    })
    .filter((item) => item.amount > 0 && item.daysAway <= 30)
    .sort((a, b) => a.daysAway - b.daysAway || b.amount - a.amount);

  const amount = roundMoney(items.reduce((sum, item) => sum + item.amount, 0));
  return {
    amount,
    count: items.length,
    items,
    confidence: items.length ? incomeConfidence : "low",
    label: items.length ? formatCurrency(amount) : "No expected income found",
    helper: items.length ? "Based on repeated income in your uploaded statements." : "Income history exists, but the next date is not clear yet.",
  };
}

function cleanIncomeName(transaction) {
  const provider = getBillBaseName(transaction._real_merchant_name || transaction.description || "Income");
  return provider ? provider.split(" ").slice(0, 4).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") : "Income";
}

function nextDateForDay(day, today) {
  const safeDay = Math.max(1, Math.min(Number(day || 1), 28));
  let date = new Date(today.getFullYear(), today.getMonth(), safeDay);
  if (date < today) date = new Date(today.getFullYear(), today.getMonth() + 1, safeDay);
  date.setHours(0, 0, 0, 0);
  return date;
}

function likelyDay(dates = []) {
  const days = dates.map((date) => date.getDate()).filter(Boolean);
  if (!days.length) return 1;
  const counts = days.reduce((map, day) => map.set(day, (map.get(day) || 0) + 1), new Map());
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
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

function recurringKeys(transactions) {
  const groups = transactions.reduce((map, transaction) => {
    const key = transactionKey(transaction);
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

function getConfidenceWarnings({ dataFreshness, checksWaiting, incomeConfidence, flexibleSpendingConfidence, visibleCash }) {
  const warnings = [];
  if (!dataFreshness.hasData) warnings.push("Upload a statement so Money Hub can build your plan.");
  if (dataFreshness.needsUpload && dataFreshness.hasData) warnings.push("Add your latest statement before trusting today's spending room.");
  if (checksWaiting.length > 0) warnings.push("Answer Checks so bills, transfers and spending do not get mixed up.");
  if (incomeConfidence === "low") warnings.push("Income is not clear yet.");
  if (flexibleSpendingConfidence === "low") warnings.push("Usual spending needs more history.");
  if (!visibleCash.hasKnownBalance) warnings.push("Current cash is not supplied, so safe-to-spend stays conservative.");
  return warnings;
}

function getAffordabilityTone({ visibleCash, monthlyIncome, monthlyBillTotal, monthlyFlexibleSpending, safeMonthlySaving, incomeConfidence }) {
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
      body: "Your Calendar bills are higher than clear income, so the plan needs checking before saving more.",
    };
  }
  if (monthlyBillTotal > 0 && visibleCash.hasKnownBalance && visibleCash.amount <= monthlyBillTotal * 0.5) {
    return {
      status: "tight",
      label: "Tight",
      body: "Your visible cash looks tight against bills due, so keep saving conservative.",
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
    body: safeMonthlySaving > 0
      ? "This protects Calendar bills before treating anything as saveable."
      : "There may be room later, but this data does not show a safe automatic amount yet.",
  };
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
      return sameKey || (sameProvider && closeAmount);
    });
    if (matchIndex >= 0) return list;
    return [...list, normal];
  }, []);
}

function getNextBestActions({ goals, debts, investments, checksWaiting, dataFreshness, incomeConfidence, billStreams, safeMonthlySaving }) {
  const actions = [];
  if (checksWaiting.length > 0) actions.push({ key: "checks", label: "Answer Checks", target: "confidence" });
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
