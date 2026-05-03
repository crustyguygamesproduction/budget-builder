import { createClient } from "@supabase/supabase-js";
import {
  AiUsageError,
  byteLength,
  enforceAiUsage,
  readJsonBody,
} from "../_shared/aiUsage.ts";

function isProductionRuntime() {
  const env = String(Deno.env.get("ENVIRONMENT") || Deno.env.get("DENO_ENV") || Deno.env.get("APP_ENV") || "").toLowerCase();
  return ["production", "prod"].includes(env);
}

function isLocalOrigin(origin: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(origin);
}

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((item) => item.trim()).filter(Boolean);

  if (allowedOrigins.length === 0 && isProductionRuntime()) {
    console.error("money-organiser: ALLOWED_ORIGINS must be set in production");
    return {
      "Access-Control-Allow-Origin": "null",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "X-CORS-Config-Error": "missing_allowed_origins",
    };
  }

  const allowOrigin = allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins.length > 0
      ? allowedOrigins[0]
      : isLocalOrigin(origin)
        ? origin
        : "null";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function hasCorsConfigError(headers: Record<string, string>) {
  return headers["X-CORS-Config-Error"] === "missing_allowed_origins";
}

function parseJsonReply(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("AI did not return valid JSON.");
  }
}

function normaliseTransaction(row: any) {
  return {
    id: row.id,
    date: row.transaction_date,
    description: row.description,
    merchant: row.merchant || row.description,
    amount: Number(row.amount || 0),
    direction: row.direction,
    category: row.category,
    is_bill: Boolean(row.is_bill),
    is_subscription: Boolean(row.is_subscription),
    is_internal_transfer: Boolean(row.is_internal_transfer),
    is_income: Boolean(row.is_income),
  };
}

function normaliseCounterparty(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(card payment|card purchase|contactless|faster payment|standing order|direct debit|online banking|pos|pending)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length >= 3)
    .slice(0, 6)
    .join(" ")
    .trim() || "unknown";
}

function amountBucket(amount: number) {
  const abs = Math.abs(Number(amount || 0));
  if (abs < 10) return Math.round(abs * 2) / 2;
  if (abs < 100) return Math.round(abs);
  if (abs < 1000) return Math.round(abs / 5) * 5;
  return Math.round(abs / 25) * 25;
}

function dayOfMonth(date: string) {
  const day = Number(String(date || "").slice(8, 10));
  return Number.isFinite(day) ? day : null;
}

