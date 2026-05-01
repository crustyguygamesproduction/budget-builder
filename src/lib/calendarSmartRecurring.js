import {
  formatCurrency,
  isInternalTransferLike,
  normalizeText,
  parseAppDate,
} from "./finance";
import {
  getRealWorldMerchant,
  getSmartBillCategory,
  looksLikeKnownBill,
} from "./merchantIntelligence";

export function getSmartRecurringCalendarEvents(transactions) {
  const groups = new Map();

  (transactions || []).forEach((transaction) => {
    const amount = Math.abs(Number(transaction?.amount || 0));
    if (!transaction?.transaction_date) return;
    if (shouldNeverForecast(transaction)) return;
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
        providerType: groupInfo.providerType,
        transactions: [],
        dates: [],
        amounts: [],
        fingerprints: new Set(),
        billSignals: 0,
        mechanismSignals: 0,
        ruleSignals: 0,
        categorySignals: 0,
        recurringBillIntent: Boolean(groupInfo.recurringBillIntent),
      });
    }

    const group = groups.get(groupInfo.key);
    const fingerprint = getTransactionFingerprint(transaction, amount);
    if (group.fingerprints.has(fingerprint)) return;

    group.fingerprints.add(fingerprint);
    group.transactions.push(transaction);
    group.dates.push(date);
    group.amounts.push(amount);
    if (isBillLike(transaction, groupInfo.text)) group.billSignals += 1;
    if (hasRecurringWords(groupInfo.text)) group.mechanismSignals += 1;
    if (transaction?._smart_rule_applied) group.ruleSignals += 1;
    if (hasBillCategory(transaction)) group.categorySignals += 1;
  });

  return [...groups.values()]
    .flatMap(splitGroupByBillStreams)
    .map(buildSmartEvent)
    .filter(Boolean)
    .reduce(dedupeEvents, [])
    .sort((a, b) => a.day - b.day || Math.abs(b.amount) - Math.abs(a.amount));
}

function getRealWorldBillKey(transaction) {
  const merchant = getRealWorldMerchant(transaction);
  const rawText = normalizeText([transaction.description, transaction.merchant, transaction.category, transaction._smart_category].join(" "));
  if (!rawText) return null;

  const explicitlyBillLike = isBillLike(transaction, rawText) || hasRecurringWords(rawText);
  const recurringBillIntent = Boolean(merchant.bill || merchant.subscription || explicitlyBillLike);

  if (merchant.known) {
    if (!recurringBillIntent) return null;
    if (isBlockedMerchantType(merchant.type)) return null;
    return {
      key: `merchant:${merchant.key}`,
      title: merchant.name,
      providerMatched: true,
      providerType: merchant.type,
      recurringBillIntent,
      text: rawText,
    };
  }

  const cleaned = merchant.key;
  if (!cleaned) return null;
  if (!explicitlyBillLike) return null;
  if (amountLooksEveryday(transaction) && !hasRecurringWords(rawText)) return null;

  return {
    key: `text:${cleaned}`,
    title: merchant.name,
    providerMatched: false,
    providerType: "",
    recurringBillIntent,
    text: rawText,
  };
}

function splitGroupByBillStreams(group) {
  if (!group.providerMatched || group.transactions.length <= 1) return [group];

  const clusters = [];
  group.transactions.forEach((transaction, index) => {
    const amount = Math.abs(Number(group.amounts[index] || transaction.amount || 0));
    const date = group.dates[index];
    const day = date.getDate();
    const existing = clusters.find((cluster) => {
      const amountMatches = Math.abs(cluster.average - amount) <= getStreamTolerance(cluster.average, amount);
      const timingMatches = Math.abs(cluster.averageDay - day) <= getTimingTolerance(cluster.days);
      const sameMonthConflict = cluster.months.has(getMonthKey(date));
      return amountMatches && (timingMatches || !sameMonthConflict);
    });

    if (existing) {
      existing.transactions.push(transaction);
      existing.dates.push(date);
      existing.amounts.push(amount);
      existing.days.push(day);
      existing.months.add(getMonthKey(date));
      existing.average = average(existing.amounts);
      existing.averageDay = average(existing.days);
      return;
    }

    clusters.push({ transactions: [transaction], dates: [date], amounts: [amount], days: [day], months: new Set([getMonthKey(date)]), average: amount, averageDay: day });
  });

  if (clusters.length <= 1) return [group];

  return clusters.map((cluster) => ({
    ...group,
    key: `${group.key}:stream:${Math.round(cluster.average * 100)}:${Math.round(cluster.averageDay)}`,
    title: group.title,
    transactions: cluster.transactions,
    dates: cluster.dates,
    amounts: cluster.amounts,
    fingerprints: new Set(),
  }));
}

