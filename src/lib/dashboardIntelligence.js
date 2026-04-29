import { cleanEventTitle, getRecurringCalendarEvents } from "./calendarIntelligence";
import {
  dayDifference,
  formatCurrency,
  formatDateShort,
  formatMonthYear,
  getMeaningfulCategory,
  isInternalTransferLike,
  isThisMonth,
  isTransactionInMonth,
  normalizeText,
  parseAppDate,
  startOfDay,
  startOfMonth,
  toIsoDate,
} from "./finance";

export function isGenericCategory(category) {
  return ["", "Income", "Spending", "Uncategorised"].includes(String(category || "").trim());
}

export function getTransactionMerchantKey(description) {
  return normalizeText(description)
    .replace(/(?:^|\s)(card|payment|debit|credit|contactless|visa|pos|purchase|transaction|fpi|ref|dd|so)(?=\s|$)/g, " ")
    .replace(/(?:^|\s)\d{2,}(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getCashSummary(accounts, transactions) {
  const balanceFields = ["available_balance", "current_balance", "balance", "available", "current"];
  const balances = accounts
    .map((account) => {
      for (const field of balanceFields) {
        const value = account?.[field];
        if (value === null || value === undefined || value === "") continue;
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) return parsed;
      }
      return null;
    })
    .filter((value) => value !== null);

  const freshness = getDataFreshness(transactions);

  if (balances.length > 0) {
    const total = balances.reduce((sum, value) => sum + Number(value || 0), 0);
    const looksLikePlaceholder = Math.abs(total) < 0.01 && freshness.hasData;

    if (!looksLikePlaceholder) {
      return {
        hasLiveBalances: true,
        amount: total,
        primaryDisplay: formatCurrency(total),
        label: "Cash in your accounts",
        badge: total <= 25 ? "Tight right now" : "Balance-based",
        body:
          total <= 25
            ? "This is the money your accounts say you have right now, so spending room looks genuinely tight today."
            : "This is the latest balance we know across your linked accounts, so it is more honest than a guess from historic spending alone.",
      };
    }
  }

  if (freshness.needsUpload) {
    const monthSnapshot = getDisplayedMonthSnapshot(transactions);
    if (freshness.hasData) {
      return {
        hasLiveBalances: false,
        amount: monthSnapshot.net,
        primaryDisplay: `${monthSnapshot.net >= 0 ? "+" : "-"}${formatCurrency(Math.abs(monthSnapshot.net))}`,
        label: `${monthSnapshot.monthName} reliable read`,
        badge: "Needs latest statement",
        body: `This is the latest month Money Hub can explain properly. It shows ${formatCurrency(monthSnapshot.income)} real income against ${formatCurrency(monthSnapshot.spending)} real spending, after detected transfers are stripped out.`,
      };
    }

    return {
      hasLiveBalances: false,
      amount: 0,
      primaryDisplay: "Needs refresh",
      label: "Recent data needed",
      badge: "Refresh needed",
      body: "Upload your first statement so Money Hub can build a real picture instead of guessing.",
    };
  }

  const monthSnapshot = getDisplayedMonthSnapshot(transactions);

  return {
    hasLiveBalances: false,
    amount: monthSnapshot.net,
    primaryDisplay: formatCurrency(monthSnapshot.net),
    label: `${monthSnapshot.monthName} net movement`,
    badge: "Imported pattern",
    body:
      "This is based on imported statement history rather than a live bank balance, so treat it as a pattern read rather than spendable cash.",
  };
}

export function getSubscriptionSummary(transactions) {
  const groups = {};

  transactions.forEach((transaction) => {
    if (Number(transaction.amount) >= 0 || !transaction.is_subscription) return;
    const name = cleanEventTitle(transaction.description || "Subscription");
    if (!groups[name]) {
      groups[name] = { name, total: 0, count: 0 };
    }

    groups[name].total += Math.abs(Number(transaction.amount || 0));
    groups[name].count += 1;
  });

  const items = Object.values(groups).sort((a, b) => b.total - a.total);

  return {
    count: items.length,
    items,
    topLine: items.length > 0 ? `${items[0].name} is the biggest obvious one at ${formatCurrency(items[0].total)}.` : "",
  };
}

export function buildSubscriptionCoachPrompt(subscriptionSummary) {
  if (!subscriptionSummary?.items?.length) {
    return "Do I have any subscription-style payments hiding in my imported statements?";
  }

  const lines = subscriptionSummary.items
    .slice(0, 8)
    .map((item) => `- ${item.name}: ${formatCurrency(item.total)} across ${item.count} hit${item.count === 1 ? "" : "s"}`)
    .join("\n");

  return `Review my subscription-style payments and rank the easiest ones to cancel first. Use this detected list and be specific:\n${lines}\n\nTell me: 1. biggest totals, 2. easiest quick wins, 3. any that look duplicated or suspicious.`;
}

export function getMonthSnapshotForDate(transactions, viewDate = new Date()) {
  const monthTransactions = transactions.filter((transaction) => isTransactionInMonth(transaction, viewDate));
  const settled = monthTransactions.filter((transaction) => !isInternalTransferLike(transaction));
  const income = settled
    .filter((transaction) => Number(transaction.amount) > 0)
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const spending = settled
    .filter((transaction) => Number(transaction.amount) < 0)
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
  const net = income - spending;
  const activeDays = new Set(settled.map((transaction) => transaction.transaction_date).filter(Boolean)).size;
  const biggestSpend = settled
    .filter((transaction) => Number(transaction.amount) < 0)
    .reduce((biggest, transaction) => Math.max(biggest, Math.abs(Number(transaction.amount || 0))), 0);

  return {
    income,
    spending,
    net,
    activeDays,
    biggestSpend,
    biggestSpendLabel: biggestSpend > 0 ? formatCurrency(biggestSpend) : "Nothing big yet",
    monthDate: startOfMonth(viewDate),
    monthName: formatMonthYear(viewDate),
  };
}

export function getCurrentMonthSnapshot(transactions) {
  const base = getMonthSnapshotForDate(transactions, new Date());

  return {
    ...base,
    isCurrent: true,
    needsRefresh: false,
    label: "This month",
    pillLabel: "This month",
    sectionTitle: "This Month",
    headline: base.net >= 0 ? `Up ${formatCurrency(base.net)} so far this month` : `Down ${formatCurrency(Math.abs(base.net))} so far this month`,
    body: `${base.activeDays} active day${base.activeDays === 1 ? "" : "s"} so far, with ${formatCurrency(base.income)} in and ${formatCurrency(base.spending)} out.`,
  };
}

export function getDisplayedMonthSnapshot(transactions) {
  const freshness = getDataFreshness(transactions);

  if (!freshness.hasData) {
    return {
      ...getCurrentMonthSnapshot(transactions),
      headline: "No statement data yet",
      body: "Upload your first bank statement to unlock this month and category insights.",
    };
  }

  if (freshness.hasCurrentMonthData) {
    return getCurrentMonthSnapshot(transactions);
  }

  const base = getMonthSnapshotForDate(transactions, freshness.latestDate);

  return {
    ...base,
    isCurrent: false,
    needsRefresh: true,
    label: "Latest visible month",
    pillLabel: "Latest month",
    sectionTitle: "Latest Visible Month",
    headline: `${base.monthName} is the latest visible month`,
    body: "No current-month activity is visible here yet. Upload your latest statement so today's view stops looking empty.",
  };
}

export function getStatementCoverageSummary(transactions, statementImports = []) {
  const validDates = transactions
    .map((transaction) => parseAppDate(transaction.transaction_date))
    .filter(Boolean)
    .sort((a, b) => a - b);
  const statementEndDates = (Array.isArray(statementImports) ? statementImports : [])
    .map((item) => parseAppDate(item?.end_date || item?.endDate || item?.start_date || item?.created_at))
    .filter(Boolean)
    .sort((a, b) => a - b);
  const importedFileCount = Array.isArray(statementImports) && statementImports.length > 0
    ? statementImports.length
    : new Set(transactions.map((transaction) => transaction.import_id).filter(Boolean)).size;

  if (validDates.length === 0) {
    return {
      hasData: false,
      monthCount: 0,
      monthCountLabel: "0 months",
      fileCount: importedFileCount,
      rangeLabel: "No history yet",
      headline: "Upload your first statement",
      body: "One statement gives Money Hub a first read. Three or more months unlock better recurring bills, trend reads, and AI advice.",
      nextUnlock: "Your first statement unlocks categories, calendar history, and AI reads.",
      latestStatementMonthLabel: statementEndDates.length ? formatMonthYear(statementEndDates[statementEndDates.length - 1]) : "",
      latestTransactionMonthLabel: "",
      hasCoverageGap: false,
    };
  }

  const monthKeys = [...new Set(validDates.map((date) => `${date.getFullYear()}-${date.getMonth() + 1}`))];
  const monthCount = monthKeys.length;
  const earliestDate = validDates[0];
  const latestDate = validDates[validDates.length - 1];
  const latestStatementDate = statementEndDates[statementEndDates.length - 1] || null;
  const coverageGapDays = latestStatementDate
    ? Math.round((startOfDay(latestStatementDate).getTime() - startOfDay(latestDate).getTime()) / 86400000)
    : 0;
  const hasCoverageGap = coverageGapDays > 14;

  let headline = "Strong history loaded";
  let body = "You already have enough history for believable pattern reads, so new uploads mostly keep the app fresh.";
  let nextUnlock = "Keep adding the newest statement so the current month stays accurate.";

  if (monthCount === 1) {
    headline = "One month loaded so far";
    body = "A second and third month will make recurring bills, salary rhythm, and subscription checks much sharper.";
    nextUnlock = "Two more months should unlock much better recurring payment detection.";
  } else if (monthCount < 3) {
    headline = `${monthCount} months loaded so far`;
    body = "You are past the first read now. One more month should make trends, recurring charges, and AI advice feel far less flimsy.";
    nextUnlock = "One more month should make recurring reads and trends much steadier.";
  } else if (monthCount < 6) {
    headline = `${monthCount} months of history is a good base`;
    body = "Recurring bills, subscriptions, and month-vs-month changes are believable now. More months will make salary rhythm and unusual-spend reads steadier.";
    nextUnlock = "More history now mostly sharpens pattern confidence and calendar reads.";
  }

  if (hasCoverageGap) {
    headline = "One of your latest uploads may need checking";
    body = `The uploaded statement range reaches ${formatMonthYear(latestStatementDate)}, but the saved visible transactions currently stop at ${formatMonthYear(latestDate)}.`;
    nextUnlock = "Re-upload or check the latest CSV mapping so the visible history catches up with the uploaded statement range.";
  }

  return {
    hasData: true,
    monthCount,
    monthCountLabel: `${monthCount} month${monthCount === 1 ? "" : "s"}`,
    fileCount: importedFileCount,
    rangeLabel: `${formatMonthYear(earliestDate)} to ${formatMonthYear(latestDate)}`,
    headline,
    body,
    nextUnlock,
    latestStatementMonthLabel: latestStatementDate ? formatMonthYear(latestStatementDate) : "",
    latestTransactionMonthLabel: formatMonthYear(latestDate),
    hasCoverageGap,
    coverageGapDays,
  };
}

export function getDataFreshness(transactions) {
  const validDates = transactions
    .map((transaction) => parseAppDate(transaction.transaction_date))
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (validDates.length === 0) {
    return {
      hasData: false,
      hasCurrentMonthData: false,
      latestDate: null,
      latestMonthLabel: "",
      latestDateLabel: "",
      daysSinceLatest: null,
      needsUpload: true,
    };
  }

  const latestDate = validDates[validDates.length - 1];
  const today = startOfDay(new Date());
  const latestDay = startOfDay(latestDate);
  const daysSinceLatest = Math.max(Math.round((today.getTime() - latestDay.getTime()) / 86400000), 0);
  const hasCurrentMonthData = validDates.some((date) => isThisMonth(toIsoDate(date)));

  return {
    hasData: true,
    hasCurrentMonthData,
    latestDate,
    latestMonthLabel: formatMonthYear(latestDate),
    latestDateLabel: formatDateShort(latestDate),
    daysSinceLatest,
    needsUpload: !hasCurrentMonthData || daysSinceLatest > 35,
  };
}

export function getTopCategories(transactions) {
  const totals = {};

  transactions.forEach((t) => {
    if (Number(t.amount) >= 0 || isInternalTransferLike(t)) return;

    const category = getMeaningfulCategory(t) || "Uncategorised";
    totals[category] = (totals[category] || 0) + Math.abs(Number(t.amount || 0));
  });

  return Object.entries(totals)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
}

export function enhanceTransactions(transactions) {
  const prepared = transactions.map((transaction) => ({
    ...transaction,
    amount: Number(transaction.amount || 0),
  }));

  const incomingByAmount = new Map();
  const outgoingByAmount = new Map();
  const merchantCategoryVotes = new Map();

  prepared.forEach((transaction) => {
    if (transaction.amount !== 0) {
      const key = Math.abs(transaction.amount).toFixed(2);
      const amountMap = transaction.amount > 0 ? incomingByAmount : outgoingByAmount;
      if (!amountMap.has(key)) amountMap.set(key, []);
      amountMap.get(key).push(transaction);
    }

    const category = String(transaction.category || "").trim();
    const merchantKey = getTransactionMerchantKey(transaction.description);

    if (!merchantKey || isGenericCategory(category) || transaction.amount >= 0) return;

    if (!merchantCategoryVotes.has(merchantKey)) {
      merchantCategoryVotes.set(merchantKey, {});
    }

    const votes = merchantCategoryVotes.get(merchantKey);
    votes[category] = (votes[category] || 0) + 1;
  });

  function getLearnedCategory(description) {
    const merchantKey = getTransactionMerchantKey(description);
    if (!merchantKey || !merchantCategoryVotes.has(merchantKey)) return "";

    const votes = merchantCategoryVotes.get(merchantKey);
    const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];

    if (!winner || winner[1] < 2) return "";
    return winner[0];
  }

  return prepared.map((transaction) => {
    const existingFlag = Boolean(transaction.is_internal_transfer);
    let smartInternalTransfer = existingFlag;

    if (!existingFlag && transaction.amount !== 0) {
      const key = Math.abs(transaction.amount).toFixed(2);
      const possibleMatches = transaction.amount < 0
        ? incomingByAmount.get(key) || []
        : outgoingByAmount.get(key) || [];
      const match = possibleMatches.find((candidate) => {
        if (candidate.account_id === transaction.account_id) return false;
        const dayDiff = Math.abs(dayDifference(candidate.transaction_date, transaction.transaction_date));
        return dayDiff <= 3;
      });

      const description = normalizeText(transaction.description);
      const forcedByText = /transfer to|transfer from|standing order to|to savings|from savings|own account|between accounts|bank transfer/.test(description);
      smartInternalTransfer = forcedByText || Boolean(match);
    }

    let smartCategory = String(transaction.category || "").trim();

    if (smartInternalTransfer) {
      smartCategory = "Internal Transfer";
    } else if (isGenericCategory(smartCategory)) {
      const learnedCategory = getLearnedCategory(transaction.description);
      if (learnedCategory) {
        smartCategory = learnedCategory;
      }
    }

    if (!smartCategory) {
      smartCategory = transaction.amount > 0 ? "Income" : "Spending";
    }

    return {
      ...transaction,
      _smart_internal_transfer: smartInternalTransfer,
      _smart_category: smartCategory,
    };
  });
}

export function getTransferSummary(transactions) {
  const transfers = transactions.filter((transaction) => isInternalTransferLike(transaction));
  const total = transfers.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);

  return {
    headline: transfers.length > 0 ? `${transfers.length} transfer-like movement${transfers.length === 1 ? "" : "s"} spotted` : "No obvious transfer loops yet",
    body: transfers.length > 0 ? `About £${total.toFixed(2)} looks more like money moving between accounts than true spend or income.` : "Once multiple accounts are loaded, the app can strip more fake income and fake spending out of the picture.",
    transfers,
  };
}

