import { getFriendlyTransactionName, getRealWorldMerchant } from "./merchantIntelligence";
import { formatCurrency, isInternalTransferLike, normalizeText, parseAppDate } from "./finance";

const FIXED_BILL_CATEGORIES = ["rent", "mortgage", "council tax", "energy", "water", "broadband", "phone", "insurance", "debt / credit", "childcare"];
const EVERYDAY_SPEND_WORDS = /\b(chickie|chicken|takeaway|restaurant|mcdonald|kfc|burger king|subway|greggs|deliveroo|uber eats|just eat|cafe|coffee|bar|pub|tesco|aldi|lidl|asda|sainsbury|morrisons|one stop|premier|shop|store|vinted|ebay|amazon marketplace|fuel|petrol|parking|cash withdrawal|atm|gaming|lvl up|xsolla)\b/;
const FIXED_BILL_WORDS = /\b(rent|mortgage|landlord|letting|council tax|energy|electric|electricity|gas|water|broadband|internet|wifi|phone bill|mobile bill|sim only|airtime|contract|insurance|tv licence|loan repayment|credit card|finance agreement|childcare|nursery|direct debit|standing order)\b/;
const SUBSCRIPTION_WORDS = /\b(subscription|membership|premium|netflix|spotify|apple|itunes|icloud|google|youtube premium|openai|chatgpt|microsoft|xbox|playstation|disney|prime video|amazon prime|audible|strava|duolingo|notion|dropbox|github)\b/;

export function buildStrongBillFallbackEvents(transactions, existingEvents = []) {
  const groups = new Map();
  const rentProfile = getRentProfile(transactions);
  const billProfiles = getFixedBillProfiles(transactions);

  (transactions || []).forEach((transaction) => {
    if (!isFixedCommitmentTransaction(transaction)) return;

    const merchant = getRealWorldMerchant(transaction);
    const amount = Math.abs(Number(transaction.amount || 0));
    const date = parseAppDate(transaction.transaction_date);
    if (!date || !amount) return;

    const isRent = isRentTransaction(transaction);
    const baseKey = getBillBaseKey(transaction, merchant, isRent);
    const key = isRent ? "fallback:rent" : `${baseKey}:fallback:${getStableAmountBand(amount, billProfiles.get(baseKey))}`;
    const baseTitle = isRent ? "Rent" : merchant.known ? merchant.name : transaction._real_merchant_name || getFriendlyTransactionName(transaction);

    if (!groups.has(key)) {
      groups.set(key, { key, baseKey, baseTitle, title: baseTitle, kind: "bill", amounts: [], dates: [], transactions: [], isRent });
    }
    const group = groups.get(key);
    group.amounts.push(amount);
    group.dates.push(date);
    group.transactions.push(transaction);
  });

  return [...groups.values()].map((group) => toFallbackEvent(group, existingEvents, rentProfile, billProfiles)).filter(Boolean);
}

export function mergeRecurringEvents(events) {
  return (events || []).filter(isAllowedFutureBillEvent).reduce((merged, event) => {
    const duplicateIndex = merged.findIndex((existing) => isDuplicateBillEvent(existing, event));
    if (duplicateIndex < 0) return [...merged, cleanEventTitle(event)];
    const better = chooseBetterDuplicate(merged[duplicateIndex], event);
    return merged.map((item, index) => (index === duplicateIndex ? cleanEventTitle(better) : item));
  }, []);
}

function getBillBaseKey(transaction, merchant, isRent) {
  if (isRent) return "rent";
  return merchant.known ? `merchant:${merchant.key}` : `text:${transaction._real_merchant_key || merchant.key || normalizeText(transaction.description || "")}`;
}

function getStableAmountBand(amount, profile) {
  const usual = Number(profile?.usualAmount || 0);
  if (usual && amountIsOutlier(amount, usual)) return getAmountBand(usual);
  return getAmountBand(amount);
}

function getFixedBillProfiles(transactions) {
  const profiles = new Map();
  (transactions || []).forEach((transaction) => {
    if (!isFixedCommitmentTransaction(transaction) || isRentTransaction(transaction)) return;
    const merchant = getRealWorldMerchant(transaction);
    const amount = Math.abs(Number(transaction.amount || 0));
    const date = parseAppDate(transaction.transaction_date);
    if (!date || !amount) return;
    const baseKey = getBillBaseKey(transaction, merchant, false);
    if (!profiles.has(baseKey)) profiles.set(baseKey, { amounts: [], dates: [] });
    profiles.get(baseKey).amounts.push(amount);
    profiles.get(baseKey).dates.push(date);
  });

  profiles.forEach((profile) => {
    profile.usualAmount = getUsualAmount(profile.amounts);
    profile.usualDay = getLikelyDay(profile.dates);
    profile.monthCount = new Set(profile.dates.map((date) => `${date.getFullYear()}-${date.getMonth()}`)).size;
  });

  return profiles;
}

