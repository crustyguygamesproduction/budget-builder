import { createClient } from "@supabase/supabase-js";
import {
  buildCoachQueryFocus,
  isLikelyPersonalTransfer,
} from "../_shared/coachQueryFocus.js";

class PublicFunctionError extends Error {
  status: number;
  code: string;
  publicMessage: string;
  details: Record<string, unknown>;

  constructor(code: string, publicMessage: string, status = 500, logMessage = publicMessage, details: Record<string, unknown> = {}) {
    super(logMessage);
    this.name = "PublicFunctionError";
    this.code = code;
    this.publicMessage = publicMessage;
    this.status = status;
    this.details = details;
  }
}

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

function parseJsonReply(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("Could not parse AI JSON response.");
  }
}

function isImageUrl(url: string) {
  return /\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(url || "");
}

function isCompactLookup(message: string) {
  const text = String(message || "").toLowerCase();
  const asksForDetail = /\b(break ?down|detail|detailed|explain|why|analysis|analyse|analyze|plan|review|full|list all|every|step|compare)\b/.test(text);
  const factualLookup = /\b(how much|total|totals|who sent|sent me|been sent|received|paid me|what did i spend|spent on|paid to|income from|sum|add up)\b/.test(text);
  return factualLookup && !asksForDetail;
}

function isHardTruthRequest(message: string) {
  return /\b(be honest|be brutal|be harsh|be savage|roast me|hard truth|tell me straight|am i bad|doing bad|bad with money|why am i broke|i am broke|i'm broke|wake up|no excuses|sort me out|brutally honest)\b/i.test(String(message || ""));
}

function getCoachMaxOutputTokens(message: string) {
  if (isHardTruthRequest(message)) return 260;
  return isCompactLookup(message) ? 140 : 420;
}

function getCoachLengthInstruction(message: string) {
  if (isHardTruthRequest(message)) {
    return [
      "HARD TRUTH MODE IS ON.",
      "Maximum 6 short lines total.",
      "Do not write a long review, balanced appraisal, numbered essay, or motivational speech.",
      "Do not include a 'What you're doing well' section unless the user directly asks for positives.",
      "Open with one blunt sentence.",
      "Then give the 2 or 3 main leaks only.",
      "End with one hard rule for the next 7 days.",
      "No cosy follow-up offer.",
    ].join("\n");
  }

  if (!isCompactLookup(message)) {
    return "This is not a compact lookup unless the user's wording is purely factual. Answer naturally, but stay concise.";
  }

  return [
    "COMPACT LOOKUP MODE IS ON.",
    "Return at most 2 short lines.",
    "First line must answer the exact number or result, starting with Total: when suitable.",
    "Second line may contain one short caveat or one short follow-up offer.",
    "Do not give paragraphs, sender-by-sender explanations, or method notes unless the user asked for a breakdown.",
  ].join("\n");
}

function enforceCompactReply(reply: string, message: string) {
  const cleaned = cleanReply(reply);
  if (isHardTruthRequest(message)) return enforceHardTruthReply(cleaned);
  if (!isCompactLookup(message) || cleaned.length <= 360) return cleaned;

  const paragraphs = cleaned.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  const firstUseful = paragraphs.find((item) => /£|total|sent|received|paid|spent/i.test(item)) || paragraphs[0] || cleaned;
  const compact = firstUseful.length > 240 ? `${firstUseful.slice(0, 237).trim()}...` : firstUseful;
  const hasFollowUp = /want me|shall i|do you want/i.test(compact);
  return hasFollowUp ? compact : `${compact}\nWant me to break that down?`;
}

function enforceHardTruthReply(reply: string) {
  const lines = String(reply || "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/^what you.?re doing well/i.test(item))
    .filter((item) => !/^quick read/i.test(item))
    .slice(0, 6);

  const compact = lines.join("\n").trim();
  return compact.length > 900 ? `${compact.slice(0, 897).trim()}...` : compact;
}

async function callResponsesApi(apiKey: string, body: Record<string, unknown>) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    const openAIErrorKind = data?.error?.code || data?.error?.type || "unknown";
    console.error("ai-coach: OpenAI request failed", {
      status: response.status,
      error_type: data?.error?.type || null,
      error_code: data?.error?.code || null,
      model: body?.model || null,
      error_message: data?.error?.message || JSON.stringify(data).slice(0, 500),
    });
    throw new PublicFunctionError(
      "openai_request_failed",
      "Coach had trouble reading the saved money brain. Try again in a moment.",
      500,
      data?.error?.message || "OpenAI request failed",
      { openai_error_kind: openAIErrorKind, openai_status: response.status, model: body?.model || null }
    );
  }
  return data;
}