function getRecordKeywords(keywords = [], ...fallbacks) {
  const list = [...(Array.isArray(keywords) ? keywords : []), ...fallbacks];
  return list.map((item) => normalizeText(item)).filter(Boolean);
}

export function getDebtProgressSummary(debt, transactions) {
  const keywords = getRecordKeywords(debt.payment_keywords, debt.name, debt.lender);
  const thisMonthPayments = transactions.filter((transaction) => {
    if (Number(transaction.amount) >= 0) return false;
    if (!isThisMonth(transaction.transaction_date)) return false;
    const text = normalizeText(transaction.description);
    return keywords.some((keyword) => keyword && text.includes(keyword));
  });

  const monthlyPaid = thisMonthPayments.reduce(
    (sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)),
    0
  );
  const minimum = Number(debt.minimum_payment || 0);
  const currentBalance = Number(debt.current_balance || 0);
  const monthlyPaidLabel = monthlyPaid > 0 ? `£${monthlyPaid.toFixed(2)}` : "nothing matched yet";
  const paceLabel = minimum > 0 ? (monthlyPaid >= minimum ? "on or above minimum" : "below minimum so far") : "minimum not set";
  const monthlyRate = Number(debt.interest_rate || 0) / 100 / 12;

  let payoffLabel = "not enough data";
  if (currentBalance > 0 && minimum > currentBalance) {
    payoffLabel = "could clear next month at current pace";
  } else if (currentBalance > 0 && minimum > 0) {
    const paymentPower = Math.max(minimum - currentBalance * monthlyRate, 0);
    if (paymentPower > 0) {
      const months = Math.ceil(currentBalance / paymentPower);
      payoffLabel = months <= 1 ? "very close to clear" : `about ${months} months at current pace`;
    } else {
      payoffLabel = "interest may be outpacing the minimum";
    }
  }

  return { monthlyPaid, monthlyPaidLabel, paceLabel, payoffLabel };
}

