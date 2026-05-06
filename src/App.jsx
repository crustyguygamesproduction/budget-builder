import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import BottomNav from "./components/BottomNav";
import TopBar from "./components/TopBar";
import PageGuide from "./components/PageGuide";
import AuthPage from "./pages/AuthPage";
import { styles } from "./styles";
import { getMainStyle } from "./lib/styleHelpers";
import { getBankFeedReadiness } from "./lib/bankFeeds";
import { getSubscriptionStatus } from "./lib/productPlan";
import { buildMoneyUnderstanding } from "./lib/moneyUnderstanding";
import { buildAppMoneyModel } from "./lib/appMoneyModel";
import { buildVisibleReviewChecks } from "./lib/reviewQueue";
import {
  readDismissedReviewCheckKeys,
  REVIEW_DISMISSED_CHECKS_KEY,
  REVIEW_DISMISSALS_CHANGED_EVENT,
} from "./lib/reviewDismissals";
import { useViewport } from "./hooks/useViewport";
import { useMoneyHubData } from "./hooks/useMoneyHubData";
import { useCoachSnapshot } from "./hooks/useCoachSnapshot";

const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const CoachPage = lazy(() => import("./pages/CoachPageGuarded"));
const ConfidencePage = lazy(() => import("./pages/ConfidencePage"));
const DebtsPage = lazy(() => import("./pages/DebtsPageUx"));
const GoalsPage = lazy(() => import("./pages/GoalsPage"));
const InvestmentsPage = lazy(() => import("./pages/InvestmentsPageUx"));
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
  const [dismissedCheckKeys, setDismissedCheckKeys] = useState(() => readDismissedReviewCheckKeys());

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

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    function refreshDismissedChecks() {
      setDismissedCheckKeys(readDismissedReviewCheckKeys());
    }

    function handleStorage(event) {
      if (event.key === REVIEW_DISMISSED_CHECKS_KEY) refreshDismissedChecks();
    }

    window.addEventListener(REVIEW_DISMISSALS_CHANGED_EVENT, refreshDismissedChecks);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(REVIEW_DISMISSALS_CHANGED_EVENT, refreshDismissedChecks);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

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
    () => buildAppMoneyModel({ moneyUnderstanding, accounts, goals, debts, investments, dismissedCheckKeys }),
    [moneyUnderstanding, accounts, goals, debts, investments, dismissedCheckKeys]
  );
  const reviewChecks = useMemo(
    () => buildVisibleReviewChecks({ moneyUnderstanding, appMoneyModel, transactionRules, dismissedCheckKeys }),
    [moneyUnderstanding, appMoneyModel, transactionRules, dismissedCheckKeys]
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
  useCoachSnapshot({
    userId,
    transactions: smartTransactions,
    debts,
    investments,
    goals,
    transactionRules,
    aiMessages,
    subscriptionStatus,
    bankFeedReadiness,
    moneyUnderstanding,
    appMoneyModel,
    moneySnapshot,
  });

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
        <PageGuide
          page={page}
          userId={session.user.id}
          screenWidth={screenWidth}
          transactions={smartTransactions}
          appMoneyModel={appMoneyModel}
          goals={goals}
          debts={debts}
          investments={investments}
          receipts={receipts}
          reviewCheckCount={reviewChecks.length}
          onNavigate={navigateTo}
          onGoToCoach={openCoachWithPrompt}
        />
        <Suspense fallback={<div style={styles.loading}>Opening {PAGE_TITLES[page] || "Money Hub"}...</div>}>
        {page === "today" && <TodayPage transactions={smartTransactions} transactionRules={transactionRules} moneyUnderstanding={moneyUnderstanding} appMoneyModel={appMoneyModel} reviewChecks={reviewChecks} accounts={accounts} goals={goals} debts={debts} investments={investments} statementImports={statementImports} subscriptionStatus={subscriptionStatus} bankFeedReadiness={bankFeedReadiness} onGoToCoach={openCoachWithPrompt} onNavigate={navigateTo} screenWidth={screenWidth} styles={styles} />}
        {page === "upload" && <UploadPage accounts={accounts} statementImports={statementImports} existingTransactions={smartTransactions} moneyUnderstanding={moneyUnderstanding} appMoneyModel={appMoneyModel} transactionRules={transactionRules} onImportDone={async () => { await loadAllData(); await refreshMoneyOrganiser({ force: true }); await loadAllData(); }} onTransactionRulesChange={loadTransactionRules} onGoToCoach={openCoachWithPrompt} screenWidth={screenWidth} styles={styles} />}
        {page === "confidence" && <ConfidencePage transactions={smartTransactions} transactionRules={transactionRules} moneyUnderstanding={{ ...moneyUnderstanding, checks: appMoneyModel?.checksWaiting || moneyUnderstanding.checks }} reviewChecks={reviewChecks} onTransactionRulesChange={loadTransactionRules} returnTarget={returnTarget} onBack={goBackToReturnTarget} screenWidth={screenWidth} styles={styles} />}
        {page === "debts" && <DebtsPage debts={debts} transactions={smartTransactions} moneyUnderstanding={moneyUnderstanding} appMoneyModel={appMoneyModel} documents={debtDocuments} onChange={loadDebts} onDocumentsChange={loadFinancialDocuments} viewerMode={viewerMode} subscriptionStatus={subscriptionStatus} bankFeedReadiness={bankFeedReadiness} styles={styles} />}
        {page === "investments" && <InvestmentsPage investments={investments} transactions={smartTransactions} moneyUnderstanding={moneyUnderstanding} appMoneyModel={appMoneyModel} documents={investmentDocuments} onChange={loadInvestments} onDocumentsChange={loadFinancialDocuments} viewerMode={viewerMode} styles={styles} />}
        {page === "calendar" && <CalendarPage transactions={smartTransactions} transactionRules={transactionRules} moneyUnderstanding={moneyUnderstanding} appMoneyModel={appMoneyModel} reviewChecks={reviewChecks} onTransactionRulesChange={loadTransactionRules} onRefreshMoneyUnderstanding={refreshMoneyUnderstandingAfterCorrection} onNavigate={navigateTo} screenWidth={screenWidth} styles={styles} />}
        {page === "goals" && <GoalsPage goals={goals} accounts={accounts} transactions={smartTransactions} moneyUnderstanding={moneyUnderstanding} appMoneyModel={appMoneyModel} reviewChecks={reviewChecks} transactionRules={transactionRules} onGoToCoach={openCoachWithPrompt} onNavigate={navigateTo} onChange={loadGoals} onAccountsChange={loadAccounts} onTransactionRulesChange={loadTransactionRules} styles={styles} />}
        {page === "receipts" && <ReceiptsPage receipts={receipts} transactions={smartTransactions} moneyUnderstanding={moneyUnderstanding} appMoneyModel={appMoneyModel} onChange={loadReceipts} onGoToCoach={openCoachWithPrompt} styles={styles} />}
        {page === "coach" && <CoachPage transactions={smartTransactions} transactionRules={transactionRules} moneyUnderstanding={moneyUnderstanding} appMoneyModel={appMoneyModel} goals={goals} debts={debts} investments={investments} aiMessages={aiMessages} subscriptionStatus={subscriptionStatus} bankFeedReadiness={bankFeedReadiness} onChange={loadAiMessages} onTransactionRulesChange={loadTransactionRules} onNavigate={navigateTo} screenWidth={screenWidth} viewportHeight={viewportHeight} styles={styles} />}
        {page === "settings" && <SettingsPage userId={session.user.id} transactions={smartTransactions} viewerAccess={viewerAccess} onViewerChange={loadViewerAccess} onDataChange={loadAllData} viewerMode={viewerMode} setViewerMode={setViewerMode} financialDocuments={financialDocuments} subscriptionStatus={subscriptionStatus} bankFeedReadiness={bankFeedReadiness} bankConnections={bankConnections} onShowPrivacy={() => setPage("privacy")} styles={styles} />}
        {page === "privacy" && <PrivacyPage onBack={() => setPage("settings")} styles={styles} />}
        </Suspense>
      </main>
      <BottomNav page={page} setPage={navigateTo} reviewCheckCount={reviewChecks.length} screenWidth={screenWidth} styles={styles} />
    </div>
  );
}
