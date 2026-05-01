import {
  formatCurrency,
  isInternalTransferLike,
  normalizeText,
  parseAppDate,
} from "./finance";

const BILL_PROVIDERS = [
  { key: "ee", title: "EE", regex: /\bee\b|\bee limited\b|\bee ltd\b/ },
  { key: "o2", title: "O2", regex: /\bo2\b|\btelefonica\b/ },
  { key: "vodafone", title: "Vodafone", regex: /\bvodafone\b|\bvoxi\b/ },
  { key: "three", title: "Three", regex: /\bthree\b|\b3 mobile\b|\bh3g\b/ },
  { key: "giffgaff", title: "Giffgaff", regex: /\bgiffgaff\b/ },
  { key: "smarty", title: "Smarty", regex: /\bsmarty\b/ },
  { key: "sky mobile", title: "Sky Mobile", regex: /\bsky mobile\b/ },
  { key: "bt", title: "BT", regex: /\bbt\b|\bbt group\b/ },
  { key: "virgin media", title: "Virgin Media", regex: /\bvirgin media\b/ },
  { key: "talktalk", title: "TalkTalk", regex: /\btalktalk\b/ },
  { key: "plusnet", title: "Plusnet", regex: /\bplusnet\b/ },
  { key: "eon next", title: "E.ON Next", regex: /\be\s?on\s?next\b|\beon\b/ },
  { key: "octopus energy", title: "Octopus Energy", regex: /\boctopus\b/ },
  { key: "british gas", title: "British Gas", regex: /\bbritish gas\b/ },
  { key: "edf", title: "EDF", regex: /\bedf\b/ },
  { key: "ovo", title: "OVO", regex: /\bovo\b/ },
  { key: "thames water", title: "Thames Water", regex: /\bthames water\b/ },
  { key: "southern water", title: "Southern Water", regex: /\bsouthern water\b/ },
  { key: "council tax", title: "Council Tax", regex: /\bcouncil tax\b|\bborough council\b|\bcity council\b|\bdistrict council\b/ },
  { key: "tv licence", title: "TV Licence", regex: /\btv licen[cs]e\b/ },
  { key: "netflix", title: "Netflix", regex: /\bnetflix\b/ },
  { key: "spotify", title: "Spotify", regex: /\bspotify\b/ },
  { key: "amazon prime", title: "Amazon Prime", regex: /\bamazon prime\b|\bprime video\b/ },
  { key: "apple", title: "Apple", regex: /\bapple\.com\b|\bapple services\b|\bicloud\b/ },
  { key: "google", title: "Google", regex: /\bgoogle\b|\byoutube premium\b/ },
  { key: "openai", title: "OpenAI", regex: /\bopenai\b|\bchatgpt\b/ },
];

export function getSmartRecurringCalendarEvents(transactions) {
  const groups = new Map();

  (transactions || []).forEach((transaction) => {
    const amount = Math.abs(Number(transaction?.amount || 0));
    if (!transaction?.transaction_date) return;
    if (isInternalTransferLike(transaction)) return;
    if (Number(transaction.amount || 0) >= 0) return;
    if (amount < 3) return;

    const date = parseAppDate(transaction.transaction_date);
    if (!date) return;

    const groupInfo = getRealWorldBillKey(transaction);
    if (!groupInfo || isClearlyEverydayMerchant(transaction, groupInfo.text)) return;

    if (!groups.has(groupInfo.key)) {
      groups.set(groupInfo.key, {
        key: groupInfo.key,
        title: groupInfo.title,
        providerMatched: groupInfo.providerMatched,
        transactions: [],
        dates: [],
        amounts: [],
        billSignals: 0,
        mechanismSignals: 0,
      });
    }

    const group = groups.get(groupInfo.key);
    group.transactions.push(transaction);
    group.dates.push(date);
    group.amounts.push(amount);
    if (isBillLike(transaction, groupInfo.text)) group.billSignals += 1;
    if (hasRecurringWords(groupInfo.text)) group.mechanismSignals += 1;
  });

  return [...groups.values()]
    .map(buildSmartEvent)
    .filter(Boolean)
    .reduce(dedupeEvents, [])
    .sort((a, b) => a.day - b.day || Math.abs(b.amount) - Math.abs(a.amount));
}

