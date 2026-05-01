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
  const billMoney = useMemo(() => estimateBillMoney(transactions, subscriptionSummary), [transactions, subscriptionSummary]);
  const confidenceCheckCount = useMemo(() => buildRecurringMajorPaymentCandidates(transactions, transactionRules).length, [transactions, transactionRules]);
  const hasConfidenceChecks = confidenceCheckCount > 0;
  const moneyLeft = visibleCash.hasBalance ? Math.max(visibleCash.total - billMoney.total, 0) : null;
  const pressure = getMoneyPressure({ visibleCash, billMoney, dataFreshness, moneyLeft });
  const topCategory = topCategories[0] || null;
  const primaryGoal = getPrimaryGoal(goals);
  const unlinkedDebtSignals = debtSignals.filter((signal) => !hasMatchingDebt(signal, debts));
  const unlinkedInvestmentSignals = investmentSignals.filter((signal) => !hasMatchingInvestment(signal, investments));
  const recentTransactions = transactions.slice(0, 4);
  const status = getHomeStatus({ dataFreshness, statementCoverage, hasConfidenceChecks, billMoney, pressure });

  const mainCards = [
    {
      label: "Money warning",
      headline: pressure.mainHeadline,
      body: pressure.mainBody,
      ctaLabel: pressure.primaryActionLabel,
      onClick: pressure.primaryAction === "upload" ? () => onNavigate("upload") : pressure.primaryAction === "calendar" ? () => onNavigate("calendar") : () => onGoToCoach(`Be honest and practical. My visible balance is ${visibleCash.hasBalance ? formatCurrency(visibleCash.total) : "not available"}. Money Hub has found ${formatCurrency(billMoney.total)} that may be needed for bills in ${billMoney.timeframeLabel}. It ${billMoney.includesRent ? "does" : "does not"} include rent. Tell me what I should do next, but do not pretend historical net is cash I can spend.`, { autoSend: true }),
    },
    {
      label: "How reliable is this?",
      headline: status.headline,
      body: status.body,
      ctaLabel: status.actionLabel,
      onClick: status.action === "upload" ? () => onNavigate("upload") : status.action === "checks" ? () => onNavigate("confidence") : () => onNavigate("calendar"),
    },
    {
      label: topCategory ? "Where money went" : "Spending pattern",
      headline: topCategory ? `${topCategory.category}: ${formatCurrency(topCategory.total)}` : "No spending pattern yet",
      body: topCategory ? "This is the biggest spending area in your uploaded data. Some of it may still include bills or one-off payments, so check before cutting blindly." : "Add your latest bank statement and Money Hub will show where your money is going.",
      ctaLabel: topCategory ? "Ask AI what to cut" : "Add statement",
      onClick: topCategory ? () => onGoToCoach(`Look at my ${topCategory.category} spending and tell me what is realistic to cut without making life miserable.`, { autoSend: true }) : () => onNavigate("upload"),
    },
  ];

  const nextActions = buildNextActions({
    dataFreshness,
    statementCoverage,
    billMoney,
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
    pressure,
    onNavigate,
    onGoToCoach,
  });

  const aiPrompts = [
    pressure.isBroke ? "I have no money showing. What should I do first?" : "What is the one thing I should fix this week?",
    "Can I spend anything before payday?",
    billMoney.count > 0 ? "Which bills or subscriptions are most urgent?" : "Help me find my regular bills and subscriptions.",
    primaryGoal ? `Help me protect my goal: ${primaryGoal.name}.` : "Help me set one realistic money goal.",
  ];

  return (
    <>
      <section style={styles.balanceCard}>
        <div style={styles.balanceTopRow}>
          <p style={styles.smallWhite}>{pressure.heroLabel}</p>
          <button type="button" style={getHomeStatusPillStyle(pressure.tone)} onClick={() => onGoToCoach(`Explain this Home warning: ${pressure.mainHeadline}. ${pressure.mainBody}`, { autoSend: true })}>{pressure.badge}</button>
        </div>
        <h1 style={getBigMoneyStyle(screenWidth)}>{pressure.heroAmount}</h1>
        <p style={styles.balanceSubcopy}>{pressure.heroCopy}</p>
        <div style={getHeroPillsStyle()}>
          <StatPill label="Bank history" value={statementCoverage.monthCountLabel || "None"} styles={styles} />
          <StatPill label="Bills found" value={`${formatCurrency(billMoney.total)}`} styles={styles} />
          <StatPill label="Need checking" value={`${confidenceCheckCount}`} styles={styles} />
        </div>
      </section>

      <Section title="What You Need To Know" styles={styles}>
        <div style={styles.compactInsightGrid}>{mainCards.map((card) => <InsightCard key={card.label} {...card} styles={styles} />)}</div>
      </Section>

      <Section title="Why It Says That" styles={styles}>
        <p style={styles.sectionIntro}>Simple breakdown of the warning above. This is deliberately cautious.</p>
        <Row name="Money showing now" value={visibleCash.hasBalance ? formatCurrency(visibleCash.total) : "No current balance connected"} styles={styles} />
        <Row name={billMoney.timeframeLabel} value={billMoney.count ? `${formatCurrency(billMoney.total)} across ${billMoney.count} payments` : "No bills found yet"} styles={styles} />
        <Row name="Rent included?" value={billMoney.includesRent ? "Yes, where Money Hub can see it" : "Not found yet"} styles={styles} />
        <Row name="Left after bills" value={moneyLeft == null ? "Needs your latest balance" : formatCurrency(moneyLeft)} styles={styles} />
        <Row name="Latest statement" value={dataFreshness.hasData ? dataFreshness.latestMonthLabel : "No statement yet"} styles={styles} />
      </Section>

      <Section title="Next Best Moves" styles={styles}>
        <div style={styles.compactInsightGrid}>{nextActions.slice(0, 3).map((card) => <ActionCard key={card.label} {...card} styles={styles} />)}</div>
      </Section>

      {subscriptionSummary.items.length > 0 ? (
        <Section title="Regular Payments Found" styles={styles} right={<button style={styles.ghostBtn} onClick={() => onNavigate("calendar")}>Calendar</button>}>
          <p style={styles.sectionIntro}>These are repeated payments from your uploaded bank history. Use Calendar to check what may be coming next.</p>
          {subscriptionSummary.items.slice(0, 3).map((item) => <Row key={item.name} name={item.name} value={`${formatCurrency(item.total)} · ${item.count} time${item.count === 1 ? "" : "s"}`} styles={styles} />)}
        </Section>
      ) : null}

      <Section title="Latest Transactions Uploaded" styles={styles}>
        {recentTransactions.length === 0 ? <p style={styles.emptyText}>Add your latest bank statement to unlock your Home page.</p> : recentTransactions.map((transaction) => <TransactionRow key={transaction.id || `${transaction.transaction_date}-${transaction.description}-${transaction.amount}`} name={transaction.description || "Transaction"} meta={`${transaction.transaction_date || "No date"} · ${getMeaningfulCategory(transaction)}`} amount={Number(transaction.amount || 0)} styles={styles} />)}
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

function estimateBillMoney(transactions, subscriptionSummary) {
  const currentMonth = new Date();
  const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`;
  const billLike = (transactions || []).filter((transaction) => {
    if (isInternalTransferLike(transaction)) return false;
    if (Number(transaction.amount || 0) >= 0) return false;
    return transaction.is_bill || transaction.is_subscription || transaction._smart_is_bill || transaction._smart_is_subscription;
  });
  const thisMonthBills = billLike.filter((transaction) => String(transaction.transaction_date || "").startsWith(monthKey));
  const source = thisMonthBills.length ? thisMonthBills : billLike.slice(0, 20);
  const total = source.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
  const subscriptionTotal = Number(subscriptionSummary?.total || 0);
  const includesRent = source.some((transaction) => /rent|landlord|letting/i.test(String(transaction.category || transaction._smart_category || transaction.description || "")));
  return {
    count: source.length || subscriptionSummary?.count || 0,
    total: Math.max(total, subscriptionTotal),
    includesRent,
    timeframeLabel: thisMonthBills.length ? "Bills this month" : "Bills from recent history",
  };
}

function getMoneyPressure({ visibleCash, billMoney, dataFreshness, moneyLeft }) {
  const hasBills = billMoney.total > 0;
  const balance = visibleCash.total;
  const isBroke = visibleCash.hasBalance && balance <= 1 && hasBills;
  const isShort = visibleCash.hasBalance && balance < billMoney.total && hasBills;

  if (isBroke) {
    return {
      isBroke: true,
      tone: "bad",
      badge: "Urgent",
      heroLabel: "No money showing",
      heroAmount: "£0.00",
      heroCopy: `${formatCurrency(billMoney.total)} of bills/subscriptions have been found from your uploaded history, but your visible balance is £0.00. Do not spend from this account until you add your latest bank statement or check your real bank balance.`,
      mainHeadline: "You look broke right now",
      mainBody: `Money Hub can see ${formatCurrency(billMoney.total)} that may be needed for bills and £0.00 showing in the app. Add your latest bank statement so the warning is based on fresh data, not old history.`,
      primaryAction: "upload",
      primaryActionLabel: "Add latest statement",
    };
  }

  if (isShort) {
    return {
      isBroke: false,
      tone: "bad",
      badge: "Short",
      heroLabel: "Bills may be bigger than your balance",
      heroAmount: formatCurrency(moneyLeft),
      heroCopy: `Your visible balance is ${formatCurrency(balance)}, but Money Hub has found ${formatCurrency(billMoney.total)} that may be needed for bills. Keep spending locked down until this is checked.`,
      mainHeadline: "Your balance looks short",
      mainBody: "Your bills and subscriptions look bigger than the money currently showing. Check Calendar and add your latest statement before spending.",
      primaryAction: "calendar",
      primaryActionLabel: "Check Calendar",
    };
  }

  if (!visibleCash.hasBalance && dataFreshness.hasData) {
    return {
      isBroke: false,
      tone: "warn",
      badge: "Stale",
      heroLabel: "Old data only",
      heroAmount: "No current balance",
      heroCopy: "Money Hub has uploaded history, but no current balance. It can explain patterns, but it cannot honestly say what you can spend today.",
      mainHeadline: "This is not today’s balance",
      mainBody: "Add your latest bank statement or current balances before using Home as a spending guide.",
      primaryAction: "upload",
      primaryActionLabel: "Add latest statement",
    };
  }

  if (!dataFreshness.hasData) {
    return {
      isBroke: false,
      tone: "neutral",
      badge: "Set up",
      heroLabel: "Start here",
      heroAmount: "No data yet",
      heroCopy: "Add your first bank statement so Money Hub can find your bills, spending leaks and what needs attention.",
      mainHeadline: "Add your first statement",
      mainBody: "One statement gives a first read. Three months makes bills, Calendar and AI much more useful.",
      primaryAction: "upload",
      primaryActionLabel: "Add statement",
    };
  }

  return {
    isBroke: false,
    tone: moneyLeft <= 0 ? "warn" : "good",
    badge: moneyLeft <= 0 ? "Tight" : "OK",
    heroLabel: "Left after bills",
    heroAmount: formatCurrency(moneyLeft),
    heroCopy: `Current visible balance minus ${billMoney.timeframeLabel.toLowerCase()} found by Money Hub. ${billMoney.includesRent ? "Rent is included where Money Hub can see it." : "Rent is only included if Money Hub can see it."}`,
    mainHeadline: moneyLeft <= 0 ? "No clear spare money" : `${formatCurrency(moneyLeft)} left after bills`,
    mainBody: moneyLeft <= 0 ? "Your visible balance is already used up by bills Money Hub can see. Spend carefully until the data is fresh." : "This is a cautious estimate, not permission to spend everything.",
    primaryAction: "coach",
    primaryActionLabel: "Ask AI why",
  };
}

function getHomeStatus({ dataFreshness, statementCoverage, hasConfidenceChecks, billMoney, pressure }) {
  if (!dataFreshness.hasData) return { label: "Set up", tone: "neutral", headline: "Add your first bank statement", body: "Home becomes useful once Money Hub can see your real transactions.", action: "upload", actionLabel: "Add statement" };
  if (dataFreshness.needsUpload) return { label: "Stale", tone: "warn", headline: "Add your latest bank statement", body: `Your newest uploaded data is ${dataFreshness.latestMonthLabel || "not current"}. The warning may be right, but it needs fresh data before you trust it.`, action: "upload", actionLabel: "Add latest statement" };
  if (pressure.isBroke) return { label: "Urgent", tone: "bad", headline: "You need a fresh balance check", body: "£0 showing with bills found means the app should warn you, not soften it.", action: "upload", actionLabel: "Add latest statement" };
  if (hasConfidenceChecks) return { label: "Check", tone: "warn", headline: "Some payments need checking", body: "Answer the checks that are actually waiting so bills, transfers and AI advice stay accurate.", action: "checks", actionLabel: "Open Checks" };
  if ((statementCoverage.monthCount || 0) < 3) return { label: "Learning", tone: "neutral", headline: "Add more history when you can", body: "Three months of data makes bills, Calendar and AI much more confident.", action: "upload", actionLabel: "Add history" };
  return { label: "Ready", tone: "good", headline: billMoney.count ? "Bills are being counted" : "No bills found yet", body: billMoney.count ? "Money Hub is using your regular payments to make the Home warning more realistic." : "Calendar may still improve as you add more history.", action: "calendar", actionLabel: "Review Calendar" };
}

function buildNextActions({ dataFreshness, statementCoverage, billMoney, subscriptionSummary, unlinkedDebtSignals, unlinkedInvestmentSignals, debts, investments, primaryGoal, subscriptionStatus, bankFeedReadiness, hasConfidenceChecks, confidenceCheckCount, pressure, onNavigate, onGoToCoach }) {
  const actions = [];

  if (!dataFreshness.hasData || dataFreshness.needsUpload || pressure.isBroke) {
    actions.push({ label: "Step 1", headline: "Add your latest bank statement", body: "This is the fastest way to make the warning trustworthy. Without fresh data, the app can only work from old history.", actionLabel: "Go to Upload", onClick: () => onNavigate("upload") });
  } else {
    actions.push({ label: "Step 1", headline: "Check your upcoming bills", body: `${billMoney.count || "No"} bill payment${billMoney.count === 1 ? "" : "s"} found. Check Calendar so nothing surprises you.`, actionLabel: "Open Calendar", onClick: () => onNavigate("calendar") });
  }

  if (hasConfidenceChecks) {
    actions.push({ label: "Step 2", headline: `${confidenceCheckCount} payment check${confidenceCheckCount === 1 ? "" : "s"} waiting`, body: "Only answer these when the app genuinely needs help. This keeps totals and AI advice from going weird.", actionLabel: "Open Checks", onClick: () => onNavigate("confidence") });
  } else {
    actions.push({ label: "Step 2", headline: "No checks waiting", body: "There is nothing to answer in Checks right now. Do not waste time there.", actionLabel: "Open Calendar", onClick: () => onNavigate("calendar") });
  }

  actions.push({ label: "Step 3", headline: pressure.isBroke ? "Ask AI for a 7-day plan" : "Ask AI what to fix first", body: pressure.isBroke ? "The coach should give practical next steps, not a lecture: what to avoid, what to check and what to upload." : "The coach should give one practical next move based on your real data.", actionLabel: "Ask AI", onClick: () => onGoToCoach(pressure.isBroke ? "I have no money showing and bills coming. Give me a practical plan for the next 7 days." : "What should I fix first this week?", { autoSend: true }) });

  if (unlinkedDebtSignals.length || unlinkedInvestmentSignals.length || debts.length || investments.length) {
    actions.push({ label: "Optional", headline: "Check debts or investments", body: "Only set these up if they apply to you. They should not make Home noisy.", actionLabel: unlinkedDebtSignals.length ? "Open Debts" : "Open Investments", onClick: () => onNavigate(unlinkedDebtSignals.length ? "debts" : "investments") });
  }

  if (primaryGoal) {
    actions.push({ label: "Goal", headline: `Protect ${primaryGoal.name}`, body: "Your goal should shape the advice so the app does not just say spend whatever is left.", actionLabel: "Open Goals", onClick: () => onNavigate("goals") });
  }

  if (!subscriptionStatus?.isPremium) {
    actions.push({ label: "Later", headline: "Live feeds can wait", body: "Manual uploads should feel trustworthy first. Live feeds can become the paid automatic layer later.", actionLabel: "Open Settings", onClick: () => onNavigate("settings") });
  } else if (bankFeedReadiness) {
    actions.push({ label: "Premium", headline: bankFeedReadiness.headline, body: bankFeedReadiness.body, actionLabel: "Open Settings", onClick: () => onNavigate("settings") });
  }

  return actions;
}

function getPrimaryGoal(goals) {
  return (goals || []).slice().sort((a, b) => Number(a.priority || 99) - Number(b.priority || 99))[0] || null;
}

function getBigMoneyStyle(screenWidth) {
  return { fontSize: screenWidth <= 390 ? 38 : screenWidth <= 520 ? 44 : 54, lineHeight: 0.98, margin: "6px 0 8px", letterSpacing: "-0.05em" };
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
