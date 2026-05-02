import { useMemo } from "react";
import { formatCurrency, getMeaningfulCategory } from "../lib/finance";
import { Row, Section } from "../components/ui";

export default function HomePage({
  transactions,
  appMoneyModel,
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
    hasMatchingDebt,
    hasMatchingInvestment,
  } = helpers;

  const fallbackDataFreshness = useMemo(() => getDataFreshness(transactions), [getDataFreshness, transactions]);
  const dataFreshness = appMoneyModel?.dataFreshness || fallbackDataFreshness;
  const statementCoverage = useMemo(() => getStatementCoverageSummary(transactions, statementImports), [getStatementCoverageSummary, transactions, statementImports]);
  const visibleCash = useMemo(() => getVisibleCash(appMoneyModel, accounts), [appMoneyModel, accounts]);
  const calendarBills = useMemo(() => getCalendarBillRead(appMoneyModel), [appMoneyModel]);
  const billShare = useMemo(() => getBillShareRead(appMoneyModel, calendarBills), [appMoneyModel, calendarBills]);
  const expectedIncome = useMemo(() => getExpectedIncomeRead(appMoneyModel), [appMoneyModel]);
  const nextBill = calendarBills.nextBill;
  const moneyLeft = visibleCash.hasBalance ? visibleCash.total - billShare.personalTotal : null;
  const homeRead = getHomeRead({ visibleCash, calendarBills, billShare, nextBill, moneyLeft, dataFreshness, expectedIncome });
  const checksWaitingCount = appMoneyModel?.checksWaiting?.length || 0;
  const primaryGoal = getPrimaryGoal(goals);
  const unlinkedDebtSignals = debtSignals.filter((signal) => !hasMatchingDebt(signal, debts));
  const unlinkedInvestmentSignals = investmentSignals.filter((signal) => !hasMatchingInvestment(signal, investments));
  const latestTransactions = transactions.slice(0, 3);

  return (
    <>
      <section style={styles.balanceCard}>
        <div style={styles.balanceTopRow}>
          <p style={styles.smallWhite}>{homeRead.label}</p>
          <button
            type="button"
            style={getHomeStatusPillStyle(homeRead.tone)}
            onClick={() => onGoToCoach(homeRead.prompt, { autoSend: true })}
          >
            {homeRead.badge}
          </button>
        </div>

        <h1 style={getBigMoneyStyle(screenWidth)}>{homeRead.amount}</h1>
        <p style={styles.balanceSubcopy}>{homeRead.body}</p>

        <div style={getHeroFocusGridStyle(screenWidth)}>
          <HeroFact
            label="Next bill"
            value={nextBill ? `${nextBill.name}` : "None found"}
            detail={nextBill ? `${formatCurrency(nextBill.amount)} ${nextBill.when}` : "Calendar is quiet"}
          />
          <HeroFact
            label={billShare.hasSharedMoney ? "Your bill share" : "Bills this month"}
            value={formatCurrency(billShare.personalTotal)}
            detail={billShare.hasSharedMoney ? `${formatCurrency(billShare.sharedMoney)} expected from shared bills` : `${calendarBills.count} bill${calendarBills.count === 1 ? "" : "s"} found by Calendar`}
          />
          <HeroFact
            label="Expected in"
            value={expectedIncome.hasExpectedIncome ? formatCurrency(expectedIncome.amount) : "Not clear"}
            detail={expectedIncome.detail || (moneyLeft != null && moneyLeft < 0 ? `${formatCurrency(Math.abs(moneyLeft))} short after bills` : statementCoverage.monthCountLabel || "Bank history")}
          />
        </div>
      </section>

      <Section title="Right Now" styles={styles}>
        <div style={getNowCardStyle(homeRead.tone)}>
          <strong>{homeRead.headline}</strong>
          <span>{homeRead.nextMove}</span>
          <button
            type="button"
            style={styles.primaryBtn}
            onClick={() => onGoToCoach(homeRead.prompt, { autoSend: true })}
          >
            {homeRead.buttonLabel}
          </button>
        </div>
      </Section>

      <Section title="Your Next 30 Days" styles={styles}>
        <div style={styles.inlineInfoBlock}>
          <Row name={billShare.hasSharedMoney ? "Your bill share" : "Bills due"} value={`${formatCurrency(billShare.personalTotal)} this month`} styles={styles} />
          {billShare.hasSharedMoney ? <Row name="Bills leaving account" value={`${formatCurrency(calendarBills.total)} before shared money`} styles={styles} /> : null}
          {billShare.hasSharedMoney ? <Row name="Shared money expected" value={`${formatCurrency(billShare.sharedMoney)} towards bills`} styles={styles} /> : null}
          <Row name="Money expected in" value={expectedIncome.hasExpectedIncome ? `${formatCurrency(expectedIncome.amount)} next 30 days` : expectedIncome.label} styles={styles} />
          <Row name="Next thing to pay" value={nextBill ? `${nextBill.name} ${nextBill.when}` : "Nothing found yet"} styles={styles} />
          <Row name="Needs checking" value={checksWaitingCount ? `${checksWaitingCount} item${checksWaitingCount === 1 ? "" : "s"}` : "Nothing urgent"} styles={styles} />
        </div>
      </Section>

      <Section title="Useful Shortcuts" styles={styles}>
        <div style={getShortcutGridStyle()}>
          <Shortcut title="Calendar" body={nextBill ? `Next: ${nextBill.name}` : "Bills and dates"} onClick={() => onNavigate("calendar")} />
          <Shortcut title="Goals" body={primaryGoal ? primaryGoal.name : "Safety first"} onClick={() => onNavigate("goals")} />
          {checksWaitingCount > 0 ? (
            <Shortcut title="Checks" body={`${appMoneyModel.checksWaiting.length} to answer`} onClick={() => onNavigate("confidence")} />
          ) : (
            <Shortcut title="Upload" body={dataFreshness.needsUpload ? "Add latest" : "Add more history"} onClick={() => onNavigate("upload")} />
          )}
          <Shortcut title="AI plan" body="What can I cut?" onClick={() => onGoToCoach("Look at my bills, expected income and recent spending. Tell me the one most useful thing to cut or fix this week.", { autoSend: true })} />
          {unlinkedDebtSignals.length || debts.length ? <Shortcut title="Debts" body="Repayments" onClick={() => onNavigate("debts")} /> : null}
          {unlinkedInvestmentSignals.length || investments.length ? <Shortcut title="Invest" body="Keep safe first" onClick={() => onNavigate("investments")} /> : null}
          {!subscriptionStatus?.isPremium && bankFeedReadiness ? <Shortcut title="More" body="Settings" onClick={() => onNavigate("settings")} /> : null}
        </div>
      </Section>

      <Section title="Latest Uploaded" styles={styles}>
        {latestTransactions.length > 0 ? (
          latestTransactions.map((transaction) => (
            <TransactionRow
              key={transaction.id || `${transaction.transaction_date}-${transaction.description}-${transaction.amount}`}
              name={transaction._real_merchant_name || transaction.description || "Transaction"}
              meta={`${transaction.transaction_date || "No date"} - ${getMeaningfulCategory(transaction)}`}
              amount={Number(transaction.amount || 0)}
              styles={styles}
            />
          ))
        ) : (
          <p style={styles.emptyText}>Upload a statement and this page will stop being empty.</p>
        )}
      </Section>
    </>
  );
}

