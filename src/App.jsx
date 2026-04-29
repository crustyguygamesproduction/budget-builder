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
import { styles } from "./styles";
import {
  cleanEventTitle,
  fileToDataUrl,
  getCalendarPatternSummary,
  getMonthlyBreakdown,
  getRecurringCalendarEvents,
} from "./lib/calendarIntelligence";
import {
  getGridStyle,
  getHomeStatusPillStyle,
  getMainStyle,
  getStatusPillStyle,
} from "./lib/styleHelpers";
import {
  dayDifference,
  formatCurrency,
  formatDateShort,
  formatMonthYear,
  getMeaningfulCategory,
  isInternalTransferLike,
  isThisMonth,
  isTransactionInMonth,
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
              getGridStyle,
              getHistorySummary,
              getRecurringSummary,
              getStatusPillStyle,
              getTransferSummary,
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
            helpers={{ getDataFreshness }}
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






















