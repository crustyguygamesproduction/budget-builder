import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { supabase } from "./supabase";

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
  }, [session]);

  useEffect(() => {
    function handleResize() {
      setScreenWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  async function loadAllData() {
    await Promise.all([
      loadTransactions(),
      loadAccounts(),
      loadGoals(),
      loadReceipts(),
      loadAiMessages(),
      loadDebts(),
      loadInvestments(),
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

  function openCoachWithPrompt(prompt) {
    if (typeof window !== "undefined") {
      localStorage.setItem(COACH_DRAFT_KEY, prompt);
    }
    setPage("coach");
  }

  if (loading) return <div style={styles.loading}>Loading Money Hub...</div>;
  if (!session) return <AuthPage screenWidth={screenWidth} />;

  const debtSignals = getDebtSignals(transactions);
  const investmentSignals = getInvestmentSignals(transactions);
  const trendSummary = getTrendSummary(transactions);
  const historySummary = getHistorySummary(transactions);
  const recurringSummary = getRecurringSummary(transactions);

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
            transactions={transactions}
            accounts={accounts}
            goals={goals}
            receipts={receipts}
            debts={debts}
            investments={investments}
            debtSignals={debtSignals}
            investmentSignals={investmentSignals}
            trendSummary={trendSummary}
            historySummary={historySummary}
            recurringSummary={recurringSummary}
            onGoToCoach={openCoachWithPrompt}
            screenWidth={screenWidth}
          />
        )}

        {page === "upload" && (
          <UploadPage
            accounts={accounts}
            onImportDone={loadAllData}
            screenWidth={screenWidth}
          />
        )}

        {page === "debts" && (
          <DebtsPage
            debts={debts}
            debtSignals={debtSignals}
            transactions={transactions}
            onChange={loadDebts}
            trendSummary={trendSummary}
          />
        )}

        {page === "investments" && (
          <InvestmentsPage
            investments={investments}
            investmentSignals={investmentSignals}
            transactions={transactions}
            onChange={loadInvestments}
          />
        )}

        {page === "accounts" && (
          <AccountsPage accounts={accounts} transactions={transactions} />
        )}

        {page === "calendar" && (
          <CalendarPage transactions={transactions} screenWidth={screenWidth} />
        )}

        {page === "goals" && (
          <GoalsPage goals={goals} transactions={transactions} />
        )}

        {page === "receipts" && (
          <ReceiptsPage
            receipts={receipts}
            transactions={transactions}
            onChange={loadReceipts}
          />
        )}

        {page === "coach" && (
          <CoachPage
            transactions={transactions}
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

        {page === "settings" && <SettingsPage />}
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
  receipts,
  debts,
  investments,
  debtSignals,
  investmentSignals,
  trendSummary,
  historySummary,
  recurringSummary,
  onGoToCoach,
  screenWidth,
}) {
  const totals = useMemo(() => getTotals(transactions), [transactions]);
  const topCategories = useMemo(() => getTopCategories(transactions), [transactions]);

  const recent = transactions.slice(0, 6);
  const subscriptions = transactions.filter((t) => t.is_subscription).length;
  const matchedReceipts = receipts.filter(
    (receipt) => receipt.matched_status === "matched"
  ).length;

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
    subscriptions,
    goalPercent,
  });

  const coachPrompts = getCoachPromptIdeas({
    topCategories,
    totals,
    houseGoal,
    debtSignals,
    investmentSignals,
  }).slice(0, 5);

  const unlinkedDebtSignals = debtSignals.filter(
    (signal) => !hasMatchingDebt(signal, debts)
  );
  const unlinkedInvestmentSignals = investmentSignals.filter(
    (signal) => !hasMatchingInvestment(signal, investments)
  );

  return (
    <>
      <section style={styles.balanceCard}>
        <div style={styles.balanceTopRow}>
          <p style={styles.smallWhite}>Safe to spend estimate</p>
          <span style={styles.pulseTag}>Live signal</span>
        </div>

        <h1 style={getBigMoneyStyle(screenWidth)}>£{totals.safeToSpend.toFixed(2)}</h1>
        <p style={styles.balanceSubcopy}>
          Built from imported income, bills, spending and transfers already detected.
        </p>

        <div style={styles.balancePills}>
          <StatPill label="Net" value={`£${totals.net.toFixed(2)}`} />
          <StatPill label="Bills" value={`£${totals.bills.toFixed(2)}`} />
          <StatPill label="Accounts" value={`${accounts.length}`} />
        </div>
      </section>

      <div style={getGridStyle(screenWidth)}>
        <MiniCard title="Income" value={`£${totals.income.toFixed(2)}`} />
        <MiniCard title="Spending" value={`£${totals.spending.toFixed(2)}`} />
        <MiniCard title="Debts" value={`${debts.length || unlinkedDebtSignals.length}`} />
        <MiniCard
          title="Investments"
          value={`${investments.length || unlinkedInvestmentSignals.length}`}
        />
      </div>

      <Section title="AI Home Screen">
        <div style={styles.aiInsightGrid}>
          <InsightCard
            label="Daily brief"
            headline={dailyBrief.headline}
            body={dailyBrief.body}
          />
          <InsightCard
            label="Trend"
            headline={trendSummary.headline}
            body={trendSummary.body}
          />
          <InsightCard
            label="Statement health"
            headline={historySummary.headline}
            body={historySummary.body}
          />
          <InsightCard
            label="Recurring confidence"
            headline={recurringSummary.headline}
            body={recurringSummary.body}
          />
          <InsightCard
            label="Debt watch"
            headline={debtStatusSummary.headline}
            body={debtStatusSummary.body}
          />
          <InsightCard
            label="Investing watch"
            headline={investmentStatusSummary.headline}
            body={investmentStatusSummary.body}
          />
        </div>
      </Section>

      <Section title="Ask AI Next">
        <p style={styles.sectionIntro}>
          Quick money reads based on your imported statement history.
        </p>

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

      <Section title="Auto-Filled Signals">
        <Row name="Receipts matched" value={`${matchedReceipts}`} />
        <Row name="Subscriptions spotted" value={`${subscriptions}`} />
        <Row name="Likely debt streams" value={`${unlinkedDebtSignals.length}`} />
        <Row
          name="Likely investing streams"
          value={`${unlinkedInvestmentSignals.length}`}
        />
      </Section>

      <Section title="Top Spending Areas">
        {topCategories.length === 0 ? (
          <p style={styles.emptyText}>
            Upload a statement to see where your money is going.
          </p>
        ) : (
          topCategories.map((item) => (
            <Row
              key={item.category}
              name={item.category}
              value={`£${item.total.toFixed(2)}`}
            />
          ))
        )}
      </Section>

      <Section title="Recent Transactions">
        {recent.length === 0 ? (
          <p style={styles.emptyText}>
            No transactions yet. Upload your first CSV statement.
          </p>
        ) : (
          recent.map((t) => (
            <TransactionRow
              key={t.id}
              name={t.description || "Transaction"}
              meta={`${t.transaction_date || "No date"} · ${
                t.category || "Uncategorised"
              }`}
              amount={Number(t.amount || 0)}
            />
          ))
        )}
      </Section>
    </>
  );
}

function UploadPage({ accounts, onImportDone, screenWidth }) {
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  function cleanAmount(value) {
    return Number(
      String(value || "")
        .replace(/£/g, "")
        .replace(/,/g, "")
        .trim()
    );
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
    return String(text || "").trim();
  }

  function detectCategory(description, amount) {
    const text = String(description || "").toLowerCase();

    if (amount > 0 && (text.includes("salary") || text.includes("payroll") || text.includes("wage"))) {
      return "Income";
    }

    if (text.includes("rent")) return "Bill";
    if (text.includes("council")) return "Bill";
    if (text.includes("electric")) return "Bill";
    if (text.includes("gas")) return "Bill";
    if (text.includes("water")) return "Bill";
    if (text.includes("mortgage")) return "Bill";

    if (text.includes("netflix")) return "Subscription";
    if (text.includes("spotify")) return "Subscription";
    if (text.includes("prime")) return "Subscription";
    if (text.includes("apple")) return "Subscription";
    if (text.includes("google")) return "Subscription";
    if (text.includes("disney")) return "Subscription";

    if (text.includes("tesco")) return "Groceries";
    if (text.includes("aldi")) return "Groceries";
    if (text.includes("lidl")) return "Groceries";
    if (text.includes("asda")) return "Groceries";
    if (text.includes("sainsbury")) return "Groceries";

    if (text.includes("shell")) return "Fuel";
    if (text.includes("bp")) return "Fuel";
    if (text.includes("esso")) return "Fuel";

    if (text.includes("costa")) return "Treats";
    if (text.includes("mcdonald")) return "Treats";
    if (text.includes("kfc")) return "Treats";
    if (text.includes("deliveroo")) return "Takeaway";
    if (text.includes("uber eats")) return "Takeaway";

    if (text.includes("amazon")) return "Shopping";
    if (text.includes("uber")) return "Transport";
    if (text.includes("trainline")) return "Transport";

    if (
      text.includes("transfer") ||
      text.includes("faster payment") ||
      text.includes("standing order to savings") ||
      text.includes("to savings")
    ) {
      return "Internal Transfer";
    }

    return amount > 0 ? "Income" : "Spending";
  }

  function buildFileCard(file, rows) {
    const guessedName = guessAccountName(file.name);
    const matchingAccount = accounts.find(
      (account) =>
        normalizeText(account.name) === normalizeText(guessedName) ||
        normalizeText(account.nickname) === normalizeText(guessedName)
    );

    return {
      id: `${file.name}-${file.size}-${file.lastModified}`,
      file,
      fileName: file.name,
      rows,
      selectedAccountId: matchingAccount?.id || "",
      newAccountName: matchingAccount ? "" : guessedName,
      guessedAccountName: guessedName,
    };
  }

  function handleFiles(event) {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) return;

    selectedFiles.forEach((file) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
          const cleaned = results.data
            .map((row) => {
              const amount = cleanAmount(row.Amount);

              return {
                date: row.Date,
                description: normalizeDescription(row.Description),
                amount,
                direction: amount >= 0 ? "in" : "out",
                category: detectCategory(row.Description || "", amount),
              };
            })
            .filter((row) => row.date && row.description && !Number.isNaN(row.amount));

          setFiles((prev) => {
            const nextCard = buildFileCard(file, cleaned);
            const withoutDuplicate = prev.filter((item) => item.id !== nextCard.id);
            return [...withoutDuplicate, nextCard];
          });
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

      for (const fileItem of files) {
        if (!fileItem.rows.length) continue;

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
          })
          .select()
          .single();

        if (importError) throw importError;

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
          is_internal_transfer: row.category === "Internal Transfer",
          is_income: row.category === "Income",
          is_bill: row.category === "Bill",
          is_subscription: row.category === "Subscription",
          ai_confidence: 0.82,
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
        `Imported ${totalSavedFiles} file${totalSavedFiles === 1 ? "" : "s"} and scanned ${totalRows} rows. Duplicate transactions were skipped automatically.`
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
  const previewTotals = getTotals(
    allPreviewRows.map((row) => ({
      amount: row.amount,
      category: row.category,
      is_bill: row.category === "Bill",
      is_subscription: row.category === "Subscription",
      is_internal_transfer: row.category === "Internal Transfer",
    }))
  );
  const previewHistory = getHistorySummary(
    allPreviewRows.map((row, index) => ({
      id: index,
      amount: row.amount,
      transaction_date: row.date,
      description: row.description,
      is_internal_transfer: row.category === "Internal Transfer",
      is_bill: row.category === "Bill",
      is_subscription: row.category === "Subscription",
    }))
  );
  const previewRecurring = getRecurringSummary(
    allPreviewRows.map((row, index) => ({
      id: index,
      amount: row.amount,
      transaction_date: row.date,
      description: row.description,
      is_internal_transfer: row.category === "Internal Transfer",
      is_bill: row.category === "Bill",
      is_subscription: row.category === "Subscription",
      is_income: row.category === "Income",
    }))
  );

  return (
    <>
      <Section title="Bulk Statement Upload">
        <p style={styles.sectionIntro}>
          Add multiple CSV statements at once. The app will try to separate the
          accounts, ignore likely internal transfers, detect recurring payments,
          and avoid duplicate transactions if the same statement gets uploaded again.
        </p>

        <input
          type="file"
          accept=".csv"
          multiple
          onChange={handleFiles}
          style={styles.input}
        />
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
            </div>
          </Section>

          <Section title="Files To Import">
            {files.map((item) => (
              <div key={item.id} style={styles.signalCard}>
                <div style={styles.signalHeader}>
                  <div>
                    <strong>{item.fileName}</strong>
                    <p style={styles.transactionMeta}>
                      {item.rows.length} rows · guessed account{" "}
                      {item.guessedAccountName || "not obvious"}
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

                <p style={styles.smallMuted}>
                  First few transactions:{" "}
                  {item.rows
                    .slice(0, 3)
                    .map((row) => row.description)
                    .join(" · ")}
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

function DebtsPage({ debts, debtSignals, transactions, onChange, trendSummary }) {
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [aiText, setAiText] = useState("");
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

  function fillFromSignal(signal) {
    setForm({
      name: signal.label,
      lender: signal.label,
      starting_balance: "",
      current_balance: "",
      minimum_payment: signal.average.toFixed(2),
      due_day: "",
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

  async function saveDebt(extra = {}) {
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
          This handles AI-detected payment streams and plain-English setup, then
          checks whether each debt looks paid this month, due soon, or worth checking.
        </p>
      </Section>

      <div style={styles.grid}>
        <MiniCard title="Debts" value={`${debts.length}`} />
        <MiniCard title="Signals" value={`${unlinkedSignals.length}`} />
        <MiniCard title="Detected Paid Out" value={`£${totalDetectedPayments.toFixed(2)}`} />
        <MiniCard title="Trend" value={trendSummary.label} />
      </div>

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
                  onClick={() => saveSignalAsDebt(signal)}
                  disabled={saving}
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
          type="number"
          value={form.starting_balance}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, starting_balance: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Current balance"
          type="number"
          value={form.current_balance}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, current_balance: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Minimum monthly payment"
          type="number"
          value={form.minimum_payment}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, minimum_payment: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Due day of month"
          type="number"
          value={form.due_day}
          onChange={(e) => setForm((prev) => ({ ...prev, due_day: e.target.value }))}
        />
        <input
          style={styles.input}
          placeholder="Interest rate %"
          type="number"
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

        <button style={styles.primaryBtn} onClick={() => saveDebt()} disabled={saving}>
          {saving ? "Saving..." : "Save Debt"}
        </button>
      </Section>

      <Section title="Saved Debts">
        {debts.length === 0 ? (
          <p style={styles.emptyText}>No debts saved yet.</p>
        ) : (
          debts.map((debt) => {
            const match = getDebtMatchSummary(debt, transactions);
            const status = getDebtMonthlyStatus(debt, transactions);
            return (
              <div key={debt.id} style={styles.signalCard}>
                <div style={styles.signalHeader}>
                  <div>
                    <strong>{debt.name}</strong>
                    <p style={styles.transactionMeta}>
                      {debt.lender || "No lender"} · {debt.status || "active"} · source{" "}
                      {debt.source || "manual"}
                    </p>
                  </div>
                  <strong>
                    {debt.current_balance != null
                      ? `£${Number(debt.current_balance).toFixed(2)}`
                      : "Balance later"}
                  </strong>
                </div>
                <p style={styles.signalBody}>
                  Min payment:{" "}
                  {debt.minimum_payment != null
                    ? `£${Number(debt.minimum_payment).toFixed(2)}`
                    : "not set"}
                  {" · "}
                  Due day: {debt.due_day || "not set"}
                  {" · "}
                  Matched payments: {match.count}
                  {" · "}
                  Last seen: {match.lastDate || "not found yet"}
                </p>
                <div style={styles.statusPillRow}>
                  <span style={getStatusPillStyle(status.tone)}>{status.label}</span>
                </div>
              </div>
            );
          })
        )}
      </Section>
    </>
  );
}

function InvestmentsPage({ investments, investmentSignals, transactions, onChange }) {
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [aiText, setAiText] = useState("");
  const [form, setForm] = useState({
    name: "",
    platform: "",
    asset_type: "general",
    current_value: "",
    monthly_contribution: "",
    risk_level: "",
    notes: "",
  });

  const unlinkedSignals = investmentSignals.filter(
    (signal) => !hasMatchingInvestment(signal, investments)
  );
  const totalDetectedInvesting = investmentSignals.reduce(
    (sum, item) => sum + item.total,
    0
  );

  function fillFromSignal(signal) {
    setForm({
      name: signal.label,
      platform: signal.label,
      asset_type: "general",
      current_value: "",
      monthly_contribution: signal.average.toFixed(2),
      risk_level: "",
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
        notes: extracted.notes || `AI setup: ${aiText.trim()}`,
      });
      setAiNote(data?.message || "AI filled the investment form. Check it before saving.");
    } catch (error) {
      setAiNote(error.message || "Could not understand that investment yet.");
    } finally {
      setAiBusy(false);
    }
  }

  async function saveInvestment(extra = {}) {
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
          This handles AI-detected broker funding and plain-English setup, then
          checks whether contributions are still happening this month.
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
                  disabled={saving}
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
          placeholder="Current value"
          type="number"
          value={form.current_value}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, current_value: e.target.value }))
          }
        />
        <input
          style={styles.input}
          placeholder="Monthly contribution"
          type="number"
          value={form.monthly_contribution}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, monthly_contribution: e.target.value }))
          }
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

        <button style={styles.primaryBtn} onClick={() => saveInvestment()} disabled={saving}>
          {saving ? "Saving..." : "Save Investment"}
        </button>
      </Section>

      <Section title="Saved Investments">
        {investments.length === 0 ? (
          <p style={styles.emptyText}>No investments saved yet.</p>
        ) : (
          investments.map((investment) => {
            const match = getInvestmentMatchSummary(investment, transactions);
            const status = getInvestmentMonthlyStatus(investment, transactions);
            return (
              <div key={investment.id} style={styles.signalCard}>
                <div style={styles.signalHeader}>
                  <div>
                    <strong>{investment.name}</strong>
                    <p style={styles.transactionMeta}>
                      {investment.platform || "No platform"} · {investment.asset_type || "general"} · source{" "}
                      {investment.source || "manual"}
                    </p>
                  </div>
                  <strong>
                    {investment.current_value != null
                      ? `£${Number(investment.current_value).toFixed(2)}`
                      : "Value later"}
                  </strong>
                </div>
                <p style={styles.signalBody}>
                  Monthly contribution:{" "}
                  {investment.monthly_contribution != null
                    ? `£${Number(investment.monthly_contribution).toFixed(2)}`
                    : "not set"}
                  {" · "}
                  Matched contributions: {match.count}
                  {" · "}
                  Last seen: {match.lastDate || "not found yet"}
                  {" · "}
                  Risk: {investment.risk_level || "not set"}
                </p>
                <div style={styles.statusPillRow}>
                  <span style={getStatusPillStyle(status.tone)}>{status.label}</span>
                </div>
              </div>
            );
          })
        )}
      </Section>
    </>
  );
}

function AccountsPage({ accounts, transactions }) {
  return (
    <>
      <Section title="Accounts">
        {accounts.length === 0 ? (
          <p style={styles.emptyText}>
            No accounts yet. Upload a statement and I’ll create one.
          </p>
        ) : (
          accounts.map((account) => {
            const accountTransactions = transactions.filter(
              (t) => t.account_id === account.id
            );
            const totals = getTotals(accountTransactions);

            return (
              <div key={account.id} style={styles.accountCard}>
                <div>
                  <strong>{account.name}</strong>
                  <p style={styles.transactionMeta}>
                    {account.institution || "Bank account"} ·{" "}
                    {account.account_type || "current"}
                  </p>
                </div>
                <strong>£{totals.net.toFixed(2)}</strong>
              </div>
            );
          })
        )}
      </Section>

      <Section title="Why account view matters">
        <p style={styles.sectionIntro}>
          This helps the app separate where wages land, where bills leave from
          and which statement belongs to which account when you bulk import.
        </p>
      </Section>
    </>
  );
}

function CalendarPage({ transactions, screenWidth }) {
  const [viewDate, setViewDate] = useState(() => new Date());
  const recurringEvents = useMemo(
    () => getRecurringCalendarEvents(transactions),
    [transactions]
  );

  const calendar = useMemo(
    () => buildCalendarMonth(viewDate, recurringEvents),
    [viewDate, recurringEvents]
  );

  const selectedMonthEvents = recurringEvents.filter(
    (event) =>
      event.month === viewDate.getMonth() + 1 || event.month == null
  );

  return (
    <>
      <Section title="Money Calendar">
        <div style={styles.calendarTopRow}>
          <button
            style={styles.secondaryInlineBtn}
            onClick={() =>
              setViewDate(
                new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1)
              )
            }
          >
            Prev
          </button>

          <div style={styles.calendarTitleWrap}>
            <h4 style={styles.calendarTitle}>
              {MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}
            </h4>
            <p style={styles.smallMuted}>
              Proper recurring money events based on statement history.
            </p>
          </div>

          <button
            style={styles.secondaryInlineBtn}
            onClick={() =>
              setViewDate(
                new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1)
              )
            }
          >
            Next
          </button>
        </div>

        <div style={styles.calendarGrid}>
          {DAY_NAMES.map((day) => (
            <div key={day} style={styles.calendarDayHeader}>
              {day}
            </div>
          ))}

          {calendar.days.map((day) => (
            <div
              key={day.key}
              style={{
                ...styles.calendarCell,
                ...(day.inMonth ? null : styles.calendarCellMuted),
              }}
            >
              <div style={styles.calendarDate}>{day.date.getDate()}</div>

              <div style={styles.calendarEvents}>
                {day.events.slice(0, 3).map((event) => (
                  <button
                    key={event.key}
                    style={getCalendarEventStyle(event.kind)}
                    onClick={() => downloadCalendarEvent(event)}
                  >
                    <span style={styles.calendarEventText}>{event.title}</span>
                    <span style={styles.calendarEventAmount}>
                      {event.amount > 0 ? "+" : "-"}£{Math.abs(event.amount).toFixed(0)}
                    </span>
                  </button>
                ))}

                {day.events.length > 3 ? (
                  <div style={styles.calendarMore}>+{day.events.length - 3} more</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="This Month's Money Events">
        {selectedMonthEvents.length === 0 ? (
          <p style={styles.emptyText}>
            Upload more history to make the calendar smarter.
          </p>
        ) : (
          selectedMonthEvents.map((event) => (
            <div key={event.key} style={styles.signalCard}>
              <div style={styles.signalHeader}>
                <div>
                  <strong>{event.title}</strong>
                  <p style={styles.transactionMeta}>
                    Around day {event.day} · {event.kindLabel} · confidence{" "}
                    {event.confidenceLabel}
                  </p>
                </div>
                <strong>
                  {event.amount > 0 ? "+" : "-"}£{Math.abs(event.amount).toFixed(2)}
                </strong>
              </div>

              <div style={styles.inlineBtnRow}>
                <button
                  style={styles.primaryInlineBtn}
                  onClick={() => downloadCalendarEvent(event)}
                >
                  Add to Calendar
                </button>
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title="Why This Is Better">
        <Row name="Recurring bills inferred" value="Yes" />
        <Row name="Subscriptions grouped" value="Yes" />
        <Row name="Salary cadence detected" value="Yes" />
        <Row name="One-tap calendar export" value="Yes" />
      </Section>
    </>
  );
}

function GoalsPage({ goals, transactions }) {
  const possibleSavings = transactions
    .filter((t) => t.category === "Internal Transfer")
    .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);

  const houseGoal =
    goals.find((goal) =>
      String(goal.name || "").toLowerCase().includes("house")
    ) || null;

  const target = Number(houseGoal?.target_amount || 15000);
  const current = Number(houseGoal?.current_amount || possibleSavings || 0);
  const percent = Math.min((current / target) * 100, 100);

  return (
    <>
      <Section title="House Deposit">
        <p style={styles.goalStat}>
          £{current.toFixed(2)} / £{target.toFixed(2)}
        </p>
        <div style={styles.progressOuter}>
          <div style={{ ...styles.progressInner, width: `${percent}%` }} />
        </div>
        <p style={styles.transactionMeta}>
          AI note: protect this before casual spending starts winning.
        </p>
      </Section>

      <Section title="Pots">
        <Row name="Hustler Pot" value="Coming soon" />
        <Row name="Holiday Pot" value="Coming soon" />
        <Row name="Investment Pot" value="Coming soon" />
      </Section>
    </>
  );
}

function ReceiptsPage({ receipts, transactions, onChange }) {
  const [merchant, setMerchant] = useState("");
  const [total, setTotal] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [file, setFile] = useState(null);
  const [keepFile, setKeepFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [match, setMatch] = useState(null);

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

    const merchantText = nextMerchant.toLowerCase();
    const receiptAmount = Number(nextTotal);

    return transactions.find((transaction) => {
      const description = String(transaction.description || "").toLowerCase();
      const amount = Math.abs(Number(transaction.amount || 0));

      const merchantMatches = description.includes(merchantText);
      const amountMatches = Math.abs(amount - receiptAmount) < 0.02;
      const dateMatches =
        !nextDate || transaction.transaction_date === nextDate;

      return merchantMatches && amountMatches && dateMatches;
    });
  }

  function handleFileChange(event) {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);

    const guess = guessFromFileName(selectedFile.name);
    if (guess.guessedMerchant && !merchant) {
      setMerchant(guess.guessedMerchant);
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
      alert("Add a merchant or upload a receipt first.");
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

    const { error } = await supabase.from("receipts").insert({
      user_id: user.id,
      transaction_id: match?.id || null,
      merchant: merchant.trim() || "Scanned receipt",
      total: Number(total || 0),
      receipt_date: receiptDate || null,
      source: file ? "upload" : "manual",
      matched_status: match ? "matched" : "unmatched",
      file_url: fileUrl,
      file_type: fileType,
      ai_summary: match
        ? `Matched to transaction: ${match.description}`
        : file
        ? "Receipt uploaded. AI extraction will come later."
        : "Manual receipt added.",
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

  return (
    <>
      <Section title="Receipt Scanner">
        <p style={styles.sectionIntro}>
          Take a photo, upload an image or PDF, or add receipt details manually.
          I’ll try to match it to your imported bank transactions.
        </p>

        <input
          style={styles.input}
          type="file"
          accept="image/*,.pdf"
          capture="environment"
          onChange={handleFileChange}
        />

        {file && (
          <div style={styles.receiptPreview}>
            <strong>{file.name}</strong>
            <p style={styles.transactionMeta}>
              {file.type || "Unknown file type"} · {(file.size / 1024).toFixed(1)} KB
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
          placeholder="Merchant, e.g. Tesco"
          value={merchant}
          onChange={(e) => updateMerchant(e.target.value)}
        />

        <input
          style={styles.input}
          placeholder="Total"
          type="number"
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
              {match.description} · {match.transaction_date} · £
              {Math.abs(Number(match.amount || 0)).toFixed(2)}
            </p>
          </div>
        )}

        <button style={styles.primaryBtn} onClick={addReceipt} disabled={saving}>
          {saving ? "Saving..." : match ? "Save Matched Receipt" : "Save Receipt"}
        </button>
      </Section>

      <Section title="Saved Receipts">
        {receipts.length === 0 ? (
          <p style={styles.emptyText}>No receipts yet.</p>
        ) : (
          receipts.map((receipt) => (
            <div key={receipt.id} style={styles.transactionRow}>
              <div>
                <strong>{receipt.merchant || "Receipt"}</strong>
                <p style={styles.transactionMeta}>
                  {receipt.receipt_date || "No date"} ·{" "}
                  {receipt.matched_status === "matched"
                    ? "Matched"
                    : receipt.file_url
                    ? "File kept"
                    : "Data only"}
                </p>
              </div>

              <strong>£{Number(receipt.total || 0).toFixed(2)}</strong>
            </div>
          ))
        )}
      </Section>
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
  const [message, setMessage] = useState("");
  const [thinking, setThinking] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [chatError, setChatError] = useState("");
  const [freshCutoff, setFreshCutoff] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(COACH_FRESH_CUTOFF_KEY) || "";
  });

  const chatBottomRef = useRef(null);

  const totals = useMemo(() => getTotals(transactions), [transactions]);
  const topCategories = useMemo(() => getTopCategories(transactions), [transactions]);

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
    totals,
    houseGoal,
    debtSignals,
    investmentSignals,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const pendingDraft = localStorage.getItem(COACH_DRAFT_KEY);
    if (pendingDraft) {
      setMessage(pendingDraft);
      localStorage.removeItem(COACH_DRAFT_KEY);
    }
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
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
        debts: debts.slice(0, 6),
        investments: investments.slice(0, 6),
        debt_statuses: debtStatuses,
        investment_statuses: investmentStatuses,
        debt_signals: debtSignals.slice(0, 5),
        investment_signals: investmentSignals.slice(0, 5),
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
                ? "Fresh chat view is on. Older messages are hidden, not deleted."
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
            visibleMessages.map((msg) => <ChatMessage key={msg.id} msg={msg} />)
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

function SettingsPage() {
  return (
    <>
      <Section title="Family / Viewer Mode">
        <p style={styles.sectionIntro}>
          Planned: invite girlfriend or parents as viewer accounts. They’ll be
          able to see progress, bills and goals, but not edit your data.
        </p>
      </Section>

      <Section title="Product Direction">
        <Row name="Statement-first setup" value="Core" />
        <Row name="Bulk multi-statement upload" value="Live" />
        <Row name="Recurring payment inference" value="Live" />
        <Row name="Debt/investment smart tracking" value="Live" />
        <Row name="Live market pricing" value="Later" />
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
  return (
    <section style={{ ...styles.section, ...sectionStyle }}>
      <div style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>{title}</h3>
        {right ? right : null}
      </div>
      {children}
    </section>
  );
}

function MiniCard({ title, value }) {
  return (
    <div style={styles.miniCard}>
      <p style={styles.cardLabel}>{title}</p>
      <h4 style={styles.cardValue}>{value}</h4>
    </div>
  );
}

function Row({ name, value }) {
  return (
    <div style={styles.row}>
      <span>{name}</span>
      <strong>{value}</strong>
    </div>
  );
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

function InsightCard({ label, headline, body }) {
  return (
    <div style={styles.insightCard}>
      <p style={styles.insightLabel}>{label}</p>
      <h4 style={styles.insightHeadline}>{headline}</h4>
      <p style={styles.insightBody}>{body}</p>
    </div>
  );
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

function getTotals(transactions) {
  const income = transactions
    .filter((t) => Number(t.amount) > 0 && !t.is_internal_transfer)
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const spending = transactions
    .filter((t) => Number(t.amount) < 0 && !t.is_internal_transfer)
    .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);

  const bills = transactions
    .filter((t) => t.is_bill || t.is_subscription)
    .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);

  const net = income - spending;
  const safeToSpend = Math.max(net - bills * 0.25, 0);

  return { income, spending, bills, net, safeToSpend };
}

function getTopCategories(transactions) {
  const totals = {};

  transactions.forEach((t) => {
    if (Number(t.amount) >= 0 || t.is_internal_transfer) return;

    const category = t.category || "Uncategorised";
    totals[category] = (totals[category] || 0) + Math.abs(Number(t.amount || 0));
  });

  return Object.entries(totals)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
}

function getHistorySummary(transactions) {
  const months = new Set(
    transactions
      .map((t) => {
        if (!t.transaction_date) return null;
        const date = new Date(t.transaction_date);
        if (Number.isNaN(date.getTime())) return null;
        return `${date.getFullYear()}-${date.getMonth() + 1}`;
      })
      .filter(Boolean)
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
}) {
  if (transactionCount === 0) {
    return {
      headline: "No data yet",
      body: "Upload your first statement and I’ll turn this into something useful.",
    };
  }

  if (totals.safeToSpend === 0) {
    return {
      headline: "Caution mode is on",
      body: "Safe-to-spend is tight right now, so this is a good time to pause optional spending.",
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
      body: "You’re past halfway on the visible target. Keep protecting that energy.",
    };
  }

  return {
    headline: "Steady, not sloppy",
    body: `Net position is £${totals.net.toFixed(2)} and safe-to-spend is still holding up.`,
  };
}

function getCoachPromptIdeas({
  topCategories,
  totals,
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

  if (totals.safeToSpend > 0) {
    prompts.push(`Can I spend £${Math.min(totals.safeToSpend, 40).toFixed(0)} this week?`);
  }

  if (houseGoal) {
    prompts.push("Give me a house deposit game plan");
  }

  return [...new Set(prompts)].slice(0, 6);
}

function getTrendSummary(transactions) {
  const spending = transactions.filter(
    (t) => Number(t.amount) < 0 && !t.is_internal_transfer
  );

  const recent = spending.slice(0, 20);
  const previous = spending.slice(20, 40);

  if (recent.length < 6 || previous.length < 6) {
    return {
      label: "Learning",
      headline: "Need a bit more history",
      body: "Once there is more statement data, I can start calling whether you’re improving or slipping.",
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
    if (Number(transaction.amount) >= 0 || transaction.is_internal_transfer) return;

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
    `${payload.name}|${payload.platform || ""}|${payload.asset_type || ""}|${payload.monthly_contribution || ""}`
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
    if (transaction.is_internal_transfer) return;

    const text = normalizeText(transaction.description);
    if (!text) return;

    const key = `${text}|${transaction.amount > 0 ? "in" : "out"}`;
    const date = new Date(transaction.transaction_date);
    if (Number.isNaN(date.getTime())) return;

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
  },

  coachShell: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    flex: 1,
    minHeight: 0,
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
    paddingTop: "2px",
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
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: "8px",
  },

  calendarDayHeader: {
    textAlign: "center",
    fontSize: "12px",
    fontWeight: "800",
    color: "#64748b",
    paddingBottom: "4px",
  },

  calendarCell: {
    minHeight: "108px",
    background: "#f8fbff",
    border: "1px solid #e2e8f0",
    borderRadius: "18px",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },

  calendarCellMuted: {
    opacity: 0.45,
  },

  calendarDate: {
    fontSize: "13px",
    fontWeight: "800",
    color: "#0f172a",
  },

  calendarEvents: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
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
};
