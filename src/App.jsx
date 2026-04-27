import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { supabase } from "./supabase";
import {
  ActionCard as BaseActionCard,
  InsightCard as BaseInsightCard,
  MiniCard as BaseMiniCard,
  Row as BaseRow,
  Section as BaseSection,
} from "./components/ui";
import { buildUploadGuidance } from "./lib/uploadGuidance";
import GoalsPage from "./pages/GoalsPage";

const PAGE_TITLES = {
  today: "Today",
  upload: "Upload",
  debts: "Debts",
  investments: "Investments",
  accounts: "Accounts",
  calendar: "Calendar",
  goals: "Goals",
  receipts: "Receipts",
  coach: "AI Coach",
  settings: "Settings",
};

const COACH_DISPLAY_LIMIT = 18;
const COACH_DRAFT_KEY = "moneyhub-coach-draft";
const COACH_AUTOSEND_KEY = "moneyhub-coach-autosend";
const COACH_FRESH_CUTOFF_KEY = "moneyhub-coach-fresh-cutoff";
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [page, setPage] = useState("today");

  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [goals, setGoals] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [aiMessages, setAiMessages] = useState([]);
  const [debts, setDebts] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [statementImports, setStatementImports] = useState([]);
  const [viewerAccess, setViewerAccess] = useState([]);
  const [financialDocuments, setFinancialDocuments] = useState([]);
  const [viewerMode, setViewerMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("moneyhub-viewer-preview") === "true";
  });

  const [screenWidth, setScreenWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth
  );
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? 900 : window.innerHeight
  );

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setLoading(false);
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadAllData();
    // loadAllData intentionally fans out to the current page loaders whenever auth changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    function handleResize() {
      setScreenWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("moneyhub-viewer-preview", viewerMode ? "true" : "false");
  }, [viewerMode]);

  async function loadAllData() {
    await Promise.all([
      loadTransactions(),
      loadAccounts(),
      loadGoals(),
      loadReceipts(),
      loadAiMessages(),
      loadDebts(),
      loadInvestments(),
      loadStatementImports(),
      loadViewerAccess(),
      loadFinancialDocuments(),
    ]);
  }

  async function loadTransactions() {
    const { data, error } = await supabase
      .from("transactions")
      .select("*, accounts(name, institution)")
      .order("transaction_date", { ascending: false });

    if (!error) setTransactions(data || []);
  }

  async function loadAccounts() {
    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .order("created_at", { ascending: true });

    if (!error) setAccounts(data || []);
  }

  async function loadGoals() {
    const { data, error } = await supabase
      .from("money_goals")
      .select("*")
      .order("priority", { ascending: true });

    if (!error) setGoals(data || []);
  }

  async function loadReceipts() {
    const { data, error } = await supabase
      .from("receipts")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error) setReceipts(data || []);
  }

  async function loadAiMessages() {
    const { data, error } = await supabase
      .from("ai_messages")
      .select("*")
      .order("created_at", { ascending: true });

    if (!error) setAiMessages(data || []);
  }

  async function loadDebts() {
    const { data, error } = await supabase
      .from("debts")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error) setDebts(data || []);
  }

  async function loadInvestments() {
    const { data, error } = await supabase
      .from("investments")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error) setInvestments(data || []);
  }

  async function loadStatementImports() {
    const { data, error } = await supabase
      .from("statement_imports")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error) setStatementImports(data || []);
  }

  async function loadViewerAccess() {
    const { data, error } = await supabase
      .from("viewer_access")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setViewerAccess([]);
      return;
    }

    setViewerAccess(data || []);
  }

  async function loadFinancialDocuments() {
    const { data, error } = await supabase
      .from("financial_documents")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setFinancialDocuments([]);
      return;
    }

    setFinancialDocuments(data || []);
  }

  function openCoachWithPrompt(prompt, options = {}) {
    if (typeof window !== "undefined") {
      localStorage.setItem(COACH_DRAFT_KEY, prompt);
      if (options.autoSend) {
        localStorage.setItem(COACH_AUTOSEND_KEY, "true");
      } else {
        localStorage.removeItem(COACH_AUTOSEND_KEY);
      }
    }
    setPage("coach");
  }

  const smartTransactions = useMemo(
    () => enhanceTransactions(transactions),
    [transactions]
  );

  const debtSignals = getDebtSignals(smartTransactions);
  const investmentSignals = getInvestmentSignals(smartTransactions);
  const trendSummary = getTrendSummary(smartTransactions);

  if (loading) return <div style={styles.loading}>Loading Money Hub...</div>;
  if (!session) return <AuthPage screenWidth={screenWidth} />;

  return (
    <div style={styles.app}>
      <TopBar
        email={session.user.email}
        title={PAGE_TITLES[page] || "Money Hub"}
        page={page}
        screenWidth={screenWidth}
      />

      <main style={getMainStyle(screenWidth, page)}>
        {page === "today" && (
          <TodayPage
            transactions={smartTransactions}
            accounts={accounts}
            goals={goals}
            debts={debts}
            investments={investments}
            debtSignals={debtSignals}
            investmentSignals={investmentSignals}
            trendSummary={trendSummary}
            statementImports={statementImports}
            onGoToCoach={openCoachWithPrompt}
            onNavigate={setPage}
            screenWidth={screenWidth}
          />
        )}

        {page === "upload" && (
          <UploadPage
            accounts={accounts}
            statementImports={statementImports}
            existingTransactions={smartTransactions}
            onImportDone={loadAllData}
            onGoToCoach={openCoachWithPrompt}
            screenWidth={screenWidth}
          />
        )}

        {page === "debts" && (
          <DebtsPage
            debts={debts}
            debtSignals={debtSignals}
            transactions={smartTransactions}
            documents={financialDocuments.filter((doc) => doc.record_type === "debt")}
            onChange={loadDebts}
            onDocumentsChange={loadFinancialDocuments}
            trendSummary={trendSummary}
            viewerMode={viewerMode}
          />
        )}

        {page === "investments" && (
          <InvestmentsPage
            investments={investments}
            investmentSignals={investmentSignals}
            transactions={smartTransactions}
            documents={financialDocuments.filter((doc) => doc.record_type === "investment")}
            onChange={loadInvestments}
            onDocumentsChange={loadFinancialDocuments}
            viewerMode={viewerMode}
          />
        )}

        {page === "accounts" && (
          <AccountsPage accounts={accounts} transactions={smartTransactions} />
        )}

        {page === "calendar" && (
          <CalendarPage transactions={smartTransactions} screenWidth={screenWidth} />
        )}

        {page === "goals" && (
          <GoalsPage
            goals={goals}
            transactions={smartTransactions}
            onGoToCoach={openCoachWithPrompt}
            onNavigate={setPage}
            onChange={loadGoals}
            styles={styles}
            helpers={{
              getDataFreshness,
              getDisplayedMonthSnapshot,
              getSubscriptionSummary,
              isInternalTransferLike,
              isTransactionInMonth,
              formatCurrency,
              numberOrNull,
            }}
          />
        )}

        {page === "receipts" && (
          <ReceiptsPage
            receipts={receipts}
            transactions={smartTransactions}
            onChange={loadReceipts}
            onGoToCoach={openCoachWithPrompt}
          />
        )}

        {page === "coach" && (
          <CoachPage
            transactions={smartTransactions}
            goals={goals}
            debts={debts}
            investments={investments}
            debtSignals={debtSignals}
            investmentSignals={investmentSignals}
            aiMessages={aiMessages}
            onChange={loadAiMessages}
            screenWidth={screenWidth}
            viewportHeight={viewportHeight}
          />
        )}

        {page === "settings" && (
          <SettingsPage
            viewerAccess={viewerAccess}
            onViewerChange={loadViewerAccess}
            viewerMode={viewerMode}
            setViewerMode={setViewerMode}
            financialDocuments={financialDocuments}
          />
        )}
      </main>

      <BottomNav page={page} setPage={setPage} screenWidth={screenWidth} />
    </div>
  );
}

function AuthPage({ screenWidth }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function login() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) alert(error.message);
  }

  async function signup() {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    alert("Account created. You can now log in.");
  }

  return (
    <div style={styles.authWrap}>
      <section style={getHeroCardStyle(screenWidth)}>
        <div style={styles.authBadgeRow}>
          <span style={styles.authBadge}>Money Hub</span>
          <span style={styles.authMuted}>Budget Builder</span>
        </div>

        <h1 style={getHeroTitleStyle(screenWidth)}>Money that builds itself.</h1>
        <p style={styles.subText}>
          Upload statements, let the app do the hard bit, and get a cleaner
          money setup without spreadsheet energy.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            login();
          }}
        >
          <input
            style={styles.input}
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />

          <input
            style={styles.input}
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          <button style={styles.primaryBtn} type="submit">
            Login
          </button>
        </form>

        <button style={styles.secondaryBtn} onClick={signup} type="button">
          Create Account
        </button>
      </section>
    </div>
  );
}

function TopBar({ email, title, page, screenWidth }) {
  async function logout() {
    await supabase.auth.signOut();
  }

  return (
    <header style={getTopBarStyle(screenWidth)}>
      <div style={styles.topBarText}>
        <p style={styles.kicker}>Money Hub</p>
        <h2 style={getTopTitleStyle(screenWidth)}>{title}</h2>
        <p style={styles.topEmail}>
          {page === "coach"
            ? "Ask, sanity-check, plan and reset"
            : page === "debts"
            ? "Debt tracking from imported statements"
            : page === "investments"
            ? "Investing activity detected automatically"
            : page === "calendar"
            ? "Recurring money events, properly visualised"
            : email}
        </p>
      </div>

      <button style={styles.logoutBtn} onClick={logout}>
        Logout
      </button>
    </header>
  );
}

function TodayPage({
  transactions,
  accounts,
  goals,
  debts,
  investments,
  debtSignals,
  investmentSignals,
  trendSummary,
  statementImports,
  onGoToCoach,
  onNavigate,
  screenWidth,
}) {
  const totals = useMemo(() => getTotals(transactions), [transactions]);
  const topCategories = useMemo(() => getTopCategories(transactions), [transactions]);
  const dataFreshness = useMemo(() => getDataFreshness(transactions), [transactions]);
  const statementCoverage = useMemo(
    () => getStatementCoverageSummary(transactions, statementImports),
    [transactions, statementImports]
  );
  const monthSnapshot = useMemo(() => getDisplayedMonthSnapshot(transactions), [transactions]);
  const cashSummary = useMemo(() => getCashSummary(accounts, transactions), [accounts, transactions]);
  const subscriptionSummary = useMemo(() => getSubscriptionSummary(transactions), [transactions]);

  const recent = transactions.slice(0, 6);
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

  const houseGoal =
    goals.find((goal) =>
      String(goal.name || "").toLowerCase().includes("house")
    ) || null;

  const goalTarget = Number(houseGoal?.target_amount || 15000);
  const goalCurrent = Number(houseGoal?.current_amount || 0);
  const goalPercent = goalTarget
    ? Math.min((goalCurrent / goalTarget) * 100, 100)
    : 0;

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
    houseGoal,
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
          ? `${unlinkedInvestmentSignals.length} investing stream${unlinkedInvestmentSignals.length === 1 ? "" : "s"} to confirm`
          : "No investment setup yet",
      body:
        investments.length > 0
          ? investmentStatusSummary.body
          : unlinkedInvestmentSignals.length > 0
          ? "Tap through and confirm those broker or crypto contributions so the app can track them properly."
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
        { label: "History", value: statementCoverage.monthCountLabel },
        { label: "Statements", value: `${statementCoverage.fileCount}` },
        { label: "Latest visible", value: dataFreshness.latestMonthLabel || "None yet" },
      ]
    : [
        {
          label: monthSnapshot.pillLabel,
          value: `${monthSnapshot.net >= 0 ? "+" : "-"}${formatCurrency(Math.abs(monthSnapshot.net))}`,
        },
        { label: "Subscriptions", value: `${subscriptionSummary.count}` },
        { label: "History", value: statementCoverage.monthCountLabel },
      ];

  const primaryActionCards = dataFreshness.needsUpload
    ? [refreshActionCard, statementHistoryCard, subscriptionSummary.count > 0 ? subscriptionActionCard : aiSetupCard].filter(Boolean)
    : actionCards.slice(0, 3);

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

  return (
    <>
      <section style={styles.balanceCard}>
        <div style={styles.balanceTopRow}>
          <p style={styles.smallWhite}>{cashSummary.label}</p>
          <span style={styles.pulseTag}>{cashSummary.badge}</span>
        </div>

        <h1 style={getBigMoneyStyle(screenWidth)}>{cashSummary.primaryDisplay}</h1>
        <p style={styles.balanceSubcopy}>{cashSummary.body}</p>

        <div style={styles.balancePills}>
          {homeHeroPills.map((pill) => (
            <StatPill key={pill.label} label={pill.label} value={pill.value} />
          ))}
        </div>
      </section>

      <Section title={dataFreshness.needsUpload ? "Start Here" : "Do This Next"}>
        <div style={styles.aiInsightGrid}>
          {primaryActionCards.map((card) => (
            <ActionCard
              key={card.key}
              label={card.label}
              headline={card.headline}
              body={card.body}
              actionLabel={card.action}
              onClick={card.onClick}
            />
          ))}
        </div>
      </Section>

      {dataFreshness.needsUpload ? (
        <>
          <Section
            title="Why Uploading More Statements Helps"
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
              {milestoneCards.map((card) => (
                <InsightCard
                  key={card.label}
                  label={card.label}
                  headline={card.headline}
                  body={card.body}
                  ctaLabel={card.ctaLabel}
                  onClick={card.onClick}
                />
              ))}
            </div>
          </Section>

          <Section title="What Money Hub Can See Right Now">
            <p style={styles.sectionIntro}>
              If this page looks stale, it is because Today is designed to be about now. The app can still read your existing history, but it needs your newest statement to be sharp again.
            </p>
            <Row name="History loaded" value={statementCoverage.monthCountLabel} />
            <Row name="Statements imported" value={`${statementCoverage.fileCount}`} />
            <Row name="Visible range" value={statementCoverage.rangeLabel} />
            <Row name="Latest visible month" value={dataFreshness.latestMonthLabel || "None yet"} />
            {statementCoverage.latestStatementMonthLabel ? (
              <Row name="Latest uploaded range" value={statementCoverage.latestStatementMonthLabel} />
            ) : null}
            {statementCoverage.hasCoverageGap ? (
              <Row name="Needs checking" value="Visible transactions stop earlier than the latest uploaded statement range" />
            ) : null}
          </Section>

          {dataFreshness.hasData ? (
            <Section
              title={statementCoverage.hasCoverageGap ? "Latest Visible Month" : "Latest Useful Month"}
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
              <Row name="Period" value={monthSnapshot.monthName} />
              <Row name="Money in" value={formatCurrency(monthSnapshot.income)} />
              <Row name="Money out" value={formatCurrency(monthSnapshot.spending)} />
              <Row name="Biggest spend" value={monthSnapshot.biggestSpendLabel} />
              <Row name="Transactions on" value={`${monthSnapshot.activeDays} day${monthSnapshot.activeDays === 1 ? "" : "s"}`} />
            </Section>
          ) : (
            <Section title="What Unlocks After Your First Statement">
              <Row name="Categories" value="Auto-filled from your real spending" />
              <Row name="Calendar" value="Built from your real transaction dates" />
              <Row name="AI coach" value="Grounded in your money data, not guesses" />
            </Section>
          )}

          {latestVisibleTransactions.length > 0 ? (
            <Section title="Latest Visible Activity">
              {latestVisibleTransactions.map((transaction) => (
                <TransactionRow
                  key={transaction.id || `${transaction.transaction_date}-${transaction.description}-${transaction.amount}`}
                  name={transaction.description || "Transaction"}
                  meta={`${transaction.transaction_date || "No date"} - ${getMeaningfulCategory(transaction)}`}
                  amount={Number(transaction.amount || 0)}
                />
              ))}
            </Section>
          ) : null}
        </>
      ) : (
        <>
          <Section title="Quick Read">
            <div style={styles.aiInsightGrid}>
              <InsightCard
                label="Today"
                headline={dailyBrief.headline}
                body={dailyBrief.body}
                ctaLabel="Ask AI about this"
                onClick={() => onGoToCoach(`Use my current money data and explain this: ${dailyBrief.headline}`)}
              />
              <InsightCard
                label="Trend"
                headline={trendSummary.headline}
                body={trendSummary.body}
                ctaLabel="Why?"
                onClick={() => onGoToCoach("Explain what changed in my recent spending trend and what is driving it.")}
              />
              <InsightCard
                label={monthSnapshot.label}
                headline={monthSnapshot.headline}
                body={monthSnapshot.body}
                ctaLabel="Open calendar"
                onClick={() => onNavigate("calendar")}
              />
            </div>
          </Section>

          <Section title="This Month">
            <Row name="Money in" value={formatCurrency(monthSnapshot.income)} />
            <Row name="Money out" value={formatCurrency(monthSnapshot.spending)} />
            <Row name="Biggest spend" value={monthSnapshot.biggestSpendLabel} />
            <Row name="Transactions on" value={`${monthSnapshot.activeDays} day${monthSnapshot.activeDays === 1 ? "" : "s"}`} />
          </Section>
        </>
      )}

      {subscriptionSummary.items.length > 0 ? (
        <Section
          title="Likely Subscriptions"
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
          {subscriptionSummary.items.slice(0, 4).map((item) => (
            <Row
              key={item.name}
              name={item.name}
              value={`${formatCurrency(item.total)} - ${item.count} hit${item.count === 1 ? "" : "s"}`}
            />
          ))}
        </Section>
      ) : null}

      <Section title={dataFreshness.needsUpload ? "Visible Transactions" : "Recent Transactions"}>
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
            />
          ))
        )}
      </Section>

      <Section title={dataFreshness.needsUpload ? "Ask AI About Your Setup" : "Ask AI Next"}>
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

