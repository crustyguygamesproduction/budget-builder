import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import BottomNav from "./components/BottomNav";
import TopBar from "./components/TopBar";
import GoalsPage from "./pages/GoalsPage";
import CoachPage from "./pages/CoachPage";
import SettingsPage from "./pages/SettingsPage";
import TodayPage from "./pages/TodayPage";
import AuthPage from "./pages/AuthPage";
import AccountsPage from "./pages/AccountsPage";
import ReceiptsPage from "./pages/ReceiptsPage";
import CalendarPage from "./pages/CalendarPage";
import DebtsPage from "./pages/DebtsPage";
import InvestmentsPage from "./pages/InvestmentsPage";
import UploadPage from "./pages/UploadPage";
import {
  addDays,
  compareDayDates,
  compareMonthDates,
  dayDifference,
  formatCurrency,
  formatDateLong,
  formatDateShort,
  formatMonthYear,
  getMeaningfulCategory,
  isInternalTransferLike,
  isThisMonth,
  isTransactionInMonth,
  isValidTransactionDate,
  normalizeText,
  numberOrNull,
  parseAppDate,
  startOfDay,
  startOfMonth,
  toIsoDate,
} from "./lib/finance";

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

const COACH_DRAFT_KEY = "moneyhub-coach-draft";
const COACH_AUTOSEND_KEY = "moneyhub-coach-autosend";
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
  if (!session) return <AuthPage screenWidth={screenWidth} styles={styles} />;

  return (
    <div style={styles.app}>
      <TopBar
        email={session.user.email}
        title={PAGE_TITLES[page] || "Money Hub"}
        page={page}
        screenWidth={screenWidth}
        styles={styles}
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
            styles={styles}
            helpers={{
              buildDailyBrief,
              buildSubscriptionCoachPrompt,
              getCashSummary,
              getCoachPromptIdeas,
              getDataFreshness,
              getDebtStatusSummary,
              getDisplayedMonthSnapshot,
              getHomeStatusPillStyle,
              getInvestmentStatusSummary,
              getStatementCoverageSummary,
              getSubscriptionSummary,
              getTopCategories,
              getTransferSummary,
              hasMatchingDebt,
              hasMatchingInvestment,
            }}
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
            styles={styles}
            helpers={{
              enhanceTransactions,
              formatDateRange,
              getGridStyle,
              getHistorySummary,
              getImportFingerprint,
              getImportOverlapSummary,
              getRecurringSummary,
              getStatusPillStyle,
              getTransactionConfidence,
              getTransferSummary,
              summariseRowsForImport,
            }}
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
            styles={styles}
            helpers={{
              buildDebtDedupeKey,
              buildKeywords,
              fileToDataUrl,
              getDebtMatchSummary,
              getDebtMonthlyStatus,
              getDebtPortfolioSnapshot,
              getDebtProgressSummary,
              getStatusPillStyle,
              hasMatchingDebt,
              hasMeaningfulExtraction,
            }}
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
            styles={styles}
            helpers={{
              buildInvestmentDedupeKey,
              buildKeywords,
              fileToDataUrl,
              formatInvestmentSignalMeta,
              formatInvestmentSignalNet,
              getInvestmentMatchSummary,
              getInvestmentMonthlyStatus,
              getInvestmentPerformanceSummary,
              getInvestmentPortfolioSnapshot,
              getInvestmentSignalNote,
              getStatusPillStyle,
              hasMatchingInvestment,
              hasMeaningfulExtraction,
            }}
          />
        )}

        {page === "accounts" && (
          <AccountsPage accounts={accounts} transactions={smartTransactions} styles={styles} />
        )}

        {page === "calendar" && (
          <CalendarPage
            transactions={smartTransactions}
            screenWidth={screenWidth}
            styles={styles}
            helpers={{
              buildCalendarMonth,
              buildHistoricalCalendarMonth,
              buildRollingHistoryWindow,
              canShiftCalendarMonth,
              canShiftShortWindow,
              clampDayToRange,
              clampMonthToRange,
              downloadCalendarEvent,
              formatShortWeekday,
              formatShortWindowTitle,
              getCalendarEventStyle,
              getCalendarMonthBounds,
              getCalendarPatternSummary,
              getCalendarSummaryGridStyle,
              getDataFreshness,
              getEarliestHistoryDate,
              getLatestHistoryDate,
              getMonthlyBreakdown,
              getMonthlyHistorySummary,
              getRecurringCalendarEvents,
              getRollingDaysGridStyle,
              getRollingWindowSummary,
              getTimeframeDayCount,
              getTimeframeMonthCount,
              isShortTimeframe,
            }}
          />
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
            styles={styles}
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
            styles={styles}
            helpers={{
              getTopCategories,
              getSubscriptionSummary,
              getDataFreshness,
              getCoachPromptIdeas,
              getDebtMonthlyStatus,
              getInvestmentMonthlyStatus,
              getMonthlyBreakdown,
              getCalendarPatternSummary,
              getTransferSummary,
            }}
          />
        )}

        {page === "settings" && (
          <SettingsPage
            viewerAccess={viewerAccess}
            onViewerChange={loadViewerAccess}
            viewerMode={viewerMode}
            setViewerMode={setViewerMode}
            financialDocuments={financialDocuments}
            styles={styles}
          />
        )}
      </main>

      <BottomNav page={page} setPage={setPage} screenWidth={screenWidth} styles={styles} />
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
    const looksLikePlaceholder = Math.abs(total) < 0.01 && freshness.hasData;

    if (!looksLikePlaceholder) {
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
    const monthSnapshot = getDisplayedMonthSnapshot(transactions);
    if (freshness.hasData) {
      return {
        hasLiveBalances: false,
        amount: monthSnapshot.net,
        primaryDisplay: `${monthSnapshot.net >= 0 ? "+" : "-"}${formatCurrency(Math.abs(monthSnapshot.net))}`,
        label: `${monthSnapshot.monthName} reliable read`,
        badge: "Needs latest statement",
        body: `This is the latest month Money Hub can explain properly. It shows ${formatCurrency(monthSnapshot.income)} real income against ${formatCurrency(monthSnapshot.spending)} real spending, after detected transfers are stripped out.`,
      };
    }

    return {
      hasLiveBalances: false,
      amount: 0,
      primaryDisplay: "Needs refresh",
      label: "Recent data needed",
      badge: "Refresh needed",
      body: "Upload your first statement so Money Hub can build a real picture instead of guessing.",
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

  return buildInvestmentSignalGroups(transactions, keywords);
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

function buildInvestmentSignalGroups(transactions, keywords) {
  const groups = {};

  transactions.forEach((transaction) => {
    if (isInternalTransferLike(transaction)) return;

    const amount = Number(transaction.amount || 0);
    if (!amount) return;

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
        contributionCount: 0,
        withdrawalCount: 0,
        total: 0,
        withdrawals: 0,
        netContributed: 0,
        average: 0,
        lastDate: transaction.transaction_date || "",
      };
    }

    groups[key].count += 1;

    if (amount < 0) {
      groups[key].contributionCount += 1;
      groups[key].total += Math.abs(amount);
    } else {
      groups[key].withdrawalCount += 1;
      groups[key].withdrawals += amount;
    }

    groups[key].netContributed = groups[key].total - groups[key].withdrawals;
    groups[key].average =
      groups[key].contributionCount > 0
        ? groups[key].total / groups[key].contributionCount
        : 0;

    if (
      transaction.transaction_date &&
      (!groups[key].lastDate || transaction.transaction_date > groups[key].lastDate)
    ) {
      groups[key].lastDate = transaction.transaction_date;
    }
  });

  return Object.values(groups)
    .filter((group) => group.contributionCount > 0 || group.withdrawalCount > 0)
    .sort((a, b) => Math.abs(b.netContributed) - Math.abs(a.netContributed))
    .slice(0, 6);
}

