import { useMemo } from "react";
import { formatCurrency, getMeaningfulCategory, getTotals, isInternalTransferLike } from "../lib/finance";
import { buildRecurringMajorPaymentCandidates } from "../lib/transactionCategorisation";
import { ActionCard, InsightCard, Row, Section } from "../components/ui";

export default function HomePage({
  transactions,
  transactionRules = [],
  accounts,
  goals,
  debts,
  investments,
  debtSignals,
  investmentSignals,
  statementImports,
  subscriptionStatus,
  bankFeedReadiness,
  onGoToCoach,
  onNavigate,
  screenWidth,
  styles,
  helpers,
}) {
  const {
    getDataFreshness,
    getDisplayedMonthSnapshot,
    getHomeStatusPillStyle,
    getStatementCoverageSummary,
    getSubscriptionSummary,
    getTopCategories,
    hasMatchingDebt,
    hasMatchingInvestment,
  } = helpers;

  const totals = useMemo(() => getTotals(transactions), [transactions]);
  const dataFreshness = useMemo(() => getDataFreshness(transactions), [getDataFreshness, transactions]);
  const monthSnapshot = useMemo(() => getDisplayedMonthSnapshot(transactions), [getDisplayedMonthSnapshot, transactions]);
  const subscriptionSummary = useMemo(() => getSubscriptionSummary(transactions), [getSubscriptionSummary, transactions]);
  const topCategories = useMemo(() => getTopCategories(transactions), [getTopCategories, transactions]);
  const statementCoverage = useMemo(() => getStatementCoverageSummary(transactions, statementImports), [getStatementCoverageSummary, transactions, statementImports]);
  const visibleCash = useMemo(() => getVisibleCash(accounts), [accounts]);
  const fixedCommitments = useMemo(() => estimateMonthlyFixedCommitments(transactions, subscriptionSummary), [transactions, subscriptionSummary]);
  const confidenceCheckCount = useMemo(() => buildRecurringMajorPaymentCandidates(transactions, transactionRules).length, [transactions, transactionRules]);
  const hasConfidenceChecks = confidenceCheckCount > 0;
  const safeToSpend = visibleCash.hasBalance ? Math.max(visibleCash.total - fixedCommitments.total, 0) : null;
  const topCategory = topCategories[0] || null;
  const primaryGoal = getPrimaryGoal(goals);
  const unlinkedDebtSignals = debtSignals.filter((signal) => !hasMatchingDebt(signal, debts));
  const unlinkedInvestmentSignals = investmentSignals.filter((signal) => !hasMatchingInvestment(signal, investments));
  const recentTransactions = transactions.slice(0, 4);
  const status = getHomeStatus({ dataFreshness, monthSnapshot, statementCoverage, visibleCash, safeToSpend, hasConfidenceChecks });

  const headlineValue = visibleCash.hasBalance
    ? formatCurrency(safeToSpend)
    : `${monthSnapshot.net >= 0 ? "+" : "-"}${formatCurrency(Math.abs(monthSnapshot.net || totals.net || 0))}`;
  const headlineLabel = visibleCash.hasBalance ? "Estimated spending room" : monthSnapshot.monthName || "Month movement";
  const headlineSubcopy = visibleCash.hasBalance
    ? `Current balance minus ${fixedCommitments.timeframeLabel.toLowerCase()} bills/subscriptions found by Money Hub. ${fixedCommitments.includesRent ? "This includes rent where tagged." : "Rent is only included if it is tagged or detected as a bill."}`
    : dataFreshness.hasData
      ? `This is historical money in minus money out for ${monthSnapshot.monthName}. It is not cash you have today.`
      : "Upload a statement to get your first useful money read.";

  const mainCards = [
    {
      label: "Main read",
      headline: visibleCash.hasBalance ? `${formatCurrency(safeToSpend)} estimated spending room` : dataFreshness.hasData ? `${monthSnapshot.monthName} is ${monthSnapshot.net >= 0 ? "ahead" : "behind"} on paper` : "No statement data yet",
      body: visibleCash.hasBalance
        ? `This uses visible balance ${formatCurrency(visibleCash.total)} minus ${formatCurrency(fixedCommitments.total)} of ${fixedCommitments.timeframeLabel.toLowerCase()} protected payments. Treat it as a guide until live feeds are connected.`
        : dataFreshness.hasData
          ? `${formatCurrency(monthSnapshot.income)} came in and ${formatCurrency(monthSnapshot.spending)} went out. This explains history, not your current bank balance.`
          : "Start with one statement. Three months makes bills, subscriptions and AI much sharper.",
      ctaLabel: "Ask AI why",
      onClick: () => onGoToCoach(`Explain my Home page money read in plain English. Current balance available: ${visibleCash.hasBalance ? "yes" : "no"}. Visible balance: ${visibleCash.hasBalance ? formatCurrency(visibleCash.total) : "not available"}. Protected payments: ${formatCurrency(fixedCommitments.total)} for ${fixedCommitments.timeframeLabel}. Includes rent: ${fixedCommitments.includesRent ? "yes" : "no"}. Spending room estimate: ${safeToSpend == null ? "not available" : formatCurrency(safeToSpend)}. This month income: ${formatCurrency(monthSnapshot.income)}. This month spending: ${formatCurrency(monthSnapshot.spending)}. Month net: ${formatCurrency(monthSnapshot.net)}. Do not confuse historical net with current cash.`, { autoSend: true }),
    },
    {
      label: "Confidence",
      headline: status.headline,
      body: status.body,
      ctaLabel: status.actionLabel,
      onClick: status.action === "upload" ? () => onNavigate("upload") : status.action === "checks" ? () => onNavigate("confidence") : () => onNavigate("calendar"),
    },
    {
      label: topCategory ? "Biggest leak" : "Spending pattern",
      headline: topCategory ? `${topCategory.category}: ${formatCurrency(topCategory.total)}` : "No leak detected yet",
      body: topCategory ? "This is the loudest category in the current read. Ask AI before making a cut, because some categories include bills or one-offs." : "Once data is uploaded, this card shows the first place to look for savings.",
      ctaLabel: topCategory ? "Ask AI what to cut" : "Upload data",
      onClick: topCategory ? () => onGoToCoach(`Look at my ${topCategory.category} spending and tell me what is realistic to cut without making life miserable.`, { autoSend: true }) : () => onNavigate("upload"),
    },
  ];

  const nextActions = buildNextActions({
    dataFreshness,
    statementCoverage,
    fixedCommitments,
    subscriptionSummary,
    unlinkedDebtSignals,
    unlinkedInvestmentSignals,
    debts,
    investments,
    primaryGoal,
    subscriptionStatus,
    bankFeedReadiness,
    hasConfidenceChecks,
    confidenceCheckCount,
    onNavigate,
    onGoToCoach,
  });

  const aiPrompts = [
    dataFreshness.hasData ? "Why do I feel broke even if the statement says I am close to even?" : "What should I upload first to make Money Hub useful?",
    "What is the one thing I should fix this week?",
    fixedCommitments.count > 0 ? "Which upcoming bills or subscriptions should I worry about?" : "Help me find my regular bills and subscriptions.",
    primaryGoal ? `Help me protect my goal: ${primaryGoal.name}.` : "Help me set one realistic money goal.",
  ];

  return (
    <>
      <section style={styles.balanceCard}>
        <div style={styles.balanceTopRow}>
          <p style={styles.smallWhite}>{headlineLabel}</p>
          <button type="button" style={getHomeStatusPillStyle(status.tone)} onClick={() => onGoToCoach(`Explain this Home status: ${status.label}. ${status.headline}. ${status.body}`, { autoSend: true })}>{status.label}</button>
        </div>
        <h1 style={getBigMoneyStyle(screenWidth)}>{headlineValue}</h1>
        <p style={styles.balanceSubcopy}>{headlineSubcopy}</p>
        <div style={getHeroPillsStyle()}>
          <StatPill label="History" value={statementCoverage.monthCountLabel || "None"} styles={styles} />
          <StatPill label="Protected" value={`${fixedCommitments.count} payments`} styles={styles} />
          <StatPill label="Checks" value={`${confidenceCheckCount} waiting`} styles={styles} />
        </div>
      </section>

      <Section title="What Matters Now" styles={styles}>
        <div style={styles.compactInsightGrid}>{mainCards.map((card) => <InsightCard key={card.label} {...card} styles={styles} />)}</div>
      </Section>

      <Section title="Spending Room" styles={styles}>
        <p style={styles.sectionIntro}>This is conservative. Bills and subscriptions are protected before anything is shown as spare.</p>
        <Row name="Current account balance" value={visibleCash.hasBalance ? formatCurrency(visibleCash.total) : "Not connected yet"} styles={styles} />
        <Row name={fixedCommitments.timeframeLabel} value={fixedCommitments.count ? `${formatCurrency(fixedCommitments.total)} (${fixedCommitments.count} payments)` : "None detected yet"} styles={styles} />
        <Row name="Includes rent?" value={fixedCommitments.includesRent ? "Yes, where tagged/detected" : "Not detected yet"} styles={styles} />
        <Row name="Spending room" value={safeToSpend == null ? "Needs current balance" : formatCurrency(safeToSpend)} styles={styles} />
        <Row name="Data freshness" value={dataFreshness.hasData ? dataFreshness.latestMonthLabel : "No statement yet"} styles={styles} />
      </Section>

      <Section title="Next Best Moves" styles={styles}>
        <div style={styles.compactInsightGrid}>{nextActions.slice(0, 3).map((card) => <ActionCard key={card.label} {...card} styles={styles} />)}</div>
      </Section>

      {subscriptionSummary.items.length > 0 ? (
        <Section title="Subscriptions Snapshot" styles={styles} right={<button style={styles.ghostBtn} onClick={() => onNavigate("calendar")}>Calendar</button>}>
          {subscriptionSummary.items.slice(0, 3).map((item) => <Row key={item.name} name={item.name} value={`${formatCurrency(item.total)} · ${item.count} hit${item.count === 1 ? "" : "s"}`} styles={styles} />)}
        </Section>
      ) : null}

      <Section title="Recent Activity" styles={styles}>
        {recentTransactions.length === 0 ? <p style={styles.emptyText}>No transactions yet. Upload your first statement to unlock Home.</p> : recentTransactions.map((transaction) => <TransactionRow key={transaction.id || `${transaction.transaction_date}-${transaction.description}-${transaction.amount}`} name={transaction.description || "Transaction"} meta={`${transaction.transaction_date || "No date"} · ${getMeaningfulCategory(transaction)}`} amount={Number(transaction.amount || 0)} styles={styles} />)}
      </Section>

      <Section title="Ask AI Next" styles={styles}>
        <div style={styles.actionChipWrap}>{aiPrompts.map((prompt) => <button key={prompt} style={styles.actionChip} onClick={() => onGoToCoach(prompt)}>{prompt}</button>)}</div>
      </Section>
    </>
  );
}

