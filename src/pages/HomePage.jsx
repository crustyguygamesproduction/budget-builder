import { useMemo, useState } from "react";
import { formatCurrency, getMeaningfulCategory } from "../lib/finance";
import { Row, Section } from "../components/ui";
import { cleanBillName, isAllowedBillStream } from "../lib/moneyUnderstandingGuards";

export default function HomePage({
  transactions,
  moneyUnderstanding,
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
    getHomeStatusPillStyle,
    getStatementCoverageSummary,
    getTopCategories,
    hasMatchingDebt,
    hasMatchingInvestment,
  } = helpers;

  const dataFreshness = useMemo(() => getDataFreshness(transactions), [getDataFreshness, transactions]);
  const topCategories = useMemo(() => getTopCategories(transactions), [getTopCategories, transactions]);
  const statementCoverage = useMemo(() => getStatementCoverageSummary(transactions, statementImports), [getStatementCoverageSummary, transactions, statementImports]);
  const visibleCash = useMemo(() => getVisibleCash(accounts), [accounts]);
  const billMoney = useMemo(() => estimateBillMoney(moneyUnderstanding), [moneyUnderstanding]);
  const regularPayments = useMemo(() => estimateRegularMonthlyPayments(moneyUnderstanding), [moneyUnderstanding]);
  const confidenceCheckCount = moneyUnderstanding?.checks?.length || 0;
  const hasConfidenceChecks = confidenceCheckCount > 0;
  const moneyLeft = visibleCash.hasBalance ? Math.max(visibleCash.total - billMoney.total, 0) : null;
  const pressure = getMoneyPressure({ visibleCash, billMoney, dataFreshness, moneyLeft });
  const topCategory = topCategories[0] || null;
  const primaryGoal = getPrimaryGoal(goals);
  const unlinkedDebtSignals = debtSignals.filter((signal) => !hasMatchingDebt(signal, debts));
  const unlinkedInvestmentSignals = investmentSignals.filter((signal) => !hasMatchingInvestment(signal, investments));
  const recentTransactions = transactions.slice(0, 4);
  const planSteps = buildPlanSteps({ pressure, billMoney, dataFreshness, hasConfidenceChecks, confidenceCheckCount, topCategory, onNavigate, onGoToCoach });
  const optionalActions = buildOptionalActions({ unlinkedDebtSignals, unlinkedInvestmentSignals, debts, investments, primaryGoal, subscriptionStatus, bankFeedReadiness, onNavigate });

  const aiPrompts = [
    pressure.isBroke ? "Make me a 7-day broke plan." : "What is the one thing I should fix this week?",
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

      <Section title={pressure.isBroke ? "Your Plan Right Now" : "Your Next Move"} styles={styles}>
        <p style={styles.sectionIntro}>{pressure.isBroke ? "Do these in this order. These buttons take you to the right page or ask AI for the next action." : "Do these in order. Each button takes you to the page that helps with that step."}</p>
        <div style={getPlanListStyle()}>
          {planSteps.map((step, index) => (
            <button key={step.title} type="button" onClick={step.onClick} style={getPlanStepStyle(index === 0)}>
              <span style={getPlanNumberStyle(index === 0)}>{index + 1}</span>
              <span style={{ flex: 1 }}>
                <strong>{step.title}</strong>
                <span style={getPlanBodyStyle()}>{step.body}</span>
              </span>
              <span style={getPlanCtaStyle()}>{step.cta}</span>
            </button>
          ))}
        </div>
      </Section>

      <CollapsiblePanel title="Why Money Hub says this" summary={pressure.shortReason} defaultOpen={false} styles={styles}>
        <p style={styles.sectionIntro}>This is the simple breakdown behind the warning. It is cautious on purpose.</p>
        <Row name="Money showing now" value={visibleCash.hasBalance ? formatCurrency(visibleCash.total) : "No current balance connected"} styles={styles} />
        <Row name={billMoney.timeframeLabel} value={billMoney.count ? `${formatCurrency(billMoney.total)} across ${billMoney.count} payments` : "No bills found yet"} styles={styles} />
        <Row name="Rent included?" value={billMoney.includesRent ? "Yes, where Money Hub can see it" : "Not found yet"} styles={styles} />
        <Row name="Left after bills" value={moneyLeft == null ? "Needs your latest balance" : formatCurrency(moneyLeft)} styles={styles} />
        <Row name="Latest statement" value={dataFreshness.hasData ? dataFreshness.latestMonthLabel : "No statement yet"} styles={styles} />
      </CollapsiblePanel>

      <CollapsiblePanel title="Regular payments found" summary={regularPayments.summary} defaultOpen={false} styles={styles} right={<button style={styles.ghostBtn} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onNavigate("calendar"); }}>Calendar</button>}>
        <p style={styles.sectionIntro}>These are monthly estimates from your uploaded history, not the total across every statement.</p>
        {regularPayments.items.length > 0 ? (
          regularPayments.items.slice(0, 5).map((item) => (
            <Row key={item.name} name={item.name} value={`${formatCurrency(item.monthlyEstimate)} / month · seen ${item.count} time${item.count === 1 ? "" : "s"}`} styles={styles} />
          ))
        ) : (
          <p style={styles.emptyText}>No regular payments found yet. Add more history or check Calendar.</p>
        )}
      </CollapsiblePanel>

      <CollapsiblePanel title="Latest transactions uploaded" summary={recentTransactions.length ? `${recentTransactions.length} latest items shown` : "No transactions yet"} defaultOpen={false} styles={styles}>
        {recentTransactions.length === 0 ? <p style={styles.emptyText}>Add your latest bank statement to unlock your Home page.</p> : recentTransactions.map((transaction) => <TransactionRow key={transaction.id || `${transaction.transaction_date}-${transaction.description}-${transaction.amount}`} name={transaction.description || "Transaction"} meta={`${transaction.transaction_date || "No date"} · ${getMeaningfulCategory(transaction)}`} amount={Number(transaction.amount || 0)} styles={styles} />)}
      </CollapsiblePanel>

      {optionalActions.length > 0 ? (
        <CollapsiblePanel title="Other useful things" summary="Goals, debts, investments and settings" defaultOpen={false} styles={styles}>
          <div style={getSmallActionGridStyle()}>
            {optionalActions.map((action) => (
              <button key={action.title} type="button" onClick={action.onClick} style={getSmallActionStyle()}>
                <strong>{action.title}</strong>
                <span>{action.body}</span>
              </button>
            ))}
          </div>
        </CollapsiblePanel>
      ) : null}

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

