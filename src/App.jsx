import React, { useMemo, useState } from "react";

// No preset users. Real app users will be created through Supabase Auth.
// This temporary local auth screen mirrors the final account flow while we wire up the backend.
const users = [];

const categories = [
  "Income",
  "Rent/Mortgage",
  "Bills",
  "Food",
  "Transport",
  "Dog",
  "Debt",
  "Subscriptions",
  "Shopping",
  "Fun",
  "Savings",
  "Holiday",
  "Investment",
  "Business/Hustle",
  "Other",
];

const startingPots = [
  { id: "house", name: "House Deposit", target: 25000, saved: 0, scope: "shared" },
  { id: "hustler", name: "Hustler Pot", target: 3000, saved: 0, scope: "personal" },
  { id: "investment", name: "Investment Pot", target: 5000, saved: 0, scope: "personal" },
  { id: "holiday", name: "Holiday Pot", target: 2000, saved: 0, scope: "shared" },
];

const startingCashPots = [];

const startingBills = [
  { id: "rent", name: "Rent", amount: 0, dueDay: "last", category: "Rent/Mortgage", keywords: "rent landlord letting housing", scope: "shared", allowChunks: true },
  { id: "council", name: "Council Tax", amount: 0, dueDay: 1, category: "Bills", keywords: "council tax", scope: "shared", allowChunks: false },
  { id: "energy", name: "Electric/Gas", amount: 0, dueDay: 1, category: "Bills", keywords: "octopus british gas edf electric gas", scope: "shared", allowChunks: false },
  { id: "water", name: "Water", amount: 0, dueDay: 1, category: "Bills", keywords: "water", scope: "shared", allowChunks: false },
  { id: "internet", name: "Internet", amount: 0, dueDay: 1, category: "Bills", keywords: "internet broadband", scope: "shared", allowChunks: false },
  { id: "phone", name: "Phone", amount: 0, dueDay: 1, category: "Bills", keywords: "phone ee o2 vodafone three", scope: "personal", allowChunks: false },
];

function money(value) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(value || 0));
}

function guessCategory(text, amount) {
  const t = String(text || "").toLowerCase();
  if (amount > 0) return "Income";
  if (/rent|landlord|letting|housing/.test(t)) return "Rent/Mortgage";
  if (/octopus|british gas|edf|water|council|tax|electric|gas|internet|broadband|phone|ee|o2|vodafone|three/.test(t)) return "Bills";
  if (/tesco|aldi|lidl|asda|sainsbury|morrisons|coop|co-op|iceland|food|deliveroo|uber eats|just eat|mcdonald|kfc|greggs|subway/.test(t)) return "Food";
  if (/fuel|petrol|train|bus|uber|bolt|parking|shell|bp|esso/.test(t)) return "Transport";
  if (/pet|vets|pets at home|dog/.test(t)) return "Dog";
  if (/netflix|spotify|prime|apple|disney|subscription|patreon|xbox|playstation/.test(t)) return "Subscriptions";
  if (/klarna|paypal credit|loan|credit card|capital one|aqua|vanquis/.test(t)) return "Debt";
  if (/amazon|ebay|vinted|etsy|shop|argos|currys/.test(t)) return "Shopping";
  if (/holiday|hotel|airbnb|booking|ryanair|easyjet/.test(t)) return "Holiday";
  return "Other";
}

function lastDayOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

function normaliseDay(day) {
  if (day === "last") return lastDayOfMonth();
  return Math.min(Number(day) || 1, lastDayOfMonth());
}