export function getInvestmentPerformanceSummary(investment) {
  const livePrice = Number(investment.live_price || 0);
  const units = Number(investment.units_owned || 0);
  const currentValue = Number(investment.current_value || 0);
  const totalContributed = Number(investment.total_contributed || 0);
  const marketValue = livePrice > 0 && units > 0 ? livePrice * units : currentValue;
  const gainLoss = marketValue > 0 && totalContributed > 0 ? marketValue - totalContributed : null;

  return {
    marketValue,
    marketValueLabel: marketValue > 0 ? `£${marketValue.toFixed(2)}` : "Value later",
    gainLossLabel:
      gainLoss == null
        ? "not enough data"
        : gainLoss >= 0
        ? `up £${gainLoss.toFixed(2)}`
        : `down £${Math.abs(gainLoss).toFixed(2)}`,
  };
}

export function getDebtPortfolioSnapshot(debts, transactions) {
  const progress = debts.map((debt) => getDebtProgressSummary(debt, transactions));
  return {
    totalBalance: debts.reduce((sum, debt) => sum + Number(debt.current_balance || 0), 0),
    totalMinimum: debts.reduce((sum, debt) => sum + Number(debt.minimum_payment || 0), 0),
    totalPaidThisMonth: progress.reduce((sum, item) => sum + item.monthlyPaid, 0),
    behindCount: progress.filter((item) => item.paceLabel.includes("below")).length,
  };
}