function estimateBillMoney(moneyUnderstanding) {
  const summary = moneyUnderstanding?.summary || {};
  const source = [
    ...(moneyUnderstanding?.recurringEvents || []).map((event) => ({
      key: event.key,
      name: event.title,
      amount: Math.abs(Number(event.amount || 0)),
      day: event.day,
      kind: event.kind === "subscription" ? "subscription" : "bill",
      confidence: event.confidenceLabel,
      note: event.estimateNote,
      sourceCount: event.sourceCount || 0,
      sourceMonths: event.sourceMonths || 0,
    })),
    ...(moneyUnderstanding?.billStreams || []),
  ].filter(isAllowedBillStream);
  const deduped = dedupeBillItems(source);
  const total = deduped.reduce((sum, item) => sum + Math.abs(Number(item.amount || 0)), 0);
  return {
    count: deduped.length,
    total,
    includesRent: deduped.some((item) => /rent|landlord|letting|mortgage/i.test(`${item.name} ${item.kind}`)) || Boolean(summary.includesRent && total > 0),
    timeframeLabel: deduped.length ? "Bills due soon" : "Bills found",
    nextBill: deduped[0] || null,
  };
}

function estimateRegularMonthlyPayments(moneyUnderstanding) {
  const items = dedupeBillItems((moneyUnderstanding?.billStreams || []).filter(isAllowedBillStream)).map((item) => ({
    name: cleanBillName(item.name),
    count: item.sourceCount || item.sourceMonths || 0,
    monthlyEstimate: Number(item.amount || 0),
  })).sort((a, b) => b.monthlyEstimate - a.monthlyEstimate);
  const monthlyTotal = items.reduce((sum, item) => sum + item.monthlyEstimate, 0);
  return {
    items,
    monthlyTotal,
    summary: items.length ? `About ${formatCurrency(monthlyTotal)} / month from ${items.length} bill${items.length === 1 ? "" : "s"}` : "No regular bills found yet",
  };
}