function getRealWorldBillKey(transaction) {
  const rawText = normalizeText([transaction.description, transaction.merchant, transaction.category, transaction._smart_category].join(" "));
  if (!rawText) return null;

  const provider = BILL_PROVIDERS.find((item) => item.regex.test(rawText));
  if (provider) {
    return {
      key: `provider:${provider.key}`,
      title: provider.title,
      providerMatched: true,
      text: rawText,
    };
  }

  const cleaned = rawText
    .replace(/\b(card purchase|debit card|direct debit|dd|standing order|faster payment|contactless|online payment|payment to|payment from|ref|reference|monthly|subscription|visa|mastercard|pos|fpi|fp)\b/g, " ")
    .replace(/\b[a-z]{2,}\d{3,}\b/g, " ")
    .replace(/\b\d+[a-z]+\d*\b/g, " ")
    .replace(/\b\d{2,}\b/g, " ")
    .replace(/[^a-z0-9&.'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;
  const likelyBill = isBillLike(transaction, rawText) || hasRecurringWords(rawText);
  if (!likelyBill && amountLooksEveryday(transaction)) return null;

  const key = cleaned.split(" ").slice(0, 4).join(" ");
  if (key.length < 3) return null;

  return {
    key: `text:${key}`,
    title: titleCase(key),
    providerMatched: false,
    text: rawText,
  };
}

function buildSmartEvent(group) {
  const monthKeys = new Set(group.dates.map((date) => `${date.getFullYear()}-${date.getMonth()}`));
  const count = group.dates.length;
  const monthCount = monthKeys.size;
  const amountStats = getAmountStats(group.amounts);
  const dayStats = getSmartDayStats(group.dates);
  const repeated = monthCount >= 2 && count >= 2;
  const signalled = group.providerMatched || group.billSignals > 0 || group.mechanismSignals > 0;
  const stableAmount = amountStats.spread <= 5 || amountStats.spreadRatio <= 0.25;
  const confidenceScore =
    (group.providerMatched ? 3 : 0) +
    (repeated ? 2 : 0) +
    (monthCount >= 3 ? 2 : 0) +
    (stableAmount ? 1 : 0) +
    (dayStats.confidence === "stable" ? 1 : 0) +
    (group.billSignals > 0 ? 2 : 0) +
    (group.mechanismSignals > 0 ? 1 : 0);

  if (!signalled && confidenceScore < 4) return null;
  if (amountStats.average < 3) return null;
  if (!repeated && !group.providerMatched && group.billSignals === 0) return null;

  const amount = stableAmount || group.providerMatched ? getLikelyAmount(group.dates, group.amounts) : amountStats.average;
  const confidenceLabel = confidenceScore >= 8 && monthCount >= 3 ? "high" : confidenceScore >= 5 ? "medium" : "estimated";
  const kind = inferKind(group);

  return {
    key: group.key,
    title: group.title,
    amount: -Math.abs(amount),
    day: dayStats.estimatedDay,
    month: null,
    kind,
    kindLabel: kind === "bill" ? "Bill" : "Subscription",
    confidenceLabel,
    estimateNote: buildEstimateNote(group, dayStats, amountStats, confidenceLabel),
    sourceCount: count,
    sourceMonths: monthCount,
  };
}

function dedupeEvents(events, event) {
  const duplicateIndex = events.findIndex((existing) => {
    const sameProvider = existing.key === event.key;
    const sameName = normalizeText(existing.title) === normalizeText(event.title);
    const closeAmount = Math.abs(Math.abs(existing.amount) - Math.abs(event.amount)) <= 2;
    const closeDay = Math.abs(existing.day - event.day) <= 4;
    return (sameProvider || sameName) && closeAmount && closeDay;
  });

  if (duplicateIndex < 0) return [...events, event];

  const existing = events[duplicateIndex];
  const better = chooseBetterEvent(existing, event);
  return events.map((item, index) => (index === duplicateIndex ? better : item));
}

function chooseBetterEvent(a, b) {
  const score = (event) =>
    (event.confidenceLabel === "high" ? 3 : event.confidenceLabel === "medium" ? 2 : 1) +
    Number(event.sourceMonths || 0) +
    Number(event.sourceCount || 0) / 10;
  return score(b) > score(a) ? b : a;
}

function getSmartDayStats(dates) {
  const days = dates.map((date) => date.getDate()).sort((a, b) => a - b);
  const counts = days.reduce((map, day) => {
    map.set(day, (map.get(day) || 0) + 1);
    return map;
  }, new Map());
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const mostCommon = common[0];
  const latest = dates.slice().sort((a, b) => b - a)[0];
  const spread = days.length ? Math.max(...days) - Math.min(...days) : 0;

  if (mostCommon && mostCommon[1] >= 2) {
    return { estimatedDay: mostCommon[0], spread, confidence: spread <= 5 ? "stable" : "usual-day" };
  }

  if (spread <= 5) {
    return { estimatedDay: Math.max(1, Math.round(average(days))), spread, confidence: "stable" };
  }

  return {
    estimatedDay: latest ? latest.getDate() : Math.max(1, Math.round(average(days))),
    spread,
    confidence: "latest-date",
  };
}

function getLikelyAmount(dates, amounts) {
  const pairs = dates.map((date, index) => ({ date, amount: Number(amounts[index] || 0) })).sort((a, b) => b.date - a.date);
  const latest = pairs[0]?.amount || average(amounts);
  const rounded = Math.round(latest * 100) / 100;
  return rounded || average(amounts);
}

function getAmountStats(amounts) {
  const safe = amounts.map(Number).filter((value) => Number.isFinite(value));
  const avg = average(safe);
  const spread = safe.length ? Math.max(...safe) - Math.min(...safe) : 0;
  return { average: avg, spread, spreadRatio: avg ? spread / avg : 0 };
}

function buildEstimateNote(group, dayStats, amountStats, confidence) {
  const parts = [];
  if (group.providerMatched) parts.push(`${group.title} references were grouped together even when the bank reference changed.`);
  if (dayStats.confidence === "latest-date") parts.push("The payment date has moved before, so Money Hub used the latest date it saw.");
  if (amountStats.spread > 2) parts.push(`Amount has varied by about ${formatCurrency(amountStats.spread)}.`);
  if (!parts.length && confidence === "high") return "Based on a stable repeated bill pattern.";
  if (!parts.length) return "Estimated from your uploaded bank history. Check it if it looks wrong.";
  return parts.join(" ");
}

function inferKind(group) {
  const text = normalizeText([group.title, group.key].join(" "));
  if (/netflix|spotify|prime|apple|google|openai|subscription|membership|premium/.test(text)) return "subscription";
  return "bill";
}

function isBillLike(transaction, text) {
  const category = normalizeText(transaction?._smart_category || transaction?.category || "");
  return Boolean(
    transaction?._smart_is_bill ||
      transaction?.is_bill ||
      transaction?._smart_is_subscription ||
      transaction?.is_subscription ||
      /rent|mortgage|major bill|bill|council tax|energy|water|broadband|phone|mobile|insurance|subscription|utilities/.test(category) ||
      /\b(rent|mortgage|landlord|letting|council tax|water|energy|electric|electricity|gas|utility|utilities|broadband|internet|wifi|phone|mobile|sim|contract|insurance|tv licence|licence|loan|credit card|finance|childcare|nursery|school|parking permit)\b/.test(text)
  );
}

function hasRecurringWords(text) {
  return /\b(direct debit|dd|standing order|recurring|subscription|monthly|instalment|installment|plan|contract|membership|premium)\b/.test(text);
}

function isClearlyEverydayMerchant(transaction, text) {
  if (isBillLike(transaction, text) || hasRecurringWords(text)) return false;
  return /\b(tesco|sainsbury|asda|morrisons|lidl|aldi|coop|co op|one stop|premier|greggs|mcdonald|kfc|burger king|subway|uber eats|deliveroo|just eat|restaurant|bar|pub|cafe|coffee|amazon marketplace|ebay|vinted|shop|store|petrol|fuel|parking)\b/.test(text);
}

function amountLooksEveryday(transaction) {
  const amount = Math.abs(Number(transaction?.amount || 0));
  return amount < 20;
}

function titleCase(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function average(values) {
  const safe = values.map(Number).filter((value) => Number.isFinite(value));
  if (!safe.length) return 0;
  return safe.reduce((sum, value) => sum + value, 0) / safe.length;
}