function getVisibleCash(accounts) {
  const values = (accounts || []).map((account) => [account.available_balance, account.current_balance, account.balance].map(Number).find((value) => Number.isFinite(value))).filter((value) => Number.isFinite(value));
  return { hasBalance: values.length > 0, total: values.reduce((sum, value) => sum + value, 0) };
}

function estimateMonthlyFixedCommitments(transactions, subscriptionSummary) {
  const currentMonth = new Date();
  const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`;
  const fixed = (transactions || []).filter((transaction) => {
    if (isInternalTransferLike(transaction)) return false;
    if (Number(transaction.amount || 0) >= 0) return false;
    return transaction.is_bill || transaction.is_subscription || transaction._smart_is_bill || transaction._smart_is_subscription;
  });
  const monthFixed = fixed.filter((transaction) => String(transaction.transaction_date || "").startsWith(monthKey));
  const source = monthFixed.length ? monthFixed : fixed.slice(0, 20);
  const total = source.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
  const subscriptionTotal = Number(subscriptionSummary?.total || 0);
  const includesRent = source.some((transaction) => /rent|landlord|letting/i.test(String(transaction.category || transaction._smart_category || transaction.description || "")));
  return {
    count: source.length || subscriptionSummary?.count || 0,
    total: Math.max(total, subscriptionTotal),
    includesRent,
    timeframeLabel: monthFixed.length ? "Protected this month" : "Protected from recent history",
  };
}

function getHomeStatus({ dataFreshness, monthSnapshot, statementCoverage, visibleCash, safeToSpend, hasConfidenceChecks }) {
  if (!dataFreshness.hasData) return { label: "Set up", tone: "neutral", headline: "Upload a statement first", body: "Home becomes useful once Money Hub can see real transactions.", action: "upload", actionLabel: "Upload" };
  if (dataFreshness.needsUpload) return { label: "Stale", tone: "warn", headline: `Latest data is ${dataFreshness.latestMonthLabel || "not current"}`, body: "The read is useful history, but not a fresh today view.", action: "upload", actionLabel: "Refresh data" };
  if (visibleCash.hasBalance && safeToSpend <= 0) return { label: "Tight", tone: "bad", headline: "No clear spending room", body: hasConfidenceChecks ? "Current balance is already covered by protected payments. Confirm the checks before relying on the number." : "Current balance is already covered by protected payments. No confidence checks are waiting.", action: hasConfidenceChecks ? "checks" : "calendar", actionLabel: hasConfidenceChecks ? "Check bills" : "Open Calendar" };
  if (monthSnapshot.net < 0) return { label: "Watch", tone: "warn", headline: `${monthSnapshot.monthName} is behind`, body: hasConfidenceChecks ? "Money out is ahead of money in. Some checks may improve the read." : "Money out is ahead of money in. No checks are waiting, so look at Calendar or spending next.", action: hasConfidenceChecks ? "checks" : "calendar", actionLabel: hasConfidenceChecks ? "Check categories" : "Open Calendar" };
  if ((statementCoverage.monthCount || 0) < 3) return { label: "Learning", tone: "neutral", headline: "Good start, still learning", body: "Three months of data makes the app much more confident.", action: "upload", actionLabel: "Add history" };
  return { label: "Ready", tone: "good", headline: hasConfidenceChecks ? "A few checks can improve accuracy" : "No urgent checks waiting", body: hasConfidenceChecks ? "Answer the real checks waiting, then the rest of the app gets smarter." : "The app has a decent base and nothing is currently asking for confirmation.", action: hasConfidenceChecks ? "checks" : "calendar", actionLabel: hasConfidenceChecks ? "Improve accuracy" : "Review Calendar" };
}

function buildNextActions({ dataFreshness, statementCoverage, fixedCommitments, subscriptionSummary, unlinkedDebtSignals, unlinkedInvestmentSignals, debts, investments, primaryGoal, subscriptionStatus, bankFeedReadiness, hasConfidenceChecks, confidenceCheckCount, onNavigate, onGoToCoach }) {
  if (!dataFreshness.hasData || dataFreshness.needsUpload) {
    const actions = [
      { label: "Step 1", headline: dataFreshness.hasData ? "Upload the newest statement" : "Upload your first statement", body: statementCoverage.hasCoverageGap ? "Uploaded ranges and visible transactions do not line up. Re-upload or check the latest statement." : "Fresh data makes Home, Calendar, Checks and AI much more useful.", actionLabel: "Go to Upload", onClick: () => onNavigate("upload") },
    ];

    if (hasConfidenceChecks) {
      actions.push({ label: "Step 2", headline: `${confidenceCheckCount} Confidence Check${confidenceCheckCount === 1 ? "" : "s"} waiting`, body: "Confirm rent, bills, transfers and work/pass-through payments so totals stop being guessy.", actionLabel: "Open Checks", onClick: () => onNavigate("confidence") });
    } else {
      actions.push({ label: "Step 2", headline: "No checks waiting", body: "There is nothing to answer in Checks right now, so the next useful move is Calendar or AI after uploading fresh data.", actionLabel: "Open Calendar", onClick: () => onNavigate("calendar") });
    }

    actions.push({ label: "Step 3", headline: "Ask AI what to fix first", body: "Use the coach once the latest statement is in. It should give one practical next move, not a lecture.", actionLabel: "Ask AI", onClick: () => onGoToCoach("What should I fix first after uploading my latest statement?", { autoSend: true }) });
    return actions;
  }

  const firstAction = hasConfidenceChecks
    ? { label: "Checks", headline: `${confidenceCheckCount} Confidence Check${confidenceCheckCount === 1 ? "" : "s"} waiting`, body: "Answer these because they change totals, bills, transfers or AI advice.", actionLabel: "Open Checks", onClick: () => onNavigate("confidence") }
    : { label: "Accuracy", headline: "No checks waiting", body: "The app has no unanswered classification questions right now. Review Calendar instead of sending users to an empty page.", actionLabel: "Open Calendar", onClick: () => onNavigate("calendar") };

  return [
    firstAction,
    { label: "Calendar", headline: subscriptionSummary.count ? "Review upcoming bills" : "Look for future payments", body: "Calendar should show rent, bills, subscriptions and estimates before they hurt you.", actionLabel: "Open Calendar", onClick: () => onNavigate("calendar") },
    { label: subscriptionStatus?.isPremium ? "Premium" : "Upgrade path", headline: subscriptionStatus?.isPremium ? bankFeedReadiness.headline : "Live feeds can come later", body: subscriptionStatus?.isPremium ? bankFeedReadiness.body : "Manual uploads prove the intelligence. Live feeds should be the paid automatic layer once trust is solid.", actionLabel: "Open Settings", onClick: () => onNavigate("settings") },
    { label: "Debt/investing", headline: unlinkedDebtSignals.length || unlinkedInvestmentSignals.length ? "Confirm detected money streams" : "Optional trackers are quiet", body: debts.length || investments.length ? "Debt and investing are set up enough to monitor." : "Set these up only if relevant. They should not shout at people with nothing to track.", actionLabel: unlinkedDebtSignals.length ? "Open Debts" : "Open Investments", onClick: () => onNavigate(unlinkedDebtSignals.length ? "debts" : "investments") },
    { label: "Goal", headline: primaryGoal ? `Protect ${primaryGoal.name}` : "Set one simple goal", body: primaryGoal ? "Goals should shape advice so the app does not just say spend whatever is spare." : "One goal gives the coach a reason to guide spending instead of just describing it.", actionLabel: "Open Goals", onClick: () => onNavigate("goals") },
  ];
}

function getPrimaryGoal(goals) {
  return (goals || []).slice().sort((a, b) => Number(a.priority || 99) - Number(b.priority || 99))[0] || null;
}

function getBigMoneyStyle(screenWidth) {
  return { fontSize: screenWidth <= 390 ? 42 : screenWidth <= 520 ? 48 : 58, lineHeight: 0.95, margin: "6px 0 8px", letterSpacing: "-0.06em" };
}

function getHeroPillsStyle() {
  return { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 12 };
}

function StatPill({ label, value, styles }) {
  return (
    <div style={{ ...styles.balancePill, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, whiteSpace: "normal" }}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TransactionRow({ name, meta, amount, styles }) {
  return <div style={styles.transactionRow}><div><strong>{name}</strong><p style={styles.transactionMeta}>{meta}</p></div><strong style={{ color: amount < 0 ? "#dc2626" : "#059669" }}>{amount < 0 ? "-" : "+"}{formatCurrency(Math.abs(amount))}</strong></div>;
}