function keywordMatch(text, keywords) {
  const cleanText = String(text || "").toLowerCase();
  return String(keywords || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .some((word) => cleanText.includes(word));
}

function makeMatchKey(t) {
  const dateKey = String(t.date || "").slice(0, 10);
  const merchant = String(t.description || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");
  const amountKey = Math.round(Math.abs(Number(t.amount || 0)) * 100);
  return `${dateKey}|${merchant}|${amountKey}`;
}

function isLikelyDuplicate(next, existing) {
  const nextAmount = Math.abs(Number(next.amount || 0));
  return existing.some((old) => {
    const oldAmount = Math.abs(Number(old.amount || 0));
    const sameAmount = Math.abs(oldAmount - nextAmount) < 0.02;
    const oldText = String(old.description || "").toLowerCase();
    const nextText = String(next.description || "").toLowerCase();
    const textOverlap = oldText.includes(nextText.slice(0, 6)) || nextText.includes(oldText.slice(0, 6));
    return sameAmount && (makeMatchKey(old) === makeMatchKey(next) || textOverlap);
  });
}

function smartAccountName(fileName, typedName, userName) {
  if (typedName && typedName.trim()) return typedName.trim();

  const raw = String(fileName || "").toLowerCase();
  if (raw.includes("chase")) return "Chase account";
  if (raw.includes("monzo")) return "Monzo account";
  if (raw.includes("starling")) return "Starling account";
  if (raw.includes("revolut")) return "Revolut account";
  if (raw.includes("barclays")) return "Barclays account";
  if (raw.includes("natwest")) return "NatWest account";
  if (raw.includes("lloyds")) return "Lloyds account";
  if (raw.includes("halifax")) return "Halifax account";

  return `${userName}'s imported account`;
}

function guessAccountPurpose(transactions) {
  const text = transactions.map((t) => t.description).join(" ").toLowerCase();
  const spendingCount = transactions.filter((t) => t.amount < 0).length;
  const incomeCount = transactions.filter((t) => t.amount > 0).length;
  const hasBills = text.includes("rent") || text.includes("council") || text.includes("octopus") || text.includes("water") || text.includes("broadband") || text.includes("insurance");
  const hasGroceries = text.includes("tesco") || text.includes("aldi") || text.includes("lidl") || text.includes("asda") || text.includes("sainsbury") || text.includes("morrisons");
  const hasInvestments = text.includes("trading 212") || text.includes("vanguard") || text.includes("isa") || text.includes("investment");

  if (hasInvestments) return "Savings/investment account";
  if (hasBills && !hasGroceries) return "Bills account";
  if (incomeCount > 0 && spendingCount < 5) return "Income account";
  if (hasGroceries || spendingCount > 10) return "Spending account";
  return "Imported account";
}

function parseCSV(text, ownerId, scope, accountName = "Bank account") {
  const rows = text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const cells = [];
      let cur = "";
      let quote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') quote = !quote;
        else if (ch === "," && !quote) {
          cells.push(cur.trim());
          cur = "";
        } else cur += ch;
      }
      cells.push(cur.trim());
      return cells.map((c) => c.replace(/^"|"$/g, ""));
    });

  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.toLowerCase());
  const find = (...names) => headers.findIndex((h) => names.some((n) => h.includes(n)));
  const dateI = find("date", "transaction date");
  const descI = find("description", "details", "merchant", "name");
  const amountI = find("amount", "money out", "paid out", "value");
  const moneyInI = find("money in", "paid in", "credit");
  const moneyOutI = find("money out", "paid out", "debit");

  return rows
    .slice(1)
    .map((r, idx) => {
      const description = r[descI] || r[1] || "Imported transaction";
      let amount = 0;

      if (moneyInI >= 0 || moneyOutI >= 0) {
        const inVal = parseFloat(String(r[moneyInI] || "0").replace(/[^0-9.-]/g, "")) || 0;
        const outVal = parseFloat(String(r[moneyOutI] || "0").replace(/[^0-9.-]/g, "")) || 0;
        amount = inVal || -Math.abs(outVal);
      } else {
        amount = parseFloat(String(r[amountI] || r[2] || "0").replace(/[^0-9.-]/g, "")) || 0;
      }

      return {
        id: `${Date.now()}-${idx}`,
        ownerId,
        scope,
        accountName,
        source: "csv",
        receiptStatus: "none",
        date: r[dateI] || "",
        description,
        amount,
        category: guessCategory(description, amount),
      };
    })
    .filter((t) => t.amount !== 0);
}

