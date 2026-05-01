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

  return {
    totals,
    transaction_count: transactions.length,
    recent_transactions: transactions.slice(0, 10),
    searchable_transactions: statementIntelligence.searchableTransactions,
    searchable_transaction_count: statementIntelligence.searchableTransactions.length,
    searchable_transaction_note: statementIntelligence.searchableTransactionNote,
    query_focus: statementIntelligence.queryFocus,
    statement_intelligence: statementIntelligence.summary,
    top_categories: topCategories.slice(0, 5),
    monthly_breakdown: getMonthlyBreakdown(transactions, "6m").slice(0, 6),
    monthly_breakdown_all: getMonthlyBreakdown(transactions, "all"),
    calendar_pattern_summary: getCalendarPatternSummary(transactions, "6m"),
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
      maths_source_of_truth: "Use app-calculated totals, statement_intelligence, query_focus and rules. Do not invent or re-estimate core figures.",
      safe_to_spend: "Only treat safe-to-spend as real spendable money when live balances or explicit current balances are supplied. Statement net is historical movement, not cash today.",
      checks_page: "If a person, bill, transfer, work payment or pass-through looks uncertain, tell the user to confirm it in Confidence Checks instead of guessing.",
      calendar: "Future payments may be estimates until enough history or user-confirmed rules exist. Say estimated when confidence is not high.",
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