function monthKey(date: string) {
  const value = String(date || "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(value) ? value : "unknown";
}

function compactRow(row: any) {
  return {
    id: row.id,
    date: row.date,
    description: row.description,
    merchant: row.merchant,
    amount: row.amount,
    direction: row.direction,
    category: row.category,
    is_bill: row.is_bill,
    is_subscription: row.is_subscription,
    is_internal_transfer: row.is_internal_transfer,
    is_income: row.is_income,
  };
}

function buildTransactionIntelligence(rows: any[]) {
  const groups = new Map<string, any>();
  const categoryTotals = new Map<string, any>();
  const merchantTotals = new Map<string, any>();

  for (const row of rows) {
    const counterparty = normaliseCounterparty(row.merchant || row.description);
    const bucket = amountBucket(row.amount);
    const key = [counterparty, row.direction || "unknown", row.category || "uncategorised", bucket, row.is_bill, row.is_subscription, row.is_internal_transfer].join("|");
    const month = monthKey(row.date);
    const day = dayOfMonth(row.date);

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        counterparty,
        direction: row.direction,
        category: row.category,
        amount_bucket: bucket,
        flags: {
          is_bill: Boolean(row.is_bill),
          is_subscription: Boolean(row.is_subscription),
          is_internal_transfer: Boolean(row.is_internal_transfer),
          is_income: Boolean(row.is_income),
        },
        count: 0,
        total: 0,
        min_amount: Number(row.amount || 0),
        max_amount: Number(row.amount || 0),
        months: new Set<string>(),
        days: [],
        source_transaction_ids: [],
        examples: [],
      });
    }

    const group = groups.get(key);
    const amount = Number(row.amount || 0);
    group.count += 1;
    group.total += amount;
    group.min_amount = Math.min(group.min_amount, amount);
    group.max_amount = Math.max(group.max_amount, amount);
    group.months.add(month);
    if (day) group.days.push(day);
    if (group.source_transaction_ids.length < 24) group.source_transaction_ids.push(row.id);
    if (group.examples.length < 3) group.examples.push(compactRow(row));

    const categoryKey = row.category || "uncategorised";
    if (!categoryTotals.has(categoryKey)) categoryTotals.set(categoryKey, { category: categoryKey, count: 0, total: 0 });
    categoryTotals.get(categoryKey).count += 1;
    categoryTotals.get(categoryKey).total += amount;

    if (!merchantTotals.has(counterparty)) merchantTotals.set(counterparty, { counterparty, count: 0, total: 0, source_transaction_ids: [] });
    const merchant = merchantTotals.get(counterparty);
    merchant.count += 1;
    merchant.total += amount;
    if (merchant.source_transaction_ids.length < 12) merchant.source_transaction_ids.push(row.id);
  }

  const grouped = [...groups.values()].map((group) => ({
    ...group,
    month_count: group.months.size,
    months: [...group.months].filter((month) => month !== "unknown").slice(-8),
    usual_day: group.days.length ? Math.round(group.days.reduce((sum: number, day: number) => sum + day, 0) / group.days.length) : null,
    average_amount: Math.round((group.total / Math.max(group.count, 1)) * 100) / 100,
    total: Math.round(group.total * 100) / 100,
    months_seen: undefined,
  }));

  const recurringCandidates = grouped
    .filter((group) => group.count >= 2 && group.month_count >= 2 && !group.flags.is_internal_transfer)
    .sort((a, b) => b.month_count - a.month_count || b.count - a.count || Math.abs(b.total) - Math.abs(a.total))
    .slice(0, 80);

  const suspiciousGroups = grouped
    .filter((group) => {
      const abs = Math.abs(group.average_amount || 0);
      return !group.flags.is_internal_transfer && (abs >= 150 || group.count >= 4 || group.flags.is_bill || group.flags.is_subscription);
    })
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    .slice(0, 80);

  const largeOutgoings = rows
    .filter((row) => Number(row.amount) < 0 && !row.is_internal_transfer)
    .sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)))
    .slice(0, 80)
    .map(compactRow);

  const representativeRows = [
    ...rows.slice(-120),
    ...largeOutgoings.slice(0, 40),
  ];
  const seen = new Set<string>();

  return {
    total_rows: rows.length,
    date_range: {
      start: rows.map((row) => row.date).filter(Boolean).sort().at(0) || null,
      end: rows.map((row) => row.date).filter(Boolean).sort().at(-1) || null,
    },
    category_totals: [...categoryTotals.values()]
      .map((item) => ({ ...item, total: Math.round(item.total * 100) / 100 }))
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
      .slice(0, 40),
    merchant_totals: [...merchantTotals.values()]
      .map((item) => ({ ...item, total: Math.round(item.total * 100) / 100 }))
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
      .slice(0, 60),
    recurring_candidates: recurringCandidates,
    suspicious_or_high_impact_groups: suspiciousGroups,
    large_outgoing_samples: largeOutgoings,
    representative_raw_sample: representativeRows.filter((row) => {
      if (!row?.id || seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    }).slice(0, 160),
  };
}

