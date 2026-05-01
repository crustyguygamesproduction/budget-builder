import { getFriendlyTransactionName, getRealWorldMerchant } from "./merchantIntelligence";
import { formatCurrency, isInternalTransferLike, normalizeText, parseAppDate } from "./finance";

const STRONG_BILL_CATEGORIES = ["rent", "mortgage", "council tax", "energy", "water", "broadband", "phone", "insurance", "debt / credit", "childcare", "subscription", "major bill"];

export function buildStrongBillFallbackEvents(transactions, existingEvents = []) {
  const latestMonth = getLatestTransactionMonth(transactions);
  if (!latestMonth) return [];
  const groups = new Map();

  (transactions || []).forEach((transaction) => {
    if (!isStrongBillTransaction(transaction)) return;
    if (!String(transaction.transaction_date || "").startsWith(latestMonth)) return;

    const merchant = getRealWorldMerchant(transaction);
    const category = normalizeText(transaction._smart_category || transaction.category || "");
    const text = normalizeText(`${transaction.description || ""} ${category}`);
    const amount = Math.abs(Number(transaction.amount || 0));
    const date = parseAppDate(transaction.transaction_date);
    if (!date || !amount) return;

    const isRent = /rent|mortgage|landlord|letting/.test(text);
    const key = isRent
      ? "fallback:rent"
      : `${merchant.known ? `merchant:${merchant.key}` : `text:${transaction._real_merchant_key || merchant.key || normalizeText(transaction.description || "")}`}:fallback:${getAmountBand(amount)}`;
    const title = isRent ? "Rent" : `${merchant.known ? merchant.name : transaction._real_merchant_name || getFriendlyTransactionName(transaction)} bill around ${formatCurrency(amount)}`;

    if (!groups.has(key)) {
      groups.set(key, { key, title, kind: category === "subscription" || merchant.subscription ? "subscription" : "bill", amounts: [], dates: [], transactions: [], isRent });
    }
    const group = groups.get(key);
    group.amounts.push(amount);
    group.dates.push(date);
    group.transactions.push(transaction);
  });

  return [...groups.values()].map((group) => toFallbackEvent(group, existingEvents)).filter(Boolean);
}

export function mergeRecurringEvents(events) {
  return (events || []).reduce((merged, event) => {
    if (!event) return merged;
    const duplicateIndex = merged.findIndex((existing) => {
      const sameKey = existing.key === event.key;
      const sameName = normalizeText(existing.title || "") === normalizeText(event.title || "");
      const closeAmount = Math.abs(Math.abs(Number(existing.amount || 0)) - Math.abs(Number(event.amount || 0))) <= 3;
      return (sameKey || sameName) && closeAmount;
    });
    if (duplicateIndex < 0) return [...merged, event];
    const better = scoreEvent(event) > scoreEvent(merged[duplicateIndex]) ? event : merged[duplicateIndex];
    return merged.map((item, index) => (index === duplicateIndex ? better : item));
  }, []);
}

function isStrongBillTransaction(transaction) {
  if (!transaction || isInternalTransferLike(transaction)) return false;
  if (transaction._smart_internal_transfer || transaction.is_internal_transfer) return false;
  if (Number(transaction.amount || 0) >= 0) return false;

  const merchant = getRealWorldMerchant(transaction);
  if (merchant.type === "work_money" || merchant.type === "investment") return false;

  const category = normalizeText(transaction._smart_category || transaction.category || "");
  const text = normalizeText(`${transaction.description || ""} ${transaction.merchant || ""} ${category}`);
  const strongCategory = STRONG_BILL_CATEGORIES.some((item) => category.includes(item));
  const userOrSmartBill = Boolean(transaction._smart_is_bill || transaction.is_bill || transaction._smart_is_subscription || transaction.is_subscription);
  const knownBillMerchant = Boolean(merchant.bill || merchant.subscription);
  const rentByText = /rent|landlord|letting|mortgage/.test(text);
  return strongCategory || userOrSmartBill || knownBillMerchant || rentByText;
}

function toFallbackEvent(group, existingEvents) {
  const amount = group.isRent ? group.amounts.reduce((sum, value) => sum + Number(value || 0), 0) : getLikelyAmount(group.dates, group.amounts);
  if (!amount) return null;
  const event = {
    key: group.key,
    title: group.title,
    amount: -Math.abs(amount),
    day: getLikelyDay(group.dates),
    month: null,
    kind: group.kind || "bill",
    kindLabel: group.kind === "subscription" ? "Subscription" : "Bill",
    confidenceLabel: group.isRent || group.transactions.length >= 2 ? "medium" : "estimated",
    estimateNote: group.isRent ? "Rent was added from bill-like payments in your latest statement, even if it was split into several payments." : "Added from a strong bill-like payment in your latest statement. Confirm it in Checks if this looks wrong.",
    sourceCount: group.transactions.length,
    sourceMonths: 1,
  };
  return hasMatchingEvent(event, existingEvents) ? null : event;
}

function hasMatchingEvent(event, existingEvents) {
  return (existingEvents || []).some((existing) => {
    const existingTitle = normalizeText(existing.title || "");
    const eventTitle = normalizeText(event.title || "");
    const sameName = existingTitle === eventTitle || existingTitle.includes(eventTitle) || eventTitle.includes(existingTitle);
    const closeAmount = Math.abs(Math.abs(Number(existing.amount || 0)) - Math.abs(Number(event.amount || 0))) <= 3;
    return sameName && closeAmount;
  });
}

function getLatestTransactionMonth(transactions) {
  const dates = (transactions || []).map((transaction) => parseAppDate(transaction.transaction_date)).filter(Boolean).sort((a, b) => b - a);
  if (!dates.length) return "";
  return `${dates[0].getFullYear()}-${String(dates[0].getMonth() + 1).padStart(2, "0")}`;
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
