import { formatCurrency, isInternalTransferLike, isThisMonth, normalizeText } from "./finance";

export function getDebtSignals(transactions) {
  const keywords = [
    ["barclaycard", "Barclaycard"],
    ["mbna", "MBNA"],
    ["capital one", "Capital One"],
    ["klarna", "Klarna"],
    ["paypal credit", "PayPal Credit"],
    ["zopa", "Zopa"],
    ["amex", "Amex"],
    ["american express", "Amex"],
    ["loan", "Loan Payment"],
    ["finance", "Finance Payment"],
    ["monzo flex", "Monzo Flex"],
    ["tesco bank", "Tesco Bank"],
    ["creation", "Creation Finance"],
    ["virgin money", "Virgin Money"],
  ];

  return buildSignalGroups(transactions, keywords);
}

export function getInvestmentSignals(transactions) {
  const keywords = [
    ["trading 212", "Trading 212"],
    ["vanguard", "Vanguard"],
    ["hargreaves", "Hargreaves Lansdown"],
    ["freetrade", "Freetrade"],
    ["coinbase", "Coinbase"],
    ["binance", "Binance"],
    ["kraken", "Kraken"],
    ["moneybox", "Moneybox"],
    ["plum", "Plum"],
    ["nutmeg", "Nutmeg"],
    ["aj bell", "AJ Bell"],
    ["interactive investor", "Interactive Investor"],
    ["etoro", "eToro"],
    ["wealthify", "Wealthify"],
    ["investengine", "InvestEngine"],
  ];

  return buildInvestmentSignalGroups(transactions, keywords);
}

export function buildSignalGroups(transactions, keywords) {
  const groups = {};

  transactions.forEach((transaction) => {
    if (Number(transaction.amount) >= 0 || isInternalTransferLike(transaction)) return;

    const text = normalizeText(transaction.description);
    const match = keywords.find(([keyword]) => text.includes(keyword));

    if (!match) return;

    const [, label] = match;
    const key = label.toLowerCase();

    if (!groups[key]) {
      groups[key] = {
        key,
        label,
        count: 0,
        total: 0,
        average: 0,
        lastDate: transaction.transaction_date || "",
      };
    }

    groups[key].count += 1;
    groups[key].total += Math.abs(Number(transaction.amount || 0));
    groups[key].average = groups[key].total / groups[key].count;

    if (
      transaction.transaction_date &&
      (!groups[key].lastDate || transaction.transaction_date > groups[key].lastDate)
    ) {
      groups[key].lastDate = transaction.transaction_date;
    }
  });

  return Object.values(groups)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
}

export function buildInvestmentSignalGroups(transactions, keywords) {
  const groups = {};

  transactions.forEach((transaction) => {
    if (isInternalTransferLike(transaction)) return;

    const amount = Number(transaction.amount || 0);
    if (!amount) return;

    const text = normalizeText(transaction.description);
    const match = keywords.find(([keyword]) => text.includes(keyword));

    if (!match) return;

    const [, label] = match;
    const key = label.toLowerCase();

    if (!groups[key]) {
      groups[key] = {
        key,
        label,
        count: 0,
        contributionCount: 0,
        withdrawalCount: 0,
        total: 0,
        withdrawals: 0,
        netContributed: 0,
        average: 0,
        lastDate: transaction.transaction_date || "",
      };
    }

    groups[key].count += 1;

    if (amount < 0) {
      groups[key].contributionCount += 1;
      groups[key].total += Math.abs(amount);
    } else {
      groups[key].withdrawalCount += 1;
      groups[key].withdrawals += amount;
    }

    groups[key].netContributed = groups[key].total - groups[key].withdrawals;
    groups[key].average =
      groups[key].contributionCount > 0
        ? groups[key].total / groups[key].contributionCount
        : 0;

    if (
      transaction.transaction_date &&
      (!groups[key].lastDate || transaction.transaction_date > groups[key].lastDate)
    ) {
      groups[key].lastDate = transaction.transaction_date;
    }
  });

  return Object.values(groups)
    .filter((group) => group.contributionCount > 0 || group.withdrawalCount > 0)
    .sort((a, b) => Math.abs(b.netContributed) - Math.abs(a.netContributed))
    .slice(0, 6);
}

export function formatInvestmentSignalNet(signal) {
  const net = Number(signal.netContributed ?? signal.total ?? 0);
  if (net > 0) return formatCurrency(net);
  if (net < 0) return `-${formatCurrency(Math.abs(net))}`;
  return "Even";
}

export function formatInvestmentSignalMeta(signal) {
  const contributions = Number(signal.contributionCount ?? signal.count ?? 0);
  const withdrawals = Number(signal.withdrawalCount || 0);
  const parts = [];

  if (contributions > 0) {
    parts.push(`${contributions} deposit${contributions === 1 ? "" : "s"}`);
  }

  if (withdrawals > 0) {
    parts.push(`${withdrawals} withdrawal${withdrawals === 1 ? "" : "s"}`);
  }

  if (signal.average > 0) {
    parts.push(`avg deposit ${formatCurrency(signal.average)}`);
  }

  parts.push(`last seen ${signal.lastDate || "unknown"}`);

  return parts.join(" · ");
}

export function getInvestmentSignalNote(signal) {
  const deposited = formatCurrency(Number(signal.total || 0));
  const withdrawn = formatCurrency(Number(signal.withdrawals || 0));
  const net = formatInvestmentSignalNet(signal);
  return `Created from statement activity for ${signal.label}. Deposits spotted: ${deposited}. Withdrawals spotted: ${withdrawn}. Net put in: ${net}. Check this against the broker before treating it as portfolio value.`;
}

