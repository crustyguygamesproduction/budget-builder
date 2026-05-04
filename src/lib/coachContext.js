import { getStatementIntelligenceContext } from "./statementIntelligence";
import {
  getCalendarPatternSummary,
  getMonthlyBreakdown,
} from "./calendarIntelligence";
import { getTransferSummary } from "./dashboardIntelligence";
import {
  getDebtMonthlyStatus,
  getInvestmentMonthlyStatus,
} from "./statementSignals";

export function buildCoachContext({
  transactions,
  debts,
  investments,
  debtSignals,
  investmentSignals,
  totals,
  topCategories,
  subscriptionSummary,
  dataFreshness,
  baseMessages,
  userMessage,
  subscriptionStatus,
  bankFeedReadiness,
  moneyUnderstanding,
  appMoneyModel,
}) {
  const debtStatuses = debts.slice(0, 6).map((debt) => ({
    name: debt.name,
    lender: debt.lender,
    status: getDebtMonthlyStatus(debt, transactions).label,
  }));

  const investmentStatuses = investments.slice(0, 6).map((investment) => ({
    name: investment.name,
    platform: investment.platform,
    status: getInvestmentMonthlyStatus(investment, transactions).label,
  }));

  const coachTotals = buildCoachTotalsForUserShare(totals, appMoneyModel);
  const statementIntelligence = getStatementIntelligenceContext(transactions, userMessage);
  const interpretedRecentTransactions =
    moneyUnderstanding?.aiContext?.recent_transactions ||
    transactions.slice(0, 10).map((transaction) => ({
      date: transaction.transaction_date,
      name: transaction._real_merchant_name || transaction.description,
      category: transaction._smart_category || transaction.category,
      amount: transaction.amount,
      is_transfer: Boolean(transaction._smart_internal_transfer || transaction.is_internal_transfer),
      is_bill: Boolean(transaction._smart_is_bill || transaction.is_bill),
      is_subscription: Boolean(transaction._smart_is_subscription || transaction.is_subscription),
    }));

  return {
    totals: coachTotals,
    transaction_count: transactions.length,
    recent_transactions: interpretedRecentTransactions,
    searchable_transactions: statementIntelligence.searchableTransactions,
    searchable_transaction_count: statementIntelligence.searchableTransactions.length,
    searchable_transaction_note: statementIntelligence.searchableTransactionNote,
    query_focus: statementIntelligence.queryFocus,
    statement_intelligence: statementIntelligence.summary,
    app_money_model: appMoneyModel?.aiContext || {},
    monthly_income_estimate: appMoneyModel?.income || null,
    monthly_scheduled_outgoings_to_cover:
      appMoneyModel?.monthlyScheduledOutgoingsTotal ??
      appMoneyModel?.monthlyBillBurdenTotal ??
      appMoneyModel?.monthlyBillTotal ??
      null,
    monthly_bills_from_calendar_gross: appMoneyModel?.grossMonthlyBillTotal ?? appMoneyModel?.monthlyBillTotal ?? null,
    monthly_flexible_spending: appMoneyModel?.flexibleSpending || null,
    savings_capacity: appMoneyModel?.savingsCapacity || null,
    cash_position: appMoneyModel?.cashPosition || null,
    clean_monthly_facts: appMoneyModel?.cleanMonthlyFacts || null,
    confidence_warnings: appMoneyModel?.confidenceWarnings || [],
    next_best_actions: appMoneyModel?.nextBestActions || [],
    top_categories: topCategories.slice(0, 5),
    monthly_breakdown: getMonthlyBreakdown(transactions, "6m").slice(0, 6),
    monthly_breakdown_all: getMonthlyBreakdown(transactions, "all"),
    calendar_pattern_summary: getCalendarPatternSummary(transactions, "6m"),
    money_understanding: moneyUnderstanding?.aiContext || {},
    bills_found: moneyUnderstanding?.billStreams || [],
    checks_waiting: moneyUnderstanding?.checks || [],
    data_freshness: dataFreshness,
    transfer_summary: getTransferSummary(transactions),
    debts: debts.slice(0, 6),
    investments: investments.slice(0, 6),
    debt_statuses: debtStatuses,
    investment_statuses: investmentStatuses,
    debt_signals: debtSignals.slice(0, 5),
    investment_signals: investmentSignals.slice(0, 5),
    subscription_summary: subscriptionSummary,
    subscription_status: subscriptionStatus,
    bank_feed_readiness: bankFeedReadiness,
    launch_safety_rules: {
      audience: "People who feel bad with money and need plain, trustworthy guidance.",
      maths_source_of_truth: "Use money_understanding, app-calculated totals, statement_intelligence, query_focus and rules. Do not invent or re-estimate core figures.",
      monthly_number_discipline: "For coaching, use clean_monthly_facts: latest_full_month, recent_monthly_average, trend and worst_recent_month. Never compare all-history totals with monthly income.",
      shared_app_model: "For bills, income, usual spending, saving room and warnings, use app_money_model before older raw summaries. For split bills, talk about the user's scheduled outgoings to cover, not the larger gross amount passing through the account.",
      raw_movement_warning: "If clean_monthly_facts.budget_sanity.raw_outgoings_likely_inflated is true, treat raw outgoings as transfer/pass-through inflated and ask for Review checks instead of shaming the user on raw movement.",
      safe_to_spend: "Only treat safe-to-spend as real spendable money when live balances or explicit current balances are supplied. Statement net is historical movement, not cash today.",
      review_page: "If a person, bill, transfer, work payment or pass-through looks uncertain, tell the user to confirm it in Review instead of guessing.",
      calendar: "Future Bills only contains regular bills/subscriptions Money Hub is confident about. Unclear repeated payments belong in Review, not Calendar.",
      answer_style: "Lead with the useful answer in simple English. Avoid accounting jargon unless the user asks for detail.",
    },
    premium_guidance:
      "Free users should get useful manual-upload advice. Premium should be positioned around live bank feeds, sharper AI, debt payoff tracking, investment tracking, calendar forecasts, and viewer mode.",
    recent_messages: baseMessages.slice(-6).map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  };
}

function buildCoachTotalsForUserShare(totals = {}, appMoneyModel = null) {
  const income = Number(totals?.income ?? appMoneyModel?.income?.monthlyEstimate ?? 0) || 0;
  const spending = Number(totals?.spending ?? appMoneyModel?.flexibleSpending?.monthlyEstimate ?? 0) || 0;
  const userBillBurden = Number(
    appMoneyModel?.monthlyScheduledOutgoingsTotal ??
    appMoneyModel?.monthlyBillBurdenTotal ??
    totals?.bills ??
    appMoneyModel?.monthlyBillTotal ??
    0
  ) || 0;
  const grossBills = Number(appMoneyModel?.grossMonthlyBillTotal ?? appMoneyModel?.monthlyBillTotal ?? totals?.bills ?? 0) || 0;
  const sharedContributions = Number(appMoneyModel?.monthlySharedContributionTotal ?? 0) || 0;

  return {
    ...totals,
    income,
    spending,
    bills: userBillBurden,
    grossBills,
    sharedBillContributions: sharedContributions,
    userBillsToCover: userBillBurden,
    net: income - userBillBurden - spending,
    basis: sharedContributions > 0
      ? "user_share_after_shared_bill_contributions"
      : totals?.basis || "shared_money_model_monthly_estimate",
    note: sharedContributions > 0
      ? "Bills are the user's scheduled outgoings to cover after confirmed shared bill contributions. Do not compare income against the gross household bill figure."
      : totals?.note,
  };
}