export function getInvestmentPortfolioSnapshot(investments) {
  const performance = investments.map((investment) => getInvestmentPerformanceSummary(investment));
  const marketValue = performance.reduce((sum, item) => sum + Number(item.marketValue || 0), 0);
  const totalContributed = investments.reduce((sum, investment) => sum + Number(investment.total_contributed || 0), 0);
  const gainLoss = marketValue > 0 && totalContributed > 0 ? marketValue - totalContributed : 0;
  const pricedCount = investments.filter((investment) => Number(investment.live_price || 0) > 0).length;

  return {
    marketValue,
    totalContributed,
    gainLoss,
    pricedCount,
  };
}


export function hasMeaningfulExtraction(extracted) {
  if (!extracted || typeof extracted !== "object") return false;
  return Object.values(extracted).some((value) => value !== null && value !== "");
}

export function getHistorySummary(transactions) {
  const months = new Set(
    transactions
      .map((t) => parseAppDate(t.transaction_date))
      .filter(Boolean)
      .map((date) => `${date.getFullYear()}-${date.getMonth() + 1}`)
  );

  const count = months.size;

  if (count >= 6) {
    return {
      label: "Strong",
      headline: `${count} months of history loaded`,
      body: "That is enough history to spot recurring payments, salary cadence and trend shifts with much more confidence.",
    };
  }

  if (count >= 3) {
    return {
      label: "Good",
      headline: `${count} months of history loaded`,
      body: "That is enough to start reading recurring payments and getting useful money pattern signals.",
    };
  }

  return {
    label: "Early",
    headline: count > 0 ? `${count} month${count === 1 ? "" : "s"} loaded` : "No history yet",
    body: "The app gets much smarter after roughly 3 months of statement history, and even better at 6 to 12 months.",
  };
}