async function callOpenAI(apiKey: string, input: unknown[]) {
  const maxOutputTokens = Number(Deno.env.get("MONEY_ORGANISER_MAX_OUTPUT_TOKENS") || 3000);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.1",
      max_output_tokens: Math.max(1200, Math.min(maxOutputTokens, 5000)),
      input,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data.output_text || data.output?.[0]?.content?.[0]?.text || "{}";
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (hasCorsConfigError(corsHeaders)) {
    return new Response(JSON.stringify({ error: "ALLOWED_ORIGINS must be set in production." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { body: requestBody, bytes: requestBytes } = await readJsonBody(req, 10_000);
    const { force = false } = requestBody;
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!apiKey || !supabaseUrl || !serviceKey) throw new Error("Money organiser is not configured.");

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, serviceKey, { global: { headers: { Authorization: authHeader } } });
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user?.id) throw new Error("Not signed in.");
    const userId = userData.user.id;

    const { data: transactions, error: txError } = await adminClient
      .from("transactions")
      .select("id, transaction_date, description, merchant, amount, direction, category, is_bill, is_subscription, is_internal_transfer, is_income")
      .eq("user_id", userId)
      .order("transaction_date", { ascending: true });
    if (txError) throw txError;

    const rows = (transactions || []).map(normaliseTransaction);
    const maxRows = Number(Deno.env.get("MONEY_ORGANISER_MAX_ROWS") || 5000);
    if (rows.length > maxRows) {
      throw new AiUsageError(
        "too_many_transactions",
        `That is a lot of history to organise at once. Money Hub can organise up to ${maxRows} rows per AI pass right now.`,
        413,
        `money-organiser row cap exceeded: ${rows.length}/${maxRows}`
      );
    }
    const sourceHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(rows.map((row) => [row.id, row.date, row.description, row.amount, row.category, row.is_bill, row.is_subscription, row.is_internal_transfer]))));
    const source_hash = Array.from(new Uint8Array(sourceHash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");

    if (!force) {
      const { data: existing } = await adminClient
        .from("money_understanding_snapshots")
        .select("id, interpreted_at, summary, bill_streams, recurring_events, checks")
        .eq("user_id", userId)
        .eq("source_hash", source_hash)
        .eq("model_version", "money-organiser-ai-v1")
        .maybeSingle();
      if (existing) return new Response(JSON.stringify({ snapshot: existing, reused: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const transactionIntelligence = buildTransactionIntelligence(rows);

    await enforceAiUsage(req, {
      functionName: "money-organiser",
      action: force ? "organise_force_clustered" : "organise_clustered",
      inputBytes: requestBytes + byteLength(transactionIntelligence),
      limits: [
        { windowSeconds: 3600, maxRequests: 5 },
        { windowSeconds: 86400, maxRequests: 20 },
      ],
    });

    const systemPrompt = `
You are the Money Hub statement organiser.
You convert pre-clustered bank transaction intelligence into a saved app data layer.
Return JSON only. No markdown. No prose outside JSON.

You are NOT receiving every raw transaction. You are receiving deterministic groups, top totals, large samples, representative rows, and source transaction IDs.
Use source_transaction_ids from the supplied groups/samples. Do not invent source IDs.

The app is for everyday people who are bad with money. Be conservative and useful.
Future bills must only include fixed commitments: rent, mortgage, council tax, energy, water, broadband, phone, insurance, debt/credit/finance, childcare, subscriptions.
Never put takeaway, restaurants, groceries, shopping, gaming, cash withdrawals, investments, internal transfers, work pass-through or random spending into future bills.

Use real-world judgement:
- Same provider can have multiple bill streams, split by usual amount and timing. Example: EE phone and EE broadband are separate if amounts/dates differ.
- If provider type is unclear, name safely: "EE bill around £16" rather than guessing phone/broadband.
- Rent may be split into early/partial payments. Use the usual monthly rent total from prior months, not one partial payment.
- If latest amount is an outlier due to discount/credit, use the usual amount and note the outlier.
- Energy bills like E.ON can vary. Still include as a best-guess bill if clearly energy.
- If unsure, create a check instead of silently guessing.
- Historical cashflow is not current balance.

Return exactly this shape:
{
  "summary": {
    "plainEnglish": string,
    "billsFound": number,
    "upcomingBillsTotal": number,
    "includesRent": boolean,
    "warnings": string[]
  },
  "bill_streams": [
    {
      "key": string,
      "name": string,
      "counterparty": string | null,
      "usual_amount": number,
      "usual_day": number | null,
      "kind": "rent" | "mortgage" | "council_tax" | "energy" | "water" | "broadband" | "phone" | "insurance" | "debt" | "childcare" | "subscription" | "other_bill",
      "confidence": "high" | "medium" | "needs_check",
      "evidence": string,
      "source_transaction_ids": string[]
    }
  ],
  "recurring_events": [
    {
      "key": string,
      "title": string,
      "amount": number,
      "day": number,
      "kind": "bill" | "subscription",
      "kindLabel": "Bill" | "Subscription",
      "confidenceLabel": "high" | "medium" | "estimated",
      "estimateNote": string,
      "sourceCount": number,
      "sourceMonths": number
    }
  ],
  "checks": [
    {
      "key": string,
      "question": string,
      "helper": string,
      "amount": number | null,
      "examples": string[],
      "source_transaction_ids": string[]
    }
  ],
  "transactions": [
    {
      "id": string,
      "real_merchant_name": string,
      "category": string,
      "is_bill": boolean,
      "is_subscription": boolean,
      "is_internal_transfer": boolean,
      "confidence": "high" | "medium" | "low"
    }
  ],
  "ai_context": {
    "bills_found": any[],
    "checks_waiting": any[],
    "notes": string[]
  }
}
`;

    const userPrompt = `
Organise this deterministic transaction intelligence into the app layer.
Prefer recurring_candidates for future bills, but check suspicious_or_high_impact_groups and large_outgoing_samples for context.
Only use representative_raw_sample for examples and transaction-level corrections.
Transaction intelligence:
${JSON.stringify(transactionIntelligence, null, 2)}
`;

    const raw = await callOpenAI(apiKey, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);
    const organised = parseJsonReply(raw);

    const summary = organised.summary || {};
    const bill_streams = Array.isArray(organised.bill_streams) ? organised.bill_streams : [];
    const recurring_events = Array.isArray(organised.recurring_events) ? organised.recurring_events : [];
    const checks = Array.isArray(organised.checks) ? organised.checks : [];
    const interpretedTransactions = Array.isArray(organised.transactions) ? organised.transactions : [];
    const ai_context = {
      ...(organised.ai_context || {}),
      transaction_intelligence_summary: {
        total_rows: transactionIntelligence.total_rows,
        recurring_candidate_count: transactionIntelligence.recurring_candidates.length,
        suspicious_group_count: transactionIntelligence.suspicious_or_high_impact_groups.length,
      },
    };
    const latestDate = rows.map((row) => row.date).filter(Boolean).sort().at(-1) || null;

    const { data: snapshot, error: upsertError } = await adminClient
      .from("money_understanding_snapshots")
      .upsert({
        user_id: userId,
        source_hash,
        model_version: "money-organiser-ai-v1",
        interpreted_at: new Date().toISOString(),
        transaction_count: rows.length,
        latest_transaction_date: latestDate,
        summary,
        transactions: interpretedTransactions,
        bill_streams,
        recurring_events,
        checks,
        ai_context,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,source_hash,model_version" })
      .select()
      .single();
    if (upsertError) throw upsertError;

    return new Response(JSON.stringify({ snapshot, reused: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const status = error instanceof AiUsageError ? error.status : 500;
    const publicMessage = error instanceof AiUsageError
      ? error.publicMessage
      : "Money organiser could not finish that read right now.";
    console.error("money-organiser request failed", {
      code: error instanceof AiUsageError ? error.code : "money_organiser_failed",
      message: error instanceof Error ? error.message : String(error),
    });
    return new Response(JSON.stringify({ error: publicMessage, code: error instanceof AiUsageError ? error.code : "money_organiser_failed" }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
