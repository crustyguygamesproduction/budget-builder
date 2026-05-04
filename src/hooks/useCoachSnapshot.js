import { useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { buildCoachContext } from "../lib/coachContext";
import {
  getDataFreshness,
  getSubscriptionSummary,
  getTopCategories,
} from "../lib/dashboardIntelligence";
import {
  getDebtSignals,
  getInvestmentSignals,
} from "../lib/statementSignals";

const COACH_CONTEXT_SAVE_DELAY_MS = 900;

export function useCoachSnapshot({
  userId,
  transactions,
  debts,
  investments,
  goals,
  transactionRules,
  aiMessages,
  subscriptionStatus,
  bankFeedReadiness,
  moneyUnderstanding,
  appMoneyModel,
  moneySnapshot,
}) {
  const debtSignals = useMemo(() => getDebtSignals(transactions), [transactions]);
  const investmentSignals = useMemo(() => getInvestmentSignals(transactions), [transactions]);
  const topCategories = useMemo(() => getTopCategories(transactions), [transactions]);
  const subscriptionSummary = useMemo(() => getSubscriptionSummary(transactions), [transactions]);
  const dataFreshness = useMemo(() => getDataFreshness(transactions), [transactions]);

  const context = useMemo(
    () => buildCoachContext({
      transactions,
      debts,
      investments,
      debtSignals,
      investmentSignals,
      totals: {
        income: appMoneyModel?.income?.monthlyEstimate || 0,
        spending: appMoneyModel?.flexibleSpending?.monthlyEstimate || 0,
        bills: appMoneyModel?.monthlyBillTotal || 0,
        net:
          (appMoneyModel?.income?.monthlyEstimate || 0) -
          (appMoneyModel?.monthlyBillTotal || 0) -
          (appMoneyModel?.flexibleSpending?.monthlyEstimate || 0),
        safeToSpend: appMoneyModel?.savingsCapacity?.safeMonthlyAmount || 0,
        basis: "shared_money_model_monthly_estimate",
      },
      topCategories,
      subscriptionSummary,
      dataFreshness,
      baseMessages: aiMessages,
      userMessage: "",
      subscriptionStatus,
      bankFeedReadiness,
      moneyUnderstanding,
      appMoneyModel,
    }),
    [
      aiMessages,
      appMoneyModel,
      bankFeedReadiness,
      dataFreshness,
      debtSignals,
      debts,
      investmentSignals,
      investments,
      moneyUnderstanding,
      subscriptionStatus,
      subscriptionSummary,
      topCategories,
      transactions,
    ]
  );

  const latestTransactionDate = useMemo(
    () =>
      transactions
        .map((transaction) => transaction.transaction_date)
        .filter(Boolean)
        .sort()
        .at(-1) || null,
    [transactions]
  );

  const contextHash = useMemo(
    () => [
      transactions.length,
      latestTransactionDate || "none",
      moneySnapshot?.id || "no-snapshot",
      goals.length,
      debts.length,
      investments.length,
      transactionRules.length,
      aiMessages.length,
    ].join(":"),
    [
      aiMessages.length,
      debts.length,
      goals.length,
      investments.length,
      latestTransactionDate,
      moneySnapshot?.id,
      transactionRules.length,
      transactions.length,
    ]
  );

  useEffect(() => {
    if (!userId || transactions.length === 0 || typeof window === "undefined") return undefined;

    const timer = window.setTimeout(async () => {
      const { error } = await supabase.from("coach_context_snapshots").upsert(
        {
          user_id: userId,
          source: "client_interpreted_money_layer",
          context,
          context_hash: contextHash,
          transaction_count: transactions.length,
          latest_transaction_date: latestTransactionDate,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (error) {
        console.warn("Coach brain snapshot could not be saved", error);
      }
    }, COACH_CONTEXT_SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [context, contextHash, latestTransactionDate, transactions.length, userId]);
}
