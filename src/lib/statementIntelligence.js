export function getStatementIntelligenceContext(transactions, query = "") {
  const settled = transactions.filter((transaction) => !isInternalTransferLike(transaction));
  const spending = settled.filter((transaction) => Number(transaction.amount) < 0);
  const income = settled.filter((transaction) => Number(transaction.amount) > 0);
  const transfers = transactions.filter((transaction) => isInternalTransferLike(transaction));
  const dateRange = getTransactionDateRange(transactions);
  const queryFocus = getQueryFocus(transactions, query);
  const merchantGroups = buildTransactionGroups(spending, (transaction) =>
    cleanEventTitle(transaction.description || "Unknown merchant")
  );
  const incomeGroups = buildTransactionGroups(income, (transaction) =>
    cleanEventTitle(transaction.description || "Income")
  );
  const categoryGroups = buildTransactionGroups(spending, (transaction) =>
    getMeaningfulCategory(transaction) || "Spending"
  );
  const accountGroups = buildTransactionGroups(transactions, (transaction) =>
    transaction.accounts?.name || transaction.account_name || transaction.account || "Unassigned account"
  );
  const personalPaymentGroups = buildPersonalPaymentGroups(transactions).slice(0, 40);
  const passThroughAnalysis = buildPassThroughAnalysis(settled);
  const recurringOutgoings = merchantGroups
    .filter((group) => group.count >= 2)
    .sort((a, b) => b.count - a.count || b.total - a.total)
    .slice(0, 20);
  const largeOutgoings = spending
    .slice()
    .sort((a, b) => Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0)))
    .slice(0, 30)
    .map(toCoachTransaction);
  const largeIncome = income
    .slice()
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, 20)
    .map(toCoachTransaction);
  const unusualTransactions = getUnusualTransactions(spending, merchantGroups).slice(0, 30);
  const searchableTransactions = transactions
    .slice()
    .sort((a, b) =>
      String(b.transaction_date || "").localeCompare(String(a.transaction_date || ""))
    )
    .slice(0, 350)
    .map(toCoachTransaction);

  return {
    searchableTransactions,
    queryFocus,
    searchableTransactionNote:
      transactions.length > searchableTransactions.length
        ? `Most recent ${searchableTransactions.length} transactions are included individually. Full-history summaries use all ${transactions.length} transactions.`
        : `All ${transactions.length} transactions are included individually.`,
    summary: {
      date_range: dateRange,
      totals: getTotals(transactions),
      total_transactions: transactions.length,
      settled_transaction_count: settled.length,
      transfer_transaction_count: transfers.length,
      pass_through_analysis: passThroughAnalysis,
      category_totals: categoryGroups.slice(0, 20),
      merchant_totals: merchantGroups.slice(0, 30),
      income_streams: incomeGroups.slice(0, 20),
      account_activity: accountGroups.slice(0, 20),
      personal_payment_groups: personalPaymentGroups,
      recurring_outgoings: recurringOutgoings,
      large_outgoings: largeOutgoings,
      large_income: largeIncome,
      unusual_transactions: unusualTransactions,
    },
  };
}