function getVisibleCash(appMoneyModel, accounts) {
  const sharedCash = appMoneyModel?.cashPosition;
  if (sharedCash?.hasKnownBalance || sharedCash?.hasBalance) {
    const total = Number(sharedCash.amount ?? sharedCash.total ?? 0);
    return { hasBalance: true, total: Number.isFinite(total) ? total : 0 };
  }

  const values = (accounts || [])
    .map((account) => [account.available_balance, account.current_balance, account.balance].map(Number).find((value) => Number.isFinite(value)))
    .filter((value) => Number.isFinite(value));
  return { hasBalance: values.length > 0, total: values.reduce((sum, value) => sum + value, 0) };
}

function getBillShareRead(appMoneyModel, calendarBills) {
  const grossTotal = Number(calendarBills?.total || appMoneyModel?.grossMonthlyBillTotal || appMoneyModel?.monthlyBillTotal || 0);
  const sharedMoney = Number(appMoneyModel?.monthlySharedContributionTotal || appMoneyModel?.sharedBillContributions?.monthlyTotal || 0);
  const modelBurden = Number(appMoneyModel?.monthlyBillBurdenTotal || 0);
  const personalTotal = sharedMoney > 0 ? Math.max(modelBurden || grossTotal - sharedMoney, 0) : grossTotal;
  return {
    grossTotal,
    sharedMoney,
    personalTotal,
    hasSharedMoney: sharedMoney > 0 && personalTotal < grossTotal,
  };
}

