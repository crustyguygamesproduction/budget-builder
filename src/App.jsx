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
  buildDebtDedupeKey,
  buildInvestmentDedupeKey,
  buildKeywords,
  formatInvestmentSignalMeta,
  formatInvestmentSignalNet,
  getDebtMatchSummary,
  getDebtMonthlyStatus,
  getDebtSignals,
  getDebtStatusSummary,
  getInvestmentMatchSummary,
  getInvestmentMonthlyStatus,
  getInvestmentSignalNote,
  getInvestmentSignals,
  getInvestmentStatusSummary,
  hasMatchingDebt,
  hasMatchingInvestment,
} from "./lib/statementSignals";
import {
  buildDailyBrief,
  buildSubscriptionCoachPrompt,
  enhanceTransactions,
  getCashSummary,
  getCoachPromptIdeas,
  getDataFreshness,
  getDebtPortfolioSnapshot,
  getDebtProgressSummary,
  getDisplayedMonthSnapshot,
  getHistorySummary,
  getInvestmentPerformanceSummary,
  getInvestmentPortfolioSnapshot,
  getRecurringSummary,
  getStatementCoverageSummary,
  getSubscriptionSummary,
  getTopCategories,
  getTransferSummary,
  getTrendSummary,
  hasMeaningfulExtraction,
} from "./lib/dashboardIntelligence";
import {
  fileToDataUrl,
  getCalendarPatternSummary,
  getMonthlyBreakdown,
} from "./lib/calendarIntelligence";
import {
  getGridStyle,
  getHomeStatusPillStyle,
  getMainStyle,
  getStatusPillStyle,
} from "./lib/styleHelpers";
import {
  formatCurrency,
  isInternalTransferLike,
  isTransactionInMonth,
  numberOrNull,
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

