import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import BottomNav from "./components/BottomNav";
import TopBar from "./components/TopBar";
import AuthPage from "./pages/AuthPage";
import { styles } from "./styles";
import { getMainStyle } from "./lib/styleHelpers";
import { getBankFeedReadiness } from "./lib/bankFeeds";
import { getSubscriptionStatus } from "./lib/productPlan";
import { buildMoneyUnderstanding } from "./lib/moneyUnderstanding";
import { buildAppMoneyModel } from "./lib/appMoneyModel";
import { buildCoachContext } from "./lib/coachContext";
import {
  getDataFreshness,
  getSubscriptionSummary,
  getTopCategories,
} from "./lib/dashboardIntelligence";
import {
  getDebtSignals,
  getInvestmentSignals,
} from "./lib/statementSignals";

const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const CoachPage = lazy(() => import("./pages/CoachPageGuarded"));
const ConfidencePage = lazy(() => import("./pages/ConfidencePage"));
const DebtsPage = lazy(() => import("./pages/DebtsPageUx"));
const GoalsPage = lazy(() => import("./pages/GoalsPage"));
const InvestmentsPage = lazy(() => import("./pages/InvestmentsPageUx"));
const OnboardingTutorial = lazy(() => import("./components/OnboardingTutorial"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const ReceiptsPage = lazy(() => import("./pages/ReceiptsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const TodayPage = lazy(() => import("./pages/HomePage"));
const UploadPage = lazy(() => import("./pages/UploadPageSafe"));

const PAGE_TITLES = {
  today: "Today",
  upload: "Upload",
  confidence: "Review",
  debts: "Debts",
  investments: "Investments",
  calendar: "Calendar",
  goals: "Goals",
  receipts: "Receipts",
  coach: "AI Coach",
  settings: "Settings",
  privacy: "Privacy",
};

const COACH_DRAFT_KEY = "moneyhub-coach-draft";
const COACH_AUTOSEND_KEY = "moneyhub-coach-autosend";
const COACH_CONTEXT_SAVE_DELAY_MS = 900;

function getSignedInUserId(session) {
  return session?.user?.id || null;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [page, setPage] = useState("today");
  const [returnTarget, setReturnTarget] = useState(null);

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
  const [subscriptionProfile, setSubscriptionProfile] = useState(null);
  const [bankConnections, setBankConnections] = useState([]);
  const [transactionRules, setTransactionRules] = useState([]);
  const [moneySnapshot, setMoneySnapshot] = useState(null);
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
    const userId = getSignedInUserId(session);
    if (userId) {
      loadAllData(userId);
    } else {
      resetUserData();
    }
    // loadAllData reads the current Supabase client and resets via local setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

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

  function resetUserData() {
    setTransactions([]);
    setAccounts([]);
    setGoals([]);
    setReceipts([]);
    setAiMessages([]);
    setDebts([]);
    setInvestments([]);
    setStatementImports([]);
    setViewerAccess([]);
    setFinancialDocuments([]);
    setSubscriptionProfile(null);
    setBankConnections([]);
    setTransactionRules([]);
    setMoneySnapshot(null);
  }

  function resolveUserId(userId = getSignedInUserId(session)) {
    return userId || null;
  }

  async function loadAllData(userId = getSignedInUserId(session)) {
    const scopedUserId = resolveUserId(userId);
    if (!scopedUserId) {
      resetUserData();
      return;
    }

    await Promise.all([
      loadTransactions(scopedUserId),
      loadAccounts(scopedUserId),
      loadGoals(scopedUserId),
      loadReceipts(scopedUserId),
      loadAiMessages(scopedUserId),
      loadDebts(scopedUserId),
      loadInvestments(scopedUserId),
      loadStatementImports(scopedUserId),
      loadViewerAccess(scopedUserId),
      loadFinancialDocuments(scopedUserId),
      loadSubscriptionProfile(scopedUserId),
      loadBankConnections(scopedUserId),
      loadTransactionRules(scopedUserId),
      loadMoneySnapshot(scopedUserId),
    ]);
  }

  async function refreshMoneyOrganiser(options = {}) {
    try {
      const { data, error } = await supabase.functions.invoke("money-organiser", {
        body: { force: Boolean(options.force) },
      });
      if (error) throw error;
      if (data?.snapshot) setMoneySnapshot(data.snapshot);
      return data?.snapshot || null;
    } catch (error) {
      console.warn("Money organiser could not run", error);
      return null;
    }
  }

  async function refreshMoneyUnderstandingAfterCorrection() {
    const userId = resolveUserId();
    if (!userId) return;

    await loadTransactionRules(userId);
    await loadTransactions(userId);
    await refreshMoneyOrganiser({ force: true });
    await loadMoneySnapshot(userId);
  }

  async function loadMoneySnapshot(userId = getSignedInUserId(session)) {
    const scopedUserId = resolveUserId(userId);
    if (!scopedUserId) {
      setMoneySnapshot(null);
      return;
    }

    const { data, error } = await supabase
      .from("money_understanding_snapshots")
      .select("*")
      .eq("user_id", scopedUserId)
      .eq("model_version", "money-organiser-ai-v1")
      .order("interpreted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setMoneySnapshot(null);
      return;
    }
    setMoneySnapshot(data || null);
  }

  async function loadTransactions(userId = getSignedInUserId(session)) {
    const scopedUserId = resolveUserId(userId);
    if (!scopedUserId) {
      setTransactions([]);
      return;
    }

    const { data, error } = await supabase
      .from("transactions")
      .select("*, accounts(name, institution)")
      .eq("user_id", scopedUserId)
      .order("transaction_date", { ascending: false });

    if (!error) setTransactions(data || []);
  }

  async function loadAccounts(userId = getSignedInUserId(session)) {
    const scopedUserId = resolveUserId(userId);
    if (!scopedUserId) {
      setAccounts([]);
      return;
    }

    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("user_id", scopedUserId)
      .order("created_at", { ascending: true });

    if (!error) setAccounts(data || []);
  }

  async function loadGoals(userId = getSignedInUserId(session)) {
    const scopedUserId = resolveUserId(userId);
    if (!scopedUserId) {
      setGoals([]);
      return;
    }

    const { data, error } = await supabase
      .from("money_goals")
      .select("*")
      .eq("user_id", scopedUserId)
      .order("priority", { ascending: true });
    if (!error) setGoals(data || []);
  }

  async function loadReceipts(userId = getSignedInUserId(session)) {
    const scopedUserId = resolveUserId(userId);
    if (!scopedUserId) {
      setReceipts([]);
      return;
    }

    const { data, error } = await supabase
      .from("receipts")
      .select("*")
      .eq("user_id", scopedUserId)
      .order("created_at", { ascending: false });
    if (!error) setReceipts(data || []);
  }

  async function loadAiMessages(userId = getSignedInUserId(session)) {
    const scopedUserId = resolveUserId(userId);
    if (!scopedUserId) {
      setAiMessages([]);
      return;
    }

    const { data, error } = await supabase
      .from("ai_messages")
      .select("*")
      .eq("user_id", scopedUserId)
      .order("created_at", { ascending: true });
    if (!error) setAiMessages(data || []);
  }

  async function loadDebts(userId = getSignedInUserId(session)) {
    const scopedUserId = resolveUserId(userId);
    if (!scopedUserId) {
      setDebts([]);
      return;
    }

    const { data, error } = await supabase
      .from("debts")
      .select("*")
      .eq("user_id", scopedUserId)
      .order("created_at", { ascending: false });
    if (!error) setDebts(data || []);
  }

  async function loadInvestments(userId = getSignedInUserId(session)) {
    const scopedUserId = resolveUserId(userId);
    if (!scopedUserId) {
      setInvestments([]);
      return;
    }

    const { data, error } = await supabase
      .from("investments")
      .select("*")
      .eq("user_id", scopedUserId)
      .order("created_at", { ascending: false });
    if (!error) setInvestments(data || []);
  }

  async function loadStatementImports(userId = getSignedInUserId(session)) {
    const scopedUserId = resolveUserId(userId);
    if (!scopedUserId) {
      setStatementImports([]);
      return;
    }

    const { data, error } = await supabase
      .from("statement_imports")
      .select("*")
      .eq("user_id", scopedUserId)
      .order("created_at", { ascending: false });
    if (!error) setStatementImports(data || []);
  }

  async function loadViewerAccess(userId = getSignedInUserId(session)) {
    const scopedUserId = resolveUserId(userId);
    if (!scopedUserId) {
      setViewerAccess([]);
      return;
    }

    const { data, error } = await supabase
      .from("viewer_access")
      .select("*")
      .eq("user_id", scopedUserId)
      .order("created_at", { ascending: false });
    setViewerAccess(error ? [] : data || []);
  }

  async function loadFinancialDocuments(userId = getSignedInUserId(session)) {
    const scopedUserId = resolveUserId(userId);
    if (!scopedUserId) {
      setFinancialDocuments([]);
      return;
    }

    const { data, error } = await supabase
      .from("financial_documents")
      .select("*")
      .eq("user_id", scopedUserId)
      .order("created_at", { ascending: false });
    setFinancialDocuments(error ? [] : data || []);
  }

  async function loadSubscriptionProfile(userId = getSignedInUserId(session)) {
    const scopedUserId = resolveUserId(userId);
    if (!scopedUserId) {
      setSubscriptionProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from("subscription_profiles")
      .select("*")
      .eq("user_id", scopedUserId)
      .maybeSingle();
    setSubscriptionProfile(error ? null : data || null);
  }

  async function loadBankConnections(userId = getSignedInUserId(session)) {
    const scopedUserId = resolveUserId(userId);
    if (!scopedUserId) {
      setBankConnections([]);
      return;
    }

    const { data, error } = await supabase
      .from("bank_connections")
      .select("*")
      .eq("user_id", scopedUserId)
      .order("created_at", { ascending: false });
    setBankConnections(error ? [] : data || []);
  }

  async function loadTransactionRules(userId = getSignedInUserId(session)) {
    const scopedUserId = resolveUserId(userId);
    if (!scopedUserId) {
      setTransactionRules([]);
      return;
    }

    const { data, error } = await supabase
      .from("transaction_rules")
      .select("*")
      .eq("user_id", scopedUserId)
      .order("created_at", { ascending: false });
    setTransactionRules(error ? [] : data || []);
  }

  function navigateTo(nextPage, options = {}) {
    if (options.returnToCurrent && nextPage !== page) {
      setReturnTarget({ page, label: PAGE_TITLES[page] || "Back" });
    } else {
      setReturnTarget(null);
    }
    setPage(nextPage);
  }

  function goBackToReturnTarget() {
    if (!returnTarget?.page) return;
    const target = returnTarget.page;
    setReturnTarget(null);
    setPage(target);
  }

  function openCoachWithPrompt(prompt, options = {}) {
    if (typeof window !== "undefined") {
      localStorage.setItem(COACH_DRAFT_KEY, prompt);
      if (options.autoSend) localStorage.setItem(COACH_AUTOSEND_KEY, "true");
      else localStorage.removeItem(COACH_AUTOSEND_KEY);
    }
    navigateTo("coach", options);
  }

  const moneyUnderstanding = useMemo(
    () => buildMoneyUnderstanding({ transactions, transactionRules, snapshot: moneySnapshot }),
    [transactions, transactionRules, moneySnapshot]
  );
  const smartTransactions = moneyUnderstanding.transactions;
  const appMoneyModel = useMemo(
    () => buildAppMoneyModel({ moneyUnderstanding, accounts, goals, debts, investments }),
    [moneyUnderstanding, accounts, goals, debts, investments]
  );

  const subscriptionStatus = useMemo(() => getSubscriptionStatus(subscriptionProfile), [subscriptionProfile]);
  const bankFeedReadiness = useMemo(
    () => getBankFeedReadiness(subscriptionStatus, bankConnections),
    [subscriptionStatus, bankConnections]
  );
  const debtDocuments = useMemo(
    () => financialDocuments.filter((doc) => doc.record_type === "debt"),
    [financialDocuments]
  );
  const investmentDocuments = useMemo(
    () => financialDocuments.filter((doc) => doc.record_type === "investment"),
    [financialDocuments]
  );
  const debtSignals = useMemo(() => getDebtSignals(smartTransactions), [smartTransactions]);
  const investmentSignals = useMemo(() => getInvestmentSignals(smartTransactions), [smartTransactions]);
  const topCategories = useMemo(() => getTopCategories(smartTransactions), [smartTransactions]);
  const subscriptionSummary = useMemo(() => getSubscriptionSummary(smartTransactions), [smartTransactions]);
  const dataFreshness = useMemo(() => getDataFreshness(smartTransactions), [smartTransactions]);
  const coachBrainContext = useMemo(
    () => buildCoachContext({
      transactions: smartTransactions,
      debts,
      investments,
      debtSignals,
      investmentSignals,
      totals: {
        income: appMoneyModel?.income?.monthlyEstimate || 0,
        spending: appMoneyModel?.flexibleSpending?.monthlyEstimate || 0,
        bills: appMoneyModel?.monthlyBillTotal || 0,
        net:
          (appMoneyModel?.income?.monthlyEstimate || 0) -
          (appMoneyModel?.monthlyBillTotal || 0) -
          (appMoneyModel?.flexibleSpending?.monthlyEstimate || 0),
        safeToSpend: appMoneyModel?.savingsCapacity?.safeMonthlyAmount || 0,
        basis: "shared_money_model_monthly_estimate",
      },
      topCategories,
      subscriptionSummary,
      dataFreshness,
      baseMessages: aiMessages,
      userMessage: "",
      subscriptionStatus,
      bankFeedReadiness,
      moneyUnderstanding,
      appMoneyModel,
    }),
    [
      aiMessages,
      appMoneyModel,
      bankFeedReadiness,
      dataFreshness,
      debtSignals,
      debts,
      investmentSignals,
      investments,
      moneyUnderstanding,
      smartTransactions,
      subscriptionStatus,
      subscriptionSummary,
      topCategories,
    ]
  );
  const coachBrainHash = useMemo(() => {
    const latestDate = smartTransactions
      .map((transaction) => transaction.transaction_date)
      .filter(Boolean)
      .sort()
      .at(-1) || "none";
    return [
      smartTransactions.length,
      latestDate,
      moneySnapshot?.id || "no-snapshot",
      goals.length,
      debts.length,
      investments.length,
      transactionRules.length,
      aiMessages.length,
    ].join(":");
  }, [aiMessages.length, debts.length, goals.length, investments.length, moneySnapshot?.id, smartTransactions, transactionRules.length]);

  useEffect(() => {
    if (!session?.user?.id || smartTransactions.length === 0) return undefined;

    const latestTransactionDate = smartTransactions
      .map((transaction) => transaction.transaction_date)
      .filter(Boolean)
      .sort()
      .at(-1) || null;

    const timer = window.setTimeout(async () => {
      const { error } = await supabase.from("coach_context_snapshots").upsert(
        {
          user_id: session.user.id,
          source: "client_interpreted_money_layer",
          context: coachBrainContext,
          context_hash: coachBrainHash,
          transaction_count: smartTransactions.length,
          latest_transaction_date: latestTransactionDate,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (error) {
        console.warn("Coach brain snapshot could not be saved", error);
      }
    }, COACH_CONTEXT_SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [coachBrainContext, coachBrainHash, session?.user?.id, smartTransactions]);

  if (loading) return <div style={styles.loading}>Loading Money Hub...</div>;
  if (!session) {
    return page === "privacy" ? (
      <div style={styles.app}>
        <main style={getMainStyle(screenWidth, "privacy")}>
          <Suspense fallback={<div style={styles.loading}>Opening Privacy...</div>}>
            <PrivacyPage onBack={() => setPage("today")} styles={styles} />
          </Suspense>
        </main>
      </div>
    ) : <AuthPage screenWidth={screenWidth} styles={styles} onShowPrivacy={() => setPage("privacy")} />;
  }

  return (
    <div style={styles.app}>
      <TopBar email={session.user.email} title={PAGE_TITLES[page] || "Money Hub"} page={page} returnTarget={returnTarget} onBack={goBackToReturnTarget} screenWidth={screenWidth} styles={styles} />
      <main style={getMainStyle(screenWidth, page)}>
        <Suspense fallback={<div style={styles.loading}>Opening {PAGE_TITLES[page] || "Money Hub"}...</div>}>
        {page === "today" && <TodayPage transactions={smartTransactions} transactionRules={transactionRules} moneyUnderstanding={moneyUnderstanding} appMoneyModel={appMoneyModel} accounts={accounts} goals={goals} debts={debts} investments={investments} statementImports={statementImports} subscriptionStatus={subscriptionStatus} bankFeedReadiness={bankFeedReadiness} onGoToCoach={openCoachWithPrompt} onNavigate={navigateTo} screenWidth={screenWidth} styles={styles} />}
        {page === "upload" && <UploadPage accounts={accounts} statementImports={statementImports} existingTransactions={smartTransactions} moneyUnderstanding={moneyUnderstanding} appMoneyModel={appMoneyModel} transactionRules={transactionRules} onImportDone={async () => { await loadAllData(); await refreshMoneyOrganiser({ force: true }); await loadAllData(); }} onTransactionRulesChange={loadTransactionRules} onGoToCoach={openCoachWithPrompt} screenWidth={screenWidth} styles={styles} />}
        {page === "confidence" && <ConfidencePage transactions={smartTransactions} transactionRules={transactionRules} moneyUnderstanding={moneyUnderstanding} onTransactionRulesChange={loadTransactionRules} returnTarget={returnTarget} onBack={goBackToReturnTarget} screenWidth={screenWidth} styles={styles} />}
        {page === "debts" && <DebtsPage debts={debts} transactions={smartTransactions} moneyUnderstanding={moneyUnderstanding} appMoneyModel={appMoneyModel} documents={debtDocuments} onChange={loadDebts} onDocumentsChange={loadFinancialDocuments} viewerMode={viewerMode} subscriptionStatus={subscriptionStatus} bankFeedReadiness={bankFeedReadiness} styles={styles} />}
        {page === "investments" && <InvestmentsPage investments={investments} transactions={smartTransactions} moneyUnderstanding={moneyUnderstanding} appMoneyModel={appMoneyModel} documents={investmentDocuments} onChange={loadInvestments} onDocumentsChange={loadFinancialDocuments} viewerMode={viewerMode} styles={styles} />}
        {page === "calendar" && <CalendarPage transactions={smartTransactions} transactionRules={transactionRules} moneyUnderstanding={moneyUnderstanding} appMoneyModel={appMoneyModel} onTransactionRulesChange={loadTransactionRules} onRefreshMoneyUnderstanding={refreshMoneyUnderstandingAfterCorrection} screenWidth={screenWidth} styles={styles} />}
        {page === "goals" && <GoalsPage goals={goals} accounts={accounts} transactions={smartTransactions} moneyUnderstanding={moneyUnderstanding} appMoneyModel={appMoneyModel} transactionRules={transactionRules} onGoToCoach={openCoachWithPrompt} onNavigate={navigateTo} onChange={loadGoals} onAccountsChange={loadAccounts} onTransactionRulesChange={loadTransactionRules} styles={styles} />}
        {page === "receipts" && <ReceiptsPage receipts={receipts} transactions={smartTransactions} moneyUnderstanding={moneyUnderstanding} appMoneyModel={appMoneyModel} onChange={loadReceipts} onGoToCoach={openCoachWithPrompt} styles={styles} />}
        {page === "coach" && <CoachPage transactions={smartTransactions} transactionRules={transactionRules} moneyUnderstanding={moneyUnderstanding} appMoneyModel={appMoneyModel} goals={goals} debts={debts} investments={investments} aiMessages={aiMessages} subscriptionStatus={subscriptionStatus} bankFeedReadiness={bankFeedReadiness} onChange={loadAiMessages} onTransactionRulesChange={loadTransactionRules} onNavigate={navigateTo} screenWidth={screenWidth} viewportHeight={viewportHeight} styles={styles} />}
        {page === "settings" && <SettingsPage userId={session.user.id} transactions={smartTransactions} viewerAccess={viewerAccess} onViewerChange={loadViewerAccess} onDataChange={loadAllData} viewerMode={viewerMode} setViewerMode={setViewerMode} financialDocuments={financialDocuments} subscriptionStatus={subscriptionStatus} bankFeedReadiness={bankFeedReadiness} bankConnections={bankConnections} onShowPrivacy={() => setPage("privacy")} styles={styles} />}
        {page === "privacy" && <PrivacyPage onBack={() => setPage("settings")} styles={styles} />}
        </Suspense>
      </main>
      <Suspense fallback={null}><OnboardingTutorial setPage={navigateTo} userId={session.user.id} screenWidth={screenWidth} transactionCount={transactions.length} accountCount={accounts.length} /></Suspense>
      <BottomNav page={page} setPage={navigateTo} screenWidth={screenWidth} styles={styles} />
    </div>
  );
}