export function getDebtMatchSummary(debt, transactions) {
  const keywords = getRecordKeywords(debt.payment_keywords, debt.name, debt.lender);
  const matches = transactions.filter((transaction) => {
    if (Number(transaction.amount) >= 0) return false;
    const text = normalizeText(transaction.description);
    return keywords.some((keyword) => keyword && text.includes(keyword));
  });

  return {
    count: matches.length,
    lastDate: matches[0]?.transaction_date || "",
    latest: matches[0] || null,
  };
}

export function getInvestmentMatchSummary(investment, transactions) {
  const keywords = getRecordKeywords(
    investment.contribution_keywords,
    investment.name,
    investment.platform
  );
  const matches = transactions.filter((transaction) => {
    if (Number(transaction.amount) >= 0) return false;
    const text = normalizeText(transaction.description);
    return keywords.some((keyword) => keyword && text.includes(keyword));
  });

  return {
    count: matches.length,
    lastDate: matches[0]?.transaction_date || "",
    latest: matches[0] || null,
  };
}

export function getDebtMonthlyStatus(debt, transactions) {
  const keywords = getRecordKeywords(debt.payment_keywords, debt.name, debt.lender);
  const thisMonthMatches = transactions.filter((transaction) => {
    if (Number(transaction.amount) >= 0) return false;
    if (!isThisMonth(transaction.transaction_date)) return false;
    const text = normalizeText(transaction.description);
    return keywords.some((keyword) => keyword && text.includes(keyword));
  });

  if (thisMonthMatches.length > 0) {
    return { label: "Paid this month", tone: "good" };
  }

  const dueDay = Number(debt.due_day || 0);
  const today = new Date().getDate();

  if (dueDay && today < dueDay) {
    return { label: "Due soon", tone: "warn" };
  }

  if (dueDay && today >= dueDay) {
    return { label: "Check this", tone: "bad" };
  }

  return { label: "Watching", tone: "neutral" };
}

export function getInvestmentMonthlyStatus(investment, transactions) {
  const keywords = getRecordKeywords(
    investment.contribution_keywords,
    investment.name,
    investment.platform
  );
  const thisMonthMatches = transactions.filter((transaction) => {
    if (Number(transaction.amount) >= 0) return false;
    if (!isThisMonth(transaction.transaction_date)) return false;
    const text = normalizeText(transaction.description);
    return keywords.some((keyword) => keyword && text.includes(keyword));
  });

  if (thisMonthMatches.length > 0) {
    return { label: "Contributed this month", tone: "good" };
  }

  return { label: "Quiet this month", tone: "warn" };
}

export function getDebtStatusSummary(debts, transactions) {
  if (debts.length === 0) {
    return {
      headline: "No debt records saved yet",
      body: "Debt-looking statement lines can be confirmed into proper debt records here.",
    };
  }

  const statuses = debts.map((debt) => getDebtMonthlyStatus(debt, transactions));
  const paidCount = statuses.filter((item) => item.tone === "good").length;
  const checkCount = statuses.filter((item) => item.tone === "bad").length;

  if (checkCount > 0) {
    return {
      headline: `${checkCount} debt payment${checkCount === 1 ? "" : "s"} may need checking`,
      body: "At least one saved debt does not look clearly paid this month yet.",
    };
  }

  if (paidCount > 0) {
    return {
      headline: `${paidCount} debt${paidCount === 1 ? "" : "s"} already look paid this month`,
      body: "Your debt tracking is starting to move beyond setup and into real monthly monitoring.",
    };
  }

  return {
    headline: "Debt tracking is watching the month",
    body: "No obvious issue yet, but not enough matched payment activity has shown up this month.",
  };
}

export function getInvestmentStatusSummary(investments, transactions) {
  if (investments.length === 0) {
    return {
      headline: "No investment records saved yet",
      body: "Broker or crypto funding can be turned into proper investment records here.",
    };
  }

  const statuses = investments.map((investment) =>
    getInvestmentMonthlyStatus(investment, transactions)
  );
  const activeCount = statuses.filter((item) => item.tone === "good").length;

  if (activeCount > 0) {
    return {
      headline: `${activeCount} investment${activeCount === 1 ? "" : "s"} funded this month`,
      body: "Your investing section is starting to show real contribution behaviour, not just static setup.",
    };
  }

  return {
    headline: "No obvious investing contribution this month",
    body: "That may be fine, but if you expected contributions, this is worth checking.",
  };
}

export function hasMatchingDebt(signal, debts) {
  return debts.some((debt) => {
    const haystack = normalizeText(
      `${debt.name} ${debt.lender} ${debt.payment_keywords?.join(" ") || ""}`
    );
    return haystack.includes(normalizeText(signal.label));
  });
}

export function hasMatchingInvestment(signal, investments) {
  return investments.some((investment) => {
    const haystack = normalizeText(
      `${investment.name} ${investment.platform} ${
        investment.contribution_keywords?.join(" ") || ""
      }`
    );
    return haystack.includes(normalizeText(signal.label));
  });
}

export function buildDebtDedupeKey(payload) {
  return normalizeText(
    `${payload.name}|${payload.lender || ""}|${payload.minimum_payment || ""}|${payload.due_day || ""}`
  );
}

export function buildInvestmentDedupeKey(payload) {
  return normalizeText(
    `${payload.name}|${payload.platform || ""}|${payload.asset_type || ""}|${payload.monthly_contribution || ""}|${payload.ticker_symbol || ""}`
  );
}

export function buildKeywords(...values) {
  return values
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .slice(0, 5);
}

export function getRecordKeywords(keywords = [], ...fallbacks) {
  const list = [...(Array.isArray(keywords) ? keywords : []), ...fallbacks];
  return list.map((item) => normalizeText(item)).filter(Boolean);
}
