function dedupeBillItems(items = []) {
  return (items || []).reduce((merged, item) => {
    const normal = {
      ...item,
      name: cleanBillName(item.name || item.title || "Bill"),
      amount: Math.abs(Number(item.amount || item.usual_amount || 0)),
      day: Number(item.day || item.usual_day || 1) || 1,
    };
    if (!normal.amount) return merged;
    const base = normal.name.toLowerCase().replace(/bill around|around|£?\d+(\.\d{1,2})?|bill|subscription/g, "").replace(/\s+/g, " ").trim();
    const matchIndex = merged.findIndex((existing) => {
      const existingBase = existing.name.toLowerCase().replace(/bill around|around|£?\d+(\.\d{1,2})?|bill|subscription/g, "").replace(/\s+/g, " ").trim();
      const closeAmount = Math.abs(existing.amount - normal.amount) <= Math.max(3, normal.amount * 0.08);
      const closeDay = Math.abs(Number(existing.day || 0) - Number(normal.day || 0)) <= 4;
      return (base && existingBase && base === existingBase && closeAmount && closeDay) || existing.key === normal.key;
    });
    if (matchIndex < 0) return [...merged, normal];
    return merged;
  }, []).sort((a, b) => Number(a.day || 0) - Number(b.day || 0) || Number(b.amount || 0) - Number(a.amount || 0));
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
      heroCopy: `${formatCurrency(billMoney.total)} of bills and subscriptions have been found from your uploaded history, but your visible balance is £0.00. Do not spend from this account today. First check what bill is due next, then ask AI for a 7-day plan.`,
      mainHeadline: "You look broke right now",
      mainBody: "Stop spending from this account today, check upcoming bills, avoid non-essentials like takeaways, taxis and gaming, then update your bank history when the urgent checks are done.",
      shortReason: `£0 showing and ${formatCurrency(billMoney.total)} of bills found`,
      primaryAction: "coach",
      primaryActionLabel: "Get 7-day plan",
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
      mainBody: "Your bills and subscriptions look bigger than the money currently showing. Check Calendar before spending.",
      shortReason: `${formatCurrency(balance)} showing versus ${formatCurrency(billMoney.total)} bills found`,
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
      mainBody: "Check your real bank balance first. Then add your latest statement so Home can guide you properly.",
      shortReason: "No current balance is connected",
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
      shortReason: "No bank history uploaded yet",
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
    shortReason: `${formatCurrency(moneyLeft)} left after bills found`,
    primaryAction: "coach",
    primaryActionLabel: "Ask AI why",
  };
}