function getExpectedIncomeRead(appMoneyModel) {
  const incoming = appMoneyModel?.upcomingIncome || appMoneyModel?.income?.upcoming30Days || null;
  if (!incoming || !incoming.amount || incoming.confidence === "low") {
    return {
      hasExpectedIncome: false,
      amount: 0,
      label: incoming?.label || "Income not clear yet",
      detail: incoming?.helper || "Upload more history first",
      nextItem: null,
    };
  }
  const nextItem = incoming.items?.[0] || null;
  const detail = nextItem
    ? `${nextItem.name} ${nextItem.daysAway === 0 ? "today" : nextItem.daysAway === 1 ? "tomorrow" : `in ${nextItem.daysAway} days`}`
    : incoming.helper || "Based on repeated income";
  return { hasExpectedIncome: true, amount: Number(incoming.amount || 0), label: incoming.label, detail, nextItem };
}

function getCalendarBillRead(appMoneyModel) {
  const items = (appMoneyModel?.calendarBills || []).map((bill) => ({
    key: bill.key,
    name: bill.name || bill.title || "Bill",
    amount: Math.abs(Number(bill.amount || 0)),
    day: bill.day,
    when: bill.day ? `around day ${bill.day}` : "date learning",
  }));
  const total = Number(appMoneyModel?.monthlyBillTotal || 0);
  const upcoming = (appMoneyModel?.upcomingBills || []).map((bill) => ({
    key: bill.key,
    name: bill.name,
    amount: Math.abs(Number(bill.amount || 0)),
    day: bill.day,
    daysAway: bill.daysAway,
    when: bill.daysAway === 0 ? "today" : bill.daysAway === 1 ? "tomorrow" : `in ${bill.daysAway} days`,
  }));
  return {
    items,
    total,
    count: items.length,
    nextBill: upcoming[0] || items[0] || null,
  };
}

function getHomeRead({ visibleCash, calendarBills, billShare, nextBill, moneyLeft, dataFreshness, expectedIncome }) {
  const hasBills = billShare.personalTotal > 0;
  const billPhrase = billShare.hasSharedMoney
    ? `${formatCurrency(billShare.personalTotal)} as your share of bills after ${formatCurrency(billShare.sharedMoney)} expected from shared bills`
    : `${formatCurrency(calendarBills.total)} of bills`;
  const nextBillText = nextBill ? `${nextBill.name} for ${formatCurrency(nextBill.amount)} ${nextBill.when}` : "no next bill found yet";
  const incomeText = expectedIncome?.hasExpectedIncome ? `Expected income: ${formatCurrency(expectedIncome.amount)}. ` : "";

  if (!dataFreshness.hasData) {
    return {
      tone: "neutral",
      badge: "Start",
      label: "No bank history yet",
      amount: "No data",
      body: "Upload a statement and Money Hub will show bills, income, spending and the first safe goal.",
      headline: "Start with one statement",
      nextMove: "One upload is enough to get the first useful read.",
      buttonLabel: "Help me start",
      prompt: "Help me start Money Hub with one bank statement. Tell me exactly what to do next.",
    };
  }

  if (visibleCash.hasBalance && visibleCash.total <= 1 && hasBills) {
    return {
      tone: "bad",
      badge: "Urgent",
      label: "Do not spend money",
      amount: formatCurrency(visibleCash.total),
      body: `You have ${formatCurrency(visibleCash.total)} showing. Money Hub sees ${billPhrase}. ${incomeText}Next leaving your account: ${nextBillText}.`,
      headline: "Freeze non-essential spending today",
      nextMove: expectedIncome?.hasExpectedIncome ? "Protect the next income before spending it. Food, travel to work and bills only until money lands." : "Food, travel to work and bills only. No takeaways, shopping, gaming or top-ups until money is showing.",
      buttonLabel: "Make 7-day plan",
      prompt: `Across the money Money Hub can see, I have ${formatCurrency(visibleCash.total)} showing, ${billPhrase}, ${incomeText}and my next bill leaving the account is ${nextBillText}. Give me a simple 7-day emergency plan.`,
    };
  }

  if (visibleCash.hasBalance && moneyLeft < 0) {
    return {
      tone: "bad",
      badge: "Short",
      label: "Bills are bigger than balance",
      amount: formatCurrency(visibleCash.total),
      body: `Money Hub sees ${billPhrase}. You look ${formatCurrency(Math.abs(moneyLeft))} short before normal spending. ${incomeText}`,
      headline: "Keep spending locked down",
      nextMove: `Next leaving your account: ${nextBillText}. Do not add new spending until this is covered.`,
      buttonLabel: "Make shortfall plan",
      prompt: `My visible balance is ${formatCurrency(visibleCash.total)}, Money Hub sees ${billPhrase}, ${incomeText}and I look ${formatCurrency(Math.abs(moneyLeft))} short. Make a simple plan.`,
    };
  }

  if (!visibleCash.hasBalance) {
    return {
      tone: "warn",
      badge: "No balance",
      label: "Current cash is missing",
      amount: "Need balance",
      body: `Money Hub sees ${billPhrase}. ${incomeText}Next leaving your account: ${nextBillText}. It needs a current balance before saying what you can spend.`,
      headline: "Good pattern, missing today",
      nextMove: "The app can show bills and expected income, but not real spending room until a balance or latest statement is in.",
      buttonLabel: "Ask what is safe",
      prompt: `Money Hub sees ${billPhrase}, ${incomeText}next leaving the account is ${nextBillText}, but no current balance. Tell me what I can safely assume.`,
    };
  }

  return {
    tone: moneyLeft <= 25 ? "warn" : "good",
    badge: moneyLeft <= 25 ? "Tight" : "OK",
    label: billShare.hasSharedMoney ? "Money after your bill share" : "Money after Calendar bills",
    amount: formatCurrency(Math.max(moneyLeft, 0)),
    body: `After ${billPhrase}, this is the cautious amount left from the visible balance. ${incomeText}Next leaving your account: ${nextBillText}.`,
    headline: moneyLeft <= 25 ? "Keep it careful" : "You have some room",
    nextMove: moneyLeft <= 25 ? "Treat this as tight. Keep spending boring until more money lands." : "Bills are covered in this read. Still keep some back for surprises.",
    buttonLabel: "Check my week",
    prompt: `Check my week. Visible balance leaves ${formatCurrency(Math.max(moneyLeft, 0))} after ${billPhrase}. ${incomeText}Next bill: ${nextBillText}.`,
  };
}

