import { enhanceTransactions } from "./dashboardIntelligence";
import { getSmartRecurringCalendarEvents } from "./calendarSmartRecurring";
import { getRealWorldMerchant, getFriendlyTransactionName } from "./merchantIntelligence";

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

  const recurringEvents = getSmartRecurringCalendarEvents(smartTransactions);
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

  return {
    transactions: smartTransactions,
    recurringEvents,
    billStreams,
  };
}
