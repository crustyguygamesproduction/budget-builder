import {
  formatCurrency,
  formatDateShort,
  getTotals,
  isInternalTransferLike,
  parseAppDate,
} from "../lib/finance";
import { Row, Section } from "../components/ui";

export default function AccountsPage({ accounts, transactions, styles }) {
  const accountInsights = accounts.map((account) => {
    const accountTransactions = transactions.filter((transaction) => transaction.account_id === account.id);
    const totals = getTotals(accountTransactions);
    const incomeCount = accountTransactions.filter((transaction) => Number(transaction.amount) > 0 && !isInternalTransferLike(transaction)).length;
    const outgoingCount = accountTransactions.filter((transaction) => Number(transaction.amount) < 0 && !isInternalTransferLike(transaction)).length;
    const transferCount = accountTransactions.filter((transaction) => isInternalTransferLike(transaction)).length;
    const salaryCount = accountTransactions.filter((transaction) => /salary|payroll|wage|paye/i.test(transaction.description || "")).length;
    const billCount = accountTransactions.filter((transaction) => transaction.is_bill || transaction.is_subscription).length;
    const latestDate = accountTransactions
      .map((transaction) => parseAppDate(transaction.transaction_date))
      .filter(Boolean)
      .sort((a, b) => b - a)[0];
    const role = salaryCount > 0 && billCount > 0
      ? "Main spending account"
      : salaryCount > 0
      ? "Income account"
      : transferCount > outgoingCount
      ? "Savings or transfer account"
      : billCount > 0
      ? "Bills account"
      : "Statement account";

    return {
      account,
      accountTransactions,
      totals,
      incomeCount,
      outgoingCount,
      transferCount,
      salaryCount,
      billCount,
      latestDate,
      role,
    };
  });
  const unassignedTransactions = transactions.filter((transaction) => !transaction.account_id).length;

  return (
    <>
      <Section title="Accounts" styles={styles}>
        {accounts.length === 0 ? (
          <p style={styles.emptyText}>
            No accounts yet. Upload a statement and I'll create one.
          </p>
        ) : (
          accountInsights.map((insight) => {
            const { account, accountTransactions, totals } = insight;
            return (
              <div key={account.id} style={styles.accountCard}>
                <div>
                  <strong>{account.name}</strong>
                  <p style={styles.transactionMeta}>
                    {insight.role} - {accountTransactions.length} transaction{accountTransactions.length === 1 ? "" : "s"} - {insight.latestDate ? `latest ${formatDateShort(insight.latestDate)}` : "no dates yet"}
                  </p>
                  <p style={styles.transactionMeta}>
                    Income {formatCurrency(totals.income)} - spending {formatCurrency(totals.spending)} - transfers ignored {insight.transferCount}
                  </p>
                </div>
                <strong>{formatCurrency(totals.net)}</strong>
              </div>
            );
          })
        )}
      </Section>

      <Section title="Statement Separation" styles={styles}>
        <p style={styles.sectionIntro}>
          Accounts are inferred from the statement file name and saved import account. The key is keeping each CSV tied to the correct account so transfers can be ignored and real income/spending stays clean.
        </p>
        <Row name="Accounts found" value={`${accounts.length}`} styles={styles} />
        <Row name="Unassigned transactions" value={`${unassignedTransactions}`} styles={styles} />
        <Row name="Transfer handling" value="Excluded from income/spend when detected" styles={styles} />
      </Section>
    </>
  );
}
