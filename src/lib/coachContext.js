import { getStatementIntelligenceContext } from "./statementIntelligence";

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
  helpers,
  userMessage,
  subscriptionStatus,
  bankFeedReadiness,
  moneyUnderstanding,
  appMoneyModel,
}) {
  const {
    getDebtMonthlyStatus,
    getInvestmentMonthlyStatus,
    getMonthlyBreakdown,
    getCalendarPatternSummary,
    getTransferSummary,
  } = helpers;

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
    totals,
    transaction_count: transactions.length,
    recent_transactions: interpretedRecentTransactions,
    searchable_transactions: statementIntelligence.searchableTransactions,
    searchable_transaction_count: statementIntelligence.searchableTransactions.length,
    searchable_transaction_note: statementIntelligence.searchableTransactionNote,
    query_focus: statementIntelligence.queryFocus,
    statement_intelligence: statementIntelligence.summary,
    app_money_model: appMoneyModel?.aiContext || {},
    monthly_income_estimate: appMoneyModel?.income || null,
    monthly_bills_from_calendar: appMoneyModel?.monthlyBillTotal ?? null,
    monthly_flexible_spending: appMoneyModel?.flexibleSpending || null,
    savings_capacity: appMoneyModel?.savingsCapacity || null,
    cash_position: appMoneyModel?.cashPosition || null,
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
      shared_app_model: "For bills, income, usual spending, saving room and warnings, use app_money_model before older raw summaries.",
      safe_to_spend: "Only treat safe-to-spend as real spendable money when live balances or explicit current balances are supplied. Statement net is historical movement, not cash today.",
      checks_page: "If a person, bill, transfer, work payment or pass-through looks uncertain, tell the user to confirm it in Confidence Checks instead of guessing.",
      calendar: "Future Bills only contains regular bills/subscriptions Money Hub is confident about. Unclear repeated payments belong in Checks, not Calendar.",
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