function getQueryFocus(transactions, query) {
  const terms = getSearchTerms(query);

  if (terms.length === 0) {
    return null;
  }

  const scoredMatches = transactions
    .map((transaction) => ({
      transaction,
      score: scoreTransactionForTerms(transaction, terms),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || String(b.transaction.transaction_date || "").localeCompare(String(a.transaction.transaction_date || "")));
  const matches = scoredMatches.map((item) => item.transaction);
  const moneyIn = matches
    .filter((transaction) => Number(transaction.amount) > 0)
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const moneyOut = matches
    .filter((transaction) => Number(transaction.amount) < 0)
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);

  return {
    original_query: query,
    search_terms: terms,
    direct_match_count: matches.length,
    direct_money_in: moneyIn,
    direct_money_out: moneyOut,
    direct_net: moneyIn - moneyOut,
    grouped_matches: buildTransactionGroups(matches, (transaction) =>
      cleanEventTitle(transaction.description || "Transaction")
    ).slice(0, 20),
    direct_matches: matches.slice(0, 120).map(toCoachTransaction),
    direct_match_note:
      matches.length > 120
        ? `Showing 120 of ${matches.length} direct full-history matches. Totals use all direct matches.`
        : `Showing all ${matches.length} direct full-history matches.`,
  };
}

function getSearchTerms(query) {
  const stopWords = new Set([
    "about",
    "all",
    "and",
    "any",
    "brother",
    "dad",
    "did",
    "does",
    "from",
    "gave",
    "give",
    "have",
    "how",
    "into",
    "money",
    "much",
    "mum",
    "paid",
    "pay",
    "payment",
    "payments",
    "sent",
    "send",
    "sister",
    "the",
    "them",
    "this",
    "to",
    "transfer",
    "transfers",
    "what",
    "when",
    "with",
  ]);

  return [...new Set(normalizeText(query).split(" "))]
    .filter((term) => term.length >= 3 && !stopWords.has(term))
    .slice(0, 8);
}

function scoreTransactionForTerms(transaction, terms) {
  const haystack = normalizeText(
    [
      transaction.description,
      transaction.merchant,
      transaction.category,
      getMeaningfulCategory(transaction),
      transaction.accounts?.name,
      transaction.account_name,
      transaction.account,
    ].join(" ")
  );

  if (!haystack) return 0;

  return terms.reduce((score, term) => {
    const exactWord = new RegExp(`(^|\\s)${escapeRegExp(term)}(\\s|$)`).test(haystack);
    if (exactWord) return score + 4;
    if (haystack.includes(term)) return score + 2;
    return score;
  }, 0);
}

function buildPersonalPaymentGroups(transactions) {
  const candidates = transactions.filter((transaction) => {
    if (Number(transaction.amount) >= 0) return false;
    const description = normalizeText(transaction.description);
    return /transfer|faster payment|fpi|payment to|bank transfer|standing order|mobile payment|online payment/.test(description);
  });

  return buildTransactionGroups(candidates, (transaction) =>
    getPersonalPaymentLabel(transaction.description)
  ).filter((group) => group.label !== "Unlabelled personal transfer");
}

function getPersonalPaymentLabel(description) {
  const noise = new Set([
    "bank",
    "faster",
    "fpi",
    "from",
    "mobile",
    "online",
    "payment",
    "ref",
    "reference",
    "standing",
    "to",
    "transfer",
  ]);
  const tokens = normalizeText(description)
    .split(" ")
    .filter((token) => token.length > 1 && !noise.has(token) && !/^\d+$/.test(token));

  if (!tokens.length) return "Unlabelled personal transfer";
  return toTitleCase(tokens.slice(0, 6).join(" "));
}

function buildPassThroughAnalysis(transactions) {
  const realTransactions = transactions.filter((transaction) => !isInternalTransferLike(transaction));
  const income = realTransactions.filter((transaction) => Number(transaction.amount) > 0);
  const spending = realTransactions.filter((transaction) => Number(transaction.amount) < 0);
  const standardTotals = getTotals(realTransactions);

  const explicitOut = spending.filter((transaction) => isKnownPassThroughOutgoing(transaction));
  const matchingIncomePool = income.filter((transaction) => isLikelyPassThroughIncome(transaction));
  const explicitPassThroughSpending = sumAbs(explicitOut);
  const matchingIncomePoolTotal = sumSigned(matchingIncomePool);
  const explicitPassThroughIncome = Math.min(matchingIncomePoolTotal, explicitPassThroughSpending);
  const explicitAdjustedIncome = standardTotals.income - explicitPassThroughIncome;
  const explicitAdjustedSpending = standardTotals.spending - explicitPassThroughSpending;

  return {
    note:
      "Surplus views are deterministic app calculations. Known pass-through removes Proovia-like outgoings and only the matching amount of likely reimbursement income, rather than treating that income as spendable personal money.",
    standard_view: {
      income: roundMoney(standardTotals.income),
      spending: roundMoney(standardTotals.spending),
      net: roundMoney(standardTotals.net),
    },
    known_pass_through_view: {
      excluded_spending: roundMoney(explicitPassThroughSpending),
      excluded_matching_income: roundMoney(explicitPassThroughIncome),
      adjusted_income: roundMoney(explicitAdjustedIncome),
      adjusted_spending: roundMoney(explicitAdjustedSpending),
      adjusted_net: roundMoney(explicitAdjustedIncome - explicitAdjustedSpending),
      confidence: explicitPassThroughSpending > 0 ? "known_pattern" : "none_found",
      explanation:
        explicitPassThroughSpending > 0
          ? "Proovia-like work pass-through detected. Excluded the outgoing spend and only the matching reimbursement-sized portion of likely work income. Rent, bills and normal lifestyle spending stay included."
          : "No explicit Proovia-like pass-through found in the supplied transactions.",
      example_outgoings: explicitOut.slice(0, 8).map(toCoachTransaction),
      example_income_pool: matchingIncomePool.slice(0, 8).map(toCoachTransaction),
    },
    possible_pass_through_candidates: detectPassThroughCandidates(spending, income),
    warning:
      "Do not tell the user they are personally ahead just because pass-through income exists. If current balances are low, explain that net-over-period and current cash are different, and use adjusted_net as a historical flow only.",
  };
}

function detectPassThroughCandidates(spending, income) {
  const outgoingGroups = buildTransactionGroups(
    spending.filter((transaction) => Math.abs(Number(transaction.amount || 0)) >= 50),
    (transaction) => cleanEventTitle(transaction.description || "Outgoing")
  );
  const incomeGroups = buildTransactionGroups(
    income.filter((transaction) => Number(transaction.amount || 0) >= 50),
    (transaction) => cleanEventTitle(transaction.description || "Income")
  );

  return outgoingGroups
    .filter((group) => group.count >= 2 && group.money_out >= 150 && !isKnownPassThroughLabel(group.label))
    .map((group) => {
      const bestIncomeMatch = incomeGroups.find((incomeGroup) => {
        const smaller = Math.min(group.money_out, incomeGroup.money_in);
        const larger = Math.max(group.money_out, incomeGroup.money_in);
        return larger > 0 && smaller / larger >= 0.65;
      });

      if (!bestIncomeMatch) return null;

      return {
        outgoing_label: group.label,
        outgoing_total: roundMoney(group.money_out),
        outgoing_count: group.count,
        possible_reimbursement_label: bestIncomeMatch.label,
        possible_reimbursement_total: roundMoney(bestIncomeMatch.money_in),
        confidence: "possible",
        reason:
          "Repeated larger outgoings have a similar-sized income stream. This may be work reimbursement/resale/pass-through, but needs user confirmation before excluding from personal surplus.",
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function isKnownPassThroughOutgoing(transaction) {
  return /\bproovia\b|proovia\.delivery|proovia delivery/.test(normalizeText(transaction.description));
}

function isLikelyPassThroughIncome(transaction) {
  const text = normalizeText(
    [transaction.description, transaction.merchant, transaction.category, getMeaningfulCategory(transaction)].join(" ")
  );

  return /\bmynextbike\b|\bmy next bike\b|\bnextbike\b|\bproovia\b|reimburse|reimbursement|expenses?|repayment|refund/.test(text);
}

function isKnownPassThroughLabel(label) {
  return /\bproovia\b|proovia\.delivery|proovia delivery/.test(normalizeText(label));
}

function sumAbs(transactions) {
  return transactions.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
}

function sumSigned(transactions) {
  return transactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function getTotals(transactions) {
  const income = transactions
    .filter((transaction) => Number(transaction.amount) > 0 && !isInternalTransferLike(transaction))
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const spending = transactions
    .filter((transaction) => Number(transaction.amount) < 0 && !isInternalTransferLike(transaction))
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
  const bills = transactions
    .filter((transaction) => transaction.is_bill || transaction.is_subscription)
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);

  return { income, spending, bills, net: income - spending, safeToSpend: 0 };
}

function getTransactionDateRange(transactions) {
  const dates = transactions
    .map((transaction) => parseAppDate(transaction.transaction_date))
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (!dates.length) {
    return {
      start: "",
      end: "",
      label: "No statement history",
      months: 0,
    };
  }

  const start = dates[0];
  const end = dates[dates.length - 1];
  const monthKeys = new Set(
    dates.map((date) => `${date.getFullYear()}-${date.getMonth()}`)
  );

  return {
    start: toIsoDate(start),
    end: toIsoDate(end),
    label: `${formatDateShort(start)} to ${formatDateShort(end)}`,
    months: monthKeys.size,
  };
}

function buildTransactionGroups(transactions, getLabel) {
  const groups = new Map();

  transactions.forEach((transaction) => {
    const label = String(getLabel(transaction) || "Unknown").trim() || "Unknown";
    const key = normalizeText(label) || "unknown";
    const amount = Number(transaction.amount || 0);

    if (!groups.has(key)) {
      groups.set(key, {
        label,
        count: 0,
        total: 0,
        money_in: 0,
        money_out: 0,
        average: 0,
        first_date: transaction.transaction_date || "",
        last_date: transaction.transaction_date || "",
        example: transaction.description || "",
      });
    }

    const group = groups.get(key);
    group.count += 1;
    group.total += Math.abs(amount);
    if (amount > 0) group.money_in += amount;
    if (amount < 0) group.money_out += Math.abs(amount);
    group.average = group.total / group.count;

    if (transaction.transaction_date) {
      if (!group.first_date || transaction.transaction_date < group.first_date) {
        group.first_date = transaction.transaction_date;
      }
      if (!group.last_date || transaction.transaction_date > group.last_date) {
        group.last_date = transaction.transaction_date;
      }
    }
  });

  return [...groups.values()].sort((a, b) => b.total - a.total);
}

function getUnusualTransactions(spending, merchantGroups) {
  const merchantAverages = new Map(
    merchantGroups.map((group) => [normalizeText(group.label), group.average])
  );

  return spending
    .map((transaction) => {
      const label = cleanEventTitle(transaction.description || "Unknown merchant");
      const average = merchantAverages.get(normalizeText(label)) || 0;
      const amount = Math.abs(Number(transaction.amount || 0));
      const ratio = average > 0 ? amount / average : 0;
      return {
        ...toCoachTransaction(transaction),
        usual_amount: average,
        unusual_ratio: ratio,
      };
    })
    .filter((transaction) => transaction.amount_abs >= 25 && transaction.unusual_ratio >= 1.75)
    .sort((a, b) => b.unusual_ratio - a.unusual_ratio);
}

function toCoachTransaction(transaction) {
  const amount = Number(transaction.amount || 0);
  return {
    date: transaction.transaction_date || "",
    description: transaction.description || "",
    merchant: cleanEventTitle(transaction.description || "Transaction"),
    amount,
    amount_abs: Math.abs(amount),
    direction: amount > 0 ? "in" : amount < 0 ? "out" : "zero",
    category: getMeaningfulCategory(transaction),
    account: transaction.accounts?.name || transaction.account_name || transaction.account || "",
    is_bill: Boolean(transaction.is_bill),
    is_subscription: Boolean(transaction.is_subscription),
    is_internal_transfer: isInternalTransferLike(transaction),
  };
}

function getMeaningfulCategory(transaction) {
  return transaction?._smart_category || transaction?.category || (Number(transaction?.amount || 0) > 0 ? "Income" : "Spending");
}

function isInternalTransferLike(transaction) {
  return Boolean(transaction?._smart_internal_transfer || transaction?.is_internal_transfer);
}

function cleanEventTitle(description) {
  return String(description || "Transaction")
    .replace(/\s+/g, " ")
    .replace(/\b(card purchase|debit card|faster payment|direct debit|standing order|contactless|online payment)\b/gi, "")
    .trim()
    .split(" ")
    .slice(0, 5)
    .join(" ") || "Transaction";
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toTitleCase(value) {
  return String(value || "")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function parseAppDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const isoMatch = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return buildDate(year, month, day);
  }

  const slashMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    let [, first, second, year] = slashMatch;
    const firstNum = Number(first);
    const secondNum = Number(second);
    const yearNum = year.length === 2 ? 2000 + Number(year) : Number(year);

    if (firstNum > 12 && secondNum <= 12) return buildDate(yearNum, secondNum, firstNum);
    if (secondNum > 12 && firstNum <= 12) return buildDate(yearNum, firstNum, secondNum);
    return buildDate(yearNum, secondNum, firstNum);
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function buildDate(year, month, day) {
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateShort(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