export function getRecurringSummary(transactions) {
  const recurring = getRecurringCalendarEvents(transactions);
  const recurringBills = recurring.filter((item) => item.kind !== "income").length;
  const recurringIncome = recurring.filter((item) => item.kind === "income").length;

  if (recurring.length >= 6) {
    return {
      label: "High",
      headline: `${recurring.length} recurring streams detected`,
      body: `${recurringBills} outgoing and ${recurringIncome} incoming streams look repeatable enough to power the calendar and money reminders.`,
    };
  }

  if (recurring.length >= 3) {
    return {
      label: "Medium",
      headline: `${recurring.length} recurring streams detected`,
      body: "The app can already see repeated payments, but more history will make the timing cleaner.",
    };
  }

  return {
    label: "Low",
    headline: "Recurring patterns still forming",
    body: "Once statement history builds up, the app can infer bills, subscriptions, salary cycles and other repeated events more confidently.",
  };
}

export function buildDailyBrief({
  transactionCount,
  totals,
  topCategories,
  subscriptions,
  goalPercent,
  cashSummary,
  dataFreshness,
}) {
  if (transactionCount === 0) {
    return {
      headline: "No data yet",
      body: "Upload your first statement and I'll turn this into something useful.",
    };
  }

  if (dataFreshness?.needsUpload) {
    return {
      headline: dataFreshness.hasData ? "Recent data needed" : "Upload your first statement",
      body: dataFreshness.hasData
        ? `The latest visible month here is ${dataFreshness.latestMonthLabel}, so today's read will stay stale until you upload a fresher statement.`
        : "Upload your first bank statement so Money Hub can stop being a blank shell and start helping properly.",
    };
  }

  if (cashSummary?.hasLiveBalances && cashSummary.amount <= 25) {
    return {
      headline: "Cash is tight today",
      body: "Your live account balance is low enough that this is more of a protect-cash day than a spend-freely day.",
    };
  }

  if (!cashSummary?.hasLiveBalances) {
    return {
      headline: "Live balance still needed",
      body: "The app can read your patterns already, but it should not promise spending room until it has a real account balance to work from.",
    };
  }

  if (
    topCategories[0]?.category === "Takeaway" ||
    topCategories[0]?.category === "Treats"
  ) {
    return {
      headline: "Small leaks are getting loud",
      body: `Your top spend is ${topCategories[0].category}. Not a disaster, but definitely not stealthy either.`,
    };
  }

  if (subscriptions >= 3) {
    return {
      headline: "Subscription check worth doing",
      body: `I found ${subscriptions} subscription-style payments. Easy clean-up if any are dead weight.`,
    };
  }

  if (goalPercent >= 50) {
    return {
      headline: "House goal has momentum",
      body: "You're past halfway on the visible target. Keep protecting that energy.",
    };
  }

  return {
    headline: "Steady, not sloppy",
    body: `Income and spending are broadly balanced at ${formatCurrency(Math.abs(totals.net))} net, and nothing in the latest read looks wildly out of control.`,
  };
}

