import { enhanceTransactions } from "./dashboardIntelligence";
import { getSmartRecurringCalendarEvents } from "./calendarSmartRecurring";
import { buildStrongBillFallbackEvents, mergeRecurringEvents } from "./billFallbacks";
import { getRealWorldMerchant, getFriendlyTransactionName } from "./merchantIntelligence";
import { buildRecurringMajorPaymentCandidates, getRuleMerchantKey } from "./transactionCategorisation";
import { formatCurrency, normalizeText, parseAppDate } from "./finance";
import { cleanBillName, mergeBillStreams } from "./moneyUnderstandingGuards";

const COMMITMENT_CATEGORIES = new Set(["Rent", "Mortgage", "Major bill", "Energy", "Water", "Broadband", "Phone", "Insurance", "Debt / Credit", "Council Tax", "TV Licence", "Childcare", "Subscription"]);
const EVERYDAY_TEXT = /\b(chickie|chicken|takeaway|restaurant|mcdonald|kfc|burger king|subway|greggs|deliveroo|uber eats|just eat|cafe|coffee|bar|pub|tesco|aldi|lidl|asda|sainsbury|morrisons|one stop|premier|shop|store|vinted|ebay|amazon marketplace|fuel|petrol|parking|cash withdrawal|atm|gaming|lvl up|xsolla|odeon|cinema)\b/;

export function buildMoneyUnderstanding({ transactions = [], transactionRules = [], snapshot = null } = {}) {
  const smartTransactions = enhanceTransactions(transactions, transactionRules).map((transaction) => {
    const merchant = getRealWorldMerchant(transaction);
    const interpreted = getSnapshotTransaction(snapshot, transaction.id);
    return {
      ...transaction,
      _real_merchant_key: merchant.cleanKey || merchant.key,
      _real_merchant_name: interpreted?.real_merchant_name || (merchant.known ? merchant.name : getFriendlyTransactionName(transaction)),
      _real_merchant_type: merchant.type || "",
      _real_merchant_known: Boolean(merchant.known || interpreted?.real_merchant_name),
      _smart_category: interpreted?.category || transaction._smart_category,
      _smart_is_bill: interpreted ? Boolean(interpreted.is_bill) : transaction._smart_is_bill,
      _smart_is_subscription: interpreted ? Boolean(interpreted.is_subscription) : transaction._smart_is_subscription,
      _smart_internal_transfer: interpreted ? Boolean(interpreted.is_internal_transfer) : transaction._smart_internal_transfer,
      _ai_interpreted_confidence: interpreted?.confidence || "",
    };
  });

  const localEvents = mergeRecurringEvents([
    ...getSmartRecurringCalendarEvents(smartTransactions),
    ...buildStrongBillFallbackEvents(smartTransactions, []),
  ]);
  const localBillStreams = mergeBillStreams(eventsToBillStreams(localEvents), buildCommitmentStreams(smartTransactions));

  if (snapshot?.id) {
    const snapshotStreams = normaliseSnapshotBillStreams(snapshot.bill_streams);
    const billStreams = mergeBillStreams(snapshotStreams, localBillStreams);
    const recurringEvents = billStreamsToRecurringEvents(billStreams);
    const checks = normaliseSnapshotChecks(snapshot.checks);
    const upcomingBills = getUpcomingBills(billStreams);
    const upcomingBillsTotal = upcomingBills.reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
    const summary = {
      ...(snapshot.summary || {}),
      billsFound: billStreams.length,
      checksWaiting: checks.length,
      upcomingBills,
      upcomingBillsTotal,
      nextBill: upcomingBills[0] || null,
      includesRent: billStreams.some((stream) => /rent|landlord|letting|mortgage/i.test(`${stream.name} ${stream.kind}`)),
      source: "ai-organised-guarded",
      plainEnglish: billStreams.length ? `${billStreams.length} regular bill${billStreams.length === 1 ? "" : "s"} found. ${formatCurrency(upcomingBillsTotal)} is expected in the next month.` : "No regular bills are solid enough to forecast yet.",
    };

    return {
      transactions: smartTransactions,
      recurringEvents,
      billStreams,
      checks,
      summary,
      aiContext: snapshot.ai_context || buildAiContext({ smartTransactions, billStreams, checks, summary }),
      snapshot,
      source: "ai-organised-guarded",
    };
  }

  const billStreams = localBillStreams;
  const recurringEvents = billStreamsToRecurringEvents(billStreams);
  const checks = buildChecks({
    candidates: buildRecurringMajorPaymentCandidates(smartTransactions, transactionRules),
    billStreams,
  });
  const upcomingBills = getUpcomingBills(billStreams);
  const upcomingBillsTotal = upcomingBills.reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
  const summary = {
    billsFound: billStreams.length,
    checksWaiting: checks.length,
    upcomingBills,
    upcomingBillsTotal,
    nextBill: upcomingBills[0] || null,
    includesRent: billStreams.some((stream) => /rent|landlord|letting|mortgage/i.test(`${stream.name} ${stream.kind}`)),
    source: "local-rules",
    plainEnglish:
      billStreams.length > 0
        ? `${billStreams.length} regular bill${billStreams.length === 1 ? "" : "s"} found. ${formatCurrency(upcomingBillsTotal)} is expected in the next month.`
        : "No regular bills are solid enough to forecast yet.",
  };

  return {
    transactions: smartTransactions,
    recurringEvents,
    billStreams,
    checks,
    summary,
    aiContext: buildAiContext({ smartTransactions, billStreams, checks, summary }),
    snapshot: null,
    source: "local-rules",
  };
}