function cleanEventTitle(event) {
  const title = String(event?.title || "").replace(/\s+/g, " ").trim();
  const cleaned = title.replace(/^(Apple iTunes)\s+\1\b/i, "$1").replace(/^(Netflix)\s+\1\b/i, "$1").replace(/^(OpenAI)\s+\1\b/i, "$1").replace(/^(Google)\s+\1\b/i, "$1");
  return { ...event, title: cleaned };
}

function isDuplicateBillEvent(a, b) {
  const aText = normalizeText(a?.title || "");
  const bText = normalizeText(b?.title || "");
  const aBase = getBillBaseName(aText);
  const bBase = getBillBaseName(bText);
  const sameKey = a?.key === b?.key;
  const sameBase = aBase && bBase && aBase === bBase;
  const closeAmount = Math.abs(Math.abs(Number(a?.amount || 0)) - Math.abs(Number(b?.amount || 0))) <= 3;
  const closeDay = Math.abs(Number(a?.day || 0) - Number(b?.day || 0)) <= 4;
  const oneIsFallback = /bill around/.test(aText) || /bill around/.test(bText) || String(a?.key || "").includes(":fallback:") || String(b?.key || "").includes(":fallback:");
  const subscriptionSameProvider = (a?.kind === "subscription" || b?.kind === "subscription") && sameBase;
  return Boolean((sameKey && closeAmount) || (sameBase && closeAmount && closeDay) || (oneIsFallback && subscriptionSameProvider));
}

function chooseBetterDuplicate(a, b) {
  const aText = normalizeText(a?.title || "");
  const bText = normalizeText(b?.title || "");
  const aFallback = /bill around/.test(aText) || String(a?.key || "").includes(":fallback:");
  const bFallback = /bill around/.test(bText) || String(b?.key || "").includes(":fallback:");
  if (aFallback !== bFallback) return aFallback ? b : a;
  const aScore = scoreEvent(a);
  const bScore = scoreEvent(b);
  return bScore > aScore ? b : a;
}