export function getCoachPromptIdeas({
  topCategories,
  cashSummary,
  houseGoal,
  debtSignals,
  investmentSignals,
}) {
  const prompts = [
    "How am I doing with money overall?",
    "Am I getting better or worse over time?",
  ];

  if (topCategories[0]) {
    prompts.push(`How do I cut my ${topCategories[0].category} spending?`);
  }

  if (debtSignals.length > 0) {
    prompts.push("Do these debt-looking payments seem under control?");
  }

  if (investmentSignals.length > 0) {
    prompts.push("Does my investing activity look sensible?");
  }

  if (cashSummary?.hasLiveBalances && cashSummary.amount > 0) {
    prompts.push(`What can I safely spend with about ${formatCurrency(cashSummary.amount)} in my accounts?`);
  }

  if (houseGoal) {
    prompts.push("Give me a house deposit game plan");
  }

  return [...new Set(prompts)].slice(0, 6);
}

export function getTrendSummary(transactions) {
  const spending = transactions.filter(
    (t) => Number(t.amount) < 0 && !isInternalTransferLike(t)
  );

  const recent = spending.slice(0, 20);
  const previous = spending.slice(20, 40);

  if (recent.length < 6 || previous.length < 6) {
    return {
      label: "Learning",
      headline: "Need a bit more history",
      body: "Once there is more statement data, I can start calling whether you're improving or slipping.",
    };
  }

  const recentTotal = recent.reduce(
    (sum, item) => sum + Math.abs(Number(item.amount || 0)),
    0
  );
  const previousTotal = previous.reduce(
    (sum, item) => sum + Math.abs(Number(item.amount || 0)),
    0
  );

  const change = recentTotal - previousTotal;
  const pct = previousTotal === 0 ? 0 : change / previousTotal;

  if (pct <= -0.1) {
    return {
      label: "Better",
      headline: "Recent spending looks a bit tighter",
      body: "Compared with the previous chunk of transactions, your recent outflow looks lower.",
    };
  }

  if (pct >= 0.1) {
    return {
      label: "Worse",
      headline: "Recent spending looks heavier",
      body: "Compared with the previous chunk of transactions, your recent outflow looks higher.",
    };
  }

  return {
    label: "Flat",
    headline: "You look fairly steady",
    body: "Your recent spending looks broadly similar to the previous chunk of data.",
  };
}