function getSnapshotTransaction(snapshot, id) {
  if (!snapshot?.transactions || !id) return null;
  return (snapshot.transactions || []).find((item) => String(item.id) === String(id)) || null;
}

function eventsToBillStreams(events = []) {
  return (events || [])
    .filter((event) => Number(event.amount || 0) < 0)
    .map((event) => ({
      key: event.key,
      name: cleanBillName(event.title),
      amount: Math.abs(Number(event.amount || 0)),
      day: event.day,
      kind: event.kind || "bill",
      confidence: event.confidenceLabel || "estimated",
      note: event.estimateNote || "",
      sourceCount: event.sourceCount || 0,
      sourceMonths: event.sourceMonths || 0,
    }));
}

function buildCommitmentStreams(transactions = []) {
  const explicitGroups = new Map();
  const monthlyPersonGroups = new Map();

  (transactions || []).forEach((transaction) => {
    const amount = Math.abs(Number(transaction.amount || 0));
    if (Number(transaction.amount || 0) >= 0 || amount <= 0) return;
    if (transaction._smart_internal_transfer || transaction.is_internal_transfer) return;

    const date = parseAppDate(transaction.transaction_date);
    if (!date) return;

    const category = String(transaction._smart_category || transaction.category || "").trim();
    const text = normalizeText(`${transaction.description || ""} ${category}`);
    const merchant = getRealWorldMerchant(transaction);
    if (["investment", "work_money"].includes(merchant.type)) return;

    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const ruleMerchantKey = getRuleMerchantKey(transaction.description);
    const baseKey = merchant.known ? `known:${merchant.key}` : `text:${ruleMerchantKey || merchant.key || text}`;

    const isCommitment = COMMITMENT_CATEGORIES.has(category) || transaction._smart_is_bill || transaction.is_bill || transaction._smart_is_subscription || transaction.is_subscription || merchant.bill || merchant.subscription;
    const kind = getCommitmentKind(category, merchant, transaction);

    if (isCommitment) {
      const amountBand = kind === "rent" || kind === "energy" ? "monthly" : getAmountBand(amount);
      const key = `${kind}:${baseKey}:${amountBand}`;
      if (!explicitGroups.has(key)) explicitGroups.set(key, makeGroup(key, merchant.known ? merchant.name : cleanDisplayName(ruleMerchantKey || transaction.description), kind));
      addToGroup(explicitGroups.get(key), transaction, amount, date, monthKey);
    }

    if (!merchant.known && amount >= 100 && !EVERYDAY_TEXT.test(text)) {
      const key = `personal:${ruleMerchantKey || merchant.key || text}`;
      if (!monthlyPersonGroups.has(key)) monthlyPersonGroups.set(key, makeGroup(key, cleanDisplayName(ruleMerchantKey || transaction.description), "rent"));
      addToGroup(monthlyPersonGroups.get(key), transaction, amount, date, monthKey);
    }
  });

  const explicitStreams = [...explicitGroups.values()].map(groupToStream).filter(Boolean);
  const personalRentStreams = [...monthlyPersonGroups.values()]
    .filter((group) => group.monthTotals.size >= 2 && median([...group.monthTotals.values()]) >= 450)
    .map((group) => groupToStream({ ...group, kind: "rent", name: "Rent" }))
    .filter(Boolean);

  return mergeBillStreams(explicitStreams, personalRentStreams);
}

