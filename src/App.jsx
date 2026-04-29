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
  isThisMonth,
  isTransactionInMonth,
  normalizeText,
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