function buildPlanSteps({ pressure, billMoney, dataFreshness, hasConfidenceChecks, confidenceCheckCount, topCategory, onNavigate, onGoToCoach }) {
  if (!dataFreshness.hasData) {
    return [
      { title: "Add your first statement", body: "This is the first useful step. Money Hub cannot find your real bills until you upload history.", cta: "Upload", onClick: () => onNavigate("upload") },
      { title: "Then check Calendar", body: "Once your statement is in, Calendar should show only bills Money Hub is confident about.", cta: "Calendar", onClick: () => onNavigate("calendar") },
    ];
  }

  if (pressure.isBroke) {
    const steps = [
      { title: "Freeze spending today", body: "Only spend if it is genuinely essential. No takeaways, taxis, gaming, random shops or top-ups.", cta: "Plan", onClick: () => onGoToCoach("I have no money showing and bills coming. Give me a practical 7-day plan. Be direct and simple.", { autoSend: true }) },
    ];
    if (billMoney.count > 0) steps.push({ title: "Check the next bill", body: `${billMoney.count} bill payment${billMoney.count === 1 ? "" : "s"} found. See what might hit next.`, cta: "Calendar", onClick: () => onNavigate("calendar") });
    if (hasConfidenceChecks) steps.push({ title: "Answer bill checks", body: `${confidenceCheckCount} thing${confidenceCheckCount === 1 ? "" : "s"} need checking so the app stops guessing.`, cta: "Checks", onClick: () => onNavigate("confidence") });
    steps.push({ title: dataFreshness.needsUpload ? "Then add your latest statement" : "Keep the numbers fresh", body: dataFreshness.needsUpload ? "Do this after the urgent check, so the plan is based on today’s reality." : "Your data is fairly fresh, but the latest statement still helps.", cta: "Upload", onClick: () => onNavigate("upload") });
    return steps.slice(0, 3);
  }

  const steps = [];
  if (billMoney.count > 0) {
    steps.push({ title: "Check your upcoming bills", body: `${billMoney.count} bill payment${billMoney.count === 1 ? "" : "s"} found. Check Calendar so nothing surprises you.`, cta: "Calendar", onClick: () => onNavigate("calendar") });
  } else {
    steps.push({ title: "Help Money Hub find your bills", body: "No solid bills are showing yet. Add more history or answer Checks so Calendar can stop guessing.", cta: hasConfidenceChecks ? "Checks" : "Upload", onClick: () => onNavigate(hasConfidenceChecks ? "confidence" : "upload") });
  }

  if (hasConfidenceChecks) {
    steps.push({ title: `${confidenceCheckCount} payment check${confidenceCheckCount === 1 ? "" : "s"} waiting`, body: "Answer only the checks that are actually waiting.", cta: "Checks", onClick: () => onNavigate("confidence") });
  } else if (topCategory) {
    steps.push({ title: `Look at ${topCategory.category}`, body: `${formatCurrency(topCategory.total)} is the loudest spending area in the uploaded data.`, cta: "Ask AI", onClick: () => onGoToCoach(`Look at my ${topCategory.category} spending and tell me what is realistic to cut this week.`, { autoSend: true }) });
  } else {
    steps.push({ title: dataFreshness.needsUpload ? "Add your latest statement" : "Ask AI what to fix first", body: dataFreshness.needsUpload ? "Fresh data makes every page more useful." : "Get one practical next move from your data.", cta: dataFreshness.needsUpload ? "Upload" : "Ask AI", onClick: () => dataFreshness.needsUpload ? onNavigate("upload") : onGoToCoach("What should I fix first this week?", { autoSend: true }) });
  }

  return steps;
}

function buildOptionalActions({ unlinkedDebtSignals, unlinkedInvestmentSignals, debts, investments, primaryGoal, subscriptionStatus, bankFeedReadiness, onNavigate }) {
  const actions = [];
  if (unlinkedDebtSignals.length || debts.length) actions.push({ title: "Debts", body: "Check loans, cards or finance payments.", onClick: () => onNavigate("debts") });
  if (unlinkedInvestmentSignals.length || investments.length) actions.push({ title: "Investments", body: "Keep investing separate from spending.", onClick: () => onNavigate("investments") });
  if (primaryGoal) actions.push({ title: "Goal", body: `Protect ${primaryGoal.name}.`, onClick: () => onNavigate("goals") });
  if (!subscriptionStatus?.isPremium) actions.push({ title: "Settings", body: "Live feeds can wait until manual uploads feel solid.", onClick: () => onNavigate("settings") });
  else if (bankFeedReadiness) actions.push({ title: "Premium", body: bankFeedReadiness.headline, onClick: () => onNavigate("settings") });
  return actions;
}

function getPrimaryGoal(goals) {
  return (goals || []).slice().sort((a, b) => Number(a.priority || 99) - Number(b.priority || 99))[0] || null;
}