function makeGroup(key, name, kind) {
  return { key, name, kind, amounts: [], dates: [], monthTotals: new Map(), transactionCount: 0 };
}

function addToGroup(group, transaction, amount, date, monthKey) {
  group.amounts.push(amount);
  group.dates.push(date);
  group.monthTotals.set(monthKey, (group.monthTotals.get(monthKey) || 0) + amount);
  group.transactionCount += 1;
  if (!group.sample) group.sample = transaction.description;
}

function groupToStream(group) {
  const monthValues = [...group.monthTotals.values()].filter((value) => value > 0);
  const amount = group.kind === "rent" || group.kind === "energy" ? median(monthValues) : usualAmount(group.amounts);
  if (!amount) return null;
  const day = likelyDay(group.dates);
  const name = group.kind === "rent" ? "Rent" : `${group.name}${group.kind === "subscription" ? "" : " bill"}`;
  return {
    key: `commitment:${group.key}`,
    name: cleanBillName(name),
    amount: Math.round(amount * 100) / 100,
    day,
    kind: group.kind === "subscription" ? "subscription" : group.kind,
    confidence: group.monthTotals.size >= 2 || group.transactionCount >= 2 ? "medium" : "estimated",
    note: group.kind === "rent" ? "Estimated from repeated housing-sized payments in your uploaded history." : "Estimated from repeated bill-like payments in your uploaded history.",
    sourceCount: group.transactionCount,
    sourceMonths: group.monthTotals.size,
  };
}

function getCommitmentKind(category, merchant, transaction) {
  const c = normalizeText(category);
  if (/rent/.test(c)) return "rent";
  if (/mortgage/.test(c)) return "mortgage";
  if (/energy/.test(c) || merchant.type === "energy") return "energy";
  if (/water/.test(c) || merchant.type === "water") return "water";
  if (/broadband/.test(c) || merchant.type === "broadband") return "broadband";
  if (/phone/.test(c) || merchant.type === "phone") return "phone";
  if (/insurance/.test(c)) return "insurance";
  if (/debt|credit|finance/.test(c) || merchant.type === "debt") return "debt";
  if (/council/.test(c) || merchant.type === "council_tax") return "council_tax";
  if (/childcare/.test(c)) return "childcare";
  if (/subscription/.test(c) || merchant.subscription || transaction._smart_is_subscription || transaction.is_subscription) return "subscription";
  return "other_bill";
}

