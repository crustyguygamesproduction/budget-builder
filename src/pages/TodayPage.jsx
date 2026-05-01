import { useMemo } from "react";
import {
  formatCurrency,
  getMeaningfulCategory,
  getTotals,
  isInternalTransferLike,
  isTransactionInMonth,
} from "../lib/finance";
import {
  ActionCard as BaseActionCard,
  InsightCard as BaseInsightCard,
  Row as BaseRow,
  Section as BaseSection,
} from "../components/ui";

export default function TodayPage({
  transactions,
  accounts,
  goals,
  debts,
  investments,
  debtSignals,
  investmentSignals,
  trendSummary,
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
    buildDailyBrief,
    buildSubscriptionCoachPrompt,
    getCashSummary,
    getCoachPromptIdeas,
    getDataFreshness,
    getDebtStatusSummary,
    getDisplayedMonthSnapshot,
    getHomeStatusPillStyle,
    getInvestmentStatusSummary,
    getMoneyIntelligenceSummary,
    getRecurringSummary,
    getStatementCoverageSummary,
    getSubscriptionSummary,
    getTopCategories,
    getTransferSummary,
    hasMatchingDebt,
    hasMatchingInvestment,
  } = helpers;

  const totals = useMemo(() => getTotals(transactions), [transactions]);
  const topCategories = useMemo(() => getTopCategories(transactions), [getTopCategories, transactions]);
  const dataFreshness = useMemo(() => getDataFreshness(transactions), [getDataFreshness, transactions]);
  const statementCoverage = useMemo(
    () => getStatementCoverageSummary(transactions, statementImports),
    [getStatementCoverageSummary, transactions, statementImports]
  );
  const monthSnapshot = useMemo(() => getDisplayedMonthSnapshot(transactions), [getDisplayedMonthSnapshot, transactions]);
  const cashSummary = useMemo(() => getCashSummary(accounts, transactions), [getCashSummary, accounts, transactions]);
  const subscriptionSummary = useMemo(() => getSubscriptionSummary(transactions), [getSubscriptionSummary, transactions]);
  const recurringSummary = useMemo(() => getRecurringSummary(transactions), [getRecurringSummary, transactions]);
  const intelligenceSummary = useMemo(
    () =>
      getMoneyIntelligenceSummary({
        transactions,
        accounts,
        debts,
        investments,
        dataFreshness,
        statementCoverage,
        subscriptionSummary,
        recurringSummary,
        bankFeedReadiness,
      }),
    [
      getMoneyIntelligenceSummary,
      transactions,
      accounts,
      debts,
      investments,
      dataFreshness,
      statementCoverage,
      subscriptionSummary,
      recurringSummary,
      bankFeedReadiness,
    ]
  );

  const recent = transactions.slice(0, 3);
  const latestVisibleTransactions = useMemo(() => {
    if (!dataFreshness.hasData) return [];
    const focusDate = monthSnapshot.monthDate || dataFreshness.latestDate || new Date();
    return transactions
      .filter((transaction) => isTransactionInMonth(transaction, focusDate))
      .slice(0, 5);
  }, [transactions, dataFreshness.hasData, dataFreshness.latestDate, monthSnapshot.monthDate]);

  const debtStatusSummary = getDebtStatusSummary(debts, transactions);
  const investmentStatusSummary = getInvestmentStatusSummary(
    investments,
    transactions
  );

  const primaryGoal = getPrimaryGoal(goals);

  const goalTarget = Number(primaryGoal?.target_amount || 15000);
  const goalCurrent = Number(primaryGoal?.current_amount || 0);
  const goalPercent = goalTarget
    ? Math.min((goalCurrent / goalTarget) * 100, 100)
    : 0;
  const goalNudge = primaryGoal
    ? buildGoalNudge({
        goal: primaryGoal,
        transactions,
        monthSnapshot,
        cashSummary,
        formatCurrency,
        isInternalTransferLike,
      })
    : null;

  const dailyBrief = buildDailyBrief({
    transactionCount: transactions.length,
    totals,
    topCategories,
    subscriptions: subscriptionSummary.count,
    goalPercent,
    cashSummary,
    dataFreshness,
  });

  const defaultCoachPrompts = getCoachPromptIdeas({
    topCategories,
    cashSummary,
    houseGoal: primaryGoal,
    debtSignals,
    investmentSignals,
  }).slice(0, 4);

  const staleCoachPrompts = [
    statementCoverage.hasCoverageGap
      ? `My uploads suggest history should reach ${statementCoverage.latestStatementMonthLabel}, but the visible transactions stop at ${dataFreshness.latestMonthLabel}. What should I check first?`
      : dataFreshness.hasData
      ? "What gets more accurate if I upload my latest statement?"
      : "What should I upload first to make Money Hub useful?",
    "How many months of statements should I upload for the smartest read?",
    subscriptionSummary.count > 0
      ? "Which subscriptions should I check first?"
      : dataFreshness.hasData
      ? `Use ${monthSnapshot.monthName} and tell me the first thing to improve.`
      : "How does Money Hub get smarter after 3 months of statements?",
  ].filter(Boolean);

  const coachPrompts = dataFreshness.needsUpload ? staleCoachPrompts : defaultCoachPrompts;

  const unlinkedDebtSignals = debtSignals.filter(
    (signal) => !hasMatchingDebt(signal, debts)
  );
  const unlinkedInvestmentSignals = investmentSignals.filter(
    (signal) => !hasMatchingInvestment(signal, investments)
  );

  const subscriptionActionCard = {
    key: "subscriptions",
    label: "Subscription check",
    headline:
      subscriptionSummary.count > 0
        ? `${subscriptionSummary.count} recurring charge${subscriptionSummary.count === 1 ? "" : "s"} worth checking`
        : "No obvious subscription leaks right now",
    body:
      subscriptionSummary.count > 0
        ? `${subscriptionSummary.topLine} Tap to see the likely subscriptions and ask AI which ones look dead weight.`
        : "Once a few recurring charges show up, this becomes a quick review list instead of a guess.",
    action: subscriptionSummary.count > 0 ? "Review subscriptions" : "Ask AI anyway",
    onClick: () =>
      onGoToCoach(
        buildSubscriptionCoachPrompt(subscriptionSummary),
        { autoSend: true }
      ),
  };

  const actionCards = [
    subscriptionActionCard,
    {
      key: "debts",
      label: "Debt watch",
      headline:
        debts.length > 0
          ? debtStatusSummary.headline
          : unlinkedDebtSignals.length > 0
          ? `${unlinkedDebtSignals.length} debt-looking stream${unlinkedDebtSignals.length === 1 ? "" : "s"} to confirm`
          : "No debt setup yet",
      body:
        debts.length > 0
          ? debtStatusSummary.body
          : unlinkedDebtSignals.length > 0
          ? "Tap through and turn those repeated payments into proper debt tracking so the app can monitor them each month."
          : "If you have cards or loans, add them once and the monthly watch becomes far more useful.",
      action: debts.length > 0 || unlinkedDebtSignals.length > 0 ? "Open debts" : "Set up debts",
      onClick: () => onNavigate("debts"),
    },
    {
      key: "investments",
      label: "Investing watch",
      headline:
        investments.length > 0
          ? investmentStatusSummary.headline
          : unlinkedInvestmentSignals.length > 0
          ? `${unlinkedInvestmentSignals.length} broker stream${unlinkedInvestmentSignals.length === 1 ? "" : "s"} to confirm`
          : "No investment setup yet",
      body:
        investments.length > 0
          ? investmentStatusSummary.body
          : unlinkedInvestmentSignals.length > 0
          ? "Tap through and confirm whether these are deposits, withdrawals, or both before the app treats them as investing."
          : "Once your investing is set up, this becomes one of the most useful parts of the app.",
      action: investments.length > 0 || unlinkedInvestmentSignals.length > 0 ? "Open investments" : "Set up investing",
      onClick: () => onNavigate("investments"),
    },
  ];

  const refreshActionCard = dataFreshness.needsUpload
    ? {
        key: "fresh-statement",
        label: dataFreshness.hasData ? "Upload latest statement" : "Upload your first statement",
        headline: statementCoverage.hasCoverageGap
          ? `Uploads suggest ${statementCoverage.latestStatementMonthLabel}, but visible transactions stop at ${dataFreshness.latestMonthLabel}`
          : dataFreshness.hasData
          ? `Your useful data currently stops at ${dataFreshness.latestMonthLabel}`
          : "Money Hub starts working after your first statement",
        body: statementCoverage.hasCoverageGap
          ? "That usually means the latest statement import needs checking or re-uploading. Money Hub should read what you loaded, not leave you guessing."
          : dataFreshness.hasData
          ? "Upload the newest statement to refresh the Today page, fix this month, and sharpen the calendar and AI advice."
          : "One statement gives you a first read. Three or more months make recurring bills, subscriptions, and trends much smarter.",
        action: "Go to upload",
        onClick: () => onNavigate("upload"),
      }
    : null;

  const statementHistoryCard = {
    key: "history-strength",
    label: "History strength",
    headline: statementCoverage.headline,
    body: statementCoverage.body,
    action: dataFreshness.needsUpload ? "Upload statement" : "Open calendar",
    onClick: () => (dataFreshness.needsUpload ? onNavigate("upload") : onNavigate("calendar")),
  };

  const aiSetupCard = {
    key: "ai-setup",
    label: "AI setup help",
    headline: "Not sure what to upload next?",
    body: "Ask the coach how much history to add and what gets smarter after 1, 3, and 6 months of statements.",
    action: "Ask AI",
    onClick: () =>
      onGoToCoach(
        "Explain how many bank statements I should upload and what gets smarter after 1, 3, and 6 months of history.",
        { autoSend: true }
      ),
  };

  const homeHeroPills = dataFreshness.needsUpload
    ? [
        { label: "History loaded", value: statementCoverage.monthCountLabel },
        { label: "Statements read", value: `${statementCoverage.fileCount}` },
        { label: "Latest reliable month", value: dataFreshness.latestMonthLabel || "None yet" },
      ]
    : [
        {
          label: "Net movement",
          value: `${monthSnapshot.net >= 0 ? "+" : "-"}${formatCurrency(Math.abs(monthSnapshot.net))}`,
        },
        { label: "Real income", value: formatCurrency(monthSnapshot.income) },
        { label: "Real spending", value: formatCurrency(monthSnapshot.spending) },
      ];
  const topCategory = topCategories[0] || null;
  const transferSummary = getTransferSummary(transactions);
  const homeConfidence = !dataFreshness.hasData
    ? {
        label: "Set up",
        tone: "neutral",
        headline: "Money Hub needs a statement first",
        body: "Upload one statement and Money Hub can start turning raw transactions into a useful read.",
      }
    : dataFreshness.needsUpload
    ? {
        label: "Needs update",
        tone: "warn",
        headline: `Last reliable month is ${dataFreshness.latestMonthLabel}`,
        body: "The app can still analyse the history it has, but the newest statement will make today's read sharper.",
      }
    : monthSnapshot.net < -500
    ? {
        label: "Attention",
        tone: "bad",
        headline: `${monthSnapshot.monthName} needs attention`,
        body: "Spending is running materially ahead of income in the visible statement data.",
      }
    : monthSnapshot.net < 0
    ? {
        label: "Watch",
        tone: "warn",
        headline: `${monthSnapshot.monthName} is slightly behind`,
        body: "You are behind for the visible month, but this may be normal if income lands later than bills.",
      }
    : statementCoverage.monthCount < 3
    ? {
        label: "Learning",
        tone: "neutral",
        headline: `${statementCoverage.monthCountLabel} is enough for a first read`,
        body: "Useful, but still young. Three months makes recurring bills and salary rhythm much more trustworthy.",
      }
    : {
        label: "Healthy",
        tone: "good",
        headline: `${statementCoverage.monthCountLabel} gives the app a proper base`,
        body: "The app has enough statement history to give this page a proper read.",
      };
  const moneyStoryCards = [
    {
      label: "Main read",
      headline: monthSnapshot.net >= 0
        ? `${formatCurrency(monthSnapshot.net)} ahead in ${monthSnapshot.monthName}`
        : `${formatCurrency(Math.abs(monthSnapshot.net))} behind in ${monthSnapshot.monthName}`,
      body: monthSnapshot.net >= 0
        ? `${formatCurrency(monthSnapshot.income)} came in against ${formatCurrency(monthSnapshot.spending)} going out.`
        : `${formatCurrency(monthSnapshot.spending)} went out against ${formatCurrency(monthSnapshot.income)} coming in.`,
      ctaLabel: "Ask AI why",
      onClick: () =>
        onGoToCoach(
          `Explain my ${monthSnapshot.monthName} money read. Income is ${formatCurrency(monthSnapshot.income)}, spending is ${formatCurrency(monthSnapshot.spending)}, net is ${formatCurrency(monthSnapshot.net)}, and transfers detected are ${transferSummary.transfers.length}. Tell me what is driving it.`,
          { autoSend: true }
        ),
    },
    {
      label: "Confidence",
      headline: homeConfidence.headline,
      body: homeConfidence.body,
      ctaLabel: dataFreshness.needsUpload ? "What should I upload?" : "Check my data",
      onClick: () =>
        onGoToCoach(
          dataFreshness.needsUpload
            ? "Tell me exactly what statement I should upload next so the Today page becomes accurate."
            : "Check whether my Money Hub data looks reliable. Focus on transfers, income, missing accounts, and stale statements.",
          { autoSend: true }
        ),
    },
    {
      label: topCategory ? "Biggest pressure" : "Spending pattern",
      headline: topCategory ? `${topCategory.category} is the loudest category` : "No spending pressure found yet",
      body: topCategory
        ? `${formatCurrency(topCategory.total)} is the biggest visible pressure point this month.`
        : "Once statement history is loaded, this becomes the first place to spot leaks, bills, and repeated habits.",
      ctaLabel: topCategory ? "Ask AI what to do" : "Upload data",
      onClick: () =>
        topCategory
          ? onGoToCoach(`Look at my ${topCategory.category} spending and tell me whether it is normal, risky, or worth cutting.`, { autoSend: true })
          : onNavigate("upload"),
    },
  ];

  const primaryActionCards = dataFreshness.needsUpload
    ? [refreshActionCard, statementHistoryCard, subscriptionSummary.count > 0 ? subscriptionActionCard : aiSetupCard].filter(Boolean)
    : actionCards.slice(0, 2);

  const milestoneCards = [
    {
      label: "After 1 statement",
      headline: "Money Hub gets its first real read",
      body: "Categories, the calendar, and AI stop being blank guesses and start reading your real transactions.",
      ctaLabel: dataFreshness.hasData ? "Upload another month" : "Upload your first statement",
      onClick: () => onNavigate("upload"),
    },
    {
      label: "After 3 months",
      headline: "Recurring bills and subscriptions get much sharper",
      body: "Salary rhythm, regular bills, and repeated merchants become believable enough to act on.",
      ctaLabel: "Why 3 months?",
      onClick: () =>
        onGoToCoach(
          "Explain why 3 months of statements makes recurring bills, salary rhythm, and subscriptions more accurate in Money Hub.",
          { autoSend: true }
        ),
    },
    {
      label: "After 6 months",
      headline: "Trends and AI advice start feeling grounded",
      body: "Month-vs-month changes, unusual spending, and next-step suggestions become much more trustworthy.",
      ctaLabel: "Ask AI what improves",
      onClick: () =>
        onGoToCoach(
          "Explain what gets smarter after 6 months of uploaded statements in Money Hub and why that matters.",
          { autoSend: true }
        ),
    },
  ];
  const refreshEducationCards = dataFreshness.hasData
    ? [
        {
          label: "Keep it current",
          headline: `Latest useful month is ${dataFreshness.latestMonthLabel}`,
          body: "You already have statement history. Upload only the newest missing statement so Today can stop talking from old data.",
          ctaLabel: "Upload latest",
          onClick: () => onNavigate("upload"),
        },
        {
          label: "What improves",
          headline: "Fresh data beats more old data",
          body: "The next useful step is the latest month, not starting again. That sharpens Today, Goals, Calendar, and AI advice.",
          ctaLabel: "Ask what to upload",
          onClick: () =>
            onGoToCoach(
              "I already have statements uploaded. Tell me the single most useful next statement to upload and why.",
              { autoSend: true }
            ),
        },
      ]
    : milestoneCards;

  return (
    <>
      <section style={styles.balanceCard}>
        <div style={styles.balanceTopRow}>
          <p style={styles.smallWhite}>{monthSnapshot.isCurrent ? "This month" : monthSnapshot.monthName}</p>
          <button
            type="button"
            style={getHomeStatusPillStyle(homeConfidence.tone)}
            onClick={() =>
              onGoToCoach(
                `Explain my home screen status: ${homeConfidence.label}. ${homeConfidence.headline}. Use my statement data and tell me what it means in plain English.`,
                { autoSend: true }
              )
            }
          >
            {homeConfidence.label}
          </button>
        </div>

        <h1 style={getBigMoneyStyle(screenWidth, styles)}>{cashSummary.primaryDisplay}</h1>
        <p style={styles.balanceSubcopy}>
          {monthSnapshot.net < 0
            ? `You are ${formatCurrency(Math.abs(monthSnapshot.net))} behind this month.`
            : `You are ${formatCurrency(monthSnapshot.net)} ahead this month.`}
        </p>

        {goalNudge ? (
          <button
            type="button"
            style={getGoalNudgeStyle(screenWidth)}
            onClick={() => onNavigate("goals")}
          >
            <span style={{ fontSize: 11, fontWeight: 900, opacity: 0.78, textTransform: "uppercase" }}>
              Goal move today
            </span>
            <strong>{goalNudge.headline}</strong>
            <span style={{ opacity: 0.86 }}>{goalNudge.detail}</span>
          </button>
        ) : null}

        <div style={styles.balancePills}>
          {homeHeroPills.map((pill) => (
            <StatPill key={pill.label} label={pill.label} value={pill.value} styles={styles} />
          ))}
        </div>
      </section>

      <Section
        title="Money Hub Read"
        styles={styles}
        right={
          <button
            style={styles.ghostBtn}
            type="button"
            onClick={() =>
              onGoToCoach(
                "Give me the clearest possible read of my uploaded statement data. Explain the headline number, confidence level, transfer handling, and what I should do next.",
                { autoSend: true }
              )
            }
          >
            Full AI read
          </button>
        }
      >
        <div style={styles.compactInsightGrid}>
          {moneyStoryCards.slice(0, 2).map((card) => (
            <InsightCard
              key={card.label}
              label={card.label}
              headline={card.headline}
              body={card.body}
              ctaLabel={card.ctaLabel}
              onClick={card.onClick}
              styles={styles}
            />
          ))}
          <InsightCard
            label="Intelligence"
            headline={intelligenceSummary.headline}
            body={intelligenceSummary.nextBestMove}
            ctaLabel="Ask how to improve it"
            onClick={() =>
              onGoToCoach(
                `My Money Hub intelligence score is ${intelligenceSummary.score}/100. Explain the biggest gaps and the quickest way to improve it.`,
                { autoSend: true }
              )
            }
            styles={styles}
          />
        </div>
      </Section>

      <Section title={subscriptionStatus?.isPremium ? "Premium Setup" : "Premium Unlocks"} styles={styles}>
        <div style={styles.compactInsightGrid}>
          <InsightCard
            label={subscriptionStatus?.label || "Free"}
            headline={bankFeedReadiness.headline}
            body={bankFeedReadiness.body}
            ctaLabel={subscriptionStatus?.isPremium ? "Open settings" : "See paid benefits"}
            onClick={() => onNavigate("settings")}
            styles={styles}
          />
          <InsightCard
            label="Best monetisation"
            headline="Charge for automatic, current advice"
            body="Keep uploads free, then make live bank sync, stronger AI, debts, investments, and forecast calendar the paid reason to stay."
            ctaLabel="Ask AI for pricing"
            onClick={() =>
              onGoToCoach(
                "Design the best free vs paid plan for Money Hub. Keep the free plan useful, but make Premium compelling with live bank feeds, debt tracking, investments, calendar forecasts, and smarter AI.",
                { autoSend: true }
              )
            }
            styles={styles}
          />
        </div>
      </Section>

      <Section title={dataFreshness.needsUpload ? "Start Here" : "Next Best Moves"} styles={styles}>
        <div style={styles.compactInsightGrid}>
          {primaryActionCards.map((card) => (
            <ActionCard
              key={card.key}
              label={card.label}
              headline={card.headline}
              body={card.body}
              actionLabel={card.action}
              onClick={card.onClick}
              styles={styles}
            />
          ))}
        </div>
      </Section>

      {dataFreshness.needsUpload ? (
        <>
          <Section
            title={dataFreshness.hasData ? "Refresh Your Data" : "Why Uploading Statements Helps"}
            styles={styles}
            right={
              <button
                style={styles.ghostBtn}
                type="button"
                onClick={() => onNavigate("upload")}
              >
                Upload statement
              </button>
            }
          >
            <div style={styles.aiInsightGrid}>
              {refreshEducationCards.map((card) => (
                <InsightCard
                  key={card.label}
                  label={card.label}
                  headline={card.headline}
                  body={card.body}
                  ctaLabel={card.ctaLabel}
                  onClick={card.onClick}
                  styles={styles}
                />
              ))}
            </div>
          </Section>

          <Section title="What Money Hub Can See Right Now" styles={styles}>
            <p style={styles.sectionIntro}>
              If this page looks stale, it is because Today is designed to be about now. The app can still read your existing history, but it needs your newest statement to be sharp again.
            </p>
            <Row name="History loaded" value={statementCoverage.monthCountLabel} styles={styles} />
            <Row name="Statements imported" value={`${statementCoverage.fileCount}`} styles={styles} />
            <Row name="Visible range" value={statementCoverage.rangeLabel} styles={styles} />
            <Row name="Latest visible month" value={dataFreshness.latestMonthLabel || "None yet"} styles={styles} />
            {statementCoverage.latestStatementMonthLabel ? (
              <Row name="Latest uploaded range" value={statementCoverage.latestStatementMonthLabel} styles={styles} />
            ) : null}
            {statementCoverage.hasCoverageGap ? (
              <Row name="Needs checking" value="Visible transactions stop earlier than the latest uploaded statement range" styles={styles} />
            ) : null}
          </Section>

          {dataFreshness.hasData ? (
            <Section
              title={statementCoverage.hasCoverageGap ? "Latest Visible Month" : "Latest Useful Month"}
              styles={styles}
              right={
                <button
                  style={styles.ghostBtn}
                  type="button"
                  onClick={() => onNavigate("calendar")}
                >
                  Open calendar
                </button>
              }
            >
              <p style={styles.smallMuted}>
                {statementCoverage.hasCoverageGap
                  ? "This is the latest month the saved transactions can actually prove right now."
                  : "Until you upload the newest statement, this is the last month the app can still talk about with confidence."}
              </p>
              <Row name="Period" value={monthSnapshot.monthName} styles={styles} />
              <Row name="Money in" value={formatCurrency(monthSnapshot.income)} styles={styles} />
              <Row name="Money out" value={formatCurrency(monthSnapshot.spending)} styles={styles} />
              <Row name="Biggest spend" value={monthSnapshot.biggestSpendLabel} styles={styles} />
              <Row name="Transactions on" value={`${monthSnapshot.activeDays} day${monthSnapshot.activeDays === 1 ? "" : "s"}`} styles={styles} />
            </Section>
          ) : (
            <Section title="What Unlocks After Your First Statement" styles={styles}>
              <Row name="Categories" value="Auto-filled from your real spending" styles={styles} />
              <Row name="Calendar" value="Built from your real transaction dates" styles={styles} />
              <Row name="AI coach" value="Grounded in your money data, not guesses" styles={styles} />
            </Section>
          )}

          {latestVisibleTransactions.length > 0 ? (
            <Section title="Latest Visible Activity" styles={styles}>
              {latestVisibleTransactions.map((transaction) => (
                <TransactionRow
                  key={transaction.id || `${transaction.transaction_date}-${transaction.description}-${transaction.amount}`}
                  name={transaction.description || "Transaction"}
                  meta={`${transaction.transaction_date || "No date"} - ${getMeaningfulCategory(transaction)}`}
                  amount={Number(transaction.amount || 0)}
                  styles={styles}
                />
              ))}
            </Section>
          ) : null}
        </>
      ) : (
        <Section
          title="This Month"
          styles={styles}
          right={
            <button
              style={styles.ghostBtn}
              type="button"
              onClick={() => onNavigate("calendar")}
            >
              Calendar
            </button>
          }
        >
          <p style={styles.smallMuted}>{dailyBrief.headline}. {trendSummary.headline}.</p>
          <Row name="Money in" value={formatCurrency(monthSnapshot.income)} styles={styles} />
          <Row name="Money out" value={formatCurrency(monthSnapshot.spending)} styles={styles} />
          <Row name="Biggest spend" value={monthSnapshot.biggestSpendLabel} styles={styles} />
        </Section>
      )}

      {subscriptionSummary.items.length > 0 ? (
        <Section
          title="Likely Subscriptions"
          styles={styles}
          right={
            <button
              style={styles.ghostBtn}
              onClick={() =>
                onGoToCoach(buildSubscriptionCoachPrompt(subscriptionSummary), { autoSend: true })
              }
            >
              Review with AI
            </button>
          }
        >
          {subscriptionSummary.items.slice(0, 3).map((item) => (
            <Row
              key={item.name}
              name={item.name}
              value={`${formatCurrency(item.total)} - ${item.count} hit${item.count === 1 ? "" : "s"}`}
              styles={styles}
            />
          ))}
        </Section>
      ) : null}

      <Section title={dataFreshness.needsUpload ? "Visible Transactions" : "Recent Transactions"} styles={styles}>
        {(dataFreshness.needsUpload ? latestVisibleTransactions : recent).length === 0 ? (
          <p style={styles.emptyText}>
            {dataFreshness.hasData
              ? "Nothing useful is visible in that latest month yet."
              : "No transactions yet. Upload your first statement to unlock this."}
          </p>
        ) : (
          (dataFreshness.needsUpload ? latestVisibleTransactions : recent).map((transaction) => (
            <TransactionRow
              key={transaction.id || `${transaction.transaction_date}-${transaction.description}-${transaction.amount}`}
              name={transaction.description || "Transaction"}
              meta={`${transaction.transaction_date || "No date"} - ${getMeaningfulCategory(transaction)}`}
              amount={Number(transaction.amount || 0)}
              styles={styles}
            />
          ))
        )}
      </Section>

      <Section title={dataFreshness.needsUpload ? "Ask AI About Your Setup" : "Ask AI Next"} styles={styles}>
        <div style={styles.actionChipWrap}>
          {coachPrompts.map((prompt) => (
            <button
              key={prompt}
              style={styles.actionChip}
              onClick={() => onGoToCoach(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}

function Section({ title, children, right, sectionStyle, styles }) {
  return <BaseSection title={title} right={right} sectionStyle={sectionStyle} styles={styles}>{children}</BaseSection>;
}

function Row({ name, value, styles }) {
  return <BaseRow name={name} value={value} styles={styles} />;
}

function InsightCard({ label, headline, body, onClick, ctaLabel, styles }) {
  return <BaseInsightCard label={label} headline={headline} body={body} onClick={onClick} ctaLabel={ctaLabel} styles={styles} />;
}

function ActionCard({ label, headline, body, actionLabel, onClick, styles }) {
  return <BaseActionCard label={label} headline={headline} body={body} actionLabel={actionLabel} onClick={onClick} styles={styles} />;
}

function TransactionRow({ name, meta, amount, styles }) {
  return (
    <div style={styles.transactionRow}>
      <div style={styles.transactionCopy}>
        <strong>{name}</strong>
        <p style={styles.transactionMeta}>{meta}</p>
      </div>

      <strong style={{ color: amount >= 0 ? "#059669" : "#dc2626" }}>
        {amount >= 0 ? "+" : "-"}£{Math.abs(amount).toFixed(2)}
      </strong>
    </div>
  );
}

function StatPill({ label, value, styles }) {
  return (
    <div style={styles.statPill}>
      <span style={styles.statPillLabel}>{label}</span>
      <strong style={styles.statPillValue}>{value}</strong>
    </div>
  );
}

function getBigMoneyStyle(screenWidth, styles) {
  return {
    ...styles.bigMoney,
    fontSize: screenWidth <= 480 ? "36px" : screenWidth <= 768 ? "42px" : "46px",
  };
}

function getPrimaryGoal(goals = []) {
  const datedGoals = goals
    .filter((goal) => goal.target_date)
    .sort((a, b) => new Date(a.target_date) - new Date(b.target_date));
  return datedGoals[0] || goals[0] || null;
}

function buildGoalNudge({ goal, transactions, monthSnapshot, cashSummary, formatCurrency, isInternalTransferLike }) {
  const target = Number(goal?.target_amount || 0);
  const current = Number(goal?.current_amount || 0);
  const gap = Math.max(target - current, 0);
  if (!goal || gap <= 0) {
    return {
      headline: "Protect the win",
      detail: `${goal?.name || "Your goal"} is already funded. Keep today steady.`,
    };
  }

  const targetMonths = getMonthsUntil(goal.target_date);
  const monthlyNeeded = targetMonths ? gap / targetMonths : 0;
  const monthlyPattern = getMonthlyGoalPattern(transactions, isInternalTransferLike);
  const todaySpend = getTodayFlexibleSpend(transactions, isInternalTransferLike);
  const latestNet = Number(monthSnapshot?.net || 0);
  const liveCash = cashSummary?.hasLiveBalances ? Number(cashSummary.amount || 0) : null;
  const monthlyAfterGoal = monthlyPattern.income - monthlyPattern.fixedBills - monthlyPattern.flexibleSpend - monthlyNeeded;
  const baseDailyCap = targetMonths
    ? Math.max(monthlyAfterGoal / 30, 0)
    : Math.max(monthlyPattern.flexibleSpend / 30 * 0.35, 0);
  const dailyCap = Math.min(baseDailyCap, 20);

  if (latestNet < 0 || (liveCash !== null && liveCash <= 25)) {
    return {
      headline: "No-spend day",
      detail: latestNet < 0
        ? `Latest read is ${formatCurrency(Math.abs(latestNet))} behind. Essentials only.`
        : `Cash looks tight. Protect ${goal.name || "your goal"} today.`,
    };
  }

  if (dailyCap <= 7 || todaySpend >= dailyCap) {
    return {
      headline: "No-spend day",
      detail: todaySpend >= dailyCap && dailyCap > 0
        ? `${formatCurrency(todaySpend)} already spent. Stop there if you can.`
        : goal.target_date
        ? `${goal.name || "This goal"} needs ${formatCurrency(monthlyNeeded)} a month. Today needs to be tight.`
        : `Best move for ${goal.name || "your goal"} is keeping today clean.`,
    };
  }

  return {
    headline: `Stay under ${formatCurrency(dailyCap)} today`,
    detail: todaySpend > 0
      ? `${formatCurrency(todaySpend)} spent so far. ${goal.name || "Your goal"} needs focus.`
      : goal.target_date
      ? `To take ${goal.name || "your goal"} seriously by ${formatGoalMonth(goal.target_date)}.`
      : `Small day, faster progress on ${goal.name || "your goal"}.`,
  };
}

function getMonthlyGoalPattern(transactions, isInternalTransferLike) {
  const latestDate = transactions
    .map((transaction) => new Date(transaction.transaction_date))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a)[0] || new Date();
  const start = new Date(latestDate.getFullYear(), latestDate.getMonth() - 2, 1);
  const clean = transactions.filter((transaction) => {
    const date = new Date(transaction.transaction_date);
    return !Number.isNaN(date.getTime()) && date >= start && date <= latestDate && !isInternalTransferLike(transaction);
  });
  const monthCount = Math.max(new Set(clean.map((transaction) => {
    const date = new Date(transaction.transaction_date);
    return `${date.getFullYear()}-${date.getMonth()}`;
  })).size, 1);

  return {
    income: clean.filter((transaction) => Number(transaction.amount) > 0).reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0) / monthCount,
    fixedBills: clean.filter((transaction) => Number(transaction.amount) < 0 && isBillLike(transaction)).reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0) / monthCount,
    flexibleSpend: clean.filter((transaction) => Number(transaction.amount) < 0 && !isBillLike(transaction)).reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0) / monthCount,
  };
}

function getTodayFlexibleSpend(transactions, isInternalTransferLike) {
  const todayKey = new Date().toISOString().slice(0, 10);
  return transactions
    .filter((transaction) => String(transaction.transaction_date || "").slice(0, 10) === todayKey)
    .filter((transaction) => Number(transaction.amount) < 0 && !isInternalTransferLike(transaction) && !isBillLike(transaction))
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
}

function isBillLike(transaction) {
  return Boolean(transaction?._smart_is_bill || transaction?.is_bill || transaction?._smart_is_subscription || transaction?.is_subscription);
}

function getMonthsUntil(dateString) {
  if (!dateString) return null;
  const target = new Date(dateString);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  const monthDiff = (target.getFullYear() - today.getFullYear()) * 12 + target.getMonth() - today.getMonth();
  return Math.max(monthDiff + 1, 1);
}

function formatGoalMonth(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "your date";
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function getGoalNudgeStyle(screenWidth) {
  return {
    width: "100%",
    marginTop: 18,
    border: "1px solid rgba(255,255,255,0.28)",
    background: "rgba(255,255,255,0.16)",
    color: "white",
    borderRadius: 18,
    padding: screenWidth <= 520 ? "12px 14px" : "14px 18px",
    display: "flex",
    flexDirection: screenWidth <= 520 ? "column" : "row",
    alignItems: screenWidth <= 520 ? "flex-start" : "center",
    justifyContent: "space-between",
    gap: 8,
    textAlign: "left",
    boxShadow: "0 16px 38px rgba(15, 23, 42, 0.18)",
    cursor: "pointer",
  };
}
