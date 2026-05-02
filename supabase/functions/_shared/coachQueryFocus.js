const DEFAULT_STOP_WORDS = new Set([
  "about",
  "all",
  "and",
  "any",
  "been",
  "data",
  "day",
  "days",
  "did",
  "does",
  "for",
  "from",
  "have",
  "how",
  "in",
  "into",
  "last",
  "latest",
  "me",
  "money",
  "month",
  "much",
  "of",
  "on",
  "over",
  "paid",
  "past",
  "pay",
  "payment",
  "payments",
  "received",
  "sent",
  "send",
  "spend",
  "spending",
  "spent",
  "the",
  "them",
  "this",
  "to",
  "total",
  "transfer",
  "transfers",
  "uploaded",
  "what",
  "when",
  "with",
  "within",
  "you",
  "your",
]);

export function buildCoachQueryFocus(transactions = [], query = "", options = {}) {
  const getDate = options.getDate || ((transaction) => transaction.transaction_date || transaction.date || "");
  const getAmount = options.getAmount || ((transaction) => Number(transaction.amount || 0));
  const getSearchText = options.getSearchText || defaultSearchText;
  const getGroupLabel = options.getGroupLabel || defaultGroupLabel;
  const mapTransaction = options.mapTransaction || defaultMapTransaction;
  const relevantFilter = options.relevantFilter || (() => true);
  const groupLimit = Number(options.groupLimit || 20);
  const exampleLimit = Number(options.exampleLimit || 120);
  const terms = getSearchTerms(query, options.stopWords);
  const directionIntent = getQueryDirectionIntent(query);
  const personalMoneyIntent = hasPersonalMoneyIntent(query) || directionIntent === "incoming" || directionIntent === "outgoing";
  const timeWindow = getQueryTimeWindow(transactions, query, { getDate, anchorDate: options.anchorDate || options.latestTransactionDate });
  const scopedTransactions = timeWindow.matched
    ? transactions.filter((transaction) => isTransactionInTimeWindow(transaction, timeWindow, getDate))
    : transactions;

  if (terms.length === 0) {
    return {
      original_query: query,
      search_terms: terms,
      direction_intent: directionIntent,
      personal_money_intent: personalMoneyIntent,
      time_window: timeWindow,
      direct_match_count: 0,
      relevant_match_count: 0,
      direct_money_in: 0,
      direct_money_out: 0,
      direct_net: 0,
      relevant_money_total: 0,
      relevant_money_label: getRelevantMoneyLabel(directionIntent),
      grouped_matches: [],
      relevant_grouped_matches: [],
      direct_matches: [],
      relevant_matches: [],
      direct_match_note:
        options.emptyNote ||
        `No specific search terms were found in the question. Use the appropriate ${timeWindow.matched ? `${timeWindow.label} ` : "all-history "}summary groups instead.`,
    };
  }

  const matches = scopedTransactions
    .map((transaction, index) => ({
      transaction,
      score: scoreTransactionForTerms(transaction, terms, getSearchText),
      index,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      const byScore = b.score - a.score;
      if (byScore) return byScore;
      const byDate = String(getDate(b.transaction) || "").localeCompare(String(getDate(a.transaction) || ""));
      return byDate || a.index - b.index;
    })
    .map((item) => item.transaction);
  const directionMatches = filterByDirectionIntent(matches, directionIntent, getAmount);
  const relevantMatches = personalMoneyIntent
    ? directionMatches.filter((transaction) => relevantFilter(transaction, { timeWindow, scopedTransactions }))
    : directionMatches;
  const moneyIn = matches
    .filter((transaction) => getAmount(transaction) > 0)
    .reduce((sum, transaction) => sum + getAmount(transaction), 0);
  const moneyOut = matches
    .filter((transaction) => getAmount(transaction) < 0)
    .reduce((sum, transaction) => sum + Math.abs(getAmount(transaction)), 0);
  const relevantMoneyTotal = getRelevantMoneyTotal(relevantMatches, directionIntent, getAmount);

  return {
    original_query: query,
    search_terms: terms,
    direction_intent: directionIntent,
    personal_money_intent: personalMoneyIntent,
    time_window: timeWindow,
    direct_match_count: matches.length,
    relevant_match_count: relevantMatches.length,
    direct_money_in: roundMoney(moneyIn),
    direct_money_out: roundMoney(moneyOut),
    direct_net: roundMoney(moneyIn - moneyOut),
    relevant_money_total: roundMoney(relevantMoneyTotal),
    relevant_money_label: getRelevantMoneyLabel(directionIntent),
    grouped_matches: buildTransactionGroups(matches, getGroupLabel, getAmount, getDate).slice(0, groupLimit),
    relevant_grouped_matches: buildTransactionGroups(relevantMatches, getGroupLabel, getAmount, getDate).slice(0, groupLimit),
    direct_matches: matches.slice(0, exampleLimit).map(mapTransaction),
    relevant_matches: relevantMatches.slice(0, exampleLimit).map(mapTransaction),
    direct_match_note: buildQueryFocusNote({
      matches,
      relevantMatches,
      directionIntent,
      personalMoneyIntent,
      timeWindow,
      noteSuffix: options.noteSuffix,
    }),
  };
}

export function getQueryTimeWindow(transactions = [], query = "", options = {}) {
  const text = normalizeText(query);
  const getDate = options.getDate || ((transaction) => transaction.transaction_date || transaction.date || "");
  const anchor = parseAppDate(options.anchorDate) || getLatestTransactionDate(transactions, getDate);
  const emptyWindow = {
    label: "all uploaded data",
    start: "",
    end: anchor ? toIsoDate(anchor) : "",
    matched: false,
  };

  if (!anchor) return emptyWindow;

  if (/\b(latest|last|past)\s+30\s+days?\b/.test(text) || /\bover\s+the\s+last\s+30\s+days?\b/.test(text)) {
    return {
      label: "latest 30 days of uploaded data",
      start: toIsoDate(addDays(anchor, -30)),
      end: toIsoDate(anchor),
      matched: true,
    };
  }

  if (/\blatest\s+month\b/.test(text)) {
    return {
      label: "latest uploaded month",
      start: toIsoDate(startOfMonth(anchor)),
      end: toIsoDate(anchor),
      matched: true,
    };
  }

  if (/\bthis\s+month\b/.test(text)) {
    return {
      label: "this month in uploaded data",
      start: toIsoDate(startOfMonth(anchor)),
      end: toIsoDate(anchor),
      matched: true,
    };
  }

  if (/\blast\s+month\b/.test(text)) {
    const previousMonth = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
    return {
      label: "last month in uploaded data",
      start: toIsoDate(startOfMonth(previousMonth)),
      end: toIsoDate(endOfMonth(previousMonth)),
      matched: true,
    };
  }

  return emptyWindow;
}

export function getQueryDirectionIntent(query) {
  const text = normalizeText(query);

  if (/\b(sent me|send me|sent to me|send to me|been sent|received|paid me|pays me|pay me|transferred me|transfer me|money in|income from|from friends|from family|family sent|friends sent|given me|gave me)\b/.test(text)) {
    return "incoming";
  }

  if (/\b(i sent|i send|sent to|send to|sent out|send out|i paid|paid to|pay to|money to|transferred to|transfer to|gave|give money|send people|sent people|send to people|spent|spend|spending|bought|buying|purchased|purchase)\b/.test(text)) {
    return "outgoing";
  }

  if (/\b(net|difference|balance between|in and out|both ways|overall)\b/.test(text)) {
    return "net";
  }

  return "unknown";
}

export function hasPersonalMoneyIntent(query) {
  const text = normalizeText(query);
  return /\b(friend|friends|family|mum|mother|dad|father|brother|sister|mate|mates|people|person|personal|loaned|lent|borrowed|gift|gifts|sent me|send me|paid me|pay me|transferred me|transfer me)\b/.test(text);
}

export function getSearchTerms(query, extraStopWords = []) {
  const stopWords = new Set([...DEFAULT_STOP_WORDS, ...extraStopWords]);
  return [...new Set(normalizeText(query).split(" "))]
    .filter((term) => term.length >= 3 && !stopWords.has(term))
    .slice(0, 8);
}

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function filterByDirectionIntent(transactions, directionIntent, getAmount) {
  if (directionIntent === "incoming") return transactions.filter((transaction) => getAmount(transaction) > 0);
  if (directionIntent === "outgoing") return transactions.filter((transaction) => getAmount(transaction) < 0);
  return transactions;
}

function getRelevantMoneyTotal(transactions, directionIntent, getAmount) {
  if (directionIntent === "incoming") {
    return transactions
      .filter((transaction) => getAmount(transaction) > 0)
      .reduce((sum, transaction) => sum + getAmount(transaction), 0);
  }
  if (directionIntent === "outgoing") {
    return transactions
      .filter((transaction) => getAmount(transaction) < 0)
      .reduce((sum, transaction) => sum + Math.abs(getAmount(transaction)), 0);
  }
  if (directionIntent === "net") {
    return transactions.reduce((sum, transaction) => sum + getAmount(transaction), 0);
  }
  return transactions.reduce((sum, transaction) => sum + Math.abs(getAmount(transaction)), 0);
}

function getRelevantMoneyLabel(directionIntent) {
  if (directionIntent === "incoming") return "money_in_only";
  if (directionIntent === "outgoing") return "money_out_only";
  if (directionIntent === "net") return "net_money_in_minus_out";
  return "all_matching_money_absolute";
}

function buildQueryFocusNote({ matches, relevantMatches, directionIntent, personalMoneyIntent, timeWindow, noteSuffix }) {
  const directionText =
    directionIntent === "incoming"
      ? "incoming money only because the question asks about money sent to/received by the user"
      : directionIntent === "outgoing"
        ? "outgoing money only because the question asks about money the user sent, paid out, or spent"
        : directionIntent === "net"
          ? "net money in minus money out because the question asks for an overall/net view"
          : "all matching directions because the question direction is unclear";
  const personalText = personalMoneyIntent
    ? " Rent, bills, subscriptions, business/work payments, pass-through flows and payees with rent/bill-tagged transactions have been excluded from relevant personal-payment matches."
    : "";
  const capText =
    matches.length > relevantMatches.length || matches.length > 120 || relevantMatches.length > 120
      ? ` Showing example transactions, but totals use all direct matches${timeWindow?.matched ? ` inside ${timeWindow.label} (${timeWindow.start} to ${timeWindow.end})` : " across full uploaded history"}.`
      : ` Showing all direct matches${timeWindow?.matched ? ` inside ${timeWindow.label} (${timeWindow.start} to ${timeWindow.end})` : " across full uploaded history"}.`;

  return `${directionText}.${personalText}${capText}${noteSuffix ? ` ${noteSuffix}` : ""}`;
}

function scoreTransactionForTerms(transaction, terms, getSearchText) {
  const haystack = normalizeText(getSearchText(transaction));
  if (!haystack) return 0;

  return terms.reduce((score, term) => {
    const exactWord = new RegExp(`(^|\\s)${escapeRegExp(term)}(\\s|$)`).test(haystack);
    if (exactWord) return score + 4;
    if (haystack.includes(term)) return score + 2;
    return score;
  }, 0);
}

function isTransactionInTimeWindow(transaction, timeWindow, getDate) {
  if (!timeWindow?.matched) return true;
  const date = parseAppDate(getDate(transaction));
  if (!date) return false;
  const start = parseAppDate(timeWindow.start);
  const end = parseAppDate(timeWindow.end);
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function getLatestTransactionDate(transactions, getDate) {
  return transactions
    .map((transaction) => parseAppDate(getDate(transaction)))
    .filter(Boolean)
    .sort((a, b) => b - a)[0] || null;
}

function buildTransactionGroups(transactions, getLabel, getAmount, getDate) {
  const groups = new Map();
  transactions.forEach((transaction) => {
    const label = String(getLabel(transaction) || "Transaction").trim() || "Transaction";
    const key = normalizeText(label) || "transaction";
    const amount = getAmount(transaction);

    if (!groups.has(key)) {
      groups.set(key, {
        label,
        count: 0,
        total: 0,
        money_in: 0,
        money_out: 0,
        average: 0,
        first_date: getDate(transaction) || "",
        last_date: getDate(transaction) || "",
        example: transaction.description || transaction.name || "",
      });
    }

    const group = groups.get(key);
    group.count += 1;
    group.total += Math.abs(amount);
    if (amount > 0) group.money_in += amount;
    if (amount < 0) group.money_out += Math.abs(amount);
    group.average = group.total / group.count;

    const date = getDate(transaction);
    if (date) {
      if (!group.first_date || date < group.first_date) group.first_date = date;
      if (!group.last_date || date > group.last_date) group.last_date = date;
    }
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      total: roundMoney(group.total),
      money_in: roundMoney(group.money_in),
      money_out: roundMoney(group.money_out),
      average: roundMoney(group.average),
    }))
    .sort((a, b) => b.total - a.total);
}

function defaultSearchText(transaction) {
  return [
    transaction.description,
    transaction.name,
    transaction.merchant,
    transaction.category,
    transaction.account,
    transaction.account_name,
    transaction.accounts?.name,
  ].join(" ");
}

function defaultGroupLabel(transaction) {
  return transaction.name || transaction.description || transaction.merchant || "Transaction";
}

function defaultMapTransaction(transaction) {
  const amount = Number(transaction.amount || 0);
  return {
    date: transaction.transaction_date || transaction.date || "",
    description: transaction.description || transaction.name || "",
    merchant: transaction.merchant || transaction.name || transaction.description || "Transaction",
    amount,
    amount_abs: Math.abs(amount),
    direction: amount > 0 ? "in" : amount < 0 ? "out" : "zero",
    category: transaction.category || "",
    account: transaction.account || transaction.account_name || transaction.accounts?.name || "",
  };
}

function parseAppDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return buildDate(year, month, day);
  }

  const parsed = new Date(raw);
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

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + Number(days || 0));
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