function getBillBaseName(text) {
  return normalizeText(text)
    .replace(/\bbill around\b/g, " ")
    .replace(/\baround\b/g, " ")
    .replace(/£?\d+(\.\d{1,2})?/g, " ")
    .replace(/\bbill\b/g, " ")
    .replace(/\bsubscription\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAllowedFutureBillEvent(event) {
  if (!event) return false;
  const text = normalizeText(`${event.title || ""} ${event.kind || ""} ${event.kindLabel || ""}`);
  if (EVERYDAY_SPEND_WORDS.test(text)) return false;
  if (/work|pass.?through|investment|trading|proovia|mynextbike/.test(text)) return false;
  if (event.kind === "subscription") return true;
  if (/rent|mortgage|council tax|energy|water|broadband|phone|mobile|insurance|debt|credit|loan|finance|childcare|bill around/.test(text)) return true;
  return false;
}

function isFixedCommitmentTransaction(transaction) {
  if (!transaction || isInternalTransferLike(transaction)) return false;
  if (transaction._smart_internal_transfer || transaction.is_internal_transfer) return false;
  if (Number(transaction.amount || 0) >= 0) return false;

  const merchant = getRealWorldMerchant(transaction);
  if (merchant.type === "work_money" || merchant.type === "investment") return false;

  const category = normalizeText(transaction._smart_category || transaction.category || "");
  const text = normalizeText(`${transaction.description || ""} ${transaction.merchant || ""} ${category}`);
  if (EVERYDAY_SPEND_WORDS.test(text)) return false;
  if (merchant.subscription || category === "subscription" || SUBSCRIPTION_WORDS.test(text)) return false;

  const fixedCategory = FIXED_BILL_CATEGORIES.some((item) => category.includes(item));
  const knownFixedMerchant = Boolean(merchant.bill && !merchant.subscription);
  const explicitBill = Boolean(transaction._smart_is_bill || transaction.is_bill) && !transaction._smart_is_subscription && !transaction.is_subscription;
  const fixedByText = FIXED_BILL_WORDS.test(text);

  return fixedCategory || knownFixedMerchant || explicitBill || fixedByText;
}

function toFallbackEvent(group, existingEvents, rentProfile, billProfiles) {
  const profile = billProfiles.get(group.baseKey);
  const amount = group.isRent ? getRentAmountForCalendar(group, rentProfile) : getBillAmountForCalendar(group, profile);
  if (!amount) return null;
  const title = group.isRent ? "Rent" : `${group.baseTitle} bill around ${formatCurrency(amount)}`;
  const event = {
    key: group.key,
    title,
    amount: -Math.abs(amount),
    day: group.isRent ? rentProfile.day || getLikelyDay(group.dates) : profile?.usualDay || getLikelyDay(group.dates),
    month: null,
    kind: group.kind || "bill",
    kindLabel: "Bill",
    confidenceLabel: group.isRent || group.transactions.length >= 2 || Number(profile?.monthCount || 0) >= 2 ? "medium" : "estimated",
    estimateNote: group.isRent ? "Rent is estimated from the usual monthly total, so early or split payments do not become the rent amount." : "Estimated from your usual bill amount, so one-off discounts or odd charges do not replace the normal bill.",
    sourceCount: group.transactions.length,
    sourceMonths: group.isRent ? rentProfile.monthCount || 1 : profile?.monthCount || 1,
  };
  return hasMatchingEvent(event, existingEvents) ? null : event;
}

function getBillAmountForCalendar(group, profile) {
  const currentAmount = getLikelyAmount(group.dates, group.amounts);
  const usual = Number(profile?.usualAmount || 0);
  if (usual && amountIsOutlier(currentAmount, usual)) return usual;
  return usual || currentAmount;
}

function amountIsOutlier(amount, usual) {
  if (!amount || !usual) return false;
  if (usual >= 10 && amount < usual * 0.55) return true;
  if (usual >= 10 && amount > usual * 1.8) return true;
  return false;
}

function getRentAmountForCalendar(group, rentProfile) {
  const currentMonthTotal = group.amounts.reduce((sum, value) => sum + Number(value || 0), 0);
  if (rentProfile.usualMonthlyTotal && rentProfile.usualMonthlyTotal > currentMonthTotal) return rentProfile.usualMonthlyTotal;
  return currentMonthTotal || rentProfile.usualMonthlyTotal || 0;
}

function getRentProfile(transactions) {
  const monthTotals = new Map();
  const rentDates = [];
  (transactions || []).forEach((transaction) => {
    if (!isRentTransaction(transaction)) return;
    const date = parseAppDate(transaction.transaction_date);
    const amount = Math.abs(Number(transaction.amount || 0));
    if (!date || !amount) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    monthTotals.set(key, (monthTotals.get(key) || 0) + amount);
    rentDates.push(date);
  });
  const totals = [...monthTotals.values()].filter((value) => value > 0).sort((a, b) => a - b);
  return { usualMonthlyTotal: getUsualRentTotal(totals), monthCount: totals.length, day: getLikelyDay(rentDates) };
}

function getUsualRentTotal(totals) {
  if (!totals.length) return 0;
  const roundedCounts = totals.reduce((map, value) => {
    const rounded = Math.round(value / 25) * 25;
    map.set(rounded, (map.get(rounded) || 0) + 1);
    return map;
  }, new Map());
  const common = [...roundedCounts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  if (common && common[1] >= 2) return common[0];
  return totals[Math.floor(totals.length / 2)] || totals[0];
}

function getUsualAmount(amounts) {
  const safe = amounts.map(Number).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!safe.length) return 0;
  const clusters = [];
  safe.forEach((amount) => {
    const cluster = clusters.find((item) => Math.abs(item.average - amount) <= Math.max(2, item.average * 0.18));
    if (cluster) {
      cluster.values.push(amount);
      cluster.average = average(cluster.values);
    } else {
      clusters.push({ values: [amount], average: amount });
    }
  });
  const best = clusters.sort((a, b) => b.values.length - a.values.length || b.average - a.average)[0];
  return Math.round((best?.average || safe[Math.floor(safe.length / 2)] || safe[0]) * 100) / 100;
}

function isRentTransaction(transaction) {
  if (!transaction || isInternalTransferLike(transaction)) return false;
  if (Number(transaction.amount || 0) >= 0) return false;
  const text = normalizeText(`${transaction.description || ""} ${transaction.merchant || ""} ${transaction.category || ""} ${transaction._smart_category || ""}`);
  return /rent|mortgage|landlord|letting/.test(text);
}

function hasMatchingEvent(event, existingEvents) {
  return (existingEvents || []).some((existing) => isDuplicateBillEvent(existing, event));
}

function getAmountBand(amount) {
  const value = Math.abs(Number(amount || 0));
  if (value < 25) return `under25:${Math.round(value / 2) * 2}`;
  if (value < 80) return `mid:${Math.round(value / 5) * 5}`;
  return `large:${Math.round(value / 10) * 10}`;
}

function getLikelyAmount(dates, amounts) {
  const pairs = dates.map((date, index) => ({ date, amount: Number(amounts[index] || 0) })).sort((a, b) => b.date - a.date);
  return Math.round((pairs[0]?.amount || average(amounts)) * 100) / 100;
}

function getLikelyDay(dates) {
  const days = dates.map((date) => date.getDate()).filter(Boolean).sort((a, b) => a - b);
  if (!days.length) return 1;
  const counts = days.reduce((map, day) => { map.set(day, (map.get(day) || 0) + 1); return map; }, new Map());
  const mostCommon = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return mostCommon?.[1] >= 2 ? mostCommon[0] : days[0];
}

function scoreEvent(event) {
  return (event.confidenceLabel === "high" ? 3 : event.confidenceLabel === "medium" ? 2 : 1) + Number(event.sourceMonths || 0) + Number(event.sourceCount || 0) / 10;
}

function average(values) {
  const safe = values.map(Number).filter((value) => Number.isFinite(value));
  if (!safe.length) return 0;
  return safe.reduce((sum, value) => sum + value, 0) / safe.length;
}