const styles = {
  page: { minHeight: "100vh", background: "#f4f4f5", color: "#18181b", padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif" },
  wrap: { maxWidth: 1100, margin: "0 auto", display: "grid", gap: 16 },
  card: { background: "white", border: "1px solid #e4e4e7", borderRadius: 22, padding: 18, boxShadow: "0 1px 2px rgba(0,0,0,.05)" },
  grid4: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 },
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 },
  input: { width: "100%", padding: "11px 12px", border: "1px solid #d4d4d8", borderRadius: 12, fontSize: 15, boxSizing: "border-box" },
  button: { border: 0, background: "#18181b", color: "white", padding: "11px 14px", borderRadius: 14, fontWeight: 700, cursor: "pointer" },
  lightButton: { border: "1px solid #d4d4d8", background: "white", color: "#18181b", padding: "10px 12px", borderRadius: 14, fontWeight: 700, cursor: "pointer" },
  tab: { border: "1px solid #d4d4d8", background: "white", padding: "10px 12px", borderRadius: 999, cursor: "pointer", fontWeight: 700 },
  activeTab: { border: "1px solid #18181b", background: "#18181b", color: "white", padding: "10px 12px", borderRadius: 999, cursor: "pointer", fontWeight: 700 },
  small: { color: "#3f3f46", fontSize: 14, lineHeight: 1.45 },
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [tab, setTab] = useState("import");
  const [transactions, setTransactions] = useState([]);
  const [pots, setPots] = useState(startingPots);
  const [cashPots, setCashPots] = useState(startingCashPots);
  const [bills, setBills] = useState(startingBills);
  const [monthlyIncome, setMonthlyIncome] = useState(3500);
  const [targetDeposit, setTargetDeposit] = useState(25000);
  const [months, setMonths] = useState(24);
  const [importScope, setImportScope] = useState("personal");
  const [importAccountName, setImportAccountName] = useState("");
  const [lastImport, setLastImport] = useState(null);
  const [aiQuestion, setAiQuestion] = useState("Where did my money go this month?");

  const [manualName, setManualName] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10));
  const [manualCategory, setManualCategory] = useState("Other");
  const [manualType, setManualType] = useState("spend");
  const [manualScope, setManualScope] = useState("personal");

  const visibleTransactions = useMemo(() => {
    if (!currentUser) return [];
    return transactions.filter((t) => t.scope === "shared" || t.ownerId === currentUser.id);
  }, [transactions, currentUser]);

  const totals = useMemo(() => {
    const spending = visibleTransactions.filter((t) => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const byCat = Object.fromEntries(categories.map((c) => [c, 0]));
    visibleTransactions.forEach((t) => {
      if (t.amount < 0) byCat[t.category] = (byCat[t.category] || 0) + Math.abs(t.amount);
    });
    const potSaved = pots.reduce((sum, p) => sum + Number(p.saved || 0), 0);
    const cashTotal = cashPots.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    return { spending, byCat, potSaved, cashTotal, left: monthlyIncome - spending }; 
  }, [visibleTransactions, monthlyIncome, pots, cashPots]);

  const billPlan = bills
    .map((bill) => {
      const paid = visibleTransactions
        .filter((t) => t.amount < 0)
        .filter((t) => (bill.scope === "shared" ? true : t.scope === "personal"))
        .filter((t) => {
          if (bill.id === "rent") return t.category === "Rent/Mortgage" || keywordMatch(t.description, bill.keywords);
          return keywordMatch(t.description, bill.keywords);
        })
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const remaining = Math.max(0, Number(bill.amount || 0) - paid);
      return { ...bill, paid, remaining, due: normaliseDay(bill.dueDay) };
    })
    .sort((a, b) => a.due - b.due);

  const billsRemaining = billPlan.reduce((sum, b) => sum + b.remaining, 0);
  const houseSaved = pots.find((p) => p.id === "house")?.saved || 0;
  const houseMonthlyNeed = Math.max(0, (targetDeposit - houseSaved) / Math.max(1, months));
  const topCuts = Object.entries(totals.byCat)
    .filter(([c, v]) => v > 0 && !["Rent/Mortgage", "Bills", "Debt"].includes(c))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  function uploadCSV(e) {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rawText = String(reader.result || "");
      const startingName = smartAccountName(file.name, importAccountName, currentUser.name);
      const firstPass = parseCSV(rawText, currentUser.id, importScope, startingName);
      const finalAccountName = importAccountName.trim() ? importAccountName.trim() : guessAccountPurpose(firstPass);
      const parsed = firstPass.map((t) => ({ ...t, accountName: finalAccountName }));
      const fresh = parsed.filter((t) => !isLikelyDuplicate(t, transactions));
      setTransactions((old) => [...fresh, ...old]);
      setLastImport({ imported: fresh.length, skipped: parsed.length - fresh.length });
    };
    reader.readAsText(file);
  }

  function addManual(source = "manual") {
    if (!manualName || !manualAmount || !currentUser) return;
    const isIncome = manualType === "income";
    const next = {
      id: `${Date.now()}-${source}`,
      ownerId: currentUser.id,
      scope: manualScope,
      source,
      receiptStatus: source === "receipt" ? "uploaded" : "none",
      date: manualDate,
      description: manualName,
      amount: isIncome ? Math.abs(Number(manualAmount)) : -Math.abs(Number(manualAmount)),
      category: isIncome ? "Income" : manualCategory,
    };
    if (!isIncome && isLikelyDuplicate(next, transactions)) {
      setLastImport({ imported: 0, skipped: 1, note: "Looks like this spend already exists, so I did not add it again." });
      return;
    }
    setTransactions([next, ...transactions]);
    setManualName("");
    setManualAmount("");
    setManualCategory("Other");
    setManualType("spend");
  }

  function uploadReceipt(e) {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    if (!manualAmount) {
      setLastImport({ imported: 0, skipped: 0, note: "For now, type the amount first, then upload the receipt. OCR comes later." });
      return;
    }
    if (!manualName) setManualName(file.name.replace(/\.[^.]+$/, ""));
    setTimeout(() => addManual("receipt"), 0);
  }

  function updateBill(id, field, value) {
    setBills(bills.map((b) => (b.id === id ? { ...b, [field]: ["amount"].includes(field) ? Number(value) || 0 : value } : b)));
  }

  function updatePot(id, field, value) {
    setPots(pots.map((p) => (p.id === id ? { ...p, [field]: ["target", "saved"].includes(field) ? Number(value) || 0 : value } : p)));
  }

  function updateCashPot(id, field, value) {
    setCashPots(cashPots.map((p) => (p.id === id ? { ...p, [field]: field === "amount" ? Number(value) || 0 : value } : p)));
  }

  function addCashPot() {
    setCashPots([
      ...cashPots,
      {
        id: `${Date.now()}-cash`,
        name: "New cash pot",
        amount: 0,
        location: "",
        note: "",
      },
    ]);
  }

  function deleteCashPot(id) {
    setCashPots(cashPots.filter((p) => p.id !== id));
  }

  function handleLocalAuth() {
    if (!authEmail || !authPassword) return;
    const email = authEmail.trim().toLowerCase();
    const name = authName.trim() || email.split("@")[0] || "User";
    setCurrentUser({ id: email, name, email });
  }

  if (!currentUser) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.card, maxWidth: 440, margin: "8vh auto" }}>
          <h1 style={{ marginTop: 0 }}>Create your account</h1>
          <p style={styles.small}>Temporary local version. Next step is Supabase, which makes this a real backend login with saved private data.</p>

          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button style={authMode === "login" ? styles.activeTab : styles.tab} onClick={() => setAuthMode("login")}>Log in</button>
            <button style={authMode === "signup" ? styles.activeTab : styles.tab} onClick={() => setAuthMode("signup")}>Create account</button>
          </div>

          {authMode === "signup" && (
            <label>
              Name
              <input style={styles.input} value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder="Your name" />
            </label>
          )}

          <div style={{ height: 10 }} />
          <label>
            Email
            <input style={styles.input} type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@example.com" />
          </label>

          <div style={{ height: 10 }} />
          <label>
            Password
            <input style={styles.input} type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="Password" />
          </label>

          <button style={{ ...styles.button, width: "100%", marginTop: 16 }} onClick={handleLocalAuth}>
            {authMode === "signup" ? "Create account" : "Log in"}
          </button>

          <p style={{ ...styles.small, marginTop: 14 }}>Backend plan: this form will connect to Supabase Auth, then transactions, pots, bills, receipts and cash pots will save under the logged-in user ID.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0 }}>Budget Builder</h1>
            <p style={{ ...styles.small, marginTop: 4 }}>Logged in as {currentUser.name}. Personal items stay separate. Shared items are for household bills and goals.</p>
          </div>
          <button style={styles.lightButton} onClick={() => setCurrentUser(null)}>Switch user</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <div style={styles.card}><div style={styles.small}>Monthly income</div><h2>{money(monthlyIncome)}</h2></div>
          <div style={styles.card}><div style={styles.small}>Visible spending</div><h2>{money(totals.spending)}</h2></div>
          <div style={styles.card}><div style={styles.small}>Bills left</div><h2>{money(billsRemaining)}</h2></div>
          <div style={styles.card}><div style={styles.small}>Saved in pots</div><h2>{money(totals.potSaved)}</h2></div>
          <div style={styles.card}><div style={styles.small}>Cash tracked</div><h2>{money(totals.cashTotal)}</h2></div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", overflowX: "auto", paddingBottom: 4 }}>
          {["import", "receipts", "income", "cash", "bills", "pots", "save", "coach", "transactions"].map((t) => (
            <button key={t} style={tab === t ? styles.activeTab : styles.tab} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </div>

        {tab === "import" && (
          <div style={styles.card}>
            <h2>Upload Chase statement CSV</h2>
            <p style={styles.small}>Upload as many CSVs as you need, even for the same month or different accounts. Leave the account name blank and the app will infer whether it looks like spending, bills, income or savings/investments.</p>
            <div style={styles.grid2}>
              <input style={styles.input} value={importAccountName} onChange={(e) => setImportAccountName(e.target.value)} placeholder="Optional account name, or leave blank for smart detection" />
              <select style={styles.input} value={importScope} onChange={(e) => setImportScope(e.target.value)}>
                <option value="personal">My personal account</option>
                <option value="shared">Shared household account</option>
              </select>
              <input style={styles.input} type="file" accept=".csv,text/csv" onChange={uploadCSV} />
            </div>
            {lastImport && <p style={{ ...styles.small, marginTop: 12 }}>Imported {lastImport.imported}. Skipped {lastImport.skipped}. {lastImport.note}</p>}
            <div style={{ ...styles.grid2, marginTop: 14 }}>
              <label>Monthly income<input style={styles.input} type="number" value={monthlyIncome} onChange={(e) => setMonthlyIncome(Number(e.target.value) || 0)} /></label>
              <label>House deposit target<input style={styles.input} type="number" value={targetDeposit} onChange={(e) => setTargetDeposit(Number(e.target.value) || 0)} /></label>
              <label>Months to target<input style={styles.input} type="number" value={months} onChange={(e) => setMonths(Number(e.target.value) || 1)} /></label>
            </div>
          </div>
        )}

        {tab === "receipts" && (
          <div style={styles.card}>
            <h2>Receipts and quick add</h2>
            <p style={styles.small}>Add daily spends manually, upload an e-receipt/screenshot, or on iPhone tap the receipt upload to take a photo with the camera. Later CSV imports should ignore likely matches.</p>
            <div style={styles.grid2}>
              <input style={styles.input} value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Shop / spend name" />
              <input style={styles.input} type="number" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} placeholder="Amount" />
              <input style={styles.input} type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
              <select style={styles.input} value={manualType} onChange={(e) => setManualType(e.target.value)}><option value="spend">Spending</option><option value="income">Income</option></select>
              <select style={styles.input} value={manualCategory} onChange={(e) => setManualCategory(e.target.value)}>{categories.filter((c) => c !== "Income").map((c) => <option key={c}>{c}</option>)}</select>
              <select style={styles.input} value={manualScope} onChange={(e) => setManualScope(e.target.value)}><option value="personal">Personal</option><option value="shared">Shared</option></select>
              <input style={styles.input} type="file" accept="image/*,.pdf" capture="environment" onChange={uploadReceipt} />
            </div>
            <button style={{ ...styles.button, marginTop: 12 }} onClick={() => addManual("manual")}>Add manual entry</button>
          </div>
        )}

        {tab === "income" && (
          <div style={styles.card}>
            <h2>Income tracker</h2>
            <p style={styles.small}>Income from Chase CSVs is picked up automatically when the amount is positive. You can also add cash, eBay, Marketplace, side-hustle money or refunds manually in the Receipts tab by choosing Income.</p>
            <h2>Total visible income imported/manual: {money(visibleTransactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0))}</h2>
            <div style={{ display: "grid", gap: 8 }}>
              {visibleTransactions.filter((t) => t.amount > 0).length === 0 ? <p style={styles.small}>No income added yet.</p> : visibleTransactions.filter((t) => t.amount > 0).map((t) => (
                <div key={t.id} style={{ ...styles.card, padding: 12, background: "#fafafa" }}>
                  <b>{t.description}</b> · {money(t.amount)}
                  <div style={styles.small}>{t.date} · {t.ownerId} · {t.scope} · {t.accountName || "No account"} · {t.source}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "cash" && (
          <div style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <h2>Cash pots</h2>
                <p style={styles.small}>Track physical cash separately, including where it is kept. Add as many pots as you need for cash sales, eBay collections, emergency cash or envelopes.</p>
              </div>
              <button style={styles.button} onClick={addCashPot}>+ Add cash pot</button>
            </div>
            <h2>Total cash: {money(totals.cashTotal)}</h2>
            {cashPots.length === 0 ? <p style={styles.small}>No cash pots yet. Tap + Add cash pot to create one.</p> : null}
            <div style={styles.grid2}>
              {cashPots.map((p) => (
                <div key={p.id} style={{ ...styles.card, background: "#fafafa" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <input style={styles.input} value={p.name} onChange={(e) => updateCashPot(p.id, "name", e.target.value)} />
                    <button style={styles.lightButton} onClick={() => deleteCashPot(p.id)}>Delete</button>
                  </div>
                  <div style={{ height: 8 }} />
                  <input style={styles.input} type="number" value={p.amount} onChange={(e) => updateCashPot(p.id, "amount", e.target.value)} placeholder="Amount" />
                  <div style={{ height: 8 }} />
                  <input style={styles.input} value={p.location} onChange={(e) => updateCashPot(p.id, "location", e.target.value)} placeholder="Where is it? e.g. wallet, drawer, envelope" />
                  <div style={{ height: 8 }} />
                  <input style={styles.input} value={p.note} onChange={(e) => updateCashPot(p.id, "note", e.target.value)} placeholder="Note" />
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "bills" && (
          <div style={styles.card}>
            <h2>Bills calendar</h2>
            <p style={styles.small}>Rent is due on the last day and can be paid in chunks. Matching rent transactions reduce the remaining amount.</p>
            <h2>Bills still to cover: {money(billsRemaining)}</h2>
            <div style={{ display: "grid", gap: 12 }}>
              {billPlan.map((b) => (
                <div key={b.id} style={{ ...styles.card, background: "#fafafa" }}>
                  <div style={styles.grid4}>
                    <input style={styles.input} value={b.name} onChange={(e) => updateBill(b.id, "name", e.target.value)} />
                    <input style={styles.input} type="number" value={b.amount} onChange={(e) => updateBill(b.id, "amount", e.target.value)} placeholder="Monthly amount" />
                    <input style={styles.input} value={b.dueDay} onChange={(e) => updateBill(b.id, "dueDay", e.target.value)} placeholder="1 or last" />
                    <select style={styles.input} value={b.scope} onChange={(e) => updateBill(b.id, "scope", e.target.value)}><option value="personal">Personal</option><option value="shared">Shared</option></select>
                  </div>
                  <p style={styles.small}>Due: {b.dueDay === "last" ? "last day" : b.dueDay}. Paid: {money(b.paid)}. Remaining: {money(b.remaining)}. {b.allowChunks ? "Chunk payments enabled." : ""}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "pots" && (
          <div style={styles.grid2}>
            {pots.map((p) => {
              const pct = Math.min(100, (Number(p.saved || 0) / Math.max(1, Number(p.target || 1))) * 100);
              return <div key={p.id} style={styles.card}>
                <h2>{p.name}</h2>
                <p style={styles.small}>{money(p.saved)} of {money(p.target)} · {p.scope}</p>
                <div style={{ height: 12, background: "#e4e4e7", borderRadius: 99, overflow: "hidden", marginBottom: 12 }}><div style={{ height: "100%", width: `${pct}%`, background: "#18181b" }} /></div>
                <div style={styles.grid4}>
                  <input style={styles.input} type="number" value={p.saved} onChange={(e) => updatePot(p.id, "saved", e.target.value)} />
                  <input style={styles.input} type="number" value={p.target} onChange={(e) => updatePot(p.id, "target", e.target.value)} />
                  <select style={styles.input} value={p.scope} onChange={(e) => updatePot(p.id, "scope", e.target.value)}><option value="personal">Personal</option><option value="shared">Shared</option></select>
                </div>
              </div>;
            })}
          </div>
        )}

        {tab === "save" && (
          <div style={styles.card}>
            <h2>Save money plan</h2>
            <p>To hit your house deposit target in {months} months, aim for <b>{money(houseMonthlyNeed)}</b> per month into House Deposit.</p>
            <p>Before pots, protect <b>{money(billsRemaining)}</b> for bills still due this month.</p>
            <h3>Quick wins</h3>
            {topCuts.length === 0 ? <p style={styles.small}>Upload a CSV or add receipts to find savings.</p> : topCuts.map(([cat, total]) => <p key={cat}>Trim {cat} by 15%: <b>{money(total * 0.15)}/month</b></p>)}
          </div>
        )}

        {tab === "coach" && (
          <div style={styles.card}>
            <h2>Money Coach</h2>
            <p style={styles.small}>This is the ChatGPT/advice area. Production version will send your selected budget summary to an AI assistant so you can ask about spending, saving, bills, deposits and habits.</p>
            <textarea style={{ ...styles.input, minHeight: 90 }} value={aiQuestion} onChange={(e) => setAiQuestion(e.target.value)} />
            <div style={{ ...styles.card, background: "#fafafa", marginTop: 12 }}>
              <h3>Current summary to send to coach</h3>
              <p>Total spending: <b>{money(totals.spending)}</b></p>
              <p>Bills left: <b>{money(billsRemaining)}</b></p>
              <p>Cash tracked: <b>{money(totals.cashTotal)}</b></p>
              <p>House deposit monthly target: <b>{money(houseMonthlyNeed)}</b></p>
              <p style={styles.small}>For privacy, we will later add a toggle so you choose whether to share full transaction names or a safer summary only.</p>
            </div>
            <button style={{ ...styles.button, marginTop: 12 }} onClick={() => alert("AI chat comes after hosting + Supabase. For now, this tab prepares the summary.")}>Ask money coach</button>
          </div>
        )}

        {tab === "transactions" && (
          <div style={styles.card}>
            <h2>Transactions</h2>
            <button style={styles.lightButton} onClick={() => setTransactions(transactions.filter((t) => t.scope === "shared" || t.ownerId !== currentUser.id))}>Clear mine</button>
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {visibleTransactions.length === 0 ? <p style={styles.small}>No transactions yet.</p> : visibleTransactions.map((t) => (
                <div key={t.id} style={{ ...styles.card, padding: 12, background: "#fafafa" }}>
                  <b>{t.description}</b> · {money(t.amount)}
                  <div style={styles.small}>{t.date} · {t.ownerId} · {t.scope} · {t.source}</div>
                  <div style={{ ...styles.grid4, marginTop: 8 }}>
                    <select style={styles.input} value={t.category} onChange={(e) => setTransactions(transactions.map((x) => x.id === t.id ? { ...x, category: e.target.value } : x))}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
                    <select style={styles.input} value={t.scope} onChange={(e) => setTransactions(transactions.map((x) => x.id === t.id ? { ...x, scope: e.target.value } : x))}><option value="personal">Personal</option><option value="shared">Shared</option></select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