function CollapsiblePanel({ title, summary, children, defaultOpen = false, styles, right = null }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Section title="" styles={styles}>
      <div style={getDetailsStyle(open)}>
        <button type="button" onClick={() => setOpen((current) => !current)} style={getSummaryStyle()} aria-expanded={open}>
          <span style={getSummaryTextStyle()}>
            <strong>{title}</strong>
            <small style={getSummarySmallStyle()}>{summary}</small>
            <small style={getTapHintStyle()}>{open ? "Tap to hide this" : "Tap to open this"}</small>
          </span>
          <span style={getSummaryRightStyle()}>
            {right ? <span onClick={(event) => event.stopPropagation()}>{right}</span> : null}
            <span style={getChevronStyle(open)}>{open ? "⌃" : "⌄"}</span>
          </span>
        </button>
        {open ? <div style={getDetailsBodyStyle()}>{children}</div> : null}
      </div>
    </Section>
  );
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

function getPlanListStyle() {
  return { display: "grid", gap: 10 };
}

function getPlanStepStyle(primary) {
  return {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    width: "100%",
    textAlign: "left",
    border: primary ? "1px solid rgba(37, 99, 235, 0.35)" : "1px solid rgba(148, 163, 184, 0.24)",
    borderRadius: 18,
    padding: 14,
    background: primary ? "rgba(239, 246, 255, 0.95)" : "rgba(248, 250, 252, 0.86)",
    color: "#0f172a",
    cursor: "pointer",
  };
}

function getPlanNumberStyle(primary) {
  return {
    width: 28,
    height: 28,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: primary ? "#2563eb" : "#e2e8f0",
    color: primary ? "white" : "#334155",
    fontWeight: 800,
    flexShrink: 0,
  };
}

function getPlanBodyStyle() {
  return { display: "block", color: "#64748b", marginTop: 4, lineHeight: 1.35 };
}

function getPlanCtaStyle() {
  return { color: "#2563eb", fontWeight: 800, whiteSpace: "nowrap", marginLeft: "auto" };
}

function getDetailsStyle(open) {
  return {
    border: open ? "1px solid rgba(37, 99, 235, 0.3)" : "1px solid rgba(148, 163, 184, 0.24)",
    borderRadius: 20,
    overflow: "hidden",
    background: open ? "rgba(239, 246, 255, 0.72)" : "rgba(255,255,255,0.82)",
    boxShadow: open ? "0 14px 35px rgba(15, 23, 42, 0.08)" : "0 8px 20px rgba(15, 23, 42, 0.04)",
  };
}

function getSummaryStyle() {
  return {
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 16,
    width: "100%",
    border: 0,
    background: "transparent",
    textAlign: "left",
    color: "#0f172a",
  };
}

function getSummaryTextStyle() {
  return { display: "grid", gap: 3, minWidth: 0 };
}

function getSummarySmallStyle() {
  return { display: "block", color: "#64748b", fontSize: 14, fontWeight: 500, lineHeight: 1.25 };
}

function getTapHintStyle() {
  return { display: "inline-flex", width: "fit-content", marginTop: 4, padding: "4px 8px", borderRadius: 999, background: "rgba(37, 99, 235, 0.09)", color: "#2563eb", fontSize: 12, fontWeight: 800 };
}

function getSummaryRightStyle() {
  return { display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 };
}

function getChevronStyle(open) {
  return { width: 34, height: 34, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", background: open ? "#2563eb" : "#e0f2fe", color: open ? "white" : "#2563eb", fontWeight: 900, fontSize: 22, lineHeight: 1 };
}

function getDetailsBodyStyle() {
  return { padding: "0 16px 16px" };
}

function getSmallActionGridStyle() {
  return { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 };
}

function getSmallActionStyle() {
  return { textAlign: "left", border: "1px solid rgba(148, 163, 184, 0.22)", borderRadius: 16, padding: 12, background: "#f8fafc", color: "#0f172a", cursor: "pointer", display: "grid", gap: 4 };
}