function HeroFact({ label, value, detail }) {
  return (
    <div style={getHeroFactStyle()}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function Shortcut({ title, body, onClick }) {
  return (
    <button type="button" onClick={onClick} style={getShortcutStyle()}>
      <strong>{title}</strong>
      <span>{body}</span>
    </button>
  );
}

function TransactionRow({ name, meta, amount, styles }) {
  return (
    <div style={styles.transactionRow}>
      <div>
        <strong>{name}</strong>
        <p style={styles.transactionMeta}>{meta}</p>
      </div>
      <strong style={{ color: amount < 0 ? "#dc2626" : "#059669" }}>
        {amount < 0 ? "-" : "+"}{formatCurrency(Math.abs(amount))}
      </strong>
    </div>
  );
}

function getPrimaryGoal(goals) {
  return (goals || []).slice().sort((a, b) => Number(a.priority || 99) - Number(b.priority || 99))[0] || null;
}

function getBigMoneyStyle(screenWidth) {
  return {
    fontSize: screenWidth <= 390 ? 40 : screenWidth <= 520 ? 48 : 58,
    lineHeight: 0.98,
    margin: "6px 0 10px",
    letterSpacing: 0,
  };
}

function getHeroFocusGridStyle(screenWidth) {
  return {
    display: "grid",
    gridTemplateColumns: screenWidth <= 520 ? "1fr" : "1.2fr 1fr 1fr",
    gap: 10,
    marginTop: 16,
  };
}

function getHeroFactStyle() {
  return {
    display: "grid",
    gap: 3,
    padding: "11px 12px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.13)",
    border: "1px solid rgba(255,255,255,0.16)",
    minWidth: 0,
  };
}

function getNowCardStyle(tone) {
  const picked = tone === "bad"
    ? { bg: "#fef2f2", border: "#fecaca", color: "#991b1b" }
    : tone === "warn"
    ? { bg: "#fffbeb", border: "#fde68a", color: "#92400e" }
    : { bg: "#ecfdf5", border: "#bbf7d0", color: "#166534" };
  return {
    display: "grid",
    gap: 10,
    padding: 14,
    borderRadius: 18,
    background: picked.bg,
    border: `1px solid ${picked.border}`,
    color: picked.color,
  };
}

function getShortcutGridStyle() {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
    gap: 10,
  };
}

function getShortcutStyle() {
  return {
    display: "grid",
    gap: 4,
    textAlign: "left",
    border: "1px solid rgba(148, 163, 184, 0.24)",
    borderRadius: 16,
    padding: 12,
    background: "#f8fafc",
    color: "#0f172a",
    cursor: "pointer",
  };
}
