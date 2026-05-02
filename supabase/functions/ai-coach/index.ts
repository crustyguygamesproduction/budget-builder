import { createClient } from "@supabase/supabase-js";

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeText(value: unknown) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function cleanLabel(value: unknown, fallback = "Transaction") {
  const cleaned = String(value || fallback).replace(/\s+/g, " ").trim();
  return cleaned.split(" ").slice(0, 5).join(" ") || fallback;
}

function isInternalTransfer(transaction: any) {
  return Boolean(transaction?.is_internal_transfer || /\b(internal transfer|transfer between|savings transfer)\b/i.test(String(transaction?.description || "")));
}

function toCoachTransaction(transaction: any) {
  const amount = Number(transaction.amount || 0);
  return {
    date: transaction.transaction_date || "",
    description: transaction.description || "",
    merchant: cleanLabel(transaction.merchant || transaction.description),
    amount,
    direction: amount > 0 ? "in" : amount < 0 ? "out" : "zero",
    category: transaction.category || (amount > 0 ? "Income" : "Spending"),
    account: transaction.accounts?.name || "",
    is_bill: Boolean(transaction.is_bill),
    is_subscription: Boolean(transaction.is_subscription),
    is_internal_transfer: isInternalTransfer(transaction),
  };
}

function getTotals(transactions: any[]) {
  const real = transactions.filter((transaction) => !isInternalTransfer(transaction));
  const income = real.filter((transaction) => Number(transaction.amount) > 0).reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const spending = real.filter((transaction) => Number(transaction.amount) < 0).reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
  const bills = real.filter((transaction) => transaction.is_bill || transaction.is_subscription).reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
  return { income: roundMoney(income), spending: roundMoney(spending), bills: roundMoney(bills), net: roundMoney(income - spending) };
}