function getStreamTolerance(baseAmount, nextAmount) {
  const amount = Math.max(Math.abs(Number(baseAmount || 0)), Math.abs(Number(nextAmount || 0)));
  return Math.max(2, amount * 0.12);
}

function getTimingTolerance(days) {
  if (!days?.length) return 4;
  const spread = Math.max(...days) - Math.min(...days);
  return spread <= 4 ? 5 : 3;
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function buildSmartEvent(group) {
  const monthKeys = new Set(group.dates.map((date) => `${date.getFullYear()}-${date.getMonth()}`));
  const count = group.dates.length;
  const monthCount = monthKeys.size;
  const amountStats = getAmountStats(group.amounts);
  const dayStats = getSmartDayStats(group.dates);
  const repeated = monthCount >= 2 && count >= 2;
  const stableAmount = amountStats.spread <= 5 || amountStats.spreadRatio <= 0.25;
  const hasStrongBillSignal = group.recurringBillIntent || group.billSignals > 0 || group.mechanismSignals > 0;
  const confidenceScore =
    (group.providerMatched ? 2 : 0) +
    (repeated ? 3 : 0) +
    (monthCount >= 3 ? 2 : 0) +
    (stableAmount ? 2 : 0) +
    (dayStats.confidence === "stable" ? 1 : 0) +
    (group.billSignals > 0 ? 2 : 0) +
    (group.mechanismSignals > 0 ? 2 : 0) +
    (group.ruleSignals > 0 ? 3 : 0) +
    (group.categorySignals > 0 ? 1 : 0);

  if (!hasStrongBillSignal) return null;
  if (amountStats.average < 3) return null;
  if (!repeated) return null;
  if (!stableAmount && group.ruleSignals === 0) return null;
  if (confidenceScore < 7) return null;
  if (!repeated && !group.providerMatched) return null;
  if (!repeated && group.providerMatched && !stableAmount) return null;

  const amount = stableAmount || group.providerMatched ? getLikelyAmount(group.dates, group.amounts) : amountStats.average;
  const confidenceLabel = confidenceScore >= 8 && monthCount >= 3 ? "high" : confidenceScore >= 6 ? "medium" : "estimated";
  const kind = inferKind(group);

  return {
    key: group.key,
    title: getSafeEventTitle(group, amount, kind),
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
  const better = chooseBetterEvent(events[duplicateIndex], event);
  return events.map((item, index) => (index === duplicateIndex ? better : item));
}

function chooseBetterEvent(a, b) {
  const score = (event) => (event.confidenceLabel === "high" ? 3 : event.confidenceLabel === "medium" ? 2 : 1) + Number(event.sourceMonths || 0) + Number(event.sourceCount || 0) / 10;
  return score(b) > score(a) ? b : a;
}

function getSmartDayStats(dates) {
  const days = dates.map((date) => date.getDate()).sort((a, b) => a - b);
  const counts = days.reduce((map, day) => { map.set(day, (map.get(day) || 0) + 1); return map; }, new Map());
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const mostCommon = common[0];
  const latest = dates.slice().sort((a, b) => b - a)[0];
  const spread = days.length ? Math.max(...days) - Math.min(...days) : 0;
  if (mostCommon && mostCommon[1] >= 2) return { estimatedDay: mostCommon[0], spread, confidence: spread <= 5 ? "stable" : "usual-day" };
  if (spread <= 5) return { estimatedDay: Math.max(1, Math.round(average(days))), spread, confidence: "stable" };
  return { estimatedDay: latest ? latest.getDate() : Math.max(1, Math.round(average(days))), spread, confidence: "latest-date" };
}

function getLikelyAmount(dates, amounts) {
  const pairs = dates.map((date, index) => ({ date, amount: Number(amounts[index] || 0) })).sort((a, b) => b.date - a.date);
  const latest = pairs[0]?.amount || average(amounts);
  return Math.round(latest * 100) / 100 || average(amounts);
}

function getAmountStats(amounts) {
  const safe = amounts.map(Number).filter((value) => Number.isFinite(value));
  const avg = average(safe);
  const spread = safe.length ? Math.max(...safe) - Math.min(...safe) : 0;
  return { average: avg, spread, spreadRatio: avg ? spread / avg : 0 };
}

function buildEstimateNote(group, dayStats, amountStats, confidence) {
  const parts = [];
  if (group.providerMatched) parts.push("Based on repeated payments to the same provider.");
  if (dayStats.confidence === "latest-date") parts.push("The payment date has moved before, so Money Hub used the latest date it saw.");
  if (amountStats.spread > 2) parts.push(`Amount has varied by about ${formatCurrency(amountStats.spread)}.`);
  if (!parts.length && confidence === "high") return "Based on a stable repeated bill pattern.";
  if (!parts.length) return "Estimated from your uploaded bank history. Check it if it looks wrong.";
  return parts.join(" ");
}

function inferKind(group) {
  const text = normalizeText([group.title, group.key, group.providerType].join(" "));
  if (/netflix|spotify|prime|apple|google|openai|subscription|membership|premium/.test(text)) return "subscription";
  return "bill";
}

function getSafeEventTitle(group, amount, kind) {
  const title = String(group.title || "Bill").trim();
  if (!group.providerMatched) return title;
  const suffix = kind === "subscription" ? "around" : "bill around";
  return `${title} ${suffix} ${formatCurrency(amount)}`;
}

function shouldNeverForecast(transaction) {
  if (isInternalTransferLike(transaction)) return true;
  if (transaction?._smart_internal_transfer || transaction?.is_internal_transfer) return true;

  const merchant = getRealWorldMerchant(transaction);
  if (isBlockedMerchantType(merchant.type)) return true;

  const text = normalizeText([transaction?.description, transaction?.merchant, transaction?.category, transaction?._smart_category].join(" "));
  return /\b(reimbursement|expenses?|expense claim|work money|pass through|pass-through|transfer to|transfer from|own account|between accounts|savings pot|monzo pot|cash withdrawal|atm)\b/.test(text);
}

function isBlockedMerchantType(type) {
  return ["work_money", "investment"].includes(String(type || ""));
}

function getTransactionFingerprint(transaction, amount) {
  return [
    transaction?.transaction_date || "",
    normalizeText(transaction?.description || transaction?.merchant || ""),
    Math.round(Math.abs(Number(amount || 0)) * 100),
  ].join("|");
}

function isBillLike(transaction, text) {
  const category = normalizeText(transaction?._smart_category || transaction?.category || "");
  return Boolean(
    looksLikeKnownBill(transaction) ||
    transaction?._smart_is_bill ||
    transaction?.is_bill ||
    transaction?._smart_is_subscription ||
    transaction?.is_subscription ||
    getSmartBillCategory(transaction) ||
    /rent|mortgage|major bill|bill|council tax|energy|water|broadband|phone|mobile|insurance|subscription|utilities/.test(category) ||
    /\b(rent|mortgage|landlord|letting|council tax|water|energy|electric|electricity|gas|utility|utilities|broadband|internet|wifi|phone|mobile|sim|contract|insurance|tv licence|licence|loan|credit card|finance|childcare|nursery|school fees|parking permit)\b/.test(text)
  );
}

function hasBillCategory(transaction) {
  const category = normalizeText(transaction?._smart_category || transaction?.category || "");
  return /\b(rent|mortgage|major bill|bill|council tax|energy|water|broadband|phone|mobile|insurance|subscription|debt|credit|childcare)\b/.test(category);
}

function hasRecurringWords(text) {
  return /\b(direct debit|dd|standing order|recurring|subscription|monthly|instalment|installment|plan|contract|membership|premium)\b/.test(text);
}

function isClearlyEverydayMerchant(transaction, text) {
  if (isBillLike(transaction, text) || hasRecurringWords(text)) return false;
  return /\b(tesco|sainsbury|asda|morrisons|lidl|aldi|coop|co op|one stop|premier|greggs|mcdonald|kfc|burger king|subway|uber eats|deliveroo|just eat|restaurant|bar|pub|cafe|coffee|amazon marketplace|ebay|vinted|shop|store|petrol|fuel|parking|cash withdrawal|atm)\b/.test(text);
}

function amountLooksEveryday(transaction) {
  return Math.abs(Number(transaction?.amount || 0)) < 20;
}

function average(values) {
  const safe = values.map(Number).filter((value) => Number.isFinite(value));
  if (!safe.length) return 0;
  return safe.reduce((sum, value) => sum + value, 0) / safe.length;
}