async function callResponsesApiWithModels(apiKey: string, body: Record<string, unknown>, models: string[]) {
  let lastError: unknown = null;
  for (const model of models) {
    try {
      return { data: await callResponsesApi(apiKey, { ...body, model }), model };
    } catch (error) {
      lastError = error;
      if (!(error instanceof PublicFunctionError) || error.code !== "openai_request_failed") throw error;
      console.warn("ai-coach: OpenAI model failed, trying next candidate if available", {
        model,
        openai_error_kind: error.details?.openai_error_kind || null,
      });
    }
  }
  throw lastError;
}

function uniqueStrings(items: string[]) {
  return Array.from(new Set(items.map((item) => String(item || "").trim()).filter(Boolean)));
}

function getOpenAIModelCandidates(primaryEnvName: string, fallbackEnvName: string, defaultPrimary = "gpt-5.1") {
  const primary = Deno.env.get(primaryEnvName) || defaultPrimary;
  const fallbacks = (Deno.env.get(fallbackEnvName) || "gpt-4.1-mini,gpt-4o-mini")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return uniqueStrings([primary, ...fallbacks]);
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

function buildDocumentExtractionInput(systemPrompt: string, message: string, context: any) {
  const textParts = [{ type: "input_text", text: `${systemPrompt}\n\nUser note:\n${message || "No extra note."}` }] as Array<Record<string, string>>;

  if (context?.document_data_url && String(context.document_data_url).startsWith("data:image/")) {
    textParts.push({ type: "input_image", image_url: context.document_data_url });
  } else if (context?.document_url && isImageUrl(context.document_url)) {
    textParts.push({ type: "input_image", image_url: context.document_url });
  } else if (context?.document_name) {
    textParts.push({
      type: "input_text",
      text: `Document name: ${context.document_name}. If this is not an image, extract only what can be inferred and leave the rest null.`,
    });
  }

  return [{ role: "user", content: textParts }];
}

async function getAuthenticatedUser(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || (!anonKey && !serviceRoleKey)) {
    throw new PublicFunctionError("missing_supabase_env", "AI data service is not configured.", 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new PublicFunctionError("not_signed_in", "Please sign in again before using Coach.", 401);
  }
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();

  const authClient = createClient(supabaseUrl, serviceRoleKey || anonKey || "", {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.getUser(jwt);
  if (error || !data?.user?.id) {
    throw new PublicFunctionError("not_signed_in", "Please sign in again before using Coach.", 401, error?.message || "JWT validation failed");
  }

  return { userId: data.user.id, supabaseUrl, anonKey, serviceRoleKey, authHeader };
}

async function getSavedCoachContext(req: Request) {
  const { userId, supabaseUrl, anonKey, serviceRoleKey, authHeader } = await getAuthenticatedUser(req);
  const selectSnapshot = (client: ReturnType<typeof createClient>) =>
    client
      .from("coach_context_snapshots")
      .select("context, context_hash, transaction_count, latest_transaction_date, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

  let data: any = null;
  let rlsError: any = null;

  if (anonKey) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await selectSnapshot(userClient);
    data = result.data;
    rlsError = result.error;
  }

  if (rlsError && !serviceRoleKey) throw rlsError;

  if ((rlsError || !data) && serviceRoleKey) {
    if (rlsError) {
      console.warn("ai-coach: RLS context read failed, falling back to service role after JWT validation", {
        code: rlsError.code || null,
        message: rlsError.message || "unknown",
      });
    }
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await selectSnapshot(serviceClient);
    if (result.error) throw result.error;
    data = result.data;
  }

  if (!data?.context) {
    throw new PublicFunctionError(
      "coach_brain_missing",
      "Coach brain is still saving. Wait a moment, then try again.",
      200,
      "No coach_context_snapshots row/context found for authenticated user."
    );
  }

  return {
    ...(data.context || {}),
    server_context_meta: {
      source: "coach_context_snapshots",
      context_hash: data.context_hash || null,
      transaction_count: data.transaction_count || 0,
      latest_transaction_date: data.latest_transaction_date || null,
      updated_at: data.updated_at || null,
    },
  };
}

function buildSavedCoachBrainForPrompt(savedContext: any, message: string) {
  const recentMessages = Array.isArray(savedContext?.recent_messages) ? savedContext.recent_messages.slice(-8) : [];
  const relevantTransactions = getRelevantTransactions(savedContext, message);
  const queryFocus = buildServerQueryFocus(savedContext, message) || savedContext?.query_focus || null;
  return {
    server_context_meta: savedContext?.server_context_meta || null,
    totals: savedContext?.totals || null,
    transaction_count: savedContext?.transaction_count || 0,
    query_focus: queryFocus,
    statement_intelligence: compactStatementIntelligence(savedContext?.statement_intelligence),
    app_money_model: savedContext?.app_money_model || null,
    monthly_income_estimate: savedContext?.monthly_income_estimate || null,
    monthly_scheduled_outgoings_to_cover: savedContext?.monthly_scheduled_outgoings_to_cover ?? null,
    monthly_bills_from_calendar_gross: savedContext?.monthly_bills_from_calendar_gross ?? null,
    monthly_flexible_spending: savedContext?.monthly_flexible_spending || null,
    savings_capacity: savedContext?.savings_capacity || null,
    cash_position: savedContext?.cash_position || null,
    confidence_warnings: savedContext?.confidence_warnings || [],
    next_best_actions: savedContext?.next_best_actions || [],
    top_categories: (savedContext?.top_categories || []).slice(0, 12),
    monthly_breakdown: (savedContext?.monthly_breakdown_all || savedContext?.monthly_breakdown || []).slice(0, 12),
    calendar_pattern_summary: savedContext?.calendar_pattern_summary || null,
    money_understanding: compactMoneyUnderstanding(savedContext?.money_understanding),
    bills_found: compactBills(savedContext?.bills_found || []).slice(0, 20),
    checks_waiting: compactChecks(savedContext?.checks_waiting || []).slice(0, 12),
    transfer_summary: savedContext?.transfer_summary || null,
    debts: (savedContext?.debts || []).slice(0, 8),
    investments: (savedContext?.investments || []).slice(0, 8),
    debt_signals: (savedContext?.debt_signals || []).slice(0, 8),
    investment_signals: (savedContext?.investment_signals || []).slice(0, 8),
    recent_transactions: compactTransactions(savedContext?.recent_transactions || []).slice(0, 20),
    relevant_searchable_transactions: relevantTransactions,
    recent_messages: recentMessages,
    launch_safety_rules: savedContext?.launch_safety_rules || null,
  };
}

function buildMinimalCoachBrainForPrompt(savedContext: any, message = "") {
  const statement = compactStatementIntelligence(savedContext?.statement_intelligence);
  const queryFocus = buildServerQueryFocus(savedContext, message) || savedContext?.query_focus || null;
  return {
    server_context_meta: savedContext?.server_context_meta || null,
    totals: savedContext?.totals || null,
    transaction_count: savedContext?.transaction_count || 0,
    query_focus: queryFocus,
    statement_intelligence: statement
      ? {
          date_range: statement.date_range,
          totals: statement.totals,
          total_transactions: statement.total_transactions,
          settled_transaction_count: statement.settled_transaction_count,
          pass_through_analysis: statement.pass_through_analysis,
          category_totals: (statement.category_totals || []).slice(0, 8),
          merchant_totals: (statement.merchant_totals || []).slice(0, 8),
          income_streams: (statement.income_streams || []).slice(0, 5),
        }
      : null,
    app_money_model: savedContext?.app_money_model || null,
    monthly_income_estimate: savedContext?.monthly_income_estimate || null,
    monthly_scheduled_outgoings_to_cover: savedContext?.monthly_scheduled_outgoings_to_cover ?? null,
    monthly_bills_from_calendar_gross: savedContext?.monthly_bills_from_calendar_gross ?? null,
    monthly_flexible_spending: savedContext?.monthly_flexible_spending || null,
    savings_capacity: savedContext?.savings_capacity || null,
    cash_position: savedContext?.cash_position || null,
    confidence_warnings: (savedContext?.confidence_warnings || []).slice(0, 6),
    next_best_actions: (savedContext?.next_best_actions || []).slice(0, 5),
    top_categories: (savedContext?.top_categories || []).slice(0, 8),
    calendar_pattern_summary: savedContext?.calendar_pattern_summary || null,
    money_understanding: compactMoneyUnderstanding(savedContext?.money_understanding),
    bills_found: compactBills(savedContext?.bills_found || []).slice(0, 8),
    checks_waiting: compactChecks(savedContext?.checks_waiting || []).slice(0, 6),
    transfer_summary: savedContext?.transfer_summary || null,
    debts: (savedContext?.debts || []).slice(0, 5),
    investments: (savedContext?.investments || []).slice(0, 5),
    debt_signals: (savedContext?.debt_signals || []).slice(0, 5),
    investment_signals: (savedContext?.investment_signals || []).slice(0, 5),
    recent_transactions: compactTransactions(savedContext?.recent_transactions || []).slice(0, 8),
    launch_safety_rules: savedContext?.launch_safety_rules || null,
  };
}

function buildCoachRequestBody(message: string, promptContext: Record<string, unknown>) {
  return {
    max_output_tokens: getCoachMaxOutputTokens(message),
    input: [
      { role: "system", content: buildCoachSystemPrompt(message) },
      {
        role: "user",
        content: `User message:\n${message}\n\nResponse mode:\n${isCompactLookup(message) ? "compact_lookup" : "normal_coach"}\n\nHard truth mode:\n${isHardTruthRequest(message) ? "on" : "off"}\n\nFinancial context from saved server-side coach brain. Ignore any browser-sent financial context for normal coach chat:\n${JSON.stringify(promptContext, null, 2)}`,
      },
    ],
  };
}

function buildDeterministicLookupReply(message: string, promptContext: Record<string, unknown>) {
  if (!isCompactLookup(message)) return null;
  const queryFocus = promptContext?.query_focus as any;
  if (!queryFocus || !Array.isArray(queryFocus.search_terms)) return null;
  if (!queryFocus.search_terms.length && !queryFocus.broad_personal_lookup) return null;
  if (!queryFocus.direct_match_count && !queryFocus.relevant_match_count) {
    if (!queryFocus.broad_personal_lookup) return null;
    const windowText = queryFocus.time_window?.matched
      ? ` in ${queryFocus.time_window.label}`
      : "";
    return `I can't confidently spot friends/family transfers${windowText} from the labels alone. Give me a couple of names to search, or use Review to confirm the likely people-money suggestions.`;
  }

  const amount = Number(
    queryFocus.direction_intent === "incoming"
      ? queryFocus.direct_money_in
      : queryFocus.direction_intent === "net"
        ? queryFocus.direct_net
        : queryFocus.relevant_money_total ?? queryFocus.direct_money_out
  );
  if (!Number.isFinite(amount)) return null;

  const target = queryFocus.broad_personal_lookup
    ? "people who look like friends/family"
    : queryFocus.search_terms
        .map((term: string) => term.charAt(0).toUpperCase() + term.slice(1))
        .join(" ");
  const verb =
    queryFocus.direction_intent === "incoming"
      ? "received from"
      : queryFocus.direction_intent === "net"
        ? "net for"
        : "spent on";
  const windowText = queryFocus.time_window?.matched
    ? ` in ${queryFocus.time_window.label}`
    : "";

  const caveat = queryFocus.broad_personal_lookup
    ? ` This is Money Hub's best read from ${queryFocus.relevant_match_count || queryFocus.direct_match_count} personal-looking transfers; confirm any missing names in Review.`
    : "";

  return `Total: ${formatGbp(Math.abs(amount))} ${verb} ${target}${windowText}.${caveat}`;
}

function buildCoachCheckSuggestions(queryFocus: any) {
  if (!queryFocus?.broad_personal_lookup) return [];
  const groups = Array.isArray(queryFocus.relevant_grouped_matches)
    ? queryFocus.relevant_grouped_matches
    : [];

  return groups
    .filter((group: any) => Number(group.count || 0) > 0)
    .slice(0, 8)
    .map((group: any, index: number) => {
      const label = String(group.label || "Personal transfer").trim();
      const direction = queryFocus.direction_intent === "incoming" ? "incoming" : "outgoing";
      const total = direction === "incoming" ? Number(group.money_in || group.total || 0) : Number(group.money_out || group.total || 0);
      const count = Math.max(Number(group.count || 1), 1);
      return {
        key: `coach:${direction}:${normalizeCheckKey(label)}:${Math.round(total * 100)}:${count}`,
        label,
        matchText: label,
        amount: Math.round((total / count) * 100) / 100,
        count,
        monthCount: getGroupMonthCount(group),
        sampleDescription: group.example || label,
        direction,
        question: direction === "incoming" ? `Is ${label} money from someone you know?` : `Is ${label} money you sent to someone you know?`,
        helper: "Coach used this as a people-money guess. Answer it once and future advice gets sharper.",
        source: "coach",
        sourceQuery: queryFocus.original_query || "",
      };
    });
}

function normalizeCheckKey(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "check";
}

function getGroupMonthCount(group: any) {
  const months = new Set(
    [group?.first_date, group?.last_date]
      .filter(Boolean)
      .map((date) => String(date).slice(0, 7))
  );
  return Math.max(months.size, 1);
}

function formatGbp(value: number) {
  return `£${Number(value || 0).toFixed(2)}`;
}

function getRelevantTransactions(savedContext: any, message: string) {
  const transactions = Array.isArray(savedContext?.searchable_transactions)
    ? savedContext.searchable_transactions
    : [];
  if (!transactions.length) return [];

  const tokens = String(message || "")
    .toLowerCase()
    .replace(/[^a-z0-9£.\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .filter((token) => !["what", "where", "when", "with", "from", "money", "like", "have", "been", "this", "that"].includes(token));

  const scored = transactions
    .map((transaction: any, index: number) => {
      const haystack = JSON.stringify(transaction).toLowerCase();
      const score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
      return { transaction, score, index };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.transaction);

  return compactTransactions((scored.length ? scored : transactions).slice(0, isCompactLookup(message) ? 80 : 30));
}

function buildServerQueryFocus(savedContext: any, message: string) {
  const transactions = Array.isArray(savedContext?.searchable_transactions)
    ? savedContext.searchable_transactions
    : [];
  return buildCoachQueryFocus(transactions, message, {
    latestTransactionDate: savedContext?.server_context_meta?.latest_transaction_date,
    getDate: (transaction: any) => transaction.date || transaction.transaction_date || "",
    getSearchText: (transaction: any) => [
      transaction.description,
      transaction.name,
      transaction.merchant,
      transaction.category,
      transaction.account,
    ].join(" "),
    getGroupLabel: (transaction: any) => transaction.name || transaction.description || transaction.merchant || "Transaction",
    mapTransaction: (transaction: any) => compactTransactions([transaction])[0],
    relevantFilter: (transaction: any) => isLikelyPersonalTransfer(transaction),
    exampleLimit: 80,
    groupLimit: 12,
    noteSuffix: "Use query_focus totals before merchant_totals for this answer.",
  });
}

function compactTransactions(transactions: any[]) {
  return (transactions || []).map((transaction) => ({
    date: transaction.date || transaction.transaction_date || null,
    name: transaction.name || transaction.description || transaction.merchant || null,
    category: transaction.category || null,
    amount: transaction.amount ?? null,
  }));
}

function compactBills(bills: any[]) {
  return (bills || []).map((bill) => ({
    name: bill.name || bill.title || null,
    amount: bill.amount ?? null,
    expected_day: bill.expected_day || bill.day || null,
    kind: bill.kind || null,
  }));
}

function compactChecks(checks: any[]) {
  return (checks || []).map((check) => ({
    label: check.label || check.question || null,
    amount: check.amount ?? null,
    reason: check.reason || check.helper || null,
  }));
}

function compactStatementIntelligence(summary: any) {
  if (!summary) return null;
  return {
    date_range: summary.date_range || null,
    totals: summary.totals || null,
    total_transactions: summary.total_transactions || null,
    settled_transaction_count: summary.settled_transaction_count || null,
    transfer_transaction_count: summary.transfer_transaction_count || null,
    pass_through_analysis: summary.pass_through_analysis
      ? {
          standard_view: summary.pass_through_analysis.standard_view || null,
          known_pass_through_view: summary.pass_through_analysis.known_pass_through_view || null,
          possible_pass_through_count: summary.pass_through_analysis.possible_pass_through_count || 0,
        }
      : null,
    category_totals: (summary.category_totals || []).slice(0, 10),
    merchant_totals: (summary.merchant_totals || []).slice(0, 12),
    income_streams: (summary.income_streams || []).slice(0, 8),
    recurring_outgoings: (summary.recurring_outgoings || []).slice(0, 10),
    large_outgoings: compactTransactions(summary.large_outgoings || []).slice(0, 10),
    unusual_transactions: compactTransactions(summary.unusual_transactions || []).slice(0, 10),
  };
}

function compactMoneyUnderstanding(context: any) {
  if (!context) return null;
  return {
    summary: context.summary || null,
    bills_found: compactBills(context.bills_found || []),
    recent_transactions: compactTransactions(context.recent_transactions || []).slice(0, 12),
  };
}

function buildCoachSystemPrompt(message: string) {
  const hardTruthMode = isHardTruthRequest(message);
  return `
You are Money Hub AI.

Core job:
Help people who want to be better with money, but are inconsistent, overwhelmed, or not very organised.
The app reduces effort and gives clear money decisions.

Voice:
- blunt
- sharp
- calm
- concise
- practical
- honest
- intelligent
- no-excuses
- firm when the data is bad
- like a strict older brother who actually wants the user to win
- direct, but not abusive
- never preachy
- never fluffy
- never patronising
- never hypey

Tough-love rules:
- Be much firmer than a normal budgeting app.
- If the data shows reckless or avoidable spending, say so plainly.
- You may call choices, patterns, habits, or spending behaviour reckless, lazy, chaotic, wasteful, avoidant, self-sabotaging, unserious, or out of control.
- You may say things like "this is not a maths problem, it is a behaviour problem", "you are kidding yourself if you call this affordable", "the Spending pot is where your money goes to disappear", "this is financial self-sabotage", or "you are acting like future-you can clean up every mess" when the data supports it.
- Challenge excuses. If the user is overspending on obvious lifestyle leaks, do not cushion the truth.
- Do not insult the user's identity or intelligence. Do not call the user stupid, an idiot, dumb, useless, pathetic, or similar.
- Criticise the financial behaviour, not the person.

Hard truth mode:
${hardTruthMode ? "ON" : "OFF"}
- If hard truth mode is ON, do not reassure first.
- If hard truth mode is ON, open with the uncomfortable truth, not a summary.
- If hard truth mode is ON, answer in 6 short lines or fewer.
- If hard truth mode is ON, do not include positives unless the user directly asks.
- If hard truth mode is ON, do not explain every category. Pick the biggest 2 or 3 leaks.
- If hard truth mode is ON, end with one strict rule for the next 7 days.
- If hard truth mode is ON, no cosy follow-up offer.

Output rules:
- Plain text only.
- Do not use markdown, bold, asterisks, bullet symbols, or code formatting.
- Keep replies mobile-friendly.
- Answer the exact question first.
- For hard truth mode, default length is 4 to 6 short lines total.
- For normal mode, default length is very short: usually 1 to 4 sentences.
- Use labelled sections only when the user asks for advice, a plan, a review, a breakdown, a decision, or hard truth.
- End with at most one useful follow-up offer when it helps.

Maths and trust rules:
- The maths is the product. Treat it as safety-critical.
- Use only the supplied server-saved financial context from coach_context_snapshots.
- Never invent totals, surplus, rent, bills, pass-throughs, reimbursements, debt balances, investment values, or safe-to-spend numbers.
- Prefer app_money_model, statement_intelligence, money_understanding, query_focus, monthly_breakdown_all and saved checks over raw examples.
- For "how much did I spend/receive on X in latest/last/this month" questions, use query_focus.relevant_money_total, query_focus.direct_money_out, query_focus.direct_money_in and query_focus.time_window before merchant_totals or category_totals.
- If query_focus.time_window.matched is true, say the answer is for that uploaded-data window only. Do not use all-history merchant totals for that answer.
- If pass_through_analysis is present, use its standard_view and known_pass_through_view exactly. Do not recalculate those numbers in prose.
- Do not say the user is ahead, up, in surplus, or fine unless that exact claim is supported by an app-calculated field.
- Always distinguish historical statement net from current cash available today.
- If current balances are not supplied, say you cannot verify current cash exactly from statements alone.
- Possible pass-through candidates are not confirmed exclusions. Tell the user they need confirming before being removed from personal spending.
- Rent, bills and subscriptions stay included in real spending unless the app context explicitly says otherwise.

Learning loop rules:
- If the user asks a broad human-life question, such as friends, family, work money, lending, paying people back, shared bills, side income, or support, make the best safe read from query_focus first.
- If labels are ambiguous, say what you can see and what needs confirming. Do not pretend certainty.
- Ask one short follow-up question only when it would unlock a better answer, for example "Which name should I search?".
- When Review is the right next step, say "confirm it in Review" rather than using vague language.
- Never send the user away to do work if the answer is already in the supplied context. Give the answer, then ask for the smallest confirmation needed.

Lifestyle audit rules:
- If the user asks why they are broke, where their money is going, why they cannot save, or what lifestyle changes would help, act like a strict but useful money auditor.
- Find the highest controllable leaks in the supplied data before giving generic advice.
- Look for food delivery, takeaways, McDonald's, Uber Eats, Deliveroo, Just Eat, restaurants, coffee shops, taxis, Uber/Bolt, petrol, parking, shopping, subscriptions, gambling, alcohol, convenience stores, gaming, and repeated small card payments.
- Do not over-soften lifestyle leaks. If the data shows repeated avoidable spending, call it avoidable and tell them to stop or cap it.
- When the user is emotionally admitting they are bad with money, do not comfort them with vague positivity. Give them a blunt but useful reset.
- Good hard-truth style: "Yeah. You are not broke because of one disaster; you are bleeding money through convenience, gaming and top-ups."
- Good hard-truth style: "The Spending pot is not a budget right now. It is a hole with a friendly name."
- Good hard-truth style: "For 7 days: no delivery, no gaming spend, no Uber unless safety is involved."
- Bad style: personal abuse, name-calling, humiliation, or saying the user is stupid.
- Bad style: soft HR language like "consider reducing discretionary spend" when the data clearly shows the leak.

Hard length override:
${getCoachLengthInstruction(message)}
`;
}

function buildExtractionPrompt(kind: "debt" | "investment") {
  if (kind === "debt") {
    return `
You extract debt setup information for a money app.
Return JSON only. No markdown. If a field is unknown, use null. Use GBP assumptions. Do not invent precise numbers.
Return exactly this shape:
{
  "name": string | null,
  "lender": string | null,
  "starting_balance": number | null,
  "current_balance": number | null,
  "minimum_payment": number | null,
  "due_day": number | null,
  "interest_rate": number | null,
  "notes": string | null
}
`;
  }

  return `
You extract investment setup information for a money app.
Return JSON only. No markdown. If a field is unknown, use null. Use GBP assumptions where money values are not labelled. Do not invent precise numbers.
risk_level must be "low", "medium", "high", or null. asset_type must be "general", "isa", "pension", "crypto", "shares", or "funds".
Return exactly this shape:
{
  "name": string | null,
  "platform": string | null,
  "asset_type": string | null,
  "current_value": number | null,
  "monthly_contribution": number | null,
  "risk_level": "low" | "medium" | "high" | null,
  "ticker_symbol": string | null,
  "units_owned": number | null,
  "total_contributed": number | null,
  "cost_basis": number | null,
  "notes": string | null
}
`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildCorsHeaders(req) });
  const corsHeaders = buildCorsHeaders(req);
  let modeForLogs = "unknown";
  const requestId = crypto.randomUUID();

  try {
    const { mode = "coach", message, context = {} } = await req.json();
    modeForLogs = String(mode || "coach");
    const apiKey = Deno.env.get("OPENAI_API_KEY");

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI service is not configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      const { data, model } = await callResponsesApiWithModels(apiKey, { input }, getOpenAIModelCandidates("OPENAI_COACH_MODEL", "OPENAI_COACH_FALLBACK_MODELS"));
      const rawReply = data.output_text || data.output?.[0]?.content?.[0]?.text || "{}";
      return new Response(JSON.stringify({ extracted: parseJsonReply(rawReply), message: mode.endsWith("_document") ? "AI filled the form from the uploaded document. Review it before saving." : "AI filled the form. Review it before saving.", mode, model }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const safeMessage = String(message || "").trim();
    if (!safeMessage) {
      return new Response(JSON.stringify({ error: "Message is required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const savedContext = await getSavedCoachContext(req);
    const wantsSearchableTransactions = isCompactLookup(safeMessage);
    const promptContext = wantsSearchableTransactions
      ? buildSavedCoachBrainForPrompt(savedContext, safeMessage)
      : buildMinimalCoachBrainForPrompt(savedContext, safeMessage);
    const coachCheckSuggestions = buildCoachCheckSuggestions((promptContext as any)?.query_focus);
    const deterministicReply = buildDeterministicLookupReply(safeMessage, promptContext);
    if (deterministicReply) {
      return new Response(JSON.stringify({ reply: deterministicReply, model: "app_query_focus", mode: "premium", context_source: "coach_context_snapshots", context_detail: "deterministic_query_focus", coach_check_suggestions: coachCheckSuggestions }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let contextDetail = wantsSearchableTransactions ? "searchable_compact" : "decision_compact";
    let data: any;
    let model = "";
    try {
      const result = await callResponsesApiWithModels(
        apiKey,
        buildCoachRequestBody(safeMessage, promptContext),
        getOpenAIModelCandidates("OPENAI_COACH_MODEL", "OPENAI_COACH_FALLBACK_MODELS")
      );
      data = result.data;
      model = result.model;
    } catch (error) {
      if (!(error instanceof PublicFunctionError) || error.code !== "openai_request_failed" || !wantsSearchableTransactions) {
        throw error;
      }
      console.warn("ai-coach: retrying compact lookup with decision context only", { request_id: requestId });
      contextDetail = "decision_compact_retry";
      const result = await callResponsesApiWithModels(
        apiKey,
        buildCoachRequestBody(safeMessage, buildMinimalCoachBrainForPrompt(savedContext, safeMessage)),
        getOpenAIModelCandidates("OPENAI_COACH_MODEL", "OPENAI_COACH_FALLBACK_MODELS")
      );
      data = result.data;
      model = result.model;
    }

    const rawReply = data.output_text || data.output?.[0]?.content?.[0]?.text || "How can I help?";
    const reply = enforceCompactReply(rawReply, safeMessage);
    return new Response(JSON.stringify({ reply, model, mode: "premium", context_source: "coach_context_snapshots", context_detail: contextDetail, coach_check_suggestions: coachCheckSuggestions }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const publicError = error instanceof PublicFunctionError
      ? error
      : new PublicFunctionError("ai_coach_failed", "AI request could not be completed right now.", 500, error instanceof Error ? error.message : String(error));
    console.error("ai-coach request failed", {
      request_id: requestId,
      mode: modeForLogs,
      code: publicError.code,
      status: publicError.status,
      message: publicError.message,
    });
    return new Response(JSON.stringify({ error: publicError.publicMessage, code: publicError.code, request_id: requestId }), {
      status: publicError.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
