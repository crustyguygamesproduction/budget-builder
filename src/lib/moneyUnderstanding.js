import { enhanceTransactions } from "./dashboardIntelligence";
import { getSmartRecurringCalendarEvents } from "./calendarSmartRecurring";
import { buildStrongBillFallbackEvents, mergeRecurringEvents } from "./billFallbacks";
import { getRealWorldMerchant, getFriendlyTransactionName } from "./merchantIntelligence";
import { buildRecurringMajorPaymentCandidates } from "./transactionCategorisation";
import { formatCurrency, normalizeText } from "./finance";

export function buildMoneyUnderstanding({ transactions = [], transactionRules = [] } = {}) {
  const smartTransactions = enhanceTransactions(transactions, transactionRules).map((transaction) => {
    const merchant = getRealWorldMerchant(transaction);
    return {
      ...transaction,
      _real_merchant_key: merchant.cleanKey || merchant.key,
      _real_merchant_name: merchant.known ? merchant.name : getFriendlyTransactionName(transaction),
      _real_merchant_type: merchant.type || "",
      _real_merchant_known: Boolean(merchant.known),
    };
  });

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
  };
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
      examples: check.sampleDescription,
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