function cleanDisplayName(value) {
  const cleaned = normalizeText(value)
    .replace(/\b(faster payment|standing order|bank transfer|payment to|payment from|mobile payment|card payment|direct debit|debit card|credit card|fpi|ref|reference|dd|so|pos|visa)\b/g, " ")
    .replace(/\b[a-z]{2,}\d{3,}\b/g, " ")
    .replace(/\b\d+[a-z]+\d*\b/g, " ")
    .replace(/\b\d{2,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.split(" ").slice(0, 4).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") : "Bill";
}

function getAmountBand(amount) {
  const value = Math.abs(Number(amount || 0));
  if (value < 25) return `under25:${Math.round(value / 2) * 2}`;
  if (value < 80) return `mid:${Math.round(value / 5) * 5}`;
  return `large:${Math.round(value / 10) * 10}`;
}

function likelyDay(dates = []) {
  const days = dates.map((date) => date.getDate()).filter(Boolean);
  if (!days.length) return 1;
  const counts = days.reduce((map, day) => map.set(day, (map.get(day) || 0) + 1), new Map());
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

function median(values = []) {
  const safe = values.map(Number).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!safe.length) return 0;
  return safe[Math.floor(safe.length / 2)];
}

function usualAmount(values = []) {
  const safe = values.map(Number).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!safe.length) return 0;
  const clusters = [];
  safe.forEach((amount) => {
    const cluster = clusters.find((item) => Math.abs(item.average - amount) <= Math.max(2, item.average * 0.18));
    if (cluster) {
      cluster.values.push(amount);
      cluster.average = cluster.values.reduce((sum, value) => sum + value, 0) / cluster.values.length;
    } else {
      clusters.push({ values: [amount], average: amount });
    }
  });
  return clusters.sort((a, b) => b.values.length - a.values.length || b.average - a.average)[0]?.average || median(safe);
}

function billStreamsToRecurringEvents(billStreams = []) {
  return (billStreams || []).map((stream) => ({
    key: stream.key,
    title: cleanBillName(stream.name),
    amount: -Math.abs(Number(stream.amount || 0)),
    day: stream.day || 1,
    month: null,
    kind: stream.kind === "subscription" ? "subscription" : "bill",
    kindLabel: stream.kind === "subscription" ? "Subscription" : "Bill",
    confidenceLabel: stream.confidence || "medium",
    estimateNote: stream.note || "Organised from your uploaded statements.",
    sourceCount: stream.sourceCount || 0,
    sourceMonths: stream.sourceMonths || 0,
  }));
}

function normaliseSnapshotBillStreams(items = []) {
  return (items || [])
    .map((item) => ({
      key: item.key || item.name,
      name: cleanBillName(item.name || item.title || "Bill"),
      amount: Math.abs(Number(item.amount ?? item.usual_amount ?? 0)),
      day: Number(item.day ?? item.usual_day ?? 1) || 1,
      kind: item.kind || "bill",
      confidence: item.confidence || item.confidenceLabel || "medium",
      note: item.evidence || item.note || item.estimateNote || "",
      sourceCount: Array.isArray(item.source_transaction_ids) ? item.source_transaction_ids.length : Number(item.sourceCount || 0),
      sourceMonths: Number(item.sourceMonths || 0),
      counterparty: item.counterparty || null,
    }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => a.day - b.day || b.amount - a.amount);
}

function normaliseSnapshotChecks(items = []) {
  return (items || []).map((item) => ({
    key: item.key || item.question,
    question: item.question || "What is this payment?",
    helper: item.helper || "Confirm this so Money Hub can keep your numbers accurate.",
    amount: item.amount ?? null,
    examples: item.examples || [],
    source_transaction_ids: item.source_transaction_ids || [],
  }));
}

function buildChecks({ candidates, billStreams }) {
  return (candidates || [])
    .filter((candidate) => !hasMatchingBillStream(candidate, billStreams))
    .map((candidate) => ({
      ...candidate,
      question: `What is ${candidate.label}?`,
      helper: "Is this a bill, subscription, transfer, work money, or something else?",
    }));
}

function hasMatchingBillStream(candidate, billStreams) {
  const candidateText = normalizeText(`${candidate?.label || ""} ${candidate?.matchText || ""}`);
  const candidateAmount = Number(candidate?.amount || 0);

  return (billStreams || []).some((stream) => {
    const streamText = normalizeText(stream?.name || "");
    const streamAmount = Number(stream?.amount || 0);
    const sameName = candidateText.includes(streamText) || streamText.includes(candidateText.split(" ")[0] || "");
    const sameAmount = Math.abs(streamAmount - candidateAmount) <= 3;
    return sameName && sameAmount;
  });
}

function getUpcomingBills(billStreams) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + 31);

  return (billStreams || [])
    .map((stream) => {
      const date = getNextBillDate(stream.day, today);
      return {
        ...stream,
        date: date.toISOString().slice(0, 10),
        daysAway: Math.max(Math.round((date - today) / 86400000), 0),
      };
    })
    .filter((stream) => new Date(stream.date) <= windowEnd)
    .sort((a, b) => a.daysAway - b.daysAway || b.amount - a.amount);
}

function getNextBillDate(day, today) {
  const safeDay = Math.max(1, Math.min(Number(day || 1), 28));
  let candidate = new Date(today.getFullYear(), today.getMonth(), safeDay);
  if (candidate < today) {
    candidate = new Date(today.getFullYear(), today.getMonth() + 1, safeDay);
  }
  candidate.setHours(0, 0, 0, 0);
  return candidate;
}

function buildAiContext({ smartTransactions, billStreams, checks, summary }) {
  return {
    bills_found: billStreams.map((stream) => ({
      name: stream.name,
      amount: stream.amount,
      expected_day: stream.day,
      confidence: stream.confidence,
      kind: stream.kind,
    })),
    checks_waiting: checks.map((check) => ({
      question: check.question,
      amount: check.amount,
      months_seen: check.monthCount,
      examples: check.sampleDescription || check.examples,
    })),
    summary,
    recent_transactions: smartTransactions.slice(0, 20).map((transaction) => ({
      date: transaction.transaction_date,
      name: transaction._real_merchant_name || getFriendlyTransactionName(transaction),
      category: transaction._smart_category || transaction.category,
      amount: transaction.amount,
      is_transfer: Boolean(transaction._smart_internal_transfer || transaction.is_internal_transfer),
      is_bill: Boolean(transaction._smart_is_bill || transaction.is_bill),
      is_subscription: Boolean(transaction._smart_is_subscription || transaction.is_subscription),
    })),
  };
}