function groupTransactions(transactions: any[], labelFor: (transaction: any) => string, limit: number) {
  const groups = new Map<string, any>();

  for (const transaction of transactions) {
    const label = labelFor(transaction) || "Unknown";
    const key = normalizeText(label) || "unknown";
    const amount = Number(transaction.amount || 0);
    if (!groups.has(key)) groups.set(key, { label, count: 0, total: 0, money_in: 0, money_out: 0, example: transaction.description || "" });
    const group = groups.get(key);
    group.count += 1;
    group.total += Math.abs(amount);
    if (amount > 0) group.money_in += amount;
    if (amount < 0) group.money_out += Math.abs(amount);
  }

  return [...groups.values()]
    .map((group) => ({ ...group, total: roundMoney(group.total), money_in: roundMoney(group.money_in), money_out: roundMoney(group.money_out) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

function buildQueryFocus(transactions: any[], message: string) {
  const stopWords = new Set(["about", "all", "and", "from", "have", "how", "money", "much", "paid", "payment", "received", "sent", "send", "the", "this", "to", "total", "what", "when", "with"]);
  const terms = [...new Set(normalizeText(message).split(" "))].filter((term) => term.length >= 3 && !stopWords.has(term)).slice(0, 8);
  const matches = terms.length
    ? transactions.filter((transaction) => terms.some((term) => normalizeText([transaction.description, transaction.merchant, transaction.category, transaction.accounts?.name].join(" ")).includes(term)))
    : [];
  const moneyIn = matches.filter((transaction) => Number(transaction.amount) > 0).reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const moneyOut = matches.filter((transaction) => Number(transaction.amount) < 0).reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);

  return {
    original_query: message,
    search_terms: terms,
    direct_match_count: matches.length,
    direct_money_in: roundMoney(moneyIn),
    direct_money_out: roundMoney(moneyOut),
    direct_net: roundMoney(moneyIn - moneyOut),
    grouped_matches: groupTransactions(matches, (transaction) => cleanLabel(transaction.description), 20),
    direct_matches: matches.slice(0, 120).map(toCoachTransaction),
  };
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

  const [{ data: transactions }, aiMessages, debts, investments, goals, snapshots] = await Promise.all([
    adminClient
      .from("transactions")
      .select("id, transaction_date, description, merchant, amount, direction, category, is_bill, is_subscription, is_internal_transfer, is_income, accounts(name, institution)")
      .eq("user_id", userId)
      .order("transaction_date", { ascending: false }),
    selectUserRows(adminClient, "ai_messages", userId, "role, content, created_at", 8),
    selectUserRows(adminClient, "debts", userId, "*", 20),
    selectUserRows(adminClient, "investments", userId, "*", 20),
    selectUserRows(adminClient, "money_goals", userId, "*", 20),
    selectUserRows(adminClient, "money_understanding_snapshots", userId, "summary, bill_streams, checks, ai_context, interpreted_at, latest_transaction_date", 3),
  ]);

  const rows = transactions || [];
  const realRows = rows.filter((transaction: any) => !isInternalTransfer(transaction));
  const spending = realRows.filter((transaction: any) => Number(transaction.amount) < 0);
  const income = realRows.filter((transaction: any) => Number(transaction.amount) > 0);
  const dates = rows.map((transaction: any) => String(transaction.transaction_date || "")).filter(Boolean).sort();
  const totals = getTotals(rows);
  const snapshot = snapshots[0] || null;

  return {
    server_built: true,
    totals: { ...totals, basis: "server_calculated_from_authenticated_user_rows" },
    transaction_count: rows.length,
    recent_transactions: rows.slice(0, 30).map(toCoachTransaction),
    searchable_transactions: rows.slice(0, 350).map(toCoachTransaction),
    searchable_transaction_count: Math.min(rows.length, 350),
    searchable_transaction_note: rows.length > 350 ? `Most recent 350 transactions are included individually. Summaries use all ${rows.length} transactions.` : `All ${rows.length} transactions are included individually.`,
    query_focus: buildQueryFocus(rows, message),
    statement_intelligence: {
      date_range: { start: dates[0] || "", end: dates.at(-1) || "", total_transactions: rows.length },
      totals,
      category_totals: groupTransactions(spending, (transaction) => transaction.category || "Spending", 20),
      merchant_totals: groupTransactions(spending, (transaction) => cleanLabel(transaction.merchant || transaction.description), 30),
      income_streams: groupTransactions(income, (transaction) => cleanLabel(transaction.merchant || transaction.description || "Income"), 20),
    },
    debts: debts.slice(0, 6),
    investments: investments.slice(0, 6),
    goals: goals.slice(0, 6),
    money_understanding: snapshot?.ai_context || {},
    bills_found: snapshot?.bill_streams || [],
    checks_waiting: snapshot?.checks || [],
    data_freshness: {
      latest_transaction_date: dates.at(-1) || null,
      latest_ai_interpretation: snapshot?.interpreted_at || null,
      latest_ai_transaction_date: snapshot?.latest_transaction_date || null,
    },
    recent_messages: aiMessages.slice(-6).map((msg: any) => ({ role: msg.role, content: msg.content })),
    safety_note: "Context was rebuilt inside the Edge Function from rows owned by the authenticated Supabase user. Client-supplied financial context is ignored for coach mode.",
  };
}

function buildCoachSystemPrompt(message: string) {
  const compact = /\b(how much|total|totals|who sent|sent me|received|paid me|spent on|paid to|income from|sum|add up)\b/i.test(message);
  return `You are Money Hub AI. Give concise, practical personal finance guidance using only the supplied server-built context. Never invent money figures. Distinguish historical statement flow from current cash. Use GBP. Plain text only, no markdown. ${compact ? "For factual lookups, answer in at most two short lines and put the number first." : "For advice, answer naturally but keep it short."}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildCorsHeaders(req) });
  const corsHeaders = buildCorsHeaders(req);

  try {
    const { mode = "coach", message } = await req.json();
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI service is not configured." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode !== "coach") {
      return new Response(JSON.stringify({ error: "Unsupported AI mode in this endpoint." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const safeMessage = String(message || "").trim();
    if (!safeMessage) {
      return new Response(JSON.stringify({ error: "Message is required." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const serverContext = await buildServerCoachContext(req, safeMessage);
    const data = await callResponsesApi(apiKey, {
      model: "gpt-5.1",
      max_output_tokens: /\b(how much|total|totals|who sent|sent me|received|paid me|spent on|paid to|income from|sum|add up)\b/i.test(safeMessage) ? 140 : 520,
      input: [
        { role: "system", content: buildCoachSystemPrompt(safeMessage) },
        {
          role: "user",
          content: `User message:\n${safeMessage}\n\nFinancial context rebuilt server-side from authenticated Supabase data:\n${JSON.stringify(serverContext, null, 2)}`,
        },
      ],
    });

    const rawReply = data.output_text || data.output?.[0]?.content?.[0]?.text || "How can I help?";
    return new Response(JSON.stringify({ reply: cleanReply(rawReply), model: "gpt-5.1", mode: "premium", context_source: "server" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (_error) {
    return new Response(JSON.stringify({ error: "AI request could not be completed right now." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