function UploadPage({
  accounts,
  statementImports,
  existingTransactions,
  onImportDone,
  onGoToCoach,
  screenWidth,
}) {
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const uploadGuidance = useMemo(
    () => buildUploadGuidance({ statementImports, existingTransactions }),
    [statementImports, existingTransactions]
  );

  function cleanAmount(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return Number.NaN;

    const isNegative =
      raw.startsWith("-") ||
      raw.endsWith("-") ||
      /^\(.*\)$/.test(raw) ||
      /\bdr\b/i.test(raw) ||
      /money out/i.test(raw);

    const cleaned = raw
      .replace(/[\\u00A3$€,]/g, "")
      .replace(/[()]/g, "")
      .replace(/\bcr\b/gi, "")
      .replace(/\bdr\b/gi, "")
      .replace(/[^0-9.-]/g, "")
      .trim();

    if (!cleaned) return Number.NaN;

    const parsed = Number(cleaned);
    if (Number.isNaN(parsed)) return Number.NaN;
    return isNegative ? -Math.abs(parsed) : parsed;
  }

  function guessAccountName(name) {
    const lower = String(name || "").toLowerCase();

    if (lower.includes("monzo")) return "Monzo Current";
    if (lower.includes("halifax")) return "Halifax";
    if (lower.includes("barclays")) return "Barclays";
    if (lower.includes("lloyds")) return "Lloyds";
    if (lower.includes("santander")) return "Santander";
    if (lower.includes("natwest")) return "NatWest";
    if (lower.includes("revolut")) return "Revolut";
    if (lower.includes("starling")) return "Starling";
    if (lower.includes("savings")) return "Savings Account";

    return "";
  }

  function guessInstitution(name) {
    const guessed = guessAccountName(name);
    return guessed ? guessed.split(" ")[0] : "Imported";
  }

  function makeDuplicateKey(row, accountId) {
    return `${accountId}-${row.date}-${row.description}-${row.amount}`
      .toLowerCase()
      .replace(/\s+/g, "-");
  }

  function normalizeDescription(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function getFirstRowValue(row, ...keys) {
    for (const key of keys) {
      if (!key) continue;
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return value;
      }
    }

    return "";
  }

  function detectHeaderRowIndex(chunk) {
    const lines = chunk.split(/\r?\n/);

    return lines.findIndex((line) => {
      const lower = line.toLowerCase();
      return (
        lower.includes("date") &&
        (lower.includes("description") || lower.includes("merchant") || lower.includes("payee")) &&
        (lower.includes("amount") || lower.includes("money in") || lower.includes("money out"))
      );
    });
  }

  async function requestCsvMapping(headers, sampleRows) {
    try {
      const { data, error } = await supabase.functions.invoke("swift-worker", {
        body: { headers, sampleRows },
      });

      if (error) {
        console.error("AI mapping failed:", error);
        return null;
      }

      return data || null;
    } catch (error) {
      console.error("AI mapping request failed:", error);
      return null;
    }
  }

  function resolveImportedAmount(row, mapping) {
    const signedAmount = getFirstRowValue(
      row,
      mapping?.amount,
      "Amount",
      "amount",
      "Transaction Amount"
    );

    if (signedAmount !== "") {
      return cleanAmount(signedAmount);
    }

    const moneyIn = getFirstRowValue(
      row,
      mapping?.money_in,
      "Money In",
      "money_in",
      "Credit",
      "Paid In"
    );
    const moneyOut = getFirstRowValue(
      row,
      mapping?.money_out,
      "Money Out",
      "money_out",
      "Debit",
      "Paid Out"
    );

    if (moneyIn !== "") {
      return Math.abs(cleanAmount(moneyIn));
    }

    if (moneyOut !== "") {
      return -Math.abs(cleanAmount(moneyOut));
    }

    return Number.NaN;
  }

  const categoryRules = [
    { category: "Income", test: ({ text, amount }) => amount > 0 && /salary|payroll|wage|paye|bonus|hmrc/.test(text) },
    { category: "Internal Transfer", test: ({ text }) => /transfer|faster payment|to savings|from savings|standing order to|between accounts/.test(text) },
    { category: "Bill", test: ({ text }) => /rent|council|electric|gas|water|mortgage|broadband|internet|virgin media|sky|bt/.test(text) },
    { category: "Subscription", test: ({ text }) => /netflix|spotify|prime|apple|google|disney|adobe|icloud|youtube premium/.test(text) },
    { category: "Groceries", test: ({ text }) => /tesco|aldi|lidl|asda|sainsbury|waitrose|morrisons|co-op/.test(text) },
    { category: "Fuel", test: ({ text }) => /shell|bp|esso|texaco/.test(text) },
    { category: "Treats", test: ({ text }) => /costa|mcdonald|kfc|greggs|starbucks/.test(text) },
    { category: "Takeaway", test: ({ text }) => /deliveroo|uber eats|just eat|domino/.test(text) },
    { category: "Shopping", test: ({ text }) => /amazon|etsy|ebay|argos/.test(text) },
    { category: "Transport", test: ({ text }) => /uber|trainline|tfl|national rail|bus|petrol station/.test(text) },
  ];

  function detectCategory(description, amount) {
    const text = normalizeDescription(description).toLowerCase();
    const matchedRule = categoryRules.find((rule) => rule.test({ text, amount }));
    if (matchedRule) return matchedRule.category;
    return amount > 0 ? "Income" : "Spending";
  }

  function summarizeMappingQuality(headers, mapping) {
    if (!headers.length) {
      return {
        label: "Fallback only",
        headline: "No header shape detected yet",
        body: "The import will rely on generic fallbacks until a usable header row is found.",
        confidence: 0.4,
      };
    }

    const matchedFields = ["date", "description", "amount", "money_in", "money_out"].filter(
      (field) => mapping?.[field] && headers.includes(mapping[field])
    );
    const coreFields = ["date", "description"].filter(
      (field) => mapping?.[field] && headers.includes(mapping[field])
    ).length;
    const amountFields = ["amount", "money_in", "money_out"].filter(
      (field) => mapping?.[field] && headers.includes(mapping[field])
    ).length;

    if (coreFields === 2 && amountFields >= 1) {
      return {
        label: "AI + fallback",
        headline: `Mapped ${matchedFields.length} useful columns cleanly`,
        body: "The file shape looks understandable, so the import should land with strong field coverage.",
        confidence: 0.9,
      };
    }

    if (coreFields >= 1 || amountFields >= 1) {
      return {
        label: "Mixed confidence",
        headline: `Some key columns mapped, some will fall back`,
        body: "The app can still import this, but a few fields are being inferred from generic bank-statement fallbacks.",
        confidence: 0.68,
      };
    }

    return {
      label: "Fallback only",
      headline: "AI mapping was weak on this file",
      body: "The import can still continue, but it is leaning on fallback header guesses rather than a confident mapping.",
      confidence: 0.45,
    };
  }

  function normalizeImportedRow(row, mapping) {
    const amount = resolveImportedAmount(row, mapping);
    const date = getFirstRowValue(
      row,
      mapping?.date,
      "Date",
      "date",
      "TransactionDate",
      "Transaction Date",
      "Posted Date"
    );
    const description = getFirstRowValue(
      row,
      mapping?.description,
      "Transaction Description",
      "Description",
      "description",
      "Payee",
      "Reference",
      "Merchant",
      "Details"
    );

    if (!date || !description || Number.isNaN(amount)) {
      return null;
    }

    const category = detectCategory(description, amount);

    return {
      date,
      description: normalizeDescription(description),
      amount,
      direction: amount >= 0 ? "in" : "out",
      category,
      is_bill: category === "Bill",
      is_subscription: category === "Subscription",
      is_internal_transfer: category === "Internal Transfer",
      is_income: category === "Income",
    };
  }

  function buildFileCard(file, rows, mappingMeta = null) {
    const guessedName = guessAccountName(file.name);
    const matchingAccount = accounts.find(
      (account) =>
        normalizeText(account.name) === normalizeText(guessedName) ||
        normalizeText(account.nickname) === normalizeText(guessedName)
    );
    const dateSummary = summariseRowsForImport(rows);
    const fingerprint = getImportFingerprint(file.name, rows);
    const duplicateImport = statementImports.find(
      (item) => item.file_fingerprint && item.file_fingerprint === fingerprint
    );
    const overlapSummary = getImportOverlapSummary(rows, existingTransactions);

    return {
      id: `${file.name}-${file.size}-${file.lastModified}`,
      file,
      fileName: file.name,
      rows,
      selectedAccountId: matchingAccount?.id || "",
      newAccountName: matchingAccount ? "" : guessedName,
      guessedAccountName: guessedName,
      importMeta: {
        ...dateSummary,
        fingerprint,
        duplicateImport,
        overlapSummary,
        mappingMeta,
      },
    };
  }

  function handleFiles(event) {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) return;

    selectedFiles.forEach((file) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        beforeFirstChunk(chunk) {
          const headerIndex = detectHeaderRowIndex(chunk);
          if (headerIndex <= 0) return chunk;

          const lines = chunk.split(/\r?\n/);
          return lines.slice(headerIndex).join("\n");
        },
        complete: async function (results) {
          const headers = Object.keys(results.data[0] || {});
          const sampleRows = results.data.slice(0, 5);
          const mapping = await requestCsvMapping(headers, sampleRows);
          const mappingMeta = summarizeMappingQuality(headers, mapping);

          const cleaned = results.data
            .map((row) => normalizeImportedRow(row, mapping))
            .filter(Boolean);

          setFiles((prev) => {
            const nextCard = buildFileCard(file, cleaned, mappingMeta);
            const withoutDuplicate = prev.filter((item) => item.id !== nextCard.id);
            return [...withoutDuplicate, nextCard].sort((a, b) => a.fileName.localeCompare(b.fileName));
          });
        },
        error(parseError) {
          console.error("CSV parse failed:", parseError);
          alert(`Could not read ${file.name}. Please check the file format and try again.`);
        },
      });
    });

    event.target.value = "";
  }

  function updateFile(id, patch) {
    setFiles((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function removeFile(id) {
    setFiles((prev) => prev.filter((item) => item.id !== id));
  }

  async function ensureAccount(userId, fileItem) {
    if (fileItem.selectedAccountId) return fileItem.selectedAccountId;

    const accountName =
      fileItem.newAccountName.trim() ||
      fileItem.guessedAccountName ||
      "Imported Account";

    const { data, error } = await supabase
      .from("accounts")
      .upsert(
        {
          user_id: userId,
          name: accountName,
          nickname: accountName,
          institution: guessInstitution(accountName),
          detection_keywords: [accountName.toLowerCase()],
        },
        { onConflict: "user_id,name" }
      )
      .select()
      .single();

    if (error) throw error;
    return data.id;
  }

  async function saveAllImports() {
    if (files.length === 0) return;

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let totalSavedFiles = 0;
      let totalRows = 0;
      let skippedFiles = 0;

      for (const fileItem of files) {
        if (!fileItem.rows.length) continue;
        if (fileItem.importMeta?.duplicateImport) {
          skippedFiles += 1;
          continue;
        }

        const accountId = await ensureAccount(user.id, fileItem);

        const { data: importRow, error: importError } = await supabase
          .from("statement_imports")
          .insert({
            user_id: user.id,
            account_id: accountId,
            file_name: fileItem.fileName,
            detected_account_name:
              fileItem.newAccountName ||
              accounts.find((a) => a.id === accountId)?.name ||
              fileItem.guessedAccountName ||
              "Imported Account",
            row_count: fileItem.rows.length,
            import_summary: `Imported ${fileItem.rows.length} rows from ${fileItem.fileName}`,
            start_date: fileItem.importMeta?.startDate || null,
            end_date: fileItem.importMeta?.endDate || null,
            detected_month_count: fileItem.importMeta?.monthCount || null,
            file_fingerprint: fileItem.importMeta?.fingerprint || null,
          })
          .select()
          .single();

        if (importError) {
          const isDuplicateImport =
            importError.code === "23505" ||
            String(importError.message || "").includes("statement_imports_user_fingerprint_idx");

          if (isDuplicateImport) {
            skippedFiles += 1;
            continue;
          }

          throw importError;
        }

        const transactionsToSave = fileItem.rows.map((row) => ({
          user_id: user.id,
          account_id: accountId,
          import_id: importRow.id,
          transaction_date: row.date,
          description: row.description,
          merchant: row.description,
          amount: row.amount,
          direction: row.direction,
          category: row.category,
          is_internal_transfer: row.is_internal_transfer,
          is_income: row.is_income,
          is_bill: row.is_bill,
          is_subscription: row.is_subscription,
          ai_confidence: getTransactionConfidence(row),
          duplicate_key: makeDuplicateKey(row, accountId),
        }));

        const { error } = await supabase
          .from("transactions")
          .upsert(transactionsToSave, {
            onConflict: "user_id,duplicate_key",
            ignoreDuplicates: true,
          });

        if (error) throw error;

        await supabase
          .from("accounts")
          .update({ last_imported_at: new Date().toISOString() })
          .eq("id", accountId);

        totalSavedFiles += 1;
        totalRows += fileItem.rows.length;
      }

      alert(
        `Imported ${totalSavedFiles} file${totalSavedFiles === 1 ? "" : "s"}, scanned ${totalRows} rows, and skipped ${skippedFiles} file${skippedFiles === 1 ? "" : "s"} that already looked imported.`
      );
      setFiles([]);
      onImportDone();
    } catch (error) {
      alert(error.message || "Import failed.");
    } finally {
      setSaving(false);
    }
  }

  const allPreviewRows = files.flatMap((item) => item.rows);
  const previewTransactions = enhanceTransactions(
    allPreviewRows.map((row, index) => ({
      id: index,
      amount: row.amount,
      category: row.category,
      transaction_date: row.date,
      description: row.description,
      is_bill: row.is_bill,
      is_subscription: row.is_subscription,
      is_internal_transfer: row.is_internal_transfer,
      is_income: row.is_income,
    })),
    []
  );
  const previewTotals = getTotals(previewTransactions);
  const previewHistory = getHistorySummary(previewTransactions);
  const previewRecurring = getRecurringSummary(previewTransactions);
  const previewTransfers = getTransferSummary(previewTransactions);

  return (
    <>
      <Section
        title="Bulk Statement Upload"
        right={
          <button
            style={styles.ghostBtn}
            type="button"
            onClick={() => onGoToCoach(uploadGuidance.aiPrompt, { autoSend: true })}
          >
            Ask AI what to upload
          </button>
        }
      >
        <p style={styles.sectionIntro}>
          Add multiple CSV statements at once. The app will now read date ranges,
          spot likely duplicate imports before saving, ignore more fake transfer income,
          and get much sharper once you have around three months of history.
        </p>

        <input
          id="statement-upload-input"
          type="file"
          accept=".csv"
          multiple
          onChange={handleFiles}
          style={styles.input}
        />
      </Section>

      <Section title="Upload Plan">
        <div style={styles.aiInsightGrid}>
          <InsightCard
            label={uploadGuidance.status}
            headline={uploadGuidance.headline}
            body={uploadGuidance.body}
            ctaLabel="Ask AI"
            onClick={() => onGoToCoach(uploadGuidance.aiPrompt, { autoSend: true })}
          />
          <ActionCard
            label="Next best upload"
            headline={uploadGuidance.nextBestUpload}
            body="This keeps setup focused so the app gets smarter without making you do needless admin."
            actionLabel="Choose CSV files"
            onClick={() => document.getElementById("statement-upload-input")?.click()}
          />
        </div>
        <div style={styles.inlineInfoBlock}>
          {uploadGuidance.checklist.map((item) => (
            <Row key={item} name="Check" value={item} />
          ))}
        </div>
      </Section>

      {files.length > 0 && (
        <>
          <div style={getGridStyle(screenWidth)}>
            <MiniCard title="Files" value={`${files.length}`} />
            <MiniCard title="Rows" value={`${allPreviewRows.length}`} />
            <MiniCard title="History read" value={previewHistory.label} />
            <MiniCard title="Recurring read" value={previewRecurring.label} />
          </div>

          <Section title="Smart Import Read">
            <div style={styles.aiInsightGrid}>
              <InsightCard
                label="Income preview"
                headline={`£${previewTotals.income.toFixed(2)} income seen`}
                body="Internal transfers are treated separately so fake income is less likely to pollute the totals."
              />
              <InsightCard
                label="History confidence"
                headline={previewHistory.headline}
                body={previewHistory.body}
              />
              <InsightCard
                label="Recurring confidence"
                headline={previewRecurring.headline}
                body={previewRecurring.body}
              />
              <InsightCard
                label="Transfer read"
                headline={previewTransfers.headline}
                body={previewTransfers.body}
              />
              <InsightCard
                label="Mapping quality"
                headline={files[0]?.importMeta?.mappingMeta?.headline || "Fallbacks are ready"}
                body={files[0]?.importMeta?.mappingMeta?.body || "If AI misses anything, the import still falls back to common bank column names."}
              />
            </div>
          </Section>

          <Section title="Files To Import">
            {files.map((item) => (
              <div key={item.id} style={styles.signalCard}>
                <div style={styles.signalHeader}>
                  <div>
                    <strong>{item.fileName}</strong>
                    <p style={styles.transactionMeta}>
                      {item.rows.length} rows · {formatDateRange(item.importMeta?.startDate, item.importMeta?.endDate)} · {item.importMeta?.fullMonthCount || item.importMeta?.monthCount || 0} full-ish month{(item.importMeta?.fullMonthCount || item.importMeta?.monthCount || 0) === 1 ? "" : "s"} read
                    </p>
                  </div>

                  <button
                    style={styles.secondaryInlineBtn}
                    onClick={() => removeFile(item.id)}
                  >
                    Remove
                  </button>
                </div>

                <select
                  style={styles.input}
                  value={item.selectedAccountId}
                  onChange={(e) =>
                    updateFile(item.id, { selectedAccountId: e.target.value })
                  }
                >
                  <option value="">Create or guess account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>

                {!item.selectedAccountId && (
                  <input
                    style={styles.input}
                    placeholder="Account name, e.g. Monzo Current"
                    value={item.newAccountName}
                    onChange={(e) =>
                      updateFile(item.id, { newAccountName: e.target.value })
                    }
                  />
                )}

                <div style={styles.statusPillRow}>
                  {item.importMeta?.duplicateImport ? (
                    <span style={getStatusPillStyle("bad")}>Already imported before</span>
                  ) : null}
                  {item.importMeta?.overlapSummary?.ratio >= 0.35 ? (
                    <span style={getStatusPillStyle("warn")}>Heavy overlap with existing data</span>
                  ) : null}
                  {(item.importMeta?.fullMonthCount || item.importMeta?.monthCount || 0) >= 3 ? (
                    <span style={getStatusPillStyle("good")}>Good history signal</span>
                  ) : (
                    <span style={getStatusPillStyle("neutral")}>Early read</span>
                  )}
                </div>

                <p style={styles.smallMuted}>
                  First few transactions: {item.rows.slice(0, 3).map((row) => row.description).join(" · ")}
                </p>
              </div>
            ))}
          </Section>

          <button
            style={styles.primaryBtn}
            onClick={saveAllImports}
            disabled={saving}
          >
            {saving ? "Importing..." : "Import All Statements"}
          </button>
        </>
      )}
    </>
  );
}

function DebtsPage({
  debts,
  debtSignals,
  transactions,
  documents,
  onChange,
  onDocumentsChange,
  trendSummary,
  viewerMode,
}) {
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [aiText, setAiText] = useState("");
  const [documentFile, setDocumentFile] = useState(null);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    lender: "",
    starting_balance: "",
    current_balance: "",
    minimum_payment: "",
    due_day: "",
    interest_rate: "",
    notes: "",
  });

  const unlinkedSignals = debtSignals.filter((signal) => !hasMatchingDebt(signal, debts));
  const totalDetectedPayments = debtSignals.reduce((sum, item) => sum + item.total, 0);
  const debtSnapshot = getDebtPortfolioSnapshot(debts, transactions);

  function fillFromSignal(signal) {
    setForm({
      name: signal.label,
      lender: signal.label,
      starting_balance: "",
      current_balance: "",
      minimum_payment: signal.average.toFixed(2),
      due_day: signal.suggestedDay ? String(signal.suggestedDay) : "",
      interest_rate: "",
      notes: `Created from imported statement signal: ${signal.label}`,
    });
  }

  async function runAiDebtParse() {
    if (!aiText.trim()) return;

    setAiBusy(true);
    setAiNote("");

    try {
      const contextSignals = unlinkedSignals.slice(0, 5).map((signal) => ({
        label: signal.label,
        average: signal.average,
        count: signal.count,
        suggested_day: signal.suggestedDay,
      }));

      const { data, error } = await supabase.functions.invoke("ai-coach", {
        body: {
          mode: "extract_debt",
          message: aiText.trim(),
          context: {
            debt_signals: contextSignals,
          },
        },
      });

      if (error) throw new Error(error.message || "AI parse failed.");

      const extracted = data?.extracted || {};
      if (!hasMeaningfulExtraction(extracted)) {
        throw new Error("The document was uploaded, but nothing usable was extracted from the image.");
      }
      setForm({
        name: extracted.name || "",
        lender: extracted.lender || "",
        starting_balance: extracted.starting_balance != null ? String(extracted.starting_balance) : "",
        current_balance: extracted.current_balance != null ? String(extracted.current_balance) : "",
        minimum_payment: extracted.minimum_payment != null ? String(extracted.minimum_payment) : "",
        due_day: extracted.due_day != null ? String(extracted.due_day) : "",
        interest_rate: extracted.interest_rate != null ? String(extracted.interest_rate) : "",
        notes: extracted.notes || `AI setup: ${aiText.trim()}`,
      });
      setAiNote(data?.message || "AI filled the debt form. Check it before saving.");
    } catch (error) {
      setAiNote(error.message || "Could not understand that debt yet.");
    } finally {
      setAiBusy(false);
    }
  }

  async function uploadDebtDocument() {
    if (!documentFile) return;

    setDocumentBusy(true);
    setAiNote("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const safeName = documentFile.name.replace(/\s+/g, "-").toLowerCase();
      const filePath = `${user.id}/documents/debt/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(filePath, documentFile, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from("receipts").getPublicUrl(filePath);
      const fileUrl = publicData.publicUrl;
      const documentDataUrl = documentFile.type.startsWith("image/")
        ? await fileToDataUrl(documentFile)
        : null;
      const documentInsertPayload = {
        user_id: user.id,
        record_type: "debt",
        file_name: documentFile.name,
        file_url: fileUrl,
        file_type: documentFile.type || null,
        extraction_status: documentFile.type.startsWith("image/") ? "processing" : "uploaded",
      };

      if (!documentFile.type.startsWith("image/")) {
        try {
          await supabase.from("financial_documents").insert(documentInsertPayload);
          await onDocumentsChange();
        } catch {
          // Let the upload continue even if the document log is blocked by RLS.
        }
        setAiNote("Document saved. AI extraction currently works best from screenshots or photos.");
        setDocumentFile(null);
        return;
      }

      const { data, error } = await supabase.functions.invoke("ai-coach", {
        body: {
          mode: "extract_debt_document",
          message: aiText.trim(),
          context: {
            document_url: fileUrl,
            document_name: documentFile.name,
            document_data_url: documentDataUrl,
          },
        },
      });

      if (error) throw new Error(error.message || "Document extraction failed.");

      const extracted = data?.extracted || {};
      if (!hasMeaningfulExtraction(extracted)) {
        throw new Error("The document was uploaded, but nothing usable was extracted from the image.");
      }

      setForm((prev) => ({
        name: extracted.name || prev.name,
        lender: extracted.lender || prev.lender,
        starting_balance:
          extracted.starting_balance != null ? String(extracted.starting_balance) : prev.starting_balance,
        current_balance:
          extracted.current_balance != null ? String(extracted.current_balance) : prev.current_balance,
        minimum_payment:
          extracted.minimum_payment != null ? String(extracted.minimum_payment) : prev.minimum_payment,
        due_day: extracted.due_day != null ? String(extracted.due_day) : prev.due_day,
        interest_rate:
          extracted.interest_rate != null ? String(extracted.interest_rate) : prev.interest_rate,
        notes: extracted.notes || prev.notes,
      }));

      try {
        await supabase.from("financial_documents").insert({
          ...documentInsertPayload,
          extraction_status: "extracted",
          extraction_summary: data?.message || "AI filled the debt form from the document.",
          extracted_json: extracted,
        });
        await onDocumentsChange();
      } catch {
        // Extraction succeeded, so don't block the form fill if logging fails.
      }

      setAiNote(data?.message || "AI filled the debt form from the document.");
      setDocumentFile(null);
    } catch (error) {
      setAiNote(error.message || "Could not extract from that document.");
    } finally {
      setDocumentBusy(false);
    }
  }

  async function saveDebt(extra = {}) {
    if (viewerMode) {
      alert("Viewer mode is on. Turn it off to edit debts.");
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = {
        user_id: user.id,
        name: String(extra.name ?? form.name).trim(),
        lender: String(extra.lender ?? form.lender).trim(),
        starting_balance: numberOrNull(extra.starting_balance ?? form.starting_balance),
        current_balance: numberOrNull(extra.current_balance ?? form.current_balance),
        minimum_payment: numberOrNull(extra.minimum_payment ?? form.minimum_payment),
        due_day: intOrNull(extra.due_day ?? form.due_day),
        interest_rate: numberOrNull(extra.interest_rate ?? form.interest_rate),
        notes: String(extra.notes ?? form.notes).trim() || null,
        status: "active",
        source: extra.source || "manual",
        detection_confidence: extra.detection_confidence ?? 0,
        payment_keywords:
          extra.payment_keywords ||
          buildKeywords(extra.lender ?? form.lender, extra.name ?? form.name),
        updated_at: new Date().toISOString(),
      };

      if (!payload.name) {
        alert("Add a debt name first.");
        setSaving(false);
        return;
      }

      payload.dedupe_key = buildDebtDedupeKey(payload);

      const { error } = await supabase.from("debts").upsert(payload, {
        onConflict: "user_id,dedupe_key",
      });

      if (error) throw error;

      setForm({
        name: "",
        lender: "",
        starting_balance: "",
        current_balance: "",
        minimum_payment: "",
        due_day: "",
        interest_rate: "",
        notes: "",
      });
      setAiText("");
      setAiNote("");

      await onChange();
      alert("Debt saved. If it already existed, the record was updated instead of duplicated.");
    } catch (error) {
      alert(error.message || "Could not save debt.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSignalAsDebt(signal) {
    await saveDebt({
      name: signal.label,
      lender: signal.label,
      minimum_payment: signal.average.toFixed(2),
      due_day: signal.suggestedDay || null,
      notes: `Created from statement signal. ${signal.count} matching payment(s) detected.`,
      source: "statement_signal",
      detection_confidence: 0.82,
      payment_keywords: [normalizeText(signal.label)],
    });
  }

  return (
    <>
      <Section title="Debt Tracker">
        <p style={styles.sectionIntro}>
          This handles AI-detected payment streams, plain-English setup, document extraction,
          and real monthly progress checks instead of just static debt records.
        </p>
      </Section>

      <div style={styles.grid}>
        <MiniCard title="Debts" value={`${debts.length}`} />
        <MiniCard title="Signals" value={`${unlinkedSignals.length}`} />
        <MiniCard title="Detected Paid Out" value={`£${totalDetectedPayments.toFixed(2)}`} />
        <MiniCard title="Trend" value={trendSummary.label} />
      </div>

      <Section title="Debt Snapshot">
        <div style={styles.grid}>
          <MiniCard title="Balance" value={formatCurrency(debtSnapshot.totalBalance)} />
          <MiniCard title="Minimums" value={formatCurrency(debtSnapshot.totalMinimum)} />
          <MiniCard title="Paid This Month" value={formatCurrency(debtSnapshot.totalPaidThisMonth)} />
          <MiniCard title="Behind" value={`${debtSnapshot.behindCount}`} />
        </div>
      </Section>

      <Section title="Tell AI About A Debt">
        <p style={styles.sectionIntro}>
          Example: I borrowed £5,000 from Barclays, minimum payment £145, due on
          the 12th, around 19.9% interest.
        </p>

        <textarea
          style={styles.textarea}
          placeholder="Describe the debt in plain English..."
          value={aiText}
          onChange={(e) => setAiText(e.target.value)}
        />

        <div style={styles.inlineBtnRow}>
          <button
            style={styles.primaryInlineBtn}
            onClick={runAiDebtParse}
            disabled={aiBusy || !aiText.trim()}
          >
            {aiBusy ? "Thinking..." : "Let AI Fill Debt Form"}
          </button>
        </div>

        {aiNote ? <p style={styles.smallMuted}>{aiNote}</p> : null}
      </Section>

      <Section title="Upload Debt Document">
        <p style={styles.sectionIntro}>
          Upload a screenshot or photo of a statement, agreement, or finance screen.
          Images can be read by AI directly; PDFs are stored but are less reliable for extraction right now.
        </p>
        <input
          style={styles.input}
          type="file"
          accept="image/*,.pdf"
          onChange={(e) => setDocumentFile(e.target.files?.[0] || null)}
        />
        {documentFile ? <p style={styles.smallMuted}>{documentFile.name}</p> : null}
        {aiNote ? <p style={styles.smallMuted}>{aiNote}</p> : null}
        <button
          style={styles.primaryBtn}
          onClick={uploadDebtDocument}
          disabled={documentBusy || !documentFile}
        >
          {documentBusy ? "Extracting..." : "Upload And Extract"}
        </button>
      </Section>

      <Section title="AI Detected Debt Streams">
        {unlinkedSignals.length === 0 ? (
          <p style={styles.emptyText}>
            No unconfirmed debt signals right now. Either nothing obvious has been
            detected yet, or you have already converted them into debt records.
          </p>
        ) : (
          unlinkedSignals.map((signal) => (
            <div key={signal.key} style={styles.signalCard}>
              <div style={styles.signalHeader}>
                <div>
                  <strong>{signal.label}</strong>
                  <p style={styles.transactionMeta}>
                    {signal.count} payment{signal.count === 1 ? "" : "s"} spotted · avg £
                    {signal.average.toFixed(2)} · around day {signal.suggestedDay || "?"}
                  </p>
                </div>
                <strong>£{signal.total.toFixed(2)}</strong>
              </div>

              <div style={styles.inlineBtnRow}>
                <button
                  style={styles.secondaryInlineBtn}
                  onClick={() => fillFromSignal(signal)}
                >
                  Use In Form
                </button>
                <button
                  style={styles.primaryInlineBtn}
                  onClick={() => saveSignalAsDebt(signal)}
                  disabled={saving || viewerMode}
                >
                  Save As Debt
                </button>
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title="Add Or Confirm Debt">
        <input
          style={styles.input}
          placeholder="Debt name, e.g. Barclaycard"
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Lender"
          value={form.lender}
          onChange={(e) => setForm((prev) => ({ ...prev, lender: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Starting balance"
          type="text" inputMode="decimal"
          value={form.starting_balance}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, starting_balance: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Current balance"
          type="text" inputMode="decimal"
          value={form.current_balance}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, current_balance: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Minimum monthly payment"
          type="text" inputMode="decimal"
          value={form.minimum_payment}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, minimum_payment: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Due day of month"
          type="text" inputMode="decimal"
          value={form.due_day}
          onChange={(e) => setForm((prev) => ({ ...prev, due_day: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Interest rate %"
          type="text" inputMode="decimal"
          value={form.interest_rate}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, interest_rate: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
        />

        <button style={styles.primaryBtn} onClick={() => saveDebt()} disabled={saving || viewerMode}>
          {viewerMode ? "Viewer mode on" : saving ? "Saving..." : "Save Debt"}
        </button>
      </Section>

      <Section title="Saved Debts">
        {debts.length === 0 ? (
          <p style={styles.emptyText}>No debts saved yet.</p>
        ) : (
          debts.map((debt) => {
            const match = getDebtMatchSummary(debt, transactions);
            const status = getDebtMonthlyStatus(debt, transactions);
            const progress = getDebtProgressSummary(debt, transactions);
            return (
              <div key={debt.id} style={styles.signalCard}>
                <div style={styles.signalHeader}>
                  <div>
                    <strong>{debt.name}</strong>
                    <p style={styles.transactionMeta}>
                      {debt.lender || "No lender"} · {debt.status || "active"} · source {debt.source || "manual"}
                    </p>
                  </div>
                  <strong>
                    {debt.current_balance != null
                      ? `£${Number(debt.current_balance).toFixed(2)}`
                      : "Balance later"}
                  </strong>
                </div>
                <p style={styles.signalBody}>
                  Min payment: {debt.minimum_payment != null ? `£${Number(debt.minimum_payment).toFixed(2)}` : "not set"}
                  {" · "}
                  Due day: {debt.due_day || "not set"}
                  {" · "}
                  Matched payments: {match.count}
                  {" · "}
                  Last seen: {match.lastDate || "not found yet"}
                </p>
                <p style={styles.signalBody}>
                  This month: {progress.monthlyPaidLabel}
                  {" · "}
                  Pace: {progress.paceLabel}
                  {" · "}
                  Payoff read: {progress.payoffLabel}
                </p>
                <div style={styles.statusPillRow}>
                  <span style={getStatusPillStyle(status.tone)}>{status.label}</span>
                </div>
              </div>
            );
          })
        )}
      </Section>

      {documents.length > 0 ? (
        <Section title="Recent Debt Documents">
          {documents.slice(0, 5).map((doc) => (
            <Row
              key={doc.id}
              name={doc.file_name || "Debt document"}
              value={doc.extraction_status || "uploaded"}
            />
          ))}
        </Section>
      ) : null}
    </>
  );
}

function InvestmentsPage({
  investments,
  investmentSignals,
  transactions,
  documents,
  onChange,
  onDocumentsChange,
  viewerMode,
}) {
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [aiText, setAiText] = useState("");
  const [documentFile, setDocumentFile] = useState(null);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [quoteBusyKey, setQuoteBusyKey] = useState("");
  const [form, setForm] = useState({
    name: "",
    platform: "",
    asset_type: "general",
    current_value: "",
    monthly_contribution: "",
    risk_level: "",
    ticker_symbol: "",
    units_owned: "",
    total_contributed: "",
    cost_basis: "",
    notes: "",
  });

  const unlinkedSignals = investmentSignals.filter(
    (signal) => !hasMatchingInvestment(signal, investments)
  );
  const totalDetectedInvesting = investmentSignals.reduce(
    (sum, item) => sum + item.total,
    0
  );
  const investmentSnapshot = getInvestmentPortfolioSnapshot(investments);

  function fillFromSignal(signal) {
    setForm({
      name: signal.label,
      platform: signal.label,
      asset_type: "general",
      current_value: "",
      monthly_contribution: signal.average.toFixed(2),
      risk_level: "",
      ticker_symbol: "",
      units_owned: "",
      total_contributed: signal.total.toFixed(2),
      cost_basis: "",
      notes: `Created from imported statement signal: ${signal.label}`,
    });
  }

  async function runAiInvestmentParse() {
    if (!aiText.trim()) return;

    setAiBusy(true);
    setAiNote("");

    try {
      const contextSignals = unlinkedSignals.slice(0, 5).map((signal) => ({
        label: signal.label,
        average: signal.average,
        count: signal.count,
      }));

      const { data, error } = await supabase.functions.invoke("ai-coach", {
        body: {
          mode: "extract_investment",
          message: aiText.trim(),
          context: {
            investment_signals: contextSignals,
          },
        },
      });

      if (error) throw new Error(error.message || "AI parse failed.");

      const extracted = data?.extracted || {};
      setForm({
        name: extracted.name || "",
        platform: extracted.platform || "",
        asset_type: extracted.asset_type || "general",
        current_value: extracted.current_value != null ? String(extracted.current_value) : "",
        monthly_contribution:
          extracted.monthly_contribution != null ? String(extracted.monthly_contribution) : "",
        risk_level: extracted.risk_level || "",
        ticker_symbol: extracted.ticker_symbol || "",
        units_owned: extracted.units_owned != null ? String(extracted.units_owned) : "",
        total_contributed: extracted.total_contributed != null ? String(extracted.total_contributed) : "",
        cost_basis: extracted.cost_basis != null ? String(extracted.cost_basis) : "",
        notes: extracted.notes || `AI setup: ${aiText.trim()}`,
      });
      setAiNote(data?.message || "AI filled the investment form. Check it before saving.");
    } catch (error) {
      setAiNote(error.message || "Could not understand that investment yet.");
    } finally {
      setAiBusy(false);
    }
  }

  async function uploadInvestmentDocument() {
    if (!documentFile) return;

    setDocumentBusy(true);
    setAiNote("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const safeName = documentFile.name.replace(/\s+/g, "-").toLowerCase();
      const filePath = `${user.id}/documents/investment/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(filePath, documentFile, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from("receipts").getPublicUrl(filePath);
      const fileUrl = publicData.publicUrl;
      const documentDataUrl = documentFile.type.startsWith("image/")
        ? await fileToDataUrl(documentFile)
        : null;
      const documentInsertPayload = {
        user_id: user.id,
        record_type: "investment",
        file_name: documentFile.name,
        file_url: fileUrl,
        file_type: documentFile.type || null,
        extraction_status: documentFile.type.startsWith("image/") ? "processing" : "uploaded",
      };

      if (!documentFile.type.startsWith("image/")) {
        try {
          await supabase.from("financial_documents").insert(documentInsertPayload);
          await onDocumentsChange();
        } catch {
          // Let the upload continue even if the document log is blocked by RLS.
        }
        setAiNote("Document saved. AI extraction currently works best from screenshots or photos.");
        setDocumentFile(null);
        return;
      }

      const { data, error } = await supabase.functions.invoke("ai-coach", {
        body: {
          mode: "extract_investment_document",
          message: aiText.trim(),
          context: {
            document_url: fileUrl,
            document_name: documentFile.name,
            document_data_url: documentDataUrl,
          },
        },
      });

      if (error) throw new Error(error.message || "Document extraction failed.");

      const extracted = data?.extracted || {};
      if (!hasMeaningfulExtraction(extracted)) {
        throw new Error("The document was uploaded, but nothing usable was extracted from the image.");
      }

      setForm((prev) => ({
        name: extracted.name || prev.name,
        platform: extracted.platform || prev.platform,
        asset_type: extracted.asset_type || prev.asset_type,
        current_value:
          extracted.current_value != null ? String(extracted.current_value) : prev.current_value,
        monthly_contribution:
          extracted.monthly_contribution != null
            ? String(extracted.monthly_contribution)
            : prev.monthly_contribution,
        risk_level: extracted.risk_level || prev.risk_level,
        ticker_symbol: extracted.ticker_symbol || prev.ticker_symbol,
        units_owned: extracted.units_owned != null ? String(extracted.units_owned) : prev.units_owned,
        total_contributed:
          extracted.total_contributed != null ? String(extracted.total_contributed) : prev.total_contributed,
        cost_basis: extracted.cost_basis != null ? String(extracted.cost_basis) : prev.cost_basis,
        notes: extracted.notes || prev.notes,
      }));

      try {
        await supabase.from("financial_documents").insert({
          ...documentInsertPayload,
          extraction_status: "extracted",
          extraction_summary: data?.message || "AI filled the investment form from the document.",
          extracted_json: extracted,
        });
        await onDocumentsChange();
      } catch {
        // Extraction succeeded, so don't block the form fill if logging fails.
      }

      setAiNote(data?.message || "AI filled the investment form from the document.");
      setDocumentFile(null);
    } catch (error) {
      setAiNote(error.message || "Could not extract from that document.");
    } finally {
      setDocumentBusy(false);
    }
  }

  async function refreshPrice(investment) {
    if (!investment.ticker_symbol && investment.asset_type !== "crypto") {
      alert("Add a ticker symbol first, e.g. VUAG.L or BTC.");
      return;
    }

    setQuoteBusyKey(investment.id);

    try {
      const { data, error } = await supabase.functions.invoke("ai-coach", {
        body: {
          mode: "market_price",
          message: investment.ticker_symbol || investment.name,
          context: {
            asset_type: investment.asset_type,
            ticker_symbol: investment.ticker_symbol,
            platform: investment.platform,
            name: investment.name,
          },
        },
      });

      if (error) throw new Error(error.message || "Price refresh failed.");
      if (!data?.price) throw new Error("No live price came back for that symbol.");

      const { error: updateError } = await supabase
        .from("investments")
        .update({
          live_price: data.price,
          live_price_currency: data.currency || "GBP",
          live_price_updated_at: new Date().toISOString(),
          price_source: data.source || "live",
        })
        .eq("id", investment.id);

      if (updateError) throw updateError;
      await onChange();
    } catch (error) {
      alert(error.message || "Could not refresh price.");
    } finally {
      setQuoteBusyKey("");
    }
  }

  async function saveInvestment(extra = {}) {
    if (viewerMode) {
      alert("Viewer mode is on. Turn it off to edit investments.");
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = {
        user_id: user.id,
        name: String(extra.name ?? form.name).trim(),
        platform: String(extra.platform ?? form.platform).trim(),
        asset_type: String(extra.asset_type ?? form.asset_type).trim() || "general",
        current_value: numberOrNull(extra.current_value ?? form.current_value),
        monthly_contribution: numberOrNull(
          extra.monthly_contribution ?? form.monthly_contribution
        ),
        risk_level: String(extra.risk_level ?? form.risk_level).trim() || null,
        ticker_symbol: String(extra.ticker_symbol ?? form.ticker_symbol).trim() || null,
        units_owned: numberOrNull(extra.units_owned ?? form.units_owned),
        total_contributed: numberOrNull(extra.total_contributed ?? form.total_contributed),
        cost_basis: numberOrNull(extra.cost_basis ?? form.cost_basis),
        notes: String(extra.notes ?? form.notes).trim() || null,
        status: "active",
        source: extra.source || "manual",
        detection_confidence: extra.detection_confidence ?? 0,
        contribution_keywords:
          extra.contribution_keywords ||
          buildKeywords(extra.platform ?? form.platform, extra.name ?? form.name),
        updated_at: new Date().toISOString(),
      };

      if (!payload.name) {
        alert("Add an investment name first.");
        setSaving(false);
        return;
      }

      payload.dedupe_key = buildInvestmentDedupeKey(payload);

      const { error } = await supabase.from("investments").upsert(payload, {
        onConflict: "user_id,dedupe_key",
      });

      if (error) throw error;

      setForm({
        name: "",
        platform: "",
        asset_type: "general",
        current_value: "",
        monthly_contribution: "",
        risk_level: "",
        ticker_symbol: "",
        units_owned: "",
        total_contributed: "",
        cost_basis: "",
        notes: "",
      });
      setAiText("");
      setAiNote("");

      await onChange();
      alert(
        "Investment saved. If it already existed, the record was updated instead of duplicated."
      );
    } catch (error) {
      alert(error.message || "Could not save investment.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSignalAsInvestment(signal) {
    await saveInvestment({
      name: signal.label,
      platform: signal.label,
      monthly_contribution: signal.average.toFixed(2),
      total_contributed: signal.total.toFixed(2),
      notes: `Created from statement signal. ${signal.count} matching contribution(s) detected.`,
      source: "statement_signal",
      detection_confidence: 0.82,
      contribution_keywords: [normalizeText(signal.label)],
    });
  }

  return (
    <>
      <Section title="Investment Tracker">
        <p style={styles.sectionIntro}>
          This now handles AI setup, document extraction, contribution tracking,
          and live market price refreshes where you add a symbol.
        </p>
      </Section>

      <div style={styles.grid}>
        <MiniCard title="Investments" value={`${investments.length}`} />
        <MiniCard title="Signals" value={`${unlinkedSignals.length}`} />
        <MiniCard
          title="Detected Contributions"
          value={`£${totalDetectedInvesting.toFixed(2)}`}
        />
        <MiniCard title="Status" value={investments.length ? "Tracking" : "Building"} />
      </div>

      <Section title="Portfolio Snapshot">
        <div style={styles.grid}>
          <MiniCard title="Value" value={formatCurrency(investmentSnapshot.marketValue)} />
          <MiniCard title="Contributed" value={formatCurrency(investmentSnapshot.totalContributed)} />
          <MiniCard title="Gain/Loss" value={`${investmentSnapshot.gainLoss >= 0 ? "+" : "-"}${formatCurrency(Math.abs(investmentSnapshot.gainLoss))}`} />
          <MiniCard title="Live Priced" value={`${investmentSnapshot.pricedCount}`} />
        </div>
      </Section>

      <Section title="Tell AI About An Investment">
        <p style={styles.sectionIntro}>
          Example: I put £250 a month into Vanguard for an ISA and it is worth about £4,800 now.
        </p>

        <textarea
          style={styles.textarea}
          placeholder="Describe the investment in plain English..."
          value={aiText}
          onChange={(e) => setAiText(e.target.value)}
        />

        <div style={styles.inlineBtnRow}>
          <button
            style={styles.primaryInlineBtn}
            onClick={runAiInvestmentParse}
            disabled={aiBusy || !aiText.trim()}
          >
            {aiBusy ? "Thinking..." : "Let AI Fill Investment Form"}
          </button>
        </div>

        {aiNote ? <p style={styles.smallMuted}>{aiNote}</p> : null}
      </Section>

      <Section title="Upload Investment Document">
        <p style={styles.sectionIntro}>
          Upload a screenshot of your broker app, crypto wallet, or portfolio screen.
          Images can be read by AI directly; PDFs are stored but are less reliable for extraction right now.
        </p>
        <input
          style={styles.input}
          type="file"
          accept="image/*,.pdf"
          onChange={(e) => setDocumentFile(e.target.files?.[0] || null)}
        />
        {documentFile ? <p style={styles.smallMuted}>{documentFile.name}</p> : null}
        {aiNote ? <p style={styles.smallMuted}>{aiNote}</p> : null}
        <button
          style={styles.primaryBtn}
          onClick={uploadInvestmentDocument}
          disabled={documentBusy || !documentFile}
        >
          {documentBusy ? "Extracting..." : "Upload And Extract"}
        </button>
      </Section>

      <Section title="AI Detected Investing Streams">
        {unlinkedSignals.length === 0 ? (
          <p style={styles.emptyText}>
            No unconfirmed investing signals right now.
          </p>
        ) : (
          unlinkedSignals.map((signal) => (
            <div key={signal.key} style={styles.signalCard}>
              <div style={styles.signalHeader}>
                <div>
                  <strong>{signal.label}</strong>
                  <p style={styles.transactionMeta}>
                    {signal.count} contribution{signal.count === 1 ? "" : "s"} spotted · avg £
                    {signal.average.toFixed(2)} · last seen {signal.lastDate || "unknown"}
                  </p>
                </div>
                <strong>£{signal.total.toFixed(2)}</strong>
              </div>

              <div style={styles.inlineBtnRow}>
                <button
                  style={styles.secondaryInlineBtn}
                  onClick={() => fillFromSignal(signal)}
                >
                  Use In Form
                </button>
                <button
                  style={styles.primaryInlineBtn}
                  onClick={() => saveSignalAsInvestment(signal)}
                  disabled={saving || viewerMode}
                >
                  Save As Investment
                </button>
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title="Add Or Confirm Investment">
        <input
          style={styles.input}
          placeholder="Investment name, e.g. Vanguard ISA"
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Platform"
          value={form.platform}
          onChange={(e) => setForm((prev) => ({ ...prev, platform: e.target.value }))}
        />
        <select
          style={styles.input}
          value={form.asset_type}
          onChange={(e) => setForm((prev) => ({ ...prev, asset_type: e.target.value }))}
        >
          <option value="general">General</option>
          <option value="isa">ISA</option>
          <option value="pension">Pension</option>
          <option value="crypto">Crypto</option>
          <option value="shares">Shares</option>
          <option value="funds">Funds</option>
        </select>
        <input
          style={styles.input}
          placeholder="Ticker symbol, e.g. VUAG.L or BTC"
          value={form.ticker_symbol}
          onChange={(e) => setForm((prev) => ({ ...prev, ticker_symbol: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Current value"
          type="text" inputMode="decimal"
          value={form.current_value}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, current_value: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Monthly contribution"
          type="text" inputMode="decimal"
          value={form.monthly_contribution}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, monthly_contribution: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Units owned"
          type="text" inputMode="decimal"
          value={form.units_owned}
          onChange={(e) => setForm((prev) => ({ ...prev, units_owned: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Total contributed"
          type="text" inputMode="decimal"
          value={form.total_contributed}
          onChange={(e) => setForm((prev) => ({ ...prev, total_contributed: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Cost basis"
          type="text" inputMode="decimal"
          value={form.cost_basis}
          onChange={(e) => setForm((prev) => ({ ...prev, cost_basis: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Risk level"
          value={form.risk_level}
          onChange={(e) => setForm((prev) => ({ ...prev, risk_level: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
        />

        <button style={styles.primaryBtn} onClick={() => saveInvestment()} disabled={saving || viewerMode}>
          {viewerMode ? "Viewer mode on" : saving ? "Saving..." : "Save Investment"}
        </button>
      </Section>

      <Section title="Saved Investments">
        {investments.length === 0 ? (
          <p style={styles.emptyText}>No investments saved yet.</p>
        ) : (
          investments.map((investment) => {
            const match = getInvestmentMatchSummary(investment, transactions);
            const status = getInvestmentMonthlyStatus(investment, transactions);
            const performance = getInvestmentPerformanceSummary(investment);
            return (
              <div key={investment.id} style={styles.signalCard}>
                <div style={styles.signalHeader}>
                  <div>
                    <strong>{investment.name}</strong>
                    <p style={styles.transactionMeta}>
                      {investment.platform || "No platform"} · {investment.asset_type || "general"} · source {investment.source || "manual"}
                    </p>
                  </div>
                  <strong>
                    {performance.marketValueLabel}
                  </strong>
                </div>
                <p style={styles.signalBody}>
                  Monthly contribution: {investment.monthly_contribution != null ? `£${Number(investment.monthly_contribution).toFixed(2)}` : "not set"}
                  {" · "}
                  Matched contributions: {match.count}
                  {" · "}
                  Last seen: {match.lastDate || "not found yet"}
                </p>
                <p style={styles.signalBody}>
                  Symbol: {investment.ticker_symbol || "not set"}
                  {" · "}
                  Gain/loss read: {performance.gainLossLabel}
                  {" · "}
                  Risk: {investment.risk_level || "not set"}
                </p>
                <div style={styles.inlineBtnRow}>
                  <span style={getStatusPillStyle(status.tone)}>{status.label}</span>
                  <button
                    style={styles.secondaryInlineBtn}
                    onClick={() => refreshPrice(investment)}
                    disabled={quoteBusyKey === investment.id}
                  >
                    {quoteBusyKey === investment.id ? "Refreshing..." : "Refresh Price"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </Section>

      {documents.length > 0 ? (
        <Section title="Recent Investment Documents">
          {documents.slice(0, 5).map((doc) => (
            <Row
              key={doc.id}
              name={doc.file_name || "Investment document"}
              value={doc.extraction_status || "uploaded"}
            />
          ))}
        </Section>
      ) : null}
    </>
  );
}

function AccountsPage({ accounts, transactions }) {
  const accountInsights = accounts.map((account) => {
    const accountTransactions = transactions.filter((t) => t.account_id === account.id);
    const totals = getTotals(accountTransactions);
    const incomeCount = accountTransactions.filter((t) => Number(t.amount) > 0 && !isInternalTransferLike(t)).length;
    const outgoingCount = accountTransactions.filter((t) => Number(t.amount) < 0 && !isInternalTransferLike(t)).length;
    const transferCount = accountTransactions.filter((t) => isInternalTransferLike(t)).length;
    const salaryCount = accountTransactions.filter((t) => /salary|payroll|wage|paye/i.test(t.description || "")).length;
    const billCount = accountTransactions.filter((t) => t.is_bill || t.is_subscription).length;
    const latestDate = accountTransactions
      .map((t) => parseAppDate(t.transaction_date))
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
  const unassignedTransactions = transactions.filter((t) => !t.account_id).length;

  return (
    <>
      <Section title="Accounts">
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

      <Section title="Statement Separation">
        <p style={styles.sectionIntro}>
          Accounts are inferred from the statement file name and saved import account. The key is keeping each CSV tied to the correct account so transfers can be ignored and real income/spending stays clean.
        </p>
        <Row name="Accounts found" value={`${accounts.length}`} />
        <Row name="Unassigned transactions" value={`${unassignedTransactions}`} />
        <Row name="Transfer handling" value="Excluded from income/spend when detected" />
      </Section>
    </>
  );
}

function CalendarPage({ transactions, screenWidth }) {
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDayKey, setSelectedDayKey] = useState("");
  const [calendarMode, setCalendarMode] = useState("history");
  const [timeframe, setTimeframe] = useState("all");
  const [calendarAiBusy, setCalendarAiBusy] = useState(false);
  const [calendarAiText, setCalendarAiText] = useState("");
  const [calendarAiError, setCalendarAiError] = useState("");

  const recurringEvents = useMemo(() => getRecurringCalendarEvents(transactions), [transactions]);
  const allHistoryMonths = useMemo(() => getMonthlyBreakdown(transactions, "all"), [transactions]);
  const availableMonthCount = allHistoryMonths.length;
  const shortTimeframe = isShortTimeframe(timeframe);
  const usingShortHistoryView = shortTimeframe && calendarMode === "history";
  const shortWindowSize = getTimeframeDayCount(timeframe);
  const earliestHistoryDate = useMemo(() => getEarliestHistoryDate(transactions), [transactions]);
  const latestHistoryDate = useMemo(() => getLatestHistoryDate(transactions), [transactions]);
  const shortWindowBounds = useMemo(
    () => ({ start: earliestHistoryDate, end: startOfDay(new Date()) }),
    [earliestHistoryDate]
  );
  const activeShortEndDate = useMemo(
    () => clampDayToRange(viewDate, shortWindowBounds),
    [viewDate, shortWindowBounds]
  );
  const calendarBounds = useMemo(
    () => getCalendarMonthBounds(transactions, timeframe),
    [transactions, timeframe]
  );
  const activeViewDate = useMemo(
    () => clampMonthToRange(viewDate, calendarBounds),
    [viewDate, calendarBounds]
  );

  const historicalCalendar = useMemo(
    () => buildHistoricalCalendarMonth(activeViewDate, transactions, recurringEvents),
    [activeViewDate, transactions, recurringEvents]
  );
  const recurringCalendar = useMemo(
    () => buildCalendarMonth(activeViewDate, recurringEvents),
    [activeViewDate, recurringEvents]
  );
  const rollingHistoryWindow = useMemo(
    () => buildRollingHistoryWindow(transactions, activeShortEndDate, shortWindowSize),
    [transactions, activeShortEndDate, shortWindowSize]
  );

  const timeframeOptions = [
    ["1d", "1D"],
    ["1w", "1W"],
    ["2w", "2W"],
    ["1m", "1M"],
    ["3m", "3M"],
    ["6m", "6M"],
    ["12m", "12M"],
    ["all", "All"],
  ];
  const timeframeLabel = timeframeOptions.find(([key]) => key === timeframe)?.[1] || timeframe.toUpperCase();

  const calendarDays =
    calendarMode === "history"
      ? usingShortHistoryView
        ? rollingHistoryWindow.days
        : historicalCalendar.days
      : recurringCalendar.days;
  const summary = usingShortHistoryView
    ? getRollingWindowSummary(rollingHistoryWindow.days)
    : getMonthlyHistorySummary(activeViewDate, transactions);
  const patternSummary = getCalendarPatternSummary(transactions, timeframe);
  const monthlyBreakdown = getMonthlyBreakdown(transactions, shortTimeframe ? "1m" : timeframe).slice(0, 6);
  const visibleHistoryTransactions = calendarDays.flatMap((day) => day.transactions || []);
  const selectedDay = selectedDayKey
    ? calendarDays.find((day) => day.key === selectedDayKey) || null
    : null;
  const canGoPrev = usingShortHistoryView
    ? canShiftShortWindow(activeShortEndDate, shortWindowBounds, shortWindowSize, -1)
    : canShiftCalendarMonth(activeViewDate, calendarBounds, -1);
  const canGoNext = usingShortHistoryView
    ? canShiftShortWindow(activeShortEndDate, shortWindowBounds, shortWindowSize, 1)
    : canShiftCalendarMonth(activeViewDate, calendarBounds, 1);
  const shortRangeTitle = usingShortHistoryView
    ? formatShortWindowTitle(rollingHistoryWindow.startDate, rollingHistoryWindow.endDate, timeframe)
    : `${MONTH_NAMES[activeViewDate.getMonth()]} ${activeViewDate.getFullYear()}`;
  const allowHorizontalScroll = usingShortHistoryView
    ? shortWindowSize > 7 || screenWidth <= 760
    : screenWidth <= 760;

  function clearCalendarAiRead() {
    setCalendarAiText("");
    setCalendarAiError("");
  }

  function handleRangeShift(direction) {
    setSelectedDayKey("");
    clearCalendarAiRead();

    if (usingShortHistoryView) {
      if ((direction < 0 && !canGoPrev) || (direction > 0 && !canGoNext)) return;
      setViewDate((current) =>
        clampDayToRange(
          addDays(startOfDay(current), direction * shortWindowSize),
          shortWindowBounds
        )
      );
      return;
    }

    if ((direction < 0 && !canGoPrev) || (direction > 0 && !canGoNext)) return;
    setViewDate((current) =>
      clampMonthToRange(
        new Date(current.getFullYear(), current.getMonth() + direction, 1),
        calendarBounds
      )
    );
  }

  function handleTimeframeChange(nextTimeframe) {
    const needsMonths = getTimeframeMonthCount(nextTimeframe);
    const unavailable = needsMonths > 0 && nextTimeframe !== "all" && availableMonthCount < needsMonths;
    if (unavailable) return;

    setTimeframe(nextTimeframe);
    setSelectedDayKey("");
    clearCalendarAiRead();

    if (isShortTimeframe(nextTimeframe)) {
      setViewDate(latestHistoryDate);
      return;
    }

    const nextBounds = getCalendarMonthBounds(transactions, nextTimeframe);
    setViewDate(nextBounds.end);
  }

  function handleDayClick(day) {
    if (calendarMode === "history" && day.isFutureDay) return;
    setSelectedDayKey((current) => (current === day.key ? "" : day.key));
  }

  async function runCalendarAiAnalysis() {
    setCalendarAiBusy(true);
    setCalendarAiError("");

    try {
      const context = {
        source: "calendar",
        timeframe,
        timeframe_label: timeframeLabel,
        visible_window_label: shortRangeTitle,
        calendar_mode: calendarMode,
        summary,
        calendar_summary: {
          spent: summary.spent,
          earned: summary.earned,
          net: summary.net,
          active_days: summary.activeDays,
        },
        data_freshness: getDataFreshness(transactions),
        monthly_breakdown: monthlyBreakdown.slice(0, 4),
        visible_transactions: visibleHistoryTransactions.slice(0, 30).map((transaction) => ({
          date: transaction.transaction_date,
          description: transaction.description,
          category: getMeaningfulCategory(transaction),
          amount: transaction.amount,
        })),
        visible_transaction_count: visibleHistoryTransactions.length,
        selected_day: selectedDay
          ? {
              date: toIsoDate(selectedDay.date),
              earned: selectedDay.earned,
              spent: selectedDay.spent,
              net: selectedDay.net,
              transaction_count: selectedDay.transactions?.length || 0,
            }
          : null,
      };

      const { data, error } = await supabase.functions.invoke("ai-coach", {
        body: {
          mode: "coach",
          message:
            "Analyse the currently open calendar timeframe. Keep it concise, specific to the visible range, and do not claim there are multiple months unless the provided data clearly includes them.",
          context,
        },
      });

      if (error) throw new Error(error.message || "Calendar AI analysis failed.");
      setCalendarAiText(String(data?.reply || "No calendar analysis came back."));
    } catch (error) {
      setCalendarAiError(error.message || "Could not analyse this timeframe yet.");
    } finally {
      setCalendarAiBusy(false);
    }
  }

  return (
    <>
      <Section title="Money Calendar">
        <div style={styles.calendarTopRow}>
          <button
            style={{
              ...styles.secondaryInlineBtn,
              ...(canGoPrev ? null : styles.calendarNavBtnDisabled),
            }}
            type="button"
            onClick={(event) => {
              event.currentTarget.blur();
              handleRangeShift(-1);
            }}
            disabled={!canGoPrev}
          >
            Prev
          </button>

          <div style={styles.calendarTitleWrap}>
            <h4 style={styles.calendarTitle}>{shortRangeTitle}</h4>
            <p style={styles.smallMuted}>
              {usingShortHistoryView
                ? "Showing a rolling short window. Use Prev and Next to move through time."
                : timeframe === "all"
                ? "Showing your full history. Use Prev and Next to move month by month."
                : `Showing the latest month inside your ${timeframeLabel} view.`}
            </p>
          </div>

          <button
            style={{
              ...styles.secondaryInlineBtn,
              ...(canGoNext ? null : styles.calendarNavBtnDisabled),
            }}
            type="button"
            onClick={(event) => {
              event.currentTarget.blur();
              handleRangeShift(1);
            }}
            disabled={!canGoNext}
          >
            Next
          </button>
        </div>

        <div style={styles.calendarToolbar}>
          <div style={styles.modeChipRow}>
            {[
              ["history", "History"],
              ["recurring", "Recurring"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={calendarMode === key}
                onClick={(event) => {
                  event.currentTarget.blur();
                  setCalendarMode(key);
                  setSelectedDayKey("");
                  clearCalendarAiRead();
                  if (key === "recurring" && isShortTimeframe(timeframe)) {
                    const fallbackRange = "all";
                    setTimeframe(fallbackRange);
                    const nextBounds = getCalendarMonthBounds(transactions, fallbackRange);
                    setViewDate(nextBounds.end);
                  }
                }}
                style={{
                  ...styles.calendarModeChip,
                  ...(calendarMode === key ? styles.calendarModeChipActive : null),
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={styles.modeChipRow}>
            {timeframeOptions.map(([key, label]) => {
              const needsMonths = getTimeframeMonthCount(key);
              const unavailable = needsMonths > 0 && key !== "all" && availableMonthCount < needsMonths;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={timeframe === key}
                  onClick={(event) => {
                    event.currentTarget.blur();
                    handleTimeframeChange(key);
                  }}
                  disabled={unavailable}
                  style={{
                    ...styles.calendarTimeframeChip,
                    ...(timeframe === key ? styles.calendarTimeframeChipActive : null),
                    ...(unavailable ? styles.timeframeChipDisabled : null),
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {availableMonthCount <= 1 && !shortTimeframe ? (
          <p style={styles.calendarRangeHint}>
            You have one month of history so far, so bigger month ranges stay muted until more statements are imported.
          </p>
        ) : null}

        <div style={getCalendarSummaryGridStyle(screenWidth)}>
          <MiniCard title={usingShortHistoryView ? "Money Out" : "Spent"} value={formatCurrency(summary.spent)} />
          <MiniCard title={usingShortHistoryView ? "Money In" : "Earned"} value={formatCurrency(summary.earned)} />
          <MiniCard title="Net" value={`${summary.net >= 0 ? "+" : "-"}${formatCurrency(Math.abs(summary.net))}`} />
          <MiniCard title={usingShortHistoryView ? "Days Used" : "Active Days"} value={`${summary.activeDays}`} />
        </div>

        <div
          style={{
            ...styles.calendarGridViewport,
            overflowX: allowHorizontalScroll ? "auto" : "hidden",
          }}
        >
          <div
            style={{
              ...(shortTimeframe && calendarMode === "history"
                ? getRollingDaysGridStyle(screenWidth, shortWindowSize)
                : styles.calendarGrid),
              minWidth:
                usingShortHistoryView && allowHorizontalScroll
                  ? `${Math.max(shortWindowSize, 7) * 96}px`
                  : !usingShortHistoryView && screenWidth <= 760
                  ? "640px"
                  : undefined,
            }}
          >
            {!usingShortHistoryView
              ? DAY_NAMES.map((day) => (
                  <div key={day} style={styles.calendarDayHeader}>{day}</div>
                ))
              : null}

            {calendarDays.map((day) => {
              const isSelected = selectedDayKey === day.key;
              const txCount = day.transactions?.length || 0;
              const eventCount = day.events?.length || 0;
              const firstLabel = day.previewLabels?.[0] || day.events?.[0]?.title || "";
              const extraCount = calendarMode === "history" ? Math.max(txCount - 1, 0) : Math.max(eventCount - 1, 0);
              const net = Number(day.net || 0);

              return (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  disabled={calendarMode === "history" && day.isFutureDay}
                  style={{
                    ...styles.calendarCell,
                    ...(usingShortHistoryView ? styles.calendarCellShort : null),
                    ...(day.inMonth === false ? styles.calendarCellMuted : null),
                    ...(calendarMode === "history" && day.isFutureDay ? styles.calendarCellFuture : null),
                    ...(isSelected ? styles.calendarCellSelected : null),
                  }}
                >
                  <div style={styles.calendarDateRow}>
                    <div>
                      <div style={styles.calendarDate}>{day.date.getDate()}</div>
                      {usingShortHistoryView && calendarMode === "history" ? (
                        <div style={styles.calendarWeekdayMini}>{formatShortWeekday(day.date)}</div>
                      ) : null}
                    </div>
                    {calendarMode === "history" && txCount > 0 ? (
                      <span style={styles.calendarCountTag}>{txCount}</span>
                    ) : calendarMode === "recurring" && eventCount > 0 ? (
                      <span style={styles.calendarCountTag}>{eventCount}</span>
                    ) : null}
                  </div>

                  {calendarMode === "history" ? (
                    <>
                      {day.isFutureDay ? (
                        <div style={styles.calendarFutureBlock} />
                      ) : txCount > 0 ? (
                        <div style={net >= 0 ? styles.calendarNetPillPositive : styles.calendarNetPillNegative}>
                          {net >= 0 ? "+" : "-"}{formatCompactCurrency(Math.abs(net))}
                        </div>
                      ) : (
                        <div style={styles.calendarEmptyHint}>Quiet day</div>
                      )}
                      {!day.isFutureDay && firstLabel ? <div style={styles.calendarSingleLabel}>{firstLabel}</div> : null}
                      {!day.isFutureDay && extraCount > 0 ? <div style={styles.calendarMore}>{extraCount} more</div> : null}
                    </>
                  ) : (
                    <>
                      {eventCount > 0 ? (
                        <div style={styles.calendarRecurringStack}>
                          {day.events.slice(0, 2).map((event) => (
                            <div key={event.key} style={getCalendarEventStyle(event.kind)}>
                              <span style={styles.calendarEventText}>{event.title}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={styles.calendarEmptyHint}>Nothing due</div>
                      )}
                      {extraCount > 0 ? <div style={styles.calendarMore}>{extraCount} more</div> : null}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {!selectedDay && calendarMode === "history" ? (
          <p style={styles.calendarRangeHint}>Tap a day to open its transaction detail.</p>
        ) : null}

        {selectedDay ? (
          <div style={styles.calendarInlinePanel}>
            <div style={styles.calendarInlinePanelTop}>
              <strong>{calendarMode === "history" ? formatDateLong(selectedDay.date) : `Day ${selectedDay.date.getDate()} detail`}</strong>
              <button style={styles.ghostBtn} type="button" onClick={() => setSelectedDayKey("")}>Close</button>
            </div>

            {calendarMode === "history" ? (
              selectedDay.transactions.length === 0 ? (
                <p style={styles.emptyText}>
                  {selectedDay.isFutureDay ? "This day has not happened yet." : "Nothing landed on this day."}
                </p>
              ) : (
                <>
                  <p style={styles.transactionMeta}>
                    {selectedDay.transactions.length} transaction{selectedDay.transactions.length === 1 ? "" : "s"}. In {formatCurrency(selectedDay.earned)}. Out {formatCurrency(selectedDay.spent)}. Net {selectedDay.net >= 0 ? "+" : "-"}{formatCurrency(Math.abs(selectedDay.net))}
                  </p>
                  {selectedDay.transactions.map((transaction) => (
                    <TransactionRow
                      key={transaction.id || `${transaction.transaction_date}-${transaction.description}-${transaction.amount}`}
                      name={transaction.description || "Transaction"}
                      meta={getMeaningfulCategory(transaction) || "Uncategorised"}
                      amount={Number(transaction.amount || 0)}
                    />
                  ))}
                </>
              )
            ) : !selectedDay.events.length ? (
              <p style={styles.emptyText}>Nothing recurring is due on this date.</p>
            ) : (
              selectedDay.events.map((event) => (
                <div key={event.key} style={styles.signalCard}>
                  <div style={styles.signalHeader}>
                    <div>
                      <strong>{event.title}</strong>
                      <p style={styles.transactionMeta}>
                        Around day {event.day} - {event.kindLabel} - {event.confidenceLabel} confidence
                      </p>
                    </div>
                    <strong>
                      {event.amount > 0 ? "+" : "-"}{formatCurrency(Math.abs(event.amount))}
                    </strong>
                  </div>

                  <div style={styles.inlineBtnRow}>
                    <button style={styles.primaryInlineBtn} onClick={() => downloadCalendarEvent(event)}>
                      Add to Google / Apple Calendar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}
      </Section>

      <Section
        title="What Stands Out"
        right={
          <button
            type="button"
            style={styles.ghostBtn}
            onClick={runCalendarAiAnalysis}
            disabled={calendarAiBusy}
          >
            {calendarAiBusy ? "Analysing..." : "AI Analysis"}
          </button>
        }
      >
        <InsightCard
          label={calendarAiText ? "AI analysis" : "AI read"}
          headline={calendarAiText ? `Live read for ${timeframeLabel}` : patternSummary.headline}
          body={calendarAiText || patternSummary.body}
        />
        {calendarAiError ? <p style={styles.errorNote}>{calendarAiError}</p> : null}
      </Section>

      <Section title={monthlyBreakdown.length <= 1 ? "Month Snapshot" : "Recent Months"}>
        {monthlyBreakdown.length === 0 ? (
          <p style={styles.emptyText}>Upload more history to unlock month-by-month behaviour reads.</p>
        ) : monthlyBreakdown.length === 1 ? (
          <div style={styles.daySummaryCard}>
            <strong>{monthlyBreakdown[0].label}</strong>
            <p style={styles.transactionMeta}>
              Money in {formatCurrency(monthlyBreakdown[0].earned)}. Money out {formatCurrency(monthlyBreakdown[0].spent)}. Transactions happened on {monthlyBreakdown[0].activeDays} day{monthlyBreakdown[0].activeDays === 1 ? "" : "s"}.
            </p>
            <p style={{ ...styles.transactionMeta, color: monthlyBreakdown[0].net >= 0 ? "#059669" : "#dc2626", marginTop: "8px" }}>
              Overall this month: {monthlyBreakdown[0].net >= 0 ? "+" : "-"}{formatCurrency(Math.abs(monthlyBreakdown[0].net))}
            </p>
          </div>
        ) : (
          monthlyBreakdown.map((month) => (
            <div key={month.key} style={styles.monthTrendRow}>
              <div>
                <strong>{month.label}</strong>
                <p style={styles.transactionMeta}>
                  In {formatCurrency(month.earned)}. Out {formatCurrency(month.spent)}. Active on {month.activeDays} day{month.activeDays === 1 ? "" : "s"}
                </p>
              </div>
              <strong style={{ color: month.net >= 0 ? "#059669" : "#dc2626" }}>
                {month.net >= 0 ? "+" : "-"}{formatCurrency(Math.abs(month.net))}
              </strong>
            </div>
          ))
        )}
      </Section>
    </>
  );
}

function ReceiptsPage({ receipts, transactions, onChange, onGoToCoach }) {
  const [merchant, setMerchant] = useState("");
  const [total, setTotal] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [file, setFile] = useState(null);
  const [keepFile, setKeepFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [match, setMatch] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [receiptFilter, setReceiptFilter] = useState("all");

  function guessFromFileName(fileName) {
    const clean = fileName.toLowerCase();

    let guessedMerchant = "";
    if (clean.includes("tesco")) guessedMerchant = "Tesco";
    else if (clean.includes("amazon")) guessedMerchant = "Amazon";
    else if (clean.includes("costa")) guessedMerchant = "Costa";
    else if (clean.includes("shell")) guessedMerchant = "Shell";

    return { guessedMerchant };
  }

  function findMatchingTransaction(nextMerchant, nextTotal, nextDate) {
    if (!nextMerchant || !nextTotal) return null;
    return findReceiptCandidates(nextMerchant, nextTotal, nextDate)[0] || null;
  }

  function findReceiptCandidates(nextMerchant, nextTotal, nextDate) {
    if (!nextMerchant || !nextTotal) return [];

    const merchantText = nextMerchant.toLowerCase();
    const merchantTokens = merchantText
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length >= 3);
    const receiptAmount = Number(nextTotal);
    const parsedReceiptDate = nextDate ? parseAppDate(nextDate) : null;

    return transactions
      .filter((transaction) => Number(transaction.amount) < 0 && !isInternalTransferLike(transaction))
      .map((transaction) => {
      const description = String(transaction.description || "").toLowerCase();
      const amount = Math.abs(Number(transaction.amount || 0));
      const parsedTransactionDate = parseAppDate(transaction.transaction_date);

        const merchantMatches =
          description.includes(merchantText) ||
          merchantTokens.some((token) => description.includes(token));
      const amountMatches = Math.abs(amount - receiptAmount) < 0.02;
        const dateDistance = parsedReceiptDate && parsedTransactionDate
          ? Math.abs(dayDifference(toIsoDate(parsedTransactionDate), toIsoDate(parsedReceiptDate)))
          : 99;
        const dateMatches = !parsedReceiptDate || dateDistance <= 7;
        const score =
          (amountMatches ? 6 : Math.abs(amount - receiptAmount) <= 1 ? 3 : 0) +
          (merchantMatches ? 4 : 0) +
          (parsedReceiptDate ? Math.max(0, 3 - Math.min(dateDistance, 3)) : 1);

        return { transaction, amountMatches, merchantMatches, dateMatches, score, dateDistance };
      })
      .filter((item) => item.score >= 6 && item.dateMatches)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((item) => item.transaction);
  }

  function handleFileChange(event) {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    if (!keepFile) setKeepFile(true);

    const guess = guessFromFileName(selectedFile.name);
    if (guess.guessedMerchant && !merchant) {
      setMerchant(guess.guessedMerchant);
    } else if (!merchant) {
      setMerchant(selectedFile.name.replace(/\.[^.]+$/, ""));
    }
  }

  function updateMerchant(value) {
    setMerchant(value);
    setMatch(findMatchingTransaction(value, total, receiptDate));
  }

  function updateTotal(value) {
    setTotal(value);
    setMatch(findMatchingTransaction(merchant, value, receiptDate));
  }

  function updateDate(value) {
    setReceiptDate(value);
    setMatch(findMatchingTransaction(merchant, total, value));
  }

  async function addReceipt() {
    if (!merchant.trim() && !file) {
      alert("Add a receipt name or upload a receipt first.");
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let fileUrl = null;
    let fileType = file?.type || null;

    if (file && keepFile) {
      const safeName = file.name.replace(/\s+/g, "-").toLowerCase();
      const filePath = `${user.id}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(filePath, file);

      if (uploadError) {
        setSaving(false);
        alert(uploadError.message);
        return;
      }

      const { data } = supabase.storage.from("receipts").getPublicUrl(filePath);
      fileUrl = data.publicUrl;
    }

    const displayName = merchant.trim() || file?.name.replace(/\.[^.]+$/, "") || "Saved receipt";
    const receiptSummary = match
      ? `Matched to transaction: ${match.description}`
      : file
      ? keepFile
        ? "Receipt saved for warranty or returns."
        : "Receipt added without keeping the file."
      : "Manual receipt added.";

    const { error } = await supabase.from("receipts").insert({
      user_id: user.id,
      transaction_id: match?.id || null,
      merchant: displayName,
      total: Number(total || 0),
      receipt_date: receiptDate || null,
      source: file ? "upload" : "manual",
      matched_status: match ? "matched" : "unmatched",
      file_url: fileUrl,
      file_type: fileType,
      ai_summary: receiptSummary,
    });

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    setMerchant("");
    setTotal("");
    setReceiptDate("");
    setFile(null);
    setKeepFile(false);
    setMatch(null);

    alert(match ? "Receipt saved and matched." : "Receipt saved.");
    onChange();
  }

  const receiptCounts = {
    all: receipts.length,
    warranty: receipts.filter((receipt) => Boolean(receipt.file_url)).length,
    matched: receipts.filter((receipt) => receipt.matched_status === "matched").length,
    manual: receipts.filter((receipt) => receipt.matched_status !== "matched").length,
  };
  const hasActiveFilters = Boolean(searchQuery.trim()) || receiptFilter !== "all";
  const receiptCandidates = findReceiptCandidates(merchant, total, receiptDate);
  const filteredReceipts = receipts.filter((receipt) => {
    const searchText = `${receipt.merchant || ""} ${receipt.ai_summary || ""} ${receipt.receipt_date || ""}`.toLowerCase();
    const matchesSearch = !searchQuery.trim() || searchText.includes(searchQuery.trim().toLowerCase());
    const matchesFilter =
      receiptFilter === "all"
        ? true
        : receiptFilter === "warranty"
        ? Boolean(receipt.file_url)
        : receiptFilter === "matched"
        ? receipt.matched_status === "matched"
        : receipt.matched_status !== "matched";
    return matchesSearch && matchesFilter;
  });

  const emptyStateText = receipts.length === 0
    ? "No receipts stored yet. Save one above and this becomes your warranty drawer."
    : searchQuery.trim()
    ? "No receipts match that search yet. Try a broader search or show all receipts."
    : receiptFilter === "warranty"
    ? "No warranty or kept-file receipts are stored yet."
    : receiptFilter === "matched"
    ? "No matched receipts yet. Once totals and dates line up, they show here."
    : receiptFilter === "manual"
    ? "No unmatched receipts right now."
    : "No receipts match that view yet.";

  function clearReceiptFilters() {
    setSearchQuery("");
    setReceiptFilter("all");
  }

  return (
    <>
      <Section
        title="Receipt Scanner"
        right={
          <button
            style={styles.ghostBtn}
            onClick={() =>
              onGoToCoach(
                'Help me set up a simple receipt system for warranties, returns, and proof of purchase using the app I already have.',
                { autoSend: true }
              )
            }
          >
            Ask AI how to use this
          </button>
        }
      >
        <p style={styles.sectionIntro}>
          Save receipts with a proper name so you can actually find them later for returns, warranties, or proof of purchase.
        </p>

        <input
          style={styles.input}
          type="file"
          accept="image/*,.pdf"
          onChange={handleFileChange}
        />

        {file && (
          <div style={styles.receiptPreview}>
            <strong>{file.name}</strong>
            <p style={styles.transactionMeta}>
              {file.type || "Unknown file type"} - {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
        )}

        <label style={styles.checkRow}>
          <input
            type="checkbox"
            checked={keepFile}
            onChange={(e) => setKeepFile(e.target.checked)}
          />
          <span>Keep image/PDF for warranty or returns</span>
        </label>

        <input
          style={styles.input}
          placeholder="Receipt name or merchant, e.g. AirPods Pro / Tesco"
          value={merchant}
          onChange={(e) => updateMerchant(e.target.value)}
        />

        <input
          style={styles.input}
          placeholder="Total"
          type="text"
          inputMode="decimal"
          value={total}
          onChange={(e) => updateTotal(e.target.value)}
        />

        <input
          style={styles.input}
          type="date"
          value={receiptDate}
          onChange={(e) => updateDate(e.target.value)}
        />

        {match && (
          <div style={styles.matchBox}>
            <strong>Matched transaction found</strong>
            <p style={styles.transactionMeta}>
              {match.description} - {match.transaction_date} - {formatCurrency(Math.abs(Number(match.amount || 0)))}
            </p>
          </div>
        )}

        {!match && receiptCandidates.length > 0 ? (
          <div style={styles.matchBox}>
            <strong>Possible payment matches</strong>
            <p style={styles.transactionMeta}>Pick the payment this receipt belongs to.</p>
            <div style={styles.inlineBtnRow}>
              {receiptCandidates.map((candidate) => (
                <button
                  key={candidate.id || `${candidate.transaction_date}-${candidate.description}-${candidate.amount}`}
                  type="button"
                  style={styles.secondaryInlineBtn}
                  onClick={() => setMatch(candidate)}
                >
                  {candidate.description} - {formatCurrency(Math.abs(Number(candidate.amount || 0)))}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <button style={styles.primaryBtn} onClick={addReceipt} disabled={saving}>
          {saving ? "Saving..." : match ? "Save Matched Receipt" : "Save Receipt"}
        </button>
      </Section>

      {receipts.length > 0 ? (
        <>
          <Section title="Find A Receipt Later">
            <input
              style={styles.input}
              placeholder="Search by receipt name, merchant, or date"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <p style={styles.smallMuted}>
              Saved {receiptCounts.all} - Warranty kept {receiptCounts.warranty} - Matched {receiptCounts.matched}
            </p>
            <div style={styles.actionChipWrap}>
              {[
                ["all", "All receipts"],
                ["warranty", "Warranty / kept files"],
                ["matched", "Matched"],
                ["manual", "Unmatched"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  style={{ ...styles.promptChip, ...(receiptFilter === key ? styles.modeChipActive : null) }}
                  onClick={() => setReceiptFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </Section>

          <Section
            title={hasActiveFilters ? `Saved Receipts (${filteredReceipts.length} of ${receipts.length})` : `Saved Receipts (${receipts.length})`}
            right={
              hasActiveFilters ? (
                <button style={styles.ghostBtn} type="button" onClick={clearReceiptFilters}>
                  Show all receipts
                </button>
              ) : null
            }
          >
            {filteredReceipts.length === 0 ? (
              <div>
                <p style={styles.emptyText}>{emptyStateText}</p>
                {hasActiveFilters ? (
                  <div style={styles.inlineBtnRow}>
                    <button style={styles.secondaryInlineBtn} type="button" onClick={clearReceiptFilters}>
                      Show all receipts
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              filteredReceipts.map((receipt) => (
                <div key={receipt.id} style={styles.signalCard}>
                  <div style={styles.signalHeader}>
                    <div>
                      <strong>{receipt.merchant || "Receipt"}</strong>
                      <p style={styles.transactionMeta}>
                        {receipt.receipt_date || "No date"} - {receipt.matched_status === "matched" ? "Matched" : "Unmatched"} - {receipt.file_url ? "File saved" : "Details only"}
                      </p>
                    </div>
                    <strong>{formatCurrency(receipt.total || 0)}</strong>
                  </div>
                  {receipt.ai_summary ? <p style={styles.signalBody}>{receipt.ai_summary}</p> : null}
                  <div style={styles.inlineBtnRow}>
                    {receipt.file_url ? (
                      <button style={styles.secondaryInlineBtn} type="button" onClick={() => window.open(receipt.file_url, '_blank', 'noopener,noreferrer')}>
                        Open file
                      </button>
                    ) : null}
                    <button
                      style={styles.secondaryInlineBtn}
                      type="button"
                      onClick={() =>
                        onGoToCoach(
                          `Help me work out whether I should keep this receipt and what it is most useful for: ${receipt.merchant || 'Receipt'} for ${formatCurrency(receipt.total || 0)} on ${receipt.receipt_date || 'unknown date'}.`,
                          { autoSend: true }
                        )
                      }
                    >
                      Ask AI
                    </button>
                  </div>
                </div>
              ))
            )}
          </Section>
        </>
      ) : (
        <Section title="Saved Receipts (0)">
          <p style={styles.emptyText}>No receipts saved yet. Once you keep one, this becomes the place to find warranty proof, return receipts, and old purchases fast.</p>
        </Section>
      )}
    </>
  );
}

function CoachPage({
  transactions,
  goals,
  debts,
  investments,
  debtSignals,
  investmentSignals,
  aiMessages,
  onChange,
  screenWidth,
  viewportHeight,
}) {
  const [message, setMessage] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(COACH_DRAFT_KEY) || "";
  });
  const [thinking, setThinking] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [chatError, setChatError] = useState("");
  const [freshCutoff, setFreshCutoff] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(COACH_FRESH_CUTOFF_KEY) || new Date().toISOString();
  });

  const chatBottomRef = useRef(null);
  const latestMessageRef = useRef(null);

  const totals = useMemo(() => getTotals(transactions), [transactions]);
  const topCategories = useMemo(() => getTopCategories(transactions), [transactions]);
  const subscriptionSummary = useMemo(() => getSubscriptionSummary(transactions), [transactions]);

  const houseGoal =
    goals.find((goal) =>
      String(goal.name || "").toLowerCase().includes("house")
    ) || null;

  const baseMessages = freshCutoff
    ? aiMessages.filter(
        (msg) => !msg.created_at || msg.created_at >= freshCutoff
      )
    : aiMessages;

  const visibleMessages = baseMessages.slice(-COACH_DISPLAY_LIMIT);
  const hiddenCount = Math.max(baseMessages.length - visibleMessages.length, 0);
  const hiddenOlderByFreshView = Math.max(aiMessages.length - baseMessages.length, 0);

  const quickPrompts = getCoachPromptIdeas({
    topCategories,
    houseGoal,
    debtSignals,
    investmentSignals,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const shouldAutoSend = localStorage.getItem(COACH_AUTOSEND_KEY) === "true";
    const draft = localStorage.getItem(COACH_DRAFT_KEY) || "";

    localStorage.removeItem(COACH_DRAFT_KEY);
    localStorage.removeItem(COACH_AUTOSEND_KEY);

    if (shouldAutoSend && draft.trim()) {
      sendMessage(draft);
    }
    // This only consumes a one-shot draft left by navigation into the coach.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (thinking) {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      return;
    }
    latestMessageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [visibleMessages, thinking]);

  async function sendMessage(nextMessage) {
    const text = String(nextMessage ?? message).trim();
    if (!text || thinking) return;

    setThinking(true);
    setChatError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      await supabase.from("ai_messages").insert({
        user_id: user.id,
        role: "user",
        content: text,
      });

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

      const context = {
        totals,
        transaction_count: transactions.length,
        recent_transactions: transactions.slice(0, 10),
        top_categories: topCategories.slice(0, 5),
        monthly_breakdown: getMonthlyBreakdown(transactions, "6m").slice(0, 6),
        calendar_pattern_summary: getCalendarPatternSummary(transactions, "6m"),
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

      const { data, error } = await supabase.functions.invoke("ai-coach", {
        body: {
          mode: "coach",
          message: text,
          context,
        },
      });

      if (error) {
        throw new Error(error.message || "AI request failed.");
      }

      await supabase.from("ai_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: data?.reply || "No reply received.",
      });

      setMessage("");
      await onChange();
    } catch (error) {
      setChatError(error.message || "Something went wrong sending that message.");
    } finally {
      setThinking(false);
    }
  }

  async function clearChat() {
    if (clearing || aiMessages.length === 0) return;

    const confirmed = window.confirm(
      "Clear your saved AI chat history? This removes the current conversation log."
    );

    if (!confirmed) return;

    setClearing(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("ai_messages")
        .delete()
        .eq("user_id", user.id);

      if (error) throw error;

      setFreshCutoff("");
      if (typeof window !== "undefined") {
        localStorage.removeItem(COACH_FRESH_CUTOFF_KEY);
      }

      await onChange();
    } catch (error) {
      setChatError(error.message || "Could not clear chat.");
    } finally {
      setClearing(false);
    }
  }

  function startFreshView() {
    const cutoff = new Date().toISOString();
    setFreshCutoff(cutoff);
    setChatError("");

    if (typeof window !== "undefined") {
      localStorage.setItem(COACH_FRESH_CUTOFF_KEY, cutoff);
    }
  }

  function showAllHistory() {
    setFreshCutoff("");
    setChatError("");

    if (typeof window !== "undefined") {
      localStorage.removeItem(COACH_FRESH_CUTOFF_KEY);
    }
  }

  return (
    <Section
      title="AI Money Coach"
      sectionStyle={getCoachSectionStyle(viewportHeight, screenWidth)}
      right={
        <div style={styles.sectionActions}>
          <button
            style={styles.ghostBtn}
            onClick={freshCutoff ? showAllHistory : startFreshView}
            disabled={thinking}
          >
            {freshCutoff ? "Show history" : "Fresh chat"}
          </button>

          <button
            style={styles.ghostBtn}
            onClick={clearChat}
            disabled={clearing || aiMessages.length === 0}
          >
            {clearing ? "Clearing..." : "Clear chat"}
          </button>
        </div>
      }
    >
      <div style={styles.coachShell}>
        <div style={styles.coachStatusCard}>
          <div>
            <p style={styles.insightLabel}>Coach status</p>
            <h4 style={styles.coachStatusTitle}>
              {thinking ? "Thinking through it now" : "Ready for a money sanity check"}
            </h4>
            <p style={styles.insightBody}>
              {freshCutoff
                ? "Fresh session view is on. Older messages are hidden by default, not deleted."
                : "Short answers first, practical actions next, no fake numbers."}
            </p>
          </div>
        </div>

        <div style={getQuickPromptRowStyle(screenWidth)}>
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              style={styles.promptChip}
              onClick={() => sendMessage(prompt)}
              disabled={thinking}
            >
              {prompt}
            </button>
          ))}
        </div>

        <div style={getChatMessagesStyle(viewportHeight, screenWidth)}>
          {freshCutoff && hiddenOlderByFreshView > 0 && (
            <div style={styles.historyNote}>
              Fresh chat view is hiding {hiddenOlderByFreshView} older message
              {hiddenOlderByFreshView === 1 ? "" : "s"}.
            </div>
          )}

          {!freshCutoff && hiddenCount > 0 && (
            <div style={styles.historyNote}>
              Showing latest {visibleMessages.length} messages. Older chat is
              hidden to keep things tidy.
            </div>
          )}

          {chatError && <div style={styles.errorNote}>{chatError}</div>}

          {visibleMessages.length === 0 ? (
            <div style={getEmptyCoachStateStyle(viewportHeight, screenWidth)}>
              <p style={styles.emptyCoachTitle}>Ask me anything about your money.</p>
              <p style={styles.emptyText}>
                Try spending checks, debt questions, investing sanity checks, or
                asking whether you are getting better or worse over time.
              </p>
            </div>
          ) : (
            visibleMessages.map((msg, index) => (
              <div
                key={msg.id || `${msg.role}-${msg.created_at}-${index}`}
                ref={index === visibleMessages.length - 1 ? latestMessageRef : null}
              >
                <ChatMessage msg={msg} />
              </div>
            ))
          )}

          {thinking && (
            <div style={styles.aiBubbleModern}>
              <div style={styles.chatMetaRow}>
                <span style={styles.chatRoleLabel}>AI Coach</span>
                <span style={styles.chatTimeLabel}>now</span>
              </div>
              Thinking...
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        <div style={getChatInputBarStyle(screenWidth)}>
          <input
            style={styles.chatInput}
            placeholder="Ask about your money..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
          />

          <button
            style={getChatSendBtnStyle(screenWidth)}
            onClick={() => sendMessage()}
            disabled={thinking || !message.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </Section>
  );
}

function SettingsPage({
  viewerAccess,
  onViewerChange,
  viewerMode,
  setViewerMode,
  financialDocuments,
}) {
  const [viewerEmail, setViewerEmail] = useState("");
  const [viewerLabel, setViewerLabel] = useState("");
  const [sharing, setSharing] = useState(false);

  async function addViewer() {
    if (!viewerEmail.trim()) return;

    setSharing(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("viewer_access").insert({
        user_id: user.id,
        viewer_email: viewerEmail.trim().toLowerCase(),
        label: viewerLabel.trim() || null,
        role: "viewer",
        invite_status: "pending",
      });

      if (error) throw error;

      setViewerEmail("");
      setViewerLabel("");
      await onViewerChange();
      alert("Viewer added. Once the other person has an account, this can become a proper shared read-only view.");
    } catch (error) {
      alert(error.message || "Could not add viewer yet.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <Section title="Family / Viewer Mode">
        <p style={styles.sectionIntro}>
          Shared viewer mode is now wired in as a read-only access layer.
          Use it for parents, partner, or anyone who should see progress without editing anything.
        </p>

        <label style={styles.checkRow}>
          <input
            type="checkbox"
            checked={viewerMode}
            onChange={(e) => setViewerMode(e.target.checked)}
          />
          <span>Preview the app in viewer mode</span>
        </label>

        <input
          style={styles.input}
          placeholder="Viewer email"
          value={viewerEmail}
          onChange={(e) => setViewerEmail(e.target.value)}
        />
        <input
          style={styles.input}
          placeholder="Label, e.g. Mum or Partner"
          value={viewerLabel}
          onChange={(e) => setViewerLabel(e.target.value)}
        />
        <button style={styles.primaryBtn} onClick={addViewer} disabled={sharing}>
          {sharing ? "Adding..." : "Add Viewer"}
        </button>
      </Section>

      <Section title="Current Viewer Access">
        {viewerAccess.length === 0 ? (
          <p style={styles.emptyText}>No viewers added yet.</p>
        ) : (
          viewerAccess.map((item) => (
            <Row
              key={item.id}
              name={`${item.label || item.viewer_email} (${item.role || "viewer"})`}
              value={item.invite_status || "pending"}
            />
          ))
        )}
      </Section>

      <Section title="Documents And Extraction">
        <Row name="Saved finance documents" value={`${financialDocuments.length}`} />
        <Row name="Image extraction" value="Live" />
        <Row name="PDF storage" value="Live" />
      </Section>

      <Section title="Product Direction">
        <Row name="Statement-first setup" value="Core" />
        <Row name="Bulk multi-statement upload" value="Live" />
        <Row name="Recurring payment inference" value="Live" />
        <Row name="Debt/investment smart tracking" value="Live" />
        <Row name="Live market pricing" value="Live" />
        <Row name="Viewer mode" value="Live" />
      </Section>
    </>
  );
}

function BottomNav({ page, setPage, screenWidth }) {
  const items = [
    ["today", "Home"],
    ["upload", "Upload"],
    ["debts", "Debts"],
    ["investments", "Invest"],
    ["accounts", "Accounts"],
    ["calendar", "Cal"],
    ["goals", "Goals"],
    ["receipts", "Receipts"],
    ["coach", "AI"],
    ["settings", "More"],
  ];

  return (
    <nav style={getNavStyle(screenWidth)}>
      {items.map((item) => {
        const isActive = page === item[0];

        return (
          <button
            key={item[0]}
            onClick={() => setPage(item[0])}
            style={{
              ...styles.navBtn,
              ...(isActive ? styles.navBtnActive : {}),
            }}
          >
            {item[1]}
          </button>
        );
      })}
    </nav>
  );
}

function Section({ title, children, right, sectionStyle }) {
  return <BaseSection title={title} right={right} sectionStyle={sectionStyle} styles={styles}>{children}</BaseSection>;
}

function MiniCard({ title, value }) {
  return <BaseMiniCard title={title} value={value} styles={styles} />;
}

function Row({ name, value }) {
  return <BaseRow name={name} value={value} styles={styles} />;
}

function TransactionRow({ name, meta, amount }) {
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

function StatPill({ label, value }) {
  return (
    <div style={styles.statPill}>
      <span style={styles.statPillLabel}>{label}</span>
      <strong style={styles.statPillValue}>{value}</strong>
    </div>
  );
}

function InsightCard({ label, headline, body, onClick, ctaLabel }) {
  return <BaseInsightCard label={label} headline={headline} body={body} onClick={onClick} ctaLabel={ctaLabel} styles={styles} />;
}

function ActionCard({ label, headline, body, actionLabel, onClick }) {
  return <BaseActionCard label={label} headline={headline} body={body} actionLabel={actionLabel} onClick={onClick} styles={styles} />;
}

function ChatMessage({ msg }) {
  const isUser = msg.role === "user";

  return (
    <div style={isUser ? styles.userBubbleModern : styles.aiBubbleModern}>
      <div style={styles.chatMetaRow}>
        <span style={styles.chatRoleLabel}>{isUser ? "You" : "AI Coach"}</span>
        <span style={styles.chatTimeLabel}>{formatChatTime(msg.created_at)}</span>
      </div>
      {msg.content}
    </div>
  );
}

function isGenericCategory(category) {
  return ["", "Income", "Spending", "Uncategorised"].includes(String(category || "").trim());
}

function getTransactionMerchantKey(description) {
  return normalizeText(description)
    .replace(/(?:^|\s)(card|payment|debit|credit|contactless|visa|pos|purchase|transaction|fpi|ref|dd|so)(?=\s|$)/g, " ")
    .replace(/(?:^|\s)\d{2,}(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMeaningfulCategory(transaction) {
  return transaction?._smart_category || transaction?.category || (Number(transaction?.amount || 0) > 0 ? "Income" : "Spending");
}

function getCashSummary(accounts, transactions) {
  const balanceFields = ["available_balance", "current_balance", "balance", "available", "current"];
  const balances = accounts
    .map((account) => {
      for (const field of balanceFields) {
        const value = account?.[field];
        if (value === null || value === undefined || value === "") continue;
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) return parsed;
      }
      return null;
    })
    .filter((value) => value !== null);

  const freshness = getDataFreshness(transactions);

  if (balances.length > 0) {
    const total = balances.reduce((sum, value) => sum + Number(value || 0), 0);
    const looksStale = Math.abs(total) < 0.01 && freshness.hasData && !freshness.hasCurrentMonthData;

    if (!looksStale) {
      return {
        hasLiveBalances: true,
        amount: total,
        primaryDisplay: formatCurrency(total),
        label: "Cash in your accounts",
        badge: total <= 25 ? "Tight right now" : "Balance-based",
        body:
          total <= 25
            ? "This is the money your accounts say you have right now, so spending room looks genuinely tight today."
            : "This is the latest balance we know across your linked accounts, so it is more honest than a guess from historic spending alone.",
      };
    }
  }

  if (freshness.needsUpload) {
    return {
      hasLiveBalances: false,
      amount: 0,
      primaryDisplay: "Needs refresh",
      label: "Recent data needed",
      badge: "Refresh needed",
      body: freshness.hasData
        ? `The app can still read up to ${freshness.latestMonthLabel}, but today's view, calendar, and AI advice all get sharper once you upload your latest statement.`
        : "Upload your first statement so Money Hub can build a real picture instead of guessing.",
    };
  }

  const monthSnapshot = getDisplayedMonthSnapshot(transactions);

  return {
    hasLiveBalances: false,
    amount: monthSnapshot.net,
    primaryDisplay: formatCurrency(monthSnapshot.net),
    label: `${monthSnapshot.monthName} net movement`,
    badge: "Imported pattern",
    body:
      "This is based on imported statement history rather than a live bank balance, so treat it as a pattern read rather than spendable cash.",
  };
}

function getSubscriptionSummary(transactions) {
  const groups = {};

  transactions.forEach((transaction) => {
    if (Number(transaction.amount) >= 0 || !transaction.is_subscription) return;
    const name = cleanEventTitle(transaction.description || "Subscription");
    if (!groups[name]) {
      groups[name] = { name, total: 0, count: 0 };
    }

    groups[name].total += Math.abs(Number(transaction.amount || 0));
    groups[name].count += 1;
  });

  const items = Object.values(groups).sort((a, b) => b.total - a.total);

  return {
    count: items.length,
    items,
    topLine: items.length > 0 ? `${items[0].name} is the biggest obvious one at ${formatCurrency(items[0].total)}.` : "",
  };
}

function buildSubscriptionCoachPrompt(subscriptionSummary) {
  if (!subscriptionSummary?.items?.length) {
    return "Do I have any subscription-style payments hiding in my imported statements?";
  }

  const lines = subscriptionSummary.items
    .slice(0, 8)
    .map((item) => `- ${item.name}: ${formatCurrency(item.total)} across ${item.count} hit${item.count === 1 ? "" : "s"}`)
    .join("\n");

  return `Review my subscription-style payments and rank the easiest ones to cancel first. Use this detected list and be specific:\n${lines}\n\nTell me: 1. biggest totals, 2. easiest quick wins, 3. any that look duplicated or suspicious.`;
}

function getMonthSnapshotForDate(transactions, viewDate = new Date()) {
  const monthTransactions = transactions.filter((transaction) => isTransactionInMonth(transaction, viewDate));
  const settled = monthTransactions.filter((transaction) => !isInternalTransferLike(transaction));
  const income = settled
    .filter((transaction) => Number(transaction.amount) > 0)
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const spending = settled
    .filter((transaction) => Number(transaction.amount) < 0)
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
  const net = income - spending;
  const activeDays = new Set(settled.map((transaction) => transaction.transaction_date).filter(Boolean)).size;
  const biggestSpend = settled
    .filter((transaction) => Number(transaction.amount) < 0)
    .reduce((biggest, transaction) => Math.max(biggest, Math.abs(Number(transaction.amount || 0))), 0);

  return {
    income,
    spending,
    net,
    activeDays,
    biggestSpend,
    biggestSpendLabel: biggestSpend > 0 ? formatCurrency(biggestSpend) : "Nothing big yet",
    monthDate: startOfMonth(viewDate),
    monthName: formatMonthYear(viewDate),
  };
}

function getCurrentMonthSnapshot(transactions) {
  const base = getMonthSnapshotForDate(transactions, new Date());

  return {
    ...base,
    isCurrent: true,
    needsRefresh: false,
    label: "This month",
    pillLabel: "This month",
    sectionTitle: "This Month",
    headline: base.net >= 0 ? `Up ${formatCurrency(base.net)} so far this month` : `Down ${formatCurrency(Math.abs(base.net))} so far this month`,
    body: `${base.activeDays} active day${base.activeDays === 1 ? "" : "s"} so far, with ${formatCurrency(base.income)} in and ${formatCurrency(base.spending)} out.`,
  };
}

function getDisplayedMonthSnapshot(transactions) {
  const freshness = getDataFreshness(transactions);

  if (!freshness.hasData) {
    return {
      ...getCurrentMonthSnapshot(transactions),
      headline: "No statement data yet",
      body: "Upload your first bank statement to unlock this month and category insights.",
    };
  }

  if (freshness.hasCurrentMonthData) {
    return getCurrentMonthSnapshot(transactions);
  }

  const base = getMonthSnapshotForDate(transactions, freshness.latestDate);

  return {
    ...base,
    isCurrent: false,
    needsRefresh: true,
    label: "Latest visible month",
    pillLabel: "Latest month",
    sectionTitle: "Latest Visible Month",
    headline: `${base.monthName} is the latest visible month`,
    body: "No current-month activity is visible here yet. Upload your latest statement so today's view stops looking empty.",
  };
}

function getStatementCoverageSummary(transactions, statementImports = []) {
  const validDates = transactions
    .map((transaction) => parseAppDate(transaction.transaction_date))
    .filter(Boolean)
    .sort((a, b) => a - b);
  const statementEndDates = (Array.isArray(statementImports) ? statementImports : [])
    .map((item) => parseAppDate(item?.end_date || item?.endDate || item?.start_date || item?.created_at))
    .filter(Boolean)
    .sort((a, b) => a - b);
  const importedFileCount = Array.isArray(statementImports) && statementImports.length > 0
    ? statementImports.length
    : new Set(transactions.map((transaction) => transaction.import_id).filter(Boolean)).size;

  if (validDates.length === 0) {
    return {
      hasData: false,
      monthCount: 0,
      monthCountLabel: "0 months",
      fileCount: importedFileCount,
      rangeLabel: "No history yet",
      headline: "Upload your first statement",
      body: "One statement gives Money Hub a first read. Three or more months unlock better recurring bills, trend reads, and AI advice.",
      nextUnlock: "Your first statement unlocks categories, calendar history, and AI reads.",
      latestStatementMonthLabel: statementEndDates.length ? formatMonthYear(statementEndDates[statementEndDates.length - 1]) : "",
      latestTransactionMonthLabel: "",
      hasCoverageGap: false,
    };
  }

  const monthKeys = [...new Set(validDates.map((date) => `${date.getFullYear()}-${date.getMonth() + 1}`))];
  const monthCount = monthKeys.length;
  const earliestDate = validDates[0];
  const latestDate = validDates[validDates.length - 1];
  const latestStatementDate = statementEndDates[statementEndDates.length - 1] || null;
  const coverageGapDays = latestStatementDate
    ? Math.round((startOfDay(latestStatementDate).getTime() - startOfDay(latestDate).getTime()) / 86400000)
    : 0;
  const hasCoverageGap = coverageGapDays > 14;

  let headline = "Strong history loaded";
  let body = "You already have enough history for believable pattern reads, so new uploads mostly keep the app fresh.";
  let nextUnlock = "Keep adding the newest statement so the current month stays accurate.";

  if (monthCount === 1) {
    headline = "One month loaded so far";
    body = "A second and third month will make recurring bills, salary rhythm, and subscription checks much sharper.";
    nextUnlock = "Two more months should unlock much better recurring payment detection.";
  } else if (monthCount < 3) {
    headline = `${monthCount} months loaded so far`;
    body = "You are past the first read now. One more month should make trends, recurring charges, and AI advice feel far less flimsy.";
    nextUnlock = "One more month should make recurring reads and trends much steadier.";
  } else if (monthCount < 6) {
    headline = `${monthCount} months of history is a good base`;
    body = "Recurring bills, subscriptions, and month-vs-month changes are believable now. More months will make salary rhythm and unusual-spend reads steadier.";
    nextUnlock = "More history now mostly sharpens pattern confidence and calendar reads.";
  }

  if (hasCoverageGap) {
    headline = "One of your latest uploads may need checking";
    body = `The uploaded statement range reaches ${formatMonthYear(latestStatementDate)}, but the saved visible transactions currently stop at ${formatMonthYear(latestDate)}.`;
    nextUnlock = "Re-upload or check the latest CSV mapping so the visible history catches up with the uploaded statement range.";
  }

  return {
    hasData: true,
    monthCount,
    monthCountLabel: `${monthCount} month${monthCount === 1 ? "" : "s"}`,
    fileCount: importedFileCount,
    rangeLabel: `${formatMonthYear(earliestDate)} to ${formatMonthYear(latestDate)}`,
    headline,
    body,
    nextUnlock,
    latestStatementMonthLabel: latestStatementDate ? formatMonthYear(latestStatementDate) : "",
    latestTransactionMonthLabel: formatMonthYear(latestDate),
    hasCoverageGap,
    coverageGapDays,
  };
}

function getDataFreshness(transactions) {
  const validDates = transactions
    .map((transaction) => parseAppDate(transaction.transaction_date))
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (validDates.length === 0) {
    return {
      hasData: false,
      hasCurrentMonthData: false,
      latestDate: null,
      latestMonthLabel: "",
      latestDateLabel: "",
      daysSinceLatest: null,
      needsUpload: true,
    };
  }

  const latestDate = validDates[validDates.length - 1];
  const today = startOfDay(new Date());
  const latestDay = startOfDay(latestDate);
  const daysSinceLatest = Math.max(Math.round((today.getTime() - latestDay.getTime()) / 86400000), 0);
  const hasCurrentMonthData = validDates.some((date) => isThisMonth(toIsoDate(date)));

  return {
    hasData: true,
    hasCurrentMonthData,
    latestDate,
    latestMonthLabel: formatMonthYear(latestDate),
    latestDateLabel: formatDateShort(latestDate),
    daysSinceLatest,
    needsUpload: !hasCurrentMonthData || daysSinceLatest > 35,
  };
}

function getTotals(transactions) {
  const income = transactions
    .filter((t) => Number(t.amount) > 0 && !isInternalTransferLike(t))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const spending = transactions
    .filter((t) => Number(t.amount) < 0 && !isInternalTransferLike(t))
    .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);

  const bills = transactions
    .filter((t) => t.is_bill || t.is_subscription)
    .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);

  const net = income - spending;

  return { income, spending, bills, net, safeToSpend: 0 };
}

function getTopCategories(transactions) {
  const totals = {};

  transactions.forEach((t) => {
    if (Number(t.amount) >= 0 || isInternalTransferLike(t)) return;

    const category = getMeaningfulCategory(t) || "Uncategorised";
    totals[category] = (totals[category] || 0) + Math.abs(Number(t.amount || 0));
  });

  return Object.entries(totals)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
}

function enhanceTransactions(transactions) {
  const prepared = transactions.map((transaction) => ({
    ...transaction,
    amount: Number(transaction.amount || 0),
  }));

  const incomingByAmount = new Map();
  const outgoingByAmount = new Map();
  const merchantCategoryVotes = new Map();

  prepared.forEach((transaction) => {
    if (transaction.amount !== 0) {
      const key = Math.abs(transaction.amount).toFixed(2);
      const amountMap = transaction.amount > 0 ? incomingByAmount : outgoingByAmount;
      if (!amountMap.has(key)) amountMap.set(key, []);
      amountMap.get(key).push(transaction);
    }

    const category = String(transaction.category || "").trim();
    const merchantKey = getTransactionMerchantKey(transaction.description);

    if (!merchantKey || isGenericCategory(category) || transaction.amount >= 0) return;

    if (!merchantCategoryVotes.has(merchantKey)) {
      merchantCategoryVotes.set(merchantKey, {});
    }

    const votes = merchantCategoryVotes.get(merchantKey);
    votes[category] = (votes[category] || 0) + 1;
  });

  function getLearnedCategory(description) {
    const merchantKey = getTransactionMerchantKey(description);
    if (!merchantKey || !merchantCategoryVotes.has(merchantKey)) return "";

    const votes = merchantCategoryVotes.get(merchantKey);
    const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];

    if (!winner || winner[1] < 2) return "";
    return winner[0];
  }

  return prepared.map((transaction) => {
    const existingFlag = Boolean(transaction.is_internal_transfer);
    let smartInternalTransfer = existingFlag;

    if (!existingFlag && transaction.amount !== 0) {
      const key = Math.abs(transaction.amount).toFixed(2);
      const possibleMatches = transaction.amount < 0
        ? incomingByAmount.get(key) || []
        : outgoingByAmount.get(key) || [];
      const match = possibleMatches.find((candidate) => {
        if (candidate.account_id === transaction.account_id) return false;
        const dayDiff = Math.abs(dayDifference(candidate.transaction_date, transaction.transaction_date));
        return dayDiff <= 3;
      });

      const description = normalizeText(transaction.description);
      const forcedByText = /transfer|faster payment|standing order|to savings|from savings|own account|between accounts|bank transfer/.test(description);
      smartInternalTransfer = forcedByText || Boolean(match);
    }

    let smartCategory = String(transaction.category || "").trim();

    if (smartInternalTransfer) {
      smartCategory = "Internal Transfer";
    } else if (isGenericCategory(smartCategory)) {
      const learnedCategory = getLearnedCategory(transaction.description);
      if (learnedCategory) {
        smartCategory = learnedCategory;
      }
    }

    if (!smartCategory) {
      smartCategory = transaction.amount > 0 ? "Income" : "Spending";
    }

    return {
      ...transaction,
      _smart_internal_transfer: smartInternalTransfer,
      _smart_category: smartCategory,
    };
  });
}

function isInternalTransferLike(transaction) {
  return Boolean(transaction?._smart_internal_transfer || transaction?.is_internal_transfer);
}

function getTransferSummary(transactions) {
  const transfers = transactions.filter((transaction) => isInternalTransferLike(transaction));
  const total = transfers.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);

  return {
    headline: transfers.length > 0 ? `${transfers.length} transfer-like movement${transfers.length === 1 ? "" : "s"} spotted` : "No obvious transfer loops yet",
    body: transfers.length > 0 ? `About £${total.toFixed(2)} looks more like money moving between accounts than true spend or income.` : "Once multiple accounts are loaded, the app can strip more fake income and fake spending out of the picture.",
    transfers,
  };
}

function summariseRowsForImport(rows) {
  const validDates = rows
    .map((row) => parseAppDate(row.date))
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (validDates.length === 0) {
    return { startDate: "", endDate: "", monthCount: 0, fullMonthCount: 0 };
  }

  const startDate = toIsoDate(validDates[0]);
  const endDate = toIsoDate(validDates[validDates.length - 1]);
  const monthGroups = new Map();
  validDates.forEach((date) => {
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    if (!monthGroups.has(key)) monthGroups.set(key, new Set());
    monthGroups.get(key).add(date.getDate());
  });
  const fullishMonths = [...monthGroups.entries()].filter(([key, days]) => {
    const [year, month] = key.split("-").map(Number);
    const monthLength = daysInMonth(year, month - 1);
    return days.size >= Math.min(20, monthLength - 4);
  });

  return {
    startDate,
    endDate,
    monthCount: monthGroups.size,
    fullMonthCount: fullishMonths.length,
  };
}

function getImportFingerprint(fileName, rows) {
  const summary = summariseRowsForImport(rows);
  const head = rows.slice(0, 3).map((row) => `${row.date}|${row.description}|${row.amount}`).join("||");
  const tail = rows.slice(-3).map((row) => `${row.date}|${row.description}|${row.amount}`).join("||");
  return normalizeText(`${fileName}|${rows.length}|${summary.startDate}|${summary.endDate}|${head}|${tail}`);
}

function getImportOverlapSummary(rows, existingTransactions) {
  if (!rows.length || !existingTransactions.length) {
    return { count: 0, ratio: 0 };
  }

  const existingKeys = new Set(
    existingTransactions.map((transaction) =>
      normalizeText(`${transaction.transaction_date}|${transaction.description}|${Number(transaction.amount || 0).toFixed(2)}`)
    )
  );

  const overlapCount = rows.filter((row) =>
    existingKeys.has(normalizeText(`${row.date}|${row.description}|${Number(row.amount || 0).toFixed(2)}`))
  ).length;

  return {
    count: overlapCount,
    ratio: rows.length ? overlapCount / rows.length : 0,
  };
}

function getTransactionConfidence(row) {
  if (row.category === "Income" || row.category === "Bill" || row.category === "Subscription") {
    return 0.88;
  }
  if (row.category === "Internal Transfer") {
    return 0.84;
  }
  return 0.72;
}

function formatDateRange(startDate, endDate) {
  if (!startDate && !endDate) return "date range not obvious";
  if (startDate && endDate) return `${startDate} to ${endDate}`;
  return startDate || endDate;
}

function dayDifference(a, b) {
  const first = new Date(a);
  const second = new Date(b);
  if (Number.isNaN(first.getTime()) || Number.isNaN(second.getTime())) return 999;
  return Math.round((first - second) / 86400000);
}

function toIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDebtProgressSummary(debt, transactions) {
  const keywords = getRecordKeywords(debt.payment_keywords, debt.name, debt.lender);
  const thisMonthPayments = transactions.filter((transaction) => {
    if (Number(transaction.amount) >= 0) return false;
    if (!isThisMonth(transaction.transaction_date)) return false;
    const text = normalizeText(transaction.description);
    return keywords.some((keyword) => keyword && text.includes(keyword));
  });

  const monthlyPaid = thisMonthPayments.reduce(
    (sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)),
    0
  );
  const minimum = Number(debt.minimum_payment || 0);
  const currentBalance = Number(debt.current_balance || 0);
  const monthlyPaidLabel = monthlyPaid > 0 ? `£${monthlyPaid.toFixed(2)}` : "nothing matched yet";
  const paceLabel = minimum > 0 ? (monthlyPaid >= minimum ? "on or above minimum" : "below minimum so far") : "minimum not set";
  const monthlyRate = Number(debt.interest_rate || 0) / 100 / 12;

  let payoffLabel = "not enough data";
  if (currentBalance > 0 && minimum > currentBalance) {
    payoffLabel = "could clear next month at current pace";
  } else if (currentBalance > 0 && minimum > 0) {
    const paymentPower = Math.max(minimum - currentBalance * monthlyRate, 0);
    if (paymentPower > 0) {
      const months = Math.ceil(currentBalance / paymentPower);
      payoffLabel = months <= 1 ? "very close to clear" : `about ${months} months at current pace`;
    } else {
      payoffLabel = "interest may be outpacing the minimum";
    }
  }

  return { monthlyPaid, monthlyPaidLabel, paceLabel, payoffLabel };
}

function getInvestmentPerformanceSummary(investment) {
  const livePrice = Number(investment.live_price || 0);
  const units = Number(investment.units_owned || 0);
  const currentValue = Number(investment.current_value || 0);
  const totalContributed = Number(investment.total_contributed || 0);
  const marketValue = livePrice > 0 && units > 0 ? livePrice * units : currentValue;
  const gainLoss = marketValue > 0 && totalContributed > 0 ? marketValue - totalContributed : null;

  return {
    marketValue,
    marketValueLabel: marketValue > 0 ? `£${marketValue.toFixed(2)}` : "Value later",
    gainLossLabel:
      gainLoss == null
        ? "not enough data"
        : gainLoss >= 0
        ? `up £${gainLoss.toFixed(2)}`
        : `down £${Math.abs(gainLoss).toFixed(2)}`,
  };
}

function getDebtPortfolioSnapshot(debts, transactions) {
  const progress = debts.map((debt) => getDebtProgressSummary(debt, transactions));
  return {
    totalBalance: debts.reduce((sum, debt) => sum + Number(debt.current_balance || 0), 0),
    totalMinimum: debts.reduce((sum, debt) => sum + Number(debt.minimum_payment || 0), 0),
    totalPaidThisMonth: progress.reduce((sum, item) => sum + item.monthlyPaid, 0),
    behindCount: progress.filter((item) => item.paceLabel.includes("below")).length,
  };
}

function getInvestmentPortfolioSnapshot(investments) {
  const performance = investments.map((investment) => getInvestmentPerformanceSummary(investment));
  const marketValue = performance.reduce((sum, item) => sum + Number(item.marketValue || 0), 0);
  const totalContributed = investments.reduce((sum, investment) => sum + Number(investment.total_contributed || 0), 0);
  const gainLoss = marketValue > 0 && totalContributed > 0 ? marketValue - totalContributed : 0;
  const pricedCount = investments.filter((investment) => Number(investment.live_price || 0) > 0).length;

  return {
    marketValue,
    totalContributed,
    gainLoss,
    pricedCount,
  };
}

function getCalendarSummaryGridStyle(screenWidth) {
  return {
    ...styles.grid,
    marginBottom: "14px",
    gridTemplateColumns: screenWidth <= 480 ? "1fr 1fr" : "repeat(4, 1fr)",
  };
}

function getRollingDaysGridStyle(screenWidth, dayCount) {
  if (dayCount <= 1) {
    return {
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: "8px",
    };
  }

  if (dayCount <= 7) {
    return {
      display: "grid",
      gridTemplateColumns: screenWidth <= 768 ? "repeat(2, minmax(0, 1fr))" : `repeat(${dayCount}, minmax(0, 1fr))`,
      gap: "8px",
    };
  }

  return {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    gap: "8px",
  };
}

function parseAppDate(value) {
  if (!value) return null;

  function buildDate(year, month, day) {
    const next = new Date(Number(year), Number(month) - 1, Number(day));
    if (
      Number.isNaN(next.getTime()) ||
      next.getFullYear() !== Number(year) ||
      next.getMonth() !== Number(month) - 1 ||
      next.getDate() !== Number(day)
    ) {
      return null;
    }
    return new Date(next.getFullYear(), next.getMonth(), next.getDate());
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim();

  const isoMatch = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return buildDate(year, month, day);
  }

  const compactMatch = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const [, year, month, day] = compactMatch;
    return buildDate(year, month, day);
  }

  const slashMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    let [, first, second, year] = slashMatch;
    const firstNum = Number(first);
    const secondNum = Number(second);
    const yearNum = year.length === 2 ? 2000 + Number(year) : Number(year);

    if (firstNum > 12 && secondNum <= 12) {
      return buildDate(yearNum, secondNum, firstNum);
    }

    if (secondNum > 12 && firstNum <= 12) {
      return buildDate(yearNum, firstNum, secondNum);
    }

    return buildDate(yearNum, secondNum, firstNum);
  }

  const monthNameMatch = normalized.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})$/);
  if (monthNameMatch) {
    const [, day, monthName, year] = monthNameMatch;
    const parsed = new Date(`${day} ${monthName} ${year.length === 2 ? `20${year}` : year}`);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return startOfDay(next);
}

function compareDayDates(a, b) {
  return startOfDay(a).getTime() - startOfDay(b).getTime();
}

function clampDayToRange(date, bounds) {
  const next = startOfDay(date);
  if (compareDayDates(next, bounds.start) < 0) return bounds.start;
  if (compareDayDates(next, bounds.end) > 0) return bounds.end;
  return next;
}

function canShiftShortWindow(endDate, bounds, windowSize, direction) {
  const candidateEnd = addDays(endDate, direction * windowSize);
  const candidateStart = addDays(candidateEnd, -(windowSize - 1));
  if (direction < 0) return compareDayDates(candidateStart, bounds.start) >= 0;
  return compareDayDates(candidateEnd, bounds.end) <= 0;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function compareMonthDates(a, b) {
  return a.getFullYear() * 12 + a.getMonth() - (b.getFullYear() * 12 + b.getMonth());
}

function getTimeframeStartDate(timeframe, referenceDate = new Date()) {
  if (timeframe === "all") return null;
  const monthsBack = {
    "1m": 1,
    "3m": 3,
    "6m": 6,
    "12m": 12,
  }[timeframe] || 6;
  return new Date(referenceDate.getFullYear(), referenceDate.getMonth() - (monthsBack - 1), 1);
}

function getCalendarMonthBounds(transactions, timeframe) {
  const validDates = transactions
    .map((transaction) => parseAppDate(transaction.transaction_date))
    .filter(Boolean)
    .sort((a, b) => a - b);

  const todayMonth = startOfMonth(new Date());
  const earliestMonth = validDates.length ? startOfMonth(validDates[0]) : todayMonth;
  const latestMonth = validDates.length ? startOfMonth(validDates[validDates.length - 1]) : todayMonth;
  const timeframeStart = getTimeframeStartDate(timeframe, latestMonth);
  const start = timeframeStart && compareMonthDates(timeframeStart, earliestMonth) > 0 ? timeframeStart : earliestMonth;

  return {
    start,
    end: latestMonth,
    startKey: `${start.getFullYear()}-${start.getMonth()}`,
    endKey: `${latestMonth.getFullYear()}-${latestMonth.getMonth()}`,
  };
}

function clampMonthToRange(viewDate, bounds) {
  const monthDate = startOfMonth(viewDate);
  if (compareMonthDates(monthDate, bounds.start) < 0) return bounds.start;
  if (compareMonthDates(monthDate, bounds.end) > 0) return bounds.end;
  return monthDate;
}

function canShiftCalendarMonth(viewDate, bounds, direction) {
  const candidate = new Date(viewDate.getFullYear(), viewDate.getMonth() + direction, 1);
  return compareMonthDates(candidate, bounds.start) >= 0 && compareMonthDates(candidate, bounds.end) <= 0;
}

function isShortTimeframe(timeframe) {
  return ["1d", "1w", "2w"].includes(timeframe);
}

function getTimeframeDayCount(timeframe) {
  return {
    "1d": 1,
    "1w": 7,
    "2w": 14,
  }[timeframe] || 0;
}

function getTimeframeMonthCount(timeframe) {
  return {
    "1d": 0,
    "1w": 0,
    "2w": 0,
    "1m": 1,
    "3m": 3,
    "6m": 6,
    "12m": 12,
    all: 1,
  }[timeframe] || 1;
}

function getEarliestHistoryDate(transactions) {
  const validDates = transactions
    .map((transaction) => parseAppDate(transaction.transaction_date))
    .filter(Boolean)
    .sort((a, b) => a - b);
  return validDates.length ? startOfDay(validDates[0]) : startOfDay(new Date());
}

function getLatestHistoryDate(transactions) {
  const validDates = transactions
    .map((transaction) => parseAppDate(transaction.transaction_date))
    .filter(Boolean)
    .sort((a, b) => a - b);
  const today = startOfDay(new Date());
  return validDates.length ? startOfDay(validDates[validDates.length - 1]) : today;
}

function filterTransactionsByTimeframe(transactions, timeframe, referenceDate = null) {
  const bounds = referenceDate
    ? { start: getTimeframeStartDate(timeframe, referenceDate), end: startOfMonth(referenceDate) }
    : getCalendarMonthBounds(transactions, timeframe);

  return transactions.filter((transaction) => {
    if (!isValidTransactionDate(transaction.transaction_date)) return false;
    const parsedDate = parseAppDate(transaction.transaction_date);
    if (!parsedDate) return false;
    const date = startOfMonth(parsedDate);
    if (bounds.start && compareMonthDates(date, bounds.start) < 0) return false;
    if (bounds.end && compareMonthDates(date, bounds.end) > 0) return false;
    return true;
  });
}

function buildRollingHistoryWindow(transactions, endDate, dayCount) {
  const safeDayCount = Math.max(dayCount || 1, 1);
  const normalizedEnd = startOfDay(endDate);
  const startDate = addDays(normalizedEnd, -(safeDayCount - 1));
  const days = [];

  for (let i = 0; i < safeDayCount; i += 1) {
    const date = addDays(startDate, i);
    const iso = toIsoDate(date);
    const dayTransactions = transactions
      .filter((transaction) => {
        const parsed = parseAppDate(transaction.transaction_date);
        return parsed && toIsoDate(parsed) === iso;
      })
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
    const settled = dayTransactions.filter((transaction) => !isInternalTransferLike(transaction));
    const earned = settled
      .filter((transaction) => Number(transaction.amount) > 0)
      .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    const spent = settled
      .filter((transaction) => Number(transaction.amount) < 0)
      .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);

    days.push({
      key: `${iso}-rolling-${i}`,
      date,
      inMonth: true,
      isFutureDay: false,
      transactions: dayTransactions,
      events: [],
      recurringEvents: [],
      earned,
      spent,
      net: earned - spent,
      previewLabels: dayTransactions.slice(0, 2).map((transaction) => cleanEventTitle(transaction.description || "Transaction")),
    });
  }

  return { days, startDate, endDate: normalizedEnd };
}

function getRollingWindowSummary(days) {
  const settledDays = days || [];
  const spent = settledDays.reduce((sum, day) => sum + Number(day.spent || 0), 0);
  const earned = settledDays.reduce((sum, day) => sum + Number(day.earned || 0), 0);
  const activeDays = settledDays.filter((day) => (day.transactions?.length || 0) > 0).length;

  return {
    spent,
    earned,
    net: earned - spent,
    activeDays,
  };
}

function formatShortWeekday(date) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(date);
}

function formatShortWindowTitle(startDate, endDate, timeframe) {
  if (timeframe === "1d") return formatDateLong(endDate);

  const sameMonth = startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear();
  const startLabel = sameMonth
    ? `${startDate.getDate()}`
    : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(startDate);
  const endLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(endDate);
  return `${startLabel} to ${endLabel}`;
}

function getMonthlyHistorySummary(viewDate, transactions) {
  const monthTransactions = transactions.filter((transaction) => isTransactionInMonth(transaction, viewDate));
  const settled = monthTransactions.filter((transaction) => !isInternalTransferLike(transaction));
  const spent = settled
    .filter((transaction) => Number(transaction.amount) < 0)
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
  const earned = settled
    .filter((transaction) => Number(transaction.amount) > 0)
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const activeDays = new Set(monthTransactions.map((transaction) => transaction.transaction_date).filter(Boolean)).size;

  return {
    spent,
    earned,
    net: earned - spent,
    activeDays,
    count: monthTransactions.length,
  };
}

function getMonthlyBreakdown(transactions, timeframe) {
  const filtered = filterTransactionsByTimeframe(transactions, timeframe);
  const groups = new Map();

  filtered.forEach((transaction) => {
    if (!isValidTransactionDate(transaction.transaction_date) || isInternalTransferLike(transaction)) return;
    const date = parseAppDate(transaction.transaction_date);
    if (!date) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: formatMonthYear(date),
        spent: 0,
        earned: 0,
        activeDays: new Set(),
      });
    }

    const group = groups.get(key);
    const amount = Number(transaction.amount || 0);
    if (amount >= 0) group.earned += amount;
    else group.spent += Math.abs(amount);
    group.activeDays.add(transaction.transaction_date);
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      activeDays: group.activeDays.size,
      net: group.earned - group.spent,
    }))
    .sort((a, b) => b.key.localeCompare(a.key));
}

function getCalendarPatternSummary(transactions, timeframe) {
  const months = getMonthlyBreakdown(transactions, isShortTimeframe(timeframe) ? "1m" : timeframe);
  const filtered = filterTransactionsByTimeframe(transactions, timeframe).filter(
    (transaction) => !isInternalTransferLike(transaction)
  );

  if (!filtered.length) {
    return {
      headline: "Nothing to read yet",
      body: "Once a few real transactions land, the app can start spotting rhythm and pressure points here.",
    };
  }

  const weekdayTotals = Array.from({ length: 7 }, () => 0);
  filtered.forEach((transaction) => {
    if (Number(transaction.amount) >= 0) return;
    const date = parseAppDate(transaction.transaction_date);
    if (!date) return;
    weekdayTotals[date.getDay()] += Math.abs(Number(transaction.amount || 0));
  });

  const busiestWeekdayIndex = weekdayTotals.indexOf(Math.max(...weekdayTotals));
  const weekdayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const latestMonth = months[0] || null;
  const previousMonth = months[1] || null;

  if (isShortTimeframe(timeframe)) {
    return {
      headline: timeframe === "1d" ? "Single-day read" : "Short-range rhythm check",
      body: `${weekdayLabels[busiestWeekdayIndex]} is currently your heaviest spend day inside this ${timeframe.toUpperCase()} window. As more weeks land, the read gets sharper.`,
    };
  }

  if (!latestMonth || months.length < 2) {
    return {
      headline: "Early monthly read",
      body: `${latestMonth?.label || "This month"} is the only solid month in view so far. ${weekdayLabels[busiestWeekdayIndex]} is currently your heaviest spend day.`,
    };
  }

  const monthShift = latestMonth.spent - previousMonth.spent;

  if (monthShift >= previousMonth.spent * 0.12) {
    return {
      headline: "Recent month looks heavier",
      body: `${latestMonth.label} spent ${formatCurrency(latestMonth.spent)} versus ${formatCurrency(previousMonth.spent)} the month before. ${weekdayLabels[busiestWeekdayIndex]} is your heaviest spend day overall.`,
    };
  }

  if (monthShift <= -previousMonth.spent * 0.12) {
    return {
      headline: "Recent month looks calmer",
      body: `${latestMonth.label} spent ${formatCurrency(latestMonth.spent)} versus ${formatCurrency(previousMonth.spent)} the month before. ${weekdayLabels[busiestWeekdayIndex]} is still your most expensive weekday pattern.`,
    };
  }

  return {
    headline: "Your pattern looks steady enough to read",
    body: `${weekdayLabels[busiestWeekdayIndex]} is your heaviest spend day overall, and your recent months look more steady than chaotic.`,
  };
}

function buildHistoricalCalendarMonth(viewDate, transactions, recurringEvents) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const firstDay = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - firstDay);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = [];

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    date.setHours(0, 0, 0, 0);
    const iso = toIsoDate(date);
    const dayTransactions = transactions
      .filter((transaction) => {
        const parsed = parseAppDate(transaction.transaction_date);
        return parsed && toIsoDate(parsed) === iso;
      })
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
    const settled = dayTransactions.filter((transaction) => !isInternalTransferLike(transaction));
    const earned = settled
      .filter((transaction) => Number(transaction.amount) > 0)
      .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    const spent = settled
      .filter((transaction) => Number(transaction.amount) < 0)
      .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
    const dayRecurring = recurringEvents.filter((event) => event.day === date.getDate());

    days.push({
      key: `${iso}-${i}`,
      date,
      inMonth: date.getMonth() === month,
      isFutureDay: date > today,
      transactions: dayTransactions,
      recurringEvents: dayRecurring,
      earned,
      spent,
      net: earned - spent,
      previewLabels: dayTransactions.slice(0, 2).map((transaction) => cleanEventTitle(transaction.description || "Transaction")),
    });
  }

  return { days };
}

function isValidTransactionDate(value) {
  if (!value) return false;
  return Boolean(parseAppDate(value));
}

function isTransactionInMonth(transaction, viewDate) {
  if (!isValidTransactionDate(transaction.transaction_date)) return false;
  const date = parseAppDate(transaction.transaction_date);
  if (!date) return false;
  return date.getFullYear() === viewDate.getFullYear() && date.getMonth() === viewDate.getMonth();
}

function formatCurrency(value) {
  return `£${Number(value || 0).toFixed(2)}`;
}

function formatCompactCurrency(value) {
  const amount = Number(value || 0);
  if (amount >= 1000) return `£${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}k`;
  return `£${amount.toFixed(0)}`;
}

function formatMonthYear(date) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateShort(date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateLong(date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}


async function fileToDataUrl(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.readAsDataURL(file);
  });
}

function hasMeaningfulExtraction(extracted) {
  if (!extracted || typeof extracted !== "object") return false;
  return Object.values(extracted).some((value) => value !== null && value !== "");
}

function getHistorySummary(transactions) {
  const months = new Set(
    transactions
      .map((t) => parseAppDate(t.transaction_date))
      .filter(Boolean)
      .map((date) => `${date.getFullYear()}-${date.getMonth() + 1}`)
  );

  const count = months.size;

  if (count >= 6) {
    return {
      label: "Strong",
      headline: `${count} months of history loaded`,
      body: "That is enough history to spot recurring payments, salary cadence and trend shifts with much more confidence.",
    };
  }

  if (count >= 3) {
    return {
      label: "Good",
      headline: `${count} months of history loaded`,
      body: "That is enough to start reading recurring payments and getting useful money pattern signals.",
    };
  }

  return {
    label: "Early",
    headline: count > 0 ? `${count} month${count === 1 ? "" : "s"} loaded` : "No history yet",
    body: "The app gets much smarter after roughly 3 months of statement history, and even better at 6 to 12 months.",
  };
}

function getRecurringSummary(transactions) {
  const recurring = getRecurringCalendarEvents(transactions);
  const recurringBills = recurring.filter((item) => item.kind !== "income").length;
  const recurringIncome = recurring.filter((item) => item.kind === "income").length;

  if (recurring.length >= 6) {
    return {
      label: "High",
      headline: `${recurring.length} recurring streams detected`,
      body: `${recurringBills} outgoing and ${recurringIncome} incoming streams look repeatable enough to power the calendar and money reminders.`,
    };
  }

  if (recurring.length >= 3) {
    return {
      label: "Medium",
      headline: `${recurring.length} recurring streams detected`,
      body: "The app can already see repeated payments, but more history will make the timing cleaner.",
    };
  }

  return {
    label: "Low",
    headline: "Recurring patterns still forming",
    body: "Once statement history builds up, the app can infer bills, subscriptions, salary cycles and other repeated events more confidently.",
  };
}

function buildDailyBrief({
  transactionCount,
  totals,
  topCategories,
  subscriptions,
  goalPercent,
  cashSummary,
  dataFreshness,
}) {
  if (transactionCount === 0) {
    return {
      headline: "No data yet",
      body: "Upload your first statement and I'll turn this into something useful.",
    };
  }

  if (dataFreshness?.needsUpload) {
    return {
      headline: dataFreshness.hasData ? "Recent data needed" : "Upload your first statement",
      body: dataFreshness.hasData
        ? `The latest visible month here is ${dataFreshness.latestMonthLabel}, so today's read will stay stale until you upload a fresher statement.`
        : "Upload your first bank statement so Money Hub can stop being a blank shell and start helping properly.",
    };
  }

  if (cashSummary?.hasLiveBalances && cashSummary.amount <= 25) {
    return {
      headline: "Cash is tight today",
      body: "Your live account balance is low enough that this is more of a protect-cash day than a spend-freely day.",
    };
  }

  if (!cashSummary?.hasLiveBalances) {
    return {
      headline: "Live balance still needed",
      body: "The app can read your patterns already, but it should not promise spending room until it has a real account balance to work from.",
    };
  }

  if (
    topCategories[0]?.category === "Takeaway" ||
    topCategories[0]?.category === "Treats"
  ) {
    return {
      headline: "Small leaks are getting loud",
      body: `Your top spend is ${topCategories[0].category}. Not a disaster, but definitely not stealthy either.`,
    };
  }

  if (subscriptions >= 3) {
    return {
      headline: "Subscription check worth doing",
      body: `I found ${subscriptions} subscription-style payments. Easy clean-up if any are dead weight.`,
    };
  }

  if (goalPercent >= 50) {
    return {
      headline: "House goal has momentum",
      body: "You're past halfway on the visible target. Keep protecting that energy.",
    };
  }

  return {
    headline: "Steady, not sloppy",
    body: `Income and spending are broadly balanced at ${formatCurrency(Math.abs(totals.net))} net, and nothing in the latest read looks wildly out of control.`,
  };
}

function getCoachPromptIdeas({
  topCategories,
  cashSummary,
  houseGoal,
  debtSignals,
  investmentSignals,
}) {
  const prompts = [
    "How am I doing with money overall?",
    "Am I getting better or worse over time?",
  ];

  if (topCategories[0]) {
    prompts.push(`How do I cut my ${topCategories[0].category} spending?`);
  }

  if (debtSignals.length > 0) {
    prompts.push("Do these debt-looking payments seem under control?");
  }

  if (investmentSignals.length > 0) {
    prompts.push("Does my investing activity look sensible?");
  }

  if (cashSummary?.hasLiveBalances && cashSummary.amount > 0) {
    prompts.push(`What can I safely spend with about ${formatCurrency(cashSummary.amount)} in my accounts?`);
  }

  if (houseGoal) {
    prompts.push("Give me a house deposit game plan");
  }

  return [...new Set(prompts)].slice(0, 6);
}

function getTrendSummary(transactions) {
  const spending = transactions.filter(
    (t) => Number(t.amount) < 0 && !isInternalTransferLike(t)
  );

  const recent = spending.slice(0, 20);
  const previous = spending.slice(20, 40);

  if (recent.length < 6 || previous.length < 6) {
    return {
      label: "Learning",
      headline: "Need a bit more history",
      body: "Once there is more statement data, I can start calling whether you're improving or slipping.",
    };
  }

  const recentTotal = recent.reduce(
    (sum, item) => sum + Math.abs(Number(item.amount || 0)),
    0
  );
  const previousTotal = previous.reduce(
    (sum, item) => sum + Math.abs(Number(item.amount || 0)),
    0
  );

  const change = recentTotal - previousTotal;
  const pct = previousTotal === 0 ? 0 : change / previousTotal;

  if (pct <= -0.1) {
    return {
      label: "Better",
      headline: "Recent spending looks a bit tighter",
      body: "Compared with the previous chunk of transactions, your recent outflow looks lower.",
    };
  }

  if (pct >= 0.1) {
    return {
      label: "Worse",
      headline: "Recent spending looks heavier",
      body: "Compared with the previous chunk of transactions, your recent outflow looks higher.",
    };
  }

  return {
    label: "Flat",
    headline: "You look fairly steady",
    body: "Your recent spending looks broadly similar to the previous chunk of data.",
  };
}

function getDebtSignals(transactions) {
  const keywords = [
    ["barclaycard", "Barclaycard"],
    ["mbna", "MBNA"],
    ["capital one", "Capital One"],
    ["klarna", "Klarna"],
    ["paypal credit", "PayPal Credit"],
    ["zopa", "Zopa"],
    ["amex", "Amex"],
    ["american express", "Amex"],
    ["loan", "Loan Payment"],
    ["finance", "Finance Payment"],
    ["monzo flex", "Monzo Flex"],
    ["tesco bank", "Tesco Bank"],
    ["creation", "Creation Finance"],
    ["virgin money", "Virgin Money"],
  ];

  return buildSignalGroups(transactions, keywords);
}

function getInvestmentSignals(transactions) {
  const keywords = [
    ["trading 212", "Trading 212"],
    ["vanguard", "Vanguard"],
    ["hargreaves", "Hargreaves Lansdown"],
    ["freetrade", "Freetrade"],
    ["coinbase", "Coinbase"],
    ["binance", "Binance"],
    ["kraken", "Kraken"],
    ["moneybox", "Moneybox"],
    ["plum", "Plum"],
    ["nutmeg", "Nutmeg"],
    ["aj bell", "AJ Bell"],
    ["interactive investor", "Interactive Investor"],
    ["etoro", "eToro"],
    ["wealthify", "Wealthify"],
    ["investengine", "InvestEngine"],
  ];

  return buildSignalGroups(transactions, keywords);
}

function buildSignalGroups(transactions, keywords) {
  const groups = {};

  transactions.forEach((transaction) => {
    if (Number(transaction.amount) >= 0 || isInternalTransferLike(transaction)) return;

    const text = normalizeText(transaction.description);
    const match = keywords.find(([keyword]) => text.includes(keyword));

    if (!match) return;

    const [, label] = match;
    const key = label.toLowerCase();

    if (!groups[key]) {
      groups[key] = {
        key,
        label,
        count: 0,
        total: 0,
        average: 0,
        lastDate: transaction.transaction_date || "",
      };
    }

    groups[key].count += 1;
    groups[key].total += Math.abs(Number(transaction.amount || 0));
    groups[key].average = groups[key].total / groups[key].count;

    if (
      transaction.transaction_date &&
      (!groups[key].lastDate || transaction.transaction_date > groups[key].lastDate)
    ) {
      groups[key].lastDate = transaction.transaction_date;
    }
  });

  return Object.values(groups)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
}

function getDebtMatchSummary(debt, transactions) {
  const keywords = getRecordKeywords(debt.payment_keywords, debt.name, debt.lender);
  const matches = transactions.filter((transaction) => {
    if (Number(transaction.amount) >= 0) return false;
    const text = normalizeText(transaction.description);
    return keywords.some((keyword) => keyword && text.includes(keyword));
  });

  return {
    count: matches.length,
    lastDate: matches[0]?.transaction_date || "",
    latest: matches[0] || null,
  };
}

function getInvestmentMatchSummary(investment, transactions) {
  const keywords = getRecordKeywords(
    investment.contribution_keywords,
    investment.name,
    investment.platform
  );
  const matches = transactions.filter((transaction) => {
    if (Number(transaction.amount) >= 0) return false;
    const text = normalizeText(transaction.description);
    return keywords.some((keyword) => keyword && text.includes(keyword));
  });

  return {
    count: matches.length,
    lastDate: matches[0]?.transaction_date || "",
    latest: matches[0] || null,
  };
}

function getDebtMonthlyStatus(debt, transactions) {
  const keywords = getRecordKeywords(debt.payment_keywords, debt.name, debt.lender);
  const thisMonthMatches = transactions.filter((transaction) => {
    if (Number(transaction.amount) >= 0) return false;
    if (!isThisMonth(transaction.transaction_date)) return false;
    const text = normalizeText(transaction.description);
    return keywords.some((keyword) => keyword && text.includes(keyword));
  });

  if (thisMonthMatches.length > 0) {
    return { label: "Paid this month", tone: "good" };
  }

  const dueDay = Number(debt.due_day || 0);
  const today = new Date().getDate();

  if (dueDay && today < dueDay) {
    return { label: "Due soon", tone: "warn" };
  }

  if (dueDay && today >= dueDay) {
    return { label: "Check this", tone: "bad" };
  }

  return { label: "Watching", tone: "neutral" };
}

function getInvestmentMonthlyStatus(investment, transactions) {
  const keywords = getRecordKeywords(
    investment.contribution_keywords,
    investment.name,
    investment.platform
  );
  const thisMonthMatches = transactions.filter((transaction) => {
    if (Number(transaction.amount) >= 0) return false;
    if (!isThisMonth(transaction.transaction_date)) return false;
    const text = normalizeText(transaction.description);
    return keywords.some((keyword) => keyword && text.includes(keyword));
  });

  if (thisMonthMatches.length > 0) {
    return { label: "Contributed this month", tone: "good" };
  }

  return { label: "Quiet this month", tone: "warn" };
}

function getDebtStatusSummary(debts, transactions) {
  if (debts.length === 0) {
    return {
      headline: "No debt records saved yet",
      body: "Debt-looking statement lines can be confirmed into proper debt records here.",
    };
  }

  const statuses = debts.map((debt) => getDebtMonthlyStatus(debt, transactions));
  const paidCount = statuses.filter((item) => item.tone === "good").length;
  const checkCount = statuses.filter((item) => item.tone === "bad").length;

  if (checkCount > 0) {
    return {
      headline: `${checkCount} debt payment${checkCount === 1 ? "" : "s"} may need checking`,
      body: "At least one saved debt does not look clearly paid this month yet.",
    };
  }

  if (paidCount > 0) {
    return {
      headline: `${paidCount} debt${paidCount === 1 ? "" : "s"} already look paid this month`,
      body: "Your debt tracking is starting to move beyond setup and into real monthly monitoring.",
    };
  }

  return {
    headline: "Debt tracking is watching the month",
    body: "No obvious issue yet, but not enough matched payment activity has shown up this month.",
  };
}

function getInvestmentStatusSummary(investments, transactions) {
  if (investments.length === 0) {
    return {
      headline: "No investment records saved yet",
      body: "Broker or crypto funding can be turned into proper investment records here.",
    };
  }

  const statuses = investments.map((investment) =>
    getInvestmentMonthlyStatus(investment, transactions)
  );
  const activeCount = statuses.filter((item) => item.tone === "good").length;

  if (activeCount > 0) {
    return {
      headline: `${activeCount} investment${activeCount === 1 ? "" : "s"} funded this month`,
      body: "Your investing section is starting to show real contribution behaviour, not just static setup.",
    };
  }

  return {
    headline: "No obvious investing contribution this month",
    body: "That may be fine, but if you expected contributions, this is worth checking.",
  };
}

function hasMatchingDebt(signal, debts) {
  return debts.some((debt) => {
    const haystack = normalizeText(
      `${debt.name} ${debt.lender} ${debt.payment_keywords?.join(" ") || ""}`
    );
    return haystack.includes(normalizeText(signal.label));
  });
}

function hasMatchingInvestment(signal, investments) {
  return investments.some((investment) => {
    const haystack = normalizeText(
      `${investment.name} ${investment.platform} ${
        investment.contribution_keywords?.join(" ") || ""
      }`
    );
    return haystack.includes(normalizeText(signal.label));
  });
}

function buildDebtDedupeKey(payload) {
  return normalizeText(
    `${payload.name}|${payload.lender || ""}|${payload.minimum_payment || ""}|${payload.due_day || ""}`
  );
}

function buildInvestmentDedupeKey(payload) {
  return normalizeText(
    `${payload.name}|${payload.platform || ""}|${payload.asset_type || ""}|${payload.monthly_contribution || ""}|${payload.ticker_symbol || ""}`
  );
}

function buildKeywords(...values) {
  return values
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .slice(0, 5);
}

function getRecordKeywords(keywords = [], ...fallbacks) {
  const list = [...(Array.isArray(keywords) ? keywords : []), ...fallbacks];
  return list.map((item) => normalizeText(item)).filter(Boolean);
}

function getRecurringCalendarEvents(transactions) {
  const grouped = {};

  transactions.forEach((transaction) => {
    if (!transaction.transaction_date) return;
    if (isInternalTransferLike(transaction)) return;

    const text = normalizeText(transaction.description);
    if (!text) return;

    const key = `${text}|${transaction.amount > 0 ? "in" : "out"}`;
    const date = parseAppDate(transaction.transaction_date);
    if (!date) return;

    if (!grouped[key]) {
      grouped[key] = {
        description: transaction.description,
        amount: Number(transaction.amount || 0),
        dates: [],
        count: 0,
      };
    }

    grouped[key].dates.push(date);
    grouped[key].count += 1;
  });

  return Object.entries(grouped)
    .map(([key, value]) => {
      const months = new Set(
        value.dates.map((date) => `${date.getFullYear()}-${date.getMonth() + 1}`)
      );

      if (months.size < 2) return null;

      const day = Math.round(
        value.dates.reduce((sum, date) => sum + date.getDate(), 0) / value.dates.length
      );

      const kind =
        value.amount > 0
          ? "income"
          : inferOutgoingKind(value.description);

      const confidence =
        months.size >= 4 ? "high" : months.size >= 3 ? "medium" : "low";

      return {
        key,
        title: cleanEventTitle(value.description),
        amount: value.amount,
        day,
        month: null,
        kind,
        kindLabel:
          kind === "income"
            ? "Income"
            : kind === "bill"
            ? "Bill"
            : "Subscription",
        confidenceLabel: confidence,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.day - b.day);
}

function inferOutgoingKind(description) {
  const text = normalizeText(description);

  if (
    text.includes("netflix") ||
    text.includes("spotify") ||
    text.includes("prime") ||
    text.includes("apple") ||
    text.includes("google") ||
    text.includes("disney")
  ) {
    return "subscription";
  }

  return "bill";
}

function cleanEventTitle(description) {
  const text = String(description || "").trim();
  if (!text) return "Money Event";
  return text.length > 28 ? `${text.slice(0, 28)}...` : text;
}

function buildCalendarMonth(viewDate, recurringEvents) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const firstDay = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - firstDay);

  const days = [];

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);

    const events = recurringEvents.filter((event) => event.day === date.getDate());

    days.push({
      key: `${date.toISOString()}-${i}`,
      date,
      inMonth: date.getMonth() === month,
      events,
    });
  }

  return { days };
}

function downloadCalendarEvent(event) {
  const nextDate = getNextEventDate(event.day);
  const endDate = new Date(nextDate);
  endDate.setHours(endDate.getHours() + 1);

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Money Hub//Money Calendar//EN",
    "BEGIN:VEVENT",
    `UID:${Date.now()}-${event.key}@moneyhub`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(nextDate)}`,
    `DTEND:${toIcsDate(endDate)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(
      `${event.kindLabel} · ${event.amount > 0 ? "+" : "-"}£${Math.abs(
        event.amount
      ).toFixed(2)} · Added from Money Hub`
    )}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${event.title.replace(/\s+/g, "-").toLowerCase()}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getNextEventDate(day) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  let candidate = new Date(year, month, Math.min(day, daysInMonth(year, month)));

  if (candidate < now) {
    const nextMonth = new Date(year, month + 1, 1);
    candidate = new Date(
      nextMonth.getFullYear(),
      nextMonth.getMonth(),
      Math.min(day, daysInMonth(nextMonth.getFullYear(), nextMonth.getMonth()))
    );
  }

  candidate.setHours(9, 0, 0, 0);
  return candidate;
}

function toIcsDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(
    date.getUTCDate()
  )}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(
    date.getUTCSeconds()
  )}Z`;
}

function escapeIcsText(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function numberOrNull(value) {
  if (value === "" || value == null) return null;
  const next = Number(value);
  return Number.isNaN(next) ? null : next;
}

function intOrNull(value) {
  if (value === "" || value == null) return null;
  const next = parseInt(value, 10);
  return Number.isNaN(next) ? null : next;
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function isThisMonth(dateString) {
  if (!dateString) return false;
  const date = new Date(dateString);
  const now = new Date();

  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

function formatChatTime(value) {
  if (!value) return "now";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "now";

  return new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getMainStyle(screenWidth, page) {
  return {
    ...styles.main,
    padding:
      screenWidth <= 480
        ? "0 12px"
        : screenWidth <= 768
        ? "0 14px"
        : "0 16px",
    paddingBottom: page === "coach" ? "18px" : undefined,
  };
}

function getHeroCardStyle(screenWidth) {
  return {
    ...styles.heroCard,
    padding: screenWidth <= 480 ? "20px" : "24px",
    borderRadius: screenWidth <= 480 ? "26px" : "32px",
  };
}

function getHeroTitleStyle(screenWidth) {
  return {
    ...styles.heroTitle,
    fontSize: screenWidth <= 480 ? "32px" : screenWidth <= 768 ? "36px" : "40px",
  };
}

function getTopBarStyle(screenWidth) {
  return {
    ...styles.topBar,
    padding: screenWidth <= 480 ? "12px 12px 10px" : "16px 16px 12px",
  };
}

function getTopTitleStyle(screenWidth) {
  return {
    ...styles.topTitle,
    fontSize: screenWidth <= 480 ? "22px" : screenWidth <= 768 ? "26px" : "30px",
  };
}

function getBigMoneyStyle(screenWidth) {
  return {
    ...styles.bigMoney,
    fontSize: screenWidth <= 480 ? "36px" : screenWidth <= 768 ? "42px" : "46px",
  };
}

function getGridStyle(screenWidth) {
  return {
    ...styles.grid,
    gridTemplateColumns: screenWidth <= 480 ? "1fr" : "1fr 1fr",
  };
}

function getCoachSectionStyle(viewportHeight, screenWidth) {
  const reservedHeight =
    screenWidth <= 480 ? 150 : screenWidth <= 768 ? 180 : 220;

  return {
    ...styles.coachSection,
    minHeight: `calc(${viewportHeight}px - ${reservedHeight}px)`,
    height: `calc(${viewportHeight}px - ${reservedHeight}px)`,
  };
}

function getQuickPromptRowStyle(screenWidth) {
  return {
    ...styles.quickPromptRow,
    flexWrap: screenWidth <= 768 ? "wrap" : "nowrap",
    overflowX: screenWidth > 768 ? "auto" : "visible",
  };
}

function getChatMessagesStyle(viewportHeight, screenWidth) {
  let minHeight = 180;
  let maxHeight = Math.max(220, viewportHeight - 420);

  if (screenWidth <= 480) {
    minHeight = 160;
    maxHeight = Math.max(200, viewportHeight - 400);
  } else if (screenWidth <= 768) {
    minHeight = 180;
    maxHeight = Math.max(240, viewportHeight - 430);
  } else if (screenWidth <= 1100) {
    minHeight = 220;
    maxHeight = Math.max(260, viewportHeight - 440);
  }

  return {
    ...styles.chatMessages,
    minHeight: `${minHeight}px`,
    maxHeight: `${maxHeight}px`,
    flex: 1,
  };
}

function getEmptyCoachStateStyle(viewportHeight, screenWidth) {
  let minHeight = Math.max(100, Math.min(180, viewportHeight * 0.18));

  if (screenWidth <= 480) {
    minHeight = Math.max(90, Math.min(140, viewportHeight * 0.14));
  }

  return {
    ...styles.emptyCoachState,
    minHeight: `${minHeight}px`,
  };
}

function getChatInputBarStyle(screenWidth) {
  return {
    ...styles.chatInputBar,
    flexDirection: screenWidth <= 480 ? "column" : "row",
    alignItems: screenWidth <= 480 ? "stretch" : "center",
  };
}

function getChatSendBtnStyle(screenWidth) {
  return {
    ...styles.chatSendBtn,
    width: screenWidth <= 480 ? "100%" : undefined,
  };
}

function getNavStyle(screenWidth) {
  return {
    ...styles.nav,
    left: screenWidth <= 480 ? "8px" : "12px",
    right: screenWidth <= 480 ? "8px" : "12px",
    bottom: screenWidth <= 480 ? "8px" : "12px",
  };
}

function getStatusPillStyle(tone) {
  const map = {
    good: {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #bbf7d0",
    },
    warn: {
      background: "#fef3c7",
      color: "#92400e",
      border: "1px solid #fde68a",
    },
    bad: {
      background: "#fee2e2",
      color: "#991b1b",
      border: "1px solid #fecaca",
    },
    neutral: {
      background: "#e2e8f0",
      color: "#334155",
      border: "1px solid #cbd5e1",
    },
    income: {
      background: "#dbeafe",
      color: "#1d4ed8",
      border: "1px solid #bfdbfe",
    },
    bill: {
      background: "#fee2e2",
      color: "#991b1b",
      border: "1px solid #fecaca",
    },
    subscription: {
      background: "#ede9fe",
      color: "#5b21b6",
      border: "1px solid #ddd6fe",
    },
  };

  return {
    ...styles.statusPill,
    ...(map[tone] || map.neutral),
  };
}

function getCalendarEventStyle(kind) {
  return {
    ...styles.calendarEvent,
    ...(kind === "income"
      ? styles.calendarEventIncome
      : kind === "subscription"
      ? styles.calendarEventSubscription
      : styles.calendarEventBill),
  };
}

const styles = {
  app: {
    minHeight: "100vh",
    background: "transparent",
    color: "#0f172a",
    fontFamily:
      'Inter, "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    paddingBottom: "128px",
    maxWidth: "760px",
    margin: "0 auto",
  },

  loading: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    fontSize: "18px",
    color: "#0f172a",
  },

  authWrap: {
    minHeight: "100vh",
    padding: "20px",
    display: "flex",
    alignItems: "center",
  },

  heroCard: {
    width: "100%",
    background: "rgba(255,255,255,0.84)",
    backdropFilter: "blur(16px)",
    borderRadius: "32px",
    padding: "24px",
    boxShadow: "0 24px 80px rgba(15, 23, 42, 0.10)",
    border: "1px solid rgba(255,255,255,0.65)",
  },

  authBadgeRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "12px",
    flexWrap: "wrap",
  },

  authBadge: {
    background: "#dbeafe",
    color: "#1d4ed8",
    padding: "8px 12px",
    borderRadius: "999px",
    fontSize: "13px",
    fontWeight: "700",
  },

  authMuted: {
    color: "#64748b",
    fontSize: "14px",
  },

  heroTitle: {
    fontSize: "40px",
    lineHeight: 1,
    margin: "0 0 12px",
    letterSpacing: "-0.04em",
  },

  kicker: {
    color: "#2563eb",
    fontWeight: "800",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    margin: "0 0 6px",
  },

  subText: {
    color: "#475569",
    marginBottom: "20px",
    fontSize: "15px",
    lineHeight: 1.6,
  },

  topBar: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    padding: "16px 16px 12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    background:
      "linear-gradient(180deg, rgba(248,251,255,0.94), rgba(248,251,255,0.76), rgba(248,251,255,0))",
    backdropFilter: "blur(10px)",
  },

  topBarText: {
    minWidth: 0,
  },

  topTitle: {
    margin: 0,
    fontSize: "30px",
    lineHeight: 1,
    letterSpacing: "-0.04em",
  },

  topEmail: {
    margin: "6px 0 0",
    color: "#64748b",
    fontSize: "13px",
  },

  logoutBtn: {
    border: "1px solid rgba(248, 113, 113, 0.24)",
    background: "rgba(254, 226, 226, 0.82)",
    color: "#b91c1c",
    padding: "10px 14px",
    borderRadius: "999px",
    fontWeight: "700",
    flexShrink: 0,
  },

  main: {
    padding: "0 16px",
  },

  balanceCard: {
    background:
      "linear-gradient(135deg, #0f172a 0%, #1d4ed8 55%, #14b8a6 100%)",
    color: "white",
    borderRadius: "30px",
    padding: "22px",
    boxShadow: "0 24px 48px rgba(29, 78, 216, 0.24)",
    marginBottom: "14px",
    overflow: "hidden",
  },

  balanceTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    marginBottom: "8px",
    flexWrap: "wrap",
  },

  pulseTag: {
    background: "rgba(255,255,255,0.16)",
    border: "1px solid rgba(255,255,255,0.22)",
    padding: "7px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "700",
  },

  smallWhite: {
    opacity: 0.92,
    margin: 0,
    fontSize: "14px",
  },

  bigMoney: {
    fontSize: "46px",
    margin: "0 0 8px",
    lineHeight: 0.98,
    letterSpacing: "-0.05em",
  },

  balanceSubcopy: {
    margin: 0,
    opacity: 0.88,
    lineHeight: 1.5,
    maxWidth: "34ch",
    fontSize: "14px",
  },

  balancePills: {
    display: "flex",
    gap: "10px",
    marginTop: "18px",
    flexWrap: "wrap",
  },

  statPill: {
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.16)",
    borderRadius: "18px",
    padding: "10px 12px",
    minWidth: "92px",
  },

  statPillLabel: {
    display: "block",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    opacity: 0.75,
    marginBottom: "4px",
  },

  statPillValue: {
    fontSize: "14px",
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
    marginBottom: "14px",
  },

  miniCard: {
    background: "rgba(255,255,255,0.86)",
    backdropFilter: "blur(14px)",
    borderRadius: "22px",
    padding: "16px",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
    border: "1px solid rgba(255,255,255,0.6)",
  },

  cardLabel: {
    margin: 0,
    color: "#64748b",
    fontSize: "13px",
  },

  cardValue: {
    margin: "8px 0 0",
    fontSize: "22px",
    letterSpacing: "-0.03em",
  },

  section: {
    background: "rgba(255,255,255,0.86)",
    backdropFilter: "blur(14px)",
    borderRadius: "24px",
    padding: "18px",
    marginBottom: "14px",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
    border: "1px solid rgba(255,255,255,0.6)",
  },

  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    marginBottom: "12px",
    flexWrap: "wrap",
  },

  sectionTitle: {
    margin: 0,
    fontSize: "18px",
    letterSpacing: "-0.02em",
  },

  sectionActions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },

  sectionIntro: {
    color: "#475569",
    lineHeight: 1.6,
  },

  smallMuted: {
    color: "#64748b",
    fontSize: "13px",
    lineHeight: 1.6,
  },

  emptyText: {
    color: "#64748b",
    lineHeight: 1.6,
  },

  row: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    padding: "12px 0",
    borderBottom: "1px solid #e8eef7",
  },

  transactionRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    padding: "14px 0",
    borderBottom: "1px solid #e8eef7",
  },

  transactionCopy: {
    minWidth: 0,
  },

  transactionMeta: {
    margin: "4px 0 0",
    color: "#64748b",
    fontSize: "13px",
    lineHeight: 1.5,
  },

  accountCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    padding: "14px",
    background: "#f8fbff",
    borderRadius: "18px",
    marginBottom: "10px",
    border: "1px solid #e8eef7",
  },

  input: {
    width: "100%",
    padding: "14px 16px",
    borderRadius: "16px",
    border: "1px solid #dbe4f0",
    marginBottom: "10px",
    fontSize: "16px",
    background: "rgba(255,255,255,0.94)",
    color: "#0f172a",
    outline: "none",
  },

  textarea: {
    width: "100%",
    minHeight: "120px",
    resize: "vertical",
    padding: "14px 16px",
    borderRadius: "16px",
    border: "1px solid #dbe4f0",
    marginBottom: "10px",
    fontSize: "16px",
    background: "rgba(255,255,255,0.94)",
    color: "#0f172a",
    fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
  },

  label: {
    display: "block",
    fontWeight: "700",
    marginBottom: "8px",
  },

  primaryBtn: {
    width: "100%",
    border: "none",
    background: "linear-gradient(135deg, #2563eb 0%, #14b8a6 100%)",
    color: "white",
    padding: "15px",
    borderRadius: "16px",
    fontWeight: "800",
    fontSize: "16px",
    boxShadow: "0 18px 30px rgba(37, 99, 235, 0.20)",
  },

  secondaryBtn: {
    width: "100%",
    border: "1px solid #dbeafe",
    background: "#eff6ff",
    color: "#1d4ed8",
    padding: "14px",
    borderRadius: "16px",
    fontWeight: "700",
    fontSize: "16px",
    marginTop: "10px",
  },

  ghostBtn: {
    border: "1px solid #dbe4f0",
    background: "white",
    color: "#475569",
    padding: "8px 12px",
    borderRadius: "999px",
    fontWeight: "700",
    fontSize: "13px",
  },

  progressOuter: {
    height: "14px",
    background: "#e2e8f0",
    borderRadius: "999px",
    overflow: "hidden",
    marginTop: "10px",
  },

  progressInner: {
    height: "100%",
    background: "linear-gradient(90deg, #22c55e, #14b8a6)",
    borderRadius: "999px",
  },

  goalStat: {
    fontSize: "24px",
    fontWeight: "800",
    letterSpacing: "-0.03em",
  },

  nav: {
    position: "fixed",
    bottom: "12px",
    left: "12px",
    right: "12px",
    maxWidth: "736px",
    margin: "0 auto",
    background: "rgba(255,255,255,0.88)",
    backdropFilter: "blur(18px)",
    borderRadius: "26px",
    padding: "10px",
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: "8px",
    boxShadow: "0 24px 40px rgba(15, 23, 42, 0.12)",
    border: "1px solid rgba(255,255,255,0.75)",
  },

  navBtn: {
    border: "none",
    fontWeight: "700",
    color: "#64748b",
    background: "transparent",
    padding: "11px 6px",
    borderRadius: "16px",
    fontSize: "12px",
  },

  navBtnActive: {
    color: "#0f172a",
    background: "#e0f2fe",
  },

  receiptPreview: {
    background: "#f8fbff",
    border: "1px solid #dbe4f0",
    padding: "12px",
    borderRadius: "16px",
    marginBottom: "10px",
  },

  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "12px",
    fontSize: "14px",
    color: "#334155",
  },

  matchBox: {
    background: "#ecfdf5",
    border: "1px solid #bbf7d0",
    color: "#166534",
    padding: "12px",
    borderRadius: "16px",
    marginBottom: "12px",
  },

  coachSection: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },

  coachShell: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    flex: 1,
    minHeight: 0,
    height: "100%",
  },

  coachStatusCard: {
    background: "#f8fbff",
    border: "1px solid #dbe4f0",
    borderRadius: "18px",
    padding: "14px",
  },

  coachStatusTitle: {
    margin: "0 0 6px",
    fontSize: "16px",
    letterSpacing: "-0.02em",
  },

  quickPromptRow: {
    display: "flex",
    gap: "8px",
  },

  promptChip: {
    border: "1px solid #dbe4f0",
    background: "#f8fbff",
    color: "#1e293b",
    borderRadius: "999px",
    padding: "10px 12px",
    whiteSpace: "nowrap",
    fontSize: "13px",
    fontWeight: "700",
  },

  actionChipWrap: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginTop: "12px",
  },

  actionChip: {
    border: "1px solid #dbe4f0",
    background: "#f8fbff",
    color: "#0f172a",
    borderRadius: "999px",
    padding: "11px 13px",
    fontSize: "13px",
    fontWeight: "700",
  },

  chatMessages: {
    overflowY: "auto",
    padding: "12px",
    background: "#f8fbff",
    borderRadius: "18px",
    border: "1px solid #e2e8f0",
    flex: 1,
  },

  historyNote: {
    fontSize: "12px",
    color: "#64748b",
    background: "#eef6ff",
    borderRadius: "12px",
    padding: "10px 12px",
    marginBottom: "10px",
  },

  errorNote: {
    fontSize: "13px",
    color: "#991b1b",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "12px",
    padding: "10px 12px",
    marginBottom: "10px",
  },

  emptyCoachState: {
    padding: "12px 4px",
  },

  emptyCoachTitle: {
    fontWeight: "800",
    marginBottom: "6px",
  },

  chatInputBar: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
    paddingTop: "10px",
    position: "sticky",
    bottom: 0,
    background: "linear-gradient(180deg, rgba(248,251,255,0), rgba(248,251,255,0.98) 28%)",
    zIndex: 2,
  },

  chatInput: {
    flex: 1,
    padding: "14px 16px",
    borderRadius: "16px",
    border: "1px solid #dbe2ea",
    fontSize: "16px",
    background: "white",
    minWidth: 0,
  },

  chatSendBtn: {
    padding: "14px 18px",
    borderRadius: "16px",
    border: "none",
    background: "linear-gradient(135deg, #2563eb 0%, #14b8a6 100%)",
    color: "white",
    fontWeight: 800,
    minWidth: "78px",
  },

  chatMetaRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "6px",
    fontSize: "11px",
  },

  chatRoleLabel: {
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    opacity: 0.78,
  },

  chatTimeLabel: {
    opacity: 0.68,
  },

  userBubbleModern: {
    marginLeft: "auto",
    maxWidth: "82%",
    background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
    color: "white",
    padding: "12px 14px",
    borderRadius: "18px 18px 6px 18px",
    marginBottom: "10px",
    whiteSpace: "pre-wrap",
    lineHeight: 1.5,
    boxShadow: "0 10px 20px rgba(37, 99, 235, 0.16)",
  },

  aiBubbleModern: {
    marginRight: "auto",
    maxWidth: "82%",
    background: "white",
    color: "#111827",
    padding: "12px 14px",
    borderRadius: "18px 18px 18px 6px",
    marginBottom: "10px",
    whiteSpace: "pre-wrap",
    border: "1px solid #e5e7eb",
    lineHeight: 1.5,
  },

  aiInsightGrid: {
    display: "grid",
    gap: "10px",
  },

  insightCard: {
    background: "#f8fbff",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
    padding: "14px",
  },

  insightLabel: {
    margin: "0 0 6px",
    fontSize: "12px",
    fontWeight: "800",
    color: "#2563eb",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },

  insightHeadline: {
    margin: "0 0 6px",
    fontSize: "16px",
    letterSpacing: "-0.02em",
  },

  insightBody: {
    margin: 0,
    color: "#475569",
    lineHeight: 1.6,
    fontSize: "14px",
  },
  insightCardInteractive: {
    border: "1px solid #cfe0ff",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  },

  actionCard: {
    background: "#f8fbff",
    border: "1px solid #cfe0ff",
    borderRadius: "18px",
    padding: "14px",
    textAlign: "left",
    width: "100%",
    cursor: "pointer",
  },

  insightCta: {
    display: "inline-block",
    marginTop: "10px",
    color: "#2563eb",
    fontWeight: "800",
    fontSize: "13px",
  },

  signalCard: {
    padding: "14px",
    borderRadius: "18px",
    border: "1px solid #e2e8f0",
    background: "#f8fbff",
    marginBottom: "10px",
  },

  signalHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "flex-start",
  },

  signalBody: {
    marginTop: "10px",
    color: "#475569",
    lineHeight: 1.6,
    fontSize: "14px",
  },

  inlineBtnRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginTop: "12px",
  },

  primaryInlineBtn: {
    border: "none",
    background: "#2563eb",
    color: "white",
    padding: "10px 12px",
    borderRadius: "12px",
    fontWeight: "700",
    fontSize: "13px",
  },

  secondaryInlineBtn: {
    border: "1px solid #dbe4f0",
    background: "white",
    color: "#334155",
    padding: "10px 12px",
    borderRadius: "12px",
    fontWeight: "700",
    fontSize: "13px",
  },

  statusPillRow: {
    marginTop: "10px",
  },

  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "800",
  },

  calendarTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "16px",
  },

  calendarToolbar: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    flexWrap: "wrap",
    marginBottom: "14px",
  },

  modeChipRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },

  modeChipActive: {
    background: "linear-gradient(135deg, #dbeafe 0%, #ccfbf1 100%)",
    borderColor: "#93c5fd",
    color: "#0f172a",
  },

  calendarTitleWrap: {
    textAlign: "center",
    flex: 1,
  },

  calendarTitle: {
    margin: 0,
    fontSize: "20px",
  },

  calendarGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(84px, 1fr))",
    gap: "8px",
    width: "100%",
  },

  calendarDayHeader: {
    textAlign: "center",
    fontSize: "12px",
    fontWeight: "800",
    color: "#64748b",
    paddingBottom: "4px",
  },

  calendarCell: {
    minHeight: "120px",
    minWidth: 0,
    background: "#f8fbff",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    textAlign: "left",
    overflow: "hidden",
  },

  calendarCellShort: {
    minHeight: "108px",
  },

  calendarCellSelected: {
    border: "1px solid #60a5fa",
    boxShadow: "0 0 0 3px rgba(96, 165, 250, 0.14)",
  },

  calendarCellMuted: {
    opacity: 0.45,
  },

  calendarCellFuture: {
    background: "#f8fafc",
    opacity: 0.46,
    cursor: "not-allowed",
    boxShadow: "none",
  },

  calendarNavBtnDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },

  timeframeChipDisabled: {
    opacity: 0.35,
    cursor: "not-allowed",
  },

  calendarRangeHint: {
    color: "#64748b",
    fontSize: "12px",
    lineHeight: 1.5,
    marginTop: "-4px",
    marginBottom: "14px",
  },

  calendarDateRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
  },

  calendarDate: {
    fontSize: "13px",
    fontWeight: "800",
    color: "#0f172a",
  },

  calendarWeekdayMini: {
    fontSize: "10px",
    color: "#94a3b8",
    fontWeight: "700",
    marginTop: "2px",
  },

  calendarCountTag: {
    fontSize: "10px",
    fontWeight: "800",
    color: "#2563eb",
    background: "#e0f2fe",
    borderRadius: "999px",
    padding: "4px 6px",
  },

  calendarNetPillPositive: {
    alignSelf: "flex-start",
    background: "#dcfce7",
    color: "#166534",
    borderRadius: "999px",
    padding: "6px 8px",
    fontSize: "11px",
    fontWeight: "800",
  },

  calendarNetPillNegative: {
    alignSelf: "flex-start",
    background: "#fee2e2",
    color: "#991b1b",
    borderRadius: "999px",
    padding: "6px 8px",
    fontSize: "11px",
    fontWeight: "800",
  },

  calendarEmptyHint: {
    color: "#94a3b8",
    fontSize: "11px",
    fontWeight: "700",
  },

  calendarFutureBlock: {
    flex: 1,
  },

  calendarSingleLabel: {
    background: "white",
    border: "1px solid #e2e8f0",
    color: "#334155",
    borderRadius: "10px",
    padding: "6px 8px",
    fontSize: "11px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  calendarRecurringStack: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },

  calendarInlinePanel: {
    marginTop: "12px",
    background: "#ffffff",
    border: "1px solid #dbe4f0",
    borderRadius: "18px",
    padding: "14px",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
  },

  calendarInlinePanelTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    marginBottom: "10px",
  },


  calendarEvent: {
    border: "none",
    textAlign: "left",
    borderRadius: "12px",
    padding: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    fontSize: "11px",
  },

  calendarEventIncome: {
    background: "#dbeafe",
    color: "#1d4ed8",
  },

  calendarEventBill: {
    background: "#fee2e2",
    color: "#991b1b",
  },

  calendarEventSubscription: {
    background: "#ede9fe",
    color: "#5b21b6",
  },

  calendarEventText: {
    fontWeight: "800",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  calendarEventAmount: {
    opacity: 0.9,
  },

  calendarMore: {
    fontSize: "11px",
    color: "#64748b",
  },

  monthTrendRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    padding: "12px 0",
    borderBottom: "1px solid #e8eef7",
  },

  daySummaryCard: {
    background: "#f8fbff",
    border: "1px solid #dbe4f0",
    borderRadius: "16px",
    padding: "14px",
    marginBottom: "10px",
  },

  inlineInfoBlock: {
    marginTop: "12px",
  },
};











