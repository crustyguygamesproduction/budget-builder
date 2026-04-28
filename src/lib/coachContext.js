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

  const statementIntelligence = getStatementIntelligenceContext(transactions);

  return {
    totals,
    transaction_count: transactions.length,
    recent_transactions: transactions.slice(0, 10),
    searchable_transactions: statementIntelligence.searchableTransactions,
    searchable_transaction_count: statementIntelligence.searchableTransactions.length,
    searchable_transaction_note: statementIntelligence.searchableTransactionNote,
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
    recent_messages: baseMessages.slice(-6).map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  };
}
