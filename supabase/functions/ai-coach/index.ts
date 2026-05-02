import { createClient } from "@supabase/supabase-js";

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((item) => item.trim()).filter(Boolean);
  const allowOrigin = allowedOrigins.length === 0 || allowedOrigins.includes(origin) ? origin || "*" : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function cleanReply(text: string) {
  return String(text || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\u00c2\u00a3/g, "\u00a3")
    .trim();
}

function parseJsonReply(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("Could not parse AI JSON response.");
  }
}

async function callResponsesApi(apiKey: string, body: Record<string, unknown>) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function getYahooPrice(symbol: string) {
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`);
  if (!response.ok) throw new Error(`Could not fetch market price for ${symbol}`);
  const data = await response.json();
  const result = data?.chart?.result?.[0];
  const meta = result?.meta || {};
  const price = meta.regularMarketPrice ?? meta.previousClose ?? result?.indicators?.quote?.[0]?.close?.find((value: number | null) => value != null);
  if (price == null) throw new Error(`No price returned for ${symbol}`);
  return { price: Number(price), currency: meta.currency || "USD", symbol: meta.symbol || symbol, source: "Yahoo Finance" };
}

function isImageUrl(url: string) {
  return /\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(url || "");
}

function buildDocumentExtractionInput(systemPrompt: string, message: string, context: any) {
  const textParts = [{ type: "input_text", text: `${systemPrompt}\n\nUser note:\n${message || "No extra note."}` }] as Array<Record<string, string>>;
  if (context?.document_data_url && String(context.document_data_url).startsWith("data:image/")) {
    textParts.push({ type: "input_image", image_url: context.document_data_url });
  } else if (context?.document_url && isImageUrl(context.document_url)) {
    textParts.push({ type: "input_image", image_url: context.document_url });
  } else if (context?.document_name) {
    textParts.push({ type: "input_text", text: `Document name: ${context.document_name}. If this is not an image, extract only what can be inferred and leave the rest null.` });
  }
  return [{ role: "user", content: textParts }];
}

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeText(value: unknown) {
  return String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function cleanLabel(value: unknown, fallback = "Transaction") {
  const cleaned = String(value || fallback)
    .replace(/\s+/g, " ")
    .replace(/\b(card purchase|debit card|faster payment|direct debit|standing order|contactless|online payment)\b/gi, "")
    .trim();
  return cleaned.split(" ").slice(0, 5).join(" ") || fallback;
}

function parseAppDate(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthKey(value: unknown) {
  const date = parseAppDate(value);
  if (!date) return "unknown";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isInternalTransfer(transaction: any) {
  const text = normalizeText(`${transaction?.description || ""} ${transaction?.merchant || ""} ${transaction?.category || ""}`);
  return Boolean(transaction?.is_internal_transfer || /\b(internal transfer|transfer between|savings transfer|own account|pot transfer)\b/.test(text));
}

function isBillLike(transaction: any) {
  const text = normalizeText(`${transaction?.description || ""} ${transaction?.merchant || ""} ${transaction?.category || ""}`);
  return Boolean(transaction?.is_bill || transaction?.is_subscription || /\b(rent|mortgage|council tax|energy|gas|electric|water|broadband|internet|phone|insurance|subscription|netflix|spotify|apple com bill|google storage|loan|credit card|finance)\b/.test(text));
}

function isPassThroughOutgoing(transaction: any) {
  return /\b(proovia|delivery expense|work expense|reimbursement expense)\b/.test(normalizeText(`${transaction?.description || ""} ${transaction?.merchant || ""}`));
}

function isPassThroughIncome(transaction: any) {
  return /\b(mynextbike|my next bike|nextbike|proovia|reimburse|reimbursement|expenses?|repayment|refund)\b/.test(normalizeText(`${transaction?.description || ""} ${transaction?.merchant || ""} ${transaction?.category || ""}`));
}

function toCoachTransaction(transaction: any) {
  const amount = Number(transaction.amount || 0);
  return {
    date: transaction.transaction_date || "",
    description: transaction.description || "",
    merchant: cleanLabel(transaction.merchant || transaction.description),
    amount,
    amount_abs: Math.abs(amount),
    direction: amount > 0 ? "in" : amount < 0 ? "out" : "zero",
    category: transaction.category || (amount > 0 ? "Income" : "Spending"),
    account: transaction.accounts?.name || "",
    is_bill: Boolean(transaction.is_bill || isBillLike(transaction)),
    is_subscription: Boolean(transaction.is_subscription),
    is_internal_transfer: isInternalTransfer(transaction),
  };
}

function getTotals(transactions: any[]) {
  const real = transactions.filter((transaction) => !isInternalTransfer(transaction));
  const income = real.filter((transaction) => Number(transaction.amount) > 0).reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const spending = real.filter((transaction) => Number(transaction.amount) < 0).reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
  const bills = real.filter((transaction) => isBillLike(transaction)).reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
  return { income: roundMoney(income), spending: roundMoney(spending), bills: roundMoney(bills), net: roundMoney(income - spending), safeToSpend: 0 };
}

function groupTransactions(transactions: any[], labelFor: (transaction: any) => string, limit: number) {
  const groups = new Map<string, any>();
  for (const transaction of transactions) {
    const label = labelFor(transaction) || "Unknown";
    const key = normalizeText(label) || "unknown";
    const amount = Number(transaction.amount || 0);
    if (!groups.has(key)) {
      groups.set(key, { label, count: 0, total: 0, money_in: 0, money_out: 0, average: 0, first_date: transaction.transaction_date || "", last_date: transaction.transaction_date || "", example: transaction.description || "" });
    }
    const group = groups.get(key);
    group.count += 1;
    group.total += Math.abs(amount);
    if (amount > 0) group.money_in += amount;
    if (amount < 0) group.money_out += Math.abs(amount);
    group.average = group.total / group.count;
    if (transaction.transaction_date) {
      if (!group.first_date || transaction.transaction_date < group.first_date) group.first_date = transaction.transaction_date;
      if (!group.last_date || transaction.transaction_date > group.last_date) group.last_date = transaction.transaction_date;
    }
  }
  return [...groups.values()]
    .map((group) => ({ ...group, total: roundMoney(group.total), money_in: roundMoney(group.money_in), money_out: roundMoney(group.money_out), average: roundMoney(group.average) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

function buildQueryFocus(transactions: any[], message: string) {
  const stopWords = new Set(["about", "all", "and", "any", "been", "did", "does", "from", "have", "how", "into", "money", "much", "paid", "pay", "payment", "payments", "received", "sent", "send", "the", "them", "this", "to", "total", "transfer", "transfers", "what", "when", "with"]);
  const terms = [...new Set(normalizeText(message).split(" "))].filter((term) => term.length >= 3 && !stopWords.has(term)).slice(0, 8);
  const direction = /\b(sent me|received|paid me|money in|income from)\b/i.test(message) ? "incoming" : /\b(i sent|paid to|sent to|money to)\b/i.test(message) ? "outgoing" : "unknown";
  const rawMatches = terms.length ? transactions.filter((transaction) => terms.some((term) => normalizeText([transaction.description, transaction.merchant, transaction.category, transaction.accounts?.name].join(" ")).includes(term))) : [];
  const matches = direction === "incoming" ? rawMatches.filter((transaction) => Number(transaction.amount) > 0) : direction === "outgoing" ? rawMatches.filter((transaction) => Number(transaction.amount) < 0) : rawMatches;
  const moneyIn = matches.filter((transaction) => Number(transaction.amount) > 0).reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const moneyOut = matches.filter((transaction) => Number(transaction.amount) < 0).reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
  return { original_query: message, search_terms: terms, direction_intent: direction, direct_match_count: rawMatches.length, relevant_match_count: matches.length, direct_money_in: roundMoney(moneyIn), direct_money_out: roundMoney(moneyOut), direct_net: roundMoney(moneyIn - moneyOut), relevant_money_total: direction === "incoming" ? roundMoney(moneyIn) : direction === "outgoing" ? roundMoney(moneyOut) : roundMoney(Math.abs(moneyIn - moneyOut)), grouped_matches: groupTransactions(rawMatches, (transaction) => cleanLabel(transaction.description), 20), relevant_grouped_matches: groupTransactions(matches, (transaction) => cleanLabel(transaction.description), 20), direct_matches: rawMatches.slice(0, 120).map(toCoachTransaction), relevant_matches: matches.slice(0, 120).map(toCoachTransaction) };
}

function buildMonthlyBreakdown(transactions: any[], range: "6m" | "all") {
  const groups = new Map<string, any>();
  for (const transaction of transactions) {
    const key = monthKey(transaction.transaction_date);
    if (key === "unknown") continue;
    if (!groups.has(key)) groups.set(key, { month: key, income: 0, spending: 0, bills: 0, transfers: 0, net: 0, transaction_count: 0 });
    const group = groups.get(key);
    const amount = Number(transaction.amount || 0);
    group.transaction_count += 1;
    if (isInternalTransfer(transaction)) group.transfers += Math.abs(amount);
    else if (amount > 0) group.income += amount;
    else if (amount < 0) group.spending += Math.abs(amount);
    if (isBillLike(transaction)) group.bills += Math.abs(amount);
  }
  const items = [...groups.values()].sort((a, b) => b.month.localeCompare(a.month)).map((item) => ({ ...item, income: roundMoney(item.income), spending: roundMoney(item.spending), bills: roundMoney(item.bills), transfers: roundMoney(item.transfers), net: roundMoney(item.income - item.spending) }));
  return range === "6m" ? items.slice(0, 6) : items;
}

function buildPassThroughAnalysis(transactions: any[]) {
  const real = transactions.filter((transaction) => !isInternalTransfer(transaction));
  const standardTotals = getTotals(real);
  const explicitOut = real.filter((transaction) => Number(transaction.amount) < 0 && isPassThroughOutgoing(transaction));
  const incomePool = real.filter((transaction) => Number(transaction.amount) > 0 && isPassThroughIncome(transaction));
  const excludedSpending = explicitOut.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
  const matchingIncomePool = incomePool.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const excludedIncome = Math.min(excludedSpending, matchingIncomePool);
  return {
    note: "Known pass-through removes Proovia/work-like outgoings and only the matching amount of likely reimbursement income. Rent, bills and normal spending stay included.",
    standard_view: standardTotals,
    known_pass_through_view: { excluded_spending: roundMoney(excludedSpending), excluded_matching_income: roundMoney(excludedIncome), adjusted_income: roundMoney(standardTotals.income - excludedIncome), adjusted_spending: roundMoney(standardTotals.spending - excludedSpending), adjusted_net: roundMoney((standardTotals.income - excludedIncome) - (standardTotals.spending - excludedSpending)), confidence: excludedSpending > 0 ? "known_pattern" : "none_found", example_outgoings: explicitOut.slice(0, 8).map(toCoachTransaction), example_income_pool: incomePool.slice(0, 8).map(toCoachTransaction) },
    warning: "Do not treat pass-through income as personal surplus unless confirmed.",
  };
}

function buildSubscriptionSummary(transactions: any[]) {
  const subscriptionRows = transactions.filter((transaction) => transaction.is_subscription || /\b(netflix|spotify|apple|google|amazon prime|disney|subscription|patreon|onlyfans|xbox|playstation)\b/.test(normalizeText(`${transaction.description} ${transaction.category}`)));
  const groups = groupTransactions(subscriptionRows, (transaction) => cleanLabel(transaction.merchant || transaction.description), 20);
  return { count: subscriptionRows.length, monthly_estimate: roundMoney(groups.reduce((sum, group) => sum + Number(group.average || 0), 0)), groups };
}

function buildTransferSummary(transactions: any[]) {
  const transfers = transactions.filter(isInternalTransfer);
  return { count: transfers.length, money_moved: roundMoney(transfers.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0)), examples: transfers.slice(0, 12).map(toCoachTransaction) };
}

function buildAppMoneyModel(transactions: any[], snapshot: any, goals: any[]) {
  const monthly = buildMonthlyBreakdown(transactions, "all");
  const usableMonths = monthly.filter((item) => item.income || item.spending);
  const divisor = Math.max(usableMonths.length, 1);
  const monthlyIncome = usableMonths.reduce((sum, item) => sum + item.income, 0) / divisor;
  const monthlySpending = usableMonths.reduce((sum, item) => sum + item.spending, 0) / divisor;
  const billStreams = Array.isArray(snapshot?.bill_streams) ? snapshot.bill_streams : [];
  const monthlyBills = billStreams.length ? billStreams.reduce((sum: number, item: any) => sum + Math.abs(Number(item.amount ?? item.usual_amount ?? 0)), 0) : usableMonths.reduce((sum, item) => sum + item.bills, 0) / divisor;
  const flexibleSpending = Math.max(monthlySpending - monthlyBills, 0);
  const safeMonthlyAmount = Math.max(monthlyIncome - monthlyBills - flexibleSpending, 0);
  return {
    income: { monthlyEstimate: roundMoney(monthlyIncome), basis: "server_monthly_average_from_authenticated_rows" },
    monthlyBillTotal: roundMoney(monthlyBills),
    grossMonthlyBillTotal: roundMoney(monthlyBills),
    monthlyScheduledOutgoingsTotal: roundMoney(monthlyBills),
    flexibleSpending: { monthlyEstimate: roundMoney(flexibleSpending), basis: "server_monthly_average_minus_bills" },
    savingsCapacity: { safeMonthlyAmount: roundMoney(safeMonthlyAmount), basis: "server_income_less_bills_and_flexible_spending" },
    cashPosition: { current_cash_known: false, note: "No live current balance is supplied from statements alone." },
    confidenceWarnings: monthly.length < 3 ? ["Less than three months of uploaded history, so monthly estimates may be rough."] : [],
    nextBestActions: goals.length ? ["Protect the main goal while checking bills and flexible spending."] : ["Set one clear safety goal after checking the bill calendar."],
    aiContext: { monthly_income_estimate: roundMoney(monthlyIncome), monthly_bills: roundMoney(monthlyBills), monthly_flexible_spending: roundMoney(flexibleSpending), safe_monthly_amount: roundMoney(safeMonthlyAmount), warnings: monthly.length < 3 ? ["Short history window"] : [] },
  };
}

function buildSignalRows(transactions: any[], pattern: RegExp) {
  return transactions.filter((transaction) => pattern.test(normalizeText(`${transaction.description} ${transaction.merchant} ${transaction.category}`))).slice(0, 10).map(toCoachTransaction);
}

async function selectUserRows(adminClient: any, table: string, userId: string, columns = "*", limit = 200) {
  const { data, error } = await adminClient.from(table).select(columns).eq("user_id", userId).limit(limit);
  if (error) return [];
  return data || [];
}

async function buildServerCoachContext(req: Request, message: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) throw new Error("AI data service is not configured.");

  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(supabaseUrl, serviceKey, { global: { headers: { Authorization: authHeader } } });
  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user?.id) throw new Error("Not signed in.");
  const userId = userData.user.id;

  const [{ data: transactions }, aiMessages, debts, investments, goals, transactionRules, subscriptionProfiles, bankConnections, snapshots] = await Promise.all([
    adminClient.from("transactions").select("id, transaction_date, description, merchant, amount, direction, category, is_bill, is_subscription, is_internal_transfer, is_income, accounts(name, institution)").eq("user_id", userId).order("transaction_date", { ascending: false }),
    selectUserRows(adminClient, "ai_messages", userId, "role, content, created_at", 8),
    selectUserRows(adminClient, "debts", userId, "*", 20),
    selectUserRows(adminClient, "investments", userId, "*", 20),
    selectUserRows(adminClient, "money_goals", userId, "*", 20),
    selectUserRows(adminClient, "transaction_rules", userId, "*", 100),
    selectUserRows(adminClient, "subscription_profiles", userId, "*", 1),
    selectUserRows(adminClient, "bank_connections", userId, "*", 20),
    selectUserRows(adminClient, "money_understanding_snapshots", userId, "summary, transactions, bill_streams, recurring_events, checks, ai_context, interpreted_at, latest_transaction_date", 3),
  ]);

  const rows = transactions || [];
  const realRows = rows.filter((transaction: any) => !isInternalTransfer(transaction));
  const spending = realRows.filter((transaction: any) => Number(transaction.amount) < 0);
  const income = realRows.filter((transaction: any) => Number(transaction.amount) > 0);
  const dates = rows.map((transaction: any) => String(transaction.transaction_date || "")).filter(Boolean).sort();
  const totals = getTotals(rows);
  const snapshot = snapshots[0] || null;
  const monthlyBreakdown = buildMonthlyBreakdown(rows, "6m");
  const monthlyBreakdownAll = buildMonthlyBreakdown(rows, "all");
  const appMoneyModel = buildAppMoneyModel(rows, snapshot, goals);
  const statementIntelligence = {
    date_range: { start: dates[0] || "", end: dates.at(-1) || "", total_transactions: rows.length, months: new Set(rows.map((row: any) => monthKey(row.transaction_date)).filter((key) => key !== "unknown")).size },
    totals,
    total_transactions: rows.length,
    settled_transaction_count: realRows.length,
    transfer_transaction_count: rows.length - realRows.length,
    pass_through_analysis: buildPassThroughAnalysis(rows),
    category_totals: groupTransactions(spending, (transaction) => transaction.category || "Spending", 20),
    merchant_totals: groupTransactions(spending, (transaction) => cleanLabel(transaction.merchant || transaction.description), 30),
    income_streams: groupTransactions(income, (transaction) => cleanLabel(transaction.merchant || transaction.description || "Income"), 20),
    account_activity: groupTransactions(rows, (transaction) => transaction.accounts?.name || "Unassigned account", 20),
    incoming_personal_payment_groups: groupTransactions(income.filter((transaction: any) => /\b(transfer|faster payment|payment from|credit)\b/.test(normalizeText(transaction.description))), (transaction) => cleanLabel(transaction.description), 40),
    outgoing_personal_payment_groups: groupTransactions(spending.filter((transaction: any) => /\b(transfer|faster payment|payment to|standing order)\b/.test(normalizeText(transaction.description)) && !isBillLike(transaction)), (transaction) => cleanLabel(transaction.description), 40),
    recurring_outgoings: groupTransactions(spending, (transaction) => cleanLabel(transaction.merchant || transaction.description), 30).filter((group) => group.count >= 2).slice(0, 20),
    large_outgoings: spending.slice().sort((a: any, b: any) => Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0))).slice(0, 30).map(toCoachTransaction),
    large_income: income.slice().sort((a: any, b: any) => Number(b.amount || 0) - Number(a.amount || 0)).slice(0, 20).map(toCoachTransaction),
  };

  return {
    server_built: true,
    totals: { income: appMoneyModel.income.monthlyEstimate, spending: appMoneyModel.flexibleSpending.monthlyEstimate, bills: appMoneyModel.monthlyBillTotal, net: roundMoney(appMoneyModel.income.monthlyEstimate - appMoneyModel.monthlyBillTotal - appMoneyModel.flexibleSpending.monthlyEstimate), safeToSpend: appMoneyModel.savingsCapacity.safeMonthlyAmount, basis: "server_rebuilt_app_money_model" },
    transaction_count: rows.length,
    recent_transactions: rows.slice(0, 30).map(toCoachTransaction),
    searchable_transactions: rows.slice(0, 350).map(toCoachTransaction),
    searchable_transaction_count: Math.min(rows.length, 350),
    searchable_transaction_note: rows.length > 350 ? `Most recent 350 transactions are included individually. Full-history summaries use all ${rows.length} transactions.` : `All ${rows.length} transactions are included individually.`,
    query_focus: buildQueryFocus(rows, message),
    statement_intelligence: statementIntelligence,
    app_money_model: appMoneyModel.aiContext,
    monthly_income_estimate: appMoneyModel.income,
    monthly_scheduled_outgoings_to_cover: appMoneyModel.monthlyScheduledOutgoingsTotal,
    monthly_bills_from_calendar_gross: appMoneyModel.grossMonthlyBillTotal,
    monthly_flexible_spending: appMoneyModel.flexibleSpending,
    savings_capacity: appMoneyModel.savingsCapacity,
    cash_position: appMoneyModel.cashPosition,
    confidence_warnings: appMoneyModel.confidenceWarnings,
    next_best_actions: appMoneyModel.nextBestActions,
    top_categories: statementIntelligence.category_totals.slice(0, 5),
    monthly_breakdown: monthlyBreakdown,
    monthly_breakdown_all: monthlyBreakdownAll,
    calendar_pattern_summary: { months: monthlyBreakdown.length, latest_month: monthlyBreakdown[0]?.month || null, bill_stream_count: Array.isArray(snapshot?.bill_streams) ? snapshot.bill_streams.length : 0 },
    money_understanding: snapshot?.ai_context || {},
    bills_found: snapshot?.bill_streams || [],
    checks_waiting: snapshot?.checks || [],
    data_freshness: { latest_transaction_date: dates.at(-1) || null, latest_ai_interpretation: snapshot?.interpreted_at || null, latest_ai_transaction_date: snapshot?.latest_transaction_date || null },
    transfer_summary: buildTransferSummary(rows),
    debts: debts.slice(0, 6),
    investments: investments.slice(0, 6),
    goals: goals.slice(0, 6),
    debt_statuses: debts.slice(0, 6).map((debt: any) => ({ name: debt.name, lender: debt.lender, status: "Included in server context" })),
    investment_statuses: investments.slice(0, 6).map((investment: any) => ({ name: investment.name, platform: investment.platform, status: "Included in server context" })),
    debt_signals: buildSignalRows(rows, /\b(loan|credit card|finance|klarna|clearpay|zopa|barclaycard|capital one|minimum payment)\b/),
    investment_signals: buildSignalRows(rows, /\b(trading 212|vanguard|freetrade|etoro|coinbase|crypto|isa|pension|investment)\b/),
    subscription_summary: buildSubscriptionSummary(rows),
    subscription_status: subscriptionProfiles[0] || null,
    bank_feed_readiness: { connected_banks: bankConnections.length, connections: bankConnections.slice(0, 5) },
    transaction_rules: transactionRules.slice(0, 40),
    launch_safety_rules: { maths_source_of_truth: "Use this server-built context, money_understanding snapshots, app_money_model, statement_intelligence, query_focus and transaction rules. Do not use client-supplied financial context.", safe_to_spend: "Only treat safe-to-spend as real spendable money when live balances or explicit current balances are supplied. Statement net is historical movement, not cash today.", checks_page: "If a bill, transfer, work payment or pass-through is uncertain, tell the user to confirm it in Confidence Checks instead of guessing.", answer_style: "Lead with the useful answer in simple English. Avoid accounting jargon unless asked." },
    premium_guidance: "Free users should get useful manual-upload advice. Premium is for live bank feeds, sharper AI, debt payoff tracking, investment tracking, calendar forecasts, and viewer mode.",
    recent_messages: aiMessages.slice(-6).map((msg: any) => ({ role: msg.role, content: msg.content })),
  };
}

function buildCoachSystemPrompt(message: string) {
  const compact = /\b(how much|total|totals|who sent|sent me|received|paid me|spent on|paid to|income from|sum|add up)\b/i.test(message);
  return `You are Money Hub AI. Give concise, practical personal finance guidance using only the supplied server-built context. Never invent money figures. Prefer app_money_model, money_understanding, statement_intelligence, query_focus and monthly_breakdown_all over raw examples. Distinguish historical statement flow from current cash. Use GBP. Plain text only, no markdown. ${compact ? "For factual lookups, answer in at most two short lines and put the number first." : "For advice, answer naturally but keep it short."}`;
}

function buildExtractionPrompt(kind: "debt" | "investment") {
  if (kind === "debt") return `Extract debt setup information. Return JSON only with: name, lender, starting_balance, current_balance, minimum_payment, due_day, interest_rate, notes. Use null when unknown. Do not invent precise numbers.`;
  return `Extract investment setup information. Return JSON only with: name, platform, asset_type, current_value, monthly_contribution, risk_level, ticker_symbol, units_owned, total_contributed, cost_basis, notes. Use null when unknown. Do not invent precise numbers.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildCorsHeaders(req) });
  const corsHeaders = buildCorsHeaders(req);

  try {
    const { mode = "coach", message, context = {} } = await req.json();
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ error: "AI service is not configured." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (mode === "market_price") {
      const assetType = String(context?.asset_type || "").toLowerCase();
      const rawSymbol = String(context?.ticker_symbol || message || "").trim();
      if (!rawSymbol) throw new Error("Missing ticker symbol.");
      const symbol = assetType === "crypto" && !rawSymbol.includes("-") ? `${rawSymbol.toUpperCase()}-USD` : rawSymbol;
      const quote = await getYahooPrice(symbol);
      return new Response(JSON.stringify({ ...quote, mode }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "extract_debt" || mode === "extract_investment" || mode === "extract_debt_document" || mode === "extract_investment_document") {
      const kind = mode === "extract_debt" || mode === "extract_debt_document" ? "debt" : "investment";
      const systemPrompt = buildExtractionPrompt(kind);
      const input = mode.endsWith("_document")
        ? buildDocumentExtractionInput(systemPrompt, String(message || ""), context)
        : [{ role: "user", content: `${systemPrompt}\n\nUser description:\n${message}\n\nSignals:\n${JSON.stringify(kind === "debt" ? context?.debt_signals || [] : context?.investment_signals || [], null, 2)}` }];
      const data = await callResponsesApi(apiKey, { model: "gpt-5.1", input });
      const rawReply = data.output_text || data.output?.[0]?.content?.[0]?.text || "{}";
      return new Response(JSON.stringify({ extracted: parseJsonReply(rawReply), message: mode.endsWith("_document") ? "AI filled the form from the uploaded document. Check it before saving." : "AI filled the form. Check it before saving.", mode }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const safeMessage = String(message || "").trim();
    if (!safeMessage) return new Response(JSON.stringify({ error: "Message is required." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const serverContext = await buildServerCoachContext(req, safeMessage);
    const compact = /\b(how much|total|totals|who sent|sent me|received|paid me|spent on|paid to|income from|sum|add up)\b/i.test(safeMessage);
    const data = await callResponsesApi(apiKey, { model: "gpt-5.1", max_output_tokens: compact ? 140 : 520, input: [{ role: "system", content: buildCoachSystemPrompt(safeMessage) }, { role: "user", content: `User message:\n${safeMessage}\n\nFinancial context rebuilt server-side from authenticated Supabase data:\n${JSON.stringify(serverContext, null, 2)}` }] });
    const rawReply = data.output_text || data.output?.[0]?.content?.[0]?.text || "How can I help?";
    return new Response(JSON.stringify({ reply: cleanReply(rawReply), model: "gpt-5.1", mode: "premium", context_source: "server_rich" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (_error) {
    return new Response(JSON.stringify({ error: "AI request could not be completed right now." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
