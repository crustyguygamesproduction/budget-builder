import { enhanceTransactions } from "./dashboardIntelligence";
import { getSmartRecurringCalendarEvents } from "./calendarSmartRecurring";
import { buildStrongBillFallbackEvents, mergeRecurringEvents } from "./billFallbacks";
import { getRealWorldMerchant, getFriendlyTransactionName } from "./merchantIntelligence";
import { buildRecurringMajorPaymentCandidates } from "./transactionCategorisation";
import { formatCurrency, normalizeText } from "./finance";

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

  if (snapshot?.id) {
    const billStreams = normaliseSnapshotBillStreams(snapshot.bill_streams);
    const recurringEvents = normaliseSnapshotRecurringEvents(snapshot.recurring_events, billStreams);
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
      source: "ai-organised",
      plainEnglish: snapshot.summary?.plainEnglish || (billStreams.length ? `${billStreams.length} regular bill${billStreams.length === 1 ? "" : "s"} found. ${formatCurrency(upcomingBillsTotal)} is expected in the next month.` : "No regular bills are solid enough to forecast yet."),
    };

    return {
      transactions: smartTransactions,
      recurringEvents,
      billStreams,
      checks,
      summary,
      aiContext: snapshot.ai_context || buildAiContext({ smartTransactions, billStreams, checks, summary }),
      snapshot,
      source: "ai-organised",
    };
  }

  const detectedRecurringEvents = getSmartRecurringCalendarEvents(smartTransactions);
  const recurringEvents = mergeRecurringEvents([
    ...detectedRecurringEvents,
    ...buildStrongBillFallbackEvents(smartTransactions, detectedRecurringEvents),
  ]);
  const billStreams = recurringEvents
    .filter((event) => Number(event.amount || 0) < 0)
    .map((event) => ({
      key: event.key,
      name: event.title,
      amount: Math.abs(Number(event.amount || 0)),
      day: event.day,
      kind: event.kind || "bill",
      confidence: event.confidenceLabel || "estimated",
      note: event.estimateNote || "",
      sourceCount: event.sourceCount || 0,
      sourceMonths: event.sourceMonths || 0,
    }));
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

function normaliseSnapshotBillStreams(items = []) {
  return (items || [])
    .map((item) => ({
      key: item.key || item.name,
      name: item.name || item.title || "Bill",
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

function normaliseSnapshotRecurringEvents(items = [], billStreams = []) {
  const events = (items || []).map((item) => ({
    key: item.key || item.title,
    title: item.title || item.name || "Bill",
    amount: Number(item.amount || 0) < 0 ? Number(item.amount) : -Math.abs(Number(item.amount || item.usual_amount || 0)),
    day: Number(item.day || item.usual_day || 1) || 1,
    month: null,
    kind: item.kind || "bill",
    kindLabel: item.kindLabel || (item.kind === "subscription" ? "Subscription" : "Bill"),
    confidenceLabel: item.confidenceLabel || item.confidence || "medium",
    estimateNote: item.estimateNote || item.evidence || "AI organised from your uploaded statements.",
    sourceCount: item.sourceCount || (Array.isArray(item.source_transaction_ids) ? item.source_transaction_ids.length : 0),
    sourceMonths: item.sourceMonths || 0,
  })).filter((event) => event.amount < 0);

  if (events.length) return events;

  return billStreams.map((stream) => ({
    key: stream.key,
    title: stream.name,
    amount: -Math.abs(Number(stream.amount || 0)),
    day: stream.day || 1,
    month: null,
    kind: stream.kind === "subscription" ? "subscription" : "bill",
    kindLabel: stream.kind === "subscription" ? "Subscription" : "Bill",
    confidenceLabel: stream.confidence || "medium",
    estimateNote: stream.note || "AI organised from your uploaded statements.",
    sourceCount: stream.sourceCount || 0,
    sourceMonths: stream.sourceMonths || 0,
  }));
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
