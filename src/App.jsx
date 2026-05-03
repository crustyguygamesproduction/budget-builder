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
import { useViewport } from "./hooks/useViewport";
import { useMoneyHubData } from "./hooks/useMoneyHubData";
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

function setSessionItem(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Private browsing or strict storage settings can block sessionStorage.
  }
}

function removeSessionItem(key) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Storage is optional for one-shot Coach drafts.
  }
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [page, setPage] = useState("today");
  const [returnTarget, setReturnTarget] = useState(null);

  const [viewerMode, setViewerMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("moneyhub-viewer-preview") === "true";
  });

  const { screenWidth, viewportHeight } = useViewport();
  const userId = getSignedInUserId(session);
  const {
    transactions,
    accounts,
    goals,
    receipts,
    aiMessages,
    debts,
    investments,
    statementImports,
    viewerAccess,
    financialDocuments,
    subscriptionProfile,
    bankConnections,
    transactionRules,
    moneySnapshot,
    loadAllData,
    loadAccounts,
    loadGoals,
    loadReceipts,
    loadAiMessages,
    loadDebts,
    loadInvestments,
    loadViewerAccess,
    loadFinancialDocuments,
    loadTransactionRules,
    refreshMoneyOrganiser,
    refreshMoneyUnderstandingAfterCorrection,
  } = useMoneyHubData(userId);

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
    if (typeof window === "undefined") return;
    localStorage.setItem("moneyhub-viewer-preview", viewerMode ? "true" : "false");
  }, [viewerMode]);

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
    setSessionItem(COACH_DRAFT_KEY, prompt);
    if (options.autoSend) setSessionItem(COACH_AUTOSEND_KEY, "true");
    else removeSessionItem(COACH_AUTOSEND_KEY);
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
        {page === "confidence" && <ConfidencePage transactions={smartTransactions} transactionRules={transactionRules} moneyUnderstanding={{ ...moneyUnderstanding, checks: appMoneyModel?.checksWaiting || moneyUnderstanding.checks }} onTransactionRulesChange={loadTransactionRules} returnTarget={returnTarget} onBack={goBackToReturnTarget} screenWidth={screenWidth} styles={styles} />}
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