function formatInvestmentSignalNet(signal) {
  const net = Number(signal.netContributed ?? signal.total ?? 0);
  if (net > 0) return formatCurrency(net);
  if (net < 0) return `-${formatCurrency(Math.abs(net))}`;
  return "Even";
}

function formatInvestmentSignalMeta(signal) {
  const contributions = Number(signal.contributionCount ?? signal.count ?? 0);
  const withdrawals = Number(signal.withdrawalCount || 0);
  const parts = [];

  if (contributions > 0) {
    parts.push(`${contributions} deposit${contributions === 1 ? "" : "s"}`);
  }

  if (withdrawals > 0) {
    parts.push(`${withdrawals} withdrawal${withdrawals === 1 ? "" : "s"}`);
  }

  if (signal.average > 0) {
    parts.push(`avg deposit ${formatCurrency(signal.average)}`);
  }

  parts.push(`last seen ${signal.lastDate || "unknown"}`);

  return parts.join(" · ");
}

function getInvestmentSignalNote(signal) {
  const deposited = formatCurrency(Number(signal.total || 0));
  const withdrawn = formatCurrency(Number(signal.withdrawals || 0));
  const net = formatInvestmentSignalNet(signal);
  return `Created from statement activity for ${signal.label}. Deposits spotted: ${deposited}. Withdrawals spotted: ${withdrawn}. Net put in: ${net}. Check this against the broker before treating it as portfolio value.`;
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

function getGridStyle(screenWidth) {
  return {
    ...styles.grid,
    gridTemplateColumns: screenWidth <= 480 ? "1fr" : "1fr 1fr",
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

function getHomeStatusPillStyle(tone) {
  const map = {
    good: {
      background: "rgba(220, 252, 231, 0.95)",
      color: "#14532d",
      border: "1px solid rgba(187, 247, 208, 0.95)",
    },
    warn: {
      background: "rgba(254, 243, 199, 0.96)",
      color: "#78350f",
      border: "1px solid rgba(253, 230, 138, 0.95)",
    },
    bad: {
      background: "rgba(254, 226, 226, 0.96)",
      color: "#7f1d1d",
      border: "1px solid rgba(254, 202, 202, 0.95)",
    },
    neutral: {
      background: "rgba(255, 255, 255, 0.18)",
      color: "white",
      border: "1px solid rgba(255,255,255,0.28)",
    },
  };

  return {
    ...styles.pulseTag,
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
    cursor: "pointer",
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

  compactInsightGrid: {
    display: "grid",
    gap: "8px",
  },

  insightCard: {
    background: "#f8fbff",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
    padding: "12px",
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
    fontSize: "15px",
    letterSpacing: "-0.02em",
  },

  insightBody: {
    margin: 0,
    color: "#475569",
    lineHeight: 1.45,
    fontSize: "13px",
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
    padding: "12px",
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
















